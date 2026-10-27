// WF-OPTIMIZE-PLAN W1 — lib/optimize.mjs: the spec, the keep rule, the path check, the
// branch rounds on a fixed schedule (D12), the plateau as a round trigger (D14), the
// winner, and the two proposer digests (D13). Source of the rounds: arXiv 2610.07447.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDigest, defaultBranchTrials, digestTrials, globToRegExp, holdoutRegressed, keepDecision, mergeCandidates, newState, nextAction, noiseOf,
  parseDuration, parseMetricLine, parseSpec, pathViolations, pickWinner,
  claimIdea, emptyIdeas, ideaStatusOf, parseProfile, profileLines, profileView, settleIdea, noiseFor, pairOrder, pairedActive, pairedDecision,
  bundleOf, pruneCandidate, seedsOf,
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
  assert.equal(s.budget.proposeTimeMs, 900000, 'a proposer has 15 minutes');
  assert.equal(buildDigest({ spec: s, specProse: '', state: stateOf(), results: [], lane: 'trunk' }).proposeMinutes, 15);
  assert.ok(parseSpec(fm({ budget: { 'propose-time': 'soon' } })).errors.some((e) => /propose-time/.test(e)));
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

test('the spec carries an optional format command', () => {
  assert.equal(specOf().format, null);
  assert.equal(specOf({ format: 'cargo fmt --all' }).format, 'cargo fmt --all');
});

test('the spec names the variable of a shared build folder', () => {
  assert.equal(specOf().sharedBuild, null);
  assert.equal(specOf({ 'shared-build': 'CARGO_TARGET_DIR' }).sharedBuild, 'CARGO_TARGET_DIR');
  assert.ok(parseSpec(fm({ 'shared-build': 'not a name' })).errors.some((e) => /shared-build/.test(e)));
});

test('a round whose branches have their own worktrees names every branch that can take a trial', () => {
  const spec = specOf();
  const branch = (k, trials, worktree) => ({ k, name: `b${k}`, ...(worktree ? { worktree: `/wt--r1b${k}` } : {}), best: { commit: 'c0', value: 100 }, trials, keeps: 0 });
  const s = stateOf({ schedule: { used: [0] } });
  const v2 = nextAction({ state: { ...s, round: { n: 1, branchTrials: 3, branches: [branch(1, 3, true), branch(2, 1, true), branch(3, 0, true)] } }, spec });
  assert.deepEqual([v2.next.on, v2.next.ready], ['b3', ['b2', 'b3']], 'a branch with all its trials is not ready');
  const v1 = nextAction({ state: { ...s, round: { n: 1, branchTrials: 3, branches: [branch(1, 0), branch(2, 0)] } }, spec });
  assert.equal(v1.next.ready, undefined, 'a round of an older version takes its trials in turn');
  const d = buildDigest({ spec, specProse: '', state: { ...s, round: { n: 1, branches: [branch(1, 0, true)] } }, results: [], lane: 'b1' });
  assert.equal(d.worktree, '/wt--r1b1');
  assert.equal(buildDigest({ spec, specProse: '', state: s, results: [], lane: 'trunk' }).worktree, '/wt');
});

test('the merge step: the candidates, the order of its actions, and a budget that ends it', () => {
  assert.equal(specOf().rounds.merge, 'consider');
  assert.equal(specOf({ 'branch-rounds': { merge: 'off' } }).rounds.merge, 'off');
  assert.ok(parseSpec(fm({ 'branch-rounds': { merge: 'always' } })).errors.some((e) => /branch-rounds\.merge/.test(e)));
  const spec = specOf();
  const b = (k, value, keeps) => ({ k, name: `b${k}`, best: { commit: `c${k}`, value }, keeps });
  const round = { branches: [b(1, 80, 1), b(2, 99, 1), b(3, 90, 1), b(4, 90, 0)] };
  assert.deepEqual(mergeCandidates(round, round.branches[0], spec, 100, 0).map((x) => x.name), ['b3'], 'a gain of 1% is under the threshold, and a branch with no keep is no candidate');
  assert.deepEqual(mergeCandidates(round, null, spec, 100, 0), [], 'no winner, no merge');
  assert.deepEqual(mergeCandidates(round, round.branches[0], specOf({ 'branch-rounds': { merge: 'off' } }), 100, 0), []);

  const s = stateOf({ schedule: { used: [0] } });
  const cand = (name, extra = {}) => ({ name, k: Number(name.slice(1)), ...extra });
  const merge = (over) => ({ round: 1, considered: false, order: [], candidates: [cand('b2'), cand('b3', { conflict: true, decision: 'skip', verdict: 'skipped' })], ...over });
  assert.equal(nextAction({ state: { ...s, merge: merge() }, spec }).next.action, 'merge-consider');
  const two = merge({ considered: true, order: ['b2'], candidates: [cand('b2', { decision: 'try' })] });
  assert.deepEqual([nextAction({ state: { ...s, merge: two }, spec }).next.action, nextAction({ state: { ...s, merge: two }, spec }).next.branch], ['merge-trial', 'b2']);
  two.candidates[0].verdict = 'kept';
  assert.equal(nextAction({ state: { ...s, merge: two }, spec }).next.action, 'merge-close');
  const late = nextAction({ state: { ...s, merge: merge(), counters: { ...s.counters, trials: 60 } }, spec });
  assert.deepEqual([late.next.action, /budget/.test(late.next.why)], ['merge-close', true], 'the budget skips the candidates that are left');
});

