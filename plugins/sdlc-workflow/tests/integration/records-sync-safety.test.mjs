// The records repo keeps every file: a sync, a squash, a pull and a write after the close lose
// no file that a machine wrote. Two machines share one local bare repo; each machine is its own
// SDLC_HOME with its own clone and its own project checkout.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME, frontmatterOfDoc, setFields } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { applyTree, commitPaths, commitWorkflow, linkProject, pushWorkflow, readState, recordsStatus, squashWorkflow, syncRecords, workflowHealth } from '../../lib/records-sync.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
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
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
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
const refs = (bare) => git(bare, 'for-each-ref', '--format=%(refname)');

/** Two linked machines with one pushed workflow `w1` that both have. */
function twoMachines(w, slugs = ['w1']) {
  const a = w.as(w.machine('alpha'));
  for (const s of slugs) workflow(a.root, s);
  linkProject(a.root, 'notes');
  for (const s of slugs) pushWorkflow(a.root, s);
  const b = w.as(w.machine('beta'));
  linkProject(b.root, 'notes');
  syncRecords(b.root);
  return { a, b };
}

test('a sync commits the uncommitted files of a held and of a not-held workflow before any ref moves', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w, ['w1', 'w2']);
    // alpha moves both live branches on the remote.
    w.as(a);
    for (const s of ['w1', 'w2']) {
      writeFileSync(join(workflowDir(a.root, s), 'alpha.md'), `${s} from alpha\n`);
      commitWorkflow(a.root, s, `${s}: alpha`);
      pushWorkflow(a.root, s);
    }
    // beta writes a file in each folder and commits nothing.
    w.as(b);
    for (const s of ['w1', 'w2']) writeFileSync(join(workflowDir(b.root, s), 'beta.md'), `${s} from beta\n`);
    const r = syncRecords(b.root, { holds: (s) => s === 'w1' });
    assert.deepEqual(r.conflicts, []);
    for (const s of ['w1', 'w2']) {
      assert.equal(read(join(workflowDir(b.root, s), 'beta.md')), `${s} from beta\n`, `${s}: the uncommitted file of beta stays`);
      assert.equal(read(join(workflowDir(b.root, s), 'alpha.md')), `${s} from alpha\n`, `${s}: the file of alpha arrives`);
      assert.match(git(w.bare, 'ls-tree', '-r', '--name-only', `refs/heads/live/notes/${s}`), new RegExp(`notes/${s}/beta\\.md`), `${s}: beta's file is pushed`);
    }
  } finally { w.done(); }
});

test('a squash takes the live work that another machine pushed, then deletes the live branch', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    // beta pushes a new file to the live branch; alpha does not sync.
    w.as(b);
    writeFileSync(join(workflowDir(b.root, 'w1'), 'beta.md'), 'late work of beta\n');
    commitWorkflow(b.root, 'w1', 'w1: beta');
    assert.equal(pushWorkflow(b.root, 'w1').pushed, true);
    // alpha closes the workflow.
    w.as(a);
    setFields(workflowDir(a.root, 'w1'), INDEX_NAME, { status: 'closed' });
    const q = squashWorkflow(a.root, 'w1');
    assert.deepEqual([q.ok, q.pushed], [true, true], JSON.stringify(q));
    assert.match(git(w.bare, 'show', 'main:notes/w1/beta.md'), /late work of beta/);
    assert.match(git(w.bare, 'show', `main:notes/w1/state.yaml`), /status: closed/);
    assert.doesNotMatch(refs(w.bare), /live\/notes\/w1/);
    assert.ok(readState().dropped.some((d) => d.ref === 'refs/heads/live/notes/w1'), 'the old tip is kept in the state');
  } finally { w.done(); }
});

test('a live branch of a closed workflow: the same folder is deleted; new records go onto main as one more commit', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    w.as(a);
    setFields(workflowDir(a.root, 'w1'), INDEX_NAME, { status: 'closed' });
    assert.equal(squashWorkflow(a.root, 'w1').pushed, true);
    // beta never wrote: its live branch holds nothing new and goes.
    w.as(b);
    const s1 = syncRecords(b.root);
    assert.deepEqual([s1.conflicts, s1.folded], [[], []]);
    assert.equal(git(b.clone, 'for-each-ref', 'refs/heads/live/'), '');
    assert.equal(frontmatterOfDoc(workflowDir(b.root, 'w1'), INDEX_NAME).status, 'closed');
    // beta writes after the close: the batch goes onto main, and the live branch goes.
    writeFileSync(join(workflowDir(b.root, 'w1'), 'retro-note.md'), 'written after the close\n');
    const s2 = syncRecords(b.root);
    assert.deepEqual([s2.conflicts, s2.folded], [[], ['w1']]);
    assert.match(git(w.bare, 'log', '--format=%s', 'main'), /notes\/w1: records after close/);
    assert.match(git(w.bare, 'show', 'main:notes/w1/retro-note.md'), /written after the close/);
    assert.doesNotMatch(refs(w.bare), /live\/notes\/w1/);
    // alpha pulls the batch.
    w.as(a);
    syncRecords(a.root);
    assert.equal(read(join(workflowDir(a.root, 'w1'), 'retro-note.md')), 'written after the close\n');
  } finally { w.done(); }
});

