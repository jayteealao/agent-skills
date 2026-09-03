#!/usr/bin/env node
// hooks/pre-tool-use.mjs — Codex PreToolUse adapter (best-effort).
//
// NATIVE-INTEROP "Codex apply_patch": Codex PreToolUse does not receive the same
// final-content shape as a Claude Write, so pre-tool validation is BEST-EFFORT —
// it validates only what is visible before the write lands. For an apply_patch
// `Add File` (or an Edit/Write that carries full content) the new managed-artifact
// body is present, so we run the bundled pre-write validator on it and DENY
// (exit 2) on a hard violation. For an `Update File` patch the full final content
// isn't reconstructable here, so we defer to the post-tool audit and the Stop
// enforcement boundary. Always best-effort: never blocks a non-artifact write.

import {
  emitPermissionDecision,
  parseHookArgs,
  readEvent,
  resolveLayout,
  runBundled,
  synthSingleStdin,
  touchedFromEvent,
  findProjectRoot,
  isManagedArtifactPath,
} from './_adapter.mjs';

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event) return 0;
  const cwd = findProjectRoot(event.cwd);

  // Only files whose full new content is visible pre-write can be validated.
  const candidates = touchedFromEvent(event).filter(
    (t) => typeof t.content === 'string' && t.path.endsWith('.md') && isManagedArtifactPath(t.path),
  );
  if (!candidates.length) return 0;

  for (const t of candidates) {
    const res = runBundled(layout.runtimeRoot, 'pre-write-validate', synthSingleStdin(cwd, 'PreToolUse', t.path, t.content), {
      cwd,
      timeoutMs: 4000,
    });
    if (res.status === 2) {
      // DENY the write: modern permissionDecision envelope on stdout, plus the
      // legacy exit-2 + stderr path as fallback for pre-GA CLIs.
      const reason = res.stderr || `pre-write validation failed for ${t.path}`;
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
