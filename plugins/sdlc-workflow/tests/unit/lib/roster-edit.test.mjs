// lib/roster-edit.mjs: line edits of a slice
// roster. Each edit changes one roster entry or one frontmatter key, and keeps the rest
// of the file as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = await import('../../../lib/roster-edit.mjs');

const BLOCK = [
  '---',
  'slug: engine',
  '# the roster of the slice stage',
  'slices:',
  '  - slug: s1',
  '    status: defined',
  '  - slug: s2',
  '    status: defined',
  '    depends-on:',
  '      - s1',
  '  - slug: x1',
  '    status: defined',
  '    source: extension',
  '    extension-round: 1',
  'updated: 2026-10-21',
  '---',
  '',
  '# Slices',
  '',
].join('\n');

const FLOW = '---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n  - {slug: s2, status: defined, depends-on: [s1]}\n---\n\nbody\n';

test('rosterEntries reads a block roster and a flow roster', () => {
  assert.deepEqual(R.rosterEntries(BLOCK), [
    { slug: 's1', status: 'defined', dependsOn: [], unit: null, source: null, extensionRound: null },
    { slug: 's2', status: 'defined', dependsOn: ['s1'], unit: null, source: null, extensionRound: null },
    { slug: 'x1', status: 'defined', dependsOn: [], unit: null, source: 'extension', extensionRound: 1 },
  ]);
  assert.deepEqual(R.rosterEntries(FLOW).map((e) => [e.slug, e.dependsOn]), [['s1', []], ['s2', ['s1']]]);
  assert.deepEqual(R.rosterEntries('no frontmatter'), []);
});

test('editRosterEntry adds a key to a block entry, replaces a list, and keeps every other line', () => {
  const a = R.editRosterEntry(BLOCK, 'x1', { unit: 'W3' });
  assert.equal(R.rosterEntries(a).find((e) => e.slug === 'x1').unit, 'W3');
  assert.equal(a.replace('    unit: W3\n', ''), BLOCK, 'only the new line differs');
  const b = R.editRosterEntry(BLOCK, 's2', { 'depends-on': ['s1', 'x1'] });
  assert.deepEqual(R.rosterEntries(b).find((e) => e.slug === 's2').dependsOn, ['s1', 'x1']);
  assert.match(b, /# the roster of the slice stage/);
  assert.match(b, /\n# Slices\n/);
  assert.equal(R.editRosterEntry(BLOCK, 'nope', { unit: 'W3' }), null);
});

test('editRosterEntry rewrites a flow entry on its one line, and keeps CRLF line ends', () => {
  const crlf = FLOW.replace(/\n/g, '\r\n');
  const out = R.editRosterEntry(crlf, 's1', { 'depends-on': ['s2'] });
  assert.match(out, /\r\n {2}- \{slug: s1, status: defined, depends-on: \[s2\]\}\r\n/);
  assert.ok(!/[^\r]\n/.test(out), 'no bare LF');
  assert.deepEqual(R.rosterEntries(out).find((e) => e.slug === 's1').dependsOn, ['s2']);
});

test('setFrontmatterValue replaces a key with its list lines, and adds an absent key', () => {
  const plan = '---\nslug: engine\nimplementation-order:\n  - s1\n  - s2\nstatus: complete\n---\nbody\n';
  const out = R.setFrontmatterValue(plan, 'implementation-order', ['s2', 's1']);
  assert.equal(out, '---\nslug: engine\nimplementation-order: [s2, s1]\nstatus: complete\n---\nbody\n');
  assert.deepEqual(R.frontmatterValue(out, 'implementation-order'), ['s2', 's1']);
  const added = R.setFrontmatterValue('---\nslug: s3\n---\n', 'depends-on', ['s2']);
  assert.deepEqual(R.frontmatterValue(added, 'depends-on'), ['s2']);
});

test('rosterWalkOrder: topological by depends-on, roster order as the tie-break; a cycle keeps roster order', () => {
  const order = (xs) => R.rosterWalkOrder(xs).map((s) => s.slug);
  assert.deepEqual(order([{ slug: 's1', dependsOn: ['s3'] }, { slug: 's2' }, { slug: 's3' }]), ['s2', 's3', 's1']);
  assert.deepEqual(order([{ slug: 's1', dependsOn: ['gone'] }, { slug: 's2' }]), ['s1', 's2'], 'a name outside the roster is ignored');
  assert.deepEqual(order([{ slug: 's1', dependsOn: ['s2'] }, { slug: 's2', dependsOn: ['s1'] }, { slug: 's3' }]), ['s3', 's1', 's2']);
});

test('closesCycle: an edge that a path already reverses is a cycle; a new edge is not', () => {
  const roster = [{ slug: 's1', dependsOn: [] }, { slug: 's2', dependsOn: ['s1'] }, { slug: 's3', dependsOn: ['s2'] }];
  assert.equal(R.closesCycle(roster, 's1', 's3'), true);
  assert.equal(R.closesCycle(roster, 's3', 's1'), false);
  assert.equal(R.closesCycle(roster, 's1', 'gone'), false);
});

test('rosterOf reads the roster of a folder in either layout; setRosterEntry writes the record layout', async () => {
  const { mkdtempSync, rmSync, writeFileSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { readDoc } = await import('../../../lib/records.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'roster-'));
  try {
    assert.deepEqual(R.rosterOf(dir), []);
    assert.equal(R.setRosterEntry(dir, 's1', { unit: 'W3' }), null, 'no roster, no edit');
    writeFileSync(join(dir, '03-slice.md'), BLOCK);
    assert.deepEqual(R.rosterOf(dir), R.rosterEntries(BLOCK), 'the old layout reads as rosterEntries reads its text');
    assert.equal(R.setRosterEntry(dir, 'nope', { unit: 'W3' }), null);
    const out = R.setRosterEntry(dir, 's2', { 'depends-on': ['s1', 'x1'] });
    assert.deepEqual(out.find((e) => e.slug === 's2').dependsOn, ['s1', 'x1']);
    assert.ok(existsSync(join(dir, 'slices.yaml')));
    const doc = readDoc(dir, '03-slice.md');
    assert.equal(doc.layout, 'yaml');
    assert.equal(doc.frontmatter.updated, '2026-10-21', 'the other fields stay');
    assert.match(doc.body, /# Slices/, 'the body stays');
    assert.deepEqual(R.rosterOf(dir), out, 'the record layout wins on the next read');
    R.setRosterEntry(dir, 'x1', { unit: 'W3' });
    assert.equal(R.rosterOf(dir).find((e) => e.slug === 'x1').unit, 'W3');
    assert.deepEqual(R.rosterOf(dir).find((e) => e.slug === 's2').dependsOn, ['s1', 'x1'], 'an edit of the record layout keeps the earlier edit');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
