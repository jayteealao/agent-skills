// scripts/lint-drift.mjs: the tree has no drift, and each check finds the drift it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkForm, formsIn, hasStep, headingSlugs, lintDrift } from '../../scripts/lint-drift.mjs';
import { loadRegistry } from '../../lib/registry.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = loadRegistry(pluginRoot);

test('the tree has no drift', () => {
  assert.deepEqual(lintDrift(pluginRoot).map((f) => `${f.check} ${f.file}:${f.line} ${f.message}`), []);
});

test('forms: a written form fits a form of its key, or the linter says why', () => {
  assert.equal(checkForm(reg, 'implement <slug> <slice> reviews'), null);
  assert.equal(checkForm(reg, 'retro <slug> deep'), null);
  assert.equal(checkForm(reg, 'loop goal'), null, 'a sub-key on its own names it');
  assert.equal(checkForm(reg, 'intake fix <description>'), null);
  assert.equal(checkForm(reg, 'keep going on export'), null, 'plain words go to the router');
  assert.match(checkForm(reg, 'brainstorm <topic>'), /`brainstorm` is not a key/);
  assert.match(checkForm(reg, 'implemnt <slug>'), /near `implement`/);
  assert.match(checkForm(reg, 'retro <slug> shallow'), /fits no form of `retro`/);
  assert.equal(checkForm(reg, 'verify is the one writer', { keyOnly: true }), null);
});

test('formsIn reads backticked forms and the lines of a code block', () => {
  const text = 'Run `/wf plan <slug>` first.\n\n```\n/wf verify <slug>          → 06-verify.md\n```\n';
  assert.deepEqual(formsIn(text).map((f) => f.form), ['plan <slug>', 'verify <slug>']);
});

test('links: heading slugs and Step pointers', () => {
  const slugs = headingSlugs('# Step 0 — Dispatch check\n## The `x` table\n## The `x` table\n');
  assert.ok(slugs.has('step-0--dispatch-check'));
  assert.ok(slugs.has('the-x-table') && slugs.has('the-x-table-1'));
  const text = '# Step 0 — Orient\n1. a\n3. b\n## Steps 11–14 — Index\n7.5. **Apply the gate**\n# Gate (Step 9)\n';
  for (const s of ['0', '0.3', '12', '7.5', '9']) assert.ok(hasStep(text, s), `Step ${s}`);
  for (const s of ['1', '0.4', '7.6', '15']) assert.ok(!hasStep(text, s), `no Step ${s}`);
});
