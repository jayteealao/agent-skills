// lib/error-log.mjs — where a hook error goes (WIDE-VIEW-REPAIR-PLAN §14.2.2, W11.2).
//
// Every record lands in the machine-wide `~/.sdlc/errors.log`, keyed by
// `repoRoot`, so one file answers "what failed on this machine" for every
// repository and every host. The per-repo `.ai/_view/.hook-errors.log` is kept
// ONLY when the repository has `.ai/workflows` — a hook that fires in a
// repository with no workflows must not create `.ai/_view` (the W11.3 litter).
// Both files rotate at 1 MB, keeping two generations (lib/runtime-log.mjs).

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { appendLogLine, errorsLogPath } from './runtime-log.mjs';

export function hookErrorLogPath(projectRoot = process.cwd()) {
  return join(projectRoot, '.ai', '_view', '.hook-errors.log');
}

/** True when the repository runs workflows and so earns a per-repo error file. */
export function hasWorkflows(projectRoot = process.cwd()) {
  try { return existsSync(join(projectRoot, '.ai', 'workflows')); } catch { return false; }
}

export async function logError(label, err, {
  projectRoot = process.cwd(),
  context = {},
  logPath = hookErrorLogPath(projectRoot),
  machineLogPath = errorsLogPath(),
  perRepo = hasWorkflows(projectRoot),
} = {}) {
  const record = {
    at: new Date().toISOString(),
    label,
    repoRoot: projectRoot,
    message: err?.message ?? String(err),
    stack: err?.stack ?? null,
    context,
  };
  const line = JSON.stringify(record);
  appendLogLine(machineLogPath, line);
  if (perRepo) appendLogLine(logPath, line);
  return record;
}
