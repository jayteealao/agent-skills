// Unit coverage for the /wf yolo gate functions — the pure, load-bearing predicates
// that decide whether an autonomous run PROCEEDS or HARD-STOPs: verifyClean (is a verify
// stage clean enough to continue?), evaluateGate (defensive re-check of a stage's terminal
// state), and collectDeferrals (gather the runtime-evidence deferrals /wf ship will block
// on). A false "clean" here silently ships an unverified acceptance criterion.
//
// workflows/yolo.js is a Workflow SCRIPT, not an importable ES module — it has top-level
// `return`/`await` and references injected globals (agent, log, phase, args). So we can't
// import it. Instead we EXTRACT each named function's exact source text by brace-matching
// and evaluate it in isolation. This tests the SHIPPED code (no drift-prone copy) while
// touching none of the async orchestration around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const yoloSrc = readFileSync(
  path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'),
  'utf8'
);

// Extract a top-level `function NAME(...) { ... }` declaration by brace-matching from the
// first `{` after the signature to its balanced close. Robust to nested braces / object
// literals inside the body; naive string-scanning is enough for these small pure fns.
function extractFn(src, name) {
  const sig = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = sig.exec(src);
  assert.ok(m, `could not locate function ${name} in yolo.js`);
  let i = src.indexOf('{', m.index);
  assert.ok(i > -1, `no body brace for ${name}`);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(m.index, j + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

// evaluateGate calls verifyClean, so build all three together in one scope and hand them back.
const { verifyClean, evaluateGate, collectDeferrals } = new Function(
  [
    extractFn(yoloSrc, 'verifyClean'),
    extractFn(yoloSrc, 'evaluateGate'),
    extractFn(yoloSrc, 'collectDeferrals'),
    'return { verifyClean, evaluateGate, collectDeferrals };',
  ].join('\n')
)();

// Convenience builders for verify terminal states.
const converged = (over = {}) => ({ convergence: 'converged', result: 'partial', substantiveResidual: false, ...over });

test('verifyClean: a plain pass is clean', () => {
  assert.equal(verifyClean({ convergence: 'converged', result: 'pass' }, []), true);
  assert.equal(verifyClean({ convergence: 'not-needed', result: 'pass' }, undefined), true);
});

test('verifyClean: null terminal or non-converged loop is never clean', () => {
  assert.equal(verifyClean(null, []), false);
  assert.equal(verifyClean({ convergence: 'escalated', result: 'pass' }, []), false);
});

test('verifyClean: a substantive residual hard-stops even when converged', () => {
  assert.equal(verifyClean(converged({ result: 'pass', substantiveResidual: true }), []), false);
  assert.equal(verifyClean(converged({ substantiveResidual: true, deferrals: [{ ac: 'AC1' }] }), []), false);
});

test('verifyClean: a deferral-only partial is clean via terminal.deferrals[]', () => {
  assert.equal(verifyClean(converged({ deferrals: [{ ac: 'AC1', reason: 'no device' }] }), []), true);
});

test('verifyClean: a deferral parked in residual[] is clean (the v9.114.0 false-stop fix)', () => {
  // The scenario the fix targets: subagent parks the plan-authorized deferral in the
  // sibling residual[] with empty terminal.deferrals[]. Must be treated as clean.
  assert.equal(
    verifyClean(converged({ deferrals: [] }), [{ ac: 'AC2', reason: 'live service unreachable here' }]),
    true
  );
});

test('verifyClean: a partial with NOTHING recorded stays un-clean', () => {
  assert.equal(verifyClean(converged({ deferrals: [] }), []), false);
  assert.equal(verifyClean(converged({ deferrals: [] }), undefined), false);
});

test('verifyClean: a partial whose only residual is an ac-LESS note is NOT clean (the hole this fix closes)', () => {
  // residual[] is the broader "deferred / could-not-fix" bucket. An ac-less note would
  // pass a bare `.length > 0` check yet record nothing for /wf ship to block on. The gate
  // must agree with collectDeferrals, which drops ac-less entries — so this HARD-STOPs.
  assert.equal(verifyClean(converged({ deferrals: [] }), [{ finding: 'flaky teardown', reason: 'x' }]), false);
  // ...and an ac-less entry in terminal.deferrals[] is likewise not enough on its own.
  assert.equal(verifyClean(converged({ deferrals: [{ reason: 'no ac named' }] }), []), false);
  // But mixing an ac-less note WITH a real ac-bearing deferral is clean (the deferral carries it).
  assert.equal(
    verifyClean(converged({ deferrals: [] }), [{ finding: 'note' }, { ac: 'AC3', reason: 'gated' }]),
    true
  );
});

test('evaluateGate: verify path shares verifyClean, threading residual through', () => {
  assert.equal(evaluateGate('verify', { terminal: converged({ result: 'pass' }) }), 'proceed');
  assert.equal(
    evaluateGate('verify', { terminal: converged({ deferrals: [] }), residual: [{ ac: 'AC1', reason: 'r' }] }),
    'proceed'
  );
  // ac-less residual → does not clear the gate (matches verifyClean).
  assert.equal(
    evaluateGate('verify', { terminal: converged({ deferrals: [] }), residual: [{ note: 'x' }] }),
    'hard-stop'
  );
});

test('evaluateGate: review path needs a ship verdict and zero open blockers', () => {
  assert.equal(evaluateGate('review', { terminal: { verdict: 'ship', blockerCount: 0 } }), 'proceed');
  assert.equal(evaluateGate('review', { terminal: { verdict: 'ship-with-caveats', blockerCount: 0 } }), 'proceed');
  assert.equal(evaluateGate('review', { terminal: { verdict: 'ship', blockerCount: 2 } }), 'hard-stop');
  assert.equal(evaluateGate('review', { terminal: { verdict: 'dont-ship', blockerCount: 0 } }), 'hard-stop');
});

test('evaluateGate: plan/implement path gates on the complete status', () => {
  assert.equal(evaluateGate('plan', { status: 'complete' }), 'proceed');
  assert.equal(evaluateGate('implement', { status: 'hard-stop' }), 'hard-stop');
});

test('collectDeferrals: gathers ac-bearing deferrals from terminal.deferrals[] across slug-mode chains', () => {
  const outcome = {
    results: [
      { ran: [{ stage: 'verify', slice: 's1', terminal: { deferrals: [{ ac: 'AC1', reason: 'no gpu' }] } }] },
      { ran: [{ stage: 'verify', slice: 's2', terminal: { deferrals: [{ ac: 'AC2', reason: 'no key' }] } }] },
    ],
  };
  const got = collectDeferrals(outcome);
  assert.deepEqual(got, [
    { slice: 's1', ac: 'AC1', reason: 'no gpu' },
    { slice: 's2', ac: 'AC2', reason: 'no key' },
  ]);
});

test('collectDeferrals: surfaces residual-parked deferrals and dedups one recorded in BOTH arrays', () => {
  const outcome = {
    ran: [
      {
        stage: 'verify',
        slice: 's1',
        terminal: { deferrals: [{ ac: 'AC1', reason: 'gated' }] },
        residual: [{ ac: 'AC1', reason: 'gated' }, { ac: 'AC9', reason: 'from residual only' }, { note: 'no ac' }],
      },
    ],
  };
  const got = collectDeferrals(outcome);
  // AC1 counted once (dedup by slice::ac); AC9 surfaced from residual; ac-less note dropped.
  assert.deepEqual(got, [
    { slice: 's1', ac: 'AC1', reason: 'gated' },
    { slice: 's1', ac: 'AC9', reason: 'from residual only' },
  ]);
});

test('collectDeferrals: ignores non-verify stages and empty outcomes', () => {
  assert.deepEqual(collectDeferrals({ ran: [{ stage: 'review', terminal: { deferrals: [{ ac: 'X' }] } }] }), []);
  assert.deepEqual(collectDeferrals({}), []);
});
