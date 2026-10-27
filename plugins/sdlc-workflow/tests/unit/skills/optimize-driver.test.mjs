// WF-OPTIMIZE-PLAN W3 — the optimize driver (skills/wf/workflows/optimize.js), run as a
// whole script with a mock `agent` that answers by label. A small fake of optimize.mjs
// decides the next action: an opening branch round of 4 branch trials, the round-close,
// then trunk trials until the target is reached, then finish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'optimize.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', src.replace('export const meta', 'const meta'));
const ARGS = { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 's' };

function fakeLoop({ stopAt = null, trunkTrials = 2, profile = null } = {}) {
  const S = { trials: 0, opened: false, round: null, trunk: 0, profiled: false };
  const next = () => {
    if (profile && !S.profiled) return { action: 'profile', why: 'the first profile' };
    if (!S.opened) return { action: 'round-open', point: 0, why: 'scheduled at 0%' };
    if (S.round && S.round.done < 4) return { action: 'trial', on: `optimize/s--r1b${(S.round.done % 2) + 1}` };
    if (S.round) return { action: 'round-close' };
    if (S.trunk < trunkTrials) return { action: 'trial', on: 'optimize/s' };
    return null;
  };
  const status = () => {
    if (stopAt !== null && S.trials >= stopAt) return { ok: true, state: 'stopped', reason: 'stop-request', detail: 'the person asked', next: { action: 'person' }, counters: { trials: S.trials } };
    const n = next();
    const common = { ok: true, counters: { trials: S.trials }, budget: { trials: 8, roundsMax: 2, width: 2 }, best: { value: 1 }, baseline: { median: 9 }, metric: { command: 'node m.js' }, profile: profile ? { mode: profile, patch: null } : null };
    return n ? { ...common, state: 'running', next: n } : { ...common, state: 'complete', reason: 'complete', next: { action: 'finish' } };
  };
  const calls = [];
  const agent = async (prompt, opts) => {
    const label = opts.label;
    calls.push({ label, prompt, model: opts.model });
    const base = label.split(':')[0];
    if (base === 'status') return { ok: true, result: status() };
    if (base === 'profile') { S.profiled = true; return { ok: true, result: { ...status(), entries: 3 } }; }
    if (base === 'round-open') { S.opened = true; S.round = { done: 0 }; return { ok: true, result: { ok: true, round: 1, next: next() } }; }
    if (base === 'round-close') { S.round = null; return { ok: true, result: { ...status(), winner: { name: 'optimize/s--r1b1' } } }; }
    if (base === 'propose') {
      const many = /2 different hypotheses/.test(prompt);
      return { hypotheses: (many ? [1, 2] : [1]).map((i) => ({ text: `idea ${calls.length}.${i}`, expected: '1 s', plan: 'edit src/a.js', idea: `i${calls.length}${i}` })), lane: 'x', worktree: '/wt' };
    }
    if (base === 'edit') return { ok: true, changed: ['src/a.js'] };
    if (base === 'trial') {
      S.trials++;
      const lane = S.round ? `optimize/s--r1b${(S.round.done % 2) + 1}` : 'optimize/s';
      if (S.round) S.round.done++; else S.trunk++;
      return { ok: true, result: { ok: true, trial: S.trials, lane, verdict: 'kept', median: 1, next: status().next } };
    }
    if (base === 'finish') return { ok: true, result: { ok: true, commit: 'abc123' } };
    throw new Error(`no answer for ${label}`);
  };
  return { agent, calls, S };
}
const run = (args, agent) => driver(args, agent, () => {}, () => {}, async (fns) => Promise.all(fns.map((f) => f())));

test('the driver runs the round, the round-close, the trunk trials, and finish at the target', async () => {
  const { agent, calls } = fakeLoop();
  const out = await run(ARGS, agent);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.state, 'finished');
  assert.equal(out.next, '/wf verify s optimize');
  const labels = calls.map((c) => c.label);
  assert.equal(labels[0], 'status');
  assert.equal(labels.filter((l) => l.startsWith('trial:')).length, 6);
  assert.ok(labels.indexOf('round-close') > labels.indexOf('trial:4') && labels.indexOf('round-close') < labels.indexOf('trial:5'));
  assert.ok(labels.includes('finish'));
});

