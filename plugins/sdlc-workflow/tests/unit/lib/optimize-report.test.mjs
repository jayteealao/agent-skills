// lib/optimize.mjs: the mechanism report of the loop (which search mechanisms produce kept gain),
// the sum across runs, and the exact command of the next action that `status` prints.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MECHANISMS, branchLineage, trunkLineage, mechanismOf, mechanismReport, mechanismTable, nextSteps, reuseText, sumMechanismReports } from '../../../lib/optimize.mjs';

const trial = (n, over) => ({ event: 'trial', trial: n, round: null, branch: null, verdict: 'reverted', delta: 0, ms: 1000, ...over });

/** A ledger with each mechanism. The metric is lower-is-better, from 100. */
function ledger() {
  return [
    { event: 'baseline', median: 100 },
    { event: 'profile', source: 'command', ms: 300 },
    trial(1, { verdict: 'kept', delta: 5 }),
    trial(2, { delta: 1 }),
    { event: 'round-open', round: 1, reason: 'schedule', fromValue: 95, branches: ['b1', 'b2', 'b3'], seeds: { b1: 'parse' } },
    trial(3, { round: 1, branch: 'b1', verdict: 'kept', delta: 3, ms: 500 }),
    trial(4, { round: 1, branch: 'b2', ms: 500 }),
    trial(5, { round: 1, branch: 'b2', ms: 500 }),
    { event: 'prune', round: 1, branch: 'b2', into: 'b4', from: 'b1', trials: 1 },
    trial(6, { round: 1, branch: 'b4', verdict: 'kept', delta: 2, ms: 500 }),
    // A keep of a branch that does not win: the merge of its branch brings it in.
    trial(7, { round: 1, branch: 'b3', verdict: 'kept', delta: 4, ms: 500 }),
    { event: 'round-close', round: 1, winner: { name: 'b4', value: 90 } },
    trial(8, { merge: { round: 1, branch: 'b3' }, verdict: 'kept', delta: 3, ms: 700 }),
    trial(9, { port: { round: 1, trial: 7, branch: 'b3' }, verdict: 'kept', delta: 1, ms: 600 }),
    { event: 'merge-close', round: 1, merged: ['b3'] },
    trial(10, { port: { round: 1, trials: [4, 5], branch: 'b2', kind: 'bundle' }, delta: 0.5, ms: 600 }),
    trial(11, { bundle: ['i1', 'i2'], verdict: 'kept', delta: 2, ms: 800 }),
    trial(12, { verdict: 'kept', delta: 1 }),
    { event: 'checkpoint', ok: false },
    { event: 'resume', reason: 'holdout-regression', dropped: [12] },
    { event: 'profile', source: 'skipped', reason: 'no time' },
    { event: 'ablate', changes: [{ trial: 1, verdict: 'ok' }, { trial: 3, verdict: 'weak' }, { trial: 11, verdict: 'weak' }] },
  ];
}

test('each trial line has one mechanism', () => {
  const ctx = { forks: new Map([['b4', {}]]), seeded: new Set(['b1']) };
  const of = (over) => mechanismOf(trial(1, over), ctx);
  assert.equal(of({}), 'trunk');
  assert.equal(of({ merge: { branch: 'b3' } }), 'merge');
  assert.equal(of({ port: { trial: 7 } }), 'port');
  assert.equal(of({ port: { kind: 'bundle', trials: [4, 5] } }), 'near-misses');
  assert.equal(of({ bundle: ['i1'] }), 'marginal-bundle');
  assert.equal(of({ round: 1, branch: 'b1' }), 'seed');
  assert.equal(of({ round: 1, branch: 'b2' }), 'round');
  assert.equal(of({ round: 1, branch: 'b4' }), 'prune');
});

