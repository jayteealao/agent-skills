// Roster and contract guards for BRAINSTORM-MODE-PLAN (/wf intake brainstorm —
// the rubber-duck intake mode). The surfaces that enumerate the mode roster
// have no other automated guard: a mode that exists on disk but is missing
// from a dispatch table is invisible to users. The contract guards pin the
// operator's decisions: question batches through the ladder (never a named
// tool), the seven control words, and the stays-open terminus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateFrontmatter } from '../../../lib/schema-validator.mjs';

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
  assert.match(src, /Never decide that the thinking is complete/, 'the discipline list lost the no-self-closure rule');
});

test('a resumed session reopens a distilled board', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /reopen a distilled board \(`status: open`, `progress\.brainstorm: in-progress`/, 'Step 0 resume does not reopen a distilled board');
});

test('done asks the disposition before it prints any command', () => {
  const src = read('reference', 'intake', 'brainstorm.md');
  assert.match(src, /Ask what the person wants to do with the thinking/, 'Step 3 lost the disposition question');
  assert.match(src, /The options are dispositions, never commands/, 'Step 3 lost the dispositions-not-commands rule');
  assert.match(src, /Print no entry command here/, 'Step 3 prints entry commands before the person chooses');
  assert.ok(!/Step 5's card format/.test(src), 'Step 3 still hands the person a list of intakes');
});

test('the provenance contract consumes a brainstorm source', () => {
  const src = read('reference', 'intake', '_intake-provenance.md');
  assert.match(src, /^\| `brainstorm` \|/m, '_intake-provenance.md lost the brainstorm Consume row');
  assert.match(src, /`origin-brainstorm`/, '_intake-provenance.md lost the origin-brainstorm key');
  assert.match(src, /workflow-type: brainstorm/, '_intake-provenance.md does not infer from brainstorm sources');
});

test('the consult block cites only recorded triggers', () => {
  const triggers = read('reference', '_consult-triggers.md');
  for (const name of ['thread-contested', 'claim-contradicted']) {
    assert.match(triggers, new RegExp(`^\\| \`${name}\` \\|`, 'm'), `_consult-triggers.md lost the ${name} row`);
  }
});

const board = () => ({
  schema: 'sdlc/v1',
  type: 'brainstorm',
  slug: 'brainstorm-cost-budget-20260922',
  topic: 'a per-slug cost budget',
  status: 'open',
  'created-at': '2026-09-22T10:00:00Z',
  'updated-at': '2026-09-22T10:30:00Z',
  sessions: 1,
  batches: 3,
  threads: [{ id: 'T-01', label: 'budget per slug', state: 'live', 'routed-to': null }],
  claims: [{ id: 'C-01', thread: 'T-01', text: 'cost rows exist per slug', evidence: 'verified lib/cost-ledger.mjs:12' }],
  assumptions: [{ id: 'A-01', thread: 'T-01', text: 'a budget is a number', state: 'named' }],
  contradictions: [{ id: 'X-01', threads: ['T-01'], text: 'a budget per slice conflicts with a budget per slug', state: 'open' }],
  candidates: [{ id: 'B-01', thread: 'T-01', title: 'Add a per-slug cost budget', shape: 'intake', entry: '/wf intake cost-budget from brainstorm-cost-budget-20260922', state: 'proposed', 'routed-to': null }],
  selected: [],
  revisions: [],
});

test('a populated board validates against the brainstorm branch', () => {
  const result = validateFrontmatter(board(), { schemaPath: SCHEMA_PATH });
  assert.equal(result.type, 'brainstorm');
  assert.deepEqual(result.errors, []);
  assert.ok(result.valid);
});

test('an unknown thread state fails validation', () => {
  const bad = board();
  bad.threads[0].state = 'pending';
  const result = validateFrontmatter(bad, { schemaPath: SCHEMA_PATH });
  assert.ok(!result.valid, 'a thread state outside live|parked|routed|dropped validated');
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
