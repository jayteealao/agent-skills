// WF-OPTIMIZE-PLAN W1 — lib/optimize.mjs: the spec, the keep rule, the path check, the
// branch rounds on a fixed schedule (D12), the plateau as a round trigger (D14), the
// winner, and the two proposer digests (D13). Source of the rounds: arXiv 2610.07447.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDigest, defaultBranchTrials, digestTrials, globToRegExp, holdoutRegressed, keepDecision, newState, nextAction, noiseOf,
  parseDuration, parseMetricLine, parseSpec, pathViolations, pickWinner,
} from '../../../lib/optimize.mjs';

const fm = (over = {}) => ({
  objective: 'cut the time', 'confirmed-by': 'jayte',
  metric: { command: 'node m.js', direction: 'lower', repeat: 3, 'min-gain': '2%' },
  guard: { command: 'npm test' }, 'allowed-paths': ['src/**'], ...over,
});
const specOf = (over) => { const { spec, errors } = parseSpec(fm(over)); assert.deepEqual(errors, []); return spec; };
const stateOf = (over = {}) => ({ ...newState({ slug: 's', worktree: '/wt', baseCommit: 'c0', values: [100, 100, 100], startedAt: new Date().toISOString() }), ...over });

test('the spec defaults follow D12: 60 trials, 4 branches, rounds at 0, 33 and 66 percent, 3 branch trials', () => {
  const s = specOf();
  assert.equal(s.budget.trials, 60);
  assert.deepEqual(s.rounds.at, [0, 0.33, 0.66]);
  assert.equal(s.rounds.branches, 4);
  assert.equal(s.rounds.branchTrials, 3);
  assert.equal(defaultBranchTrials(200), 12);
  assert.equal(parseDuration('10m'), 600000);
  const bad = parseSpec(fm({ guard: {}, 'allowed-paths': [] })).errors;
  assert.ok(bad.some((e) => /guard/.test(e)) && bad.some((e) => /allowed-paths/.test(e)));
});

test('the metric line is the last stdout line: one number, or JSON with the key', () => {
  assert.equal(parseMetricLine('noise\n12.5\n'), 12.5);
  assert.equal(parseMetricLine('{"a":{"b":3}}', 'a.b'), 3);
  assert.equal(parseMetricLine('done'), null);
  assert.equal(noiseOf([10, 12, 11]), 1);
});

test('D6: a gain must pass max(min-gain, 2 x noise), and the confirm run must agree', () => {
  const spec = specOf();
  assert.equal(keepDecision({ spec, best: 100, noise: 0, first: 99 }).wins, false, '1% is under the 2% min-gain');
  assert.equal(keepDecision({ spec, best: 100, noise: 3, first: 95 }).wins, false, '5 is under 2 x noise = 6');
  const w = keepDecision({ spec, best: 100, noise: 0, first: 90 });
  assert.equal(w.needConfirm, true);
  assert.equal(keepDecision({ spec, best: 100, noise: 0, first: 90, confirm: 99.5 }).kept, false);
  assert.equal(keepDecision({ spec, best: 100, noise: 0, first: 90, confirm: 91 }).kept, true);
});

test('D5: the path check rejects off-limits paths and paths outside allowed-paths', () => {
  const spec = specOf({ 'off-limits': ['src/bench/**'] });
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(globToRegExp('src').test('src/x.js'));
  assert.deepEqual(pathViolations(['src/a.js'], spec), []);
  assert.deepEqual(pathViolations(['lib/a.js', 'src/bench/x.js', '.ai/workflows/s/x.md'], spec, []).map((v) => v.reason), ['outside allowed-paths', 'off-limits', 'off-limits']);
  assert.deepEqual(pathViolations(['src/m.js'], spec, ['src/m.js']).map((v) => v.reason), ['off-limits']);
});

test('D12: the 0% round opens from the baseline, then the branches take trials in turn', () => {
  const spec = specOf();
  const s = stateOf();
  const open = nextAction({ state: s, spec });
  assert.deepEqual([open.next.action, open.next.point], ['round-open', 0]);
  const round = { n: 1, reason: 'schedule', branchTrials: 3, branches: [1, 2, 3, 4].map((k) => ({ k, name: `b${k}`, best: { commit: 'c0', value: 100 }, trials: k === 1 ? 1 : 0, keeps: 0 })) };
  const next = nextAction({ state: { ...s, round, schedule: { used: [0] } }, spec });
  assert.deepEqual([next.next.action, next.next.on], ['trial', 'b2']);
  round.branches.forEach((b) => { b.trials = 3; });
  assert.equal(nextAction({ state: { ...s, round, schedule: { used: [0] } }, spec }).next.action, 'round-close');
});

test('D12: the 33% round opens when 20 of 60 trials are used', () => {
  const spec = specOf();
  const s = stateOf({ schedule: { used: [0] }, counters: { trials: 19, trunkTrials: 7, streak: 0, sinceCheckpoint: 0, keeps: 0 } });
  assert.equal(nextAction({ state: s, spec }).next.action, 'trial');
  s.counters.trials = 20;
  assert.deepEqual([nextAction({ state: s, spec }).next.action, nextAction({ state: s, spec }).next.point], ['round-open', 1]);
});

