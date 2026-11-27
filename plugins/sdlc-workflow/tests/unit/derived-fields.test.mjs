// A count or a copy of the roster that a writer keeps by hand drifts. Every write works the
// derived fields out again, and the read-only copies of the roster follow it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bestFirstOf, deriveFields } from '../../lib/derive.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields, writeDoc } from '../../lib/records.mjs';
import { putChecked } from '../../lib/record-put.mjs';
import { deriveWorkflow, syncRosterCopies } from '../../lib/roster.mjs';
import { addSlice, dropSlice } from '../../lib/slice-ops.mjs';
import { setRecordPaths } from '../../lib/wf-ops.mjs';
import { stageDone } from '../../lib/stage-done.mjs';

const planBody = (n) => `## Step-by-Step Plan\n\n${Array.from({ length: n }, (_, i) => `${i + 1}. **S${i + 1}** — files: \`a.js\`.`).join('\n')}\n`;

function fixture({ indexSlices = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-derived-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const slices = [{ slug: 'a', status: 'complete' }, { slug: 'b', status: 'defined', 'depends-on': ['a'] }, { slug: 'c', status: 'defined' }];
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'plan', 'next-invocation': '/wf plan demo b', progress: { plan: 'complete' }, ...(indexSlices ? { slices: slices.map((s) => ({ slug: s.slug, status: 'defined' })) } : {}) } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', 'total-slices': 9, 'best-first-slice': 'a', slices } });
  for (const s of slices) writeDoc(dir, `03-slice-${s.slug}.md`, { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': s.slug, status: 'defined', 'ux-impact': 'none' }, body: `# Slice: ${s.slug}\n` });
  for (const s of ['a', 'b', 'c']) writeDoc(dir, `04-plan-${s}.md`, { frontmatter: { status: 'complete' }, body: planBody(3) });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('total-slices and best-first-slice follow the roster on every write', () => {
  const f = fixture();
  try {
    const fm = frontmatterOfDoc(f.dir, '03-slice.md');
    assert.equal(fm['total-slices'], 3);
    assert.equal(fm['best-first-slice'], 'b');
    setFields(f.dir, '03-slice.md', { 'total-slices': 40 });
    assert.equal(frontmatterOfDoc(f.dir, '03-slice.md')['total-slices'], 3);
  } finally { f.done(); }
});

test('the best first slice skips a done slice, and waits for an open dependency', () => {
  const slices = [{ slug: 'a', status: 'dropped' }, { slug: 'b', 'depends-on': ['c'] }, { slug: 'c' }];
  assert.equal(bestFirstOf(slices, 'a'), 'c');
  assert.equal(bestFirstOf(slices, 'b'), 'b');
  assert.equal(bestFirstOf([{ slug: 'a', status: 'complete' }], 'a'), null);
});

test('revision-count is the ledger length, and never goes down', () => {
  assert.equal(deriveFields('04-plan-a.md', { revisions: [{}, {}] })['revision-count'], 2);
  // A count ahead of its ledger keeps its lead: the snapshots it named exist.
  assert.equal(deriveFields('04-plan-a.md', { revisions: [{}, {}], 'revision-count': 4 }, { prior: { revisions: [{}, {}], 'revision-count': 4 } })['revision-count'], 4);
  assert.equal(deriveFields('04-plan-a.md', { revisions: [{}, {}, {}], 'revision-count': 4 }, { prior: { revisions: [{}, {}], 'revision-count': 4 } })['revision-count'], 5);
  assert.equal(deriveFields('03-slice-a.md', { revisions: [{}] }).hasOwnProperty('revision-count'), false);
});

test('a plan put writes metric-step-count from its steps, whatever the draft says', () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.dir, '.draft'), { recursive: true });
    const draft = path.join(f.dir, '.draft', '04-plan-c.md');
    writeFileSync(draft, `---\nschema: sdlc/v1\ntype: plan\nslug: demo\nslice-slug: c\nstatus: complete\nstage-number: 4\ncreated-at: "2026-11-27T00:00:00Z"\nupdated-at: "2026-11-27T00:00:00Z"\nmetric-files-to-touch: 1\nmetric-step-count: 99\nhas-blockers: false\nrevision-count: 7\nrevisions: []\ntags: []\nrefs: {}\nnext-command: wf-implement\nnext-invocation: /wf implement demo c\n---\n${planBody(5)}`);
    const r = putChecked(f.dir, draft);
    assert.deepEqual(r.errors, []);
    const fm = frontmatterOfDoc(f.dir, '04-plan-c.md');
    assert.equal(fm['metric-step-count'], 5);
  } finally { f.done(); }
});

