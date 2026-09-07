// W11.2 — one log for the runtime (WIDE-VIEW-REPAIR-PLAN §14.2.2).
//
// (1) rotation: 1 MB, two generations, live file becomes .1, .1 becomes .2, .2 dies
// (2) the lifecycle line format: fixed leading keys, extras kept, never throws
// (3) hub history: starts, restarts = starts − 1, last reason
// (4) error-log routing: machine errors.log always; per-repo file only with .ai/workflows
// (5) the invalid-JSON message carries the first 200 bytes as hex
// (6) live: a real detached hub start writes a `start` lifecycle line, a hub.log
//     `listening` line, and health.history.restarts 0; the next supervisor call
//     writes `adopt`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KEEP_GENERATIONS, LIFECYCLE_EVENTS, MAX_LOG_BYTES, appendLogLine, errorsLogPath, formatLifecycleLine,
  hubLogLine, hubLogPath, lifecycleLogPath, logLifecycle, parseJsonLines, readHubHistory, readLifecycleLog,
  recordHubStart, rotateIfLarge,
} from '../../../lib/runtime-log.mjs';
import { hasWorkflows, hookErrorLogPath, logError } from '../../../lib/error-log.mjs';
import { INVALID_JSON_HEX_BYTES, describeInvalidJson } from '../../../lib/stdin.mjs';
import { ensureHubLifecycle, stopHub } from '../../../lib/hub-lifecycle.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = (p) => mkdtempSync(path.join(tmpdir(), p));

