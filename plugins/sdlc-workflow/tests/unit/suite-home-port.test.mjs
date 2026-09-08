// Review 2026-09-08 (second pass) — the suite's temp SDLC_HOME carries a
// hub-config.json with a private port. Without it the default port is the
// operator's, and the supervisor's "same runtime, untracked pid → reap" rule
// means any test that reaches the real supervisor reaps the operator's live hub.
import { test } from 'node:test';
import { equal, notEqual, ok } from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HUB_DEFAULT_PORT, LEGACY_DEFAULT_PORT, readHubConfig } from '../../lib/hub-config.mjs';

test('under run-all the suite home pins a private hub port', (t) => {
  // run-all sets the guard baseline; a file run directly has no suite home.
  if (!process.env.SDLC_STATE_GUARD_BASELINE) { t.skip('not under tests/run-all.mjs'); return; }
  const home = process.env.SDLC_HOME;
  ok(home && existsSync(join(home, 'hub-config.json')), 'run-all wrote hub-config.json into the temp home');
  const onDisk = JSON.parse(readFileSync(join(home, 'hub-config.json'), 'utf-8'));
  notEqual(onDisk.port, HUB_DEFAULT_PORT, 'never the operator port');
  notEqual(onDisk.port, LEGACY_DEFAULT_PORT);
  equal(readHubConfig({ create: false }).port, onDisk.port, 'the supervisor reads the same port');
});
