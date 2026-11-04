// The suite never runs against the real ~/.sdlc.
//
// tests/run-all.mjs sets SDLC_HOME to a fresh temp directory for the whole run, and runs this
// file AFTER every other test file.
import { test } from 'node:test';
import { notEqual, ok } from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const REAL_HOME = resolve(homedir(), '.sdlc');

test('state-dir guard: the run used a temp SDLC_HOME, not the real ~/.sdlc', () => {
  const home = process.env.SDLC_HOME;
  ok(home && home.trim(), 'SDLC_HOME is set for the run (tests/run-all.mjs)');
  notEqual(resolve(home), REAL_HOME, 'SDLC_HOME must not be the real state dir');
});
