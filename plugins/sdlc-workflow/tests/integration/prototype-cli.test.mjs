// WF-PROTOTYPE-PLAN W4 — scripts/prototype.mjs against a real git repository. The
// test plays the agent: it writes proof files and the ledger in the worktree, then runs
// the script. Guards, red first: no write outside the worktree, a commit only on a
// decide round and only of explicit paths, a report that reads with scripts off, an
// exit that only the person chooses, and a cleanup that refuses while a link remains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOfDoc, readDoc } from '../../lib/records.mjs';
import { validateFrontmatter } from '../../lib/schema-validator.mjs';
import { lifecycleDone } from '../../lib/lifecycle-done.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'prototype.mjs');
const S = 'faces';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function run(root, cmd, ...rest) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, cmd, root, S, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}

function makeRepo() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'proto cli '));
  const root = path.join(base, 'app');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'p@test');
  git(root, 'config', 'user.name', 'p');
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return { base, root };
}

const ledgerPath = (wt) => path.join(wt, '.ai', 'workflows', S, 'prototype-ledger.json');
const readLedger = (wt) => JSON.parse(readFileSync(ledgerPath(wt), 'utf8'));
const writeLedger = (wt, l) => writeFileSync(ledgerPath(wt), `${JSON.stringify(l, null, 2)}\n`);
function put(wt, rel, text) {
  mkdirSync(path.dirname(path.join(wt, rel)), { recursive: true });
  writeFileSync(path.join(wt, rel), text);
}
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function runRounds(wt) {
  put(wt, 'poc/fit.py', 'print("fit")\n');
  put(wt, 'poc/config.json', '{"strength": 0.6}\n');
  put(wt, 'poc/out/fit.png', PNG);
  put(wt, 'weights/model.bin', 'pretend weights\n');
  put(wt, '.scratch/prototype/run.log', 'scratch\n');
  const l = readLedger(wt);
  l.rounds.push({ id: 'R-01', kind: 'prove', request: 'Prove out the fit', question: 'Does the fit work?', proofs: ['P-01'] });
  l.proofs.push({
    id: 'P-01', round: 'R-01', question: 'Does the fit work?', setup: { seeds: [1], hardware: 'cpu' },
    evidence: { measured: [{ name: 'time', value: 3.2, unit: 's' }], estimated: [] },
    repro: { 'same-process': 'pass', 'fresh-process': 'pass' }, verdict: 'pass',
    licenses: [{ item: 'model A', license: 'MIT' }], files: ['poc/fit.py', '.scratch/prototype/run.log'], media: ['poc/out/fit.png'],
  });
  l.rounds.push({ id: 'R-02', kind: 'decide', request: 'Really happy with the fit', question: 'Accept the fit?', files: ['poc/config.json'] });
  l.decisions.push({ id: 'D-01', round: 'R-02', component: 'the fit', proofs: ['P-01'], generalized: false, words: 'Really happy with the fit' });
  l.pipeline.push({ stage: 'Fit', component: 'the fit', decision: 'D-01', time: { value: 3.2, unit: 's', kind: 'measured' } });
  writeLedger(wt, l);
}

