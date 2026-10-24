// ARTIFACT-SPLIT-PLAN yolo fixes Y4, Y6, Y7, Y8 — the read check reaches the stage
// agent, the run report shows reads, the plan fan-out reconciles its siblings through
// a durable marker, and orient reads only current index state.
//
// workflows/yolo.js is a Workflow SCRIPT (top-level return/await, injected globals).
// The pure helpers are extracted by brace-matching, as in yolo-gates.test.mjs. The
// control flow is exercised by running the whole script body as an async function with
// a mock `agent` that answers by label, so the tests watch the real dispatch order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const yoloSrc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

function extractFn(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `could not locate function ${name} in yolo.js`);
  let depth = 0;
  // Start at the body brace, past a default parameter such as `extra = {}`.
  for (let j = src.indexOf(') {', m.index) + 2; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const { reconcileDue, overlappingSlices } = new Function(
  ['reconcileDue', 'overlappingSlices'].map((n) => extractFn(yoloSrc, n)).join('\n') +
    '\nreturn { reconcileDue, overlappingSlices };',
)();

// ---- whole-script harness ---------------------------------------------------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', yoloSrc.replace('export const meta', 'const meta'));

const slice = (name, stages, extra = {}) => ({ slice: name, status: 'defined', reverifyReason: 'none', stages, ...extra });
const DONE = { plan: 'done', implement: 'done', verify: 'done', review: 'n-a' };
const orientResult = (over = {}) => ({
  ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed',
  runId: '20260928T100000Z-demo', charter: [], priorDeferrals: [],
  branch: { current: 'b', target: 'b', match: true, strategy: 'none' },
  slices: [slice('a', DONE), slice('b', DONE)],
  ...over,
});

async function run(args, answer) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, prompt });
    return answer(opts.label, prompt, calls);
  };
  const outcome = await driver(
    { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo', ...args },
    agent, (m) => logs.push(m), () => {}, async (fns) => Promise.all(fns.map((f) => f())),
  );
  return { outcome, calls, labels: calls.map((c) => c.label), logs };
}

// Default answers for the agents every slug-wide run reaches.
function common(label) {
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (label && label.startsWith('scout:')) return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0 } };
  if (label === 'run-end') return { present: false };
  if (label === 'plan-reconcile-clear') return { ok: true, wrote: ['00-index.md'] };
  if (label && label.startsWith('writeback:')) return { ok: true, wrote: [] };
  if (label === 'plan-index-writeback') return { ok: true, wrote: ['04-plan.md', '00-index.md'] };
  return undefined;
}

// ---- Y6 ---------------------------------------------------------------------

test('Y6: every stage writer the driver dispatches carries the checklist clause', async () => {
  const { calls } = await run({ slice: 'a' }, (label) => {
    if (label === 'orient') return orientResult({ mode: 'slice', targetSlice: 'a', reviewScope: 'per-slice', slices: [slice('a', { plan: 'todo', implement: 'done', verify: 'done', review: 'done' })] });
    if (label === 'plan:a') return { stage: 'plan', slice: 'a', status: 'complete', artifactPath: '/repo/04-plan-a.md', terminal: { statusField: 'complete' } };
    return common(label);
  });
  const plan = calls.find((c) => c.label === 'plan:a');
  assert.match(plan.prompt, /REQUIRED READS\. The/);
  assert.match(plan.prompt, /\/plugin\/skills\/wf\/reference\/plan\.md IN FULL/);
});

// ---- S6 prompt-fed inputs ------------------------------------------------------

test('S6: the fan-out review writer names the rubrics it was fed and its output path', async () => {
  const { calls } = await run({}, (label) => (label === 'orient' ? orientResult() : common(label)));
  const writer = calls.find((c) => c.label === 'review');
  assert.match(writer.prompt, /REQUIRED READS\. The/);
  assert.match(writer.prompt, /Prompt-fed inputs: review\/correctness\.md\nOutput artifact: \/repo\/\.ai\/workflows\/demo\/07-review\.md/);
});

