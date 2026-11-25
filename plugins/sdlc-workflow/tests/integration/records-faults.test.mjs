// The faults of the records sync that a person did not see: a second computer, a lease that is
// free after a failed push, a failed pull that is never tried again, a git lock that a dead
// process left, a failed commit that a command hides, and a live branch that came after the move.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimAndPull, claimLease, showLease } from '../../lib/leases.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { clearStaleIndexLock, commitWorkflow, linkProject, pushRecords, readState, syncRecords } from '../../lib/records-sync.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function world({ second = 'allow' } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'records-faults-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const machine = (name) => {
    const home = join(top, `home-${name}`);
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: name } }));
    git(top, 'clone', '-q', bare, join(home, 'records'));
    const root = join(top, `project-${name}`);
    mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
    return { name, home, root, clone: join(home, 'records') };
  };
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off', SDLC_SECOND_MACHINE: second });
  const as = (m) => { process.env.SDLC_HOME = m.home; return m; };
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { top, bare, machine, as, done };
}

function workflow(root, slug, status = 'active') {
  const dir = join(root, '.ai', 'workflows', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\nstatus: ${status}\ncurrent-stage: plan\n---\n`);
}
const cli = (...args) => spawnSync(process.execPath, [WF, ...args], { encoding: 'utf8', env: process.env });

/** alpha links and pushes w1. */
function one(w) {
  const a = w.as(w.machine('alpha'));
  workflow(a.root, 'w1');
  linkProject(a.root, 'notes');
  assert.equal(pushRecords().pushed, true);
  return a;
}
function two(w) {
  const a = one(w);
  const b = w.as(w.machine('beta'));
  linkProject(b.root, 'notes');
  syncRecords(b.root);
  w.as(a);
  syncRecords(a.root);
  return { a, b };
}
function change(m, slug = 'w1') {
  setFields(workflowDir(m.root, slug), INDEX_NAME, { 'current-stage': 'implement' });
}

test('a second computer cannot link, commit or push while the sync is not safe for it', () => {
  const w = world({ second: '' });
  try {
    one(w);
    const b = w.as(w.machine('beta'));
    const r = linkProject(b.root, 'notes');
    assert.equal(r.ok, false);
    assert.match(r.reason, /alpha/);
    assert.equal(r.fix.who, 'person');
    assert.ok(!existsSync(join(b.root, '.ai', 'sdlc-config.json')), 'the link wrote nothing');
    // A checkout that is linked by its config cannot commit either.
    writeFileSync(join(b.root, '.ai', 'sdlc-config.json'), JSON.stringify({ records: { project: 'notes' } }));
    change(b);
    assert.equal(commitWorkflow(b.root, 'w1', 'x').commit, null);
    assert.match(readState().failures['notes/w1'].error, /alpha/);
    git(b.clone, 'commit', '-q', '--allow-empty', '-m', 'by hand');
    assert.equal(pushRecords().pushed, false);
  } finally { w.done(); }
});

test('the computer that .machines/ lists goes on', () => {
  const w = world({ second: '' });
  try {
    const a = one(w);
    change(a);
    assert.ok(commitWorkflow(a.root, 'w1', 'x').commit);
    assert.equal(pushRecords().pushed, true);
  } finally { w.done(); }
});

test('records close keeps the lease when its push fails, and the next good push releases it', () => {
  const w = world();
  try {
    const { a } = two(w);
    assert.equal(claimLease(a.root, 'w1').ok, true);
    change(a);
    // The push is refused, and the lease push would work.
    const hook = join(w.bare, 'hooks', 'update');
    writeFileSync(hook, '#!/bin/sh\ncase "$1" in refs/heads/*) exit 1;; esac\nexit 0\n', { mode: 0o755 });
    const r = cli('records', 'close', a.root, 'w1');
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /not sent/);
    assert.equal(showLease(a.root, 'w1').mine, true, 'the lease stays');
    rmSync(hook);
    assert.equal(cli('records', 'push', a.root, 'w1').status, 0);
    assert.equal(showLease(a.root, 'w1').lease, null, 'the good push released it');
  } finally { w.done(); }
});

test('a close that pushes releases the lease', () => {
  const w = world();
  try {
    const { a } = two(w);
    claimLease(a.root, 'w1');
    change(a);
    assert.equal(cli('records', 'close', a.root, 'w1').status, 0);
    assert.equal(showLease(a.root, 'w1').lease, null);
  } finally { w.done(); }
});

test('a pull that failed at a claim is tried again at the next claim, and the dispatch stops until it works', () => {
  const w = world();
  try {
    const { a, b } = two(w);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'alpha\n');
    commitWorkflow(a.root, 'w1', 'w1: notes');
    assert.equal(pushRecords().pushed, true);
    w.as(b);
    // The clone of beta is in a rebase, so the pull fails and the claim works.
    mkdirSync(join(b.clone, '.git', 'rebase-merge'));
    const first = claimAndPull(b.root, 'w1');
    assert.equal(first.ok, true);
    assert.equal(first.pull.ok, undefined);
    const again = claimAndPull(b.root, 'w1');
    assert.equal(again.renewed, true);
    assert.ok(again.pull, 'a renewed claim pulls again after a failed pull');
    const d = cli('dispatch', b.root, '--host', 'claude', '--', 'implement', 'w1');
    assert.match(d.stdout, /^records: stop .*pull/m);
    assert.equal(cli('lease', 'claim', b.root, 'w1').status, 1, 'the claim command stops too');
    rmSync(join(b.clone, '.git', 'rebase-merge'), { recursive: true });
    assert.equal(claimAndPull(b.root, 'w1').pull.ok, true);
    assert.ok(existsSync(join(workflowDir(b.root, 'w1'), 'notes.md')));
    assert.equal(claimAndPull(b.root, 'w1').pull, undefined, 'a pull that worked is not made again');
  } finally { w.done(); }
});

test('a git lock that a dead process left is moved aside, and a young lock or a live git keeps it', () => {
  const w = world();
  try {
    const a = one(w);
    const lock = join(a.clone, '.git', 'index.lock');
    writeFileSync(lock, '');
    assert.equal(clearStaleIndexLock(a.clone, { gitRuns: () => false }).cleared, false, 'a young lock stays');
    const old = new Date(Date.now() - 3600_000);
    utimesSync(lock, old, old);
    assert.equal(clearStaleIndexLock(a.clone, { gitRuns: () => true }).cleared, false, 'a live git keeps its lock');
    assert.equal(clearStaleIndexLock(a.clone, { gitRuns: () => null }).cleared, false, 'an unknown process list keeps it');
    assert.ok(existsSync(lock));
    assert.equal(clearStaleIndexLock(a.clone, { gitRuns: () => false }).cleared, true);
    assert.ok(!existsSync(lock));
    assert.equal(readdirSync(join(a.clone, '.git')).filter((f) => f.startsWith('index.lock.stale-')).length, 1, 'it is kept, not deleted');
    change(a);
    assert.ok(commitWorkflow(a.root, 'w1', 'x').commit);
  } finally { w.done(); }
});

test('a command whose records commit failed says so', () => {
  const w = world();
  try {
    const a = one(w);
    writeFileSync(join(a.clone, '.git', 'index.lock'), '');
    const r = cli('record', 'set', a.root, 'w1', 'index', 'current-stage=verify');
    assert.match(r.stderr, /records-warning: .*w1.*not committed/);
    assert.match(r.stderr, /index\.lock/);
    assert.equal(frontmatterOfDoc(workflowDir(a.root, 'w1'), INDEX_NAME)['current-stage'], 'verify', 'the change is saved');
  } finally { w.done(); }
});

test('a live branch that came after the move is named by the dispatch and the records status', () => {
  const w = world();
  try {
    const a = one(w);
    syncRecords(a.root);
    assert.ok(readState().liveMigrated);
    git(a.clone, 'update-ref', 'refs/heads/live/notes/w1', 'HEAD');
    const d = cli('dispatch', a.root, '--host', 'claude', '--', 'implement', 'w1');
    assert.match(d.stdout, /^records: stop .*live branch.*records migrate/m);
    const other = cli('dispatch', a.root, '--host', 'claude', '--', 'status');
    assert.doesNotMatch(other.stdout, /records: stop/, 'a read goes on');
    assert.match(cli('records', 'status', a.root, '--problems').stdout, /live/);
    assert.equal(git(a.clone, 'for-each-ref', '--format=%(refname)', 'refs/heads/live'), 'refs/heads/live/notes/w1', 'nothing moved it');
  } finally { w.done(); }
});
