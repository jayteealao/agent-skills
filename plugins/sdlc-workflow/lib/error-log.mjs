import { mkdir, appendFile, stat, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const MAX_LOG_BYTES = 1024 * 1024;   // 1 MB — rotate to .1 beyond this

export function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, '.ai', '_view', '.hook-errors.log');
}

async function rotateIfLarge(logPath) {
  try {
    if ((await stat(logPath)).size > MAX_LOG_BYTES) {
      await rename(logPath, `${logPath}.1`);   // single-generation rotation
    }
  } catch { /* no file yet, or rotation failed — fine */ }
}

export async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot),
} = {}) {
  await mkdir(dirname(logPath), { recursive: true });
  await rotateIfLarge(logPath);
  const record = {
    at: new Date().toISOString(),
    label,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context,
  };
  try {
    await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
  } catch (e) {
    // Don't let a logging failure vanish silently (e.g. EBUSY on Windows when a
    // log viewer holds the file open) — surface it to stderr as a last resort.
    try { process.stderr.write(`[error-log] could not write ${logPath}: ${e.message}\n`); } catch { /* ignore */ }
  }
}