test('rotateIfLarge: over 1 MB → .1, prior .1 → .2, prior .2 deleted; under the cap → untouched', () => {
  const dir = tmp('sdlc-rotate-');
  try {
    const p = path.join(dir, 'x.log');
    writeFileSync(p, 'small\n');
    assert.equal(rotateIfLarge(p), false);
    assert.equal(readFileSync(p, 'utf-8'), 'small\n');

    writeFileSync(`${p}.1`, 'gen1\n');
    writeFileSync(`${p}.2`, 'gen2\n');
    writeFileSync(p, 'x'.repeat(MAX_LOG_BYTES + 1));
    assert.equal(rotateIfLarge(p), true);
    assert.equal(existsSync(p), false, 'live file moved');
    assert.equal(readFileSync(`${p}.1`, 'utf-8').length, MAX_LOG_BYTES + 1, 'live → .1');
    assert.equal(readFileSync(`${p}.2`, 'utf-8'), 'gen1\n', '.1 → .2');
    assert.equal(existsSync(`${p}.${KEEP_GENERATIONS + 1}`), false, 'nothing beyond .2');

    // appendLogLine rotates before it appends, so the new line lands in a fresh file.
    assert.equal(appendLogLine(p, 'after'), true);
    assert.equal(readFileSync(p, 'utf-8'), 'after\n');
    assert.equal(rotateIfLarge(path.join(dir, 'missing.log')), false, 'missing file → false, no throw');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('formatLifecycleLine: fixed leading keys, extras appended, unknown pid → null', () => {
  const now = new Date('2026-09-07T10:00:00.000Z');
  const line = formatLifecycleLine({ event: 'reap', host: 'codex', version: '9.153.5', buildId: 'abc', pid: 42, reason: 'version-mismatch', peerVersion: '9.144.0' }, now);
  assert.equal(line, '{"at":"2026-09-07T10:00:00.000Z","event":"reap","host":"codex","version":"9.153.5","buildId":"abc","pid":42,"reason":"version-mismatch","peerVersion":"9.144.0"}');
  const parsed = JSON.parse(formatLifecycleLine({ event: 'adopt', pid: 'nope' }, now));
  assert.deepEqual(Object.keys(parsed), ['at', 'event', 'host', 'version', 'buildId', 'pid', 'reason']);
  assert.equal(parsed.pid, null);
  assert.equal(JSON.parse(formatLifecycleLine(null, now)).event, 'unknown');
  for (const e of ['adopt', 'reap', 'recover', 'start', 'unconfirmed']) assert.ok(LIFECYCLE_EVENTS.includes(e), e);
});

test('logLifecycle + readLifecycleLog round-trip under an explicit home', () => {
  const home = tmp('sdlc-lc-');
  try {
    logLifecycle({ event: 'start', host: 'claude', version: '1.0.0', buildId: 'b', pid: 7, reason: 'fresh' }, { home });
    logLifecycle({ event: 'adopt', host: 'codex', version: '1.0.0', buildId: 'b', pid: 7 }, { home });
    const rows = readLifecycleLog(home);
    assert.deepEqual(rows.map((r) => [r.event, r.host, r.reason]), [['start', 'claude', 'fresh'], ['adopt', 'codex', null]]);
    assert.equal(existsSync(lifecycleLogPath(home)), true);
    assert.deepEqual(parseJsonLines('{"a":1}\nnot json\n\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('hub history: restarts = starts − 1, last reason; empty → zeros', () => {
  const home = tmp('sdlc-hist-');
  try {
    assert.deepEqual(readHubHistory(home), { starts: 0, restarts: 0, lastReason: null, lastAt: null, lastPid: null });
    recordHubStart({ pid: 1, version: '1.0.0', buildId: 'b', startedBy: 'claude', reason: 'fresh', port: 4173 }, { home, now: new Date('2026-09-07T00:00:00Z') });
    assert.equal(readHubHistory(home).restarts, 0, 'a first start is not a restart');
    recordHubStart({ pid: 2, reason: 'reap: version-mismatch' }, { home, now: new Date('2026-09-07T01:00:00Z') });
    const h = readHubHistory(home);
    assert.equal(h.starts, 2);
    assert.equal(h.restarts, 1);
    assert.equal(h.lastReason, 'reap: version-mismatch');
    assert.equal(h.lastPid, 2);
    assert.equal(h.lastAt, '2026-09-07T01:00:00.000Z');
    const written = hubLogLine('[hub] hello', { home, now: () => new Date('2026-09-07T02:00:00Z') });
    assert.equal(written, '2026-09-07T02:00:00.000Z [hub] hello');
    assert.equal(readFileSync(hubLogPath(home), 'utf-8'), `${written}\n`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('logError: machine errors.log always, keyed by repoRoot; per-repo file only when .ai/workflows exists', async () => {
  const dir = tmp('sdlc-errlog-');
  try {
    const machine = path.join(dir, 'home', 'errors.log');
    const bare = path.join(dir, 'bare');
    const withWf = path.join(dir, 'with');
    mkdirSync(bare, { recursive: true });
    mkdirSync(path.join(withWf, '.ai', 'workflows'), { recursive: true });
    assert.equal(hasWorkflows(bare), false);
    assert.equal(hasWorkflows(withWf), true);

    await logError('t1', new Error('boom'), { projectRoot: bare, machineLogPath: machine });
    await logError('t2', new Error('bang'), { projectRoot: withWf, machineLogPath: machine, context: { k: 1 } });

    const rows = parseJsonLines(readFileSync(machine, 'utf-8'));
    assert.deepEqual(rows.map((r) => [r.label, r.repoRoot, r.message]), [['t1', bare, 'boom'], ['t2', withWf, 'bang']]);
    assert.deepEqual(rows[1].context, { k: 1 });
    assert.equal(existsSync(hookErrorLogPath(bare)), false, 'no .ai/_view litter in a repo without workflows');
    assert.equal(existsSync(path.join(bare, '.ai')), false);
    assert.equal(parseJsonLines(readFileSync(hookErrorLogPath(withWf), 'utf-8'))[0].label, 't2', 'per-repo file kept when workflows exist');
    assert.equal(path.basename(errorsLogPath('/x/home')), 'errors.log');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('describeInvalidJson: parser message, byte count, and the first 200 bytes as hex', () => {
  const text = '﻿{"tool_name": "Write"';   // a BOM the parser rejects
  let err;
  try { JSON.parse(text); } catch (e) { err = e; }
  const msg = describeInvalidJson(text, err);
  assert.match(msg, /^invalid hook JSON on stdin: .+; 24 bytes; first 24 bytes hex: efbbbf7b/);
  const long = 'x'.repeat(500);
  const m2 = describeInvalidJson(long, new Error('Unexpected token'));
  assert.match(m2, new RegExp(`500 bytes; first ${INVALID_JSON_HEX_BYTES} bytes hex: ${'78'.repeat(INVALID_JSON_HEX_BYTES)}$`));
  assert.match(describeInvalidJson('', new Error('e')), /0 bytes; first 0 bytes hex: $/);
});

// ── live ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function probe(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/__sdlc/health`); return r.ok ? await r.json() : null; } catch { return null; }
}
// 120 × 150 ms = 18 s: under the full suite the store materialization and the
// hub start share the machine with a dozen other test files.
async function probeUntil(port, pred, tries = 120) {
  for (let i = 0; i < tries; i++) { const h = await probe(port); if (pred(h)) return h; await sleep(150); }
  return null;
}

// A port nothing holds right now. A fixed port can meet a zombie hub from an
// earlier aborted run (its pid file died with that run's sandbox), which the
// fresh sandbox would reap as "untracked" and so report a reap, not `fresh`.
async function freePort() {
  const { createServer } = await import('node:net');
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// Stop the sandbox hub by the pid its OWN health reports (the pid file may still
// carry the Windows launcher's pid before the hub binds), then wait for the port.
async function stopSandboxHub(port) {
  try { await stopHub({ log: () => {} }); } catch { /* ignore */ }
  for (let i = 0; i < 20; i++) {
    const h = await probe(port);
    if (!h) return;
    if (Number.isInteger(h.pid)) { try { process.kill(h.pid); } catch { /* gone */ } }
    await sleep(250);
  }
}

test('live: a real hub start leaves a lifecycle line, a hub.log line, and history.restarts 0; the next call adopts', async () => {
  const PORT = await freePort();
  const home = tmp('sdlc-runtime-log-live-');
  const prevHome = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  writeFileSync(path.join(home, 'hub-config.json'), JSON.stringify({ host: '127.0.0.1', port: PORT }), 'utf-8');
  try {
    const res = await ensureHubLifecycle({ pluginRoot, log: () => {} });
    assert.ok(['started', 'started-unconfirmed'].includes(res.action), `start: ${JSON.stringify(res)}`);
    const h = await probeUntil(PORT, (x) => x?.history);
    assert.ok(h, 'hub healthy with a history block');
    assert.equal(h.history.starts, 1);
    assert.equal(h.history.restarts, 0);
    assert.equal(h.history.lastReason, 'fresh');

    const lc = readLifecycleLog(home);
    const startRow = lc.find((r) => r.event === 'start' || r.event === 'unconfirmed');
    assert.ok(startRow, `one lifecycle line after a start: ${JSON.stringify(lc)}`);
    assert.equal(startRow.reason, 'fresh');
    assert.equal(startRow.version, h.hub.runtimeVersion);

    // The hub's own log exists and names the bind.
    await probeUntil(PORT, () => existsSync(hubLogPath(home)), 20);
    assert.match(readFileSync(hubLogPath(home), 'utf-8'), new RegExp(`\\[hub\\] listening on http://127\\.0\\.0\\.1:${PORT} \\(start #1, reason: fresh`));

    const again = await ensureHubLifecycle({ pluginRoot, log: () => {} });
    assert.equal(again.action, 'already-running');
    assert.ok(readLifecycleLog(home).some((r) => r.event === 'adopt'), 'the second call writes adopt');
  } finally {
    await stopSandboxHub(PORT);
    await sleep(300);
    if (prevHome === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prevHome;
    try { rmSync(home, { recursive: true, force: true }); } catch { /* a handle may linger on Windows */ }
  }
});
