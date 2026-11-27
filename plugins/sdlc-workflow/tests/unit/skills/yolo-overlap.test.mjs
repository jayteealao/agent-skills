// The work that the slug walk overlaps: the plan of the next slice (planAhead), the verify of
// the slice before (verifyBehind), a second slice with no shared file (pairSlices), and the one
// send-back of a verify that still fails after its fix rounds. The whole script runs with a
// mock `agent` that answers by label.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const yoloSrc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', yoloSrc.replace('export const meta', 'const meta'));

const TODO = { plan: 'todo', implement: 'todo', verify: 'todo', review: 'n-a' };
const slice = (name, extra = {}) => ({ slice: name, status: 'defined', reverifyReason: 'none', stages: TODO, dependsOn: [], complexity: 'm', ...extra });
const orientResult = (slices, strategy) => ({
  ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed',
  runId: '20261124T100000Z-demo', charter: [], priorDeferrals: [],
  branch: { current: 'b', target: 'b', match: true, base: 'main', strategy },
  slices,
});

const PASS = { convergence: 'converged', result: 'pass', deferrals: [], substantiveResidual: false };
const FAIL = { convergence: 'escalated', result: 'fail', deferrals: [], substantiveResidual: true };
let commit = 0;
const sha = () => (0xabc0000 + (commit += 1)).toString(16).padStart(8, '0');

function answerOf(label) {
  const [stage, sl] = String(label).split(':');
  if (stage === 'plan') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' } };
  if (stage === 'implement') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' }, headStart: sha(), headEnd: sha() };
  if (stage === 'verify') return { stage, slice: sl, status: 'complete', artifactPath: 'x', terminal: PASS, sliceWriteBack: { ok: true, wrote: ['00-index.md'] } };
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (stage === 'scout') return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0 } };
  if (stage === 'writeback') return { ok: true, wrote: ['00-index.md'] };
  if (stage === 'roster') return { slices: [] };
  if (stage === 'merge') return { ok: true };
  return undefined;
}

async function run(slices, { args = {}, answer = () => undefined, strategy = 'dedicated', orient = {} } = {}) {
  const calls = [];
  const logs = [];
  const agent = async (prompt, opts = {}) => {
    const call = { label: opts.label, prompt, n: calls.filter((c) => c.label === opts.label).length + 1 };
    calls.push(call);
    if (opts.label === 'orient') return { ...orientResult(slices, strategy), ...orient };
    // One turn of the event loop, so that work started together can overlap.
    await new Promise((r) => setImmediate(r));
    const own = answer(call);
    return own !== undefined ? own : answerOf(opts.label);
  };
  const outcome = await driver(
    { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo', ...args },
    agent, (m) => logs.push(m), () => {}, async (fns) => Promise.all(fns.map((f) => f())),
  );
  const labels = calls.map((c) => c.label);
  const at = (l, n = 1) => labels.reduce((found, x, i) => (x === l && (n -= 1) === 0 ? i : found), -1);
  const prompt = (l, n = 1) => (calls.find((c) => c.label === l && c.n === n) || {}).prompt || '';
  return { outcome, calls, labels, logs, at, prompt, count: (l) => labels.filter((x) => x === l).length };
}

test('the plan of the next slice starts when this implement starts, runs once, and is checked against the code', async () => {
  const r = await run([slice('a'), slice('b')], { args: { verifyBehind: false } });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('plan:b'), 1);
  // It starts with the implement of a: after the plan of a, before the verify of a.
  assert.ok(r.at('plan:b') > r.at('plan:a') && r.at('plan:b') < r.at('verify:a'), r.labels.join(' '));
  assert.equal(Math.abs(r.at('plan:b') - r.at('implement:a')), 1, r.labels.join(' '));
  assert.match(r.prompt('plan:b'), /PLAN AHEAD: slice 'a' is being built/);
  assert.doesNotMatch(r.prompt('plan:a'), /PLAN AHEAD/);
  // The code of a moved after the plan of b was started: one plan check, which knows which slice was built.
  assert.equal(r.count('plan-check:b'), 1);
  assert.match(r.prompt('plan-check:b'), /slice-files "\/repo" demo b a --json/);
  assert.ok(r.at('plan-check:b') < r.at('implement:b'));
  assert.ok(r.logs.some((m) => /plan:b was written ahead, during the implement of 'a'/.test(m)), r.logs.join('\n'));
});

