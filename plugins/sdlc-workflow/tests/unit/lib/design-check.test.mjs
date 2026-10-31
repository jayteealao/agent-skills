// The failures of the screen check, grouped by cause: one line for one fault, however many
// places, viewports and screens show it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { failureLines, groupFailures } from '../../../lib/design-check.mjs';

const f = (screen, viewport, selector, cause, extra = {}) => ({ screen, viewport, state: 'default', check: 'token', selector, cause, message: `The color ${cause} of ${selector} is not a token`, move: 'colorize', ...extra });

test('one cause is one group; places count elements, not viewports', () => {
  const groups = groupFailures([
    f('basket', 'phone', '.hint', '#1a74e8'), f('basket', 'desktop', '.hint', '#1a74e8'),
    f('pay', 'phone', '.total', '#1a74e8'), f('pay', 'phone', '.go', '#ffffff'),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual([groups[0].screens, groups[0].viewports, groups[0].places], [['basket', 'pay'], ['phone', 'desktop'], 2]);
  assert.equal(groups[1].places, 1);
});

test('a failure with no cause groups by its message, and a line names its places and its move', () => {
  const lines = failureLines([
    f('basket', 'phone', '.hint', '#1a74e8'), f('pay', 'phone', '.total', '#1a74e8'),
    { screen: 'pay', check: 'states', viewport: null, state: null, message: 'The page has no worst state', move: 'harden' },
  ]);
  assert.deepEqual(lines, [
    'basket, pay (phone; default): token: The color #1a74e8 of .hint is not a token (2 places) — move: colorize',
    'pay: states: The page has no worst state — move: harden',
  ]);
});
