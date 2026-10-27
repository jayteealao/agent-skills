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
function chainHarness(heads) {
  const calls = [];
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
  let h = 0;
  const driveChain = build({
    slug: 'demo',
    ANSWERED: [],
    log: (m) => logs.push(m),
    runStage: async (stage) => { calls.push(stage); return CLEAN(stage); },
    driveVerify: async () => { calls.push('verify'); return CLEAN('verify'); },
    driveReview: async () => { calls.push('review'); return CLEAN('review'); },
    driveWallProbe: async () => null,
    classifyDecisions: async (r) => r,
    writeBackSliceStatus: async () => ({ ok: true, wrote: ['00-index.md'] }),
    headCommit: async () => { const v = heads[Math.min(h, heads.length - 1)]; h += 1; return v; },
  });
  return { driveChain, calls, logs };
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
