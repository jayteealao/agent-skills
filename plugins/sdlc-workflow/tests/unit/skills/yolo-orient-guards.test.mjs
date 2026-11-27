// A value that orient leaves out of its result is unknown, never the value that lets the run go
// on: no base branch and a dedicated strategy with no target stop the run; a strange strategy takes
// no work beside other work; a design gate not reported is not settled; no clock means no verdict
// on the previous driver.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFn } from '../../helpers/extract-fn.mjs';
import { driverSource } from '../../helpers/driver-source.mjs';

const src = driverSource('yolo.js');
const { orientGaps, judgeLiveness, rewalk } = new Function(
  [extractFn(src, 'orientGaps'), extractFn(src, 'judgeLiveness'), extractFn(src, 'walkOrder'), extractFn(src, 'rewalk')].join('\n') +
  '\nreturn { orientGaps, judgeLiveness, rewalk };',
)();

const idx = (branch, more = {}) => ({ branch: { current: 'feat', target: 'feat', match: true, base: 'main', strategy: 'dedicated', ...branch }, designSettled: true, ...more });

test('orient: a run with a base and a target goes on, and takes work beside work', () => {
  const i = idx({});
  assert.equal(orientGaps(i).stop, null);
  assert.equal(i.branch.commits, true);
});

test('orient: no base branch stops the run', () => {
  assert.match(orientGaps(idx({ base: '' })).stop, /no base branch/);
});

test('orient: a dedicated strategy with no target stops the run', () => {
  assert.equal(orientGaps(idx({ target: ' ' })).stop, 'strategy dedicated has no target branch');
});

test('orient: a strategy that is not one of the three runs nothing beside other work', () => {
  const i = idx({ strategy: undefined });
  const g = orientGaps(i);
  assert.equal(g.stop, null);
  assert.equal(i.branch.commits, false);
  assert.ok(g.notes.some((n) => /is not dedicated, shared or none/.test(n)));
});

test('orient: a design gate not reported is not settled', () => {
  const i = idx({}, { designSettled: undefined });
  assert.ok(orientGaps(i).notes.some((n) => /design gate/.test(n)));
  assert.equal(i.designSettled, false);
});

test('liveness: no clock from orient gives no verdict', () => {
  const j = { present: true, entries: [{ at: '2026-11-27T00:00:00Z', run: 'r1', event: 'agent-start' }] };
  const r = judgeLiveness(j, 'r2');
  assert.equal(r.clockUnknown, true);
  assert.equal(r.presumedDead, false);
  const i = idx({}, { priorRun: r });
  assert.ok(orientGaps(i).notes.some((n) => /no clock from orient/.test(n)));
  assert.equal(judgeLiveness({ ...j, nowAt: '2026-11-27T05:00:00Z' }, 'r2').presumedDead, true);
});

test('rewalk: a slice added with no ux-impact waits when the design is not settled', () => {
  const fresh = { slices: [{ slice: 'a', roster: 'defined' }, { slice: 'b', roster: 'defined', fresh: true, uxImpact: null }] };
  const r = rewalk([{ slice: 'a', status: 'defined', dependsOn: [] }], fresh, new Set(['a']), { designSettled: false });
  assert.deepEqual(r.taken, []);
  assert.match(r.added[0].why, /ux-impact is not set/);
  const ok = rewalk([{ slice: 'a', status: 'defined', dependsOn: [] }], fresh, new Set(['a']), { designSettled: true });
  assert.deepEqual(ok.taken, ['b']);
});