test('the report attributes each kept change to exactly one mechanism', () => {
  const r = mechanismReport(ledger(), { direction: 'lower', unit: 'ms', best: 79 });
  const m = r.mechanisms;
  const row = (name) => [m[name].trials, m[name].keeps, m[name].gain];
  assert.deepEqual(row('trunk'), [3, 1, 5], 'the keep that resume --revert dropped adds nothing');
  assert.deepEqual(row('seed'), [1, 1, 3], 'the leader keep before the prune comes with the fork that won');
  assert.deepEqual(row('prune'), [1, 1, 2]);
  assert.deepEqual(row('round'), [3, 0, 0], 'the keep of a branch that did not win adds nothing: its merge counts');
  assert.deepEqual(row('merge'), [1, 1, 3]);
  assert.deepEqual(row('port'), [1, 1, 1]);
  assert.deepEqual(row('near-misses'), [1, 0, 0]);
  assert.deepEqual(row('marginal-bundle'), [1, 1, 2]);
  assert.equal(r.trials, 12);
  assert.equal(r.keeps, 6);
  assert.equal(r.keptGain, 16);
  assert.equal(r.finalGain, 21);
  assert.equal(m.trunk.share, 0.3125);
  assert.equal(m.trunk.ms, 3000);
  assert.equal(m.trunk.gainPerHour, 6000, '5 ms of gain in 3 s of measurement');
  assert.deepEqual([m.seed.weak, m['marginal-bundle'].weak, m.trunk.weak], [1, 1, 0]);
  assert.deepEqual(r.idle, ['round', 'near-misses']);
  assert.deepEqual(r.rounds, [{ round: 1, reason: 'schedule', trials: 5, ms: 2500, winner: 'b4', from: 95, to: 90, gain: 5, merged: ['b3'] }]);
  assert.deepEqual(r.prunes, [{ round: 1, branch: 'b2', into: 'b4', from: 'b1', given: 1, used: 1, keeps: 1, won: true, gain: 2 }]);
  assert.deepEqual(r.profile, { runs: 1, skipped: 1, ms: 300 });
  const sum = MECHANISMS.reduce((s, k) => s + m[k].gain, 0);
  assert.equal(sum, r.keptGain, 'the shares add up to the total kept gain');
});

test('the trunk lineage: trunk keeps, the winner with the leader keeps before its fork, merged branches through their merge, and no dropped keep', () => {
  const lines = ledger();
  const { kept, viaMerge } = trunkLineage(lines);
  assert.deepEqual(kept.map((t) => t.trial), [1, 3, 6, 7, 8, 9, 11]);
  assert.deepEqual([...viaMerge].map((t) => t.trial), [7], 'the merge trial is the one change of its branch');
  assert.deepEqual(branchLineage(lines, 1, 'b4').map((t) => t.trial), [3, 6]);
  const late = [...lines.slice(0, 9), trial(13, { round: 1, branch: 'b1', verdict: 'kept', delta: 1 }), ...lines.slice(9)];
  assert.deepEqual(branchLineage(late, 1, 'b4').map((t) => t.trial), [3, 6], 'a leader keep after the fork is not in the fork');
});

test('a round with no value at round-open measures the gain of its winner from its keeps', () => {
  const lines = ledger().map((l) => (l.event === 'round-open' ? { ...l, fromValue: undefined } : l));
  assert.equal(mechanismReport(lines).rounds[0].gain, 5);
});

test('a run with no keeps reports zero gain, no share, and every mechanism that ran as idle', () => {
  const r = mechanismReport([{ event: 'baseline', median: 10 }, trial(1, { delta: -1 }), trial(2, { verdict: 'rejected', ms: undefined })], { unit: 's', best: 10 });
  assert.equal(r.keptGain, 0);
  assert.equal(r.keeps, 0);
  assert.deepEqual([r.mechanisms.trunk.trials, r.mechanisms.trunk.share, r.mechanisms.trunk.ms], [2, null, 1000]);
  assert.deepEqual(r.idle, ['trunk']);
  assert.deepEqual(r.rounds, []);
  assert.equal(r.finalGain, 0);
  assert.match(mechanismTable(r), /\| trunk \| 2 \| 0 \| 0 s \| — \|/);
});

