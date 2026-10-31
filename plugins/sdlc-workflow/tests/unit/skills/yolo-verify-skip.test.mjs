// Verify does not run again when nothing changed. A verify that a route back forced, after an
// implement that made no commit, keeps the clean result of the slice. A clean verify whose
// deferrals carry no probe receipt gets the short wall probe, not a second full verify.
//
// yolo.js is a Workflow script, not a module, so the functions are extracted by brace-matching
// and run against stub agents.
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

const CLEAN = (stage) => ({ stage, status: 'complete', artifactPath: `x/${stage}.md`, terminal: { statusField: 'complete', convergence: 'converged', result: 'pass' } });

// driveChain with every dispatch stubbed. `heads` is the list of HEAD commits that headCommit
// returns in order.
function chainHarness(heads, { selfVerifyResult = CLEAN('verify') } = {}) {
  const calls = [];
  const verifyArgs = [];
  const logs = [];
  const build = new Function('stubs', `
    const { runStage, driveVerify, driveReview, driveWallProbe, classifyDecisions, writeBackSliceStatus, headCommit, log, slug, ANSWERED } = stubs
    const projectRoot = '/r'
    const WF_CMD = 'node "/p/scripts/wf.mjs"'
    let codeMoved = 0
    const planFreshness = async () => ({ fresh: true })
    const SPLIT_AFTER_STOPS = 2
    const MAX_ROUTE_BACKS = 2
    const CHAIN_ORDER = ['plan', 'implement', 'verify', 'review']
    const SELF_VERIFY_SIZES = ['xs', 's']
    const implementSlice = (slice, idx, entry, answered, selfVerify) => runStage('implement', slice, idx, { stopCheck: true, answered, selfVerify })
    ${extractFn('verifyClean')}
    ${extractFn('evaluateGate')}
    ${extractFn('sliceOf')}
    ${extractFn('questionsOf')}
    ${extractFn('questionsText')}
    ${extractFn('stopOut')}
    ${extractFn('settle')}
    ${extractFn('questionStop')}
    ${extractFn('answeredFor')}
    ${extractFn('driveChain')}
    return driveChain
  `);
  let h = 0;
  const driveChain = build({
    slug: 'demo',
    ANSWERED: [],
    log: (m) => logs.push(m),
    runStage: async (stage, slice, idx, extra = {}) => {
      calls.push(extra.selfVerify ? `${stage}+verify` : stage);
      return extra.selfVerify && selfVerifyResult ? { ...CLEAN(stage), verify: selfVerifyResult } : CLEAN(stage);
    },
    driveVerify: async (slice, idx, extra) => { verifyArgs.push(extra); calls.push(extra.first ? 'verify-from-implement' : 'verify'); return CLEAN('verify'); },
    driveReview: async () => { calls.push('review'); return CLEAN('review'); },
    driveWallProbe: async () => null,
    classifyDecisions: async (r) => r,
    writeBackSliceStatus: async () => ({ ok: true, wrote: ['00-index.md'] }),
    headCommit: async () => { const v = heads[Math.min(h, heads.length - 1)]; h += 1; return v; },
  });
  return { driveChain, calls, logs, verifyArgs };
}

const DONE = { slices: [{ slice: 'auth', stages: { plan: 'done', implement: 'done', verify: 'done' } }], priorDeferrals: [] };

test('a route back whose implement makes no commit skips the verify of a clean slice', async () => {
  const h = chainHarness(['abc1234', 'abc1234']);
  const chain = await h.driveChain(['plan', 'implement', 'verify'], 'auth', DONE, { forceFrom: 'plan', carried: { key: 'k', answer: 'a' } });
  assert.equal(chain.stopped, false);
  assert.deepEqual(h.calls, ['plan', 'implement']);
  const skipped = chain.ran.find((r) => r.stage === 'verify');
  assert.deepEqual([skipped.skipped, skipped.accepted], [true, true]);
  assert.match(skipped.decisions[0].decision, /the answer k is carried as accepted/);
  assert.ok(h.logs.includes('skip verify:auth (no code change since the clean verify at abc1234)'));
});

