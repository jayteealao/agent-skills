// WF-CAMPAIGN-HEAVY-LOCK-REVIEW-2026-10-22 — the heavy-suite lock: `heavy-run` holds the
// lock only while its suite runs (F1), a hold names its process (F2), the waiting tickets
// keep their order (F3), and `lock status|reap` shows and ends the idle holds (F4, F5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { holdOf, lockState, suiteListed } from '../../lib/campaign-locks.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';
const DEAD_PID = 2 ** 22 + 12345;
const fwd = (p) => p.replace(/\\/g, '/');
const ENV = { ...process.env, SDLC_HEAVY_POLL_MS: '100', SDLC_LOCK_WAIT_LINE_MS: '100' };
delete ENV.MSYSTEM;

function run(root, ...args) {
  let out;
  try {
    out = execFileSync(process.execPath, [SCRIPT, args[0], root, B, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ENV });
  } catch (e) {
    out = e.stdout;
  }
  return JSON.parse(out.slice(out.indexOf('{')));
}

/** A project with a campaign folder, two unit folders, and a probe script that records the lock it sees. */
function makeRepo(suites = ['node']) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'heavy lock '));
  mkdirSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign'), { recursive: true });
  for (const slug of ['engine', 'squads']) mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation: { parallel: true, 'port-env': {}, 'build-dirs': [], 'heavy-suites': suites, 'min-free-gb': 0 } } }));
  const probe = path.join(root, 'probe.cjs');
  writeFileSync(probe, `
    const fs = require('fs');
    const [lockFile, outFile, code] = process.argv.slice(2);
    fs.writeFileSync(outFile, fs.existsSync(lockFile) ? fs.readFileSync(lockFile, 'utf8') : 'none');
    process.exit(Number(code));
  `);
  return { root, probe };
}

const lockFile = (root, kind = 'heavy') => path.join(root, '.scratch', 'campaign', `${kind}.lock`);
const queueFile = (root, kind = 'heavy') => path.join(root, '.scratch', 'campaign', `${kind}.queue.json`);
const journal = (root, slug) => {
  const f = path.join(root, '.ai', 'workflows', slug, '.driver-journal.jsonl');
  return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
};
const writeLock = (root, rec, kind = 'heavy') => {
  mkdirSync(path.dirname(lockFile(root, kind)), { recursive: true });
  writeFileSync(lockFile(root, kind), JSON.stringify(rec));
};
const probeArgs = (root, probe, code, kind = 'heavy') => [fwd(process.execPath), fwd(probe), fwd(lockFile(root, kind)), fwd(path.join(root, 'seen.json')), String(code)];

