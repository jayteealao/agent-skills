// A commit message is a conventional commit about the product: `<type>: <what the change does>`.
// The slug and the slice are internal work names, so no commit template of a card or a lib file
// names them. One commit rule lives in _workflow-rules.md, and the copies cite it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const refRoot = path.join(pluginRoot, 'skills', 'wf', 'reference');
const libRoot = path.join(pluginRoot, 'lib');

const TYPES = 'feat|fix|chore|refactor|test|docs|perf|build|ci|style|poc';
// A backticked conventional-commit template in a card: `fix(<slug>): …`, `feat: …`.
const CARD_TEMPLATE = new RegExp('`((?:' + TYPES + ')(?:\\([^)`]*\\))?!?: [^`]*)`', 'g');
// A conventional-commit template literal in a lib file whose scope is an interpolation.
const LIB_TEMPLATE = new RegExp('\\b(?:' + TYPES + ')\\(\\$\\{[^}]*\\}\\)!?:', 'g');
const WORK_NAMES = /<slug>|<slice[^>]*>|\{slug\}|<source-slug>/;

// Cards whose commit templates belong to another change of the handoff cards.
function files(dir, ext) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p, ext);
    return e.name.endsWith(ext) ? [p] : [];
  });
}

export function cardTemplateMisses(text) {
  return [...text.matchAll(CARD_TEMPLATE)].map((m) => m[1]).filter((t) => WORK_NAMES.test(t));
}

test('the finder sees a work name in a card template and passes a product template', () => {
  assert.deepEqual(cardTemplateMisses('Commit `fix(<slug>): review fixes for <slice-slug>`.'), ['fix(<slug>): review fixes for <slice-slug>']);
  assert.deepEqual(cardTemplateMisses('commits `poc(<slug>): accept <component>`'), ['poc(<slug>): accept <component>']);
  assert.deepEqual(cardTemplateMisses('Commit as `<type>: <what the change does>`, e.g. `feat: show the alert`.'), []);
  assert.deepEqual(cardTemplateMisses('as `chore(ship-plan): build outputs, plan v<N>`'), []);
});

test('no commit template of a card names the slug or the slice', () => {
  const misses = files(refRoot, '.md')
    .map((f) => [path.relative(refRoot, f).split(path.sep).join('/'), f])
    .flatMap(([rel, f]) => cardTemplateMisses(readFileSync(f, 'utf8')).map((t) => `${rel}: ${t}`));
  assert.deepEqual(misses, []);
});

test('no lib file builds a conventional commit with an interpolated scope', () => {
  const misses = files(libRoot, '.mjs')
    .flatMap((f) => (readFileSync(f, 'utf8').match(LIB_TEMPLATE) || []).map((t) => `${path.basename(f)}: ${t}`));
  assert.deepEqual(misses, []);
});

test('_workflow-rules.md owns the stage-by-path commit rule, and the copies cite it', () => {
  const rules = readFileSync(path.join(refRoot, '_workflow-rules.md'), 'utf8');
  assert.match(rules, /\*\*Stage each file by its path when you commit\.\*\*/);
  assert.match(rules, /Fail closed: do not stage it, and ask the person/);
  assert.match(rules, /Never run `git add -A`, `git add \.`, `git commit -a` or a `git add` with no path/);
  assert.match(rules, /`<type>: <what the change does>`/);
  for (const rel of ['implement.md', 'intake/small.md', 'implement/_reviews-mode.md', 'prototype.md', '_fix-loop.md', 'implement/_steps.md']) {
    const text = readFileSync(path.join(refRoot, rel), 'utf8');
    assert.match(text, /the commit rule of \[(?:\.\.\/)?_workflow-rules\.md\]/, rel);
  }
});
