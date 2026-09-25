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

// BRAINSTORM-MODE-PLAN §21 — choosing inside the conversation. The v9.164.0 live
// session answered 36 of 45 "which belong" questions with every option, never
// scoped an area, and asked twice to confirm a summary the person could not see.

test('the options make the person choose, and the agent is the counterweight', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(src.includes('**Make the options choose.**'), 'the craft section lost "Make the options choose"');
  assert.ok(src.includes('**Be the counterweight.**'), 'the craft section lost "Be the counterweight"');
  assert.match(src, /When the person picks every option of a list, the list asked nothing: the next question on that thread is a choice/, 'picking every option widens again instead of asking for a choice');
  assert.ok(!/When the person picks every option, writes "mix of", "all", or "more"/.test(src), 'the old widen-on-every-option rule is back');
  assert.match(src, /a \*\*choice\*\* — options that exclude each other: an order, a trade-off, or a cut, each option with its cost/, 'the loop lost the choice question form');
  assert.match(src, /An option that adds something says what it costs/, 'options no longer carry their cost');
  assert.match(src, /state the consequence once, in one sentence, in the next question text/, 'the counterweight no longer states the consequence');
  assert.match(src, /as its `accepted-risk`, not as a closed question/, 'a set-aside risk is recorded as closed again');
  for (const quota of [/every third batch/i, /one trade-off question per/i]) {
    assert.ok(!quota.test(src), `a quota came back with the choice rule: ${quota}`);
  }
});

test('an area is scoped when it closes, so done walks only what is left', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /^## 2\.8 Close an area$/m, 'the loop lost the area close');
  assert.match(src, /3\. \*\*Close the area\*\* \(2\.8\) when the check-in follows an area that feels explored/, 'the check-in no longer closes an explored area');
  assert.match(src, /the person can answer "not yet"/, 'an area close is forced on the person');
  assert.match(src, /which decisions are core \(multi-select\)/, 'the area close lost the core question');
  assert.match(src, /whether the area changes a piece of work that already exists/, 'the area close no longer checks existing work');
  assert.match(src, /set `stale: true` and `stale-because` on that piece/, 'a changed piece of work is not marked stale');
  assert.match(src, /set `replaced-by` on the older item/, 'a replaced decision is not marked');
  assert.match(src, /An area closed with a scope \(2\.8\) is not walked again/, 'done walks a closed area again');
  assert.match(src, /A stale piece of work \(2\.8\): propose the piece that brings it up to date/, 'shaping ignores stale work');
});

test('every question carries its own context', () => {
  const gate = read('reference', '_gate-question.md');
  assert.match(gate, /\*\*A question carries its own context\.\*\* The host's question dialog can\s+hide the chat text before it/, '_gate-question.md lost the own-context rule');
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /Put the summary in the question text/, 'the check-in summary is back in chat only');
  assert.ok(!/in a few plain sentences\. Show it in chat\./.test(src), 'the check-in shows its summary in chat again');
  assert.match(src, /In each question's text, list the area's decisions and ideas/, 'the done walk lists items in chat only');
  assert.match(src, /Put that scope in the text of a question that asks the person to confirm it/, 'the scope to confirm is not in the question');
});

test('the document has a short front, and the page presents the board where the host has one', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  const artifact = read('reference', 'intake', 'brainstorm', '_artifact.md');
  const host = read('reference', '_host-invocation.md');
  assert.match(src, /It opens with a short front: what we believe now, the map with a brief of five lines or fewer per area, and what is open now/, 'the person document lost its short front');
  assert.ok(artifact.includes('\n## Open now\n'), 'the document template lost the Open now section');
  assert.match(artifact, /<!-- The front ends here\. The record follows\. -->/, 'the template no longer separates the front from the record');
  assert.match(src, /^## 2\.9 The page$/m, 'the loop lost the page');
  assert.match(src, /row "Published page"/, 'the page does not defer its mechanics to the host contract');
  assert.match(host, /^\| Published page \(brainstorm\) \| When the session lists the Artifact tool: load the `artifact-design` skill/m, '_host-invocation.md lost the published-page row');
  assert.match(src, /The page presents the board and never replaces it\. Write every change to the two files first/, 'the page can become the source of truth');
  assert.match(src, /Republish it to the same link at each check-in, each area close, each `board`, and at `done`/, 'the page is no longer kept current');
  assert.match(src, /Where the host has no published page, the person reads `01-brainstorm\.md`/, 'a host with no page has no fallback');
  assert.ok(!/Artifact tool|AskUserQuestion/.test(src), 'brainstorm.md names a host tool instead of citing the contract');
});

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

test('an area close asks for a first version, a price, and one top risk', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /which decisions belong in the first version — each decision left out gets `scope: later`, and nothing is cut unless the person says so/, 'the area close lost the first-version question');
  assert.match(src, /Give the area's price in the question text: its rough size, and what it adds to each budget on the board/, 'the area close no longer shows its price');
  assert.match(src, /which risk worries the person most/, 'the area close no longer picks a top risk');
  assert.match(src, /Only a top risk appears in the document's front/, 'every accepted risk reaches the front again');
  assert.match(src, /When the person answers with a mix, write the blend as one concrete sentence, and ask the person to confirm it or change it/, 'a mixed answer becomes the agent\'s decision again');
  assert.match(src, /and the consequence is material — it cannot be undone, it breaks a budget on the board, or it contradicts an earlier decision/, 'the counterweight fires on every cost again');
  assert.ok(!/When the person sets a risk aside, or takes the costliest option, state the consequence once/.test(src), 'the unconditional counterweight is back');
});

