// Roster and contract guards for BRAINSTORM-MODE-PLAN (/wf intake brainstorm —
// the thinking-partner intake mode). The surfaces that enumerate the mode roster
// have no other automated guard: a mode that exists on disk but is missing
// from a dispatch table is invisible to users. The contract guards pin the
// operator's decisions: question batches through the ladder (never a named
// tool), the seven control words, the stays-open terminus, principles over
// quotas, a person-readable document beside a JSON board, and one clear role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateBrainstormBoard, validateFrontmatter } from '../../../lib/schema-validator.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCHEMA_PATH = path.join(pluginRoot, 'tests', 'frontmatter.schema.json');

const read = (...rel) => readFileSync(path.join(pluginRoot, 'skills', 'wf', ...rel), 'utf8');
const refPath = (...rel) => path.join(pluginRoot, 'skills', 'wf', 'reference', ...rel);

test('the mode reference and its artifact template exist', () => {
  assert.ok(existsSync(refPath('intake', 'brainstorm.md')), 'missing reference/intake/brainstorm.md');
  assert.ok(existsSync(refPath('intake', 'brainstorm', '_artifact.md')), 'missing reference/intake/brainstorm/_artifact.md');
});

test('every roster surface names brainstorm', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /`ideate`, `brainstorm`, `adopt`\)/, 'SKILL.md intake row lost brainstorm');

  const intake = read('reference', 'intake.md');
  assert.match(intake, /The \*\*mode keyword set\*\* is: .*`brainstorm`/, 'intake.md keyword set lost brainstorm');
  assert.match(intake, /\| `brainstorm` \| \*\*terminal thinking loop\*\*/, 'intake.md span table lost the brainstorm row');
  assert.match(intake, /\| `brainstorm` \| `intake\/brainstorm\.md` \|/, 'intake.md file map lost brainstorm');
  assert.match(intake, /\| `brainstorm` \|$/m, 'intake.md auto-route table lost the brainstorm row');
  assert.match(intake, /`brainstorm` vs `ideate`/, 'intake.md lost the brainstorm-vs-ideate discriminator');
  assert.match(intake, /`brainstorm` vs `investigate`/, 'intake.md lost the brainstorm-vs-investigate discriminator');
  assert.ok(!/"brainstorm ways to …"/.test(intake), 'intake.md still routes "brainstorm ways to …" to ideate');

  assert.match(read('reference', '_compressed-slice.md'), /`ideate`, `audit`, `brainstorm`\)/, '_compressed-slice.md <op> enum lost brainstorm');
  assert.match(read('reference', 'yolo.md'), /`ideate`, `audit`, `brainstorm`/, 'yolo.md terminal-analysis class lost brainstorm');
  assert.match(read('workflows', 'yolo.js'), /ideate, brainstorm\}/, 'yolo.js terminal-analysis class lost brainstorm');
  assert.match(read('reference', 'auto.md'), /`workflow-type: brainstorm`/, 'auto.md lost the brainstorm pause arm');
  assert.match(read('reference', 'status.md'), /`audit`, `brainstorm`/, 'status.md workflow-type vocabulary lost brainstorm');
  assert.match(read('reference', '_story-arc.md'), /`## The Brainstorm`/, '_story-arc.md lost the brainstorm heading');
});

test('the reference names no question tool and delivers batches through the ladder', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(!/AskUserQuestion|request_user_input/.test(src), 'brainstorm.md names a question tool — cite _gate-question.md');
  assert.match(src, /\[_gate-question\.md\]\(\.\.\/_gate-question\.md\)/, 'brainstorm.md does not cite _gate-question.md');
  assert.match(src, /one to four questions/i, 'brainstorm.md lost the batch size');
  assert.match(src, /No question count is a floor and none is a cap/, 'brainstorm.md lost the no-floor-no-cap rule');
  assert.match(read('reference', '_gate-question.md'), /## Batches/, '_gate-question.md lost the batch clause');
});

test('the reference carries the seven control words', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  for (const word of ['`park <thread>`', '`pull <thread>`', '`drop <thread>`', '`board`', '`look it up`', '`second opinion`', '`done`']) {
    assert.ok(src.includes(word), `brainstorm.md lost the control word ${word}`);
  }
});

test('the terminus stays open and never picks', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /\*\*stays open\*\*/, 'brainstorm.md lost the stays-open terminus');
  assert.match(src, /\/wf close <slug>/, 'brainstorm.md never names the retire command');
  assert.ok(!src.includes('# Pick — decision closure'), 'brainstorm.md grew a pick closure — the board is never superseded');
  assert.ok(!/_fix-loop\.md/.test(src), 'brainstorm.md cites the fix loop — the mode writes no code');
});

