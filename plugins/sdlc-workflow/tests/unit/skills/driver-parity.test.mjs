// WF-CAMPAIGN-DRIVER-PLAN D2 — the wave driver (campaign-wave.js) and the yolo driver
// (yolo.js) share no code module: a Workflow script cannot import. The wave driver
// copies the pure helpers below from yolo.js. This test extracts each helper from both
// scripts, removes the line comments and the blank lines, and requires the same text, so
// a fix in one driver that is not copied to the other fails here.
//
// The helpers that the wave driver changes on purpose (stopCheckClause, stopKindOf, runStage,
// driveVerify, reviewUnit and the others) are not in the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workflows = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wf', 'workflows');
const read = (f) => readFileSync(path.join(workflows, f), 'utf8').replace(/\r\n/g, '\n');
const yolo = read('yolo.js');
const wave = read('campaign-wave.js');

// A top-level `function NAME(...) { ... }`: skip the parameter list (a default value may
// hold braces), then match the body braces.
function extractFn(src, name, file) {
  const m = new RegExp(`(^|\\n)(async )?function ${name}\\(`).exec(src);
  assert.ok(m, `${file} has no function ${name}`);
  let depth = 0;
  let j = m.index + m[0].length - 1;
  for (; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')' && --depth === 0) break;
  }
  const open = src.indexOf('{', j);
  depth = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(m.index, k + 1);
  }
  assert.fail(`${file}: the body of ${name} does not close`);
}

const normalize = (text) => text
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line) && line.trim())
  .map((line) => line.trimEnd())
  .join('\n')
  .trim();

const SHARED = [
  'steeringClause', 'steeringDigest', 'requiresClause', 'promptFedLine',
  'judgeLiveness', 'deadDriverClause', 'verifyClean', 'acKey', 'probeGaps', 'evaluateGate',
  'collectDeferrals', 'classificationIndex', 'isRuntimeEvidenceClass', 'reconcileDeferrals',
  'collectSubstantiveFailures', 'collectSubagentErrors', 'deferralPressure', 'decisionDigest',
  'clearingTripwire', 'reconcileDue', 'planWaves', 'walkOrder', 'orderEdgesOf', 'overlappingSlices', 'runStartFromId', 'readCheckRows',
];

for (const name of SHARED) {
  test(`driver parity: ${name} is the same in yolo.js and campaign-wave.js`, () => {
    assert.equal(normalize(extractFn(wave, name, 'campaign-wave.js')), normalize(extractFn(yolo, name, 'yolo.js')));
  });
}
