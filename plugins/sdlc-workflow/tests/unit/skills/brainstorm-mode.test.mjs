// The brainstorm artifacts against the schema: the person document, the JSON
// board with its briefs, budgets, risks, stories and talk entries, a legacy
// board, and the workflow index of a brainstorm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBrainstormBoard, validateFrontmatter } from '../../../lib/schema-validator.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCHEMA_PATH = path.join(pluginRoot, 'schemas', 'frontmatter.schema.json');


// Fix 2 (BRAINSTORM-MODE-PLAN §20): principles replace quotas.
// Fix 3 (BRAINSTORM-MODE-PLAN §20): the board is built for the person.
// Fix 5 (BRAINSTORM-MODE-PLAN §20): one clear role.
const doc = () => ({
  schema: 'sdlc/v1',
  type: 'brainstorm',
  slug: 'brainstorm-cost-budget-20260922',
  topic: 'a per-slug cost budget',
  status: 'open',
  board: 'brainstorm-board.json',
  'created-at': '2026-09-22T10:00:00Z',
  'updated-at': '2026-09-22T10:30:00Z',
  sessions: 1,
  batches: 3,
  revisions: [],
});

const jsonBoard = () => ({
  schema: 'sdlc/v1',
  artifact: 'brainstorm-board',
  slug: 'brainstorm-cost-budget-20260922',
  topic: 'a per-slug cost budget',
  'updated-at': '2026-09-22T10:30:00Z',
  sessions: 1,
  batches: 3,
  areas: [{ key: 'seeing-the-cost', name: 'Seeing what a project costs', side: 'problem', state: 'touched' }],
  threads: [{ key: 'limit-per-project', name: 'A spending limit per project', area: 'seeing-the-cost', state: 'live', 'routed-to': null }],
  items: [
    { key: 'limit-warns-only', kind: 'decision', thread: 'limit-per-project', text: 'A limit warns and never blocks.', why: 'A blocked run loses paid work.', source: 'person', scope: 'keep' },
    { key: 'cost-rows-per-run', kind: 'finding', thread: 'limit-per-project', text: 'The ledger records one row per run.', source: 'code', evidence: 'lib/cost-ledger.mjs:12', check: 'verified' },
    { key: 'limit-per-step', kind: 'idea', thread: 'limit-per-project', text: 'A limit per step.', source: 'agent', scope: 'cut', reason: 'too fine-grained' },
    { key: 'ledger-format', kind: 'question', thread: 'limit-per-project', text: 'Which export format?', source: 'agent', state: 'for-plan' },
  ],
  work: [{ key: 'spending-limit', order: 1, title: 'Add a warning-only spending limit', shape: 'intake', threads: ['limit-per-project'], items: ['limit-warns-only', 'cost-rows-per-run'], entry: '/wf intake spending-limit from brainstorm-cost-budget-20260922', state: 'proposed', 'routed-to': null }],
  selected: ['spending-limit'],
  log: [{ session: 1, batch: 1, thread: 'limit-per-project', kind: 'fork', asked: 'where does the limit act', answer: 'warn only' }],
  'consult-runs': [],
});

