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
    const { runStage, driveVerify, driveReview, driveWallProbe, classifyDecisions, writeBackSliceStatus, headCommit, log, slug, ANSWERED } = stubs
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
    const SELF_VERIFY_SIZES = ['xs', 's']
    const implementSlice = (slice, idx, entry, answered, selfVerify) => runStage('implement', slice, idx, { stopCheck: true, answered, selfVerify })
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
  let heads = 0;
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
    // Each read of HEAD is a new commit: every implement moves HEAD, so no verify is skipped.
    headCommit: async () => `h${(heads += 1)}`,
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
  assert.match(src, /runStage\('implement', sliceArg, idx, \{ stopCheck: true, answered, selfVerify \}\)/, 'implement in driveChain');
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

test('the slice and slug outcomes carry the chain route and the questions; the slug-wide review sends nothing back', () => {
  assert.ok(src.includes("route = chain.route || `address the gate at '${chain.at}'"), 'slice mode');
  assert.ok(src.includes("...(chain.questions ? { questions: chain.questions } : {})"), 'the slice mode carries the questions');
  assert.ok(src.includes("? { ok: false, mode: 'slug', reviewScope: 'slug-wide', ...questionStop(rev), results, slugWide: rev }"), 'slug-wide review');
  assert.doesNotMatch(src, /amendFindings|amendStopReason|routeBackSlices|findings questions/);
});

test('a run that waits on questions ends as waiting, with the resume command and the relaunch route', () => {
  assert.ok(src.includes("waiting ? { status: 'waiting', reason: `${outcome.questions.length} question(s) wait for the person`, resume: resumeCmd }"));
  assert.match(extractFn('runEnd'), /progress set "\$\{projectRoot\}" \$\{slug\} --run/);
  assert.ok(src.includes('re-run ${resumeCmd} with args.answered'));
  assert.ok(src.includes('if (DELEGATE) outcome.delegate = { digest: `${WF_CMD} decide list "${projectRoot}" ${slug} --by delegate` }'));
});

