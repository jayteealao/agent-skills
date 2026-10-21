// WF-CAMPAIGN-SLICE-ORDER-PLAN — the ledger side in lib/campaign.mjs: the version 2
// upgrade (5.2), the sort check (5.3), merge notes (D4), drop records (D5), slice
// ownership (D8), and the wave check of an extension unit (4.6 step 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

const clone = (x) => JSON.parse(JSON.stringify(x));

/** A version 1 ledger: wave 1 runs A and B; B waits on A through s1 before p1. */
function v1({ waits = [], derived = [], extra = {} } = {}) {
  return {
    version: 1,
    units: {
      A: { slug: 'a', form: 'intake', state: 'running', wave: 1, waits: [] },
      B: { slug: 'b', form: 'intake', state: 'running', wave: 1, waits, 'derived-needs': derived },
      ...extra,
    },
    waves: [{ n: 1, state: 'running', units: ['A', 'B'] }, { n: 2, state: 'planned', units: [] }],
  };
}

const crossWait = { from: 'A', through: 's1', before: 'p1', state: 'open', source: 'cross-unit' };
const crossEntry = { from: 'A', through: 's1', before: 'p1', why: 'src/x.ts', source: 'cross-unit', by: 'driver' };

test('migrateOrder: a ledger with no waits changes only its version', () => {
  const l = v1();
  const want = { ...clone(l), version: C.LEDGER_VERSION };
  assert.equal(C.migrateOrder(l), true);
  assert.deepEqual(l, want);
  assert.equal(C.LEDGER_VERSION, 2);
});

test('migrateOrder: a driver wait is legacy, a packet wait and a person wait are not; the wave gets legacy-order', () => {
  const personWait = { from: 'A', through: 's2', before: 'p2', state: 'open', source: 'plan:p2' };
  const personEntry = { from: 'A', through: 's2', before: 'p2', source: 'plan:p2', by: 'person' };
  const packetWait = { from: 'A', through: 's1', before: 'p3', state: 'open' };
  const l = v1({ waits: [crossWait, personWait, packetWait], derived: [crossEntry, personEntry] });
  C.migrateOrder(l);
  assert.deepEqual(l.units.B.waits.map((w) => w.kind ?? null), ['legacy', null, null]);
  assert.deepEqual(l.units.B['derived-needs'].map((n) => n.kind ?? null), ['legacy', null]);
  assert.equal(l.waves[0]['legacy-order'], true);
  assert.equal(l.waves[1]['legacy-order'], undefined);
  assert.deepEqual(C.legacyWaits(l, l.waves[0]), [{ key: 'B', from: 'A', through: 's1', before: 'p1', why: '', source: 'cross-unit' }]);
});

test('migrateOrder is idempotent: a second run changes nothing', () => {
  const l = v1({ waits: [crossWait], derived: [crossEntry] });
  C.migrateOrder(l);
  const once = clone(l);
  assert.equal(C.migrateOrder(l), false);
  assert.deepEqual(l, once);
});

test('migrateOrder lists an extension whose target runs in an earlier started wave', () => {
  const l = v1({ extra: { X: { slug: 'a', form: 'extension', state: 'planned', wave: 2 } } });
  l.waves[1].units = ['X'];
  C.migrateOrder(l);
  assert.deepEqual(l.waves[0]['extensions-pending'], ['X']);
  assert.equal(C.targetOf(l, 'X'), 'A');
});

test('needsSort: a running wave with legacy-order or a pending extension, while a unit still drives', () => {
  const l = v1({ waits: [crossWait] });
  C.migrateOrder(l);
  assert.equal(C.needsSort(l, l.waves[0]), true);
  for (const k of ['A', 'B']) l.units[k].state = 'finished';
  assert.equal(C.needsSort(l, l.waves[0]), false, 'every unit finished: nothing to sort');
  assert.equal(C.needsSort(l, l.waves[1]), false);
});

