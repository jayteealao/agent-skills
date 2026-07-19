#!/usr/bin/env node
/**
 * scripts/hub-ensure.mjs — detached helper for the 'hub' render dispatch path
 * (RENDER-DISPATCH-PLAN). Spawned fire-and-forget by the write hook and
 * SessionStart, OFF the hook's critical path, so the slow steps never add
 * latency to the agent's turn. It:
 *
 *   1. ensures the machine-wide hub is running (adopt a healthy one, or start it);
 *   2. registers this repo in the registry so the hub will iterate it and drain
 *      its render queue (hub up → POST to live entries; hub down → registry.d/
 *      shard the hub folds in at startup);
 *   3. records hub liveness in the queue's .status.json (so SessionStart can warn
 *      "N renders pending, hub unreachable").
 *
 * Always exits 0 — a stale view must never block a slash command. Honours
 * --no-ensure to register + status WITHOUT starting a hub (the
 * ensureHubOnWrite:false story is handled upstream by simply not spawning this).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ensureHubLifecycle } from '../lib/hub-lifecycle.mjs';
import { upsertRegistryEntry } from '../lib/registry.mjs';
import { writeStatus, countPending, appendError } from '../lib/render-queue.mjs';

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) { return process.argv.includes(name); }

// --confirm: SessionStart runs this SYNCHRONOUSLY and gates its once-only
// activation record on a CONFIRMED hub, so the exit code must report readiness
// (0 = adopted/started healthy, 1 = not confirmed). Fire-and-forget callers (the
// write hook, Claude SessionStart) omit it and still always see exit 0 — a stale
// view must never block a turn.
const CONFIRM = hasFlag('--confirm');

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = argValue('--plugin-root', resolve(here, '..'));
  const projectRoot = argValue('--project-root', process.cwd());
  const viewDir = argValue('--view', resolve(projectRoot, '.ai', '_view'));
  const skipEnsure = hasFlag('--no-ensure');

  let hubUp = false;
  let confirmed = false;   // strictly adopted or started-healthy (excludes started-unconfirmed)
  if (!skipEnsure) {
    try {
      const r = await ensureHubLifecycle({ pluginRoot, log: () => {} });
      hubUp = r.action === 'already-running' || r.action === 'started' || r.action === 'started-unconfirmed';
      confirmed = r.action === 'already-running' || r.action === 'started';
    } catch (err) {
      try { appendError(viewDir, `ensure-hub failed: ${err?.message ?? err}`); } catch { /* best-effort */ }
    }
  }

  // Register the repo so the hub drains its queue. Best-effort + idempotent; it
  // POSTs to a live hub (→ live entries, drained on the next reconcile tick) or
  // drops a registry.d/ shard the hub folds in at its startup catch-up.
  // A skipped-not-git result is surfaced through .status.json's lastError (it
  // outranks 'hub unreachable' — it's the more actionable failure): the hub can
  // be perfectly healthy and still never drain an unregisterable repo.
  let registerError = null;
  try {
    const r = await upsertRegistryEntry({ projectRoot, viewDir });
    if (r?.action === 'skipped-not-git') registerError = 'not a git repo — run git init to register with the hub';
  } catch { /* never throws to the caller anyway */ }

  try {
    writeStatus(viewDir, {
      pendingCount: countPending(viewDir),
      lastError: registerError ?? (hubUp || skipEnsure ? null : 'hub unreachable'),
      hubLastSeenAt: hubUp ? new Date().toISOString() : null,
    });
  } catch { /* best-effort */ }

  return confirmed;
}

// Default callers ignore the code (always 0). With --confirm a confirmed hub
// exits 0 and anything else (incl. started-unconfirmed) exits 1, so SessionStart
// can gate its activation record on a genuinely healthy hub.
main()
  .then((confirmed) => process.exit(CONFIRM && !confirmed ? 1 : 0))
  .catch(() => process.exit(CONFIRM ? 1 : 0));
