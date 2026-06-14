// tests/unit/lib/hub-lifecycle.test.mjs
//
// The hub adoption decision (NATIVE-INTEROP Workstreams B + C). decideHubAction is
// the pure, synchronous core of ensureHubLifecycle's adoption-first logic — the
// part that must be exactly right for cross-host sharing — extracted so it is
// unit-testable without spawning a real hub. The spawn/lock/materialize wiring
// around it is exercised by a live smoke run, not here.

import { test } from 'node:test';
import { deepEqual, equal } from 'node:assert/strict';

import { decideHubAction, hubLockPath } from '../../../lib/hub-lifecycle.mjs';

const RUNTIME = { runtimeVersion: '9.75.0', hubProtocolVersion: 1, hubName: 'sdlc-workflow-hub' };

// A health-probe identity for a hub.
function hubId({ pid = 100, runtimeVersion = '9.75.0', hubProtocolVersion = 1 } = {}) {
  return { pid, isHub: true, runtimeVersion, hubProtocolVersion, buildId: 'b', hubName: 'sdlc-workflow-hub', startedByHost: 'codex' };
}
const tracked = (pid = 100) => ({ alive: true, record: { pid } });
const untracked = { alive: false, record: null };

test('decideHubAction: nothing answering → start (clean) or recover (stale pid file)', () => {
  deepEqual(decideHubAction(null, RUNTIME, { record: null }), { action: 'start' });
  deepEqual(decideHubAction(null, RUNTIME, { record: { pid: 7 }, alive: false }), { action: 'recover' });
});

test('decideHubAction: healthy compatible same-runtime hub, tracked → ADOPT (any starter host)', () => {
  deepEqual(decideHubAction(hubId(), RUNTIME, tracked()), { action: 'adopt' });
});

test('decideHubAction: protocol mismatch → protocol-incompatible (never silently reaped)', () => {
  deepEqual(
    decideHubAction(hubId({ hubProtocolVersion: 2 }), RUNTIME, tracked()),
    { action: 'protocol-incompatible' },
  );
});

test('decideHubAction: runtimeVersion mismatch → reap (a runtime upgrade)', () => {
  const d = decideHubAction(hubId({ runtimeVersion: '9.74.0' }), RUNTIME, tracked());
  equal(d.action, 'reap');
  equal(d.reason, 'runtime v9.74.0 → v9.75.0');
});

test('decideHubAction: same-runtime hub but untracked pid → reap (recover the write token)', () => {
  // The hub answers (pid 100) but the pid file does not track it (orphaned).
  const d = decideHubAction(hubId({ pid: 100 }), RUNTIME, untracked);
  equal(d.action, 'reap');
  equal(d.reason, 'untracked hub (orphaned pid file)');
});

test('decideHubAction: a non-hub squatter on the port → reap', () => {
  const squatter = { pid: 200, isHub: false, runtimeVersion: '', hubProtocolVersion: 1 };
  deepEqual(decideHubAction(squatter, RUNTIME, untracked), { action: 'reap', reason: 'non-hub process on hub port' });
});

test('hubLockPath: lives under the machine-wide ~/.sdlc state dir', () => {
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = '/tmp/sdlc-test-home';
  try {
    equal(hubLockPath().replace(/\\/g, '/'), '/tmp/sdlc-test-home/hub.lock');
  } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
  }
});
