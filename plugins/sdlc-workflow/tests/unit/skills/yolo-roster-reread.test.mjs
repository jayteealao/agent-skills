// The slug walk reads the roster again between slices, so an order change (campaign
// slice-order) or a skip made while a slice runs takes effect at the next slice.
// A slice added during the run is driven when nothing of it exists yet, and the issues
// of the talk are investigated and placed at the same boundary.
// The whole script runs with a mock `agent` that answers by label, as in
// yolo-artifact-split.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFn } from '../../helpers/extract-fn.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const yoloSrc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', yoloSrc.replace('export const meta', 'const meta'));

const PLANNED = { plan: 'done', implement: 'todo', verify: 'todo', review: 'n-a' };
const DONE = { plan: 'done', implement: 'done', verify: 'done', review: 'n-a' };
const slice = (name, stages, extra = {}) => ({ slice: name, status: 'defined', reverifyReason: 'none', stages, dependsOn: [], ...extra });
const orientResult = (slices) => ({
  ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed',
  runId: '20260928T100000Z-demo', charter: [], priorDeferrals: [],
  branch: { current: 'b', target: 'b', match: true, strategy: 'none' },
  slices,
});

function answerOf(label) {
  const [stage, sl] = String(label).split(':');
  if (stage === 'plan') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'implement') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'verify') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (stage === 'scout') return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0 } };
  if (stage === 'writeback') return { ok: true, wrote: [] };
  return undefined;
}

async function run(slices, roster, more = () => undefined) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, prompt });
    if (opts.label === 'orient') return orientResult(slices);
    if (String(opts.label).startsWith('roster:')) return roster(opts.label, calls);
    return more(opts.label, calls) ?? answerOf(opts.label);
  };
  const outcome = await driver(
    { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo' },
    agent, (m) => logs.push(m), () => {}, async (fns) => Promise.all(fns.map((f) => f())),
  );
  const labels = calls.map((c) => c.label);
  return { outcome, calls, labels, logs, implemented: labels.filter((l) => /^implement:/.test(l)).map((l) => l.split(':')[1]) };
}

const row = (slice, dependsOn = [], roster = 'defined') => ({ slice, roster, dependsOn });

test('an order changed during a slice takes effect at the next slice', async () => {
  // orient saw a → b → c; while a ran, slice-order put b after c.
  const r = await run([slice('a', PLANNED), slice('b', PLANNED), slice('c', PLANNED)],
    () => ({ slices: [row('a'), row('b', ['c']), row('c')] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.implemented, ['a', 'c', 'b']);
  assert.ok(r.labels.includes('roster:a'), 'the roster is read after the first slice');
  assert.ok(r.logs.some((m) => /roster changed during 'a': .*'b' now runs after c.*the walk is now c → b/.test(m)), r.logs.join('\n'));
  const prompt = r.calls.find((c) => c.label === 'roster:a').prompt;
  assert.match(prompt, /wf\.mjs" status "\/repo" demo --json/);
  assert.match(prompt, /READ-ONLY/);
  assert.match(prompt, /DRIVER HEARTBEAT/);
});

test('a slice skipped during the run is not driven', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED), slice('c', PLANNED)],
    () => ({ slices: [row('a'), row('b', [], 'skipped'), row('c')] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.implemented, ['a', 'c']);
  assert.ok(r.logs.some((m) => /'b' is now skipped/.test(m)));
});

test('a failed read keeps the order orient saw', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED), slice('c', PLANNED)], () => undefined);
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.implemented, ['a', 'b', 'c']);
});

test('a slice added during the run is reported once and not driven', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED), slice('c', PLANNED)],
    () => ({ slices: [row('a'), row('b'), row('c'), row('d')] }));
  assert.deepEqual(r.implemented, ['a', 'b', 'c']);
  assert.equal(r.logs.filter((m) => /added to the roster after this run started: d/.test(m)).length, 1);
});

test('no read follows a slice that ran no stage; the last slice is followed by one', async () => {
  const r = await run([slice('a', DONE), slice('b', PLANNED)], () => ({ slices: [row('a'), row('b')] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.labels.filter((l) => /^roster:/.test(l)), ['roster:b'], 'a slice added during the last slice is still seen');
});

const added = (name, extra = {}) => ({ ...row(name, extra.dependsOn || []), fresh: true, uxImpact: 'none', ...extra });

test('a fresh slice added during the run is driven in the same run', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED)],
    () => ({ slices: [row('a'), row('b'), added('d', { dependsOn: ['a'] })] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.implemented, ['a', 'b', 'd']);
  assert.ok(r.labels.includes('plan:d'), 'its plan is written: nothing of it existed');
  assert.ok(r.logs.some((m) => /slice 'd' was added to the roster during this run — driven/.test(m)), r.logs.join('\n'));
});

