// tests/unit/lib/cross-host-lock.test.mjs
//
// The cross-host startup/recovery lock — NATIVE-INTEROP Workstream C gating spike.
// The exit gate (plan): "a test harness that launches simultaneous Claude and
// Codex activation (and a startup-vs-upgrade race) ... and proves exactly one
// hub process, one valid PID record, and one active runtime." Here that reduces
// to the lock's core guarantee: under N TRUE concurrent OS processes contending,
// exactly one holds the critical section. Plus in-process coverage of staleness,
// takeover, fencing, and the withLock wrapper.

import { test } from 'node:test';
import { equal, ok, deepEqual } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  tryAcquireLock, acquireLock, withLock, readLock, isLockStale, atomicWriteJson,
  LockTimeoutError,
} from '../../../lib/cross-host-lock.mjs';

// LIB is handed to the worker's `await import(LIB)` — pass a file:// URL href, not
// a bare path: on Windows `import('C:\\...')` fails (drive letter parsed as a URL
// scheme). WORKER is a filesystem path because child_process.spawn wants a path.
const LIB = new URL('../../../lib/cross-host-lock.mjs', import.meta.url).href;
const WORKER = fileURLToPath(new URL('../../helpers/lock-race-worker.mjs', import.meta.url));

function tmp() {
  return mkdtempSync(join(tmpdir(), 'sdlc-lock-'));
}

/* ───────────────────────── single-shot acquire ───────────────────────── */

