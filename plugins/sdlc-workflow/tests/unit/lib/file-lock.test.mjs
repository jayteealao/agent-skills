// lib/file-lock.mjs: the lock of one read-modify-write, and the takeover of a stale lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dropLock, isStaleLock, lockHolder, refreshLock, takeLock, takeOver, withFileLock, withLock } from '../../../lib/file-lock.mjs';

const MOD = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'lib', 'file-lock.mjs')).href;
const tmp = () => mkdtempSync(join(tmpdir(), 'file-lock-'));
const DEAD_PID = 2 ** 22 + 12345;
const old = (path, minutes) => { const t = new Date(Date.now() - minutes * 60_000); utimesSync(path, t, t); };

test('a lock records the pid, the host and a stamp; only its holder drops it', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  assert.equal(takeLock(path, { waitMs: 0, info: { holder: 'test' } }), true);
  const h = lockHolder(path);
  assert.deepEqual([h.pid, h.host, h.holder, typeof h.at], [process.pid, hostname(), 'test', 'string']);
  assert.equal(takeLock(path, { waitMs: 0 }), false, 'a held lock is not taken twice');
  writeFileSync(path, JSON.stringify({ pid: DEAD_PID + 1, host: 'elsewhere', at: new Date().toISOString() }));
  dropLock(path);
  assert.equal(existsSync(path), true, 'the lock of another holder stays');
  rmSync(dir, { recursive: true, force: true });
});

test('a lock whose process runs on this host is never stale by its age; a lock of a gone process is', () => {
  const now = Date.now();
  const dayAgo = now - 24 * 3600_000;
  const text = (o) => JSON.stringify(o);
  assert.equal(isStaleLock(text({ pid: 42, host: hostname(), at: new Date(dayAgo).toISOString() }), dayAgo, { now, alive: () => true }), false);
  assert.equal(isStaleLock(text({ pid: 42, at: new Date(dayAgo).toISOString() }), dayAgo, { now, alive: () => true }), false, 'a lock with no host is a lock of this machine');
  assert.equal(isStaleLock(text({ pid: 42, host: hostname(), at: new Date(now).toISOString() }), now, { now, alive: () => false }), true);
  assert.equal(isStaleLock(text({ pid: 42, host: 'other', at: new Date(dayAgo).toISOString() }), dayAgo, { now, alive: () => true }), true, 'another host: by its stamp');
  assert.equal(isStaleLock(text({ pid: 42, host: 'other', at: new Date(now).toISOString() }), now, { now }), false);
  assert.equal(isStaleLock('{"pid":', now - 1_000, { now }), false, 'a torn lock gets a moment');
  assert.equal(isStaleLock('{"pid":', now - 60_000, { now }), true);
});

test('the holder refreshes the stamp of its lock', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  takeLock(path, { waitMs: 0 });
  writeFileSync(path, JSON.stringify({ ...lockHolder(path), at: new Date(Date.now() - 3600_000).toISOString() }));
  old(path, 60);
  assert.equal(refreshLock(path), true);
  assert.ok(Date.now() - Date.parse(lockHolder(path).at) < 60_000);
  assert.ok(Date.now() - statSync(path).mtimeMs < 60_000);
  dropLock(path);
  assert.equal(existsSync(path), false);
  assert.equal(refreshLock(path), false, 'no lock, nothing to refresh');
  rmSync(dir, { recursive: true, force: true });
});

test('a lock of a dead pid is taken over, with no wait, and the takeover mutex is gone after', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  writeFileSync(path, JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() }));
  assert.equal(takeOver(path), true);
  assert.deepEqual(readdirSync(dir), [], 'the lock and the mutex are gone');
  writeFileSync(path, JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() }));
  assert.equal(takeLock(path, { waitMs: 0 }), true);
  assert.equal(lockHolder(path).pid, process.pid);
  assert.deepEqual(readdirSync(dir), ['x.lock']);
  dropLock(path);
  rmSync(dir, { recursive: true, force: true });
});

