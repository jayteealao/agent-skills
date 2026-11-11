// The rules of the canvas inspector that need no browser: which declaration wins, how a custom
// property leads to its token, what is a raw value and which token is nearest, and how the
// variants of an instance meet the spec. The script holds them in `WF_CANVAS_INSPECT_LOGIC`; its
// second part gives nothing where there is no document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { lengthKindOf, rawValue } from '../../../lib/design-check.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const canvasDir = join(pluginRoot, 'skills', 'wf', 'canvas');
const source = readFileSync(join(canvasDir, 'canvas-inspect.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const I = context.WF_CANVAS_INSPECT_LOGIC;
const plain = (v) => JSON.parse(JSON.stringify(v));

const TOKENS = [
  { name: '--space-2', kind: 'space', value: '8px' }, { name: '--space-3', kind: 'space', value: '12px' }, { name: '--space-4', kind: 'space', value: '16px' },
  { name: '--radius-md', kind: 'radius', value: '8px' }, { name: '--accent', kind: 'color', value: '#2459b5' }, { name: '--ink', kind: 'color', value: '#1d2421' },
  { name: '--type-body', kind: 'type', value: '1rem' }, { name: '--layer-pop', kind: 'layer', value: '30' },
];
const tokenNames = new Set(TOKENS.map((t) => t.name));
const valueOf = (n) => TOKENS.find((t) => t.name === n)?.value ?? '';

test('the script loads with no document: the rules, and no inspector', () => {
  assert.equal(typeof I.resolveProperty, 'function');
  assert.equal(context.WF_CANVAS_INSPECT, null);
});

test('the canvas loads the inspector before its own script, and the server serves it', () => {
  const page = readFileSync(join(canvasDir, 'index.html'), 'utf8');
  assert.ok(page.indexOf('/canvas/canvas-inspect.js') > 0 && page.indexOf('/canvas/canvas-inspect.js') < page.indexOf('/canvas/canvas.js'));
  const canvas = readFileSync(join(canvasDir, 'canvas.js'), 'utf8');
  assert.match(canvas, /window\.WF_CANVAS_INSPECT\.create\(/);
  assert.match(canvas, /inspect\?\.draw\(\{ on: Boolean\(f\.inspecting/);
  assert.match(canvas, /inspect\?\.bar\(data\)/);
});

test('a selector list splits at its top-level commas, and specificity orders ids, classes, types', () => {
  assert.deepEqual(plain(I.splitList('.a, .b:is(.c, .d) > p,[data-x="1,2"]')), ['.a', '.b:is(.c, .d) > p', '[data-x="1,2"]']);
  assert.deepEqual(plain(I.specificity('#top .card > p')), [1, 1, 1]);
  assert.deepEqual(plain(I.specificity('.button[data-variant~="size=lg"]:hover')), [0, 3, 0]);
  assert.deepEqual(plain(I.specificity(':where(.x) a')), [0, 0, 1]);
});

test('the winning declaration: important, then specificity, then the later one', () => {
  const d = (value, spec, order, important = false) => ({ value, spec, order, important });
  assert.equal(I.cascade([d('a', [0, 1, 0], 1), d('b', [0, 1, 0], 2)]).value, 'b', 'the later of two equal rules');
  assert.equal(I.cascade([d('a', [0, 2, 0], 1), d('b', [0, 1, 0], 2)]).value, 'a', 'the more specific one');
  assert.equal(I.cascade([d('a', [0, 1, 0], 1, true), d('b', [1, 0, 0], 2)]).value, 'a', 'the important one');
  assert.equal(I.cascade([d('', [9, 0, 0], 5)]), null, 'an empty value is no declaration');
});

test('a custom property leads through the aliases of components.css to its token', () => {
  const aliases = { '--button-bg': 'var(--button-tone)', '--button-tone': 'var(--accent)', '--odd': '13px', '--loop': 'var(--loop)' };
  const lookup = (n) => aliases[n];
  assert.deepEqual(plain(I.follow('--accent', lookup, tokenNames)), { token: '--accent', chain: [], value: null });
  assert.deepEqual(plain(I.follow('--button-bg', lookup, tokenNames)), { token: '--accent', chain: ['--button-bg', '--button-tone'], value: null });
  assert.deepEqual(plain(I.follow('--odd', lookup, tokenNames)), { token: null, chain: ['--odd'], value: '13px' });
  assert.equal(I.follow('--loop', lookup, tokenNames).token, null, 'a loop ends');
  assert.equal(I.follow('--nothing', lookup, tokenNames).token, null);
});

test('a property names its token and the value of the mode, and the rule it came from', () => {
  const lookup = (n) => ({ '--button-bg': 'var(--accent)' })[n];
  const row = I.resolveProperty('background-color', 'color', { prop: 'background', value: 'var(--button-bg)', source: 'components.css', selector: '.button' }, { lookup, tokenNames, tokenValue: valueOf, tokens: TOKENS });
  assert.equal(row.prop, 'background');
  assert.equal(row.tokens[0].token, '--accent');
  assert.equal(row.tokens[0].value, '#2459b5');
  assert.deepEqual(plain(row.tokens[0].chain), ['--button-bg']);
  assert.equal(row.raw, null);
  assert.equal(row.source, 'components.css');
  const pad = I.resolveProperty('padding-top', 'space', { prop: 'padding', value: 'var(--space-2) var(--space-4)', source: 'layout.css' }, { tokenNames, tokenValue: valueOf, tokens: TOKENS });
  assert.deepEqual(plain(pad.tokens.map((t) => t.token)), ['--space-2', '--space-4']);
});

test('a raw value says it is not a token and names the nearest token of its kind', () => {
  const row = I.resolveProperty('padding-top', 'space', { prop: 'padding-top', value: '13px', source: 'the page' }, { tokenNames, tokenValue: valueOf, tokens: TOKENS });
  assert.equal(row.raw, '13px');
  assert.equal(I.rawText(row.raw, row.nearest), 'raw 13px — not a token; nearest --space-3 (12px)');
  const viaAlias = I.resolveProperty('border-radius', 'radius', { prop: 'border-radius', value: 'var(--odd)' }, { lookup: () => '7px', tokenNames, tokenValue: valueOf, tokens: TOKENS });
  assert.equal(viaAlias.raw, '7px', 'an alias that ends in a raw value is raw');
  assert.equal(viaAlias.nearest.name, '--radius-md');
  const color = I.resolveProperty('color', 'color', { prop: 'color', value: '#203a9f' }, { tokenNames, tokenValue: valueOf, tokens: TOKENS });
  assert.equal(color.nearest.name, '--accent');
  assert.equal(I.resolveProperty('z-index', 'layer', { value: '1' }, { tokens: TOKENS }).raw, null, 'z-index 1 is allowed');
  assert.equal(I.resolveProperty('z-index', 'layer', { value: '25' }, { tokens: TOKENS }).nearest.name, '--layer-pop');
  assert.equal(I.resolveProperty('font-size', 'type', { value: '15px' }, { tokens: TOKENS }).nearest.name, '--type-body', 'a rem token is measured at 16 px');
  assert.equal(I.resolveProperty('font-size', 'type', { value: '15px' }, { tokens: [] }).nearest, null);
  assert.equal(I.rawText('15px', null), 'raw 15px — not a token');
});

test('the raw rules are the rules of the design check', () => {
  const cases = [['padding', '13px'], ['padding', '2px'], ['padding', '0 1px'], ['width', '50%'], ['width', '320px'], ['border-radius', 'var(--r) 6px'],
    ['font-size', '1.5rem'], ['font-family', 'Inter, sans-serif'], ['font-family', 'var(--font-body)'], ['box-shadow', '0 1px 2px #000'], ['box-shadow', 'none'],
    ['z-index', '0'], ['z-index', '-1'], ['z-index', '10'], ['transition-duration', '200ms'], ['transition-duration', 'var(--fast)'], ['gap', 'calc(var(--space-2) + 3px)']];
  for (const [prop, value] of cases) {
    const kind = lengthKindOf(prop);
    assert.equal(I.rawOf(kind, value), rawValue(kind, value), `${prop}: ${value}`);
  }
  assert.equal(I.rawOf('color', 'var(--ink)'), null);
  assert.equal(I.rawOf('color', '1px solid rgb(0 0 0 / 10%)'), 'rgb(0 0 0 / 10%)');
  assert.equal(I.rawOf('color', 'transparent'), null);
  assert.equal(I.rawOf('color', 'tomato', (w) => w === 'tomato'), 'tomato');
});

test('the variants of an instance meet the spec of its component', () => {
  const variants = { size: ['sm', 'lg'], tone: ['quiet', 'loud'] };
  assert.deepEqual(plain(I.variantCheck('size=lg tone=shy', variants)), [{ dim: 'size', value: 'lg', declared: true }, { dim: 'tone', value: 'shy', declared: false }]);
  assert.deepEqual(plain(I.variantCheck('quiet', variants)), [{ dim: null, value: 'quiet', declared: true }]);
  assert.deepEqual(plain(I.variantCheck('size=lg', null)), [{ dim: 'size', value: 'lg', declared: null }], 'no spec: nothing to check against');
  assert.deepEqual(plain(I.variantCheck('', variants)), []);
});

test('a sheet goes by its file name, and the mode switch lists the themes and System only with two themes or more', () => {
  assert.equal(I.sheetName('http://127.0.0.1:4711/r/shop/s/tokens.css?v=2'), 'tokens.css');
  assert.equal(I.sheetName(null), 'the page');
  assert.deepEqual(plain(I.modeChoices([{ name: 'light' }, { name: 'dark' }])), ['light', 'dark', '']);
  assert.deepEqual(plain(I.modeChoices([{ name: 'light' }])), []);
  assert.deepEqual(plain(I.modeChoices(undefined)), []);
});
