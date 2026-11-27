// The placement of an issue that a run found: the rungs of lib/issue-place.mjs, and
// `talk post --issue`, `issue place`, `slice carry` and `slice add` on a real workflow folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SLICE_STEP_LIMIT, issueRecordOf, placeIssue, sliceStates } from '../../lib/issue-place.mjs';
import { INDEX_NAME, frontmatterOfDoc, readDoc, writeDoc } from '../../lib/records.mjs';
import { issuesOf, post, readTalk } from '../../lib/talk.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: path.join(tmpdir(), 'sdlc-issue-home') } });

// a is being built, b and c wait.
const STATES = sliceStates([
  { slice: 'a', roster: 'in-progress', plan: 'complete', implement: 'in-progress' },
  { slice: 'b', roster: 'defined', plan: 'complete' },
  { slice: 'c', roster: 'defined' },
]);
const base = (over = {}) => ({
  cause: { file: 'src/cache.ts', line: 12, summary: 'the cache key leaves out the user', confidence: 'reproduced' },
  reproduction: { command: 'npm test -- cache', tail: '1 failing' },
  owner: { slice: null, insideCriteria: false },
  scope: { inside: true, cites: '02-shape AC-3' },
  coverage: [{ slice: 'b', covers: false, reason: 'b is the login form only' }, { slice: 'c', covers: false, reason: 'c is the docs' }],
  size: { steps: 3 },
  proposal: { slice: 'cache-key', scope: 'the cache key includes the user', ac: ['Given logout When login Then no stale page'] },
  ...over,
});

test('the owner slice that runs takes the issue in its own stage, or the next one', () => {
  const inv = base({ owner: { slice: 'a', insideCriteria: true } });
  const own = placeIssue(inv, { slices: STATES, reporter: 'implement:a' });
  assert.deepEqual([own.rung, own.target, own.action], [1, 'implement:a', 'deliver']);
  const other = placeIssue(inv, { slices: STATES, reporter: 'verify:z' });
  assert.equal(other.rung, 2);
  // Refused by it: one rung higher, and the refusal is named.
  const up = placeIssue(inv, { slices: STATES, reporter: 'implement:a', above: 1 });
  assert.notEqual(up.rung, 1);
  assert.match(up.lower[0].failed, /did not take it/);
});

test('the next slice whose scope covers the issue takes it; a full slice passes it on', () => {
  const next = placeIssue(base({ coverage: [{ slice: 'b', covers: true, cites: 'b AC-2' }, { slice: 'c', covers: false, reason: 'docs' }] }), { slices: STATES });
  assert.deepEqual([next.rung, next.target, next.action], [3, 'b', 'carry']);
  const later = placeIssue(base({ coverage: [{ slice: 'b', covers: false, reason: 'form only' }, { slice: 'c', covers: true }] }), { slices: STATES });
  assert.deepEqual([later.rung, later.target], [4, 'c']);
  assert.match(later.lower.find((l) => l.rung === 3).failed, /form only/);
  const full = placeIssue(base({ size: { steps: 6 }, coverage: [{ slice: 'b', covers: true, stepsLeft: 2 }, { slice: 'c', covers: false, reason: 'docs' }] }), { slices: STATES });
  assert.equal(full.rung, 5, 'the covering slice is full, so the proof gate decides');
  assert.match(full.lower.find((l) => l.rung === 3).failed, new RegExp(`needs 6 steps and it has 2 left of ${SLICE_STEP_LIMIT}`));
});

test('a new slice needs the proof gate; without it the person decides', () => {
  const add = placeIssue(base(), { slices: STATES });
  assert.deepEqual([add.rung, add.target, add.action, add.gate.pass], [5, 'cache-key', 'add', true]);
  const suspected = placeIssue(base({ cause: { summary: 'x', confidence: 'suspected' } }), { slices: STATES });
  assert.equal(suspected.status, 'ask');
  assert.equal(suspected.rung, 7);
  assert.match(suspected.lower.find((l) => l.rung === 5).failed, /not reproduced/);
  const covered = placeIssue(base({ coverage: [{ slice: 'b', covers: true }, { slice: 'c', covers: false, reason: 'docs' }] }), { slices: STATES, above: 3 });
  assert.equal(covered.status, 'ask', 'a covering slice with room refused it: no new slice');
  assert.match(covered.gate.failed.join(';'), /'b' covers it and has room/);
});

test('outside the confirmed scope always goes to the person, even when the gate would hold', () => {
  const p = placeIssue(base({ scope: { inside: false, cites: 'shape out-of-scope: offline mode' } }), { slices: STATES });
  assert.equal(p.status, 'ask');
  assert.equal(p.action, 'hold');
  assert.match(p.ask.question, /outside the confirmed scope/);
  assert.match(p.why, /offline mode/);
});

