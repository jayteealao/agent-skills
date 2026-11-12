// The rules of the canvas mount that need no browser: which pages can be drawn with no frame, and
// how a sheet of a document becomes a sheet of a shadow root. The script holds them in
// `WF_CANVAS_MOUNT_LOGIC`; its second part gives nothing where there is no document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { screenTemplate } from '../../../lib/design-surface.mjs';
import { CANVAS_FILE_RE } from '../../../lib/design-server.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const canvasDir = join(pluginRoot, 'skills', 'wf', 'canvas');
const context = vm.createContext({ URL });
vm.runInContext(readFileSync(join(canvasDir, 'canvas-mount.js'), 'utf8'), context);
const M = context.WF_CANVAS_MOUNT_LOGIC;
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the script loads with no document: the rules, and no mount', () => {
  assert.equal(typeof M.rewriteSheet, 'function');
  assert.equal(context.WF_CANVAS_MOUNT, null);
});

test('the canvas loads the mount before its own script, and the server serves it', () => {
  const page = readFileSync(join(canvasDir, 'index.html'), 'utf8');
  const at = page.indexOf('/canvas/canvas-mount.js');
  assert.ok(at > 0 && at < page.indexOf('/canvas/canvas.js"'));
  assert.ok(CANVAS_FILE_RE.test('canvas-mount.js'));
});

test('a new screen page can be mounted: its state switch is known', () => {
  assert.deepEqual(plain(M.mountProblems(screenTemplate('home', 'Home'))), []);
  assert.deepEqual(plain(M.mountProblems('<script>document.documentElement.dataset.state=new URLSearchParams(location.search).get(\'state\')||\'default\';</script>')), []);
});

test('a script that only sets the state and the theme from the address is the switch of the page', () => {
  assert.equal(M.switchScript(`// The canvas opens a state with ?state=<name>.
  const q = new URLSearchParams(location.search);
  document.documentElement.dataset.state = q.get('state') || 'default';
  if (q.get('theme')) document.documentElement.dataset.theme = q.get('theme');`), true);
  assert.equal(M.switchScript(`document.documentElement.dataset.state = new URLSearchParams(location.search).get('state') || 'default';
  if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';`), true);
  assert.equal(M.switchScript(''), true);
  assert.equal(M.switchScript("document.documentElement.dataset.state = q.get('state'); fetch('/x')"), false);
  assert.equal(M.switchScript('document.documentElement.dataset.state = prompt()'), false);
});

test('a handler that only changes a class is work for the mount; any other handler is not', () => {
  const on = { base: 'this', closest: null, query: null, all: false };
  assert.deepEqual(plain(M.parseHandler("this.closest('.app-frame').classList.add('drawer-open')")), [{ ...on, base: 'closest', closest: '.app-frame', act: 'class', op: 'add', name: 'drawer-open' }]);
  assert.deepEqual(plain(M.parseHandler('this.classList.toggle("on"); this.closest("nav").classList.remove("open");')),
    [{ ...on, act: 'class', op: 'toggle', name: 'on' }, { ...on, base: 'closest', closest: 'nav', act: 'class', op: 'remove', name: 'open' }]);
  assert.equal(M.parseHandler('alert(1)'), null);
  assert.equal(M.parseHandler("this.classList.add('a'); fetch('/x')"), null);
  assert.equal(M.parseHandler(''), null);
  assert.deepEqual(plain(M.mountProblems(`<button onclick="this.closest('.app').classList.add('open')">Menu</button>`)), []);
});

