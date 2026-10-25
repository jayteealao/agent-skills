// The last mile of ship in code: the base check, the merge facts, the readiness gaps, and the
// finish after the merge. git runs for real against a bare remote; gh is a fake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { baseCheck, finishShip, mergeCommand, readyGaps, shipFacts } from '../../lib/last-mile.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..', '..');
const FAKE_GH = path.join(PLUGIN_ROOT, 'tests', 'fixtures', 'fake-gh.mjs');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tmp = (label) => realpathSync(mkdtempSync(path.join(os.tmpdir(), label)));

function commit(root, file, text) {
  writeFileSync(path.join(root, file), text);
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', file);
}

/** A repo with a bare remote, and a second clone that can move the remote. */
function repoPair() {
  const bare = tmp('lm-remote-');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  const root = tmp('lm-root-');
  git(root, 'init', '-q', '-b', 'main');
  for (const r of [root]) { git(r, 'config', 'user.email', 't@t'); git(r, 'config', 'user.name', 't'); }
  commit(root, 'a.txt', 'a\n');
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', '-u', 'origin', 'main');
  const other = tmp('lm-other-');
  git(other, 'clone', '-q', bare, '.');
  git(other, 'config', 'user.email', 'o@t');
  git(other, 'config', 'user.name', 'o');
  return { bare, root, other, done: () => [bare, root, other].forEach((d) => rmSync(d, { recursive: true, force: true })) };
}

/** A runner whose gh is the fake, with its answers set by the env of the call. */
const fakeRun = (env = {}) => (cmd, args, { cwd } = {}) => {
  const r = cmd === 'gh'
    ? spawnSync(process.execPath, [FAKE_GH, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
    : spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() };
};

test('base check: even, behind (fast-forwarded, checked out or not), ahead, diverged', () => {
  const p = repoPair();
  try {
    assert.equal(baseCheck(p.root, 'main').state, 'even');
    commit(p.other, 'b.txt', 'b\n');
    git(p.other, 'push', '-q', 'origin', 'main');
    const behind = baseCheck(p.root, 'main');
    assert.deepEqual([behind.state, behind.fastForwarded, behind.stop], ['behind', true, false]);
    assert.equal(git(p.root, 'rev-parse', 'main'), git(p.other, 'rev-parse', 'main'));
    // Not checked out: the fast-forward moves the ref only.
    git(p.root, 'switch', '-q', '-c', 'work');
    commit(p.other, 'c.txt', 'c\n');
    git(p.other, 'push', '-q', 'origin', 'main');
    assert.equal(baseCheck(p.root, 'main').fastForwarded, true);
    assert.equal(git(p.root, 'rev-parse', 'main'), git(p.other, 'rev-parse', 'main'));
    git(p.root, 'switch', '-q', 'main');
    commit(p.root, 'd.txt', 'd\n');
    assert.deepEqual([baseCheck(p.root, 'main').state, baseCheck(p.root, 'main').stop], ['ahead', false]);
    commit(p.other, 'e.txt', 'e\n');
    git(p.other, 'push', '-q', 'origin', 'main');
    const div = baseCheck(p.root, 'main');
    assert.deepEqual([div.state, div.ahead, div.behind, div.stop], ['diverged', 1, 1, true]);
  } finally { p.done(); }
});

test('ship facts: the plan method when the repo allows it, the rulesets narrow it, a review stops a direct merge', () => {
  const root = tmp('lm-facts-');
  try {
    mkdirSync(path.join(root, '.ai'));
    writeFileSync(path.join(root, '.ai', 'ship-plan.md'), '---\ntype: ship-plan\ngovernance:\n  merge:\n    method: merge\n---\n');
    let f = shipFacts(root, 'main', { run: fakeRun() });
    assert.deepEqual([f.method, f.allowed, f.direct], ['merge', ['squash', 'merge'], true]);
    assert.equal(mergeCommand(f, 7), 'gh pr merge 7 --merge --delete-branch');
    const rules = JSON.stringify([
      { type: 'pull_request', parameters: { required_approving_review_count: 1, allowed_merge_methods: ['squash'] } },
      { type: 'required_status_checks', parameters: { required_status_checks: [{ context: 'ci' }] } },
    ]);
    f = shipFacts(root, 'main', { run: fakeRun({ FAKE_GH_RULES: rules }) });
    assert.deepEqual([f.method, f.planMethodAllowed, f.requiredReviews, f.requiredChecks, f.direct], ['squash', false, 1, ['ci'], false]);
    const gaps = readyGaps(root, { run: fakeRun({ FAKE_GH_RULES: rules }) });
    assert.deepEqual(gaps.map((g) => g.code), ['plan-method-forbidden']);
    rmSync(path.join(root, '.ai', 'ship-plan.md'));
    assert.deepEqual(readyGaps(root, { run: fakeRun() }).map((g) => g.code), ['no-plan']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('finish: a merged PR fast-forwards the base, switches to it, and deletes the branch here and there', () => {
  const p = repoPair();
  try {
    git(p.root, 'switch', '-q', '-c', 'feat/x');
    commit(p.root, 'x.txt', 'x\n');
    git(p.root, 'push', '-q', '-u', 'origin', 'feat/x');
    // The squash merge happens on the remote, as GitHub does it.
    git(p.other, 'pull', '-q', 'origin', 'main');
    commit(p.other, 'x.txt', 'x\n');
    git(p.other, 'push', '-q', 'origin', 'main');
    const notMerged = finishShip(p.root, { branch: 'feat/x', base: 'main', pr: 7, run: fakeRun({ FAKE_GH_PR: '{"state":"OPEN"}' }) });
    assert.match(notMerged.reason, /OPEN, not merged/);
    const r = finishShip(p.root, { branch: 'feat/x', base: 'main', pr: 7, run: fakeRun() });
    assert.equal(r.ok, true, r.reason);
    assert.equal(git(p.root, 'branch', '--show-current'), 'main');
    assert.equal(git(p.root, 'rev-parse', 'main'), git(p.other, 'rev-parse', 'main'));
    assert.equal(git(p.root, 'branch', '--list', 'feat/x'), '');
    assert.equal(git(p.bare, 'branch', '--list', 'feat/x'), '', 'the remote branch is gone too');
  } finally { p.done(); }
});

test('wf.mjs ship finish marks the workflow shipped and names retro next', () => {
  const p = repoPair();
  try {
    const dir = path.join(p.root, '.ai', 'workflows', 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(p.root, '.gitignore'), '.ai/\n');
    writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\nbranch: feat/x\nbase-branch: main\npr-number: 7\n---\n');
    git(p.root, 'switch', '-q', '-c', 'feat/x');
    const r = spawnSync(process.execPath, [path.join(PLUGIN_ROOT, 'scripts', 'wf.mjs'), 'ship', 'finish', p.root, 'demo'], { encoding: 'utf8', env: { ...process.env, SDLC_GH_BIN: FAKE_GH } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const index = frontmatterOfDoc(dir, '00-index.md');
    assert.deepEqual([index.status, index['close-reason'], index['next-invocation']], ['shipped', 'shipped', '/wf retro demo']);
  } finally { p.done(); }
});
