// The person's document of a brainstorm is rendered from the board: the renderer, the adopt of a
// hand-written document, the re-render of every board command, the documents of slug-mode and
// design boards, and the schema of the new board fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DERIVED, MARKER, adoptBody, coverIndex, isCovered, isPlaceholder, prepareDocument, renderArchive, renderBody, scrubKeys, sentencesOf } from '../../../lib/brainstorm-doc.mjs';
import { applyChange } from '../../../lib/board-ops.mjs';
import { INDEX_NAME, readDoc, writeDoc } from '../../../lib/records.mjs';
import { validateBrainstormBoard } from '../../../lib/schema-validator.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: path.join(tmpdir(), 'sdlc-board-doc-home') } });

const exampleBoard = () => {
  const doc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  return { ...JSON.parse(/```json\n([\s\S]*?)\n```/.exec(doc)[1]), 'updated-at': '2026-10-25T10:00:00Z' };
};

const emptyBoard = () => ({ schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'ideas', topic: 'a spending limit', areas: [], threads: [], items: [] });

/** A board with two areas, every item kind, a replaced decision, a closed area and a sketch. */
function fullBoard() {
  return {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'ideas', topic: 'a spending limit', sessions: 2, batches: 4, focus: 'design',
    summary: 'A limit warns and never blocks, and research runs stay free for now.',
    stories: [{ session: 1, text: 'We set out to see what a project costs.', date: '2026-11-01' }, { session: 2, text: 'We chose the warning.', date: '2026-11-02' }],
    areas: [
      { key: 'seeing-the-cost', name: 'Seeing what a project costs', side: 'problem', state: 'explored', brief: 'A limit warns. Core: the warning.', scope: 'keep' },
      { key: 'old-billing', name: 'Billing by seat', side: 'solution', state: 'explored', brief: 'We left billing aside.' },
    ],
    threads: [
      { key: 'limit-per-project', name: 'A spending limit per project', area: 'seeing-the-cost', state: 'live', 'routed-to': null },
      { key: 'seat-billing', name: 'Seats as the unit of billing', area: 'old-billing', state: 'dropped', reason: 'the product sells no seats' },
    ],
    items: [
      { key: 'limit-warns-only', kind: 'decision', thread: 'limit-per-project', text: 'A limit warns and never blocks work.', why: 'A blocked run loses paid work.', source: 'person', core: true, 'first-version': true, scope: 'keep' },
      { key: 'limit-blocks-runs', kind: 'decision', thread: 'limit-per-project', text: 'A limit stops a run when it is reached.', source: 'person', 'replaced-by': 'limit-warns-only' },
      { key: 'no-limit-on-research', kind: 'decision', thread: 'limit-per-project', text: 'Research runs have no limit.', source: 'person', 'accepted-risk': 'One research run can spend a month in a day.', 'top-risk': true, scope: 'later' },
      { key: 'limit-per-step', kind: 'idea', thread: 'limit-per-project', text: 'A limit per step of a run.', source: 'agent' },
      { key: 'cost-rows-per-run', kind: 'finding', thread: 'limit-per-project', text: 'The ledger records one row per run.', source: 'code', evidence: 'lib/cost-ledger.mjs:12', check: 'verified' },
      { key: 'limit-is-one-number', kind: 'assumption', thread: 'limit-per-project', text: 'A limit is one number per project.', source: 'agent', state: 'named', 'left-to-build': 'decide' },
      { key: 'one-number-vs-warn', kind: 'tension', thread: 'limit-per-project', text: 'One number pulls against warnings per kind of run.', between: ['limit-is-one-number', 'limit-warns-only'], source: 'agent', state: 'open' },
      { key: 'ledger-format', kind: 'question', thread: 'limit-per-project', text: 'Which format does the export use?', source: 'agent', state: 'for-plan' },
      { key: 'warning-place', kind: 'question', thread: 'limit-per-project', text: 'Where does the warning show?', source: 'agent', state: 'open' },
      { key: 'seat-price', kind: 'idea', thread: 'seat-billing', text: 'A price per seat.', source: 'person', scope: 'cut', reason: 'no seats' },
    ],
    sketches: [{ key: 'warning-toast', thread: 'limit-per-project', items: ['limit-warns-only'], link: null, path: '.ai/design/explore/warning-toast.html', caption: 'A quiet toast at the top.', state: 'idea' }],
    work: [],
    log: [],
  };
}

/** Every key of a board, for the plain-words check. */
function keysOf(board) {
  return [...['areas', 'threads', 'items', 'work', 'budgets', 'briefs'].flatMap((f) => (board[f] ?? []).map((x) => x.key))].filter(Boolean);
}

