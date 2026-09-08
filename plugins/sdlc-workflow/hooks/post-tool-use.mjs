#!/usr/bin/env node
// hooks/post-tool-use.mjs — the single serialized Codex PostToolUse dispatcher.
//
// NATIVE-INTEROP "Serialized Post-Tool Dispatcher": Codex launches matching
// command hooks concurrently, so EXACTLY ONE PostToolUse command is registered
// and it sequences these stages itself (render is intentionally NOT a stage —
// the hub owns rendering, Resolution 7 / Decision 25):
//
//   1. determine final touched files from the event (+ on-disk reality)
//   2. record touched managed artifacts to the per-turn ledger (the Stop hook
//      re-checks these — the enforcement boundary)
//   3. run the folded PostToolUse bundle ONCE (WIDE-VIEW §14.2.6): auto-stage
//      (git add of implement-stage source files), then VERIFY (schema/path/
//      slug/sibling/fragment), then the filesystem-local DIRTY RENDER SIGNAL
//      (enqueue + best-effort hub ensure; no inline render). A verify failure
//      relays corrective feedback (exit 2); the render signal still fires, as
//      it does under Claude Code.
//
// Every stage runs the SAME bundled runtime policy Claude runs, so the final
// on-disk + verification outcome is identical across hosts. Exit 0 on success.

import {
  findProjectRoot,
  isManagedArtifactPath,
  parseHookArgs,
  readEvent,
  recordTouched,
  resolveLayout,
  runBundled,
  synthMultiStdin,
  touchedFromEvent,
} from './_adapter.mjs';

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event) return 0;
  const cwd = findProjectRoot(event.cwd);

  // (1) final touched files
  const touched = touchedFromEvent(event).map((t) => t.path);
  if (!touched.length) return 0;
  const managed = touched.filter(isManagedArtifactPath);

  // (2) record touched managed artifacts for the Stop-time re-check
  if (managed.length) {
    try { recordTouched(layout.pluginData, event.session_id, managed); } catch { /* best-effort */ }
  }

  // (3) ONE bundled process: auto-stage → verify → render enqueue. The bundle
  // stages every touched path (file_path + edits[].file_path), skips artifacts,
  // and checks implement stage / branch strategy itself. Exit 2 = verify blocked.
  const result = runBundled(layout.runtimeRoot, 'post-tool-use-all', synthMultiStdin(cwd, 'PostToolUse', touched), {
    cwd,
    timeoutMs: 12000,   // under the host's 15 s hook timeout (codex.hooks.json), so a slow bundle reports instead of being killed
  });
  if (result.status === 2) {
    if (result.stderr) process.stderr.write(result.stderr);
    return 2;
  }

  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0;
}
process.exit(code);