// ---- Y7 ---------------------------------------------------------------------

test('Y7: fan-out plan agents never write the master; bookkeeping writes the table and SETS the marker', async () => {
  let orients = 0;
  const { calls, labels, outcome } = await run({ planFanout: true }, (label) => {
    if (label === 'orient') {
      orients++;
      return orients === 1
        ? orientResult({ slices: [slice('a', { plan: 'todo', implement: 'todo', verify: 'todo', review: 'n-a' }), slice('b', { plan: 'todo', implement: 'todo', verify: 'todo', review: 'n-a' })] })
        : orientResult({ reconcilePending: true });
    }
    if (label === 'plan:a' || label === 'plan:b') return { stage: 'plan', slice: label.slice(5), status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
    if (label === 'plan-reconcile') return { overlaps: [{ slice: 'b', with: ['a'], files: ['src/db.ts'] }] };
    return common(label);
  });
  const planA = calls.find((c) => c.label === 'plan:a').prompt;
  assert.match(planA, /PLAN FAN-OUT: you plan 'a' CONCURRENTLY with these sibling slices: b/);
  assert.match(planA, /Do NOT create or edit the master 04-plan\.md/);
  assert.match(planA, /Prompt-fed inputs: 04-plan\.md\nOutput artifact: \/repo\/\.ai\/workflows\/demo\/04-plan-a\.md/);
  assert.match(planA, /DRIVER HEARTBEAT/);
  const book = calls.find((c) => c.label === 'plan-index-writeback').prompt;
  assert.match(book, /PLAN FAN-OUT BOOKKEEPING/);
  assert.match(book, /`## Sibling Plans` table with one row for EVERY 04-plan-<slice>\.yaml/);
  assert.match(book, /set `reconcile-pending: true`/);
  // reconcile → re-plan the overlapping slice in review-and-fix mode → clear the marker
  const iRec = labels.indexOf('plan-reconcile');
  assert.ok(iRec > labels.indexOf('plan-index-writeback'));
  const replan = calls.slice(iRec).find((c) => c.label === 'plan:b');
  assert.match(replan.prompt, /RECONCILE RE-PLAN: 04-plan-b\.md already exists/);
  assert.match(replan.prompt, /overlaps a \(file src\/db\.ts\)/);
  assert.ok(labels.indexOf('plan-reconcile-clear') > labels.lastIndexOf('plan:b'));
  assert.match(calls.find((c) => c.label === 'plan-reconcile').prompt, /DRIVER HEARTBEAT/);
  assert.deepEqual(outcome.planReconcile, { replanned: ['b'], stopped: false, markerCleared: true });
  // reconcile ran exactly once in the run
  assert.equal(labels.filter((l) => l === 'plan-reconcile').length, 1);
});

test('Y7: orient resumes reconcile while the marker is set, even when every plan is done', async () => {
  const { labels, calls, outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ reconcilePending: true });
    if (label === 'plan-reconcile') return { overlaps: [] };
    return common(label);
  });
  assert.ok(labels.includes('plan-reconcile'), 'a resumed run must reconcile while reconcile-pending is set');
  assert.ok(labels.indexOf('plan-reconcile') < labels.indexOf('review'), 'reconcile runs before the drive');
  const clear = calls.find((c) => c.label === 'plan-reconcile-clear').prompt;
  assert.match(clear, /DELETE the `reconcile-pending` key/);
  assert.equal(outcome.planReconcile.markerCleared, true);
  assert.match(extractFn(yoloSrc, 'orient'), /reconcile-pending \(reconcilePending = true iff/);
});

