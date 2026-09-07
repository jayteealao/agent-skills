// W11.7 — the suite never touches the real ~/.sdlc (WIDE-VIEW-REPAIR-PLAN §14.2.7).
//
// tests/run-all.mjs sets SDLC_HOME to a fresh temp directory for the whole run,
// records a fingerprint of the REAL state dir before the suite, and runs this
// file AFTER every other test file. It fails when a test leaked into ~/.sdlc:
// a registration, a prune line, a hub start, a materialized runtime.
import { test } from 'node:test';
import { deepEqual, notEqual, ok } from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { fingerprintDiff, stateFingerprint } from '../helpers/state-fingerprint.mjs';

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
