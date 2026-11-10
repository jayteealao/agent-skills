// Small guards of the design surface: the token roles of DESIGN.md, the place of DESIGN.md, a
// path that is a scheme, the placeholders of a component template, the network test of a
// brainstorm page, the DevTools calls of a browser that dies, and the canvas code that keeps a
// dragged card and catches up after a reconnect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokensFromDesign, writeTokens } from '../../../lib/design-surface.mjs';
import { isInsidePath, safeHref } from '../../../lib/design-boards.mjs';
import { expand } from '../../../components/_components.mjs';
import { pageProblems } from '../../../lib/brainstorm-page.mjs';
import { Cdp } from '../../../lib/design-check.mjs';
import { DESIGN_USAGE } from '../../../lib/design-cli.mjs';

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const COLORS = (table) => `# Design\n\n## Colors\n\n${table}\n`;

test('a color table with another header gives no token of its header row', () => {
  const rows = tokensFromDesign(COLORS('| Name | Token | Value |\n|---|---|---|\n| ground | --paper | #fff |'));
  assert.deepEqual(rows, [{ role: 'ground', token: '--paper', value: '#fff' }]);
});

test('a Role cell with several names is skipped, and the skip is named', () => {
  const rows = tokensFromDesign(COLORS('| Role | Token | Value |\n|---|---|---|\n| ground | | #fff |\n| error, warning, success, info | | #f00 |'));
  assert.deepEqual(rows.map((r) => r.role), ['ground']);
  assert.deepEqual(rows.skipped, ['error, warning, success, info']);
});

test('the tokens come from DESIGN.md at the root, then .agents/context/, then docs/', () => {
  const root = mkdtempSync(join(tmpdir(), 'design-md-'));
  try {
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs', 'DESIGN.md'), COLORS('| Role | Token | Value |\n|---|---|---|\n| accent | | #1a73e8 |'));
    let rows = writeTokens(root);
    assert.deepEqual([rows.length, rows.file], [1, join(root, 'docs', 'DESIGN.md')]);
    assert.match(readFileSync(join(root, '.ai', 'design', 'tokens.css'), 'utf8'), /--accent: #1a73e8;/);
    writeFileSync(join(root, 'DESIGN.md'), COLORS('| Role | Token | Value |\n|---|---|---|\n| ground | | #fff |\n| text | | #111 |'));
    rows = writeTokens(root);
    assert.deepEqual([rows.length, rows.file], [2, join(root, 'DESIGN.md')], 'the root wins');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a path with a scheme is never inside the folder, so its link is dead', () => {
  for (const p of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'C:/x.png']) {
    assert.equal(isInsidePath(p), false, p);
    assert.equal(safeHref(p), '#', p);
  }
  assert.equal(isInsidePath('boards/a.png'), true);
});

test('a value that holds a placeholder stays text in a component template', () => {
  const html = expand('<!-- @include explainer/steps {"steps": [{"label": "Set {{aria}} and {{title}} and {{{title}}} in the template"}], "title": "T"} -->', { componentsRoot: join(pluginRoot, 'components') });
  assert.match(html, /Set \{\{aria\}\} and \{\{title\}\} and \{\{\{title\}\}\} in the template/);
});

test('a brainstorm page that loads from the network in any way is refused', () => {
  const base = '<title>x</title><meta name="viewport" content="width=device-width"><style>@media (prefers-color-scheme: dark){}</style>';
  for (const bad of ['<style>@import "https://x.test/a.css";</style>', '<div style="background:url(https://x.test/a.png)"></div>', '<img srcset="a.png 1x">', '<script>fetch("/x")</script>']) {
    assert.ok(pageProblems(base + bad, '/nowhere').some((p) => /loads a file from the network/.test(p)), bad);
  }
  assert.ok(!pageProblems(base, '/nowhere').some((p) => /network/.test(p)));
});

/** A socket that a test closes, or that never answers. */
function fakeSocket() {
  const listeners = {};
  return {
    sent: [],
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    send(text) { this.sent.push(JSON.parse(text)); },
    emit(type, e = {}) { for (const fn of listeners[type] ?? []) fn(e); },
  };
}

test('a browser that closes ends every DevTools call that waits, and a call with no answer times out', async () => {
  const ws = fakeSocket();
  const cdp = new Cdp(ws);
  const pending = cdp.send('Page.navigate', { url: 'about:blank' });
  ws.emit('close');
  await assert.rejects(pending, /the browser closed/);
  const silent = cdp.send('Runtime.evaluate', {}, undefined, 50);
  await assert.rejects(silent, /no answer to Runtime\.evaluate in 50 ms/);
  const answered = cdp.send('DOM.enable');
  ws.emit('message', { data: JSON.stringify({ id: ws.sent.at(-1).id, result: { ok: 1 } }) });
  assert.deepEqual(await answered, { ok: 1 });
});

test('the server usage names the port of start and the root of url', () => {
  assert.match(DESIGN_USAGE, /server start \[--port n\]\|stop\|status/);
  assert.match(DESIGN_USAGE, /server url \[<root>\]/);
});

test('the canvas saves a dragged place before a waiting change, and catches up after a reconnect', () => {
  const canvas = readFileSync(join(pluginRoot, 'skills', 'wf', 'canvas', 'canvas.js'), 'utf8');
  const up = canvas.slice(canvas.indexOf('const up = async (ev) => {'), canvas.indexOf('card.addEventListener(\'pointermove\', move);'));
  assert.ok(up.length > 0, 'the end of a drag is found');
  assert.ok(up.indexOf('moved.set(s.key, s.position)') < up.indexOf('await saveLayout('), 'the place is kept first');
  assert.ok(up.indexOf('await saveLayout(') < up.indexOf('applyChange(pending)'), 'the waiting change loads after the save');
  assert.match(up, /if \(!card\.dragging\) \{ if \(ev\.type === 'pointerup'\) openScreen\(card\.dataset\.key\); return; \}/, 'a press that did not move opens the screen and saves no place');
  assert.match(canvas, /if \(moved\.has\(sc\.key\)\) sc\.position = moved\.get\(sc\.key\);/, 'a new state keeps a place that is not saved yet');
  assert.match(canvas, /es\.addEventListener\('hello', \(e\) => \{/);
  // A new server reloads the canvas only when no draft and no drag would be lost.
  assert.match(canvas, /if \(drafts\.any\(\) \|\| ui\.dragging\) notice\('restart'[^\n]*\n\s*else \{ location\.reload\(\); return; \}/);
  // A stream that opens again reads the state and reloads what differs, not every page.
  assert.match(canvas, /applyChange\(L\.mergeChange\(pending, \{ catchUp: true, all: false, pages: \[\], parts: \[\] \}\)\)/);
  assert.match(canvas, /r\.link && \/\^https\?:\/i\.test\(r\.link\) \? newTab\(r\.link/, 'only an http link of a reference opens');
});
