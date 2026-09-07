import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  appendLogLine,
  errorsLogPath
} from "./chunk-RV4GKXDG.mjs";

// lib/error-log.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, ".ai", "_view", ".hook-errors.log");
}
function hasWorkflows(projectRoot = process.cwd()) {
  try {
    return existsSync(join(projectRoot, ".ai", "workflows"));
  } catch {
    return false;
  }
}
async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot),
  machineLogPath = errorsLogPath(),
  perRepo = hasWorkflows(projectRoot)
} = {}) {
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    label,
    repoRoot: projectRoot,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context
  };
  const line = JSON.stringify(record);
  appendLogLine(machineLogPath, line);
  if (perRepo) appendLogLine(logPath, line);
  return record;
}

export {
  logError
};
