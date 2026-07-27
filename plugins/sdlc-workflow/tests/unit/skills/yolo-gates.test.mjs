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
const {
  verifyClean, evaluateGate, collectDeferrals, probeGaps, reChallengeClause, deferralPressure,
  decisionDigest, acKey,
  // YOLO-DRIVER-LIFECYCLE W3/W4 — the aggregation-truth and tripwire rollups.
  classificationIndex, isRuntimeEvidenceClass, reconcileDeferrals,
  collectSubstantiveFailures, collectSubagentErrors, clearingTripwire,
} = new Function(
  [
    extractFn(yoloSrc, 'acKey'),
    extractFn(yoloSrc, 'verifyClean'),
    extractFn(yoloSrc, 'evaluateGate'),
    extractFn(yoloSrc, 'collectDeferrals'),
    extractFn(yoloSrc, 'probeGaps'),
    extractFn(yoloSrc, 'reChallengeClause'),
    extractFn(yoloSrc, 'deferralPressure'),
    extractFn(yoloSrc, 'decisionDigest'),
    extractFn(yoloSrc, 'classificationIndex'),
    extractFn(yoloSrc, 'isRuntimeEvidenceClass'),
    extractFn(yoloSrc, 'reconcileDeferrals'),
    extractFn(yoloSrc, 'collectSubstantiveFailures'),
    extractFn(yoloSrc, 'collectSubagentErrors'),
    extractFn(yoloSrc, 'clearingTripwire'),
    'return { verifyClean, evaluateGate, collectDeferrals, probeGaps, reChallengeClause, deferralPressure, decisionDigest, acKey, classificationIndex, isRuntimeEvidenceClass, reconcileDeferrals, collectSubstantiveFailures, collectSubagentErrors, clearingTripwire };',
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

// ---------------------------------------------------------------------------
// decisionDigest (W11.1) — groups every recorded autonomous decision by W4 class.
// ---------------------------------------------------------------------------
test('decisionDigest: null when no decisions were recorded', () => {
  assert.equal(decisionDigest({ ran: [{ stage: 'plan', decisions: [] }] }), null);
  assert.equal(decisionDigest({}), null);
});

test('decisionDigest: groups by class across slug-mode chains and surfaces intent-bearing stamps', () => {
  const outcome = {
    results: [
      { ran: [{ stage: 'plan', slice: 's1', decisions: [{ class: 'implementation-detail', decision: 'chose lib X' }, { class: 'implementation-detail' }] }] },
      { ran: [{ stage: 'implement', slice: 's2', decisions: [{ decision: 'no class stamp' }, { class: 'intent-bearing', decision: 'inverted control authority' }] }] },
    ],
  };
  const d = decisionDigest(outcome);
  assert.equal(d.total, 4);
  assert.equal(d.byClass['implementation-detail'], 2);
  assert.equal(d.byClass['intent-bearing'], 1);
  // W3.3 — `unclassified` is a GAP, not a class: it never lands in byClass (which
  // would make it look like a third, understood kind of decision) and it is counted
  // separately so the headline guarantee can be qualified.
  assert.equal(d.byClass['unclassified'], undefined);
  assert.equal(d.unclassified.length, 1);
  assert.match(d.unclassified[0].decision, /no class stamp/);
  // an intent-bearing stamp on an autonomous record is surfaced (it should have been a stop)
  assert.equal(d.intentBearing.length, 1);
  assert.match(d.intentBearing[0].decision, /control authority/);
});

test('decisionDigest: works in slice-mode (outcome.ran) too', () => {
  const d = decisionDigest({ ran: [{ stage: 'plan', decisions: [{ class: 'implementation-detail' }] }] });
  assert.equal(d.total, 1);
  assert.deepEqual(d.byClass, { 'implementation-detail': 1 });
  assert.deepEqual(d.intentBearing, []);
});

// ---------------------------------------------------------------------------
// W3.3 (YOLO-DRIVER-LIFECYCLE) — the guarantee carries its own qualifier.
// "intent-bearing escapes: 0" out of 173 decisions is worthless if 40 of them were
// never classified. Every run measured leaked ~25% unclassified into that zero.
// ---------------------------------------------------------------------------

test('decisionDigest: a fully classified run reports an EXACT intent-bearing guarantee', () => {
  const d = decisionDigest({
    ran: [{ stage: 'plan', decisions: [{ class: 'implementation-detail' }, { class: 'implementation-detail' }] }],
  });
  assert.equal(d.intentBearingGuarantee, 'exact');
  assert.deepEqual(d.unclassified, []);
});

test('decisionDigest: ONE unstamped decision downgrades the whole guarantee to SUSPECT', () => {
  const d = decisionDigest({
    ran: [{ stage: 'implement', slice: 's1', decisions: [
      { class: 'implementation-detail', decision: 'named the helper parseGoal' },
      { decision: 'switched the retry path to the queue' },   // no stamp
    ] }],
  });
  // zero intent-bearing stamps, but the run may NOT claim zero escapes
  assert.deepEqual(d.intentBearing, []);
  assert.equal(d.intentBearingGuarantee, 'suspect');
  assert.equal(d.unclassified.length, 1);
  // provenance survives so the user can go read the one that was not checked
  assert.equal(d.unclassified[0].stage, 'implement');
  assert.equal(d.unclassified[0].slice, 's1');
});

test('decisionDigest: a whitespace-only class stamp counts as unclassified, not as a class', () => {
  const d = decisionDigest({ ran: [{ stage: 'plan', decisions: [{ class: '   ', decision: 'x' }] }] });
  assert.equal(d.intentBearingGuarantee, 'suspect');
  assert.deepEqual(d.byClass, {});
  assert.equal(d.unclassified.length, 1);
});

// ---------------------------------------------------------------------------
// W2 (HANDOFF-SHIP-HARDENING, 9.138.0) — acKey normalization + authorized deferrals
// ---------------------------------------------------------------------------

test('acKey: extracts and normalizes the leading AC token across label shapes', () => {
  assert.equal(acKey('AC2'), acKey('AC2 — three consecutive turns are heard'));
  assert.equal(acKey('ac-7a'), acKey('AC 7a'));
  assert.equal(acKey('AC3.1'), acKey('ac3.1 — decimal sub-criterion'));
  // free-form labels fall back to the whole trimmed string — distinct labels stay distinct
  assert.notEqual(acKey('latency budget'), acKey('cold-start budget'));
  assert.notEqual(acKey('AC2'), acKey('AC21'));
});

test('probeGaps: a bare residual copy dedupes against the labeled, receipted terminal copy (Playster false HARD-STOP)', () => {
  // the exact shape that burned two Playster runs: fully-labeled + receipted in
  // terminal.deferrals[], bare duplicate in residual[]
  const t = { deferrals: [{ ac: 'AC2 — three consecutive turns are heard', probe: 'adb devices → 1 device' }] };
  const residual = [{ ac: 'AC2' }];
  assert.deepEqual(probeGaps(t, residual), []);
});

test('probeGaps: normalization never credits a receipt to a genuinely different AC', () => {
  const t = { deferrals: [{ ac: 'AC2 — heard', probe: 'probe ran' }] };
  const residual = [{ ac: 'AC3' }];
  const gaps = probeGaps(t, residual);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].ac, 'AC3');
});

