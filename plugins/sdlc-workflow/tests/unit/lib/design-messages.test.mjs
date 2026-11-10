// The design canvas and the page templates it frames trust a message only from their own origin:
// each `message` listener checks `event.origin === location.origin`, and each `postMessage`
// sends to `location.origin`, never to `*`.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual } from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCES = [
  'skills/wf/canvas/canvas.js',
  'skills/wf/canvas/index.html',
  'lib/design-surface.mjs',
  'lib/design-migrate.mjs',
  'lib/design-state.mjs',
  'lib/design-boards.mjs',
  'lib/brainstorm-page.mjs',
];

/** The text of the call that opens at `from` (its `(`), up to the matching `)`. */
function callText(text, from) {
  let depth = 0;
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')' && --depth === 0) return text.slice(from + 1, i);
  }
  return text.slice(from + 1);
}

/** Each place in `text` that breaks the rule. */
function messageProblems(text) {
  const problems = [];
  for (const m of text.matchAll(/\bpostMessage\s*\(/g)) {
    if (/parentPort\.\s*$/.test(text.slice(Math.max(0, m.index - 12), m.index))) continue; // a worker thread, not a frame
    const args = callText(text, m.index + m[0].length - 1);
    if (!/,\s*(?:window\.)?location\.origin\s*(?:,[^,]*)?$/.test(args.trim())) problems.push(`postMessage(${args.trim()}) does not send to location.origin`);
  }
  const listeners = /addEventListener\(\s*['"`]message['"`]|\bonmessage\s*[=:]|\bon\s*\(\s*['"`]message['"`]/g;
  for (const m of text.matchAll(listeners)) {
    const body = text.slice(m.index, m.index + 400);
    if (!/\.origin\s*(?:!==|===)\s*(?:window\.)?location\.origin|(?:window\.)?location\.origin\s*(?:!==|===)\s*\w+\.origin/.test(body)) {
      problems.push(`a message listener at offset ${m.index} does not check event.origin against location.origin`);
    }
  }
  return problems;
}

test('the scan finds a wildcard target and an unchecked listener, and passes a checked pair', () => {
  deepEqual(messageProblems("parent.postMessage({ a: 1 }, '*');").length, 1);
  deepEqual(messageProblems("window.addEventListener('message', (e) => { use(e.data); });").length, 1);
  deepEqual(messageProblems("parent.postMessage({ a: 1 }, location.origin);\nwindow.addEventListener('message', (e) => { if (e.origin !== location.origin) return; use(e.data); });"), []);
});

test('the canvas and the page templates send and accept messages of their own origin only', () => {
  for (const rel of SOURCES) deepEqual(messageProblems(readFileSync(join(ROOT, rel), 'utf8')), [], rel);
});