// The slug-wide review with its dispatches stubbed: `reviews` is the list of the review results
// in order. headCommit returns h1, h2, ... in order.
function slugWideHarness(reviews, { opt = {}, answered = [] } = {}) {
  const calls = { review: [], stage: [], chain: [], heads: 0 };
  const build = new Function('stubs', `
    const { driveReview, runStage, driveChain, headCommit, log, slug, ANSWERED, OPT } = stubs
    const REVIEW_CHECK_PASSES = 2
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
  const next = () => { const r = reviews[n]; n += 1; return r === undefined ? CLEAN_REVIEW : r; };
  const fn = build({
    slug: 'demo',
    ANSWERED: answered,
    OPT: opt,
    log: () => {},
    driveReview: async (slice, idx, extra) => { calls.review.push(extra); return next(); },
    runStage: async (stage, slice, idx, extra) => { calls.stage.push({ stage, extra }); return next(); },
    driveChain: async (stages, slice) => { calls.chain.push({ stages, slice }); return { stopped: false, slice, ran: [] }; },
    headCommit: async () => { calls.heads += 1; return `h${calls.heads}`; },
  });
  return { slugWideReview: fn, calls };
}
const CLEAN_REVIEW = { stage: 'review', status: 'complete', artifactPath: '', terminal: { verdict: 'ship', blockerCount: 0, couldNotFixBlockers: 0 } };
const ROSTER = { slices: [{ slice: 'auth', stages: {} }, { slice: 'feed', stages: {} }], priorDeferrals: [] };

test('a slug-wide review fixes its findings, returns no stop and no route-back, then checks only its fix commits', async () => {
  const h = slugWideHarness([{ ...CLEAN_REVIEW, fixCommits: ['c1', 'c2', 'c3'] }, { ...CLEAN_REVIEW, fixCommits: ['c4'] }, { ...CLEAN_REVIEW, fixCommits: ['c5'] }, CLEAN_REVIEW]);
  const out = await h.slugWideReview(ROSTER, []);
  assert.deepEqual([out.ok, out.stopped, out.route, h.calls.chain.length], [true, false, '/wf ship demo', 0]);
  assert.deepEqual(h.calls.review.map((r) => r.diffRange), [undefined, 'h1...HEAD', 'h2...HEAD'], 'each check pass scans the fix commits of the pass before');
  assert.equal(h.calls.review.length, 3, 'at most 2 check passes');
});

test('a review with no fix commit runs no check pass, and an empty check pass keeps the last review', async () => {
  const none = slugWideHarness([CLEAN_REVIEW]);
  assert.equal((await none.slugWideReview(ROSTER, [])).ok, true);
  assert.equal(none.calls.review.length, 1);
  const first = { ...CLEAN_REVIEW, fixCommits: ['c1'], artifactPath: 'first' };
  const empty = slugWideHarness([first, { stage: 'review', status: 'complete', emptyDiff: true, terminal: {} }]);
  const out = await empty.slugWideReview(ROSTER, []);
  assert.deepEqual([out.ok, out.slugWide.artifactPath], [true, 'first']);
});

test('the review stops only on a BLOCKER that it could not fix', async () => {
  const stuck = slugWideHarness([{ ...CLEAN_REVIEW, terminal: { verdict: 'dont-ship', blockerCount: 1, couldNotFixBlockers: 1 } }]);
  const s = await stuck.slugWideReview(ROSTER, []);
  assert.deepEqual([s.ok, s.stopped, s.stoppedAt], [false, true, 'review']);
  assert.match(s.reason, /could not fix 1 BLOCKER finding/);
  // A BLOCKER that waits on runtime evidence is a deferral, not a stop.
  const deferred = slugWideHarness([{ ...CLEAN_REVIEW, terminal: { verdict: 'dont-ship', blockerCount: 1, couldNotFixBlockers: 0 } }]);
  assert.equal((await deferred.slugWideReview(ROSTER, [])).ok, true);
});

test('with findings from the walk, the review fixes the ledger and scans only its own fix commits', async () => {
  const h = slugWideHarness([{ ...CLEAN_REVIEW, fixCommits: ['c1'] }, CLEAN_REVIEW], { opt: { reviewFindings: true } });
  const out = await h.slugWideReview(ROSTER, []);
  assert.equal(out.ok, true);
  assert.deepEqual(h.calls.stage.map((s) => [s.stage, s.extra.ledgerOnly]), [['review', true]]);
  assert.deepEqual(h.calls.review.map((r) => r.diffRange), ['h1...HEAD'], 'no scan of the whole packet');
});

test('an answered verify fixes a small change and routes back only a change that is not small; the review has no such clause', () => {
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
  const a = { key: 'verify:auth', question: 'Rename the button?', answer: 'Cancel sign-in', by: 'person' };
  const verify = answeredClause(a, 'verify', 'auth');
  for (const criterion of [
    /\(1\) it changes only files that the slug's diff already changes, plus their tests/,
    /\(2\) it adds no schema change, no migration, no new dependency and no new module/,
    /\(3\) it changes no public contract/,
    /\(4\) it changes the acceptance checks of one slice only/,
    /\(5\) one fix round can make it and check it/,
  ]) assert.match(verify, criterion);
  assert.match(verify, /rule 5 of \/plugin\/skills\/wf\/reference\/_decisions\.md, and name the rewritten records with --rewrote/);
  assert.match(verify, /Return no routeBack for a small change that passes its checks/);
  assert.match(verify, /When the change is NOT small and the current plan already describes the work, change no code: write route-back: implement/);
  assert.doesNotMatch(verify, /findings set|routeBackSlices/);
  const review = answeredClause(a, 'review', null);
  assert.doesNotMatch(review, /SMALL|route-back|routeBack/);
  assert.doesNotMatch(answeredClause(a, 'implement', 'auth'), /SMALL/, 'implement keeps its own rule');
});

// driveReview with every agent stubbed: 'selection' is what the rubric selection returns, and
// 'found' the findings of each scout.
function reviewHarness(selection, found = []) {
  const calls = { agents: [], stages: [] };
  const build = new Function('stubs', `
    const { agent, parallel, runStage, log } = stubs
    const OPT = {}
    const slug = 'demo'
    const projectRoot = '/repo'
    const referenceRoot = '/plugin/skills/wf/reference'
    const EOB = 'EOB'
    const SONNET = {}
    const RUBRIC_SELECTION = {}
    const FINDINGS_SCHEMA = {}
    const REFUTE_GROUP = {}
    const REFUTE_GROUP_SIZE = 4
    const phase = () => {}
    const heartbeatClause = () => ''
    const steer = () => ''
    const stopCheck = () => ''
    const REC = (verb) => 'wf record ' + verb
    ${extractFn('repoPath')}
    ${extractFn('refuteGroups')}
    ${extractFn('driveReview')}
    return driveReview
  `);
  const fn = build({
    log: () => {},
    parallel: async (fns) => Promise.all(fns.map((f) => f())),
    agent: async (prompt, opts) => {
      calls.agents.push({ label: opts.label, prompt });
      if (opts.label === 'select-rubrics') return selection;
      if (opts.label.startsWith('scout:')) return { findings: found };
      return { verdicts: [] };
    },
    runStage: async (stage, slice, idx, extra) => { calls.stages.push(extra); return { stage, status: 'complete' }; },
  });
  return { driveReview: fn, calls };
}
const REVIEW_IDX = { branch: { base: 'main' }, slices: [] };

test('a check pass scans the fix commits of the last pass and tells the writer so', async () => {
  const h = reviewHarness({ rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }], stopped: false });
  await h.driveReview(null, REVIEW_IDX, { diffRange: 'abc1234...HEAD' });
  const select = h.calls.agents.find((a) => a.label === 'select-rubrics');
  assert.match(select.prompt, /This scan reads only the fix commits of the last review pass, abc1234\.\.\.HEAD/);
  assert.match(select.prompt, /return rubrics: \[\] and emptyDiff: true/);
  assert.match(h.calls.agents.find((a) => a.label === 'scout:correctness').prompt, /git -C \/repo diff abc1234\.\.\.HEAD/);
  assert.equal(h.calls.stages.length, 1);
  assert.deepEqual([h.calls.stages[0].scan.dimensions, h.calls.stages[0].scan.checkPass], [['correctness'], 'abc1234...HEAD']);
});

test('an empty check pass runs no writer, and an answered review with no range runs no scan', async () => {
  const empty = reviewHarness({ rubrics: [], emptyDiff: true, stopped: false });
  const r = await empty.driveReview(null, REVIEW_IDX, { diffRange: 'abc1234...HEAD' });
  assert.deepEqual(empty.calls.agents.map((a) => a.label), ['select-rubrics']);
  assert.deepEqual([r.emptyDiff, empty.calls.stages.length], [true, 0]);
  const plain = reviewHarness({ rubrics: [], stopped: false });
  await plain.driveReview(null, REVIEW_IDX, { answered: { key: 'k' } });
  assert.equal(plain.calls.agents.length, 0, 'an answer runs the writer only');
});

test('the scouts look only in the work packet, and a finding outside it gets no refuter', async () => {
  const selection = { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }], affectedFiles: ['/repo/src/a.js', 'src\\b.js'], stopped: false };
  const found = [
    { id: '1', severity: 'HIGH', file: 'src/a.js', line: '3', issue: 'in the packet' },
    { id: '2', severity: 'MED', file: '/repo/src/c.js', line: '9', issue: 'old debt elsewhere' },
  ];
  const h = reviewHarness(selection, found);
  await h.driveReview(null, REVIEW_IDX, {});
  const select = h.calls.agents.find((a) => a.label === 'select-rubrics');
  assert.match(select.prompt, /Return affectedFiles: every file that `git -C \/repo diff --name-only main\.\.\.HEAD` prints, and each file that calls, imports or tests code that the diff changes/);
  assert.match(h.calls.agents.find((a) => a.label === 'scout:correctness').prompt, /Look for issues ONLY in the files of the work packet: \["src\/a\.js","src\/b\.js"\]/);
  const refuters = h.calls.agents.filter((a) => a.label.startsWith('refute:'));
  assert.equal(refuters.length, 1);
  assert.doesNotMatch(refuters[0].prompt, /src\/c\.js/);
  assert.deepEqual(h.calls.stages[0].scan.affectedFiles, ['src/a.js', 'src/b.js']);
  assert.deepEqual(h.calls.stages[0].scan.findings.map((f) => f.file), ['src/a.js']);
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
