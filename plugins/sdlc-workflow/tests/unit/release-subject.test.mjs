// Review 2026-09-08 — the release guard must recognize the commit `npm version`
// writes. `.npmrc` sets the subject to the historic `release(sdlc-workflow): vX`
// form, and RELEASE_SUBJECT also accepts a bare `vX.Y.Z` subject, so a bump made
// without the .npmrc message is still a release the guard watches.
import { test } from 'node:test';
import { equal, match } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_SUBJECT, evaluateDelivery } from '../../scripts/verify-release-pushed.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('RELEASE_SUBJECT accepts the release(sdlc-workflow): form and a bare vX.Y.Z subject', () => {
  equal(RELEASE_SUBJECT.test('release(sdlc-workflow): v9.154.0 — the wide-view repair'), true);
  equal(RELEASE_SUBJECT.test('v9.154.0'), true, 'the npm version default subject');
  equal(RELEASE_SUBJECT.test('v9.154.0 bumped by hand'), true);
  equal(RELEASE_SUBJECT.test('feat(wf): v2 of the thing'), false);
  equal(RELEASE_SUBJECT.test('fix: v9.1 regression'), false, 'two components are not a version');
  equal(RELEASE_SUBJECT.test('v9.154.0-rc1'), false, 'a pre-release suffix is not a release commit');
});

test('evaluateDelivery treats an old npm-version commit as undelivered', () => {
  const now = Date.now();
  const old = now - 48 * 3600 * 1000;
  const r = evaluateDelivery([{ sha: 'a', subject: 'v9.154.0', committedAtMs: old }], now, 12);
  equal(r.ok, false);
  equal(r.undelivered.length, 1);
});

test('.npmrc gives npm version the release(sdlc-workflow): subject', () => {
  const npmrc = readFileSync(join(PLUGIN_ROOT, '.npmrc'), 'utf-8');
  match(npmrc, /^message=release\(sdlc-workflow\): v%s$/m);
});
