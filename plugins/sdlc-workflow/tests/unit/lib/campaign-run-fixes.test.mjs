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
  assert.deepEqual(C.waveWaits(us, ['A', 'B', 'C']), { C: [{ from: 'A', through: 's2', before: 'p1', why: 'the sink', source: 'packet', state: 'open' }] });
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

test('D25: a live wave run gives driving, also with a ready wait; an open question gives ask with driving', () => {
  const ledger = {
    waves: [{ n: 1, state: 'running', units: ['A', 'C'], run: { id: 'r1', at: '2026-10-16T10:00:00Z' } }],
    units: {
      A: { state: 'running', wave: 1 },
      C: { state: 'running', wave: 1, waits: [{ from: 'A', through: 's2', state: 'ready', sha: 'abc' }] },
    },
    answers: Object.fromEntries(C.SETUP_ANSWERS.map((k) => [k, 'x'])), questions: [], outside: {},
  };
  const driving = { wave: 1, run: 'r1', newestAt: '2026-10-16T10:05:00Z' };
  const act = C.campaignAction(ledger, { driving });
  assert.equal(act.action, 'driving');
  assert.equal(act.run, 'r1');
  ledger.questions.push({ id: 'w1-A-1', wave: 1, unit: 'A', text: 'which?', 'asked-at': '2026-10-16T10:06:00Z' });
  const ask = C.campaignAction(ledger, { driving });
  assert.equal(ask.action, 'ask');
  assert.deepEqual(ask.driving, driving);
});

test('D25: runLive follows the newest line of the run, and the 20-minute silence limit', () => {
  const run = { id: 'r1', at: '2026-10-16T10:00:00Z' };
  const lines = [{ at: '2026-10-16T10:30:00Z', campaignRun: 'r1' }, { at: '2026-10-16T11:00:00Z', run: 'other' }, { at: '2026-10-16T10:40:00Z', event: 'waiter', run: 'r1' }];
  assert.equal(C.runLive(run, lines, Date.parse('2026-10-16T10:45:00Z')).live, true);
  assert.equal(C.runLive(run, lines, Date.parse('2026-10-16T10:45:00Z')).newestAt, '2026-10-16T10:40:00Z');
  assert.equal(C.runLive(run, lines, Date.parse('2026-10-16T11:05:00Z')).live, false);
  assert.equal(C.runLive(null, lines).live, false);
});

test('D21: clearedCover gives the newest cleared slice that covers the wait', () => {
  const cleared = [{ slice: 's1', sha: 'a1' }, { slice: 's2', sha: 'b2' }];
  assert.equal(C.clearedCover(cleared, 's1', ['s1', 's2']).sha, 'b2');
  assert.equal(C.clearedCover([{ slice: 's1', sha: 'a1' }], 's2', ['s1', 's2']), null);
  assert.equal(C.clearedCover([{ slice: 'finished', sha: 'f' }], 's2', ['s1', 's2']).sha, 'f');
});

test('5.7: sliceCycle finds a cycle at slice level, and none for a chain', () => {
  const rosters = { A: ['a1', 'a2'], B: ['b1', 'b2'] };
  assert.equal(C.sliceCycle(rosters, [{ key: 'B', from: 'A', through: 'a1', before: 'b2' }]), null);
  const cyc = C.sliceCycle(rosters, [{ key: 'B', from: 'A', through: 'a2', before: 'b1' }, { key: 'A', from: 'B', through: 'b1', before: 'a2' }]);
  assert.ok(Array.isArray(cyc) && cyc.length >= 3, JSON.stringify(cyc));
});