test('a plan written ahead that is out of date is refreshed before its implement', async () => {
  const r = await run([slice('a'), slice('b')], { answer: (c) => (c.label === 'plan-check:b' ? { stale: [{ slice: 'b', reason: 'a moved the store' }] } : undefined) });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('plan:b'), 2);
  assert.match(r.prompt('plan:b', 2), /PLAN REFRESH: .*a moved the store/);
  assert.ok(r.at('plan:b', 2) < r.at('implement:b'));
});

test('no plan is written ahead with planAhead false, or for a slice that needs the code of this one', async () => {
  const off = await run([slice('a'), slice('b')], { args: { planAhead: false, verifyBehind: false } });
  assert.equal(off.outcome.ok, true, off.outcome.reason);
  assert.doesNotMatch(off.prompt('plan:b'), /PLAN AHEAD/);
  assert.ok(off.at('plan:b') > off.at('verify:a'));
  const dep = await run([slice('a'), slice('b', { dependsOn: ['a'] })], { args: { verifyBehind: false } });
  assert.doesNotMatch(dep.prompt('plan:b'), /PLAN AHEAD/);
  assert.ok(dep.at('plan:b') > dep.at('verify:a'));
});

test('the verify of a slice runs behind by default, fixes code on its own branch, and is merged at the next slice boundary', async () => {
  const r = await run([slice('a'), slice('b')]);
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('verify:a'), 1);
  assert.match(r.prompt('verify:a'), /VERIFY BEHIND\. .*at commit [0-9a-f]{8}, in its own copy of the repo:/s);
  assert.match(r.prompt('verify:a'), /worktree add "\/repo" demo verify-a [0-9a-f]{8}/);
  // The branch is made new: a branch that exists holds the fixes of an earlier run, and is never moved.
  assert.match(r.prompt('verify:a'), /git switch -c verify\/demo\/a`\. When git says that the branch exists, it holds the fix commits of an earlier run: stop/);
  assert.match(r.prompt('verify:a'), /Run the fix loop as verify\.md says \(Step 7\.6\), in the copy/);
  assert.doesNotMatch(r.prompt('verify:a'), /Change no code/);
  assert.ok(r.at('verify:a') < r.at('implement:b'), 'the verify of a starts before the implement of b');
  // The fix commits join the tip after the implement of b, before the verify of b.
  assert.ok(r.at('merge:a') > r.at('implement:b') && r.at('merge:a') < r.at('verify:b'), r.labels.join(' '));
  assert.match(r.prompt('merge:a'), /merge --no-ff .* verify\/demo\/a/);
  // The last slice has no slice after it: its verify runs in the main checkout.
  assert.doesNotMatch(r.prompt('verify:b'), /VERIFY BEHIND/);
  assert.ok(r.logs.some((m) => /verify:a passed behind/.test(m)), r.logs.join('\n'));
});

test('verifyBehind false, or a branch that takes no commit, verifies each slice before the next one starts', async () => {
  for (const o of [{ args: { verifyBehind: false } }, { strategy: 'none' }]) {
    const r = await run([slice('a'), slice('b')], o);
    assert.equal(r.outcome.ok, true, r.outcome.reason);
    assert.doesNotMatch(r.prompt('verify:a'), /VERIFY BEHIND/);
    assert.ok(r.at('verify:a') < r.at('implement:b'));
    assert.equal(r.count('merge:a'), 0);
  }
});

test('a verify branch that the merge stage cannot merge stops the run with the branch kept: its fixes are never left behind', async () => {
  const r = await run([slice('a'), slice('b')], { answer: (c) => (c.label === 'merge:a' ? { ok: false, conflicts: ['src/x.js'], note: 'both sides rewrote the parser' } : undefined) });
  assert.equal(r.outcome.ok, false);
  assert.equal(r.outcome.stoppedAt, 'merge');
  assert.match(r.outcome.reason, /the fix branch verify\/demo\/a of the verify of 'a' is not merged: a conflict in src\/x\.js \(both sides rewrote the parser\)\. Its fixes are on that branch/);
  assert.equal(r.count('verify:a'), 1, 'no second verify runs without the fixes');
  assert.equal(r.count('verify:b'), 0);
});

test('a fix branch that an earlier run left is merged before any other work, and a run stops when it cannot be', async () => {
  const left = { leftoverBranches: [{ branch: 'verify/demo/a', kind: 'verify', slice: 'a', ahead: 2 }] };
  const done = [slice('a', { status: 'in-progress', stages: { plan: 'done', implement: 'done', verify: 'todo', review: 'n-a' } }), slice('b')];
  const r = await run(done, { orient: left });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.labels[r.at('orient') + 1], 'merge:a', 'the merge is the first work of the run');
  assert.ok(r.logs.some((l) => /the branch verify\/demo\/a holds 2 commits of an earlier run that HEAD does not have/.test(l)));
  assert.match(r.prompt('orient'), /worktree leftovers "\/repo" demo --json/);
  // The merge cannot be made: no stage runs on code that lacks the fixes.
  const stop = await run(done, { orient: left, answer: (c) => (c.label === 'merge:a' ? { ok: false, conflicts: ['src/x.js'] } : undefined) });
  assert.equal(stop.outcome.stoppedAt, 'merge');
  assert.match(stop.outcome.reason, /holds 2 commits of an earlier run that HEAD does not have, and they could not be merged: a conflict in src\/x\.js/);
  assert.equal(stop.count('verify:a') + stop.count('plan:b'), 0);
  // The steps of a slice that was built in a scratch copy: the run does not build that slice again without them.
  const side = await run(done, { orient: { leftoverBranches: [{ branch: 'side/demo/b', kind: 'side', slice: 'b', ahead: 4 }] } });
  assert.equal(side.outcome.stoppedAt, 'merge');
  assert.match(side.outcome.route, /merge side\/demo\/b with a merge commit/);
  assert.equal(side.count('implement:b'), 0);
});

test('the merge stage resolves a conflict, and does not refuse over a changed file that the merge does not touch', async () => {
  const r = await run([slice('a'), slice('b')]);
  const p = r.prompt('merge:a');
  assert.match(p, /MERGE STAGE: the side branch verify\/demo\/a of slice 'a'/);
  assert.match(p, /A file with an uncommitted change that the merge does not touch is not yours and does not block/);
  assert.doesNotMatch(p, /status --porcelain/, 'no refusal over every changed file of the checkout');
  assert.match(p, /When the merge stops on a conflict, resolve it\./);
  assert.match(p, /Never take one whole side to make it merge, and never delete or weaken a test to make it merge/);
  assert.match(p, /04-plan-a\.md.*04-plan-b\.md/s, 'the plans of both slices');
  assert.match(p, /run `git -C "\/repo" merge --abort` and return \{ ok: false, conflicts/);
});

test('the verify behind hands each fix over in the talk, and the implement beside it merges at a safe step', async () => {
  const r = await run([slice('a'), slice('b'), slice('c')]);
  const v = r.prompt('verify:a');
  assert.match(v, /\(3a\) Hand each fix commit over at once, to slice 'b', which is being built now: `[^`]*talk post "\/repo" demo --as verify:a --to b --kind handover/);
  assert.match(v, /\(3b\) When that agent asks whether more fixes are coming, reply/);
  assert.match(v, /\(3c\) When your verdict is written, post it: `--kind done --to b/);
  const i = r.prompt('implement:b');
  assert.match(i, /VERIFY BESIDE YOU\. The verify of slice 'a' runs now, in its own copy of the repo, on the branch verify\/demo\/a/);
  assert.match(i, /\(2\) On a conflict, resolve it: read both sides, and write the file so that the change of each side holds/);
  assert.match(i, /\(3\) Before a step that the plan marks \(after-merge\)/);
  assert.match(i, /--to verify:a --wants-reply --fallback "go on with the step"/);
  assert.match(i, /\(4\) Before your slice checks, merge the branch once more/);
  assert.doesNotMatch(r.prompt('implement:a'), /VERIFY BESIDE YOU/, 'the first slice has no verify beside it');
});