test('a handler may set a data value or a state attribute, and pick one of a group', () => {
  const on = { base: 'this', closest: null, query: null, all: false };
  // A view of a group: the pressed element gives the value.
  assert.deepEqual(plain(M.parseHandler("this.closest('[data-fam]').dataset.view = this.dataset.v")), [{ ...on, base: 'closest', closest: '[data-fam]', act: 'data', name: 'view', from: 'v' }]);
  assert.deepEqual(plain(M.parseHandler('this.parentElement.dataset.mode = "list"')), [{ ...on, base: 'parent', act: 'data', name: 'mode', value: 'list' }]);
  // One of a group: the mark comes off the others, then goes on this one.
  assert.deepEqual(plain(M.parseHandler("this.parentElement.querySelectorAll('.on').forEach(e => e.classList.remove('on')); this.classList.add('on')")),
    [{ ...on, base: 'parent', query: '.on', all: true, act: 'class', op: 'remove', name: 'on' }, { ...on, act: 'class', op: 'add', name: 'on' }]);
  assert.deepEqual(plain(M.parseHandler("this.parentElement.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); }); this.setAttribute('aria-pressed', 'true')")),
    [{ ...on, base: 'parent', query: 'button', all: true, act: 'attr', op: 'setAttribute', name: 'aria-pressed', value: 'false' }, { ...on, act: 'attr', op: 'setAttribute', name: 'aria-pressed', value: 'true' }]);
  assert.deepEqual(plain(M.parseHandler("this.closest('.dd').querySelector('.menu').toggleAttribute('hidden')")), [{ ...on, base: 'closest', closest: '.dd', query: '.menu', act: 'attr', op: 'toggleAttribute', name: 'hidden', value: null }]);
});

test('a handler that could run code or leave the page is not work for the mount', () => {
  // An attribute that holds code or an address.
  assert.equal(M.parseHandler("this.setAttribute('onclick', 'x')"), null);
  assert.equal(M.parseHandler("this.setAttribute('href', 'javascript:1')"), null);
  assert.equal(M.parseHandler("this.setAttribute('style', 'x')"), null);
  // A call, and a value that is not a plain word of the page.
  assert.equal(M.parseHandler("this.closest('a').click()"), null);
  assert.equal(M.parseHandler("this.dataset.x = fetch('/')"), null);
  assert.equal(M.parseHandler("this.dataset.x = this.dataset.y + location.href"), null);
  assert.equal(M.parseHandler("this.parentElement.querySelectorAll('a').forEach(e => e.click())"), null);
  assert.equal(M.parseHandler("document.body.classList.add('x')"), null);
  // In a function, `this` is not the pressed element.
  assert.equal(M.parseHandler("this.parentElement.querySelectorAll('a').forEach(function (b) { b.dataset.x = this.dataset.y })"), null);
});

test('the theme script of a component page is known, and data in a script tag is no script', () => {
  const page = '<script data-wf-themes>(() => { document.body })();</script><script type="application/json">{"a":1}</script>';
  assert.deepEqual(plain(M.mountProblems(page)), []);
  assert.equal(M.hasThemeScript(page), true);
  assert.equal(M.hasThemeScript('<p>none</p>'), false);
});

test('a page with a script of its own, a script file, a handler or a base element stays in a frame', () => {
  assert.deepEqual(plain(M.mountProblems('<script>document.querySelectorAll(".t").forEach(() => {})</script>')), ['it has a script of its own']);
  assert.deepEqual(plain(M.mountProblems('<script src="./support.js"></script>')), ['it loads a script file']);
  assert.deepEqual(plain(M.mountProblems('<button onclick="go()">Go</button>')), ['it has an inline event handler that is more than a change of a class or an attribute']);
  assert.deepEqual(plain(M.mountProblems('<a href="javascript:go()">Go</a>')), ['it has a javascript: address']);
  assert.deepEqual(plain(M.mountProblems('<base href="/x/">')), ['it has a base element']);
  // The text of a page is not a tag.
  assert.deepEqual(plain(M.mountProblems('<p>Set onclick = "x" in the code</p><!-- <a onclick="x"> -->')), []);
});

test('html, body and :root become the elements of the mount', () => {
  assert.equal(M.rewriteSelector('html, body'), 'wf-html, wf-body');
  assert.equal(M.rewriteSelector(':root'), '.wf-root');
  assert.equal(M.rewriteSelector(':root:not([data-theme])'), '.wf-root:not([data-theme])');
  assert.equal(M.rewriteSelector('html[data-state="default"] [data-state~="default"]'), 'wf-html[data-state="default"] [data-state~="default"]');
  assert.equal(M.rewriteSelector('body > main'), 'wf-body > main');
  assert.equal(M.rewriteSelector('body [data-state]'), 'wf-body [data-state]');
  assert.equal(M.rewriteSelector(':is(html,body) .a'), ':is(wf-html,wf-body) .a');
});

