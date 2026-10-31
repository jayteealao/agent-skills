// The records repo keeps every file: each records commit is a path-limited commit on the main
// branch of the clone, a rejected push rebases on the remote tip, and a conflict stops the push
// and names the file. Two machines share one local bare repo; each machine is its own SDLC_HOME
// with its own clone and its own project checkout.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimLease, releaseLease } from '../../lib/leases.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { commitPaths, commitWorkflow, linkProject, pullRecords, pushRecords, readState, recordsLockPath, recordsStatus, syncRecords, takeLock, workflowHealth } from '../../lib/records-sync.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const LIB = new URL('../../lib/records-sync.mjs', import.meta.url).href;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-safety-'));
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
  // The tests push by hand: no commit starts a background push.
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off' });
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

const read = (file) => readFileSync(file, 'utf8');
const filesOf = (repo, ref = 'main') => git(repo, 'ls-tree', '-r', '--name-only', ref).split('\n');

/** Two linked machines; alpha links and pushes the workflows `slugs`, and beta pulls them. */
function twoMachines(w, slugs = ['w1']) {
  const a = w.as(w.machine('alpha'));
  const b = w.machine('beta');
  w.as(a);
  for (const s of slugs) workflow(a.root, s);
  linkProject(a.root, 'notes');
  assert.equal(pushRecords().pushed, true);
  w.as(b);
  linkProject(b.root, 'notes');
  syncRecords(b.root);
  return { a, b };
}