test('only the person ends the loop', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /\*\*WARNING: you never end this loop\.\*\*/, 'brainstorm.md lost the loop-ownership warning');
  assert.match(src, /Only the person's `done` reaches Step 3/, 'brainstorm.md lost the person-only exit');
  assert.match(src, /Enter this step only when the person's reply is the control word `done`/, 'Step 3 lost its entry gate');
  assert.match(src, /\*\*Only the person ends the loop\.\*\* Never decide that the thinking is complete/, 'the invariants lost the no-self-closure rule');
});

test('a resumed session reopens a distilled board', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /Reopen a distilled board \(`status: open`, `progress\.brainstorm: in-progress`/, 'Step 0 resume does not reopen a distilled board');
});

test('done scopes the work with the person', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /# Step 3 — `done`: scope the work together/, 'Step 3 is no longer a scoping conversation');
  assert.match(src, /The person decides what goes into work, and decides it with you/, 'Step 3 lost the joint-decision rule');
  assert.match(src, /go through the discussion together and scope the work/, '3.1 lost the scope option');
  assert.match(src, /Print no entry command/, '3.1 prints entry commands before the scope is agreed');
});

test('the walk decides keep, cut, or later for every decision and idea', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /## 3\.2 Walk through the discussion/, 'Step 3 lost the walk through the discussion');
  assert.match(src, /keep all of it; go through it one by one; cut all of it; leave it for later/, 'the walk lost the area-level choices');
  assert.match(src, /ask one question per item: keep; cut; later; change it/, 'the walk lost the per-item choices');
  assert.match(src, /`scope: keep`, `scope: cut`, or `scope: later`/, 'the walk no longer records scope on the item');
  assert.match(src, /When a kept item needs an item that is cut or left for later/, 'the walk lost the dependency check');
  assert.match(src, /a resume continues the walk at the first area with no answer/, 'an interrupted walk can no longer resume');
  assert.match(src, /every decision or idea with no `scope` value/, 'a second done can skip items that were never scoped');
});

