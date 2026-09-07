// lib/runtime-log.mjs — the runtime's logs, all under ~/.sdlc (WIDE-VIEW-REPAIR-PLAN
// §14.2.2, wave W11.2).
//
// Before this file the hub's stdout went to `stdio: 'ignore'` (lib/detach.mjs),
// so a hub restart left no trace anywhere. Four files now hold the record:
//
//   hub.log            every logHub() line from scripts/hub-serve.mjs
//   lifecycle.log      one JSON line per supervisor decision (lib/hub-lifecycle.mjs):
//                      adopt, reap, recover, start, unconfirmed, refused-host,
//                      protocol-incompatible, lock-timeout, port-held
//   errors.log         every hook error (lib/error-log.mjs), keyed by repoRoot
//   hub-history.jsonl  one record per hub bind; the health payload and the tray
//                      tooltip show the restart count and the last start reason
//
// Rotation is the same for every file: when a file passes 1 MB it becomes
// `<file>.1`, the previous `.1` becomes `.2`, and the previous `.2` is deleted.
// Writes are synchronous and never throw — a log that cannot be written is a
// stderr line, not a failed hook.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { sdlcHomeDir } from './registry.mjs';

export const MAX_LOG_BYTES = 1024 * 1024;   // 1 MB
export const KEEP_GENERATIONS = 2;           // <file>.1 and <file>.2

export const hubLogPath = (home = sdlcHomeDir()) => join(home, 'hub.log');
export const lifecycleLogPath = (home = sdlcHomeDir()) => join(home, 'lifecycle.log');
export const errorsLogPath = (home = sdlcHomeDir()) => join(home, 'errors.log');
export const hubHistoryPath = (home = sdlcHomeDir()) => join(home, 'hub-history.jsonl');

/* ───────────────────────── rotation + append ───────────────────────── */

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
    try { process.stderr.write(`[runtime-log] could not write ${path}: ${e?.message ?? e}\n`); } catch { /* ignore */ }
    return false;
  }
}

/** JSON lines → records; a malformed line is skipped, never fatal. */
export function parseJsonLines(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch { /* skip */ }
  }
  return out;
}

function readJsonLines(path) {
  try { return parseJsonLines(readFileSync(path, 'utf-8')); } catch { return []; }
}

/* ───────────────────────── hub.log ───────────────────────── */

/** Append `<iso> <line>` to hub.log; returns the written line. */
export function hubLogLine(line, { home, now = () => new Date() } = {}) {
  const written = `${now().toISOString()} ${line}`;
  appendLogLine(hubLogPath(home), written);
  return written;
}

/* ───────────────────────── lifecycle.log ───────────────────────── */

export const LIFECYCLE_EVENTS = Object.freeze([
  'adopt', 'reap', 'recover', 'start', 'unconfirmed',
  'refused-host', 'protocol-incompatible', 'lock-timeout', 'port-held',
  'port-migrated', 'gc', 'deprecated-config',
]);

/**
 * Pure: the lifecycle line. Fixed key order so the file greps by column:
 * {at, event, host, version, buildId, pid, reason, ...extras}. Unknown events
 * are written as given — the reader, not the writer, decides what matters.
 */
export function formatLifecycleLine(record, now = new Date()) {
  const { event, host = null, version = null, buildId = null, pid = null, reason = null, ...extra } = record ?? {};
  return JSON.stringify({
    at: now.toISOString(),
    event: String(event ?? 'unknown'),
    host,
    version,
    buildId,
    pid: Number.isInteger(pid) ? pid : null,
    reason: reason == null ? null : String(reason),
    ...extra,
  });
}

/** Write one lifecycle decision; returns the line. Never throws. */
export function logLifecycle(record, { home, now = new Date() } = {}) {
  const line = formatLifecycleLine(record, now);
  appendLogLine(lifecycleLogPath(home), line);
  return line;
}

export function readLifecycleLog(home) {
  return readJsonLines(lifecycleLogPath(home));
}

/* ───────────────────────── hub-history.jsonl ───────────────────────── */

/** Record one hub bind. `reason` is what the supervisor passed (fresh, reap: …, recover: …, upgrade). */
export function recordHubStart({ pid, version = null, buildId = null, startedBy = null, reason = 'unknown', port = null } = {}, { home, now = new Date() } = {}) {
  const record = { at: now.toISOString(), event: 'start', pid: Number.isInteger(pid) ? pid : null, version, buildId, startedBy, reason: String(reason), port };
  appendLogLine(hubHistoryPath(home), JSON.stringify(record));
  return record;
}

/**
 * Summary for the health payload and the tray: starts, restarts (starts − 1,
 * floored at 0), and the last start's reason, time, and pid.
 */
export function readHubHistory(home) {
  const records = readJsonLines(hubHistoryPath(home)).filter((r) => r && r.event === 'start');
  const last = records.at(-1) ?? null;
  return {
    starts: records.length,
    restarts: Math.max(0, records.length - 1),
    lastReason: last?.reason ?? null,
    lastAt: last?.at ?? null,
    lastPid: last?.pid ?? null,
  };
}
