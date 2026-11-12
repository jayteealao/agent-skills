// The rules of the Library and Tokens views of the design canvas that need no browser: which
// specimen cell shows a case, the matrix of the cells of a spec, the rows of the token table, and
// the address of a view. The library script holds them in `WF_LIBRARY_LOGIC`; it loads after the
// canvas script, as the page loads them, and its second part returns at once where there is no document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dir = join(pluginRoot, 'skills', 'wf', 'canvas');
const source = readFileSync(join(dir, 'canvas-library.js'), 'utf8');
const context = vm.createContext({ URLSearchParams });
vm.runInContext(readFileSync(join(dir, 'canvas.js'), 'utf8'), context);
vm.runInContext(source, context);
const LL = context.WF_LIBRARY_LOGIC;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the library script loads with no document and gives its rules', () => {
  assert.equal(typeof LL.pickCell, 'function');
  assert.equal(typeof LL.tokenTable, 'function');
  assert.doesNotMatch(source, /innerHTML|postMessage|window\.prompt/, 'it builds elements, and reads the pages directly');
});

test('a cell names its case by its pairs, and a cell with no state is the default state', () => {
  assert.deepEqual(plain(LL.cellCase('tone=solid size=sm state=hover')), { variant: { tone: 'solid', size: 'sm' }, state: 'hover' });
  assert.deepEqual(plain(LL.cellCase('tone=ghost')), { variant: { tone: 'ghost' }, state: 'default' });
  assert.deepEqual(plain(LL.cellCase('')), { variant: {}, state: 'default' });
});

test('the preview shows the cell of the exact case, else the closest cell that contradicts nothing', () => {
  const cells = ['tone=solid size=sm', 'tone=solid size=md', 'tone=ghost size=sm', 'tone=solid state=hover', 'tone=solid size=md state=hover'];
  assert.deepEqual(plain(LL.pickCell(cells, { variant: { tone: 'solid', size: 'md' }, state: 'default' })), { index: 1, exact: true });
  assert.deepEqual(plain(LL.pickCell(cells, { variant: { tone: 'solid', size: 'md' }, state: 'hover' })), { index: 4, exact: true });
  // The hover cell names the first dimension only: it is the closest for size=sm.
  assert.deepEqual(plain(LL.pickCell(cells, { variant: { tone: 'solid', size: 'sm' }, state: 'hover' })), { index: 3, exact: false });
  assert.equal(LL.pickCell(cells, { variant: { tone: 'ghost', size: 'md' }, state: 'hover' }).index, -1, 'no cell shows a ghost in hover');
  assert.equal(LL.pickCell(cells, { variant: { tone: 'solid', size: 'sm' }, state: 'disabled' }).index, -1, 'another state never stands in');
  assert.deepEqual(plain(LL.pickCell(['state=default', 'state=hover'], { variant: {}, state: 'hover' })), { index: 1, exact: true });
  assert.equal(LL.pickCell([], { variant: {}, state: 'default' }).index, -1);
  assert.equal(LL.cellScore('tone=solid state=focus', { variant: { tone: 'solid' }, state: 'focus' }), 1);
});

test('the controls start on the first value of each dimension and the default state', () => {
  assert.deepEqual(plain(LL.firstCase({ variants: { tone: ['solid', 'ghost'], size: ['sm'] }, states: ['hover', 'default'] })), { variant: { tone: 'solid', size: 'sm' }, state: 'default' });
  assert.deepEqual(plain(LL.firstCase({ variants: {}, states: ['open'] })), { variant: {}, state: 'open' });
  assert.deepEqual(plain(LL.firstCase(null)), { variant: {}, state: 'default' });
});

test('a case with no cell names the gaps of the spec that it shows', () => {
  const problems = [
    { cause: 'variant:tone=ghost', message: 'No specimen cell shows tone=ghost' },
    { cause: 'state:hover:tone=ghost', message: 'No specimen cell shows tone=ghost in the state hover' },
    { cause: 'state:hover:tone=solid', message: 'other' },
    { cause: 'theme:dark', message: 'other' },
  ];
  assert.deepEqual(plain(LL.caseGaps(problems, { variant: { tone: 'ghost' }, state: 'hover' })).map((p) => p.cause), ['variant:tone=ghost', 'state:hover:tone=ghost']);
  assert.deepEqual(plain(LL.caseGaps([{ cause: 'state:open' }], { variant: {}, state: 'open' })).map((p) => p.cause), ['state:open']);
  assert.deepEqual(plain(LL.caseGaps(null, { variant: {}, state: 'default' })), []);
});