test('a name that only holds html or body stays, and so do strings and attribute tests', () => {
  assert.equal(M.rewriteSelector('.html, .body, #body, .tbody-x, tbody, .a-body'), '.html, .body, #body, .tbody-x, tbody, .a-body');
  assert.equal(M.rewriteSelector('[data-kind="html body"] a'), '[data-kind="html body"] a');
  assert.equal(M.rewriteSelector('[title=body] html'), '[title=body] wf-html');
});

test('the inspector shows a selector as the page wrote it', () => {
  for (const s of ['html, body', ':root:not([data-theme])', 'body > main .x', 'html[data-state="a"] b']) assert.equal(M.displaySelector(M.rewriteSelector(s)), s);
});

test('the units of the window become the units of the container', () => {
  assert.equal(M.rewriteUnits('min-height: 100vh'), 'min-height: 100cqh');
  assert.equal(M.rewriteUnits('width: calc(50vw - 1.5dvh)'), 'width: calc(50cqw - 1.5cqh)');
  assert.equal(M.rewriteUnits('height: 100svh; inset: .5vmin 2vmax'), 'height: 100cqh; inset: .5cqmin 2cqmax');
  // A name and an address keep their letters.
  assert.equal(M.rewriteUnits('background: url(a/100vh.png); font-family: "1vw"'), 'background: url(a/100vh.png); font-family: "1vw"');
  assert.equal(M.rewriteUnits('margin: var(--s-1vh)'), 'margin: var(--s-1vh)');
});

test('a media query on the viewport becomes a container query', () => {
  assert.deepEqual(plain(M.mediaQuery('(min-width: 600px)')), { open: '@container wf-screen (min-width: 600px){', close: '}' });
  assert.deepEqual(plain(M.mediaQuery('screen and (min-width:600px) and (min-height:400px)')), { open: '@container wf-screen (min-width:600px) and (min-height:400px){', close: '}' });
  assert.deepEqual(plain(M.mediaQuery('(max-width:700px),(max-height:500px)')), { open: '@container wf-screen (max-width:700px) or (max-height:500px){', close: '}' });
  assert.deepEqual(plain(M.mediaQuery('(width >= 600px)')), { open: '@container wf-screen (width >= 600px){', close: '}' });
});

test('a media query on another feature stays, and a mixed one nests', () => {
  assert.deepEqual(plain(M.mediaQuery('(prefers-reduced-motion: reduce)')), { open: '@media (prefers-reduced-motion: reduce){', close: '}' });
  assert.deepEqual(plain(M.mediaQuery('(prefers-color-scheme: dark)')), { open: '@media (prefers-color-scheme: dark){', close: '}' });
  assert.deepEqual(plain(M.mediaQuery('(hover: hover) and (min-width: 600px)')), { open: '@media (hover: hover){@container wf-screen (min-width: 600px){', close: '}}' });
});

test('a media query with no true container form has no translation', () => {
  assert.equal(M.mediaQuery('not screen and (min-width: 600px)'), null);
  assert.equal(M.mediaQuery('(min-width: 600px), (hover: hover)'), null);
  assert.equal(M.mediaQuery('print, (min-width: 600px)'), null);
});