test('F1: heavy-run holds the lock under its own pid while the suite runs, then releases it', () => {
  const { root, probe } = makeRepo();
  try {
    const r = run(root, 'heavy-run', 'engine', '--agent', 'implement:s1@engine', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.exit, 0);
    assert.equal(r.listed, true);
    const seen = JSON.parse(readFileSync(path.join(root, 'seen.json'), 'utf8'));
    assert.equal(seen.holder, 'engine');
    assert.equal(seen.agent, 'implement:s1@engine');
    assert.ok(Number.isInteger(seen.pid), 'the hold names its process');
    assert.equal(existsSync(lockFile(root)), false, 'released when the suite ended');
    const end = journal(root, 'engine').find((l) => l.event === 'heavy-run-end');
    assert.equal(end.exit, 0);
    assert.equal(end.agent, 'implement:s1@engine');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F1: heavy-run releases the lock when the suite fails, and returns its exit code', () => {
  const { root, probe } = makeRepo();
  try {
    let code = 0;
    try {
      execFileSync(process.execPath, [SCRIPT, 'heavy-run', root, B, 'engine', '--', ...probeArgs(root, probe, 5)], { stdio: 'ignore', env: ENV });
    } catch (e) { code = e.status; }
    assert.equal(code, 5, 'the exit code is the suite\'s');
    assert.equal(existsSync(lockFile(root)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F2: a hold whose process is gone frees the lock at once', () => {
  const { root, probe } = makeRepo();
  try {
    writeLock(root, { holder: 'engine', agent: 'a', pid: DEAD_PID, command: 'npm test', at: new Date().toISOString() });
    assert.equal(run(root, 'lock', 'status').idle.includes('heavy'), true);
    const r = run(root, 'heavy-run', 'squads', '--max-wait', '5', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.waitedS < 5);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('L2: a running heavy-run keeps out another agent of the same unit, and a release by hand does not free it', () => {
  const { root, probe } = makeRepo();
  try {
    // This test process plays the running suite: its pid is alive.
    writeLock(root, { holder: 'engine', agent: 'verify:s1@engine', pid: process.pid, command: 'npm test', at: new Date().toISOString() });
    const r = run(root, 'heavy-run', 'engine', '--agent', 'implement:s2@engine', '--max-wait', '1', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, false);
    assert.match(r.error, /no turn/);
    const waits = journal(root, 'engine').filter((l) => l.event === 'lock-wait');
    assert.ok(waits.length >= 1, 'heavy-run writes the lock-wait lines itself');
    assert.equal(waits[0].holder, 'engine');
    const rel = run(root, 'lock', 'release', 'engine');
    assert.equal(rel.released, false);
    assert.equal(rel.running.pid, process.pid);
    assert.equal(existsSync(lockFile(root)), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F3: a waiting ticket comes before a plain acquire of another unit; a dead ticket does not', () => {
  const { root } = makeRepo();
  try {
    mkdirSync(path.dirname(queueFile(root)), { recursive: true });
    writeFileSync(queueFile(root), JSON.stringify({ tickets: [{ id: 'x', holder: 'engine', agent: 'implement:s1@engine', pid: process.pid, at: new Date().toISOString(), command: 'npm test' }] }));
    const busy = run(root, 'lock', 'acquire', 'squads');
    assert.equal(busy.acquired, false);
    assert.equal(busy.queued.holder, 'engine');
    assert.equal(run(root, 'lock', 'status').heavy.waiting[0].holder, 'engine');
    writeFileSync(queueFile(root), JSON.stringify({ tickets: [{ id: 'y', holder: 'engine', pid: DEAD_PID, at: new Date().toISOString() }] }));
    assert.equal(run(root, 'lock', 'acquire', 'squads').acquired, true, 'a ticket of a dead process is skipped');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F3: heavy-run waits behind an older ticket of another unit', () => {
  const { root, probe } = makeRepo();
  try {
    mkdirSync(path.dirname(queueFile(root)), { recursive: true });
    writeFileSync(queueFile(root), JSON.stringify({ tickets: [{ id: 'old', holder: 'engine', pid: process.pid, at: new Date().toISOString(), command: 'npm test' }] }));
    const r = run(root, 'heavy-run', 'squads', '--max-wait', '1', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, false);
    assert.equal(r.position, 1);
    const q = JSON.parse(readFileSync(queueFile(root), 'utf8')).tickets;
    assert.deepEqual(q.map((t) => t.id), ['old'], 'the given-up ticket left the queue');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('LQ1: lock acquire is a 30-minute lease; an ended lease is idle, and reap ends it', () => {
  const { root } = makeRepo();
  try {
    const a = run(root, 'lock', 'acquire', 'engine', '--agent', 'implement:s1@engine');
    assert.equal(a.acquired, true);
    assert.equal(a.lease.minutes, 30);
    const rec = JSON.parse(readFileSync(lockFile(root), 'utf8'));
    assert.ok(Date.parse(rec.until) - Date.parse(rec.at) >= 29 * 60_000);
    assert.equal(run(root, 'lock', 'acquire', 'engine', '--agent', 'verify:s2@engine').acquired, false, 'another agent of the same unit waits');
    assert.equal(run(root, 'lock', 'acquire', 'engine', '--agent', 'implement:s1@engine').acquired, true, 'the same agent may ask again');
    writeLock(root, { ...rec, until: '2000-01-01T00:00:00Z' });
    assert.equal(run(root, 'lock', 'acquire', 'squads').acquired, true, 'an ended lease does not hold');
    writeLock(root, { ...rec, until: '2000-01-01T00:00:00Z' });
    const reap = run(root, 'lock', 'reap');
    assert.equal(reap.reaped[0].holder, 'engine');
    assert.equal(reap.reaped[0].form, 'lease');
    assert.equal(existsSync(lockFile(root)), false);
    const camp = readFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign', '.campaign-journal.jsonl'), 'utf8');
    assert.match(camp, /"event":"lock-reaped"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F4: a legacy hold is idle after 30 minutes and reap ends it; a younger one stays', () => {
  const { root } = makeRepo();
  try {
    writeLock(root, { holder: 'engine', at: new Date(Date.now() - 10 * 60_000).toISOString() });
    assert.deepEqual(run(root, 'lock', 'reap').reaped, []);
    assert.equal(run(root, 'lock', 'acquire', 'squads').acquired, false, 'a legacy hold younger than 3 hours still holds');
    writeLock(root, { holder: 'engine', at: new Date(Date.now() - 40 * 60_000).toISOString() });
    assert.equal(run(root, 'lock', 'reap').reaped[0].form, 'legacy');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('C4: heavy-run waits while another unit holds the quiet lock', () => {
  const { root, probe } = makeRepo();
  try {
    assert.equal(run(root, 'lock', 'quiet', 'acquire', 'engine').acquired, true);
    const r = run(root, 'heavy-run', 'squads', '--max-wait', '1', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, false);
    assert.equal(r.holder, 'engine');
    run(root, 'lock', 'quiet', 'release', 'engine');
    const q = run(root, 'heavy-run', 'squads', '--quiet', '--', ...probeArgs(root, probe, 0, 'quiet'));
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.equal(q.kind, 'quiet');
    assert.equal(JSON.parse(readFileSync(path.join(root, 'seen.json'), 'utf8')).holder, 'squads');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F5: heavy-run runs a command that is not a listed suite, and says so', () => {
  const { root, probe } = makeRepo(['npm test']);
  try {
    const r = run(root, 'heavy-run', 'engine', '--', ...probeArgs(root, probe, 0));
    assert.equal(r.ok, true);
    assert.equal(r.listed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('holdOf, lockState and suiteListed read the three hold forms', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const alive = (pid) => pid === 7;
  assert.equal(holdOf({ holder: 'a', pid: 7, at: '2026-10-22T11:00:00Z' }, { now, alive }).live, true);
  assert.equal(holdOf({ holder: 'a', pid: 8, at: '2026-10-22T11:59:00Z' }, { now, alive }).idle, true);
  assert.equal(holdOf({ holder: 'a', at: '2026-10-22T11:50:00Z', until: '2026-10-22T12:20:00Z' }, { now, alive }).kind, 'lease');
  assert.equal(holdOf({ holder: 'a', at: '2026-10-22T08:00:00Z' }, { now, alive }).live, false, 'legacy older than 3 hours');
  assert.equal(holdOf(null), null);
  assert.equal(suiteListed('cd x && engine-cli calibrate --matches 9', ['engine-cli calibrate (every calibrate run)']), true);
  assert.equal(suiteListed('cargo test -p engine', ['npm test', 'engine-cli calibrate (every run)']), false);
  const { root } = makeRepo();
  try {
    assert.deepEqual(lockState(root).idle, []);
    assert.equal(lockState(root).heavy.hold, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
