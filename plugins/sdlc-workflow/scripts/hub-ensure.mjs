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

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = argValue('--plugin-root', resolve(here, '..'));
  const projectRoot = argValue('--project-root', process.cwd());
  const viewDir = argValue('--view', resolve(projectRoot, '.ai', '_view'));
  const skipEnsure = hasFlag('--no-ensure');

  let hubUp = false;
  if (!skipEnsure) {
    try {
      const r = await ensureHubLifecycle({ pluginRoot, log: () => {} });
      hubUp = r.action === 'already-running' || r.action === 'started' || r.action === 'started-unconfirmed';
    } catch (err) {
      try { appendError(viewDir, `ensure-hub failed: ${err?.message ?? err}`); } catch { /* best-effort */ }
    }
  }

  // Register the repo so the hub drains its queue. Best-effort + idempotent; it
  // POSTs to a live hub (→ live entries, drained on the next reconcile tick) or
  // drops a registry.d/ shard the hub folds in at its startup catch-up.
  try { await upsertRegistryEntry({ projectRoot, viewDir }); } catch { /* never throws to the caller anyway */ }

  try {
    writeStatus(viewDir, {
      pendingCount: countPending(viewDir),
      lastError: hubUp || skipEnsure ? null : 'hub unreachable',
      hubLastSeenAt: hubUp ? new Date().toISOString() : null,
    });
  } catch { /* best-effort */ }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));
