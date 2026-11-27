// `slice split` cuts a slice that has not started into parts, and `slice merge` joins slices: the
// criteria, the estimate, depends-on, the decisions and the revision ledger follow the cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { INDEX_NAME, frontmatterOfDoc, readDoc, writeDoc } from '../../lib/records.mjs';
import { acBlocks, mergeSlices, splitSlice } from '../../lib/slice-ops.mjs';
import { readDecisions, writeDecisions } from '../../lib/decisions.mjs';

const AC = (n) => `- AC-${n}: Given ${n} When run Then ${n} holds\n  <!-- observable: true — a test sees it -->`;
const sliceBody = (s, acs, more = '') => `# Slice: ${s}\n\n## Goal\n\nDo ${s}.\n\n## Acceptance Criteria\n\n${acs.map(AC).join('\n')}\n\n## Dependencies on Other Slices\n\nNone\n${more}`;

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-split-'));
  const dir = path.join(root, 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'selected-slice': 'docs' } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', slices: [
    { slug: 'base', status: 'complete', 'estimated-steps': 4 },
    { slug: 'engine', status: 'defined', 'depends-on': ['base'], 'estimated-steps': 24 },
    { slug: 'ui', status: 'defined', 'depends-on': ['engine'], 'estimated-steps': 6 },
    { slug: 'docs', status: 'defined', 'depends-on': ['ui'], 'estimated-steps': 3 },
  ] } });
  writeDoc(dir, '03-slice-engine.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'engine', status: 'defined', 'depends-on': ['base'] }, body: sliceBody('engine', [1, 2, 3, 4]) });
  writeDoc(dir, '03-slice-ui.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'ui', status: 'defined', 'depends-on': ['engine'] }, body: sliceBody('ui', [1, 2]) });
  writeDoc(dir, '03-slice-docs.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'docs', status: 'defined', 'depends-on': ['ui'], 'carried-issues': [{ issue: 'T-4', text: 'a typo' }] }, body: sliceBody('docs', [1]) });
  writeDecisions(dir, [
    { id: 'D-001', kind: 'answer', key: 'cut', answer: 'split engine', by: 'person', scope: {}, 'superseded-by': null },
    { id: 'D-002', kind: 'answer', key: 'rules', answer: 'AC-3 uses the new rule table', by: 'person', scope: { slice: 'engine' }, 'superseded-by': null },
    { id: 'D-003', kind: 'steer', key: null, answer: 'keep the engine pure', by: 'person', scope: { slice: 'engine' }, 'superseded-by': null },
    { id: 'D-004', kind: 'answer', key: 'tone', answer: 'plain words', by: 'person', scope: { slice: 'docs' }, 'superseded-by': null },
  ]);
  const decisions = readDecisions(dir);
  return { dir, decisions, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('acBlocks reads each criterion with the lines under it', () => {
  const { blocks } = acBlocks(sliceBody('x', [1, 2]));
  assert.equal(blocks.length, 2);
  assert.match(blocks[1], /^- AC-2: .*\n {2}<!-- observable/);
});

test('split: the parts divide the criteria and the estimate, run in order, and take the dependents', () => {
  const f = fixture();
  try {
    const r = splitSlice(f.dir, 'engine', { parts: [{ slice: 'engine', acs: '1,2' }, { slice: 'engine-rules', acs: 'AC-3,4' }], decision: 'D-001' }, { decisions: f.decisions });
    assert.deepEqual(r.parts, [{ slice: 'engine', acs: 2, estimatedSteps: 12 }, { slice: 'engine-rules', acs: 2, estimatedSteps: 12 }]);
    const roster = frontmatterOfDoc(f.dir, '03-slice.md');
    assert.deepEqual(roster.slices.map((s) => [s.slug, s['depends-on'] ?? [], s['estimated-steps']]), [
      ['base', [], 4], ['engine', ['base'], 12], ['engine-rules', ['engine'], 12], ['ui', ['engine-rules'], 6], ['docs', ['ui'], 3],
    ]);
    assert.equal(roster.revisions.at(-1).trigger, 'split');
    const kept = readDoc(f.dir, '03-slice-engine.md');
    assert.deepEqual(acBlocks(kept.body).blocks.map((b) => b.slice(0, 6)), ['- AC-1', '- AC-2']);
    assert.ok(kept.frontmatter['scope-at']);
    const part = readDoc(f.dir, '03-slice-engine-rules.md');
    assert.equal(part.frontmatter['split-from'], 'engine');
    assert.match(part.body, /^# Slice: engine-rules/m);
    assert.match(part.body, /## Dependencies on Other Slices\n\n- engine\n/);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice-ui.md')['depends-on'], ['engine-rules']);
    // D-002 names AC-3, so it goes to the part that holds AC-3; D-003 names none, so both parts get it.
    const d = readDecisions(f.dir);
    assert.equal(d.find((e) => e.id === 'D-002').scope.slice, 'engine-rules');
    assert.equal(d.find((e) => e.id === 'D-002').moves[0].from, 'engine');
    assert.equal(d.find((e) => e.id === 'D-003').scope.slice, 'engine');
    const copy = d.find((e) => e['copied-from'] === 'D-003');
    assert.equal(copy.scope.slice, 'engine-rules');
  } finally { f.done(); }
});

test('split refuses a criterion left out, a criterion given twice, a started slice and no decision', () => {
  const f = fixture();
  try {
    const go = (parts, decision = 'D-001') => () => splitSlice(f.dir, 'engine', { parts, decision }, { decisions: f.decisions });
    assert.throws(go([{ slice: 'engine', acs: '1,2' }, { slice: 'engine-b', acs: '3' }]), /criteria 4 are in no part/);
    assert.throws(go([{ slice: 'engine', acs: '1,2,3' }, { slice: 'engine-b', acs: '3,4' }]), /criterion 3 is in engine and in engine-b/);
    assert.throws(go([{ slice: 'engine-a', acs: '1,2' }, { slice: 'engine-b', acs: '3,4' }]), /one part keeps the slug engine/);
    assert.throws(go([{ slice: 'engine', acs: '1,2' }, { slice: 'ui', acs: '3,4' }]), /has a slice ui already/);
    assert.throws(go([{ slice: 'engine', acs: '1,2' }, { slice: 'engine-b', acs: '3,4' }], 'D-99'), /D-99 is not in the store/);
    writeDoc(f.dir, '05-implement-engine.md', { frontmatter: { status: 'in-progress' } });
    assert.throws(go([{ slice: 'engine', acs: '1,2' }, { slice: 'engine-b', acs: '3,4' }]), /has started its implement/);
  } finally { f.done(); }
});

test('merge: the criteria, the issues, the estimate and the decisions join; the merged slice is dropped', () => {
  const f = fixture();
  try {
    const r = mergeSlices(f.dir, 'ui', 'docs', { decision: 'D-001', maxSteps: 20 }, { decisions: f.decisions });
    assert.deepEqual([r.merged, r.estimatedSteps, r.decisions.moved], [['docs'], 9, ['D-004']]);
    const roster = frontmatterOfDoc(f.dir, '03-slice.md');
    const docs = roster.slices.find((s) => s.slug === 'docs');
    assert.deepEqual([docs.status, docs['merged-into']], ['dropped', 'ui']);
    assert.equal(roster.slices.find((s) => s.slug === 'ui')['estimated-steps'], 9);
    assert.equal(roster.revisions.at(-1).trigger, 'merge');
    const ui = readDoc(f.dir, '03-slice-ui.md');
    assert.equal(acBlocks(ui.body).blocks.length, 3);
    assert.match(ui.body, /## Carried Issues[\s\S]*- T-4: a typo/);
    assert.deepEqual(ui.frontmatter['depends-on'], ['engine']);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['selected-slice'], 'ui');
    assert.equal(readDecisions(f.dir).find((e) => e.id === 'D-004').scope.slice, 'ui');
  } finally { f.done(); }
});

test('merge refuses a joined estimate over the step limit', () => {
  const f = fixture();
  try {
    assert.throws(() => mergeSlices(f.dir, 'engine', 'ui', { decision: 'D-001', maxSteps: 20 }, { decisions: f.decisions }), /comes to 30 steps; a slice has 20 steps or fewer/);
  } finally { f.done(); }
});