test('closeWaits closes the waits that a merge covers, and the context file shows them', () => {
  const u = { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open' }, { from: 'A', through: 'finished', before: 'p3', state: 'open' }], 'merged-in': [] };
  const closed = C.closeWaits(u.waits, { from: 'A', through: 's2', order: ['s1', 's2'], at: '2026-10-10T10:00:00Z' });
  assert.equal(closed.length, 1);
  assert.deepEqual(u.waits.map((w) => w.state), ['met', 'open']);
  u['merged-in'].push({ from: 'A', through: 's2', sha: 'abcdef1234', at: '2026-10-10T10:00:00Z' });
  const text = C.waitsText(u);
  assert.match(text, /Merged into this branch: A through `s2` \(abcdef1/);
  assert.match(text, /\*\*Open\*\*: before the slice `p3`, this branch needs A through `finished`/);
  assert.match(text, /Met: before the slice `p1`/);
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

test('repoTag is short, stable, and keeps two repos apart in the shared worktree folder', () => {
  const a = C.repoTag('C:/Users/me/dev/SoccerManager', 'linux');
  assert.equal(a.length, 7);
  assert.equal(C.repoTag('C:/Users/me/dev/SoccerManager', 'linux'), a, 'the same root gives the same tag');
  assert.notEqual(C.repoTag('C:/Users/me/dev/Isometric', 'linux'), a, 'another root gives another tag');
  assert.equal(C.repoTag('C:\\Users\\me\\dev\\SoccerManager\\', 'linux'), a, 'separators and a trailing slash do not count');
  assert.equal(C.repoTag('c:/users/me/dev/soccermanager', 'win32'), C.repoTag('C:/Users/me/dev/SoccerManager', 'win32'), 'Windows ignores case');
  assert.notEqual(C.repoTag('/home/me/App', 'linux'), C.repoTag('/home/me/app', 'linux'), 'other systems keep case');
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

test('D27: the recap lists the driver events with their full fields, leaves out the waiter, and lists each unit\'s questions and waits', () => {
  const ledger = {
    units: { A: { slug: 'a', state: 'stopped', route: 'parked: stage: x', waits: [{ from: 'B', through: 's1', before: 'p2', state: 'ready', source: 'cross-unit' }] }, B: { slug: 'b', state: 'running' } },
    questions: [{ id: 'w1-A-1', unit: 'A', kind: 'stage', text: 'Which?', 'asked-at': '2026-10-16T01:00:00Z' }],
    decided: [],
  };
  const campaign = [
    { at: '2026-10-16T01:00:00Z', event: 'park', key: 'A', kind: 'stage', question: 'w1-A-1', reason: 'hard-stop' },
    { at: '2026-10-16T01:10:00Z', event: 'derived-need', key: 'A', from: 'B', through: 's1', before: 'p2', why: 'src/x.ts', source: 'cross-unit' },
    { at: '2026-10-16T01:20:00Z', event: 'width', from: 3, to: 1, state: 'slow' },
    { at: '2026-10-16T01:30:00Z', event: 'waiter', run: 'r1', wave: 1 },
    { at: '2026-10-16T01:40:00Z', event: 'asked', id: 'w1-A-1' },
  ];
  const r = C.buildRecap({ ledger, since: '2026-10-16T00:00:00Z', campaign, now: '2026-10-16T08:00:00Z' });
  assert.deepEqual(r.driver.map((d) => d.event), ['park', 'derived-need', 'width']);
  assert.equal(r.driver[0].question, 'w1-A-1');
  assert.equal(r.driver[1].why, 'src/x.ts');
  assert.equal(r.driver[2].to, 1);
  assert.deepEqual(r.events.map((e) => e.event), ['asked']);
  const a = r.units.find((u) => u.key === 'A');
  assert.deepEqual(a.questions, [{ id: 'w1-A-1', kind: 'stage', text: 'Which?' }]);
  assert.deepEqual(a.waits, [{ from: 'B', through: 's1', before: 'p2', state: 'ready', source: 'cross-unit' }]);
});

test('5.7: replan drops a derived needs entry once the packet declares it', () => {
  const units = unitsOf(packet('A'), packet('B', { needs: [{ from: 'A', through: 's1', before: 'p2' }] }));
  const ledger = C.newLedger({ brainstorm: 'b', revision: 1, units, now: '2026-10-16T00:00:00Z' });
  ledger.units.B['derived-needs'] = [{ from: 'A', through: 's1', before: 'p2', by: 'driver', source: 'cross-unit' }, { from: 'A', through: 's2', before: 'p3', by: 'driver', source: 'cross-unit' }];
  C.replan(ledger, units, { revision: 2, now: '2026-10-16T01:00:00Z' });
  assert.deepEqual(ledger.units.B['derived-needs'].map((d) => d.through), ['s2']);
});
