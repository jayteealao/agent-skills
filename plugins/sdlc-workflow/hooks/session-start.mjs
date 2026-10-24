#!/usr/bin/env node
// hooks/session-start.mjs — Codex SessionStart adapter.
//
// On a trusted SessionStart (startup|resume|clear) it:
//   1. seeds the /wf rules kernel (hooks/seed-memory.mjs) THROUGH runPolicy, so
//      the spawn carries SDLC_HOST=codex — the only way the shared entrypoint can
//      tell it is not on Claude Code (SINGLE-SOURCE-PLAN W4). It is never invoked
//      directly from codex.hooks.json for that reason;
//   2. runs the one-time removal of the old hub and tray from this machine
//      (hooks/machine-cleanup.mjs). After the first clean run it only checks a
//      marker file;
//   3. names each workflow run that stopped or died (hooks/run-notice.mjs), as
//      context for the model.
//
// A `compact` source returns at once: a context compaction is not a session
// start. Always exits 0 — a session start must never block a session.

import {
  emitAdditionalContext,
  findProjectRoot,
  parseHookArgs,
  readEvent,
  resolveLayout,
  runPolicy,
} from './_adapter.mjs';

function main() {
  // A dispatched read-only sub-agent (consult skill) boots a session in this repo
  // and must not seed or clean up. Same isolation sentinel seed-memory honors.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent() ?? {};
  if (event.source === 'compact') return;
  const projectRoot = findProjectRoot(event.cwd);

  if (process.env.SDLC_DISABLE_MEMORY_SEED !== '1') {
    runPolicy(layout.runtimeRoot, 'seed-memory', { cwd: projectRoot, hook_event_name: 'SessionStart' }, {
      cwd: projectRoot,
      timeoutMs: 8000,
    });
  }

  runPolicy(layout.runtimeRoot, 'machine-cleanup', { cwd: projectRoot, hook_event_name: 'SessionStart' }, {
    cwd: projectRoot,
    timeoutMs: 20000,
  });

  // 3. Names each workflow run that stopped or died, with its resume command. On Codex the
  //    notice goes to the model, which tells the person.
  const notice = runPolicy(layout.runtimeRoot, 'run-notice', { cwd: projectRoot, hook_event_name: 'SessionStart' }, {
    cwd: projectRoot,
    timeoutMs: 8000,
  });
  try {
    const text = JSON.parse(notice.stdout.trim() || '{}').systemMessage;
    if (text) emitAdditionalContext('SessionStart', text);
  } catch { /* a notice never blocks a session */ }
}

try { main(); } finally { process.exit(0); }
