// The board commands: add, move, regroup and remove change the brainstorm board in one call
// each, and a change that would break the board writes nothing. A new decision is kept at once,
// the close part of a change scopes whole areas, and the digest reads the scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INDEX_NAME, writeDoc } from '../../lib/records.mjs';
import { AREAS_PER_QUESTION, DIGEST_CEILING, QUESTION_TEXT_BUDGET, applyChange, closeAreas, digestOf, planDigestQuestions } from '../../lib/board-ops.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: path.join(tmpdir(), 'sdlc-board-home') } });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-board-'));
  const dir = path.join(root, '.ai', 'workflows', 'ideas');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'ideas', status: 'active', 'workflow-type': 'brainstorm' } });
  const doc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  const board = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(doc)[1]);
  Object.assign(board, { slug: 'ideas', 'updated-at': '2026-10-25T10:00:00Z' });
  const file = path.join(dir, 'brainstorm-board.json');
  writeFileSync(file, JSON.stringify(board, null, 2));
  return { root, dir, read: () => JSON.parse(readFileSync(file, 'utf8')), done: () => rmSync(root, { recursive: true, force: true }) };
}

test('board add, move into a new thread, regroup and remove', () => {
  const f = fixture();
  try {
    const add = run(['board', 'add', f.root, 'ideas', 'item', '--key', 'cap-per-run', '--kind', 'idea', '--thread', 'limit-per-project', '--text', 'A cap per run.', '--source', 'person']);
    assert.equal(add.status, 0, add.stderr);
    assert.ok(f.read().items.some((i) => i.key === 'cap-per-run'));
    const move = run(['board', 'move', f.root, 'ideas', 'cap-per-run', 'limit-is-one-number', '--new', 'caps', '--name', 'Spending caps', '--area', 'seeing-the-cost']);
    assert.equal(move.status, 0, move.stderr);
    const b = f.read();
    assert.deepEqual(b.threads.find((t) => t.key === 'caps'), { key: 'caps', name: 'Spending caps', area: 'seeing-the-cost', state: 'live', 'routed-to': null });
    assert.deepEqual(b.items.filter((i) => i.thread === 'caps').map((i) => i.key), ['limit-is-one-number', 'cap-per-run']);
    assert.equal(run(['board', 'add', f.root, 'ideas', 'area', '--key', 'limits', '--name', 'Limits', '--side', 'solution']).status, 0);
    assert.equal(run(['board', 'regroup', f.root, 'ideas', 'caps', '--to', 'limits']).status, 0);
    assert.equal(f.read().threads.find((t) => t.key === 'caps').area, 'limits');
    assert.equal(run(['board', 'remove', f.root, 'ideas', 'cap-per-run']).status, 0);
    assert.ok(!f.read().items.some((i) => i.key === 'cap-per-run'));
  } finally { f.done(); }
});

test('board refusals: a used key, a missing thread, an item that another entry names, and a change that breaks the schema', () => {
  const f = fixture();
  try {
    const before = JSON.stringify(f.read());
    assert.match(run(['board', 'add', f.root, 'ideas', 'item', '--key', 'ledger-format', '--kind', 'idea', '--text', 'x', '--source', 'person']).stderr, /the key ledger-format is in use/);
    assert.match(run(['board', 'move', f.root, 'ideas', 'ledger-format', '--to', 'nope']).stderr, /no thread nope; the threads are: limit-per-project/);
    assert.match(run(['board', 'remove', f.root, 'ideas', 'limit-warns-only']).stderr, /limit-warns-only is named by .*budget monthly-spend-cap/);
    const bad = run(['board', 'add', f.root, 'ideas', 'item', '--key', 'odd', '--kind', 'wish', '--text', 'x', '--source', 'person']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /the change would break the board, so nothing is written/);
    assert.equal(JSON.stringify(f.read()), before, 'no refused change touched the board');
  } finally { f.done(); }
});

// ---------------------------------------------------------------- scope as you go, the close and the digest

/** The example board of the reference, with its area not closed and one idea not decided. */
function openBoard() {
  const doc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  const board = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(doc)[1]);
  board.areas[0].scope = null;
  board.items.push({ key: 'red-warning', kind: 'idea', thread: 'limit-per-project', text: 'The warning is red.', source: 'agent' });
  return board;
}

