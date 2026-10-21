// WF-CAMPAIGN-THROUGHPUT-PLAN — the ledger side in lib/campaign.mjs: edge kinds (T1),
// prepare ahead (T3), wave-ready and the next-wave ask (T2 step 1), the machine width and
// the locks of the isolation contract (T9), the conventions answer (T12), and the wave
// simulation of the slicer (section 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

/** Three waves: wave 1 runs A; wave 2 plans B (needs A); wave 3 plans C and D. */
function ledgerOf({ deps = {}, states = {}, waves = null, stack = null } = {}) {
  return {
    units: Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, { key: k, slug: k.toLowerCase(), order: 1, state: states[k] ?? (k === 'A' ? 'running' : 'planned') }])),
    waves: waves ?? [
      { n: 1, state: 'running', units: ['A'] },
      { n: 2, state: 'planned', units: ['B'] },
      { n: 3, state: 'planned', units: ['C', 'D'] },
    ],
    deps: { units: deps },
    outside: {},
    ...(stack ? { stack } : {}),
  };
}

test('T1: an edge is a need, a sequence, or legacy; graphOf keeps a sequence out of dependsOn', () => {
  assert.equal(C.edgeKind({ key: 'A', kind: 'need', evidence: 'x' }), 'need');
  assert.equal(C.edgeKind({ key: 'A', kind: 'sequence' }), 'sequence');
  assert.equal(C.edgeKind({ key: 'A' }), 'legacy');
  assert.equal(C.edgeKind('A'), 'legacy');
  const g = C.graphOf({ 'depends-on': [{ key: 'A', kind: 'need', evidence: 'x' }, { key: 'B', kind: 'sequence' }, { key: 'C' }, 'D'] });
  assert.deepEqual(g.dependsOn, ['A', 'C', 'D'], 'a legacy edge counts as a need');
  assert.deepEqual(g.sequence, ['B']);
});

test('T1: sequenceSort puts a unit after the units of its sequence edges, then by order', () => {
  const units = [
    { key: 'A', order: 1, sequence: ['C'] },
    { key: 'B', order: 2, sequence: [] },
    { key: 'C', order: 3, sequence: [] },
  ];
  assert.deepEqual(C.sequenceSort(units).map((u) => u.key), ['B', 'C', 'A']);
  // A sequence edge to a unit outside the list orders nothing.
  assert.deepEqual(C.sequenceSort([{ key: 'A', order: 1, sequence: ['Z'] }, { key: 'B', order: 2 }]).map((u) => u.key), ['A', 'B']);
});

test('T1: unclassifiedEdges lists the legacy edges of the units outside a started wave', () => {
  const l = ledgerOf({ deps: {
    A: { 'depends-on': [{ key: 'X' }] },
    B: { 'depends-on': [{ key: 'A', by: 'scout' }] },
    C: { 'depends-on': [{ key: 'A', kind: 'sequence' }, { key: 'B', kind: 'need', evidence: 'e' }] },
  } });
  assert.deepEqual(C.unclassifiedEdges(l), [{ key: 'B', from: 'A', by: 'scout' }], 'A is in a started wave; C has kinds');
});

test('T3: prepareAhead names the later units whose needs are done, started, or in the next wave', () => {
  const l = ledgerOf({ deps: { C: { 'depends-on': [{ key: 'B', kind: 'need', evidence: 'e' }] }, D: { 'depends-on': [{ key: 'X' }] } } });
  l.units.X = { key: 'X', state: 'planned' };
  l.waves.push({ n: 4, state: 'planned', units: ['X'] });
  assert.deepEqual(C.prepareAhead(l), ['C', 'X'], 'C needs B of the next wave; D needs X of a later wave; X needs nothing');
  l.units.C.state = 'prepared';
  assert.deepEqual(C.prepareAhead(l), ['X'], 'a prepared unit is not named again');
});

