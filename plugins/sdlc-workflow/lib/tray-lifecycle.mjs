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
import { readTrayHeartbeat, isTrayHeartbeatStale, TRAY_HEARTBEAT_STALE_MS } from './tray-heartbeat.mjs';

/* ───────────────────────── pure helpers ───────────────────────── */

/** Extract the tray bundle path (…/dist/tray.mjs|.cjs) from a process command line. */
export function bundlePathFromCommandLine(commandLine) {
  const s = String(commandLine ?? '');
  const quoted = s.match(/"([^"]*tray\.(?:mjs|cjs))"/i);
  if (quoted) return quoted[1];
  const bare = s.match(/(\S*tray\.(?:mjs|cjs))/i);
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
  "  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'tray\\.(mjs|cjs)' } |",
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

/* ───────────────────────── reconcile ───────────────────────── */

/**
 * Reconcile running trays against the current bundle. PURE control flow over
 * injectable seams. A tray is "reapable" when it runs a STALE bundle (version
 * drift) OR runs the CURRENT bundle but its liveness heartbeat has gone cold (a
 * wedged poll — lib/tray-heartbeat.mjs). The decision table:
 *
 *   non-win32                                → { action: 'unsupported' }   (no-op)
 *   no currentBundle given                   → { action: 'no-current-bundle' }
 *   no tray running                          → { action: 'none' }         (tolerated)
 *   only live current-bundle trays running   → { action: 'unchanged' }    (left alone — no thrash)
 *   reapable tray(s) + a live current also up→ { action: 'killed-stale' } (reap them, keep live, NO dup spawn)
 *   reapable tray(s), no live current         → { action: 'respawned' }   (reap + launch current once)
 *
 * "Live current" = current bundle AND not heartbeat-stale. Converges: a respawned
 * current tray stamps a fresh heartbeat and is `unchanged` on the next pass.
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
  now = Date.now(),
  stalenessMs = TRAY_HEARTBEAT_STALE_MS,
  env = process.env,
  log = () => {},
} = {}) {
  if (platform !== 'win32') return { action: 'unsupported', killed: [], running: 0 };
  if (!currentBundle) return { action: 'no-current-bundle', killed: [], running: 0 };

  const trays = (await list({ platform })) ?? [];
  if (!trays.length) return { action: 'none', killed: [], running: 0 };

  // One heartbeat read for the whole pass; the per-tray match is by pid.
  const heartbeat = readHeartbeat();
  const isCurrent = (t) => sameBundle(t.bundlePath, currentBundle, platform);
  const isWedged = (t) => isCurrent(t) && isTrayHeartbeatStale(t, heartbeat, { now, stalenessMs });
  const isReapable = (t) => !isCurrent(t) || isWedged(t);

  const stale = trays.filter(isReapable);
  if (!stale.length) return { action: 'unchanged', killed: [], running: trays.length };

  const killed = [];
  for (const t of stale) {
    try { kill(t.pid); killed.push(t.pid); }
    catch (err) { log(`[tray] could not stop ${isWedged(t) ? 'wedged' : 'stale'} pid ${t.pid}: ${err?.message ?? err}`); }
  }

  // A LIVE current-bundle tray is still running (current + fresh heartbeat, not
  // reaped) — reaping the stale/wedged peers is enough; spawning another would
  // leave two icons. Thrash guard.
  const liveCurrentUp = trays.some((t) => isCurrent(t) && !isWedged(t));
  if (liveCurrentUp) {
    log(`[tray] reaped ${killed.length} stale/wedged tray(s); a live current tray is already running`);
    return { action: 'killed-stale', killed, running: trays.length };
  }

  respawn({ platform, nodePath, trayBundle: currentBundle, env });
  log(`[tray] reaped ${killed.length} stale/wedged tray(s); respawned the current bundle`);
  return { action: 'respawned', killed, running: trays.length };
}