/** Run `code` in a child process with the lib as `m`; resolves with its stdout. `onLine` sees each line as it comes. */
function child(code, env, onLine = () => {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(LIB)}); ${code}`], { env });
    let text = '';
    p.stdout.on('data', (d) => { text += d; for (const l of String(d).split('\n').filter(Boolean)) onLine(l); });
    p.on('close', () => resolve(text));
  });
}

test('computer A writes workflow X, computer B writes workflow Y: both push, and no file is lost', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    const b = w.machine('beta');
    w.as(a);
    workflow(a.root, 'x');
    linkProject(a.root, 'notes');
    w.as(b);
    workflow(b.root, 'y');
    linkProject(b.root, 'notes');
    // Both machines commit offline from each other; alpha pushes first.
    w.as(a);
    assert.equal(pushRecords().pushed, true);
    w.as(b);
    writeFileSync(join(workflowDir(b.root, 'y'), 'notes.md'), 'beta\n');
    commitWorkflow(b.root, 'y', 'y: notes');
    // An uncommitted change of beta survives the rebase of its push.
    setFields(workflowDir(b.root, 'y'), INDEX_NAME, { 'current-stage': 'implement' });
    const p = pushRecords();
    assert.equal(p.pushed, true, p.reason);
    assert.equal(frontmatterOfDoc(workflowDir(b.root, 'y'), INDEX_NAME)['current-stage'], 'implement', 'the uncommitted change stays');
    assert.ok(existsSync(join(workflowDir(b.root, 'x'), INDEX_NAME)), 'the rebase brought x to beta');
    // Both write again, and both push again.
    writeFileSync(join(workflowDir(b.root, 'y'), 'more.md'), 'beta again\n');
    commitWorkflow(b.root, 'y', 'y: more');
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'x'), 'more.md'), 'alpha again\n');
    commitWorkflow(a.root, 'x', 'x: more');
    assert.equal(pushRecords().pushed, true);
    w.as(b);
    assert.equal(pushRecords().pushed, true);
    w.as(a);
    assert.equal(pullRecords().ok, true);
    const remote = filesOf(w.bare);
    for (const f of ['notes/x/00-index.md', 'notes/x/more.md', 'notes/y/state.yaml', 'notes/y/notes.md', 'notes/y/more.md', '.machines/alpha.json', '.machines/beta.json']) {
      assert.ok(remote.includes(f), `${f} is on the remote: ${remote.join(" ")}`);
    }
    assert.equal(read(join(workflowDir(a.root, 'y'), 'more.md')), 'beta again\n');
    assert.equal(git(w.bare, 'rev-list', '--merges', '--count', 'main'), '0', 'the history stays linear');
    assert.equal(git(w.bare, 'for-each-ref', 'refs/heads/live/'), '', 'no live branch');
  } finally { w.done(); }
});

test('computer B claims workflow X after computer A releases it, and A sees the work of B', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    const b = w.machine('beta');
    w.as(a);
    workflow(a.root, 'x');
    linkProject(a.root, 'notes');
    assert.equal(claimLease(a.root, 'x').ok, true);
    writeFileSync(join(workflowDir(a.root, 'x'), 'plan.md'), 'alpha plan\n');
    commitWorkflow(a.root, 'x', 'x: plan');
    assert.equal(pushRecords().pushed, true);
    assert.equal(releaseLease(a.root, 'x').released, true);

    w.as(b);
    linkProject(b.root, 'notes');
    const c = claimLease(b.root, 'x');
    assert.equal(c.ok, true, c.reason);
    syncRecords(b.root);
    assert.equal(read(join(workflowDir(b.root, 'x'), 'plan.md')), 'alpha plan\n');
    writeFileSync(join(workflowDir(b.root, 'x'), 'implement.md'), 'beta builds\n');
    setFields(workflowDir(b.root, 'x'), INDEX_NAME, { 'current-stage': 'implement' });
    commitWorkflow(b.root, 'x', 'x: implement');
    assert.equal(pushRecords().pushed, true);

    w.as(a);
    assert.equal(claimLease(a.root, 'x').held, true, 'beta holds the lease now');
    assert.equal(pullRecords().ok, true);
    assert.equal(read(join(workflowDir(a.root, 'x'), 'implement.md')), 'beta builds\n');
    assert.equal(frontmatterOfDoc(workflowDir(a.root, 'x'), INDEX_NAME)['current-stage'], 'implement');
    assert.equal(git(a.clone, 'status', '--porcelain', '--', 'notes/'), '', 'the clone of alpha is clean');
  } finally { w.done(); }
});

test('a push that conflicts in one file stops, keeps the local commit, and records status names the file', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'alpha\n');
    commitWorkflow(a.root, 'w1', 'w1: alpha');
    assert.equal(pushRecords().pushed, true);
    w.as(b);
    writeFileSync(join(workflowDir(b.root, 'w1'), 'notes.md'), 'beta\n');
    commitWorkflow(b.root, 'w1', 'w1: beta');
    const head = git(b.clone, 'rev-parse', 'HEAD');
    const p = pushRecords();
    assert.deepEqual([p.pushed, p.conflict, p.files], [false, true, ['notes/w1/notes.md']], JSON.stringify(p));
    assert.equal(git(b.clone, 'rev-parse', 'HEAD'), head, 'the rebase was aborted');
    assert.equal(git(b.clone, 'symbolic-ref', '--short', 'HEAD'), 'main', 'no rebase is in progress');
    assert.equal(read(join(workflowDir(b.root, 'w1'), 'notes.md')), 'beta\n');
    assert.deepEqual(readState().pushConflict.files, ['notes/w1/notes.md']);
    assert.match(read(join(b.home, 'records-log.jsonl')), /"step":"push","error":"a conflict in notes\/w1\/notes\.md"/);
    const s = spawnSync(process.execPath, [WF, 'records', 'status', b.root], { encoding: 'utf8', env: process.env });
    assert.match(s.stdout, /conflict: notes\/w1\/notes\.md: the push of .* stopped at this file/);
    assert.match(workflowHealth(b.root, 'w1').conflict, /notes\/w1\/notes\.md/);
  } finally { w.done(); }
});

test('the records lock: a commit waits for a live holder, and a stale lock of an ended process is taken', async () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const lock = recordsLockPath();
    // A stale lock: a process of this machine that has ended.
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 31 - 2, host: hostname(), at: '2026-10-30T10:00:00Z' }));
    writeFileSync(join(workflowDir(a.root, 'w1'), 'one.md'), '1\n');
    assert.ok(commitWorkflow(a.root, 'w1', 'w1: one').commit);
    assert.ok(filesOf(a.clone, 'HEAD').includes('notes/w1/one.md'));
    assert.equal(existsSync(lock), false, 'the lock is free after the commit');
    // A live holder: another process holds the lock for a second.
    let held;
    const heldNow = new Promise((resolve) => { held = resolve; });
    const holder = child(`if (m.takeLock(m.recordsLockPath())) { console.log('held'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1200); m.dropLock(m.recordsLockPath()); console.log('dropped'); }`, process.env, (l) => { if (l === 'held') held(); });
    await heldNow;
    assert.equal(takeLock(lock, { waitMs: 100 }), false, 'a live holder keeps the lock');
    const started = Date.now();
    writeFileSync(join(workflowDir(a.root, 'w1'), 'two.md'), '2\n');
    assert.ok(commitWorkflow(a.root, 'w1', 'w1: two').commit);
    assert.ok(Date.now() - started >= 500, 'the commit waited for the holder');
    assert.match(await holder, /dropped/);
    assert.ok(filesOf(a.clone, 'HEAD').includes('notes/w1/two.md'));
  } finally { w.done(); }
});

test('two processes that commit to one clone at once both land', async () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    for (const s of ['w2', 'w3']) {
      mkdirSync(workflowDir(a.root, s), { recursive: true });
      writeFileSync(join(workflowDir(a.root, s), 'one.md'), `${s}\n`);
    }
    const run = (s) => child(`process.stdout.write(String(m.commitPaths(${JSON.stringify(a.clone)}, { paths: ['notes/${s}'], message: '${s}' })));`, process.env);
    const [x, y] = await Promise.all([run('w2'), run('w3')]);
    assert.ok(x && y && x !== 'null' && y !== 'null', `${x} ${y}`);
    const files = filesOf(a.clone, 'HEAD');
    assert.ok(files.includes('notes/w2/one.md') && files.includes('notes/w3/one.md'));
  } finally { w.done(); }
});

test('a commit holds only its path: drafts, run files and the files of another folder stay out', () => {
  const w = world();
  try {
    const { a } = twoMachines(w, ['w1', 'w2']);
    w.as(a);
    const dir = workflowDir(a.root, 'w1');
    mkdirSync(join(dir, '.draft'), { recursive: true });
    writeFileSync(join(dir, '.draft', '04-plan.md'), 'a draft\n');
    writeFileSync(join(dir, '.control.json'), '{}\n');
    writeFileSync(join(dir, '.watch-state.json'), '{}\n');
    writeFileSync(join(dir, 'steps.jsonl'), '{}\n');
    writeFileSync(join(dir, '.driver-journal.jsonl'), '{}\n');
    // Another session works on w2: one file staged, one not.
    writeFileSync(join(workflowDir(a.root, 'w2'), 'staged.md'), 'staged\n');
    git(a.clone, 'add', '--', 'notes/w2/staged.md');
    writeFileSync(join(workflowDir(a.root, 'w2'), 'loose.md'), 'loose\n');
    commitWorkflow(a.root, 'w1', 'w1: files');
    const changed = git(a.clone, 'show', '--name-only', '--format=', 'HEAD').split('\n');
    assert.deepEqual(changed.sort(), ['notes/w1/.driver-journal.jsonl', 'notes/w1/steps.jsonl']);
    assert.match(git(a.clone, 'diff', '--cached', '--name-only'), /notes\/w2\/staged\.md/, 'the staged file of w2 stays staged');
    assert.match(git(a.clone, 'status', '--porcelain', '--', 'notes/w2/loose.md'), /^\?\?/);
  } finally { w.done(); }
});

test('every records commit starts the background push', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    delete process.env.SDLC_RECORDS_PUSH;
    process.env.SDLC_RECORDS_FOREGROUND = '1';
    writeFileSync(join(workflowDir(a.root, 'w1'), 'pushed.md'), 'x\n');
    assert.ok(commitWorkflow(a.root, 'w1', 'w1: pushed').commit);
    assert.ok(filesOf(w.bare).includes('notes/w1/pushed.md'), 'the push ran after the commit');
    assert.equal(git(w.bare, 'rev-parse', 'main'), git(a.clone, 'rev-parse', 'HEAD'));
    // The campaign and the GitHub layer commit through the same function.
    writeFileSync(join(workflowDir(a.root, 'w1'), 'campaign.md'), 'y\n');
    const m = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(LIB)}); m.commitRecords({ root: ${JSON.stringify(a.root)}, label: 'campaign write' });`], { env: process.env, encoding: 'utf8' });
    assert.equal(m.status, 0, m.stderr);
    assert.ok(filesOf(w.bare).includes('notes/w1/campaign.md'), 'the campaign commit is pushed');
  } finally { w.done(); }
});

