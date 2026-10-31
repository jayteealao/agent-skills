// The clone of an older version kept each open workflow on a branch `live/<project>/<slug>`. The
// move puts the folder of each such branch on the main branch once, keeps the ref under
// refs/archive/live/, and lists it in records-state.json. A local bare repo stands in for the
// records remote; SDLC_HOME is a temp folder.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { commitPaths, migrateLive, pushRecords, readState } from '../../lib/records-sync.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const put = (dir, file, text) => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
const read = (file) => readFileSync(file, 'utf8');

/**
 * A clone as the older version left it: the main branch, and two live branches. `live/notes/w1`
 * changes a folder that the main branch holds, and its remote tip is one commit ahead of the
 * local tip. `live/notes/old` is a workflow of the old Markdown layout (no state.yaml) that the
 * main branch lacks. The working tree shows the local live tips, with one uncommitted change and
 * one new file.
 */
function oldClone() {
  const top = mkdtempSync(join(tmpdir(), 'records-migrate-'));
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off' });
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const builder = join(top, 'builder');
  git(top, 'clone', '-q', bare, builder);
  put(builder, '.gitignore', '*/INDEX.md\n');
  put(builder, 'notes/w1/00-index.md', 'main copy\n');
  put(builder, 'notes/done/00-index.md', 'closed\n');
  git(builder, 'add', '-A');
  git(builder, 'commit', '-q', '-m', 'main');
  git(builder, 'push', '-q', 'origin', 'main');
  git(builder, 'checkout', '-q', '-b', 'live/notes/w1');
  put(builder, 'notes/w1/00-index.md', 'live copy\n');
  put(builder, 'notes/w1/state.yaml', 'current-stage: implement\n');
  put(builder, 'notes/w1/plan.md', 'live plan\n');
  git(builder, 'add', '-A');
  git(builder, 'commit', '-q', '-m', 'notes/w1: plan');
  git(builder, 'push', '-q', 'origin', 'live/notes/w1');
  git(builder, 'checkout', '-q', 'main');
  git(builder, 'checkout', '-q', '-b', 'live/notes/old');
  put(builder, 'notes/old/00-index.md', '---\nslug: old\nstatus: active\n---\n');
  put(builder, 'notes/old/01-intake.md', '# Intake\n');
  git(builder, 'add', '-A');
  git(builder, 'commit', '-q', '-m', 'notes/old: intake');
  git(builder, 'push', '-q', 'origin', 'live/notes/old');

  const home = join(top, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha' } }));
  process.env.SDLC_HOME = home;
  const clone = join(home, 'records');
  git(top, 'clone', '-q', bare, clone);
  for (const n of ['notes/w1', 'notes/old']) git(clone, 'update-ref', `refs/heads/live/${n}`, `refs/remotes/origin/live/${n}`);
  const localW1 = git(clone, 'rev-parse', 'refs/heads/live/notes/w1');
  const localOld = git(clone, 'rev-parse', 'refs/heads/live/notes/old');
  // Another machine pushed one more commit to the live branch of w1.
  git(builder, 'checkout', '-q', 'live/notes/w1');
  put(builder, 'notes/w1/remote.md', 'from the remote\n');
  git(builder, 'add', '-A');
  git(builder, 'commit', '-q', '-m', 'notes/w1: remote');
  git(builder, 'push', '-q', 'origin', 'live/notes/w1');
  const remoteW1 = git(builder, 'rev-parse', 'HEAD');
  // The working tree shows the local live tips; the index holds the main tip.
  git(clone, 'checkout', 'refs/heads/live/notes/w1', '--', 'notes/w1');
  git(clone, 'checkout', 'refs/heads/live/notes/old', '--', 'notes/old');
  git(clone, 'reset', '-q');
  put(clone, 'notes/old/01-intake.md', '# Intake\n\nedited here\n');
  put(clone, 'notes/w1/loose.md', 'not committed yet\n');
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { top, bare, home, clone, localW1, localOld, remoteW1, done };
}

const tree = (clone, ref = 'HEAD') => git(clone, 'ls-tree', '-r', '--name-only', ref).split('\n');

test('records migrate --dry-run lists each live branch and changes nothing', () => {
  const w = oldClone();
  try {
    const head = git(w.clone, 'rev-parse', 'HEAD');
    const r = spawnSync(process.execPath, [WF, 'records', 'migrate', '--dry-run'], { encoding: 'utf8', env: process.env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /dry run: nothing changed/);
    assert.match(r.stdout, /refs\/heads\/live\/notes\/w1: the folder of .* goes on the main branch/);
    assert.match(r.stdout, /refs\/heads\/live\/notes\/old: the folder of .* goes on the main branch/);
    assert.equal(git(w.clone, 'rev-parse', 'HEAD'), head);
    assert.equal(git(w.clone, 'for-each-ref', '--format=%(refname)', 'refs/heads/live/').split('\n').length, 2);
    assert.equal(readState().liveMigrated, undefined);
  } finally { w.done(); }
});

test('the move puts each live folder on the main branch, archives the refs, and keeps the uncommitted files', () => {
  const w = oldClone();
  try {
    const r = migrateLive(w.clone);
    assert.deepEqual([r.moved.length, r.failed.length], [2, 0], JSON.stringify(r.failed));
    assert.equal(git(w.clone, 'for-each-ref', 'refs/heads/live/'), '', 'no live branch is left');
    // The remote tip of w1 was newer: the move took it.
    assert.equal(git(w.clone, 'rev-parse', 'refs/archive/live/notes/w1'), w.remoteW1);
    assert.equal(git(w.clone, 'rev-parse', 'refs/archive/live/notes/old'), w.localOld);
    // The main branch holds both folders; the live copy of w1 won over the main copy.
    const files = tree(w.clone);
    for (const f of ['notes/w1/state.yaml', 'notes/w1/plan.md', 'notes/w1/remote.md', 'notes/old/00-index.md', 'notes/old/01-intake.md', 'notes/done/00-index.md']) assert.ok(files.includes(f), f);
    assert.equal(git(w.clone, 'show', 'HEAD:notes/w1/00-index.md'), 'live copy');
    assert.equal(git(w.clone, 'show', 'HEAD~2:notes/w1/00-index.md'), 'main copy', 'the old main tree stays in the history');
    assert.deepEqual(git(w.clone, 'log', '-2', '--format=%s').split('\n').sort(), ['notes/old: the records of the live branch', 'notes/w1: the records of the live branch']);
    // The working tree: the file of the newer remote tip is written; the uncommitted files stay.
    assert.equal(read(join(w.clone, 'notes', 'w1', 'remote.md')), 'from the remote\n');
    assert.equal(read(join(w.clone, 'notes', 'old', '01-intake.md')), '# Intake\n\nedited here\n');
    assert.equal(read(join(w.clone, 'notes', 'w1', 'loose.md')), 'not committed yet\n');
    assert.deepEqual(git(w.clone, 'status', '--porcelain', '--', 'notes/').split('\n').map((l) => l.trim()).sort(), ['?? notes/w1/loose.md', 'M notes/old/01-intake.md']);
    // The state lists each ref and its last tip, so a person can restore it.
    const s = readState();
    assert.ok(s.liveMigrated);
    assert.deepEqual(s.migratedLive.map((m) => [m.ref, m.sha]).sort(), [['refs/heads/live/notes/old', w.localOld], ['refs/heads/live/notes/w1', w.remoteW1]]);
    assert.equal(s.migratedLive.find((m) => m.ref.endsWith('/w1')).local, w.localW1);
    // The archive refs are never pushed.
    assert.equal(pushRecords(w.clone).pushed, true);
    assert.ok(tree(w.bare, 'main').includes('notes/old/01-intake.md'));
    assert.equal(git(w.bare, 'for-each-ref', 'refs/archive/'), '');
    // A second move finds nothing.
    assert.deepEqual(migrateLive(w.clone).moved, []);
  } finally { w.done(); }
});

test('the first records commit of the new version moves the live branches before it commits', () => {
  const w = oldClone();
  try {
    put(w.clone, 'notes/w1/notes.md', 'after the update\n');
    const c = commitPaths(w.clone, { paths: ['notes/w1'], message: 'notes/w1: notes' });
    assert.ok(c);
    assert.equal(git(w.clone, 'for-each-ref', 'refs/heads/live/'), '');
    assert.ok(readState().liveMigrated);
    assert.equal(git(w.clone, 'log', '-1', '--format=%s'), 'notes/w1: notes');
    const changed = git(w.clone, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    assert.deepEqual(changed, ['notes/w1/loose.md', 'notes/w1/notes.md'], 'the commit holds only the new files of w1');
    assert.ok(tree(w.clone).includes('notes/w1/remote.md'));
    assert.ok(existsSync(join(w.clone, 'notes', 'old', '00-index.md')));
  } finally { w.done(); }
});
