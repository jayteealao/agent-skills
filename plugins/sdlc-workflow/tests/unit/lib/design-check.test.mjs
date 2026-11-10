// The failures of the screen check, grouped by cause: one line for one fault, however many
// places, viewports and screens show it. The caps, the move of each check, the box of a
// selector, and the pool of pages.

import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECK_DO, CHECK_MOVES, MAX_CAUSES, MAX_PLACES, capFailures, failureGroups, failureLines, groupFailures, moveOf, overPool, partialLines, selectorRect } from '../../../lib/design-check.mjs';

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

test('the caps count by check: one fault that repeats never hides another check', () => {
  const many = [];
  for (let i = 0; i < 120; i += 1) many.push(f('basket', 'phone', `.row:nth-of-type(${i + 1})`, '#777777', { check: 'contrast' }));
  many.push(f('basket', 'phone', '.go', 'small', { check: 'target-size' }), f('basket', 'phone', 'h1', '#123456'));
  const { kept, truncated } = capFailures(many);
  assert.deepEqual(truncated, { contrast: 120 - MAX_PLACES });
  assert.deepEqual([...new Set(kept.map((x) => x.check))], ['contrast', 'target-size', 'token'], 'every check kind of the page is in the list');
  // A screen keeps MAX_CAUSES causes of one check, and the count says how many more it found.
  const causes = [];
  for (let i = 0; i < MAX_CAUSES + 4; i += 1) causes.push(f('basket', 'phone', '.a', `#0000${String(i).padStart(2, '0')}`));
  const cut = capFailures(causes);
  assert.equal(cut.kept.length, MAX_CAUSES);
  assert.deepEqual(cut.truncated, { token: 4 });
  // The places of a cause count for each load: a second viewport keeps its own.
  const loads = capFailures([...Array(MAX_PLACES + 1).keys()].flatMap((i) => [f('basket', 'phone', `.p${i}`, 'c'), f('basket', 'desktop', `.p${i}`, 'c')]));
  assert.equal(loads.kept.length, MAX_PLACES * 2);
  assert.deepEqual(capFailures([]), { kept: [], truncated: {} });
});

test('every check has a move file that exists, or a sentence that says what to do', () => {
  const dir = fileURLToPath(new URL('../../../skills/wf/reference/design/', import.meta.url));
  for (const [check, move] of Object.entries(CHECK_MOVES)) {
    if (move) assert.ok(existsSync(join(dir, `${move}.md`)), `${check} → design/${move}.md`);
    else assert.ok(CHECK_DO[check], `${check} has no move, so it says what to do`);
  }
  assert.ok(existsSync(join(dir, 'polish.md')));
  assert.deepEqual([CHECK_MOVES.contrast, CHECK_MOVES.token, CHECK_MOVES['target-size'], CHECK_MOVES.focus, CHECK_MOVES['viewport-fit'], CHECK_MOVES.overlap], ['colorize', 'colorize', 'harden', 'harden', 'layout', 'layout']);
  assert.equal(moveOf({ check: 'component', cause: 'restyle:card:.card h2' }), 'polish', 'a page that restyles a component');
  assert.equal(moveOf({ check: 'component', cause: 'missing:ghost' }), null);
  assert.equal(moveOf({ check: 'script' }), null);
});

test('a failure with no move prints what to do; the cut and the notices print once', () => {
  const lines = failureLines([
    { screen: 'pay', viewport: 'phone', state: 'default', check: 'script', message: 'The script of the page fails: x is not defined', move: null },
    { screen: 'pay', viewport: 'phone', state: 'default', check: 'token', message: 'The page uses no color token', cause: 'no-token', move: null, do: 'Use the color tokens of tokens.css.' },
  ]);
  assert.match(lines[0], / — do: Repair the script of the screen page/);
  assert.match(lines[1], / — do: Use the color tokens of tokens\.css\.$/);
  const groups = failureGroups([{ screen: 'pay', viewport: 'phone', state: 'default', check: 'load', message: 'The page did not finish loading', move: null }]);
  assert.deepEqual([groups[0].move, groups[0].do], [null, CHECK_DO.load]);
  const partial = partialLines({
    truncated: { contrast: 115, interaction: 12 },
    notices: [
      { kind: 'image-text', screen: 'pay', count: 2, message: 'not measured: text over an image (2 element(s))' },
      { kind: 'image-text', screen: 'basket', count: 3, message: 'not measured: text over an image (3 element(s))' },
    ],
  });
  assert.equal(partial.length, 3);
  assert.match(partial[0], /^not shown: 115 more contrast failure\(s\)/);
  assert.match(partial[1], /^not shown: 12 control\(s\) over the cap of \d+ for a load/);
  assert.equal(partial[2], 'not measured: text over an image (5 element(s)) — pay, basket');
  assert.deepEqual(partialLines(), []);
});