test('a close offline waits, and the next online sync pushes it', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const url = git(a.clone, 'remote', 'get-url', 'origin');
    git(a.clone, 'remote', 'set-url', 'origin', join(w.top, 'gone.git'));
    setFields(workflowDir(a.root, 'w1'), INDEX_NAME, { status: 'closed' });
    const q = squashWorkflow(a.root, 'w1');
    assert.deepEqual([q.ok, q.pending], [true, true]);
    assert.ok(readState().pendingClose.includes('notes/w1'));
    git(a.clone, 'remote', 'set-url', 'origin', url);
    const s = syncRecords(a.root);
    assert.equal(s.offline, false);
    assert.match(git(w.bare, 'show', `main:notes/w1/state.yaml`), /status: closed/);
    assert.doesNotMatch(refs(w.bare), /live\/notes\/w1/);
    assert.equal(readState().pendingClose.includes('notes/w1'), false);
  } finally { w.done(); }
});

test('two machines change one file: the conflict is reported and neither side loses its file', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'alpha\n');
    commitWorkflow(a.root, 'w1', 'w1: alpha');
    pushWorkflow(a.root, 'w1');
    w.as(b);
    writeFileSync(join(workflowDir(b.root, 'w1'), 'notes.md'), 'beta\n');
    const s = syncRecords(b.root, { holds: () => true });
    assert.equal(s.conflicts.length, 1, JSON.stringify(s));
    assert.equal(read(join(workflowDir(b.root, 'w1'), 'notes.md')), 'beta\n');
    assert.match(git(b.clone, 'show', 'refs/heads/live/notes/w1:notes/w1/notes.md'), /beta/);
    assert.match(git(w.bare, 'show', 'refs/heads/live/notes/w1:notes/w1/notes.md'), /alpha/);
    assert.ok(workflowHealth(b.root, 'w1').conflict);
  } finally { w.done(); }
});

test('a pull does not overwrite a file that this machine changed after its last commit', () => {
  const w = world();
  try {
    const { a, b } = twoMachines(w);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'one\n');
    commitWorkflow(a.root, 'w1', 'w1: notes');
    pushWorkflow(a.root, 'w1');
    w.as(b);
    syncRecords(b.root);
    w.as(a);
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'two\n');
    commitWorkflow(a.root, 'w1', 'w1: alpha');
    pushWorkflow(a.root, 'w1');
    w.as(b);
    git(b.clone, 'fetch', '-q', 'origin');
    const head = git(b.clone, 'rev-parse', 'refs/heads/live/notes/w1');
    const theirs = git(b.clone, 'rev-parse', 'refs/remotes/origin/live/notes/w1');
    writeFileSync(join(workflowDir(b.root, 'w1'), 'notes.md'), 'a change of beta that no commit holds\n');
    const r = applyTree(b.clone, head, theirs, 'notes/w1');
    assert.deepEqual(r.conflicts, ['notes/w1/notes.md']);
    assert.equal(read(join(workflowDir(b.root, 'w1'), 'notes.md')), 'a change of beta that no commit holds\n');
    // A file of the same content as the old commit is replaced.
    writeFileSync(join(workflowDir(b.root, 'w1'), 'notes.md'), 'one\r\n');
    assert.deepEqual(applyTree(b.clone, head, theirs, 'notes/w1').written, ['notes/w1/notes.md']);
    assert.equal(read(join(workflowDir(b.root, 'w1'), 'notes.md')), 'two\n');
  } finally { w.done(); }
});

