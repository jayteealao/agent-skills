import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideaScore } from '../../../renderers/ideation.mjs';

// The ideate stage ranks by judgment and records enums; the renderer owns the
// arithmetic, so the model never computes the score by hand.

test('ideaScore computes (impact × feasibility) / effort from the enums', () => {
  assert.equal(ideaScore({ impact: 'high', effort: 's', feasibility: 'clear' }), 1.5);
  assert.equal(ideaScore({ impact: 'critical', effort: 'xs', feasibility: 'needs-design' }), 2.8);
  assert.equal(ideaScore({ impact: 'medium', effort: 'm', feasibility: 'external' }), 0.33);
});

test('ideaScore treats a missing feasibility as clear', () => {
  assert.equal(ideaScore({ impact: 'low', effort: 'xs' }), 1);
});

test('ideaScore keeps the score of a lead written before the enums existed', () => {
  assert.equal(ideaScore({ impact: 'high', effort: 's', score: 8.5 }), 8.5);
});

test('ideaScore is empty when impact or effort is missing or unknown', () => {
  assert.equal(ideaScore({ effort: 's' }), '');
  assert.equal(ideaScore({ impact: 'huge', effort: 's' }), '');
});
