#!/usr/bin/env node
/**
 * Behavior:
 * - Scan workflow 00-index.md files under .ai/workflows/.
 * - Skip terminal statuses and malformed indexes.
 * - Emit no output when no active workflows exist.
 * - Emit JSON {systemMessage} when active workflows exist.
 * - Include branch mismatch information best-effort from git.
 * - Start detached bootstrap rendering after the fast orientation pass.
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';
import { spawnDetachedNode } from '../lib/detach.mjs';
import { resolveEntrypoint } from '../lib/entrypoint.mjs';
import { logError } from '../lib/error-log.mjs';
import { enqueue } from '../lib/render-queue.mjs';
import { ensureHubEnabled, spawnHubEnsure } from '../lib/ensure-hub.mjs';
import { projectRootFromInput } from '../lib/hook-utils.mjs';
import { readStdinJson } from '../lib/stdin.mjs';
import { isAutostartEnabled, refreshAutostart } from '../lib/tray-autostart.mjs';
import { sdlcHomeDir } from '../lib/registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === '1') return;
  // A dispatched read-only sub-agent (consult skill) boots a session IN this
  // repo; it must not re-trigger SDLC orientation/bootstrap. This early-exit IS
  // the primary hook-isolation mechanism — the consult runner sets this sentinel
  // on the child env (no --settings/--bare flag). See EXTERNAL-MODEL-DISPATCH-PLAN §3.1.
  if (process.env.SDLC_DISPATCH_ACTIVE === '1') return;

  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);
  healAutostartLauncher();
  healRunningTray();
}

// Re-point an ENABLED tray autostart launcher at THIS plugin's tray bundle (and a
// durable node path) from this headless session-start context. The tray's own
// refreshAutostart (scripts/tray.mjs) only runs once the tray is alive — but a
// launcher left pointing at a prior version's bundle after an upgrade can't start
// the tray, so it never self-heals (chicken-and-egg). Healing it here closes that
// loop: every session start re-stamps the launcher to the current version, so the
// next logon launches the right tray. No-op when autostart is disabled (never
// creates a launcher uninvited) or already current. Fail-open — orientation must
// never break on this.
function healAutostartLauncher() {
  try {
    if (!isAutostartEnabled()) return;
    refreshAutostart({ trayBundle: resolveEntrypoint(PLUGIN_ROOT, 'tray') });
  } catch {
    // best-effort; session orientation must remain fail-open.
  }
}

// Reconcile a tray that is ALREADY RUNNING on a prior version's bundle after an
// upgrade (lib/tray-lifecycle.mjs). healAutostartLauncher above only re-points
// the NEXT logon; a tray still running keeps executing the stale code. We spawn
// the reconcile DETACHED (it does a WMI process scan) so orientation never
// blocks, and debounce via a marker so we neither scan on every session nor let
// two near-simultaneous sessions both respawn (a brief duplicate-icon race).
// Gated on win32 (the tray is Windows-only in practice) + autostart-enabled (we
// never relaunch a tray the user didn't opt into). Fail-open.
function healRunningTray() {
  try {
    if (process.env.SDLC_DISABLE_TRAY_HEAL === '1') return;
    if (process.platform !== 'win32') return;
    if (!isAutostartEnabled()) return;
    if (!trayHealDue()) return;
    spawnDetachedNode(resolveEntrypoint(PLUGIN_ROOT, 'tray-heal'), [], { cwd: PLUGIN_ROOT, env: process.env });
  } catch {
    // best-effort; session orientation must remain fail-open.
  }
}

const TRAY_HEAL_DEBOUNCE_MS = 60_000;

// True at most once per debounce window, claiming the window by touching a
// marker so a concurrent session start in the same window skips the respawn.
// Returns false (skip) on any fs error — better to miss a heal than to risk a
// duplicate spawn we can't gate.
function trayHealDue(now = Date.now()) {
  try {
    const marker = join(sdlcHomeDir(), '.tray-heal');
    try {
      const age = now - statSync(marker).mtimeMs;
      if (age >= 0 && age < TRAY_HEAL_DEBOUNCE_MS) return false;
    } catch { /* no marker yet → due */ }
    writeFileSync(marker, `${now}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === '1') return;
  if (config.view?.bootstrap?.enabled === false) return;
  const dispatch = config.view?.renderDispatch ?? 'hub';

  // 'inline' (rollback): spawn the bootstrap render directly, as before.
  if (dispatch === 'inline') {
    try {
      spawnDetachedNode(
        resolveEntrypoint(PLUGIN_ROOT, 'render-sunflower'),
        ['--bootstrap', '--plugin-root', PLUGIN_ROOT],
        { cwd: projectRoot, env: process.env },
      );
    } catch {
      // Session orientation must remain fail-open.
    }
    return;
  }

  // 'hub' (default): enqueue a whole-repo bootstrap freshness pass + best-effort,
  // detached ensure-hub (which also registers the repo so the hub iterates it).
  // The hub renders it on its startup catch-up / next reconcile tick.
  try {
    const viewRoot = resolve(projectRoot, '.ai', '_view');
    mkdirSync(viewRoot, { recursive: true });
    enqueue(viewRoot, {
      repoRoot: projectRoot,
      kind: 'bootstrap',
      bucket: '__bootstrap__',
      enqueuedBy: { host: process.env.SDLC_HOST || 'claude', pid: process.pid },
    }, { maxPending: config.view?.renderQueue?.maxPending });

    if (ensureHubEnabled(config.view)) {
      spawnHubEnsure({ pluginRoot: PLUGIN_ROOT, projectRoot, viewDir: viewRoot });
    }
  } catch {
    // Session orientation must remain fail-open.
  }
}

main().catch(async (err) => {
  try {
    await logError('session-start-orient', err);
  } catch {
    // ignore logging failures
  }
  process.exit(0);
});