test('a takeover asked for on an old view leaves the live lock now at the path untouched', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  const staleText = JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() });
  // A waiter read this text and judged it stale; meanwhile that lock went and another holder,
  // which still runs, made a new lock.
  assert.equal(isStaleLock(staleText, Date.now()), true);
  assert.equal(takeLock(path, { waitMs: 0 }), true);
  const fresh = readFileSync(path, 'utf8');
  assert.notEqual(fresh, staleText);
  assert.equal(takeOver(path), false);
  assert.equal(readFileSync(path, 'utf8'), fresh);
  assert.deepEqual(readdirSync(dir), ['x.lock'], 'no mutex is left');
  // The same when the lock text changes between the judgment and the second read: the pid check
  // (which runs between the two reads) swaps the lock for a live one.
  let calls = 0;
  const swap = (pid) => {
    if (calls++ === 0) writeFileSync(path, JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString(), id: 'other' }));
    return pid === process.pid;
  };
  writeFileSync(path, staleText);
  assert.equal(takeOver(path, { alive: swap }), false);
  assert.equal(lockHolder(path).id, 'other', 'the lock that replaced the judged text stays');
  rmSync(dir, { recursive: true, force: true });
});

test('an abandoned takeover mutex does not block a takeover', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  const stale = JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() });
  // A mutex of a dead process on this host.
  writeFileSync(path, stale);
  writeFileSync(`${path}.takeover`, JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() }));
  assert.equal(takeLock(path, { waitMs: 0 }), true);
  assert.deepEqual(readdirSync(dir), ['x.lock']);
  dropLock(path);
  // A mutex that does not parse, or names a live process, but is old.
  for (const text of ['', JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() })]) {
    writeFileSync(path, stale);
    writeFileSync(`${path}.takeover`, text);
    old(`${path}.takeover`, 1);
    assert.equal(takeLock(path, { waitMs: 0 }), true, JSON.stringify(text));
    assert.deepEqual(readdirSync(dir), ['x.lock']);
    dropLock(path);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('a held takeover mutex makes the takeover do nothing', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  const mutex = `${path}.takeover`;
  const stale = JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() });
  const held = JSON.stringify({ pid: process.ppid, host: hostname(), at: new Date().toISOString() });
  writeFileSync(path, stale);
  writeFileSync(mutex, held);
  assert.equal(takeOver(path), false);
  assert.equal(takeLock(path, { waitMs: 0 }), false);
  assert.equal(readFileSync(path, 'utf8'), stale, 'the lock stays for the mutex holder');
  assert.equal(readFileSync(mutex, 'utf8'), held, 'the mutex of another takeover stays');
  rmSync(dir, { recursive: true, force: true });
});

test('withLock runs the function under the lock, gives it up after a throw, and names a busy holder', () => {
  const dir = tmp();
  const path = join(dir, 'x.lock');
  assert.equal(withLock(path, () => existsSync(path)), true);
  assert.equal(existsSync(path), false);
  assert.throws(() => withLock(path, () => { throw new Error('boom'); }), /boom/);
  assert.equal(existsSync(path), false);
  // A live process of this host (the parent of the test run) holds the lock.
  writeFileSync(join(dir, 'x.lock'), JSON.stringify({ pid: process.ppid, host: hostname(), at: new Date().toISOString() }));
  assert.throws(() => withFileLock(join(dir, 'x'), () => 1, { waitMs: 50 }), /being written by another process \(process \d+\)/);
  rmSync(dir, { recursive: true, force: true });
});

test('four processes that each add 25 to one counter under the lock, behind a stale lock, lose no update', async () => {
  const dir = tmp();
  const counter = join(dir, 'n.txt');
  writeFileSync(counter, '0');
  writeFileSync(`${counter}.lock`, JSON.stringify({ pid: DEAD_PID, host: hostname(), at: new Date().toISOString() }));
  const file = JSON.stringify(counter);
  const code = `const { withFileLock } = await import(${JSON.stringify(MOD)}); const fs = await import('node:fs');
    for (let i = 0; i < 25; i++) withFileLock(${file}, () => { const n = Number(fs.readFileSync(${file}, 'utf8')); fs.writeFileSync(${file}, String(n + 1)); }, { waitMs: 30000 });`;
  const codes = await Promise.all([0, 1, 2, 3].map(() => new Promise((res) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'inherit'] });
    c.on('exit', res);
  })));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  assert.equal(readFileSync(counter, 'utf8'), '100');
  assert.deepEqual(readdirSync(dir), ['n.txt']);
  rmSync(dir, { recursive: true, force: true });
});
