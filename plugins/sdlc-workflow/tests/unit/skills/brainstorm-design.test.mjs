// BRAINSTORM-DESIGN-PLAN guard tests: `/wf brainstorm` is a key, `design`
// focuses a brainstorm on how an idea looks and behaves, sketches stay ideas,
// and the design thoughts travel to the design stage, which presents them again
// as its starting direction.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import { validateBrainstormBoard, defaultFrontmatterSchemaPath, validateFrontmatter } from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
const REF = 'skills/wf/reference';

test('brainstorm is a key: SKILL.md row, key list, router, picker, surface pin', () => {
  const skill = read('skills/wf/SKILL.md');
  match(skill, /\| `brainstorm` \| `\[slug\] \[design\] \[idea\]` \|/);
  match(skill, /one of the 23 keys/);
  match(skill, /retro, design, brainstorm, probe/);
  const router = read(`${REF}/brainstorm.md`);
  match(router, /Follow \[intake\/brainstorm\.md\]\(intake\/brainstorm\.md\)/);
  match(router, /`workflow-type: brainstorm` → \*\*resume\*\*/);
  match(router, /\*\*design on a workflow\*\*/);
  match(read('hooks/mod/catalog.ts'), /key: 'brainstorm'/);
  equal(JSON.parse(read('docs/internal/surface-policy.json')).keys, 23);
});

test('the design focus: record first, sketches are ideas, design items marked', () => {
  const focus = read(`${REF}/intake/brainstorm/_design.md`);
  match(focus, /Read the design record/);
  match(focus, /Do not write `02c-craft\.md`\./);
  match(focus, /Do not write `direction-confirmed-by`\./);
  match(focus, /Write `design: true` on each item/);
  match(focus, /row "Design canvas"/);
  match(focus, /`design-direction`/);
  match(focus, /brainstorm-board-design\.json/);
  match(read(`${REF}/intake/brainstorm.md`), /load `brainstorm\/_design\.md` in full now/);
});

test('schema: the board admits focus, sketches, design items, and design work', () => {
  const board = {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'brainstorm-bar-20260924', focus: 'design',
    areas: [{ key: 'layout', name: 'Layout', side: 'solution', state: 'explored' }],
    threads: [{ key: 'bar-position', name: 'Where the bar sits', state: 'live' }],
    items: [{ key: 'bar-on-top', kind: 'decision', thread: 'bar-position', text: 'The bar sits at the top.', source: 'person', design: true, scope: 'keep' }],
    sketches: [{ key: 'top-bar-sketch', thread: 'bar-position', items: ['bar-on-top'], link: null, caption: 'A thin bar above the header.', state: 'carried' }],
    work: [{ key: 'progress-bar', title: 'Add a reading-progress bar', shape: 'intake', 'ux-impact': 'new-surface', sketches: ['top-bar-sketch'], items: ['bar-on-top'], entry: '/wf intake progress-bar from brainstorm-bar-20260924', state: 'proposed' }],
  };
  const good = validateBrainstormBoard(board);
  ok(good.valid, JSON.stringify(good.errors));
  equal(validateBrainstormBoard({ ...board, focus: 'visual' }).valid, false);
  equal(validateBrainstormBoard({ ...board, sketches: [{ ...board.sketches[0], state: 'confirmed' }] }).valid, false, 'a sketch is never confirmed');
  const direction = { ...board, work: [{ ...board.work[0], shape: 'design-direction', entry: '/wf design direction from brainstorm-bar-20260924' }] };
  ok(validateBrainstormBoard(direction).valid);
});

test('schema: the contract records carried-from; the document names a design board', () => {
  const schema = JSON.parse(read('tests/frontmatter.schema.json'));
  ok(schema.$defs.designContractFrontmatter.properties['carried-from']);
  const doc = schema.$defs.brainstormFrontmatter.properties;
  ok(doc.focus);
  match('brainstorm-board-design.json', new RegExp(doc.board.pattern));
  match('brainstorm-board.json', new RegExp(doc.board.pattern));
  ok(defaultFrontmatterSchemaPath() && validateFrontmatter);
});

test('the thoughts travel: provenance, the brief, the design stage, the direction command', () => {
  match(read(`${REF}/intake/_intake-provenance.md`), /When the piece of work records `ux-impact`, propose that value in the stack question/);
  const carried = read(`${REF}/design/_carried.md`);
  match(carried, /whose `routed-to` is this slug/);
  match(carried, /keep, change \(free text says how\), or drop/);
  match(carried, /`## Carried design thoughts`/);
  match(read(`${REF}/design/shape.md`), /the carried design thoughts \(\[_carried\.md\]\(_carried\.md\) → In the brief\)/);
  const stage = read(`${REF}/design/stage.md`);
  match(stage, /## Step 1b — Present the carried design thoughts/);
  match(stage, /carried-from: \[<board path>#<piece-of-work key>\]/);
  match(read(`${REF}/design/record.md`), /When the instructions are `from <board-slug>`/);
});
