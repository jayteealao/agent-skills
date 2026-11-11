// The failures of the screen check, grouped by cause: one line for one fault, however many
// places, viewports and screens show it. The caps, the move of each check, the box of a
// selector, and the pool of pages.

import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECK_DO, CHECK_MOVES, MAX_CAUSES, MAX_PLACES, SYSTEM_CHECKS, capFailures, componentAliases, cssDeclarations, failureGroups, failureLines, groupFailures, lengthKindOf, libraryLines, lintLibrary, measure, moveOf, overPool, partialLines, rawColor, rawLength, rawValue, selectorRect, staticScreenChecks, styleSelectors, systemFailures } from '../../../lib/design-check.mjs';
import { addComponent } from '../../../lib/design-components.mjs';
import { initSurface, surfaceDir, writeTokens } from '../../../lib/design-surface.mjs';

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

test('a raw length: tokens, 0, units of the viewport, %, fr, hairlines and keywords pass; calc() passes when each length inside it does', () => {
  for (const v of ['0', '0px', 'auto', '100%', '1fr', '50vw', '100dvh', '1px', '2px', '0.125rem', 'var(--space-2)', 'var(--space-2) var(--space-3)', 'var(--x, 16px)', 'calc(100% - var(--space-1))', 'min(100%, 40vw)', 'fit-content', 'inherit', 'calc(100% / 3)']) {
    assert.equal(rawLength(v), null, v);
  }
  assert.equal(rawLength('10px 16px'), '10px');
  assert.equal(rawLength('0 -4px'), '-4px');
  assert.equal(rawLength('calc(100% - 24px)'), '24px');
  assert.equal(rawLength('clamp(1rem, 2vw, 3rem)'), '1rem');
  assert.equal(rawLength('3px'), '3px', 'more than a hairline');
  assert.equal(rawLength('url(a-12px.png) 0'), null, 'a URL is no length');
});

test('the kind of a property, and the raw part of a value of each kind', () => {
  const kinds = { 'padding-top': 'space', margin: 'space', gap: 'space', 'row-gap': 'space', inset: 'space', top: 'space', width: 'size', 'max-height': 'size', 'flex-basis': 'size', 'border-radius': 'radius', 'border-top-left-radius': 'radius', 'font-size': 'type', 'font-family': 'font', 'box-shadow': 'shadow', 'transition-duration': 'motion', 'animation-duration': 'motion', 'z-index': 'layer', color: null, 'line-height': null, 'border-width': null };
  for (const [prop, kind] of Object.entries(kinds)) assert.equal(lengthKindOf(prop), kind, prop);
  assert.equal(rawValue('font', 'system-ui, sans-serif'), 'system-ui, sans-serif');
  assert.equal(rawValue('font', 'var(--font-body)'), null);
  assert.equal(rawValue('font', 'inherit'), null);
  assert.equal(rawValue('shadow', 'none'), null);
  assert.equal(rawValue('shadow', 'var(--shadow-1), var(--shadow-2)'), null);
  assert.equal(rawValue('shadow', '0 0 0 3px var(--accent)'), '0 0 0 3px', 'a shadow is a token as a whole');
  assert.equal(rawValue('motion', 'background 200ms ease 0s'), '200ms');
  assert.equal(rawValue('motion', 'background var(--duration-1) ease 0s'), null);
  assert.equal(rawValue('space', 'var(--space-2) 12px'), '12px');
  assert.deepEqual(['0', '1', '-1', 'auto', 'var(--z-modal)', 'calc(var(--z-modal) + 1)'].map((v) => rawValue('layer', v)), [null, null, null, null, null, null], 'the small layers, auto and a token pass');
  assert.deepEqual(['10', '9999', '-2', '100 !important'].map((v) => rawValue('layer', v)), ['10', '9999', '-2', '100']);
  assert.deepEqual([measure('16px'), measure('1rem'), measure('0.2s'), measure('14px/20px'), measure('calc(1px)')], [16, 16, 200, 14, null]);
});

test('the static screen checks: the three sheets, and a rule that three screens repeat', () => {
  const sheets = '<link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../layout.css"><link rel="stylesheet" href="../components.css">';
  const switchRule = 'html[data-state="default"] [data-state~="default"], html[data-state="empty"] [data-state~="empty"] { display: block; }';
  const page = (style, links = sheets) => `<html><head>${links}<style>body { margin: 0 } body [data-state] { display: none } ${switchRule} :root { color: red } ${style}</style></head><body></body></html>`;
  const screens = [
    { key: 'a', exists: true, html: page('.stack   { display: flex }\n@media (min-width: 40rem) { .pad { padding: 0 } }') },
    { key: 'b', exists: true, html: page('.stack{display:flex} .pad{padding:0}') },
    { key: 'c', exists: true, html: page('/* .stack {} */ .pad { padding: 0 }', '<link rel="stylesheet" href="../tokens.css">') },
    { key: 'd', exists: true, legacy: true, html: page('.stack{} .pad{}', '') },
    { key: 'e', exists: false, html: '' },
  ];
  const out = staticScreenChecks(screens).map((f) => `${f.screen}|${f.check}|${f.message}`);
  assert.deepEqual(out.sort(), [
    'a|layout|The rule .pad is repeated in 3 screens: use the layout primitives of layout.css, or move it to components.css',
    'b|layout|The rule .pad is repeated in 3 screens: use the layout primitives of layout.css, or move it to components.css',
    'c|component|The page does not link components.css',
    'c|layout|The page does not link layout.css',
    'c|layout|The rule .pad is repeated in 3 screens: use the layout primitives of layout.css, or move it to components.css',
  ]);
  assert.deepEqual(styleSelectors(page('.a > .b,.c{x:y}')).sort(), ['.a > .b', '.c'], 'the base and the state switch are no repeat');
});

