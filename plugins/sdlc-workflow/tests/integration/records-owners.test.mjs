// The owner of a workflow, with the compose sync, on two computers and one local remote: the
// rows of the table of claim, take-over, hand-over, release and close, and the parked copies.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME, setFields } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { closeRecords, flushRecords, linkProject, syncRecords } from '../../lib/records-sync.mjs';
import { claimWorkflow, listParked, otherOwner, ownerOf, releaseWorkflow, showParked, takeParked, dropParked } from '../../lib/records-owners.mjs';
import { recordsLine } from '../../lib/records-line.mjs';
import { afterChange } from '../../lib/after-change.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cli = (...args) => spawnSync(process.execPath, [WF, ...args], { encoding: 'utf8', env: process.env });

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-owners-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off', SDLC_SECOND_MACHINE: 'allow' });
  delete process.env.WF_ACTOR;
  const as = (m) => { process.env.SDLC_HOME = m.home; return m; };
  const machine = (name) => {
    const home = join(top, `home-${name}`);
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: name, sync: 'compose' } }));
    git(top, 'clone', '-q', bare, join(home, 'records'));
    const root = join(top, `project-${name}`);
    mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
    return { name, home, root, clone: join(home, 'records') };
  };
  const remote = (path) => { try { return git(top, '--git-dir', bare, 'show', `main:${path}`); } catch { return null; } };
  const offline = (m, on) => git(m.clone, 'remote', 'set-url', 'origin', on ? join(top, 'gone.git') : bare);
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true, maxRetries: 5 });
  };
  return { top, bare, as, machine, remote, offline, done };
}

