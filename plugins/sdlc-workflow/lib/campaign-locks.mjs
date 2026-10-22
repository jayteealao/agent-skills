/**
 * lib/campaign-locks.mjs — the heavy-suite lock and the quiet lease of a campaign
 * (WF-CAMPAIGN-HEAVY-LOCK-REVIEW-2026-10-22). Both live in the main checkout's
 * `.scratch/campaign/`: `<kind>.lock` is the hold, `<kind>.queue.json` the waiting tickets.
 *
 * A hold has one of three forms:
 * - run:    `{ holder, agent, pid, command, at }`, written by `heavy-run`. It lasts while
 *           its process lives: a dead pid frees it at once (F2).
 * - lease:  `{ holder, agent?, at, until }`, written by `lock acquire`. It ends at `until`,
 *           30 minutes after the acquire (LQ1).
 * - legacy: `{ holder, at }`, written by a plugin before this file. It is stale after
 *           3 hours, and idle after 30 minutes.
 * Every read and write of a lock or a queue happens under one mutex, so the grant,
 * the queue order and the release never interleave (F3).
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { pidAlive, withRecordsLock } from './campaign-records.mjs';

export const LOCK_KINDS = Object.freeze(['heavy', 'quiet']);
export const LOCK_STALE_MS = 3 * 60 * 60 * 1000;
export const LEASE_MS = 30 * 60 * 1000;
export const IDLE_HOLD_MS = 30 * 60 * 1000;

const lockDir = (root) => join(root, '.scratch', 'campaign');
export const lockFileOf = (root, kind) => join(lockDir(root), `${kind}.lock`);
export const queueFileOf = (root, kind) => join(lockDir(root), `${kind}.queue.json`);
const mutexFileOf = (root) => join(lockDir(root), 'locks.mutex');

/** The other lock: a heavy suite and a quiet suite never run at the same time (C4). */
export const otherKind = (kind) => (kind === 'quiet' ? 'heavy' : 'quiet');

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Run `fn` while holding the mutex of the campaign's locks. */
export function withLocksMutex(root, label, fn) {
  mkdirSync(lockDir(root), { recursive: true });
  return withRecordsLock(mutexFileOf(root), label, fn, { waitMs: 60_000, staleMs: 60_000, liveStaleMs: 5 * 60_000 });
}

/**
 * The state of one hold record, or null. `live` says whether it still keeps others
 * out; `idle` says whether nothing uses it (a dead process, an ended lease, or a
 * legacy hold older than 30 minutes).
 */
export function holdOf(rec, { now = Date.now(), alive = pidAlive } = {}) {
  if (!rec || typeof rec !== 'object' || !rec.holder) return null;
  const at = Date.parse(rec.at);
  const heldMs = Number.isFinite(at) ? Math.max(0, now - at) : Infinity;
  const base = { holder: rec.holder, agent: rec.agent ?? null, at: rec.at ?? null, heldMinutes: Number.isFinite(heldMs) ? Math.round(heldMs / 60000) : null };
  if (Number.isInteger(rec.pid)) {
    const running = alive(rec.pid);
    return { ...base, kind: 'run', pid: rec.pid, command: rec.command ?? null, live: running && heldMs < LOCK_STALE_MS, idle: !running };
  }
  const until = Date.parse(rec.until);
  if (Number.isFinite(until)) return { ...base, kind: 'lease', until: rec.until, live: now < until, idle: now >= until };
  return { ...base, kind: 'legacy', live: heldMs < LOCK_STALE_MS, idle: heldMs >= IDLE_HOLD_MS };
}

export const readHold = (root, kind) => readJson(lockFileOf(root, kind));

export function writeHold(root, kind, rec) {
  mkdirSync(lockDir(root), { recursive: true });
  writeFileSync(lockFileOf(root, kind), JSON.stringify(rec));
}

export const removeHold = (root, kind) => rmSync(lockFileOf(root, kind), { force: true });

/** The waiting tickets of a lock, oldest first, without the tickets whose process is gone. */
export function readQueue(root, kind, { alive = pidAlive } = {}) {
  const q = readJson(queueFileOf(root, kind));
  const tickets = Array.isArray(q?.tickets) ? q.tickets : [];
  return tickets.filter((t) => t && Number.isInteger(t.pid) && alive(t.pid));
}

export function writeQueue(root, kind, tickets) {
  mkdirSync(lockDir(root), { recursive: true });
  writeFileSync(queueFileOf(root, kind), JSON.stringify({ tickets }));
}

/**
 * The locks as a person or a look-in reads them: each hold with its state, each
 * waiting ticket with its wait, and the kinds whose hold is idle.
 */
export function lockState(root, { now = Date.now(), alive = pidAlive } = {}) {
  const out = { idle: [] };
  for (const kind of LOCK_KINDS) {
    const hold = holdOf(readHold(root, kind), { now, alive });
    const waiting = readQueue(root, kind, { alive }).map((t) => ({
      holder: t.holder, agent: t.agent ?? null, command: t.command ?? null,
      waitedMinutes: Number.isFinite(Date.parse(t.at)) ? Math.round((now - Date.parse(t.at)) / 60000) : null,
    }));
    out[kind] = { hold, waiting };
    if (hold?.idle) out.idle.push(kind);
  }
  return out;
}

/** True when `command` runs one of the listed suites: the suite's words before any "(" (F5). */
export function suiteListed(command, suites = []) {
  const c = String(command).toLowerCase();
  return suites.some((s) => {
    const base = String(s).replace(/\(.*$/, '').trim().toLowerCase();
    return base.length > 0 && c.includes(base);
  });
}
