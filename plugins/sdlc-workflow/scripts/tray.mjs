#!/usr/bin/env node
/**
 * scripts/tray.mjs — the user-launched system-tray control app (docs/internal/archived/TRAY-APP-PLAN.md).
 *
 * A sunflower icon in the notification area that drives the existing hub over the
 * endpoints/lifecycle functions that already exist: health summary, open dashboard,
 * refresh registry, restart/stop hub, open config/logs, per-repo-serve toggle, and
 * (P5) a "Start at login" autostart toggle. No backend changes — it only displays
 * and calls.
 *
 * Run:  node dist/tray.mjs   (or `npm run tray`)
 *
 * Self-contained: speaks the systray2 wire protocol via lib/tray-protocol.mjs (no
 * systray2 JS dep), copies the vendored Go helper to a writable dir before running,
 * and reads committed icons from assets/. Launched by the USER outside Claude, so
 * all paths resolve from this file's own location, never ${CLAUDE_PLUGIN_*}.
 */

import { existsSync, readFileSync, mkdirSync, copyFileSync, statSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Tray, SEPARATOR } from '../lib/tray-protocol.mjs';
import { formatHealth } from '../lib/tray-format.mjs';
import {
  getHealth, openDashboard, openRepo, refreshRegistry, restartHub, stopHubAction,
  ensureHubOnLaunch, openConfig, openLogs, togglePerRepoServe, perRepoServeEnabled,
} from '../lib/tray-actions.mjs';
import {
  isAutostartEnabled, enableAutostart, disableAutostart, refreshAutostart,
} from '../lib/tray-autostart.mjs';
import { sdlcHomeDir } from '../lib/registry.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const TRAY_BUNDLE = fileURLToPath(import.meta.url);   // this running file — what autostart re-invokes

const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version ?? ''; }
  catch { return ''; }
})();

const TRAY_BIN_NAMES = {
  win32: 'tray_windows_release.exe',
  darwin: 'tray_darwin_release',
  linux: 'tray_linux_release',
};

const POLL_MS = 5000;
const log = (...a) => console.log('[tray]', ...a);

/* ───────────────────────── assets + binary ───────────────────────── */

function iconBase64(state) {
  const ext = process.platform === 'win32' ? 'ico' : 'png';
  const suffix = state === 'down' ? '-down' : state === 'stale' ? '-stale' : '';
  try { return readFileSync(resolve(PLUGIN_ROOT, 'assets', `app-icon${suffix}.${ext}`)).toString('base64'); }
  catch { return ''; }
}

// Never exec the vendored binary in place (the plugin dir may be read-only):
// copy it to ~/.sdlc/bin/, chmod +x on unix, run that copy.
function ensureRuntimeBinary() {
  const name = TRAY_BIN_NAMES[process.platform];
  if (!name) throw new Error(`tray: unsupported platform ${process.platform}`);
  const vendored = resolve(PLUGIN_ROOT, 'bin', 'tray', name);
  if (!existsSync(vendored)) throw new Error(`tray: vendored helper missing at ${vendored}`);
  const dir = join(sdlcHomeDir(), 'bin');
  mkdirSync(dir, { recursive: true });
  const runtime = join(dir, name);
  let stale = true;
  try { stale = !existsSync(runtime) || statSync(runtime).size !== statSync(vendored).size; } catch { /* copy */ }
  if (stale) {
    try {
      copyFileSync(vendored, runtime);
    } catch (err) {
      // A running/locked copy (another tray instance, or mid-upgrade) can't be
      // overwritten — fall back to the existing binary; only fail if none exists.
      if (!existsSync(runtime)) throw new Error(`tray: failed to copy helper to ${runtime}: ${err.message}`);
    }
  }
  if (process.platform !== 'win32') { try { chmodSync(runtime, 0o755); } catch { /* best-effort */ } }
  return runtime;
}

/* ───────────────────────── menu ───────────────────────── */

let tray = null;
let lastSig = '';
let refreshTimer = null;

function signatureOf(h) {
  return JSON.stringify({
    s: h.summary, d: h.detailRows, r: h.repoItems, i: h.iconState,
    p: perRepoServeEnabled(), a: isAutostartEnabled(),
  });
}

