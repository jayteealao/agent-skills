// The link is safe: it merges a folder that the clone holds already, keeps both copies of a
// file that differs, squashes the closed workflows, waits for the files of a worktree, and
// reports the record files that the product repo tracks or does not ignore. A worktree of a
// linked project uses the clone, and the removal check of a worktree reads the clone copy.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME } from '../../lib/records.mjs';
import { linkedProject, mainWorktreeOf, parseWorkflowPath, recordsHome, workflowsRoot } from '../../lib/records-root.mjs';
import { commitWorkflow, linkProject, productRepoGaps } from '../../lib/records-sync.mjs';
import { recordsPending } from '../../lib/campaign-records.mjs';
import { defaultRun, readyGaps } from '../../lib/last-mile.mjs';
import { fromGitBashPath } from '../../lib/msys.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-link-'));
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
  return dir;
}

/** A product repo with one commit, so a worktree and a branch can be cut from it. */
function productRepo(root) {
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'README.md'), 'product\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-q', '-m', 'init');
}

test('a closed workflow is squashed at the link; a second link merges the folder and keeps both copies of a file that differs', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    writeFileSync(join(workflow(a.root, 'w1', 'complete'), 'a.md'), 'from alpha\n');
    const r = linkProject(a.root, 'notes');
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.squashed, ['w1']);
    assert.match(git(w.bare, 'ls-tree', '-r', '--name-only', 'main'), /notes\/w1\/a\.md/);
    assert.doesNotMatch(git(w.bare, 'for-each-ref', '--format=%(refname)'), /live\/notes\/w1/);

    const b = w.as(w.machine('beta'));
    git(b.clone, 'pull', '-q');
    const dir = workflow(b.root, 'w1', 'complete');
    writeFileSync(join(dir, 'a.md'), 'from beta\n');
    writeFileSync(join(dir, 'b.md'), 'only beta\n');
    mkdirSync(join(dir, '.draft'), { recursive: true });
    writeFileSync(join(dir, '.draft', 'd.md'), 'draft\n');
    const cli = spawnSync(process.execPath, [WF, 'records', 'link', b.root, 'notes'], { encoding: 'utf8', env: process.env });
    assert.equal(cli.status, 1, cli.stdout + cli.stderr);
    assert.match(cli.stdout, /records-conflict: w1\/a\.md/);
    assert.equal(read(join(b.clone, 'notes', 'w1', 'a.md')), 'from alpha\n', 'the clone copy stays');
    assert.equal(read(join(b.root, '.ai', 'workflows', '.conflicts', 'w1', 'a.md')), 'from beta\n', 'the local copy is kept aside');
    assert.equal(read(join(b.clone, 'notes', 'w1', 'b.md')), 'only beta\n', 'a new file moves');
    assert.equal(existsSync(join(dir, 'b.md')), false);
    assert.equal(read(join(dir, '.draft', 'd.md')), 'draft\n', 'the draft stays');
    assert.equal(linkedProject(b.root), 'notes', 'the config is written with a conflict too');
  } finally { w.done(); }
});

test('a file that a session writes after the link stays local, and the next commit moves it', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    assert.equal(linkProject(a.root, 'notes').ok, true);
    const late = join(a.root, '.ai', 'workflows', 'w1', 'late.md');
    writeFileSync(late, 'late\n');
    commitWorkflow(a.root, 'w1', 'w1: late');
    assert.equal(existsSync(late), false);
    assert.equal(read(join(a.clone, 'notes', 'w1', 'late.md')), 'late\n');
  } finally { w.done(); }
});

test('the link reports tracked record files and the missing .gitignore line; ship refuses a branch that adds record files', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    productRepo(a.root);
    writeFileSync(join(workflow(a.root, 'w1'), 'x.md'), 'x\n');
    git(a.root, 'add', '-f', '.ai/workflows/w1/x.md');
    git(a.root, 'commit', '-q', '-m', 'records');
    const r = linkProject(a.root, 'notes');
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual(r.tracked, ['.ai/workflows/w1/x.md']);
    assert.equal(r.ignoreLine, '.ai/workflows/');
    assert.equal(git(a.root, 'log', '--oneline').split('\n').length, 2, 'the link commits nothing in the product repo');

    git(a.root, 'rm', '-q', '-r', '--cached', '--', '.ai/workflows');
    writeFileSync(join(a.root, '.gitignore'), '.ai/workflows/\n');
    git(a.root, 'add', '.gitignore');
    git(a.root, 'commit', '-q', '-m', 'stop tracking');
    assert.deepEqual(productRepoGaps(a.root), { tracked: [], ignoreLine: null });

    git(a.root, 'switch', '-q', '-c', 'feat');
    mkdirSync(join(a.root, '.ai', 'workflows', 'w1'), { recursive: true });
    writeFileSync(join(a.root, '.ai', 'workflows', 'w1', 'y.md'), 'y\n');
    git(a.root, 'add', '-f', '.ai/workflows/w1/y.md');
    git(a.root, 'commit', '-q', '-m', 'oops');
    const run = (cmd, args, o) => (cmd === 'git' ? defaultRun(cmd, args, o) : { status: 1, stdout: '', stderr: 'no gh' });
    const gaps = readyGaps(a.root, { run, base: 'main' });
    assert.ok(gaps.some((g) => g.code === 'records-in-diff' && /y\.md/.test(g.task)), JSON.stringify(gaps));
  } finally { w.done(); }
});

