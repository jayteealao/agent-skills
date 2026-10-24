// WF-SYSTEM-REVIEW-2026-10-21 E1 — the yolo driver keeps its pure helpers in one source,
// skills/wf/workflows/_shared.js. A Workflow script cannot import, so scripts/build-drivers.mjs
// (run by npm run build) writes that file into the BEGIN SHARED block of yolo.js. This test
// requires the block to be current, and each shared helper to be defined once, inside it.
// The wave driver (campaign-wave.js) is gone (WF-PIECES-PLAN), so yolo.js is the only target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDrivers, sharedBody, SHARED_DRIVERS, WORKFLOWS } from '../../../scripts/build-drivers.mjs';

const read = (f) => readFileSync(path.join(WORKFLOWS, f), 'utf8').replace(/\r\n/g, '\n');
const shared = read('_shared.js');
const names = [...shared.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]);

test('E1: the shared block of each driver is current (run npm run build after an edit of _shared.js)', () => {
  assert.deepEqual(buildDrivers({ check: true }).stale, []);
});

test('E1: _shared.js holds the helpers both drivers share, and only function declarations', () => {
  for (const n of ['steeringClause', 'verifyClean', 'evaluateGate', 'planWaves', 'walkOrder', 'implementStepsClause', 'touchesCharter', 'refuteGroups']) {
    assert.ok(names.includes(n), `_shared.js has no function ${n}`);
  }
  // A const would be read before it is set when the block sits below the top-level code.
  assert.doesNotMatch(sharedBody(shared), /^(?:const|let|var) /m);
  // WF-PIECES-PLAN D33: one implement agent per slice; the step groups of C3 are gone.
  assert.ok(!names.includes('implementGroups'));
  assert.doesNotMatch(shared, /STEP GROUP/);
  assert.deepEqual([...SHARED_DRIVERS], ['yolo.js']);
});

// WF-DESIGN-PLAN B1: POLICY is not shared, so the design clause of the review policy comes from
// _shared.js, and each driver adds the same call to its POLICY.review.
test('B1: both drivers add the shared design clause to POLICY.review and the amendFindings field to STAGE_RESULT', () => {
  for (const n of ['designAmendClause', 'amendFindingsSchema', 'amendFindingsOf', 'amendFindingsText']) assert.ok(names.includes(n), `_shared.js has no function ${n}`);
  const policyReview = (src) => /\n {2}review:\n([\s\S]*?),\n(?: {2}'?[\w-]+'?:|\})/.exec(src)?.[1] ?? '';
  const tails = SHARED_DRIVERS.map((f) => policyReview(read(f)).trim().split('\n').at(-1).trim());
  for (const t of tails) assert.match(t, /\+ designAmendClause\(\)$/);
  assert.equal(new Set(SHARED_DRIVERS.map((f) => policyReview(read(f)))).size, 1, 'POLICY.review has the same text in both drivers');
  for (const f of SHARED_DRIVERS) assert.match(read(f), /amendFindings: amendFindingsSchema\(\),/, f);
});

for (const f of SHARED_DRIVERS) {
  test(`E1: ${f} defines each shared helper once, inside its shared block`, () => {
    const src = read(f);
    const a = src.indexOf('// ---- BEGIN SHARED');
    const b = src.indexOf('// ---- END SHARED ----');
    assert.ok(a > -1 && b > a, `${f} has no shared block`);
    for (const n of names) {
      const defs = [...src.matchAll(new RegExp(`^(?:async )?function ${n}[(]`, 'gm'))].map((m) => m.index);
      assert.equal(defs.length, 1, `${f} defines ${n} ${defs.length} times`);
      assert.ok(defs[0] > a && defs[0] < b, `${f}: ${n} is outside the shared block`);
    }
  });
}
