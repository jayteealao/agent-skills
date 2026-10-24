// BRAINSTORM-DESIGN-PLAN guard tests: `/wf intake brainstorm` is an intake mode, `design`
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
  const schema = JSON.parse(read('schemas/frontmatter.schema.json'));
  ok(schema.$defs.designContractFrontmatter.properties['carried-from']);
  const doc = schema.$defs.brainstormFrontmatter.properties;
  ok(doc.focus);
  match('brainstorm-board-design.json', new RegExp(doc.board.pattern));
  match('brainstorm-board.json', new RegExp(doc.board.pattern));
  ok(defaultFrontmatterSchemaPath() && validateFrontmatter);
});
