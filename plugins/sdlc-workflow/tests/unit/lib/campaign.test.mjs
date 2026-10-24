// lib/campaign.mjs after WF-PIECES-PLAN: only the stage models of a project stay here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

test('modelsOf keeps the known stages; a stage names an alias or any model id', () => {
  assert.deepEqual(
    C.modelsOf({ models: { plan: 'claude-fable-5-1', implement: 'sonnet', verify: ' claude-opus-5-5[1m] ', review: 'not a name', ship: 'sonnet', 'update-deps': 3 } }),
    { plan: 'claude-fable-5-1', implement: 'sonnet', verify: 'claude-opus-5-5[1m]' },
  );
  assert.deepEqual(C.modelsOf({}), {});
  assert.deepEqual(C.modelsOf({ models: ['implement'] }), {});
});

test('the config schema takes the same model names as modelsOf', async () => {
  const { readFileSync } = await import('node:fs');
  const schema = JSON.parse(readFileSync(new URL('../../../schemas/sdlc-config.schema.json', import.meta.url), 'utf8'));
  const props = schema.properties.models.properties;
  assert.deepEqual(Object.keys(props), [...C.MODEL_STAGES]);
  for (const p of Object.values(props)) assert.equal(new RegExp(p.pattern).source, C.MODEL_NAME.source);
});

test('only the stage models of a project stay in lib/campaign.mjs', () => {
  assert.deepEqual(Object.keys(C).sort(), ['MODEL_NAME', 'MODEL_STAGES', 'modelsOf']);
});