test('a new decision is kept at once; an explicit scope says the person said otherwise', () => {
  const { board } = applyChange(openBoard(), { add: { item: [
    { key: 'warn-at-ninety', kind: 'decision', thread: 'limit-per-project', text: 'Warn at ninety percent.', source: 'person' },
    { key: 'warn-by-mail', kind: 'decision', thread: 'limit-per-project', text: 'Warn by mail too.', source: 'person', scope: 'later' },
    { key: 'warn-sound', kind: 'idea', thread: 'limit-per-project', text: 'A sound with the warning.', source: 'agent' },
  ] } });
  const by = (k) => board.items.find((i) => i.key === k);
  assert.equal(by('warn-at-ninety').scope, 'keep');
  assert.equal(by('warn-by-mail').scope, 'later');
  assert.equal(by('warn-sound').scope, undefined, 'an idea stays undecided');
});

test('the digest gives each area its scope, its open items and a proposal for each item not settled', () => {
  const d = digestOf(openBoard(), { full: true });
  const a = d.areas[0];
  assert.equal(a.closed, false);
  assert.deepEqual(d['not-closed'], ['seeing-the-cost']);
  assert.deepEqual(a.kept.map((i) => i.key), ['limit-warns-only']);
  assert.deepEqual(a.later.map((i) => i.key), ['no-limit-on-research']);
  assert.deepEqual(a.undecided.map((i) => i.key), ['red-warning']);
  assert.deepEqual(a.open.map((i) => [i.key, i.handling]), [['limit-is-one-number', null], ['one-number-vs-warn-only', null], ['ledger-format', null]]);
  assert.deepEqual(a.proposed, { 'limit-is-one-number': 'decide', 'one-number-vs-warn-only': 'ask', 'ledger-format': 'decide', 'red-warning': 'later' });
  assert.equal(d.totals.unsettled, 4);
});

test('a close scopes an area in one step: defaults, the marks of the person, the area scope, and a preview', () => {
  const board = openBoard();
  const close = { areas: 'open', marks: { 'red-warning': 'keep', 'ledger-format': 'ask', 'limit-is-one-number': { state: 'confirmed' } } };
  const preview = digestOf(board, { close });
  assert.equal(preview.preview, true);
  assert.equal(board.areas[0].scope, null, 'a preview changes nothing');
  const next = closeAreas(board, close);
  const by = (k) => next.items.find((i) => i.key === k);
  assert.equal(by('red-warning').scope, 'keep');
  assert.equal(by('ledger-format')['left-to-build'], 'ask');
  assert.equal(by('limit-is-one-number').state, 'confirmed');
  assert.equal(by('one-number-vs-warn-only')['left-to-build'], 'ask', 'the default of a tension');
  assert.equal(by('no-limit-on-research').scope, 'later', 'a settled item keeps its scope');
  assert.equal(next.areas[0].scope, 'mixed');
  const d = digestOf(next);
  assert.equal(d.areas[0].closed, true);
  assert.deepEqual(d['not-closed'], []);
  assert.deepEqual(d.areas[0], preview.areas[0], 'the preview shows what the close writes');
});

test('a close: a mark on the area, a cut of started work, and the refusals', () => {
  const board = openBoard();
  const cutAll = closeAreas(board, { areas: ['seeing-the-cost'], marks: { 'seeing-the-cost': 'cut' } });
  assert.equal(cutAll.areas[0].scope, 'cut');
  assert.ok(cutAll.items.filter((i) => ['decision', 'idea'].includes(i.kind) && !i['replaced-by']).every((i) => i.scope === 'cut'));
  assert.equal(cutAll.items.find((i) => i.key === 'ledger-format').scope, 'cut', 'a cut area drops its open items');
  const started = { ...board, work: [{ key: 'spending-limit', title: 'Limit', shape: 'intake', entry: '/wf campaign x', state: 'open', items: ['limit-warns-only'] }] };
  assert.equal(closeAreas(started, { areas: 'open', marks: { 'limit-warns-only': 'cut' } }).items.find((i) => i.key === 'limit-warns-only').scope, 'pending-cut');
  assert.throws(() => closeAreas(board, { areas: 'open', marks: { 'ledger-format': 'keep' } }), /keep does not fit the question ledger-format/);
  assert.throws(() => closeAreas(board, { areas: 'open', marks: { nope: 'keep' } }), /no item or closed area nope/);
  assert.throws(() => closeAreas(board, { areas: ['nope'] }), /no area nope/);
  assert.throws(() => closeAreas(board, { areas: 'open', mark: {} }), /mark is not a part of a close/);
  const two = { ...board, areas: [...board.areas, { key: 'other', name: 'Other', state: 'open' }] };
  assert.throws(() => closeAreas(two, { areas: ['other'], marks: { 'red-warning': 'keep' } }), /red-warning is not in the areas this close scopes/);
});

