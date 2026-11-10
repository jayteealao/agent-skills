// The stage records of both layouts (per-slice suffixed, and the un-suffixed names of a change
// mode or single-scope work), one precedence for the next step, the dispatch of the maintenance
// words, a paused ship, a run that restores only its own writes, and the small rules around them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { diskFacts, dispatch, nextStep } from '../../../lib/dispatch.mjs';
import { loadRegistry } from '../../../lib/registry.mjs';
import { frontmatterOfDoc } from '../../../lib/records.mjs';
import { stageDone, stageFileOf } from '../../../lib/stage-done.mjs';
import { planDocOf } from '../../../lib/steps.mjs';
import { statusBrief, statusOf } from '../../../lib/wf-status.mjs';
import { judgeLifecycle } from '../../../lib/lifecycle-done.mjs';
import { fromLifecycle } from '../../../lib/goal.mjs';
import { stageRenames } from '../../../lib/modernize.mjs';
import { runScript } from '../../../lib/wf-api.mjs';
import { treeChanges } from '../../../lib/test-receipt.mjs';
import { runProbe, checkDeferrals } from '../../../lib/deferrals.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const reg = loadRegistry(pluginRoot);

const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`).join('\n')}\n---\n# body\n`;

function project(files, slug = 'demo') {
  const root = mkdtempSync(path.join(tmpdir(), 'stage-layout-'));
  const dir = path.join(root, '.ai', 'workflows', slug);
  mkdirSync(dir, { recursive: true });
  for (const [name, data] of Object.entries(files)) writeFileSync(path.join(dir, name), fm(data));
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

const index = (extra = {}) => ({ schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'implement', ...extra });

test('a change mode and single-scope work name their stage records without the slice suffix', () => {
  const p = project({
    '00-index.md': index({ 'workflow-type': 'fix' }),
    '03-slice.md': { schema: 'sdlc/v1', type: 'slice', slug: 'demo', slices: [{ slug: 'demo', status: 'in-progress' }] },
    '04-plan.md': { schema: 'sdlc/v1', type: 'plan', slug: 'demo', status: 'complete' },
    '05-implement.md': { schema: 'sdlc/v1', type: 'implement', slug: 'demo', status: 'complete' },
    '06-verify.md': { schema: 'sdlc/v1', type: 'verify', slug: 'demo', status: 'complete', result: 'pass', convergence: 'converged' },
  });
  try {
    assert.equal(stageFileOf(p.dir, '06-verify', 'demo'), '06-verify.md');
    assert.ok(planDocOf(p.dir, 'demo'), 'the plan of the one slice');
    const r = stageDone(p.dir, 'demo', 'verify', 'demo');
    assert.equal(r['roster-status'], 'complete', 'the un-suffixed verify record is read');
    assert.ok(r['workflow-files'].includes('06-verify.md'));
  } finally { p.done(); }
});

test('multi-slice work keeps the suffixed names', () => {
  const p = project({
    '00-index.md': index(),
    '03-slice.md': { schema: 'sdlc/v1', type: 'slice', slug: 'demo', slices: [{ slug: 'api', status: 'defined' }, { slug: 'ui', status: 'defined' }] },
    '04-plan-api.md': { schema: 'sdlc/v1', type: 'plan', slug: 'demo', status: 'complete' },
  });
  try {
    assert.equal(stageFileOf(p.dir, '06-verify', 'api'), '06-verify-api.md');
    assert.equal(stageFileOf(p.dir, '04-plan', 'ui'), '04-plan-ui.md');
    assert.equal(planDocOf(p.dir, 'ui'), null);
  } finally { p.done(); }
});

test('the status of a single-scope workflow reads its un-suffixed records', async () => {
  const p = project({
    '00-index.md': index({ 'workflow-type': 'hotfix', 'selected-slice': 'demo' }),
    '03-slice.md': { schema: 'sdlc/v1', type: 'slice', slug: 'demo', slices: [{ slug: 'demo', status: 'in-progress' }] },
    '05-implement.md': { schema: 'sdlc/v1', type: 'implement', slug: 'demo', status: 'complete' },
  });
  try {
    const s = await statusOf(p.root, 'demo');
    assert.equal(s.slices[0].implement, 'complete');
    assert.equal(s.stages.find((x) => x.stage === 'implement').present, true);
  } finally { p.done(); }
});

test('one precedence for the next step: next-invocation first; stage-done clears the readiness route', async () => {
  const p = project({
    '00-index.md': index({ 'current-stage': 'plan', 'next-invocation': '/wf implement demo', 'recommended-next-invocation': '/wf project ship-plan init', 'recommended-next-command': 'wf-project' }),
  });
  try {
    const s = await statusOf(p.root);
    assert.equal(s.workflows[0].next, '/wf implement demo');
    stageDone(p.dir, 'demo', 'intake');
    const after = frontmatterOfDoc(p.dir, '00-index.md');
    assert.equal(after['recommended-next-invocation'], undefined);
    assert.equal(after['recommended-next-command'], undefined);
  } finally { p.done(); }
});

test('the brief reads the workflow folder, also when the index slug differs from the folder', async () => {
  const p = project({ '00-index.md': index({ slug: 'other-name', 'open-questions': [{ key: 'db', question: 'Which database?' }] }) });
  try {
    const b = await statusBrief(p.root, 'demo');
    assert.equal(b.error, undefined);
    assert.deepEqual(b.openQuestions, ['db: Which database?']);
  } finally { p.done(); }
});

test('a shipped workflow whose newest ship run is paused resumes the ship', () => {
  const p = project({
    '00-index.md': index({ status: 'shipped', 'current-stage': 'ship', 'next-invocation': '/wf retro demo' }),
    '09-ship-run-20261101T1000Z.md': { schema: 'sdlc/v1', type: 'ship-run', slug: 'demo', status: 'complete', 'created-at': '2026-11-01T10:00:00Z' },
    '09-ship-run-20261102T1000Z.md': { schema: 'sdlc/v1', type: 'ship-run', slug: 'demo', status: 'awaiting-input', 'created-at': '2026-11-02T10:00:00Z' },
  });
  try {
    const next = diskFacts(p.root, { git: () => '' }).nextOf('demo');
    assert.deepEqual(next, { invocation: '/wf ship demo', closed: false });
    const r = nextStep(reg, 'demo', diskFacts(p.root, { git: () => '' }));
    assert.equal(r.reference, 'reference/ship.md');
  } finally { p.done(); }
});

test('a shipped workflow whose newest ship run is complete stays closed', () => {
  const p = project({
    '00-index.md': index({ status: 'shipped' }),
    '09-ship-run-20261102T1000Z.md': { schema: 'sdlc/v1', type: 'ship-run', slug: 'demo', status: 'complete', 'created-at': '2026-11-02T10:00:00Z' },
  });
  try {
    assert.equal(diskFacts(p.root, { git: () => '' }).nextOf('demo').closed, true);
  } finally { p.done(); }
});

test('a maintenance word goes through intake.md, whose branch 0 guards it; an entry mode takes the fast path', () => {
  const disk = { hasWorkflow: (s) => s === 'demo', hasWorkflowDir: (s) => s === 'demo', slicesOf: () => [], hasBranch: () => false };
  for (const tokens of [['intake', 'close', 'the', 'dropdown'], ['intake', 'amend'], ['intake', 'modernize'], ['intake', 'demo', 'close'], ['intake', 'demo'], ['intake', 'demo', 'shape']]) {
    assert.equal(dispatch(reg, tokens, disk).reference, 'reference/intake.md', tokens.join(' '));
  }
  assert.equal(dispatch(reg, ['intake', 'fix', 'the', 'bug'], disk).reference, 'reference/intake/fix.md');
});

test('a slice that waits on a deferral passes the walk, and the goal waits on the deferral', () => {
  const artifacts = {
    '01-intake.md': { status: 'complete' }, '02-shape.md': { status: 'complete' },
    '03-slice-api.md': { status: 'complete' },
    '04-plan-api.md': { status: 'complete' }, '05-implement-api.md': { status: 'complete' },
    '06-verify-api.md': { status: 'complete', result: 'partial', convergence: 'not-needed' },
    '07-review.md': { status: 'complete', verdict: 'ship' },
  };
  const l = judgeLifecycle({
    index: { 'workflow-type': 'standard', 'review-scope': 'slug-wide' },
    roster: [{ slug: 'api', status: 'deferred' }],
    artifact: (n) => artifacts[n] ?? null,
    reviewScope: 'slug-wide',
  });
  assert.equal(l.verdict, 'met', l.reason);
  assert.deepEqual(l.deferred, ['api']);
  assert.equal(fromLifecycle(l).verdict, 'BLOCKED');
});

test('modernize renames the old stage in next-command as well', () => {
  assert.deepEqual(stageRenames({ 'next-command': 'wf-shape', 'next-invocation': '/wf shape demo' }), { 'next-command': 'wf-intake', 'next-invocation': '/wf intake demo' });
  assert.equal(stageRenames({ 'next-command': 'wf-handoff' })['next-command'], 'wf-ship');
});

test('a run that throws puts back only the files that it wrote', async () => {
  const p = project({ '00-index.md': index() });
  try {
    const other = path.join(p.dir, 'inbox-note.txt');
    const r = await runScript(p.root, async ({ wf: w }) => {
      w.records.set('00-index.md', 'title', 'changed by the run');
      writeFileSync(other, 'written by another session');
      throw new Error('stop');
    }, { slug: 'demo' });
    assert.equal(r.ok, false);
    assert.notEqual(frontmatterOfDoc(p.dir, '00-index.md').title, 'changed by the run', 'the write of the run goes back');
    assert.equal(readFileSync(other, 'utf8'), 'written by another session', 'the file of another session stays');
  } finally { p.done(); }
});

test('decide add --slice slug-wide records an entry of the whole workflow', () => {
  const p = project({ '00-index.md': index() });
  try {
    const r = spawnSync(process.execPath, [wf, 'decide', 'add', p.root, 'demo', '--key', 'db', '--question', 'Which?', '--answer', 'pg', '--slice', 'slug-wide', '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const list = spawnSync(process.execPath, [wf, 'decide', 'list', p.root, 'demo', '--slice', 'api', '--json'], { encoding: 'utf8' });
    const rows = JSON.parse(list.stdout);
    const entry = (Array.isArray(rows) ? rows : rows.entries ?? rows.decisions ?? []).find((e) => e.key === 'db');
    assert.ok(entry, list.stdout);
    assert.equal(entry.scope?.slice, undefined);
  } finally { p.done(); }
});

test('a finished implement outside a driver is done, not a dead run', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'stage-progress-'));
  try {
    const dir = path.join(root, '.ai', 'workflows', 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '00-index.md'), fm(index()));
    writeFileSync(path.join(dir, '04-plan-api.md'), '## Step-by-Step Plan\n\n1. **A** — x\n');
    const cli = (...a) => spawnSync(process.execPath, [wf, ...a], { encoding: 'utf8' });
    assert.equal(cli('step', 'start', root, 'demo', 'api', '1').status, 0);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'progress.json'), 'utf8')).status, 'running');
    const done = cli('step', 'complete', root, 'demo', 'api', '--skip', '1', '--reason', 'no code in this test');
    assert.equal(done.status, 0, done.stderr);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'progress.json'), 'utf8')).status, 'done');
    assert.equal(cli('step', 'start', root, 'demo', 'api', '1').status, 0);
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'progress.json'), 'utf8')).status, 'running', 'a new start runs again');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a changed submodule does not break the receipt: its hash is the commit of its checkout', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'receipt-sub-'));
  try {
    const g = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'protocol.file.allow=always', ...a], { cwd, encoding: 'utf8' });
    const sub = path.join(root, 'subsrc');
    mkdirSync(sub);
    g(sub, 'init', '-q'); writeFileSync(path.join(sub, 'a.txt'), 'a'); g(sub, 'add', '.'); g(sub, 'commit', '-qm', 'a');
    const main = path.join(root, 'main');
    mkdirSync(main);
    g(main, 'init', '-q'); writeFileSync(path.join(main, 'x.txt'), 'x'); g(main, 'add', '.'); g(main, 'commit', '-qm', 'x');
    g(main, 'submodule', 'add', '-q', sub, 'lib'); g(main, 'commit', '-qm', 'sub');
    const inner = path.join(main, 'lib');
    writeFileSync(path.join(inner, 'b.txt'), 'b'); g(inner, 'add', '.'); g(inner, 'commit', '-qm', 'b');
    writeFileSync(path.join(main, 'x.txt'), 'y');
    const changes = treeChanges(main);
    assert.deepEqual(changes.map((c) => c.path), ['lib', 'x.txt']);
    assert.match(changes[0].hash, /^commit:[0-9a-f]{40}$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a probe whose command the shell does not find is a probe error, not unchanged', () => {
  const r = runProbe('no-such-command-for-a-probe-xyz', process.cwd(), { timeoutMs: 20000 });
  assert.equal(r.ok, false);
  assert.equal(r.error, true, r.tail);
  assert.equal(runProbe('node -e "process.exit(1)"', process.cwd(), { timeoutMs: 20000 }).error, false);
  const p = project({ '00-index.md': index({ 'runtime-evidence-deferrals': [{ slice: 'api', reason: 'x', 'clearing-probe': 'no-such-command-for-a-probe-xyz', 'cleared-by': null }] }) });
  try {
    assert.equal(checkDeferrals(p.root, 'demo').entries[0].state, 'probe-error');
  } finally { p.done(); }
});
