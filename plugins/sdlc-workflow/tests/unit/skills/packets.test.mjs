// WF-PIECES-PLAN section 4 guard tests: a brainstorm's `done` writes one ordered list,
// work/index.md plus one work/<packet-slug>.md per packet, from the board. Decisions travel
// verbatim, every kept decision lands in exactly one packet, a build packet carries its
// write-up, and a started packet is never rewritten.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deepEqual, doesNotMatch, equal, match, ok } from 'node:assert/strict';

import { validateBrainstormBoard, validateFrontmatter } from '../../../lib/schema-validator.mjs';
import { safeParseFrontmatter } from '../../../lib/frontmatter.mjs';
import {
  checkList,
  endBranch,
  findIgnoredCitations,
  listBranch,
  packetFrontmatter,
  renderPacket,
  sequenceErrors,
  startedPacketRewriteError,
  writeList,
} from '../../../lib/packets.mjs';
import { archiveCommand, run } from '../../../scripts/campaign.mjs';
import { archiveBoard, docCheck } from '../../../lib/brainstorm-archive.mjs';

const SLUG = 'brainstorm-match-engine-20261003';
const NOW = new Date('2026-10-03T10:00:00Z');

const WRITE_UP = {
  goal: 'Cut the engine into modules.',
  'acceptance-criteria': ['Each module exposes the one contract.'],
  'ux-impact': 'none',
  'ux-impact-confirmed': true,
  'try-out': 'no',
  'estimated-slices': 10,
};

function board(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    artifact: 'brainstorm-board',
    slug: SLUG,
    topic: 'the match engine',
    stack: { platforms: ['node'], languages: ['ts'], 'user-confirmed': true },
    areas: [{ key: 'engine', name: 'The engine', side: 'solution', state: 'explored', scope: 'keep' }],
    threads: [
      { key: 'module-shape', name: 'How the engine is cut', area: 'engine', state: 'live' },
      { key: 'replay', name: 'Replays', area: 'engine', state: 'live' },
    ],
    items: [
      { key: 'one-module-contract', kind: 'decision', thread: 'module-shape', text: 'The engine exposes one module contract.', why: 'Every screen reads the same events.', source: 'person', scope: 'keep', session: 2, 'decided-at': '2026-09-22T10:00:00Z' },
      { key: 'events-are-facts', kind: 'decision', thread: 'module-shape', text: 'An event records what happened, never why.', source: 'person', scope: 'keep', 'accepted-risk': 'Replays cannot explain a decision.' },
      { key: 'replay-from-events', kind: 'decision', thread: 'replay', text: 'A replay is rebuilt from the event stream.', source: 'person', scope: 'keep', session: 3, 'decided-at': '2026-09-23T10:00:00Z' },
      { key: 'replay-speed', kind: 'decision', thread: 'replay', text: 'Replays run at four speeds.', source: 'person', scope: 'later' },
      { key: 'replay-camera', kind: 'idea', thread: 'replay', text: 'A free camera in replays.', source: 'agent', scope: 'cut', reason: 'Too costly for the first version.' },
      { key: 'events-row-per-tick', kind: 'finding', thread: 'module-shape', text: 'The engine writes one row per tick.', source: 'code', evidence: 'src/engine/tick.ts:40', check: 'verified' },
      { key: 'replay-size', kind: 'finding', thread: 'replay', text: 'A match stream is 3 MB.', source: 'data', evidence: 'data/match.json', check: 'verified' },
      { key: 'design-doc-update', kind: 'decision', thread: 'module-shape', text: 'The design document names the module contract.', source: 'person', scope: 'keep' },
    ],
    work: [
      { key: 'engine-modules', order: 2, 'why-here': 'the modules follow the contract that the design document names', title: 'Cut the engine into modules', shape: 'intake', slug: 'engine-modules', items: ['one-module-contract', 'events-are-facts', 'events-row-per-tick'], threads: ['module-shape'], entry: 'x', state: 'proposed', ...WRITE_UP },
      { key: 'replay-builder', order: 3, 'why-here': 'replays read the events of the modules', title: 'Build replays from events', shape: 'intake', slug: 'replay-builder', items: ['replay-from-events'], threads: ['replay'], entry: 'x', state: 'proposed', ...WRITE_UP, goal: 'Build replays.', 'ux-impact': 'visual', 'try-out': 'yes', 'estimated-slices': 8 },
      { key: 'design-doc-contract', order: 1, title: 'Name the contract in the design document', shape: 'write-now', items: ['design-doc-update'], entry: 'written in the brainstorm session', state: 'written', 'written-files': [{ path: 'docs/design/engine.md', section: 'Module contract' }], 'written-at': '2026-10-03T09:00:00Z' },
    ],
    log: [],
    ...overrides,
  };
}

