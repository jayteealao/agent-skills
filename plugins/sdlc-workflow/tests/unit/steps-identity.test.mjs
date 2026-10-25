// The step record survives history and checkouts: a rebase keeps a done step done, a worktree
// and the main checkout give one answer, a step commit must move HEAD, a step with no commit has
// an anchor, the plan gives only its steps, `complete` keeps the last run, and a planned stop
// is not a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { STEPS_FILE, LEGACY_PROGRESS, appendStep, planProblems, readPlan, readSteps, whereOf } from '../../lib/steps.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF = path.join(pluginRoot, 'scripts', 'wf.mjs');
const PLAN = '---\ntype: plan\n---\n# Plan: api\n\n## Step-by-Step Plan\n\n1. **Route** — files: `a.js`.\n2. **Store** — files: `b.js`.\n3. **Docs** — the readme.\n\n## Handover\n\n1. not a step\n';

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-step-id-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '04-plan-api.md'), PLAN);
  writeFileSync(path.join(dir, '03-slice.md'), '---\nschema: sdlc/v1\ntype: slice\nslug: demo\nslices:\n  - slug: api\n  - slug: web\n---\n');
  writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\nbase-branch: main\n---\n');
  writeFileSync(path.join(root, '.gitignore'), '.ai/\n');
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git('add', '.gitignore', 'base.txt');
  git('commit', '-qm', 'base');
  git('checkout', '-q', '-b', 'feat');
  const cli = (args, cwd = root) => spawnSync(process.execPath, [WF, 'step', ...args], { cwd, encoding: 'utf8' });
  const commit = (file, text, msg, cwd = root) => {
    writeFileSync(path.join(cwd, file), text);
    execFileSync('git', ['add', file], { cwd });
    execFileSync('git', ['commit', '-qm', msg], { cwd });
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
  };
  const where = (cwd = root) => JSON.parse(cli(['where', root, 'demo', 'api', '--json'], cwd).stdout);
  return { root, dir, git, cli, commit, where, done: () => rmSync(root, { recursive: true, force: true }) };
}

const ok = (r) => { assert.equal(r.status, 0, r.stderr); return r; };

test('a rebase keeps the done steps done, with the new sha; a dropped commit opens its step', () => {
  const f = repo();
  try {
    ok(f.cli(['start', f.root, 'demo', 'api', '1']));
    const s1 = f.commit('a.js', '1\n', 'wip(demo): api step 1');
    ok(f.cli(['done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']));
    ok(f.cli(['start', f.root, 'demo', 'api', '2']));
    f.commit('b.js', '2\n', 'wip(demo): api step 2');
    ok(f.cli(['done', f.root, 'demo', 'api', '2', '--sha', 'HEAD']));
    // main moves, and feat is rebased on it: both step commits get new shas.
    f.git('checkout', '-q', 'main');
    f.commit('c.txt', 'main\n', 'main moves');
    f.git('checkout', '-q', 'feat');
    f.git('rebase', '-q', 'main');
    let w = f.where();
    assert.deepEqual(w.done.map((d) => [d.n, d.state]), [[1, 'moved'], [2, 'moved']]);
    assert.equal(w.done[0].oldSha, s1);
    assert.notEqual(w.done[0].sha, s1);
    assert.equal(w.next.n, 3);
    assert.match(f.cli(['where', f.root, 'demo', 'api']).stdout, /step 1 moved/);
    // A reset that drops step 2 opens it again.
    f.git('reset', '-q', '--hard', 'HEAD~1');
    w = f.where();
    assert.deepEqual(w.done.map((d) => d.n), [1]);
    assert.deepEqual(w.dropped.map((d) => d.n), [2]);
    assert.equal(w.next.n, 2);
  } finally { f.done(); }
});

test('a step committed in a worktree is done from the worktree and from the main checkout', () => {
  const f = repo();
  try {
    const tree = path.join(f.root, '..', `${path.basename(f.root)}-wt`);
    f.git('checkout', '-q', 'main');
    f.git('worktree', 'add', '-q', tree, 'feat');
    try {
      ok(f.cli(['start', f.root, 'demo', 'api', '1'], tree));
      const s = f.commit('a.js', '1\n', 'wip(demo): api step 1', tree);
      const r = ok(f.cli(['done', f.root, 'demo', 'api', '1', '--sha', 'HEAD'], tree));
      assert.match(r.stdout, new RegExp(s.slice(0, 8)));
      const row = readFileSync(path.join(f.dir, STEPS_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).pop();
      assert.deepEqual([row.sha, row.branch], [s, 'feat']);
      assert.deepEqual(f.where(tree).done.map((d) => d.n), [1]);
      assert.deepEqual(f.where(f.root).done.map((d) => d.n), [1], 'the main checkout is on main, but the branch decides');
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: f.root });
    }
  } finally { f.done(); }
});

