#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  disableAutostart,
  enableAutostart,
  isAutostartEnabled,
  refreshAutostart
} from "./chunk-BUQPB4LT.mjs";
import {
  ensureHubLifecycle,
  hubConfigPath,
  readHubConfig,
  stopHub,
  writeHubConfig
} from "./chunk-77OL7PJT.mjs";
import "./chunk-HQR34SES.mjs";
import "./chunk-ZMYLXAL2.mjs";
import "./chunk-WSKFGLGB.mjs";
import {
  hubPidPath,
  readPidFile,
  runtimeIdentity,
  sdlcHomeDir
} from "./chunk-W64MFL45.mjs";
import "./chunk-HLR2BZLC.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/tray.mjs
import { existsSync as existsSync2, readFileSync, mkdirSync, copyFileSync, statSync, chmodSync } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/tray-protocol.mjs
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
var SEPARATOR = Object.freeze({ title: "<SEPARATOR>", tooltip: "", enabled: true });
var CHECK = " (\u221A)";
function buildWire(items, ctx) {
  return items.map((item) => {
    const id = ctx.counter++;
    ctx.map.set(id, item);
    const out = {
      title: item.title,
      tooltip: item.tooltip ?? "",
      checked: item.checked ?? false,
      enabled: item.enabled === void 0 ? true : item.enabled,
      hidden: item.hidden ?? false,
      __id: id
    };
    if (item.icon) out.icon = item.icon;
    if (item.isTemplateIcon) out.isTemplateIcon = item.isTemplateIcon;
    if (Array.isArray(item.items)) out.items = buildWire(item.items, ctx);
    return out;
  });
}
function applyLinuxChecks(items, platform) {
  if (platform !== "linux") return;
  for (const item of items) {
    if (item.title && item.title !== SEPARATOR.title) {
      const has = item.title.endsWith(CHECK);
      if (item.checked && !has) item.title += CHECK;
      else if (!item.checked && has) item.title = item.title.slice(0, -CHECK.length);
    }
    if (Array.isArray(item.items)) applyLinuxChecks(item.items, platform);
  }
}
var Tray = class {
  /**
   * @param {{ binPath:string, menu:object, debug?:boolean, platform?:string }} opts
   *   menu = { icon, title, tooltip, isTemplateIcon, items:[{title,tooltip,checked,
   *            enabled,hidden,icon,items,onClick}] } — icon is a base64 string.
   */
  constructor({ binPath, menu, debug = false, platform = process.platform }) {
    this.binPath = binPath;
    this.menu = menu;
    this.debug = debug;
    this.platform = platform;
    this.map = /* @__PURE__ */ new Map();
    this.proc = null;
    this.rl = null;
    this._exitCbs = [];
    this._errorCbs = [];
  }
  /** Spawn the helper and send the menu once it reports ready. Resolves then. */
  start() {
    return new Promise((resolve2, reject) => {
      let proc;
      try {
        proc = spawn(this.binPath, [], { windowsHide: true });
      } catch (err) {
        reject(err);
        return;
      }
      this.proc = proc;
      proc.stderr?.resume();
      let settled = false;
      proc.on("error", (err) => {
        this._errorCbs.forEach((cb) => cb(err));
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      proc.on("exit", (code) => {
        this._exitCbs.forEach((cb) => cb(code));
        if (!settled) {
          settled = true;
          reject(new Error(`tray helper exited (code ${code}) before becoming ready`));
        }
      });
      this.rl = createInterface({ input: proc.stdout });
      this.rl.on("line", (line) => {
        const wasReady = this._onLine(line);
        if (wasReady && !settled) {
          settled = true;
          resolve2(this);
        }
      });
    });
  }
  _menuObject() {
    this.map = /* @__PURE__ */ new Map();
    const items = buildWire(this.menu.items, { counter: 1, map: this.map });
    applyLinuxChecks(items, this.platform);
    return {
      icon: this.menu.icon ?? "",
      title: this.menu.title ?? "",
      tooltip: this.menu.tooltip ?? "",
      isTemplateIcon: this.menu.isTemplateIcon ?? false,
      items
    };
  }
  _write(obj) {
    if (!this.proc || !this.proc.stdin?.writable) return;
    const line = typeof obj === "string" ? obj : JSON.stringify(obj);
    if (this.debug) console.error("[tray\u2192]", line.slice(0, 160));
    try {
      this.proc.stdin.write(`${line.trim()}
`);
    } catch {
    }
  }
  _onLine(line) {
    let action;
    try {
      action = JSON.parse(line);
    } catch {
      return false;
    }
    if (this.debug) console.error("[tray\u2190]", line.slice(0, 160));
    if (action.type === "ready") {
      this._write(this._menuObject());
      return true;
    }
    if (action.type === "clicked") {
      const item = this.map.get(action.__id);
      if (item && typeof item.onClick === "function") {
        try {
          item.onClick(item);
        } catch (err) {
          this._errorCbs.forEach((cb) => cb(err));
        }
      }
    }
    return false;
  }
  /** Re-render the tray (icon + all items). Pass a new menu or mutate `this.menu`. */
  update(menu) {
    if (menu) this.menu = menu;
    this._write({ type: "update-menu", menu: this._menuObject() });
  }
  onExit(cb) {
    this._exitCbs.push(cb);
  }
  onError(cb) {
    this._errorCbs.push(cb);
  }
  /** Ask the helper to quit, then force-kill if it lingers. */
  kill() {
    this._write({ type: "exit" });
    setTimeout(() => {
      try {
        this.proc?.kill();
      } catch {
      }
    }, 250);
  }
};

// lib/tray-format.mjs
function fmtUptime(ms) {
  let n = Number(ms);
  if (!Number.isFinite(n) || n < 0) n = 0;
  const s = Math.floor(n / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24}h`;
}
function fmtBytes(n) {
  let v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const str = i === 0 ? String(Math.round(v)) : v >= 100 ? String(Math.round(v)) : v.toFixed(1);
  return `${str} ${units[i]}`;
}
function fmtRelTime(iso, now = Date.now()) {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "never";
  const diff = Number(now) - t;
  if (diff < 45e3) return "just now";
  const m = Math.floor(diff / 6e4);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function shortHash(h) {
  const s = String(h ?? "");
  return s ? s.slice(0, 8) : "\u2014";
}
function formatHealth(result = {}, now = Date.now()) {
  const { reachable = false, payload = null, pluginVersion = "" } = result;
  if (!reachable || !payload || typeof payload !== "object") {
    return {
      iconState: "down",
      tooltip: "SDLC hub \u2014 down",
      summary: "\u25CF hub down \u2014 start it?",
      detailRows: [{ label: "Status", value: "not reachable" }],
      repoItems: []
    };
  }
  const version = typeof payload.version === "string" ? payload.version : "";
  const isHub = Array.isArray(payload.entries);
  const repoCount = isHub ? payload.entries.length : 0;
  const stale = Boolean(pluginVersion) && Boolean(version) && version !== pluginVersion;
  const detailRows = buildDetailRows(payload, { isHub, now });
  const repoItems = isHub ? buildRepoItems(payload.entries, now) : [];
  if (stale) {
    return {
      iconState: "stale",
      tooltip: `SDLC ${isHub ? "hub" : "repo"} stale v${version} \u2192 v${pluginVersion}`,
      summary: `\u25CF stale v${version} \u2192 v${pluginVersion} (restart)`,
      detailRows,
      repoItems
    };
  }
  if (isHub) {
    const upStr = fmtUptime(payload.uptimeMs);
    const reqStr = `${payload.metrics?.requests ?? 0} req`;
    return {
      iconState: "up",
      tooltip: `SDLC hub v${version} \xB7 ${repoCount} repo${repoCount === 1 ? "" : "s"} \xB7 up ${upStr} \xB7 ${reqStr}`,
      summary: `\u25CF healthy \u2014 v${version} \xB7 ${repoCount} repo${repoCount === 1 ? "" : "s"}`,
      detailRows,
      repoItems
    };
  }
  return {
    iconState: "up",
    tooltip: `SDLC repo v${version} \xB7 rendered ${fmtRelTime(payload.renderedAt, now)}`,
    summary: `\u25CF serving repo \u2014 v${version}`,
    detailRows,
    repoItems
  };
}
function buildDetailRows(payload, { isHub, now }) {
  const rows = [];
  if (payload.version) rows.push({ label: "Version", value: `v${payload.version}` });
  if (Number.isInteger(payload.pid)) rows.push({ label: "PID", value: String(payload.pid) });
  if (isHub) {
    rows.push({ label: "Uptime", value: fmtUptime(payload.uptimeMs) });
    const m = payload.metrics ?? {};
    rows.push({ label: "Requests", value: String(m.requests ?? 0) });
    rows.push({ label: "SSE clients", value: String(m.sseClients ?? 0) });
    if (m.rssBytes != null) rows.push({ label: "RSS", value: fmtBytes(m.rssBytes) });
  } else {
    rows.push({ label: "Rendered", value: fmtRelTime(payload.renderedAt, now) });
  }
  rows.push({ label: "Config", value: shortHash(payload.configHash) });
  return rows;
}
function buildRepoItems(entries, now) {
  return entries.map((e) => {
    const id = String(e.id ?? "?");
    const branch = String(e.headBranch ?? e.branch ?? "?");
    const slugs = Array.isArray(e.slugs) ? e.slugs.length : 0;
    const rendered = fmtRelTime(e.lastRenderedAt, now);
    return {
      id,
      branch,
      slugs,
      rendered,
      label: `\u21B3 ${id} \xB7 ${branch} \xB7 ${slugs} slug${slugs === 1 ? "" : "s"} \xB7 ${rendered}`,
      href: `/r/${id}/`
    };
  });
}

// lib/tray-actions.mjs
import { spawn as spawn2 } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
async function hubEndpoint() {
  const rec = await readPidFile(hubPidPath());
  if (rec && rec.port) {
    const host = rec.host && rec.host !== "0.0.0.0" ? rec.host : "127.0.0.1";
    return { host, port: Number(rec.port), token: rec.token ?? "", pid: rec.pid ?? null };
  }
  let port = 4173;
  try {
    port = Number(readHubConfig({ create: false }).port) || 4173;
  } catch {
  }
  return { host: "127.0.0.1", port, token: "", pid: null };
}
async function getHealth({ timeoutMs = 1200 } = {}) {
  const endpoint = await hubEndpoint();
  const probe = await httpGetJson({ host: endpoint.host, port: endpoint.port, path: "/__sdlc/health", timeoutMs });
  return { reachable: probe.ok, payload: probe.json, endpoint };
}
async function refreshRegistry({ timeoutMs = 1500 } = {}) {
  const endpoint = await hubEndpoint();
  return httpRequestJson({
    host: endpoint.host,
    port: endpoint.port,
    path: "/__sdlc/registry/refresh",
    method: "POST",
    token: endpoint.token,
    timeoutMs
  });
}
async function restartHub({ pluginRoot, log: log2 = () => {
} } = {}) {
  await stopHub({ log: log2 });
  return ensureHubLifecycle({ pluginRoot, log: log2 });
}
async function stopHubAction({ log: log2 = () => {
} } = {}) {
  return stopHub({ log: log2 });
}
async function ensureHubOnLaunch({ pluginRoot, log: log2 = () => {
} } = {}) {
  return ensureHubLifecycle({ pluginRoot, log: log2 });
}
function togglePerRepoServe() {
  const cfg = readHubConfig({ create: true });
  const next = cfg.perRepoServe !== true;
  cfg.perRepoServe = next;
  writeHubConfig(cfg);
  return next;
}
function perRepoServeEnabled() {
  try {
    return readHubConfig({ create: false }).perRepoServe === true;
  } catch {
    return false;
  }
}
function openerCommand(platform, target) {
  const t = String(target);
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", t] };
  if (platform === "darwin") return { command: "open", args: [t] };
  return { command: "xdg-open", args: [t] };
}
function defaultOpener(command, args) {
  const child = spawn2(command, args, { stdio: "ignore", windowsHide: true });
  child.unref();
}
function openTarget(target, { opener = defaultOpener, platform = process.platform } = {}) {
  const { command, args } = openerCommand(platform, target);
  opener(command, args);
  return { command, args };
}
async function openDashboard({ opener, platform } = {}) {
  const endpoint = await hubEndpoint();
  return openTarget(`http://${endpoint.host}:${endpoint.port}/`, { opener, platform });
}
async function openRepo(href, { opener, platform } = {}) {
  const endpoint = await hubEndpoint();
  return openTarget(`http://${endpoint.host}:${endpoint.port}${href}`, { opener, platform });
}
function openConfig({ opener, platform } = {}) {
  return openTarget(hubConfigPath(), { opener, platform });
}
function resolveLogTarget({ cwd = process.cwd(), homeDir = sdlcHomeDir(), exists = existsSync } = {}) {
  const cwdLog = join(cwd, ".ai", "_view", ".bootstrap.log");
  if (exists(cwdLog)) return cwdLog;
  const pruneLog = join(homeDir, "registry.prune.log");
  if (exists(pruneLog)) return pruneLog;
  return homeDir;
}
function openLogs({ opener, platform, cwd, homeDir, exists } = {}) {
  return openTarget(resolveLogTarget({ cwd, homeDir, exists }), { opener, platform });
}
function httpGetJson({ host, port, path, timeoutMs }) {
  return new Promise((resolve2) => {
    const req = request({ hostname: host, port, path, method: "GET", timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve2({ ok: false, json: null, status: res.statusCode });
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 262144) buf += c;
      });
      res.on("end", () => {
        try {
          resolve2({ ok: true, json: JSON.parse(buf), status: 200 });
        } catch {
          resolve2({ ok: false, json: null, status: 200 });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2({ ok: false, json: null, status: 0 });
    });
    req.on("error", () => resolve2({ ok: false, json: null, status: 0 }));
    req.end();
  });
}
function httpRequestJson({ host, port, path, method, token, timeoutMs }) {
  return new Promise((resolve2) => {
    const headers = {};
    if (token) headers["x-sdlc-token"] = token;
    const req = request({ hostname: host, port, path, method, timeout: timeoutMs, headers }, (res) => {
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 262144) buf += c;
      });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(buf);
        } catch {
        }
        resolve2({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2({ ok: false, status: 0, json: null });
    });
    req.on("error", () => resolve2({ ok: false, status: 0, json: null }));
    req.end();
  });
}

