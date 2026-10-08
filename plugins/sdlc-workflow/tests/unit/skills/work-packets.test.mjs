// BRAINSTORM-WORK-PACKETS-PLAN guard tests: a brainstorm keeps its sources in
// its own folder, and `done` writes one work packet per resulting slug from the
// board. Decisions travel verbatim, contracts match, every kept decision lands
// somewhere, and a started packet is never rewritten.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, doesNotMatch, equal, match, ok } from 'node:assert/strict';

import { validateBrainstormBoard, validateFrontmatter } from '../../../lib/schema-validator.mjs';
import { safeParseFrontmatter } from '../../../lib/frontmatter.mjs';
import {
  checkWorkSet,
  computeWaves,
  findIgnoredCitations,
  renderPacket,
  sizeOf,
  startedPacketRewriteError,
  writeWorkSet,
} from '../../../lib/work-packets.mjs';
import { main } from '../../../scripts/work-packets.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
const REF = 'skills/wf/reference';
const SLUG = 'brainstorm-match-engine-20261003';
const NOW = new Date('2026-10-03T10:00:00Z');

function board(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    artifact: 'brainstorm-board',
    slug: SLUG,
    topic: 'the match engine',
    areas: [{ key: 'engine', name: 'The engine', side: 'solution', state: 'explored', scope: 'keep' }],
    threads: [
      { key: 'module-shape', name: 'How the engine is cut', area: 'engine', state: 'live' },
      { key: 'replay', name: 'Replays', area: 'engine', state: 'live' },
    ],
    items: [
      { key: 'one-module-contract', kind: 'decision', thread: 'module-shape', text: 'The engine exposes one module contract.', why: 'Every screen reads the same events.', source: 'person', scope: 'keep', session: 2, 'decided-at': '2026-09-22T10:00:00Z' },
      { key: 'events-are-facts', kind: 'decision', thread: 'module-shape', text: 'An event records what happened, never why.', source: 'person', scope: 'keep', 'accepted-risk': 'Replays cannot explain a decision.' },
      { key: 'replay-from-events', kind: 'decision', thread: 'replay', text: 'A replay is rebuilt from the event stream.', source: 'person', scope: 'keep' },
      { key: 'replay-speed', kind: 'decision', thread: 'replay', text: 'Replays run at four speeds.', source: 'person', scope: 'later' },
      { key: 'replay-camera', kind: 'idea', thread: 'replay', text: 'A free camera in replays.', source: 'agent', scope: 'cut', reason: 'Too costly for the first version.' },
      { key: 'events-row-per-tick', kind: 'finding', thread: 'module-shape', text: 'The engine writes one row per tick.', source: 'code', evidence: 'src/engine/tick.ts:40', check: 'verified' },
      { key: 'design-doc-update', kind: 'decision', thread: 'module-shape', text: 'The design document names the module contract.', source: 'person', scope: 'keep' },
    ],
    work: [
      { key: 'engine-modules', order: 1, title: 'Cut the engine into modules', shape: 'intake', slug: 'engine-modules', items: ['one-module-contract', 'events-are-facts', 'events-row-per-tick'], threads: ['module-shape'], provides: [{ key: 'module-contract', text: 'The engine exposes one module contract.' }], entry: `/wf intake engine-modules from ${SLUG}`, state: 'proposed' },
      { key: 'replay-builder', order: 2, title: 'Build replays from events', shape: 'intake', slug: 'replay-builder', items: ['replay-from-events'], threads: ['replay'], 'depends-on': ['engine-modules'], expects: [{ from: 'engine-modules', key: 'module-contract', text: 'One module contract to read events from.' }], entry: `/wf intake replay-builder from ${SLUG}`, state: 'proposed' },
      { key: 'design-doc-contract', order: 0 + 1, title: 'Name the contract in the design document', shape: 'write-now', items: ['design-doc-update'], entry: 'written in the brainstorm session', state: 'written', 'written-files': [{ path: 'docs/design/engine.md', section: 'Module contract' }], 'written-at': '2026-10-03T09:00:00Z' },
    ],
    log: [],
    ...overrides,
  };
}

