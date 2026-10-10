// WF-CAMPAIGN-RUN-FIXES-PLAN — the pure side of the ten campaign fixes: needs inside a
// wave (C1), the merge order at the boundary (C7), the disk and path checks (C5, C6),
// the plugin version (C8), the recap (C3), and the rules in ledger.md (C9).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

function packet(key, over = {}) {
  return {
    key, 'work-slug': over['work-slug'] ?? key, title: `Piece ${key}`, form: over.form ?? 'intake', 'target-slug': over['target-slug'] ?? null,
    urgency: 'normal', order: over.order ?? 1, 'depends-on': over['depends-on'] ?? [], provides: [], expects: [],
    'carried-decisions': [], 'ux-impact': 'none', state: 'proposed', 'routed-to': null,
    ...(over.needs ? { needs: over.needs } : {}),
  };
}
const unitsOf = (...ps) => ps.map((p) => C.unitOf(p));

// ---------------------------------------------------------------- C1: needs inside a wave

test('a need keeps both units in one wave, in packet order, even when the needed unit comes later', () => {
  const us = unitsOf(
    packet('U1', { order: 1 }),
    packet('U3', { order: 3, needs: [{ from: 'U2', through: 'record', before: 'pace' }, { from: 'U1', through: 'finished', before: 'shape' }] }),
    packet('U2', { order: 2 }),
  );
  assert.deepEqual(C.checkCampaignSet(us).errors, []);
  assert.deepEqual(C.planWaves(us).waves, [['U1', 'U2', 'U3']]);
  // The same packet with depends-on moves to a later wave.
  const dep = unitsOf(packet('U1'), packet('U3', { order: 3, 'depends-on': ['U1'] }));
  assert.deepEqual(C.planWaves(dep).waves, [['U1'], ['U3']]);
});

test('a need on a unit that waits for an earlier wave moves the needing unit to that wave', () => {
  const us = unitsOf(packet('A'), packet('B', { order: 2, 'depends-on': ['A'] }), packet('C', { order: 3, needs: [{ from: 'B', through: 'finished' }] }));
  assert.deepEqual(C.planWaves(us).waves, [['A'], ['B', 'C']]);
});

test('need errors: itself, an unknown packet, a task, the same slug, a cycle; a need that repeats depends-on warns', () => {
  const errs = (...ps) => C.checkCampaignSet(unitsOf(...ps)).errors.join('\n');
  assert.match(errs(packet('A', { needs: [{ from: 'A' }] }), packet('B')), /A needs itself/);
  assert.match(errs(packet('A', { needs: [{ from: 'Z' }] }), packet('B')), /A needs Z, which is not a packet/);
  assert.match(errs(packet('A', { needs: [{ from: 'T' }] }), packet('T', { form: 'task' }), packet('B')), /needs T, a task/);
  assert.match(errs(packet('A', { 'work-slug': 'engine', needs: [{ from: 'F' }] }), packet('F', { form: 'fix', 'work-slug': 'engine-fix', 'target-slug': 'engine' })), /touch the same slug/);
  assert.match(errs(packet('A', { needs: [{ from: 'B' }] }), packet('B', { needs: [{ from: 'A' }] })), /cycle/);
  const w = C.checkCampaignSet(unitsOf(packet('A'), packet('B', { 'depends-on': ['A'], needs: [{ from: 'A' }] }))).warnings.join('\n');
  assert.match(w, /depends on A and also needs it/);
});

test('a need on a written piece is met before the campaign starts', () => {
  const u = C.unitOf(packet('A', { needs: [{ from: 'charter' }] }), { written: ['charter'] });
  assert.deepEqual(u.needs, []);
});

test('an unprepared needed unit takes its needing unit out of the wave', () => {
  const us = unitsOf(packet('A'), packet('B', { order: 2, needs: [{ from: 'A' }] }), packet('C', { order: 3 }));
  const r = C.deferUnprepared(['A', 'B', 'C'], us, new Set(['B', 'C']));
  assert.deepEqual(r.start, ['C']);
  assert.deepEqual(r.moved, [{ key: 'A', reason: 'not prepared' }, { key: 'B', reason: 'needs A' }]);
});

test('waveWaits: a need inside the wave is an open wait; a need on an earlier wave is not', () => {
  const us = unitsOf(packet('A'), packet('B'), packet('C', { needs: [{ from: 'A', through: 's2', before: 'p1', why: 'the sink' }, { from: 'X' }] }), packet('X'));
  assert.deepEqual(C.waveWaits(us, ['A', 'B', 'C']), { C: [{ from: 'A', through: 's2', before: 'p1', why: 'the sink', state: 'open' }] });
});