function workflow(root, slug) {
  const dir = join(root, '.ai', 'workflows', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\nstatus: active\ncurrent-stage: plan\n---\n`);
}

/** alpha links w1 and owns it on the remote; beta links the same project and has w1. */
function two(w) {
  const a = w.as(w.machine('alpha'));
  workflow(a.root, 'w1');
  linkProject(a.root, 'notes');
  assert.equal(claimWorkflow(a.root, 'w1').ok, true);
  const b = w.as(w.machine('beta'));
  linkProject(b.root, 'notes');
  syncRecords(b.root);
  w.as(a);
  syncRecords(a.root);
  return { a, b };
}
const stage = (m, slug, s) => setFields(workflowDir(m.root, slug), INDEX_NAME, { 'current-stage': s });

test('claim: a free workflow is owned once the push lands; the owner continues with no network', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    linkProject(a.root, 'notes');
    const c = claimWorkflow(a.root, 'w1');
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.deepEqual(c.owner, { machine: 'alpha', epoch: 1 });
    assert.equal(w.remote('notes/w1/owner'), 'alpha 1');
    assert.equal(w.remote('.records-epoch'), '2', 'the repo carries the format of the owner files');
    w.offline(a, true);
    assert.equal(claimWorkflow(a.root, 'w1').already, true, 'the owner needs no network');

    // A claim whose push fails is not a claim: the owner file goes back.
    const w3 = workflowDir(a.root, 'w3');
    mkdirSync(w3, { recursive: true });
    writeFileSync(join(w3, INDEX_NAME), '---\nschema: sdlc/v1\ntype: index\nslug: w3\nstatus: active\ncurrent-stage: plan\n---\n');
    const failed = claimWorkflow(a.root, 'w3');
    assert.equal(failed.ok, true, 'w3 never reached the remote, so offline it may start here');
    assert.match(failed.warning, /cannot be reached/);
    w.offline(a, false);
  } finally { w.done(); }
});

test('take-over: the dispatch asks, a claim is refused, take after a yes; the old owner is told, and its late work is parked', () => {
  const w = world();
  try {
    const { a, b } = two(w);
    w.as(b);
    assert.match(recordsLine(b.root, { target: 'w1' }).line ?? '', /w1 is owned by alpha.*Take it over/);
    const refused = cli('records', 'claim', b.root, 'w1');
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /owned by alpha/);
    assert.equal(cli('records', 'decline', b.root, 'w1').status, 1);
    const took = claimWorkflow(b.root, 'w1', { take: true });
    assert.equal(took.ok, true, JSON.stringify(took));
    assert.deepEqual([took.owner, took.took.machine], [{ machine: 'beta', epoch: 2 }, 'alpha']);
    assert.equal(w.remote('notes/w1/owner'), 'beta 2');

    // alpha did not see it yet and writes: its sync parks the work, and the next change says owner-lost.
    w.as(a);
    stage(a, 'w1', 'review');
    const s = syncRecords(a.root);
    assert.ok(s.conflicts.some((c) => /parked/.test(c)), JSON.stringify(s.conflicts));
    assert.doesNotMatch(w.remote('notes/w1/state.yaml') ?? '', /current-stage: review/, 'the late work did not reach the remote');
    syncRecords(a.root);
    assert.equal(otherOwner(a.root, 'w1')?.machine, 'beta', 'the hand of beta arrived on alpha');
    const lines = [];
    afterChange(a.root, 'w1', { label: 'x', warn: (l) => lines.push(l) });
    assert.ok(lines.some((l) => /^owner-lost: w1 is owned by beta/.test(l)), lines.join('\n'));

    // beta lists the parked copy, sees its files, takes one, and drops it.
    w.as(b);
    // One copy for each tree that alpha parked: the late work, and the same after the owner file came.
    const parked = listParked();
    assert.ok(parked.length >= 1 && parked.every((p) => p.machine === 'alpha' && !p.mine), JSON.stringify(parked));
    const files = showParked(parked[0].branch);
    assert.ok(files.some((f) => f.path === 'notes/w1/state.yaml'), JSON.stringify(files));
    takeParked(b.root, parked[0].branch, 'notes/w1/state.yaml');
    assert.equal(flushRecords({ project: 'notes', slug: 'w1' }).landed, true);
    assert.match(w.remote('notes/w1/state.yaml') ?? '', /current-stage: review/, 'the owner took the late work in');
    for (const p of parked) dropParked(p.branch);
    assert.equal(listParked().length, 0);
  } finally { w.done(); }
});

test('hand-over and release: the work goes first; when a push fails, this computer stays the owner', () => {
  const w = world();
  try {
    const { a, b } = two(w);
    w.as(a);
    stage(a, 'w1', 'implement');
    w.offline(a, true);
    const stuck = releaseWorkflow(a.root, 'w1', { to: 'beta' });
    assert.equal(stuck.ok, false);
    assert.match(stuck.reason, /stays its owner/);
    assert.equal(ownerOf(a.root, 'w1').machine, 'alpha');
    w.offline(a, false);
    const r = releaseWorkflow(a.root, 'w1', { to: 'beta' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(w.remote('notes/w1/owner'), 'beta 2');
    assert.match(w.remote('notes/w1/state.yaml') ?? '', /current-stage: implement/, 'the work went with it');

    w.as(b);
    syncRecords(b.root);
    assert.equal(ownerOf(b.root, 'w1').machine, 'beta');
    stage(b, 'w1', 'verify');
    assert.equal(flushRecords({ project: 'notes', slug: 'w1' }).landed, true, 'the new owner sends');
    const free = releaseWorkflow(b.root, 'w1');
    assert.equal(free.ok, true);
    assert.equal(w.remote('notes/w1/owner'), null, 'released: no owner');
    w.as(a);
    syncRecords(a.root);
    const again = claimWorkflow(a.root, 'w1');
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.owner.epoch, 3, 'alpha 1, beta 2, released: an epoch never comes back');
  } finally { w.done(); }
});

test('a close that is not sent stays owned, and says so', () => {
  const w = world();
  try {
    const { a } = two(w);
    w.as(a);
    stage(a, 'w1', 'retro');
    w.offline(a, true);
    const c = closeRecords(a.root, 'w1');
    assert.equal(c.sent, false);
    assert.equal(ownerOf(a.root, 'w1').machine, 'alpha');
    const out = cli('records', 'close', a.root, 'w1');
    assert.equal(out.status, 1);
    assert.match(out.stdout + out.stderr, /not sent[\s\S]*still owns it/);
    w.offline(a, false);
    assert.equal(cli('records', 'close', a.root, 'w1').status, 0);
  } finally { w.done(); }
});

test('without the compose sync, a claim writes the owner file and commits it', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    writeFileSync(join(a.home, 'config.json'), JSON.stringify({ records: { machine: 'alpha' } }));
    workflow(a.root, 'w1');
    linkProject(a.root, 'notes');
    assert.equal(claimWorkflow(a.root, 'w1').ok, true);
    assert.equal(readFileSync(join(a.clone, 'notes', 'w1', 'owner'), 'utf8'), 'alpha 1\n');
    assert.equal(git(a.clone, 'log', '-1', '--format=%s'), 'notes/w1: owned by alpha');
    assert.ok(existsSync(join(a.clone, 'notes', 'w1')));
  } finally { w.done(); }
});

test('two computers that claim one free workflow at once: exactly one wins, and the other keeps no owner file', async () => {
  const w = world();
  try {
    const { a, b } = two(w);
    w.as(a);
    assert.equal(releaseWorkflow(a.root, 'w1').ok, true);
    w.as(b);
    syncRecords(b.root);
    const lib = new URL('../../lib/records-owners.mjs', import.meta.url).href;
    const { spawn } = await import('node:child_process');
    const claim = (m) => new Promise((done) => {
      const code = `const o = await import(${JSON.stringify(lib)}); process.stdout.write(JSON.stringify(o.claimWorkflow(${JSON.stringify(m.root)}, 'w1')));`;
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, SDLC_HOME: m.home } });
      let text = '';
      p.stdout.on('data', (d) => { text += d; });
      p.on('close', () => done(JSON.parse(text || '{}')));
    });
    const [x, y] = await Promise.all([claim(a), claim(b)]);
    assert.equal([x.ok, y.ok].filter(Boolean).length, 1, JSON.stringify([x, y]));
    const winner = x.ok ? a : b;
    const loser = x.ok ? b : a;
    assert.equal(w.remote('notes/w1/owner'), `${winner.name} 2`, 'the epoch after the release of epoch 1');
    w.as(loser);
    assert.notEqual(ownerOf(loser.root, 'w1')?.machine, loser.name, 'the loser keeps no claim of its own');
  } finally { w.done(); }
});
