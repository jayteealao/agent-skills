// WF-PROTOTYPE-PLAN W4 — the guard tests of /wf loop prototype, red first:
//   - the person starts every round: auto, yolo, goal and campaign refuse a prototype slug;
//   - a commit happens only on a decide round, through the script, by explicit path;
//   - no write lands outside the worktree; the report reads with scripts off.
// The script behaviour is in prototype-cli.test.mjs; this file pins the prose and the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NOT_DRIVEN } from '../../../lib/lifecycle-done.mjs';
import { PIECE_FORMS } from '../../../lib/pieces.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(pluginRoot, rel), 'utf8');
const REF = 'skills/wf/reference';

test('each of the four drivers refuses a prototype slug', () => {
  assert.match(read(`${REF}/auto.md`), /`workflow-type: prototype`[^\n]*a driver runs none[^\n]*PAUSE/);
  assert.match(read(`${REF}/yolo.md`), /`prototype` \(the person starts every round; route `\/wf loop prototype <slug> <request>`\)/);
  assert.match(read('skills/wf/workflows/yolo.js'), /5b2\. PROTOTYPE — workflow-type 'prototype'[^]*yolo drives NOTHING here/);
  assert.ok(NOT_DRIVEN.prototype, 'goal: lifecycle-done refuses a prototype');
  assert.ok(!PIECE_FORMS.includes('prototype'), 'campaign: no piece can start a prototype');
});

test('the key reference: person-only rounds, one round per run, decide-only commits, the worktree rule', () => {
  const ref = read(`${REF}/prototype.md`);
  assert.match(ref, /You run one round, return, and end the run\. You never start the next round\./);
  assert.match(ref, /Only the person's words start a round/);
  assert.match(ref, /`auto`, `yolo`, `goal` and `campaign` refuse a prototype slug/);
  assert.match(ref, /Only a decide round makes a commit, through the prototype script/);
  assert.match(ref, /CAUTION: do not stage with `git add -A` in the worktree/);
  assert.match(ref, /Do not write to a temp folder or to the main checkout/);
  assert.match(ref, /refuses a page over 1 MB, a page with a script, and a page that loads an external resource/);
  assert.match(ref, /WARNING: before you remove a worktree, look for `node_modules` junctions/);
  assert.match(ref, /Only the person ends a prototype/);
  assert.doesNotMatch(ref, /\bSTOP\b/, 'the stop sentences are inventoried; the key ends the run instead');
});

test('the dispatcher, the picker, and the host contract name the key', () => {
  const skill = read('skills/wf/SKILL.md');
  assert.match(skill, /one of the 19 keys/);
  assert.match(skill, /^\| `loop` \| .*`prototype text` · `prototype <slug>\\\|<branch> \[text\]`/m);
  assert.match(skill, /the reference is `reference\/route\.md` with every token, reason `not a key`/);
  assert.match(skill, /^\| `loop goal`, `loop optimize`, `loop prototype` \|/m);
  assert.match(read('hooks/mod/catalog.ts'), /key: 'loop prototype'/);
  assert.match(read(`${REF}/_host-surfaces.md`), /\| Published page \(brainstorm, prototype\) \|/);
  assert.equal(JSON.parse(read('docs/internal/surface-policy.json')).keys, 19);
});

test('status, recap and close find a prototype in its worktree', () => {
  assert.match(read(`${REF}/status.md`), /Keep a `prototype` row whose `branch` has a worktree in `git worktree list`/);
  assert.match(read(`${REF}/status.md`), /one from `prototype\.mjs status` for a prototype slug/);
  assert.match(read(`${REF}/recap.md`), /A `prototype` row of `INDEX\.md` is a slug too/);
  assert.match(read(`${REF}/intake/close.md`), /Run `prototype\.mjs exit <slug> close` first/);
});

test('the schema knows the prototype: the workflow type, the person document, and the ledger', () => {
  const schema = JSON.parse(read('schemas/frontmatter.schema.json'));
  assert.ok(schema.$defs.prototypeLedger);
  assert.ok(schema.$defs.prototypeFrontmatter);
  assert.ok(JSON.stringify(schema).includes('"optimize", "prototype"') || JSON.stringify(schema).includes('"optimize","prototype"'));
});