test('throughCovers follows the slice order; finished covers everything', () => {
  const order = ['s1', 's2', 's3'];
  assert.equal(C.throughCovers('s2', 's1', order), true);
  assert.equal(C.throughCovers('s2', 's2', order), true);
  assert.equal(C.throughCovers('s1', 's2', order), false);
  assert.equal(C.throughCovers('finished', 's3', order), true);
  assert.equal(C.throughCovers('s3', 'finished', order), false);
  assert.equal(C.throughCovers('other', 's1', order), false);
});

test('mergeInsReady offers a stopped or waiting unit whose need passed verify, never a running one', () => {
  const ledger = {
    waves: [{ n: 1, state: 'running', units: ['A', 'C', 'D'] }],
    units: {
      A: { state: 'running' },
      C: { state: 'waiting', waits: [{ from: 'A', through: 's2', state: 'open' }] },
      D: { state: 'running', waits: [{ from: 'A', through: 's1', state: 'open' }] },
    },
  };
  assert.deepEqual(C.mergeInsReady(ledger, { A: { order: ['s1', 's2'], passed: ['s1'], finished: false } }), []);
  assert.deepEqual(C.mergeInsReady(ledger, { A: { order: ['s1', 's2'], passed: ['s1', 's2'], finished: false } }), [{ key: 'C', from: 'A', through: 's2', waitingFor: 's2' }]);
  const act = C.campaignAction({ ...ledger, answers: Object.fromEntries(C.SETUP_ANSWERS.map((k) => [k, 'x'])), questions: [], outside: {} }, { mergeReady: [{ key: 'C', from: 'A' }] });
  assert.equal(act.action, 'merge-in');
});

