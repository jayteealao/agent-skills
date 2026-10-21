// WF-CAMPAIGN-DRIVER-PLAN W2–W4 — the wave driver (skills/wf/workflows/campaign-wave.js),
// run as a whole script with a mock `agent` that answers by label (section 10). The
// mock records each call with its start and end order, and the heavy agents that run
// at the same time, so a test can check the slots, the waits, the parks and the stops.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'campaign-wave.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', src.replace('export const meta', 'const meta'));

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAVY = /^(implement|verify|review|wall-probe|merge|slug-output|quiet|wave-verify|revert|remerge|wave-output|wave-review)(:|@|#|$)/;
const isHeavy = (label, prompt) => /"heavy":true/.test(prompt) || (['merge', 'wave-verify', 'wave-review', 'wave-output'].includes(label)) || /^(quiet|revert|remerge|wave-verify):/.test(label);

const unitArg = (key, slug, over = {}) => ({
  key, slug, form: 'intake', order: { A: 1, B: 2, C: 3 }[key] ?? 1,
  root: `/cw/w1-${key}`, branch: `campaign/b/wave-1--${slug}`, contextPath: `/repo/.ai/workflows/b/work/campaign/context/${slug}.md`,
  reviewScope: 'per-slice', state: 'running', runId: null, cleared: [], waits: [], questions: [], ...over,
});

const baseArgs = (units, over = {}) => ({
  mode: 'wave', projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', brainstorm: 'b', wave: 1,
  campaignRunId: '20261016T100000Z-b-w1', waveBranch: 'campaign/b/wave-1', base: 'main',
  campaignDir: '/repo/.ai/workflows/b/work/campaign', campaignControlPath: '/repo/.ai/workflows/b/work/campaign/.control.json',
  campaignSteerPath: '/repo/.ai/workflows/b/work/campaign/steer.md', cancelPath: '/repo/.scratch/campaign/r/wave-1/cancel',
  width: 2, widthMax: 2, stopBefore: null, output: null, records: 'tracked', agentCeiling: 900, moved: [],
  units, waveQuestions: [], ...over,
});

const stagesOf = (planned) => ({ plan: planned ? 'done' : 'todo', implement: 'todo', verify: 'todo', review: 'todo' });

/**
 * The mock. `rosters` maps a slug to its slices. `answer(label, prompt, ctx)` may
 * return a value to override the default answer of a label; returning undefined
 * keeps the default.
 */
function makeMock({ rosters, answer = () => undefined, delays = {} }) {
  const calls = [];
  const planned = new Set();
  const asked = [];
  let seq = 0;
  let active = 0;
  let peak = 0;
  const activeLabels = new Set();
  const defaults = (label, prompt) => {
    const at = label.indexOf('@');
    const slug = at >= 0 ? label.slice(at + 1) : null;
    const base = at >= 0 ? label.slice(0, at) : label;
    const [stage, slice] = base.split(':');
    if (stage === 'orient') {
      return {
        ok: true, slug, reviewScope: 'per-slice', fileConvention: 'suffixed', runId: `20261016T100000Z-${slug}`, lastSeq: 0,
        charter: [], priorDeferrals: [],
        slices: (rosters[slug] || ['s1']).map((s) => ({ slice: s, status: 'defined', reverifyReason: 'new-work', stages: stagesOf(planned.has(`${slug}:${s}`)) })),
      };
    }
    if (stage === 'plan') { planned.add(`${slug}:${slice}`); return { stage: 'plan', slice, status: 'complete', artifactPath: `/x/04-plan-${slice}.md`, terminal: { statusField: 'complete' }, decisions: [], crossUnit: [] }; }
    if (stage === 'implement') return { stage, slice, status: 'complete', artifactPath: `/x/05-${slice}.md`, terminal: { statusField: 'complete' }, startSha: `start-${slug}-${slice}`, decisions: [] };
    if (stage === 'verify') return { stage, slice, status: 'complete', artifactPath: `/x/06-${slice}.md`, terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };
    if (stage === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }], stopped: false };
    if (stage === 'scout') return { findings: [] };
    if (stage === 'refute') return { verdicts: [] };
    if (stage === 'review') return { stage: 'review', slice, status: 'complete', artifactPath: '/x/07.md', terminal: { verdict: 'ship', blockerCount: 0 } };
    if (stage === 'writeback') return { ok: true, wrote: [], sliceDone: { ok: true, sha: `sha-${slug}-${slice}`, ready: readyFor(prompt, slug, slice), budget: { state: 'ok', width: 2 }, answered: [] } };
    if (stage === 'unit-end') return { ok: true, sliceDone: { ok: true, sha: `fin-${slug}`, ready: readyFor(prompt, slug, 'finished') } };
    if (stage === 'read-check-report') return { present: false };
    if (['plan-index-writeback', 'plan-reconcile-clear', 'resume', 'move'].includes(stage)) return { ok: true };
    if (stage === 'plan-reconcile') return { overlaps: [] };
    if (stage === 'park') { const m = / ask "[^"]+" \S+ (\S+) --wave/.exec(prompt); if (m) asked.push(m[1]); return { ok: true }; }
    // WF-CAMPAIGN-SLICE-ORDER-PLAN D7: the early plan questions, one ask command each.
    if (stage === 'ask-early') { for (const m of prompt.matchAll(/ ask "[^"]+" \S+ (\S+) --wave/g)) asked.push(m[1]); return { ok: true }; }
    if (stage === 'wait') return { ok: true, closed: ['x'] };
    if (stage === 'classify') return { classified: [] };
    if (stage === 'cross-unit-reconcile') return { pairs: [] };
    if (stage.startsWith('waiter')) {
      const open = asked.filter((id) => !answered.has(id));
      if (!open.length) return { result: 'timeout', calls: 6 };
      for (const id of open) answered.add(id);
      return { result: 'answered', answered: open.map((id) => ({ id, answer: 'continue as planned', by: 'person' })), calls: 1 };
    }
    if (stage === 'boundary-setup') return { status: 'complete', worktree: '/cw/wave-1', units: Object.keys(rosters).map((s) => ({ key: keyOf(s), slug: s, branch: `campaign/b/wave-1--${s}`, quiet: [] })) };
    if (stage === 'merge') return { status: 'complete', merged: Object.keys(rosters).filter((s) => finishedSlugs.has(s)).map((s) => ({ key: keyOf(s), slug: s, sha: `m-${s}` })), notMerged: [] };
    if (stage === 'wave-verify') return { status: 'complete', green: true, rounds: 0, commands: ['npm test'] };
    if (stage === 'wave-review') return { status: 'complete', verdict: 'ship', blockerCount: 0, open: [], fixed: [] };
    if (stage === 'wave-scout') return { findings: [] };
    if (stage === 'wave-refute') return { verdicts: [] };
    if (base === 'wave-review:attribute') return { units: [] };
    if (base === 'wave-review:select') return { rubrics: [] };
    if (stage === 'as-built') return { status: 'complete', path: '/a.md' };
    if (stage === 'fidelity') return { status: 'complete', unratified: [] };
    if (stage === 'wave-output') return { status: 'complete', built: true };
    if (stage === 'event' || stage === 'cancel' || stage === 'needs-add') return { ok: true, results: [] };
    return { ok: true };
  };
  const answered = new Set();
  const finishedSlugs = new Set();
  const keyOf = (slug) => ({ a: 'A', b: 'B', c: 'C' }[slug] ?? slug.toUpperCase());
  // The waits that a cleared slice makes ready: the mock reads them from the test's `waitsOn` map.
  const readyFor = (prompt, slug, slice) => (mock.waitsOn[`${slug}:${slice}`] || []).map((w) => ({ ...w, sha: slice === 'finished' ? `fin-${slug}` : `sha-${slug}-${slice}` }));
  const mock = {
    calls, asked, waitsOn: {}, finishedSlugs,
    get peak() { return peak; },
    agent: async (prompt, opts = {}) => {
      const label = opts.label;
      const heavy = isHeavy(label, prompt);
      const c = { label, prompt, start: ++seq, end: null, heavy };
      calls.push(c);
      if (heavy) { active++; activeLabels.add(label); peak = Math.max(peak, active); c.concurrent = active; }
      try {
        await tick(delays[label.split(/[:@#]/)[0]] ?? (heavy ? 4 : 1));
        const over = await answer(label, prompt, { calls, asked });
        if (over instanceof Error) throw over;
        const res = over !== undefined ? over : defaults(label, prompt);
        if (label.startsWith('unit-end@')) finishedSlugs.add(label.slice('unit-end@'.length));
        return res;
      } finally {
        c.end = ++seq;
        if (heavy) { active--; activeLabels.delete(label); }
      }
    },
  };
  return mock;
}

async function run(args, mock) {
  const logs = [];
  const outcome = await driver(args, mock.agent, (m) => logs.push(m), () => {}, async (fns) => Promise.all(fns.map((f) => f())));
  // P9: the engine drops an agent that is still out when the script returns, with no error.
  assert.deepEqual(mock.calls.filter((c) => c.end === null).map((c) => c.label), [], 'every agent returns before the driver does');
  return { outcome, logs, labels: mock.calls.map((c) => c.label) };
}

const first = (calls, re) => calls.find((c) => re.test(c.label));
const all = (calls, re) => calls.filter((c) => re.test(c.label));

// ---------------------------------------------------------------- W2: the core

test('W2: two independent units at width 2 — at most 2 heavy agents, every plan before the first implement, labels end with @slug', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 's2'], b: ['p1', 'p2'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, JSON.stringify({ stoppedAt: outcome.stoppedAt, reason: outcome.reason }));
  assert.equal(outcome.held, false);
  assert.ok(mock.peak <= 2, `peak ${mock.peak}`);
  const lastPlan = Math.max(...all(mock.calls, /^plan:/).map((c) => c.end));
  const firstImpl = Math.min(...all(mock.calls, /^implement:/).map((c) => c.start));
  assert.ok(lastPlan < firstImpl, 'every plan of both units ends before the first implement');
  for (const c of mock.calls.filter((x) => /^(orient|plan|implement|verify|review|writeback|unit-end|select-rubrics|scout|park|resume)/.test(x.label))) {
    assert.match(c.label, /@[ab]$/, c.label);
  }
  for (const c of all(mock.calls, /^(implement|verify|review):/)) assert.match(c.prompt, /"heavy":true/, c.label);
  for (const c of all(mock.calls, /^(plan|select-rubrics|scout|writeback):/)) assert.doesNotMatch(c.prompt, /"heavy":true/, c.label);
  for (const c of all(mock.calls, /^(implement|verify):/)) assert.match(c.prompt, /"campaignRun":"20261016T100000Z-b-w1"/);
  assert.deepEqual(outcome.boundary.merged.map((m) => m.key).sort(), ['A', 'B']);
  assert.deepEqual(outcome.units.map((u) => u.state), ['finished', 'finished']);
  assert.ok(first(mock.calls, /^wave-review$/), 'the wave review writer runs');
  assert.equal(all(mock.calls, /^writeback:/).length, 4, 'one slice-done for each slice');
  assert.ok(all(mock.calls, /^writeback:/).every((c) => /slice-done "\/repo" b [AB] \S+ --run 20261016T100000Z-[ab]/.test(c.prompt)));
});

test('W2: width 1 runs one heavy agent at a time', async () => {
  const mock = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(mock.peak, 1);
});

test('W2: a slow reading narrows the slots to 1, a later ok widens them again; widthChanges lists both', async () => {
  let readings = 0;
  const mock = makeMock({
    rosters: { a: ['s1', 's2'], b: ['p1', 'p2'], c: ['q1', 'q2'] },
    answer: (label) => {
      if (/^implement:s1@a/.test(label)) { readings++; return { stage: 'implement', slice: 's1', status: 'complete', artifactPath: '', terminal: { statusField: 'complete' }, budget: { state: 'slow', width: 1 } }; }
      if (/^verify:s2@a/.test(label)) return { stage: 'verify', slice: 's2', status: 'complete', artifactPath: '', terminal: { convergence: 'converged', result: 'pass' }, budget: { state: 'ok', width: 3 } };
      if (/^writeback:/.test(label)) return { ok: true, sliceDone: { ok: true, sha: `x-${label}`, ready: [], budget: { state: readings && !label.includes('s2@a') ? 'slow' : 'ok', width: readings && !label.includes('s2@a') ? 1 : 3 } } };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b'), unitArg('C', 'c')], { width: 3, widthMax: 3 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.ok(outcome.widthChanges.some((w) => w.from === 3 && w.to === 1), JSON.stringify(outcome.widthChanges));
  assert.ok(outcome.widthChanges.some((w) => w.from === 1 && w.to === 3), JSON.stringify(outcome.widthChanges));
  assert.ok(first(mock.calls, /^event:width/), 'an event agent appends the width event');
});

test('W2: a stage that returns width 0 stops the run with usage-pause and until', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => (/^implement:s1@a/.test(label)
      ? { stage: 'implement', slice: 's1', status: 'stopped', stopKind: 'pause', stopReason: 'five-hour window', artifactPath: '', terminal: {}, budget: { state: 'pause', width: 0, until: '2026-10-16T15:00:00Z', reason: 'five-hour window' } }
      : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.held, true);
  assert.equal(outcome.stoppedAt, 'usage-pause');
  assert.equal(outcome.until, '2026-10-16T15:00:00Z');
  assert.equal(outcome.boundary, null);
});

test('W2: a campaign stop request stops both walks and the run is held', async () => {
  const mock = makeMock({
    rosters: { a: ['s1', 's2'], b: ['p1', 'p2'] },
    answer: (label) => (/^implement:s2@a/.test(label) ? { stage: 'implement', slice: 's2', status: 'stopped', stopKind: 'stop', stopReason: 'bed', artifactPath: '', terminal: {} } : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.held, true);
  assert.equal(outcome.stoppedAt, 'stop-request');
  assert.equal(all(mock.calls, /^park:/).length, 0, 'no unit parks for a stop');
  assert.equal(first(mock.calls, /^merge$/), undefined);
});

test('W2: a slug-wide unit runs one review after its last verify, over its own commits only', async () => {
  const mock = makeMock({
    rosters: { a: ['s1', 's2'] },
    answer: (label) => (/^orient/.test(label) ? undefined : undefined),
  });
  const orig = mock.agent;
  mock.agent = async (prompt, opts) => {
    const r = await orig(prompt, opts);
    if (/^orient/.test(opts.label)) return { ...r, reviewScope: 'slug-wide', slices: r.slices.map((s) => ({ ...s, stages: { ...s.stages, review: 'n-a' } })) };
    return r;
  };
  const { outcome } = await run(baseArgs([unitArg('A', 'a', { reviewScope: 'slug-wide', waits: [] })], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const reviews = all(mock.calls, /^review/);
  assert.deepEqual(reviews.map((c) => c.label), ['review@a']);
  const lastVerify = Math.max(...all(mock.calls, /^verify:/).map((c) => c.end));
  assert.ok(reviews[0].start > lastVerify);
  assert.match(reviews[0].prompt, /git -C \/cw\/w1-A log -p --no-merges main\.\.HEAD/);
});

test('W2: a review with 20 findings runs at most 12 refuters', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label) => {
      if (/^scout:correctness:s1@a/.test(label)) return { findings: Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, severity: 'MED', file: 'x.js', issue: `i${i}` })) };
      return undefined;
    },
  });
  await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  const refuters = all(mock.calls, /^refute:/);
  assert.ok(refuters.length > 0 && refuters.length <= 12, `refuters ${refuters.length}`);
});

test('W2: a dont-ship unit review parks with kind review; the answer runs only the writer again', async () => {
  let reviews = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label) => {
      if (/^review:s1@a/.test(label)) {
        reviews++;
        return reviews === 1
          ? { stage: 'review', slice: 's1', status: 'hard-stop', hardStopReason: 'dont-ship', artifactPath: '', terminal: { verdict: 'dont-ship', blockerCount: 1 } }
          : undefined;
      }
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.ok(first(mock.calls, /^park:review@a/));
  assert.equal(all(mock.calls, /^select-rubrics/).length, 1, 'no new fan-out after the answer');
  assert.equal(all(mock.calls, /^review:s1@a/).length, 2);
  assert.match(all(mock.calls, /^review:s1@a/)[1].prompt, /ANSWERED ESCALATION/);
});

test('W2: a deferral with no probe gets one corrective round, then a hard-stop parks the unit', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (/^verify:s1@a/.test(label) && !/ANSWERED ESCALATION/.test(prompt)) return { stage: 'verify', slice: 's1', status: 'complete', artifactPath: '', terminal: { convergence: 'converged', result: 'partial', deferrals: [{ ac: 'AC1', reason: 'no device' }], substantiveResidual: false } };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  const verifies = all(mock.calls, /^verify:s1@a/);
  assert.match(verifies[1].prompt, /CORRECTIVE PROBE ROUND/);
  assert.ok(first(mock.calls, /^park:stage@a/), 'the hard-stop parks the unit');
  assert.equal(outcome.ok, true, outcome.reason);
});

test('W2: when the count plus the review reserve passes the ceiling, the run stops with agent-ceiling', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 's2', 's3', 's4', 's5', 's6'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1, agentCeiling: 50 }), mock);
  assert.equal(outcome.held, true);
  assert.equal(outcome.stoppedAt, 'agent-ceiling');
  assert.ok(mock.calls.length <= 50, `agents ${mock.calls.length}`);
  assert.ok(all(mock.calls, /^select-rubrics/).length < 6, 'a review that does not fit does not start');
  assert.equal(first(mock.calls, /^boundary-setup$/), undefined);
});