test('the person document validates against the brainstorm branch', () => {
  const result = validateFrontmatter(doc(), { schemaPath: SCHEMA_PATH });
  assert.equal(result.type, 'brainstorm');
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('a legacy board still validates until its first resume converts it', () => {
  const legacy = {
    ...doc(),
    board: undefined,
    threads: [{ id: 'T-01', label: 'budget per slug', state: 'live', 'routed-to': null }],
    claims: [{ id: 'C-01', thread: 'T-01', text: 'cost rows exist per slug', evidence: 'verified lib/cost-ledger.mjs:12', scope: 'keep' }],
    candidates: [{ id: 'B-01', thread: 'T-01', title: 'Add a per-slug cost budget', shape: 'intake', entry: '/wf intake cost-budget from brainstorm-cost-budget-20260922', state: 'proposed', 'routed-to': null }],
  };
  delete legacy.board;
  const result = validateFrontmatter(legacy, { schemaPath: SCHEMA_PATH });
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('a JSON board validates against $defs.brainstormBoard', () => {
  const result = validateBrainstormBoard(jsonBoard(), { schemaPath: SCHEMA_PATH });
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('a JSON board with a numbered key, an unknown kind, or an unknown scope fails', () => {
  const numbered = jsonBoard();
  numbered.items[0].key = 'C-01';
  assert.ok(!validateBrainstormBoard(numbered, { schemaPath: SCHEMA_PATH }).valid, 'a numbered id validated as a readable key');
  const kind = jsonBoard();
  kind.items[0].kind = 'claim';
  assert.ok(!validateBrainstormBoard(kind, { schemaPath: SCHEMA_PATH }).valid, 'an item kind outside the six validated');
  const scope = jsonBoard();
  scope.items[0].scope = 'maybe';
  assert.ok(!validateBrainstormBoard(scope, { schemaPath: SCHEMA_PATH }).valid, 'a scope outside keep|cut|later validated');
});

test('a workflow-index for a brainstorm validates', () => {
  const idx = {
    schema: 'sdlc/v1',
    type: 'workflow-index',
    slug: 'brainstorm-cost-budget-20260922',
    title: 'Brainstorm: a per-slug cost budget 2026-09-22',
    'workflow-type': 'brainstorm',
    'current-stage': 'brainstorm',
    status: 'ready',
    'branch-strategy': 'none',
    'open-questions': [],
    'next-command': 'intake',
    'next-invocation': '/wf intake brainstorm brainstorm-cost-budget-20260922',
    progress: { brainstorm: 'in-progress' },
    'created-at': '2026-09-22T10:00:00Z',
    'updated-at': '2026-09-22T10:30:00Z',
  };
  const result = validateFrontmatter(idx, { schemaPath: SCHEMA_PATH });
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

// BRAINSTORM-MODE-PLAN §21 — choosing inside the conversation. The v9.164.0 live
// session answered 36 of 45 "which belong" questions with every option, never
// scoped an area, and asked twice to confirm a summary the person could not see.

test('a board with briefs, core items, accepted risks, replaced items, stale work, and a page validates', () => {
  const board = jsonBoard();
  board.page = 'https://claude.ai/artifact/example';
  Object.assign(board.areas[0], { brief: 'A limit warns and never blocks. Core: the warning.', scope: 'mixed' });
  Object.assign(board.items[0], { core: true, 'accepted-risk': 'A warning can be ignored.' });
  board.items.push({ key: 'limit-blocks-runs', kind: 'decision', thread: 'limit-per-project', text: 'A limit stops a run.', source: 'person', 'replaced-by': 'limit-warns-only' });
  Object.assign(board.work[0], { stale: true, 'stale-because': 'the research area changed the limit' });
  board.log.push({ session: 1, batch: 2, thread: 'limit-per-project', kind: 'choice', asked: 'which first', answer: 'warning' });
  board.log.push({ session: 1, batch: 3, thread: 'limit-per-project', kind: 'close', asked: 'close the area', answer: 'keep all' });
  const result = validateBrainstormBoard(board, { schemaPath: SCHEMA_PATH });
  assert.deepEqual(result.errors, []);
  const badScope = jsonBoard();
  badScope.areas[0].scope = 'partly';
  assert.ok(!validateBrainstormBoard(badScope, { schemaPath: SCHEMA_PATH }).valid, 'an area scope outside keep|cut|later|mixed validated');
  const badReplaced = jsonBoard();
  badReplaced.items[0]['replaced-by'] = 'C-12';
  assert.ok(!validateBrainstormBoard(badReplaced, { schemaPath: SCHEMA_PATH }).valid, 'replaced-by accepted a numbered id');
  assert.deepEqual(validateFrontmatter({ ...doc(), page: 'https://claude.ai/artifact/example' }, { schemaPath: SCHEMA_PATH }).errors, []);
});

// BRAINSTORM-MODE-PLAN §22 — cutting, coherence, and briefs. On v9.165.0 every
// one of 24 area closes kept everything, 104 accepted risks piled up, the
// cross-area check ran only when the person asked, and ten pasted briefs got
// falling depth (68 exchanges on the first, 14 on the later ones).

test('a board with budgets, briefs, first-version items, and top risks validates', () => {
  const board = jsonBoard();
  board.budgets = [{ key: 'monthly-spend-cap', name: 'Spend stays under the cap', decision: 'limit-warns-only' }];
  board.briefs = [{ key: 'cost-brief', name: 'Cost visibility', source: 'pasted', criteria: [
    { key: 'cost-per-run', part: 'good', text: 'Every run shows its cost.', status: 'covered', items: ['cost-rows-per-run'] },
    { key: 'no-surprise-bill', part: 'failure', text: 'No surprise bill.', status: 'out-of-scope', reason: 'billing is not ours' },
  ] }];
  Object.assign(board.items[0], { 'first-version': true, 'top-risk': true });
  board.log.push({ session: 1, batch: 4, thread: null, kind: 'cohere', asked: 'coherence pass', answer: '2 conflicts, 3 merges' });
  board.log.push({ session: 1, batch: 5, thread: null, kind: 'brief', asked: 'cost brief', answer: '1 covered, 1 out of scope' });
  assert.deepEqual(validateBrainstormBoard(board, { schemaPath: SCHEMA_PATH }).errors, []);
  const bad = jsonBoard();
  bad.briefs = [{ key: 'cost-brief', name: 'Cost', criteria: [{ key: 'x', text: 'x', status: 'done' }] }];
  assert.ok(!validateBrainstormBoard(bad, { schemaPath: SCHEMA_PATH }).valid, 'a criterion status outside the four validated');
});

// BRAINSTORM-MODE-PLAN §23 — talk turns and session stories. On v9.166–v9.170
// the agent's voice lived in question forms: a 14-hour session held 5,329 words
// of chat against 25,955 words of question and option text, research went to
// the page "so the questions can stay short", and "delve deeper" got a question
// batch. The person said: "I haven't learnt anything, the agent hasn't spoken to
// me, and I don't know what we did."

test('a board with stories and talk entries validates', () => {
  const board = jsonBoard();
  board.stories = [{ session: 1, text: 'We set out to see what a project costs, and learned that the ledger already records every run.' }];
  board.log.push({ session: 1, batch: 2, thread: null, kind: 'talk', asked: 'how the ledger works', answer: 'go on' });
  board.log.push({ session: 1, batch: 3, thread: null, kind: 'story', asked: 'pause', answer: 'story told' });
  assert.deepEqual(validateBrainstormBoard(board, { schemaPath: SCHEMA_PATH }).errors, []);
  const bad = jsonBoard();
  bad.stories = [{ session: 1 }];
  assert.ok(!validateBrainstormBoard(bad, { schemaPath: SCHEMA_PATH }).valid, 'a story with no text validated');
});
