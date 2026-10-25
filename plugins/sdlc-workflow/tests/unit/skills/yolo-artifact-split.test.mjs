// ARTIFACT-SPLIT-PLAN yolo fixes Y4, Y6, Y8 — the read check reaches the stage agent,
// the run report shows reads, and orient reads only current index state. The question
// loop: a stage returns questions, the run stops as waiting, and a relaunch carries the
// answers in args.answered.
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
  if (label && label.startsWith('writeback:')) return { ok: true, wrote: [] };
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

// ---- the stage prompt -------------------------------------------------------

const PLAN_A = { slices: [slice('a', { plan: 'todo', implement: 'done', verify: 'done', review: 'n-a' })] };

test('a stage agent records its progress, reads its brief, and returns an intent-bearing decision as a question', async () => {
  const { calls } = await run({}, (label) => (label === 'orient' ? orientResult(PLAN_A) : stageAnswer(label) || common(label)));
  const plan = calls.find((c) => c.label === 'plan:a').prompt;
  assert.match(plan, /1\. Run `node "\/plugin\/skills\/wf\/reference\/\.\.\/scripts\/wf\.mjs" progress set "\/repo" demo --run 20260928T100000Z-demo --driver yolo --stage plan --slice a --status running`/);
  assert.match(plan, /2\. Run `node "\/plugin\/skills\/wf\/reference\/\.\.\/scripts\/wf\.mjs" brief "\/repo" demo plan a`/);
  assert.match(plan, /QUESTION CONTRACT/);
  assert.match(plan, /decide answered "\/repo" demo --key <key>/);
  assert.match(plan, /return status 'questions'/);
  assert.doesNotMatch(plan, /DELEGATE MODE/);
});

test('an implement agent records each step with the step commands', async () => {
  const { calls } = await run({}, (label) => (label === 'orient'
    ? orientResult({ slices: [slice('a', { plan: 'done', implement: 'todo', verify: 'done', review: 'n-a' })] })
    : stageAnswer(label) || common(label)));
  const impl = calls.find((c) => c.label === 'implement:a').prompt;
  for (const verb of ['where "/repo" demo a', 'start "/repo" demo a <n>', 'done "/repo" demo a <n> --sha HEAD', 'stop "/repo" demo a', 'complete "/repo" demo a --sha HEAD']) {
    assert.ok(impl.includes(`wf.mjs" step ${verb}`), `implement names step ${verb}`);
  }
});

// ---- the question loop -------------------------------------------------------

const QUESTION = { key: 'empty-state', question: 'What does the empty list show?', options: ['a sign-up link', 'nothing'], recommended: 'a sign-up link', why: 'the shape names no empty state' };

test('a stage that returns questions stops the run as waiting, with the questions and the relaunch route', async () => {
  const { outcome, calls, labels } = await run({}, (label) => {
    if (label === 'orient') return orientResult(PLAN_A);
    if (label === 'plan:a') return { stage: 'plan', slice: 'a', status: 'questions', artifactPath: 'x', terminal: {}, questions: [QUESTION] };
    return stageAnswer(label) || common(label);
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.stoppedAt, 'plan');
  assert.deepEqual(outcome.questions.map((q) => [q.key, q.stage, q.slice]), [['empty-state', 'plan', 'a']]);
  assert.match(outcome.route, /answer the questions, record each answer with decide add, then re-run \/wf yolo demo with args\.answered/);
  assert.ok(!labels.includes('review'), 'no later stage runs');
  const end = calls.find((c) => c.label === 'run-end').prompt;
  assert.match(end, /progress set "\/repo" demo --run "20260928T100000Z-demo" --driver yolo --status waiting --reason "1 question\(s\) wait for the person" --resume "\/wf yolo demo"/);
});

test('a relaunch with args.answered carries the answer to the stage that asked it', async () => {
  const answered = [{ key: 'empty-state', stage: 'plan', slice: 'a', answer: 'a sign-up link', by: 'person', id: 'd-12', question: QUESTION.question }];
  const { outcome, calls } = await run({ answered }, (label) => (label === 'orient' ? orientResult(PLAN_A) : stageAnswer(label) || common(label)));
  assert.equal(outcome.ok, true, outcome.reason);
  const plan = calls.find((c) => c.label === 'plan:a').prompt;
  assert.match(plan, /ANSWERED QUESTION \(MANDATORY\)/);
  assert.match(plan, /as d-12: "a sign-up link"/);
  assert.match(plan, /Do not ask it again/);
  assert.doesNotMatch(calls.find((c) => c.label === 'review').prompt, /ANSWERED QUESTION/, 'the answer reaches only its stage');
  const end = calls.find((c) => c.label === 'run-end').prompt;
  assert.match(end, /--status done --resume "\/wf ship demo"/);
});

test('an answer with no text is not an answer', async () => {
  const { calls } = await run({ answered: [{ key: 'empty-state', stage: 'plan', answer: '  ' }] }, (label) => (label === 'orient' ? orientResult(PLAN_A) : stageAnswer(label) || common(label)));
  assert.doesNotMatch(calls.find((c) => c.label === 'plan:a').prompt, /ANSWERED QUESTION/);
});

test('delegate mode settles each intent-bearing decision by the recommendation and names the digest command', async () => {
  const { outcome, calls } = await run({ delegate: true }, (label) => (label === 'orient' ? orientResult(PLAN_A) : stageAnswer(label) || common(label)));
  const plan = calls.find((c) => c.label === 'plan:a').prompt;
  assert.match(plan, /DELEGATE MODE/);
  assert.match(plan, /decide add "\/repo" demo --kind answer --by delegate --key <key>/);
  assert.match(plan, /Return no questions/);
  assert.doesNotMatch(plan, /return status 'questions'/);
  assert.deepEqual(outcome.delegate, { digest: 'node "/plugin/skills/wf/reference/../scripts/wf.mjs" decide list "/repo" demo --by delegate' });
});

test('the slug-wide review that returns finding questions stops the run as waiting', async () => {
  const { outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult();
    if (label === 'review') return { stage: 'review', status: 'questions', artifactPath: '/repo/07-review.md', terminal: {}, questions: [{ key: 'finding:F-3', question: 'Keep the retry loop?', options: ['keep', 'fix'], recommended: 'fix' }] };
    return common(label);
  });
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.stoppedAt, 'review');
  assert.deepEqual(outcome.questions.map((q) => q.key), ['finding:F-3']);
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