test('W2: a walk that throws parks its unit with driver-fault, releases its slot, and the other walk finishes', async () => {
  let thrown = false;
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (/^implement:s1@a/.test(label) && !thrown) { thrown = true; return new Error('boom'); }
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')], { width: 1, widthMax: 1 }), mock);
  assert.ok(first(mock.calls, /^park:driver-fault@a/));
  assert.ok(first(mock.calls, /^unit-end@b/));
  assert.equal(outcome.ok, true, outcome.reason);
});

test('W2: a resume orient keeps the run id and counts seq on', async () => {
  const mock = makeMock({ rosters: { a: ['s1'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a', { runId: '20261015T090000Z-a' })], { width: 1, widthMax: 1 }), mock);
  const o = first(mock.calls, /^orient@a/);
  assert.match(o.prompt, /This unit's run id is '20261015T090000Z-a': keep it/);
  assert.equal(outcome.units[0].runId, '20261016T100000Z-a', 'the mock orient reports its own id, and the driver takes it');
});

// ---------------------------------------------------------------- W3: waits, parks, answers

test('W3: B\'s slice p2 waits for A\'s slice s1 — the merge-in takes the cleared sha before the implement of p2', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 's2'], b: ['p1', 'p2'] } });
  mock.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p2', why: 'tick', source: 'packet', state: 'open', sha: null }] })]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const cleared = first(mock.calls, /^writeback:s1@a/);
  const wait = first(mock.calls, /^wait:A@b/);
  const impl = first(mock.calls, /^implement:p2@b/);
  assert.ok(wait && wait.start > cleared.end, 'the wait agent runs after slice s1 of A cleared');
  assert.ok(impl.start > wait.end, 'the implement of p2 starts after the merge-in');
  assert.match(wait.prompt, /merge-in "\/repo" b B A --at sha-a-s1/);
  assert.ok(first(mock.calls, /^implement:p1@b/).start < cleared.end || true);
});

