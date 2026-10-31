// A refusal of wf.mjs names its fix: a last line `fix: <command>` where a command fixes it, the
// forms and the allowed values of a usage error, the help for a bare form, a receipt of `none`
// when the test profile has no suite for implement, and a silent Git Bash path repair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { undoGitBashPath, unrepairedWarning } from '../../lib/msys.mjs';
import { noSuiteReceipt, receiptState } from '../../lib/test-receipt.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (args, opts = {}) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...args], { encoding: 'utf8', ...opts });
const lastLine = (s) => s.trim().split(/\r?\n/).pop();
const PLAN = '---\ntype: plan\n---\n# Plan: api\n\n## Step-by-Step Plan\n\n1. **Route** — files: `a.js`.\n2. **Store** — files: `b.js`.\n';

function repo({ profile = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-fix-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: plan\n---\n');
  writeFileSync(path.join(dir, '03-slice.md'), '---\nschema: sdlc/v1\ntype: slice\nslug: demo\nslices:\n  - slug: api\n---\n');
  writeFileSync(path.join(dir, '04-plan-api.md'), PLAN);
  if (profile) writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ testProfile: profile }));
  writeFileSync(path.join(root, '.gitignore'), '.ai/\n');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git('add', '.gitignore', 'base.txt');
  git('commit', '-qm', 'base');
  return { root, dir, git, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('step done at the HEAD of the start of the step ends with the fix: commit, then step done --sha HEAD', () => {
  const f = repo();
  try {
    assert.equal(run(['step', 'start', f.root, 'demo', 'api', '1']).status, 0);
    const r = run(['step', 'done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /HEAD at the start of step 1/);
    assert.match(lastLine(r.stderr), /^fix: git commit -m "<what step 1 does>" && wf\.mjs step done \S+ demo api 1 --sha HEAD$/);
    const noSha = run(['step', 'done', f.root, 'demo', 'api', '1']);
    assert.match(lastLine(noSha.stderr), /^fix: wf\.mjs step done \S+ demo api 1 --sha HEAD$/);
    const open = run(['step', 'complete', f.root, 'demo', 'api']);
    assert.match(open.stderr, /steps 1, 2 of the plan are open/);
    assert.match(lastLine(open.stderr), /^fix: wf\.mjs step complete \S+ demo api --skip 1,2 --reason "<why>"$/);
  } finally { f.done(); }
});

test('a suite with no command names the profile set command, with the root', () => {
  const f = repo({ profile: { fast: { command: 'node --version', estimateSeconds: 1 } } });
  try {
    const r = run(['profile', 'run', f.root, 'heavy']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the test profile has no command for the heavy suite/);
    assert.match(lastLine(r.stderr), /^fix: wf\.mjs profile set .+ heavy --command "<command>" --estimate <seconds>$/);
    assert.ok(lastLine(r.stderr).includes(path.basename(f.root)), 'the fix names the root of the call');
    const receipt = run(['receipt', f.root, 'demo', 'api', '--suites', 'fast,full']);
    assert.equal(receipt.status, 1);
    assert.match(lastLine(receipt.stderr), /^fix: wf\.mjs profile set .* full --command "<command>" --estimate <seconds>$/);
  } finally { f.done(); }
});

test('a missing workflow folder names the status command, which lists the workflows', () => {
  const f = repo();
  try {
    const r = run(['decide', 'list', f.root, 'nope']);
    assert.equal(r.status, 1);
    assert.match(lastLine(r.stderr), /^fix: wf\.mjs status \S+$/);
  } finally { f.done(); }
});

test('a usage error prints the forms of the verb and the allowed values of its enums', () => {
  const f = repo();
  try {
    const r = run(['decide', 'add', f.root, 'demo', '--answer', 'x', '--by', 'robot']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /by must be one of person, policy, delegate/);
    assert.match(r.stderr, /the forms of decide add:\ndecide {3}add <root> <slug> --answer a/);
    assert.match(r.stderr, /values: --by person\|policy\|delegate\|standing:<id>; --kind answer\|steer\|approval\|try-out\|delegate/);
    assert.doesNotMatch(r.stderr, /the forms of decide add:[\s\S]*decide {3}list/);
    const stop = run(['step', 'stop', f.root, 'demo', 'api', '--kind', 'pause']);
    assert.match(stop.stderr, /values: --kind fail\|gate\|question/);
    const stage = run(['record', 'stage-done', f.root, 'demo', 'nope']);
    assert.match(stage.stderr, /values: <stage> intake\|design\|slice\|plan\|implement\|verify\|review\|ship\|retro/);
  } finally { f.done(); }
});

test('a bare form prints the help and exits 0: a command of forms, one verb, a command that needs its root', () => {
  const record = run(['record']);
  assert.equal(record.status, 0, record.stderr);
  assert.match(record.stdout, /^record {3}put <root> <slug>/m);
  assert.equal(record.stderr, '');
  const add = run(['decide', 'add']);
  assert.equal(add.status, 0);
  assert.match(add.stdout, /^decide {3}add <root> <slug> --answer a/m);
  assert.doesNotMatch(add.stdout, /decide {3}list/);
  assert.match(add.stdout, /^values: --by person\|policy\|delegate\|standing:<id>/m);
  const status = run(['status']);
  assert.equal(status.status, 0);
  assert.match(status.stdout, /^status {3}<root> \[<slug>\]/m);
  // A form whose root is optional runs; an unknown form still exits 2 with the forms.
  assert.equal(run(['describe']).status, 0);
  const unknown = run(['record', 'sett']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /record has no form sett\. Its forms:/);
});

test('no suite for implement: receipt and stage-done write a receipt of none and go on', () => {
  const f = repo();
  try {
    const r = run(['receipt', f.root, 'demo', 'api']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'receipt: none (no suite in the profile)');
    const file = path.join(f.dir, '.test-receipt-api.json');
    const held = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(held.result, 'none');
    assert.equal(held.reason, 'no suite in the profile');
    assert.equal(held.sha, f.git('rev-parse', 'HEAD'));
    assert.deepEqual(receiptState(f.root, held), { reusable: false, reason: 'none (no suite in the profile)' });
    const check = run(['receipt', f.root, 'demo', 'api', '--check']);
    assert.equal(check.status, 1);
    assert.equal(check.stdout.trim(), 'no receipt: none (no suite in the profile)');

    rmSync(file);
    const done = run(['record', 'stage-done', f.root, 'demo', 'implement', 'api']);
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /; receipt: none \(no suite in the profile\)$/m);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).result, 'none');
  } finally { f.done(); }
});