function buildMenu(h) {
  const items = [];
  items.push({ title: h.summary, enabled: false });                 // status row
  items.push(SEPARATOR);
  items.push({ title: 'Open dashboard', tooltip: 'Open the hub dashboard in your browser', onClick: () => { openDashboard().catch(() => {}); } });
  items.push({ title: 'Refresh registry', tooltip: 'Re-scan all repos now', onClick: () => { refreshRegistry().catch(() => {}); refreshSoon(); } });
  if (h.detailRows.length) {
    items.push({ title: 'Health', tooltip: 'Hub details', items: h.detailRows.map((r) => ({ title: `${r.label}: ${r.value}`, enabled: false })) });
  }
  if (h.repoItems.length) {
    items.push(SEPARATOR);
    for (const r of h.repoItems) {
      items.push({ title: r.label, tooltip: `Open /r/${r.id}/`, onClick: () => { openRepo(r.href).catch(() => {}); } });
    }
  }
  items.push(SEPARATOR);
  items.push({ title: 'Restart hub', onClick: () => { restartHub({ pluginRoot: PLUGIN_ROOT, log }).catch(() => {}).finally(() => refreshSoon(900)); } });
  items.push({ title: 'Stop hub', onClick: () => { stopHubAction({ log }).catch(() => {}).finally(() => refreshSoon()); } });
  items.push(SEPARATOR);
  items.push({ title: 'Open hub config…', onClick: () => openConfig() });
  items.push({ title: 'Open logs…', onClick: () => openLogs() });
  items.push({ title: 'Per-repo serve', tooltip: 'Toggle per-repo daemons (takes effect next session)', checked: perRepoServeEnabled(), onClick: onTogglePerRepoServe });
  items.push({ title: 'Start at login', tooltip: 'Launch the tray + hub at logon', checked: isAutostartEnabled(), onClick: onToggleAutostart });
  items.push(SEPARATOR);
  items.push({ title: 'Quit', tooltip: 'Exit the tray (the hub keeps running)', onClick: () => quit() });

  return { icon: iconBase64(h.iconState), title: '', tooltip: h.tooltip, isTemplateIcon: false, items };
}

/* ───────────────────────── click handlers ───────────────────────── */

function onTogglePerRepoServe() {
  try { togglePerRepoServe(); } catch (err) { log('toggle per-repo serve failed:', err.message); }
  refreshSoon(50);
}

function onToggleAutostart() {
  try {
    if (isAutostartEnabled()) {
      disableAutostart();
      log('autostart disabled');
    } else {
      enableAutostart({ trayBundle: TRAY_BUNDLE });
      log('autostart enabled');
    }
  } catch (err) {
    log('toggle autostart failed:', err.message);
  }
  refreshSoon(50);
}

function quit() {
  if (refreshTimer) clearInterval(refreshTimer);
  try { tray?.kill(); } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 400);
}

/* ───────────────────────── poll loop ───────────────────────── */

async function currentHealth() {
  const probe = await getHealth().catch(() => ({ reachable: false, payload: null }));
  return formatHealth({ reachable: probe.reachable, payload: probe.payload, pluginVersion: PLUGIN_VERSION }, Date.now());
}

async function refresh() {
  const h = await currentHealth();
  const sig = signatureOf(h);
  if (sig === lastSig && tray) return;   // nothing visible changed — skip the re-render
  lastSig = sig;
  if (tray) tray.update(buildMenu(h));
}

function refreshSoon(delay = 700) {
  setTimeout(() => { refresh().catch(() => {}); }, delay);
}

/* ───────────────────────── entrypoint ───────────────────────── */

async function selfcheck() {
  const name = TRAY_BIN_NAMES[process.platform] ?? TRAY_BIN_NAMES.linux;
  const vendored = resolve(PLUGIN_ROOT, 'bin', 'tray', name);
  const hasBin = existsSync(vendored);
  const icon = iconBase64('up');
  const sample = formatHealth({ reachable: false, payload: null, pluginVersion: PLUGIN_VERSION });
  log(`selfcheck: binary=${hasBin} icon=${icon.length > 0} summary="${sample.summary}"`);
  process.exit(hasBin && icon.length > 0 ? 0 : 1);
}

async function main() {
  if (process.argv.includes('--selfcheck')) { await selfcheck(); return; }

  const binPath = ensureRuntimeBinary();

  // Autostart housekeeping: heal a launcher left pointing at a relocated bundle,
  // and (the supervisor behavior) ensure the hub is up from logon. ensureHub is
  // idempotent, so this composes safely with the SessionStart bootstrap.
  if (isAutostartEnabled()) {
    try { refreshAutostart({ trayBundle: TRAY_BUNDLE }); } catch { /* best-effort */ }
    ensureHubOnLaunch({ pluginRoot: PLUGIN_ROOT, log }).catch(() => {});
  }

  const h = await currentHealth();
  lastSig = signatureOf(h);
  tray = new Tray({ binPath, menu: buildMenu(h) });
  tray.onError((err) => log('helper error:', err.message));
  tray.onExit(() => process.exit(0));
  await tray.start();
  log(`ready — ${h.summary}`);

  refreshTimer = setInterval(() => { refresh().catch(() => {}); }, POLL_MS);
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

main().catch((err) => {
  console.error('[tray] fatal:', err?.stack ?? err?.message ?? err);
  process.exit(1);
});