test('collectDeferrals: labeled terminal copy + bare residual copy of the same ac count once', () => {
  const out = collectDeferrals({
    ran: [{
      stage: 'verify', slice: 's1',
      terminal: { deferrals: [{ ac: 'AC2 — heard end-to-end', reason: 'no device', probe: 'adb devices → none' }] },
      residual: [{ ac: 'AC2', reason: 'no device' }],
    }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].probe, 'adb devices → none');
});

test('deferralPressure: run deferrals with differently-labeled copies of one ac collapse', () => {
  const p = deferralPressure([], [
    { slice: 's1', ac: 'AC2 — heard' },
    { slice: 's1', ac: 'AC2' },
  ]);
  assert.equal(p.open, 1);
});

test('reChallengeClause: PO-authorized deferrals are excluded from the re-challenge block', () => {
  const clause = reChallengeClause([
    { slice: 's1', reason: 'no live voice env', authorized: true },
    { slice: 's2', reason: 'no staging DB' },
  ]);
  assert.doesNotMatch(clause, /no live voice env/);
  assert.match(clause, /no staging DB/);
});

test('reChallengeClause: all-authorized prior deferrals ⇒ no clause at all', () => {
  assert.equal(reChallengeClause([{ slice: 's1', reason: 'accepted wall', authorized: true }]), '');
});

// ---------------------------------------------------------------------------
// YOLO-DRIVER-LIFECYCLE W3.2 — the aggregate may not contradict its inputs.
//
// Field failure: a run's own recorded decision said "AC-NC1 stays a
// build-capability deferral, NOT runtime-evidence", and the outcome listed AC-NC1
// under runtimeEvidenceDeferrals anyway — steering the user into a /wf probe that
// could never help. The driver's re-derivation must never beat a recorded
// classification; where they disagree the recorded answer wins and the
// disagreement is REPORTED, never silently applied.
// ---------------------------------------------------------------------------

test('isRuntimeEvidenceClass: an absent classification is no disagreement (leave the entry alone)', () => {
  assert.equal(isRuntimeEvidenceClass(undefined), true);
  assert.equal(isRuntimeEvidenceClass(''), true);
  assert.equal(isRuntimeEvidenceClass('   '), true);
});

test('isRuntimeEvidenceClass: the runtime-evidence family agrees with the driver', () => {
  assert.equal(isRuntimeEvidenceClass('runtime-evidence'), true);
  assert.equal(isRuntimeEvidenceClass('environment-negotiable'), true);   // wall-ownership vocabulary
  assert.equal(isRuntimeEvidenceClass('external'), true);
  assert.equal(isRuntimeEvidenceClass('RUNTIME-EVIDENCE'), true);         // case-insensitive
});

test('isRuntimeEvidenceClass: anything else is a disagreement to reconcile', () => {
  assert.equal(isRuntimeEvidenceClass('build-capability'), false);
  assert.equal(isRuntimeEvidenceClass('scope'), false);
  assert.equal(isRuntimeEvidenceClass('code-owned'), false);
});

test('classificationIndex: a recorded DECISION outranks the index ledger for the same AC', () => {
  const outcome = {
    ran: [{ stage: 'verify', slice: 's1', decisions: [{ class: 'implementation-detail', ac: 'AC-NC1', classification: 'build-capability' }] }],
  };
  const map = classificationIndex(outcome, [{ slice: 's1', ac: 'AC-NC1', wallOwnership: 'external' }]);
  const rec = map.get(acKey('AC-NC1'));
  assert.equal(rec.classification, 'build-capability');
  assert.equal(rec.source, 'recorded-decision');
});

test('classificationIndex: the index ledger supplies a classification when no decision does', () => {
  const map = classificationIndex({ ran: [] }, [{ slice: 's1', ac: 'AC4', wallOwnership: 'code-owned' }]);
  assert.equal(map.get(acKey('AC4')).source, 'index-ledger');
});

test('reconcileDeferrals: the exact incident — a decision reclassifies AC-NC1 out of the ship-block list', () => {
  const outcome = {
    ran: [{
      stage: 'verify', slice: 'notif',
      decisions: [{ class: 'implementation-detail', ac: 'AC-NC1', classification: 'build-capability', decision: 'AC-NC1 stays a build-capability deferral, NOT runtime-evidence' }],
    }],
  };
  const collected = [
    { slice: 'notif', ac: 'AC-NC1', reason: 'release build unavailable' },
    { slice: 'notif', ac: 'AC-NC2', reason: 'no device attached', probe: 'adb devices -> (empty)' },
  ];
  const { deferrals, reconciled } = reconcileDeferrals(outcome, collected, []);
  // the reclassified AC leaves the list /wf ship blocks on ...
  assert.deepEqual(deferrals.map(d => d.ac), ['AC-NC2']);
  // ... and is REPORTED rather than dropped, carrying who said so and why
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].ac, 'AC-NC1');
  assert.equal(reconciled[0].recordedClassification, 'build-capability');
  assert.equal(reconciled[0].source, 'recorded-decision');
  assert.match(reconciled[0].note, /canonical/);
});