/** The text a person reads: no comment, no code span, no link target. */
const readable = (md) => md.replace(/<!--[\s\S]*?-->/g, '').replace(/`[^`]*`/g, '').replace(/\]\([^)]*\)/g, ']');

test('an empty board renders every section with a plain placeholder', () => {
  const body = renderBody(emptyBoard(), { slug: 'ideas' });
  assert.match(body, /^# Brainstorm: a spending limit\n/);
  assert.ok(body.includes(MARKER));
  for (const h of ['The Brainstorm', 'Map', 'Open now', 'Briefs', 'Sessions', 'Decisions', 'Ideas still open', 'What we found', 'What we are assuming', 'Tensions', 'Questions for the plan', 'How to continue']) {
    assert.match(body, new RegExp(`^## ${h}$`, 'm'), `## ${h}`);
  }
  assert.match(body, /Not summed up yet\./);
  assert.match(body, /Nothing is open\./);
  assert.doesNotMatch(body, /^## Scope$/m, 'no scope before done');
  assert.doesNotMatch(body, /^## Sketches$/m, 'no sketches without a design focus');
});

test('a board with every item kind renders each in its section, in plain words, with no key', () => {
  const board = fullBoard();
  const body = renderBody(board, { slug: 'ideas' });
  const section = (h) => new RegExp(`^## ${h}\\n([\\s\\S]*?)(?=^## )`, 'm').exec(body)?.[1] ?? '';
  assert.match(section('The Brainstorm'), /A limit warns and never blocks, and research/);
  assert.match(section('Map'), /### Seeing what a project costs — the problem side — explored\nA limit warns\. Core: the warning\./);
  assert.match(section('Map'), /Seats as the unit of billing \(dropped: the product sells no seats\)/);
  assert.match(section('Open now'), /- Tension: One number pulls/);
  assert.match(section('Open now'), /- Risk: One research run can spend a month in a day\. It comes with the decision: Research runs have no limit\./);
  assert.match(section('Open now'), /- Question: Where does the warning show\?/);
  assert.doesNotMatch(section('Open now'), /export/, 'a question for the plan is not open now');
  assert.match(section('Sessions'), /### Session 2 — 2026-11-02\nWe chose the warning\.\n\n### Session 1 — 2026-11-01/, 'newest first');
  assert.match(section('Decisions'), /### Seeing what a project costs\n- A limit warns and never blocks work\. Why: A blocked run loses paid work\. Core\. First version\./);
  assert.match(section('Ideas still open'), /- A limit per step of a run\. The agent raised it\./);
  assert.doesNotMatch(section('Ideas still open'), /A price per seat/, 'a cut idea is not open');
  assert.match(section('What we found'), /- The ledger records one row per run\. Source: `lib\/cost-ledger\.mjs:12`\./);
  assert.match(section('What we are assuming'), /- A limit is one number per project\. Still open\. Left to the build: the build decides/);
  assert.match(section('Tensions'), /- One number pulls against warnings per kind of run\. Still open\./);
  assert.match(section('Sketches'), /- A quiet toast at the top\. File: `\.ai\/design\/explore\/warning-toast\.html`\. Link: none\. State: idea\./);
  assert.match(section('Questions for the plan'), /- Which format does the export use\?/);
  const text = readable(body);
  for (const k of keysOf(board)) assert.ok(!text.includes(k), `the key ${k} appears in the document`);
});

test('a replaced decision shows only under the decision that replaced it', () => {
  const body = renderBody(fullBoard(), { slug: 'ideas' });
  assert.equal(body.split('A limit stops a run when it is reached.').length - 1, 1, 'the older decision appears once');
  assert.match(body, /Core\. First version\. This replaced: A limit stops a run when it is reached\./);
  assert.doesNotMatch(body, /^- A limit stops a run/m);
  // A successor that is not on the board does not hide the older decision.
  const b = fullBoard();
  b.items = b.items.filter((i) => i.key !== 'limit-warns-only' && i.kind !== 'tension');
  b.sketches = [];
  assert.match(renderBody(b, { slug: 'ideas' }), /^- A limit stops a run when it is reached\./m);
});

test('a closed area links its archived record; the archive record holds the older stories and the archived items', () => {
  const board = fullBoard();
  board.sessions = 5;
  board.stories.push({ session: 3, text: 'Third.' }, { session: 4, text: 'Fourth.' }, { session: 5, text: 'Fifth.' });
  const archive = { items: [{ key: 'seat-trial', kind: 'decision', thread: 'seat-billing', text: 'A trial of thirty seats.', source: 'person' }], log: [], stories: [] };
  const body = renderBody(board, { slug: 'ideas', older: true, closedLink: true });
  assert.match(body, /### Billing by seat — the solution side — explored\nWe left billing aside\.[\s\S]*?The area is closed\. Its earlier record is in \[archive\/record\.md\]\(archive\/record\.md\)\./);
  assert.doesNotMatch(body, /### Seeing what a project costs[^\n]*\n[^#]*The area is closed/, 'a live area is not closed');
  assert.match(body, /### Session 5\nFifth\.[\s\S]*### Session 3\nThird\./);
  assert.doesNotMatch(body, /### Session 2 /, 'only the newest three sessions');
  assert.match(body, /Older sessions are in \[archive\/record\.md\]/);
  const rec = renderArchive(board, archive);
  assert.match(rec, /## Older sessions\n\n### Session 2 — 2026-11-02\nWe chose the warning\.\n\n### Session 1/);
  assert.match(rec, /## Archived record\n\n### Billing by seat\n- Decision: A trial of thirty seats\./);
  assert.equal(renderArchive(emptyBoard(), null), null);
});

test('after done the document carries the scope and the work, and links each work packet file', () => {
  const board = fullBoard();
  board.status = 'distilled';
  board.work = [
    { key: 'spending-limit', order: 1, title: 'Add a warning-only limit', shape: 'intake', slug: 'spending-limit', items: ['limit-warns-only', 'cost-rows-per-run'], entry: '/wf campaign ideas', state: 'proposed', 'design-form': 'design' },
    { key: 'limit-guide', order: 2, 'why-here': 'after the limit', title: 'Write the limit guide', shape: 'write-now', slug: 'limit-guide', items: [], entry: 'written', state: 'written', 'written-files': [{ path: 'docs/limits.md', section: 'Limits' }] },
  ];
  const body = renderBody(board, { slug: 'ideas', hasWorkFile: (s) => s === 'spending-limit' });
  assert.match(body, /- A limit warns and never blocks work\. Why: A blocked run loses paid work\. Core\. First version\.[^\n]* In work packet 1\./);
  assert.match(body, /- The ledger records one row per run\. Source: `lib\/cost-ledger\.mjs:12`\. In work packet 1\./);
  assert.match(body, /- Research runs have no limit\. Left for later\./);
  assert.match(body, /## Ideas and questions you cut\n\n- A price per seat\. You raised it\. Cut: no seats\./);
  assert.match(body, /## Scope\n\nEach item of the record above says its scope/);
  assert.equal(body.split('A limit warns and never blocks work.').length - 1, 1, 'the scope repeats no item text');
  assert.match(body, /## Work\n\n1\. Add a warning-only limit\. Form: a feature to build\. It adds a design stage\. The work packet file: \[work packet\]\(work\/spending-limit\.md\)\./);
  assert.match(body, /2\. Write the limit guide\. Form: written in the session\. Changed: `docs\/limits\.md` \(Limits\)\./);
  const text = readable(body);
  for (const k of keysOf(board)) assert.ok(!text.includes(k), `the key ${k} appears in the document`);
});

// ---------------------------------------------------------------- the commands, on disk

function fixture({ board = exampleBoard(), lead = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-board-doc-'));
  const dir = path.join(root, '.ai', 'workflows', 'ideas');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'ideas', status: 'active', 'workflow-type': 'brainstorm' } });
  Object.assign(board, { slug: 'ideas', 'updated-at': '2026-10-25T10:00:00Z' });
  const file = path.join(dir, 'brainstorm-board.json');
  writeFileSync(file, JSON.stringify(board, null, 2));
  if (lead) writeDoc(dir, '01-brainstorm.md', lead);
  return {
    root, dir,
    read: () => JSON.parse(readFileSync(file, 'utf8')),
    doc: () => readDoc(dir, '01-brainstorm.md'),
    done: () => rmSync(root, { recursive: true, force: true }),
  };
}

const ok = (r) => assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);

test('every board command that writes renders the document in the same call', () => {
  const f = fixture();
  try {
    const S = path.join(f.root, 'scratch');
    mkdirSync(S);
    ok(run(['board', 'add', f.root, 'ideas', 'item', '--key', 'cap-per-run', '--kind', 'decision', '--thread', 'limit-per-project', '--text', 'A cap per run.', '--source', 'person']));
    const first = f.doc();
    assert.equal(first.frontmatter.type, 'brainstorm');
    assert.equal(first.frontmatter.board, 'brainstorm-board.json');
    assert.ok(first.body.includes(MARKER));
    assert.match(first.body, /- A cap per run\./);
    const added = f.read().items.find((i) => i.key === 'cap-per-run');
    assert.equal(added.session, 1, 'a new decision records its session');
    assert.ok(added['decided-at'], 'and when it was made');
    ok(run(['board', 'move', f.root, 'ideas', 'cap-per-run', '--new', 'caps', '--name', 'Spending caps', '--area', 'seeing-the-cost']));
    assert.match(f.doc().body, /Spending caps \(live\)/);
    ok(run(['board', 'add', f.root, 'ideas', 'area', '--key', 'limits', '--name', 'Limits', '--side', 'solution']));
    ok(run(['board', 'regroup', f.root, 'ideas', 'caps', '--to', 'limits']));
    assert.match(f.doc().body, /### Limits — the solution side — open\nNo brief yet\.\n\nThreads: Spending caps \(live\)\./);
    ok(run(['board', 'set', f.root, 'ideas', 'cap-per-run', 'scope=later']));
    assert.match(f.doc().body, /- A cap per run\. Left for later\./);
    ok(run(['board', 'set', f.root, 'ideas', 'sessions=3', 'status=distilled']));
    assert.equal(f.doc().frontmatter.sessions, 3, 'the board owns sessions');
    assert.equal(f.doc().frontmatter.status, 'distilled', 'the board owns status');
    writeFileSync(path.join(S, 'summary.md'), 'A cap per run is for later; a warning comes first.\n');
    ok(run(['board', 'prose', f.root, 'ideas', 'summary', '--file', path.join(S, 'summary.md')]));
    assert.match(f.doc().body, /## The Brainstorm\n\nA cap per run is for later; a warning comes first\./);
    writeFileSync(path.join(S, 'brief.md'), 'Caps live here. Open: the size of a cap.');
    ok(run(['board', 'prose', f.root, 'ideas', 'brief', '--area', 'limits', '--file', path.join(S, 'brief.md')]));
    assert.match(f.doc().body, /### Limits — the solution side — open\nCaps live here\. Open: the size of a cap\./);
    ok(run(['board', 'prose', f.root, 'ideas', 'story', '--text', 'We moved the caps to their own area.', '--date', '2026-11-10']));
    assert.match(f.doc().body, /### Session 3 — 2026-11-10\nWe moved the caps to their own area\./);
    writeFileSync(path.join(S, 'batch.json'), JSON.stringify({
      add: { item: [{ key: 'cap-size', kind: 'question', thread: 'caps', text: 'How large is a cap?', source: 'agent', state: 'open' }], log: [{ batch: 5, thread: 'caps', kind: 'probe', asked: 'cap size', answer: 'open' }] },
      set: { 'limit-per-project': { state: 'parked' } },
      summary: 'The warning comes first; the size of a cap is open.',
    }));
    ok(run(['board', 'apply', f.root, 'ideas', '--file', path.join(S, 'batch.json')]));
    const b = f.read();
    assert.equal(b.batches, 5, 'a log entry moves batches');
    assert.equal(b.log.at(-1).session, 3, 'a log entry takes the current session');
    assert.match(f.doc().body, /- Question: How large is a cap\?/);
    assert.match(f.doc().body, /A spending limit per project \(parked\)/);
    ok(run(['board', 'remove', f.root, 'ideas', 'cap-size']));
    assert.doesNotMatch(f.doc().body, /How large is a cap/);
    // A script that writes the board by itself is followed by a render.
    const raw = f.read();
    raw.summary = 'Changed by another script.';
    writeFileSync(path.join(f.dir, 'brainstorm-board.json'), JSON.stringify(raw, null, 2));
    const check = run(['board', 'render', f.root, 'ideas', '--check']);
    assert.equal(check.status, 1, check.stdout);
    assert.match(check.stdout, /stale/);
    ok(run(['board', 'render', f.root, 'ideas']));
    assert.match(f.doc().body, /Changed by another script\./);
    assert.equal(run(['board', 'render', f.root, 'ideas', '--check']).status, 0);
  } finally { f.done(); }
});

test('a refused change writes neither the board nor the document', () => {
  const f = fixture();
  try {
    ok(run(['board', 'render', f.root, 'ideas']));
    const board = JSON.stringify(f.read());
    const body = f.doc().body;
    const bad = run(['board', 'set', f.root, 'ideas', 'limit-warns-only', 'scope=maybe']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /the change would break the board, so nothing is written/);
    assert.match(run(['board', 'set', f.root, 'ideas', 'items=[]']).stderr, /change only with their own command/);
    assert.match(run(['board', 'prose', f.root, 'ideas', 'brief', '--text', 'x']).stderr, /--area <area> is required/);
    assert.equal(JSON.stringify(f.read()), board);
    assert.equal(f.doc().body, body);
  } finally { f.done(); }
});

/** A document of the old shape: written by hand, with prose that the board does not hold. */
const OLD_BODY = `# Brainstorm: a spending limit

## The Brainstorm
<!-- STORY SECTION -->
We started from surprise bills. We now believe a warning is enough, because a stop loses paid work.

## Map
### Seeing what a project costs — problem side — explored
A limit warns and never blocks. Core: the warning.

### Payment providers — solution side — open
Nobody has looked at the providers yet.

## Open now
- One number per project pulls against warnings that must fit each kind of run.

## Sessions
### Session 2 — 2026-11-03
We came back to the warning and kept it.

### Session 1 — 2026-11-01
We set out to see what a project costs.

## Decisions
### Seeing what a project costs
- A limit warns and never blocks work. Why: a blocked run loses paid work.
- Finance gets a copy of every warning by mail.

## Parking lot
- Ask the finance team about quarterly caps.

## Scope
<Empty until \`done\`.>

## How to continue
- Resume: \`/wf intake brainstorm ideas\`
`;

const oldLead = () => ({
  frontmatter: { schema: 'sdlc/v1', type: 'brainstorm', slug: 'ideas', topic: 'a spending limit', status: 'open', board: 'brainstorm-board.json', 'created-at': '2026-11-01T09:00:00Z', 'updated-at': '2026-11-03T09:00:00Z', sessions: 2, batches: 7, revisions: [{ rev: 1, at: '2026-11-03T09:00:00Z', trigger: 'resume', because: 'a new session' }], modes: ['from'] },
  body: OLD_BODY,
});

/** The board of the old shape: no summary, no stories, an area with no brief. */
function oldBoard() {
  const b = exampleBoard();
  delete b.stories;
  delete b.summary;
  b.sessions = 1;
  b.areas[0].brief = undefined;
  delete b.areas[0].brief;
  return b;
}

test('adopt reads an old-shape document into the board and keeps what maps to no field word for word', () => {
  const a = adoptBody(oldBoard(), OLD_BODY, { frontmatter: oldLead().frontmatter });
  assert.equal(a.board.summary, 'We started from surprise bills. We now believe a warning is enough, because a stop loses paid work.');
  assert.equal(a.board.areas[0].brief, 'A limit warns and never blocks. Core: the warning.');
  assert.deepEqual(a.board.stories, [{ session: 2, text: 'We came back to the warning and kept it.', date: '2026-11-03' }, { session: 1, text: 'We set out to see what a project costs.', date: '2026-11-01' }]);
  assert.equal(a.board.sessions, 2, 'the document counted more sessions than the board');
  assert.equal(a.board.batches, 7);
  assert.equal(a.board.status, 'open');
  const carried = Object.fromEntries(a.board.carried.map((c) => [c.heading, c.text]));
  assert.equal(carried['Earlier map notes'], '### Payment providers — solution side — open\nNobody has looked at the providers yet.', 'an area the board does not have');
  assert.equal(carried['Earlier notes: Decisions'], '### Seeing what a project costs\n- Finance gets a copy of every warning by mail.', 'a decision line the board never got, under its area');
  assert.equal(carried['Parking lot'], '- Ask the finance team about quarterly caps.', 'a section of its own');
  assert.equal(carried['Earlier notes: Open now'], undefined, 'a line the board holds is not carried');
  assert.equal(carried.Scope, undefined, 'a placeholder is not carried');
  assert.ok(validateBrainstormBoard(a.board).valid, JSON.stringify(validateBrainstormBoard(a.board).errors));
});

test('the first write on an old-shape document adopts it after a snapshot, and loses nothing', () => {
  const f = fixture({ board: oldBoard(), lead: oldLead() });
  try {
    const add = run(['board', 'add', f.root, 'ideas', 'item', '--key', 'cap-per-run', '--kind', 'idea', '--thread', 'limit-per-project', '--text', 'A cap per run.', '--source', 'person', '--json']);
    ok(add);
    const r = JSON.parse(add.stdout);
    assert.ok(r.adopted.taken.includes('summary'));
    assert.ok(r.adopted.carried.includes('Parking lot'));
    const history = readdirSync(path.join(f.dir, 'history'));
    const docSnap = history.find((n) => /^01-brainstorm-adopt-.*\.md$/.test(n));
    const boardSnap = history.find((n) => /^brainstorm-board-adopt-.*\.json$/.test(n));
    assert.ok(docSnap && boardSnap, history.join(', '));
    assert.match(readFileSync(path.join(f.dir, 'history', docSnap), 'utf8'), /## Parking lot/);
    assert.equal(JSON.parse(readFileSync(path.join(f.dir, 'history', boardSnap), 'utf8')).summary, undefined, 'the board snapshot is the board before the adopt');
    const doc = f.doc();
    assert.ok(doc.body.includes(MARKER));
    for (const s of ['We started from surprise bills.', 'A limit warns and never blocks. Core: the warning.', 'We came back to the warning and kept it.',
      'Nobody has looked at the providers yet.', 'Finance gets a copy of every warning by mail.', 'Ask the finance team about quarterly caps.', 'A cap per run.']) {
      assert.ok(doc.body.includes(s), `the document lost: ${s}`);
    }
    assert.match(doc.body, /^## Parking lot\n\n- Ask the finance team/m);
    assert.deepEqual(doc.frontmatter.revisions, oldLead().frontmatter.revisions, 'the document keeps its revisions');
    assert.deepEqual(doc.frontmatter.modes, ['from'], 'and its other fields');
    assert.equal(doc.frontmatter['created-at'], '2026-11-01T09:00:00Z');
    assert.equal(doc.frontmatter.sessions, 2);
    // The second write adopts nothing again.
    ok(run(['board', 'set', f.root, 'ideas', 'cap-per-run', 'scope=keep']));
    assert.equal(readdirSync(path.join(f.dir, 'history')).length, history.length, 'no second snapshot');
    assert.equal(f.read().carried.length, 3);
    // The explicit adopt on a rendered document finds nothing to take.
    const again = JSON.parse(run(['board', 'adopt', f.root, 'ideas', '--json']).stdout);
    assert.deepEqual(again.adopted, { taken: [], carried: [] });
  } finally { f.done(); }
});

test('board adopt on resume; a hand-written archive record is kept in the archive', () => {
  const f = fixture({ board: oldBoard(), lead: oldLead() });
  try {
    mkdirSync(path.join(f.dir, 'archive'));
    writeFileSync(path.join(f.dir, 'archive', 'record.md'), '# Archive\n\n## Billing\n- We dropped seats.\n');
    const r = run(['board', 'adopt', f.root, 'ideas']);
    ok(r);
    assert.match(r.stdout, /Earlier archive/);
    const rec = readFileSync(path.join(f.dir, 'archive', 'record.md'), 'utf8');
    assert.ok(rec.includes(MARKER));
    assert.match(rec, /## Earlier archive\n\n## Billing\n- We dropped seats\./);
    assert.ok(readdirSync(path.join(f.dir, 'history')).some((n) => /^archive-record-adopt-/.test(n)));
  } finally { f.done(); }
});

test('a design board of a feature writes design-notes/brainstorm-design.md; a slug-mode board writes its slice', () => {
  const f = fixture();
  try {
    // The feature: its lead record is not a brainstorm.
    rmSync(path.join(f.dir, 'brainstorm-board.json'));
    const design = { ...exampleBoard(), slug: 'ideas', focus: 'design' };
    writeFileSync(path.join(f.dir, 'brainstorm-board-design.json'), JSON.stringify(design, null, 2));
    ok(run(['board', 'render', f.root, 'ideas', '--board', 'brainstorm-board-design.json']));
    const notes = readFileSync(path.join(f.dir, 'design-notes', 'brainstorm-design.md'), 'utf8');
    assert.match(notes, /^---\n[\s\S]*type: brainstorm[\s\S]*board: brainstorm-board-design\.json[\s\S]*focus: design[\s\S]*---\n# Brainstorm: /);
    assert.match(notes, /Resume: `\/wf intake ideas brainstorm design`/);
    assert.equal(readDoc(f.dir, '01-brainstorm.md'), null, 'no lead record is made for a design board');
    // Slug-mode: no slice yet, so no document; the board is still written.
    writeFileSync(path.join(f.dir, 'brainstorm-board-limits.json'), JSON.stringify({ ...exampleBoard(), slug: 'ideas' }, null, 2));
    const none = run(['board', 'set', f.root, 'ideas', 'limit-warns-only', 'core=false', '--board', 'brainstorm-board-limits.json', '--json']);
    ok(none);
    assert.match(JSON.parse(none.stdout).warnings[0], /no slice record 03-slice-brainstorm-limits\.md yet/);
    writeDoc(f.dir, '03-slice-brainstorm-limits.md', {
      frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'ideas', 'slice-slug': 'brainstorm-limits', 'slice-type': 'brainstorm', compressed: true, origin: 'intake/brainstorm', status: 'defined', 'updated-at': '2026-11-01T00:00:00Z' },
      body: '# Compressed Slice: brainstorm\nGenerated by `/wf intake brainstorm` on 2026-11-01 against slug `ideas`.\n',
    });
    ok(run(['board', 'render', f.root, 'ideas', '--board', 'brainstorm-board-limits.json']));
    const slice = readDoc(f.dir, '03-slice-brainstorm-limits.md');
    assert.equal(slice.frontmatter.type, 'slice', 'the slice keeps its frontmatter');
    assert.equal(slice.frontmatter['slice-slug'], 'brainstorm-limits');
    assert.match(slice.body, /^# Compressed Slice: brainstorm\nGenerated by `\/wf intake brainstorm` on 2026-11-01 against slug `ideas`\.\n\n<!-- Written from the board/);
    assert.match(slice.body, /## Decisions\n\n### Seeing what a project costs\n- A limit warns/);
    assert.doesNotMatch(slice.body, /Resume:/);
    ok(run(['board', 'render', f.root, 'ideas', '--board', 'brainstorm-board-limits.json']));
    assert.equal(readDoc(f.dir, '03-slice-brainstorm-limits.md').body, slice.body, 'a second render keeps the top once');
    assert.ok(!existsSync(path.join(f.dir, 'history')), 'a rendered document is never adopted again');
  } finally { f.done(); }
});

test('the schema accepts an old board and the new prose fields, and refuses a bad story date or an empty carried text', () => {
  assert.ok(validateBrainstormBoard(oldBoard()).valid, 'an old board stays valid');
  const b = fullBoard();
  Object.assign(b, { status: 'distilled', carried: [{ heading: 'Parking lot', text: '- a line' }, { heading: 'Earlier archive', text: 'x', place: 'archive' }] });
  assert.deepEqual(validateBrainstormBoard(b).errors, []);
  assert.ok(!validateBrainstormBoard({ ...b, stories: [{ session: 1, text: 'x', date: '1 Nov' }] }).valid);
  assert.ok(!validateBrainstormBoard({ ...b, carried: [{ heading: 'x', text: '' }] }).valid);
  assert.ok(!validateBrainstormBoard({ ...b, status: 'closed' }).valid);
});

test('apply refuses an unknown part and runs its steps in order', () => {
  assert.throws(() => applyChange(fullBoard(), { adds: {} }), /adds is not a part of a change/);
  assert.throws(() => applyChange(fullBoard(), { add: { claim: [] } }), /add\.claim is not a kind/);
  const { board, done } = applyChange(fullBoard(), {
    add: { thread: [{ key: 'caps', name: 'Caps', area: 'seeing-the-cost' }], item: [{ key: 'cap-a', kind: 'idea', thread: 'caps', text: 'A cap.', source: 'agent' }] },
    set: { 'cap-a': { scope: 'later' }, 'limit-per-step': { scope: null } },
    briefs: { 'old-billing': 'Billing waits.' },
    story: 'We added caps.',
  });
  assert.deepEqual(done, ['add 1 thread', 'add 1 item', 'set cap-a', 'set limit-per-step', 'brief old-billing', 'story']);
  assert.equal(board.items.find((i) => i.key === 'cap-a').scope, 'later');
  assert.ok(!('scope' in board.items.find((i) => i.key === 'limit-per-step')));
  assert.equal(board.stories.find((s) => s.session === 2).text, 'We added caps.');
});

// ---------------------------------------------------------------- regressions from long boards
// Each fixture copies the shape of a board that went wrong, with invented content.

/** A long board: many decisions in work packets, findings whose evidence names other items. */
function longBoard(n = 40) {
  const b = {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'ideas', topic: 'a season of football', sessions: 3, batches: 30, status: 'distilled', 'updated-at': '2026-11-01T10:00:00Z',
    summary: 'We believe a season needs a calendar, a transfer window and a board that judges the manager.',
    areas: [{ key: 'season-shape', name: 'The shape of a season', side: 'solution', state: 'explored', brief: 'A calendar, a window, a board.' }],
    threads: [{ key: 'season-calendar-rules', name: 'The season calendar', area: 'season-shape', state: 'routed', 'routed-to': null }],
    items: [],
    work: [{ key: 'season-engine-core', order: 1, title: 'Build the season engine with its calendar, its window and its board', shape: 'intake', slug: 'season-engine-core', items: [], entry: '/wf campaign ideas', state: 'proposed', research: ['R01'], references: ['docs/season.md'] }],
  };
  for (let k = 0; k < n; k += 1) {
    b.items.push({ key: `season-rule-number-${k}`, kind: 'decision', thread: 'season-calendar-rules', text: `Rule ${k} of the season calendar holds for every league in the world.`, why: `Reason ${k} is that a season must read the same everywhere.`, source: 'person', scope: 'keep' });
    b.work[0].items.push(`season-rule-number-${k}`);
  }
  b.items.push({ key: 'calendar-check-finding', kind: 'finding', thread: 'season-calendar-rules', text: 'The board already decides the calendar but not the window.', source: 'agent', evidence: 'items season-rule-number-1, season-rule-number-2, deadline-day', check: 'verified' });
  b.items.push({ key: 'copy-spreads-not-slots', kind: 'finding', thread: 'season-calendar-rules', text: 'Real leagues spread their matches over the week.', source: 'data', evidence: 'docs/season.md:4', check: 'verified' });
  b.items.push({ key: 'window-closes-late', kind: 'idea', thread: 'season-calendar-rules', text: 'The window closes on deadline-day, as copy-spreads-not-slots says.', source: 'agent' });
  return b;
}

test('a long distilled board renders each item once: the scope repeats no item text', () => {
  const b = longBoard(40);
  const body = renderBody(b, { slug: 'ideas' });
  for (let k = 0; k < 40; k += 1) assert.equal(body.split(`Rule ${k} of the season calendar holds`).length - 1, 1, `rule ${k} appears once`);
  assert.match(body, /Rule 3 of the season calendar holds for every league in the world\. Why: [^\n]* In work packet 1\./);
  assert.match(body, /1\. Build the season engine with its calendar, its window and its board\. Form: a feature to build\. `\/wf campaign ideas` Sources: R01; docs\/season\.md\./);
  const prose = b.items.reduce((sum, i) => sum + i.text.length + (i.why ?? '').length + (i.evidence ?? '').length, 0);
  assert.ok(body.length < prose * 1.6 + 3000, `the document (${body.length}) is about the size of the board's prose (${prose})`);
});

test('a key that prose names reaches the document as words; a two-word English word and a code span stay', () => {
  const body = renderBody(longBoard(3), { slug: 'ideas' });
  const text = body.replace(/`[^`]*`/g, '');
  assert.doesNotMatch(text, /season-rule-number-1|copy-spreads-not-slots/, 'no key of three words or more');
  assert.match(body, /as copy spreads not slots says/);
  assert.match(body, /deadline-day/, 'a two-word hyphenated word is English, not a key');
  assert.match(body, /Source: items season rule number 1, season rule number 2, deadline-day\./);
  assert.equal(scrubKeys('see `season-rule-number-1` and [x](work/season-engine-core.md)', longBoard(3)), 'see `season-rule-number-1` and [x](work/season-engine-core.md)');
  assert.equal(scrubKeys('the season-calendar-rules thread', longBoard(3)), 'the The season calendar thread', 'a thread key becomes its name');
});

/** An old document that repeats the board in its own words, plus a few sentences of its own. */
const PARAPHRASED = [
  '# Brainstorm: a season of football',
  '',
  '## The Brainstorm',
  'We believe a season needs a calendar and a window. '.repeat(20).trim(),
  '',
  '## Decisions',
  '### The shape of a season',
  '- **Rule 3 of the season calendar** holds for every league in the world — why: reason 3 is that a season must read the same everywhere.',
  '  Sketches: [the calendar](https://claude.ai/artifact/calendar-sketch-one).',
  '- Rule 4 of the season calendar holds for every league in the world. The press office also reads this rule aloud.',
  '',
  '## What we found',
  '- The board already decides the calendar but not the window. Source: research note R01.',
  '',
  '## Scope',
  'Not scoped yet. Cut so far, at your word: a winter break in every league.',
  '',
  '## Notes from the pub',
  '- Rule 5 of the season calendar holds for every league in the world.',
  '',
].join('\n');

/** The long board as an old one: no summary, no status, no work yet, and the sketch the old document links. */
function oldLongBoard() {
  const b = longBoard(6);
  delete b.summary;
  delete b.status;
  b.work = [];
  b.items.find((i) => i.key === 'calendar-check-finding').evidence = 'research/R01-calendar.md#window';
  b.sketches = [{ key: 'calendar-sketch', thread: 'season-calendar-rules', items: [], link: 'https://claude.ai/artifact/calendar-sketch-one', path: null, caption: 'A calendar.', state: 'idea' }];
  return b;
}

test('adopt carries only the sentences that are not on the board, however the old document worded the rest', () => {
  const a = adoptBody(oldLongBoard(), PARAPHRASED, { frontmatter: { status: 'open' }, render: (x) => renderBody(x, { slug: 'ideas' }) });
  const carried = Object.fromEntries(a.board.carried.map((c) => [c.heading, c.text]));
  assert.deepEqual(Object.keys(carried).sort(), ['Earlier notes: Decisions', 'Earlier notes: Scope', 'Notes from the pub']);
  assert.equal(carried['Earlier notes: Decisions'], '### The shape of a season\n- The press office also reads this rule aloud.', 'only the sentence of its own; markdown, a "why:" suffix and a known link are not carried');
  assert.equal(carried['Earlier notes: Scope'], 'Cut so far, at your word: a winter break in every league.', 'a line that starts with a placeholder keeps the rest');
  assert.equal(carried['Notes from the pub'], 'Its items are in the record above.', 'a section of its own keeps its heading');
  // The long summary is taken whole: adopt never shortens it.
  assert.equal(a.board.summary.split(/\s+/).length, 200);
});

test('nothing is lost: every sentence of an old document is in the render or in carried', () => {
  const a = adoptBody(oldLongBoard(), PARAPHRASED, { render: (x) => renderBody(x, { slug: 'ideas' }) });
  const idx = coverIndex([renderBody(a.board, { slug: 'ideas' }), ...a.board.carried.map((c) => `${c.heading}\n${c.text}`)]);
  const known = new Set([...DERIVED, 'the brainstorm', 'map', 'sessions', 'scope', 'work']);
  const lost = PARAPHRASED.split('\n').filter((l) => l.trim() && !/^#\s/.test(l) && !(/^##\s/.test(l) && known.has(l.slice(3).trim().toLowerCase())))
    .flatMap((l) => (/^#{2,}\s/.test(l) ? [l.replace(/^#+\s*/, '')] : sentencesOf(l))).filter((s) => !isPlaceholder(s) && !isCovered(s, idx));
  assert.deepEqual(lost, []);
});

test('the document of a records-layout folder is the brainstorm section of intake.yaml, and a long summary only warns', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-board-layout-'));
  try {
    const dir = path.join(root, '.ai', 'workflows', 'ideas');
    mkdirSync(path.join(dir, '.old'), { recursive: true });
    const b = oldLongBoard();
    writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(b));
    writeDoc(dir, '01-brainstorm.md', { frontmatter: { schema: 'sdlc/v1', type: 'brainstorm', slug: 'ideas', topic: 't', status: 'open', board: 'brainstorm-board.json', 'created-at': '2026-11-01T09:00:00Z' }, body: PARAPHRASED });
    // The retired copy of the old layout is not the document.
    writeFileSync(path.join(dir, '.old', '01-brainstorm.md'), '---\nschema: sdlc/v1\n---\n## Stale\n- A line from the retired copy.\n');
    assert.ok(existsSync(path.join(dir, 'intake.yaml')) && !existsSync(path.join(dir, '01-brainstorm.md')));
    const plan = prepareDocument(dir, 'brainstorm-board.json', b);
    assert.ok(plan.adopted, 'the record in intake.yaml was read and adopted');
    assert.ok(plan.board.carried.some((c) => c.heading === 'Notes from the pub'));
    assert.ok(!plan.board.carried.some((c) => c.heading === 'Stale'), 'the retired copy is not read');
    assert.equal(plan.board.summary.split(/\s+/).length, 200, 'the whole summary is kept');
    assert.deepEqual(plan.warnings, ['the summary has 200 words, more than 150: write it shorter']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
