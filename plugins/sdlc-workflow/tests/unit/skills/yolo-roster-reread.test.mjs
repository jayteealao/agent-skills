// The slug walk reads the roster again between slices, so an order change (campaign
// slice-order) or a skip made while a slice runs takes effect at the next slice.
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
  if (stage === 'implement') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'verify') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (stage === 'scout') return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0 } };
  if (stage === 'writeback') return { ok: true, wrote: [] };
  return undefined;
}

async function run(slices, roster) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, prompt });
    if (opts.label === 'orient') return orientResult(slices);
    if (String(opts.label).startsWith('roster:')) return roster(opts.label);
    return answerOf(opts.label);
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

test('no read follows a slice that ran no stage, nor the last slice', async () => {
  const r = await run([slice('a', DONE), slice('b', PLANNED)], () => ({ slices: [row('a'), row('b')] }));
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.ok(!r.labels.some((l) => /^roster:/.test(l)), r.labels.join(', '));
});

test('rewalk: a slice the roster no longer lists is retired', () => {
  const rewalk = new Function(`${extractFn(yoloSrc, 'walkOrder')}\n${extractFn(yoloSrc, 'rewalk')}\nreturn rewalk`)();
  const left = [{ slice: 'b', status: 'defined', dependsOn: [] }, { slice: 'c', status: 'defined', dependsOn: [] }];
  const r = rewalk(left, { slices: [row('a'), row('c')] }, new Set(['a', 'b', 'c']));
  assert.deepEqual(r.list.map((s) => [s.slice, s.status]), [['c', 'defined'], ['b', 'dropped']], 'an unlisted slice sorts last');
  assert.ok(r.changes.includes("'b' left the roster"));
  assert.deepEqual(rewalk(left, { slices: [] }, new Set()).list, left, 'an empty read keeps the walk');
});
