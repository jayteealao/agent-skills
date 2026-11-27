// The roster is the one stored copy of the slice facts; every count and list is worked out from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { writeDoc } from '../../lib/records.mjs';
import { bestFirst, liveSlices, openSlices, packetSteps, rosterEntries, stageProgress, totalSlices, walkOrder } from '../../lib/roster.mjs';

const planBody = (n) => `## Step-by-Step Plan\n\n${Array.from({ length: n }, (_, i) => `${i + 1}. **S${i + 1}** — files: \`a.js\`.`).join('\n')}\n`;

function fixture(slices) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-roster-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', slices } });
  return { dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('no roster is null, never an empty list', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-roster-'));
  try { assert.equal(rosterEntries(root), null); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the live, open and total slices; a string entry is a defined slice', () => {
  const f = fixture(['a', { slug: 'b', status: 'complete' }, { slug: 'c', status: 'dropped' }, { slug: 'd', status: 'in-progress' }, { slug: 'e', status: 'deferred' }]);
  try {
    const e = rosterEntries(f.dir);
    assert.deepEqual(liveSlices(e).map((x) => x.slug), ['a', 'b', 'd', 'e']);
    assert.deepEqual(openSlices(e).map((x) => x.slug), ['a', 'd']);
    assert.equal(totalSlices(e), 4);
  } finally { f.done(); }
});

test('the walk order follows depends-on, and a dropped slice is not in it', () => {
  const f = fixture([{ slug: 'a', 'depends-on': ['c'] }, { slug: 'b', status: 'dropped' }, { slug: 'c' }]);
  try { assert.deepEqual(walkOrder(rosterEntries(f.dir)).map((x) => x.slug), ['c', 'a']); } finally { f.done(); }
});

test('the best first slice never names a dropped or done slice', () => {
  const f = fixture([{ slug: 'a', status: 'dropped' }, { slug: 'b', status: 'complete' }, { slug: 'c', 'depends-on': ['d'] }, { slug: 'd' }]);
  try {
    const e = rosterEntries(f.dir);
    assert.equal(bestFirst(e, 'a'), 'd');
    assert.equal(bestFirst(e, 'b'), 'd');
    assert.equal(bestFirst(e, 'c'), 'c');
    assert.equal(bestFirst(e, null), 'd');
  } finally { f.done(); }
});

test('the step size: a plan counts its steps, else the estimate, else the full limit', () => {
  const f = fixture([{ slug: 'a', status: 'complete', 'estimated-steps': 9 }, { slug: 'b', 'estimated-steps': 7 }, { slug: 'c' }, { slug: 'd', status: 'dropped', 'estimated-steps': 30 }]);
  try {
    writeDoc(f.dir, '04-plan-a.md', { frontmatter: { status: 'complete' }, body: planBody(12) });
    const p = packetSteps(f.dir, rosterEntries(f.dir), { maxSteps: 20 });
    assert.equal(p.steps, 12 + 7 + 20);
    assert.deepEqual(p.unknown, ['c']);
    assert.equal(p.bySlice.a.from, 'plan');
    assert.equal(p.bySlice.d, undefined);
  } finally { f.done(); }
});

test('stage progress: complete only when every open slice has a complete record', () => {
  const f = fixture([{ slug: 'a', status: 'complete' }, { slug: 'b' }, { slug: 'c', status: 'dropped' }]);
  try {
    writeDoc(f.dir, '04-plan-a.md', { frontmatter: { status: 'complete' }, body: planBody(2) });
    assert.equal(stageProgress(f.dir, rosterEntries(f.dir)).plan, 'in-progress');
    writeDoc(f.dir, '04-plan-b.md', { frontmatter: { status: 'complete' }, body: planBody(2) });
    const p = stageProgress(f.dir, rosterEntries(f.dir));
    assert.equal(p.plan, 'complete');
    assert.equal(p.implement, null);
  } finally { f.done(); }
});
