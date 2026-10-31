// A card stages each file by its path. A sweep (`git commit -a`, `git add -A`, `git add .`) takes
// the uncommitted work of other sessions into the commit. A CI template is exempt: its runner owns
// a fresh checkout, so the cards keep those forms inside fenced YAML blocks only. A sentence that
// forbids a sweep ("never `git add -A`") is not a use of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const refRoot = path.join(pluginRoot, 'skills', 'wf', 'reference');

const SWEEPS = [
  ['commit -a', /\bgit\s+commit\s+(?:-[b-zA-Z]+\s+)*-[a-zA-Z]*a[a-zA-Z]*\b/],
  ['add -A', /\bgit\s+add\s+(?:-[a-zA-Z]+\s+)*(?:-A\b|--all\b)/],
  ['add .', /\bgit\s+add\s+(?:-[a-zA-Z]+\s+)*\.(?=$|[\s`"'),;])/],
];
const FORBIDS = /\b(?:never|not|no|don't|forbid\w*)\b/i;

function cards(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return cards(p);
    return e.name.endsWith('.md') ? [p] : [];
  });
}

/** The lines of a card outside fenced YAML blocks, each with its line number. */
function linesOutsideYaml(text) {
  const out = [];
  let fence = null;
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s*(`{3,}|~{3,})\s*([\w-]*)/);
    if (m && !fence) { fence = { mark: m[1], yaml: /^ya?ml$/i.test(m[2]) }; return; }
    if (m && fence && line.trim().startsWith(fence.mark) && !m[2]) { fence = null; return; }
    if (!fence?.yaml) out.push([i + 1, line]);
  });
  return out;
}

export function sweepsIn(text) {
  const hits = [];
  for (const [n, line] of linesOutsideYaml(text)) {
    for (const sentence of line.split(/(?<=[.!?])\s+/)) {
      for (const [name, re] of SWEEPS) {
        if (re.test(sentence) && !FORBIDS.test(sentence)) hits.push(`${n}: ${name}`);
      }
    }
  }
  return hits;
}

test('the sweep finder sees each form and leaves CI YAML and prohibitions alone', () => {
  assert.deepEqual(sweepsIn('commit `git commit -am "x"`'), ['1: commit -a']);
  assert.deepEqual(sweepsIn('run `git commit -a -m "x"`'), ['1: commit -a']);
  assert.deepEqual(sweepsIn('run `git add -A && git commit -m x`'), ['1: add -A']);
  assert.deepEqual(sweepsIn('run `git add .`'), ['1: add .']);
  assert.deepEqual(sweepsIn('run `git add -- a.txt` and `git commit -m "x"`'), []);
  assert.deepEqual(sweepsIn('run `git add .gitignore` and `git commit --amend`'), []);
  assert.deepEqual(sweepsIn('Never run `git add -A`.'), []);
  assert.deepEqual(sweepsIn('Stage by path (`git add -A` is forbidden). Then run `git add .`.'), ['1: add .']);
  assert.deepEqual(sweepsIn('```yaml\n- run: git add -A\n```'), []);
  assert.deepEqual(sweepsIn('```bash\ngit add -A\n```'), ['2: add -A']);
});

test('no card under reference/ stages by a sweep, outside CI YAML templates', () => {
  const found = cards(refRoot)
    .map((f) => [path.relative(refRoot, f).split(path.sep).join('/'), sweepsIn(readFileSync(f, 'utf8'))])
    .filter(([, hits]) => hits.length)
    .map(([f, hits]) => `${f} (${hits.join(', ')})`);
  assert.deepEqual(found, [], `stage each file by its path, git add -- <path>:\n${found.join('\n')}`);
});

test('the ship card stages the files of each release commit by path', () => {
  const ship = readFileSync(path.join(refRoot, 'ship.md'), 'utf8');
  assert.equal((ship.match(/git add -- </g) ?? []).length, 3);
  assert.match(ship, /git commit -m "build: bump version to <version>"/);
  assert.match(ship, /git commit -m "docs: update changelog for <version>"/);
  assert.match(ship, /git commit -m "build: bump to <next-dev-version>"/);
});