test('an offline commit stays local, and the next push carries it', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    git(a.clone, 'remote', 'set-url', 'origin', join(w.top, 'missing.git'));
    writeFileSync(join(workflowDir(a.root, 'w1'), 'offline.md'), 'x\n');
    commitWorkflow(a.root, 'w1', 'w1: offline');
    const p = pushRecords();
    assert.deepEqual([p.pushed, p.offline], [false, true], JSON.stringify(p));
    assert.equal(workflowHealth(a.root, 'w1').ahead, 1);
    git(a.clone, 'remote', 'set-url', 'origin', w.bare);
    assert.equal(pushRecords().pushed, true);
    assert.ok(filesOf(w.bare).includes('notes/w1/offline.md'));
    assert.equal(workflowHealth(a.root, 'w1').ahead, 0);
  } finally { w.done(); }
});

test('a failed background push goes into the records log, and records status shows it', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    // The remote refuses every push from now on.
    writeFileSync(join(w.bare, 'hooks', 'pre-receive'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'x\n');
    commitWorkflow(a.root, 'w1', 'w1: notes');
    const p = spawnSync(process.execPath, [WF, 'records', 'push', a.root, 'w1'], { encoding: 'utf8', env: process.env });
    assert.equal(p.status, 1, p.stdout + p.stderr);
    assert.match(read(join(a.home, 'records-log.jsonl')), /"step":"push"/);
    const s = spawnSync(process.execPath, [WF, 'records', 'status', a.root], { encoding: 'utf8', env: process.env });
    assert.match(s.stdout, /branch: notes\/w1: 1 ahead/);
    assert.ok(recordsStatus(a.root).workflows.some((h) => h.workflow === 'notes/w1' && h.ahead === 1));
  } finally { w.done(); }
});

