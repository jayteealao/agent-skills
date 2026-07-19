// lib/tray-lifecycle.mjs
//
// Reconcile a RUNNING tray process against the current plugin bundle — the
// live-process complement to lib/tray-autostart.mjs's launcher self-heal.
//
// The launcher self-heal (refreshAutostart, run from session-start-orient)
// re-stamps the Startup launcher to the current bundle + a durable node so the
// NEXT logon launches the right tray. But a tray that is ALREADY running from a
// prior version's bundle — the common case immediately after a plugin upgrade —
// keeps executing the stale code until the user next logs in or restarts it by
// hand. The hub solves the analogous problem by reaping + respawning a daemon
// whose runtimeVersion drifts (lib/hub-lifecycle.mjs / lib/serve-lifecycle.mjs);
// the tray had no equivalent. This closes that loop: detect a running tray whose
// launched bundle path differs from the current one, kill it, and respawn the
// current bundle via the SAME detached hidden-launch machinery the launcher uses.
//
// Version staleness keys on the BUNDLE PATH (…/<version>/dist/tray.mjs), not a
// reported runtimeVersion: the tray has no IPC surface to query, but the version
// dir is already encoded in the path the launcher embeds — so comparing paths
// mirrors exactly what lib/tray-autostart.mjs's launcherTargetsCurrent already does.
//
// Version is not the only way a tray goes bad. A tray on the CURRENT bundle can
// still wedge — its 5s poll stalls across a sleep/resume, or its stdio link to the
// helper dies silently — leaving a frozen, stale display that a pure bundle-path
// check reads as "current → unchanged" and never recovers. So reconcile ALSO
// reaps a current-bundle tray whose liveness heartbeat (lib/tray-heartbeat.mjs)
// has gone cold; a current tray with a fresh stamp is left alone.
//
// Windows-first: the tray is in practice Windows-only and process discovery is
// implemented via WMI/CIM. On other platforms listRunningTrays returns [] and
// reconcileRunningTray is a clean no-op. Every OS/exec/spawn seam is injectable
// so the pure decision logic is unit-testable without touching real processes.

import { spawnSync } from 'node:child_process';
import { isPidAlive } from './pid-file.mjs';
import { spawnDetached } from './detach.mjs';
import { resolveDurableNodePath } from './tray-autostart.mjs';
import { readTrayHeartbeat, isTrayHeartbeatStale, heartbeatShowsDown, TRAY_HEARTBEAT_STALE_MS } from './tray-heartbeat.mjs';

// A driver stamping 'down' is only a wedge once the hub has been up long enough
// that a healthy live poll (every 5s) would already have cleared it. Below this,
// a 'down' stamp is the legitimate hub-coming-up window, not a stuck driver — so
// the heal waits rather than reaping a tray that is about to self-correct.
export const MIN_HUB_UPTIME_MS = 30_000;

/**
 * PURE: is the hub up and settled enough to treat a lingering 'down' tray stamp
 * as a driver wedge? Requires a reachable hub whose uptime clears MIN_HUB_UPTIME_MS.
 */
export function isHubHealthyEnough(hubHealth, { minUptimeMs = MIN_HUB_UPTIME_MS } = {}) {
  if (!hubHealth || !hubHealth.reachable) return false;
  const up = Number(hubHealth.uptimeMs);
  return Number.isFinite(up) && up >= minUptimeMs;
}

/* ───────────────────────── pure helpers ───────────────────────── */

// The tray bundle always lives at <plugin-root>/dist/tray.mjs (bundle) or
// …/scripts/tray.mjs (source run) — every shipped version and the dev tree
// alike. Requiring that dist|scripts path segment keeps the probe from matching
// (and the heal from TERMINATING) unrelated node processes whose command line
// merely ends in tray.mjs — another project's tray script, mytray.mjs, etc.
const BUNDLE_TAIL = String.raw`[\\/](?:dist|scripts)[\\/]tray\.(?:mjs|cjs)`;
const QUOTED_BUNDLE_RE = new RegExp(`"([^"]*${BUNDLE_TAIL})"`, 'i');
const BARE_BUNDLE_RE = new RegExp(`(\\S*${BUNDLE_TAIL})`, 'i');

/** Extract the tray bundle path (…/dist|scripts/tray.mjs|.cjs) from a process command line. */
export function bundlePathFromCommandLine(commandLine) {
  const s = String(commandLine ?? '');
  const quoted = s.match(QUOTED_BUNDLE_RE);
  if (quoted) return quoted[1];
  const bare = s.match(BARE_BUNDLE_RE);
  return bare ? bare[1] : null;
}