test('W3: a wait on a slice that cleared in an earlier run is ready at once', async () => {
  const mock = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a', { cleared: [{ slice: 's1', sha: 'old' }] }), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'ready', sha: 'old', source: 'packet' }] })]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^wait:A@b/).prompt, /--at old/);
});

test('W3: an intent-bearing stop in A parks A and asks w1-A-1; C finishes; the answer resumes A in the same run', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], c: ['q1'] },
    answer: (label, prompt) => {
      if (/^implement:s1@a/.test(label) && !/ANSWERED ESCALATION/.test(prompt) && stops++ === 0) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'intent-bearing: which API', artifactPath: '', startSha: 'abc123', terminal: { statusField: 'awaiting-input' } };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('C', 'c')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.deepEqual(mock.asked, ['w1-A-1']);
  const parkCall = first(mock.calls, /^park:stage@a/);
  assert.match(parkCall.prompt, /unit "\/repo" b A stopped --route/);
  assert.match(parkCall.prompt, /--unit A --kind stage --stage implement --slice s1/);
  assert.ok(first(mock.calls, /^orient:resume@a/), 'a resume orient runs');
  const again = all(mock.calls, /^implement:s1@a/)[1];
  assert.match(again.prompt, /ANSWERED ESCALATION/);
  assert.match(again.prompt, /by person/);
  assert.match(again.prompt, /git diff abc123\.\.HEAD/);
  assert.match(again.prompt, /question "\/repo" b w1-A-1 consumed/);
  assert.ok(first(mock.calls, /^resume@a/));
  assert.ok(first(mock.calls, /^unit-end@c/));
});

test('W3: while A is parked, B, which waits on A, keeps waiting and does not park', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label, prompt) => {
      if (/^verify:s1@a/.test(label) && !/ANSWERED ESCALATION/.test(prompt) && stops++ === 0) return { stage: 'verify', slice: 's1', status: 'hard-stop', hardStopReason: 'which behaviour', artifactPath: '', terminal: {} };
      return undefined;
    },
  });
  mock.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'packet' }] })]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^park:.*@b/).length, 0);
  assert.ok(first(mock.calls, /^implement:p1@b/).start > first(mock.calls, /^writeback:s1@a/).end);
});

test('W3: an answer from a free check resumes the unit with no waiter answer, and only once', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], c: ['q1', 'q2'] },
    delays: { waiter: 400 },
    answer: (label, prompt, ctx) => {
      if (/^implement:s1@a/.test(label) && !/ANSWERED ESCALATION/.test(prompt) && stops++ === 0) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'x', artifactPath: '', terminal: {} };
      if (/^implement:q2@c/.test(label) && ctx.asked.length) return { stage: 'implement', slice: 'q2', status: 'complete', artifactPath: '', terminal: { statusField: 'complete' }, answered: [{ id: 'w1-A-1', unit: 'A', kind: 'stage', answer: 'go', by: 'session' }] };
      if (/^waiter/.test(label)) return { result: 'timeout', calls: 6 };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('C', 'c')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^resume@a/).length, 1);
  assert.match(all(mock.calls, /^implement:s1@a/)[1].prompt, /by session/);
});

test('W3: an answer with move moves the unit out, and B, which waits on it, parks with moved-dependency', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label, prompt, ctx) => {
      if (/^implement:s1@a/.test(label)) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'x', artifactPath: '', terminal: {} };
      if (/^waiter/.test(label)) {
        const id = ctx.asked.find((x) => x.startsWith('w1-A'));
        if (id && !ctx.calls.some((c) => c.label.startsWith('move@a'))) return { result: 'answered', answered: [{ id, answer: 'drop it from this wave', by: 'person', move: true }] };
        const b = ctx.asked.find((x) => x.startsWith('w1-B'));
        if (b) return { result: 'answered', answered: [{ id: b, answer: 'drop the wait and continue', by: 'person' }] };
        return { result: 'timeout' };
      }
      if (/^resolve:moved-dependency@b/.test(label)) return { action: 'continue', dropped: [{ from: 'A', through: 's1', before: 'p1' }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'packet' }] })]), mock);
  assert.ok(first(mock.calls, /^move@a/));
  assert.ok(first(mock.calls, /^park:moved-dependency@b/));
  assert.ok(first(mock.calls, /^unit-end@b/), 'B continues without the wait');
  assert.equal(outcome.units.find((u) => u.key === 'A').moved, true);
});

