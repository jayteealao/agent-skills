// lib/cross-host-lock.mjs
//
// The cross-host startup/recovery lock — NATIVE-INTEROP-REWRITE-PLAN
// "Cross-Host Startup Coordination" / Workstream C (the gating Windows-first
// spike). Two DISTINCT host processes (Claude and Codex), each with its own
// plugin cache, can race to materialize / start / recover / upgrade ONE
// machine-wide singleton hub. The existing single-plugin lifecycle never faced
// this. This module is the one shared coordination primitive both host adapters
// MUST funnel through; no host-specific adapter implements its own lock.
//
// Primitive (proven on this Windows-primary repo, see the probes in the
// NATIVE-INTEROP work):
//   • `open(path, 'wx')` is the atomic create-exclusive serializer — it succeeds
//     for exactly one racer and throws EEXIST for the rest, across distinct OS
//     processes. This is the closest portable equivalent to O_EXCL and is THE
//     tested primitive.
//   • `rename(tmp, target)` over an EXISTING target REPLACES it on modern Node
//     here (libuv MoveFileExW + MOVEFILE_REPLACE_EXISTING). The plan feared this
//     throws on Windows; it does not in this runtime (the existing writePidFile
//     has relied on it in production). atomicWriteJson uses write-temp + rename
//     for the active-runtime / PID publication.
//
// Lock record (owner identity + heartbeat + expiry + fencing token):
//   { pid, host, hostname, token, acquiredAt, renewedAt, expiry, ttlMs }
//
// Staleness (a holder that died mid-critical-section must be recoverable):
//   stale ⇔ holder pid is not alive  OR  now > expiry (heartbeat lapsed).
// Both are backstops against the other: a recycled PID that looks alive is still
// reaped once expiry passes; a long-lived but wedged holder that stopped
// renewing is reaped at expiry even though its pid lives. A corrupt/half-written
// lock is reaped only after a grace window so an in-flight winner's sub-ms
// create→write gap is never stolen.
//
// Fencing: takeover rewrites the token. A displaced holder's renew()/release()
// no-op because the on-disk token no longer matches theirs — so a slow holder
// that finishes after being displaced can never delete the new owner's lock.

import { randomBytes } from 'node:crypto';
import { hostname as osHostname } from 'node:os';
import { open, readFile, rename, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { isPidAlive } from './pid-file.mjs';

export const DEFAULT_LOCK_TTL_MS = 30000;     // heartbeat horizon; renew() before this elapses
export const DEFAULT_ACQUIRE_TIMEOUT_MS = 15000;
export const DEFAULT_RETRY_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Atomic JSON publication: write a sibling temp then rename over the target.
 * The Windows-safe replace pattern (verified working in this runtime). Shared by
 * the lock record and, later, the active-runtime / PID publication so every
 * machine-wide record is published the same proven way.
 */
export async function atomicWriteJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf-8');
  await rename(tmp, path);
}

/** Read + parse a lock record. Returns null when absent, empty, or unparseable. */
export async function readLock(lockPath) {
  try {
    const text = (await readFile(lockPath, 'utf-8')).trim();
    if (!text) return null;
    const rec = JSON.parse(text);
    return rec && typeof rec === 'object' ? rec : null;
  } catch {
    return null;
  }
}

/**
 * Is a lock record stale (its critical section abandoned)? Dead holder OR lapsed
 * heartbeat. A null record is "indeterminate" here — callers gate takeover of a
 * null record on the file's age (the create→write window), not on this alone.
 */
export function isLockStale(record, now = Date.now()) {
  if (!record || !Number.isInteger(record.pid)) return true;
  if (!isPidAlive(record.pid)) return true;
  if (Number.isFinite(record.expiry) && now > record.expiry) return true;
  return false;
}

function makeRecord({ ownerHost, hostname, ttlMs, now }) {
  return {
    pid: process.pid,
    host: ownerHost,
    hostname,
    token: randomBytes(16).toString('hex'),
    acquiredAt: now,
    renewedAt: now,
    expiry: now + ttlMs,
    ttlMs,
  };
}