test('a worktree with no config uses the clone; the link waits while a worktree holds other workflow files', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    productRepo(a.root);
    writeFileSync(join(workflow(a.root, 'w1'), 'a.md'), 'v1\n');
    const wt = join(w.top, 'wt');
    git(a.root, 'worktree', 'add', '-q', wt);
    mkdirSync(join(wt, '.ai', 'workflows', 'w1'), { recursive: true });
    writeFileSync(join(wt, '.ai', 'workflows', 'w1', 'a.md'), 'v2\n');
    assert.equal(mainWorktreeOf(wt).toLowerCase(), a.root.toLowerCase());

    const refused = linkProject(a.root, 'notes');
    assert.equal(refused.ok, false);
    assert.deepEqual(refused.worktreeFiles.map((f) => f.file), ['w1/a.md']);
    assert.equal(existsSync(join(a.root, '.ai', 'sdlc-config.json')), false, 'no config before the files are home');

    writeFileSync(join(a.root, '.ai', 'workflows', 'w1', 'a.md'), 'v2\n');
    assert.equal(linkProject(a.root, 'notes').ok, true);
    assert.equal(linkedProject(wt), 'notes', 'the worktree reads the config of the main worktree');
    assert.equal(workflowsRoot(wt), join(a.clone, 'notes'));

    // The removal check of the worktree compares with the clone copy.
    const manifest = { files: {} };
    assert.deepEqual(recordsPending({ main: a.root, worktree: wt, manifest }), []);
    writeFileSync(join(wt, '.ai', 'workflows', 'w1', 'a.md'), 'v3\n');
    assert.deepEqual(recordsPending({ main: a.root, worktree: wt, manifest }).map((p) => p.rel), ['workflows/w1/a.md']);

    // The clone commits v3, then moves on to v4: the worktree copy is an older version, in a commit of the clone.
    writeFileSync(join(a.clone, 'notes', 'w1', 'a.md'), 'v3\n');
    assert.ok(commitWorkflow(a.root, 'w1', 'w1: v3').commit);
    writeFileSync(join(a.clone, 'notes', 'w1', 'a.md'), 'v4\n');
    assert.deepEqual(recordsPending({ main: a.root, worktree: wt, manifest }), [], 'the clone holds a newer version');
    // CRLF line endings of the same text are the same version.
    writeFileSync(join(wt, '.ai', 'workflows', 'w1', 'a.md'), 'v3\r\n');
    assert.deepEqual(recordsPending({ main: a.root, worktree: wt, manifest }), []);
    writeFileSync(join(wt, '.ai', 'workflows', 'w1', 'a.md'), 'v5\n');
    assert.deepEqual(recordsPending({ main: a.root, worktree: wt, manifest }).map((p) => p.rel), ['workflows/w1/a.md'], 'a version that no commit of the clone holds is pending');
  } finally { w.done(); }
});

test('a worktree with its own unlinked config is a separate record store: the link does not wait for it and names it', () => {
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    productRepo(a.root);
    writeFileSync(join(workflow(a.root, 'w1'), 'a.md'), 'v1\n');
    const wt = join(w.top, 'wt-poc');
    git(a.root, 'worktree', 'add', '-q', wt);
    mkdirSync(join(wt, '.ai', 'workflows', 'w1'), { recursive: true });
    writeFileSync(join(wt, '.ai', 'workflows', 'w1', 'a.md'), 'poc\n');
    writeFileSync(join(wt, '.ai', 'sdlc-config.json'), '{ "artifactTracking": "ignored" }\n');

    const l = linkProject(a.root, 'notes');
    assert.equal(l.ok, true, JSON.stringify(l));
    assert.deepEqual(l.separate.map((p) => p.toLowerCase()), [wt.toLowerCase()]);
    assert.equal(linkedProject(wt), null, 'the worktree stays unlinked');
    assert.equal(read(join(wt, '.ai', 'workflows', 'w1', 'a.md')), 'poc\n', 'its records stay in it');
    assert.equal(read(join(a.clone, 'notes', 'w1', 'a.md')), 'v1\n', 'the clone keeps the main copy');
  } finally { w.done(); }
});

test('a Git Bash drive path is repaired on Windows; a record path ignores case on Windows', () => {
  assert.equal(fromGitBashPath('/c/Users/x', { platform: 'win32' }), 'C:/Users/x');
  assert.equal(fromGitBashPath('/d', { platform: 'win32' }), 'D:/');
  assert.equal(fromGitBashPath('/wf', { platform: 'win32' }), '/wf');
  assert.equal(fromGitBashPath('/c/Users/x', { platform: 'linux' }), '/c/Users/x');
  if (process.platform !== 'win32') return;
  assert.equal(parseWorkflowPath('C:\\p\\.AI\\Workflows\\w1\\a.md')?.slug, 'w1');
  const w = world();
  try {
    const a = w.as(w.machine('alpha'));
    workflow(a.root, 'w1');
    assert.equal(linkProject(a.root, 'notes').ok, true);
    const bash = (p) => p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
    writeFileSync(join(a.home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', home: bash(a.clone) } }));
    assert.equal(recordsHome().toLowerCase(), a.clone.toLowerCase());
    const cli = spawnSync(process.execPath, [WF, 'records', 'status', bash(a.root)], { encoding: 'utf8', env: process.env });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /records: notes in/);
  } finally { w.done(); }
});
