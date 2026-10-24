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
function chainHarness(answers) {
  const calls = [];
  const logs = [];
  const writeBacks = [];
  const build = new Function('stubs', `
    const { runStage, driveVerify, driveReview, driveWallProbe, classifyDecisions, writeBackSliceStatus, log, slug } = stubs
    // No implement ran before this chain, so it runs no plan check.
    let codeMoved = 0
    const planFreshness = async () => ({ fresh: true })
    // WF-SYSTEM-REVIEW C2: the split threshold that driveChain reads.
    const SPLIT_AFTER_STOPS = 2
    // C3: implement runs through implementSlice, which dispatches runStage with the stop check.
    const implementSlice = (slice, idx) => runStage('implement', slice, idx, { stopCheck: true })
    ${extractFn('verifyClean')}
    ${extractFn('evaluateGate')}
    // WF-DESIGN-PLAN B1: the review's design findings stop the chain for the person.
    ${extractFn('amendFindingsOf')}
    ${extractFn('amendFindingsText')}
    ${extractFn('amendStopReason')}
    ${extractFn('driveChain')}
    return driveChain
  `);
  const answer = (stage) => answers[stage] || { stage, status: 'complete', artifactPath: `x/${stage}.md`, terminal: { statusField: 'complete', convergence: 'converged', result: 'pass', verdict: 'ship', blockerCount: 0 } };
  const driveChain = build({
    slug: 'engine-modules',
    log: (m) => logs.push(m),
    runStage: async (stage, slice, idx, extra = {}) => { calls.push({ stage, extra }); return answer(stage); },
    driveVerify: async () => { calls.push({ stage: 'verify' }); return answer('verify'); },
    driveReview: async () => { calls.push({ stage: 'review' }); return answer('review'); },
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
  const clause = new Function(`${extractFn('stopCheckClause')}; return stopCheckClause`)()('/r/.ai/workflows/s/.control.json', '/r/.ai/workflows/s/.driver-journal.jsonl');
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

test('the stop check reads the control file by path, fresh, and never edits it', () => {
  const clause = new Function(`${extractFn('stopCheckClause')}; return stopCheckClause`)()('/r/.ai/workflows/s/.control.json', '/r/.ai/workflows/s/.driver-journal.jsonl');
  assert.match(clause, /Read \/r\/\.ai\/workflows\/s\/\.control\.json now, fresh/);
  assert.match(clause, /"after" is "current"/);
  assert.match(clause, /agent-end" line for that stage .* later than the request's "requestedAt"/s);
  assert.doesNotMatch(clause, /"pause"/);
  assert.match(clause, /status 'stopped', stopReason/);
  assert.match(clause, /Never edit or delete a control\s+file/);
  assert.match(clause, /treat it as \{"action":"stop","after":"current"\}/, 'an unparseable file is a stop');
});

test('every stage boundary carries the stop check, and no fix round does', () => {
  assert.match(src, /status: \{ enum: \['complete', 'hard-stop', 'stopped'\] \}/, 'STAGE_RESULT allows stopped');
  assert.match(src, /runStage\(stage, sliceArg, idx, \{ stopCheck: true \}\)/, 'plan and implement in driveChain');
  assert.match(src, /stopCheck: round === 1 && !probeCorrection/, 'verify: the first round only');
  assert.match(src, /runStage\('review', sliceArg, idx, \{ stopCheck: true \}\)/, 'review without the fan-out');
  assert.match(extractFn('driveReview'), /stopCheck\(\) \+ ` When the stop-request check stops you/, 'review fan-out: the rubric selection agent checks before any scout');
  assert.match(extractFn('runUpdateDepsExec'), /stopCheck\(\)/, 'update-deps exec');
  assert.match(extractFn('driveVerify'), /last\.status === 'stopped'\) return last/, 'verify passes a stop through');
  assert.match(src, /if \(outcome\.stoppedAt === 'stop-request'\) \{/);
  assert.match(src, /outcome\.route = `\/wf yolo \$\{slug\}\$\{slice \? ' ' \+ slice : ''\}`/, 'the route is the resume command');
});

// WF-DESIGN-PLAN B1 (P2): a review with findings against the confirmed design stops the chain at
// review, with the findings as the reason and the amend route; the driver neither fixes nor dismisses them.
test('a review with design findings stops at review with the route /wf design <slug> amend', async () => {
  const review = {
    stage: 'review', slice: 'auth', status: 'complete', artifactPath: 'x/07-review-auth.md',
    terminal: { verdict: 'ship-with-caveats', blockerCount: 0 },
    amendFindings: [{ key: 'design-1', severity: 'HIGH', summary: 'the list uses cards, the board shows rows', contract: 'design/r1/boards/list--default.png' }],
  };
  const h = chainHarness({ review });
  const chain = await h.driveChain(['plan', 'implement', 'verify', 'review'], 'auth', IDX);
  assert.equal(chain.stopped, true);
  assert.equal(chain.at, 'review');
  assert.equal(chain.route, '/wf design engine-modules amend');
  assert.ok(chain.reason.includes('design-1 (HIGH): the list uses cards, the board shows rows [against design/r1/boards/list--default.png]'), chain.reason);
  assert.match(chain.reason, /the person decides amend, keep, or defer/);
  assert.deepEqual(chain.amendFindings.map((f) => f.key), ['design-1']);
  assert.deepEqual(h.writeBacks, [], 'the slice does not clear');
  const clean = chainHarness({ review: { ...review, amendFindings: [] } });
  assert.equal((await clean.driveChain(['review'], 'auth', IDX)).stopped, false, 'an empty list clears the gate as before');
});

test('the slice and slug outcomes carry the chain route; the slug-wide review stops with the amend route', () => {
  assert.ok(src.includes("route = chain.route || `address the gate at '${chain.at}'"), 'slice mode');
  assert.ok(src.includes("route: chain.route || `address the gate at '${chain.at}' on slice"), 'slug mode');
  assert.ok(src.includes("stoppedAt: 'review', reason: amendStopReason(rev), amendFindings: amendFindingsOf(rev), results, slugWide: rev, route: `/wf design ${slug} amend` }"), 'slug-wide review');
});