test('the trunk digest holds the kept trials of a merged branch', () => {
  const results = [
    { event: 'trial', trial: 1, round: 1, branch: 'b1', hypothesis: { text: 'w' }, verdict: 'kept' },
    { event: 'trial', trial: 2, round: 1, branch: 'b2', hypothesis: { text: 'm' }, verdict: 'kept' },
    { event: 'trial', trial: 3, round: 1, branch: 'b2', hypothesis: { text: 'x' }, verdict: 'reverted' },
    { event: 'trial', trial: 4, round: null, branch: null, merge: { round: 1, branch: 'b2' }, hypothesis: { text: 'merge of b2' }, verdict: 'kept' },
  ];
  const s = stateOf({ digestFrom: { trial: 3, round: 1, branch: 'b1', merged: ['b2'] } });
  assert.deepEqual(digestTrials(results, s, 'trunk').map((t) => t.trial), [1, 2, 4]);
});

test('D7: the holdout regresses past its tolerance', () => {
  const spec = specOf({ holdout: { command: 'h', tolerance: '1%' } });
  assert.equal(holdoutRegressed(spec, 100, 100.5), false);
  assert.equal(holdoutRegressed(spec, 100, 102), true);
  assert.equal(holdoutRegressed(spec, 100, 90), false, 'lower is better: 90 is a gain');
});

test('G2: a claim of an idea refuses a target that another lane claims, and a tried target without a new reason', () => {
  const book = emptyIdeas();
  const a = claimIdea(book, { lane: 'b1', target: 'Team::back_line', family: 'stack arrays' });
  assert.equal(a.ok, true);
  assert.equal(a.idea.id, 'i1');
  const busy = claimIdea(book, { lane: 'b2', target: 'team::back_line ', family: 'bitmask' });
  assert.equal(busy.ok, false, 'the target is matched without case');
  assert.match(busy.reason, /b1 has a claim on this target in flight/);
  assert.equal(claimIdea(book, { lane: 'b1', target: 'Team::back_line' }).idea.id, 'i1', 'the same lane gets its own claim back');
  assert.equal(claimIdea(book, { lane: 'b1', target: 'sim::central_distance' }).idea.id, 'i2');
  assert.deepEqual(book.ideas.map((i) => i.id), ['i2'], 'a new claim of a lane releases its older claim with no trial');

  settleIdea(book, 'i2', { trial: 6, verdict: 'reverted', gain: 0.044, patch: true });
  assert.deepEqual([book.ideas[0].status, book.ideas[0].claim, book.ideas[0].patches], ['marginal', null, [6]]);
  const tried = claimIdea(book, { lane: 'b3', target: 'sim::central_distance' });
  assert.equal(tried.ok, false);
  assert.match(tried.reason, /was tried \(i2: marginal, pooled gain 0\.044 over 1\)/);
  const again = claimIdea(book, { lane: 'b3', target: 'sim::central_distance', again: 'memoize deeper levels too' });
  assert.equal(again.ok, true);
  assert.deepEqual(again.idea.again, [{ lane: 'b3', reason: 'memoize deeper levels too' }]);
  settleIdea(book, 'i2', { trial: 7, verdict: 'kept', gain: 0.1 });
  settleIdea(book, 'i2', { trial: 9, verdict: 'reverted', gain: 0.05 });
  assert.equal(book.ideas[0].status, 'kept', 'a kept idea stays kept');
  assert.deepEqual(book.ideas[0].pooled, { mean: 0.0646667, n: 3 }, 'the gains are pooled');
  assert.equal(ideaStatusOf('reverted', -0.02), 'failed');
  assert.equal(ideaStatusOf('rejected', null), 'failed');
  assert.equal(claimIdea(book, { lane: 'b1', target: '' }).ok, false, 'a claim needs a target');
});

