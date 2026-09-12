// W11.7 — the suite never touches the real ~/.sdlc (WIDE-VIEW-REPAIR-PLAN §14.2.7).
//
// tests/run-all.mjs sets SDLC_HOME to a fresh temp directory for the whole run,
// records a fingerprint of the REAL state dir before the suite, and runs this
// file AFTER every other test file. It fails when a test leaked into ~/.sdlc:
// a registration, a prune line, a hub start, a materialized runtime.
import { test } from 'node:test';
import { deepEqual, equal, notEqual, ok } from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { fingerprintDiff, stateFingerprint } from '../helpers/state-fingerprint.mjs';
import { listHubServeProcesses, newHubProcesses, portOwnerPid } from '../helpers/hub-processes.mjs';

const REAL_HOME = resolve(homedir(), '.sdlc');

test('state-dir guard: the run used a temp SDLC_HOME, not the real ~/.sdlc', () => {
  const home = process.env.SDLC_HOME;
  ok(home && home.trim(), 'SDLC_HOME is set for the run (tests/run-all.mjs, W11.7)');
  notEqual(resolve(home), REAL_HOME, 'SDLC_HOME must not be the real state dir');
});

test('state-dir guard: the real ~/.sdlc fingerprint is unchanged after the suite', () => {
  const raw = process.env.SDLC_STATE_GUARD_BASELINE;
  ok(raw, 'tests/run-all.mjs recorded SDLC_STATE_GUARD_BASELINE before the suite');
  const before = JSON.parse(raw);
  const after = stateFingerprint(REAL_HOME);
  const changed = fingerprintDiff(before, after);
  deepEqual(changed, [], `a test leaked into ${REAL_HOME}:\n  ${changed.join('\n  ')}`);
});

// 2026-09-12: the fingerprint saw nothing when a test reaped the operator's live
// hub — the file it names (hub.pid) was untouched; only the PROCESS behind the
// port changed. These two compare the machine's hubs before and after the suite.

function hubBaseline() {
  const raw = process.env.SDLC_HUB_GUARD_BASELINE;
  ok(raw, 'tests/run-all.mjs recorded SDLC_HUB_GUARD_BASELINE before the suite');
  return JSON.parse(raw);
}

test("hub guard: the operator's hub port has the same owner after the suite", () => {
  const before = hubBaseline();
  const after = portOwnerPid(before.port);
  if (before.ownerPid === null && after === null) return;   // no hub on this machine; nothing to protect
  equal(after, before.ownerPid,
    before.ownerPid === null
      ? `a test left a hub on the operator's port ${before.port} (pid ${after}); it spawned against the default port — give its sandbox a hub-config with a private port`
      : `the operator's hub on port ${before.port} was replaced during the suite (pid ${before.ownerPid} → ${after ?? 'none'}); a test reached the real supervisor without a private port`);
});

test('hub guard: no hub-serve process started during the suite is still alive', (t) => {
  const before = hubBaseline();
  const after = listHubServeProcesses();
  if (!Array.isArray(before.hubProcesses) || !Array.isArray(after)) {
    t.skip('process listing is unavailable on this platform');
    return;
  }
  const leaked = newHubProcesses(before.hubProcesses, after);
  deepEqual(leaked.map((p) => `pid ${p.pid}: ${p.commandLine}`), [],
    'a live test left a detached hub running — stop it in the cleanup of the test that started it: stopHub, then the pid that health reports');
});