test('T2 step 1: waveReady and nextWaveAsk ask at a boundary with ready-at, only with stacked PRs', () => {
  const waves = [{ n: 1, state: 'boundary', units: ['A'] }, { n: 2, state: 'planned', units: ['B'] }];
  const l = ledgerOf({ waves, stack: { enabled: true, 'max-unshipped': 2 } });
  assert.equal(C.waveReady(l.waves[0]), false, 'a boundary with no ready-at is not ready');
  assert.equal(C.nextWaveAsk(l, 1), null);
  l.waves[0]['ready-at'] = '2026-10-21T10:00:00Z';
  assert.equal(C.waveReady(l.waves[0]), true);
  assert.deepEqual(C.nextWaveAsk(l, 1), { wave: 2, on: 1, units: ['B'], prepared: false, unprepared: ['B'] });
  l.units.B.state = 'prepared';
  assert.equal(C.nextWaveAsk(l, 1).prepared, true);
  assert.equal(C.nextWaveAsk({ ...l, stack: { enabled: false } }, 1), null, 'with no stacked PRs the next wave waits for the merge');
  assert.equal(C.nextWaveAsk({ ...l, stack: { enabled: true, 'max-unshipped': 1 } }, 1), null, 'max-unshipped is reached');
  assert.equal(C.waveReady({ state: 'handoff' }), true);
  assert.equal(C.waveReady({ state: 'running' }), false);
});

test('T9: isolationOf reads the machine width and the locks; a lock with no stale-minutes gets 120', () => {
  const iso = C.isolationOf({ campaign: { isolation: { 'port-env': {}, 'build-dirs': [], 'machine-width': 3, locks: [{ path: '.db.lock', name: 'db' }, { path: 'x.lock', 'stale-minutes': 5 }, { name: 'no path' }] } } });
  assert.equal(iso['machine-width'], 3);
  assert.deepEqual(iso.locks, [{ name: 'db', path: '.db.lock', 'stale-minutes': 120 }, { name: 'x.lock', path: 'x.lock', 'stale-minutes': 5 }]);
  const bare = C.isolationOf({ campaign: { isolation: { 'port-env': {}, 'build-dirs': [] } } });
  assert.equal(bare['machine-width'], null);
  assert.deepEqual(bare.locks, []);
});

test('T12: the conventions answer is on by default; off turns it off', () => {
  assert.equal(C.conventionsOn({ answers: {} }), true);
  assert.equal(C.conventionsOn({ answers: { conventions: 'on' } }), true);
  assert.equal(C.conventionsOn({ answers: { conventions: 'off' } }), false);
  assert.equal(C.OPTIONAL_ANSWERS.conventions, 'on');
});

test('section 3: scheduleOf finds the longest unit, the critical path and the slot bound of a wave', () => {
  const unit = (key, n) => ({ key, reviewScope: 'slug-wide', slices: Array.from({ length: n }, (_, i) => ({ slice: `${key.toLowerCase()}${i}` })) });
  const s = C.scheduleOf({ units: [unit('H', 11), unit('P', 7), unit('T', 9)], waits: [{ key: 'T', from: 'P', through: 'p0', before: 't0' }], width: 2 });
  assert.equal(s.longest, 'H');
  assert.equal(s.criticalPath, 1254);
  assert.equal(s.slotBound, 1140);
  assert.ok(s.simulated >= Math.max(s.criticalPath, s.slotBound), JSON.stringify(s));
  assert.deepEqual(s.units.map((u) => [u.key, u.slices]), [['H', 11], ['P', 7], ['T', 9]]);
  // One unit at width 1: the simulation is its own walk, and one more slot adds nothing.
  const one = C.scheduleOf({ units: [unit('A', 2)], width: 1 });
  assert.equal(one.simulated, C.scheduleOf({ units: [unit('A', 2)], width: 2 }).simulated);
  // A slice that depends on another plans one level later.
  const lv = C.scheduleOf({ units: [{ key: 'A', reviewScope: 'slug-wide', slices: [{ slice: 'a' }, { slice: 'b', dependsOn: ['a'] }] }], width: 1 });
  assert.equal(lv.units[0].planMinutes, 2 * C.STAGE_MINUTES.plan);
});
