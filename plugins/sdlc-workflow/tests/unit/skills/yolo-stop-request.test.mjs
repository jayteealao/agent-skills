// YOLO-COMMENTARY-PLAN W3 — the stop request (G1-G3). The person says "stop after
// the current verify"; the main session writes .control.json; the agent that starts
// the next stage reads it, does no work, and returns status 'stopped'; the driver
// ends cleanly with stoppedAt 'stop-request' and the resume command as its route.
//
// yolo.js is a Workflow script, not a module, so the functions are extracted by
// brace-matching (as yolo-gates.test.mjs does) and run against stub agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

function extractFn(name) {
  const m = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `could not locate function ${name} in yolo.js`);
  // Skip the parameter list first: a default such as `opts = {}` holds braces too.
  let paren = 0;
  let bodyAt = m.index + m[0].length - 1;
  for (; bodyAt < src.length; bodyAt++) {
    if (src[bodyAt] === '(') paren++;
    else if (src[bodyAt] === ')' && --paren === 0) break;
  }
  let depth = 0;
  for (let j = src.indexOf('{', bodyAt); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

// driveChain with every dispatch stubbed: `answers` maps a stage to the result its
// agent returns. The stubs record each dispatch and the extra options it carried.
// An answer may be a function of the dispatch count of its stage, so a stage can answer
// differently when a route back runs it again. `answered` is the args.answered list of the run.
function chainHarness(answers, answered = []) {
  const calls = [];
  const logs = [];
  const writeBacks = [];
  const build = new Function('stubs', `
    const { runStage, driveVerify, driveReview, driveWallProbe, classifyDecisions, writeBackSliceStatus, log, slug, ANSWERED } = stubs
    const projectRoot = '/r'
    const WF_CMD = 'node "/p/scripts/wf.mjs"'
    // No implement ran before this chain, so it runs no plan check.
    let codeMoved = 0
    const planFreshness = async () => ({ fresh: true })
    // WF-SYSTEM-REVIEW C2: the split threshold that driveChain reads.
    const SPLIT_AFTER_STOPS = 2
    const MAX_ROUTE_BACKS = 2
    const CHAIN_ORDER = ['plan', 'implement', 'verify', 'review']
    // C3: implement runs through implementSlice, which dispatches runStage with the stop check.
    const implementSlice = (slice, idx, entry, answered) => runStage('implement', slice, idx, { stopCheck: true, answered })
    ${extractFn('verifyClean')}
    ${extractFn('evaluateGate')}
    ${extractFn('sliceOf')}
    ${extractFn('questionsOf')}
    ${extractFn('questionsText')}
    ${extractFn('questionStop')}
    ${extractFn('answeredFor')}
    ${extractFn('driveChain')}
    return driveChain
  `);
  const count = {};
  const answer = (stage) => {
    count[stage] = (count[stage] || 0) + 1;
    const a = answers[stage];
    const r = typeof a === 'function' ? a(count[stage]) : a;
    return r || { stage, status: 'complete', artifactPath: `x/${stage}.md`, terminal: { statusField: 'complete', convergence: 'converged', result: 'pass', verdict: 'ship', blockerCount: 0 } };
  };
  const driveChain = build({
    slug: 'engine-modules',
    ANSWERED: answered,
    log: (m) => logs.push(m),
    runStage: async (stage, slice, idx, extra = {}) => { calls.push({ stage, extra }); return answer(stage); },
    driveVerify: async (slice, idx, extra = {}) => { calls.push({ stage: 'verify', extra }); return answer('verify'); },
    driveReview: async (slice, idx, extra = {}) => { calls.push({ stage: 'review', extra }); return answer('review'); },
    driveWallProbe: async () => null,
    classifyDecisions: async (r) => r,
    writeBackSliceStatus: async (slice, idx, stages) => { writeBacks.push(stages); return { ok: true, wrote: [] }; },
  });
  return { driveChain, calls, logs, writeBacks };
}

const IDX = { slices: [{ slice: 'auth', stages: {} }], priorDeferrals: [] };
const STOPPED = (stage) => ({ stage, slice: 'auth', status: 'stopped', stopReason: '{"action":"stop","after":"verify"}', artifactPath: '', terminal: {} });

test('a stopped stage agent ends the chain cleanly at stop-request, before the stage runs', async () => {
  const h = chainHarness({ review: STOPPED('review') });
  const chain = await h.driveChain(['plan', 'implement', 'verify', 'review'], 'auth', IDX);
  assert.equal(chain.stopped, true);
  assert.equal(chain.at, 'stop-request');
  assert.equal(chain.stopRequest, true);
  assert.match(chain.reason, /stopped before review:auth/);
  assert.deepEqual(chain.ran.map((r) => r.stage), ['plan', 'implement', 'verify'], 'the stopped stage did not run, so it is not in ran');
  assert.deepEqual(h.writeBacks, [], 'an unfinished slice is not written back as complete');
});

// WF-CAMPAIGN-DRIVER-PLAN W8 — the wave driver drives a campaign; yolo has no campaign wait,
// no campaign control file and no campaign context.
test('yolo has no campaign wait: the stop check has no condition (d), and the stage result has no wait kind', () => {
  const clause = new Function('READ_TOOL', `${extractFn('stopCheckClause')}; return stopCheckClause`)('the file-read tool')('/r/.ai/workflows/s/.control.json', '/r/.ai/workflows/s/.driver-journal.jsonl');
  assert.doesNotMatch(clause, /\(d\)|Waits|'wait'/);
  assert.doesNotMatch(src, /stopKind|usage-pause/);
  assert.doesNotMatch(src, /contextPath|campaignControlPath|waitsFor|scout:campaign-contract|campaignClause/);
});

test('plan and implement dispatch with the stop check; a chain with no request runs to the end', async () => {
  const h = chainHarness({});
  const chain = await h.driveChain(['plan', 'implement', 'verify', 'review'], 'auth', IDX);
  assert.equal(chain.stopped, false);
  for (const c of h.calls.filter((c) => c.stage === 'plan' || c.stage === 'implement')) {
    assert.equal(c.extra.stopCheck, true, `${c.stage} must read the control file`);
  }
  assert.equal(h.writeBacks.length, 1);
});

test('the stop check runs the stop-check command, which finds the request wherever the records live', () => {
  const clause = new Function(`${extractFn('stopCheckClause')}; return stopCheckClause`)()('node "/p/scripts/yolo-watch.mjs" stop-check "/r" s');
  assert.match(clause, /Run `node "\/p\/scripts\/yolo-watch\.mjs" stop-check "\/r" s` now/);
  assert.match(clause, /When it prints "stop": false, continue normally/);
  assert.match(clause, /When it prints "stop": true, stop: do no stage work/);
  assert.doesNotMatch(clause, /\.control\.json/, 'the agent reads no control file by path');
  assert.match(clause, /status 'stopped', stopReason/);
  assert.match(clause, /Never edit or\s+delete the control file/);
  assert.match(src, /const stopCheck = \(\) => stopCheckClause\(`node "\$\{WATCH\}" stop-check "\$\{projectRoot\}" \$\{slug\}`\)/);
});

test('the driver journals by root and slug, keeps found.json in the drafts, and takes the records folder from args', () => {
  assert.match(src, /const lineCmd = \(o\) => `node "\$\{WATCH\}" line "\$\{projectRoot\}" \$\{slug\} \$\{jsonArg\(o\)\}`/);
  assert.doesNotMatch(src, /lineCmd\(JOURNAL_PATH/);
  assert.match(src, /`\$\{DRAFT_DIR\}\/found\.json --source review/);
  assert.doesNotMatch(src, /\.found\.json/);
  assert.match(src, /const RECORDS_ROOT = typeof OPT\.recordsRoot === 'string'/);
  assert.match(src, /const CONTROL_PATH = `\$\{WF_DIR\}\/\.control\.json`/);
});

test('every stage boundary carries the stop check, and no fix round does', () => {
  assert.match(src, /status: \{ enum: \['complete', 'hard-stop', 'stopped', 'questions'\] \}/, 'STAGE_RESULT allows stopped and questions');
  assert.match(src, /runStage\(stage, sliceArg, idx, \{ stopCheck: true, answered \}\)/, 'plan in driveChain');
  assert.match(src, /runStage\('implement', sliceArg, idx, \{ stopCheck: true, answered \}\)/, 'implement in driveChain');
  assert.match(src, /stopCheck: round === 1 && !probeCorrection/, 'verify: the first round only');
  assert.match(src, /runStage\('review', sliceArg, idx, \{ stopCheck: true, answered: extra\.answered \|\| null \}\)/, 'review without the fan-out');
  assert.match(extractFn('driveReview'), /stopCheck\(\) \+ ` When the stop-request check stops you/, 'review fan-out: the rubric selection agent checks before any scout');
  assert.match(extractFn('runUpdateDepsExec'), /stopCheck\(\)/, 'update-deps exec');
  assert.match(extractFn('driveVerify'), /last\.status === 'stopped' \|\| last\.status === 'questions'\) return last/, 'verify passes a stop and questions through');
  assert.match(src, /if \(outcome\.stoppedAt === 'stop-request'\) \{/);
  assert.match(src, /outcome\.route = `\/wf yolo \$\{slug\}\$\{slice \? ' ' \+ slice : ''\}`/, 'the route is the resume command');
});

// A stage with an intent-bearing decision returns it as a question; the chain stops there.
const ASK = (stage) => ({
  stage, slice: 'auth', status: 'questions', artifactPath: '', terminal: {},
  questions: [{ key: 'finding:design-1', question: 'The list uses cards and the board shows rows. Keep the cards?', options: ['keep', 'fix'], recommended: 'fix', why: 'the board is confirmed' }],
});

test('a review that returns questions stops the chain at review with the questions', async () => {
  const h = chainHarness({ review: ASK('review') });
  const chain = await h.driveChain(['plan', 'implement', 'verify', 'review'], 'auth', IDX);
  assert.equal(chain.stopped, true);
  assert.equal(chain.at, 'review');
  assert.deepEqual(chain.questions.map((q) => q.key), ['finding:design-1']);
  assert.equal(chain.questions[0].stage, 'review');
  assert.equal(chain.questions[0].slice, 'auth');
  assert.match(chain.reason, /finding:design-1: The list uses cards/);
  assert.match(chain.reason, /\(recommended: fix\)/);
  assert.match(chain.route, /answer the questions, then re-run \/wf yolo engine-modules/);
  assert.deepEqual(h.writeBacks, [], 'the slice does not clear');
});

test('an entry with no key or no question is not a question', async () => {
  const h = chainHarness({ plan: { ...ASK('plan'), questions: [{ key: '', question: 'x' }, { key: 'k', question: '' }] } });
  const chain = await h.driveChain(['plan', 'implement'], 'auth', IDX);
  assert.equal(chain.stopped, true, 'status questions still stops the chain');
  assert.deepEqual(chain.questions, []);
  assert.match(chain.reason, /plan returned status questions without a question/);
});

test('an answer reaches only the stage and slice that asked it', async () => {
  const a = { key: 'finding:design-1', stage: 'review', slice: 'auth', answer: 'fix', by: 'person' };
  const other = { key: 'k2', stage: 'review', slice: 'billing', answer: 'keep' };
  const h = chainHarness({}, [other, a]);
  await h.driveChain(['plan', 'implement', 'verify', 'review'], 'auth', IDX);
  const byStage = Object.fromEntries(h.calls.map((c) => [c.stage, c.extra.answered]));
  assert.equal(byStage.plan, null);
  assert.equal(byStage.implement, null);
  assert.equal(byStage.verify, null);
  assert.equal(byStage.review, a);
});

test('an answered verify that the person accepted passes the gate with its residual items', async () => {
  const failing = { stage: 'verify', slice: 'auth', status: 'complete', artifactPath: 'x/06.md', accepted: true, acceptedByPerson: true, terminal: { statusField: 'complete', convergence: 'escalate', result: 'fail', substantiveResidual: true } };
  const h = chainHarness({ verify: failing }, [{ key: 'verify:auth', stage: 'verify', answer: 'accept it' }]);
  const chain = await h.driveChain(['verify'], 'auth', IDX);
  assert.equal(chain.stopped, false);
  const gated = chainHarness({ verify: { ...failing, accepted: false } });
  assert.equal((await gated.driveChain(['verify'], 'auth', IDX)).stopped, true, 'without the acceptance the gate stops it');
});

test('an answered verify that routes back to plan runs plan, implement and verify again with the answer', async () => {
  const a = { key: 'verify:auth', stage: 'verify', slice: 'auth', answer: 'the empty state shows a sign-up link' };
  const done = { slices: [{ slice: 'auth', stages: { plan: 'done', implement: 'done' } }], priorDeferrals: [] };
  const h = chainHarness({ verify: (n) => (n === 1 ? { stage: 'verify', slice: 'auth', status: 'complete', routeBack: 'plan', artifactPath: '', terminal: {} } : null) }, [a]);
  const chain = await h.driveChain(['plan', 'implement', 'verify'], 'auth', done);
  assert.equal(chain.stopped, false);
  assert.deepEqual(h.calls.map((c) => c.stage), ['verify', 'plan', 'implement', 'verify']);
  for (const c of h.calls.slice(1)) {
    assert.equal(c.extra.answered.key, 'verify:auth', `${c.stage} carries the answer`);
    assert.equal(c.extra.answered.routedBack, 'plan', `${c.stage} knows the walk routed back`);
  }
});

test('a route back without an answer is ignored, and a route back that repeats stops the chain', async () => {
  const back = { stage: 'verify', slice: 'auth', status: 'complete', routeBack: 'implement', artifactPath: '', terminal: { statusField: 'complete', convergence: 'converged', result: 'pass' } };
  const loose = chainHarness({ verify: back });
  assert.equal((await loose.driveChain(['implement', 'verify'], 'auth', IDX)).stopped, false);
  assert.deepEqual(loose.calls.map((c) => c.stage), ['implement', 'verify']);
  const loop = chainHarness({ verify: back }, [{ key: 'v', stage: 'verify', answer: 'redo it' }]);
  const chain = await loop.driveChain(['implement', 'verify'], 'auth', IDX);
  assert.equal(chain.stopped, true);
  assert.match(chain.reason, /routed back to implement 3 times on one answer/);
  assert.equal(loop.calls.filter((c) => c.stage === 'verify').length, 3);
});

test('the slice and slug outcomes carry the chain route and the questions; the slug-wide review stops on questions', () => {
  assert.ok(src.includes("route = chain.route || `address the gate at '${chain.at}'"), 'slice mode');
  assert.ok(src.includes("route: chain.route || `address the gate at '${chain.at}' on slice"), 'slug mode');
  assert.ok(src.includes("...(chain.questions ? { questions: chain.questions } : {})"), 'both modes carry the questions');
  assert.ok(src.includes("const reviewAnswer = answeredFor(ANSWERED, 'review', null)\n  let rev = await driveReview(null, idx, { answered: reviewAnswer })"), 'the slug-wide review carries its answer');
  assert.ok(src.includes("? { ok: false, mode: 'slug', reviewScope: 'slug-wide', ...questionStop(rev), results, slugWide: rev }"), 'slug-wide review');
  assert.doesNotMatch(src, /amendFindings|amendStopReason/);
});

test('a run that waits on questions ends as waiting, with the resume command and the relaunch route', () => {
  assert.ok(src.includes("waiting ? { status: 'waiting', reason: `${outcome.questions.length} question(s) wait for the person`, resume: resumeCmd }"));
  assert.match(extractFn('runEnd'), /progress set "\$\{projectRoot\}" \$\{slug\} --run/);
  assert.ok(src.includes('re-run ${resumeCmd} with args.answered'));
  assert.ok(src.includes('if (DELEGATE) outcome.delegate = { digest: `${WF_CMD} decide list "${projectRoot}" ${slug} --by delegate` }'));
});

// The slug-wide review with its dispatches stubbed: `reviews` is the list of the review results
// in order, and `chains` maps a slice to the result of its driveChain.
function slugWideHarness(reviews, chains = {}, answered = []) {
  const calls = { review: [], chain: [] };
  const build = new Function('stubs', `
    const { driveReview, driveChain, log, slug, ANSWERED } = stubs
    const MAX_ROUTE_BACKS = 2
    ${extractFn('verifyClean')}
    ${extractFn('evaluateGate')}
    ${extractFn('sliceOf')}
    ${extractFn('questionsOf')}
    ${extractFn('questionsText')}
    ${extractFn('questionStop')}
    ${extractFn('answeredFor')}
    ${extractFn('slugWideReview')}
    return slugWideReview
  `);
  let n = 0;
  const fn = build({
    slug: 'demo',
    ANSWERED: answered,
    log: () => {},
    driveReview: async (slice, idx, extra) => { calls.review.push(extra); const r = reviews[n]; n += 1; return r === undefined ? CLEAN_REVIEW : r; },
    driveChain: async (stages, slice, idx, opts) => { calls.chain.push({ stages, slice, opts }); return chains[slice] || { stopped: false, slice, ran: [] }; },
  });
  return { slugWideReview: fn, calls };
}
const CLEAN_REVIEW = { stage: 'review', status: 'complete', artifactPath: '', terminal: { verdict: 'ship', blockerCount: 0 } };
const ROSTER = { slices: [{ slice: 'auth', stages: {} }, { slice: 'feed', stages: {} }], priorDeferrals: [] };

test('a slug-wide review that routes back runs plan, implement and verify of each named slice, then reviews again', async () => {
  const answer = { key: 'review:empty', stage: 'review', answer: 'show a sign-up link', by: 'person' };
  const back = { ...CLEAN_REVIEW, routeBack: 'plan', routeBackSlices: [{ slice: 'auth', key: 'review:empty' }, { slice: 'feed', note: 'the feed misses its empty state' }] };
  const h = slugWideHarness([back, CLEAN_REVIEW], {}, [answer]);
  const out = await h.slugWideReview(ROSTER, []);
  assert.deepEqual([out.ok, out.route, out.routedBack], [true, '/wf ship demo', 1]);
  assert.deepEqual(h.calls.chain.map((c) => [c.slice, c.stages.join(','), c.opts.forceFrom]), [['auth', 'plan,implement,verify', 'plan'], ['feed', 'plan,implement,verify', 'plan']]);
  assert.equal(h.calls.chain[0].opts.carried.key, 'review:empty', 'the answer goes to its slice');
  assert.deepEqual([h.calls.chain[1].opts.carried.residual, h.calls.chain[1].opts.carried.answer], [true, 'the feed misses its empty state'], 'a residual item carries its note');
  assert.equal(h.calls.review.length, 2);
  assert.equal(h.calls.review[1].answered.routedBack, 'plan', 'the second review knows the walk routed back');
});

test('a slug-wide route back stops at a stopped chain, at the limit, and at a slice that is not in the roster', async () => {
  const back = { ...CLEAN_REVIEW, routeBack: 'implement', routeBackSlices: [{ slice: 'auth', note: 'x' }] };
  const stop = slugWideHarness([back], { auth: { stopped: true, at: 'verify', slice: 'auth', ran: [], reason: 'verify did not clear' } });
  const s = await stop.slugWideReview(ROSTER, []);
  assert.deepEqual([s.ok, s.stopped, s.stoppedAt, s.stoppedSlice], [false, true, 'verify', 'auth']);
  assert.doesNotMatch(s.route, /\/wf ship/);
  const loop = slugWideHarness([back, back, back]);
  const l = await loop.slugWideReview(ROSTER, []);
  assert.equal(l.stopped, true);
  assert.match(l.reason, /routed back to implement 3 times — the answer does not settle; ask the person again/);
  const none = slugWideHarness([{ ...CLEAN_REVIEW, routeBack: 'plan', routeBackSlices: [{ slice: 'ghost', note: 'x' }] }]);
  const g = await none.slugWideReview(ROSTER, []);
  assert.deepEqual([g.stopped, none.calls.chain.length], [true, 0]);
  assert.match(g.reason, /named no slice of the roster/);
});

test('a slug-wide review that fixes a small answered finding itself routes nothing back', async () => {
  const answer = { key: 'finding:DES-6', stage: 'review', answer: 'label it Cancel sign-in', by: 'person' };
  const h = slugWideHarness([CLEAN_REVIEW], {}, [answer]);
  const out = await h.slugWideReview(ROSTER, []);
  assert.deepEqual([out.ok, out.route, h.calls.chain.length], [true, '/wf ship demo', 0]);
  assert.equal(h.calls.review.length, 1);
  assert.equal(h.calls.review[0].answered.key, 'finding:DES-6', 'the review gets the answer');
});

test('an answered review or verify fixes a small change, and routes back only a change that is not small', () => {
  const build = new Function(`
    const referenceRoot = '/plugin/skills/wf/reference'
    const WF_CMD = 'node "/p/scripts/wf.mjs"'
    const projectRoot = '/repo'
    const slug = 'demo'
    ${extractFn('sliceOf')}
    ${extractFn('smallChangeClause')}
    ${extractFn('answeredClause')}
    return answeredClause
  `);
  const answeredClause = build();
  const a = { key: 'finding:DES-6', question: 'Rename the button?', answer: 'Cancel sign-in', by: 'person' };
  const review = answeredClause(a, 'review', null);
  for (const criterion of [
    /\(1\) it changes only files that the slug's diff already changes, plus their tests/,
    /\(2\) it adds no schema change, no migration, no new dependency and no new module/,
    /\(3\) it changes no public contract/,
    /\(4\) it changes the acceptance checks of one slice only/,
    /\(5\) one fix round can make it and check it/,
  ]) assert.match(review, criterion);
  assert.match(review, /class 'implementation-detail', and name the criterion that fails/);
  assert.match(review, /rule 5 of \/plugin\/skills\/wf\/reference\/_decisions\.md, and name the rewritten records with --rewrote/);
  assert.match(review, /findings set "\/repo" demo <id> fixed/);
  assert.match(review, /Return no routeBack for a small change that passes its checks/);
  assert.match(review, /When the change is NOT small and the answer changes the slice's design, adds plan steps or adds files, change no code: write route-back: plan/);
  assert.match(review, /When the change is NOT small and the current plan already describes the work, change no code: write route-back: implement/);
  assert.match(review, /return routeBackSlices/, 'a slug-wide review still names its slices');
  const verify = answeredClause(a, 'verify', 'auth');
  assert.match(verify, /\(5\) one fix round can make it and check it/);
  assert.doesNotMatch(verify, /findings set/);
  assert.doesNotMatch(answeredClause(a, 'implement', 'auth'), /SMALL/, 'implement keeps its own rule');
});

test('a slug-wide review that returns nothing stops as a transient stop that a re-run retries', async () => {
  const h = slugWideHarness([null]);
  const out = await h.slugWideReview(ROSTER, []);
  assert.deepEqual([out.ok, out.stopped, out.transient, out.route], [false, true, true, '/wf yolo demo']);
});

test('driveChain with forceFrom runs the done stages from that stage, with the carried answer', async () => {
  const done = { slices: [{ slice: 'auth', stages: { plan: 'done', implement: 'done', verify: 'done' } }], priorDeferrals: [] };
  const h = chainHarness({});
  const chain = await h.driveChain(['plan', 'implement', 'verify'], 'auth', done, { forceFrom: 'implement', carried: { key: 'k', answer: 'a' } });
  assert.equal(chain.stopped, false);
  assert.deepEqual(h.calls.map((c) => c.stage), ['implement', 'verify']);
  for (const c of h.calls) assert.deepEqual([c.extra.answered.key, c.extra.answered.routedBack], ['k', 'implement']);
});