test('D14: a plateau opens the next round early, then extra rounds, then stops', () => {
  const spec = specOf();
  const s = stateOf({ schedule: { used: [0] }, counters: { trials: 14, trunkTrials: 8, streak: 8, sinceCheckpoint: 0, keeps: 0 } });
  const early = nextAction({ state: s, spec });
  assert.deepEqual([early.next.action, early.next.point], ['round-open', 1]);
  s.schedule.used = [0, 1, 2];
  assert.equal(nextAction({ state: s, spec }).next.point, 'extra');
  s.extraRounds = 2;
  const stop = nextAction({ state: s, spec });
  assert.deepEqual([stop.state, stop.reason], ['stopped', 'plateau']);
});

test('the budget, the target and the control file stop the loop', () => {
  const spec = specOf({ metric: { command: 'm', direction: 'lower', repeat: 1, target: 50 } });
  const s = stateOf({ schedule: { used: [0, 1, 2] } });
  assert.equal(nextAction({ state: { ...s, best: { commit: 'c', value: 49, trial: 3 } }, spec }).state, 'complete');
  assert.equal(nextAction({ state: { ...s, counters: { ...s.counters, trials: 60 } }, spec }).reason, 'budget');
  assert.equal(nextAction({ state: s, spec, control: { action: 'stop' } }).reason, 'stop-request');
  assert.equal(nextAction({ state: s, spec, control: { action: 'pause', until: '2999-01-01T00:00:00Z' } }).state, 'running', 'there is no pause');
  const old = stateOf({ schedule: { used: [0, 1, 2] }, startedAt: '2000-01-01T00:00:00Z' });
  assert.equal(nextAction({ state: old, spec }).reason, 'budget');
});

test('the winner is the best kept branch; a branch with no keep cannot win; the earlier one wins a tie', () => {
  const b = (k, value, keeps, reachedAt = 0) => ({ k, name: `b${k}`, best: { value, reachedAt }, keeps });
  assert.equal(pickWinner({ branches: [b(1, 100, 0), b(2, 100, 0)] }, 'lower'), null);
  assert.equal(pickWinner({ branches: [b(1, 90, 1), b(2, 80, 1), b(3, 70, 0)] }, 'lower').k, 2);
  assert.equal(pickWinner({ branches: [b(1, 80, 1, 9), b(2, 80, 1, 4)] }, 'lower').k, 2);
  assert.equal(pickWinner({ branches: [b(1, 80, 1), b(2, 90, 1)] }, 'higher').k, 2);
});

test('D13: a branch reads a flushed digest; the trunk restarts from the winner of the last round', () => {
  const spec = specOf();
  const results = [
    { event: 'trial', trial: 1, round: null, branch: null, hypothesis: { text: 'trunk idea' }, verdict: 'reverted' },
    { event: 'trial', trial: 2, round: 1, branch: 'b1', hypothesis: { text: 'b1 idea' }, verdict: 'kept' },
    { event: 'trial', trial: 3, round: 1, branch: 'b2', hypothesis: { text: 'b2 idea' }, verdict: 'reverted' },
    { event: 'trial', trial: 4, round: null, branch: null, hypothesis: { text: 'after' }, verdict: 'reverted' },
  ];
  const s = stateOf({ round: { n: 1, branches: [{ k: 1, name: 'b1', best: { commit: 'x', value: 90 } }, { k: 2, name: 'b2', best: { commit: 'c0', value: 100 } }] } });
  const d = buildDigest({ spec, specProse: 'prose', state: s, results, lane: 'b2', solutions: [{ path: 'p' }] });
  assert.equal(d.flushed, true);
  assert.deepEqual(d.trials.map((t) => t.trial), [3]);
  assert.deepEqual(d.solutions, [], 'no memory from other runs in a branch');
  assert.equal(d.best.value, 100);
  const after = stateOf({ digestFrom: { trial: 3, round: 1, branch: 'b1' } });
  assert.deepEqual(digestTrials(results, after, 'trunk').map((t) => t.trial), [2, 4], 'the trunk history before the fork is flushed');
  const t = buildDigest({ spec, specProse: 'prose', state: after, results, lane: 'trunk', solutions: [{ path: 'p' }] });
  assert.equal(t.flushed, false);
  assert.equal(t.solutions.length, 1);
  assert.equal(JSON.stringify(t).includes('different approach'), false, 'no diversity directive');
});

test('D7: the holdout regresses past its tolerance', () => {
  const spec = specOf({ holdout: { command: 'h', tolerance: '1%' } });
  assert.equal(holdoutRegressed(spec, 100, 100.5), false);
  assert.equal(holdoutRegressed(spec, 100, 102), true);
  assert.equal(holdoutRegressed(spec, 100, 90), false, 'lower is better: 90 is a gain');
});
