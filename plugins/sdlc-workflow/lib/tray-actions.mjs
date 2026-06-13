// lib/tray-actions.mjs
//
// The tray's verbs (docs/internal/archived/TRAY-APP-PLAN.md → components). Each maps a menu click onto
// existing hub capability — health probe, registry refresh, lifecycle restart/stop,
// open-in-browser/editor, per-repo-serve toggle. The control surface needs NONE of
// the plugin's third-party deps (markdown-it/js-yaml/ajv), so a bundled tray runs
// dep-free.
//
// I/O is isolated behind injectable seams (`opener`, `exists`, `platform`) so the
// command-building and path-resolution logic is unit-testable without launching a
// browser or touching the real filesystem. The pure helpers `openerCommand` and
// `resolveLogTarget` are exported for direct assertion.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { ensureHubLifecycle, stopHub } from './hub-lifecycle.mjs';
import { readHubConfig, writeHubConfig, hubConfigPath } from './hub-config.mjs';
import { readPidFile } from './pid-file.mjs';
import { hubPidPath, sdlcHomeDir } from './registry.mjs';

/* ───────────────────────── endpoint resolution ───────────────────────── */

/**
 * Resolve the hub's address + write token from ~/.sdlc/hub.pid, falling back to
 * the configured port (or 4173) at 127.0.0.1 when no pid file is present. Always
 * probes a loopback host (a hub bound 0.0.0.0 still answers on 127.0.0.1).
 * @returns {Promise<{host:string,port:number,token:string,pid:number|null}>}
 */
export async function hubEndpoint() {
  const rec = await readPidFile(hubPidPath());
  if (rec && rec.port) {
    const host = rec.host && rec.host !== '0.0.0.0' ? rec.host : '127.0.0.1';
    return { host, port: Number(rec.port), token: rec.token ?? '', pid: rec.pid ?? null };
  }
  let port = 4173;
  try { port = Number(readHubConfig({ create: false }).port) || 4173; } catch { /* defaults */ }
  return { host: '127.0.0.1', port, token: '', pid: null };
}

/** The write token from hub.pid, or null when no hub is tracked. */
export async function readToken() {
  const rec = await readPidFile(hubPidPath());
  return rec?.token ?? null;
}

/* ───────────────────────── health + registry ───────────────────────── */

/**
 * Probe the hub's /__sdlc/health. Returns `{ reachable, payload, endpoint }` —
 * the exact shape lib/tray-format.formatHealth consumes.
 */
export async function getHealth({ timeoutMs = 1200 } = {}) {
  const endpoint = await hubEndpoint();
  const probe = await httpGetJson({ host: endpoint.host, port: endpoint.port, path: '/__sdlc/health', timeoutMs });
  return { reachable: probe.ok, payload: probe.json, endpoint };
}

/** POST /__sdlc/registry/refresh with the write token. */
export async function refreshRegistry({ timeoutMs = 1500 } = {}) {
  const endpoint = await hubEndpoint();
  return httpRequestJson({
    host: endpoint.host, port: endpoint.port,
    path: '/__sdlc/registry/refresh', method: 'POST', token: endpoint.token, timeoutMs,
  });
}

/* ───────────────────────── lifecycle ───────────────────────── */

/** Stop the hub, then (re)start it from the machine-wide config. */
export async function restartHub({ pluginRoot, log = () => {} } = {}) {
  await stopHub({ log });
  return ensureHubLifecycle({ pluginRoot, log });
}

/** Stop the hub (it keeps stopped until the next bootstrap or tray restart). */
export async function stopHubAction({ log = () => {} } = {}) {
  return stopHub({ log });
}

/**
 * Ensure the hub is up (P5 — called once at tray launch when autostart is on, so
 * the hub comes up at logon before any Claude session). Safe to call alongside
 * the SessionStart bootstrap: ensureHubLifecycle is idempotent (adopt-if-running).
 */
export async function ensureHubOnLaunch({ pluginRoot, log = () => {} } = {}) {
  return ensureHubLifecycle({ pluginRoot, log });
}

/* ───────────────────────── config toggle ───────────────────────── */

/**
 * Flip ~/.sdlc/hub-config.json `perRepoServe` and persist it. Returns the new
 * boolean. Takes effect on the next ensureServeLifecycle (next bootstrap) — the
 * tray only owns the config bit, not live daemon reaping.
 */
