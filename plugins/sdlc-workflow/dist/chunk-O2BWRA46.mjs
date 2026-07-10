import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  sdlcHomeDir
} from "./chunk-T6TC3LOO.mjs";

// lib/tray-heartbeat.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var TRAY_HEARTBEAT_STALE_MS = 6e4;
function trayHeartbeatPath(homeDir = sdlcHomeDir()) {
  return join(homeDir, "tray.heartbeat.json");
}
function writeTrayHeartbeat({ pid, bundle, now = Date.now(), homeDir, writeFile = writeFileSync } = {}) {
  try {
    const path = trayHeartbeatPath(homeDir ?? sdlcHomeDir());
    writeFile(path, `${JSON.stringify({ pid, bundle, lastPollAt: now })}
`, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function readTrayHeartbeat({ homeDir, readFile = readFileSync } = {}) {
  try {
    const rec = JSON.parse(readFile(trayHeartbeatPath(homeDir ?? sdlcHomeDir()), "utf-8"));
    return rec && typeof rec === "object" ? rec : null;
  } catch {
    return null;
  }
}
function isTrayHeartbeatStale(tray, heartbeat, { now = Date.now(), stalenessMs = TRAY_HEARTBEAT_STALE_MS } = {}) {
  if (!tray || !heartbeat) return false;
  if (Number(heartbeat.pid) !== Number(tray.pid)) return false;
  const last = Number(heartbeat.lastPollAt);
  if (!Number.isFinite(last)) return false;
  return now - last > stalenessMs;
}

export {
  TRAY_HEARTBEAT_STALE_MS,
  writeTrayHeartbeat,
  readTrayHeartbeat,
  isTrayHeartbeatStale
};