test('the library lint: raw values of components.css, custom properties that are no alias of tokens, and the spec of each page', () => {
  const top = mkdtempSync(join(tmpdir(), 'design-lint-'));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  try {
    const root = join(top, 'Shop');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'DESIGN.md'), ['# Design', '', '## Colors', '', '| Role | Value |', '|---|---|', '| ground | #ffffff |', '| text | #111111 |', '',
      '## Layout', '', '| Role | Value |', '|---|---|', '| space-1 | 4px |', '| space-2 | 8px |', '| z-raised | 10 |', '| z-modal | 100 |', ''].join('\n'));
    initSurface(root);
    writeTokens(root);
    addComponent(root, 'btn');
    addComponent(root, 'card');
    rmSync(join(surfaceDir(root), 'components', 'card.html'));
    writeFileSync(join(surfaceDir(root), 'components', 'btn.html'), '<meta name="wf:variants" content="tone=solid|ghost"><meta name="wf:states" content="default"><section data-theme="default" data-theme-source><div data-spec="tone=solid"><span data-component="btn"></span></div></section>');
    writeFileSync(join(surfaceDir(root), 'components.css'), [
      '/* .btn { color: #000000 } */',
      '.btn { color: var(--ground); background: #1a5fb4; padding: var(--space-2) 12px; border: 1px solid var(--text); --btn-ink: var(--text); --btn-pad: 6px; z-index: 1; }',
      '.btn:focus { z-index: var(--z-raised); } .btn .menu { z-index: 90; }',
      '@media (min-width: 40rem) { [data-component="card"] { margin: var(--space-1); color: var(--btn-ink); border-color: var(--gone); width: 300px; } }',
    ].join('\n'));
    const items = lintLibrary(root);
    const lines = items.map((i) => `${i.component}|${i.cause}`);
    assert.deepEqual(lines.sort(), ['btn|#1a5fb4', 'btn|12px', 'btn|btn/state:default:tone=ghost', 'btn|btn/variant:tone=ghost', 'btn|custom:--btn-pad', 'btn|90', 'card|--gone', 'card|no-page:card'].sort(),
      'a width with no size token is left alone; an alias of tokens passes');
    assert.ok(items.every((i) => i.check === 'library' && i.do), 'each item names its repair');
    assert.match(items.find((i) => i.cause === '12px').message, /nearest space token is --space-2 \(8px\)/);
    assert.match(items.find((i) => i.cause === '90').message, /The z-index 90 of \.btn \.menu in components\.css is not a token; the nearest layer token is --z-modal \(100\)/);
    assert.match(libraryLines(items)[0], /^library \(btn\): /);
    assert.deepEqual(cssDeclarations('a{b:c} @media x { d { e: f; } }').map((d) => `${d.selector}|${d.prop}|${d.value}`), ['a|b|c', 'd|e|f']);
    assert.deepEqual([...componentAliases('.x{--a:var(--t);--b:#fff;--c:calc(var(--t) * 2)}').keys()], ['--a', '--c']);
    assert.equal(rawColor('1px solid var(--line, red)'), null, 'the fallback of a token is no colour of the sheet');
    assert.equal(rawColor('0 1px 2px rgb(0 0 0 / 0.2)'), 'rgb(0 0 0 / 0.2)');
    assert.equal(rawColor('solid Tomato'), 'Tomato');
  } finally {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('the system failures: token, component, layout and library failures of the workflow, without the waived causes', () => {
  const checks = {
    failures: [
      { screen: 'a', check: 'token', cause: '#ff0000' }, { screen: 'a', check: 'contrast', cause: 'text/#999/#fff/4.5' },
      { screen: 'b', check: 'layout', cause: 'repeated:.x' }, { screen: 'other', check: 'component', cause: 'button' },
    ],
    library: [{ component: 'btn', check: 'library', cause: '12px' }],
  };
  const all = systemFailures(checks, ['a', 'b']);
  assert.deepEqual(all.causes, ['#ff0000', 'repeated:.x', '12px'], 'a contrast failure and a screen of another workflow are no system failure here');
  const waived = systemFailures(checks, ['a', 'b'], { workflow: 'w1', waivers: [{ workflow: 'w1', cause: '#ff0000' }, { workflow: 'w2', cause: '12px' }] });
  assert.deepEqual(waived.causes, ['repeated:.x', '12px'], 'a waiver counts for its own workflow only');
  assert.deepEqual(systemFailures(null, ['a']).causes, []);
  assert.deepEqual(SYSTEM_CHECKS, ['token', 'component', 'layout', 'library']);
  assert.deepEqual([moveOf({ check: 'token', kind: 'space' }), moveOf({ check: 'token', kind: 'type' }), moveOf({ check: 'token', kind: 'color' }), moveOf({ check: 'token' }), moveOf({ check: 'layout' }), moveOf({ check: 'library' })],
    ['layout', 'typeset', 'colorize', 'colorize', 'layout', null]);
});