test('campaignAction returns sort-waits for a wave that needs a sort', () => {
  const l = { ...v1({ waits: [crossWait] }), questions: [], answers: Object.fromEntries(C.SETUP_ANSWERS.map((k) => [k, 'x'])) };
  C.migrateOrder(l);
  const a = C.campaignAction(l, {});
  assert.deepEqual(a, { action: 'sort-waits', wave: 1, legacy: true, extensions: [] });
  assert.equal(C.campaignAction(l, { driving: { wave: 1 } }).action, 'driving', 'a live run is answered first');
});

test('addMergeNote de-duplicates by the two slices', () => {
  const w = { n: 1 };
  const note = { a: 'A', aSlice: 's1', b: 'B', bSlice: 'p1', files: 'CHANGELOG.md' };
  assert.equal(C.addMergeNote(w, note).added, true);
  assert.equal(C.addMergeNote(w, { ...note, files: 'other' }).added, false);
  assert.equal(C.addMergeNote(w, { ...note, bSlice: 'p2' }).added, true);
  assert.equal(w['merge-notes'].length, 2);
});

test('dropRecordOf matches by from, through and before', () => {
  const u = { 'dropped-needs': [{ from: 'A', through: 's1', before: 'p1', by: 'person' }] };
  assert.equal(C.dropRecordOf(u, { from: 'A', through: 's1', before: 'p1' }).by, 'person');
  assert.equal(C.dropRecordOf(u, { from: 'A', through: 's1', before: 'p2' }), null);
  assert.equal(C.dropRecordOf({}, crossEntry), null);
});

test('ownsSlice: a named unit owns its slice; an extension owns only its extension slices', () => {
  const own = { keys: ['A'], form: 'intake' };
  assert.equal(C.ownsSlice({ slug: 's1' }, own), true);
  assert.equal(C.ownsSlice({ slug: 'x1', unit: 'X', source: 'extension' }, own), false);
  assert.equal(C.ownsSlice({ slug: 'x1', unit: 'X', source: 'extension' }, { keys: ['A', 'X'] }), true, 'an absorbed unit');
  assert.equal(C.ownsSlice({ slug: 'x1', source: 'extension' }, { keys: ['X'], form: 'extension' }), true);
  assert.equal(C.ownsSlice({ slug: 's1' }, { keys: ['X'], form: 'extension' }), false);
});

test('syncAbsorbed: an absorbed unit follows the state and the wave of its target', () => {
  const l = v1({ extra: { X: { slug: 'a', form: 'extension', state: 'planned', wave: 2, 'absorbed-into': 'A' } } });
  C.syncAbsorbed(l);
  assert.equal(l.units.X.state, 'running');
  assert.equal(l.units.X.wave, 1);
  assert.deepEqual(C.absorbedBy(l, 'A'), ['X']);
});

test('extensionWaveErrors: an extension in a wave before its target is an error', () => {
  const l = v1({ extra: { X: { slug: 'a', form: 'extension', state: 'planned', wave: 1 } } });
  l.units.A.wave = 2;
  l.waves[0].units = ['B', 'X'];
  assert.match(C.extensionWaveErrors(l, 1)[0], /the extension X is in wave 1, and its target A is in the later wave 2/);
  l.units.A.wave = 1;
  assert.deepEqual(C.extensionWaveErrors(l, 1), []);
});

test('sliceCycle runs over the slices that each unit owns', () => {
  // A deferred slice x1 is not in the roster of A, so a wait before x1 joins no chain of A.
  const waits = [{ key: 'A', from: 'B', through: 'p1', before: 'x1' }, { key: 'B', from: 'A', through: 's1', before: 'p1' }];
  assert.ok(C.sliceCycle({ A: ['s1', 'x1'], B: ['p1'] }, [{ key: 'A', from: 'B', through: 'p1', before: 's1' }, waits[1]]));
  assert.equal(C.sliceCycle({ A: ['s1'], B: ['p1'] }, waits), null);
});