test('a sheet for the mount: the selectors, the queries, the units and the rules of the document', () => {
  const r = M.rewriteSheet(`/* a { color: red } */
@import url("fonts.css");
@font-face { font-family: X; src: url(x.woff2) }
:root { --pad: 8px; }
html, body { margin: 0; height: 100vh; }
.bar { position: fixed; background: url('img/a.png') }
@media (min-width: 600px) { body .wide { display: block } }
@media (prefers-reduced-motion: reduce) { * { animation: none } }
@keyframes spin { from { rotate: 0deg } to { rotate: 360deg } }
.card { color: red; &:hover { color: blue } }`, 'http://h/r/app/s/components.css');
  assert.deepEqual(plain(r.problems), []);
  assert.deepEqual(plain(r.hoist), ['@import url("http://h/r/app/s/fonts.css");', '@font-face{ font-family: X; src: url("http://h/r/app/s/x.woff2") }']);
  assert.ok(!r.css.includes('color: red } */'));
  assert.match(r.css, /\.wf-root\{--pad: 8px;\}/);
  assert.match(r.css, /wf-html, wf-body\{margin: 0;height: 100cqh;\}/);
  assert.match(r.css, /url\("http:\/\/h\/r\/app\/s\/img\/a\.png"\)/);
  assert.match(r.css, /@container wf-screen \(min-width: 600px\)\{wf-body \.wide\{display: block;\}\}/);
  assert.match(r.css, /@media \(prefers-reduced-motion: reduce\)\{\*\{animation: none;\}\}/);
  assert.match(r.css, /@keyframes spin\{ from \{ rotate: 0deg \} to \{ rotate: 360deg \} \}/);
  assert.match(r.css, /\.card\{color: red;&:hover\{color: blue;\}\}/);
});

test('a sheet keeps a data address whole, and names the query it cannot translate', () => {
  const r = M.rewriteSheet('.a{background:url(data:image/png;base64,AA{;}==)}@media not all and (max-width:5px){.b{color:red}}');
  assert.match(r.css, /url\(data:image\/png;base64,AA\{;\}==\)/);
  assert.deepEqual(plain(r.problems), ['@media not all and (max-width:5px)']);
});

test('the sheet of a new screen shows its state on the root of the mount', () => {
  const style = /<style>([\s\S]*?)<\/style>/.exec(screenTemplate('home', 'Home'))[1];
  const { css, problems } = M.rewriteSheet(style);
  assert.deepEqual(plain(problems), []);
  assert.match(css, /wf-body \[data-state\]\{display: none;\}/);
  assert.match(css, /wf-html\[data-state="worst"\] \[data-state~="worst"\]\{display: block;\}/);
});

