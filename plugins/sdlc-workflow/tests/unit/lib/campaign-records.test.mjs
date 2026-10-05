// Local records (campaign 13): the three-way sync between the main checkout and
// a worktree in a repo that does not track .ai/. No direction may lose a file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const R = await import('../../../lib/campaign-records.mjs');

function tree() {
  const top = mkdtempSync(path.join(os.tmpdir(), 'records '));
  const main = path.join(top, 'main');
  const wt = path.join(top, 'wt');
  mkdirSync(main);
  mkdirSync(wt);
  return { top, main, wt };
}

function put(root, rel, text) {
  const f = path.join(root, '.ai', ...rel.split('/'));
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text);
}

const read = (root, rel) => readFileSync(path.join(root, '.ai', ...rel.split('/')), 'utf8');
const has = (root, rel) => existsSync(path.join(root, '.ai', ...rel.split('/')));

test('in copies the main .ai/ tree, and never copies machine-local files, render caches, or what the main checkout owns', () => {
  const { top, main, wt } = tree();
  try {
    put(main, 'sdlc-config.json', '{"artifactTracking":"ignored"}');
    put(main, 'workflows/engine/00-index.md', 'engine v1');
    put(main, 'workflows/engine/.watch-state.json', '{}');
    put(main, '_view/engine/index.html', '<html>');
    put(main, 'workflows/b/work/campaign/ledger.json', '{}');
    const manifest = { files: {} };
    const res = R.recordsIn({ main, worktree: wt, manifest, exclude: (rel) => rel.startsWith('workflows/b/work/campaign/') });
    assert.deepEqual(res.copied.sort(), ['sdlc-config.json', 'workflows/engine/00-index.md']);
    assert.equal(read(wt, 'workflows/engine/00-index.md'), 'engine v1');
    assert.ok(!has(wt, 'workflows/engine/.watch-state.json'));
    assert.ok(!has(wt, '_view/engine/index.html'));
    assert.ok(!has(wt, 'workflows/b/work/campaign/ledger.json'));
    assert.equal(manifest.files['workflows/engine/00-index.md'].base, R.hashFile(path.join(main, '.ai', 'workflows', 'engine', '00-index.md')));
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('out brings back every new and changed worktree file, and never overwrites or deletes a main change', () => {
  const { top, main, wt } = tree();
  try {
    put(main, 'workflows/engine/00-index.md', 'index v1');
    put(main, 'workflows/engine/02-shape.md', 'shape v1');
    put(main, 'workflows/b/work/board.json', 'board v1');
    put(main, 'workflows/engine/notes.md', 'notes v1');
    put(main, 'pipeline-compliance.md', 'compliance v1');
    const manifest = { files: {} };
    R.recordsIn({ main, worktree: wt, manifest });
    // The drive: a new record, a changed record, a deleted record, and an edit the main checkout also made.
    put(wt, 'workflows/engine/05-implement-a.md', 'implement a');
    put(wt, 'workflows/engine/00-index.md', 'index v2 (drive)');
    rmSync(path.join(wt, '.ai', 'workflows', 'engine', 'notes.md'));
    put(wt, 'pipeline-compliance.md', 'compliance (drive)');
    // The main checkout meanwhile: the brainstorm edits its board, and someone edits the compliance file.
    put(main, 'workflows/b/work/board.json', 'board v2 (brainstorm)');
    put(main, 'pipeline-compliance.md', 'compliance (main)');
    const conflictsDir = path.join(top, 'conflicts');
    const res = R.recordsOut({ main, worktree: wt, manifest, conflictsDir });
    assert.deepEqual(res.copied.sort(), ['workflows/engine/00-index.md', 'workflows/engine/05-implement-a.md']);
    assert.equal(read(main, 'workflows/engine/05-implement-a.md'), 'implement a');
    assert.equal(read(main, 'workflows/engine/00-index.md'), 'index v2 (drive)');
    assert.equal(read(main, 'workflows/b/work/board.json'), 'board v2 (brainstorm)', 'the worktree did not change the board: the main change stays');
    assert.equal(read(main, 'workflows/engine/notes.md'), 'notes v1', 'a worktree delete never deletes in the main checkout');
    assert.deepEqual(res.deletedInWorktree, ['workflows/engine/notes.md']);
    assert.equal(read(main, 'pipeline-compliance.md'), 'compliance (main)', 'both changed: the main version stays');
    assert.equal(res.conflicts.length, 1);
    assert.equal(readFileSync(path.join(conflictsDir, 'pipeline-compliance.md'), 'utf8'), 'compliance (drive)', 'both changed: the worktree version is kept');
    assert.deepEqual(R.recordsPending({ main, worktree: wt, manifest }), [], 'after out, no worktree file exists only in the worktree');
    // A second out changes nothing and keeps no second copy.
    const again = R.recordsOut({ main, worktree: wt, manifest, conflictsDir: path.join(top, 'conflicts-2') });
    assert.deepEqual([again.copied, again.conflicts], [[], []]);
    assert.ok(!existsSync(path.join(top, 'conflicts-2')));
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('a file new on both sides with different content keeps both versions', () => {
  const { top, main, wt } = tree();
  try {
    const manifest = { files: {} };
    put(main, 'solutions/INDEX.md', 'main learning');
    put(wt, 'solutions/INDEX.md', 'worktree learning');
    const res = R.recordsOut({ main, worktree: wt, manifest, conflictsDir: path.join(top, 'c') });
    assert.equal(read(main, 'solutions/INDEX.md'), 'main learning');
    assert.equal(readFileSync(path.join(top, 'c', 'solutions', 'INDEX.md'), 'utf8'), 'worktree learning');
    assert.equal(res.conflicts[0].merged, false);
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('the workflow registry merges its rows when both sides changed it; the newer row wins', () => {
  const { top, main, wt } = tree();
  try {
    const head = '# .ai/workflows/INDEX.md registry';
    put(main, 'workflows/INDEX.md', `${head}\nengine\tactive\tfeature\tmain\t2026-10-01T00:00:00Z\nsquads\tactive\tfeature\tmain\t2026-10-01T00:00:00Z\n`);
    const manifest = { files: {} };
    R.recordsIn({ main, worktree: wt, manifest });
    put(wt, 'workflows/INDEX.md', `${head}\nengine\tactive\tfeature\twave-1--engine\t2026-10-05T10:00:00Z\nsquads\tactive\tfeature\tmain\t2026-10-01T00:00:00Z\n`);
    put(main, 'workflows/INDEX.md', `${head}\nengine\tactive\tfeature\tmain\t2026-10-01T00:00:00Z\nsquads\tactive\tfeature\tmain\t2026-10-05T11:00:00Z\nseason\tdefined\tfeature\tmain\t2026-10-05T11:00:00Z\n`);
    const res = R.recordsOut({ main, worktree: wt, manifest, conflictsDir: path.join(top, 'c') });
    assert.equal(res.conflicts[0].merged, true);
    const rows = read(main, 'workflows/INDEX.md').trim().split('\n');
    assert.equal(rows[0], head);
    assert.deepEqual(rows.slice(1).map((r) => r.split('\t')[0]), ['engine', 'season', 'squads']);
    assert.match(rows[1], /wave-1--engine/, 'the drive row is newer');
    assert.match(rows[3], /2026-10-05T11/, 'the main row is newer');
    assert.ok(existsSync(path.join(top, 'c', 'workflows', 'INDEX.md')), 'the worktree registry is kept as well');
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('refresh: a worktree file the drive did not touch takes the main change; a drive change and a drive delete stay', () => {
  const { top, main, wt } = tree();
  try {
    put(main, 'workflows/engine/00-index.md', 'index v1');
    put(main, 'workflows/engine/02-shape.md', 'shape v1');
    put(main, 'workflows/engine/03-slice.md', 'slice v1');
    const manifest = { files: {} };
    R.recordsIn({ main, worktree: wt, manifest });
    put(wt, 'workflows/engine/02-shape.md', 'shape (drive)');
    rmSync(path.join(wt, '.ai', 'workflows', 'engine', '03-slice.md'));
    put(main, 'workflows/engine/00-index.md', 'index v2 (main)');
    put(main, 'workflows/engine/02-shape.md', 'shape v2 (main)');
    put(main, 'workflows/season/00-index.md', 'season');
    const res = R.recordsIn({ main, worktree: wt, manifest });
    assert.equal(read(wt, 'workflows/engine/00-index.md'), 'index v2 (main)');
    assert.equal(read(wt, 'workflows/engine/02-shape.md'), 'shape (drive)');
    assert.ok(!has(wt, 'workflows/engine/03-slice.md'), 'a file the drive deleted is not restored');
    assert.equal(read(wt, 'workflows/season/00-index.md'), 'season');
    assert.deepEqual(res.keptInWorktree, ['workflows/engine/02-shape.md']);
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('pending names every worktree file whose content is nowhere else', () => {
  const { top, main, wt } = tree();
  try {
    put(main, 'workflows/engine/00-index.md', 'index v1');
    const manifest = { files: {} };
    R.recordsIn({ main, worktree: wt, manifest });
    assert.deepEqual(R.recordsPending({ main, worktree: wt, manifest }), []);
    put(wt, 'workflows/engine/06-verify.md', 'verify');
    put(main, 'workflows/engine/00-index.md', 'index v2 (main)');
    assert.deepEqual(R.recordsPending({ main, worktree: wt, manifest }).map((p) => p.rel), ['workflows/engine/06-verify.md'], 'an unchanged base copy is not pending; a new file is');
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('the records lock admits one holder at a time and takes over a stale lock', () => {
  const { top } = tree();
  try {
    const file = path.join(top, 'records', '.lock');
    const inner = R.withRecordsLock(file, 'W1', () => {
      assert.throws(() => R.withRecordsLock(file, 'W2', () => 'no', { waitMs: 300 }), /held by W1/);
      return 'yes';
    });
    assert.equal(inner, 'yes');
    assert.ok(!existsSync(file), 'the lock is released after the sync');
    writeFileSync(file, JSON.stringify({ holder: 'dead', at: '2020-01-01T00:00:00Z' }));
    assert.equal(R.withRecordsLock(file, 'W3', () => 'taken over'), 'taken over');
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('ignoredAtRisk: ignored files outside .ai/ that are not build folders or node_modules', () => {
  const porcelain = ['!! .ai/', '!! node_modules/', '!! target/', '!! .env.local', '!! notes/scratch.txt', '!! packages/web/node_modules/', '?? new.txt'].join('\n');
  assert.deepEqual(R.ignoredAtRisk(porcelain, ['target']), ['.env.local', 'notes/scratch.txt']);
});
