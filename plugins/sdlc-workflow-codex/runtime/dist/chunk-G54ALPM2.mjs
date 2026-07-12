import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  ensureHubLifecycle,
  hubConfigPath,
  readHubConfig,
  stopHub,
  writeHubConfig
} from "./chunk-65BE5KJY.mjs";
import {
  hubPidPath,
  readPidFile,
  sdlcHomeDir
} from "./chunk-U4OUM73W.mjs";

// lib/tray-actions.mjs
import { spawn } from "node:child_process";
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
async function readToken() {
  const rec = await readPidFile(hubPidPath());
  return rec?.token ?? null;
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
async function restartHub({ pluginRoot, log = () => {
} } = {}) {
  await stopHub({ log });
  return ensureHubLifecycle({ pluginRoot, log });
}
async function stopHubAction({ log = () => {
} } = {}) {
  return stopHub({ log });
}
async function ensureHubOnLaunch({ pluginRoot, log = () => {
} } = {}) {
  return ensureHubLifecycle({ pluginRoot, log });
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
  const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
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
  return new Promise((resolve) => {
    const req = request({ hostname: host, port, path, method: "GET", timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve({ ok: false, json: null, status: res.statusCode });
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 262144) buf += c;
      });
      res.on("end", () => {
        try {
          resolve({ ok: true, json: JSON.parse(buf), status: 200 });
        } catch {
          resolve({ ok: false, json: null, status: 200 });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, json: null, status: 0 });
    });
    req.on("error", () => resolve({ ok: false, json: null, status: 0 }));
    req.end();
  });
}
function httpRequestJson({ host, port, path, method, token, timeoutMs }) {
  return new Promise((resolve) => {
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
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, json: null });
    });
    req.on("error", () => resolve({ ok: false, status: 0, json: null }));
    req.end();
  });
}

export {
  hubEndpoint,
  readToken,
  getHealth,
  refreshRegistry,
  restartHub,
  stopHubAction,
  ensureHubOnLaunch,
  togglePerRepoServe,
  perRepoServeEnabled,
  openerCommand,
  openDashboard,
  openRepo,
  openConfig,
  resolveLogTarget,
  openLogs
};