test('board apply with a close part and board digest on disk; a digest writes nothing', () => {
  const f = fixture();
  try {
    const b = f.read();
    b.areas[0].scope = null;
    writeFileSync(path.join(f.dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const before = readFileSync(path.join(f.dir, 'brainstorm-board.json'), 'utf8');
    const close = path.join(f.root, 'close.json');
    writeFileSync(close, JSON.stringify({ areas: 'open', marks: { 'ledger-format': 'ask' } }));
    const digest = run(['board', 'digest', f.root, 'ideas', '--json']);
    assert.equal(digest.status, 0, digest.stderr);
    assert.deepEqual(JSON.parse(digest.stdout)['not-closed'], ['seeing-the-cost']);
    const preview = run(['board', 'digest', f.root, 'ideas', '--file', close, '--json']);
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout)['not-closed'], []);
    assert.equal(readFileSync(path.join(f.dir, 'brainstorm-board.json'), 'utf8'), before, 'a digest writes nothing');
    const change = path.join(f.root, 'change.json');
    writeFileSync(change, JSON.stringify({ close: JSON.parse(readFileSync(close, 'utf8')), add: { log: [{ batch: 9, thread: null, kind: 'walk', asked: 'scope digest', answer: 'this is right' }] } }));
    const apply = run(['board', 'apply', f.root, 'ideas', '--file', change]);
    assert.equal(apply.status, 0, apply.stderr);
    const after = f.read();
    assert.equal(after.areas[0].scope, 'mixed');
    assert.equal(after.items.find((i) => i.key === 'ledger-format')['left-to-build'], 'ask');
    // --area gives the item texts of one area; the default gives only what is not settled.
    const area = run(['board', 'digest', f.root, 'ideas', '--area', 'seeing-the-cost', '--json']);
    assert.equal(area.status, 0, area.stderr);
    const one = JSON.parse(area.stdout);
    assert.equal(one.view, 'area');
    assert.deepEqual(one.areas.map((a) => a.key), ['seeing-the-cost']);
    assert.ok(one.areas[0].kept.some((i) => i.key === 'limit-warns-only'));
    const compact = JSON.parse(run(['board', 'digest', f.root, 'ideas', '--json']).stdout);
    assert.equal(compact.view, 'compact');
    assert.deepEqual(compact.areas[0].look, [], 'nothing is left to look at');
    assert.match(run(['board', 'digest', f.root, 'ideas', '--area', 'nope']).stderr, /no area nope/);
  } finally { f.done(); }
});

/**
 * An invented large board: `areas` areas, each with `kept` kept decisions, and `unsettled[n]` ideas
 * not decided in area n. The areas have no scope, as on a board written before areas closed.
 */
function largeBoard({ areas = 60, kept = 25, unsettled = [], text = 60 } = {}) {
  const b = { schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'big', topic: 'a large invented board', areas: [], threads: [], items: [], work: [] };
  const words = (n, k) => `Invented item ${n} of area ${k}, ${'with filler words '.repeat(8)}`.slice(0, text);
  for (let a = 0; a < areas; a++) {
    b.areas.push({ key: `area-${a}`, name: `Area number ${a} of the invented board`, state: 'explored' });
    b.threads.push({ key: `thread-${a}`, name: `Thread ${a}`, area: `area-${a}`, state: 'live' });
    for (let i = 0; i < kept; i++) b.items.push({ key: `kept-${a}-${i}`, kind: 'decision', thread: `thread-${a}`, text: words(i, a), source: 'person', scope: 'keep' });
    for (let i = 0; i < (unsettled[a] ?? 0); i++) b.items.push({ key: `idea-${a}-${i}`, kind: 'idea', thread: `thread-${a}`, text: words(i, a), source: 'agent' });
  }
  for (let w = 0; w < 100; w++) b.work.push({ key: `packet-${w}`, order: w + 1, title: `An invented work packet number ${w} with a long title`, shape: 'intake', entry: '/wf campaign big', state: 'done', items: [] });
  return b;
}