export function togglePerRepoServe() {
  const cfg = readHubConfig({ create: true });
  const next = !cfg.perRepoServe;
  cfg.perRepoServe = next;
  writeHubConfig(cfg);
  return next;
}

/** Current perRepoServe value (for the menu checkmark). */
export function perRepoServeEnabled() {
  try { return readHubConfig({ create: false }).perRepoServe !== false; }
  catch { return true; }
}

/* ───────────────────────── open-in-app ───────────────────────── */

/**
 * Pure: the per-platform command to open a URL or file path with the OS handler.
 * Windows uses `cmd /c start "" <target>` (the empty title arg keeps a quoted
 * target from being consumed as the window title).
 */
export function openerCommand(platform, target) {
  const t = String(target);
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', t] };
  if (platform === 'darwin') return { command: 'open', args: [t] };
  return { command: 'xdg-open', args: [t] };
}

function defaultOpener(command, args) {
  // No `detached` — on Windows detached:true forces a console window that
  // windowsHide cannot suppress (nodejs/node#21825), flashing a prompt on every
  // open. `cmd /c start` / `open` / `xdg-open` hand off and return immediately, so
  // detaching is unnecessary; windowsHide then actually hides the launcher.
  const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
  child.unref();
}

function openTarget(target, { opener = defaultOpener, platform = process.platform } = {}) {
  const { command, args } = openerCommand(platform, target);
  opener(command, args);
  return { command, args };
}

/** Open the hub dashboard (`http://<host>:<port>/`) in the default browser. */
export async function openDashboard({ opener, platform } = {}) {
  const endpoint = await hubEndpoint();
  return openTarget(`http://${endpoint.host}:${endpoint.port}/`, { opener, platform });
}

/** Open a per-repo route (`/r/<id>/`) in the default browser. */
export async function openRepo(href, { opener, platform } = {}) {
  const endpoint = await hubEndpoint();
  return openTarget(`http://${endpoint.host}:${endpoint.port}${href}`, { opener, platform });
}

/** Open the machine-wide hub config JSON in the default editor. */
export function openConfig({ opener, platform } = {}) {
  return openTarget(hubConfigPath(), { opener, platform });
}

/**
 * Pure: pick the best log target. The bootstrap log is per-repo, but the tray is
 * machine-wide, so prefer a `.ai/_view/.bootstrap.log` under the launch cwd
 * (manual `npm run tray` from a repo), then the machine prune log, then the
 * `~/.sdlc/` state dir itself.
 */
export function resolveLogTarget({ cwd = process.cwd(), homeDir = sdlcHomeDir(), exists = existsSync } = {}) {
  const cwdLog = join(cwd, '.ai', '_view', '.bootstrap.log');
  if (exists(cwdLog)) return cwdLog;
  const pruneLog = join(homeDir, 'registry.prune.log');
  if (exists(pruneLog)) return pruneLog;
  return homeDir;
}

/** Open the resolved log target. */
export function openLogs({ opener, platform, cwd, homeDir, exists } = {}) {
  return openTarget(resolveLogTarget({ cwd, homeDir, exists }), { opener, platform });
}

/* ───────────────────────── http helpers ───────────────────────── */

function httpGetJson({ host, port, path, timeoutMs }) {
  return new Promise((resolve) => {
    const req = request({ hostname: host, port, path, method: 'GET', timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve({ ok: false, json: null, status: res.statusCode }); return; }
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { if (buf.length < 262_144) buf += c; });
      res.on('end', () => {
        try { resolve({ ok: true, json: JSON.parse(buf), status: 200 }); }
        catch { resolve({ ok: false, json: null, status: 200 }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, json: null, status: 0 }); });
    req.on('error', () => resolve({ ok: false, json: null, status: 0 }));
    req.end();
  });
}

function httpRequestJson({ host, port, path, method, token, timeoutMs }) {
  return new Promise((resolve) => {
    const headers = {};
    if (token) headers['x-sdlc-token'] = token;
    const req = request({ hostname: host, port, path, method, timeout: timeoutMs, headers }, (res) => {
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { if (buf.length < 262_144) buf += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* non-JSON body */ }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: 0, json: null }); });
    req.on('error', () => resolve({ ok: false, status: 0, json: null }));
    req.end();
  });
}