test('an investigation that misses a slice runs again, then goes to the person', () => {
  const inv = base({ coverage: [{ slice: 'b', covers: false, reason: 'x' }] });
  const first = placeIssue(inv, { slices: STATES });
  assert.equal(first.status, 'incomplete');
  assert.deepEqual(first.missing, ['coverage of c']);
  assert.equal(placeIssue(inv, { slices: STATES, final: true }).status, 'ask');
});

test('the slug-wide review takes an issue when no slice is left; the next packet before a new one', () => {
  const doneStates = sliceStates([{ slice: 'a', roster: 'complete' }, { slice: 'b', roster: 'complete' }]);
  const review = placeIssue(base({ coverage: [] }), { slices: doneStates, reviewOpen: true });
  assert.deepEqual([review.rung, review.target], ['4b', 'review:slug-wide']);
  const packet = placeIssue(base({ cause: { summary: 'x', confidence: 'suspected' }, packetFit: { fits: true, cites: 'P3 scope' } }), { slices: STATES, nextPacket: 'p3' });
  assert.deepEqual([packet.rung, packet.target, packet.action], [6, 'p3', 'packet']);
});

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-issue-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'implement', slices: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }] } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', slices: [{ slug: 'a', status: 'in-progress' }, { slug: 'b', status: 'defined' }, { slug: 'c', status: 'defined' }] } });
  for (const s of ['a', 'b', 'c']) writeDoc(dir, `03-slice-${s}.md`, { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': s, status: 'defined', 'ux-impact': 'none' }, body: `# Slice: ${s}\n\n## Scope\n\n${s}\n` });
  writeDoc(dir, '04-plan-a.md', { frontmatter: { status: 'complete' } });
  writeDoc(dir, '05-implement-a.md', { frontmatter: { status: 'in-progress' } });
  writeDoc(dir, '04-plan-b.md', { frontmatter: { status: 'complete', 'updated-at': '2026-11-01T00:00:00Z' } });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('talk post --issue goes to the driver, and a second report with the same refs joins its thread', () => {
  const f = fixture();
  try {
    const one = run(['talk', 'post', f.root, 'demo', '--as', 'implement:a', '--issue', '--text', 'stale page after logout', '--refs', 'src/cache.ts']);
    assert.equal(one.status, 0, one.stderr);
    const two = run(['talk', 'post', f.root, 'demo', '--as', 'verify:a', '--issue', '--text', 'same stale page', '--refs', 'src/cache.ts']);
    assert.match(two.stdout, /the same issue is open as T-1/);
    const issues = issuesOf(readTalk(f.dir));
    assert.equal(issues.length, 1);
    assert.deepEqual(issues[0].to, ['driver']);
    assert.equal(issues[0].reports, 2);
    const list = run(['talk', 'read', f.root, 'demo', '--as', 'session', '--issues']);
    assert.match(list.stdout, /T-1 .* implement:a \(2 reports\): stale page after logout \{src\/cache\.ts\}/);
  } finally { f.done(); }
});

test('issue place --apply carries the issue into the covering slice once, and closes the thread', () => {
  const f = fixture();
  try {
    const id = post(f.dir, { by: 'implement:a', issue: true, text: 'stale page after logout', refs: ['src/cache.ts'] }).entry.id;
    const record = issueRecordOf('t1');
    assert.match(run(['issue', 'place', f.root, 'demo', id]).stderr, /no investigation/);
    writeDoc(f.dir, record, { frontmatter: { type: 'issue-investigation', issue: id, ...base({ coverage: [{ slice: 'b', covers: true, cites: 'b scope' }, { slice: 'c', covers: false, reason: 'docs' }] }) }, body: '# Investigation\n' });
    const r = run(['issue', 'place', f.root, 'demo', id, '--apply', '--running', 'implement:a', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual([out.placement.rung, out.placement.target, out.closed], [3, 'b', true]);
    const b = readDoc(f.dir, '03-slice-b.md');
    assert.equal(b.frontmatter['carried-issues'][0].placement, record);
    assert.ok(b.frontmatter['carried-at'] > '2026-11-01', 'carried after the plan, so the plan is refreshed');
    assert.match(b.body, /## Carried Issues[\s\S]*T-1: the cache key leaves out the user/);
    assert.ok(issuesOf(readTalk(f.dir))[0].closed);
    const again = run(['issue', 'place', f.root, 'demo', id, '--apply', '--json']);
    assert.equal(JSON.parse(again.stdout).already, true);
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-b.md')['carried-issues'].length, 1);
    // slice carry with no placement, or a placement of another slice, is refused.
    assert.match(run(['slice', 'carry', f.root, 'demo', 'c', '--issue', id, '--text', 'x']).stderr, /--placement/);
    assert.match(run(['slice', 'carry', f.root, 'demo', 'c', '--issue', id, '--text', 'x', '--placement', record]).stderr, /places the issue into b, not c/);
  } finally { f.done(); }
});

test('issue place --apply adds a slice at rung 5 once; slice add refuses without the gate', () => {
  const f = fixture();
  try {
    const id = post(f.dir, { by: 'verify:a', issue: true, text: 'keeper reads no curl', refs: ['src/keeper.ts'] }).entry.id;
    const record = issueRecordOf('t1');
    writeDoc(f.dir, record, { frontmatter: { type: 'issue-investigation', issue: id, ...base({ owner: { slice: 'a', insideCriteria: false }, proposal: { slice: 'cache-key', scope: 'the cache key includes the user', ac: ['Given logout, When login, Then no stale page'], before: ['c'] } }) } });
    assert.match(run(['slice', 'add', f.root, 'demo', 'cache-key', '--scope', 's', '--ac', 'x']).stderr, /--placement/);
    const r = run(['issue', 'place', f.root, 'demo', id, '--apply', '--running', 'verify:a', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).placement.rung, 5);
    const roster = frontmatterOfDoc(f.dir, '03-slice.md').slices;
    assert.deepEqual(roster.find((s) => s.slug === 'cache-key'), { slug: 'cache-key', status: 'defined', complexity: 's', 'depends-on': ['a'], 'made-for': 't1' });
    assert.deepEqual(roster.find((s) => s.slug === 'c')['depends-on'], ['cache-key'], 'the slice that waits for it');
    const rec = readDoc(f.dir, '03-slice-cache-key.md');
    assert.match(rec.body, /- Given logout, When login, Then no stale page/, 'a criterion with commas stays one criterion');
    const again = run(['slice', 'add', f.root, 'demo', 'cache-key', '--scope', 's', '--ac', 'x', '--placement', record, '--json']);
    assert.equal(JSON.parse(again.stdout).already, true);
    assert.equal(frontmatterOfDoc(f.dir, '03-slice.md').slices.filter((s) => s.slug === 'cache-key').length, 1);
  } finally { f.done(); }
});

test('an issue outside the scope is held for the person, and the answer places it', () => {
  const f = fixture();
  try {
    const id = post(f.dir, { by: 'implement:a', issue: true, text: 'offline mode drops saves' }).entry.id;
    const record = issueRecordOf('t1');
    writeDoc(f.dir, record, { frontmatter: { type: 'issue-investigation', issue: id, ...base({ scope: { inside: false, cites: 'out of scope: offline' } }) } });
    const held = JSON.parse(run(['issue', 'place', f.root, 'demo', id, '--apply', '--json']).stdout);
    assert.equal(held.placement.status, 'ask');
    assert.ok(frontmatterOfDoc(f.dir, INDEX_NAME)['open-questions'].some((q) => q.key === 'issue-t1'));
    assert.equal(JSON.parse(run(['issue', 'place', f.root, 'demo', id, '--apply', '--json']).stdout).waiting, 'issue-t1');
    assert.equal(run(['decide', 'add', f.root, 'demo', '--key', 'issue-t1', '--answer', 'Park it', '--by', 'person']).status, 0);
    const parked = JSON.parse(run(['issue', 'place', f.root, 'demo', id, '--apply', '--json']).stdout);
    assert.equal(parked.placement.action, 'park');
    assert.ok(issuesOf(readTalk(f.dir))[0].closed);
  } finally { f.done(); }
});

test('status gives each slice what a driver needs to take an added one', () => {
  const f = fixture();
  try {
    const s = JSON.parse(run(['status', f.root, 'demo', '--json']).stdout);
    const rows = Object.fromEntries(s.slices.map((r) => [r.slice, r]));
    assert.equal(rows.c.fresh, true);
    assert.equal(rows.a.fresh, false);
    assert.equal(rows.c.uxImpact, 'none');
    assert.equal(rows.b.planAt, '2026-11-01T00:00:00Z');
  } finally { f.done(); }
});

test('campaign: a packet whose run left an open issue is not built until the issue is placed', async () => {
  const f = fixture();
  try {
    const { openIssues } = await import('../../scripts/campaign.mjs');
    assert.deepEqual(openIssues(f.root, 'demo'), []);
    const id = post(f.dir, { by: 'implement:a', issue: true, text: 'stale page', refs: ['src/cache.ts'] }).entry.id;
    assert.deepEqual(openIssues(f.root, 'demo').map((i) => [i.id, i.investigated, i.held]), [[id, false, false]], 'the driver has not investigated it: the walk launches it again');
    writeDoc(f.dir, issueRecordOf('t1'), { frontmatter: { type: 'issue-investigation', issue: id, ...base({ scope: { inside: false, cites: 'out' } }) }, body: '# Investigation\n' });
    assert.equal(run(['issue', 'place', f.root, 'demo', id, '--apply', '--final']).status, 0);
    const [held] = openIssues(f.root, 'demo');
    assert.deepEqual([held.investigated, held.held, held.answered], [true, true, false]);
  } finally { f.done(); }
});
