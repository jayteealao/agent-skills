// The limits of a project bite when a record is written: a roster put is refused over the step
// limit, the slice limit or the step budget, unless the person accepts it; the placer sends an
// issue up when the packet is full or the fix has no size; a carry never widens a slice past the
// limit; a fourth fix round is counted; a fix plan past its tripwire is warned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { putChecked, tripwireWarnings } from '../../lib/record-put.mjs';
import { INDEX_NAME, frontmatterOfDoc, writeDoc } from '../../lib/records.mjs';
import { rosterLimitProblems } from '../../lib/roster.mjs';
import { placeIssue, sliceStates } from '../../lib/issue-place.mjs';
import { carrySlice } from '../../lib/slice-ops.mjs';
import { importPacketIssues, packetIssuesFile } from '../../lib/issue-apply.mjs';
import { issuesOf, readTalk } from '../../lib/talk.mjs';
import { CHECKS_FILE as CHECKS, fixRounds } from '../../lib/slice-checks.mjs';

const LIM = { maxSteps: 20, maxSlices: 3, targetSlices: 2, minSlices: 1, budgetSteps: 40 };
const row = (slug, more = {}) => ({ slug, status: 'defined', ...more });

function workflow() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-limits-'));
  const dir = path.join(root, 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active' } });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('roster: a slice over the step limit is refused; one that was over and shrank is not', () => {
  const f = workflow();
  try {
    const p = rosterLimitProblems(f.dir, [row('a', { 'estimated-steps': 25 })], LIM);
    assert.match(p[0], /slice a has estimated-steps 25; a slice has 20 steps or fewer \(slices\.maxSteps\): split it/);
    assert.deepEqual(rosterLimitProblems(f.dir, [row('a', { 'estimated-steps': 24 })], LIM, { stored: [row('a', { 'estimated-steps': 25 })] }), []);
    assert.deepEqual(rosterLimitProblems(f.dir, [row('a', { 'estimated-steps': 25, status: 'complete' })], LIM).filter((p) => /split it/.test(p)), [], 'a done slice is not split');
  } finally { f.done(); }
});

test('roster: more open slices than the limit, or more steps than the budget, is refused', () => {
  const f = workflow();
  try {
    const four = ['a', 'b', 'c', 'd'].map((s) => row(s, { 'estimated-steps': 5 }));
    assert.ok(rosterLimitProblems(f.dir, four, LIM).some((p) => /4 open slices; a packet has 3 or fewer/.test(p)));
    const heavy = ['a', 'b', 'c'].map((s) => row(s, { 'estimated-steps': 15 }));
    assert.ok(rosterLimitProblems(f.dir, heavy, LIM).some((p) => /comes to 45 steps; its budget is 40/.test(p)));
    // A slice of unknown size counts as full.
    assert.ok(rosterLimitProblems(f.dir, [row('a'), row('b'), row('c')], LIM).some((p) => /comes to 60 steps/.test(p)));
  } finally { f.done(); }
});

test('roster: a decision of the person accepts a roster over its limits', () => {
  const f = workflow();
  try {
    const four = ['a', 'b', 'c', 'd'].map((s) => row(s, { 'estimated-steps': 5 }));
    assert.deepEqual(rosterLimitProblems(f.dir, four, LIM, { override: 'D-9', decisions: [{ id: 'D-9', by: 'person' }] }), []);
    const bad = rosterLimitProblems(f.dir, four, LIM, { override: 'D-9', decisions: [{ id: 'D-9', by: 'delegate' }] });
    assert.match(bad.at(-1), /limit-override D-9 is not a live decision of the person/);
  } finally { f.done(); }
});

test('roster: record put refuses a roster over the limits of the project config', () => {
  const f = workflow();
  try {
    mkdirSync(path.join(f.root, '.ai'), { recursive: true });
    writeFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), JSON.stringify({ slices: { maxSteps: 10 } }));
    mkdirSync(path.join(f.dir, '.draft'), { recursive: true });
    const draft = path.join(f.dir, '.draft', '03-slice.md');
    writeFileSync(draft, '---\nschema: sdlc/v1\ntype: slice-index\nslug: demo\nslices:\n  - slug: a\n    status: defined\n    estimated-steps: 12\n---\n');
    const r = putChecked(f.dir, draft, { root: f.root });
    assert.match(r.errors[0], /the roster: slice a has estimated-steps 12; a slice has 10 steps or fewer/);
  } finally { f.done(); }
});

const STATES = sliceStates([{ slice: 'a', roster: 'in-progress', implement: 'in-progress' }, { slice: 'b', roster: 'defined' }]);
const inv = (over = {}) => ({
  cause: { file: 'x.ts', summary: 'the key', confidence: 'reproduced' }, reproduction: { command: 'npm test' },
  owner: { slice: null }, scope: { inside: true }, coverage: [{ slice: 'b', covers: true }], size: { steps: 4 },
  proposal: { slice: 'n', scope: 'the key', ac: ['it holds'] }, packetFit: { fits: true }, ...over,
});

test('placer: the room of a slice comes from the roster, not from the investigator', () => {
  const p = placeIssue(inv({ coverage: [{ slice: 'b', covers: true, stepsLeft: 20 }] }), { slices: STATES, room: { b: 2 } });
  assert.notEqual(p.rung, 3);
  assert.match(p.lower.find((l) => l.rung === 3).failed, /needs 4 steps and it has 2 left/);
});