test('start makes the poc branch, a worktree beside the checkout, the records, and the INDEX.md row', () => {
  const { base, root } = makeRepo();
  try {
    const out = run(root, 'start', '--idea', 'Can a fitted head model give believable faces?');
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.branch, 'poc/faces');
    assert.ok(!out.worktree.startsWith(root + path.sep), 'the worktree is not inside the main checkout');
    assert.equal(git(out.worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), 'poc/faces');
    const dir = path.join(out.worktree, '.ai', 'workflows', S);
    // The records are YAML record files: the index is state.yaml and meta.yaml, the pipeline is intake.yaml.
    for (const f of ['state.yaml', 'meta.yaml', 'prototype-ledger.json', 'intake.yaml']) assert.ok(existsSync(path.join(dir, f)), f);
    for (const f of ['00-index.md', '01-prototype.md']) assert.ok(!existsSync(path.join(dir, f)), f);
    assert.equal(existsSync(path.join(root, '.ai', 'workflows', S)), false, 'the main checkout holds no prototype folder');
    for (const f of ['00-index.md', '01-prototype.md']) {
      const fm = frontmatterOfDoc(dir, f);
      const v = validateFrontmatter(fm);
      assert.equal(v.valid, true, `${f}: ${JSON.stringify(v.errors)}`);
    }
    assert.deepEqual([frontmatterOfDoc(dir, '00-index.md')['workflow-type'], frontmatterOfDoc(dir, '00-index.md').progress], ['prototype', { prototype: 'in-progress' }]);
    assert.match(readDoc(dir, '01-prototype.md').body, /## The accepted pipeline/);
    const row = readFileSync(path.join(root, '.ai', 'workflows', 'INDEX.md'), 'utf8').split('\n').find((l) => l.startsWith(`${S}\t`));
    assert.equal(row.split('\t').slice(0, 4).join('|'), 'faces|open|prototype|poc/faces');
    assert.equal(git(out.worktree, 'check-ignore', '-q', '.scratch/prototype/x.log') === '', true, 'scratch is ignored in the worktree');
    // Resume from the main checkout finds the worktree.
    const st = run(root, 'status');
    assert.equal(st.ok, true, JSON.stringify(st));
    assert.equal(path.resolve(st.worktree).toLowerCase(), path.resolve(out.worktree).toLowerCase());
    assert.equal(run(root, 'start', '--idea', 'again').resumed, true, 'a second start resumes');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('start uses an existing poc branch when the person names one', () => {
  const { base, root } = makeRepo();
  try {
    git(root, 'branch', 'poc/regen-faces');
    const out = run(root, 'start', '--idea', 'faces again', '--branch', 'poc/regen-faces');
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.reusedBranch, true);
    assert.equal(git(out.worktree, 'rev-parse', '--abbrev-ref', 'HEAD'), 'poc/regen-faces');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('check refuses a ledger with a file outside the worktree or a missing file', () => {
  const { base, root } = makeRepo();
  try {
    const { worktree: wt } = run(root, 'start', '--idea', 'faces');
    runRounds(wt);
    assert.equal(run(root, 'check').ok, true, JSON.stringify(run(root, 'check')));
    const l = readLedger(wt);
    l.proofs[0].files.push('C:/Users/someone/AppData/Local/Temp/portrait/run.py', '../app/README.md', 'poc/missing.py');
    writeLedger(wt, l);
    const c = run(root, 'check');
    assert.equal(c.ok, false);
    const p = c.problems.join('\n');
    assert.match(p, /an absolute path/);
    assert.match(p, /outside the worktree/);
    assert.match(p, /poc\/missing\.py does not exist/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('report writes a page that reads with scripts off and embeds its media', () => {
  const { base, root } = makeRepo();
  try {
    const { worktree: wt } = run(root, 'start', '--idea', 'faces');
    runRounds(wt);
    const r = run(root, 'report');
    assert.equal(r.ok, true, JSON.stringify(r));
    const html = readFileSync(r.file, 'utf8');
    assert.doesNotMatch(html, /<script/i);
    assert.match(html, /<img src="data:image\/png;base64,/);
    assert.doesNotMatch(html, /src="https?:/);
    assert.ok(r.bytes < 1_000_000);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('decide commits explicit paths only: no weights, no scratch, no staged stranger', () => {
  const { base, root } = makeRepo();
  try {
    const { worktree: wt } = run(root, 'start', '--idea', 'faces');
    runRounds(wt);
    // A file someone staged by hand: decide refuses rather than sweep it in.
    put(wt, 'notes.txt', 'mine\n');
    git(wt, 'add', 'notes.txt');
    const refused = run(root, 'decide', 'D-01');
    assert.equal(refused.ok, false);
    assert.deepEqual(refused.staged, ['notes.txt']);
    git(wt, 'reset', '-q', 'notes.txt');

    const d = run(root, 'decide', 'D-01');
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.equal(git(wt, 'log', '-1', '--format=%s'), 'poc: accept the fit');
    const files = git(wt, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    assert.deepEqual(files, [
      '.ai/workflows/faces/intake.yaml', '.ai/workflows/faces/meta.yaml', '.ai/workflows/faces/prototype-ledger.json',
      '.ai/workflows/faces/report.html', '.ai/workflows/faces/state.yaml', 'poc/config.json', 'poc/fit.py',
    ]);
    assert.match(d.warning, /without a generalize check/);
    assert.deepEqual(d.skipped, ['.scratch/prototype/run.log']);
    assert.equal(readLedger(wt).decisions[0].commit, d.commit, 'the commit id goes into the ledger');
    assert.match(git(wt, 'status', '--porcelain'), /weights\//, 'the weights stay uncommitted');
    assert.equal(run(root, 'decide', 'D-01').ok, false, 'a decision commits once');
    assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'the main checkout did not move');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('exit records the person\'s choice; cleanup refuses until close, and while a link remains', () => {
  const { base, root } = makeRepo();
  try {
    const { worktree: wt } = run(root, 'start', '--idea', 'faces');
    const park = run(root, 'exit', 'park');
    assert.equal(park.status, 'parked');
    const index = frontmatterOfDoc(path.join(wt, '.ai', 'workflows', S), '00-index.md');
    assert.deepEqual([index.status, index.progress.prototype, index['next-invocation']], ['parked', 'parked', '/wf loop prototype faces <request>']);
    const grad = run(root, 'exit', 'graduate');
    assert.equal(grad.next, '/wf intake faces from faces');
    assert.equal(path.basename(grad.brief), 'intake.yaml', 'the brief is the pipeline record');
    assert.equal(run(root, 'cleanup').ok, false, 'cleanup refuses until the person closes the prototype');
    run(root, 'exit', 'close');
    const target = path.join(base, 'shared-modules');
    mkdirSync(target);
    symlinkSync(target, path.join(wt, 'node_modules'), 'junction');
    const c = run(root, 'cleanup');
    assert.equal(c.ok, false);
    assert.deepEqual(c.links, ['node_modules']);
    rmSync(path.join(wt, 'node_modules'), { recursive: false, force: true });
    const dirty = run(root, 'cleanup');
    assert.equal(dirty.ok, false, 'uncommitted records: git refuses, and the script does not force it');
    assert.match(dirty.error, /look at them/);
    git(wt, 'add', '--', '.ai/workflows/faces');
    git(wt, 'commit', '-q', '-m', 'records');
    const ok = run(root, 'cleanup');
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.equal(existsSync(wt), false);
    assert.equal(existsSync(target), true, 'the link target survives');
    assert.match(git(root, 'branch', '--list', 'poc/faces'), /poc\/faces/, 'the branch stays as the reference');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('goal refuses a prototype slug: a script cannot say a prototype is done', () => {
  const { base, root } = makeRepo();
  try {
    const { worktree: wt } = run(root, 'start', '--idea', 'faces');
    const r = lifecycleDone(wt, S);
    assert.equal(r.state ?? r.verdict ?? r.status, 'blocked', JSON.stringify(r));
    assert.match(JSON.stringify(r), /\/wf loop prototype/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
