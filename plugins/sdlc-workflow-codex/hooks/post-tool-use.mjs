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
//   3. VERIFY (schema/path/slug/sibling/fragment) via the bundled shared policy.
//      On failure: relay corrective feedback (exit 2) and SKIP auto-stage + the
//      render signal.
//   4. AUTO-STAGE (git add of implement-stage source files) — unchanged policy.
//   5. emit the filesystem-local DIRTY RENDER SIGNAL (enqueue + best-effort hub
//      ensure) via the bundled render dispatcher. No inline render.
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
  synthSingleStdin,
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

  // (3) VERIFY — block + corrective feedback on failure, skip the rest
  const verify = runBundled(layout.runtimeRoot, 'post-write-verify', synthMultiStdin(cwd, 'PostToolUse', touched), {
    cwd,
    timeoutMs: 12000,
  });
  if (verify.status === 2) {
    if (verify.stderr) process.stderr.write(verify.stderr);
    return 2;
  }

  // (4) AUTO-STAGE — per touched file (the bundled policy skips artifacts +
  // checks implement stage / branch strategy itself; always exits 0).
  for (const path of touched) {
    runBundled(layout.runtimeRoot, 'post-write-auto-stage', synthSingleStdin(cwd, 'PostToolUse', path), {
      cwd,
      timeoutMs: 5000,
    });
  }

  // (5) DIRTY RENDER SIGNAL — enqueue the affected buckets + best-effort hub
  // ensure (the bundled dispatcher does this and returns fast; it does NOT
  // render inline). The hub renders off the request path.
  runBundled(layout.runtimeRoot, 'post-write-render', synthMultiStdin(cwd, 'PostToolUse', touched), {
    cwd,
    timeoutMs: 6000,
  });

  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0;
}
process.exit(code);
