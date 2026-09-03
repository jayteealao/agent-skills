#!/usr/bin/env node
// hooks/stop-verify.mjs — Codex Stop / SubagentStop enforcement boundary.
//
// NATIVE-INTEROP Resolution 5 + "Post-Tool Validation Limits and the Stop-Time
// Enforcement Boundary". PostToolUse cannot undo a completed apply_patch, so the
// boundary that makes Codex's FINAL on-disk state converge with Claude's
// pre-write block is the Stop hook: it re-checks every managed artifact the turn
// touched (recorded in the per-turn ledger by the PostToolUse dispatcher) and, on
// a violation, returns `decision: "block"` with a concrete repair `reason` that
// Codex turns into a continuation prompt — forcing the turn to fix the artifact
// before it can end.
//
// Bounded repair (Decision 27 / the recovery spike): a Stop block must not loop
// forever. After REPAIR_CEILING blocks for the same turn we surface a hard
// failure (additionalContext) and allow the stop, rather than re-prompting
// indefinitely. On a clean re-check the ledger is cleared and the turn ends.

import {
  REPAIR_CEILING,
  bumpRepairAttempt,
  clearLedger,
  emitAdditionalContext,
  emitStopBlock,
  findProjectRoot,
  parseHookArgs,
  readEvent,
  readLedger,
  resolveLayout,
  runBundled,
  synthMultiStdin,
} from './_adapter.mjs';

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent();
  if (!event) return;
  const sessionId = event.session_id;
  const ledger = readLedger(layout.pluginData, sessionId);
  const paths = (ledger.paths || []).filter(Boolean);
  if (!paths.length) return; // nothing managed was touched this turn

  const cwd = findProjectRoot(event.cwd);
  const verify = runBundled(layout.runtimeRoot, 'post-write-verify', synthMultiStdin(cwd, 'Stop', paths), {
    cwd,
    timeoutMs: 15000,
  });

  if (verify.status === 2) {
    const attempts = bumpRepairAttempt(layout.pluginData, sessionId);
    if (attempts > REPAIR_CEILING) {
      // Bounded: stop re-prompting. Surface a hard failure and let the turn end.
      clearLedger(layout.pluginData, sessionId);
      emitAdditionalContext(
        event.hook_event_name || 'Stop',
        `SDLC managed-artifact verification still failing after ${REPAIR_CEILING} repair attempts. ` +
          `The turn is ending with invalid artifacts; fix them manually:\n${verify.stderr || '(no detail)'}`,
      );
      return;
    }
    emitStopBlock(
      `SDLC managed artifacts written this turn are invalid and must be repaired before ending:\n\n` +
        `${verify.stderr || '(validation failed; re-run verification for detail)'}\n` +
        `Fix the issues above, then end the turn (repair attempt ${attempts}/${REPAIR_CEILING}).`,
    );
    return;
  }

  // Clean: clear the turn ledger so the next turn starts fresh.
  clearLedger(layout.pluginData, sessionId);
}

try { main(); } finally { process.exit(0); }