test('a write into the clone that no commit holds shows in records status, and git status of the clone is the check', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'loose.md'), 'x\n');
    const h = workflowHealth(a.root, 'w1');
    assert.deepEqual(h.uncommitted, ['loose.md']);
    assert.equal(h.problem, true);
    commitWorkflow(a.root, 'w1', 'w1: loose');
    assert.deepEqual(workflowHealth(a.root, 'w1').uncommitted, []);
    assert.equal(git(a.clone, 'status', '--porcelain', '--', 'notes/w1'), '');
    assert.match(read(join(a.clone, '.gitignore')), /\*\/INDEX\.md/);
  } finally { w.done(); }
});

test('commitPaths with no change makes no commit', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const before = git(a.clone, 'rev-parse', 'HEAD');
    assert.equal(commitPaths(a.clone, { paths: ['notes/w1'], message: 'none' }), before);
    assert.equal(commitPaths(a.clone, { paths: ['notes/none'], message: 'none' }), before);
    assert.equal(git(a.clone, 'rev-parse', 'HEAD'), before);
  } finally { w.done(); }
});

test('two machines that claim one lease at once: exactly one wins', async () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    const lib = new URL('../../lib/leases.mjs', import.meta.url).href;
    const claim = (m) => new Promise((resolve) => {
      const code = `const l = await import(${JSON.stringify(lib)}); process.stdout.write(JSON.stringify(l.claimLease(${JSON.stringify(m.root)}, 'w1')));`;
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, SDLC_HOME: m.home } });
      let text = '';
      p.stdout.on('data', (d) => { text += d; });
      p.on('close', () => resolve(JSON.parse(text || '{}')));
    });
    const [x, y] = await Promise.all([claim(a), claim(b)]);
    assert.equal([x.ok, y.ok].filter(Boolean).length, 1, JSON.stringify([x, y]));
  } finally { w.done(); }
});

test('a write after another machine took the lease: the lease is lost, and a changing command says so', async () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    const { renewIfMine } = await import('../../lib/leases.mjs');
    w.as(a);
    assert.equal(claimLease(a.root, 'w1').ok, true);
    // beta takes the lease (alpha's lease expired, and the person said yes on beta).
    w.as(b);
    const later = new Date(Date.now() + 3 * 3600_000);
    assert.equal(claimLease(b.root, 'w1', { take: true, now: later }).ok, true);
    w.as(a);
    assert.equal(renewIfMine(a.root, 'w1', { now: later }).lost, true);
    // The sync fetched the lease ref: a changing command prints lease-lost on stderr.
    syncRecords(a.root);
    const cli = spawnSync(process.execPath, [WF, 'record', 'set', a.root, 'w1', 'index', 'current-stage=verify'], { encoding: 'utf8', env: process.env });
    assert.match(cli.stderr, /lease-lost: w1 by beta/);
  } finally { w.done(); }
});

test('a pull that brings a workflow rebuilds INDEX.md in the clone, and INDEX.md stays out of git', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    w.as(a);
    mkdirSync(workflowDir(a.root, 'w2'), { recursive: true });
    writeFileSync(join(workflowDir(a.root, 'w2'), INDEX_NAME), '---\nschema: sdlc/v1\ntype: index\nslug: w2\nstatus: active\ncurrent-stage: plan\n---\n');
    commitWorkflow(a.root, 'w2', 'w2: new');
    assert.equal(pushRecords().pushed, true);
    const s = spawnSync(process.execPath, [WF, 'records', 'sync', b.root], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: b.home } });
    assert.equal(s.status, 0, s.stdout + s.stderr);
    assert.match(s.stdout, /pulled w2/);
    assert.match(read(join(b.clone, 'notes', 'INDEX.md')), /^w2\t/m);
    assert.doesNotMatch(git(w.bare, 'ls-tree', '-r', '--name-only', 'main'), /INDEX\.md/);
    assert.match(git(w.bare, 'show', 'main:.gitignore'), /\*\/INDEX\.md/);
  } finally { w.done(); }
});
