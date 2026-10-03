// WF-CAMPAIGN-PLAN C1 — red-first tests for lib/campaign.mjs: wave computation,
// same-slug exclusion, cycle detection, partial waves, the revert search, the
// drift classes, and the version order at ship time. Written before the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

// A packet as work-packets.mjs writes it (frontmatter fields only).
function packet(key, over = {}) {
  return {
    key,
    'work-slug': over['work-slug'] ?? key,
    title: over.title ?? `Piece ${key}`,
    form: over.form ?? 'intake',
    'target-slug': over['target-slug'] ?? null,
    urgency: over.urgency ?? 'normal',
    order: over.order ?? 1,
    'depends-on': over['depends-on'] ?? [],
    provides: over.provides ?? [],
    expects: over.expects ?? [],
    'carried-decisions': over['carried-decisions'] ?? [{ key: `${key}-d1`, text: `decision of ${key}`, session: 's1', 'decided-at': '2026-10-01' }],
    'ux-impact': over['ux-impact'] ?? 'none',
    state: over.state ?? 'proposed',
    'routed-to': over['routed-to'] ?? null,
  };
}

const units = (...packets) => packets.map(C.unitOf);
const keysOf = (waves) => waves.map((w) => [...w].sort());

test('unitOf: an extension drives its target slug; every unit names the slugs it touches', () => {
  const ext = C.unitOf(packet('W5', { form: 'extension', 'work-slug': 'engine-ext', 'target-slug': 'engine' }));
  assert.equal(ext.slug, 'engine');
  assert.deepEqual([...C.touchedSlugs(ext)].sort(), ['engine', 'engine-ext']);
  const fresh = C.unitOf(packet('W1', { 'work-slug': 'engine' }));
  assert.equal(fresh.slug, 'engine');
  assert.equal(C.isBuildUnit(fresh), true);
  assert.equal(C.isBuildUnit(C.unitOf(packet('W9', { form: 'task' }))), false);
});