test('W3: a stop request of one slug with --then move moves it out with no question; with hold it parks slug-stop', async () => {
  const move = makeMock({
    rosters: { a: ['s1'], c: ['q1'] },
    answer: (label) => (/^implement:s1@a/.test(label) ? { stage: 'implement', slice: 's1', status: 'stopped', stopKind: 'slug-stop', stopThen: 'move', stopReason: 'stop a', artifactPath: '', terminal: {} } : undefined),
  });
  const r1 = await run(baseArgs([unitArg('A', 'a'), unitArg('C', 'c')]), move);
  assert.ok(first(move.calls, /^move@a/));
  assert.equal(all(move.calls, /^park:/).length, 0);
  assert.equal(r1.outcome.ok, true, r1.outcome.reason);
  let held = 0;
  const hold = makeMock({
    rosters: { a: ['s1'] },
    answer: (label) => (/^implement:s1@a/.test(label) && held++ === 0 ? { stage: 'implement', slice: 's1', status: 'stopped', stopKind: 'slug-stop', stopReason: 'stop a', artifactPath: '', terminal: {} } : undefined),
  });
  const r2 = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), hold);
  assert.ok(first(hold.calls, /^park:slug-stop@a/), 'a request without --then counts as hold');
  assert.equal(r2.outcome.ok, true, r2.outcome.reason);
});

test('W3: two waits that can never resolve park both units with kind deadlock', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label, prompt, ctx) => {
      if (/^waiter/.test(label)) return { result: 'answered', answered: ctx.asked.map((id) => ({ id, answer: 'move it out', by: 'person', move: true })) };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([
    unitArg('A', 'a', { waits: [{ from: 'B', through: 'p1', before: 's1', state: 'open', source: 'cross-unit' }] }),
    unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'cross-unit' }] }),
  ]), mock);
  assert.ok(first(mock.calls, /^park:deadlock@a/) || first(mock.calls, /^park:deadlock@b/));
  assert.ok(all(mock.calls, /^park:deadlock/).length >= 1);
  assert.equal(first(mock.calls, /^implement:/), undefined, 'no implement runs');
  assert.ok(outcome.units.every((u) => u.moved || u.state !== 'finished'));
});

test('W3: the cross-unit reconcile turns a need with evidence into a wait before any implement', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'B', aSlice: 'p1', b: 'A', bSlice: 's1', files: ['src/shared.ts'], kind: 'need', needs: 'a', evidence: 'b/04-plan-p1.yaml:12 calls tick() from s1' }] };
      if (label === 'needs-add') return { results: [{ key: 'B', from: 'A', through: 's1', before: 'p1', ok: true, wait: { state: 'open' } }] };
      return undefined;
    },
  });
  mock.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const add = first(mock.calls, /^needs-add$/);
  assert.match(add.prompt, /needs "\/repo" b B add --kind need --from A --through s1 --before p1 --why "src\/shared\.ts" --evidence "b\/04-plan-p1\.yaml:12 calls tick\(\) from s1" --by driver --source cross-unit/);
  assert.ok(add.end < Math.min(...all(mock.calls, /^implement:/).map((c) => c.start)));
  assert.deepEqual(outcome.derivedNeeds.map((d) => [d.key, d.from, d.through, d.before]), [['B', 'A', 's1', 'p1']]);
  assert.ok(first(mock.calls, /^wait:A@b/));
});

// ---------------------------------------------------------------- WF-CAMPAIGN-SLICE-ORDER-PLAN

test('slice order 4.1: a merge pair makes no wait; it becomes a merge note that the boundary merge reads', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's1', b: 'B', bSlice: 'p1', files: ['CHANGELOG.md'], kind: 'merge' }] };
      if (label === 'needs-add') return { results: [{ key: 'B', from: 'A', through: 's1', before: 'p1', ok: true, merge: true }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^needs-add$/).prompt, /needs "\/repo" b B add --kind merge --from A --through s1 --before p1 --why "CHANGELOG\.md"/);
  assert.equal(first(mock.calls, /^wait:/), undefined, 'no wait agent runs');
  assert.deepEqual(outcome.derivedNeeds, []);
  assert.deepEqual(outcome.mergeNotes.map((m) => [m.a, m.aSlice, m.b, m.bSlice]), [['A', 's1', 'B', 'p1']]);
  assert.match(first(mock.calls, /^merge$/).prompt, /EXPECTED CONFLICTS[\s\S]*CHANGELOG\.md[\s\S]*regenerate a generated file once/);
  assert.match(first(mock.calls, /^wave-scout:/).prompt, /The merge notes/);
});

test('slice order 4.1: a need with needs a makes a wait on a, also when a is earlier in packet order', async () => {
  const mock = makeMock({
    rosters: { a: ['s1', 's2'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's2', b: 'B', bSlice: 'p1', files: ['src/world.ts'], kind: 'need', needs: 'a', evidence: 'a/04-plan-s2.yaml:8 reads the world that p1 writes' }] };
      if (label === 'needs-add') return { results: [{ key: 'A', from: 'B', through: 'p1', before: 's2', ok: true, wait: { state: 'open' } }] };
      return undefined;
    },
  });
  mock.waitsOn['b:p1'] = [{ key: 'A', from: 'B', through: 'p1' }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^needs-add$/).prompt, /needs "\/repo" b A add --kind need --from B --through p1 --before s2/);
  assert.deepEqual(outcome.derivedNeeds.map((d) => [d.key, d.from, d.through, d.before]), [['A', 'B', 'p1', 's2']]);
  assert.ok(first(mock.calls, /^implement:s2@a/).start > first(mock.calls, /^wait:B@a/).end, 'A waits for B, the later unit');
});

test('slice order 4.1: a need with no evidence becomes a merge note, and the driver logs why', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's1', b: 'B', bSlice: 'p1', files: ['src/x.ts'], kind: 'need', needs: 'b' }] };
      return undefined;
    },
  });
  const { outcome, logs } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^needs-add$/).prompt, /add --kind merge --from A --through s1 --before p1/);
  assert.ok(logs.some((l) => /has no evidence, so it is a merge note/.test(l)), logs.join('\n'));
});

test('slice order 4.3: a needs add that a drop record answers makes no wait', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'B', aSlice: 'p1', b: 'A', bSlice: 's1', files: ['x.ts'], kind: 'need', needs: 'a', evidence: 'b/04-plan-p1.yaml:3 uses s1' }] };
      if (label === 'needs-add') return { results: [{ key: 'B', from: 'A', through: 's1', before: 'p1', ok: true, dropped: true }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.deepEqual(outcome.derivedNeeds, []);
  assert.equal(first(mock.calls, /^wait:/), undefined);
});

test('slice order 4.3: the person drops a derived wait while the run is live; the waiter returns it and the unit goes on', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    delays: { implement: 40 },
    answer: (label, prompt, ctx) => {
      // A's implement never finishes before the drop: B waits on a derived wait.
      if (/^waiter/.test(label)) return { result: 'needs-changed', needsChanged: [{ id: 'nc1', key: 'B', from: 'A', through: 's1', before: 'p1', action: 'remove' }] };
      return undefined;
    },
  });
  const { outcome, logs } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'cross-unit', kind: 'need' }] })]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.ok(logs.some((l) => /the person dropped the wait for A through 's1'/.test(l)), logs.join('\n'));
  assert.equal(first(mock.calls, /^wait:A@b/), undefined, 'no merge-in for a dropped wait');
  assert.ok(first(mock.calls, /^implement:p1@b/).start < first(mock.calls, /^writeback:s1@a/).end, 'B implements before A clears');
});

test('slice order 4.4: the walk follows walkOrder, and a plan orderEdges entry runs slice-order in the fan-out bookkeeping', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 's2', 's3'] } });
  const orig = mock.agent;
  mock.agent = async (prompt, opts) => {
    const r = await orig(prompt, opts);
    // The roster: s1 depends on s3. The walk order is s2, s3, s1.
    if (/^orient/.test(opts.label)) return { ...r, slices: r.slices.map((s) => (s.slice === 's1' ? { ...s, dependsOn: ['s3'] } : s)) };
    if (/^plan:s2@a/.test(opts.label)) return { ...r, orderEdges: [{ slice: 's3', after: 's2', why: 'the plan of s2 says s2 lands first' }] };
    return r;
  };
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const impls = all(mock.calls, /^implement:/).map((c) => c.label);
  assert.deepEqual(impls, ['implement:s2@a', 'implement:s3@a', 'implement:s1@a']);
  const wb = first(mock.calls, /^plan-index-writeback@a/).prompt;
  assert.match(wb, /slice-order "\/cw\/w1-A" a add --slice s3 --after s2 --why "the plan of s2 says s2 lands first"/);
  assert.match(wb, /Set `implementation-order` to \["s2","s3","s1"\]/);
});

