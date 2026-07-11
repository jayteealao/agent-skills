import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  sdlcHomeDir
} from "./chunk-TS3E2TXZ.mjs";

// lib/tray-heartbeat.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var TRAY_HEARTBEAT_STALE_MS = 6e4;
function trayHeartbeatPath(homeDir = sdlcHomeDir()) {
  return join(homeDir, "tray.heartbeat.json");
}
function writeTrayHeartbeat({ pid, bundle, iconState, summary, now = Date.now(), homeDir, writeFile = writeFileSync } = {}) {
  try {
    const path = trayHeartbeatPath(homeDir ?? sdlcHomeDir());
    const rec = { pid, bundle, lastPollAt: now };
    if (iconState !== void 0) rec.iconState = iconState;
    if (summary !== void 0) rec.summary = summary;
    writeFile(path, `${JSON.stringify(rec)}
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
function heartbeatShowsDown(tray, heartbeat, { now = Date.now(), stalenessMs = TRAY_HEARTBEAT_STALE_MS } = {}) {
  if (!tray || !heartbeat) return false;
  if (Number(heartbeat.pid) !== Number(tray.pid)) return false;
  const last = Number(heartbeat.lastPollAt);
  if (!Number.isFinite(last) || now - last > stalenessMs) return false;
  return heartbeat.iconState === "down";
}

export {
  TRAY_HEARTBEAT_STALE_MS,
  writeTrayHeartbeat,
  readTrayHeartbeat,
  isTrayHeartbeatStale,
  heartbeatShowsDown
};