function workflowDir(b = board()) {
  const root = mkdtempSync(join(tmpdir(), 'packets-'));
  const dir = join(root, '.ai', 'workflows', b.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
  return { root, dir };
}

const errorsOf = (b) => checkList(b).errors.join('\n');

test('schema: the board admits the packet fields, the stack, and the walk states', () => {
  const b = board();
  const result = validateBrainstormBoard(b);
  ok(result.valid, JSON.stringify(result.errors));
  for (const state of ['open', 'built', 'done', 'dropped']) {
    ok(validateBrainstormBoard({ ...b, work: [{ ...b.work[0], state }, ...b.work.slice(1)] }).valid, state);
  }
  equal(validateBrainstormBoard({ ...b, work: [{ ...b.work[0], state: 'started' }] }).valid, false);
  equal(validateBrainstormBoard({ ...b, work: [{ ...b.work[0], 'ux-impact': 'loud' }] }).valid, false);
});

test('schema: a packet and a list validate as frontmatter types', () => {
  const b = board();
  const fm = safeParseFrontmatter(renderPacket(b, b.work[0], { revision: 1, generatedAt: '2026-10-03T10:00:00Z' })).data;
  const r = validateFrontmatter(fm);
  ok(r.valid, JSON.stringify(r.errors));
  equal(fm.type, 'packet');
  equal(fm.slug, SLUG, 'a packet carries its folder slug, so the write hooks accept it');
  equal(fm['packet-slug'], 'engine-modules');
  equal(fm.state, 'written');
  equal(fm['try-out'], 'no');
  equal(fm['estimated-slices'], 10);
  equal(validateFrontmatter({ ...fm, form: 'design' }).valid, false, 'design is a flag, not a packet form');
  equal(validateFrontmatter({ ...fm, state: 'proposed' }).valid, false, 'a packet file has the walk states only');
  ok(validateFrontmatter({ schema: 'sdlc/v1', type: 'list', slug: SLUG, 'list-revision': 1, 'list-branch': listBranch(SLUG), packets: ['a'], slugs: ['a'] }).valid);
});

test('the branches: the list branch and an end branch that never nests under it', () => {
  equal(listBranch(SLUG), `packets/${SLUG}`);
  equal(endBranch(SLUG, 'engine-modules'), `packets/${SLUG}--engine-modules`);
  ok(!endBranch(SLUG, 'x').startsWith(`${listBranch(SLUG)}/`));
});

test('decisions travel verbatim, with their keys, sessions, and dates; the write-up is in the file', () => {
  const b = board();
  const text = renderPacket(b, b.work[0], { revision: 1 });
  const fm = safeParseFrontmatter(text).data;
  deepEqual(fm['carried-decisions'].map((d) => d.text), ['The engine exposes one module contract.', 'An event records what happened, never why.']);
  equal(fm['carried-decisions'][0].session, 2);
  equal(fm['carried-decisions'][0]['decided-at'], '2026-09-22T10:00:00Z');
  match(text, /\*\*one-module-contract\*\* — The engine exposes one module contract\./);
  match(text, /The board wins where this packet and the board differ/);
  match(text, /\.\.\/brainstorm-board\.json#one-module-contract/, 'every item links to the board');
  match(text, /The campaign walk builds this packet: `\/wf campaign brainstorm-match-engine-20261003`\./);
  match(text, /## Goal\n\nCut the engine into modules\.\n/);
  match(text, /\*\*AC-1\*\* — Each module exposes the one contract\./);
  for (const h of ['Place in the list', 'In scope', 'Out of scope', 'Acceptance criteria', 'Constraints', 'Risks', 'What the person decided', 'What is still open', 'What we found', 'What we assume', 'Left for later and cut', 'Sources']) {
    match(text, new RegExp(`## ${h}\\n`));
  }
  const second = renderPacket(b, b.work[1], { revision: 1 });
  match(second, /replay-camera\*\* — A free camera in replays\..*Cut: Too costly/);
  match(second, /Comes after: \[Cut the engine into modules\]\(engine-modules\.md\), because replays read the events of the modules\./);
  match(text, /Comes after: Name the contract in the design document \(written in the brainstorm session; state written\), because the modules follow/);
  equal(safeParseFrontmatter(second).data['try-out'], 'yes', 'a packet with a user-facing change is tried out (D37)');
});

test('a packet carries its sketches with their files and anchors; a packet without sketches has no field', () => {
  const canvas = { link: 'https://claude.ai/canvas/new', account: 'me', 'published-at': '2026-10-22T10:00:00Z', sha256: 'a'.repeat(64), previous: ['https://claude.ai/canvas/old'] };
  const sketches = [
    { key: 'home-hero', thread: 'module-shape', link: 'https://claude.ai/canvas/old', path: 'design/sketches/screens.html#home', caption: 'The home hero.', state: 'carried', canvas },
    { key: 'scene-only', thread: 'module-shape', link: null, path: null, caption: 'A scene in words.', state: 'carried' },
  ];
  const base = board();
  const b = board({ focus: 'design', sketches, work: [{ ...base.work[0], sketches: ['home-hero', 'scene-only'] }, ...base.work.slice(1)] });
  ok(validateBrainstormBoard(b).valid, JSON.stringify(validateBrainstormBoard(b).errors));
  const fm = packetFrontmatter(b, b.work[0]);
  deepEqual(fm.sketches, [
    { key: 'home-hero', path: `.ai/workflows/${SLUG}/design/sketches/screens.html#home`, link: 'https://claude.ai/canvas/new', caption: 'The home hero.', canvas },
    { key: 'scene-only', path: null, link: null, caption: 'A scene in words.' },
  ]);
  ok(validateFrontmatter(fm).valid, JSON.stringify(validateFrontmatter(fm).errors));
  deepEqual(checkList(b).errors, []);
  equal('sketches' in packetFrontmatter(base, base.work[0]), false);
});

test('at done, no sketch is an idea, every carried sketch is in a packet, and a packet names only board sketches', () => {
  const base = board();
  const sketches = [
    { key: 'module-map', thread: 'module-shape', link: null, path: 'design/sketches/module-map.html', caption: 'The modules.', state: 'idea' },
    { key: 'event-strip', thread: 'module-shape', link: null, path: 'design/sketches/event-strip.html', caption: 'One strip per event.', state: 'carried' },
    { key: 'old-idea', thread: 'module-shape', link: null, path: null, caption: 'An old idea.', state: 'dropped' },
  ];
  const errors = errorsOf(board({ focus: 'design', sketches, work: [{ ...base.work[0], sketches: ['ghost'] }, ...base.work.slice(1)] }));
  match(errors, /sketch module-map \("The modules\."\) is still an idea/);
  match(errors, /carried sketch event-strip \("One strip per event\."\) is in no packet/);
  match(errors, /packet engine-modules names sketch ghost, which is not on the board/);
  doesNotMatch(errors, /old-idea/);
});

test('a clean list passes the check', () => {
  deepEqual(checkList(board()).errors, []);
});

test('the sequence check fails on a gap, on a repeat, and on a packet after order 1 with no why-here', () => {
  deepEqual(sequenceErrors(board().work), []);
  const gap = board();
  gap.work[1].order = 4;
  match(errorsOf(gap), /no packet with order 3: the orders are 1 to 3/);
  const repeat = board();
  repeat.work[1].order = 2;
  match(errorsOf(repeat), /packets engine-modules and replay-builder have the same order 2/);
  const none = board();
  delete none.work[0].order;
  match(errorsOf(none), /packet engine-modules: no order/);
  const quiet = board();
  quiet.work[1]['why-here'] = '  ';
  match(errorsOf(quiet), /packet replay-builder \(order 3\): no why-here/);
});

test('a board that cites .scratch/ fails the check', () => {
  const b = board();
  b.items[5].evidence = '.scratch/out/F16_part_a.md';
  match(errorsOf(b), /items\.events-row-per-tick\.evidence cites \.scratch\/out\/F16_part_a\.md, a gitignored path/);
  equal(findIgnoredCitations(board(), { isIgnored: (p) => p === 'src/engine/tick.ts' }).length, 1, 'any gitignored path counts');
});

test('coverage: every kept decision lands in exactly one packet; a dropped packet holds none', () => {
  const lost = board();
  lost.work[1].items = [];
  match(errorsOf(lost), /kept decision replay-from-events .* lands in no packet/);
  const twice = board();
  twice.work[1].items = ['replay-from-events', 'one-module-contract'];
  match(errorsOf(twice), /one-module-contract lands in engine-modules, replay-builder: put it in exactly one packet/);
  const dropped = board();
  dropped.work.push({ ...dropped.work[1], key: 'old-replay', slug: 'old-replay', order: 4, state: 'dropped' });
  doesNotMatch(errorsOf(dropped), /lands in replay-builder, old-replay/);
});

test('the write-up of a build packet that is not started: goal, criteria, confirmed ux-impact, try-out, estimate, stack', () => {
  const b = board();
  delete b.work[0].goal;
  b.work[0]['acceptance-criteria'] = [];
  b.work[1]['ux-impact-confirmed'] = false;
  let errors = errorsOf(b);
  match(errors, /packet engine-modules: no goal/);
  match(errors, /packet engine-modules: no acceptance criteria/);
  match(errors, /packet replay-builder: ux-impact visual is not confirmed by the person/);
  const quiet = board();
  quiet.work[1]['try-out'] = 'no';
  match(errorsOf(quiet), /packet replay-builder: try-out no with ux-impact visual/);
  const noStack = board();
  delete noStack.stack;
  match(errorsOf(noStack), /no confirmed stack/);
  const big = board();
  big.work[0]['estimated-slices'] = 20;
  big.work[1]['estimated-slices'] = 3;
  delete board().work[0]['estimated-slices'];
  const warnings = checkList(big).warnings.join('\n');
  match(warnings, /packet engine-modules: about 20 slices, above 14/);
  match(warnings, /packet replay-builder: about 3 slices, below 6/);
  equal(checkList(big).errors.length, 0, 'the slice band warns; it never stops the write (D38)');
  const started = board();
  started.work[0] = { ...started.work[0], state: 'open', goal: '' };
  delete started.stack;
  started.work[1].state = 'done';
  deepEqual(checkList(started).errors, [], 'a started packet keeps its own write-up, and needs no stack');
});

test('a carried decision with no session or decided-at warns; a packet with no finding warns', () => {
  const warnings = checkList(board()).warnings.join('\n');
  match(warnings, /packet engine-modules: 1 carried decision\(s\) have no session or decided-at \(events-are-facts\)/);
  doesNotMatch(warnings, /one-module-contract\b[^\n]*no session/);
  const b = board();
  b.items = b.items.filter((i) => i.key !== 'replay-size');
  match(checkList(b).warnings.join('\n'), /packet replay-builder carries 1 decisions and no finding/);
  const tension = board();
  tension.items.push({ key: 'facts-vs-why', kind: 'tension', thread: 'other', text: 'Facts only pulls against explaining a replay.', between: ['events-are-facts', 'replay-camera'], source: 'agent', state: 'open' });
  ok(packetFrontmatter(tension, tension.work[0])['open-ideas'].includes('facts-vs-why'), 'a tension that names a carried decision reaches the packet');
  deepEqual(packetFrontmatter(tension, tension.work[1]).findings, ['replay-size'], 'a finding on the thread reaches the packet');
});

test('write: packets, research index, the list last, changes log; a write-now packet gets no file', () => {
  const { root, dir } = workflowDir();
  try {
    mkdirSync(join(dir, 'research'));
    writeFileSync(join(dir, 'research', 'R01-tick-rate.md'), '---\nid: R01\nquestion: How often does the engine tick?\n---\nTen times a second.\n');
    const r = writeList(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    equal(r.revision, 1);
    deepEqual(readdirSync(join(dir, 'work')).sort(), ['changes.md', 'engine-modules.md', 'index.md', 'replay-builder.md']);
    const indexText = readFileSync(join(dir, 'work', 'index.md'), 'utf8');
    const index = safeParseFrontmatter(indexText).data;
    equal(index.type, 'list');
    equal(index['list-revision'], 1);
    equal(index['list-branch'], `packets/${SLUG}`);
    deepEqual(index.packets, ['engine-modules', 'replay-builder']);
    deepEqual(index.written, ['design-doc-contract']);
    equal(index.stack['user-confirmed'], true);
    ok(validateFrontmatter(index).valid, JSON.stringify(validateFrontmatter(index).errors));
    match(indexText, /\| Order \| Packet \| Form \| State \| Try-out \| Why here \|/);
    match(indexText, /Type `\/wf campaign brainstorm-match-engine-20261003`\. The walk builds the packets in order, one at a time/);
    match(readFileSync(join(dir, 'work', 'changes.md'), 'utf8'), /Written in the session: `design-doc-contract` — `docs\/design\/engine\.md`/);
    match(readFileSync(join(dir, 'research', 'index.md'), 'utf8'), /\[R01\]\(R01-tick-rate\.md\) — How often does the engine tick\?/);
    const again = writeList(dir, { now: NOW });
    ok(again.unchanged, 'a second write with no board change keeps the revision');
    equal(again.revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('write moves old work-packet files to work/archive/packets/', () => {
  const { root, dir } = workflowDir();
  try {
    mkdirSync(join(dir, 'work'), { recursive: true });
    writeFileSync(join(dir, 'work', 'old.md'), '---\nschema: sdlc/v1\ntype: work-packet\nkey: old\n---\n');
    writeFileSync(join(dir, 'work', 'index.md'), '---\nschema: sdlc/v1\ntype: work-set\nwork-revision: 4\n---\n');
    const r = writeList(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    deepEqual(r.archivedPackets, ['old.md']);
    ok(existsSync(join(dir, 'work', 'archive', 'packets', 'old.md')));
    ok(!existsSync(join(dir, 'work', 'old.md')));
    equal(safeParseFrontmatter(readFileSync(join(dir, 'work', 'index.md'), 'utf8')).data.type, 'list');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a write never rewrites a started packet; its new text goes to history/ once', () => {
  const b = board();
  const { root, dir } = workflowDir(b);
  try {
    ok(writeList(dir, { now: NOW }).ok);
    const packetPath = join(dir, 'work', 'engine-modules.md');
    const open = readFileSync(packetPath, 'utf8').replace('state: written', 'state: open');
    writeFileSync(packetPath, open);
    b.items[0].text = 'The engine exposes two module contracts.';
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const r2 = writeList(dir, { now: NOW });
    ok(r2.ok, JSON.stringify(r2));
    deepEqual(r2.kept, ['engine-modules']);
    equal(readFileSync(packetPath, 'utf8'), open, 'the open packet keeps its text');
    ok(existsSync(join(dir, 'history', 'work-engine-modules.r2.md')), 'the regenerated text goes to history/');
    match(readFileSync(join(dir, 'work', 'changes.md'), 'utf8'), /Started, not rewritten: `engine-modules`/);
    const r3 = writeList(dir, { now: new Date('2026-10-21T12:00:00Z') });
    ok(r3.unchanged, JSON.stringify(r3));
    ok(!existsSync(join(dir, 'history', 'work-engine-modules.r3.md')), 'no copy that differs only in revision and time');
    match(startedPacketRewriteError(open, open.replace('one module contract', 'two module contracts')), /a started packet is never rewritten/);
    equal(startedPacketRewriteError(open, open.replace('state: open', 'state: built')), null, 'the walk may move the state');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a packet placed before a started packet moves the started packet in the order, and changes nothing else', () => {
  const b = board();
  const { root, dir } = workflowDir(b);
  try {
    ok(writeList(dir, { now: NOW }).ok);
    const packetPath = join(dir, 'work', 'replay-builder.md');
    const open = readFileSync(packetPath, 'utf8').replace('state: written', 'state: open');
    writeFileSync(packetPath, open);
    b.items.push({ key: 'fix-crash', kind: 'decision', thread: 'replay', text: 'Fix the crash first.', source: 'person', scope: 'keep', session: 4, 'decided-at': '2026-10-24T10:00:00Z' });
    b.work.find((p) => p.key === 'replay-builder').order = 4;
    b.work.push({ key: 'crash-fix', order: 3, 'why-here': 'the crash blocks the replays', title: 'Fix the crash', shape: 'intake', slug: 'crash-fix', items: ['fix-crash'], threads: ['replay'], entry: 'x', state: 'proposed', ...WRITE_UP });
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const r = writeList(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    deepEqual(r.reordered, ['replay-builder']);
    const after = readFileSync(packetPath, 'utf8');
    equal(safeParseFrontmatter(after).data.order, 4);
    equal(startedPacketRewriteError(open, after), null, 'the order move passes the started-packet rule');
    match(readFileSync(join(dir, 'work', 'changes.md'), 'utf8'), /Started, moved in the order: `replay-builder` is now order 4\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a cut written packet moves to history; a cut started packet waits for the person', () => {
  const b = board();
  const { root, dir } = workflowDir(b);
  try {
    ok(writeList(dir, { now: NOW }).ok);
    const enginePath = join(dir, 'work', 'engine-modules.md');
    writeFileSync(enginePath, readFileSync(enginePath, 'utf8').replace('state: written', 'state: built'));
    b.work = b.work.filter((p) => p.key === 'design-doc-contract');
    b.items = b.items.map((i) => (['replay-from-events', 'one-module-contract', 'events-are-facts'].includes(i.key) ? { ...i, scope: 'cut' } : i));
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const r = writeList(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    deepEqual(r.cut, ['replay-builder']);
    deepEqual(r.pendingCut, ['engine-modules']);
    ok(!existsSync(join(dir, 'work', 'replay-builder.md')));
    ok(existsSync(join(dir, 'history', 'work-replay-builder.r1.md')));
    ok(existsSync(enginePath), 'a started packet stays');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI refuses to write a list that fails the check', () => {
  const b = board();
  delete b.work[1]['why-here'];
  const { root, dir } = workflowDir(b);
  try {
    const check = run(['check', dir]);
    equal(check.ok, false);
    match(check.errors.join('\n'), /packet replay-builder \(order 3\): no why-here/);
    equal(run(['write', dir]).ok, false);
    ok(!existsSync(join(dir, 'work')), 'nothing is written');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('archive moves closed items and old sessions; the document caps warn', () => {
  const b = board({ sessions: 5 });
  b.threads.push({ key: 'old-ui', name: 'An old screen', area: 'engine', state: 'dropped', reason: 'out of scope' });
  b.items.push({ key: 'old-ui-idea', kind: 'idea', thread: 'old-ui', text: 'A dark screen.', source: 'agent' });
  b.log = [1, 2, 3, 4, 5].map((s) => ({ session: s, batch: 1, thread: 'replay', kind: 'fork', asked: 'a', answer: 'b' }));
  b.stories = [1, 2, 3, 4, 5].map((s) => ({ session: s, text: `session ${s}` }));
  const r = archiveBoard(b);
  deepEqual(r.archived.items.map((i) => i.key), ['old-ui-idea']);
  deepEqual(r.archived.log.map((e) => e.session), [1, 2]);
  equal(checkList(r.board).errors.length, checkList(b).errors.length, 'the archive breaks no check');

  const { root, dir } = workflowDir(b);
  try {
    const long = Array.from({ length: 160 }, () => 'word').join(' ');
    writeFileSync(join(dir, '01-brainstorm.md'), `# Brainstorm\n\n## The Brainstorm\n${long}\n\n## Sessions\n### Session 5\n### Session 4\n### Session 3\n### Session 2\n\n## Decisions\n`);
    const dry = archiveCommand(dir, 'brainstorm-board.json', { dryRun: true });
    ok(dry.ok);
    ok(!existsSync(join(dir, 'archive')), 'a dry run writes nothing');
    const done = archiveCommand(dir, 'brainstorm-board.json', { now: NOW });
    deepEqual(done.moved, { items: 1, log: 2, stories: 2 });
    match(done.warnings.join('\n'), /The Brainstorm has 160 words, more than 150/);
    match(done.warnings.join('\n'), /## Sessions tells 4 sessions, more than 3/);
    const saved = JSON.parse(readFileSync(join(dir, 'brainstorm-board.json'), 'utf8'));
    equal(saved.archived.length, 1);
    ok(validateBrainstormBoard(saved).valid);
    deepEqual(archiveCommand(dir, 'brainstorm-board.json', { now: NOW }).moved, { items: 0, log: 0, stories: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  deepEqual(docCheck('## The Brainstorm\nshort.\n'), []);
});

test('a packet carries its measures into the packet file and into the shape of its workflow', async () => {
  const { packetFolderRecords } = await import('../../../scripts/campaign.mjs');
  const b = board();
  const packet = { ...b.work[0], measures: ['ability: the goals a player adds over a season, not the goal difference of the team'] };
  const text = renderPacket(b, packet, { revision: 1 });
  match(text, /## Measures\n\n- ability: the goals a player adds over a season/);
  doesNotMatch(renderPacket(b, b.work[0], { revision: 1 }), /## Measures/, 'no measures, no section');
  const fm = safeParseFrontmatter(text).data;
  const r = packetFolderRecords({ src: SLUG, packet: { ...fm, file: 'engine-modules.md' }, packetText: text, list: {}, trunk: 'main', now: '2026-10-30T10:00:00Z' });
  match(r['02-shape.md'].body, /## Measures\n\n- ability: the goals a player adds over a season/);
});