test('--all sums the runs: trials, keeps and gain in one unit, the runs that used and paid, and the mechanisms that never paid', () => {
  const a = mechanismReport(ledger(), { unit: 'ms' });
  const b = mechanismReport([{ event: 'baseline', median: 10 }, trial(1, { verdict: 'kept', delta: 4 }), trial(2, {})], { unit: 'ms' });
  const s = sumMechanismReports([a, b]);
  assert.equal(s.runs, 2);
  assert.deepEqual(s.units, ['ms']);
  assert.deepEqual([s.trials, s.keeps, s.keptGain], [14, 7, 20]);
  assert.deepEqual([s.mechanisms.trunk.runs, s.mechanisms.trunk.paid, s.mechanisms.trunk.trials, s.mechanisms.trunk.gain], [2, 2, 5, 9]);
  assert.equal(s.mechanisms.trunk.share, 0.45);
  assert.deepEqual([s.mechanisms.round.runs, s.mechanisms.round.paid], [1, 0]);
  assert.deepEqual(s.never, ['round', 'near-misses']);
  assert.deepEqual(s.rounds, { count: 1, trials: 5, won: 1 });
  assert.deepEqual(s.prunes, { count: 1, used: 1, won: 1 });
  const mixed = sumMechanismReports([a, { ...b, unit: 's' }]);
  assert.equal(mixed.keptGain, null, 'gains in different units do not add up');
  assert.equal(mixed.mechanisms.trunk.gain, null);
  assert.equal(mixed.mechanisms.trunk.share, Number(((5 / 16 + 1) / 2).toPrecision(6)), 'the mean share of the runs with kept gain');
  assert.deepEqual(sumMechanismReports([]).runs, 0);
});

test('the table lists each mechanism that ran', () => {
  const t = mechanismTable(mechanismReport(ledger(), { unit: 'ms' }));
  assert.match(t, /^\| Mechanism \| Trials \| Keeps \| Kept gain \| Share \| Measured \| Gain per hour \| Weak \|/);
  assert.match(t, /\| trunk \| 3 \| 1 \| 5 ms \| 31\.3% \| 0\.1 min \| 6000 ms \| 0 \|/);
  assert.match(t, /\| near-misses \| 1 \| 0 \| 0 ms \|/);
});

const run = (sub, rest = '') => `node "/s/optimize.mjs" ${sub} "/repo" s${rest ? ` ${rest}` : ''}`;
const GOAL = 'node "/s/goal.mjs" check "/repo" s';

test('next carries the exact command of each bookkeeping action, and the goal check after it', () => {
  for (const action of ['baseline', 'round-open', 'round-close', 'checkpoint', 'merge-close', 'prune', 'ablate']) {
    const s = nextSteps({ next: { action } }, { run });
    assert.equal(s.command, run(action), action);
    assert.equal(s.needs, null);
    assert.equal(s.after, 'run status for the next action');
  }
  const m = nextSteps({ next: { action: 'merge-trial', branch: 'optimize/s--r1b2' } }, { run, goal: GOAL });
  assert.equal(m.command, run('merge-trial', '--branch optimize/s--r1b2'));
  assert.equal(m.after, `run \`${GOAL}\` as the last command, and end the turn`);
  assert.equal(nextSteps({ next: { action: 'profile' }, profile: { mode: 'command' } }, { run }).command, run('profile'));
  const agent = nextSteps({ next: { action: 'profile' }, profile: { mode: 'agent', patch: '/o/profile.patch' } }, { run });
  assert.equal(agent.command, run('profile-record', '--file "<profile.json>"'));
  assert.ok(agent.needs.steps.includes(run('probe-open', '--on trunk')) && agent.needs.steps.some((x) => x.includes('/o/profile.patch')));
  assert.equal(agent.needs.instead, run('profile-record', '--skip "<reason>"'));
});

