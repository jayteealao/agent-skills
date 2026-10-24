// lib/machine-cleanup.mjs — the one-time removal of the old view layer from this machine.
//
// Earlier releases ran a local hub server and a tray app, and kept their state in
// ~/.sdlc. This release has neither. On the first session start after the update,
// runMachineCleanup:
//   1. stops the hub and the tray that the pid file and the heartbeat in ~/.sdlc
//      name — only after their command line confirms them, so a reused pid is
//      never stopped;
//   2. deletes the tray's login launcher, when it is the tray's own file;
//   3. copies the external-dispatch consent (`externalDispatch`) from
//      hub-config.json to ~/.sdlc/config.json, so the consent survives;
//   4. removes the hub, registry, runtime and tray state from ~/.sdlc;
//   5. returns one warning when the Claude Code settings file still sets an old
//      mod setting. It only reads that file.
// It keeps errors.log, lifecycle.log and every other file. When nothing is left to
// remove it writes `.v10-cleanup.json`, and later calls return at once. A step that
// fails (a file still locked) is retried at the next session start.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { logLifecycle, machineConfigPath, sdlcHomeDir } from './home.mjs';

export const MARKER = '.v10-cleanup.json';

/** The ~/.sdlc entries of the old view layer. Nothing else in ~/.sdlc is touched. */
export const STATE_ENTRIES = Object.freeze([
  'hub.pid', 'hub-config.json', 'hub-history.jsonl', 'hub.log', 'hub.log.1', 'hub.log.2',
  'active-runtime.json', 'runtime', 'registry.json', 'registry.d', 'registry.prune.log',
  'registry.prune.log.1', 'registry.prune.log.2', 'hub.lock', 'hub-upgrade.lock', 'hub-upgrade.previous.json',
  'tray.heartbeat.json', '.tray-heal', 'bin', 'doctor.txt', 'mod-probe.jsonl',
]);

/** The settings of the mod before it was cut down to the goal arming. A value set for one is ignored. */
export const RETIRED_MOD_SETTINGS = Object.freeze([
  'mod', 'strip', 'suggestNext', 'stageCheck', 'questionProgress', 'driverStatus', 'spinnerVerb', 'cost',
  'hubNotice', 'stageCompact', 'probeJournal', 'readCheck', 'viewStyle', 'liveView', 'liveViewDetails',
]);

/** The one warning for old mod settings in the Claude Code settings file, or null. It only reads the file. */
export function retiredModSettingsNotice({ env = process.env, userHome = homedir() } = {}) {
  let settings;
  try {
    const dir = env.CLAUDE_CONFIG_DIR || join(userHome, '.claude');
    settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf-8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
  const set = new Set();
  for (const [id, entry] of Object.entries(settings?.pluginConfigs ?? {})) {
    if (!id.startsWith('sdlc-workflow@') || !entry?.options || typeof entry.options !== 'object') continue;
    for (const name of RETIRED_MOD_SETTINGS) if (Object.hasOwn(entry.options, name)) set.add(name);
  }
  if (set.size === 0) return null;
  return `sdlc-workflow: the mod now only arms /goal. These settings are ignored: ${[...set].join(', ')}.`;
}

// What each process must run for the cleanup to stop it.
const HUB_SCRIPT = /hub-serve\.mjs/i;
const TRAY_SCRIPT = /[\\/]tray\.mjs/i;

/** The tray's login launcher for the platform (the old app's own file name). */
export function trayLauncherPath({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === 'win32') {
    const appData = env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'SDLC Sunflower Tray.vbs');
  }
  if (platform === 'darwin') return join(home, 'Library', 'LaunchAgents', 'com.sdlc.sunflower-tray.plist');
  return join(env.XDG_CONFIG_HOME || join(home, '.config'), 'autostart', 'sdlc-sunflower-tray.desktop');
}

