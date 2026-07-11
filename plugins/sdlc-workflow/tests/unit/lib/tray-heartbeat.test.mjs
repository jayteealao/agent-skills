// tests/unit/lib/tray-heartbeat.test.mjs
//
// The tray's liveness heartbeat (lib/tray-heartbeat.mjs): the pure staleness
// decision plus the best-effort read/write, all over injected fs seams so nothing
// touches the real ~/.sdlc/ heartbeat file.

import { test } from 'node:test';
import { equal, ok } from 'node:assert/strict';

import {
  isTrayHeartbeatStale, heartbeatShowsDown, writeTrayHeartbeat, readTrayHeartbeat,
  trayHeartbeatPath, TRAY_HEARTBEAT_STALE_MS,
} from '../../../lib/tray-heartbeat.mjs';

const NOW = 1_000_000;

test('isTrayHeartbeatStale: fresh stamp for this pid → not stale', () => {
  ok(!isTrayHeartbeatStale({ pid: 7 }, { pid: 7, lastPollAt: NOW - 3000 }, { now: NOW, stalenessMs: 60_000 }));
});

test('isTrayHeartbeatStale: old stamp for this pid → stale', () => {
  ok(isTrayHeartbeatStale({ pid: 7 }, { pid: 7, lastPollAt: NOW - 61_000 }, { now: NOW, stalenessMs: 60_000 }));
});

test('isTrayHeartbeatStale: pid mismatch → not stale (a different / not-yet-stamped tray)', () => {
  ok(!isTrayHeartbeatStale({ pid: 7 }, { pid: 9, lastPollAt: NOW - 999_999 }, { now: NOW, stalenessMs: 60_000 }));
});

test('isTrayHeartbeatStale: missing heartbeat / malformed time → not stale', () => {
  ok(!isTrayHeartbeatStale({ pid: 7 }, null, { now: NOW, stalenessMs: 1 }));
  ok(!isTrayHeartbeatStale({ pid: 7 }, { pid: 7, lastPollAt: 'nope' }, { now: NOW, stalenessMs: 1 }));
  ok(!isTrayHeartbeatStale(null, { pid: 7, lastPollAt: 0 }, { now: NOW, stalenessMs: 1 }));
});

test('isTrayHeartbeatStale: exactly at the threshold is NOT stale (strict >)', () => {
  ok(!isTrayHeartbeatStale({ pid: 7 }, { pid: 7, lastPollAt: NOW - 60_000 }, { now: NOW, stalenessMs: 60_000 }));
});

test('trayHeartbeatPath: file under the given home dir', () => {
  ok(trayHeartbeatPath('H').endsWith('tray.heartbeat.json'));
  ok(trayHeartbeatPath('H').startsWith('H'));
});

test('write/read round-trip via injected fs seams', () => {
  let stored = null;
  const writeFile = (_p, data) => { stored = data; };
  const readFile = () => stored;
  equal(writeTrayHeartbeat({ pid: 11, bundle: 'C:\\x\\tray.mjs', now: 42, homeDir: 'H', writeFile }), true);
  const rec = readTrayHeartbeat({ homeDir: 'H', readFile });
  equal(rec.pid, 11);
  equal(rec.lastPollAt, 42);
  equal(rec.bundle, 'C:\\x\\tray.mjs');
});

test('write/read round-trip carries iconState + summary when given', () => {
  let stored = null;
  const writeFile = (_p, data) => { stored = data; };
  const readFile = () => stored;
  writeTrayHeartbeat({ pid: 5, bundle: 'b', iconState: 'down', summary: '● hub down', now: 7, homeDir: 'H', writeFile });
  const rec = readTrayHeartbeat({ homeDir: 'H', readFile });
  equal(rec.iconState, 'down');
  equal(rec.summary, '● hub down');
});

test('writeTrayHeartbeat omits iconState/summary keys when not supplied (liveness-only stamp)', () => {
  let stored = null;
  writeTrayHeartbeat({ pid: 5, bundle: 'b', now: 7, homeDir: 'H', writeFile: (_p, data) => { stored = data; } });
  const rec = JSON.parse(stored);
  ok(!('iconState' in rec));
  ok(!('summary' in rec));
});

test('heartbeatShowsDown: fresh stamp, this pid, iconState down → true', () => {
  ok(heartbeatShowsDown({ pid: 7 }, { pid: 7, lastPollAt: NOW - 3000, iconState: 'down' }, { now: NOW, stalenessMs: 60_000 }));
});

test('heartbeatShowsDown: iconState up (or absent) → false', () => {
  ok(!heartbeatShowsDown({ pid: 7 }, { pid: 7, lastPollAt: NOW - 3000, iconState: 'up' }, { now: NOW, stalenessMs: 60_000 }));
  ok(!heartbeatShowsDown({ pid: 7 }, { pid: 7, lastPollAt: NOW - 3000 }, { now: NOW, stalenessMs: 60_000 }));
});

test('heartbeatShowsDown: a COLD stamp is NOT a display wedge (that is the cold-poll heal)', () => {
  // even though iconState is down, the poll is stale → this is the cold-poll case,
  // not a live driver stuck computing down. Must read false here.
  ok(!heartbeatShowsDown({ pid: 7 }, { pid: 7, lastPollAt: NOW - 61_000, iconState: 'down' }, { now: NOW, stalenessMs: 60_000 }));
});

test('heartbeatShowsDown: pid mismatch / missing → false', () => {
  ok(!heartbeatShowsDown({ pid: 7 }, { pid: 9, lastPollAt: NOW, iconState: 'down' }, { now: NOW, stalenessMs: 60_000 }));
  ok(!heartbeatShowsDown({ pid: 7 }, null, { now: NOW, stalenessMs: 60_000 }));
});

test('writeTrayHeartbeat never throws on an fs error (best-effort)', () => {
  equal(writeTrayHeartbeat({ pid: 1, writeFile: () => { throw new Error('disk full'); } }), false);
});

test('readTrayHeartbeat returns null on unreadable / garbage', () => {
  equal(readTrayHeartbeat({ readFile: () => { throw new Error('nope'); } }), null);
  equal(readTrayHeartbeat({ readFile: () => 'not json' }), null);
  equal(readTrayHeartbeat({ readFile: () => '"a string, not an object"' }), null);
});

test('TRAY_HEARTBEAT_STALE_MS is comfortably above the 5s poll', () => {
  ok(TRAY_HEARTBEAT_STALE_MS >= 30_000);
});