test('a verify behind that made fix commits has its slice checks run again on the merged code', async () => {
  const fixed = (c) => (c.label === 'verify:a' && c.n === 1 ? { stage: 'verify', slice: 'a', status: 'complete', artifactPath: 'x', terminal: PASS, headEnd: 'fff00001', sliceWriteBack: { ok: true, wrote: ['00-index.md'] } } : undefined);
  const ok = await run([slice('a'), slice('b')], { answer: (c) => fixed(c) ?? (c.label === 'recheck:a' ? { ok: true } : undefined) });
  assert.equal(ok.outcome.ok, true, ok.outcome.reason);
  assert.equal(ok.count('recheck:a'), 1);
  assert.match(ok.prompt('recheck:a'), /SLICE RE-CHECK for slice 'a'.*Change, fix and commit nothing/s);
  assert.equal(ok.count('verify:a'), 1);
  assert.ok(ok.at('recheck:a') > ok.at('merge:a') && ok.at('recheck:a') < ok.at('verify:b'), ok.labels.join(' '));
  // A red on the merged code: the verify runs again, at the tip.
  const red = await run([slice('a'), slice('b')], { answer: (c) => fixed(c) ?? (c.label === 'recheck:a' ? { ok: false, reds: ['guard set: parser_roundtrip'] } : undefined) });
  assert.equal(red.outcome.ok, true, red.outcome.reason);
  assert.equal(red.count('verify:a'), 2);
  assert.doesNotMatch(red.prompt('verify:a', 2), /VERIFY BEHIND/);
  assert.ok(red.logs.some((m) => /do not pass on the merged code \(guard set: parser_roundtrip\)/.test(m)), red.logs.join('\n'));
  // No fix commit and no conflict: the result of the verify stands with no second run of the checks.
  const plain = await run([slice('a'), slice('b')]);
  assert.equal(plain.count('recheck:a'), 0);
  // A conflict that the merge stage resolved: the checks run again.
  const joined = await run([slice('a'), slice('b')], { answer: (c) => (c.label === 'merge:a' ? { ok: true, merged: true, resolved: ['src/x.js'] } : c.label === 'recheck:a' ? { ok: true } : undefined) });
  assert.equal(joined.count('recheck:a'), 1);
  assert.ok(joined.logs.some((m) => /a conflict was resolved in src\/x\.js/.test(m)));
});

