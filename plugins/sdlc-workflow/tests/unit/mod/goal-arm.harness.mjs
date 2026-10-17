// The pure parts of the goal arm action (hooks/mod/goal.ts), WF-GOAL-PLAN W3, run
// under `node --experimental-strip-types --test`. The wrapper
// tests/unit/goal-arm-mod.test.mjs spawns this file; run-all.mjs never runs it
// directly (no `.test.mjs` suffix).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GOAL_CONDITION_LIMIT, armHowOf, armRequestPathOf, armToastOf, armedRequestOf, pendingArmOf } from '../../../hooks/mod/goal.ts';

const request = (over = {}) => JSON.stringify({ slug: 's', host: 'claude-code', arming: 1, condition: 'The goal is met only when …', command: '/goal The goal is met only when …', requestedAt: '2026-10-17T20:00:00Z', state: 'pending', ...over });

test('the arm request lives in the slug folder', () => {
  assert.equal(armRequestPathOf('C:/repo', 's'), 'C:/repo/.ai/workflows/s/goal/arm.json');
});

test('only a pending Claude Code request of this slug with a /goal line is acted on', () => {
  assert.equal(pendingArmOf(request(), 's')?.arming, 1);
  assert.equal(pendingArmOf(request({ state: 'submitted' }), 's'), null, 'a request is handed over once');
  assert.equal(pendingArmOf(request({ host: 'codex' }), 's'), null, 'Codex arms with create_goal');
  assert.equal(pendingArmOf(request({ slug: 'other' }), 's'), null);
  assert.equal(pendingArmOf(request({ command: 'rm -rf /' }), 's'), null);
  assert.equal(pendingArmOf(request({ condition: 'x'.repeat(GOAL_CONDITION_LIMIT + 1) }), 's'), null);
  assert.equal(pendingArmOf('not json', 's'), null);
  assert.equal(pendingArmOf(null, 's'), null);
});

test('the hand-over is recorded, and the toast says what happened', () => {
  const r = pendingArmOf(request(), 's');
  const after = JSON.parse(armedRequestOf(r, 'submitted', '2026-10-17T20:01:00Z'));
  assert.equal(after.state, 'submitted');
  assert.equal(after.handledAt, '2026-10-17T20:01:00Z');
  assert.equal(pendingArmOf(JSON.stringify(after), 's'), null);
  assert.equal(armHowOf('Running /goal x', 'Press Enter to run', 'Running'), 'submitted');
  assert.equal(armHowOf('Press Enter to run /goal x', 'Press Enter to run', 'Running'), 'filled');
  assert.equal(armHowOf('The prompt box is not free; type …', 'Press Enter to run', 'Running'), 'refused');
  assert.match(armToastOf('filled'), /Press Enter/);
  assert.match(armToastOf('refused'), /Paste/);
});
