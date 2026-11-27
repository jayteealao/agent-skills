// The run of a packet end to end, on the records and on the driver: a slice done, an issue
// carried into a later slice, an issue over the budget sent to the next packet, a slice split,
// a stop after a step, and a relaunch. The records part runs the wf CLI on a real workflow
// folder; the driver part runs the whole yolo script with agents that answer by label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { INDEX_NAME, frontmatterOfDoc, writeDoc } from '../../lib/records.mjs';
import { writeDecisions } from '../../lib/decisions.mjs';
import { placeIssue, sliceStates } from '../../lib/issue-place.mjs';
import { sliceRows } from '../../lib/wf-status.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const cli = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8' });
const json = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };

const AC = (n) => `- AC-${n}: Given ${n} When run Then ${n} holds`;
const body = (s, n) => `# Slice: ${s}\n\n## Goal\n\nDo ${s}.\n\n## Acceptance Criteria\n\n${Array.from({ length: n }, (_, i) => AC(i + 1)).join('\n')}\n\n## Dependencies on Other Slices\n\nNone\n`;

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-scenario-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'workflow-type': 'feature' } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', 'total-slices': 9, slices: [
    { slug: 'one', status: 'complete', 'estimated-steps': 6 },
    { slug: 'two', status: 'defined', 'depends-on': ['one'], 'estimated-steps': 8 },
    { slug: 'three', status: 'defined', 'depends-on': ['two'], 'estimated-steps': 6 },
    { slug: 'four', status: 'defined', 'depends-on': ['three'], 'estimated-steps': 18 },
  ] } });
  writeDoc(dir, '03-slice-one.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'one', status: 'complete' }, body: body('one', 2) });
  writeDoc(dir, '03-slice-two.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'two', status: 'defined' }, body: body('two', 2) });
  writeDoc(dir, '03-slice-three.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'three', status: 'defined' }, body: body('three', 2) });
  writeDoc(dir, '03-slice-four.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'four', status: 'defined' }, body: body('four', 4) });
  writeDoc(dir, '04-plan-two.md', { frontmatter: { status: 'complete' }, body: '## Step-by-Step Plan\n\n1. **A** — x\n2. **B** — y\n3. **C** — z\n' });
  writeDecisions(dir, [{ id: 'D-001', kind: 'answer', key: 'cut-four', answer: 'split four in two', by: 'person', scope: {}, 'superseded-by': null }]);
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('scenario, records: carry, an issue over budget, a split, a stop after a step, and the counts', () => {
  const p = project();
  try {
    // The derived counts: total-slices follows the roster, not the stored 9.
    assert.equal(frontmatterOfDoc(p.dir, '03-slice.md')['total-slices'], 4);

    // An issue covered by slice three is carried into it.
    writeDoc(p.dir, '05i-issue-t1.md', { frontmatter: { type: 'issue-investigation', placement: { rung: 3, target: 'three', gate: null } } });
    json(cli(['slice', 'carry', p.root, 'demo', 'three', '--issue', 'T-1', '--text', 'the cache key leaves out the user', '--placement', '05i-issue-t1.md', '--json']));
    const three = sliceRows(p.dir).find((r) => r.slice === 'three');
    assert.ok(three.carriedAt, 'the carry is a change of scope for the plan');

    // An issue that would pass the budget of the packet goes to the next packet.
    const states = sliceStates([{ slice: 'two', roster: 'in-progress', implement: 'in-progress' }, { slice: 'three', roster: 'defined' }]);
    const inv = { cause: { file: 'x', summary: 'x', confidence: 'reproduced' }, reproduction: { command: 'npm test' }, owner: { slice: null }, scope: { inside: true }, coverage: [{ slice: 'three', covers: true }], size: { steps: 6 }, proposal: { slice: 'n', scope: 'n', ac: ['x'] }, packetFit: { fits: true } };
    const placed = placeIssue(inv, { slices: states, budget: { steps: 38, limit: 40 }, nextPacket: 'next-packet' });
    assert.deepEqual([placed.rung, placed.target], [6, 'next-packet']);

    // Slice four is split by the decision of the person; its parts divide the estimate.
    const split = json(cli(['slice', 'split', p.root, 'demo', 'four', '--part', 'four:1,2;four-b:3,4', '--decision', 'D-001', '--json']));
    assert.deepEqual(split.parts.map((x) => [x.slice, x.estimatedSteps]), [['four', 9], ['four-b', 9]]);
    const roster = frontmatterOfDoc(p.dir, '03-slice.md');
    assert.equal(roster['total-slices'], 5);
    assert.deepEqual(roster.slices.map((s) => s.slug), ['one', 'two', 'three', 'four', 'four-b']);
    const rows = sliceRows(p.dir);
    assert.equal(rows.find((r) => r.slice === 'four-b').fresh, true, 'the new part has no stage record, so a running driver takes it');

    // A stop after a step: step done of step 2 tells the agent to end the stage.
    json(cli(['control', 'stop', p.root, 'demo', '--after', 'step', '--json']));
    json(cli(['step', 'start', p.root, 'demo', 'two', '1', '--json']));
    assert.equal(json(cli(['step', 'done', p.root, 'demo', 'two', '1', '--no-change', '--json'])).next !== undefined, true);
    json(cli(['control', 'clear', p.root, 'demo', '--force', '--json']));
    json(cli(['step', 'start', p.root, 'demo', 'two', '2', '--json']));
    assert.equal(json(cli(['step', 'done', p.root, 'demo', 'two', '2', '--no-change', '--json'])).next, undefined);
    json(cli(['control', 'stop', p.root, 'demo', '--after', 'step', '--json']));
    json(cli(['step', 'start', p.root, 'demo', 'two', '3', '--json']));
    assert.match(json(cli(['step', 'done', p.root, 'demo', 'two', '3', '--no-change', '--json'])).next, /do not start step 4/);

    // Status counts from the roster: four open slices of five.
    const st = json(cli(['status', p.root, 'demo', '--json']));
    const open = st.slices.filter((s) => !['complete', 'deferred', 'skipped', 'dropped'].includes(String(s.roster ?? s.status)));
    assert.equal(st.slices.length, 5);
    assert.equal(open.length, 4);
  } finally { p.done(); }
});

// ---- the driver ------------------------------------------------------------------------

const yoloSrc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', yoloSrc.replace('export const meta', 'const meta'));

const DONE = { plan: 'done', implement: 'done', verify: 'done', review: 'n-a' };
const PLANNED = { plan: 'done', implement: 'todo', verify: 'todo', review: 'n-a' };
const TODO = { plan: 'todo', implement: 'todo', verify: 'todo', review: 'n-a' };
const slice = (name, stages, extra = {}) => ({ slice: name, status: 'defined', reverifyReason: 'none', stages, dependsOn: [], ...extra });

function answerOf(label) {
  const [stage, sl] = String(label).split(':');
  if (stage === 'plan' || stage === 'implement') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'verify') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (stage === 'scout') return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0 } };
  if (stage === 'writeback') return { ok: true, wrote: [] };
  return undefined;
}

async function drive(orient, roster) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ label: opts.label, prompt });
    if (opts.label === 'orient') return orient;
    if (String(opts.label).startsWith('roster:')) return roster(opts.label);
    return answerOf(opts.label);
  };
  const outcome = await driver({ projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo' },
    agent, (m) => logs.push(m), () => {}, async (fns) => Promise.all(fns.map((f) => f())));
  const labels = calls.map((c) => c.label);
  return { outcome, labels, logs, of: (stage) => labels.filter((l) => l.startsWith(`${stage}:`)).map((l) => l.split(':')[1]) };
}

