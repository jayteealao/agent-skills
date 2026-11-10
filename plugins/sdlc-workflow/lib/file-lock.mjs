// A lock file for one read-modify-write: only the process that holds the lock reads, changes and
// writes the file that the lock guards.
//
// The lock file holds `{ pid, host, at, id }` and whatever the caller adds. It is made with the
// `wx` flag, so only one process can make it. The holder can refresh `at` during a long hold.
//
// A lock is stale when:
//   - its process is gone (same host, or a lock with no host: every lock lives on this machine),
//   - it names another host and its stamp is older than `staleMs`, or
//   - it does not parse (a torn write) and is older than `tornMs`.
// A lock whose process still runs on this host is never stale by its age, unless the caller sets
// `liveStaleMs` (a hold that can never last that long, so the pid must have been reused).
//
// A takeover is serial. A waiter's view of a lock can be old: the holder may have dropped that
// lock and ended, so its pid is dead although its lock is gone, and another waiter may have made
// a new lock in the meantime. So a waiter that judges a lock stale does not remove it at once.
// It first takes the takeover mutex `<lock>.takeover`, made with the `wx` flag, and only the
// mutex holder moves or removes the lock file. A waiter that does not get the mutex tries the
// lock again a moment later. Inside the mutex the holder judges again from scratch: it reads the
// lock text and its time through one open file, decides whether that text is stale (here the pid
// check runs), and then reads the path once more. Only when the path still holds the same text
// does it remove the lock; when the lock is gone or differs, it removes nothing. A lock whose pid
// was seen dead and whose text is still there afterwards is stable: its dead holder can no longer
// remove it, no other takeover can (the mutex), and no new lock can be made while it is there.
//
// The mutex holds `{ pid, host, at, id }` and is given up in a `finally`. A mutex left by a
// process that crashed is abandoned when its pid is dead on this host and the same text is still
// there on a second read, or when it is older than `TAKEOVER_STALE_MS` (a takeover lasts
// microseconds). A waiter removes an abandoned mutex and tries again.
//
// Gaps that stay open:
//   - A lock that is stale only by its age (another host's lock older than `staleMs`, a torn lock,
//     or `liveStaleMs`) may belong to a holder that still runs. That holder can drop the lock
//     between the second read and the remove, and a new lock made in that moment is removed.
//   - Two waiters that find the same abandoned mutex at once can both remove it, and the second
//     can remove a fresh mutex the first just made; two takeovers then run together. It needs a
//     process that crashed inside a takeover, or a takeover paused longer than the mutex age limit.
import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { writeFileAtomic } from './atomic-write.mjs';
import { pidAlive } from './proc.mjs';

export const LOCK_WAIT_MS = 30_000;
export const LOCK_STALE_MS = 10 * 60_000;
export const LOCK_TORN_MS = 5_000;
export const TAKEOVER_STALE_MS = 10_000;
// EPERM and EBUSY: on Windows a lock file that is being removed cannot be made for a moment.
const BUSY_CODES = new Set(['EEXIST', 'EPERM', 'EBUSY']);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const nowIso = () => new Date().toISOString();

// The id of each lock that this process holds now, by path.
const held = new Map();

/** The holder that the lock file `path` names, or null when there is none or it does not parse. */
export function lockHolder(path) {
  try {
    const h = JSON.parse(readFileSync(path, 'utf8'));
    return h && typeof h === 'object' ? h : null;
  } catch { return null; }
}

/**
 * True when the lock text `text`, last written at `mtimeMs`, is stale (see the header).
 * Exported for the tests.
 */
export function isStaleLock(text, mtimeMs, { now = Date.now(), staleMs = LOCK_STALE_MS, tornMs = LOCK_TORN_MS, liveStaleMs = Infinity, alive = pidAlive, host = hostname() } = {}) {
  let h = null;
  try { h = JSON.parse(text); } catch { /* torn */ }
  if (!h || typeof h !== 'object') return now - mtimeMs > tornMs;
  const pid = Number(h.pid);
  const hasPid = Number.isInteger(pid) && pid > 0;
  // The stamp that the lock names counts; a lock with no stamp is judged by the time of its file.
  const stamp = Number.isFinite(Date.parse(h.at)) ? Date.parse(h.at) : mtimeMs;
  if (hasPid && (h.host == null || h.host === host)) return !alive(pid) || now - stamp > liveStaleMs;
  return now - stamp > staleMs;
}

// The text of `path` and its time, from one open file: a stat of the path after the read could
// fail, or find a newer file, and an empty lock with no time would look torn and old. Null when
// the file is gone or being removed.
function readWithTime(path) {
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const mtimeMs = fstatSync(fd).mtimeMs;
    return { text: readFileSync(fd, 'utf8'), mtimeMs };
  } catch { return null; } finally { if (fd !== null) try { closeSync(fd); } catch { /* closed */ } }
}
const readText = (path) => { try { return readFileSync(path, 'utf8'); } catch { return null; } };

/** The takeover mutex of the lock file `path`. */
export const takeoverPathOf = (path) => `${path}.takeover`;

