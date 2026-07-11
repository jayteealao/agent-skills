#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  ensureHubOnLaunch,
  getHealth,
  openConfig,
  openDashboard,
  openLogs,
  openRepo,
  perRepoServeEnabled,
  refreshRegistry,
  restartHub,
  stopHubAction,
  togglePerRepoServe
} from "./chunk-S2AIOFR5.mjs";
import {
  clearTrayHeartbeat,
  writeTrayHeartbeat
} from "./chunk-SU4XJL2X.mjs";
import {
  disableAutostart,
  enableAutostart,
  isAutostartEnabled,
  refreshAutostart
} from "./chunk-ERHYJB4B.mjs";
import "./chunk-MW5WFXDC.mjs";
import "./chunk-J2RO6O56.mjs";
import {
  runtimeIdentity
} from "./chunk-5K66NEIW.mjs";
import "./chunk-K6PBZI5W.mjs";
import {
  sdlcHomeDir
} from "./chunk-U4OUM73W.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-IJYGUPYT.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/tray.mjs
import { existsSync, readFileSync, mkdirSync, copyFileSync, statSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
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
  constructor({ binPath, menu, debug = false, platform = process.platform, spawn: spawnFn = spawn }) {
    this.binPath = binPath;
    this.menu = menu;
    this.debug = debug;
    this.platform = platform;
    this._spawn = spawnFn;
    this.map = /* @__PURE__ */ new Map();
    this.proc = null;
    this.rl = null;
    this._pending = null;
    this._exitCbs = [];
    this._errorCbs = [];
  }
  /** Spawn the helper and send the menu once it reports ready. Resolves then. */
  start() {
    return this._track(this._spawnAndWait());
  }
  // Publish an in-flight spawn on `_pending` and clear it on settle. While a
  // spawn is pending, restart() piggybacks on it and update() defers — the ready
  // handler reads `this.menu` at send time, so the freshest menu always wins.
  _track(promise) {
    this._pending = promise.finally(() => {
      this._pending = null;
    });
    return this._pending;
  }
  // Spawn one helper process, wire its stdio, and resolve when it reports ready.
  // Shared by start() and restart(); the latter tears down the previous process
  // first. Each process carries its own readline on `_rl` so a restart can close
  // the old reader without leaking it, and a `_replacing` flag so a process we are
  // deliberately swapping out does NOT fire the driver-level exit callbacks (which
  // call process.exit — that would take the whole tray down on every restart).
  _spawnAndWait() {
    return new Promise((resolve2, reject) => {
      let proc;
      try {
        proc = this._spawn(this.binPath, [], { windowsHide: true });
      } catch (err) {
        reject(err);
        return;
      }
      this.proc = proc;
      proc.stderr?.resume();
      let settled = false;
      proc.on("error", (err) => {
        if (proc._replacing) return;
        this._errorCbs.forEach((cb) => cb(err));
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      proc.on("exit", (code) => {
        if (proc._replacing) return;
        this._exitCbs.forEach((cb) => cb(code));
        if (!settled) {
          settled = true;
          reject(new Error(`tray helper exited (code ${code}) before becoming ready`));
        }
      });
      proc._rl = createInterface({ input: proc.stdout });
      this.rl = proc._rl;
      proc._rl.on("line", (line) => {
        const wasReady = this._onLine(line);
        if (wasReady && !settled) {
          settled = true;
          resolve2(this);
        }
      });
    });
  }
  /**
   * Replace the running helper with a fresh process and render `menu` on it. The
   * native helper's `update-menu` path is unreliable for large structural changes
   * (notably the down→up transition, where the item count grows) — a clean
   * respawn always renders correctly. Tears the old process down WITHOUT firing
   * the driver's exit handlers, so the tray keeps running. Resolves once the new
   * helper is ready; rejects if it never comes up (caller can fall back to update).
   */
  async restart(menu) {
    if (menu) this.menu = menu;
    if (this._pending) {
      return this._pending.then((res) => {
        this._write({ type: "update-menu", menu: this._menuObject() });
        return res;
      });
    }
    const old = this.proc;
    if (old) {
      old._replacing = true;
      try {
        old._rl?.close();
      } catch {
      }
      try {
        old.stdin?.writable && old.stdin.write(`${JSON.stringify({ type: "exit" })}
`);
      } catch {
      }
      setTimeout(() => {
        try {
          old.kill();
        } catch {
        }
      }, 250).unref?.();
    }
    return this._track(this._spawnAndWait());
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
    if (this._pending) {
      this._pending.then(() => this._write({ type: "update-menu", menu: this._menuObject() })).catch(() => {
      });
      return;
    }
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
    }, 250).unref?.();
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
var INITIAL_PROBE_RETRIES = 6;
var INITIAL_PROBE_DELAY_MS = 500;
var log = (...a) => console.log("[tray]", ...a);
var delay = (ms) => new Promise((r) => setTimeout(r, ms));
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
  if (!existsSync(vendored)) throw new Error(`tray: vendored helper missing at ${vendored}`);
  const dir = join(sdlcHomeDir(), "bin");
  mkdirSync(dir, { recursive: true });
  const runtime = join(dir, name);
  const fileHash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  let stale = true;
  try {
    stale = !existsSync(runtime) || statSync(runtime).size !== statSync(vendored).size || fileHash(runtime) !== fileHash(vendored);
  } catch {
  }
  if (stale) {
    try {
      copyFileSync(vendored, runtime);
    } catch (err) {
      if (!existsSync(runtime)) throw new Error(`tray: failed to copy helper to ${runtime}: ${err.message}`);
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
var lastIconState = "";
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
  clearTrayHeartbeat();
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
  writeTrayHeartbeat({ pid: process.pid, bundle: TRAY_BUNDLE, iconState: h.iconState, summary: h.summary });
  const sig = signatureOf(h);
  if (sig === lastSig && tray) return;
  lastSig = sig;
  const iconChanged = h.iconState !== lastIconState;
  lastIconState = h.iconState;
  if (!tray) return;
  if (iconChanged) {
    tray.restart(buildMenu(h)).catch((err) => {
      log("helper respawn on transition failed:", err.message);
      setTimeout(() => {
        tray.restart(buildMenu(h)).catch((err2) => {
          log("helper respawn retry failed:", err2.message, "\u2014 exiting so the heal can revive");
          process.exit(1);
        });
      }, 1e3);
    });
  } else {
    tray.update(buildMenu(h));
  }
}
function refreshSoon(ms = 700) {
  setTimeout(() => {
    refresh().catch(() => {
    });
  }, ms);
}
var lastTickAt = Date.now();
function pollTick() {
  const now = Date.now();
  if (now - lastTickAt > POLL_MS * 3) lastSig = "";
  lastTickAt = now;
  refresh().catch(() => {
  });
}
async function selfcheck() {
  const name = TRAY_BIN_NAMES[process.platform] ?? TRAY_BIN_NAMES.linux;
  const vendored = resolve(PLUGIN_ROOT, "bin", "tray", name);
  const hasBin = existsSync(vendored);
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
  writeTrayHeartbeat({ pid: process.pid, bundle: TRAY_BUNDLE });
  let h = await currentHealth();
  for (let i = 0; i < INITIAL_PROBE_RETRIES && h.iconState === "down"; i++) {
    await delay(INITIAL_PROBE_DELAY_MS);
    h = await currentHealth();
  }
  writeTrayHeartbeat({ pid: process.pid, bundle: TRAY_BUNDLE, iconState: h.iconState, summary: h.summary });
  lastSig = signatureOf(h);
  lastIconState = h.iconState;
  tray = new Tray({ binPath, menu: buildMenu(h) });
  tray.onError((err) => log("helper error:", err.message));
  tray.onExit(() => process.exit(0));
  await tray.start();
  log(`ready \u2014 ${h.summary}`);
  lastTickAt = Date.now();
  refreshTimer = setInterval(pollTick, POLL_MS);
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
}
main().catch((err) => {
  console.error("[tray] fatal:", err?.stack ?? err?.message ?? err);
  process.exit(1);
});
