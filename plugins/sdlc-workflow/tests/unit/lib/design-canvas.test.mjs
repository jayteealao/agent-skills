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

// ---- the shell and the board

test('a card shows one status: the most urgent thing of its screen', () => {
  const all = { failing: 4, comments: 2, fresh: 'changed', draft: true, approved: true };
  assert.deepEqual(plain(L.statusOf(all)), { kind: 'failing', text: '4 failing' });
  assert.deepEqual(plain(L.statusOf({ ...all, failing: 0 })), { kind: 'comments', text: '2 comments' });
  assert.deepEqual(plain(L.statusOf({ comments: 1, approved: true })), { kind: 'comments', text: '1 comment' });
  assert.deepEqual(plain(L.statusOf({ ...all, failing: 0, comments: 0 })), { kind: 'changed', text: 'Changed' });
  assert.deepEqual(plain(L.statusOf({ fresh: 'new' })), { kind: 'changed', text: 'New' });
  assert.deepEqual(plain(L.statusOf({ draft: true, approved: true })), { kind: 'draft', text: 'Draft' });
  assert.deepEqual(plain(L.statusOf({ approved: false })), { kind: 'draft', text: 'Not approved' });
  assert.deepEqual(plain(L.statusOf({ approved: true })), { kind: 'approved', text: 'Approved' });
  // A screen with no file says so before anything else.
  assert.deepEqual(plain(L.statusOf({ ...all, exists: false })), { kind: 'failing', text: 'No file' });
  assert.deepEqual(plain(L.statusOf(null)), { kind: 'draft', text: 'Not approved' });
});

test('the review queue holds the screens that changed, fail a check or have an open comment, in the order given', () => {
  const rows = [
    { key: 'a', approved: true },
    { key: 'b', fresh: 'changed' },
    { key: 'c', failing: 2 },
    { key: 'd', waiting: true },
    { key: 'e', comments: 1 },
    { key: 'f', fresh: 'new', failing: 1, comments: 3 },
    { key: 'gone', exists: false, failing: 1 },
  ];
  assert.deepEqual(plain(L.reviewQueue(rows)), ['b', 'c', 'e', 'f']);
  assert.deepEqual(plain(L.reviewQueue([])), []);
  assert.deepEqual(plain(L.reviewQueue(null)), []);
  // A missing approval alone is a decision, not a look.
  assert.equal(L.waitsForLook({ waiting: true, draft: true }), false);
  assert.equal(L.waitReasons({ fresh: 'new', failing: 1, comments: 3 }), 'New · 1 check fails · 3 open comments');
  assert.equal(L.waitReasons({ fresh: 'changed' }), 'Changed');
});

test('each filter chip counts its screens', () => {
  const rows = [
    { key: 'a', fresh: 'changed', failing: 2, waiting: true },
    { key: 'b', comments: 1 },
    { key: 'c', fresh: 'new', comments: 2, waiting: true },
    { key: 'd' },
  ];
  assert.deepEqual(plain(L.filterCounts(rows)), { all: 4, fresh: 2, failing: 1, open: 2, waiting: 2 });
  assert.deepEqual(plain(L.filterCounts([])), { all: 0, fresh: 0, failing: 0, open: 0, waiting: 0 });
});

test('the time of the last check reads in words, and a screen names its step of the flow', () => {
  const now = Date.parse('2026-01-02T12:00:00Z');
  assert.equal(L.agoText('2026-01-02T11:59:40Z', now), 'just now');
  assert.equal(L.agoText('2026-01-02T11:56:00Z', now), '4 min ago');
  assert.equal(L.agoText('2026-01-02T09:00:00Z', now), '3 h ago');
  assert.equal(L.agoText('2025-12-31T12:00:00Z', now), '2 d ago');
  assert.equal(L.agoText('2026-01-02T13:00:00Z', now), 'just now', 'a clock that is ahead');
  assert.equal(L.agoText('not a time', now), '');
  assert.equal(L.agoText(null, now), '');
  assert.equal(L.stepText(0, 5), 'entry');
  assert.equal(L.stepText(1, 5), '2 of 5');
  assert.equal(L.stepText(0, 1), '');
  assert.equal(L.stepText(-1, 5), '');
});

test('the address names a view of the navigation, and nothing else', () => {
  assert.equal(L.parseView('#view=review'), 'review');
  assert.equal(L.parseView('#view=sketches'), 'sketches');
  assert.equal(L.parseView('view=library'), 'library');
  assert.equal(L.parseView('#view=other'), null);
  assert.equal(L.parseView('#screen=pay'), null);
  assert.equal(L.parseView(''), null);
});