test('the grid of one dimension has a row for each value and a column for each state', () => {
  const spec = { variants: { tone: ['solid', 'ghost'] }, states: ['default', 'hover'] };
  const m = plain(LL.matrixOf(spec, ['tone=ghost', 'tone=solid', 'tone=solid state=hover', 'tone=ghost state=hover']));
  assert.deepEqual(m.rows.map((r) => r.label), ['solid', 'ghost'], 'the rows go in the declared order');
  assert.deepEqual(m.cols, ['default', 'hover']);
  assert.deepEqual(m.place, [{ row: 1, col: 0 }, { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }]);
});

test('the grid of two dimensions has a row for each pair a cell shows, a value or state the spec lacks last', () => {
  const spec = { variants: { tone: ['solid', 'ghost'], size: ['sm', 'md'] }, states: ['default', 'hover'] };
  const m = plain(LL.matrixOf(spec, ['tone=solid size=md', 'tone=solid size=sm', 'tone=solid state=hover', 'tone=ghost size=sm', 'tone=odd size=sm state=busy']));
  assert.deepEqual(m.rows.map((r) => r.label), ['solid', 'solid · sm', 'solid · md', 'ghost · sm', 'odd · sm']);
  assert.deepEqual(m.cols, ['default', 'hover', 'busy']);
  assert.deepEqual(m.place[2], { row: 0, col: 1 });
  assert.deepEqual(m.place[4], { row: 4, col: 2 });
});

test('a grid with no dimension is one row of states, two cells of one case do not overlap, and three dimensions give no grid', () => {
  const none = plain(LL.matrixOf({ variants: {}, states: ['default', 'hover'] }, ['state=default', 'state=hover', 'state=hover']));
  assert.deepEqual(none.rows.map((r) => r.label), ['', '']);
  assert.deepEqual(none.place, [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 1 }]);
  assert.equal(LL.matrixOf({ variants: { a: ['1'], b: ['1'], c: ['1'] }, states: [] }, ['a=1 b=1 c=1']), null);
  assert.deepEqual(plain(LL.matrixOf({ variants: {}, states: [] }, [])), { rows: [], cols: ['default'], place: [] });
});

test('the component list puts the page shells first and keeps what the search matches', () => {
  const comps = [{ key: 'button', title: 'Button', kind: 'component' }, { key: 'app-frame', title: 'App frame', kind: 'layout' }, { key: 'list-row', title: 'List row', kind: 'component', code: 'ui/ListRow.kt' }];
  assert.deepEqual(plain(LL.componentGroups(comps)).map((g) => [g.title, g.list.map((c) => c.key)]), [['Layout', ['app-frame']], ['Components', ['button', 'list-row']]]);
  assert.deepEqual(plain(LL.componentGroups(comps, 'listrow.kt')).map((g) => g.list.map((c) => c.key)), [['list-row']]);
  assert.deepEqual(plain(LL.componentGroups(comps, 'nothing')), []);
});

test('an alias chain follows each var() to a token with a value of its own, and ends at a missing name or a loop', () => {
  const tokens = [
    { name: '--accent', value: 'var(--brand)', values: { dark: 'var(--brand-dark)' } },
    { name: '--brand', value: 'var(--green-600)' }, { name: '--green-600', value: '#1a7f4b' }, { name: '--brand-dark', value: '#5fd39a' },
    { name: '--lost', value: 'var(--nowhere)' }, { name: '--a', value: 'var(--b)' }, { name: '--b', value: 'var(--a)' },
  ];
  assert.deepEqual(plain(LL.aliasChain(tokens[0], tokens)), [{ name: '--brand', missing: false }, { name: '--green-600', missing: false }]);
  assert.deepEqual(plain(LL.aliasChain(tokens[0], tokens, 'dark')), [{ name: '--brand-dark', missing: false }]);
  assert.deepEqual(plain(LL.aliasChain(tokens[4], tokens)), [{ name: '--nowhere', missing: true }]);
  assert.deepEqual(plain(LL.aliasChain(tokens[5], tokens)), [{ name: '--b', missing: false }, { name: '--a', missing: false, loop: true }]);
  assert.deepEqual(plain(LL.aliasChain(tokens[2], tokens)), []);
  assert.deepEqual(plain(LL.aliasChain({ name: '--x', value: 'calc(var(--y) * 2)' }, tokens)), [], 'a value that computes is no alias');
});

