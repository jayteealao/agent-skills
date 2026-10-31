// The intake mode cards share four rules: slug-mode, the new slug, the decision closure and the
// routing contrasts. Each test pins the owner, a citation in each card, and the absence of the old copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF = path.join(pluginRoot, 'skills', 'wf', 'reference');
const ref = (...p) => readFileSync(path.join(REF, ...p), 'utf8');
const intakeCards = () => readdirSync(path.join(REF, 'intake')).filter((n) => n.endsWith('.md') && !n.startsWith('_'));

const SLUG_MODES = ['fix', 'hotfix', 'refactor', 'rca', 'update-deps', 'investigate', 'discover', 'ideate', 'brainstorm', 'audit', 'task', 'simplify'];

test('slug-mode has one owner with one trigger and one origin form; each mode card cites it in one line', () => {
  const owner = ref('_compressed-slice.md');
  assert.match(owner, /^## The trigger and the mode cards$/m);
  assert.match(owner, /record get "<root>" <slug> index` exits 0/);
  assert.match(owner, /origin: intake\/<op>/);
  assert.doesNotMatch(owner, /origin: wf\//);
  for (const mode of SLUG_MODES) {
    const card = ref('intake', `${mode}.md`);
    const block = card.slice(card.indexOf('# Slug-mode\n'), card.indexOf('\n# ', card.indexOf('# Slug-mode\n') + 1));
    assert.ok(block.startsWith('# Slug-mode'), `${mode} has a slug-mode section`);
    assert.match(block, new RegExp(`follow \\[_compressed-slice\\.md\\]\\(\\.\\./_compressed-slice\\.md\\) with \`<op>\` = \`${mode}\``), `${mode} cites the owner`);
    assert.doesNotMatch(block, /origin:|compressed: true|INDEX\.md/, `${mode} keeps no copy of the contract`);
  }
});

test('a new slug has one owner: the derive form, the reserved check and one collision rule per class', () => {
  const owner = ref('intake', '_intake-context.md');
  assert.match(owner, /^# New slug$/m);
  for (const step of ['**Derive.**', '**Reserved check.**', '**Collision.**']) assert.ok(owner.includes(step), step);
  for (const cls of ['| Default |', '| Work packet |', '| Typed |', '| Dated |']) assert.ok(owner.includes(cls), cls);
  for (const name of intakeCards()) {
    const card = ref('intake', name);
    assert.doesNotMatch(card, /already exists with type/, `${name} keeps no copy of the collision warning`);
    assert.doesNotMatch(card, /is a `\/wf` command word/, `${name} keeps no copy of the reserved check`);
  }
  for (const mode of ['fix', 'hotfix', 'refactor', 'rca', 'investigate', 'discover', 'audit', 'task', 'optimize', 'adopt', 'update-deps', 'ideate', 'brainstorm', 'simplify', 'default']) {
    assert.match(ref('intake', `${mode}.md`), /"New slug" of \[_intake-context\.md\]\(_intake-context\.md\)/, `${mode} cites the owner`);
  }
});

test('the decision closure has one owner with one time key; investigate, rca and ideate cite it', () => {
  const owner = ref('intake', '_light-index.md');
  assert.match(owner, /^## Closure$/m);
  assert.match(owner, /`chosen-at=<timestamp>`/);
  for (const mode of ['investigate', 'rca', 'ideate']) {
    const card = ref('intake', `${mode}.md`);
    assert.match(card, /"Closure" of \[_light-index\.md\]\(_light-index\.md\) with the `\w+` row/, `${mode} cites the owner`);
    assert.doesNotMatch(card, /routed-at|user picked without a stated reason/, `${mode} keeps no copy of the closure`);
  }
});

test('the routing contrasts of the intake modes live in the router; each card keeps at most two rule lines', () => {
  assert.match(ref('route.md'), /^## Not this mode$/m);
  for (const name of intakeCards()) {
    const card = ref('intake', name);
    const at = card.search(/^# What this (?:command|mode) is NOT$/m);
    if (at < 0) continue;
    const end = card.indexOf('\n# ', at + 1);
    const lines = card.slice(at, end < 0 ? card.length : end).split(/\r?\n/).filter((l) => l.startsWith('- '));
    assert.ok(lines.length >= 1 && lines.length <= 2, `${name} keeps one or two rule lines (has ${lines.length})`);
  }
});
