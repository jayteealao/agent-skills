import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, '.ai', '_view', '.hook-errors.log');
}

export async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot),
} = {}) {
  await mkdir(dirname(logPath), { recursive: true });
  const record = {
    at: new Date().toISOString(),
    label,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context,
  };
  await appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
}