test('a verify that fails behind runs again in the main checkout, with its fix rounds', async () => {
  const r = await run([slice('a'), slice('b')], {
    answer: (c) => (c.label === 'verify:a' && c.n === 1 ? { stage: 'verify', slice: 'a', status: 'hard-stop', artifactPath: 'x', terminal: FAIL, hardStopReason: 'AC-2 fails' } : undefined),
  });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('verify:a'), 2);
  assert.doesNotMatch(r.prompt('verify:a', 2), /VERIFY BEHIND/);
  assert.ok(r.at('verify:a', 2) > r.at('implement:b'), 'the second verify of a runs at the next slice boundary');
});

test('an xs slice is not verified behind: its implement agent verifies it', async () => {
  const r = await run([slice('a', { complexity: 'xs' }), slice('b')], {
    answer: (c) => (c.label === 'implement:a' ? { stage: 'implement', slice: 'a', status: 'complete', artifactPath: 'x', terminal: { statusField: 'complete' }, headStart: sha(), headEnd: sha(), verify: { status: 'complete', terminal: PASS, sliceWriteBack: { ok: true, wrote: ['00-index.md'] } } } : undefined),
  });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('verify:a'), 0);
});

test('a verify that still fails after its fix rounds goes back to implement once', async () => {
  const fail = { stage: 'verify', slice: 'a', status: 'hard-stop', artifactPath: 'x', terminal: FAIL, hardStopReason: 'AC-3 still fails' };
  const r = await run([slice('a')], { answer: (c) => (c.label === 'verify:a' && c.n <= 2 ? fail : undefined) });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('implement:a'), 2);
  assert.match(r.prompt('implement:a', 2), /VERIFY SENT THIS SLICE BACK\. .*AC-3 still fails/s);
  assert.doesNotMatch(r.prompt('implement:a', 1), /VERIFY SENT THIS SLICE BACK/);
  assert.equal(r.count('verify:a'), 3);
  // Still failing after the send-back: the run stops, and does not send back again.
  const twice = await run([slice('a')], { answer: (c) => (c.label === 'verify:a' ? fail : undefined) });
  assert.equal(twice.outcome.stopped, true);
  assert.equal(twice.outcome.stoppedAt, 'verify');
  assert.equal(twice.count('implement:a'), 2);
});