test('the work is shaped and confirmed before any piece of work is written', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /## 3\.3 Shape the work/, 'Step 3 lost the shaping conversation');
  assert.match(src, /Propose a first split, then change it as the person directs\. Continue until the person says that the split holds/, 'the split is no longer agreed with the person');
  assert.match(src, /## 3\.4 Confirm and record/, 'Step 3 lost the confirm step');
  assert.match(src, /After the person confirms, write one piece of work per agreed piece/, 'pieces of work are written before the person confirms');
  assert.match(src, /Run no command/, 'Step 3 runs a command');
  assert.match(src, /An item with `scope: cut` never seeds a successor/, 'a cut item can seed a successor');
  const artifact = read('reference', 'intake', 'brainstorm', '_artifact.md');
  assert.match(artifact, /^## Scope$/m, 'the document template lost the Scope section');
  assert.match(artifact, /^## Work$/m, 'the document template lost the Work section');
  assert.match(read('reference', 'intake', '_intake-provenance.md'), /a `scope: cut` item never seeds it/, 'the provenance contract lets a cut item through');
});

// Fix 2 (BRAINSTORM-MODE-PLAN §20): principles replace quotas.
test('the loop is guided by principles, not quotas', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /^# Invariants$/m, 'brainstorm.md lost the invariants section');
  assert.match(src, /^# Craft$/m, 'brainstorm.md lost the craft section');
  assert.match(src, /These are principles, not quotas/, 'the craft section no longer says it holds principles');
  for (const principle of ['Follow the person.', 'Go wide before deep.', 'Bring your own ideas.', 'Start from the problem.', 'Raise a tension when it matters now.', 'Read the signals.', 'Explain, then ask.']) {
    assert.ok(src.includes(`**${principle}**`), `the craft section lost the principle "${principle}"`);
  }
  assert.ok((src.match(/\*Why:\*/g) ?? []).length >= 5, 'the principles lost their reasons');
  for (const quota of [/At most one question per batch/, /Every batch holds at least one/, /Every fourth batch/, /every fourth batch/]) {
    assert.ok(!quota.test(src), `a quota is back: ${quota}`);
  }
  assert.match(src, /Check in at a natural moment, not on a schedule/, 'the check-in is on a schedule again');
  assert.match(src, /zoom out and look for what is missing/, 'the check-in lost the zoom-out option');
  assert.match(src, /When the topic names a family of things, list every member of that family yourself/, 'the map no longer covers a whole family');
  assert.match(src, /mark no option `\(Recommended\)`/, 'brainstorm options can again carry a recommendation');
  assert.match(src, /offer no "explain this more" option/i, 'the explain-this-more option is back');
  assert.ok(!/_question-craft\.md\]\(\.\.\/_question-craft\.md\) in full/.test(src), 'brainstorm.md loads the decision-interview contract in full again');
});

test('the person reads plain words, never a key or a number', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(!/Name the board id/.test(src), 'brainstorm.md again tells the agent to put ids in the question text');
  assert.match(src, /\*\*Plain words\.\*\* The person reads every question, option, header, and chat line\. Write no board key, no internal number, and no mode mechanics/, 'the plain-words invariant lost its rule');
  assert.match(src, /## 2\.6 Show where we are\nIn plain words, with no key/, 'showing the board uses keys again');
  assert.match(read('reference', 'intake', 'brainstorm', '_artifact.md'), /The body names everything in words\. It carries no key/, 'the document template allows keys');
});

// Fix 3 (BRAINSTORM-MODE-PLAN §20): the board is built for the person.
test('the board is a document for the person and a JSON board for the agent', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  const artifact = read('reference', 'intake', 'brainstorm', '_artifact.md');
  assert.match(src, /\*\*`01-brainstorm\.md` is the person's document\.\*\*/, 'brainstorm.md lost the person-document rule');
  assert.match(src, /\*\*`brainstorm-board\.json` is your working board\.\*\*/, 'brainstorm.md lost the JSON board');
  assert.match(src, /Every item has a \*\*readable key\*\*/, 'items lost their readable keys');
  for (const kind of ['decision', 'idea', 'finding', 'question', 'assumption', 'tension']) {
    assert.match(src, new RegExp(`an? \\*\\*${kind}\\*\\*`), `brainstorm.md lost the ${kind} kind`);
  }
  assert.match(src, /1\. \*\*Sum up\.\*\* Rewrite the document's `## The Brainstorm` section: what we believe now/, 'the check-in lost the synthesis beat');
  for (const heading of ['## Map', '## Decisions', '## Ideas still open', '## What we found', '## What we are assuming', '## Tensions', '## Questions for the plan']) {
    assert.ok(artifact.includes(`\n${heading}\n`), `the document template lost ${heading}`);
  }
  assert.match(artifact, /^## Converting a legacy board$/m, 'the template lost the legacy conversion');
  assert.match(src, /it is a legacy board: convert it first/, 'a resume no longer converts a legacy board');
});

// Fix 5 (BRAINSTORM-MODE-PLAN §20): one clear role.
test('the agent has one clear role: ideas welcome, commitments not', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /^# Your role$/m, 'brainstorm.md lost the role section');
  assert.match(src, /\*\*Ideas are welcome; commitments are not\.\*\*/, 'the role lost its one-line rule');
  assert.match(src, /Bring ideas freely, including concrete solutions/, 'the agent can no longer bring solutions as ideas');
  assert.match(src, /Record a commitment on the board as a question for the plan/, 'commitments are no longer recorded for the plan');
  for (const contradiction of [/You do not decide and you do not design/, /No option is a solution/, /you do not solve/i, /If you catch yourself solving/]) {
    assert.ok(!contradiction.test(src), `the contradictory rule is back: ${contradiction}`);
  }
});

test('the provenance contract consumes a brainstorm source', () => {
  const src = read('reference', 'intake', '_intake-provenance.md');
  assert.match(src, /^\| `brainstorm` \|/m, '_intake-provenance.md lost the brainstorm Consume row');
  assert.match(src, /`origin-brainstorm`/, '_intake-provenance.md lost the origin-brainstorm key');
  assert.match(src, /workflow-type: brainstorm/, '_intake-provenance.md does not infer from brainstorm sources');
  assert.match(src, /brainstorm-board\.json/, '_intake-provenance.md does not read the JSON board');
});

test('the consult block cites only recorded triggers', () => {
  const triggers = read('reference', '_consult-triggers.md');
  for (const name of ['thread-contested', 'claim-contradicted']) {
    assert.match(triggers, new RegExp(`^\\| \`${name}\` \\|`, 'm'), `_consult-triggers.md lost the ${name} row`);
  }
});

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