// Remove the takeover mutex `mutex` when it is abandoned (see the header).
function clearAbandonedMutex(mutex, { alive, host, mutexStaleMs }) {
  const seen = readWithTime(mutex);
  if (!seen) return;
  const h = parseOr(seen.text);
  const pid = Number(h?.pid);
  const deadHere = Boolean(h) && Number.isInteger(pid) && pid > 0 && (h.host == null || h.host === host) && !alive(pid);
  if (!deadHere && Date.now() - seen.mtimeMs <= mutexStaleMs) return;
  if (readText(mutex) === seen.text) rmSync(mutex, { force: true });
}

/**
 * Take over the lock file `path` when it is stale: under the takeover mutex, judge the lock again
 * and remove it only when the same stale text is still there (see the header). The options are
 * those of `isStaleLock`, plus `mutexStaleMs`. Returns true when it removed the lock; false when
 * the lock is gone, not stale, changed, or the mutex is busy. Exported for the tests.
 */
export function takeOver(path, { staleMs = LOCK_STALE_MS, tornMs = LOCK_TORN_MS, liveStaleMs = Infinity, alive = pidAlive, host = hostname(), mutexStaleMs = TAKEOVER_STALE_MS } = {}) {
  const mutex = takeoverPathOf(path);
  const mark = JSON.stringify({ pid: process.pid, host, at: nowIso(), id: randomBytes(6).toString('hex') });
  try { writeFileSync(mutex, mark, { flag: 'wx' }); } catch (e) {
    if (BUSY_CODES.has(e.code)) clearAbandonedMutex(mutex, { alive, host, mutexStaleMs });
    return false;
  }
  try {
    const seen = readWithTime(path);
    if (!seen || !isStaleLock(seen.text, seen.mtimeMs, { staleMs, tornMs, liveStaleMs, alive, host })) return false;
    if (readText(path) !== seen.text) return false;
    rmSync(path, { force: true });
    return true;
  } finally {
    if (readText(mutex) === mark) rmSync(mutex, { force: true });
  }
}

/**
 * Take the lock file `path`. Waits up to `waitMs` (0: one try) and takes over a stale lock.
 * `info` adds fields to the lock (for example a holder name for the busy message). Returns true
 * when this process holds the lock.
 */
export function takeLock(path, { waitMs = LOCK_WAIT_MS, staleMs = LOCK_STALE_MS, tornMs = LOCK_TORN_MS, liveStaleMs = Infinity, info = {}, alive = pidAlive, pollMs = 25, now = nowIso } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const host = hostname();
  const until = Date.now() + waitMs;
  // A takeover gets a few more tries after the wait, so a stale lock found on the last try (or
  // with no wait) is still taken over.
  let lateTries = 0;
  for (;;) {
    const id = randomBytes(6).toString('hex');
    try {
      writeFileSync(path, JSON.stringify({ ...info, pid: process.pid, host, at: now(), id }), { flag: 'wx' });
      held.set(path, id);
      return true;
    } catch (e) { if (!BUSY_CODES.has(e.code)) return false; }
    // Null: the lock is gone, or being removed: try again.
    const seen = readWithTime(path);
    const text = seen?.text ?? null;
    const late = Date.now() >= until;
    if (late && ++lateTries > 3) return false;
    if (seen && isStaleLock(seen.text, seen.mtimeMs, { staleMs, tornMs, liveStaleMs, alive, host })) {
      // Only the holder of the takeover mutex removes the lock; any other waiter tries again.
      if (!takeOver(path, { staleMs, tornMs, liveStaleMs, alive, host })) sleep(1);
      continue;
    }
    if (late && text !== null) return false;
    sleep(text === null ? 1 : pollMs);
  }
}

function parseOr(text) { try { return JSON.parse(text); } catch { return null; } }
const mine = (h) => Boolean(h) && Number(h.pid) === process.pid && (h.host == null || h.host === hostname());

/** Write a new stamp into the lock `path` when this process holds it. Returns true when it did. */
export function refreshLock(path) {
  const h = lockHolder(path);
  if (!mine(h)) return false;
  try { writeFileAtomic(path, JSON.stringify({ ...h, at: nowIso() }), { mkdir: false }); return true; } catch { return false; }
}

/** Give up the lock file `path` when this process holds it. */
export function dropLock(path) {
  const id = held.get(path);
  held.delete(path);
  const h = lockHolder(path);
  if (mine(h) && (!id || !h.id || h.id === id)) rmSync(path, { force: true });
}

/**
 * Run `fn` while this process holds the lock `path`. When the lock stays busy, throws the error
 * that `busy(holder)` returns, or a plain one. The lock is given up when `fn` ends or throws.
 */
export function withLock(path, fn, { busy = null, ...opts } = {}) {
  if (!takeLock(path, opts)) {
    const holder = lockHolder(path);
    throw busy ? busy(holder) : new Error(`the lock ${path} stayed busy`);
  }
  try { return fn(); } finally { dropLock(path); }
}

/** The lock file that guards the file `file`: `<file>.lock` beside it. */
export const lockPathOf = (file) => `${file}.lock`;

/**
 * Run `fn` while this process holds the lock of the file `file`, for one read-modify-write of
 * it. The wait is short: a read-modify-write of one file takes milliseconds.
 */
export function withFileLock(file, fn, { waitMs = 10_000, ...opts } = {}) {
  return withLock(lockPathOf(file), fn, {
    waitMs,
    busy: (h) => new Error(`${file} is being written by another process${h?.pid ? ` (process ${h.pid})` : ''}: try again`),
    ...opts,
  });
}