test('reconcileDeferrals: label variance does not defeat reconciliation (acKey-normalized)', () => {
  const outcome = { ran: [{ stage: 'verify', decisions: [{ ac: 'AC2', classification: 'build-capability' }] }] };
  const { deferrals, reconciled } = reconcileDeferrals(outcome, [{ slice: 's1', ac: 'AC2 — three consecutive turns are heard' }], []);
  assert.equal(deferrals.length, 0);
  assert.equal(reconciled.length, 1);
});

test('reconcileDeferrals: agreement is silent — nothing is moved and nothing is reported', () => {
  const outcome = { ran: [{ stage: 'verify', decisions: [{ ac: 'AC2', classification: 'runtime-evidence' }] }] };
  const collected = [{ slice: 's1', ac: 'AC2', reason: 'no emulator', probe: 'adb devices' }];
  const { deferrals, reconciled } = reconcileDeferrals(outcome, collected, []);
  assert.deepEqual(deferrals, collected);
  assert.deepEqual(reconciled, []);
});

test('reconcileDeferrals: no recorded classifications at all ⇒ pass-through untouched', () => {
  const collected = [{ slice: 's1', ac: 'AC1', reason: 'x' }];
  const { deferrals, reconciled } = reconcileDeferrals({ ran: [] }, collected, []);
  assert.equal(deferrals, collected);   // same array, no copy
  assert.deepEqual(reconciled, []);
});

// ---------------------------------------------------------------------------
// W3.2 (second half) — a FAIL survives into the outcome as a fail.
// The v9.134-era conflation ran the other way: verify recorded two ACs as
// substantive fails with ZERO deferrals, and the run report listed them as
// deferrals — telling the user to go collect evidence for a defect.
// ---------------------------------------------------------------------------

