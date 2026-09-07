import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  sdlcHomeDir
} from "./chunk-BIK57RP4.mjs";

// lib/runtime-log.mjs
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
var MAX_LOG_BYTES = 1024 * 1024;
var KEEP_GENERATIONS = 2;
var hubLogPath = (home = sdlcHomeDir()) => join(home, "hub.log");
var lifecycleLogPath = (home = sdlcHomeDir()) => join(home, "lifecycle.log");
var errorsLogPath = (home = sdlcHomeDir()) => join(home, "errors.log");
var hubHistoryPath = (home = sdlcHomeDir()) => join(home, "hub-history.jsonl");
function rotateIfLarge(path, { maxBytes = MAX_LOG_BYTES, keep = KEEP_GENERATIONS } = {}) {
  let size;
  try {
    size = statSync(path).size;
  } catch {
    return false;
  }
  if (size <= maxBytes) return false;
  try {
    rmSync(`${path}.${keep}`, { force: true });
  } catch {
  }
  for (let i = keep - 1; i >= 1; i--) {
    try {
      if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`);
    } catch {
    }
  }
  try {
    renameSync(path, `${path}.1`);
  } catch {
    return false;
  }
  return true;
}
function appendLogLine(path, line, opts = {}) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    rotateIfLarge(path, opts);
    appendFileSync(path, line.endsWith("\n") ? line : `${line}
`, "utf-8");
    return true;
  } catch (e) {
    try {
      process.stderr.write(`[runtime-log] could not write ${path}: ${e?.message ?? e}
`);
    } catch {
    }
    return false;
  }
}
function parseJsonLines(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
    }
  }
  return out;
}
function readJsonLines(path) {
  try {
    return parseJsonLines(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}
function hubLogLine(line, { home, now = () => /* @__PURE__ */ new Date() } = {}) {
  const written = `${now().toISOString()} ${line}`;
  appendLogLine(hubLogPath(home), written);
  return written;
}
var LIFECYCLE_EVENTS = Object.freeze([
  "adopt",
  "reap",
  "recover",
  "start",
  "unconfirmed",
  "refused-host",
  "protocol-incompatible",
  "lock-timeout",
  "port-held"
]);
function formatLifecycleLine(record, now = /* @__PURE__ */ new Date()) {
  const { event, host = null, version = null, buildId = null, pid = null, reason = null, ...extra } = record ?? {};
  return JSON.stringify({
    at: now.toISOString(),
    event: String(event ?? "unknown"),
    host,
    version,
    buildId,
    pid: Number.isInteger(pid) ? pid : null,
    reason: reason == null ? null : String(reason),
    ...extra
  });
}
function logLifecycle(record, { home, now = /* @__PURE__ */ new Date() } = {}) {
  const line = formatLifecycleLine(record, now);
  appendLogLine(lifecycleLogPath(home), line);
  return line;
}
function recordHubStart({ pid, version = null, buildId = null, startedBy = null, reason = "unknown", port = null } = {}, { home, now = /* @__PURE__ */ new Date() } = {}) {
  const record = { at: now.toISOString(), event: "start", pid: Number.isInteger(pid) ? pid : null, version, buildId, startedBy, reason: String(reason), port };
  appendLogLine(hubHistoryPath(home), JSON.stringify(record));
  return record;
}
function readHubHistory(home) {
  const records = readJsonLines(hubHistoryPath(home)).filter((r) => r && r.event === "start");
  const last = records.at(-1) ?? null;
  return {
    starts: records.length,
    restarts: Math.max(0, records.length - 1),
    lastReason: last?.reason ?? null,
    lastAt: last?.at ?? null,
    lastPid: last?.pid ?? null
  };
}

export {
  errorsLogPath,
  appendLogLine,
  hubLogLine,
  logLifecycle,
  recordHubStart,
  readHubHistory
};