test('a profile with an implement suite: stage-done writes no receipt, and a pass receipt stays', () => {
  const f = repo({ profile: { fast: { command: 'node --version', estimateSeconds: 1 } } });
  try {
    assert.equal(noSuiteReceipt(f.root, f.dir, 'api'), null);
    const done = run(['record', 'stage-done', f.root, 'demo', 'implement', 'api']);
    assert.equal(done.status, 0, done.stderr);
    assert.doesNotMatch(done.stdout, /receipt/);
    assert.equal(existsSync(path.join(f.dir, '.test-receipt-api.json')), false);
  } finally { f.done(); }
});

test('the receipt records a change that is in no commit of the slice, and does not refuse', () => {
  const f = repo({ profile: { fast: { command: 'node --version', estimateSeconds: 1 } } });
  try {
    writeFileSync(path.join(f.root, 'base.txt'), 'stray\n');
    const r = run(['receipt', f.root, 'demo', 'api']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /recorded 1 change\(s\) that are in no commit of the slice: base\.txt/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(f.dir, '.test-receipt-api.json'), 'utf8')).dirty.map((d) => d.path), ['base.txt']);
  } finally { f.done(); }
});

test('the Git Bash repair is silent; a value it cannot repair warns', () => {
  const f = repo();
  try {
    const p = run(['progress', 'set', f.root, 'demo', '--status', 'running', '--resume', 'C:/Program Files/Git/wf ship demo']);
    assert.equal(p.status, 0, p.stderr);
    assert.equal(p.stderr, '');
    assert.equal(JSON.parse(readFileSync(path.join(f.dir, 'progress.json'), 'utf8')).resume, '/wf ship demo');
    const left = run(['progress', 'set', f.root, 'demo', '--reason', 'C:/Program Files/Git/ship demo']);
    assert.equal(left.status, 0, left.stderr);
    assert.match(left.stderr, /--reason begins with the Git install path .*MSYS_NO_PATHCONV=1/);
  } finally { f.done(); }
  assert.deepEqual(undoGitBashPath('C:/Program Files/Git/wf plan x'), { value: '/wf plan x', repaired: true });
  assert.equal(unrepairedWarning('--x', '/wf plan x'), null);
  assert.equal(unrepairedWarning('--x', 'C:/Program Files/Git/bin/bash'), null);
  assert.equal(unrepairedWarning('--x', 'C:/Users/me/Git/proj/answers.json'), null);
  assert.match(unrepairedWarning('--x', 'C:/Program Files/Git/ship x'), /--x begins with the Git install path/);
});