test('the token table has a column per theme, dims a value equal to the default, and counts what uses a token', () => {
  const state = {
    themes: [{ name: 'light' }, { name: 'dark' }], defaultTheme: 'light',
    tokens: [
      { name: '--ink', kind: 'color', value: '#111', values: { light: '#111', dark: '#eee' }, usedFor: 'Text', alias: '--color-text' },
      { name: '--line', kind: 'color', value: '#ccc', values: { light: '#ccc', dark: '#ccc' } },
      { name: '--space-2', kind: 'space', value: '8px', values: {} },
      { name: '--accent', kind: 'color', value: 'var(--ink)', values: { light: 'var(--ink)' } },
    ],
    screens: [{ key: 'a', tokens: ['--ink', '--space-2'] }, { key: 'b', tokens: ['--ink'] }],
    components: [{ key: 'button', tokens: ['--ink'] }, { key: 'row', tokens: [] }],
  };
  const t = plain(LL.tokenTable(state));
  assert.deepEqual(t.themes, ['light', 'dark']);
  assert.deepEqual(t.groups.map((g) => [g.kind, g.rows.map((r) => r.name)]), [['color', ['--ink', '--line', '--accent']], ['space', ['--space-2']]]);
  const [ink, line, accent] = t.groups[0].rows;
  assert.deepEqual(ink.values, [{ theme: 'light', value: '#111', same: false }, { theme: 'dark', value: '#eee', same: false }]);
  assert.deepEqual(line.values[1], { theme: 'dark', value: '#ccc', same: true });
  assert.equal(line.values[0].same, false, 'the default theme is never dimmed');
  assert.deepEqual(ink.chain, []);
  assert.equal(ink.alias, '--color-text');
  assert.equal(ink.usedFor, 'Text');
  assert.deepEqual([ink.screens, ink.components], [2, ['button']]);
  assert.deepEqual(accent.chain, [{ name: '--ink', missing: false }]);
  assert.deepEqual(accent.values[1], { theme: 'dark', value: 'var(--ink)', same: true }, 'a theme with no value of its own has the value of the token');
  assert.deepEqual(t.groups[1].rows[0].values, [{ theme: 'light', value: '8px', same: false }, { theme: 'dark', value: '8px', same: true }]);
  assert.deepEqual(plain(LL.tokenTable(state, 'SPACE')).groups.map((g) => g.rows.map((r) => r.name)), [['--space-2']]);
  assert.deepEqual(plain(LL.tokenTable(state, 'color-text')).groups.map((g) => g.rows.map((r) => r.name)), [['--ink']], 'the search finds a token by its alias');
});

test('a token sheet with no theme has one value column', () => {
  const t = plain(LL.tokenTable({ tokens: [{ name: '--radius-md', value: '8px' }], themes: [] }));
  assert.deepEqual(t.themes, [null]);
  assert.deepEqual(t.groups.map((g) => g.kind), ['radius'], 'a legacy token gets its kind from its name');
  assert.deepEqual(t.groups[0].rows[0].values, [{ theme: null, value: '8px', same: false }]);
});

test('the address of the library reads back', () => {
  assert.equal(LL.libraryHash({ component: 'list-row' }), '#component=list-row');
  assert.deepEqual(plain(LL.parseLibraryHash('#component=list-row')), { view: 'library', component: 'list-row' });
  assert.equal(LL.libraryHash({ token: '--ink' }), '#token=--ink');
  assert.deepEqual(plain(LL.parseLibraryHash(LL.libraryHash({ token: '--space 2' }))), { view: 'tokens', token: '--space 2' });
  assert.equal(LL.parseLibraryHash('#screen=pay'), null);
  assert.equal(LL.parseLibraryHash(''), null);
  assert.equal(LL.libraryHash({}), '');
});

test('the canvas loads the library, gives it the board place, and hands it the addresses it names', () => {
  const page = readFileSync(join(dir, 'index.html'), 'utf8');
  const canvas = readFileSync(join(dir, 'canvas.js'), 'utf8');
  assert.match(page, /data-view="library"/);
  assert.match(page, /data-view="tokens"/);
  assert.match(page, /<section id="library" hidden/);
  assert.ok(page.indexOf('/canvas/canvas.js') < page.indexOf('/canvas/canvas-library.js'), 'the library loads after the canvas');
  assert.match(canvas, /if \(libraryView\(\) \|\| side\) return;/);
  assert.match(canvas, /window\.WF_CANVAS_LIBRARY\?\.fromHash\(\)/);
  assert.match(canvas, /#component=\$\{encodeURIComponent\(c\.key\)\}/, 'the component panel links to the library');
});