test('G1: the profile comes before the first trial and before each round, and the digest marks an entry that cannot pass alone', () => {
  const spec = specOf({ profile: 'agent' });
  const s = stateOf();
  assert.equal(nextAction({ state: s, spec }).next.action, 'profile', 'the first profile comes before the 0% round');
  s.profile = { commit: 'c0' };
  assert.equal(nextAction({ state: s, spec }).next.action, 'round-open');
  const later = { ...s, schedule: { used: [0] }, counters: { ...s.counters, trials: 20 }, best: { commit: 'c9', value: 90, trial: 19 } };
  const p = nextAction({ state: later, spec });
  assert.equal(p.next.action, 'profile', 'the trunk best moved: a new profile before the round');
  assert.match(p.next.why, /before the round/);
  assert.equal(nextAction({ state: { ...later, profile: { commit: 'c9' } }, spec }).next.action, 'round-open');
  assert.equal(nextAction({ state: stateOf(), spec: specOf() }).next.action, 'round-open', 'a spec without a profile has no profile step');

  const { entries, errors } = parseProfile([{ name: 'decide', share: 0.32 }, { name: 'place_threat', share: 0.002, calls: 0.48 }, { name: 'bad', share: 2 }]);
  assert.equal(errors.length, 1);
  assert.deepEqual(entries.map((e) => e.name), ['decide', 'place_threat']);
  assert.deepEqual(profileLines('noise\n{"name":"a","share":0.5}\n{broken\n'), [{ name: 'a', share: 0.5 }]);
  const view = profileView(entries, 2.5, 0.0885);
  assert.deepEqual(view.map((e) => [e.maxGain, e.alone]), [[0.8, true], [0.005, false]]);

  const book = emptyIdeas();
  claimIdea(book, { lane: 'optimize/s--r1b1', target: 'decide' });
  const d = buildDigest({ spec, specProse: '', state: { ...stateOf(), profile: { commit: 'c0' } }, results: [], lane: 'trunk', ideas: book, profile: { entries } });
  assert.deepEqual(d.ideas.map((i) => [i.id, i.claim]), [['i1', 'optimize/s--r1b1']], 'every lane sees the ideas of every lane');
  assert.equal(d.profile[1].alone, false);
});

test('G3: the paired rule keeps a small gain that repeats, and refuses a block in which two pairs lose', () => {
  const spec = specOf({ metric: { command: 'm', direction: 'lower', repeat: 5, 'min-gain': '1%', paired: true } });
  assert.equal(spec.metric.paired, true);
  const noise = 0.4;
  const small = [1.9, 2.1, 2.0, 1.8, 2.2];
  const first = pairedDecision({ spec, best: 100, noise, gains: small });
  assert.deepEqual([first.wins, first.needConfirm, first.threshold], [true, true, 1], 'a 2% gain over a paired noise of 0.4 wins, then needs its confirm block');
  assert.equal(pairedDecision({ spec, best: 100, noise, gains: small, confirm: small }).kept, true);
  assert.equal(pairedDecision({ spec, best: 100, noise, gains: [3, 3, 3, -1, -1] }).wins, false, 'two pairs that lose refuse the block');
  assert.equal(pairedDecision({ spec, best: 100, noise, gains: [3, 3, 3, 3, -1] }).wins, true, 'one pair may lose');
  assert.deepEqual([0, 1, 2].map(pairOrder), [['A', 'B'], ['B', 'A'], ['A', 'B']]);
  const s = stateOf();
  assert.equal(pairedActive(spec, s), false, 'paired measurement waits for the paired noise of the baseline');
  s.baseline.pairedNoise = 0.4;
  assert.equal(pairedActive(spec, s), true);
  assert.equal(noiseFor(spec, s), 0.4);
  assert.equal(buildDigest({ spec, specProse: '', state: s, results: [], lane: 'trunk' }).threshold, 1, 'the digest threshold uses the paired noise');
  assert.equal(specOf().metric.paired, false, 'an old spec keeps the unpaired rule');
});

