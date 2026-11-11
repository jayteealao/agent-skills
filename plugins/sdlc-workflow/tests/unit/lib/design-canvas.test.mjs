// The rules of the design canvas that need no browser: how a comment names its target, where a
// pin goes, how a dragged place is stored, what a draft keeps, what changed between two states,
// and which screens wait for the person. The canvas script holds them in `WF_CANVAS_LOGIC`; its
// second part returns at once where there is no document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = readFileSync(join(pluginRoot, 'skills', 'wf', 'canvas', 'canvas.js'), 'utf8');
// The rules use one global of a browser that Node has too.
const context = vm.createContext({ URLSearchParams });
vm.runInContext(source, context);
const L = context.WF_CANVAS_LOGIC;
/** A value of the script's own realm as a plain value of this one. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the canvas script loads with no document and gives its rules', () => {
  assert.equal(typeof L.targetName, 'function');
  assert.equal(typeof L.diffStates, 'function');
});

test('a comment names its target by what the element is and says', () => {
  assert.equal(L.targetName({ tag: 'BUTTON', text: 'Chrome' }), 'the button "Chrome"');
  assert.equal(L.targetName({ tag: 'A', text: '  Open   the run page ' }), 'the link "Open the run page"');
  assert.equal(L.targetName({ tag: 'DIV', role: 'tab', text: 'Runs' }), 'the tab "Runs"');
  assert.equal(L.targetName({ tag: 'INPUT', type: 'checkbox', name: 'Wi-Fi only' }), 'the checkbox "Wi-Fi only"');
  assert.equal(L.targetName({ tag: 'INPUT', name: 'Search or type URL' }), 'the field "Search or type URL"');
  assert.equal(L.targetName({ tag: 'IMG', name: '' }), 'the image');
  assert.equal(L.targetName({ tag: 'SPAN', text: 'Chrome' }), 'the text "Chrome"');
  assert.equal(L.targetName({ tag: 'DIV', text: 'Custom Tab provider Chrome', block: true }), 'the block "Custom Tab provider Chrome"');
});

test('the accessible name wins over the text, a long text is cut, and nothing known gives the fallback', () => {
  assert.equal(L.targetName({ tag: 'BUTTON', name: 'Close', text: '×' }), 'the button "Close"');
  const long = L.targetName({ tag: 'P', text: 'x'.repeat(80) });
  assert.ok(long.length < 60 && long.endsWith('…"'), long);
  assert.equal(L.targetName(null), 'an element of the screen');
  assert.equal(L.targetName({ tag: 'DIV', text: '   ' }), 'an element of the screen');
});

test('a thread says its state, its viewport and its target, never a CSS path', () => {
  assert.equal(L.whereText({ state: 'empty', viewport: 'phone', selector: 'div > p:nth-of-type(2)' }, 'the button "Chrome"'), 'Empty state, Phone viewport, on the button "Chrome"');
  assert.equal(L.whereText({ selector: 'div > div' }, null), 'Default state, on an element of the screen');
  assert.equal(L.whereText({ state: 'default', x: null, y: null, selector: null }, null), 'Default state, on the whole screen');
  assert.equal(L.whereText({ state: 'default', x: 0.5, y: 0.2, selector: null }, null), 'Default state, at a point of the screen');
});

test('a thread names its target from the live element, else from the name the comment kept, else the fallback', () => {
  const anchor = { selector: 'div > button', label: 'the button "Chrome"' };
  assert.equal(L.threadTarget({ tag: 'BUTTON', text: 'Firefox' }, anchor), 'the button "Firefox"', 'the page as it is now wins');
  assert.equal(L.threadTarget(null, anchor), 'the button "Chrome"', 'the element is gone: the kept name');
  assert.equal(L.threadTarget(null, { selector: 'div' }), 'an element of the screen');
  assert.equal(L.threadTarget(null, { selector: 'div', label: null }), 'an element of the screen');
  assert.equal(L.threadTarget(null, null), 'an element of the screen');
});

test('the name sent with an anchor is one clean line of at most 80 characters, or null', () => {
  assert.equal(L.anchorLabel('the button "Chrome"'), 'the button "Chrome"');
  assert.equal(L.anchorLabel('the text "a\nb\tc"'), 'the text "a b c"');
  assert.equal(L.anchorLabel('x'.repeat(200)).length, 80);
  assert.equal(L.anchorLabel(''), null);
  assert.equal(L.anchorLabel(undefined), null);
  assert.match(source, /label: p\.selector \? L\.anchorLabel\(p\.label\) : null/, 'the canvas sends the name with a new comment');
});

test('a pin sits on its element in every viewport, at the stored point only where that point is still on it', () => {
  const size = { width: 400, height: 800 };
  const rect = { left: 100, top: 200, width: 100, height: 40 };
  // The comment was made in this viewport, and the point is on the element: the exact point.
  assert.deepEqual(plain(L.pinPlace({ x: 0.3, y: 0.26, viewport: 'phone', selector: 'p' }, 'phone', size, rect)), { x: 120, y: 208 });
  // Another viewport: the element places the pin, the stored point does not.
  assert.deepEqual(plain(L.pinPlace({ x: 0.3, y: 0.26, viewport: 'desktop', selector: 'p' }, 'phone', size, rect)), { x: 112, y: 212 });
  // The element moved away from the stored point: the element wins.
  assert.deepEqual(plain(L.pinPlace({ x: 0.9, y: 0.9, viewport: 'phone', selector: 'p' }, 'phone', size, rect)), { x: 112, y: 212 });
});

test('a pin with no element falls back to the stored point in its own viewport, and hides in another', () => {
  const size = { width: 400, height: 800 };
  assert.deepEqual(plain(L.pinPlace({ x: 0.5, y: 0.25, viewport: 'phone', selector: 'p' }, 'phone', size, null)), { x: 200, y: 200 });
  assert.equal(L.pinPlace({ x: 0.5, y: 0.25, viewport: 'desktop', selector: 'p' }, 'phone', size, null), null);
  assert.deepEqual(plain(L.pinPlace({ x: 0.5, y: 0.25, viewport: null }, 'phone', size, null)), { x: 200, y: 200 });
  assert.equal(L.pinPlace({ x: null, y: null, viewport: 'phone' }, 'phone', size, null), null, 'a comment on the whole screen has no pin');
});

test('a dragged place is stored in rows, so it fits the taller cards of another viewport', () => {
  const desktop = L.REF_PITCH;
  const phone = 745;
  const at = { x: 364, y: L.LABEL_H + 2.5 * desktop };
  const stored = L.toStored(at, desktop);
  assert.deepEqual(plain(stored), { x: 364, y: Math.round(at.y) }, 'at the reference viewport the stored place is the place');
  const onPhone = L.fromStored(stored, phone);
  assert.equal(onPhone.x, 364);
  assert.equal(onPhone.y, Math.round(L.LABEL_H + 2.5 * phone), 'row 2.5 stays row 2.5');
  assert.deepEqual(plain(L.toStored(onPhone, phone)), plain(stored), 'a place read and stored again does not drift');
});

test('a press that moves under 4 px is a click, and the reset deletes every dragged place', () => {
  assert.equal(L.isDrag(2, 2), false);
  assert.equal(L.isDrag(0, 3.9), false);
  assert.equal(L.isDrag(4, 0), true);
  assert.equal(L.isDrag(-3, -3), true);
  assert.deepEqual(plain(L.resetBody([{ key: 'a', position: { x: 1, y: 2 } }, { key: 'b', position: null }, { key: 'c', position: { x: 0, y: 0 } }])), { positions: { a: null, c: null } });
});

test('a long group takes more columns', () => {
  assert.equal(L.columnsFor(1, 6), 1);
  assert.equal(L.columnsFor(6, 6), 1);
  assert.equal(L.columnsFor(7, 6), 2);
  assert.equal(L.columnsFor(76, 6), 13);
});

test('a draft stays through a new store of the same storage, and an empty text clears it', () => {
  const held = new Map();
  const storage = { getItem: (k) => held.get(k) ?? null, setItem: (k, v) => held.set(k, v) };
  const a = L.createDrafts(storage, 'drafts:shop');
  assert.equal(a.get('pay|new'), '');
  assert.equal(a.any(), false);
  a.set('pay|new', 'The total is hard to read');
  a.set('pay|t1', 'Agreed');
  assert.equal(a.any(), true);
  // A reload of the canvas makes a new store over the same storage.
  const b = L.createDrafts(storage, 'drafts:shop');
  assert.equal(b.get('pay|new'), 'The total is hard to read');
  assert.deepEqual(plain(b.keys()).sort(), ['pay|new', 'pay|t1']);
  b.clear('pay|new');
  b.set('pay|t1', '');
  assert.equal(L.createDrafts(storage, 'drafts:shop').any(), false);
});

test('the drafts work with no storage, with a storage that throws, and with a broken value', () => {
  const none = L.createDrafts(null);
  none.set('a', 'text');
  assert.equal(none.get('a'), 'text');
  const throwing = L.createDrafts({ getItem() { throw new Error('private'); }, setItem() { throw new Error('full'); } });
  throwing.set('a', 'text');
  assert.equal(throwing.get('a'), 'text');
  assert.equal(L.createDrafts({ getItem: () => '[1,2', setItem() {} }).any(), false);
  assert.equal(L.createDrafts({ getItem: () => '"text"', setItem() {} }).get('a'), '');
  assert.equal(L.createDrafts(null).any(), false);
  const blank = L.createDrafts(null);
  blank.set('a', '   ');
  assert.equal(blank.any(), false, 'white space is no draft');
});

test('two changes that wait name every page and part of both', () => {
  const one = { all: false, pages: ['a'], parts: ['explore/x.html'] };
  assert.deepEqual(plain(L.mergeChange(null, one)), one);
  assert.deepEqual(plain(L.mergeChange(one, { all: false, pages: ['b', 'a'], parts: [] })), { all: false, catchUp: false, pages: ['a', 'b'], parts: ['explore/x.html'] });
  assert.equal(L.mergeChange(one, { all: true, pages: [], parts: [] }).all, true);
  assert.equal(L.mergeChange({ catchUp: true, pages: [], parts: [] }, one).catchUp, true);
});

test('a canvas that was away reloads only the screens whose page differs', () => {
  const old = { tokens: [{ name: '--ink', value: '#111' }], explore: [], components: [], references: [], screens: [{ key: 'a', fingerprint: '1' }, { key: 'b', fingerprint: '2' }, { key: 'gone', fingerprint: '3' }] };
  const next = { ...old, screens: [{ key: 'a', fingerprint: '1' }, { key: 'b', fingerprint: '9' }, { key: 'new', fingerprint: '4' }] };
  assert.deepEqual(plain(L.diffStates(old, next)), { pages: ['b', 'new'], removed: ['gone'], all: false, lanes: false });
  assert.deepEqual(plain(L.diffStates(old, old)), { pages: [], removed: [], all: false, lanes: false });
});

test('a changed token sheet touches every screen, and a changed component touches the lanes', () => {
  const old = { tokens: [{ name: '--ink', value: '#111' }], explore: [], components: [{ key: 'fab' }], references: [], screens: [{ key: 'a', fingerprint: '1' }] };
  assert.equal(L.diffStates(old, { ...old, tokens: [{ name: '--ink', value: '#222' }] }).all, true);
  const lanes = L.diffStates(old, { ...old, components: [{ key: 'fab' }, { key: 'row' }] });
  assert.equal(lanes.lanes, true);
  assert.equal(lanes.all, false);
  assert.deepEqual(plain(L.diffStates(null, old).pages), ['a'], 'with no state before, every screen is new');
});

test('a new fingerprint of the sheets touches every screen, on a reconnect and on a change', () => {
  const old = { tokens: [], explore: [], components: [], references: [], sheets: { fingerprint: 'aaaaaaaaaaaaaaaa' }, screens: [{ key: 'a', fingerprint: '1' }] };
  assert.equal(L.diffStates(old, { ...old, sheets: { fingerprint: 'bbbbbbbbbbbbbbbb' } }).all, true);
  assert.equal(L.diffStates(old, { ...old, sheets: { fingerprint: 'aaaaaaaaaaaaaaaa' } }).all, false);
  assert.equal(L.diffStates({ ...old, sheets: undefined }, { ...old, sheets: undefined }).all, false, 'a state with no sheets field changes nothing');
  assert.match(source, /if \(before && \(before\.sheets\?\.fingerprint \?\? null\) !== \(data\.sheets\?\.fingerprint \?\? null\)\) all = true;/, 'a change event checks the sheets too');
});

test('the event stream opens again with a longer wait each time, at most a minute', () => {
  assert.equal(L.reopenDelay(0), 5000);
  assert.equal(L.reopenDelay(1), 10000);
  assert.equal(L.reopenDelay(2), 20000);
  assert.equal(L.reopenDelay(9), 60000);
  assert.equal(L.reopenDelay(1000), 60000);
});

test('the canvas compares the ETag whole, shows the reason and the fix of a refused write, and sets no referrer policy', () => {
  assert.match(source, /got\.etag === stateEtag/);
  assert.doesNotMatch(source, /etag\.(split|slice|match|replace)|referrerPolicy/);
  assert.match(source, /e\.fix = typeof j\.fix\?\.do === 'string' \? j\.fix\.do : null;/);
  assert.match(source, /const lost = data\.recordsCommit\?\.failed/);
});

test('a screen waits for a decision with a draft round or with no approval', () => {
  assert.equal(L.needsDecision({ approvals: [] }, null), true);
  assert.equal(L.needsDecision({}, null), true);
  assert.equal(L.needsDecision({ approvals: [{ commit: 'a' }] }, null), false);
  assert.equal(L.needsDecision({ approvals: [{ commit: 'a' }] }, { id: 'v2-r1' }), true);
  assert.equal(L.needsDecision({ approvals: [], exists: false }, null), false, 'a screen with no file has nothing to decide');
});

test('one wording for a count of failing checks', () => {
  assert.equal(L.failText(1), '1 check fails');
  assert.equal(L.failText(2), '2 checks fail');
});

test('the screen view fits its panes to the room, never above 100 %', () => {
  assert.equal(L.fitScale({ availW: 2000, availH: 2000, widths: [375], height: 812 }), 1);
  assert.equal(L.fitScale({ availW: 640, availH: 2000, widths: [1280], height: 800 }), 0.5);
  assert.equal(L.fitScale({ availW: 2000, availH: 400, widths: [1280], height: 800 }), 0.5, 'the height of the room bounds the fit too');
  assert.equal(L.fitScale({ availW: 1024, widths: [500, 500], height: 800, gap: 24 }), 1);
  assert.equal(L.fitScale({ availW: 524, widths: [500, 500], height: 800, gap: 24 }), 0.5);
  assert.ok(L.fitScale({ availW: -50, widths: [1280], height: 800 }) > 0, 'a room of no width still gives a scale');
});

test('the address of an open screen reads back, so Back closes the view and a link opens one screen', () => {
  const hash = L.hashOf({ key: 'home-search', viewport: 'phone', state: 'empty' });
  assert.equal(hash, '#screen=home-search&viewport=phone&state=empty');
  assert.deepEqual(plain(L.parseHash(hash)), { key: 'home-search', viewport: 'phone', state: 'empty' });
  assert.deepEqual(plain(L.parseHash('#screen=pay')), { key: 'pay', viewport: null, state: null });
  assert.equal(L.parseHash(''), null);
  assert.equal(L.parseHash('#other=1'), null);
});

test('a viewport of another form gives the default size, not an error', () => {
  assert.deepEqual(plain(L.parseSize('375x812')), { width: 375, height: 812 });
  assert.deepEqual(plain(L.parseSize('390×844')), { width: 390, height: 844 });
  assert.deepEqual(plain(L.parseSize('wide')), { width: 1280, height: 800 });
  assert.deepEqual(plain(L.parseSize(undefined)), { width: 1280, height: 800 });
  assert.deepEqual(plain(L.parseSize('0x0')), { width: 1280, height: 800 });
});

// The parts of the canvas that only a browser runs: these lines guard what a draw must not lose.
test('the canvas sends the write token, retries a refused write once, and never reloads over a draft', () => {
  assert.match(source, /'x-wf-canvas': token/);
  assert.match(source, /if \(r\.status === 403\) \{ await refreshToken\(\); r = await go\(\); \}/);
  assert.match(source, /if \(hello\.writeToken \|\| hello\.token\) token = hello\.writeToken \|\| hello\.token;/);
  assert.match(source, /if \(drafts\.any\(\) \|\| ui\.dragging\) notice\('restart'/);
  assert.doesNotMatch(source, /window\.prompt|innerHTML/);
});

test('the canvas holds no message listener: the pages share its origin and it reads them directly', () => {
  assert.doesNotMatch(source, /postMessage|addEventListener\(\s*['"]message['"]/);
});

test('the Tokens lane groups the tokens by kind in a fixed order, and a legacy sheet gets its kind from the name', () => {
  const groups = plain(L.tokenGroups([
    { name: '--space-2', kind: 'space' }, { name: '--accent', kind: 'color' }, { name: '--ink', kind: 'color' },
    { name: '--font-body', kind: 'font' }, { name: '--odd', kind: 'mystery' }, { name: '--radius-md' }, { name: '--plain' },
  ]));
  assert.deepEqual(groups.map((g) => [g.kind, g.tokens.map((t) => t.name)]), [
    ['color', ['--accent', '--ink']], ['font', ['--font-body']], ['space', ['--space-2']], ['radius', ['--radius-md']], ['other', ['--odd', '--plain']],
  ]);
  assert.deepEqual(plain(L.TOKEN_KIND_ORDER), ['color', 'font', 'type', 'weight', 'leading', 'space', 'size', 'radius', 'shadow', 'motion', 'layer', 'other']);
  assert.deepEqual(plain(L.tokenGroups([])), []);
});

test('a colour shows its value in each theme of the model, in the order of the themes', () => {
  const themes = [{ name: 'light' }, { name: 'dark' }];
  assert.deepEqual(plain(L.themeValues({ value: '#fff', values: { dark: '#000', light: '#fff' } }, themes)), [{ theme: 'light', value: '#fff' }, { theme: 'dark', value: '#000' }]);
  assert.deepEqual(plain(L.themeValues({ value: '#fff', values: {} }, themes)), [{ theme: null, value: '#fff' }]);
});

test('a component is marked by what its spec lacks', () => {
  assert.equal(L.specMark({ problems: [] }), null);
  assert.equal(L.specMark({}), null);
  assert.equal(L.specMark({ problems: [{ cause: 'no-spec' }] }), 'No spec');
  assert.equal(L.specMark({ problems: [{ cause: 'variant:tone=ghost' }, { cause: 'theme:dark' }] }), '2 gaps');
});