function makeHandle(lockPath, record, ttlMs, nowFn) {
  return {
    ok: true,
    token: record.token,
    record,
    /**
     * Heartbeat: extend the expiry, but ONLY if we still own the lock (fencing).
     * Returns false if we've been displaced — a well-behaved holder treats false
     * as "I lost the critical section" and aborts its mutation.
     */
    async renew() {
      const cur = await readLock(lockPath);
      if (!cur || cur.token !== record.token) return false;
      const now = nowFn();
      const next = { ...cur, renewedAt: now, expiry: now + ttlMs };
      await atomicWriteJson(lockPath, next);
      record.renewedAt = next.renewedAt;
      record.expiry = next.expiry;
      return true;
    },
    /** Release: delete the lock ONLY if we still own it (fencing). */
    async release() {
      const cur = await readLock(lockPath);
      if (cur && cur.token !== record.token) return false;   // displaced — not ours to delete
      await rm(lockPath, { force: true });
      return true;
    },
  };
}

/**
 * Single, non-blocking acquire attempt. Pure `wx` create — NO takeover. This is
 * the primitive the cross-process race test exercises directly: N processes each
 * call this once and exactly one gets `ok:true`. Returns a handle on success, or
 * `{ ok:false, heldBy }` (the current record, possibly null) on EEXIST.
 */
export async function tryAcquireLock(lockPath, {
  ownerHost = 'unknown',
  ttlMs = DEFAULT_LOCK_TTL_MS,
  hostname = osHostname(),
  now = () => Date.now(),
} = {}) {
  await mkdir(dirname(lockPath), { recursive: true });
  let fh;
  try {
    fh = await open(lockPath, 'wx');   // atomic create-exclusive
  } catch (err) {
    if (err?.code === 'EEXIST') return { ok: false, heldBy: await readLock(lockPath) };
    throw err;
  }
  try {
    const record = makeRecord({ ownerHost, hostname, ttlMs, now: now() });
    await fh.writeFile(`${JSON.stringify(record, null, 2)}\n`, 'utf-8');
    await fh.close();
    fh = null;
    return makeHandle(lockPath, record, ttlMs, now);
  } finally {
    if (fh) { try { await fh.close(); } catch { /* ignore */ } }
  }
}

/**
 * Blocking acquire with stale-takeover, bounded by timeoutMs. The lifecycle's
 * entry point into the critical section. Loops the `wx` primitive; on EEXIST it
 * either waits (live holder) or takes over (stale holder). Takeover removes the
 * abandoned lock and re-races `wx`; the removal is SERIALIZED through a sibling
 * marker (see takeOverStaleLock) so the "still stale? then remove it" decision is
 * atomic — a contender can never delete a fresh winner's lock and re-open the
 * race. With the path then free, `wx` is the serializer and exactly one contender
 * wins (the same guarantee proven for a free-lock race).
 *
 * @returns {Promise<object>} a handle (`ok:true`) or `{ ok:false, heldBy }` on timeout.
 */
export async function acquireLock(lockPath, {
  ownerHost = 'unknown',
  ttlMs = DEFAULT_LOCK_TTL_MS,
  timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
  retryMs = DEFAULT_RETRY_MS,
  hostname = osHostname(),
  now = () => Date.now(),
  log = () => {},
} = {}) {
  const deadline = now() + timeoutMs;
  // Grace before a NULL/corrupt record is taken over — covers the winner's
  // sub-ms create→write gap so an in-flight winner is never stolen.
  const nullGraceMs = Math.max(2 * retryMs, 1000);

  for (;;) {
    const got = await tryAcquireLock(lockPath, { ownerHost, ttlMs, hostname, now });
    if (got.ok) return got;

    const held = got.heldBy;
    const takeable = held
      ? isLockStale(held, now())
      : await nullLockTakeable(lockPath, nullGraceMs, now);

    if (takeable) {
      // Take over: remove the abandoned lock (serialized + re-validated), then
      // immediately re-race `wx`. We do NOT sleep here on success — racing the wx
      // now (rather than after a backoff) keeps takeover latency low.
      log(`[lock] taking over stale lock at ${lockPath} (held by pid ${held?.pid ?? '?'}/${held?.host ?? '?'})`);
      await takeOverStaleLock(lockPath, { nullGraceMs, retryMs, now });
      continue;
    }

    if (now() >= deadline) {
      return { ok: false, heldBy: held };
    }
    await sleep(retryMs);
  }
}

