// The key and page rules of `wf.mjs design migrate`: board keys to screen keys, the screen meta
// tags, and the links that break when a board page moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { keyMap, legacyPage, relativeLinks, screenFromBoard, screenKeyOf, viewportPage } from '../../../lib/design-migrate.mjs';
import { approvedByAnswer } from '../../../lib/design-lane.mjs';

test('a board key becomes a screen key: one dash, the default state and the viewport left out', () => {
  assert.equal(screenKeyOf('home--default'), 'home');
  assert.equal(screenKeyOf('home--error'), 'home-error');
  assert.equal(screenKeyOf('home--default--phone'), 'home');
  assert.equal(screenKeyOf('chat--live-dark--tablet'), 'chat-live-dark');
  assert.equal(screenKeyOf('not a key'), null);
});

test('the boards of one surface and state share a screen; a clash or a key of another workflow gets a longer key', () => {
  assert.deepEqual(keyMap(['home--default', 'home--error', 'home--default'], 'w1'), { 'home--default': 'home', 'home--error': 'home-error' });
  assert.deepEqual(keyMap(['chat--live--desktop', 'chat--live--phone', 'chat--queued--phone'], 'w1'),
    { 'chat--live--desktop': 'chat-live', 'chat--live--phone': 'chat-live', 'chat--queued--phone': 'chat-queued' });
  // home-error--default and home--error both give home-error.
  assert.deepEqual(keyMap(['home--error', 'home-error--default'], 'w1'), { 'home--error': 'home-error', 'home-error--default': 'home-error-default' });
  const taken = new Map([['home', ['w0']], ['cart', ['w1']]]);
  assert.deepEqual(keyMap(['home--default', 'cart--default'], 'w1', taken), { 'cart--default': 'cart', 'home--default': 'home-default' });
});

test('the screen page of several viewports opens the page nearest to its width, with the query string', () => {
  const page = viewportPage('chat-live', 'Chat', 'w1/design/r1/boards.json', [{ name: 'phone', width: 390 }, { name: 'desktop', width: 1440 }]);
  assert.match(page, /<meta name="wf:screen" content="chat-live">/);
  assert.match(page, /"href":"chat-live\/phone\.html"/);
  assert.match(page, /location\.replace\(best\.href \+ location\.search\)/);
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
