// The failures of the screen check, grouped by cause: one line for one fault, however many
// places, viewports and screens show it. The box of a selector, and the pool of pages.

import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { failureLines, groupFailures, overPool, selectorRect } from '../../../lib/design-check.mjs';

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

test('the check and the records share one grouping; a failure with a cause and no selector counts by its message', async () => {
  const records = await import('../../../lib/design-records.mjs');
  assert.equal(groupFailures, records.groupFailures);
  const groups = groupFailures([
    { screen: 'pay', viewport: 'phone', state: 'default', check: 'display', cause: 'image:a.png', message: 'The image a.png does not load', selector: null },
    { screen: 'pay', viewport: 'desktop', state: 'default', check: 'display', cause: 'image:a.png', message: 'The image a.png does not load' },
    { screen: 'pay', viewport: 'phone', state: 'default', check: 'viewport-fit', cause: 'wide', message: 'The page is 900 px wide', selector: '' },
    { screen: 'pay', viewport: 'phone', state: 'default', check: 'viewport-fit', cause: 'wide', message: 'The page is 950 px wide', selector: '' },
  ]);
  assert.deepEqual(groups.map((g) => [g.check, g.cause, g.viewports, g.places]), [
    ['display', 'image:a.png', ['phone', 'desktop'], 1],
    ['viewport-fit', 'wide', ['phone'], 2],
  ]);
  assert.deepEqual(Object.keys(groups[0]).sort(), ['cause', 'check', 'message', 'move', 'places', 'screens', 'states', 'viewports']);
});

test('the box of a selector runs in the page and gives document pixels, or null', () => {
  const el = (w, h) => ({ getBoundingClientRect: () => ({ left: 10.4, top: 20.6, width: w, height: h }) });
  // The page runs in another realm: its objects compare by their JSON.
  const run = (found) => JSON.parse(JSON.stringify(runInNewContext(selectorRect('.total'), { document: { querySelector: (s) => (s === '.total' ? found : null) }, scrollX: 0, scrollY: 100 }) ?? null));
  assert.deepEqual(run(el(30.2, 12)), { x: 10, y: 121, width: 30, height: 12 });
  assert.equal(run(el(0, 0)), null, 'an element with no size');
  assert.equal(run(null), null, 'no element');
  assert.equal(runInNewContext(selectorRect('a[b'), { document: { querySelector: () => { throw new Error('bad selector'); } }, scrollX: 0, scrollY: 0 }), null);
});

test('the pool spreads the loads over its pages and keeps the order of the loads', async () => {
  const used = new Set();
  const out = await overPool(['p1', 'p2', 'p3'], [5, 1, 3, 0, 2, 4], async (page, ms) => {
    used.add(page);
    await new Promise((r) => setTimeout(r, ms * 5));
    return `${ms}`;
  });
  assert.deepEqual(out, ['5', '1', '3', '0', '2', '4']);
  assert.equal(used.size, 3);
  await assert.rejects(overPool(['p1', 'p2'], [1, 2, 3], async (_, n) => { if (n === 2) throw new Error('load failed'); return n; }), /load failed/);
});
