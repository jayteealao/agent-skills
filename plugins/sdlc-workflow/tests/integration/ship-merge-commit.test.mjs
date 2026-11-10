// The finish of ship after a merge commit: the commits of the branch stay on the base, the
// first-parent log gives one line for the PR, and the branch goes here and on the remote.
// git runs for real against a bare remote; gh is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { finishShip } from '../../lib/last-mile.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FAKE_GH = path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'fake-gh.mjs');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tmp = (label) => realpathSync(mkdtempSync(path.join(os.tmpdir(), label)));

function commit(root, file, text) {
  writeFileSync(path.join(root, file), text);
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', file);
}

const fakeRun = (env = {}) => (cmd, args, { cwd } = {}) => {
  const r = cmd === 'gh'
    ? spawnSync(process.execPath, [FAKE_GH, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
    : spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
};

/** A repo with two step commits on feat/x, pushed, and the PR merged by a merge commit on the remote. */
function mergedByMergeCommit() {
  const bare = tmp('smc-remote-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const root = tmp('smc-root-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  commit(root, 'a.txt', 'a\n');
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', '-u', 'origin', 'main');
  git(root, 'switch', '-q', '-c', 'feat/x');
  commit(root, 'step1.txt', '1\n');
  commit(root, 'step2.txt', '2\n');
  git(root, 'push', '-q', '-u', 'origin', 'feat/x');
  const steps = git(root, 'rev-list', '--reverse', 'main..feat/x').split(/\r?\n/);
  // The merge commit happens on the remote, as GitHub does it.
  const other = tmp('smc-other-');
  git(other, 'clone', '-q', bare, '.');
  git(other, 'config', 'user.email', 'o@t');
  git(other, 'config', 'user.name', 'o');
  git(other, 'merge', '-q', '--no-ff', '-m', 'Merge pull request #7 from o/feat/x', 'origin/feat/x');
  git(other, 'push', '-q', 'origin', 'main');
  return { root, other, steps, done: () => [bare, root, other].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

test('finish after a merge commit: the base fast-forwards, the step commits stay on it, the branch goes', () => {
  const p = mergedByMergeCommit();
  try {
    const r = finishShip(p.root, { branch: 'feat/x', base: 'main', pr: 7, run: fakeRun() });
    assert.equal(r.ok, true, r.reason);
    assert.equal(git(p.root, 'branch', '--show-current'), 'main');
    assert.equal(git(p.root, 'rev-parse', 'main'), git(p.other, 'rev-parse', 'main'));
    for (const sha of p.steps) assert.doesNotThrow(() => git(p.root, 'merge-base', '--is-ancestor', sha, 'main'), `step ${sha.slice(0, 8)} is on the base`);
    assert.deepEqual(git(p.root, 'log', '--first-parent', '--format=%s', 'main').split(/\r?\n/), ['Merge pull request #7 from o/feat/x', 'a.txt']);
    // The merge commit reverts as one commit by its first parent, as the rollback says.
    assert.equal(git(p.root, 'rev-list', '--count', 'HEAD^1..HEAD'), '3', 'the merge range holds the two steps and the merge');
    assert.equal(git(p.root, 'branch', '--list', 'feat/x'), '', 'the local branch is gone');
    assert.equal(spawnSync('git', ['-C', p.root, 'ls-remote', '--exit-code', '--heads', 'origin', 'feat/x']).status, 2, 'the remote branch is gone');
  } finally { p.done(); }
});

test('finish after a merge commit with no PR number: the branch is merged in git terms, so a plain delete works', () => {
  const p = mergedByMergeCommit();
  try {
    const r = finishShip(p.root, { branch: 'feat/x', base: 'main', run: fakeRun() });
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.steps.find((s) => s[0] === 'delete-local'), ['delete-local', true]);
  } finally { p.done(); }
});
