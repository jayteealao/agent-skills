import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/error-log.mjs
import { mkdir, appendFile, stat, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
var MAX_LOG_BYTES = 1024 * 1024;
function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, ".ai", "_view", ".hook-errors.log");
}
async function rotateIfLarge(logPath) {
  try {
    if ((await stat(logPath)).size > MAX_LOG_BYTES) {
      await rename(logPath, `${logPath}.1`);
    }
  } catch {
  }
}
async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot)
} = {}) {
  await mkdir(dirname(logPath), { recursive: true });
  await rotateIfLarge(logPath);
  const record = {
    at: (/* @__PURE__ */ new Date()).toISOString(),
    label,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context
  };
  try {
    await appendFile(logPath, `${JSON.stringify(record)}
`, "utf-8");
  } catch (e) {
    try {
      process.stderr.write(`[error-log] could not write ${logPath}: ${e.message}
`);
    } catch {
    }
  }
}

export {
  logError
};