test('two slices with no shared file are built together, and the side branch is merged before its verify', async () => {
  const r = await run([slice('a'), slice('b'), slice('c')], {
    args: { pairSlices: true },
    answer: (c) => (c.label === 'pair:a+b' ? { known: true, shared: [] } : c.label === 'merge:b' ? { ok: true } : undefined),
  });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.ok(r.at('plan:a') < r.at('pair:a+b') && r.at('plan:b') < r.at('pair:a+b'), 'both plans are written before the file lists are compared');
  assert.match(r.prompt('pair:a+b'), /slice-files "\/repo" demo a b --json/);
  assert.match(r.prompt('implement:b'), /SIDE CHECKOUT\. Slice 'a' is being built/);
  assert.match(r.prompt('implement:b'), /git switch -c side\/demo\/b/);
  assert.doesNotMatch(r.prompt('implement:a'), /SIDE CHECKOUT/);
  assert.ok(r.at('implement:b') < r.at('verify:a'), 'b is built while a is built and verified');
  assert.ok(r.at('merge:b') > r.at('implement:b') && r.at('merge:b') < r.at('verify:b'));
  assert.match(r.prompt('merge:b'), /merge --no-ff .* side\/demo\/b/);
  // The third slice has no mate left: it runs alone.
  assert.equal(r.count('implement:c'), 1);
  assert.doesNotMatch(r.prompt('implement:c'), /SIDE CHECKOUT/);
});

test('two slices that share a file are planned once each and built one after the other', async () => {
  const r = await run([slice('a'), slice('b')], {
    args: { pairSlices: true, verifyBehind: false },
    answer: (c) => (String(c.label).startsWith('pair:') ? { known: true, shared: ['src/store.js'] } : undefined),
  });
  assert.equal(r.outcome.ok, true, r.outcome.reason);
  assert.equal(r.count('plan:a'), 1);
  assert.equal(r.count('plan:b'), 1);
  assert.doesNotMatch(r.prompt('implement:b'), /SIDE CHECKOUT/);
  assert.ok(r.at('implement:b') > r.at('verify:a'));
  assert.equal(r.count('merge:b'), 0);
});

test('a merge conflict of the side branch stops the run and names the branch', async () => {
  const r = await run([slice('a'), slice('b')], {
    args: { pairSlices: true },
    answer: (c) => (c.label === 'pair:a+b' ? { known: true, shared: [] } : c.label === 'merge:b' ? { ok: false, conflicts: ['src/x.js'] } : undefined),
  });
  assert.equal(r.outcome.stopped, true);
  assert.equal(r.outcome.stoppedAt, 'merge');
  assert.match(r.outcome.reason, /side\/demo\/b .* a conflict in src\/x\.js/);
  assert.equal(r.count('verify:b'), 0);
});
