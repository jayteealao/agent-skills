// The verify fix rounds, the self verify, the roster walk and the journal lines of the driver.
//
// yolo.js is a Workflow script, not a module: single functions are extracted by brace-matching
// and run against stub agents, and the whole script runs with a stub `agent`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFn as extractFrom } from '../../helpers/extract-fn.mjs';
import { driveArgs } from '../../../lib/drive.mjs';
import { appendJournalLine, appendRunEnd, controlPath, journalPath, stopCheck, writeControl } from '../../../scripts/yolo-watch.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');
const extractFn = (name) => extractFrom(src, name);

// ---- driveVerify with a stubbed verify stage ----------------------------------

const CLEAN = { stage: 'verify', slice: 'auth', status: 'complete', artifactPath: 'v.md', terminal: { convergence: 'converged', result: 'pass' } };
const CODE_FAIL = { stage: 'verify', slice: 'auth', status: 'hard-stop', artifactPath: 'v.md', terminal: { convergence: 'escalated', result: 'fail', substantiveResidual: true } };

function verifyHarness(rounds) {
  const calls = [];
  const build = new Function('stubs', `
    const { runStage, driveWallProbe, log } = stubs
    ${extractFn('acKey')}
    ${extractFn('verifyClean')}
    ${extractFn('personAccepted')}
    ${extractFn('probeGaps')}
    ${extractFn('fixRoundLeft')}
    ${extractFn('driveVerify')}
    return driveVerify
  `);
  const driveVerify = build({
    log: () => {},
    runStage: async (stage, slice, idx, extra) => { calls.push(extra); return rounds[Math.min(calls.length - 1, rounds.length - 1)]; },
    driveWallProbe: async () => null,
  });
  return { driveVerify, calls };
}

test('a first verify round that stops for a code reason gets the second fix round', async () => {
  const h = verifyHarness([CODE_FAIL, CLEAN]);
  const res = await h.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(res.status, 'complete');
  assert.deepEqual(h.calls.map((c) => c.round), [1, 2]);
  assert.equal(h.calls[1].stopCheck, false, 'the fix round checks no stop request');
});

test('a verify still failing after the second round stops the run', async () => {
  const h = verifyHarness([CODE_FAIL, CODE_FAIL]);
  const res = await h.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(h.calls.length, 2);
  assert.equal(res.status, 'hard-stop');
});

test('a delegate run accepts the items that still fail on the second round', async () => {
  const accepted = { ...CLEAN, terminal: { convergence: 'escalated', result: 'fail', substantiveResidual: false, acceptedItems: [{ item: 'AC-3', by: 'delegate' }] } };
  const h = verifyHarness([CODE_FAIL, accepted]);
  const res = await h.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(h.calls.length, 2);
  assert.equal(res.status, 'complete');
  assert.deepEqual(res.terminal.acceptedItems, [{ item: 'AC-3', by: 'delegate' }]);
});

test('a steering conflict, a question, a route back or missing evidence stops on the first round', async () => {
  for (const first of [
    { ...CODE_FAIL, steeringConflict: 'never touch the login page', hardStopReason: 'steering: the login page' },
    { ...CODE_FAIL, hardStopReason: 'steering: the login page' },
    { ...CODE_FAIL, questions: [{ key: 'k', question: 'Keep the cards?' }] },
    { ...CODE_FAIL, routeBack: 'plan' },
    { ...CODE_FAIL, terminal: { convergence: 'converged', result: 'blocked-runtime-evidence-missing' } },
    { ...CODE_FAIL, terminal: undefined },
  ]) {
    const h = verifyHarness([first, CLEAN]);
    const res = await h.driveVerify('auth', { priorDeferrals: [] });
    assert.equal(h.calls.length, 1, JSON.stringify(first));
    assert.equal(res.status, 'hard-stop');
  }
});

test('a verify that does not return stops cleanly, and the self verify runs no verify agent', async () => {
  const lost = verifyHarness([null]);
  const res = await lost.driveVerify('auth', { priorDeferrals: [] });
  assert.deepEqual([res.status, res.transient, lost.calls.length], ['hard-stop', true, 1]);
  const self = verifyHarness([CLEAN]);
  const stop = await self.driveVerify('auth', { priorDeferrals: [] }, { first: CODE_FAIL });
  assert.deepEqual([stop.status, self.calls.length], ['hard-stop', 0]);
});

test('the verify contract tells the agent that a code failure gets a second round', () => {
  assert.match(src, /Otherwise return status 'hard-stop' with the terminal state ` \+\s+`as it is: after a first round that fails for a code reason, the driver runs a second fix round\./);
});

// ---- the self verify of an xs or s slice --------------------------------------

