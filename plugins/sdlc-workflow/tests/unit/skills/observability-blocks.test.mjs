// Observability init asks one decision per contract block. The decision letter must be the block
// letter of the contract template, because build and audit read the blocks by letter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const obs = path.join(pluginRoot, 'skills', 'wf', 'reference', 'observability');
const init = readFileSync(path.join(obs, 'init.md'), 'utf8');
const artifact = readFileSync(path.join(obs, 'init', '_artifact.md'), 'utf8');

const words = (s) => s.toLowerCase().match(/[a-z]+/g) || [];
const blocks = new Map([...artifact.matchAll(/^# Block ([A-H]) — (.+)$/gm)].map((m) => [m[1], m[2]]));
const decisions = new Map([...init.matchAll(/^## Decision ([A-Z]) — (.+)$/gm)].map((m) => [m[1], m[2]]));

const expected = {
  A: 'schema', B: 'emit', C: 'redaction', D: 'sampling',
  E: 'pipeline', F: 'backend', G: 'dashboards', H: 'provisioning',
};

test('the contract template has blocks A to H', () => {
  assert.deepEqual([...blocks.keys()], Object.keys(expected));
  for (const [letter, word] of Object.entries(expected)) {
    assert.ok(words(blocks.get(letter)).includes(word), `Block ${letter} is ${word}`);
  }
});

test('each init decision letter names the block of the same letter', () => {
  assert.deepEqual([...decisions.keys()], Object.keys(expected));
  for (const [letter, word] of Object.entries(expected)) {
    assert.ok(words(decisions.get(letter)).includes(word), `Decision ${letter} is ${word}: ${decisions.get(letter)}`);
  }
});

test('client and edge stays an optional decision with no letter', () => {
  assert.match(init, /^## Client \/ edge scope \(optional, no block letter\)$/m);
  assert.doesNotMatch(init, /^## Decision [A-Z] — Client/m);
});