test('collectSubstantiveFailures: a verify result fail is reported as a failure, not a deferral', () => {
  const f = collectSubstantiveFailures({
    ran: [{ stage: 'verify', slice: 's1', artifactPath: '/x/06-verify-s1.md', terminal: { result: 'fail', substantiveResidual: true, deferrals: [] } }],
  });
  assert.equal(f.length, 1);
  assert.equal(f[0].slice, 's1');
  assert.equal(f[0].result, 'fail');
  assert.equal(f[0].substantiveResidual, true);
});

test('collectSubstantiveFailures: a substantive residual counts even when result is partial', () => {
  const f = collectSubstantiveFailures({
    ran: [{ stage: 'verify', slice: 's2', terminal: { result: 'partial', substantiveResidual: true } }],
  });
  assert.equal(f.length, 1);
});

test('collectSubstantiveFailures: a deferral-only partial is NOT a failure', () => {
  const f = collectSubstantiveFailures({
    ran: [{ stage: 'verify', slice: 's3', terminal: { result: 'partial', substantiveResidual: false, deferrals: [{ ac: 'AC1', probe: 'adb devices' }] } }],
  });
  assert.deepEqual(f, []);
});

test('collectSubstantiveFailures: non-verify stages are never scanned', () => {
  assert.deepEqual(collectSubstantiveFailures({ ran: [{ stage: 'review', terminal: { verdict: 'dont-ship' } }] }), []);
});

// ---------------------------------------------------------------------------
// W3.4 — honest error accounting. One run reported "0 errors" while 6 of 15
// subagents had recovered from rejected writes and schema retries.
// ---------------------------------------------------------------------------

test('collectSubagentErrors: null when nothing errored (no noise on a clean run)', () => {
  assert.equal(collectSubagentErrors({ ran: [{ stage: 'plan', errors: [] }, { stage: 'verify' }] }), null);
});

test('collectSubagentErrors: recovered errors are counted and attributed per agent', () => {
  const e = collectSubagentErrors({
    results: [
      { ran: [{ stage: 'implement', slice: 's1', errors: [{ what: 'write rejected by post-write-verify', recovered: true }] }] },
      { ran: [{ stage: 'verify', slice: 's2', errors: [{ what: 'schema retry' }, { what: 'tool timeout' }] }] },
    ],
  });
  assert.equal(e.recovered, 3);
  assert.equal(e.fatal, 0);
  assert.equal(e.agents.length, 2);
  assert.equal(e.agents[0].agent, 'implement:s1');
  assert.match(e.agents[1].what.join(' '), /schema retry/);
});

test('collectSubagentErrors: a null stage return is a FATAL error the driver observed itself', () => {
  const e = collectSubagentErrors({ ran: [null, { stage: 'plan', errors: [] }] });
  assert.equal(e.fatal, 1);
  assert.equal(e.recovered, 0);
  assert.match(e.agents[0].agent, /returned nothing/);
});

test('collectSubagentErrors: the slug-wide review is scanned too (it lives outside results[].ran)', () => {
  const e = collectSubagentErrors({ results: [], slugWide: { stage: 'review', errors: [{ what: 'ledger merge retry' }] } });
  assert.equal(e.recovered, 1);
  assert.equal(e.agents[0].agent, 'review');
});

// ---------------------------------------------------------------------------
// W4 — clearing-event tripwire. An AC shipped uncleared while its clearing event
// ("device available for AC6") came true on-screen in the same session.
// ---------------------------------------------------------------------------

test('clearingTripwire: null when no probe reported a hit', () => {
  assert.equal(clearingTripwire([{ slice: 's1', ac: 'AC6', clearingProbe: 'adb devices', clearingProbeHit: false }]), null);
  assert.equal(clearingTripwire([]), null);
  assert.equal(clearingTripwire(undefined), null);
});

test('clearingTripwire: a satisfied clearing event is surfaced with what would clear it', () => {
  const hits = clearingTripwire([
    { slice: 'nav', ac: 'AC6', clearingEvent: 'device available for the AC6 run', clearingProbe: 'adb devices | grep -q emulator', clearingProbeHit: true },
    { slice: 'nav', ac: 'AC7', clearingProbe: 'curl -sf localhost:8080/health', clearingProbeHit: false },
  ]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ac, 'AC6');
  assert.match(hits[0].clearingEvent, /device available/);
});

test('clearingTripwire: a PO-authorized deferral is settled — no tripwire noise for it', () => {
  assert.equal(clearingTripwire([{ slice: 's1', ac: 'AC1', clearingProbeHit: true, authorized: true }]), null);
});