/** Normalize a path for comparison: strip quotes, unify separators, lowercase on win32. */
export function normalizeBundlePath(p, platform = process.platform) {
  let s = String(p ?? '').trim().replace(/^["']|["']$/g, '');
  if (!s) return '';
  s = platform === 'win32' ? s.replace(/\//g, '\\') : s.replace(/\\/g, '/');
  return platform === 'win32' ? s.toLowerCase() : s;
}

/** Do two bundle paths refer to the same file (after normalization)? */
export function sameBundle(a, b, platform = process.platform) {
  const na = normalizeBundlePath(a, platform);
  return Boolean(na) && na === normalizeBundlePath(b, platform);
}

/**
 * Parse the JSON emitted by the Windows process probe into
 * `[{ pid, bundlePath, commandLine }]`. ConvertTo-Json yields a bare object for
 * one match and an array for many — both are normalized here. Rows without a
 * resolvable tray bundle path (or a valid pid) are dropped. Never throws.
 */
export function parseTrayProcessList(raw) {
  if (!raw || !String(raw).trim()) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const pid = Number(row.ProcessId ?? row.pid);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    const commandLine = String(row.CommandLine ?? row.commandLine ?? '');
    const bundlePath = bundlePathFromCommandLine(commandLine);
    if (!bundlePath) continue;
    out.push({ pid, bundlePath, commandLine });
  }
  return out;
}

/* ───────────────────────── process discovery (win32) ───────────────────────── */

// Emit one JSON document describing every node.exe process whose command line
// launches a tray bundle. Args go to spawnSync as an argv array (no shell), so
// the `$_` pipeline variables are parsed by PowerShell, never by a host shell.
const WIN_PROBE_PS = [
  "$ErrorActionPreference='SilentlyContinue';",
  '$p = Get-CimInstance Win32_Process |',
  "  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '[\\\\/](dist|scripts)[\\\\/]tray\\.(mjs|cjs)' } |",
  '  Select-Object ProcessId,CommandLine;',
  'if ($p) { $p | ConvertTo-Json -Compress }',
].join(' ');

function defaultProbe({ env = process.env } = {}) {
  try {
    const res = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', WIN_PROBE_PS],
      { encoding: 'utf-8', timeout: 4000, windowsHide: true, env },
    );
    return res?.stdout ?? '';
  } catch {
    return '';
  }
}

/** Discover running tray processes. Windows-first; returns [] on other platforms. */
export function listRunningTrays({ platform = process.platform, probe = defaultProbe } = {}) {
  if (platform !== 'win32') return [];
  return parseTrayProcessList(probe({ platform }));
}

/* ───────────────────────── kill + respawn seams ───────────────────────── */

function defaultKill(pid) {
  if (!isPidAlive(pid)) return;
  // process.kill maps any non-zero signal to TerminateProcess on Windows (same
  // mechanism hub-lifecycle's stopPid relies on). Best-effort: a race where the
  // pid already exited is fine.
  try { process.kill(pid, 'SIGTERM'); } catch { /* already gone / not permitted */ }
}

// Respawn the CURRENT tray exactly as the freshly-stamped launcher would: the
// durable node + the current bundle, launched detached with a hidden window.
// Reuses lib/detach.mjs (no bespoke spawn) and lib/tray-autostart.mjs's node
// resolver — so we relaunch the identical target the launcher self-heal just
// wrote, rather than duplicating spawn logic.
function defaultRespawn({ nodePath, trayBundle, env = process.env }) {
  spawnDetached(nodePath, [trayBundle], { env });
}

// Probe the hub the same way the tray driver does (lib/tray-actions.getHealth),
// reduced to the two facts the display-wedge decision needs: is it reachable, and
// how long has it been up. Imported lazily so the heal's heavy hub dependency
// graph loads ONLY when there is actually a 'down'-stamped current tray to judge;
// a healthy machine never pays for it. Never throws → { reachable:false }.
async function defaultProbeHub() {
  try {
    const { getHealth } = await import('./tray-actions.mjs');
    const probe = await getHealth();
    return { reachable: Boolean(probe?.reachable), uptimeMs: Number(probe?.payload?.uptimeMs) };
  } catch {
    return { reachable: false, uptimeMs: 0 };
  }
}

/* ───────────────────────── reconcile ───────────────────────── */

/**
 * Reconcile running trays against the current bundle. PURE control flow over
 * injectable seams. A current-bundle tray is "reapable" for three distinct wedge
 * modes; a stale-bundle tray always is:
 *
 *   • stale bundle    — the tray runs a prior version's …/<ver>/dist/tray.mjs.
 *   • cold poll       — current bundle, but its liveness heartbeat has gone cold:
 *                       the driver's whole poll loop stalled (sleep/resume, dead
 *                       stdio). lib/tray-heartbeat.isTrayHeartbeatStale.
 *   • wedged display  — current bundle, poll STILL alive, but its last stamp
 *                       computed 'down' while the hub is up and settled: a driver
 *                       whose own probe is stuck. heartbeatShowsDown + a hub probe
 *                       gated on MIN_HUB_UPTIME_MS (so the legitimate hub-coming-up
 *                       window is not mistaken for a wedge). The hub is probed at
 *                       most once per pass, and only when a 'down' candidate exists.
 *
 * The decision table:
 *
 *   non-win32                                → { action: 'unsupported' }   (no-op)
 *   no currentBundle given                   → { action: 'no-current-bundle' }
 *   no tray + no heartbeat                   → { action: 'none' }         (nothing ever ran, or a clean Quit)
 *   no tray + heartbeat, stamped pid dead    → { action: 'revived' }      (crash — relaunch current once)
 *   no tray + heartbeat, stamped pid alive   → { action: 'none' }         (pid reused — cannot prove a crash)
 *   only live current-bundle trays running   → { action: 'unchanged' }    (left alone — no thrash)
 *   reapable tray(s) + a live current also up→ { action: 'killed-stale' } (reap them, keep live, NO dup spawn)
 *   reapable tray(s), no live current         → { action: 'respawned' }   (reap + launch current once)
 *
 * "Live current" = current bundle AND none of the wedge modes. Converges: a
 * respawned current tray stamps a fresh 'up' heartbeat and is `unchanged` next pass.
 *
 * The revive row closes the crash gap: the driver exits when its native helper
 * dies, and a killed/crashed driver cannot clear its heartbeat — only the menu's
 * deliberate Quit does (scripts/tray.mjs clearTrayHeartbeat). So heartbeat-minus-
 * process = "a tray should be running here". The stamped-pid-alive guard keeps
 * Windows pid reuse from reading an unrelated process as a still-running tray…
 * and, conservatively, from reviving over one we cannot reason about.
 *
 * @returns {Promise<{action:string, killed:number[], running:number}>}
 */
export async function reconcileRunningTray({
  platform = process.platform,
  currentBundle,
  nodePath = resolveDurableNodePath({ platform }),
  list = listRunningTrays,
  kill = defaultKill,
  respawn = defaultRespawn,
  readHeartbeat = readTrayHeartbeat,
  pidAlive = isPidAlive,
  probeHub = defaultProbeHub,
  now = Date.now(),
  stalenessMs = TRAY_HEARTBEAT_STALE_MS,
  minHubUptimeMs = MIN_HUB_UPTIME_MS,
  env = process.env,
  log = () => {},
} = {}) {
  if (platform !== 'win32') return { action: 'unsupported', killed: [], running: 0 };
  if (!currentBundle) return { action: 'no-current-bundle', killed: [], running: 0 };

  const trays = (await list({ platform })) ?? [];
  if (!trays.length) {
    // Crash revive (decision table above): a heartbeat outliving its process
    // means the tray died without the menu's Quit. Revive only when the stamped
    // pid is provably dead — an alive pid may be reuse by an unrelated process.
    const hb = readHeartbeat();
    const hbPid = Number(hb?.pid);
    if (hb && Number.isInteger(hbPid) && hbPid > 0 && !pidAlive(hbPid)) {
      respawn({ platform, nodePath, trayBundle: currentBundle, env });
      log('[tray] heartbeat outlived its process (crashed tray) — revived the current bundle');
      return { action: 'revived', killed: [], running: 0 };
    }
    return { action: 'none', killed: [], running: 0 };
  }

  // One heartbeat read for the whole pass; the per-tray match is by pid.
  const heartbeat = readHeartbeat();
  const isCurrent = (t) => sameBundle(t.bundlePath, currentBundle, platform);
  const isColdWedged = (t) => isCurrent(t) && isTrayHeartbeatStale(t, heartbeat, { now, stalenessMs });

  // A display wedge needs to know the hub is up — but only probe if some current,
  // live tray is actually stamping 'down' (otherwise a healthy machine pays nothing).
  const showsDown = (t) => isCurrent(t) && heartbeatShowsDown(t, heartbeat, { now, stalenessMs });
  let hubHealthyEnough = false;
  if (trays.some(showsDown)) {
    hubHealthyEnough = isHubHealthyEnough(await probeHub(), { minUptimeMs: minHubUptimeMs });
  }
  const isDisplayWedged = (t) => showsDown(t) && hubHealthyEnough;

  const wedgeReason = (t) => (!isCurrent(t) ? 'stale' : isColdWedged(t) ? 'cold' : isDisplayWedged(t) ? 'display' : null);
  const isReapable = (t) => wedgeReason(t) !== null;

  const stale = trays.filter(isReapable);
  if (!stale.length) return { action: 'unchanged', killed: [], running: trays.length };

  const killed = [];
  for (const t of stale) {
    try { kill(t.pid); killed.push(t.pid); }
    catch (err) { log(`[tray] could not stop ${wedgeReason(t)} pid ${t.pid}: ${err?.message ?? err}`); }
  }

  // A LIVE current-bundle tray is still running (current + no wedge mode, not
  // reaped) — reaping the stale/wedged peers is enough; spawning another would
  // leave two icons. Thrash guard.
  const liveCurrentUp = trays.some((t) => isCurrent(t) && !isReapable(t));
  if (liveCurrentUp) {
    log(`[tray] reaped ${killed.length} stale/wedged tray(s); a live current tray is already running`);
    return { action: 'killed-stale', killed, running: trays.length };
  }

  respawn({ platform, nodePath, trayBundle: currentBundle, env });
  log(`[tray] reaped ${killed.length} stale/wedged tray(s); respawned the current bundle`);
  return { action: 'respawned', killed, running: trays.length };
}
