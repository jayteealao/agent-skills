// WF-GOAL-PLAN W1 — lib/lifecycle-done.mjs: the stop rules of /wf auto as code.
// The verdict is met, not-met (with the next stage) or blocked (the person decides).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { judgeLifecycle, lifecycleDone, reviewGate, verifyGate } from '../../../lib/lifecycle-done.mjs';

const clean = { verify: { convergence: 'converged', result: 'pass' }, review: { verdict: 'ship', 'metric-findings-blocker': 0 } };
function judge(files, { index = { 'workflow-type': 'standard' }, roster = [{ slug: 'a' }, { slug: 'b' }], design } = {}) {
  return judgeLifecycle({ index, roster, artifact: (n) => (n in files ? files[n] : null), design });
}
const base = { '02-shape.md': { status: 'complete' }, '03-slice-a.md': {}, '03-slice-b.md': {} };
const sliceDone = (s, extra = {}) => ({ [`04-plan-${s}.md`]: { status: 'complete' }, [`05-implement-${s}.md`]: { status: 'complete' }, [`06-verify-${s}.md`]: clean.verify, [`07-review-${s}.md`]: clean.review, ...extra });

test('the verify and review gates follow the auto gate table', () => {
  assert.equal(verifyGate({ convergence: 'not-needed', result: 'pass' }).state, 'clean');
  assert.equal(verifyGate({ convergence: 'escalated', result: 'fail' }).state, 'paused');
  assert.equal(verifyGate({ result: 'blocked-runtime-evidence-missing' }).state, 'paused');
  assert.equal(verifyGate({ convergence: 'converged', result: 'fail' }).state, 'open');
  assert.equal(reviewGate({ verdict: 'ship-with-caveats', 'metric-findings-blocker': 0 }).state, 'clean');
  assert.equal(reviewGate({ verdict: 'ship', 'metric-findings-blocker': 2 }).state, 'paused');
  assert.equal(reviewGate({ verdict: 'dont-ship' }).state, 'paused');
  assert.equal(reviewGate(null).state, 'open');
});

test('every slice clean with per-slice review is met', () => {
  const r = judge({ ...base, ...sliceDone('a'), ...sliceDone('b') });
  assert.equal(r.verdict, 'met', r.reason);
  assert.equal(r.suffixed, true);
});

test('the first missing stage is the next action', () => {
  assert.deepEqual(judge({ ...base, ...sliceDone('a') }).next, { stage: 'plan', slice: 'b' });
  const noVerify = { ...base, ...sliceDone('a'), ...sliceDone('b') };
  delete noVerify['06-verify-b.md'];
  assert.deepEqual(judge(noVerify).next, { stage: 'verify', slice: 'b' });
  assert.deepEqual(judge({}).next, { stage: 'shape', slice: null });
  assert.deepEqual(judge({ '02-shape.md': {} }, { roster: null }).next, { stage: 'slice', slice: null });
});

test('a stage that paused at its own gate blocks the goal', () => {
  const r = judge({ ...base, ...sliceDone('a'), ...sliceDone('b', { '07-review-b.md': { verdict: 'ship', 'metric-findings-blocker': 1 } }) });
  assert.equal(r.verdict, 'blocked');
  assert.match(r.reason, /open blocker/);
  assert.equal(judge({ '02-shape.md': { status: 'awaiting-input' } }).verdict, 'blocked');
  assert.equal(judge(base, { design: { needed: true, settled: false } }).verdict, 'blocked');
});

test('slug-wide review needs every verify clean and one 07-review.md', () => {
  const files = { ...base, ...sliceDone('a'), ...sliceDone('b') };
  delete files['07-review-a.md'];
  delete files['07-review-b.md'];
  const index = { 'workflow-type': 'standard', 'review-scope': 'slug-wide' };
  assert.deepEqual(judge(files, { index }).next, { stage: 'review', slice: null });
  assert.equal(judge({ ...files, '07-review.md': clean.review }, { index }).verdict, 'met');
});

test('a change mode uses the un-suffixed files', () => {
  const files = { '02-shape.md': {}, '04-plan.md': {}, '05-implement.md': {}, '06-verify.md': clean.verify, '07-review.md': clean.review };
  assert.equal(judge(files, { index: { 'workflow-type': 'fix' }, roster: [{ slug: 'fix' }] }).verdict, 'met');
});

test('a workflow type with no build lifecycle is blocked with its route', () => {
  for (const t of ['task', 'audit', 'brainstorm', 'update-deps', 'investigate', 'discover']) {
    assert.equal(judge({}, { index: { 'workflow-type': t } }).verdict, 'blocked', t);
  }
});

test('optimize: the spec replaces shape and plan, and the loop writes the slice', () => {
  const index = { 'workflow-type': 'optimize' };
  assert.equal(judge({}, { index, roster: null }).next.stage, 'intake');
  assert.equal(judge({ '02-optimize-spec.md': {} }, { index, roster: null }).verdict, 'blocked');
  const spec = { '02-optimize-spec.md': { 'confirmed-by': 'jayte' } };
  assert.equal(judge(spec, { index, roster: null }).next.stage, 'optimize');
  const done = { ...spec, '03-slice-optimize.md': {}, '05-implement-optimize.md': { status: 'complete' }, '06-verify-optimize.md': clean.verify, '07-review-optimize.md': clean.review };
  assert.equal(judge(done, { index, roster: [{ slug: 'optimize' }] }).verdict, 'met');
  assert.equal(judge({ ...spec, '01-optimize.md': { status: 'awaiting-input' } }, { index, roster: null }).reason, 'intake is awaiting input', 'the lead of an optimize slug is 01-optimize.md');
});

test('lifecycleDone reads the disk', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lifecycle '));
  try {
    const dir = path.join(root, '.ai', 'workflows', 'w');
    mkdirSync(dir, { recursive: true });
    const fm = (o) => `---\n${Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n')}\n---\n`;
    writeFileSync(path.join(dir, '00-index.md'), fm({ 'workflow-type': 'standard', 'review-scope': 'per-slice' }));
    writeFileSync(path.join(dir, '02-shape.md'), fm({ status: 'complete' }));
    writeFileSync(path.join(dir, '03-slice.md'), '---\nslices:\n  - slug: one\n    status: defined\n  - slug: two\n    status: skipped\n---\n');
    writeFileSync(path.join(dir, '03-slice-one.md'), fm({ status: 'defined' }));
    writeFileSync(path.join(dir, '04-plan-one.md'), fm({ status: 'complete' }));
    assert.deepEqual(lifecycleDone(root, 'w').next, { stage: 'implement', slice: 'one' });
    writeFileSync(path.join(dir, '05-implement-one.md'), fm({ status: 'complete' }));
    writeFileSync(path.join(dir, '06-verify-one.md'), fm({ convergence: 'converged', result: 'pass' }));
    writeFileSync(path.join(dir, '07-review-one.md'), fm({ verdict: 'ship', 'metric-findings-blocker': 0 }));
    assert.equal(lifecycleDone(root, 'w').verdict, 'met');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
