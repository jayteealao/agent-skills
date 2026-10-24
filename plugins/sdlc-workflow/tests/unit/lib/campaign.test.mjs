// lib/campaign.mjs after WF-PIECES-PLAN: only the stage models of a project stay here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

test('WF-SYSTEM-REVIEW C1: modelsOf keeps the known stages and the allowed models', () => {
  assert.deepEqual(C.modelsOf({ models: { implement: 'sonnet', verify: 'opus', review: 'haiku', ship: 'sonnet' } }), { implement: 'sonnet', verify: 'opus' });
  assert.deepEqual(C.modelsOf({}), {});
  assert.deepEqual(C.modelsOf({ models: ['implement'] }), {});
});

test('WF-PIECES-PLAN 6.5: the wave campaign helpers are gone', () => {
  assert.deepEqual(Object.keys(C).sort(), ['MODEL_STAGES', 'modelsOf']);
});