test('a roster status set by record set reaches the slice record, the index list and the progress', () => {
  const f = fixture({ indexSlices: true });
  try {
    setRecordPaths(f.dir, '03-slice.md', ['slices[b].status=in-progress']);
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-b.md').status, 'in-progress');
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-b.md')['depends-on'][0], 'a');
    const index = frontmatterOfDoc(f.dir, INDEX_NAME);
    assert.deepEqual(index.slices.map((s) => s.status), ['complete', 'in-progress', 'defined']);
  } finally { f.done(); }
});

test('an added slice turns a complete plan stage back to in-progress', () => {
  const f = fixture();
  try {
    writeDoc(f.dir, '05i-issue-t1.md', { frontmatter: { schema: 'sdlc/v1', type: 'issue-investigation', slug: 'demo', placement: { rung: 5, target: 'd', gate: { pass: true, failed: [] } } } });
    const r = addSlice(f.dir, { slice: 'd', scope: 'the cache key', ac: ['it holds'], placement: '05i-issue-t1.md', estimatedSteps: 12 });
    assert.equal(r.added, true);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME).progress.plan, 'in-progress');
    const roster = frontmatterOfDoc(f.dir, '03-slice.md');
    assert.equal(roster['total-slices'], 4);
    assert.equal(roster.slices.at(-1)['estimated-steps'], 12);
    assert.equal(roster.slices.at(-1).complexity, 'm');
    assert.equal(roster.revisions.at(-1).trigger, 'new-slice');
  } finally { f.done(); }
});

test('a drop points a route that named the slice at the best open slice', () => {
  const f = fixture();
  try {
    dropSlice(f.dir, 'b', { reason: 'merged' });
    const index = frontmatterOfDoc(f.dir, INDEX_NAME);
    assert.equal(index['next-invocation'], '/wf plan demo c');
    const roster = frontmatterOfDoc(f.dir, '03-slice.md');
    assert.equal(roster['total-slices'], 2);
    assert.equal(roster['best-first-slice'], 'c');
    assert.equal(roster.revisions.at(-1).trigger, 'scope-change');
  } finally { f.done(); }
});

test('stage-done keeps the master counts of the plan index in step with the roster', () => {
  const f = fixture();
  try {
    writeDoc(f.dir, '04-plan.md', { frontmatter: { schema: 'sdlc/v1', type: 'plan-index', slug: 'demo', status: 'complete', 'slices-planned': 1, 'slices-total': 8, 'implementation-order': ['c', 'b', 'a'] } });
    stageDone(f.dir, 'demo', 'plan', 'c');
    const fm = frontmatterOfDoc(f.dir, '04-plan.md');
    assert.equal(fm['slices-planned'], 3);
    assert.equal(fm['slices-total'], 3);
    assert.deepEqual(fm['implementation-order'], ['a', 'b', 'c']);
  } finally { f.done(); }
});

test('record migrate corrects what a writer kept by hand, and a second pass changes nothing', () => {
  const f = fixture();
  try {
    // The fixture wrote each slice record after the roster, as a hand edit would: a and b disagree with it.
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-a.md').status, 'defined');
    const first = deriveWorkflow(f.dir);
    assert.deepEqual(first.map((d) => d.record).sort(), ['03-slice-a.md', '03-slice-b.md', '04-plan-a.md', '04-plan-b.md', '04-plan-c.md']);
    assert.equal(frontmatterOfDoc(f.dir, '04-plan-a.md')['metric-step-count'], 3);
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-a.md').status, 'complete');
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice-b.md')['depends-on'], ['a']);
    assert.deepEqual(deriveWorkflow(f.dir), []);
    assert.deepEqual(syncRosterCopies(f.dir), []);
  } finally { f.done(); }
});