test('lock: tryAcquireLock takes a free lock and records owner identity', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const h = await tryAcquireLock(lock, { ownerHost: 'claude', ttlMs: 5000 });
    ok(h.ok, 'acquired a free lock');
    ok(typeof h.token === 'string' && h.token.length >= 16, 'minted a random token');
    const rec = await readLock(lock);
    equal(rec.host, 'claude');
    equal(rec.pid, process.pid);
    equal(rec.token, h.token);
    ok(rec.expiry > rec.acquiredAt, 'expiry is in the future');
    await h.release();
    equal(existsSync(lock), false, 'release removes the lock file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: a second tryAcquireLock against a live lock fails with heldBy', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const a = await tryAcquireLock(lock, { ownerHost: 'claude' });
    ok(a.ok);
    const b = await tryAcquireLock(lock, { ownerHost: 'codex' });
    equal(b.ok, false, 'live lock not double-acquired');
    equal(b.heldBy.host, 'claude', 'heldBy identifies the current owner');
    await a.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ───────────────────────── staleness ───────────────────────── */

test('lock: isLockStale — dead pid OR expired OR null is stale; live+valid is not', () => {
  const now = 1000;
  equal(isLockStale(null, now), true, 'null record → stale');
  equal(isLockStale({ host: 'x' }, now), true, 'no pid → stale');
  equal(isLockStale({ pid: 999999999, expiry: 9999 }, now), true, 'dead pid → stale');
  equal(isLockStale({ pid: process.pid, expiry: 500 }, now), true, 'live pid but expired → stale');
  equal(isLockStale({ pid: process.pid, expiry: 9999 }, now), false, 'live pid + future expiry → fresh');
});

test('lock: acquireLock takes over a stale (dead-pid) lock', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    // Seed a stale lock: dead pid + already expired.
    await atomicWriteJson(lock, { pid: 999999999, host: 'codex', token: 'old', acquiredAt: 0, renewedAt: 0, expiry: 0, ttlMs: 0 });
    const h = await acquireLock(lock, { ownerHost: 'claude', timeoutMs: 2000, retryMs: 25 });
    ok(h.ok, 'took over the stale lock');
    const rec = await readLock(lock);
    equal(rec.host, 'claude', 'new owner is us');
    ok(rec.token !== 'old', 'takeover minted a fresh fencing token');
    await h.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: acquireLock times out against a live holder (does NOT steal it)', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const held = await tryAcquireLock(lock, { ownerHost: 'codex', ttlMs: 60000 });
    ok(held.ok);
    const t0 = Date.now();
    const r = await acquireLock(lock, { ownerHost: 'claude', timeoutMs: 300, retryMs: 25 });
    equal(r.ok, false, 'a live lock is never stolen');
    equal(r.heldBy.host, 'codex');
    ok(Date.now() - t0 >= 250, 'waited out the timeout rather than racing through');
    await held.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ───────────────────────── fencing ───────────────────────── */

test('lock: a displaced holder is fenced — renew() fails and release() spares the new owner', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    // A holds the lock, then we forcibly publish a NEW owner B over it (simulating
    // a takeover after A was deemed stale).
    const a = await tryAcquireLock(lock, { ownerHost: 'claude' });
    ok(a.ok);
    await atomicWriteJson(lock, { pid: process.pid, host: 'codex', token: 'B-token', acquiredAt: 0, renewedAt: 0, expiry: Date.now() + 60000, ttlMs: 60000 });

    equal(await a.renew(), false, 'displaced holder cannot renew');
    equal(await a.release(), false, 'displaced holder release() is a no-op');
    const rec = await readLock(lock);
    equal(rec.token, 'B-token', "the new owner's lock survives the displaced holder's release");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: renew() extends expiry for the live owner', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const h = await tryAcquireLock(lock, { ownerHost: 'claude', ttlMs: 1000 });
    const before = (await readLock(lock)).expiry;
    await new Promise((r) => setTimeout(r, 20));
    equal(await h.renew(), true, 'owner renews successfully');
    const after = (await readLock(lock)).expiry;
    ok(after > before, 'expiry advanced');
    await h.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ───────────────────────── withLock wrapper ───────────────────────── */

test('lock: withLock runs the critical section then releases — even on throw', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    let ran = false;
    const out = await withLock(lock, { ownerHost: 'claude' }, async (h) => {
      ran = true;
      ok(h.ok);
      ok(existsSync(lock), 'lock held during the critical section');
      return 42;
    });
    equal(ran, true);
    equal(out, 42);
    equal(existsSync(lock), false, 'released after fn');

    // Throwing fn still releases.
    let threw = false;
    try {
      await withLock(lock, { ownerHost: 'claude' }, async () => { throw new Error('boom'); });
    } catch (e) { threw = e.message === 'boom'; }
    ok(threw, 'fn error propagates');
    equal(existsSync(lock), false, 'released even after fn threw');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock: withLock throws LockTimeoutError when a live holder blocks it', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const held = await tryAcquireLock(lock, { ownerHost: 'codex', ttlMs: 60000 });
    let err;
    try {
      await withLock(lock, { ownerHost: 'claude', timeoutMs: 200, retryMs: 25 }, async () => 'never');
    } catch (e) { err = e; }
    ok(err instanceof LockTimeoutError, 'a blocked critical section surfaces LockTimeoutError');
    equal(err.heldBy.host, 'codex');
    await held.release();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ───────────────────────── atomic publication ───────────────────────── */

test('lock: atomicWriteJson creates and replaces (the Windows-safe publish pattern)', async () => {
  const dir = tmp();
  try {
    const p = join(dir, 'nested', 'active-runtime.json');
    await atomicWriteJson(p, { a: 1 });
    deepEqual(JSON.parse(readFileSync(p, 'utf-8')), { a: 1 }, 'created (with mkdir -p)');
    await atomicWriteJson(p, { a: 2, b: 3 });
    deepEqual(JSON.parse(readFileSync(p, 'utf-8')), { a: 2, b: 3 }, 'replaced an existing target');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ───────────────────────── EXIT GATE: true cross-process races ───────────────────────── */

// Spawn `n` distinct OS processes, alternating claude/codex owner hosts (the real
// simultaneous-activation shape), and resolve once all have exited. Each writes
// its win/lose verdict to a file named by its pid.
function spawnRace({ n, lock, resultsDir, mode, holdMs }) {
  const children = [];
  for (let i = 0; i < n; i++) {
    children.push(new Promise((resolve) => {
      const child = spawn(process.execPath, [WORKER], {
        env: {
          ...process.env,
          LOCK_PATH: lock,
          RESULTS_DIR: resultsDir,
          OWNER: i % 2 === 0 ? 'claude' : 'codex',
          MODE: mode,
          HOLD_MS: String(holdMs ?? 0),
          LIB,
        },
        stdio: 'ignore',
      });
      child.on('exit', () => resolve());
      child.on('error', () => resolve());
    }));
  }
  return Promise.all(children);
}

function countWinners(resultsDir) {
  let wins = 0, total = 0;
  for (const f of readdirSync(resultsDir)) {
    total++;
    if (JSON.parse(readFileSync(join(resultsDir, f), 'utf-8')).ok) wins++;
  }
  return { wins, total };
}

test('lock EXIT GATE: 10 simultaneous processes racing a FREE lock → exactly one winner', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const rd = join(dir, 'results');
    mkdirSync(rd, { recursive: true });

    await spawnRace({ n: 10, lock, resultsDir: rd, mode: 'try', holdMs: 0 });
    const { wins, total } = countWinners(rd);
    equal(total, 10, 'all 10 processes reported a verdict');
    equal(wins, 1, 'EXACTLY ONE process acquired the free lock (wx serializes across processes)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lock EXIT GATE: 8 processes racing to take over a STALE lock → exactly one winner', async () => {
  const dir = tmp();
  try {
    const lock = join(dir, 'hub.lock');
    const rd = join(dir, 'results');
    mkdirSync(rd, { recursive: true });
    // Seed a stale lock (dead pid + expired) so every contender wants to take over.
    await atomicWriteJson(lock, { pid: 999999999, host: 'stale', token: 'old', acquiredAt: 0, renewedAt: 0, expiry: 0, ttlMs: 0 });

    // HOLD_MS (3s) exceeds the workers' acquire timeout (2.5s) so the winner's pid
    // stays alive through the race and its lock never looks stale to losers.
    await spawnRace({ n: 8, lock, resultsDir: rd, mode: 'acquire', holdMs: 3000 });
    const { wins, total } = countWinners(rd);
    equal(total, 8, 'all 8 processes reported a verdict');
    equal(wins, 1, 'EXACTLY ONE process took over the stale lock (rm+wx still serializes)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