test('the canvas mounts the page of a screen, and makes a frame only for a snapshot or a page that the mount refuses', () => {
  const canvas = readFileSync(join(canvasDir, 'canvas.js'), 'utf8');
  assert.match(canvas, /if \(SNAP \|\| !MOUNT\) return iframeFor\(/);
  assert.match(canvas, /MOUNT\.mount\(host, pageUrl\(key, at\), \{ state: host\.dataset\.state \}\)/);
  assert.match(canvas, /if \(r\.fallback\) inFrame\(host, r\)/);
  // The screen view says why a page is in a frame.
  assert.match(canvas, /Drawn in a frame: \$\{framed\.join\('; '\)\}/);
  // The screen view reads the page through the view of the mount, never through the document of a frame.
  const view = canvas.slice(canvas.indexOf('function drawFocus()'), canvas.indexOf('function keepPickInView()'));
  assert.doesNotMatch(view, /contentDocument|contentWindow|ownerDocument|elementFromPoint/);
  assert.match(view, /const loaded = \(\) => viewOf\(pageIn\(live\)\)/);
});

test('a comment names its element by the same path on a mounted page and in a frame', () => {
  const canvas = readFileSync(join(canvasDir, 'canvas.js'), 'utf8');
  // The path stops under the body, and a mounted page has `wf-body` there.
  assert.match(canvas, /const isBody = \(el\) => el\.tagName === 'BODY' \|\| el\.tagName === 'WF-BODY'/);
  assert.match(canvas, /const find = \(view, selector\) => \(view && selector \? view\.query\(selector\) : null\)/);
  // A stored selector with `html` or `body` finds its element on a mounted page.
  assert.equal(M.rewriteSelector('html > body > main p:nth-of-type(2)'), 'wf-html > wf-body > main p:nth-of-type(2)');
});

test('a change of the files makes the mount forget once, and each page reads again in its place', () => {
  const canvas = readFileSync(join(canvasDir, 'canvas.js'), 'utf8');
  assert.match(canvas, /if \(all \|\| pages\.length\) MOUNT\?\.forget\(\)/);
  assert.match(canvas, /el\.wfView\.reload\(\{ fresh: false \}\)\.then\(\(r\) => \{ if \(r\.fallback\) inFrame\(el, r\); \}\)/);
  const mount = readFileSync(join(canvasDir, 'canvas-mount.js'), 'utf8');
  assert.match(mount, /async reload\(\{ fresh = true \} = \{\}\) \{\s+if \(fresh\) forget\(page\.url\);/);
});

test('a file that is read again and did not change keeps its sheet', () => {
  const kept = M.keeper();
  let made = 0;
  const make = () => { made += 1; return { n: made }; };
  const first = kept.take('a.css', 'a{color:red}', make);
  assert.equal(kept.take('a.css', 'a{color:red}', make), first, 'the same text: the same sheet, and nothing is built');
  assert.equal(made, 1);
  const next = kept.take('a.css', 'a{color:blue}', make);
  assert.notEqual(next, first, 'another text: a new sheet');
  assert.equal(kept.take('a.css', 'a{color:blue}', make), next);
  assert.notEqual(kept.take('b.css', 'a{color:blue}', make), next, 'another file has its own sheet');
  assert.equal(made, 3);
  const mount = readFileSync(join(canvasDir, 'canvas-mount.js'), 'utf8');
  assert.match(mount, /return built\.take\(id, text, \(\) => build\(text, href, href, media\)\)/);
});

test('the store of read pages keeps the pages that were asked for last', () => {
  const store = M.bounded(3);
  for (const k of ['a', 'b', 'c']) store.set(k, k.toUpperCase());
  assert.equal(store.get('a'), 'A', 'a read makes a page the newest');
  store.set('d', 'D');
  assert.equal(store.has('b'), false, 'the page that was asked for the longest time ago left');
  assert.deepEqual(['a', 'c', 'd'].map((k) => store.has(k)), [true, true, true]);
  assert.equal(store.get('b'), undefined);
  store.set('c', 'C2');
  assert.equal(store.size(), 3, 'a page that is set again takes no second place');
  assert.equal(store.get('c'), 'C2');
  store.delete('a');
  assert.equal(store.has('a'), false);
  store.clear();
  assert.equal(store.size(), 0);
  const mount = readFileSync(join(canvasDir, 'canvas-mount.js'), 'utf8');
  assert.match(mount, /const pages = L\.bounded\(MAX_PAGES\)/);
});

test('each new set of hoisted rules has a style element of its own, and a page waits for its imports', () => {
  const mount = readFileSync(join(canvasDir, 'canvas-mount.js'), 'utf8');
  const hoist = mount.slice(mount.indexOf('function hoist(rules)'), mount.indexOf('function build('));
  // One element that is written again would make the browser read every font again.
  assert.doesNotMatch(hoist, /getElementById/);
  assert.match(hoist, /const el = document\.createElement\('style'\)/);
  assert.match(hoist, /el\.addEventListener\('load', ok\); el\.addEventListener\('error', ok\); setTimeout\(ok, HOIST_WAIT_MS\)/, 'a late import does not hold the page');
  assert.match(mount, /if \(hoistBusy\) await hoistBusy;/);
});

test('the inspector reads the rules and the styles through the view, and the mode themes a mounted page', () => {
  const inspect = readFileSync(join(canvasDir, 'canvas-inspect.js'), 'utf8');
  assert.match(inspect, /for \(const s of view\.sheets\(\)\)/);
  assert.match(inspect, /selector: view\.selectorText\(r\)/);
  assert.match(inspect, /else if \(r\.cssRules && view\.applies\(r\)\) walk\(r\.cssRules, source\)/);
  assert.match(inspect, /document\.addEventListener\('wf-load', \(e\) => applyMode\(e\.target\), true\)/);
  assert.doesNotMatch(inspect, /contentDocument|ownerDocument|styleSheets/);
});

test('a handler with no quotes is a handler too', () => {
  assert.deepEqual(plain(M.mountProblems('<button onclick=alert(1)>Go</button>')), ['it has an inline event handler that is more than a change of a class or an attribute']);
});