test('Y7: a failed re-plan stops the run and leaves the marker set (no clear agent)', async () => {
  const { labels, outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ reconcilePending: true });
    if (label === 'plan-reconcile') return { overlaps: [{ slice: 'a', with: ['b'] }] };
    if (label === 'plan:a') return { stage: 'plan', slice: 'a', status: 'hard-stop', artifactPath: 'x', terminal: {}, hardStopReason: 'contract fork' };
    return common(label);
  });
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.stoppedAt, 'plan-reconcile');
  assert.ok(!labels.includes('plan-reconcile-clear'));
  assert.match(outcome.route, /reconcile-pending stays set/);
});

test('Y7: no marker, no reconcile', async () => {
  const { labels } = await run({}, (label) => (label === 'orient' ? orientResult() : common(label)));
  assert.ok(!labels.includes('plan-reconcile'));
});

test('Y7 helpers: reconcileDue and overlappingSlices', () => {
  assert.equal(reconcileDue({ reconcilePending: true, workflowType: 'feature' }), true);
  assert.equal(reconcileDue({ reconcilePending: true, workflowType: 'update-deps' }), false);
  assert.equal(reconcileDue({ reconcilePending: false }), false);
  assert.equal(reconcileDue(null), false);
  const roster = [{ slice: 'a' }, { slice: 'b' }, { slice: 'c', status: 'skipped' }];
  const out = overlappingSlices([
    { slice: 'b', with: ['a'], files: ['x.ts'] },
    { slice: 'b', with: ['a', 'b'], edges: ['a->b'] },
    { slice: 'c', with: ['a'] },
    { slice: 'zz' },
    null,
  ], roster);
  assert.deepEqual(out, [{ slice: 'b', with: ['a'], detail: 'file x.ts; edge a->b' }]);
});

// ---- Y4 ---------------------------------------------------------------------

test('A3: the last agent writes the run-end line with the run id, and reads no read ledger', async () => {
  const { calls } = await run({}, (label) => (label === 'orient' ? orientResult() : common(label)));
  const report = calls.find((c) => c.label === 'run-end').prompt;
  assert.match(report, /DRIVER HEARTBEAT/);
  assert.match(report, /yolo-watch\.mjs" end "\/repo" demo --run "20260928T100000Z-demo" --agent run-end/);
  assert.doesNotMatch(report, /read-ledger/);
  assert.ok(!yoloSrc.includes('.read-ledger.jsonl'), 'the driver names no read ledger');
});

// ---- Y8 ---------------------------------------------------------------------

test('Y8: orient reads current index state only, never the index history', () => {
  const body = extractFn(yoloSrc, 'orient');
  assert.match(body, /It is CURRENT STATE only/);
  assert.match(body, /Do NOT read index-history\.jsonl or history\//);
});

// ---- the shared contract files -------------------------------------------------

// ---- plan order and plan freshness ------------------------------------------

const TODO = { plan: 'todo', implement: 'todo', verify: 'todo', review: 'n-a' };
const PLANNED = { plan: 'done', implement: 'todo', verify: 'todo', review: 'n-a' };
function stageAnswer(label) {
  const [stage, sl] = String(label).split(':');
  if (stage === 'plan') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'implement') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'verify') return { stage: 'verify', slice: sl, status: 'complete', artifactPath: 'x', terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };
  return undefined;
}

test('plan order: the yolo fan-out plans a slice after the slice it depends on', async () => {
  let orients = 0;
  const { calls, labels, outcome } = await run({ planFanout: true }, (label) => {
    if (label === 'orient') {
      orients++;
      return orients === 1
        ? orientResult({ slices: [slice('a', TODO, { dependsOn: [] }), slice('b', TODO, { dependsOn: ['a'] }), slice('c', TODO, { dependsOn: [] })] })
        : orientResult();
    }
    if (label === 'plan-reconcile') return { overlaps: [] };
    return stageAnswer(label) || common(label);
  });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.ok(labels.indexOf('plan:b') > labels.indexOf('plan:a'));
  assert.ok(labels.indexOf('plan:c') < labels.indexOf('plan:b'), 'c plans with a, in the first wave');
  assert.match(calls.find((c) => c.label === 'plan:b').prompt, /These slices are planned already: a, c\./);
  assert.match(calls.find((c) => c.label === 'plan:a').prompt, /CONCURRENTLY with these sibling slices: c\..*These slices plan after you and build on your plan: b\./s);
});

