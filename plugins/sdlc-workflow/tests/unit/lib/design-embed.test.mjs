// Which pages of a surface the canvas draws in a frame: the list of the CLI, made with the rules
// of the canvas script itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { framedLines, framedPages, mountLogic, pageReasons } from '../../../lib/design-embed.mjs';
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
  assert.equal(mountLogic(), L, 'the script is read once');
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
      { kind: 'component', key: 'button', reasons: ['it has an inline event handler that is more than a class change'] },
    ], 'a page with no file is left out');
    assert.deepEqual(framedPages(root, { keys: ['basket'] }), [], 'with keys: those screens only, and no component');
    assert.deepEqual(framedPages(root, { keys: ['pay', 'basket'] }).map((p) => p.key), ['pay']);

    // A shared sheet of the surface with a query that has no container form frames every page that links it.
    writeFileSync(join(surfaceDir(root), 'components.css'), '@media not all and (min-width: 700px) { .button { color: red } }\n');
    const shared = framedPages(root);
    assert.ok(shared.some((p) => p.key === 'basket' && /^a media query has no container form/.test(p.reasons[0])), JSON.stringify(shared));

    const lines = framedLines(all);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'note: 1 screen and 1 component page are drawn in a frame on the canvas: pay (it has a script of its own), button (it has an inline event handler that is more than a class change)');
    assert.match(lines[1], /_surface\.md/);
    assert.match(framedLines([all[0]])[0], /^note: 1 screen is drawn in a frame/);
    const many = Array.from({ length: 10 }, (_, i) => ({ kind: 'screen', key: `s${i}`, reasons: ['it has a script of its own'] }));
    assert.match(framedLines(many)[0], /^note: 10 screens are drawn .* s7 \(it has a script of its own\), and 2 more$/);
  } finally { done(); }
});