test('done --sha HEAD is refused when HEAD did not move, or names the commit of another step', () => {
  const f = repo();
  try {
    ok(f.cli(['start', f.root, 'demo', 'api', '1']));
    const none = f.cli(['done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /HEAD at the start of step 1/);
    f.commit('a.js', '1\n', 'step 1');
    ok(f.cli(['done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']));
    // Step 2 starts after a commit of its own failed: HEAD is still the commit of step 1.
    ok(f.cli(['start', f.root, 'demo', 'api', '2']));
    appendStep(f.dir, { slice: 'api', event: 'start', step: 3, head: 'x' });
    const twice = f.cli(['done', f.root, 'demo', 'api', '3', '--sha', 'HEAD']);
    assert.equal(twice.status, 1);
    assert.match(twice.stderr, /is the commit of step 1/);
    assert.match(f.cli(['done', f.root, 'demo', 'api', '2']).stderr, /--sha <commit> is required, or --no-change/);
  } finally { f.done(); }
});

test('a step with no commit is anchored: a reset past its anchor opens it again; an old row with no sha counts', () => {
  const f = repo();
  try {
    f.commit('a.js', '1\n', 'before');
    ok(f.cli(['start', f.root, 'demo', 'api', '1']));
    ok(f.cli(['done', f.root, 'demo', 'api', '1', '--no-change']));
    assert.deepEqual(f.where().done.map((d) => [d.n, d.noChange]), [[1, true]]);
    f.git('reset', '-q', '--hard', 'HEAD~1');
    assert.deepEqual(f.where().done, []);
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2, sha: null });
    const w = f.where();
    assert.deepEqual(w.done.map((d) => [d.n, d.legacy]), [[2, true]]);
    assert.match(w.notes.join(' '), /legacy-no-sha: step 2/);
  } finally { f.done(); }
});

test('the plan gives only its steps: no ### list, no fenced line, ### Step headings, a repeat and a step 0', () => {
  const sub = readPlan('## Step-by-Step Plan\n\n1. **One** — a.\n2. **Two** — b.\n\n### Risks\n\n1. not a step\n');
  assert.deepEqual(sub.steps.map((s) => s.n), [1, 2]);
  const fenced = readPlan('## Step-by-Step Plan\n\n1. **One**\n```\n2. code, not a step\n```\n2. **Two**\n');
  assert.deepEqual(fenced.steps.map((s) => [s.n, s.title]), [[1, 'One'], [2, 'Two']]);
  const heads = readPlan('## Step-by-Step Plan\n\n### Step 1: Route\n\n1. a sub-item\n2. another\n\n### Step 2 — Store\n\ntext\n');
  assert.deepEqual(heads.steps, [{ n: 1, title: 'Route' }, { n: 2, title: 'Store' }]);
  const bad = readPlan('## Step-by-Step Plan\n\n0. **Zero**\n1. **One**\n1. **Again**\n');
  assert.deepEqual(bad.steps.map((s) => s.n), [1]);
  assert.equal(bad.warnings.length, 2);
  assert.match(bad.warnings.join(' '), /line 3: step 0/);
  assert.match(bad.warnings.join(' '), /step 1 repeats/);
  assert.match(planProblems('## Step-by-Step Plan\n\nWe will do it.\n').join(' '), /no step that the step record can read/);
  assert.deepEqual(planProblems('## Other\n\n0. x\n'), [], 'a body with no plan section is not a plan check');
});

test('record put refuses a plan draft with a step 0 and names the line', () => {
  const f = repo();
  try {
    const draft = path.join(f.dir, '.draft', '04-plan-web.md');
    mkdirSync(path.dirname(draft), { recursive: true });
    writeFileSync(draft, '---\nschema: sdlc/v1\ntype: plan\nslug: demo\nslice-slug: web\nstatus: complete\n---\n\n## Step-by-Step Plan\n\n0. **Setup**\n1. **Build**\n');
    const r = spawnSync(process.execPath, [WF, 'record', 'put', f.root, 'demo'], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /refused 04-plan-web\.md: the plan: line 11: step 0/);
  } finally { f.done(); }
});

