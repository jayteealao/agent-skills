// unitOf: each path of the records repo has one unit, or none when anyone may add it; a path the
// layout does not know is refused. The last test runs over the real records clone of this
// computer when there is one.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordsHome } from '../../lib/records-root.mjs';
import { unitOf, unknownPaths } from '../../lib/records-units.mjs';

const unit = (p) => unitOf(p)?.unit;

test('the files of a workflow, and its design files, are the unit of the workflow', () => {
  assert.equal(unit('soccer/match-day/00-index.md'), 'soccer/match-day');
  assert.equal(unit('soccer/match-day/verify-evidence/s1/shot.png'), 'soccer/match-day');
  assert.equal(unit('soccer/match-day/.test-receipt-s1.json'), 'soccer/match-day');
  for (const d of ['versions', 'captures', 'reviews']) assert.equal(unit(`soccer/_design/${d}/match-day/v1/a.png`), 'soccer/match-day', d);
  assert.equal(unitOf('soccer/_design/versions/match-day/v1/a.png').slug, 'match-day');
});

test('an inbox, a comment and an approval are add-only and belong to no unit', () => {
  for (const p of ['soccer/match-day/inbox/0193-ab', 'soccer/_design/comments/home.json', 'soccer/_design/comments/home/e1.json', 'soccer/_design/approvals/abc123/manifest.json']) {
    const u = unitOf(p);
    assert.equal(u.addOnly, true, p);
    assert.equal(u.unit, null, p);
  }
  // A folder called inbox deeper in a workflow is the workflow's.
  assert.equal(unit('soccer/match-day/inbox/old/x.md'), 'soccer/match-day');
});

test('a screen, a project file and a machine are units of their own', () => {
  assert.equal(unit('soccer/_design/items/home/checks.json'), 'soccer/_design/items/home');
  assert.equal(unit('soccer/_design/checks.json'), 'soccer/_design/checks.json');
  assert.equal(unit('soccer/notes.md'), 'soccer/notes.md');
  assert.equal(unit('.machines/dragon.json'), '.machines/dragon');
  assert.equal(unit('.notes/v10-evidence/an1.mjs'), '.notes');
  assert.equal(unit('.gitattributes'), '.repo');
});

test('a path the layout does not know is refused', () => {
  for (const p of ['', '/abs/x', 'C:/x/y', 'a\\b', 'soccer/../x', 'soccer//x', 'README.md', 'Soccer/x/y', 'soccer/.hidden', '.machines/x/y.json', '.machines/notes.txt',
    'soccer/_design/versions/x.png', 'soccer/_design/other/x/y', 'soccer/_design/items/x.json', 'soccer/_design/approvals/x.json', '.other/x']) {
    assert.equal(unitOf(p), null, p);
  }
});

test('every path of the records clone of this computer has a unit', (t) => {
  const home = recordsHome();
  if (!existsSync(join(home, '.git'))) { t.skip('no records clone on this computer'); return; }
  const r = spawnSync('git', ['-C', home, '-c', 'core.quotepath=false', 'ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) { t.skip('the records clone has no HEAD'); return; }
  const paths = r.stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(unknownPaths(paths).slice(0, 20), []);
});
