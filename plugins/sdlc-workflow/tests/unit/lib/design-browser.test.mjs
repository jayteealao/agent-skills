// The browser of the checks: which one a run tries, what it says when none starts, and the
// profile folders that a run leaves in the temp folder.

import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PROFILE_PREFIXES, browserCandidates, noBrowserReason, removeProfile, sweepProfiles } from '../../../lib/design-browser.mjs';
import { checkBrowser, openBrowser } from '../../../lib/design-check.mjs';

test('a set SDLC_BROWSER is the only candidate, and none gives no browser', () => {
  assert.deepEqual(browserCandidates('.', { SDLC_BROWSER: 'none' }), []);
  assert.deepEqual(browserCandidates('.', { SDLC_BROWSER: '/opt/chrome' }), [{ path: '/opt/chrome', kind: 'chromium', from: 'SDLC_BROWSER' }]);
  assert.equal(browserCandidates('.', { SDLC_BROWSER: 'fake.mjs' })[0].kind, 'script');
  assert.equal(checkBrowser('.', { SDLC_BROWSER: 'fake.mjs' }), null, 'a script is not a browser for the checks');
});

test('the reason names a wrong SDLC_BROWSER, a script, and the browsers that did not start', () => {
  assert.match(noBrowserReason('.', { SDLC_BROWSER: 'none' }), /SDLC_BROWSER is none/);
  assert.match(noBrowserReason('.', { SDLC_BROWSER: '/no/such/chrome' }), /SDLC_BROWSER names \/no\/such\/chrome, which is not a file/);
  assert.match(noBrowserReason('.', { SDLC_BROWSER: 'fake.mjs' }), /names a script \(fake\.mjs\)/);
  assert.match(noBrowserReason('.', { SDLC_BROWSER: process.execPath }), /and it did not start/);
  assert.match(noBrowserReason('.', {}, [{ path: 'a' }, { path: 'b' }]), /2 browser\(s\) did not start \(a, b\)/);
  assert.match(noBrowserReason('.', {}), /install Chrome, Edge or Chromium, or set SDLC_BROWSER/);
});

test('the sweep removes the day-old profile folders of the checks, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-sweep-test-'));
  try {
    const now = Date.now();
    const old = new Date(now - 2 * 24 * 3600 * 1000);
    const make = (name, when) => {
      mkdirSync(join(dir, name, 'Default'), { recursive: true });
      writeFileSync(join(dir, name, 'Default', 'Preferences'), '{}');
      if (when) utimesSync(join(dir, name), when, when);
    };
    make('sdlc-check-old', old);
    make('sdlc-board-old', old);
    make('sdlc-check-new', null);
    make('other-old', old);
    writeFileSync(join(dir, 'sdlc-check-file'), 'x');
    utimesSync(join(dir, 'sdlc-check-file'), old, old);
    assert.deepEqual([...PROFILE_PREFIXES], ['sdlc-check-', 'sdlc-board-']);
    assert.equal(sweepProfiles({ dir, now }), 2);
    assert.deepEqual(['sdlc-check-old', 'sdlc-board-old', 'sdlc-check-new', 'other-old', 'sdlc-check-file'].map((n) => existsSync(join(dir, n))), [false, false, true, true, true]);
    assert.equal(sweepProfiles({ dir, now }), 0, 'a second sweep finds nothing');
    assert.equal(sweepProfiles({ dir: join(dir, 'gone') }), 0, 'a folder that is gone is no error');
    assert.equal(removeProfile(join(dir, 'sdlc-check-new')), true);
    assert.equal(existsSync(join(dir, 'sdlc-check-new')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a browser that is not a file, and no browser, open nothing and leave no process handler', async () => {
  const before = process.listenerCount('exit');
  assert.equal(await openBrowser('.', { browser: null }), null);
  assert.equal(await openBrowser('.', { browser: { path: join(tmpdir(), 'no-such-browser.exe'), kind: 'chromium' } }), null);
  assert.equal(process.listenerCount('exit'), before);
});