test('waves: each wave holds the units whose dependencies are in earlier waves', () => {
  const u = units(
    packet('A', { order: 1 }),
    packet('B', { order: 2 }),
    packet('C', { order: 3, 'depends-on': ['A'] }),
    packet('D', { order: 4, 'depends-on': ['B', 'C'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A', 'B'], ['C'], ['D']]);
  assert.deepEqual(plan.waiting, []);
});

test('waves: two units that touch the same slug never share a wave (R1), the later order moves', () => {
  const u = units(
    packet('A', { order: 1, 'work-slug': 'engine' }),
    packet('B', { order: 2, form: 'fix', 'work-slug': 'engine-fix', 'target-slug': 'engine' }),
    packet('C', { order: 3 }),
    packet('E', { order: 4, 'depends-on': ['B'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A', 'C'], ['B'], ['E']]);
});

test('waves: done units count as placed; started waves stay as they are', () => {
  const u = units(packet('A'), packet('B', { 'depends-on': ['A'] }), packet('C', { 'depends-on': ['B'] }));
  const plan = C.planWaves(u, { done: new Set(['A']) });
  assert.deepEqual(keysOf(plan.waves), [['B'], ['C']]);
  const fixed = C.planWaves(u, { started: [['A']], done: new Set() });
  assert.deepEqual(keysOf(fixed.waves), [['A'], ['B'], ['C']], 'a started wave is never re-planned');
});

test('waves: a task, investigate or discover packet blocks only its dependents (W1, W2)', () => {
  const u = units(
    packet('T', { form: 'task' }),
    packet('A'),
    packet('B', { 'depends-on': ['T'] }),
    packet('C', { 'depends-on': ['B'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A']]);
  assert.deepEqual(plan.waiting.map((w) => [w.key, w.on.join(','), w.reason]), [
    ['B', 'T', 'needs-you'],
    ['C', 'B', 'waits'],
  ]);
  const after = C.planWaves(u, { outsideDone: new Set(['T']) });
  assert.deepEqual(keysOf(after.waves), [['A', 'B'], ['C']]);
});

test('waves: a stopped unit and its dependents wait; the rest of the campaign goes on (12.1, F6)', () => {
  const u = units(packet('A'), packet('B'), packet('C', { 'depends-on': ['A'] }), packet('D', { 'depends-on': ['B'] }));
  const plan = C.planWaves(u, { done: new Set(['B']), stopped: new Set(['A']) });
  assert.deepEqual(keysOf(plan.waves), [['D']]);
  assert.deepEqual(plan.waiting.map((w) => `${w.key}:${w.reason}`).sort(), ['A:stopped', 'C:waits']);
});

test('cycle detection and contract checks refuse the work set', () => {
  const cyc = C.checkCampaignSet([packet('A', { 'depends-on': ['C'] }), packet('B', { 'depends-on': ['A'] }), packet('C', { 'depends-on': ['B'] })]);
  assert.ok(cyc.errors.some((e) => /cycle/.test(e)), cyc.errors.join('\n'));
  const orphan = C.checkCampaignSet([packet('A'), packet('B', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'an API' }] })]);
  assert.ok(orphan.errors.some((e) => /expects A\/api/.test(e)), orphan.errors.join('\n'));
  const unknown = C.checkCampaignSet([packet('A'), packet('B', { 'depends-on': ['Z'] })]);
  assert.ok(unknown.errors.some((e) => /Z/.test(e)));
  const single = C.checkCampaignSet([packet('A')]);
  assert.equal(single.single, true, 'a single-slug work set is not a campaign');
  const big = C.checkCampaignSet([packet('A', { 'carried-decisions': Array.from({ length: 41 }, (_, i) => ({ key: `d${i}`, text: 'x' })) }), packet('B')]);
  assert.ok(big.errors.some((e) => /41 carried decisions/.test(e)), 'F7: more than 40 cannot be prepared');
  const ok = C.checkCampaignSet([packet('A', { provides: [{ key: 'api', text: 'an API' }] }), packet('B', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'an API' }] })]);
  assert.deepEqual(ok.errors, []);
});

test('a wave starts with its prepared units; an unprepared unit moves with its dependents (9.3 step 6)', () => {
  const u = units(packet('A'), packet('B'), packet('C', { 'depends-on': ['B'] }));
  const res = C.deferUnprepared(['A', 'B'], u, new Set(['A']));
  assert.deepEqual(res.start, ['A']);
  assert.deepEqual(res.moved, [{ key: 'B', reason: 'not prepared' }]);
  assert.deepEqual(C.deferUnprepared(['A'], u, new Set()).start, []);
});

test('revert search: newest merge first; the first green verify names the breaker (12.2)', () => {
  const merges = [{ key: 'A', sha: 'a1' }, { key: 'B', sha: 'b1' }, { key: 'C', sha: 'c1' }];
  assert.deepEqual(C.revertOrder(merges).map((m) => m.key), ['C', 'B', 'A']);
  // The other slugs stay merged: a slug reverted before the breaker is merged again.
  assert.deepEqual(C.findBreaker(merges, [false, true]), { culprit: 'B', reverted: ['C', 'B'], reapply: ['C'] });
  assert.deepEqual(C.findBreaker(merges, [true]), { culprit: 'C', reverted: ['C'], reapply: [] });
  assert.deepEqual(C.findBreaker(merges, [false, false, false]), { culprit: null, base: true, reverted: ['C', 'B', 'A'] });
  assert.deepEqual(C.findBreaker(merges, [false]), { culprit: null, base: false, reverted: ['C'], next: 'B' });
});

test('drift classes: met is none, a changed line carries its class, missing and unverified are contract (11.2)', () => {
  const waiting = C.unitOf(packet('W', {
    'depends-on': ['A'],
    expects: [
      { from: 'A', key: 'api', text: 'GET /teams' },
      { from: 'A', key: 'shape', text: 'team has a squad list' },
      { from: 'A', key: 'save', text: 'saves to disk' },
      { from: 'A', key: 'log', text: 'logs each match' },
    ],
  }));
  const asBuilt = { A: { lines: [
    { key: 'api', status: 'met' },
    { key: 'shape', status: 'changed', class: 'implementation-detail', note: 'squad is a map' },
    { key: 'save', status: 'unverified' },
  ] } };
  const d = C.classifyDrift(waiting, asBuilt);
  assert.deepEqual(d.lines.map((l) => `${l.key}:${l.class}`), ['api:none', 'shape:implementation-detail', 'save:contract', 'log:contract']);
  assert.equal(d.class, 'contract');
  const clean = C.classifyDrift(waiting, { A: { lines: ['api', 'shape', 'save', 'log'].map((key) => ({ key, status: 'met' })) } });
  assert.equal(clean.class, 'none');
  const changedNoClass = C.classifyDrift(C.unitOf(packet('X', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'x' }] })), { A: { lines: [{ key: 'api', status: 'changed' }] } });
  assert.equal(changedNoClass.class, 'contract', 'an unclassified change is a contract difference');
});

test('versions are assigned at ship time, in ship order (V2, V3)', () => {
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['v0.2.0', 'v0.2.1'] }), '0.3.0-beta.1');
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['v0.2.0', 'v0.3.0-beta.1', 'v0.3.0-beta.2'] }), '0.3.0-beta.3');
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['0.3.0-rc.1'], label: 'rc' }), '0.3.0-rc.2');
  assert.throws(() => C.nextWaveVersion({ target: '0.3.0', tags: ['v0.3.0'] }), /already released/);
  assert.equal(C.hotfixVersion({ tags: ['v0.2.0', 'v0.1.9'] }), '0.2.1');
  assert.equal(C.hotfixVersion({ tags: ['v0.2.0', 'v0.3.0-beta.2'] }), '0.3.0-beta.3', 'during a pre-release series: the next pre-release');
  assert.equal(C.compareVersions('0.3.0-beta.10', '0.3.0-beta.9') > 0, true);
  assert.equal(C.compareVersions('0.3.0', '0.3.0-beta.9') > 0, true);
  assert.equal(C.buildLabel({ wave: 2, sha: 'abcdef1234567' }), 'wave-2+abcdef1');
  assert.equal(C.buildLabel({ wave: 2, slug: 'engine', sha: 'abcdef1234567' }), 'wave-2.engine+abcdef1');
});

test('the ledger state decides what /wf campaign does next (section 6)', () => {
  const u = units(packet('A'), packet('B', { 'depends-on': ['A'] }));
  assert.equal(C.campaignAction(null, { revision: 1 }).action, 'orient');
  const ledger = C.newLedger({ brainstorm: 'realism', revision: 1, units: u, now: '2026-10-03T10:00:00Z' });
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'setup');
  Object.assign(ledger.answers, { forecast: 'continue', 'target-version': '0.3.0', 'release-each-wave': false, output: { 'build-cmd': 'make', artifacts: ['out/'], try: 'run out/app' } });
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'prepare');
  ledger.units.A.state = 'prepared';
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'start-wave');
  assert.equal(C.campaignAction(ledger, { revision: 2 }).action, 'work-changed');
  ledger.pause = { reason: 'five-hour window', until: '2026-10-03T15:00:00Z' };
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'paused');
  ledger.pause = null;
  ledger.questions.push({ id: 'q1', wave: 1, text: 'CI is red', 'asked-at': '2026-10-03T11:00:00Z' });
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'ask');
});
