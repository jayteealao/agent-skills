// WF-SYSTEM-REVIEW-2026-10-21 E1 — the wave driver (campaign-wave.js) and the yolo driver
// (yolo.js) share their pure helpers through one source, skills/wf/workflows/_shared.js.
// A Workflow script cannot import, so scripts/build-drivers.mjs (run by npm run build)
// writes that file into the BEGIN SHARED block of each driver. This test requires each
// block to be current, and each shared helper to be defined once, inside the block.
//
// The helpers that the wave driver changes on purpose (stopCheckClause, stopKindOf, runStage,
// driveVerify, reviewUnit and the others) stay in each driver.
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
  for (const n of ['steeringClause', 'verifyClean', 'evaluateGate', 'planWaves', 'walkOrder', 'readCheckRows', 'implementGroups', 'implementStepsClause', 'touchesCharter', 'refuteGroups']) {
    assert.ok(names.includes(n), `_shared.js has no function ${n}`);
  }
  // A const would be read before it is set when the block sits below the top-level code.
  assert.doesNotMatch(sharedBody(shared), /^(?:const|let|var) /m);
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