test('an added slice with records, or one that waits for the design, is reported and not driven', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED)],
    () => ({ slices: [row('a'), row('b'), added('d', { uxImpact: 'visual' }), added('e', { fresh: false })] }));
  assert.deepEqual(r.implemented, ['a', 'b']);
  assert.ok(r.logs.some((m) => /d \(its ux-impact is not none and the design is not settled\)/.test(m)), r.logs.join('\n'));
  assert.ok(r.logs.some((m) => /e \(it has stage records that orient did not judge\)/.test(m)));
});

test('an issue is investigated alongside the next slice and placed at the boundary after it', async () => {
  const issue = { id: 'T-1', by: 'implement:a', text: 'the parser drops a field', refs: ['src/p.js:4'], placed: null, refused: [] };
  const r = await run([slice('a', PLANNED), slice('b', PLANNED)],
    (label, calls) => {
      const placed = calls.some((c) => /^place:/.test(c.label));
      return { slices: [row('a'), row('b'), ...(placed ? [added('t1-fix', { dependsOn: ['a'] })] : [])], issues: placed ? [] : [issue] };
    },
    (label) => {
      if (label === 'investigate:T-1') return { ok: true, record: '05i-issue-t1.md' };
      if (/^place:/.test(label)) return { results: [{ id: 'T-1', status: 'placed', rung: 5, target: 't1-fix', action: 'add', why: 'reproduced, no slice covers it' }] };
      return undefined;
    });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  const at = (l) => r.labels.indexOf(l);
  assert.ok(at('investigate:T-1') > at('roster:a') && at('investigate:T-1') < at('place:b'), r.labels.join(', '));
  assert.deepEqual(r.implemented, ['a', 'b', 't1-fix']);
  const place = r.calls.find((c) => c.label === 'place:b').prompt;
  assert.match(place, /issue place "\/repo" demo T-1 --apply --review-open --json/);
  const inv = r.calls.find((c) => c.label === 'investigate:T-1').prompt;
  assert.match(inv, /READ-ONLY on the code/);
  assert.match(inv, /_issue-investigate\.md/);
  assert.deepEqual(r.outcome.issues.placed, [{ id: 'T-1', rung: 5, target: 't1-fix', action: 'add' }]);
});

test('an issue held for the person does not stop the run', async () => {
  const issue = { id: 'T-2', by: 'verify:a', text: 'a change of the public API', refs: [], placed: null, refused: [] };
  const r = await run([slice('a', PLANNED), slice('b', PLANNED)],
    () => ({ slices: [row('a'), row('b')], issues: [issue] }),
    (label) => label === 'investigate:T-2' ? { ok: true } : /^place:/.test(label) ? { results: [{ id: 'T-2', status: 'ask', why: 'outside the confirmed scope' }] } : undefined);
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.implemented, ['a', 'b']);
  assert.deepEqual(r.outcome.issues.held, ['T-2']);
});

test('a slice whose issues were carried in after its plan gets its plan written again', async () => {
  const r = await run([slice('a', PLANNED), slice('b', PLANNED)],
    () => ({ slices: [row('a'), { ...row('b'), carriedAt: '2026-11-27T10:00:00Z', planAt: '2026-11-27T09:00:00Z' }] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  const plan = r.calls.find((c) => c.label === 'plan:b');
  assert.ok(plan, r.labels.join(', '));
  assert.match(plan.prompt, /PLAN REFRESH: .*issues were carried into the slice record/);
});

test('rewalk: a slice the roster no longer lists is retired', () => {
  const rewalk = new Function(`${extractFn(yoloSrc, 'walkOrder')}\n${extractFn(yoloSrc, 'rewalk')}\nreturn rewalk`)();
  const left = [{ slice: 'b', status: 'defined', dependsOn: [] }, { slice: 'c', status: 'defined', dependsOn: [] }];
  const r = rewalk(left, { slices: [row('a'), row('c')] }, new Set(['a', 'b', 'c']));
  assert.deepEqual(r.list.map((s) => [s.slice, s.status]), [['c', 'defined'], ['b', 'dropped']], 'an unlisted slice sorts last');
  assert.ok(r.changes.includes("'b' left the roster"));
  assert.deepEqual(rewalk(left, { slices: [] }, new Set()).list, left, 'an empty read keeps the walk');
});