test('the default digest is compact: counts for settled items, texts only of what to look at, and an area of all settled items has no look', () => {
  const b = largeBoard({ areas: 6, kept: 10, unsettled: [0, 3] });
  const d = digestOf(b);
  assert.equal(d.view, 'compact');
  assert.equal(d.totals.kept, 60);
  assert.equal(d.totals.unsettled, 3);
  assert.deepEqual(d['to-look'], ['area-1']);
  assert.equal(d['not-closed'].length, 6, 'no area of an old board has a scope');
  const a0 = d.areas.find((a) => a.key === 'area-0');
  assert.deepEqual(a0.counts, { kept: 10 });
  assert.deepEqual(a0.look, []);
  assert.ok(!('kept' in a0), 'no settled item text');
  const a1 = d.areas.find((a) => a.key === 'area-1');
  assert.deepEqual(a1.look.map((i) => [i.key, i.proposed]), [['idea-1-0', 'later'], ['idea-1-1', 'later'], ['idea-1-2', 'later']]);
  assert.deepEqual(d.work, { packets: 100, states: { done: 100 }, open: [] });
  assert.ok(JSON.stringify(d).length < JSON.stringify(digestOf(b, { full: true })).length / 5);
  const only = digestOf(b, { areas: ['area-1'] });
  assert.deepEqual(only.areas.map((a) => a.key), ['area-1']);
  assert.equal(only.areas[0].kept.length, 10);
  assert.throws(() => digestOf(b, { areas: ['nope'] }), /no area nope/);
});

test('the default digest stays under its ceiling on a large board, and says what it left out', () => {
  const unsettled = Array.from({ length: 120 }, (_, n) => (n % 2 ? 6 : 0));
  const b = largeBoard({ areas: 120, kept: 30, unsettled, text: 200 });
  const fullSize = JSON.stringify(digestOf(b, { full: true })).length;
  const d = digestOf(b);
  const size = JSON.stringify(d).length;
  assert.ok(fullSize > 10 * DIGEST_CEILING, `the invented board is large: ${fullSize}`);
  assert.ok(size <= DIGEST_CEILING, `the default digest is ${size} characters`);
  assert.match(d.truncated, /--area <key>/);
  assert.ok(d.areas.some((a) => a['look-omitted']), 'some texts are left out');
  assert.equal(d.totals.unsettled, 360, 'the totals stay whole');
  assert.equal(d.questions.reduce((n, q) => n + q.items, 0), 360, 'the plan stays whole');
});

test('the questions of done: only areas to look at, largest first, at most four areas, the text budget, and an area too large for one question', () => {
  const areas = (sizes, text = 100) => sizes.map((n, k) => ({ key: `a${k}`, look: Array.from({ length: n }, (_, i) => ({ key: `a${k}-${i}`, text: 'x'.repeat(text) })) }));
  // Six small areas: four in the first question, the two others in the second; the area with nothing to look at is in none.
  const small = planDigestQuestions(areas([1, 2, 3, 4, 5, 6, 0]));
  assert.deepEqual(small.questions.map((q) => q.areas), [['a5', 'a4', 'a3', 'a2'], ['a1', 'a0']]);
  assert.equal(small.batches, 1);
  assert.ok(small.questions.every((q) => q.areas.length <= AREAS_PER_QUESTION));
  // The budget closes a question before four areas: 3 areas of 10 items of 140 characters is over 4,000.
  const big = planDigestQuestions(areas([10, 10, 10]));
  assert.deepEqual(big.questions.map((q) => q.areas), [['a0', 'a1'], ['a2']]);
  assert.ok(big.questions.every((q) => q.chars <= QUESTION_TEXT_BUDGET));
  // An area larger than one question takes questions of its own, its items in order.
  const huge = planDigestQuestions(areas([70, 1]));
  const own = huge.questions.filter((q) => q.areas[0] === 'a0');
  assert.equal(own.length, 3);
  assert.deepEqual(own.map((q) => [q.part, q.of]), [[1, 3], [2, 3], [3, 3]]);
  assert.deepEqual(own.flatMap((q) => q.items), Array.from({ length: 70 }, (_, i) => `a0-${i}`));
  assert.deepEqual(huge.questions.at(-1).areas, ['a1']);
  // Seventeen areas of one item each: five questions of four areas or fewer, in two batches.
  const many = planDigestQuestions(areas(Array(17).fill(1)));
  assert.equal(many.questions.length, 5);
  assert.equal(many.batches, 2);
  assert.equal(planDigestQuestions(areas([0, 0])).questions.length, 0, 'nothing to look at asks nothing');
});

test('close "open" on a large old board is one step and settles every area', () => {
  const b = largeBoard({ areas: 65, kept: 25, unsettled: [3, 0, 5, 0, 2] });
  const t = Date.now();
  const { board } = applyChange(b, { close: { areas: 'open' } });
  assert.ok(Date.now() - t < 2000, 'the close is quick');
  assert.ok(board.areas.every((a) => a.scope === 'keep' || a.scope === 'mixed'));
  assert.deepEqual(digestOf(board)['not-closed'], []);
  assert.equal(board.items.filter((i) => i.kind === 'idea' && i.scope === 'later').length, 10);
});
