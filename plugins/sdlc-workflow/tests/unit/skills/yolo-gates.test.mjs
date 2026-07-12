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

// evaluateGate calls verifyClean, so build them together in one scope and hand them back.
// probeGaps (F2), reChallengeClause + deferralPressure (F3) are also pure top-level fns, so
// they extract by the same brace-matching — testing the SHIPPED code with no drift-prone copy.
const { verifyClean, evaluateGate, collectDeferrals, probeGaps, reChallengeClause, deferralPressure } = new Function(
  [
    extractFn(yoloSrc, 'verifyClean'),
    extractFn(yoloSrc, 'evaluateGate'),
    extractFn(yoloSrc, 'collectDeferrals'),
    extractFn(yoloSrc, 'probeGaps'),
    extractFn(yoloSrc, 'reChallengeClause'),
    extractFn(yoloSrc, 'deferralPressure'),
    'return { verifyClean, evaluateGate, collectDeferrals, probeGaps, reChallengeClause, deferralPressure };',
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

test('collectDeferrals: threads the probe receipt through into the ship-block hand-back', () => {
  const outcome = {
    ran: [{
      stage: 'verify', slice: 's1',
      terminal: { deferrals: [{ ac: 'AC1', reason: 'live svc', probe: 'curl … → 000' }] },
    }],
  };
  assert.deepEqual(collectDeferrals(outcome), [
    { slice: 's1', ac: 'AC1', reason: 'live svc', probe: 'curl … → 000' },
  ]);
  // no probe recorded → the field is simply absent (not an empty string)
  assert.deepEqual(
    collectDeferrals({ ran: [{ stage: 'verify', slice: 's2', terminal: { deferrals: [{ ac: 'AC2', reason: 'r' }] } }] }),
    [{ slice: 's2', ac: 'AC2', reason: 'r' }]
  );
});

// ---------------------------------------------------------------------------
// probeGaps (F2) — the deferral-LAW compliance check verifyClean deliberately does NOT
// enforce. Returns ac-bearing deferral entries (deduped by ac, both arrays) with no
// non-empty `probe`. A non-empty result drives ONE corrective re-run, then a hard-stop.
// ---------------------------------------------------------------------------
test('probeGaps: every deferral receipted ⇒ no gaps', () => {
  assert.deepEqual(
    probeGaps({ deferrals: [{ ac: 'AC1', reason: 'r', probe: 'adb devices → none' }] }, []),
    []
  );
  assert.deepEqual(probeGaps({ deferrals: [] }, []), []);
});

test('probeGaps: a probe-less deferral is the only gap returned', () => {
  const gaps = probeGaps({ deferrals: [
    { ac: 'AC1', reason: 'r1', probe: 'firebase projects:list → 0 projects' },
    { ac: 'AC2', reason: 'r2' },   // no probe
  ] }, []);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].ac, 'AC2');
});

test('probeGaps: an empty / whitespace probe counts as missing', () => {
  assert.equal(probeGaps({ deferrals: [{ ac: 'AC1', reason: 'r', probe: '' }] }, []).length, 1);
  assert.equal(probeGaps({ deferrals: [{ ac: 'AC1', reason: 'r', probe: '   ' }] }, []).length, 1);
});

test('probeGaps: a probe on the residual copy credits the terminal copy of the same ac (dedupe either array)', () => {
  // terminal copy carries no probe; the residual-parked copy of the SAME ac does → compliant.
  assert.deepEqual(
    probeGaps({ deferrals: [{ ac: 'AC1', reason: 'r' }] }, [{ ac: 'AC1', reason: 'r', probe: 'env KEY unset' }]),
    []
  );
});

test('probeGaps: ac-less notes are ignored (match collectDeferrals)', () => {
  assert.deepEqual(probeGaps({ deferrals: [{ reason: 'no ac named' }] }, [{ note: 'flaky teardown' }]), []);
});

test('probeGaps: gaps are drawn from BOTH arrays and deduped by ac', () => {
  const gaps = probeGaps(
    { deferrals: [{ ac: 'AC1', reason: 'a' }] },                        // no probe
    [{ ac: 'AC1', reason: 'a' }, { ac: 'AC2', reason: 'b' }]            // AC1 dup (no probe), AC2 new (no probe)
  );
  assert.deepEqual(gaps.map(g => g.ac).sort(), ['AC1', 'AC2']);
});

// ---------------------------------------------------------------------------
// reChallengeClause (F3) — open prior deferrals → a RE-CHALLENGE block for the verify
// prompt. Pinned as a string (P1-4): no execution, just the template shape.
// ---------------------------------------------------------------------------
test('reChallengeClause: empty / absent prior deferrals ⇒ no clause', () => {
  assert.equal(reChallengeClause([]), '');
  assert.equal(reChallengeClause(undefined), '');
  assert.equal(reChallengeClause(null), '');
});

test('reChallengeClause: lists each open prior deferral and forbids inheriting it', () => {
  const clause = reChallengeClause([
    { slice: 's1', reason: 'Firebase creds unavailable', deferredAt: '2026-06-30T00:00:00Z', repeatOf: 's0' },
  ]);
  assert.match(clause, /RE-CHALLENGE/);
  assert.match(clause, /s1/);
  assert.match(clause, /Firebase creds unavailable/);
  assert.match(clause, /deferred-at: 2026-06-30/);
  assert.match(clause, /repeat-of: s0/);
  assert.match(clause, /Do NOT inherit|NOT facts/);
});

// ---------------------------------------------------------------------------
// deferralPressure (F3) — hand-back rollup across prior (index) + this run's deferrals.
// Visibility only; null when there is no pressure.
// ---------------------------------------------------------------------------
test('deferralPressure: null when there is no pressure at all', () => {
  assert.equal(deferralPressure([], []), null);
  assert.equal(deferralPressure(undefined, undefined), null);
});

test('deferralPressure: counts open entries, the oldest date, and repeat walls across prior + run', () => {
  const p = deferralPressure(
    [
      { slice: 's1', reason: 'no creds', deferredAt: '2026-06-30T00:00:00Z' },
      { slice: 's2', reason: 'no device', deferredAt: '2026-07-05T00:00:00Z', repeatOf: 's1' },
    ],
    [{ slice: 's3', ac: 'AC9', reason: 'live svc' }]   // this run's new deferral (no date — yolo has no clock)
  );
  assert.equal(p.open, 3);
  assert.equal(p.oldestDeferredAt, '2026-06-30T00:00:00Z');
  assert.equal(p.repeatWalls, 1);
});

test('deferralPressure: collapses duplicate prior entries by slice::key', () => {
  const p = deferralPressure(
    [{ slice: 's1', reason: 'no creds' }, { slice: 's1', reason: 'no creds' }],
    []
  );
  assert.equal(p.open, 1);
  assert.equal(p.repeatWalls, 0);
  assert.equal(p.oldestDeferredAt, null);
});
