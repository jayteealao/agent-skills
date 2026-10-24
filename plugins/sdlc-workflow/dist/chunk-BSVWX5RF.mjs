import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/home.mjs
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function sdlcHomeDir() {
  const override = process.env.SDLC_HOME;
  return override && override.trim() ? override : join(homedir(), ".sdlc");
}
var MAX_LOG_BYTES = 1024 * 1024;
var KEEP_GENERATIONS = 2;
var machineConfigPath = (home = sdlcHomeDir()) => join(home, "config.json");
var lifecycleLogPath = (home = sdlcHomeDir()) => join(home, "lifecycle.log");
var errorsLogPath = (home = sdlcHomeDir()) => join(home, "errors.log");
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
      process.stderr.write(`[home] could not write ${path}: ${e?.message ?? e}
`);
    } catch {
    }
    return false;
  }
}
function formatLifecycleLine(record, now = /* @__PURE__ */ new Date()) {
  const { event, host = null, reason = null, ...extra } = record ?? {};
  return JSON.stringify({
    at: now.toISOString(),
    event: String(event ?? "unknown"),
    host,
    reason: reason == null ? null : String(reason),
    ...extra
  });
}
function logLifecycle(record, { home, now = /* @__PURE__ */ new Date() } = {}) {
  const line = formatLifecycleLine(record, now);
  appendLogLine(lifecycleLogPath(home), line);
  return line;
}

export {
  sdlcHomeDir,
  machineConfigPath,
  errorsLogPath,
  appendLogLine,
  logLifecycle
};