test('a route back whose implement commits runs verify', async () => {
  const h = chainHarness(['abc1234', 'def5678']);
  await h.driveChain(['plan', 'implement', 'verify'], 'auth', DONE, { forceFrom: 'plan', carried: { key: 'k', answer: 'a' } });
  assert.deepEqual(h.calls, ['plan', 'implement', 'verify']);
});

test('a route back to verify itself always runs verify', async () => {
  const h = chainHarness(['abc1234']);
  await h.driveChain(['plan', 'implement', 'verify'], 'auth', DONE, { forceFrom: 'verify', carried: { key: 'k', answer: 'a' } });
  assert.deepEqual(h.calls, ['verify']);
});

test('a slice that never verified clean runs verify after a route back with no commit', async () => {
  const notClean = { slices: [{ slice: 'auth', stages: { plan: 'done', implement: 'done' } }], priorDeferrals: [] };
  const h = chainHarness(['abc1234', 'abc1234']);
  await h.driveChain(['plan', 'implement', 'verify'], 'auth', notClean, { forceFrom: 'plan', carried: { key: 'k', answer: 'a' } });
  assert.deepEqual(h.calls, ['plan', 'implement', 'verify']);
});

// driveVerify with the verify stage and the wall probe stubbed.
function verifyHarness(rounds, wall) {
  const calls = { verify: 0, wall: [] };
  const build = new Function('stubs', `
    const { runStage, driveWallProbe, log } = stubs
    ${extractFn('acKey')}
    ${extractFn('verifyClean')}
    ${extractFn('personAccepted')}
    ${extractFn('probeGaps')}
    ${extractFn('driveVerify')}
    return driveVerify
  `);
  const driveVerify = build({
    log: () => {},
    runStage: async () => { const r = rounds[Math.min(calls.verify, rounds.length - 1)]; calls.verify += 1; return r; },
    driveWallProbe: async (slice, idx, fresh) => { calls.wall.push(fresh); return wall; },
  });
  return { driveVerify, calls };
}

const PARTIAL = { stage: 'verify', status: 'complete', artifactPath: 'v.md', terminal: { convergence: 'converged', result: 'partial', deferrals: [{ ac: 'AC2', reason: 'no emulator' }] } };

test('a clean verify with a probe gap calls the wall probe, not a second verify', async () => {
  const h = verifyHarness([PARTIAL], { walls: [{ ac: 'AC2', stands: true, probe: 'adb devices → none' }] });
  const res = await h.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(h.calls.verify, 1);
  assert.deepEqual(h.calls.wall, [[{ ac: 'AC2', reason: 'no emulator' }]]);
  assert.equal(res.terminal.deferrals[0].probe, 'adb devices → none');
  assert.equal(res.status, 'complete');
});

test('a wall that fell runs the full verify again, and a second gap still stops', async () => {
  const fell = verifyHarness([PARTIAL, CLEAN('verify')], { walls: [{ ac: 'AC2', stands: false }] });
  const ok = await fell.driveVerify('auth', { priorDeferrals: [] });
  assert.deepEqual([fell.calls.verify, ok.terminal.result], [2, 'pass']);
  const stuck = verifyHarness([PARTIAL, PARTIAL], null);
  const stop = await stuck.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(stop.status, 'hard-stop');
  assert.match(stop.hardStopReason, /still carry no capability-probe receipt after a corrective re-run/);
});

test('the verify reference keeps a clean result at its verified HEAD', () => {
  const verify = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'verify.md'), 'utf8');
  assert.match(verify, /When `verified-head` of the last verify record of this slice equals HEAD and the plan of the slice did not change, keep the last clean result/);
  const schema = readFileSync(path.join(pluginRoot, 'schemas', 'frontmatter.schema.json'), 'utf8');
  assert.match(schema, /"verified-head": \{ "type": "string"/);
});

const NEW = (complexity) => ({ slices: [{ slice: 'auth', complexity, stages: { plan: 'todo', implement: 'todo', verify: 'todo' } }], priorDeferrals: [] });

