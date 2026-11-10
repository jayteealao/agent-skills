#!/usr/bin/env node
// hooks/pre-tool-use.mjs — Codex PreToolUse adapter (best-effort).
//
// Codex apply_patch: Codex PreToolUse does not receive the same
// final-content shape as a Claude Write, so pre-tool validation is BEST-EFFORT —
// it validates only what is visible before the write lands. For an apply_patch
// `Add File` (or an Edit/Write that carries full content) the new managed-artifact
// body is present, so we run the folded PreToolUse policy (the validator, then
// the leak guard) on it and DENY
// (exit 2) on a hard violation. For an `Update File` patch the full final content
// isn't reconstructable here, so we defer to the post-tool audit and the Stop
// enforcement boundary. Always best-effort: never blocks a non-artifact write.
//
// A public doc (README*, CHANGELOG*, CONTRIBUTING*, docs/**) that carries its content goes to
// the policy too, for the leak guard of public docs. An event that carries a shell command
// (`tool_input.command`, a string or an argv array) goes to the policy once as that command, for
// the shell-write guard and the leak guard of publishing commands; the event cwd stays the cwd
// of the payload, so a relative target resolves against the folder the shell ran in.
// All the policy runs of one event share one deadline under the host's 5 s hook timeout.

import {
  emitPermissionDecision,
  parseHookArgs,
  readEvent,
  resolveLayout,
  runPolicy,
  synthSingleStdin,
  touchedFromEvent,
  findProjectRoot,
  isManagedArtifactPath,
  isLinkedLocalPath,
  isPublicDocCandidate,
  isRecordsHomePath,
} from './_adapter.mjs';

const DEADLINE_MS = 4000;

/** The shell command of an event: a string, or an argv array joined with spaces. */
function commandOfEvent(event) {
  const c = event?.tool_input?.command;
  if (typeof c === 'string') return c.trim() ? c : null;
  if (Array.isArray(c) && c.length && c.every((w) => typeof w === 'string')) return c.join(' ');
  return null;
}

const RECORD_YAML = /(?:^|\/)\.ai\/workflows\/(?:[^/]+\/(?:[^/]+\.yaml|steps\.jsonl)|answers\.jsonl)$/;

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event) return 0;
  const cwd = findProjectRoot(event.cwd);

  // Only files whose full new content is visible pre-write can be validated. A record file
  // (a .yaml beside the records of a workflow) goes to the check too: scripts write those.
  const touched = touchedFromEvent(event);
  const candidates = touched.filter(
    (t) => typeof t.content === 'string' && ((t.path.endsWith('.md') && isManagedArtifactPath(t.path)) || RECORD_YAML.test(t.path.replace(/\\/g, '/')) || isRecordsHomePath(t.path) || isPublicDocCandidate(cwd, t.path)),
  );
  // An Update or a Move of a patch has no full content, but its path is known: a local
  // workflow path of a linked project, a record file and a file of the records clone go to the
  // check with no content, so the refusal that names the wf-dir path or the record command
  // applies to a patch write too.
  for (const t of touched) {
    if (typeof t.content === 'string' || !t.path) continue;
    if (isLinkedLocalPath(cwd, t.path) || RECORD_YAML.test(t.path.replace(/\\/g, '/')) || isRecordsHomePath(t.path)) candidates.push({ path: t.path, content: '' });
  }
  const command = commandOfEvent(event);
  const payloads = candidates.map((t) => ({ label: t.path, stdin: synthSingleStdin(cwd, 'PreToolUse', t.path, t.content) }));
  if (command) payloads.push({ label: 'the shell command', stdin: { cwd: event.cwd || cwd, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } } });
  if (!payloads.length) return 0;

  const deadline = Date.now() + DEADLINE_MS;
  for (const p of payloads) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    const res = runPolicy(layout.runtimeRoot, 'pre-tool-use-all', p.stdin, { cwd, timeoutMs: left });
    if (res.status === 2) {
      // DENY the write: modern permissionDecision envelope on stdout, plus the
      // legacy exit-2 + stderr path as fallback for pre-GA CLIs.
      const reason = res.stderr || `pre-write validation failed for ${p.label}`;
      emitPermissionDecision('deny', reason);
      if (res.stderr) process.stderr.write(res.stderr);
      return 2;
    }
  }
  return 0;
}

let code = 0;
try { code = main(); } catch { code = 0; }
process.exit(code);