test('plan freshness: yolo refreshes a plan that an earlier implement of the run made out of date', async () => {
  const { calls, labels, outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ slices: [slice('a', PLANNED), slice('b', PLANNED)] });
    if (label === 'plan-check:b') return { stale: [{ slice: 'b', reason: 'the store moved' }] };
    return stageAnswer(label) || common(label);
  });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.ok(!labels.includes('plan-check:a'), 'no implement ran before the first slice');
  assert.equal(labels.filter((l) => l === 'plan-check:b').length, 1);
  assert.equal(labels.filter((l) => l === 'plan:a').length, 0);
  const plans = calls.filter((c) => c.label === 'plan:b');
  assert.equal(plans.length, 1, 'only the refresh');
  assert.match(plans[0].prompt, /PLAN REFRESH: 04-plan-b\.md already exists, and it is out of date: the store moved\./);
  assert.ok(labels.indexOf('plan:b') < labels.indexOf('implement:b'));
  assert.equal(labels.filter((l) => l === 'implement:b').length, 1);
});

test('plan freshness: yolo runs no refresh for a plan that still fits', async () => {
  const { labels, outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ slices: [slice('a', PLANNED), slice('b', PLANNED)] });
    if (label === 'plan-check:b') return { stale: [] };
    return stageAnswer(label) || common(label);
  });
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(labels.filter((l) => l === 'plan-check:b').length, 1);
  assert.ok(!labels.includes('plan:b'));
});

// ---- WF-SYSTEM-REVIEW C2 ------------------------------------------------------

test('C2: a slice whose implement hard-stopped twice stops the run with a split question, and no third implement runs', async () => {
  const { outcome, labels } = await run({}, (label) => (label === 'orient'
    ? orientResult({ slices: [slice('a', { plan: 'done', implement: 'todo', verify: 'todo', review: 'n-a' }, { implementStops: 2 })] })
    : common(label)));
  assert.ok(!labels.some((l) => /^implement/.test(l)));
  assert.equal(outcome.stopped, true);
  assert.match(outcome.reason, /hard-stopped 2 times: split the slice/);
});

test('E4: the verify agent mirrors the slice status as its last step; the write-back agent runs only as the fallback', async () => {
  const verify = (wb) => ({ stage: 'verify', slice: 'a', status: 'complete', artifactPath: '/repo/06-verify-a.md', terminal: { convergence: 'not-needed', result: 'pass' }, deferrals: [], ...(wb ? { sliceWriteBack: wb } : {}) });
  const answer = (wb) => (label) => {
    if (label === 'orient') return orientResult({ slices: [slice('a', { plan: 'done', implement: 'done', verify: 'todo', review: 'n-a' })] });
    if (label === 'verify:a') return verify(wb);
    return common(label);
  };
  const folded = await run({}, answer({ ok: true, wrote: ['00-index.md'] }));
  const v = folded.calls.find((c) => c.label === 'verify:a');
  assert.match(v.prompt, /LAST STEP — SLICE STATUS MIRROR \(only for slice 'a'\)/);
  assert.ok(!folded.labels.includes('writeback:a'), 'no separate write-back agent');
  // E3: the stage prompt gives the preamble rules once.
  assert.match(v.prompt, /PREAMBLE GIVEN HERE/);
  assert.ok(folded.logs.some((l) => /the verify agent wrote status back to 00-index\.md/.test(l)));
  const fallback = await run({}, answer(null));
  assert.ok(fallback.labels.includes('writeback:a'), 'the fallback runs when verify did not confirm');
});
