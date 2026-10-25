// The scratch worktrees of a workflow: one place, kept on the same commit, removed with their
// untracked files, and never removed while they hold a link. git runs for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { addScratchWorktree, removeScratchWorktrees, scratchWorktreeDir, worktrees } from '../../lib/scratch-worktree.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..', '..');
const WF = path.join(PLUGIN_ROOT, 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function repo() {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'swt-')));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(root, 'add', 'a.txt');
  git(root, 'commit', '-q', '-m', 'one');
  const first = git(root, 'rev-parse', 'HEAD');
  writeFileSync(path.join(root, 'a.txt'), 'two\n');
  git(root, 'commit', '-q', '-am', 'two');
  return { root, first, second: git(root, 'rev-parse', 'HEAD'), done: () => rmSync(root, { recursive: true, force: true }) };
}

test('add: a detached copy in .scratch/worktrees/<slug>/<name>, kept on the same commit, refused on another', () => {
  const r = repo();
  try {
    const a = addScratchWorktree(r.root, 'wf1', 'base-s1', r.first);
    assert.equal(a.ok, true, a.error);
    assert.ok(same(a.path, path.join(r.root, '.scratch', 'worktrees', 'wf1', 'base-s1')));
    assert.equal(readFileSync(path.join(a.path, 'a.txt'), 'utf8').trim(), 'one');
    assert.equal(git(a.path, 'rev-parse', 'HEAD'), r.first);
    // The main checkout does not see the copy: .scratch/ is excluded.
    assert.equal(git(r.root, 'status', '--porcelain'), '');
    assert.equal(addScratchWorktree(r.root, 'wf1', 'base-s1', r.first).reused, true);
    const other = addScratchWorktree(r.root, 'wf1', 'base-s1', r.second);
    assert.equal(other.ok, false);
    assert.match(other.error, /Remove it first/);
    assert.equal(addScratchWorktree(r.root, 'wf1', 'x', 'no-such-ref').ok, false);
  } finally { r.done(); }
});

test('a name or slug that leaves the folder is refused', () => {
  const r = repo();
  try {
    assert.throws(() => scratchWorktreeDir(r.root, 'wf1', '../out'), /must match/);
    assert.throws(() => scratchWorktreeDir(r.root, '..', 'base'), /must match/);
  } finally { r.done(); }
});

test('remove: the copies of one workflow go with their untracked files; another workflow keeps its copy', () => {
  const r = repo();
  try {
    const a = addScratchWorktree(r.root, 'wf1', 'base-s1', r.first);
    const b = addScratchWorktree(r.root, 'wf1', 'tag', r.second);
    const c = addScratchWorktree(r.root, 'wf2', 'base', r.first);
    // A build cache with many files, and a plain untracked file.
    mkdirSync(path.join(a.path, 'target', 'debug'), { recursive: true });
    writeFileSync(path.join(a.path, 'target', 'CACHEDIR.TAG'), 'Signature: 8a477f597d28d172789f06886806bc55\n');
    writeFileSync(path.join(a.path, 'target', 'debug', 'x.bin'), 'x');
    writeFileSync(path.join(b.path, 'log.txt'), 'log');
    const out = removeScratchWorktrees(r.root, 'wf1');
    assert.deepEqual([out.removed.length, out.refused.length, out.failed.length], [2, 0, 0]);
    assert.equal(existsSync(path.join(r.root, '.scratch', 'worktrees', 'wf1')), false);
    assert.equal(existsSync(c.path), true);
    assert.equal(worktrees(r.root).length, 2);
    assert.deepEqual(removeScratchWorktrees(r.root, 'wf1'), { removed: [], refused: [], failed: [] });
  } finally { r.done(); }
});

test('remove: a copy that holds a link is kept, and the files that the link names survive', () => {
  const r = repo();
  const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'swt-out-')));
  try {
    writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    const a = addScratchWorktree(r.root, 'wf1', 'base', r.first);
    symlinkSync(outside, path.join(a.path, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    const out = removeScratchWorktrees(r.root, 'wf1', 'base');
    assert.equal(out.removed.length, 0);
    assert.equal(out.refused.length, 1);
    assert.match(out.refused[0].reason, /node_modules/);
    assert.equal(readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(existsSync(a.path), true);
  } finally { r.done(); rmSync(outside, { recursive: true, force: true }); }
});

test('wf.mjs worktree add prints the path; remove exits 0, then 1 while a copy stays', () => {
  const r = repo();
  const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'swt-out-')));
  const wf = (...args) => spawnSync(process.execPath, [WF, ...args], { encoding: 'utf8' });
  try {
    const add = wf('worktree', 'add', r.root, 'wf1', 'base', r.first);
    assert.equal(add.status, 0, add.stderr);
    assert.ok(same(add.stdout.trim(), path.join(r.root, '.scratch', 'worktrees', 'wf1', 'base')));
    const rm = wf('worktree', 'remove', r.root, 'wf1');
    assert.equal(rm.status, 0, rm.stderr);
    assert.match(rm.stdout, /^removed /);
    assert.equal(wf('worktree', 'remove', r.root, 'wf1').stdout.trim(), 'no scratch worktree');
    const again = wf('worktree', 'add', r.root, 'wf1', 'base', r.first).stdout.trim();
    symlinkSync(outside, path.join(again, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const kept = wf('worktree', 'remove', r.root, 'wf1', 'base');
    assert.equal(kept.status, 1);
    assert.match(kept.stdout, /^kept .*holds links/);
    assert.match(wf('help', 'worktree').stdout, /worktree add <root> <slug> <name> <commit>/);
  } finally { r.done(); rmSync(outside, { recursive: true, force: true }); }
});