function workflowDir(b = board()) {
  const root = mkdtempSync(join(tmpdir(), 'wp-'));
  const dir = join(root, '.ai', 'workflows', b.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
  return { root, dir };
}

test('schema: the board admits the packet fields, write-now pieces, and pending cuts', () => {
  const b = board();
  const result = validateBrainstormBoard(b);
  ok(result.valid, JSON.stringify(result.errors));
  const urgent = { ...b, work: [...b.work, { key: 'replay-crash', title: 'Fix the replay crash', shape: 'hotfix', slug: 'replay-crash', 'target-slug': 'replay-builder', amends: 'replay-builder', urgency: 'urgent', entry: 'x', state: 'proposed' }] };
  ok(validateBrainstormBoard(urgent).valid);
  const pending = { ...b, items: b.items.map((i) => (i.key === 'replay-from-events' ? { ...i, scope: 'pending-cut' } : i)) };
  ok(validateBrainstormBoard(pending).valid);
  equal(validateBrainstormBoard({ ...b, work: [{ ...b.work[0], state: 'started' }] }).valid, false);
  equal(validateBrainstormBoard({ ...b, work: [{ ...b.work[0], size: 'huge' }] }).valid, false);
});

test('schema: a packet and a work-set validate as frontmatter types', () => {
  const b = board();
  const text = renderPacket(b, b.work[0], { revision: 1, generatedAt: '2026-10-03T10:00:00Z' });
  const fm = safeParseFrontmatter(text).data;
  const r = validateFrontmatter(fm);
  ok(r.valid, JSON.stringify(r.errors));
  equal(fm.slug, SLUG, 'a packet carries its folder slug, so the write hooks accept it');
  equal(fm['work-slug'], 'engine-modules');
  equal(validateFrontmatter({ ...fm, form: 'design' }).valid, false, 'design is a flag, not a packet form');
  ok(validateFrontmatter({ schema: 'sdlc/v1', type: 'work-set', slug: SLUG, 'work-set': 'multi', 'work-revision': 1, slugs: ['a', 'b'], waves: [['a'], ['b']] }).valid);
});

test('decisions travel verbatim, with their keys, sessions, and dates (I1)', () => {
  const b = board();
  const text = renderPacket(b, b.work[0], { revision: 1 });
  const fm = safeParseFrontmatter(text).data;
  deepEqual(fm['carried-decisions'].map((d) => d.text), ['The engine exposes one module contract.', 'An event records what happened, never why.']);
  equal(fm['carried-decisions'][0].session, 2);
  equal(fm['carried-decisions'][0]['decided-at'], '2026-09-22T10:00:00Z');
  match(text, /\*\*one-module-contract\*\* — The engine exposes one module contract\./);
  match(text, /## Start\n/);
  match(text, /\/wf intake \.ai\/workflows\/brainstorm-match-engine-20261003\/work\/engine-modules\.md/);
  match(text, /The board wins where this packet and the board differ/);
  match(text, /\.\.\/brainstorm-board\.json#one-module-contract/, 'X1: every item links to the board');
  for (const h of ['What the person decided', 'What is still open', 'What we found', 'What we assume', 'Provides and expects', 'Depends on / needed by', 'Left for later and cut', 'Sources']) {
    match(text, new RegExp(`## ${h.replace(/\//g, '\\/')}\\n`));
  }
  const second = renderPacket(b, b.work[1], { revision: 1 });
  match(second, /Left for later/);
  match(second, /replay-camera\*\* — A free camera in replays\..*Cut: Too costly/);
  match(renderPacket(b, b.work[0]), /Needed by: \[Build replays from events\]\(replay-builder\.md\)/, 'X2: needed by is computed');
});

test('a packet carries its sketches with their files; a packet without sketches has no field (DESIGN-BOARDS W5b)', () => {
  const sketches = [
    { key: 'module-map', thread: 'module-shape', items: ['one-module-contract'], link: 'https://claude.ai/canvas/x', path: `.ai/workflows/${SLUG}/design/sketches/module-map.png`, caption: 'The modules side by side.', state: 'carried' },
    { key: 'event-strip', thread: 'module-shape', link: null, path: 'design/sketches/event-strip.html', caption: 'One strip per event.', state: 'carried' },
    { key: 'scene-only', thread: 'module-shape', link: null, path: null, caption: 'A scene in words.', state: 'carried' },
  ];
  const base = board();
  const b = board({ focus: 'design', sketches, work: [{ ...base.work[0], 'ux-impact': 'visual', sketches: ['module-map', 'event-strip', 'scene-only'] }, ...base.work.slice(1)] });
  ok(validateBrainstormBoard(b).valid, JSON.stringify(validateBrainstormBoard(b).errors));
  const text = renderPacket(b, b.work[0], { revision: 1 });
  const fm = safeParseFrontmatter(text).data;
  deepEqual(fm.sketches, [
    { key: 'module-map', path: `.ai/workflows/${SLUG}/design/sketches/module-map.png`, link: 'https://claude.ai/canvas/x', caption: 'The modules side by side.' },
    { key: 'event-strip', path: `.ai/workflows/${SLUG}/design/sketches/event-strip.html`, link: null, caption: 'One strip per event.' },
    { key: 'scene-only', path: null, link: null, caption: 'A scene in words.' },
  ]);
  const r = validateFrontmatter(fm);
  ok(r.valid, JSON.stringify(r.errors));
  match(text, /- Sketch `module-map`: `\.ai\/workflows\/[^`]+\/design\/sketches\/module-map\.png` \(\[canvas\]\(https:\/\/claude\.ai\/canvas\/x\)\) — The modules side by side\./);
  equal(validateFrontmatter({ ...fm, sketches: [{ key: 'module-map' }] }).valid, false, 'a packet sketch names its path, or null');
  const plain = safeParseFrontmatter(renderPacket(base, base.work[0], { revision: 1 })).data;
  equal('sketches' in plain, false);
});

test('a clean work set passes the check, and the waves follow depends-on', () => {
  const b = board();
  const r = checkWorkSet(b);
  deepEqual(r.errors, []);
  deepEqual(computeWaves(b), [['engine-modules'], ['replay-builder']]);
});

test('an expects line with no matching provides line fails (X3)', () => {
  const b = board();
  b.work[1].expects = [{ from: 'engine-modules', key: 'event-schema', text: 'A published event schema.' }];
  match(checkWorkSet(b).errors.join('\n'), /expects engine-modules\/event-schema .* no piece provides it/);
  const notEarlier = board();
  notEarlier.work[1]['depends-on'] = [];
  match(checkWorkSet(notEarlier).errors.join('\n'), /does not come earlier/);
});

test('a board that cites .scratch/ fails the check (F4)', () => {
  const b = board();
  b.items[5].evidence = '.scratch/out/F16_part_a.md';
  const r = checkWorkSet(b);
  match(r.errors.join('\n'), /items\.events-row-per-tick\.evidence cites \.scratch\/out\/F16_part_a\.md, a gitignored path/);
  equal(findIgnoredCitations(board(), { isIgnored: (p) => p === 'src/engine/tick.ts' }).length, 1, 'any gitignored path counts');
});

test('coverage, cycles, and size (I6, K10, Q5)', () => {
  const lost = board();
  lost.work[1].items = [];
  match(checkWorkSet(lost).errors.join('\n'), /kept decision replay-from-events .* lands in no piece of work/);
  const twice = board();
  twice.work[1].items = ['replay-from-events', 'one-module-contract'];
  match(checkWorkSet(twice).errors.join('\n'), /one-module-contract lands in engine-modules, replay-builder: mark it shared/);
  twice.work[0].shared = ['one-module-contract'];
  twice.work[1].shared = ['one-module-contract'];
  equal(checkWorkSet(twice).errors.length, 0, 'a shared decision is covered');
  const loop = board();
  loop.work[0]['depends-on'] = ['replay-builder'];
  match(checkWorkSet(loop).errors.join('\n'), /cycle/);
  equal(sizeOf(25), 'medium');
  equal(sizeOf(26), 'large');
  equal(sizeOf(41), 'too-large');
  const big = board();
  for (let i = 0; i < 41; i += 1) {
    big.items.push({ key: `d${i}`, kind: 'decision', thread: 'module-shape', text: `Decision ${i}.`, source: 'person', scope: 'keep' });
    big.work[0].items.push(`d${i}`);
  }
  match(checkWorkSet(big).errors.join('\n'), /carries 43 decisions, more than 40: split it/);
  big.work[0].state = 'routed';
  ok(!checkWorkSet(big).errors.some((e) => e.includes('split')), 'a started piece is never split (M3b)');
});

test('write: packets, research index, work index last, changes log; a write-now piece gets no packet', () => {
  const { root, dir } = workflowDir();
  try {
    mkdirSync(join(dir, 'research'));
    writeFileSync(join(dir, 'research', 'R01-tick-rate.md'), '---\nid: R01\nquestion: How often does the engine tick?\n---\nTen times a second.\n');
    const r = writeWorkSet(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    equal(r.revision, 1);
    deepEqual(readdirSync(join(dir, 'work')).sort(), ['changes.md', 'engine-modules.md', 'index.md', 'replay-builder.md']);
    const index = safeParseFrontmatter(readFileSync(join(dir, 'work', 'index.md'), 'utf8')).data;
    equal(index['work-set'], 'multi');
    equal(index['work-revision'], 1);
    deepEqual(index.written, ['design-doc-contract']);
    ok(validateFrontmatter(index).valid);
    match(readFileSync(join(dir, 'work', 'changes.md'), 'utf8'), /Written in the session: `design-doc-contract` — `docs\/design\/engine\.md`/);
    match(readFileSync(join(dir, 'research', 'index.md'), 'utf8'), /\[R01\]\(R01-tick-rate\.md\) — How often does the engine tick\?/);
    const again = writeWorkSet(dir, { now: NOW });
    ok(again.unchanged, 'a second write with no board change keeps the revision');
    equal(again.revision, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a done never rewrites a prepared packet (K4, V3)', () => {
  const b = board();
  const { root, dir } = workflowDir(b);
  try {
    ok(writeWorkSet(dir, { now: NOW }).ok);
    const packetPath = join(dir, 'work', 'engine-modules.md');
    const prepared = readFileSync(packetPath, 'utf8').replace('state: proposed', 'state: prepared').replace('routed-to: null', 'routed-to: engine-modules');
    writeFileSync(packetPath, prepared);
    b.items[0].text = 'The engine exposes two module contracts.';
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const r = writeWorkSet(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    deepEqual(r.kept, ['engine-modules']);
    equal(readFileSync(packetPath, 'utf8'), prepared, 'the prepared packet keeps its text');
    ok(existsSync(join(dir, 'history', 'work-engine-modules.r2.md')), 'the regenerated body goes to history/');
    match(readFileSync(join(dir, 'work', 'changes.md'), 'utf8'), /Started, not rewritten: `engine-modules`/);
    match(startedPacketRewriteError(prepared, prepared.replace('one module contract', 'two module contracts')), /never rewritten/);
    equal(startedPacketRewriteError(prepared, prepared.replace('state: prepared', 'state: routed')), null, 'intake may move the state');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a cut proposed packet moves to history; a cut started packet waits for the person (V6)', () => {
  const b = board();
  const { root, dir } = workflowDir(b);
  try {
    ok(writeWorkSet(dir, { now: NOW }).ok);
    b.work = b.work.filter((p) => p.key !== 'replay-builder');
    b.items = b.items.map((i) => (i.key === 'replay-from-events' ? { ...i, scope: 'cut' } : i));
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    const r = writeWorkSet(dir, { now: NOW });
    ok(r.ok, JSON.stringify(r));
    deepEqual(r.cut, ['replay-builder']);
    ok(!existsSync(join(dir, 'work', 'replay-builder.md')));
    ok(existsSync(join(dir, 'history', 'work-replay-builder.r1.md')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI refuses to write a work set that fails the check', () => {
  const b = board();
  b.work[1].expects = [{ from: 'engine-modules', key: 'nothing', text: 'x' }];
  const { root, dir } = workflowDir(b);
  try {
    const out = [];
    equal(main(['check', dir], { log: (l) => out.push(l) }), 1);
    match(out.join('\n'), /error: piece replay-builder expects/);
    equal(main(['write', dir], { log: (l) => out.push(l) }), 1);
    ok(!existsSync(join(dir, 'work')), 'nothing is written');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('procedure: a document-only piece is written in the session and never printed as /wf task (K5-K8)', () => {
  const src = read(`${REF}/intake/brainstorm.md`);
  const work = read(`${REF}/intake/brainstorm/_work.md`);
  match(src, /A piece that changes only documents is `write-now`: this session writes it after the person confirms/);
  match(src, /Never a write-now piece as a `\/wf task` command/);
  doesNotMatch(src, /a document or other deliverable that is not code \(`task`\)/);
  doesNotMatch(src, /a `task` that revises its design document/);
  match(work, /Never print a write-now piece as a `\/wf task` command\./);
  match(work, /Read back each changed section\. Every carried decision key of the piece must appear in the changed text/);
  match(work, /When the check fails a second time, stop and ask the person/);
  match(work, /This session's context is more than 70 % used/);
  match(work, /The piece changes more than 6 documents/);
  match(work, /node "<skill-dir>\/scripts\/work-packets\.mjs" check/);
  match(work, /node "<skill-dir>\/scripts\/work-packets\.mjs" write/);
  ok(existsSync(join(PLUGIN_ROOT, 'skills/wf/scripts/work-packets.mjs')));
});

test('procedure: sources stay in the folder (R1-R5, F1-F5)', () => {
  const src = read(`${REF}/intake/brainstorm.md`);
  const art = read(`${REF}/intake/brainstorm/_artifact.md`);
  match(src, /\| `look it up` \| .*Write its result as a research note in `research\/`/);
  match(src, /never cite `\.scratch\/` or another gitignored path/);
  match(art, /## Sources: `research\/` and `references\/`/);
  match(art, /Name the note `R<NN>-<label>\.md`/);
  match(art, /When the file is larger than 5 MB, do not copy it/);
  match(read(`${REF}/intake/brainstorm/_brief.md`), /Copy the brief into `references\/briefs\/`/);
  match(read(`${REF}/intake/brainstorm/_cohere.md`), /Check the sources/);
});

test('procedure: intake runs a packet and confirms its decisions (P1-P5, I1-I5)', () => {
  match(read(`${REF}/intake.md`), /`type: work-packet` file runs \[intake\/_packet\.md\]/);
  const packet = read(`${REF}/intake/_packet.md`);
  match(packet, /groups of up to 8, word for word/);
  match(packet, /Record it in `po-answers\.md` with the item key and the old text\. Add the key to the packet's `decision-changed` list/);
  match(packet, /Do not edit the brainstorm's board/);
  match(packet, /`origin-packet: <packet path>` and `origin-items`/);
  match(packet, /set the packet's `state: prepared` and `routed-to: <work-slug>`/);
  match(read(`${REF}/intake/_intake-provenance.md`), /a brainstorm \*\*decision\*\* is the\nperson's answer/);
  match(read(`${REF}/shape.md`), /add one row per carried brainstorm decision, its key and text word for word/);
  match(read(`${REF}/review/intent-fidelity.md`), /the carried decisions of the origin work packet/);
  match(read(`${REF}/intake/extend.md`), /A work packet \(`intake\/_packet\.md`\) is a general seed/);
});

test('procedure: reopening keeps started packets and captures with add (V1-V7)', () => {
  const work = read(`${REF}/intake/brainstorm/_work.md`);
  match(work, /\*\*A started packet is never rewritten\.\*\*/);
  match(work, /`scope: pending-cut`/);
  match(work, /## Quick capture: `add`/);
  match(work, /\*\*Changed decisions come back\.\*\*/);
  match(read(`${REF}/brainstorm.md`), /\/wf brainstorm <brainstorm-slug> add <text>/);
  match(read(`${REF}/intake/brainstorm.md`), /next token is `add` → \*\*quick capture\*\*/);
});
