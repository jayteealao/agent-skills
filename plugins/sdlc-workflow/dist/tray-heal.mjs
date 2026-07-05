#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  TRAY_HEARTBEAT_STALE_MS,
  isTrayHeartbeatStale,
  readTrayHeartbeat
} from "./chunk-4UDDKSMJ.mjs";
import {
  resolveDurableNodePath
} from "./chunk-ERHYJB4B.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import {
  spawnDetached
} from "./chunk-K6PBZI5W.mjs";
import {
  isPidAlive,
  resolveEntrypoint
} from "./chunk-JH5USZ6A.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/tray-heal.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/tray-lifecycle.mjs
import { spawnSync } from "node:child_process";
function bundlePathFromCommandLine(commandLine) {
  const s = String(commandLine ?? "");
  const quoted = s.match(/"([^"]*tray\.(?:mjs|cjs))"/i);
  if (quoted) return quoted[1];
  const bare = s.match(/(\S*tray\.(?:mjs|cjs))/i);
  return bare ? bare[1] : null;
}
function normalizeBundlePath(p, platform = process.platform) {
  let s = String(p ?? "").trim().replace(/^["']|["']$/g, "");
  if (!s) return "";
  s = platform === "win32" ? s.replace(/\//g, "\\") : s.replace(/\\/g, "/");
  return platform === "win32" ? s.toLowerCase() : s;
}
function sameBundle(a, b, platform = process.platform) {
  const na = normalizeBundlePath(a, platform);
  return Boolean(na) && na === normalizeBundlePath(b, platform);
}
function parseTrayProcessList(raw) {
  if (!raw || !String(raw).trim()) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const pid = Number(row.ProcessId ?? row.pid);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    const commandLine = String(row.CommandLine ?? row.commandLine ?? "");
    const bundlePath = bundlePathFromCommandLine(commandLine);
    if (!bundlePath) continue;
    out.push({ pid, bundlePath, commandLine });
  }
  return out;
}
var WIN_PROBE_PS = [
  "$ErrorActionPreference='SilentlyContinue';",
  "$p = Get-CimInstance Win32_Process |",
  "  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'tray\\.(mjs|cjs)' } |",
  "  Select-Object ProcessId,CommandLine;",
  "if ($p) { $p | ConvertTo-Json -Compress }"
].join(" ");
function defaultProbe({ env = process.env } = {}) {
  try {
    const res = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", WIN_PROBE_PS],
      { encoding: "utf-8", timeout: 4e3, windowsHide: true, env }
    );
    return res?.stdout ?? "";
  } catch {
    return "";
  }
}
function listRunningTrays({ platform = process.platform, probe = defaultProbe } = {}) {
  if (platform !== "win32") return [];
  return parseTrayProcessList(probe({ platform }));
}
function defaultKill(pid) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
  }
}
function defaultRespawn({ nodePath, trayBundle, env = process.env }) {
  spawnDetached(nodePath, [trayBundle], { env });
}
async function reconcileRunningTray({
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
  log = () => {
  }
} = {}) {
  if (platform !== "win32") return { action: "unsupported", killed: [], running: 0 };
  if (!currentBundle) return { action: "no-current-bundle", killed: [], running: 0 };
  const trays = await list({ platform }) ?? [];
  if (!trays.length) return { action: "none", killed: [], running: 0 };
  const heartbeat = readHeartbeat();
  const isCurrent = (t) => sameBundle(t.bundlePath, currentBundle, platform);
  const isWedged = (t) => isCurrent(t) && isTrayHeartbeatStale(t, heartbeat, { now, stalenessMs });
  const isReapable = (t) => !isCurrent(t) || isWedged(t);
  const stale = trays.filter(isReapable);
  if (!stale.length) return { action: "unchanged", killed: [], running: trays.length };
  const killed = [];
  for (const t of stale) {
    try {
      kill(t.pid);
      killed.push(t.pid);
    } catch (err) {
      log(`[tray] could not stop ${isWedged(t) ? "wedged" : "stale"} pid ${t.pid}: ${err?.message ?? err}`);
    }
  }
  const liveCurrentUp = trays.some((t) => isCurrent(t) && !isWedged(t));
  if (liveCurrentUp) {
    log(`[tray] reaped ${killed.length} stale/wedged tray(s); a live current tray is already running`);
    return { action: "killed-stale", killed, running: trays.length };
  }
  respawn({ platform, nodePath, trayBundle: currentBundle, env });
  log(`[tray] reaped ${killed.length} stale/wedged tray(s); respawned the current bundle`);
  return { action: "respawned", killed, running: trays.length };
}

// scripts/tray-heal.mjs
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "..");
reconcileRunningTray({ currentBundle: resolveEntrypoint(PLUGIN_ROOT, "tray") }).catch(async (err) => {
  try {
    await logError("tray-heal", err);
  } catch {
  }
}).finally(() => process.exit(0));