test('G4: a bundle joins marginal ideas with a kept diff and other targets, once; a port is a trunk trial of the merge step', () => {
  const book = emptyIdeas();
  for (const [t, g] of [['a', 0.04], ['b', 0.05], ['a', 0.03], ['c', 0.01]]) {
    const c = claimIdea(book, { lane: 'trunk', target: t, again: 'x' });
    settleIdea(book, c.idea.id, { trial: book.next, verdict: 'reverted', gain: g, patch: true });
  }
  const b = bundleOf(book, 0.0885);
  assert.deepEqual(b.ids, ['i2', 'i1', 'i3'], 'the largest pooled gains first, one idea for each target');
  assert.equal(b.sum, 0.095);
  assert.equal(bundleOf(book, 0.0885, [b.key]), null, 'a bundle that was tried is not tried again');
  assert.equal(bundleOf(book, 1), null, 'gains that cannot pass make no bundle');

  const spec = specOf({ budget: { plateau: 4 } });
  const s = { ...newState({ slug: 's', worktree: '/wt', baseCommit: 'c0', values: [2.5, 2.5, 2.5], startedAt: new Date().toISOString() }), schedule: { used: [0, 1, 2] }, counters: { trials: 5, trunkTrials: 5, streak: 2, sinceCheckpoint: 0, keeps: 0 } };
  const next = nextAction({ state: s, spec, ideas: book });
  assert.equal(next.next.action, 'trial');
  assert.deepEqual(next.next.bundle, ['i2', 'i1']);
  assert.match(next.next.why, /^bundle/);
  assert.equal(nextAction({ state: { ...s, counters: { ...s.counters, streak: 1 } }, spec, ideas: book }).next.bundle, undefined, 'a bundle waits for half a plateau');

  const merge = { round: 1, considered: true, order: ['t3'], candidates: [{ kind: 'port', name: 't3', trial: 3, branch: 'b2' }] };
  const port = nextAction({ state: { ...stateOf(), merge, schedule: { used: [0] } }, spec });
  assert.deepEqual([port.next.action, port.next.on, port.next.port], ['trial', 'optimize/s', 't3']);
});

test('G5: the seeds of a round, and a branch that trails the leader with no keep is pruned', () => {
  const entries = [{ name: 'decide', share: 0.3 }, { name: 'steer', share: 0.2 }, { name: 'threat', share: 0.001 }];
  const book = emptyIdeas();
  const c = claimIdea(book, { lane: 'trunk', target: 'steer' });
  settleIdea(book, c.idea.id, { trial: 1, verdict: 'reverted', gain: -0.1 });
  assert.deepEqual(seedsOf(entries, book, 2.5, 0.0885, 3), ['decide', 'decide', 'decide'], 'no seed on a failed target, nor on an entry that cannot pass alone');
  assert.deepEqual(seedsOf(entries, emptyIdeas(), 2.5, 0.0885, 3), ['decide', 'steer', 'decide']);
  assert.deepEqual(seedsOf(null, book, 2.5, 0.1, 2), [null, null]);

  const spec = specOf({ 'branch-rounds': { 'branch-trials': 4 } });
  const br = (k, value, trials, keeps) => ({ k, name: `b${k}`, worktree: `/w${k}`, best: { commit: `c${k}`, value, reachedAt: trials }, trials, keeps });
  const round = { n: 1, branchTrials: 4, branches: [br(1, 90, 2, 1), br(2, 100, 2, 0), br(3, 100, 1, 0), br(4, 89.99, 2, 1)] };
  const s = stateOf({ round, schedule: { used: [0] } });
  const p = nextAction({ state: s, spec });
  assert.deepEqual([p.next.action, p.next.branch], ['prune', 'b2']);
  assert.equal(pruneCandidate(round, specOf({ 'branch-rounds': { prune: 'off' } }), 0), null, 'prune: off');
  round.branches[1].pruned = true;
  round.branches[1].worktree = null;
  round.branches.push({ ...br(5, 89.99, 0, 0), limit: 2 });
  const t = nextAction({ state: s, spec });
  assert.deepEqual([t.next.action, t.next.on], ['trial', 'b5'], 'the new fork takes the trials that the pruned branch left');
  assert.ok(t.next.ready.includes('b5') && !t.next.ready.includes('b2'));
  assert.equal(buildDigest({ spec, specProse: '', state: { ...s, round: { ...round, branches: round.branches.map((b) => (b.k === 5 ? { ...b, seed: 'decide' } : b)) } }, results: [], lane: 'b5' }).seed, 'decide');
});