test('a coherence pass holds the board against itself, the routed work, and the budgets', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(existsSync(refPath('intake', 'brainstorm', '_cohere.md')), 'missing brainstorm/_cohere.md');
  const cohere = read('reference', 'intake', 'brainstorm', '_cohere.md');
  assert.match(src, /^\| `cohere` \| Run a coherence pass/m, 'the loop lost the cohere control word');
  assert.match(src, /Then run a coherence pass\./, 'an area close no longer runs a coherence pass');
  assert.match(src, /Run a coherence pass unless one ran after the last change/, 'done scopes an incoherent board');
  assert.match(cohere, /Do not run it after every batch/, 'the coherence pass runs on every batch');
  assert.match(cohere, /Dispatch one read-only research sub-agent/, 'the pass no longer reads the routed work');
  assert.match(cohere, /marked `new`, `repeat`, or `contradiction`, with `file:line`/, 'the pass lost its per-decision verdict');
  assert.match(cohere, /A budget the decisions no longer fit is a conflict/, 'the pass no longer adds up the budgets');
  assert.match(cohere, /marks that piece `stale: true`/, 'a contradicted design document no longer marks its work stale');
  assert.match(cohere, /Log\*\* one entry with kind `cohere`/, 'the pass is not logged');
});

test('a brief the person brings becomes a coverage map with equal depth', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(existsSync(refPath('intake', 'brainstorm', '_brief.md')), 'missing brainstorm/_brief.md');
  const brief = read('reference', 'intake', 'brainstorm', '_brief.md');
  assert.match(src, /A reply that carries a brief, pasted or as a file path, runs \[brainstorm\/_brief\.md\]/, 'a pasted brief no longer starts the brief procedure');
  assert.match(src, /then the coverage of each open brief/, 'showing the board omits brief coverage');
  for (const status of ['`covered`', '`partial`', '`open`', '`out-of-scope`']) {
    assert.ok(brief.includes(status), `the brief procedure lost the ${status} status`);
  }
  assert.match(brief, /A later criterion gets no less depth than the first one/, 'the brief walk lost its equal-depth rule');
  assert.match(brief, /a criterion becomes `covered` only when it has a decision, its cost, and its check/, 'a criterion can be covered without a check');
  assert.match(brief, /Then run a coherence pass/, 'a closed brief skips the coherence pass');
});

test('the loop writes only what changed after each batch', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /\*\*The board is the memory\.\*\* Write the changed items to both files after every batch/, 'the invariant lost incremental writes');
  assert.ok(!/Rewrite both files after every batch/.test(src), 'the loop rewrites the whole board every batch again');
  assert.match(src, /Rewrite the document's front at a check-in, and its full record at an area close and at `done`/, 'the document rewrite cadence is gone');
});

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

test('new ground gets a talk turn in chat before the next batch', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.ok(existsSync(refPath('intake', 'brainstorm', '_talk.md')), 'missing brainstorm/_talk.md');
  const talk = read('reference', 'intake', 'brainstorm', '_talk.md');
  assert.match(src, /or when the person asks a question or asks you to go deeper, take a talk turn before the next batch/, 'explain-then-ask lost the talk turn');
  assert.match(src, /A talk turn \(\[brainstorm\/_talk\.md\]\(brainstorm\/_talk\.md\)\) takes the place of a batch, and ends with no question/, 'the loop lost the talk turn as a move');
  assert.match(src, /An answer that asks a question, or asks you to explain or go deeper, gets a talk turn/, 'a question in an answer gets a question batch again');
  assert.match(src, /on ground that is new to the person, or when two answers contradict each other, take a talk turn first/, 'picking every option on new ground no longer starts a talk turn');
  assert.match(talk, /it stays the usual move/, 'the talk turn replaced the question batch as the usual move');
  assert.match(talk, /Ask no question form in the same turn\. The host can hide the chat text before a question form/, 'a talk turn can end in a question form that hides it');
  assert.match(talk, /your own view, and your reason/, 'a talk turn no longer gives the agent\'s view');
  assert.match(talk, /Take no two talk turns in a row unless the person asks for more/, 'talk turns can crowd out the questions');
  assert.match(talk, /log one entry with kind `talk`/, 'a talk turn is not logged');
});

test('each sitting ends with a story, and a resume opens with it', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  const talk = read('reference', 'intake', 'brainstorm', '_talk.md');
  const artifact = read('reference', 'intake', 'brainstorm', '_artifact.md');
  assert.match(src, /^\| `pause` \| Tell the story of this sitting/m, 'the loop lost the pause control word');
  assert.match(src, /stop for now \(the story of this sitting, as `pause`\)/, 'the check-in no longer offers to stop with a story');
  assert.match(src, /tell the story of the last session in chat/, 'a resume no longer opens with the story');
  assert.match(src, /narrative lead is the story of this sitting/, 'the chat return lost the story');
  assert.match(src, /with one line on what we learned since the last check-in/, 'the check-in no longer says what we learned');
  for (const part of ['What we set out to explore', 'What we learned', 'What we decided, and why', 'What is still open', 'Where the next sitting starts']) {
    assert.ok(talk.includes(part), `the story lost the part "${part}"`);
  }
  assert.match(talk, /When that session has no story, because the person left without a pause, write it from that session's log entries first/, 'a session left without a pause gets no story');
  assert.match(talk, /Write no count of items, questions, or areas, and name no mode mechanism/, 'the story can recite counts and mechanics');
  assert.ok(artifact.includes('\n## Sessions\n'), 'the document template lost the Sessions section');
  assert.match(src, /the session stories, newest first/, 'the page no longer shows the stories');
});

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
