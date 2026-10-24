// WF-PROTOTYPE-PLAN W4 — the guard tests of /wf loop prototype, red first:
//   - the person starts every round: auto, yolo, goal and campaign refuse a prototype slug;
//   - a commit happens only on a decide round, through the script, by explicit path;
//   - no write lands outside the worktree; the report reads with scripts off.
// The script behaviour is in tests/integration/prototype-cli.test.mjs; this file pins the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NOT_DRIVEN } from '../../../lib/lifecycle-done.mjs';
import { PACKET_FORMS } from '../../../lib/packets.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(pluginRoot, rel), 'utf8');
const REF = 'skills/wf/reference';

test('each of the four drivers refuses a prototype slug', () => {
  assert.match(read(`${REF}/auto.md`), /`workflow-type: prototype`[^\n]*a driver runs none[^\n]*PAUSE/);
  assert.match(read(`${REF}/yolo.md`), /`prototype` \(the person starts every round; route `\/wf loop prototype <slug> <request>`\)/);
  assert.match(read('skills/wf/workflows/yolo.js'), /5b2\. PROTOTYPE — workflow-type 'prototype'[^]*yolo drives NOTHING here/);
  assert.ok(NOT_DRIVEN.prototype, 'goal: lifecycle-done refuses a prototype');
  assert.ok(!PACKET_FORMS.includes('prototype'), 'campaign: no packet can start a prototype');
});

test('the schema knows the prototype: the workflow type, the person document, and the ledger', () => {
  const schema = JSON.parse(read('schemas/frontmatter.schema.json'));
  assert.ok(schema.$defs.prototypeLedger);
  assert.ok(schema.$defs.prototypeFrontmatter);
  assert.ok(JSON.stringify(schema).includes('"optimize", "prototype"') || JSON.stringify(schema).includes('"optimize","prototype"'));
});