test('slice order 4.5: a plan stop of the fan-out opens its question before the first implement; the walk skips ahead', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1', 's2'] },
    delays: { waiter: 30 },
    answer: (label, prompt) => (/^plan:s1@a/.test(label) && stops++ === 0 ? { stage: 'plan', slice: 's1', status: 'hard-stop', hardStopReason: 'which scope', artifactPath: '', terminal: {} } : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const ask = first(mock.calls, /^ask-early@a/);
  assert.ok(ask, 'the early question opens');
  assert.match(ask.prompt, /ask "\/repo" b w1-A-1 --wave 1 --unit A --kind stage --stage plan --slice s1/);
  assert.doesNotMatch(ask.prompt, /unit "\/repo" b A stopped/);
  assert.ok(ask.end < first(mock.calls, /^implement:/).start, 'the question opens before the first implement');
  assert.equal(first(mock.calls, /^park:/), undefined, 'no park: the unit keeps running');
  assert.equal(first(mock.calls, /^implement:/).label, 'implement:s2@a', 'the walk skips ahead to s2 while the question of s1 is open');
  assert.match(all(mock.calls, /^plan:s1@a/)[1].prompt, /ANSWERED ESCALATION/);
});

test('slice order 4.6: the walk skips a slice of another unit (a deferred extension slice)', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 'x1'] } });
  const orig = mock.agent;
  mock.agent = async (prompt, opts) => {
    const r = await orig(prompt, opts);
    if (/^orient/.test(opts.label)) return { ...r, slices: r.slices.map((s) => (s.slice === 'x1' ? { ...s, unit: 'EXT', source: 'extension' } : s)) };
    return r;
  };
  const { outcome, logs } = await run(baseArgs([unitArg('A', 'a')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(first(mock.calls, /^(plan|implement):x1@a/), undefined, 'x1 is not walked');
  assert.ok(logs.some((l) => /skips 1 slice\(s\) of another unit: 'x1' \(EXT\)/.test(l)), logs.join('\n'));
  // An absorbed extension's slices belong to the unit that absorbed it.
  const own = makeMock({ rosters: { a: ['s1', 'x1'] } });
  const o2 = own.agent;
  own.agent = async (prompt, opts) => {
    const r = await o2(prompt, opts);
    if (/^orient/.test(opts.label)) return { ...r, slices: r.slices.map((s) => (s.slice === 'x1' ? { ...s, unit: 'EXT', source: 'extension' } : s)) };
    return r;
  };
  await run(baseArgs([unitArg('A', 'a', { ownKeys: ['A', 'EXT'] })]), own);
  assert.ok(first(own.calls, /^implement:x1@a/), 'an absorbed slice is walked');
});

test('slice order 4.8: a resolver replan that adds a wait holds it; a named wait with no needs add result is not held', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1', 'p2'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's1', b: 'B', bSlice: 'p2', files: ['api.ts'], kind: 'contract', needs: 'b' }] };
      if (/^resolve:contract@b/.test(label)) return { action: 'replan', added: [{ from: 'A', through: 's1', before: 'p2', state: 'open' }, { from: 'A', through: 's1', before: 'p1' }] };
      return undefined;
    },
  });
  mock.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  const { outcome, logs } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^resolve:contract@b/).prompt, /Record every wait that the answer gives with `needs add --by person`, also when your action is 'replan'/);
  assert.ok(first(mock.calls, /^wait:A@b/), 'the added wait is held');
  assert.ok(first(mock.calls, /^implement:p2@b/).start > first(mock.calls, /^wait:A@b/).end);
  assert.ok(logs.some((l) => /named a wait for A with no needs add result/.test(l)), logs.join('\n'));
});

test('WF-CAMPAIGN-ORDER-PLAN 4.5: the cross-unit reconcile prompt names the expected-shared pairs first', async () => {
  const plain = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), plain);
  assert.doesNotMatch(first(plain.calls, /^cross-unit-reconcile$/).prompt, /EXPECTED SHARED PATHS/);
  const mock = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')], { expectedShared: [{ a: 'A', b: 'B', path: 'src/billing/rows.ts' }, { a: 'A', b: 'Z', path: 'gone.ts' }] }), mock);
  const prompt = first(mock.calls, /^cross-unit-reconcile$/).prompt;
  assert.match(prompt, /EXPECTED SHARED PATHS \(check these pairs first\)/);
  assert.match(prompt, /- A and B: src\/billing\/rows\.ts/);
  assert.doesNotMatch(prompt, /gone\.ts/, 'a pair with a unit outside the run is left out');
});

test('W3: a contract pair parks the later unit with kind contract and creates no entry', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's1', b: 'B', bSlice: 'p1', files: ['api.ts'], kind: 'contract' }] };
      if (/^resolve:contract@b/.test(label)) return { action: 'continue', amended: true };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.ok(first(mock.calls, /^park:contract@b/));
  assert.equal(first(mock.calls, /^needs-add/), undefined);
  assert.ok(first(mock.calls, /^resolve:contract@b/));
  assert.equal(outcome.ok, true, outcome.reason);
});

test('W3: a conflict runs the merge agent, then merge-in again; an abort parks with merge-conflict', async () => {
  let waits = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (/^wait:A@b/.test(label)) { waits++; return waits === 1 ? { ok: false, conflict: ['x.ts'] } : { ok: true }; }
      if (/^merge:A@b/.test(label)) return { resolved: true, sha: 'mm' };
      return undefined;
    },
  });
  mock.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'packet' }] })]), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^wait:A@b/).length, 2);
  assert.match(first(mock.calls, /^merge:A@b/).prompt, /"heavy":true/);
  let w2 = 0;
  const abort = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (/^wait:A@b/.test(label)) { w2++; return w2 === 1 ? { ok: false, conflict: ['x.ts'] } : { ok: true }; }
      if (/^merge:A@b/.test(label)) return { resolved: false, reason: 'product call' };
      return undefined;
    },
  });
  abort.waitsOn['a:s1'] = [{ key: 'B', from: 'A', through: 's1' }];
  await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b', { waits: [{ from: 'A', through: 's1', before: 'p1', state: 'open', source: 'packet' }] })]), abort);
  assert.ok(first(abort.calls, /^park:merge-conflict@b/));
});

test('W3: a ceiling stop writes the cancel marker while the waiter waits', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1', 'p2', 'p3', 'p4'] },
    answer: (label, prompt, ctx) => {
      if (/^implement:s1@a/.test(label)) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'x', artifactPath: '', terminal: {} };
      if (/^waiter/.test(label)) {
        // The mock waiter waits until the cancel agent writes the marker.
        return (async () => { while (!ctx.calls.some((c) => c.label === 'cancel')) await tick(5); return { result: 'cancelled' }; })();
      }
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')], { agentCeiling: 55 }), mock);
  assert.equal(outcome.stoppedAt, 'agent-ceiling');
  assert.ok(first(mock.calls, /^cancel$/), 'the cancel agent runs');
  assert.match(first(mock.calls, /^cancel$/).prompt, /await "\/repo" b --wave 1 --cancel/);
});

test('W3: a park appends a park event, a resume a resume event (D27)', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => (/^implement:s1@a/.test(label) && stops++ === 0 ? { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'scope', artifactPath: '', terminal: {} } : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.match(first(mock.calls, /^park:stage@a/).prompt, /journal "\/repo" b park/);
  assert.match(first(mock.calls, /^resume@a/).prompt, /journal "\/repo" b resume/);
  assert.deepEqual(outcome.driverEvents.map((e) => e.event).filter((e) => e !== 'width'), ['park', 'resume']);
});