function readPid(path) {
  try {
    const n = Number(JSON.parse(readFileSync(path, 'utf-8'))?.pid);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Copy `externalDispatch` from the old hub-config.json to config.json. A value
 * already in config.json wins. Returns false when the copy failed, so the
 * caller keeps hub-config.json for the next try.
 */
export function carryConsent(home) {
  let old;
  try { old = JSON.parse(readFileSync(join(home, 'hub-config.json'), 'utf-8')); } catch { return true; }
  if (!old || typeof old.externalDispatch !== 'object' || old.externalDispatch === null) return true;
  const target = machineConfigPath(home);
  let cfg = {};
  try { cfg = JSON.parse(readFileSync(target, 'utf-8')) ?? {}; } catch { /* absent: start empty */ }
  if (cfg.externalDispatch !== undefined) return true;
  try {
    writeFileSync(target, `${JSON.stringify({ ...cfg, externalDispatch: old.externalDispatch }, null, 2)}\n`, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** The command line of a live process, or null when it is gone or unreadable. */
export function commandLineOf(pid, { platform = process.platform, exec = spawnSync } = {}) {
  const r = platform === 'win32'
    ? exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`], { encoding: 'utf-8', timeout: 15000, windowsHide: true })
    : exec('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf-8', timeout: 5000 });
  const text = String(r?.stdout ?? '').trim();
  return r?.status === 0 && text ? text : null;
}

/** Stop a process and its children. Returns true when the stop command succeeded. */
export function stopProcessTree(pid, { platform = process.platform, exec = spawnSync } = {}) {
  if (platform === 'win32') {
    return exec('taskkill', ['/F', '/T', '/PID', String(pid)], { encoding: 'utf-8', timeout: 15000, windowsHide: true })?.status === 0;
  }
  try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }
}

/**
 * Run the cleanup once. Every side effect is injectable for tests. Returns
 * `{ skipped }` when the marker exists, else `{ stopped, removed, left, done }`.
 */
export function runMachineCleanup({
  home = sdlcHomeDir(),
  platform = process.platform,
  env = process.env,
  userHome = homedir(),
  exec = spawnSync,
  now = () => new Date(),
} = {}) {
  const marker = join(home, MARKER);
  if (existsSync(marker)) return { skipped: true };

  const stopped = [];
  const left = [];
  for (const [name, file, script] of [['hub', 'hub.pid', HUB_SCRIPT], ['tray', 'tray.heartbeat.json', TRAY_SCRIPT]]) {
    const pid = readPid(join(home, file));
    if (!pid) continue;
    const cmd = commandLineOf(pid, { platform, exec });
    if (!cmd) continue; // gone already
    if (!script.test(cmd)) continue; // the pid now belongs to another program
    if (stopProcessTree(pid, { platform, exec })) stopped.push(`${name} ${pid}`);
    else left.push(`${name} process ${pid}`);
  }

  const removed = [];
  const launcher = trayLauncherPath({ platform, env, home: userHome });
  try {
    if (existsSync(launcher) && /tray/i.test(readFileSync(launcher, 'utf-8'))) {
      rmSync(launcher, { force: true });
      removed.push(launcher);
    }
  } catch {
    left.push(launcher);
  }
  const consentKept = carryConsent(home);
  if (!consentKept) left.push(join(home, 'hub-config.json'));
  for (const entry of STATE_ENTRIES) {
    const path = join(home, entry);
    if (!existsSync(path)) continue;
    if (entry === 'hub-config.json' && !consentKept) continue;
    try {
      rmSync(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
      left.push(path);
    }
  }

  const done = left.length === 0;
  if (done) {
    try { mkdirSync(home, { recursive: true }); writeFileSync(marker, `${JSON.stringify({ at: now().toISOString(), stopped, removed: removed.length }, null, 2)}\n`, 'utf-8'); } catch { /* retried next session */ }
  }
  if (stopped.length || removed.length || left.length) {
    logLifecycle({ event: 'v10-cleanup', host: env.SDLC_HOST || 'claude', reason: done ? 'done' : `left: ${left.join(', ')}`, stopped, removed: removed.length }, { home });
  }
  // The warning shows once: on the run that writes the marker.
  const notice = done ? retiredModSettingsNotice({ env, userHome }) : null;
  return { stopped, removed, left, done, notice };
}
