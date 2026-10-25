// lib/home.mjs — the machine-wide state folder (~/.sdlc), its settings file
// and its two logs.
//
//   config.json     machine-wide settings (the external-dispatch consent, the records repo)
//   errors.log      every hook error (lib/error-log.mjs), keyed by repoRoot
//   lifecycle.log   one JSON line per machine-level event (a deprecated setting,
//                   the one-time cleanup)
//
// Rotation is the same for both files: when a file passes 1 MB it becomes
// `<file>.1`, the previous `.1` becomes `.2`, and the previous `.2` is deleted.
// Writes are synchronous and never throw — a log that cannot be written is a
// stderr line, not a failed hook.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * The state folder. SDLC_HOME relocates it (a state-location override, like
 * GIT_DIR or XDG_*): it keeps tests hermetic.
 */
export function sdlcHomeDir() {
  const override = process.env.SDLC_HOME;
  return override && override.trim() ? override : join(homedir(), '.sdlc');
}

export const MAX_LOG_BYTES = 1024 * 1024;   // 1 MB
export const KEEP_GENERATIONS = 2;           // <file>.1 and <file>.2

/**
 * The machine-wide settings file. It holds `externalDispatch.enabled`, the one
 * consent gate of the imagery and uiproto skills (their scripts read the file
 * themselves).
 */
export const machineConfigPath = (home = sdlcHomeDir()) => join(home, 'config.json');
/** The machine-wide settings, or {} when the file is missing or not JSON. */
export function readMachineConfig(home = sdlcHomeDir()) {
  try {
    const c = JSON.parse(readFileSync(machineConfigPath(home), 'utf-8'));
    return c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  } catch { return {}; }
}
export const lifecycleLogPath = (home = sdlcHomeDir()) => join(home, 'lifecycle.log');
export const errorsLogPath = (home = sdlcHomeDir()) => join(home, 'errors.log');

/**
 * Rotate `path` when it is larger than `maxBytes`: `.keep` is deleted, every
 * `.n` moves to `.n+1`, and the live file becomes `.1`. Returns true when a
 * rotation happened. Never throws.
 */
export function rotateIfLarge(path, { maxBytes = MAX_LOG_BYTES, keep = KEEP_GENERATIONS } = {}) {
  let size;
  try { size = statSync(path).size; } catch { return false; }
  if (size <= maxBytes) return false;
  try { rmSync(`${path}.${keep}`, { force: true }); } catch { /* absent */ }
  for (let i = keep - 1; i >= 1; i--) {
    try { if (existsSync(`${path}.${i}`)) renameSync(`${path}.${i}`, `${path}.${i + 1}`); } catch { /* a viewer holds it; skip */ }
  }
  try { renameSync(path, `${path}.1`); } catch { return false; }
  return true;
}

/** Append one line (newline added when missing), rotating first. Never throws. */
export function appendLogLine(path, line, opts = {}) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    rotateIfLarge(path, opts);
    appendFileSync(path, line.endsWith('\n') ? line : `${line}\n`, 'utf-8');
    return true;
  } catch (e) {
    try { process.stderr.write(`[home] could not write ${path}: ${e?.message ?? e}\n`); } catch { /* ignore */ }
    return false;
  }
}

/**
 * Pure: the lifecycle line. Fixed key order so the file greps by column:
 * {at, event, host, reason, ...extras}.
 */
export function formatLifecycleLine(record, now = new Date()) {
  const { event, host = null, reason = null, ...extra } = record ?? {};
  return JSON.stringify({
    at: now.toISOString(),
    event: String(event ?? 'unknown'),
    host,
    reason: reason == null ? null : String(reason),
    ...extra,
  });
}

/** Write one lifecycle event; returns the line. Never throws. */
export function logLifecycle(record, { home, now = new Date() } = {}) {
  const line = formatLifecycleLine(record, now);
  appendLogLine(lifecycleLogPath(home), line);
  return line;
}