test('the where of a plan with no readable step says so', () => {
  const f = repo();
  try {
    writeFileSync(path.join(f.dir, '04-plan-web.md'), '---\ntype: plan\n---\n## Step-by-Step Plan\n\nWe build it.\n');
    assert.match(f.cli(['where', f.root, 'demo', 'web']).stdout, /the plan has no steps that the step record can read/);
  } finally { f.done(); }
});

test('complete refuses an open step, takes --skip with a reason, keeps the last run, and sees a replan', () => {
  const f = repo();
  try {
    ok(f.cli(['start', f.root, 'demo', 'api', '1']));
    f.commit('a.js', '1\n', 'step 1');
    ok(f.cli(['done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']));
    const open = f.cli(['complete', f.root, 'demo', 'api', '--sha', 'HEAD']);
    assert.equal(open.status, 1);
    assert.match(open.stderr, /steps 2, 3 of the plan are open/);
    assert.match(f.cli(['complete', f.root, 'demo', 'api', '--skip', '2,3']).stderr, /--skip needs --reason/);
    ok(f.cli(['complete', f.root, 'demo', 'api', '--sha', 'HEAD', '--skip', '2,3', '--reason', 'out of scope']));
    let w = f.where();
    assert.equal(w.complete, true);
    assert.deepEqual(w.lastRun.done.map((d) => d.n), [1]);
    assert.deepEqual(w.lastRun.skipped, [{ n: 2, reason: 'out of scope' }, { n: 3, reason: 'out of scope' }]);
    assert.match(f.cli(['where', f.root, 'demo', 'api']).stdout, /complete at .*; skipped 2, 3/);
    // The plan changes: the slice is open again from its first step.
    writeFileSync(path.join(f.dir, '04-plan-api.md'), PLAN.replace('3. **Docs** — the readme.', '3. **Docs** — the readme.\n4. **Answer** — the change of the answer.'));
    w = f.where();
    assert.deepEqual([w.complete, w.replanned, w.next.n], [false, true, 1]);
    assert.match(f.cli(['where', f.root, 'demo', 'api']).stdout, /the plan changed since the last complete run/);
  } finally { f.done(); }
});

test('a gate stop and a question stop are not failures; two fail stops ask for a split; a stop ends the running step', () => {
  const f = repo();
  try {
    ok(f.cli(['start', f.root, 'demo', 'api', '1']));
    const p = JSON.parse(readFileSync(path.join(f.dir, 'progress.json'), 'utf8'));
    assert.equal(p.status, 'running', 'a start with no run status writes running');
    ok(f.cli(['stop', f.root, 'demo', 'api', '--kind', 'gate', '--reason', 'the plan gate']));
    ok(f.cli(['stop', f.root, 'demo', 'api', '--kind', 'question', '--reason', 'ask the person']));
    let w = f.where();
    assert.deepEqual([w.hardStops, w.splitQuestion, w.stops.gate, w.stops.question], [0, false, 1, 1]);
    assert.equal(w.current, null);
    assert.deepEqual([w.stopped.n, w.stopped.kind], [1, 'question']);
    assert.match(f.cli(['where', f.root, 'demo', 'api']).stdout, /step 1 stopped \(question\): ask the person/);
    ok(f.cli(['stop', f.root, 'demo', 'api', '--reason', 'tests fail']));
    ok(f.cli(['stop', f.root, 'demo', 'api', '--reason', 'tests fail again']));
    w = f.where();
    assert.deepEqual([w.hardStops, w.splitQuestion], [2, true]);
    assert.match(f.cli(['stop', f.root, 'demo', 'api', '--kind', 'pause']).stderr, /kind of a stop must be one of/);
  } finally { f.done(); }
});

test('a slice that is not in the roster is refused', () => {
  const f = repo();
  try {
    const r = f.cli(['start', f.root, 'demo', 'nope', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /the slice nope is not in the roster of demo; the slices are: api, web/);
  } finally { f.done(); }
});

test('the old and the new step records are read in time order', () => {
  const f = repo();
  try {
    writeFileSync(path.join(f.dir, LEGACY_PROGRESS), '{"slice":"api","event":"step","step":2,"sha":"b","at":"2026-10-24T12:00:00Z"}\n');
    appendStep(f.dir, { slice: 'api', event: 'done', step: 1, sha: 'a' }, { now: '2026-10-24T11:00:00Z' });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 3, sha: 'c' }, { now: '2026-10-24T13:00:00Z' });
    assert.deepEqual(readSteps(f.dir).map((r) => r.step), [1, 2, 3]);
    assert.deepEqual(whereOf(f.dir, 'api').done.map((d) => d.n), [1, 2, 3]);
  } finally { f.done(); }
});