test('the self verify returns its questions, and the question stop names them', async () => {
  assert.match(src, /residual: \{ type: 'array' \},\n\s+questions: STAGE_QUESTIONS,\n\s+hardStopReason/, 'the verify sub-schema has questions');
  const asked = { stage: 'verify', slice: 'auth', status: 'questions', terminal: {}, questions: [{ key: 'copy', question: 'Which label?', options: ['a', 'b'] }] };
  const h = verifyHarness([CLEAN]);
  const res = await h.driveVerify('auth', { priorDeferrals: [] }, { first: asked });
  const questionStop = new Function(`const slug = 'demo'
    ${extractFn('sliceOf')}
    ${extractFn('questionsOf')}
    ${extractFn('questionsText')}
    ${extractFn('stopOut')}
    ${extractFn('questionStop')}
    return questionStop`)();
  const stop = questionStop(res);
  assert.equal(stop.questions.length, 1);
  assert.match(stop.reason, /verify waits for the person: .*Which label\?/);
});

function selfVerifyText() {
  return new Function(`const projectRoot = '/r', slug = 'demo', referenceRoot = '/p/skills/wf/reference', RUN_ID = 'r1', DELEGATE = false
    const WF_CMD = 'node "/p/scripts/wf.mjs"'
    const WATCH = '/p/scripts/yolo-watch.mjs'
    const settledItemsClause = () => '', reChallengeClause = () => '', sliceStatusClause = () => ''
    ${src.match(/^const lineFlags = .*$/m)[0]}
    ${src.match(/^const lineCmd = .*$/m)[0]}
    ${extractFn('selfVerifyEndClause')}
    ${extractFn('selfVerifyClause')}
    return selfVerifyClause`)()('auth', { priorDeferrals: [] }, 'defer');
}

test('the self verify names questions and writes the agent-end line of a verify agent', () => {
  const text = selfVerifyText();
  assert.match(text, /hardStopReason, questions \(status 'questions' only, in the shape of the question contract\)/);
  assert.match(text, /node "\/p\/scripts\/yolo-watch\.mjs" line "\/r" demo --run "r1" --event "agent-end" --agent "verify:auth" --phase "Drive" --stage "verify" --slice "auth" --status <the status of the verify>/);
});

// ---- the journal line and the stop request --------------------------------------

function project() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'yolo-drivers-'));
  mkdirSync(path.join(root, '.ai', 'workflows', 'demo'), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'workflows', 'demo', '00-index.md'), '---\nslug: demo\n---\n');
  return root;
}