test('a branch proposer writes one hypothesis; the trunk proposer writes width hypotheses and the queue serves the next trunk trial', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  const proposers = calls.filter((c) => c.label.startsWith('propose:'));
  assert.equal(proposers.length, 5, '4 branch trials with their own proposer, and one proposer for the 2 trunk trials');
  assert.ok(proposers.slice(0, 4).every((c) => /one hypothesis/.test(c.prompt)));
  assert.match(proposers[4].prompt, /2 different hypotheses/);
  assert.ok(proposers.every((c) => c.model === 'claude-opus-5-5'));
  assert.ok(calls.filter((c) => c.label.startsWith('edit:')).every((c) => c.model === 'claude-sonnet-5-5' && /The optimize worktree is \/wt/.test(c.prompt)));
});

test('D13: the proposer reads only the digest, and never the ledger or the history of other branches', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  const p = calls.find((c) => c.label === 'propose:1').prompt;
  assert.match(p, /propose-context "\/repo" s/);
  assert.match(p, /Do NOT read the optimize folder of the workflow, the results ledger, or the git history of other branches/);
  assert.equal(/different approach/.test(p), false, 'no diversity directive (arXiv 2610.07447: no measured effect)');
});

test('a proposer measures only with a probe of its own lane, and has a time limit', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  const branch = calls.find((c) => c.label === 'propose:1').prompt;
  assert.match(branch, /optimize\.mjs" probe-open "\/repo" s --on optimize\/s--r1b1/);
  assert.match(branch, /optimize\.mjs" probe "\/repo" s --on optimize\/s--r1b1 --label "<what>" --cmd "<command>"/);
  assert.match(branch, /never build, test, format or run the project in the lane worktree, and never copy the worktree/);
  assert.match(branch, /digest\.proposeMinutes minutes/);
  const trunk = calls.filter((c) => c.label.startsWith('propose:')).at(-1).prompt;
  assert.match(trunk, /probe-open "\/repo" s --on trunk/);
});

test('the trial bookkeeping writes the hypothesis to the file of its lane and passes it with --hypothesis-file', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  const t = calls.find((c) => c.label === 'trial:1').prompt;
  assert.match(t, /\/repo\/\.scratch\/optimize\/s\/r1b1\.txt/);
  const e = calls.find((c) => c.label === 'edit:1').prompt;
  assert.match(e, /write the hypothesis text above to the file \/repo\/\.scratch\/optimize\/s\/r1b1\.txt/, 'the editor writes it too, so a resume can measure the edit');
  assert.match(e, /Do not build, compile, test, format, or run the metric/);
  assert.match(t, /optimize\.mjs" trial "\/repo" s h1 --hypothesis-file/);
});

test('a stop request read by status ends the loop at the next boundary, with no finish', async () => {
  const { agent, calls } = fakeLoop({ stopAt: 2 });
  const out = await run(ARGS, agent);
  assert.equal(out.ok, false);
  assert.equal(out.stoppedAt, 'stop-request');
  assert.equal(calls.filter((c) => c.label.startsWith('trial:')).length, 2);
  assert.equal(calls.some((c) => c.label === 'finish'), false);
});

test('the agent ceiling stops a runaway run', async () => {
  const { agent } = fakeLoop({ trunkTrials: 50 });
  const out = await run({ ...ARGS, agentCeiling: 12 }, agent);
  assert.equal(out.stoppedAt, 'agent-ceiling');
  assert.ok(out.agentsUsed <= 13);
});

test('missing args return a stop, not a throw', async () => {
  const out = await run({ projectRoot: '/repo' }, async () => ({}));
  assert.equal(out.ok, false);
  assert.match(out.reason, /required arg 'referenceRoot'/);
});

// A round whose branches have their own worktrees: status names every ready branch. The agents
// take time, so the test sees which of them run at the same time.
function overlapLoop({ branches = 2, branchTrials = 2, trunkTrials = 1, stopAt = null } = {}) {
  const lanes = Array.from({ length: branches }, (_, i) => `optimize/s--r1b${i + 1}`);
  const S = { opened: false, closed: false, trials: 0, trunk: 0, done: Object.fromEntries(lanes.map((l) => [l, 0])) };
  const next = () => {
    if (!S.opened) return { action: 'round-open', point: 0 };
    if (!S.closed) {
      const open = lanes.filter((l) => S.done[l] < branchTrials);
      return open.length ? { action: 'trial', on: open[0], ready: open } : { action: 'round-close' };
    }
    if (S.trunk < trunkTrials) return { action: 'trial', on: 'optimize/s' };
    return null;
  };
  const status = () => {
    if (stopAt !== null && S.trials >= stopAt) return { ok: true, state: 'stopped', reason: 'stop-request', next: { action: 'person' }, counters: { trials: S.trials } };
    const n = next();
    const common = { ok: true, counters: { trials: S.trials }, budget: { trials: 8, roundsMax: 2, width: 1 } };
    return n ? { ...common, state: 'running', next: n } : { ...common, state: 'complete', reason: 'complete', next: { action: 'finish' } };
  };
  const log = [];
  let measuring = 0;
  let most = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const agent = async (prompt, opts) => {
    const base = opts.label.split(':')[0];
    if (base === 'status') return { ok: true, result: status() };
    if (base === 'round-open') { S.opened = true; return { ok: true, result: { ok: true, next: next() } }; }
    if (base === 'round-close') { S.closed = true; return { ok: true, result: { ...status(), winner: 'trunk' } }; }
    if (base === 'propose') {
      const lane = (/propose-context "\/repo" s --on (\S+)`/.exec(prompt) || [])[1] ?? 'optimize/s';
      log.push(['propose', lane]);
      await sleep(5);
      return { hypotheses: [{ text: `idea for ${lane}`, expected: '1', plan: 'edit src/a.js' }], lane, worktree: `/wt/${lane}` };
    }
    if (base === 'edit') {
      const lane = /, on (\S+)\. The optimize worktree/.exec(prompt)[1];
      log.push(['edit', lane]);
      await sleep(5);
      return { ok: true, changed: ['src/a.js'] };
    }
    if (base === 'trial') {
      const lane = (/ --on (\S+) /.exec(prompt) || [])[1] ?? 'optimize/s';
      measuring++;
      most = Math.max(most, measuring);
      log.push(['trial-start', lane]);
      await sleep(25);
      S.trials++;
      if (S.closed) S.trunk++; else S.done[lane]++;
      measuring--;
      log.push(['trial-end', lane]);
      return { ok: true, result: { ok: true, trial: S.trials, lane, verdict: 'kept', median: 1, next: status().next } };
    }
    if (base === 'finish') return { ok: true, result: { ok: true, commit: 'abc' } };
    throw new Error(`no answer for ${opts.label}`);
  };
  return { agent, log, S, most: () => most };
}

test('in a round with branch worktrees, the branches propose and edit while another branch is measured; the trials never overlap', async () => {
  const { agent, log, most } = overlapLoop();
  const out = await run(ARGS, agent);
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(most(), 1, 'one measurement at a time');
  const at = (kind, lane, from = 0) => log.findIndex((e, i) => i >= from && e[0] === kind && e[1] === lane);
  const firstEnd = log.findIndex((e) => e[0] === 'trial-end');
  const measured = log[firstEnd][1];
  const other = measured === 'optimize/s--r1b1' ? 'optimize/s--r1b2' : 'optimize/s--r1b1';
  assert.ok(at('edit', other) < firstEnd, 'the other branch is edited before the first trial ends');
  const start = log.findIndex((e) => e[0] === 'trial-start' && e[1] === other);
  const end = at('trial-end', other, start);
  assert.ok(start > firstEnd && end > start);
  const proposeAgain = at('propose', measured, firstEnd);
  const editAgain = at('edit', measured, firstEnd);
  assert.ok(proposeAgain < end && editAgain < end, 'a branch proposes and edits its next trial while the other branch is measured');
  assert.equal(log.filter((e) => e[0] === 'trial-end').length, 5, '2 trials on each of 2 branches, then 1 trunk trial');
  // The trunk stays serial: its proposer starts only after every branch trial ended.
  const lastBranchEnd = log.map((e) => (e[0] === 'trial-end' && e[1] !== 'optimize/s' ? 1 : 0)).lastIndexOf(1);
  assert.ok(at('propose', 'optimize/s') > lastBranchEnd);
});

test('the trials of the overlap pass --on and the hypothesis file of their lane', async () => {
  const calls = [];
  const { agent } = overlapLoop();
  await run(ARGS, async (prompt, opts) => { calls.push({ label: opts.label, prompt }); return agent(prompt, opts); });
  const t = calls.filter((c) => c.label.startsWith('trial:')).map((c) => c.prompt);
  assert.ok(t.some((p) => /trial "\/repo" s h\d+ --on optimize\/s--r1b2 --hypothesis-file "\/repo\/\.scratch\/optimize\/s\/r1b2\.txt"/.test(p)));
  assert.ok(calls.filter((c) => c.label.startsWith('propose:')).some((c) => /propose-context "\/repo" s --on optimize\/s--r1b1/.test(c.prompt)));
});

test('after a round, one consider agent chooses the merges, and the merge trials run in its order', async () => {
  const S = { closed: false, considered: false, merged: [], trunk: 0 };
  const merge = { round: 1, from: 'base0', worktree: '/wt', candidates: [
    { name: 'optimize/s--r1b2', k: 2, commit: 'c2', gain: 9, hypotheses: ['cache the pitch'], paths: ['src/b.js'], shared: [], conflict: false },
    { name: 'optimize/s--r1b3', k: 3, commit: 'c3', gain: 5, hypotheses: ['skip idle players'], paths: ['src/c.js'], shared: [], conflict: false },
    { name: 'optimize/s--r1b4', k: 4, commit: 'c4', gain: 4, hypotheses: ['same as the winner'], paths: ['src/a.js'], shared: ['src/a.js'], conflict: true },
  ] };
  const order = ['optimize/s--r1b3', 'optimize/s--r1b2'];
  const status = () => {
    const common = { ok: true, counters: { trials: 4 }, budget: { trials: 20, roundsMax: 2, branches: 4, width: 1 } };
    if (!S.closed) return { ...common, state: 'running', next: { action: 'round-close' } };
    if (!S.considered) return { ...common, state: 'running', merge, next: { action: 'merge-consider' } };
    const left = order.filter((b) => !S.merged.includes(b));
    if (left.length) return { ...common, state: 'running', merge, next: { action: 'merge-trial', branch: left[0] } };
    if (S.trunk < 1) return { ...common, state: 'running', next: { action: 'trial', on: 'optimize/s' } };
    return { ...common, state: 'complete', reason: 'complete', next: { action: 'finish' } };
  };
  const calls = [];
  const agent = async (prompt, opts) => {
    calls.push({ label: opts.label, prompt, model: opts.model });
    const base = opts.label.split(':')[0];
    if (base === 'status') return { ok: true, result: status() };
    if (base === 'round-close') { S.closed = true; return { ok: true, result: { ...status(), winner: { name: 'optimize/s--r1b1' } } }; }
    if (base === 'merge-consider') { S.considered = true; return { ok: true, result: { ...status(), try: order } }; }
    if (base === 'merge') { S.merged.push(/--branch (\S+)/.exec(prompt)[1]); return { ok: true, result: { ...status(), verdict: 'kept', median: 1 } }; }
    if (base === 'propose') return { hypotheses: [{ text: 'idea', expected: '1', plan: 'p' }], worktree: '/wt' };
    if (base === 'edit') return { ok: true, changed: ['src/a.js'] };
    if (base === 'trial') { S.trunk++; return { ok: true, result: { ok: true, trial: 7, lane: 'trunk', verdict: 'kept', next: status().next } }; }
    if (base === 'finish') return { ok: true, result: { ok: true, commit: 'abc' } };
    throw new Error(`no answer for ${opts.label}`);
  };
  const out = await run(ARGS, agent);
  assert.equal(out.ok, true, JSON.stringify(out));
  const consider = calls.filter((c) => c.label.startsWith('merge-consider'));
  assert.equal(consider.length, 1);
  assert.equal(consider[0].model, 'claude-opus-5-5');
  assert.match(consider[0].prompt, /cache the pitch/);
  assert.equal(/same as the winner/.test(consider[0].prompt), false, 'a candidate that conflicts is not offered');
  assert.match(consider[0].prompt, /git -C "\/wt" diff base0 <commit>/);
  assert.match(consider[0].prompt, /optimize\.mjs" merge-consider "\/repo" s --try/);
  assert.deepEqual(calls.filter((c) => c.label.startsWith('merge:')).map((c) => /--branch (\S+)/.exec(c.prompt)[1]), order);
  assert.ok(calls.findIndex((c) => c.label.startsWith('merge:')) > calls.findIndex((c) => c.label.startsWith('merge-consider')));
});

test('the agent ceiling counts the merge step, the profiles and the prunes of each round', async () => {
  const { agent } = fakeLoop({ trunkTrials: 50 });
  const out = await run(ARGS, async (prompt, opts) => {
    const r = await agent(prompt, opts);
    if (opts.label === 'status' && r.result && r.result.budget) r.result.budget = { trials: 8, roundsMax: 2, branches: 4, width: 2 };
    return r;
  });
  assert.equal(out.stoppedAt, 'agent-ceiling');
  assert.ok(out.agentsUsed <= 3 * 8 + 2 * 2 + 10 + 4 * 2 + 2 * 3 + 4 * 2 + 3, `agents ${out.agentsUsed}`);
  assert.ok(out.agentsUsed > 3 * 8 + 2 * 2 + 10 + 4 * 2 + 2 * 3, 'the ceiling is larger than before the prune step');
});

test('a stop during a round waits for the editors in flight and does not measure their edits', async () => {
  const { agent, log } = overlapLoop({ stopAt: 1 });
  const out = await run(ARGS, agent);
  assert.equal(out.stoppedAt, 'stop-request');
  assert.equal(log.filter((e) => e[0] === 'trial-start').length, 1);
  const lastEdit = log.map((e) => e[0]).lastIndexOf('edit');
  assert.ok(lastEdit >= 0 && log.length - 1 >= lastEdit, 'the edit in flight finished before the driver returned');
});

test('a proposer claims each idea in the shared ledger, and the trial passes the idea', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  const p = calls.find((c) => c.label === 'propose:1').prompt;
  assert.match(p, /optimize\.mjs" idea-claim "\/repo" s --on optimize\/s--r1b1 --target/);
  assert.match(p, /digest\.ideas lists the idea of every trial of every lane/);
  assert.match(p, /An entry with alone: false cannot pass the threshold by itself/);
  assert.match(calls.find((c) => c.label === 'trial:1').prompt, / --idea i\d+/);
});

test('the profile step: the profiler agent in agent mode, the bookkeeping in command mode, before the first round', async () => {
  const a = fakeLoop({ profile: 'agent' });
  const outA = await run(ARGS, a.agent);
  assert.equal(outA.ok, true, JSON.stringify(outA));
  const prof = a.calls.find((c) => c.label === 'profile');
  assert.match(prof.prompt, /^PROFILER for the optimize loop/);
  assert.match(prof.prompt, /probe-open "\/repo" s --on trunk/);
  assert.match(prof.prompt, /profile-record "\/repo" s --file "\/repo\/\.scratch\/optimize\/s\/profile\.json"/);
  assert.equal(prof.model, 'claude-opus-5-5');
  assert.ok(a.calls.findIndex((c) => c.label === 'profile') < a.calls.findIndex((c) => c.label === 'round-open'));
  const b = fakeLoop({ profile: 'command' });
  await run(ARGS, b.agent);
  assert.match(b.calls.find((c) => c.label === 'profile').prompt, /^BOOKKEEPING[\s\S]*optimize\.mjs" profile "\/repo" s/);
});

test('a prune is bookkeeping, and a port and a bundle go to the editor with the kept diffs and no proposer', async () => {
  const steps = [
    { action: 'prune', branch: 'optimize/s--r1b2', why: 'trails' },
    { action: 'trial', on: 'optimize/s', port: 't2', portOf: { trial: 2, branch: 'optimize/s--r1b2', hypothesis: 'cache the table', gain: 10, patch: '/repo/opt/patches/2.patch' } },
    { action: 'trial', on: 'optimize/s', bundle: ['i1', 'i3'], bundleOf: [{ id: 'i1', target: 'value', family: 'smaller', hypotheses: ['value 95'], patches: ['/repo/opt/patches/4.patch'] }, { id: 'i3', target: 'extra', family: 'x', hypotheses: [], patches: ['/repo/opt/patches/5.patch'] }] },
  ];
  let at = 0;
  const calls = [];
  const common = { ok: true, counters: { trials: at }, budget: { trials: 8, roundsMax: 2, width: 2 }, best: { value: 1 }, baseline: { median: 9 }, metric: { command: 'node m.js' }, profile: null, worktree: '/wt' };
  const status = () => (at < steps.length ? { ...common, state: 'running', next: steps[at] } : { ...common, state: 'complete', reason: 'complete', next: { action: 'finish' } });
  const agent = async (prompt, opts) => {
    calls.push({ label: opts.label, prompt });
    const base = opts.label.split(':')[0];
    if (base === 'status') return { ok: true, result: status() };
    if (base === 'prune') { at++; return { ok: true, result: { ...status(), pruned: 'optimize/s--r1b2' } }; }
    if (base === 'edit') return { ok: true, changed: ['src/a.js'] };
    if (base === 'trial') { at++; return { ok: true, result: { ok: true, trial: at, lane: 'optimize/s', verdict: 'kept', median: 1, next: status().next } }; }
    if (base === 'finish') return { ok: true, result: { ok: true, commit: 'abc' } };
    throw new Error(`no answer for ${opts.label}`);
  };
  const out = await run(ARGS, agent);
  assert.equal(out.ok, true, JSON.stringify(out));
  const labels = calls.map((c) => c.label);
  assert.match(calls.find((c) => c.label === 'prune').prompt, /optimize\.mjs" prune "\/repo" s/);
  assert.equal(labels.some((l) => l.startsWith('propose:')), false, 'a port and a bundle run no proposer');
  const [port, bundle] = calls.filter((c) => c.label.startsWith('edit:')).map((c) => c.prompt);
  assert.match(port, /Port of trial 2 of optimize\/s--r1b2: cache the table/);
  assert.match(port, /diff: \/repo\/opt\/patches\/2\.patch/);
  assert.match(bundle, /Bundle of i1, i3: value 95 \| extra: x/);
  assert.match(bundle, /diff: \/repo\/opt\/patches\/4\.patch[\s\S]*diff: \/repo\/opt\/patches\/5\.patch/);
  assert.ok(labels.includes('finish'));
});

test('a branch proposer reads the seed of its branch', async () => {
  const { agent, calls } = fakeLoop();
  await run(ARGS, agent);
  assert.match(calls.find((c) => c.label === 'propose:1').prompt, /SEED: when digest\.seed is not null, it names the part of the profile where your branch starts/);
});

test('at the target, the driver runs the ablation before finish', async () => {
  let ablated = false;
  const calls = [];
  const common = { ok: true, counters: { trials: 3 }, budget: { trials: 8, roundsMax: 2, width: 2 }, best: { value: 1 }, baseline: { median: 9 }, metric: { command: 'node m.js' }, profile: null };
  const agent = async (prompt, opts) => {
    calls.push({ label: opts.label, prompt });
    const base = opts.label.split(':')[0];
    if (base === 'status') return { ok: true, result: { ...common, state: 'complete', reason: 'complete', next: ablated ? { action: 'finish' } : { action: 'ablate' } } };
    if (base === 'ablate') { ablated = true; return { ok: true, result: { ok: true, ablation: { changes: [{ verdict: 'weak' }, { verdict: 'ok' }] } } }; }
    if (base === 'finish') return { ok: true, result: { ok: true, commit: 'abc', weak: 1 } };
    throw new Error(`no answer for ${opts.label}`);
  };
  const out = await run(ARGS, agent);
  assert.equal(out.ok, true, JSON.stringify(out));
  const labels = calls.map((c) => c.label);
  assert.ok(labels.indexOf('ablate') > 0 && labels.indexOf('ablate') < labels.indexOf('finish'), labels.join(' '));
  assert.match(calls.find((c) => c.label === 'ablate').prompt, /optimize\.mjs" ablate "\/repo" s/);
});