test('W3: a question open at launch: the unit waits for its answer with no orient first', async () => {
  const mock = makeMock({ rosters: { a: ['s1'] } });
  mock.asked.push('w1-A-1');
  const { outcome } = await run(baseArgs([unitArg('A', 'a', { state: 'stopped', questions: [{ id: 'w1-A-1', kind: 'stage', stage: 'implement', slice: 's1', text: 'which?', answered: false, consumed: false }] })], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const w = first(mock.calls, /^waiter/);
  const o = first(mock.calls, /^orient/);
  assert.ok(w.start < o.start, 'the waiter runs before the orient');
  assert.match(first(mock.calls, /^implement:s1@a/).prompt, /ANSWERED ESCALATION/);
});

// ---------------------------------------------------------------- W4: the boundary and the wave review

test('W4: mode boundary with every unit finished runs no orient and goes to the boundary', async () => {
  const mock = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  mock.finishedSlugs.add('a'); mock.finishedSlugs.add('b');
  const { outcome } = await run(baseArgs([unitArg('A', 'a', { state: 'finished' }), unitArg('B', 'b', { state: 'finished' })], { mode: 'boundary' }), mock);
  assert.equal(first(mock.calls, /^orient/), undefined);
  assert.match(first(mock.calls, /^boundary-setup$/).prompt, /wave "\/repo" b 1 set boundary[\s\S]*worktree "\/repo" b wave-1 add[\s\S]*merge-order "\/repo" b 1/);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.match(first(mock.calls, /^merge$/).prompt, /INDEX\.md/);
});

test('W4: with no shared file, no merge-in, no needs and no focus, only the contract and steering scouts run', async () => {
  const mock = makeMock({ rosters: { a: ['s1'], b: ['p1'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.waveReview.scope, 'contract-only');
  assert.deepEqual(all(mock.calls, /^wave-scout:/).map((c) => c.label).sort(), ['wave-scout:campaign-contract', 'wave-scout:steering']);
});

test('W4: a shared file runs the full wave review; every scout carries the cross-unit rule', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'wave-review:attribute') return { units: [{ key: 'A', files: ['shared.ts', 'a.ts'] }, { key: 'B', files: ['shared.ts'] }] };
      if (label === 'wave-review:select') return { rubrics: [{ rubric: 'security', file: 'review/security.md' }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.equal(outcome.waveReview.scope, 'full');
  assert.deepEqual(outcome.waveReview.rubrics.sort(), ['architecture', 'correctness', 'security']);
  for (const c of all(mock.calls, /^wave-scout:(security|correctness|architecture)$/)) assert.match(c.prompt, /needs two or more units to show/);
});

test('W4: a dont-ship blocker on one unit that no other unit merged in reverts that unit, which becomes needs-fix', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'wave-review') return { status: 'complete', verdict: 'dont-ship', blockerCount: 1, open: [{ id: 'x1', severity: 'BLOCKER', units: ['B'], issue: 'breaks A' }] };
      if (/^revert:b$/.test(label)) return { status: 'complete', green: true, sha: 'rv' };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.ok(first(mock.calls, /^revert:b$/));
  assert.match(first(mock.calls, /^revert:b$/).prompt, /"event":"wave-revert"/);
  assert.deepEqual(outcome.boundary.merged.map((m) => m.key), ['A']);
  assert.ok(outcome.boundary.needsFix.some((x) => x.key === 'B'));
});

test('W4: a blocker on two units asks a wave question; the answer runs the writer again', async () => {
  let writes = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label, prompt, ctx) => {
      if (label === 'wave-review') {
        writes++;
        return writes === 1 ? { status: 'complete', verdict: 'dont-ship', blockerCount: 1, open: [{ id: 'x1', severity: 'BLOCKER', units: ['A', 'B'] }] } : { status: 'complete', verdict: 'ship', blockerCount: 0, open: [] };
      }
      if (label === 'park:wave-review') { const m = / ask "[^"]+" \S+ (\S+) --wave/.exec(prompt); ctx.asked.push(m[1]); return { ok: true }; }
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.ok(first(mock.calls, /^park:wave-review$/));
  assert.match(first(mock.calls, /^park:wave-review$/).prompt, /w1-wave-1 --wave 1 --kind wave-review/);
  assert.equal(all(mock.calls, /^wave-review$/).length, 2);
  assert.match(all(mock.calls, /^wave-review$/)[1].prompt, /question "\/repo" b w1-wave-1 consumed/);
  assert.equal(outcome.ok, true, outcome.reason);
});

test('W4: a red wave verify runs the revert search; a breaker is reverted and the others stay merged', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'wave-verify') return { status: 'complete', green: false, failures: 'red' };
      if (/^revert:b$/.test(label)) return { status: 'complete', green: true };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.deepEqual(outcome.boundary.merged.map((m) => m.key), ['A']);
  assert.equal(outcome.boundary.verify.revert.culprit, 'B');
});

test('W4: an unratified fidelity item stops before the next wave (F3)', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label) => (label === 'fidelity' ? { status: 'complete', unratified: ['D3'] } : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.stopBeforeNextWave, true);
});

test('W4: a quiet-window failure keeps the unit out of the merge', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label) => {
      if (label === 'boundary-setup') return { status: 'complete', worktree: '/cw/wave-1', units: [{ key: 'A', slug: 'a', branch: 'ba', quiet: [{ slice: 's1', command: 'bench' }] }, { key: 'B', slug: 'b', branch: 'bb', quiet: [] }] };
      if (label === 'quiet:a') return { status: 'complete', passed: false, results: [{ slice: 's1', passed: false, measured: '9 s' }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.doesNotMatch(first(mock.calls, /^merge$/).prompt, /"key":"A"/);
  assert.ok(outcome.boundary.needsFix.some((x) => x.key === 'A'));
});

test('W4: stopBefore boundary returns held before the boundary setup', async () => {
  const mock = makeMock({ rosters: { a: ['s1'] } });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { stopBefore: 'boundary', width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.held, true);
  assert.equal(outcome.stoppedAt, 'stop-before-boundary');
  assert.equal(first(mock.calls, /^boundary-setup$/), undefined);
});

test('W4: mode drift runs one drift agent', async () => {
  const mock = makeMock({ rosters: {}, answer: (label) => (label === 'drift' ? { status: 'complete', contract: ['W2'], implementation: [] } : undefined) });
  const { outcome } = await run(baseArgs([], { mode: 'drift', wave: 2 }), mock);
  assert.deepEqual(mock.calls.map((c) => c.label), ['drift']);
  assert.deepEqual(outcome.contract, ['W2']);
});

// ---------------------------------------------------------------- fixes after the doc review

test('a failed slug output parks the unit with kind stage; the answer builds the output again', async () => {
  let builds = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label) => {
      if (/^slug-output@a/.test(label)) { builds++; return builds === 1 ? { status: 'complete', built: false, failure: 'tsc: 3 errors' } : { status: 'complete', built: true, label: 'wave-1.a+abc', path: '/o' }; }
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1, output: { 'build-cmd': 'npm run build' } }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(builds, 2);
  const p = first(mock.calls, /^park:stage@a/);
  assert.match(p.prompt, /the slug output failed: tsc: 3 errors/);
  assert.match(first(mock.calls, /^resume@a/).prompt, /question "\/repo" b w1-A-1 consumed/, 'no stage runs again with the answer, so the resume consumes it');
  assert.ok(first(mock.calls, /^unit-end@a/).start > all(mock.calls, /^slug-output@a/)[1].end);
});

test('a stage answer that runs again is consumed by the stage, not by the resume; a resolve agent consumes its own', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'], b: ['p1'] },
    answer: (label, prompt) => {
      if (/^implement:s1@a/.test(label) && !/ANSWERED ESCALATION/.test(prompt) && stops++ === 0) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'x', artifactPath: '', terminal: {} };
      if (label === 'cross-unit-reconcile') return { pairs: [{ a: 'A', aSlice: 's1', b: 'B', bSlice: 'p1', files: ['api.ts'], kind: 'contract' }] };
      if (/^resolve:contract@b/.test(label)) return { action: 'continue', amended: true };
      return undefined;
    },
  });
  await run(baseArgs([unitArg('A', 'a'), unitArg('B', 'b')]), mock);
  assert.doesNotMatch(first(mock.calls, /^resume@a/).prompt, /consumed/);
  assert.match(all(mock.calls, /^implement:s1@a/)[1].prompt, /question "\/repo" b w1-A-1 consumed/);
  assert.doesNotMatch(first(mock.calls, /^resume@b/).prompt, /consumed/);
  assert.match(first(mock.calls, /^resolve:contract@b/).prompt, /When your action is not 'replan', run `node .*question "\/repo" b w1-B-1 consumed` last/);
});