test('a trial: propose-context, the claim and the trial on the lane; a port or a bundle applies its diffs, with the editor as the fallback', () => {
  const t = nextSteps({ next: { action: 'trial', on: 'optimize/s--r1b2' }, counters: { trials: 6 } }, { run });
  assert.equal(t.command, run('propose-context', '--on optimize/s--r1b2'));
  assert.deepEqual(t.then, [
    run('idea-claim', '--on optimize/s--r1b2 --target "<target>" --family "<family>"'),
    run('trial', 'h7 --on optimize/s--r1b2 --idea <idea> --hypothesis "<hypothesis>" --expected "<expected>"'),
  ]);
  assert.deepEqual(Object.keys(t.needs.fill), ['<target>', '<family>', '<idea>', '<hypothesis>', '<expected>']);
  const p = nextSteps({ next: { action: 'trial', on: 'optimize/s', port: 't2', portOf: { patches: ['/o/2.patch'] } }, counters: { trials: 6 }, worktree: '/wt' }, { run });
  assert.equal(p.command, run('trial', 'h7 --apply'));
  assert.deepEqual([p.fallback.command, p.fallback.needs.read, p.fallback.needs.worktree], [run('trial', 'h7'), ['/o/2.patch'], '/wt']);
  const b = nextSteps({ next: { action: 'trial', on: 'optimize/s', bundle: ['i1', 'i3'], bundleOf: [{ patches: ['/o/4.patch', '/o/5.patch'] }, { patches: ['/o/6.patch'] }] }, counters: { trials: 0 } }, { run });
  assert.deepEqual([b.command, b.fallback.needs.read], [run('trial', 'h1 --apply'), ['/o/5.patch', '/o/6.patch']]);
});

test('merge-consider names each open candidate and what to read; finish adds --stash for a dirty checkout; a stop is the person', () => {
  const merge = { round: 1, from: 'c0', worktree: '/wt', candidates: [
    { name: 'optimize/s--r1b2', k: 2, commit: 'c2', gain: 9, hypotheses: ['cache'], paths: ['a'], shared: [], conflict: false },
    { name: 'optimize/s--r1b3', k: 3, commit: 'c3', gain: 4, hypotheses: ['x'], paths: ['a'], shared: ['a'], conflict: true },
    { kind: 'port', name: 't7', branch: 'b3', gain: 1, hypothesis: 'memo', paths: ['b'], patchFile: '/o/7.patch', targets: ['f'], repeats: ['i2'], conflict: false },
    { kind: 'bundle', name: 'n1', branch: 'b1', gain: 1, hypotheses: ['p', 'q'], paths: ['c'], patchFiles: ['/o/4.patch', '/o/5.patch'], targets: [], repeats: [], conflict: false },
  ] };
  const c = nextSteps({ next: { action: 'merge-consider' }, merge }, { run });
  assert.equal(c.command, run('merge-consider', '--try <names> --skip "<name>:<reason>"'));
  assert.deepEqual(c.needs.candidates.map((x) => [x.name, x.kind, x.read]), [
    ['optimize/s--r1b2', 'branch', ['git -C "/wt" diff c0 c2']], ['t7', 'port', ['/o/7.patch']], ['n1', 'bundle', ['/o/4.patch', '/o/5.patch']],
  ]);
  assert.deepEqual(c.needs.candidates[1].repeats, ['i2']);
  assert.equal(nextSteps({ next: { action: 'finish' } }, { run, dirty: true }).command, run('finish', '--message "<message>" --stash'));
  assert.equal(nextSteps({ next: { action: 'finish' } }, { run }).command, run('finish', '--message "<message>"'));
  for (const action of ['ablate', 'finish']) {
    const b = nextSteps({ next: { action }, finishBlocked: 'the main checkout is on x' }, { run, goal: GOAL });
    assert.deepEqual([b.command, b.needs.what], [null, 'the person acts first: the main checkout is on x'], action);
  }
  const stop = nextSteps({ next: { action: 'person' } }, { run, goal: GOAL });
  assert.equal(stop.command, null);
  assert.match(stop.after, /goal\.mjs" check/);
  assert.match(nextSteps({ next: { action: 'verify' } }, { run, slug: 's' }).after, /\/wf verify s optimize/);
});

test('the hypothesis of a reuse names the trials whose diffs it makes again', () => {
  assert.equal(reuseText({ port: { trial: 7, branch: 'b3', hypothesis: 'memo' } }), 'Port of trial 7 of b3: memo');
  assert.equal(reuseText({ port: { kind: 'bundle', trials: [6, 14], branch: 'b2', hypotheses: ['a', 'b'] } }), 'Near misses t6, t14 of b2, together: a | b');
  assert.equal(reuseText({ bundle: ['i1', 'i3'], bundleOf: [{ hypotheses: ['x', 'y'] }, { target: 'extra', family: 'f', hypotheses: [] }] }), 'Bundle of i1, i3: y | extra: f');
  assert.equal(reuseText(), '');
});