test('closeWaits closes the waits that a merge covers, and the context file shows them', () => {
  const u = { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open' }, { from: 'A', through: 'finished', before: 'p3', state: 'open' }], 'merged-in': [] };
  const closed = C.closeWaits(u.waits, { from: 'A', through: 's2', order: ['s1', 's2'], at: '2026-10-10T10:00:00Z' });
  assert.equal(closed.length, 1);
  assert.deepEqual(u.waits.map((w) => w.state), ['closed', 'open']);
  u['merged-in'].push({ from: 'A', through: 's2', sha: 'abcdef1234', at: '2026-10-10T10:00:00Z' });
  const text = C.waitsText(u);
  assert.match(text, /Merged into this branch: A through `s2` \(abcdef1/);
  assert.match(text, /\*\*Open\*\*: before the slice `p3`, this branch needs A through `finished`/);
  assert.match(text, /Closed: before the slice `p1`/);
  const ctx = C.renderContext({ unit: C.unitOf(packet('C')), units: [], ledger: { brainstorm: 'b', units: { C: { wave: 1, ...u } } } });
  assert.match(ctx, /## 7\. Waits/);
});

// ---------------------------------------------------------------- C7: merge order

test('boundaryMergeOrder: a unit merged in at its tip is carried; a carrier merges after what it merged in', () => {
  const r = C.boundaryMergeOrder([
    { key: 'U1', tip: 'a1', mergedIn: [] },
    { key: 'U2', tip: 'b2', mergedIn: [] },
    { key: 'U3', tip: 'c3', mergedIn: [{ from: 'U2', sha: 'b1' }, { from: 'U1', sha: 'a1' }] },
  ]);
  assert.deepEqual(r.through, { U1: 'U3' });
  assert.deepEqual(r.order, ['U2', 'U3'], 'U2 has commits after the merge-in, so it merges first; U1 rides on U3');
  const all = C.boundaryMergeOrder([
    { key: 'U3', tip: 'c3', mergedIn: [{ from: 'U1', sha: 'a1' }, { from: 'U2', sha: 'b2' }] },
    { key: 'U1', tip: 'a1', mergedIn: [] },
    { key: 'U2', tip: 'b2', mergedIn: [] },
  ]);
  assert.deepEqual(all.order, ['U3']);
  assert.deepEqual(all.through, { U1: 'U3', U2: 'U3' });
});

// ---------------------------------------------------------------- C5, C6: disk and paths

test('pathBudget counts the worktree path and the deepest build path against 260', () => {
  assert.equal(C.pathBudget({ worktree: 'C:/cw/abc/w1-1', longestTracked: 80 }).ok, true);
  const long = C.pathBudget({ worktree: 'C:/x'.padEnd(121, 'x'), longestTracked: 60, buildDepth: 140 });
  assert.equal(long.ok, false);
  assert.equal(long.total, 121 + 1 + 140);
});

test('diskNeedGb uses the largest earlier unit for every unit still to start', () => {
  assert.deepEqual(C.diskNeedGb({ history: [], toStart: 2, minFreeGb: 20 }), { needGb: 20, from: 'min-free-gb' });
  assert.deepEqual(C.diskNeedGb({ history: [{ gb: 6 }, { gb: 9.5 }], toStart: 2, minFreeGb: 20 }), { needGb: 39, perUnitGb: 9.5, from: 'history' });
});

test('shortStamp is short and keeps two runs apart', () => {
  const a = C.shortStamp('20261006T101811Z-brainstorm-realism');
  const b = C.shortStamp('20261006T101812Z-brainstorm-realism');
  assert.ok(a.length <= 7);
  assert.notEqual(a, b);
  assert.equal(C.shortStamp('odd-run'), 'odd');
});

test('isolationOf reads the new fields and refuses a relative root', () => {
  const iso = C.isolationOf({ campaign: { isolation: { 'port-env': {}, 'build-dirs': ['target'], 'quiet-suites': ['cargo run -- timed'], 'outside-root': 'C:/co', 'worktree-root': 'rel/cw', 'build-depth': 100 } } });
  assert.deepEqual(iso['quiet-suites'], ['cargo run -- timed']);
  assert.equal(iso['outside-root'], 'C:/co');
  assert.equal(iso['worktree-root'], null);
  assert.equal(iso['build-depth'], 100);
  const text = C.isolationText(iso, { index: 0, worktree: 'C:/cw/a/w1-1', lockCmd: 'LOCK', slug: 's', outside: 'C:/co/a/w1-1' });
  assert.match(text, /Outside folder: `C:\/co\/a\/w1-1`/);
  assert.match(text, /LOCK quiet acquire s/);
  assert.match(text, /worktree's `\.scratch\/` folder/);
});

// ---------------------------------------------------------------- C8, C3, C9

test('pluginUpdate reports only a newer installed version', () => {
  assert.deepEqual(C.pluginUpdate('9.183.0', '9.184.0'), { running: '9.183.0', installed: '9.184.0' });
  assert.equal(C.pluginUpdate('9.184.0', '9.184.0'), null);
  assert.equal(C.pluginUpdate('9.184.0', '9.183.0'), null);
  assert.equal(C.pluginUpdate(null, '9.184.0'), null);
});

test('buildRecap lists the intent-bearing decisions first, then the units since the away started', () => {
  const ledger = {
    units: { A: { slug: 'a', state: 'running', waits: [{ from: 'B', through: 's1', state: 'open' }] }, B: { slug: 'b', state: 'planned' } },
    decided: [{ id: 'd1', at: '2026-10-10T01:00:00Z', answer: 'x' }, { id: 'd2', at: '2026-10-10T02:00:00Z', answer: 'y', 'intent-bearing': true }, { id: 'd0', at: '2026-10-09T01:00:00Z' }],
    questions: [{ id: 'q1', text: 'open' }, { id: 'q2', 'answered-at': 'x' }],
    forecast: { minutes: 300 },
  };
  const journals = { A: [
    { at: '2026-10-09T23:00:00Z', event: 'agent-end', agent: 'plan:s0' },
    { at: '2026-10-10T01:30:00Z', event: 'agent-end', agent: 'plan:s1', status: 'complete' },
    { at: '2026-10-10T01:31:00Z', event: 'agent-start', agent: 'implement:s1' },
  ] };
  const r = C.buildRecap({ ledger, since: '2026-10-10T00:00:00Z', journals, campaign: [{ at: '2026-10-10T03:00:00Z', event: 'merge-in', key: 'A' }], now: '2026-10-10T08:00:00Z' });
  assert.deepEqual(r.decided.map((d) => d.id), ['d2', 'd1']);
  assert.deepEqual(r.units.map((u) => u.key), ['A']);
  assert.deepEqual(r.units[0].stagesEnded.map((s) => s.agent), ['plan:s1']);
  assert.deepEqual(r.units[0].now, { agent: 'implement:s1', event: 'agent-start', at: '2026-10-10T01:31:00Z' });
  assert.deepEqual(r.units[0].openWaits, ['B through s1']);
  assert.deepEqual(r.questions.map((q) => q.id), ['q1']);
  assert.equal(r.elapsedMinutes, 480);
  assert.equal(r.events[0].event, 'merge-in');
});

test('ledger.md shows the standing rules first, the presence, and the open waits', () => {
  const ledger = C.newLedger({ brainstorm: 'b', revision: 1, units: unitsOf(packet('A'), packet('B', { needs: [{ from: 'A' }] })), now: '2026-10-10T00:00:00Z' });
  ledger.rules = [{ id: 'R1', text: 'do not push without me', by: 'the person', at: '2026-10-10T00:00:00Z' }];
  ledger.presence = { state: 'away', since: '2026-10-10T22:00:00Z', words: 'keep going' };
  ledger.units.B.waits = [{ from: 'A', through: 'finished', state: 'open' }];
  const md = C.renderLedgerMd(ledger);
  assert.ok(md.indexOf('## Standing rules') < md.indexOf('## Setup'));
  assert.match(md, /\*\*R1\*\* — do not push without me/);
  assert.match(md, /The person is away since 2026-10-10T22:00:00Z/);
  assert.match(md, /waits for A through `finished`/);
});