test('two processes that create one live branch both land, one after the other', async () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const dir = workflowDir(a.root, 'w2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'one.md'), '1\n');
    writeFileSync(join(dir, 'two.md'), '2\n');
    const lib = new URL('../../lib/records-sync.mjs', import.meta.url).href;
    const run = (file) => new Promise((resolve) => {
      const code = `const m = await import(${JSON.stringify(lib)}); const c = m.commitPaths(${JSON.stringify(a.clone)}, { ref: 'refs/heads/live/notes/w2', base: 'refs/heads/main', paths: ['notes/w2/${file}'], message: '${file}' }); process.stdout.write(String(c));`;
      const p = spawn(process.execPath, ['--input-type=module', '-e', code], { env: process.env });
      let outText = '';
      p.stdout.on('data', (d) => { outText += d; });
      p.on('close', () => resolve(outText));
    });
    const [x, y] = await Promise.all([run('one.md'), run('two.md')]);
    assert.ok(x && y && x !== 'null' && y !== 'null', `${x} ${y}`);
    const files = git(a.clone, 'ls-tree', '-r', '--name-only', 'refs/heads/live/notes/w2');
    assert.match(files, /one\.md/);
    assert.match(files, /two\.md/);
  } finally { w.done(); }
});

test('a draft or a local-only file in the clone never goes into a commit', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const dir = workflowDir(a.root, 'w1');
    mkdirSync(join(dir, '.draft'), { recursive: true });
    writeFileSync(join(dir, '.draft', '04-plan.md'), 'a draft\n');
    writeFileSync(join(dir, '.control.json'), '{}\n');
    writeFileSync(join(dir, '.watch-state.json'), '{}\n');
    writeFileSync(join(dir, 'steps.jsonl'), '{}\n');
    writeFileSync(join(dir, '.driver-journal.jsonl'), '{}\n');
    commitWorkflow(a.root, 'w1', 'w1: files');
    const files = git(a.clone, 'ls-tree', '-r', '--name-only', 'refs/heads/live/notes/w1');
    assert.doesNotMatch(files, /\.draft|\.control\.json|\.watch-state\.json/);
    assert.match(files, /steps\.jsonl/);
    assert.match(files, /\.driver-journal\.jsonl/);
    // The pre-write check refuses a draft in the clone and names the local draft path.
    const hook = join(import.meta.dirname, '..', '..', 'hooks', 'pre-tool-use-all.mjs');
    const h = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: a.root, tool_input: { file_path: join(dir, '.draft', '05-implement.md'), content: 'x' } }), encoding: 'utf8', env: process.env });
    assert.equal(h.status, 2);
    assert.ok(h.stderr.includes(join(a.root, '.ai', 'workflows', 'w1', '.draft', '05-implement.md')), h.stderr);
  } finally { w.done(); }
});

test('a failed background push goes into the records log, and records status shows it', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    // The remote refuses every push from now on.
    const hooks = join(w.bare, 'hooks');
    writeFileSync(join(hooks, 'pre-receive'), '#!/bin/sh\necho refused >&2\nexit 1\n', { mode: 0o755 });
    writeFileSync(join(workflowDir(a.root, 'w1'), 'notes.md'), 'x\n');
    commitWorkflow(a.root, 'w1', 'w1: notes');
    const env = { ...process.env, SDLC_HOME: a.home };
    const p = spawnSync(process.execPath, [WF, 'records', 'push', a.root, 'w1'], { encoding: 'utf8', env });
    assert.equal(p.status, 1, p.stdout + p.stderr);
    const log = read(join(a.home, 'records-log.jsonl'));
    assert.match(log, /"slug":"w1","step":"push"/);
    const s = spawnSync(process.execPath, [WF, 'records', 'status', a.root], { encoding: 'utf8', env });
    assert.match(s.stdout, /failed: notes\/w1: push at/);
    assert.match(s.stdout, /branch: notes\/w1: 1 ahead/);
    assert.ok(recordsStatus(a.root).workflows.some((h) => h.workflow === 'notes/w1' && h.lastFailure));
  } finally { w.done(); }
});

test('a write into the clone that no commit holds shows in records status', () => {
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
    assert.equal(existsSync(join(a.clone, '.gitignore')), true);
    assert.match(read(join(a.clone, '.gitignore')), /\*\/INDEX\.md/);
  } finally { w.done(); }
});

test('commitPaths with an unchanged tree makes no commit and no new ref', () => {
  const w = world();
  try {
    const { a } = twoMachines(w);
    w.as(a);
    const before = git(a.clone, 'rev-parse', 'refs/heads/live/notes/w1');
    assert.equal(commitPaths(a.clone, { ref: 'refs/heads/live/notes/w1', paths: ['notes/w1'], message: 'none' }), before);
    assert.equal(commitPaths(a.clone, { ref: 'refs/heads/live/notes/none', base: 'refs/heads/main', paths: ['notes/none'], message: 'none' }), git(a.clone, 'rev-parse', 'main'));
    assert.equal(spawnSync('git', ['-C', a.clone, 'rev-parse', '--verify', '--quiet', 'refs/heads/live/notes/none']).status, 1);
  } finally { w.done(); }
});