const orientOf = (slices, more = {}) => ({
  ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed',
  runId: '20261127T100000Z-demo', charter: [], priorDeferrals: [], designSettled: true, priorJournal: { present: true, nowAt: '2026-11-27T10:00:00Z' },
  branch: { current: 'b', target: 'b', match: true, base: 'main', strategy: 'none' }, slices, ...more,
});
const row = (s, extra = {}) => ({ slice: s, roster: 'defined', dependsOn: [], ...extra });

test('scenario, driver: a carried slice is planned again, and the parts of a split are driven without a restart', async () => {
  const r = await drive(
    orientOf([slice('one', DONE, { status: 'complete' }), slice('two', PLANNED), slice('three', PLANNED, { planAt: '2026-11-26T00:00:00Z' }), slice('four', TODO)]),
    (label) => (label === 'roster:two'
      ? { slices: [row('one', { roster: 'complete' }), row('two'), row('three', { carriedAt: '2026-11-27T09:00:00Z', planAt: '2026-11-26T00:00:00Z' }), row('four', { dependsOn: ['three'] }), row('four-b', { dependsOn: ['four'], fresh: true, uxImpact: 'none' })] }
      : undefined),
  );
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.of('implement'), ['two', 'three', 'four', 'four-b']);
  assert.ok(r.of('plan').includes('three'), 'the carried slice gets its plan written again');
  assert.ok(r.of('plan').includes('four-b'), 'the new part is planned in this run');
  assert.ok(!r.of('implement').includes('one'), 'a done slice is not built again');
});

test('scenario, driver: a relaunch of a built packet runs no review again and no checkpoint', async () => {
  const built = [slice('one', DONE, { status: 'complete', implementAt: '2026-11-25T00:00:00Z' }), slice('two', DONE, { status: 'complete', implementAt: '2026-11-26T00:00:00Z' })];
  const reread = () => ({ slices: [row('one', { roster: 'complete' }), row('two', { roster: 'complete' })] });
  // The control: with no review recorded, the run reviews.
  assert.ok((await drive(orientOf(built), reread)).labels.includes('review'));
  const r = await drive(orientOf(built, { slugReview: 'done' }), reread);
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.deepEqual(r.of('implement'), [], 'nothing is built again');
  assert.ok(!r.labels.includes('review'), 'the slug-wide review that covers HEAD is not run again');
  assert.ok(!r.labels.some((l) => /^checkpoint/.test(String(l))), 'no checkpoint without new work');
});

test('scenario, driver: a relaunch places an issue that an earlier run investigated, and does not investigate it again', async () => {
  const slices = [slice('one', DONE, { status: 'complete' }), slice('two', PLANNED)];
  const reread = () => ({ slices: [row('one', { roster: 'complete' }), row('two')], issues: [{ id: 'T-1', by: 'implement:two', text: 'a stale page', refs: [], placed: false, refused: false }] });
  // The control: with no investigation on record, the issue is investigated.
  assert.ok((await drive(orientOf(slices), reread)).labels.includes('investigate:T-1'));
  const r = await drive(orientOf(slices, { issueRecords: ['t1'] }), reread);
  assert.ok(!r.labels.includes('investigate:T-1'), r.labels.join(' '));
});