test('placer: a packet at its budget sends the issue to the next packet, and a full next packet to the person', () => {
  const over = placeIssue(inv(), { slices: STATES, budget: { steps: 278, limit: 280 }, nextPacket: 'p2' });
  assert.deepEqual([over.rung, over.target, over.action], [6, 'p2', 'packet']);
  assert.match(over.lower.find((l) => l.rung === 3).failed, /over its budget of 280 steps/);
  const full = placeIssue(inv(), { slices: STATES, budget: { steps: 278, limit: 280 }, nextPacket: 'p2', nextPacketFull: 'it holds 280 steps of its budget of 280' });
  assert.equal(full.rung, 7);
  assert.match(full.lower.find((l) => l.rung === 6).failed, /the next packet is full/);
});

test('placer: a fix with no size fits no slice', () => {
  const p = placeIssue(inv({ size: {} }), { slices: STATES });
  assert.match(p.lower.find((l) => l.rung === 3).failed, /has no size/);
  assert.notEqual(p.rung, 5);
});

test('carry: the steps add to the estimate, and a carry past the limit is refused', () => {
  const f = workflow();
  try {
    writeDoc(f.dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', slices: [row('b', { 'estimated-steps': 15 })] } });
    writeDoc(f.dir, '03-slice-b.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'b', status: 'defined' }, body: '# Slice: b\n' });
    writeDoc(f.dir, '05i-issue-t1.md', { frontmatter: { type: 'issue-investigation', placement: { rung: 3, target: 'b', gate: null } } });
    writeDoc(f.dir, '05i-issue-t2.md', { frontmatter: { type: 'issue-investigation', placement: { rung: 3, target: 'b', gate: null } } });
    assert.throws(() => carrySlice(f.dir, 'b', { issue: 'T-1', text: 'x', placement: '05i-issue-t1.md', steps: 6, maxSteps: 20 }), /would pass the step limit of 20/);
    const r = carrySlice(f.dir, 'b', { issue: 'T-2', text: 'y', placement: '05i-issue-t2.md', steps: 3, maxSteps: 20 });
    assert.equal(r.estimatedSteps, 18);
    assert.equal(frontmatterOfDoc(f.dir, '03-slice.md').slices[0]['estimated-steps'], 18);
  } finally { f.done(); }
});

test('rung 6: the issues carried into a packet reach the talk of its workflow once', () => {
  const f = workflow();
  try {
    const workDir = path.join(f.root, 'work');
    mkdirSync(workDir, { recursive: true });
    const packet = { key: 'p2', slug: 'demo', workDir };
    writeFileSync(packetIssuesFile(packet), JSON.stringify({ packet: 'p2', issues: [{ issue: 'old:T-3', text: 'keeper reads no curl', record: 'old/05i-issue-t3.md', steps: 4 }] }));
    const ids = importPacketIssues(packet, f.dir);
    assert.equal(ids.length, 1);
    const issue = issuesOf(readTalk(f.dir))[0];
    assert.match(issue.text, /keeper reads no curl \(carried from old:T-3; its investigation is old\/05i-issue-t3\.md\)/);
    assert.equal(existsSync(packetIssuesFile(packet)), false, 'the file moved to history/');
    assert.equal(readdirSync(path.join(workDir, 'history')).length, 1);
    assert.deepEqual(importPacketIssues(packet, f.dir), []);
  } finally { f.done(); }
});

test('fix rounds: each commit at which a slice check failed is one round', () => {
  const f = workflow();
  try {
    const rows = [
      { at: '2026-11-27T01:00:00Z', slice: 'a', name: 'unit', result: 'not-met', sha: 's1' },
      { at: '2026-11-27T01:00:01Z', slice: 'a', name: 'lint', result: 'not-met', sha: 's1' },
      { at: '2026-11-27T02:00:00Z', slice: 'a', name: 'unit', result: 'not-met', sha: 's2' },
      { at: '2026-11-27T03:00:00Z', slice: 'a', name: 'unit', result: 'met', sha: 's3' },
      { at: '2026-11-26T00:00:00Z', slice: 'a', name: 'unit', result: 'not-met', sha: 's0' },
    ];
    writeFileSync(path.join(f.dir, CHECKS), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    assert.equal(fixRounds(f.dir, 'a', '2026-11-27T00:00:00Z'), 2);
    assert.equal(fixRounds(f.dir, 'a'), 3);
  } finally { f.done(); }
});

test('tripwire: a fix plan over 5 steps is put with a warning, not refused', () => {
  const f = workflow();
  try {
    writeDoc(f.dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', 'workflow-type': 'fix' } });
    mkdirSync(path.join(f.dir, '.draft'), { recursive: true });
    const draft = path.join(f.dir, '.draft', '04-plan.md');
    const steps = [1, 2, 3, 4, 5, 6].map((n) => `${n}. **S${n}** — files: \`a.js\`.`).join('\n');
    writeFileSync(draft, `---\nmetric-files-to-touch: 4\n---\n## Step-by-Step Plan\n\n${steps}\n`);
    const w = tripwireWarnings(draft, f.dir);
    assert.equal(w.length, 2);
    assert.match(w[0], /a fix plan has 6 steps, more than 5/);
  } finally { f.done(); }
});