// A null/corrupt lock is takeable only once the FILE has existed longer than the
// grace — so a winner mid-write (file exists, record not yet flushed) is left
// alone, while a genuinely corrupt/abandoned file is reclaimed.
async function nullLockTakeable(lockPath, graceMs, now) {
  try {
    const st = await stat(lockPath);
    return (now() - st.mtimeMs) > graceMs;
  } catch {
    // Vanished between the failed wx and here → the next wx will simply succeed.
    return false;
  }
}

/**
 * Serialize the DESTRUCTIVE half of takeover through a sibling marker so the
 * "still stale? then remove it" check-and-remove is atomic across contenders.
 *
 * Why this exists: removing the lock is decided from a read of `heldBy`, but
 * applied to whatever is at the path WHEN the rm runs. Between those, another
 * contender can complete a full takeover and install a fresh, VALID lock — a
 * blind rm would then delete it, re-opening the `wx` race and producing TWO
 * winners. Holding the marker, exactly one contender at a time RE-READS the lock
 * and removes it ONLY if it is still stale; a freshly installed valid lock is
 * read as live and spared. Once the path is free, the `wx` create in the caller's
 * next loop is the serializer, so exactly one contender wins.
 *
 * The marker holder does no blocking work, so it is released within sub-ms; a
 * marker orphaned by a taker that died mid-section is reclaimed once it ages past
 * a grace far larger than that section (so a live taker is never mistaken for a
 * dead one). When the marker is contended we simply back off and let the outer
 * loop re-race `wx`.
 */
async function takeOverStaleLock(lockPath, { nullGraceMs, retryMs, now }) {
  const markerPath = `${lockPath}.takeover`;
  const markerGraceMs = Math.max(5000, 20 * retryMs);

  let fh;
  try {
    fh = await open(markerPath, 'wx');   // exactly one taker proceeds
  } catch (err) {
    if (err?.code !== 'EEXIST') throw err;
    // Another contender is mid-takeover. Reclaim an orphaned marker (its holder
    // died); otherwise back off and let the caller re-race the `wx` primitive.
    if (await nullLockTakeable(markerPath, markerGraceMs, now)) {
      try { await rm(markerPath, { force: true }); } catch { /* raced; fine */ }
    }
    await sleep(retryMs);
    return;
  }
  try {
    await fh.close();
    fh = null;
    // RE-READ under the marker: a prior taker may already have installed a fresh,
    // valid lock. Remove the lock ONLY if it is still stale (or a genuinely
    // abandoned null/corrupt file past its grace).
    const cur = await readLock(lockPath);
    const stillStale = cur
      ? isLockStale(cur, now())
      : await nullLockTakeable(lockPath, nullGraceMs, now);
    if (stillStale) {
      try { await rm(lockPath, { force: true }); } catch { /* best-effort; wx still gates */ }
    }
  } finally {
    if (fh) { try { await fh.close(); } catch { /* ignore */ } }
    try { await rm(markerPath, { force: true }); } catch { /* ignore */ }
  }
}

/**
 * Run `fn` inside the critical section. Acquires (with takeover, bounded by
 * timeoutMs), runs `fn(handle)`, and ALWAYS releases — even if `fn` throws. The
 * canonical way the lifecycle wraps materialize / start / recover / upgrade so
 * those operations are mutually exclusive across hosts.
 *
 * @throws {LockTimeoutError} when the lock can't be acquired within timeoutMs.
 */
export async function withLock(lockPath, opts, fn) {
  const handle = await acquireLock(lockPath, opts);
  if (!handle.ok) {
    throw new LockTimeoutError(lockPath, handle.heldBy);
  }
  try {
    return await fn(handle);
  } finally {
    try { await handle.release(); } catch { /* release is best-effort + fenced */ }
  }
}

export class LockTimeoutError extends Error {
  constructor(lockPath, heldBy) {
    super(`timed out acquiring cross-host lock ${lockPath} (held by pid ${heldBy?.pid ?? '?'}/${heldBy?.host ?? '?'})`);
    this.name = 'LockTimeoutError';
    this.lockPath = lockPath;
    this.heldBy = heldBy ?? null;
  }
}
