// The release guard must recognize the commit `npm run release` writes, the
// `release(sdlc-workflow): vX` form, and a bare `vX.Y.Z` subject of an older
// hand release.
import { test } from 'node:test';
import { equal } from 'node:assert/strict';

import { RELEASE_SUBJECT, evaluateDelivery } from '../../scripts/verify-release-pushed.mjs';
import { SUBJECT } from '../../scripts/release.mjs';

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

test('the subject npm run release writes is one the guard watches, for a release and a next', () => {
  equal(RELEASE_SUBJECT.test(SUBJECT('9.202.0')), true);
  equal(RELEASE_SUBJECT.test(SUBJECT('10.0.0-next.3')), true);
});