test('the page has the navigation of a wide and of a narrow window, the chips, and no floating strip', () => {
  const dir = join(pluginRoot, 'skills', 'wf', 'canvas');
  const page = readFileSync(join(dir, 'index.html'), 'utf8');
  const shell = readFileSync(join(dir, 'canvas-shell.css'), 'utf8');
  assert.match(page, /<link rel="stylesheet" href="\/canvas\/canvas-shell\.css">/);
  assert.ok(page.indexOf('/canvas/canvas.css') < page.indexOf('/canvas/canvas-shell.css'), 'the shell sheet loads after the base sheet');
  // The four views are real links in both navigations, and one of each is the current one.
  for (const nav of ['<nav id="side"', '<nav id="tabs"']) {
    const at = page.indexOf(nav);
    assert.ok(at > 0, nav);
    const part = page.slice(at, page.indexOf('</nav>', at));
    for (const view of ['screens', 'library', 'tokens', 'review']) assert.match(part, new RegExp(`<a href="#view=${view}" data-view="${view}"`), `${nav} ${view}`);
    assert.equal((part.match(/aria-current="page"/g) ?? []).length, 1);
  }
  assert.match(page, /<a href="#view=sketches" data-view="sketches">/);
  assert.match(page, /<a href="#view=references" data-view="references">/);
  for (const chip of ['', 'fresh', 'failing', 'open', 'waiting']) assert.match(page, new RegExp(`data-chip="${chip}"`));
  for (const view of ['grid', 'flow', 'slice']) assert.match(page, new RegExp(`<button type="button" data-view="${view}"`));
  for (const id of ['stage', 'library', 'review', 'before']) assert.match(page, new RegExp(`<(?:main|section) id="${id}"[^>]* aria-label="`), `${id} is a landmark`);
  assert.doesNotMatch(page, /class="dock"|id="health"|id="filters"/);
  // The canvas loads nothing from another server.
  assert.doesNotMatch(page + shell, /https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
  assert.match(shell, /@media \(prefers-color-scheme: dark\)/);
  assert.match(shell, /@media \(max-width: 899px\)/);
  assert.match(shell, /font-family: Inter, system-ui/);
});

test('the canvas hands the queue of a review to the screen view, and a phone row loads no page', () => {
  assert.match(source, /reviewQueue: \(\) => \(data \? reviewQueue\(\) : \[\]\),/);
  assert.match(source, /reviewing: \(\) => Boolean\(ui\.review\),/);
  assert.match(source, /const narrow = \(\) => matchMedia\('\(max-width: 899px\)'\)\.matches;/);
  assert.match(source, /if \(M\?\.phone\) drawList\(list, shown\);/);
  const list = source.slice(source.indexOf('function drawList('), source.indexOf('function drawReview('));
  assert.doesNotMatch(list, /iframe|frameFor\(/);
  assert.match(source, /const view = data \? L\.parseView\(location\.hash\) : null;/);
});

// ---- the screen view

const SCREENS = [
  { key: 'tree', area: 'workspace', flow: 'find', order: 10 }, { key: 'tabs', area: 'workspace', flow: 'find', order: 20 },
  { key: 'chat', area: 'agent', flow: 'act', order: 10 }, { key: 'composer', area: 'agent', flow: 'act', order: 20 }, { key: 'cards', area: 'agent', flow: 'act', order: 30 },
  { key: 'files', area: 'panels' }, { key: 'git', area: 'panels' }, { key: 'about' },
];
const keysOf = (list) => plain(list).map((s) => s.key);

test('Previous and Next walk the flow of the open screen, and go on to the nearest screen past its ends', () => {
  const mid = L.neighbours(SCREENS, 'composer');
  assert.equal(mid.kind, 'flow');
  assert.equal(mid.name, 'Act flow');
  assert.deepEqual(keysOf(mid.list), ['chat', 'composer', 'cards']);
  assert.equal(mid.at, 1);
  assert.equal(mid.prev.key, 'chat');
  assert.equal(mid.next.key, 'cards');
  const last = L.neighbours(SCREENS, 'cards');
  assert.equal(last.next.key, 'files');
  assert.equal(L.neighbours(SCREENS, 'chat').prev.key, 'tabs');
  // The flow order wins over the order of the board.
  const shuffled = [SCREENS[4], SCREENS[2], SCREENS[3]];
  assert.deepEqual(keysOf(L.neighbours(shuffled, 'chat').list), ['chat', 'composer', 'cards']);
});

test('a screen with no flow walks its area, a screen with neither walks the board, and one screen alone has no neighbour', () => {
  const area = L.neighbours(SCREENS, 'git');
  assert.equal(area.kind, 'area');
  assert.equal(area.name, 'Panels');
  assert.deepEqual(keysOf(area.list), ['files', 'git']);
  assert.equal(area.prev.key, 'files');
  assert.equal(area.next.key, 'about');
  const none = L.neighbours(SCREENS, 'about');
  assert.equal(none.kind, 'board');
  assert.equal(none.list.length, SCREENS.length);
  assert.equal(none.next.key, 'tree');
  const alone = L.neighbours([{ key: 'one', flow: 'solo' }], 'one');
  assert.equal(alone.prev, null);
  assert.equal(alone.next, null);
  assert.equal(L.neighbours(SCREENS, 'gone').kind, 'none');
  // A flow that is the whole board turns around at its ends.
  assert.equal(L.neighbours(SCREENS.slice(2, 5), 'cards').next.key, 'chat');
});

test('a screen opened from the review queue walks the queue, and the queue stops at its ends', () => {
  const q = L.neighbours(SCREENS, 'git', ['cards', 'git', 'tree', 'gone']);
  assert.equal(q.kind, 'queue');
  assert.deepEqual(keysOf(q.list), ['cards', 'git', 'tree']);
  assert.equal(q.prev.key, 'cards');
  assert.equal(q.next.key, 'tree');
  assert.equal(L.neighbours(SCREENS, 'tree', ['cards', 'git', 'tree']).next, null);
  assert.equal(L.neighbours(SCREENS, 'cards', ['cards', 'git', 'tree']).prev, null);
  // A screen that the queue does not hold walks its flow.
  assert.equal(L.neighbours(SCREENS, 'chat', ['git']).kind, 'flow');
  assert.equal(L.neighbours(SCREENS, 'chat', []).kind, 'flow');
});

test('the line under the title names the area, the flow and the place, and in a mode says what the mode does', () => {
  assert.equal(L.subLine({ area: 'agent', flow: 'chat', at: 0, total: 6 }), 'Agent · chat flow · 1 of 6');
  assert.equal(L.subLine({ area: 'panels', at: 1, total: 2 }), 'Panels · 2 of 2');
  assert.equal(L.subLine({ area: 'panels', at: 0, total: 1 }), 'Panels');
  assert.equal(L.subLine({ flow: 'pair', at: 0, total: 1 }), 'pair flow');
  assert.equal(L.subLine({}), '');
  assert.equal(L.subLine({ area: 'agent', flow: 'chat', at: 2, total: 5, queue: true }), 'Review queue · 3 of 5');
  assert.equal(L.subLine({ area: 'agent', mode: 'inspect', touch: true }), 'Inspecting · tap any element');
  assert.equal(L.subLine({ mode: 'inspect' }), 'Inspecting · select any element');
  assert.equal(L.subLine({ mode: 'comment', touch: true }), 'Commenting · tap an element');
  assert.equal(L.subLine({ mode: 'comments', open: 2 }), '2 open comments');
  assert.equal(L.subLine({ mode: 'comments' }), 'Comments');
  assert.equal(L.subLine({ mode: 'checks', failing: 28 }), 'Checks · 28 failing');
  assert.equal(L.subLine({ mode: 'checks' }), 'Checks · none fails');
});

test('a failing check starts a comment for the agent: its name, its message as one sentence, and the repair', () => {
  assert.equal(L.findingComment('Target size', 'The target is 32 px high', 'Give the control a height of --size-touch.'),
    'Target size: The target is 32 px high. Give the control a height of --size-touch.');
  assert.equal(L.findingComment('Contrast', ' The text has 3.9:1;\n it needs 4.5:1. '), 'Contrast: The text has 3.9:1; it needs 4.5:1.');
});

test('the screen view has one top bar, the modes in one control, a dock with four tabs, and no mark over the screen until the person asks', () => {
  const view = source.slice(source.indexOf('function drawFocus()'), source.indexOf('function keepPickInView()'));
  assert.match(view, /class: 'sv-top'/);
  assert.match(view, /modeBtn\('view', 'View'\), past \? null : modeBtn\('comment', 'Comment', openThreads\.length\), inspect \? modeBtn\('inspect', 'Inspect'\) : null/);
  for (const tab of ['inspect', 'comments', 'checks', 'why']) assert.match(view, new RegExp(`tabBtn\\('${tab}'`), tab);
  assert.match(view, /h\('footer', \{ class: 'sv-bottom' \}, stepBtn\(-1\), modeSeg, stepBtn\(1\)\)/);
  assert.match(view, /class: 'sv-float', role: 'toolbar'/);
  // The old tools row, its zoom row and the full-size mode of a phone are gone.
  assert.doesNotMatch(view, /class: 'tools'|class: 'stepper'|moreTools\(|f\.full = true|'Full size'/);
  assert.match(source, /checks: false, audit: false, commenting: false,/);
  assert.match(view, /if \(past \|\| \(!f\.commenting && !f\.checks\) \|\| \(!f\.all && !t\.open\)\) return;/);
  assert.match(view, /'Show marks on the screen'/);
  // A finding becomes a comment in one press, and nothing posts until the person sends it.
  assert.match(view, /agentComment\(here \? find\(loaded\(\), first\?\.selector\) : null, L\.findingComment\(/);
  assert.match(view, /comment: data\.writable && !past \? agentComment : null/);
  const agent = view.slice(view.indexOf('const agentComment ='), view.indexOf('const drawMarks ='));
  assert.doesNotMatch(agent, /post\(|send\(/);
});

test('the keys of the screen view: Escape leaves the menu, the mode, then the view, and the arrows and the brackets walk the screens', () => {
  assert.match(source, /const by = e\.key === 'ArrowLeft' \|\| e\.key === '\[' \? -1 : e\.key === 'ArrowRight' \|\| e\.key === '\]' \? 1 : 0;/);
  assert.match(source, /!e\.target\.closest\?\.\('input, textarea, select, \[contenteditable\]'\)/);
  const esc = source.slice(source.indexOf('// Escape closes the menu, then the mode and its sheet, then the view.'));
  assert.ok(esc.indexOf('focusState.open.tools') < esc.indexOf('leaveMode()') && esc.indexOf('leaveMode()') < esc.indexOf('else closeFocus();'));
  assert.match(source, /if \(!opts\.queue && !window\.WF_CANVAS\?\.reviewing\?\.\(\)\) return null;/);
});

test('the page loads the sheet of the screen view after the sheet of the canvas, and the sheet has both themes and loads nothing', () => {
  const page = readFileSync(join(pluginRoot, 'skills', 'wf', 'canvas', 'index.html'), 'utf8');
  assert.ok(page.indexOf('/canvas/canvas.css') > 0 && page.indexOf('/canvas/canvas.css') < page.indexOf('/canvas/canvas-screen.css'));
  const css = readFileSync(join(pluginRoot, 'skills', 'wf', 'canvas', 'canvas-screen.css'), 'utf8');
  for (const name of ['--cv-ground', '--cv-surface', '--cv-ink', '--cv-ink2', '--cv-line', '--cv-accent', '--cv-accent-soft', '--cv-ok-bg', '--cv-ok', '--cv-info-bg', '--cv-info', '--cv-warn-bg', '--cv-warn', '--cv-alert']) {
    assert.equal(css.split(`${name}:`).length - 1, 2, `${name} has a light and a dark value`);
  }
  assert.doesNotMatch(css, /@import|url\((?!"data:)/);
  assert.match(css, /#focus :focus-visible \{ outline: 2px solid var\(--cv-accent\)/);
});

test('a review row names the checks that fail, the most frequent first, three at most', () => {
  assert.equal(L.failCauses({ layout: 7, token: 12, component: 9 }), 'token 12 · component 9 · layout 7');
  assert.equal(L.failCauses({ layout: 7, token: 12, component: 9, contrast: 2, states: 1 }), 'token 12 · component 9 · layout 7 · +2 more');
  assert.equal(L.failCauses({ token: 3, contrast: 3, layout: 3, a11y: 3 }), 'a11y 3 · contrast 3 · layout 3 · +1 more', 'the same count goes by name');
  assert.equal(L.failCauses({ token: 1 }), 'token 1');
  assert.equal(L.failCauses({ token: 4, layout: 2 }, 1), 'token 4 · +1 more');
  assert.equal(L.failCauses({ token: 0 }), '', 'a check with no failure is no cause');
  assert.equal(L.failCauses(null), '');
  // A snapshot carries the failures, not their counts.
  assert.deepEqual(plain(L.checkCounts([{ check: 'token' }, { check: 'layout' }, { check: 'token' }, { message: 'no check' }, null])), { token: 2, layout: 1 });
  assert.equal(L.failCauses(L.checkCounts([{ check: 'token' }, { check: 'layout' }, { check: 'token' }])), 'token 2 · layout 1');
  assert.deepEqual(plain(L.checkCounts(undefined)), {});
});

test('a reference that is a picture file shows as a picture, whatever its kind', () => {
  assert.equal(L.refShape({ kind: 'image', file: 'a.bin' }), 'picture');
  assert.equal(L.refShape({ kind: 'screen', file: '.ai/design/references/current-list.png' }), 'picture', 'a capture of a screen is a picture: a frame would cut it');
  assert.equal(L.refShape({ kind: 'canvas', file: 'board.JPG' }), 'picture');
  assert.equal(L.refShape({ kind: 'screen', file: 'old/list.html' }), 'page');
  assert.equal(L.refShape({ kind: 'page', file: null }), 'page');
  assert.equal(L.refShape({ kind: 'other', file: 'notes.md' }), 'file');
  assert.equal(L.refShape(null), 'file');
});
