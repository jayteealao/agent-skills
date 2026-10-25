// The key and page rules of `wf.mjs design migrate`: board keys to screen keys, the screen meta
// tags, and the links that break when a board page moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyMap, legacyPage, relativeLinks, screenFromBoard, screenKeyOf } from '../../../lib/design-migrate.mjs';
import { approvedByAnswer } from '../../../lib/design-lane.mjs';

test('a board key becomes a screen key: one dash, and the default state left out', () => {
  assert.equal(screenKeyOf('home--default'), 'home');
  assert.equal(screenKeyOf('home--error'), 'home-error');
  assert.equal(screenKeyOf('home--default--phone'), 'home-phone');
  assert.equal(screenKeyOf('not a key'), null);
});

test('two boards that give one screen key, and a key of another workflow, get longer keys', () => {
  assert.deepEqual(keyMap(['home--default', 'home--error', 'home--default'], 'w1'), { 'home--default': 'home', 'home--error': 'home-error' });
  // home--default--phone and home-phone--default both give home-phone.
  assert.deepEqual(keyMap(['home--default--phone', 'home-phone--default'], 'w1'), { 'home--default--phone': 'home-default-phone', 'home-phone--default': 'home-phone-default' });
  const taken = new Map([['home', ['w0']], ['cart', ['w1']]]);
  assert.deepEqual(keyMap(['home--default', 'cart--default'], 'w1', taken), { 'cart--default': 'cart', 'home--default': 'home-default' });
});

test('an HTML board gets the screen meta tags in its head, once', () => {
  const page = screenFromBoard('<html><head><title>x</title></head><body>a</body></html>', 'home', 'w1/design/r1/boards/home--default.html');
  assert.match(page, /<head>\n<meta name="wf:screen" content="home">\n<meta name="wf:migrated-from" content="w1\/design\/r1\/boards\/home--default.html">/);
  const again = screenFromBoard(page, 'home', 'w1/design/r2/boards/home--default.html');
  assert.equal(again.match(/wf:screen/g).length, 1);
  assert.match(again, /r2\/boards/);
  assert.match(screenFromBoard('<p>no head</p>', 'k', 'f'), /^<meta name="wf:screen" content="k">/);
});

test('the links that break when the page moves are listed; links that survive are not', () => {
  const html = '<link href="../source/a.css"><img src="img/b.png"><a href="cart.html">c</a><a href="#x">x</a><img src="data:image/png;base64,AA"><a href="https://e.com">e</a><div style="background:url(\'bg.png\')"></div>';
  assert.deepEqual(relativeLinks(html), ['../source/a.css', 'img/b.png', 'bg.png']);
});

test('a legacy frame shows the picture of the board', () => {
  const page = legacyPage('home-error', 'Home <error>', 'w1/design/r1/boards/home--error.png');
  assert.match(page, /<img src="\.\.\/legacy\/home-error\.png" alt="Home &lt;error&gt;">/);
  assert.match(page, /<meta name="wf:legacy"/);
});

test('a migrated contract counts as approved only with its board manifest and the commit', () => {
  assert.equal(approvedByAnswer({ 'direction-confirmed-by': 'migrated', 'migrated-from': 'design/r2/boards.json', 'approval-commit': 'abc' }), true);
  assert.equal(approvedByAnswer({ 'direction-confirmed-by': 'migrated', 'approval-commit': 'abc' }), false);
  assert.equal(approvedByAnswer({ 'direction-confirmed-by': 'migrated', 'migrated-from': 'design/r2/boards.json' }), false);
  assert.equal(approvedByAnswer({ 'direction-confirmed-by': 'in-session', 'approval-commit': 'abc' }), false);
});