test('a journal line from flags equals the line from JSON', () => {
  const root = project();
  try {
    const dir = path.join(root, 'j');
    const a = appendJournalLine(path.join(dir, 'a.jsonl'), '{"run":"r1","seq":3,"event":"agent-end","agent":"verify:auth","phase":"Drive","stage":"verify","slice":"auth"}', { status: 'complete' }, 0);
    const b = appendJournalLine(path.join(dir, 'b.jsonl'), null, { run: 'r1', seq: '3', event: 'agent-end', agent: 'verify:auth', phase: 'Drive', stage: 'verify', slice: 'auth', status: 'complete' }, 0);
    assert.deepEqual(b, a);
    assert.equal(readFileSync(path.join(dir, 'b.jsonl'), 'utf8'), readFileSync(path.join(dir, 'a.jsonl'), 'utf8'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the driver prompts pass the journal fields as flags, with no JSON argument', () => {
  assert.doesNotMatch(src, /jsonArg/);
  const lineCmd = new Function(`const projectRoot = '/r', slug = 'demo', WATCH = '/w.mjs'
    ${src.match(/^const lineFlags = .*$/m)[0]}
    ${src.match(/^const lineCmd = .*$/m)[0]}
    return lineCmd`)();
  assert.equal(lineCmd({ seq: 0, event: 'agent-start', agent: 'orient', phase: 'Orient' }),
    'node "/w.mjs" line "/r" demo --seq "0" --event "agent-start" --agent "orient" --phase "Orient"');
});

test('a stop after verify fires on the verify line of a self-verified slice', () => {
  const root = project();
  try {
    const file = journalPath(root, 'demo');
    writeControl(root, 'demo', 'stop', ['verify'], Date.parse('2026-11-01T10:00:00Z'));
    appendJournalLine(file, null, { event: 'agent-end', agent: 'implement:auth', stage: 'implement', slice: 'auth' }, Date.parse('2026-11-01T10:05:00Z'));
    assert.equal(stopCheck(root, 'demo').stop, false, 'the implement line alone does not fire it');
    appendJournalLine(file, null, { event: 'agent-end', agent: 'verify:auth', stage: 'verify', slice: 'auth' }, Date.parse('2026-11-01T10:06:00Z'));
    assert.equal(stopCheck(root, 'demo').stop, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a stop request for the current agent that served an earlier run does not stop the next launch', () => {
  const root = project();
  try {
    writeControl(root, 'demo', 'stop', ['current'], Date.parse('2026-11-01T10:00:00Z'));
    const control = controlPath(root, 'demo');
    assert.equal(stopCheck(root, 'demo').stop, true, 'a request with no run end since stops');
    appendRunEnd(root, 'demo', null, Date.parse('2026-11-01T10:30:00Z'), { run: 'r1' });
    assert.deepEqual([stopCheck(root, 'demo').stop, stopCheck(root, 'demo').stale], [false, true]);
    writeFileSync(control, JSON.stringify({ action: 'stop', after: 'current', requestedAt: '2026-11-01T11:00:00Z' }));
    assert.equal(stopCheck(root, 'demo').stop, true, 'a request made after the run end stops');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a staged stop request made before the last run ended is dropped; one made after it fires when its stage ends', () => {
  const root = project();
  try {
    const file = journalPath(root, 'demo');
    const control = controlPath(root, 'demo');
    writeControl(root, 'demo', 'stop', ['review'], Date.parse('2026-11-01T10:00:00Z'));
    // The run ends on questions before its review: the request stays in the file but served that run.
    appendRunEnd(root, 'demo', 'questions', Date.parse('2026-11-01T10:30:00Z'), { run: 'r1' });
    appendJournalLine(file, null, { run: 'r2', event: 'agent-end', agent: 'review:auth', stage: 'review', slice: 'auth' }, Date.parse('2026-11-01T11:10:00Z'));
    assert.deepEqual([stopCheck(root, 'demo').stop, stopCheck(root, 'demo').stale], [false, true], 'the review of the next run does not fire it');
    writeFileSync(control, JSON.stringify({ action: 'stop', after: 'review', requestedAt: '2026-11-01T11:00:00Z' }));
    assert.equal(stopCheck(root, 'demo').stop, true, 'a request made after the run end fires when its stage ends');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---- the delegate accept ----------------------------------------------------------

test('a delegate residual of a slug-wide review is a finding of the whole workflow', () => {
  const clause = new Function(`const projectRoot = '/r', slug = 'demo', DRAFT_DIR = '/r/.draft'
    const WF_CMD = 'node "/p/scripts/wf.mjs"'
    ${extractFn('delegateAcceptClause')}
    return delegateAcceptClause`)();
  const wide = clause('auth', undefined, 'slug-wide');
  assert.match(wide, /findings add "\/r" demo \/r\/\.draft\/residual-auth\.json --source review --dimensions residual/);
  assert.match(wide, /--stage verify --slice auth`/, 'the decision keeps its slice');
  const per = clause('auth', undefined, 'per-slice');
  assert.match(per, /residual-auth\.json --source review --slice auth --dimensions residual/);
  assert.match(src, /delegateAcceptClause\(sliceArg, undefined, idx\.reviewScope\)/);
  assert.match(src, /delegateAcceptClause\(sliceArg, 'on your second verify round, in a delegate run', idx\.reviewScope\)/);
});

// ---- git commands -------------------------------------------------------------------

test('every git command of a prompt quotes the project root', () => {
  assert.match(src, /^const GIT = `git -C "\$\{projectRoot\}"`$/m);
  assert.doesNotMatch(src, /git -C \$\{projectRoot\}/);
});

// ---- whole-script walks ---------------------------------------------------------------

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const driver = new AsyncFunction('args', 'agent', 'log', 'phase', 'parallel', src.replace('export const meta', 'const meta'));
const slice = (name, stages, extra = {}) => ({ slice: name, status: 'defined', reverifyReason: 'none', stages, ...extra });
const DONE = { plan: 'done', implement: 'done', verify: 'done', review: 'n-a' };
const orientResult = (over = {}) => ({
  ok: true, slug: 'demo', mode: 'slug', reviewScope: 'slug-wide', workflowType: 'feature', fileConvention: 'suffixed',
  runId: '20261101T100000Z-demo', charter: [], priorDeferrals: [],
  branch: { current: 'b', target: 'b', match: true, strategy: 'none' },
  slices: [slice('a', DONE), slice('b', DONE)],
  ...over,
});

async function run(args, answer) {
  const calls = [];
  const agent = async (prompt, opts = {}) => { calls.push({ label: opts.label, prompt }); return answer(opts.label, prompt); };
  const outcome = await driver(
    { projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo', ...args },
    agent, () => {}, () => {}, async (fns) => Promise.all(fns.map((f) => f())),
  );
  return { outcome, labels: calls.map((c) => c.label) };
}

function common(label) {
  if (label === 'select-rubrics') return { rubrics: [{ rubric: 'correctness', file: 'review/correctness.md', focus: '' }] };
  if (label && label.startsWith('scout:')) return { findings: [] };
  if (label === 'review') return { stage: 'review', status: 'complete', artifactPath: '/repo/07-review.md', terminal: { verdict: 'ship', blockerCount: 0, couldNotFixBlockers: 0 } };
  if (label === 'run-end') return { present: false };
  if (label && label.startsWith('writeback:')) return { ok: true, wrote: ['00-index.md'] };
  return undefined;
}

test('slice mode does not drive a skipped slice, and routes past retired slices', async () => {
  const { outcome, labels } = await run({ slice: 'a' }, (label) => {
    if (label === 'orient') {
      return orientResult({ mode: 'slice', targetSlice: 'a', slices: [
        slice('a', { plan: 'todo', implement: 'todo', verify: 'todo' }, { status: 'skipped' }),
        slice('b', DONE, { status: 'dropped' }),
        slice('c', { plan: 'todo', implement: 'todo', verify: 'todo' }),
      ] });
    }
    return common(label);
  });
  assert.ok(!labels.some((l) => /^(plan|implement|verify):a/.test(l || '')), labels.join(','));
  assert.equal(outcome.stopped, true);
  assert.match(outcome.reason, /slice 'a' is status: skipped in the roster/);
  assert.equal(outcome.route, '/wf yolo demo c');
});

test('a sweep whose walls all stand writes no slice status back', async () => {
  const { outcome, labels } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ slices: [slice('a', DONE), slice('b', { ...DONE, verify: 'reverify' }, { reverifyReason: 'deferral-rechallenge' })], priorDeferrals: [{ slice: 'b', ac: 'AC2', reason: 'no device' }] });
    if (label === 'wall-probe:b') return { walls: [{ ac: 'AC2', stands: true, probe: 'adb devices → none' }] };
    return common(label);
  });
  assert.ok(labels.includes('wall-probe:b'), labels.join(','));
  assert.ok(!labels.includes('writeback:b'), labels.join(','));
  assert.equal(outcome.stopped, false);
});

test('a sweep stop after the slug-wide review keeps the review and resumes at the swept slice', async () => {
  const { outcome, labels } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ slices: [slice('a', DONE), slice('b', { ...DONE, verify: 'reverify' }, { reverifyReason: 'deferral-rechallenge' })], priorDeferrals: [{ slice: 'b', ac: 'AC2', reason: 'no device' }] });
    if (label === 'wall-probe:b') return { walls: [{ ac: 'AC2', stands: false }] };
    if (label && label.startsWith('verify:b')) return { stage: 'verify', slice: 'b', status: 'hard-stop', hardStopReason: 'steering: the device lab', steeringConflict: 'the device lab', artifactPath: '', terminal: { convergence: 'escalated', result: 'fail', substantiveResidual: true } };
    return common(label);
  });
  assert.ok(labels.includes('review'), labels.join(','));
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.sweptAfterTarget, true);
  assert.equal(outcome.slugWide && outcome.slugWide.stage, 'review');
  assert.match(outcome.route, /\/wf yolo demo b$/);
});

test('the questions of the update-deps exec are of the update-deps stage', async () => {
  const { outcome } = await run({}, (label) => {
    if (label === 'orient') return orientResult({ workflowType: 'update-deps', slices: [slice('update-deps', { plan: 'done', implement: 'todo', verify: 'todo' })] });
    if (label === 'update-deps:exec') return { stage: 'verify', status: 'questions', artifactPath: '', terminal: {}, questions: [{ key: 'major-bump', question: 'Take the major version?', options: ['yes', 'no'] }] };
    return common(label);
  });
  assert.equal(outcome.stopped, true);
  assert.deepEqual(outcome.questions.map((q) => [q.key, q.stage]), [['major-bump', 'update-deps']]);
});

test('the review-findings mode of wf.mjs drive reaches the slug-wide review as a ledger-only review', async () => {
  const args = driveArgs({ projectRoot: '/repo', referenceRoot: '/plugin/skills/wf/reference', slug: 'demo', run: 'r1', staged: { models: {}, recordsRoot: '/repo/.ai' }, reviewFindings: true });
  const prompts = [];
  const outcome = await driver(args, async (prompt, opts = {}) => {
    prompts.push({ label: opts.label, prompt });
    return opts.label === 'orient' ? orientResult() : common(opts.label);
  }, () => {}, () => {}, async (fns) => Promise.all(fns.map((f) => f())));
  const review = prompts.find((p) => p.label === 'review');
  assert.match(review.prompt, /FINDINGS FROM THE WALK\. The walk put the defects/);
  assert.ok(!prompts.some((p) => p.label === 'select-rubrics' || /^scout:/.test(p.label || '')), 'no scan of the work packet');
  assert.equal(outcome.stopped, false);
});
