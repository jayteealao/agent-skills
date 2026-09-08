#!/usr/bin/env node
// hooks/session-start.mjs — Codex SessionStart adapter.
//
// NATIVE-INTEROP "Native Codex Hooks → SessionStart" + "One Shared Hub". On a
// trusted SessionStart (startup|resume|clear|compact) it:
//   1. resolves the project root and the once-only activation record;
//   2. ensures the machine-wide shared hub adoption-first — detached, OFF the
//      hook's critical path — by spawning the bundled hub-ensure (which queues
//      the whole-repo freshness pass, adopts a healthy compatible hub under the
//      cross-host lock or starts one from the machine runtime store, and
//      registers this repo so the hub renders it);
//   3. records activation atomically the FIRST time a given plugin/runtime/hook
//      baseline is seen (so repeated SessionStarts don't repeat activation work);
//   4. seeds the /wf rules kernel (dist/seed-memory.mjs) THROUGH runBundled, so
//      the spawn carries SDLC_HOST=codex — the only way the shared entrypoint can
//      tell it is not on Claude Code (SINGLE-SOURCE-PLAN W4). It is never invoked
//      directly from codex.hooks.json for that reason. The seed runs FIRST in
//      main(): it is fast, and the hub confirm's wait must not push it into the
//      host's hook timeout (v9.153.1).
//
// Rendering is owned by the hub (Resolution 7): registration + the hub's
// reconcile/heal loop render this repo's views; this hook never renders inline.
// The W11.3 policy applies on this host too: a `compact` source returns at
// once; a root with no `.ai/workflows`, or outside any git checkout, returns
// after the seed — no hub confirm, no bootstrap record, no `.ai/_view`, no
// activation record (review 2026-09-08).
// Always exits 0 — orientation must never block a session.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  bundledEntry,
  codexHostEnv,
  computeBaseline,
  findProjectRoot,
  insideGitCheckout,
  needsActivation,
  parseHookArgs,
  readActivation,
  readEvent,
  resolveLayout,
  runBundled,
  writeActivationAtomic,
} from './_adapter.mjs';

function main() {
  // A dispatched read-only sub-agent (consult skill) boots a session in this repo
  // and must not adopt a hub, record activation, or seed. Same isolation sentinel
  // session-start-orient and seed-memory honor.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const args = parseHookArgs();
  const layout = resolveLayout(args);
  const event = readEvent() ?? {};
  // W11.3: a context compaction is not a session start — no seed, no hub confirm.
  if (event.source === 'compact') return;
  const projectRoot = findProjectRoot(event.cwd);

  // (4, first) Seed the /wf rules kernel BEFORE the hub confirm. The seed is fast
  //     and independent; the hub confirm can wait up to HUB_CONFIRM_TIMEOUT_MS,
  //     and a seed started after that wait could be killed by the host's hook
  //     timeout mid-write of AGENTS.md. Same bundled bytes Claude Code runs; the
  //     host signal in the env suppresses the Claude-only systemMessage notice.
  if (process.env.SDLC_DISABLE_MEMORY_SEED !== '1') {
    runBundled(layout.runtimeRoot, 'seed-memory', { cwd: projectRoot, hook_event_name: 'SessionStart' }, {
      cwd: projectRoot,
      timeoutMs: 8000,
    });
  }

  // (1b) W11.3 on the Codex side: no workflow store, or outside a checkout →
  //      nothing else. Before this the adapter ran hub-ensure --bootstrap in
  //      every directory and hub-ensure created `.ai/_view` there.
  if (!existsSync(join(projectRoot, '.ai', 'workflows')) || !insideGitCheckout(projectRoot)) return;

  // (2) Ensure the shared hub adoption-first AND confirm it came up — bounded
  //     within the SessionStart budget. The hub is spawned detached and survives
  //     this hook; we only wait for hub-ensure's readiness verdict.
  const verdict = ensureHubConfirmed(layout.runtimeRoot, projectRoot);
  const hubReady = verdict === 'confirmed' || verdict === 'assumed';

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

// How long SessionStart waits for the hub to confirm healthy: 5 s (W11.10; was
// 20 s). The common adopt case resolves in well under a second. A contended cold
// start keeps starting detached after the wait expires, and the next SessionStart
// confirms it. SDLC_HUB_CONFIRM_TIMEOUT_MS overrides the ceiling (tests).
const HUB_CONFIRM_TIMEOUT_MS = 5000;
function hubConfirmTimeoutMs() {
  const n = Number(process.env.SDLC_HUB_CONFIRM_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : HUB_CONFIRM_TIMEOUT_MS;
}

/**
 * Ensure the shared hub adoption-first and confirm it came up, BOUNDED so it can
 * never exceed the SessionStart budget. hub-ensure spawns the hub itself detached
 * (it survives this hook); here we run hub-ensure SYNCHRONOUSLY with --confirm so
 * its exit code reports readiness: 0 = adopted/started healthy, non-zero = not
 * confirmed. Returns a verdict: 'confirmed' | 'assumed' | 'disabled' |
 * 'started-unconfirmed' (the wait expired; one line on stderr) | 'not-confirmed'.
 *
 * Seams:
 *   SDLC_DISABLE_HUB_ENSURE=1 → do not start/adopt a hub at all → not confirmed
 *                               (escape hatch + hermetic test).
 *   SDLC_ASSUME_HUB_READY=1   → treat the hub as confirmed without spawning, for
 *                               a self-managed hub or to exercise activation in tests.
 */
function ensureHubConfirmed(runtimeRoot, projectRoot) {
  if (process.env.SDLC_ASSUME_HUB_READY === '1') return 'assumed';
  if (process.env.SDLC_DISABLE_HUB_ENSURE === '1' || process.env.SDLC_DISABLE_ENSURE_HUB === '1') return 'disabled';
  const timeoutMs = hubConfirmTimeoutMs();
  try {
    execFileSync(
      process.execPath,
      [
        bundledEntry(runtimeRoot, 'hub-ensure'),
        '--confirm',
        '--session-start', // W11.9: log the deprecated-config warnings once per session
        '--bootstrap', // whole-repo freshness pass, as the Claude Code SessionStart hook enqueues inline
        '--plugin-root', runtimeRoot,
        '--project-root', projectRoot,
        '--view', join(projectRoot, '.ai', '_view'),
      ],
      // Codex provenance: hub-ensure (and any hub it starts) must record this
      // launch as codex-started, not the shared runtime's claude default.
      { stdio: 'ignore', windowsHide: true, timeout: timeoutMs, env: codexHostEnv() },
    );
    return 'confirmed';   // exit 0 → hub confirmed healthy
  } catch (err) {
    // The detached hub bring-up may still complete; the next trusted
    // SessionStart will confirm and record activation. An expired wait says so
    // in one line (W11.10); a non-zero exit or a spawn failure stays silent.
    const timedOut = err?.code === 'ETIMEDOUT' || (err?.signal != null && err?.status == null);
    if (timedOut) {
      try { process.stderr.write(`[sdlc] hub started-unconfirmed: no health confirm within ${timeoutMs} ms; the hub keeps starting detached and the next SessionStart confirms it.\n`); } catch { /* best-effort */ }
      return 'started-unconfirmed';
    }
    return 'not-confirmed';
  }
}

try { main(); } finally { process.exit(0); }