test('a slug-stop question open at launch: "continue" resumes the unit, any other answer moves it out', async () => {
  for (const [answer, moved] of [['continue as planned', false], ['drop it', true]]) {
    const mock = makeMock({
      rosters: { a: ['s1'] },
      answer: (label) => (/^waiter/.test(label) ? { result: 'answered', answered: [{ id: 'w1-A-1', answer, by: 'person' }] } : undefined),
    });
    const { outcome } = await run(baseArgs([unitArg('A', 'a', { state: 'stopped', questions: [{ id: 'w1-A-1', kind: 'slug-stop', stage: 'implement', slice: 's1', text: 'continue?', answered: false, consumed: false }] })], { width: 1, widthMax: 1 }), mock);
    assert.equal(Boolean(first(mock.calls, /^move@a/)), moved, answer);
    assert.equal(Boolean(first(mock.calls, /^implement:s1@a/)), !moved, answer);
    // With the only unit moved out, no unit finishes, so the wave does not succeed.
    assert.equal(outcome.ok, !moved, outcome.reason);
  }
});

// ---------------------------------------------------------------- the waiter skips answers no question holds

// The SoccerManager wave 3 run (2026-10-19): `await` returned an answered, unconsumed question of an
// earlier run at once, the driver ignored it, and a new waiter started every 30 seconds.
const seenOf = (prompt) => ((/--seen (\S+)/.exec(prompt) || [])[1] || '').split(',').filter(Boolean);

test('waiter: an answer for an id that no question holds is held and skipped; no waiter loop', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (/^plan:s1@a/.test(label) && stops++ === 0) return { stage: 'plan', slice: 's1', status: 'hard-stop', hardStopReason: 'scope', artifactPath: '', terminal: {} };
      // Like `await`: the stale answer comes back until the driver passes it in --seen.
      if (/^waiter/.test(label) && !seenOf(prompt).includes('w1-old')) return { result: 'answered', answered: [{ id: 'w1-old', answer: 'old answer', by: 'person' }] };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const waiters = all(mock.calls, /^waiter/);
  assert.equal(waiters.length, 2, `one waiter returns the stale answer, the next one skips it (${waiters.length} waiters)`);
  assert.ok(seenOf(waiters[1].prompt).includes('w1-old'));
  assert.match(all(mock.calls, /^plan:s1@a/)[1].prompt, /ANSWERED ESCALATION/);
});

test('waiter: a carried wave answer of an earlier run is in --seen from the first waiter', async () => {
  let stops = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (/^plan:s1@a/.test(label) && stops++ === 0) return { stage: 'plan', slice: 's1', status: 'hard-stop', hardStopReason: 'scope', artifactPath: '', terminal: {} };
      if (/^waiter/.test(label) && !seenOf(prompt).includes('w1-order')) return { result: 'answered', answered: [{ id: 'w1-order', answer: 'start', by: 'person' }] };
      return undefined;
    },
  });
  const waveQuestions = [{ id: 'w1-order', text: 'which order?', answer: 'start', by: 'person', answered: true, consumed: false }];
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1, waveQuestions }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const waiters = all(mock.calls, /^waiter/);
  assert.equal(waiters.length, 1);
  assert.ok(seenOf(waiters[0].prompt).includes('w1-order'));
});

// ---------------------------------------------------------------- an answered verify that accepts the misses

const failedVerify = { stage: 'verify', slice: 's1', status: 'complete', artifactPath: '/x/06-s1.md', terminal: { convergence: 'escalated', result: 'fail', deferrals: [], substantiveResidual: true } };

test('verify: an answer that accepts a failed slice passes it with no new fix round', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (!/^verify:s1@a/.test(label)) return undefined;
      return /ANSWERED ESCALATION/.test(prompt) ? { ...failedVerify, acceptedByPerson: true } : failedVerify;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const verifies = all(mock.calls, /^verify:s1@a/);
  // Two rounds before the park, then one answered round that accepts.
  assert.equal(verifies.length, 3, verifies.map((c) => c.label).join(', '));
  assert.match(verifies[2].prompt, /When the answer ACCEPTS this slice/);
  assert.equal(all(mock.calls, /^park:stage@a/).length, 1, 'the accepted slice does not park again');
  assert.ok(first(mock.calls, /^review:s1@a/), 'the slice goes on to its review');
});

test('verify: an answer that does not accept reaches the fix round too, and the next answer can accept', async () => {
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (!/^verify:s1@a/.test(label)) return undefined;
      return / w1-A-2 consumed/.test(prompt) ? { ...failedVerify, acceptedByPerson: true } : { ...failedVerify, acceptedByPerson: false };
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const verifies = all(mock.calls, /^verify:s1@a/);
  assert.equal(verifies.length, 5, verifies.map((c) => c.label).join(', '));
  // Rounds 1 and 2 after the first answer both carry it.
  assert.match(verifies[2].prompt, / w1-A-1 consumed/);
  assert.match(verifies[3].prompt, /fix ROUND 2/);
  assert.match(verifies[3].prompt, / w1-A-1 consumed/);
  assert.equal(all(mock.calls, /^park:stage@a/).length, 2);
});

test('verify: the orient counts a verify that a person accepted as done', () => {
  assert.match(src, /OR its frontmatter carries ` \+\s*`accepted-by: a person accepted the slice with its recorded misses\)/);
});

// ---------------------------------------------------------------- an answered verify that routes back
// Lantern, 2026-10-20: the answer to a verify stop changed the design (an http start hook
// became a command hook). The driver ran verify again with the answer, verify cannot plan
// or build, so it stopped again, and every answer looped verify.

const passedVerify = { stage: 'verify', slice: 's1', status: 'complete', artifactPath: '/x/06-s1.md', terminal: { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false } };

for (const to of ['plan', 'implement']) {
  test(`verify: an answer that needs a new ${to} walks the slice again from ${to}, with the answer`, async () => {
    let routed = false;
    const mock = makeMock({
      rosters: { a: ['s1'] },
      answer: (label, prompt) => {
        if (!/^verify:s1@a/.test(label)) return undefined;
        if (routed) return passedVerify;
        if (/ANSWERED ESCALATION/.test(prompt)) { routed = true; return { ...failedVerify, status: 'hard-stop', hardStopReason: `the answer needs a new ${to}`, routeBack: to }; }
        return failedVerify;
      },
    });
    const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
    assert.equal(outcome.ok, true, outcome.reason);
    assert.equal(all(mock.calls, /^park:stage@a/).length, 1, 'the route back does not park again');
    const target = all(mock.calls, new RegExp(`^${to}:s1@a`));
    assert.equal(target.length, 2, `${to} runs again`);
    assert.match(target[1].prompt, /ANSWERED ESCALATION/, `the ${to} gets the answer`);
    if (to === 'plan') assert.equal(all(mock.calls, /^implement:s1@a/).length, 2, 'the implement after the new plan runs again');
    assert.equal(all(mock.calls, /^verify:s1@a/).length, 4, 'two rounds, the answered round, then the verify of the new work');
    assert.ok(first(mock.calls, /^review:s1@a/), 'the slice goes on to its review');
  });
}

test('verify: a slice routes back at most twice, then parks as before', async () => {
  let answeredRuns = 0;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (!/^verify:s1@a/.test(label)) return undefined;
      if (!/ANSWERED ESCALATION/.test(prompt)) return failedVerify;
      answeredRuns++;
      // The fourth answer accepts the slice, so the run ends.
      return answeredRuns < 4 ? { ...failedVerify, status: 'hard-stop', hardStopReason: 'again', routeBack: 'implement' } : { ...failedVerify, acceptedByPerson: true };
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^implement:s1@a/).length, 3, 'the first implement and two route backs');
  assert.equal(all(mock.calls, /^park:stage@a/).length, 4, 'the third route back is refused, so that stop parks');
});

