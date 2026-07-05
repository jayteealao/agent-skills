#!/usr/bin/env node
// hooks/session-start.mjs — Codex SessionStart adapter.
//
// NATIVE-INTEROP "Native Codex Hooks → SessionStart" + "One Shared Hub". On a
// trusted SessionStart (startup|resume|clear|compact) it:
//   1. resolves the project root and the once-only activation record;
//   2. ensures the machine-wide shared hub adoption-first — detached, OFF the
//      hook's critical path — by spawning the bundled hub-ensure (which adopts a
//      healthy compatible hub under the cross-host lock, or starts one from the
//      machine runtime store, and registers this repo so the hub renders it);
//   3. records activation atomically the FIRST time a given plugin/runtime/hook
//      baseline is seen (so repeated SessionStarts don't repeat activation work).
//
// Rendering is owned by the hub (Resolution 7): registration + the hub's
// reconcile/heal loop render this repo's views; this hook never renders inline.
// Always exits 0 — orientation must never block a session.

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
  bundledEntry,
  computeBaseline,
  findProjectRoot,
  needsActivation,
  parseHookArgs,
  readActivation,
  readEvent,
  resolveLayout,
  writeActivationAtomic,
} from './_adapter.mjs';

function main() {
  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent() ?? {};
  const projectRoot = findProjectRoot(event.cwd);

  // (2) Ensure the shared hub adoption-first AND confirm it came up — bounded
  //     within the SessionStart budget. The hub is spawned detached and survives
  //     this hook; we only wait for hub-ensure's readiness verdict.
  const hubReady = ensureHubConfirmed(layout.runtimeRoot, projectRoot);

  // (3) Once-only activation: record the baseline the FIRST time it is seen AND
  //     the shared hub is confirmed healthy. The native-interop contract requires
  //     the record only after successful activation, so a new baseline whose hub
  //     never confirmed is left unrecorded — the next trusted SessionStart retries.
  if (hubReady) {
    try {
      const baseline = computeBaseline(layout);
      if (needsActivation(readActivation(layout.pluginData), baseline)) {
        writeActivationAtomic(layout.pluginData, baseline);
      }
    } catch { /* activation record is host-local provenance; never block on it */ }
  }
}

// How long SessionStart will wait for the hub to confirm healthy. Bounded well
// under the 30s SessionStart budget (hooks.json) — the common adopt case resolves
// in well under a second; this ceiling only bites a contended cold start (covers
// the cross-host startup lock's own 15s wait + the health confirm).
const HUB_CONFIRM_TIMEOUT_MS = 20000;

/**
 * Ensure the shared hub adoption-first and confirm it came up, BOUNDED so it can
 * never exceed the SessionStart budget. hub-ensure spawns the hub itself detached
 * (it survives this hook); here we run hub-ensure SYNCHRONOUSLY with --confirm so
 * its exit code reports readiness: 0 = adopted/started healthy, non-zero = not
 * confirmed. Returns whether the hub is confirmed ready.
 *
 * Seams:
 *   SDLC_DISABLE_HUB_ENSURE=1 → do not start/adopt a hub at all → not confirmed
 *                               (escape hatch + hermetic test).
 *   SDLC_ASSUME_HUB_READY=1   → treat the hub as confirmed without spawning, for
 *                               a self-managed hub or to exercise activation in tests.
 */
function ensureHubConfirmed(runtimeRoot, projectRoot) {
  if (process.env.SDLC_ASSUME_HUB_READY === '1') return true;
  if (process.env.SDLC_DISABLE_HUB_ENSURE === '1') return false;
  try {
    execFileSync(
      process.execPath,
      [
        bundledEntry(runtimeRoot, 'hub-ensure'),
        '--confirm',
        '--plugin-root', runtimeRoot,
        '--project-root', projectRoot,
        '--view', join(projectRoot, '.ai', '_view'),
      ],
      { stdio: 'ignore', windowsHide: true, timeout: HUB_CONFIRM_TIMEOUT_MS },
    );
    return true;   // exit 0 → hub confirmed healthy
  } catch {
    // non-zero exit (not confirmed), timeout, or spawn failure → treat as not
    // ready. The detached hub bring-up may still complete; the next trusted
    // SessionStart will confirm and record activation.
    return false;
  }
}

try { main(); } finally { process.exit(0); }
