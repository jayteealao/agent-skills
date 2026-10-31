// lib/drive-class.mjs: what a driver may do with each workflow-type, and `status --json`
// carries it as `drive`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DRIVE_CLASSES, classOf, driveClass } from '../../../lib/drive-class.mjs';
import { statusOf } from '../../../lib/wf-status.mjs';

function project() {
  const root = mkdtempSync(join(tmpdir(), 'drive-class-'));
  const make = (slug, index, files = {}) => {
    const dir = join(root, '.ai', 'workflows', slug);
    mkdirSync(dir, { recursive: true });
    const fm = { slug, status: 'active', 'updated-at': '2026-10-30T00:00:00Z', ...index };
    const yaml = (o) => Object.entries(o).map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`).join('\n');
    writeFileSync(join(dir, '00-index.md'), `---\n${yaml(fm)}\n---\n`);
    for (const [name, f] of Object.entries(files)) writeFileSync(join(dir, name), `---\n${yaml(f)}\n---\n`);
    return dir;
  };
  return { root, make, done: () => rmSync(root, { recursive: true, force: true }) };
}

const DONE = { status: 'complete' };
const ROSTER = (...slugs) => ({ status: 'complete', slices: slugs.map((slug) => ({ slug, status: 'defined' })) });

// One row for each workflow-type: [type, files, class, drivable, route pattern].
const ROWS = [
  ['standard', { '01-intake.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a', 'b') }, 'build', true, null],
  ['feature', { '01-intake.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'build', true, null],
  ['adopt', { '01-adopt.md': { type: 'intake', status: 'complete' }, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'build', true, null],
  ['docs', { '01-intake.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'build', true, null],
  ['fix', { '01-fix.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'change-mode', true, null],
  ['hotfix', { '01-hotfix.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'change-mode', true, null],
  ['refactor', { '01-refactor.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }, 'change-mode', true, null],
  ['quick', { '01-quick.md': DONE }, 'change-mode', false, /^\/wf intake fix q$/],
  ['rca', { '01-rca.md': { 'recommended-next': 'hotfix' }, '02-shape.md': DONE }, 'rca', true, null],
  ['update-deps', { '01-update-deps.md': DONE, '02-shape.md': DONE, '03-slice.md': DONE, '04-plan.md': DONE }, 'self-managed', true, null],
  ['optimize', { '05-implement-optimize.md': DONE }, 'optimize', true, null],
  ['investigate', {}, 'terminal-analysis', false, /01-investigate\.md/],
  ['discover', {}, 'terminal-analysis', false, /01-discover\.md/],
  ['ideate', {}, 'terminal-analysis', false, /^\/wf intake <chosen-idea>$/],
  ['audit', {}, 'terminal-analysis', false, /each finding's route in 07-review\.md/],
  ['brainstorm', {}, 'terminal-analysis', false, /^\/wf intake brainstorm q /],
  ['prototype', {}, 'refused', false, /^\/wf loop prototype q <request>$/],
  ['task', {}, 'refused', false, /^\/wf intake task q$/],
  ['small', { '01-small.md': DONE }, 'small', false, /^\/wf intake q$/],
];

test('driveClass: a row for each workflow-type', () => {
  for (const [type, files, cls, drivable, route] of ROWS) {
    const p = project();
    try {
      const d = driveClass(p.make('q', { 'workflow-type': type }, files));
      assert.equal(d.class, cls, type);
      assert.equal(d.workflowType, type, type);
      assert.equal(d.drivable, drivable, `${type}: ${d.blockReason}`);
      if (drivable) assert.equal(d.blockReason, null, type);
      else assert.ok(d.blockReason, `${type} names why it is blocked`);
      if (route) assert.match(d.route ?? '', route, type);
      else assert.equal(d.route, null, type);
    } finally { p.done(); }
  }
  assert.equal(classOf(undefined), 'build');
  assert.equal(classOf('something-new'), 'build');
  const listed = Object.values(DRIVE_CLASSES).flat();
  assert.equal(new Set(listed).size, listed.length, 'a type has one class');
});

test('driveClass: audit and task are blocked, and never route to slice or plan', () => {
  for (const type of ['audit', 'task']) {
    const p = project();
    try {
      const d = driveClass(p.make('x', { 'workflow-type': type }));
      assert.equal(d.drivable, false);
      assert.doesNotMatch(d.route, /\/wf (slice|plan) /);
    } finally { p.done(); }
  }
});

test('driveClass: the file convention, the single scope and the review dimension', () => {
  const p = project();
  try {
    // A multi-slice standard workflow has per-slice files.
    const multi = driveClass(p.make('m', {}, { '01-intake.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a', 'b'), '04-plan-a.md': DONE }));
    assert.deepEqual([multi.fileConvention, multi.singleScope, multi.intakeLead], ['suffixed', false, '01-intake.md']);
    // A one-slice standard workflow with no roster is single-scope: a synthesized roster of one.
    const one = driveClass(p.make('o', { 'selected-slice': 'core' }, { '01-intake.md': DONE, '02-shape.md': DONE }));
    assert.deepEqual([one.drivable, one.singleScope, one.fileConvention, one.reviewScope], [true, true, 'unsuffixed', 'slug-wide']);
    // A change mode is un-suffixed.
    const fix = driveClass(p.make('f', { 'workflow-type': 'fix' }, { '01-fix.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') }));
    assert.deepEqual([fix.fileConvention, fix.intakeLead, fix.reviewDimension], ['unsuffixed', '01-fix.md', null]);
    // An RCA that recommends a hotfix reviews with security; one that recommends a plan does not.
    const hot = driveClass(p.make('r1', { 'workflow-type': 'rca', 'selected-slice': 'r1' }, { '01-rca.md': { 'recommended-next': '/wf intake hotfix' }, '02-shape.md': DONE }));
    assert.deepEqual([hot.drivable, hot.singleScope, hot.reviewDimension, hot.fileConvention], [true, true, 'security', 'unsuffixed']);
    const plan = driveClass(p.make('r2', { 'workflow-type': 'rca' }, { '01-rca.md': { 'recommended-next': 'plan' }, '02-shape.md': DONE }));
    assert.equal(plan.reviewDimension, null);
    // The optimize slice is suffixed.
    assert.equal(driveClass(p.make('op', { 'workflow-type': 'optimize' }, { '05-implement-optimize.md': DONE })).fileConvention, 'suffixed');
  } finally { p.done(); }
});

test('driveClass: the readiness gaps of each build path, with the route of the gap', () => {
  const p = project();
  try {
    const noShape = driveClass(p.make('a', {}, { '01-intake.md': DONE }));
    assert.deepEqual([noShape.drivable, noShape.route], [false, '/wf intake a']);
    const noRoster = driveClass(p.make('b', {}, { '01-intake.md': DONE, '02-shape.md': DONE }));
    assert.deepEqual([noRoster.drivable, noRoster.route], [false, '/wf slice b']);
    const waiting = driveClass(p.make('c', { 'workflow-type': 'hotfix' }, { '01-hotfix.md': { status: 'awaiting-input' }, '02-shape.md': DONE, '03-slice.md': ROSTER('x') }));
    assert.deepEqual([waiting.drivable, waiting.route], [false, '/wf intake hotfix c']);
    // An intake lead under another name of type intake still counts.
    const other = driveClass(p.make('d', {}, { '01-brief.md': { type: 'intake', status: 'complete' }, '02-shape.md': DONE, '03-slice.md': ROSTER('x') }));
    assert.deepEqual([other.drivable, other.intakeLead], [true, '01-brief.md']);
    // update-deps with only the plan missing goes to plan; with more missing, to its intake.
    const deps = driveClass(p.make('e', { 'workflow-type': 'update-deps' }, { '01-update-deps.md': DONE, '02-shape.md': DONE, '03-slice.md': DONE }));
    assert.deepEqual([deps.drivable, deps.route], [false, '/wf plan e']);
    const deps2 = driveClass(p.make('g', { 'workflow-type': 'update-deps' }, { '01-update-deps.md': DONE }));
    assert.equal(deps2.route, '/wf intake update-deps g');
    // The optimize loop that has not finished.
    assert.equal(driveClass(p.make('h', { 'workflow-type': 'optimize' })).route, '/wf loop optimize h');
    // An RCA that asks for human triage, by its route or by low confidence and a high blast radius.
    const triage = driveClass(p.make('i', { 'workflow-type': 'rca' }, { '01-rca.md': { 'recommended-next': 'human-triage' }, '02-shape.md': DONE }));
    assert.equal(triage.drivable, false);
    assert.match(triage.blockReason, /human triage/);
    const risky = driveClass(p.make('j', { 'workflow-type': 'rca' }, { '01-rca.md': { 'recommended-next': 'fix', 'root-cause-confidence': 'low', 'blast-radius': 'high' }, '02-shape.md': DONE }));
    assert.equal(risky.drivable, false);
    // An ideate keeps the intake of its chosen idea as its route.
    assert.equal(driveClass(p.make('k', { 'workflow-type': 'ideate', 'next-invocation': '/wf intake add-tags' })).route, '/wf intake add-tags');
  } finally { p.done(); }
});

test('status of one workflow carries drive', async () => {
  const p = project();
  try {
    p.make('t', { 'workflow-type': 'task' });
    p.make('s', {}, { '01-intake.md': DONE, '02-shape.md': DONE, '03-slice.md': ROSTER('a') });
    const t = await statusOf(p.root, 't');
    assert.deepEqual([t.drive.class, t.drive.drivable, t.drive.route], ['refused', false, '/wf intake task t']);
    const s = await statusOf(p.root, 's');
    assert.deepEqual([s.drive.class, s.drive.drivable], ['build', true]);
  } finally { p.done(); }
});