// scripts/tray.mjs
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "..");
var TRAY_BUNDLE = fileURLToPath(import.meta.url);
var PLUGIN_VERSION = runtimeIdentity().runtimeVersion;
var TRAY_BIN_NAMES = {
  win32: "tray_windows_release.exe",
  darwin: "tray_darwin_release",
  linux: "tray_linux_release"
};
var POLL_MS = 5e3;
var log = (...a) => console.log("[tray]", ...a);
function iconBase64(state) {
  const ext = process.platform === "win32" ? "ico" : "png";
  const suffix = state === "down" ? "-down" : state === "stale" ? "-stale" : "";
  try {
    return readFileSync(resolve(PLUGIN_ROOT, "assets", `app-icon${suffix}.${ext}`)).toString("base64");
  } catch {
    return "";
  }
}
function ensureRuntimeBinary() {
  const name = TRAY_BIN_NAMES[process.platform];
  if (!name) throw new Error(`tray: unsupported platform ${process.platform}`);
  const vendored = resolve(PLUGIN_ROOT, "bin", "tray", name);
  if (!existsSync2(vendored)) throw new Error(`tray: vendored helper missing at ${vendored}`);
  const dir = join2(sdlcHomeDir(), "bin");
  mkdirSync(dir, { recursive: true });
  const runtime = join2(dir, name);
  let stale = true;
  try {
    stale = !existsSync2(runtime) || statSync(runtime).size !== statSync(vendored).size;
  } catch {
  }
  if (stale) {
    try {
      copyFileSync(vendored, runtime);
    } catch (err) {
      if (!existsSync2(runtime)) throw new Error(`tray: failed to copy helper to ${runtime}: ${err.message}`);
    }
  }
  if (process.platform !== "win32") {
    try {
      chmodSync(runtime, 493);
    } catch {
    }
  }
  return runtime;
}
var tray = null;
var lastSig = "";
var refreshTimer = null;
function signatureOf(h) {
  return JSON.stringify({
    s: h.summary,
    d: h.detailRows,
    r: h.repoItems,
    i: h.iconState,
    p: perRepoServeEnabled(),
    a: isAutostartEnabled()
  });
}
function buildMenu(h) {
  const items = [];
  items.push({ title: h.summary, enabled: false });
  items.push(SEPARATOR);
  items.push({ title: "Open dashboard", tooltip: "Open the hub dashboard in your browser", onClick: () => {
    openDashboard().catch(() => {
    });
  } });
  items.push({ title: "Refresh registry", tooltip: "Re-scan all repos now", onClick: () => {
    refreshRegistry().catch(() => {
    });
    refreshSoon();
  } });
  if (h.detailRows.length) {
    items.push({ title: "Health", tooltip: "Hub details", items: h.detailRows.map((r) => ({ title: `${r.label}: ${r.value}`, enabled: false })) });
  }
  if (h.repoItems.length) {
    items.push(SEPARATOR);
    for (const r of h.repoItems) {
      items.push({ title: r.label, tooltip: `Open /r/${r.id}/`, onClick: () => {
        openRepo(r.href).catch(() => {
        });
      } });
    }
  }
  items.push(SEPARATOR);
  items.push({ title: "Restart hub", onClick: () => {
    restartHub({ pluginRoot: PLUGIN_ROOT, log }).catch(() => {
    }).finally(() => refreshSoon(900));
  } });
  items.push({ title: "Stop hub", onClick: () => {
    stopHubAction({ log }).catch(() => {
    }).finally(() => refreshSoon());
  } });
  items.push(SEPARATOR);
  items.push({ title: "Open hub config\u2026", onClick: () => openConfig() });
  items.push({ title: "Open logs\u2026", onClick: () => openLogs() });
  items.push({ title: "Per-repo serve", tooltip: "Toggle per-repo daemons (takes effect next session)", checked: perRepoServeEnabled(), onClick: onTogglePerRepoServe });
  items.push({ title: "Start at login", tooltip: "Launch the tray + hub at logon", checked: isAutostartEnabled(), onClick: onToggleAutostart });
  items.push(SEPARATOR);
  items.push({ title: "Quit", tooltip: "Exit the tray (the hub keeps running)", onClick: () => quit() });
  return { icon: iconBase64(h.iconState), title: "", tooltip: h.tooltip, isTemplateIcon: false, items };
}
function onTogglePerRepoServe() {
  try {
    togglePerRepoServe();
  } catch (err) {
    log("toggle per-repo serve failed:", err.message);
  }
  refreshSoon(50);
}
function onToggleAutostart() {
  try {
    if (isAutostartEnabled()) {
      disableAutostart();
      log("autostart disabled");
    } else {
      enableAutostart({ trayBundle: TRAY_BUNDLE });
      log("autostart enabled");
    }
  } catch (err) {
    log("toggle autostart failed:", err.message);
  }
  refreshSoon(50);
}
function quit() {
  if (refreshTimer) clearInterval(refreshTimer);
  try {
    tray?.kill();
  } catch {
  }
  setTimeout(() => process.exit(0), 400);
}
async function currentHealth() {
  const probe = await getHealth().catch(() => ({ reachable: false, payload: null }));
  return formatHealth({ reachable: probe.reachable, payload: probe.payload, pluginVersion: PLUGIN_VERSION }, Date.now());
}
async function refresh() {
  const h = await currentHealth();
  const sig = signatureOf(h);
  if (sig === lastSig && tray) return;
  lastSig = sig;
  if (tray) tray.update(buildMenu(h));
}
function refreshSoon(delay = 700) {
  setTimeout(() => {
    refresh().catch(() => {
    });
  }, delay);
}
async function selfcheck() {
  const name = TRAY_BIN_NAMES[process.platform] ?? TRAY_BIN_NAMES.linux;
  const vendored = resolve(PLUGIN_ROOT, "bin", "tray", name);
  const hasBin = existsSync2(vendored);
  const icon = iconBase64("up");
  const sample = formatHealth({ reachable: false, payload: null, pluginVersion: PLUGIN_VERSION });
  log(`selfcheck: binary=${hasBin} icon=${icon.length > 0} summary="${sample.summary}"`);
  process.exit(hasBin && icon.length > 0 ? 0 : 1);
}
async function main() {
  if (process.argv.includes("--selfcheck")) {
    await selfcheck();
    return;
  }
  const binPath = ensureRuntimeBinary();
  if (isAutostartEnabled()) {
    try {
      refreshAutostart({ trayBundle: TRAY_BUNDLE });
    } catch {
    }
    ensureHubOnLaunch({ pluginRoot: PLUGIN_ROOT, log }).catch(() => {
    });
  }
  const h = await currentHealth();
  lastSig = signatureOf(h);
  tray = new Tray({ binPath, menu: buildMenu(h) });
  tray.onError((err) => log("helper error:", err.message));
  tray.onExit(() => process.exit(0));
  await tray.start();
  log(`ready \u2014 ${h.summary}`);
  refreshTimer = setInterval(() => {
    refresh().catch(() => {
    });
  }, POLL_MS);
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
}
main().catch((err) => {
  console.error("[tray] fatal:", err?.stack ?? err?.message ?? err);
  process.exit(1);
});
