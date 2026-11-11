// The release points the wf.mjs shim at the installed copy of the released version, forward only,
// and says so when the pointer is still behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pointShimAtInstall } from '../../scripts/release.mjs';
import { readShimCurrent, shimProblems, writeShim } from '../../lib/wf-shim.mjs';

function withHome(fn) {
  const home = mkdtempSync(path.join(tmpdir(), 'sdlc-release-shim-'));
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const plugin = (v) => {
    const dir = path.join(home, 'cache', v);
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts', 'wf.mjs'), '');
    return dir;
  };
  try { return fn({ home, plugin }); } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
}

test('the release moves a pointer that names the previous version to the installed released copy', () => withHome(({ plugin }) => {
  writeShim(plugin('10.0.0-next.22'), { version: '10.0.0-next.22', host: 'claude' });
  assert.match(shimProblems({ version: '10.0.0-next.23' }).join('\n'), /names 10\.0\.0-next\.22, behind 10\.0\.0-next\.23/);
  const installs = [
    { scope: 'project', version: '10.0.0-next.21', installPath: plugin('10.0.0-next.21') },
    { scope: 'user', version: '10.0.0-next.23', installPath: plugin('10.0.0-next.23') },
  ];
  const r = pointShimAtInstall({}, { version: '10.0.0-next.23' }, { installs });
  assert.equal(r.ok, true);
  assert.equal(r.version, '10.0.0-next.23');
  assert.equal(readShimCurrent().cli, path.join(installs[1].installPath, 'scripts', 'wf.mjs'));
  assert.deepEqual(shimProblems({ version: '10.0.0-next.23' }), []);
}));

test('the pointer stays forward of an older install, and a pointer still behind is not ok and names the fix', () => withHome(({ plugin }) => {
  writeShim(plugin('10.0.0-next.30'), { version: '10.0.0-next.30', host: 'claude' });
  const ahead = pointShimAtInstall({}, { version: '10.0.0-next.23' }, { installs: [{ scope: 'user', version: '10.0.0-next.23', installPath: plugin('10.0.0-next.23') }] });
  assert.equal(ahead.ok, true, 'a newer pointer is not behind');
  assert.equal(readShimCurrent().version, '10.0.0-next.30', 'the pointer never moves back');

  // The reinstall left the old copy: the pointer cannot reach the released version.
  const old = pointShimAtInstall({}, { version: '10.0.0-next.31' }, { installs: [{ scope: 'user', version: '10.0.0-next.30', installPath: plugin('10.0.0-next.30') }] });
  assert.equal(old.ok, false);
  assert.match(old.reason, /still runs 10\.0\.0-next\.30, behind 10\.0\.0-next\.31/);
  assert.match(old.fix, /^node ".*10\.0\.0-next\.30[\\/]lib[\\/]wf-shim\.mjs"$/);

  const none = pointShimAtInstall({}, { version: '10.0.0-next.31' }, { installs: [] });
  assert.equal(none.ok, false);
  assert.match(none.reason, /no installed copy/);
}));
