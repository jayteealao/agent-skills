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
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');

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

const { reconcileDue, overlappingSlices, runStartFromId, readCheckRows } = new Function(
  ['reconcileDue', 'overlappingSlices', 'runStartFromId', 'readCheckRows'].map((n) => extractFn(yoloSrc, n)).join('\n') +
    '\nreturn { reconcileDue, overlappingSlices, runStartFromId, readCheckRows };',
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
  if (label === 'read-check-report') return { present: false };
  if (label === 'plan-reconcile-clear') return { ok: true, wrote: ['00-index.md'] };
  if (label && label.startsWith('writeback:')) return { ok: true, wrote: [] };
  if (label === 'plan-index-writeback') return { ok: true, wrote: ['04-plan.md', '00-index.md'] };
  return undefined;
}

// ---- Y6 ---------------------------------------------------------------------

test('Y6: runStage names the Requires table as a checked checklist and keeps "read in full"', () => {
  const body = extractFn(yoloSrc, 'runStage');
  assert.match(body, /Read \$\{referenceRoot\}\/\$\{stage\}\.md IN FULL/);
  assert.match(body, /requiresClause\(`\$\{referenceRoot\}\/\$\{stage\}\.md`\)/);
  const clause = extractFn(yoloSrc, 'requiresClause');
  assert.match(clause, /## Requires\\` table in \$\{refPath\} is a CHECKLIST/);
  assert.match(clause, /_requires\.md/);
  assert.match(clause, /The mod checks your reads/);
  assert.match(clause, /comes back as ` \+\s*`feedback \(context\) in that write's tool result/);
});

test('Y6: every stage writer the driver dispatches carries the checklist clause', async () => {
  const { calls } = await run({ slice: 'a' }, (label) => {
    if (label === 'orient') return orientResult({ mode: 'slice', targetSlice: 'a', reviewScope: 'per-slice', slices: [slice('a', { plan: 'todo', implement: 'done', verify: 'done', review: 'done' })] });
    if (label === 'plan:a') return { stage: 'plan', slice: 'a', status: 'complete', artifactPath: '/repo/04-plan-a.md', terminal: { statusField: 'complete' } };
    return common(label);
  });
  const plan = calls.find((c) => c.label === 'plan:a');
  assert.match(plan.prompt, /REQUIRED READS \(CHECKED\)/);
  assert.match(plan.prompt, /\/plugin\/skills\/wf\/reference\/plan\.md IN FULL/);
});

// ---- S6 prompt-fed inputs ------------------------------------------------------

test('S6: the fan-out review writer names the rubrics it was fed and its output path', async () => {
  const { calls } = await run({}, (label) => (label === 'orient' ? orientResult() : common(label)));
  const writer = calls.find((c) => c.label === 'review');
  assert.match(writer.prompt, /REQUIRED READS \(CHECKED\)/);
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

test('Y4: the run report lists stage writes with a missing read, from the read ledger', async () => {
  const { outcome, calls } = await run({}, (label) => {
    if (label === 'orient') return orientResult();
    if (label === 'read-check-report') {
      return {
        present: true,
        rows: [
          { at: '2026-09-27T09:00:00Z', agentId: 'old', stage: 'plan', artifact: '04-plan-a.md', missing: ['02-shape.md'] },
          { at: '2026-09-28T10:05:00Z', agentId: 'r1', stage: 'review', artifact: '07-review.md', missing: ['po-answers.md'], partial: [] },
          { at: '2026-09-28T10:06:00Z', agentId: 'v1', stage: 'verify', artifact: '06-verify-a.md', missing: ['02-shape.md'], waiver: 'shape absent' },
          { at: '2026-09-28T10:07:00Z', agentId: 'v1', stage: 'verify', artifact: '06-verify-a.md', missing: [], partial: [] },
        ],
      };
    }
    return common(label);
  });
  const report = calls.find((c) => c.label === 'read-check-report').prompt;
  assert.match(report, /\.read-ledger\.jsonl/);
  assert.match(report, /at or after 2026-09-28T10:00:00Z/);
  assert.match(report, /DRIVER HEARTBEAT/);
  assert.deepEqual(outcome.readCheck.map((r) => [r.stage, r.resolved, r.waiver]), [
    ['review', false, undefined],
    ['verify', true, 'shape absent'],
  ]);
});

test('Y4 helpers: runStartFromId and readCheckRows', () => {
  assert.equal(runStartFromId('20260928T100000Z-demo'), '2026-09-28T10:00:00Z');
  assert.equal(runStartFromId('run-demo'), null);
  // no run start → every gap row is reported
  assert.equal(readCheckRows([{ at: '2026-01-01T00:00:00Z', missing: ['x'] }], null).length, 1);
  assert.deepEqual(readCheckRows([{ at: '2026-01-01T00:00:00Z', missing: [] }], null), []);
  assert.deepEqual(readCheckRows(undefined, null), []);
  assert.equal(readCheckRows([{ at: 'nope', missing: ['x'] }], null).length, 0);
  assert.equal(readCheckRows([{ at: '2026-01-01T00:00:00Z', partial: ['plan.md'] }], null)[0].partial[0], 'plan.md');
});

test('Y4: the read ledger is its own file and the driver never writes it or mixes it into the journal', () => {
  assert.match(yoloSrc, /const READ_LEDGER_PATH = `\$\{projectRoot\}\/\.ai\/workflows\/\$\{slug\}\/\.read-ledger\.jsonl`/);
  assert.notEqual(yoloSrc.indexOf('.read-ledger.jsonl'), yoloSrc.indexOf('.driver-journal.jsonl'));
  assert.match(extractFn(yoloSrc, 'readLedgerReport'), /READ-ONLY — never write/);
});

// ---- Y8 ---------------------------------------------------------------------

test('Y8: orient reads current index state only, never the index history', () => {
  const body = extractFn(yoloSrc, 'orient');
  assert.match(body, /It is CURRENT STATE only/);
  assert.match(body, /Do NOT read index-history\.jsonl or history\//);
});

// ---- the shared contract files -------------------------------------------------

test('_requires.md defines the table, the checklist, the modes, the ledger and the no-hook host rule', () => {
  const src = ref('_requires.md');
  for (const needle of [
    '| Input | Kind | When | Sections |', 'The table is a checklist', 'A partial read does not count',
    'A read by a research sub-agent does not count', 'Prompt-fed inputs:', '`read-waiver: "<reason>"`',
    '`readCheck`', '.read-ledger.jsonl', 'reads-checked: false',
  ]) assert.ok(src.includes(needle), `_requires.md lost: ${needle}`);
});

test('_story-arc.md is the explainer contract with the four snippet names', () => {
  const src = ref('_story-arc.md');
  for (const name of ['sequence', 'comparison', 'cycle', 'dependency']) {
    assert.ok(src.includes(`@include explainer/${name}`), `missing snippet explainer/${name}`);
  }
  assert.match(src, /<stem>\.explainer\.html\.fragment/);
  assert.match(src, /`## The Brainstorm`/);
  assert.match(src, /A6 — Chat-summary form/);
});

test('the explainer reaches the chat return, the additive-write snapshot, and the ownership table', () => {
  assert.match(ref('_chat-return.md'), /quote\s+the summary paragraph of the explainer/);
  assert.match(ref('_additive-write.md'), /history\/<stem>-<rev>\.explainer\.html\.fragment/);
  const own = ref('_control-file-ownership.md');
  assert.match(own, /index-history\.jsonl/);
  assert.match(own, /Do not write `\.read-ledger\.jsonl`\. The mod owns it, and it is never `\.driver-journal\.jsonl`/);
  assert.match(ref('_subagents.md'), /Prompt-fed inputs: <input>, <input>/);
  assert.match(ref('auto.md'), /A compaction that `auto` starts in the middle of a stage keeps the record/);
});