test('an xs or s slice verifies in its implement agent: no verify agent runs', async () => {
  for (const size of ['xs', 's']) {
    const h = chainHarness(['abc1234']);
    const chain = await h.driveChain(['plan', 'implement', 'verify'], 'auth', NEW(size));
    assert.equal(chain.stopped, false);
    assert.deepEqual(h.calls, ['plan', 'implement+verify', 'verify-from-implement']);
    assert.deepEqual(h.verifyArgs[0].first, CLEAN('verify'));
    assert.ok(h.logs.some(l => l.includes('ran in the implement agent')));
  }
});

test('an m slice, or a slice without a complexity, keeps its verify agent', async () => {
  for (const size of ['m', 'l', undefined]) {
    const h = chainHarness(['abc1234']);
    await h.driveChain(['plan', 'implement', 'verify'], 'auth', NEW(size));
    assert.deepEqual(h.calls, ['plan', 'implement', 'verify']);
  }
});

test('an xs implement that returns no verify gets a verify agent', async () => {
  const h = chainHarness(['abc1234'], { selfVerifyResult: null });
  await h.driveChain(['plan', 'implement', 'verify'], 'auth', NEW('xs'));
  assert.deepEqual(h.calls, ['plan', 'implement+verify', 'verify']);
  assert.ok(h.logs.some(l => l.includes('returned no verify')));
});

test('driveVerify: a self-verify that did not converge stops without a verify agent', async () => {
  const runs = [];
  const build = new Function('stubs', `
    const { runStage, log, probeGaps, driveWallProbe, acKey } = stubs
    ${extractFn('verifyClean')}
    ${extractFn('driveVerify')}
    return driveVerify
  `);
  const driveVerify = build({
    runStage: async (...a) => { runs.push(a); return CLEAN('verify'); },
    log: () => {}, probeGaps: () => [], driveWallProbe: async () => null, acKey: (x) => x,
  });
  const failed = { status: 'complete', terminal: { convergence: 'escalated', result: 'fail', substantiveResidual: true } };
  const r = await driveVerify('auth', { priorDeferrals: [] }, { first: failed });
  assert.equal(r.status, 'hard-stop');
  assert.match(r.hardStopReason, /implement agent of 'auth' did not converge/);
  assert.equal(runs.length, 0);
  const ok = await driveVerify('auth', { priorDeferrals: [] }, { first: CLEAN('verify') });
  assert.equal(ok.status, 'complete');
  assert.equal(runs.length, 0);
});

// The person's accept is one shape: terminal.acceptedItems with by 'person', the same list that
// a live decision or a delegate accept fills, so the hand-back names the accepted items.
const PERSON_ACCEPT = { stage: 'verify', slice: 'auth', status: 'complete', artifactPath: 'v.md', terminal: { convergence: 'escalated', result: 'fail', substantiveResidual: true, acceptedItems: [{ item: 'AC-3 loads under 2 s', by: 'person' }] } };

test('an answered verify that lists items with by person passes on the answer, and the hand-back names them', async () => {
  const h = verifyHarness([PERSON_ACCEPT], null);
  const res = await h.driveVerify('auth', { priorDeferrals: [] }, { answered: { key: 'verify:auth', answer: 'accept it', by: 'person' } });
  assert.equal(res.accepted, true);
  assert.equal(h.calls.verify, 1, 'no fix round after the accept');
  const acceptedResiduals = new Function(`${extractFn('stageResults')}\n${extractFn('acceptedResiduals')}\nreturn acceptedResiduals`)();
  assert.deepEqual(acceptedResiduals({ ran: [res] }), [{ slice: 'auth', item: 'AC-3 loads under 2 s', by: 'person' }]);
});

test('without an answer, items with by person do not accept a failing verify', async () => {
  const h = verifyHarness([PERSON_ACCEPT, PERSON_ACCEPT], null);
  const res = await h.driveVerify('auth', { priorDeferrals: [] });
  assert.equal(res.accepted, undefined);
  assert.equal(res.status, 'hard-stop');
});

test('the verify prompt and the stage schema carry one accept shape', () => {
  assert.doesNotMatch(src, /acceptedByPerson/);
  assert.match(src, /return ` \+\s+`each of those items in terminal\.acceptedItems as \{ item, by: 'person' \}/);
  assert.match(src, /'person' when the answer of the\n\s+\/\/ person accepts the slice with its items/);
});
