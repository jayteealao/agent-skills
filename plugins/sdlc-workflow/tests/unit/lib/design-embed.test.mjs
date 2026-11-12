// Which pages of a surface the canvas draws in a frame: the list of the CLI, made with the rules
// of the canvas script itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { frameFailures, frameFix, framedLines, framedPages, mountLogic, pageFacts, pageReasons, sheetFileOf, sheetReasons } from '../../../lib/design-embed.mjs';
import { addScreen, initSurface, screenFile, screenTemplate, surfaceDir } from '../../../lib/design-surface.mjs';
import { addComponent, componentFile } from '../../../lib/design-components.mjs';

function repo() {
  const top = mkdtempSync(join(tmpdir(), 'design-embed-'));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  const root = join(top, 'Shop');
  mkdirSync(root);
  return { root, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

test('the rules come from the script of the canvas', () => {
  const L = mountLogic();
  assert.equal(typeof L.mountProblems, 'function');
  assert.equal(typeof L.rewriteSheet, 'function');
  assert.equal(mountLogic(), L, 'the rules are made once for one text of the script');
});

test('a page of the template is drawn with no frame; a page with its own script is not', () => {
  assert.deepEqual(pageReasons(screenTemplate('home', 'Home')), []);
  assert.deepEqual(pageReasons(`<button onclick="this.closest('.app').classList.toggle('open')">Menu</button>`), []);
  assert.deepEqual(pageReasons('<script>fetch("/x")</script>'), ['it has a script of its own']);
  assert.deepEqual(pageReasons('<script src="app.js"></script><a href="javascript:void 0">x</a>'), ['it loads a script file', 'it has a javascript: address']);
});

test('a media query that the canvas cannot translate keeps the page in a frame: inline, by the media of a tag, and in a linked sheet', () => {
  assert.deepEqual(pageReasons('<style>@media (max-width: 600px) { .a { height: 100vh } }</style>'), [], 'a width query and a viewport unit are translated');
  const inline = pageReasons('<style>@media not all and (min-width: 600px) { .a { color: red } }</style>');
  assert.equal(inline.length, 1);
  assert.match(inline[0], /^a media query has no container form: @media not all and \(min-width: 600px\)/);
  assert.equal(pageReasons('<style media="print, (max-width: 600px)">.a { color: red }</style>').length, 1, 'a list that mixes the viewport with another feature');
  assert.deepEqual(pageReasons('<!-- <style>@media not all and (min-width: 1px) {}</style> -->'), [], 'a comment holds no style');
  const sheet = (href) => (href === '../shared.css' ? '@media not screen and (max-width: 500px) { .b { color: red } }' : null);
  assert.equal(pageReasons('<link rel="stylesheet" href="../shared.css">', { sheet }).length, 1);
  assert.deepEqual(pageReasons('<link rel="stylesheet" href="../other.css"><link rel="icon" href="../shared.css">', { sheet }), [], 'a sheet that is not read, and a link that is no sheet');
});

test('the list of a surface names each framed screen and component page, and the note says what to do', () => {
  const { root, done } = repo();
  try {
    initSurface(root);
    addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
    addScreen(root, 'pay', { title: 'Pay', workflow: 'w1' });
    addScreen(root, 'ghost', { title: 'Ghost', workflow: 'w1' });
    addComponent(root, 'button', { title: 'Button' });
    assert.deepEqual(framedPages(root), [], 'the pages of the templates are drawn with no frame');
    assert.deepEqual(framedLines([]), []);

    writeFileSync(screenFile(root, 'pay'), readFileSync(screenFile(root, 'pay'), 'utf8').replace('</body>', '<script>document.title = "x"</script></body>'));
    rmSync(screenFile(root, 'ghost'));
    writeFileSync(componentFile(root, 'button'), readFileSync(componentFile(root, 'button'), 'utf8').replace('</body>', '<button onclick="alert(1)">x</button></body>'));
    const all = framedPages(root);
    assert.deepEqual(all, [
      { kind: 'screen', key: 'pay', reasons: ['it has a script of its own'] },
      { kind: 'component', key: 'button', reasons: ['it has an inline event handler that is more than a change of a class or an attribute'] },
    ], 'a page with no file is left out');
    assert.deepEqual(framedPages(root, { keys: ['basket'] }), [], 'with keys: those screens only, and no component');
    assert.deepEqual(framedPages(root, { keys: ['pay', 'basket'] }).map((p) => p.key), ['pay']);

    // A shared sheet of the surface with a query that has no container form frames every page that links it.
    writeFileSync(join(surfaceDir(root), 'components.css'), '@media not all and (min-width: 700px) { .button { color: red } }\n');
    const shared = framedPages(root);
    assert.ok(shared.some((p) => p.key === 'basket' && /^a media query has no container form/.test(p.reasons[0])), JSON.stringify(shared));

    const lines = framedLines(all);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'note: 1 screen and 1 component page are drawn in a frame on the canvas: pay (it has a script of its own), button (it has an inline event handler that is more than a change of a class or an attribute)');
    assert.match(lines[1], /_surface\.md/);
    assert.match(lines[1], /a frame blocks no approval/);
    assert.match(lines[1], /a class, a data value or a state attribute/);
    assert.match(framedLines([all[0]])[0], /^note: 1 screen is drawn in a frame/);
    const many = Array.from({ length: 10 }, (_, i) => ({ kind: 'screen', key: `s${i}`, reasons: ['it has a script of its own'] }));
    assert.match(framedLines(many)[0], /^note: 10 screens are drawn .* s7 \(it has a script of its own\), and 2 more$/);
  } finally { done(); }
});

test('the frame failures of the screens: one for each reason, with what to change; a page of handlers in the forms of the canvas has none', () => {
  const { root, done } = repo();
  try {
    initSurface(root);
    for (const key of ['basket', 'pay', 'tabs']) addScreen(root, key, { title: key, workflow: 'w1' });
    const add = (key, markup) => writeFileSync(screenFile(root, key), readFileSync(screenFile(root, key), 'utf8').replace('</body>', `${markup}</body>`));
    add('pay', '<script>document.querySelectorAll("[data-v]").forEach((b) => { b.onclick = () => b.classList.toggle("on"); })</script><a href="javascript:void 0">x</a>');
    // The same clicks as inline handlers of the forms that the canvas does itself.
    add('tabs', `<div data-fam data-view="list"><button data-v="table" onclick="this.closest('[data-fam]').dataset.view = this.dataset.v; this.parentElement.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); this.classList.add('on')">Table</button>`
      + `<button onclick="this.parentElement.querySelector('.menu').toggleAttribute('hidden'); this.setAttribute('aria-expanded', 'true')">Menu</button><div class="menu" hidden></div></div>`);
    assert.deepEqual(frameFailures(root, ['basket', 'tabs']), []);
    assert.deepEqual(frameFailures(root, []), [], 'no key, no page read');
    const found = frameFailures(root, ['basket', 'pay', 'tabs']);
    assert.deepEqual(found.map((x) => [x.screen, x.check, x.message]), [
      ['pay', 'frame', 'The canvas draws the page in a frame: it has a script of its own'],
      ['pay', 'frame', 'The canvas draws the page in a frame: it has a javascript: address'],
    ]);
    assert.match(found[0].do, /^Move each click that the script wires to an inline handler .*delete the script\./);
    assert.match(found[0].do, /system-migrate\.md \("Pages off the frame"\).*does not block the approval\.$/);
    assert.match(found[1].do, /^Make the link a link to <key>\.html/);
  } finally { done(); }
});

test('each reason of a frame has its own fix, and an unknown reason names the rules', () => {
  const reasons = ['it has a script of its own', 'it loads a script file', 'it has an inline event handler that is more than a change of a class or an attribute', 'it has a javascript: address', 'it has a base element', 'a media query has no container form: not all and (min-width: 700px)'];
  const fixes = reasons.map(frameFix);
  assert.equal(new Set(fixes).size, reasons.length);
  for (const fix of fixes) assert.match(fix, /system-migrate\.md/);
  assert.match(frameFix('something new'), /^Keep to the rules of design\/_surface\.md/);
  // Each reason that the canvas gives has a fix of its own.
  const M = mountLogic();
  for (const r of M.mountProblems('<base href="/"><script src="a.js"></script><script>go()</script><a href="javascript:x()" onclick="go()">x</a>')) assert.doesNotMatch(frameFix(r), /^Keep to the rules/, r);
});

test('each handler that the references give as an example is one that the canvas does itself', () => {
  const M = mountLogic();
  const dir = fileURLToPath(new URL('../../../skills/wf/reference/design/', import.meta.url));
  for (const [name, least] of [['_surface.md', 4], ['system-migrate.md', 4]]) {
    const found = [...readFileSync(join(dir, name), 'utf8').matchAll(/onclick="([^"`]+)"/g)].map((m) => m[1]).filter((h) => h !== '...');
    assert.ok(found.length >= least, `${name} gives ${found.length} handlers`);
    for (const h of found) assert.ok(M.parseHandler(h), `${name}: ${h}`);
  }
  // The step of the migration names each reason that the canvas gives.
  const step = readFileSync(join(dir, 'system-migrate.md'), 'utf8').split('## Step 5 — Pages off the frame')[1].split('\n## ')[0];
  for (const r of M.mountProblems('<base href="/"><script src="a.js"></script><script>go()</script><a href="javascript:x()" onclick="go()">x</a>')) assert.ok(step.includes(`\`${r}\``), r);
  assert.ok(step.includes('`a media query has no container form`'));
});

test('the facts of a page and the reasons of a sheet give the reasons of the page, part by part', () => {
  const L = mountLogic();
  const bad = '@media not screen and (max-width: 500px) { .b { color: red } }';
  const html = '<link rel="stylesheet" href="../shared.css"><link rel="stylesheet" media="print" href="../print.css"><link rel="icon" href="../icon.css"><style>@media not all and (min-width: 600px) { .a { color: red } }</style>';
  const facts = pageFacts(html, L);
  assert.deepEqual(facts.sheets, [{ href: '../shared.css', media: null }, { href: '../print.css', media: 'print' }], 'the sheets that the page links, with the media of each tag');
  assert.equal(facts.reasons.length, 1, 'the inline style');
  assert.deepEqual(sheetReasons('.b { color: red }', null, L), []);
  assert.equal(sheetReasons(bad, null, L).length, 1);
  const sheet = (href) => (href === '../shared.css' ? bad : null);
  assert.deepEqual(pageReasons(html, { sheet }), [...facts.reasons, ...sheetReasons(bad, null, L)]);
  // A caller that kept the reasons of each sheet gives them in place of the text.
  const asked = [];
  assert.deepEqual(pageReasons(html, { sheetWhy: (href, media) => { asked.push([href, media]); return href === '../shared.css' ? sheetReasons(bad, media, L) : null; } }), pageReasons(html, { sheet }));
  assert.deepEqual(asked, [['../shared.css', null], ['../print.css', 'print']]);
  // With `first`, a page that its own text frames is read no further.
  assert.deepEqual(pageFacts(`<script>fetch("/x")</script>${html}`, L, { first: true }), { reasons: ['it has a script of its own'], sheets: [] });
  assert.deepEqual(pageFacts(html, L, { first: true }), facts, 'a page with no reason of its own is read to its end');
});

test('a sheet of the surface is a file inside it; an address of the network or a path that leaves it is none', () => {
  const dir = join('top', '.ai', 'design');
  const page = join(dir, 'screens', 'pay.html');
  assert.equal(sheetFileOf(dir, page, '../tokens.css?v=2#x'), resolve(dir, 'tokens.css'));
  assert.equal(sheetFileOf(dir, page, 'pay/own.css'), resolve(dir, 'screens', 'pay', 'own.css'));
  for (const href of ['https://cdn.example/x.css', '//cdn.example/x.css', '../../outside.css', 'data:text/css,a{}']) assert.equal(sheetFileOf(dir, page, href), null, href);
});