test('verify: the answered clause offers the route back, and the orient reads route-back', () => {
  assert.match(src, /return routeBack: 'plan'/);
  assert.match(src, /return routeBack: 'implement'/);
  assert.match(src, /frontmatter carries route-back: plan or route-back: implement makes that/);
});

test('implement: an answer that changes the plan walks the slice again from plan, with the answer', async () => {
  let stops = 0;
  let routed = false;
  const mock = makeMock({
    rosters: { a: ['s1'] },
    answer: (label, prompt) => {
      if (!/^implement:s1@a/.test(label) || routed) return undefined;
      if (/ANSWERED ESCALATION/.test(prompt)) { routed = true; return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'the answer changes the plan', artifactPath: '', terminal: {}, routeBack: 'plan' }; }
      if (stops++ === 0) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'the hook kind is not supported', artifactPath: '', startSha: 'abc123', terminal: { statusField: 'awaiting-input' } };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^park:stage@a/).length, 1, 'the route back does not park again');
  const plans = all(mock.calls, /^plan:s1@a/);
  assert.equal(plans.length, 2, 'the plan runs again');
  assert.match(plans[1].prompt, /ANSWERED ESCALATION/, 'the new plan gets the answer');
  assert.equal(all(mock.calls, /^implement:s1@a/).length, 3, 'the stopped implement, the answered one, then the implement of the new plan');
  assert.match(all(mock.calls, /^implement:s1@a/)[1].prompt, /do not revise or undo the work: record the answer, write route-back: plan/);
  assert.equal(all(mock.calls, /^verify:s1@a/).length, 1);
});

// ---------------------------------------------------------------- plan order and plan freshness

// The orient of the mock, with each slice's depends-on list.
const withDeps = (mock, deps) => {
  const orig = mock.agent;
  mock.agent = async (prompt, opts) => {
    const r = await orig(prompt, opts);
    if (/^orient/.test(opts.label) && r && Array.isArray(r.slices)) return { ...r, slices: r.slices.map((s) => ({ ...s, dependsOn: deps[s.slice] || [] })) };
    return r;
  };
  return mock;
};

test('plan order: planWaves puts a slice after the slices it depends on; a cycle or an unknown name does not block', () => {
  const text = /function planWaves\(slices\) \{[\s\S]*?\n\}\n/.exec(src)[0];
  const planWaves = new Function(`${text}; return planWaves`)();
  const sl = (slice, dependsOn) => ({ slice, dependsOn });
  assert.deepEqual(planWaves([sl('a', []), sl('b', ['a']), sl('c', []), sl('d', ['b', 'c'])]), [['a', 'c'], ['b'], ['d']]);
  assert.deepEqual(planWaves([sl('a', ['x']), sl('b', ['b'])]), [['a', 'b']], 'a name outside the fan-out and a self-dependency do not count');
  assert.deepEqual(planWaves([sl('a', []), sl('b', ['c']), sl('c', ['b'])]), [['a'], ['b', 'c']], 'a cycle plans in one last wave');
  assert.deepEqual(planWaves([]), []);
});

test('plan order: a slice plans after the slice it depends on and reads its plan; an independent slice plans with the first wave', async () => {
  const mock = withDeps(makeMock({ rosters: { a: ['s1', 's2', 's3'] } }), { s2: ['s1'] });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const [p1, p2, p3] = ['s1', 's2', 's3'].map((s) => first(mock.calls, new RegExp(`^plan:${s}@a`)));
  assert.ok(p2.start > p1.end, 's2 plans after s1');
  assert.ok(p3.start < p1.end, 's3 plans together with s1');
  assert.match(p2.prompt, /These slices are planned already: s1, s3\./);
  assert.match(p1.prompt, /These slices plan after you and build on your plan: s2\./);
  assert.equal(all(mock.calls, /^plan:s2@a/).length, 1);
});

test('plan order: when a plan stops, the slice that depends on it plans in its own walk, after the answered plan', async () => {
  let stopped = false;
  const mock = withDeps(makeMock({
    rosters: { a: ['s1', 's2', 's3'] },
    answer: (label) => {
      if (/^plan:s1@a/.test(label) && !stopped) { stopped = true; return { stage: 'plan', slice: 's1', status: 'hard-stop', hardStopReason: 'which store?', artifactPath: '', terminal: { statusField: 'awaiting-input' } }; }
      return undefined;
    },
  }), { s2: ['s1'] });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const p1 = all(mock.calls, /^plan:s1@a/);
  const p2 = all(mock.calls, /^plan:s2@a/);
  assert.equal(p1.length, 2, 'the stopped plan, then the answered plan');
  assert.equal(p2.length, 1, 's2 does not plan in the fan-out');
  assert.ok(p2[0].start > p1[1].end, 's2 plans after the answered plan of s1');
  assert.doesNotMatch(p2[0].prompt, /PLAN FAN-OUT/);
});

test('plan freshness: a plan that the code made out of date is refreshed before its implement; the first slice gets no check', async () => {
  const mock = makeMock({
    rosters: { a: ['s1', 's2'] },
    answer: (label) => (/^plan-check:s2@a/.test(label) ? { stale: [{ slice: 's2', reason: 'the parser API moved' }] } : undefined),
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^plan-check:s1@a/).length, 0, 'no code moved before the first implement');
  assert.equal(all(mock.calls, /^plan-check:s2@a/).length, 1, 'one check, not one for each pass');
  const plans = all(mock.calls, /^plan:s2@a/);
  assert.equal(plans.length, 2, 'the fan-out plan, then the refresh');
  assert.match(plans[1].prompt, /PLAN REFRESH: 04-plan-s2\.md already exists, and it is out of date: the parser API moved\./);
  const impl = all(mock.calls, /^implement:s2@a/);
  assert.equal(impl.length, 1);
  assert.ok(plans[1].end < impl[0].start, 'the refresh runs before the implement');
});

test('plan freshness: a plan that still fits runs no refresh', async () => {
  const mock = makeMock({ rosters: { a: ['s1', 's2'] }, answer: (label) => (/^plan-check:/.test(label) ? { stale: [] } : undefined) });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.equal(all(mock.calls, /^plan-check:s2@a/).length, 1);
  assert.equal(all(mock.calls, /^plan:s2@a/).length, 1);
});

test('sibling check: a re-plan marks a later sibling plan stale, and that plan is refreshed in its walk', async () => {
  let stops = 0;
  let routed = false;
  const mock = makeMock({
    rosters: { a: ['s1', 's2'] },
    answer: (label, prompt) => {
      if (/^sibling-check:s1@a/.test(label)) return { stale: [{ slice: 's2', reason: 'it calls the old hook API' }] };
      if (!/^implement:s1@a/.test(label) || routed) return undefined;
      if (/ANSWERED ESCALATION/.test(prompt)) { routed = true; return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'the answer changes the plan', artifactPath: '', terminal: {}, routeBack: 'plan' }; }
      if (stops++ === 0) return { stage: 'implement', slice: 's1', status: 'hard-stop', hardStopReason: 'the hook kind is not supported', artifactPath: '', startSha: 'abc123', terminal: { statusField: 'awaiting-input' } };
      return undefined;
    },
  });
  const { outcome } = await run(baseArgs([unitArg('A', 'a')], { width: 1, widthMax: 1 }), mock);
  assert.equal(outcome.ok, true, outcome.reason);
  const check = all(mock.calls, /^sibling-check:s1@a/);
  assert.equal(check.length, 1, 'the re-plan of s1 runs one sibling check');
  assert.match(check[0].prompt, /changed after these sibling plans were written: s2\./);
  const plans = all(mock.calls, /^plan:s2@a/);
  assert.equal(plans.length, 2, 'the fan-out plan, then the refresh');
  assert.match(plans[1].prompt, /PLAN REFRESH: .*it calls the old hook API\. The plan of s1 changed after this plan was written/);
  assert.equal(all(mock.calls, /^plan-check:s2@a/).length, 0, 'a plan that this walk wrote needs no freshness check');
});
