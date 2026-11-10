// The disk side of /wf campaign in scripts/campaign.mjs:
// the serial walk over one list (status, open, land, start, built, done), the review base
// of a list, the fidelity and try-out gates, `slice-order add`, and the migration of
// an old wave campaign (report, apply, start of a migrated packet, finish, the guarded remove).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLAN_CEILING, PLAN_KEYS, PLAN_NEXT, PLAN_TITLE, migrateApply, migrationReport, removeWorktree, run, untrackedLinks } from '../../scripts/campaign.mjs';
import { safeParseFrontmatter } from '../../lib/frontmatter.mjs';
import { hashFile } from '../../lib/campaign-records.mjs';
import { frontmatterOfDoc, readDoc, setFields as setRecordFields } from '../../lib/records.mjs';
import { addDecision } from '../../lib/decisions.mjs';
import { mergeRun, writeLedger } from '../../lib/findings.mjs';
import { linkProject } from '../../lib/records-sync.mjs';
import { commitIdentity, gitSteps, whereOf } from '../../lib/steps.mjs';

const SRC = 'brainstorm-demo';
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fm = (file) => safeParseFrontmatter(readFileSync(file, 'utf8')).data;
const wf = (root, slug) => path.join(root, '.ai', 'workflows', slug);
/** One workflow record, in either layout. */
const rec = (root, slug, name) => frontmatterOfDoc(wf(root, slug), name);
const body = (root, slug, name) => readDoc(wf(root, slug), name)?.body ?? '';
const tmp = (label) => realpathSync(mkdtempSync(path.join(os.tmpdir(), label)));

function makeRepo(label = 'packets ') {
  const root = tmp(label);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  writeFileSync(path.join(root, '.gitignore'), '.ai/\n');
  writeFileSync(path.join(root, 'app.txt'), 'v0\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

const WRITE_UP = { 'ux-impact': 'none', 'ux-impact-confirmed': true, 'try-out': 'no', 'estimated-slices': 8 };

function writeBoard(root, work, items) {
  const dir = wf(root, SRC);
  mkdirSync(dir, { recursive: true });
  const board = {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SRC, topic: 'demo',
    stack: { platforms: ['node'], languages: ['js'], 'user-confirmed': true },
    areas: [{ key: 'eng', name: 'Engine', side: 'solution', state: 'explored', scope: 'keep' }],
    threads: [{ key: 'main', name: 'Main', area: 'eng', state: 'live' }],
    items: items.map((key) => ({ key, kind: 'decision', thread: 'main', text: `Decision ${key}.`, source: 'person', scope: 'keep', session: 1, 'decided-at': '2026-10-24T00:00:00Z' })),
    work,
  };
  writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(board, null, 2));
  return dir;
}

function review(root, slug, rows) {
  writeFileSync(path.join(wf(root, slug), '07-review.md'), `# Review\n\n## Decision Fidelity\n\n| Key | Verdict | Evidence | Approval |\n|---|---|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`);
}

test('6.1 and 6.2: the serial walk opens, starts, builds and closes each packet; the next packet reviews from the end branch', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build the engine.', 'acceptance-criteria': ['The engine runs.'], risks: ['The engine is slow.'], ...WRITE_UP },
      { key: 'screen', title: 'Screen', shape: 'intake', slug: 'demo-screen', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it shows the engine', items: ['d-two'], goal: 'Show the engine.', 'acceptance-criteria': ['The screen shows it.'], ...WRITE_UP, 'ux-impact': 'visual', 'try-out': 'yes' },
    ], ['d-one', 'd-two']);
    assert.equal(run(['write', dir]).ok, true);

    let st = run(['status', root, SRC]);
    assert.equal(st.branch, `packets/${SRC}`);
    assert.deepEqual([st.current.key, st.current.step], ['engine', 'open']);
    assert.deepEqual(st.needDesign.map((d) => d.key), ['screen'], 'a packet with a user-facing change needs design');

    const opened = run(['open', root, SRC, 'engine']);
    assert.equal(opened.ok, true, JSON.stringify(opened));
    // open writes the record layout: the index is state.yaml and meta.yaml, intake and shape are intake.yaml.
    for (const f of ['state.yaml', 'meta.yaml', 'intake.yaml', 'decisions.yaml']) assert.ok(existsSync(path.join(wf(root, 'demo-engine'), f)), f);
    for (const f of ['00-index.md', '01-intake.md', '02-shape.md']) assert.ok(!existsSync(path.join(wf(root, 'demo-engine'), f)), f);
    assert.deepEqual(opened.wrote.map((w) => path.posix.basename(w)).sort(), ['decisions.yaml', 'intake.yaml', 'meta.yaml', 'state.yaml']);
    const index = rec(root, 'demo-engine', '00-index.md');
    assert.equal(index['workflow-type'], 'feature');
    assert.equal(index.branch, `packets/${SRC}`);
    assert.equal(index['origin-packet'], `.ai/workflows/${SRC}/work/demo-engine.md`);
    assert.equal(index['review-scope'], 'slug-wide');
    assert.equal(index.stack['user-confirmed'], true);
    assert.equal(rec(root, 'demo-engine', '01-intake.md').type, 'intake');
    assert.match(body(root, 'demo-engine', '01-intake.md'), /The engine runs\./);
    assert.equal(rec(root, 'demo-engine', '02-shape.md').type, 'shape');
    assert.match(body(root, 'demo-engine', '02-shape.md'), /\| \*\*d-one\*\* — Decision d-one\. \| honored \|/);
    // A risk the person confirmed at brainstorm done is carried, never open: handoff.md refuses an open risk.
    assert.deepEqual(index['intent-risks'].map((r) => [r.id, r.status, r['po-ratified']]), [['RIM-1', 'carried', true]]);
    assert.match(body(root, 'demo-engine', '02-shape.md'), /## Unknowns \/ Open Questions\n\n- \*\*RIM-1\*\* \(carried to the slug-wide review\) — The engine is slow\./);
    assert.match(readFileSync(path.join(root, '.ai', 'workflows', 'INDEX.md'), 'utf8'), /demo-engine\tactive\tfeature\tpackets\/brainstorm-demo/);
    assert.equal(run(['open', root, SRC, 'engine']).opened, false, 'a second open changes nothing');
    assert.equal(run(['status', root, SRC]).current.step, 'slice');

    assert.equal(run(['start', root, SRC, 'engine']).ok, false, 'start needs the list branch');
    const land = run(['land', root, SRC]);
    assert.deepEqual([land.ok, land.created, land.from], [true, true, 'main']);
    const start = run(['start', root, SRC, 'engine']);
    assert.equal(start.base, 'main', 'the first packet reviews from the trunk');

    // The yolo run: a code commit, a slice roster, a review.
    writeFileSync(path.join(root, 'app.txt'), 'v1 engine\n');
    git(root, 'commit', '-qam', 'engine');
    writeFileSync(path.join(wf(root, 'demo-engine'), '03-slice.md'), '---\ntype: slice\n---\n');
    assert.equal(run(['status', root, SRC]).current.step, 'yolo');
    assert.equal(run(['done', root, SRC, 'engine']).ok, false, 'done needs a built packet');
    assert.equal(run(['built', root, SRC, 'engine']).ok, true);
    assert.match(run(['status', root, SRC]).current.reason, /no ## Decision Fidelity table/);
    review(root, 'demo-engine', [['d-one', 'narrowed', 'app.txt:1', '—']]);
    st = run(['status', root, SRC]);
    assert.equal(st.current.step, 'fidelity');
    assert.deepEqual(st.current.rows.map((r) => r.key), ['d-one']);
    const refused = run(['done', root, SRC, 'engine']);
    assert.equal(refused.ok, false);
    assert.match(refused.error, /not approved/);
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-one', answer: 'approved', question: 'fine for now' });

    // The trunk moves while the packet is built: done merges it in.
    git(root, 'switch', '-q', 'main');
    writeFileSync(path.join(root, 'other.txt'), 'trunk\n');
    git(root, 'add', 'other.txt');
    git(root, 'commit', '-qm', 'trunk moves');
    git(root, 'switch', '-q', `packets/${SRC}`);
    const done = run(['done', root, SRC, 'engine']);
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.trunkMerged, true);
    assert.equal(done.endBranch, `packets/${SRC}--engine`);
    assert.equal(git(root, 'rev-parse', `packets/${SRC}--engine`), git(root, 'rev-parse', 'HEAD'));
    assert.equal(rec(root, 'demo-engine', '00-index.md')['base-branch'], 'main', 'done puts base-branch back to the trunk');
    assert.equal(fm(path.join(dir, 'work', 'demo-engine.md')).state, 'done');

    // The second packet: design first, then its review base is the end branch of the first.
    assert.equal(run(['open', root, SRC, 'screen']).ok, true);
    const screenIndex = rec(root, 'demo-screen', '00-index.md');
    assert.equal(screenIndex['next-command'], 'wf-design');
    st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current.step], ['screen', 'design']);
    assert.equal(run(['start', root, SRC, 'screen']).base, `packets/${SRC}--engine`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('6.1: a built packet that can be tried waits for the try-out record', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'screen', title: 'Screen', shape: 'intake', slug: 'demo-screen', entry: 'x', state: 'proposed', order: 1, items: ['d-two'], goal: 'Show it.', 'acceptance-criteria': ['It shows.'], ...WRITE_UP, 'try-out': 'yes' },
    ], ['d-two']);
    assert.equal(run(['write', dir]).ok, true);
    assert.equal(run(['open', root, SRC, 'screen']).ok, true);
    run(['land', root, SRC]);
    assert.equal(run(['start', root, SRC, 'screen']).ok, true);
    assert.equal(run(['built', root, SRC, 'screen']).ok, true);
    review(root, 'demo-screen', [['d-two', 'honored', 'app.txt:1', '—']]);
    assert.equal(run(['status', root, SRC]).current.step, 'try-out');
    assert.match(run(['done', root, SRC, 'screen']).error, /try-out of screen is not recorded/);
    addDecision(wf(root, 'demo-screen'), { kind: 'try-out', key: 'try-out', answer: 'works', question: 'the screen shows the engine' });
    assert.equal(run(['done', root, SRC, 'screen']).ok, true);
    assert.equal(run(['status', root, SRC]).finished, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('delegate mode: the next packet starts while a built packet waits on its fidelity rows', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
      { key: 'api', title: 'Api', shape: 'intake', slug: 'demo-api', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it serves the engine', items: ['d-two'], goal: 'Serve it.', 'acceptance-criteria': ['It serves.'], ...WRITE_UP },
    ], ['d-one', 'd-two']);
    assert.equal(run(['write', dir]).ok, true);
    assert.equal(run(['open', root, SRC, 'engine']).ok, true);
    run(['land', root, SRC]);
    assert.equal(run(['start', root, SRC, 'engine']).ok, true);
    writeFileSync(path.join(root, 'app.txt'), 'v1 engine\n');
    git(root, 'commit', '-qam', 'engine');
    const built = run(['built', root, SRC, 'engine']);
    assert.equal(built.endBranch, `packets/${SRC}--engine`, 'built marks the end branch on the flat shape');
    const engineEnd = git(root, 'rev-parse', 'HEAD');
    review(root, 'demo-engine', [['d-one', 'narrowed', 'app.txt:1', '—']]);

    // Without delegate mode the walk waits on the person.
    let st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current.step], ['engine', 'fidelity']);
    assert.equal(st.waiting, undefined);

    // The run takes the recommended option: the next packet starts, and the engine waits.
    addDecision(wf(root, 'demo-engine'), { kind: 'steer', key: 'run-decisions', question: 'q', answer: 'Take the recommended option and show me each one at the end' });
    st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current.step], ['api', 'open']);
    assert.deepEqual(st.waiting.map((w) => [w.key, w.step, w.rows.map((r) => r.key)]), [['engine', 'fidelity', ['d-one']]]);
    assert.equal(st.packets.find((p) => p.key === 'engine').state, 'built', 'the waiting packet stays built');
    assert.equal(run(['open', root, SRC, 'api']).ok, true);
    assert.equal(run(['start', root, SRC, 'api']).base, `packets/${SRC}--engine`, 'the next packet reviews from the built end branch');
    writeFileSync(path.join(root, 'api.txt'), 'api\n');
    git(root, 'add', 'api.txt');
    git(root, 'commit', '-qm', 'api');

    // The person approves the row later: done keeps the end branch at the built commit.
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-one', answer: 'approved', question: 'fine' });
    const done = run(['done', root, SRC, 'engine']);
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(git(root, 'rev-parse', `packets/${SRC}--engine`), engineEnd);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('status says what to ask now and what waits: no driver, a running driver, --end, a digest, an answered digest', () => {
  const root = makeRepo();
  const kinds = (list) => list.map((e) => [e.key, e.kind]);
  const live = (slug) => writeFileSync(path.join(wf(root, slug), '.driver-journal.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:a' })}\n`);
  const ended = (slug) => appendFileSync(path.join(wf(root, slug), '.driver-journal.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), run: 'r1', event: 'run-end', agent: 'main-session' })}\n`);
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP, 'try-out': 'yes' },
      { key: 'api', title: 'Api', shape: 'intake', slug: 'demo-api', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it serves the engine', items: ['d-two'], goal: 'Serve it.', 'acceptance-criteria': ['It serves.'], ...WRITE_UP },
    ], ['d-one', 'd-two']);
    assert.equal(run(['write', dir]).ok, true);

    // Nothing waits.
    let st = run(['status', root, SRC]);
    assert.deepEqual([st.ask, st.askLater, st.then], [[], [], { fix: 'now', clear: 'now', running: null }]);

    assert.equal(run(['open', root, SRC, 'engine']).ok, true);
    run(['land', root, SRC]);
    assert.equal(run(['start', root, SRC, 'engine']).ok, true);
    addDecision(wf(root, 'demo-engine'), { kind: 'steer', key: 'run-decisions', question: 'q', answer: 'Take the recommended option and show me each one at the end' });
    assert.equal(run(['built', root, SRC, 'engine']).ok, true);
    review(root, 'demo-engine', [['d-one', 'narrowed', 'app.txt:1', '—']]);

    // A built packet waits, and no driver runs: the questions wait for the next driver.
    st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current.step], ['api', 'open']);
    assert.deepEqual(st.ask, []);
    assert.deepEqual(st.askLater.map((e) => [e.key, e.kind, e.why]), [['engine', 'fidelity', 'the driver of demo-api has not started']]);
    assert.deepEqual(st.askLater[0].rows, [{ key: 'd-one', decision: 'Decision d-one.', verdict: 'narrowed', evidence: 'app.txt:1' }], 'a row carries the decision word for word');

    // The driver of the next packet runs: ask now, and a fix waits for the run.
    assert.equal(run(['open', root, SRC, 'api']).ok, true);
    live('demo-api');
    st = run(['status', root, SRC]);
    assert.deepEqual(kinds(st.ask), [['engine', 'fidelity']]);
    assert.deepEqual(st.askLater, []);
    assert.deepEqual(st.then, { fix: 'after-run', clear: 'after-run', running: 'demo-api' });
    ended('demo-api');

    // The end of the call: everything open is asked.
    st = run(['status', root, SRC, '--end']);
    assert.deepEqual(kinds(st.ask), [['engine', 'fidelity']]);
    assert.deepEqual(st.then, { fix: 'now', clear: 'now', running: null });

    // A digest waits beside the try-out of the same packet.
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-one', answer: 'approved', question: 'fine' });
    addDecision(wf(root, 'demo-engine'), { kind: 'answer', by: 'delegate', key: 'cache', question: 'Cache the result?', answer: 'yes, in memory', scope: { slice: 'core' }, stage: 'plan' });
    st = run(['status', root, SRC]);
    assert.deepEqual(st.askLater.map((e) => [e.key, e.kind]), [['engine', 'try-out'], ['engine', 'digest']]);
    const tryOut = st.askLater[0];
    assert.deepEqual([tryOut.title, tryOut.acceptance, tryOut.file], ['Engine', ['**AC-1** — It runs.'], `.ai/workflows/${SRC}/work/demo-engine.md`]);
    const digest = st.askLater[1];
    assert.deepEqual(digest.entries.map((e) => [e.key, e.answer, e.slice, e.stage]), [['cache', 'yes, in memory', 'core', 'plan']]);
    st = run(['status', root, SRC, '--end']);
    assert.deepEqual(kinds(st.ask), [['engine', 'try-out'], ['engine', 'digest']]);

    // The fix run of the waiting packet: its own questions wait for its run, even at the end.
    live('demo-engine');
    st = run(['status', root, SRC, '--end']);
    assert.deepEqual(st.ask, []);
    assert.deepEqual(st.askLater.map((e) => [e.kind, e.why]), [['try-out', 'the run of demo-engine has not ended'], ['digest', 'the run of demo-engine has not ended']]);
    ended('demo-engine');

    // The answered digest leaves the list; a later delegate decision opens a new one.
    const marked = run(['digest', root, SRC, 'engine', '--answer', 'keep them all']);
    assert.deepEqual([marked.ok, marked.changed, marked.covered.length], [true, true, 1], JSON.stringify(marked));
    assert.deepEqual(run(['digest', root, SRC, 'engine']).changed, false, 'a second mark changes nothing');
    st = run(['status', root, SRC, '--end']);
    assert.deepEqual(kinds(st.ask), [['engine', 'try-out']]);
    addDecision(wf(root, 'demo-engine'), { kind: 'answer', by: 'delegate', key: 'retry', question: 'Retry?', answer: 'twice' });
    st = run(['status', root, SRC, '--end']);
    assert.deepEqual(st.ask.find((e) => e.kind === 'digest').entries.map((e) => e.key), ['retry']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('status asks the questions of the current packet now, with the waiting ones', () => {
  const root = builtPacket(['d-one']);
  try {
    review(root, 'demo-engine', [['d-one', 'dropped', 'app.txt:1', '—']]);
    const st = run(['status', root, SRC]);
    assert.deepEqual([st.current.step, st.ask.map((e) => [e.key, e.kind])], ['fidelity', [['engine', 'fidelity']]]);
    assert.deepEqual(st.askLater, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** A list of one build packet, opened, started and built on the list branch. */
function builtPacket(items) {
  const root = makeRepo();
  writeBoard(root, [
    { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items, goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
  ], items);
  assert.equal(run(['write', wf(root, SRC)]).ok, true);
  assert.equal(run(['open', root, SRC, 'engine']).ok, true);
  run(['land', root, SRC]);
  assert.equal(run(['start', root, SRC, 'engine']).ok, true);
  assert.equal(run(['built', root, SRC, 'engine']).ok, true);
  return root;
}

test('8: the fidelity check fails closed: markdown, other verdicts, the Approval column and a missing row', () => {
  const root = builtPacket(['d-one', 'd-two', 'd-three']);
  try {
    // The review cites an approval that the person never gave, and leaves out d-three.
    review(root, 'demo-engine', [['`d-one`', '**narrowed**', 'app.txt:1', 'pending'], ['d-two', 'partial', 'app.txt:1', '—']]);
    let st = run(['status', root, SRC]);
    assert.equal(st.current.step, 'fidelity');
    assert.deepEqual(st.current.missing, ['d-three']);
    assert.match(st.current.reason, /no row for d-three/);
    assert.match(run(['done', root, SRC, 'engine']).error, /no row for d-three/);

    review(root, 'demo-engine', [['`d-one`', '**narrowed**', 'app.txt:1', 'pending'], ['d-two', 'partial', 'app.txt:1', '—'], ['d-three', 'Honored', 'app.txt:1', '—']]);
    st = run(['status', root, SRC]);
    assert.deepEqual(st.current.rows.map((r) => [r.key, r.verdict]), [['d-one', 'narrowed'], ['d-two', 'partial']], 'only an approval in the decision store approves a row');
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-one', answer: 'approved' });
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-two', answer: 'approved' });
    assert.equal(run(['status', root, SRC]).current.step, 'done');
    assert.equal(run(['done', root, SRC, 'engine']).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('6.1 step 13: a fix slice sends a built packet back to the driver, also in a new call', () => {
  const root = builtPacket(['d-one']);
  try {
    review(root, 'demo-engine', [['d-one', 'honored', 'app.txt:1', '—']]);
    assert.equal(run(['status', root, SRC]).current.step, 'done');
    // /wf intake extend adds a fix slice to the roster.
    setRecordFields(wf(root, 'demo-engine'), '00-index.md', { slices: [{ slug: 'core', status: 'complete' }, { slug: 'fix-1', status: 'defined' }] });
    const st = run(['status', root, SRC]);
    assert.deepEqual([st.current.step, st.current.state], ['yolo', 'built']);
    assert.match(st.current.reason, /fix-1/);
    assert.match(run(['done', root, SRC, 'engine']).error, /fix-1 of demo-engine are not complete/);
    assert.deepEqual([run(['reopen', root, SRC, 'engine']).changed, fm(path.join(wf(root, SRC), 'work', 'demo-engine.md')).state], [true, 'open']);
    assert.equal(run(['reopen', root, SRC, 'engine']).changed, false);
    // The driver builds the slice.
    setRecordFields(wf(root, 'demo-engine'), '00-index.md', { slices: [{ slug: 'core', status: 'complete' }, { slug: 'fix-1', status: 'complete' }] });
    assert.equal(run(['built', root, SRC, 'engine']).ok, true);
    assert.equal(run(['status', root, SRC]).current.step, 'done');
    assert.equal(run(['done', root, SRC, 'engine']).ok, true);
    assert.equal(run(['reopen', root, SRC, 'engine']).ok, false, 'a done packet never opens again');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('6.1: a packet of another form is routed to its own command, never opened', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'why-slow', title: 'Why slow', shape: 'rca', slug: 'why-slow', entry: 'x', state: 'proposed', order: 1, items: ['d-one'] },
    ], ['d-one']);
    assert.equal(run(['write', dir]).ok, true);
    const st = run(['status', root, SRC]);
    assert.deepEqual([st.current.step, st.current.route], ['route', '/wf intake rca why-slow']);
    assert.equal(run(['open', root, SRC, 'why-slow']).ok, false);
    const closed = run(['close', root, SRC, 'why-slow', 'done']);
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.equal(fm(path.join(dir, 'work', 'why-slow.md')).state, 'done');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'brainstorm-board.json'), 'utf8')).work[0].state, 'done');
    assert.equal(run(['status', root, SRC]).finished, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('close: a build packet is done only through the walk; a dropped packet holds no decision on the next write', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
    ], ['d-one']);
    assert.equal(run(['write', dir]).ok, true);
    assert.match(run(['close', root, SRC, 'engine', 'done']).error, /build packet/);
    assert.equal(run(['close', root, SRC, 'engine', 'dropped']).ok, true);
    assert.equal(run(['close', root, SRC, 'engine', 'later']).ok, false);
    const board = JSON.parse(readFileSync(path.join(dir, 'brainstorm-board.json'), 'utf8'));
    assert.equal(board.work[0].state, 'dropped');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('slice-order add writes the edge into the roster and the slice file, and refuses a cycle', () => {
  const root = tmp('sord ');
  try {
    const dir = wf(root, 'engine');
    mkdirSync(dir, { recursive: true });
    // The records of the old layout: slice-order reads them and writes the record layout.
    writeFileSync(path.join(dir, '03-slice.md'), '---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n  - {slug: s2, status: defined}\n  - {slug: s3, status: defined}\n---\n\n# Slices\n');
    writeFileSync(path.join(dir, '03-slice-s1.md'), '---\nslice: s1\ndepends-on: []\n---\n');
    writeFileSync(path.join(dir, '04-plan.md'), '---\nslug: engine\nimplementation-order:\n  - s1\n  - s2\n  - s3\n---\n');
    const r = run(['slice-order', root, 'engine', 'add', '--slice', 's1', '--after', 's3', '--why', 'the plan of s3 makes the table']);
    assert.equal(r.added, true, JSON.stringify(r));
    assert.deepEqual(r.walkOrder, ['s2', 's3', 's1']);
    assert.deepEqual(rec(root, 'engine', '03-slice.md').slices, [{ slug: 's1', status: 'defined', 'depends-on': ['s3'] }, { slug: 's2', status: 'defined' }, { slug: 's3', status: 'defined' }]);
    assert.equal(readDoc(dir, '03-slice.md').layout, 'yaml');
    assert.match(readDoc(dir, '03-slice.md').body, /# Slices/, 'the body of the roster stays');
    assert.deepEqual(rec(root, 'engine', '03-slice-s1.md')['depends-on'], ['s3']);
    assert.deepEqual(rec(root, 'engine', '04-plan.md')['implementation-order'], ['s2', 's3', 's1']);
    assert.ok(existsSync(path.join(dir, 'slices.yaml')) && existsSync(path.join(dir, 'slice-s1.yaml')));
    assert.match(readFileSync(path.join(dir, 'index-history.jsonl'), 'utf8'), /slice-order: 's1' after 's3': the plan of s3 makes the table/);
    assert.equal(run(['slice-order', root, 'engine', 'add', '--slice', 's1', '--after', 's3']).added, false, 'the same edge again adds nothing');
    const cyc = run(['slice-order', root, 'engine', 'add', '--slice', 's3', '--after', 's1']);
    assert.equal(cyc.ok, false);
    assert.equal(cyc.cycle, true, JSON.stringify(cyc));
    assert.equal(run(['slice-order', root, 'engine', 'add', '--slice', 's9', '--after', 's1']).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/**
 * An old wave campaign, as the real ledgers have it (12.1): wave 1 shipped by a squash
 * merge, wave 2 running with the unit `eng` in its own worktree and the extension unit
 * `eng-ext` absorbed into the same slug, and wave 3 planned. Records are local. Beside
 * them: the old wave-1 worktree with a link to a folder outside it, a worktree that is not
 * the campaign's, and a stray folder.
 */
function makeOldCampaign() {
  const root = makeRepo('mig ');
  const outside = tmp('mig-out ');
  const W1 = `campaign/${SRC}/wave-1`;
  const W2 = `campaign/${SRC}/wave-2`;
  const UNIT = `campaign/${SRC}/wave-2--eng`;
  // Wave 1: its branch, then the squash merge on main (the same change, another commit).
  git(root, 'switch', '-q', '-c', W1);
  writeFileSync(path.join(root, 'base.txt'), 'wave 1\n');
  git(root, 'add', 'base.txt');
  git(root, 'commit', '-qm', 'wave 1 work');
  git(root, 'switch', '-q', 'main');
  git(root, 'merge', '-q', '--squash', W1);
  git(root, 'commit', '-qm', 'wave 1 (#1)');
  // Wave 2 starts from the unsquashed wave 1; the unit adds its code in its worktree.
  git(root, 'branch', W2, W1);
  const wtEng = path.join(outside, 'w2-1');
  git(root, 'worktree', 'add', '-q', '-b', UNIT, wtEng, W2);
  git(wtEng, 'config', 'user.email', 'c@test');
  git(wtEng, 'config', 'user.name', 'c');
  writeFileSync(path.join(wtEng, 'app.txt'), 'v0\nengine\n');
  git(wtEng, 'commit', '-qam', 'eng: slice 1');
  writeFileSync(path.join(wtEng, 'eng.txt'), 'not committed\n');
  // The old wave-1 worktree, clean, with a link to a folder outside the worktree.
  const wtW1 = path.join(outside, 'wave-1');
  git(root, 'worktree', 'add', '-q', wtW1, W1);
  const target = path.join(outside, 'shared-deps');
  mkdirSync(target);
  writeFileSync(path.join(target, 'keep.txt'), 'never deleted\n');
  writeFileSync(path.join(wtW1, '.gitignore'), '.ai/\nnode_modules\n');
  git(wtW1, '-c', 'user.email=c@test', '-c', 'user.name=c', 'commit', '-qam', 'ignore node_modules');
  symlinkSync(target, path.join(wtW1, 'node_modules'), 'junction');
  // A worktree that is not the campaign's.
  const wtOther = path.join(outside, 'other');
  git(root, 'worktree', 'add', '-q', '-b', 'feat/other', wtOther, 'main');

  writeBoard(root, [
    { key: 'base', title: 'Base', shape: 'intake', slug: 'base', entry: 'x', state: 'routed', order: 1, items: ['d-base'] },
    { key: 'eng', title: 'Engine', shape: 'intake', slug: 'eng', entry: 'x', state: 'routed', order: 2, 'why-here': 'after the base', items: ['d-eng'] },
    { key: 'eng-ext', title: 'Engine extension', shape: 'extension', slug: 'eng-ext', 'target-slug': 'eng', entry: 'x', state: 'routed', order: 3, 'why-here': 'extends the engine', items: ['d-ext'] },
    { key: 'later', title: 'Later', shape: 'intake', slug: 'later', entry: 'x', state: 'proposed', order: 4, 'why-here': 'after the engine', items: ['d-later'] },
  ], ['d-base', 'd-eng', 'd-ext', 'd-later']);
  const camp = path.join(wf(root, SRC), 'work', 'campaign');
  mkdirSync(path.join(camp, 'records'), { recursive: true });
  // The records: the main checkout and the worktree had the same 00-index at wave start; the worktree's is newer now.
  const mainIdx = path.join(wf(root, 'eng'), '00-index.md');
  mkdirSync(path.dirname(mainIdx), { recursive: true });
  writeFileSync(mainIdx, '---\nschema: sdlc/v1\ntype: workflow-index\nslug: eng\nstatus: active\n---\n');
  const wtIdx = path.join(wtEng, '.ai', 'workflows', 'eng', '00-index.md');
  mkdirSync(path.dirname(wtIdx), { recursive: true });
  writeFileSync(wtIdx, '---\nschema: sdlc/v1\ntype: workflow-index\nslug: eng\nstatus: active\ncurrent-stage: implement\n---\n');
  writeFileSync(path.join(wtEng, '.ai', 'workflows', 'eng', '05-implement-s1.md'), '# Implement s1\n');
  writeFileSync(path.join(camp, 'records', 'eng.json'), JSON.stringify({ version: 1, id: 'eng', files: { 'workflows/eng/00-index.md': { base: hashFile(mainIdx), kept: [] } } }));
  writeFileSync(path.join(camp, 'ledger.json'), JSON.stringify({
    version: 2, brainstorm: SRC, records: 'local', trunk: 'main',
    waves: [{ n: 1, state: 'shipped', branch: W1 }, { n: 2, state: 'running', branch: W2 }, { n: 3, state: 'planned', branch: null }],
    units: {
      base: { slug: 'base', state: 'shipped', wave: 1 },
      eng: { slug: 'eng', state: 'running', wave: 2, worktree: { path: wtEng, branch: UNIT } },
      'eng-ext': { slug: 'eng', state: 'merged-in', wave: 2 },
      later: { slug: 'later', state: 'planned', wave: 3 },
    },
  }, null, 2));
  // The old ledger is quiet: older than the 30 minutes of a live run.
  const old = new Date(Date.now() - 2 * 60 * 60_000);
  execFileSync(process.execPath, ['-e', `require('fs').utimesSync(${JSON.stringify(path.join(camp, 'ledger.json'))}, new Date(${old.getTime()}), new Date(${old.getTime()}))`]);
  mkdirSync(path.join(root, '.ai', 'workflows', '{slug}'), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'workflows', '{slug}', 'stray.md'), 'x\n');
  return { root, outside, wtEng, wtW1, wtOther, target, W2, UNIT };
}

const merged = () => 1;

test('12.2 and 12.3: the first campaign call migrates an old wave campaign; in-flight units become the first packets', () => {
  const m = makeOldCampaign();
  const { root } = m;
  try {
    const st = run(['status', root, SRC]);
    assert.equal(st.migrate, true, JSON.stringify(st));

    const rep = migrationReport(root, SRC, {}, { isMerged: merged });
    assert.equal(rep.ok, true, JSON.stringify(rep));
    assert.equal(rep.live, false);
    assert.deepEqual(rep.shipped.map((u) => u.key), ['base']);
    assert.deepEqual(rep.notStarted.map((u) => u.key), ['later']);
    assert.equal(rep.inflight.length, 1, 'one packet per workflow slug');
    const p = rep.inflight[0];
    assert.deepEqual([p.slug, p.lead, p.branch, p.land, p.uncommitted], ['eng', 'eng', m.UNIT, 'squashed', 1]);
    assert.deepEqual(p.units.map((u) => u.key).sort(), ['eng', 'eng-ext']);
    const byPath = (w) => rep.worktrees.find((x) => path.resolve(x.path).toLowerCase() === path.resolve(w).toLowerCase());
    assert.deepEqual([byPath(m.wtEng).old, byPath(m.wtEng).inflight], [true, true]);
    assert.deepEqual([byPath(m.wtW1).old, byPath(m.wtW1).inflight], [true, false]);
    assert.equal(byPath(m.wtOther).old, false);
    assert.deepEqual(rep.strays, ['{slug}']);
    const blocked = migrationReport(root, SRC, {}, { isMerged: () => null });
    assert.equal(blocked.inflight[0].land, 'blocked', 'an open earlier wave PR blocks the migration');
    assert.equal(migrateApply(root, SRC, {}, { isMerged: () => null }).ok, false);

    const ap = migrateApply(root, SRC, {}, { isMerged: merged });
    assert.equal(ap.ok, true, JSON.stringify(ap));
    assert.deepEqual(ap.absorbed, ['eng-ext']);
    assert.ok(ap.records[0].copied >= 2, JSON.stringify(ap.records));
    assert.ok(existsSync(path.join(wf(root, 'eng'), '05-implement-s1.md')), 'the records sync brings the worktree records home');
    const idx = rec(root, 'eng', '00-index.md');
    assert.equal(idx['current-stage'], 'implement', 'the newer worktree index wins');
    assert.deepEqual([idx.branch, idx['migrated-from'], idx['wave-base'], idx.land], [`packets/${SRC}`, m.UNIT, m.W2, 'squashed']);
    assert.deepEqual(idx['origin-items'].sort(), ['d-eng', 'd-ext']);
    const board = JSON.parse(readFileSync(path.join(wf(root, SRC), 'brainstorm-board.json'), 'utf8'));
    assert.deepEqual(board.work.map((w) => [w.key, w.order, w.state]), [['base', 1, 'done'], ['eng', 2, 'open'], ['eng-ext', 3, 'dropped'], ['later', 4, 'proposed']]);
    assert.equal(board.work[1].migrated.land, 'squashed');

    // 12.4: the person regroups the units that are not started; then the list is written.
    const later = board.work.find((w) => w.key === 'later');
    Object.assign(later, { goal: 'Do it later.', 'acceptance-criteria': ['It is done.'], ...WRITE_UP });
    writeFileSync(path.join(wf(root, SRC), 'brainstorm-board.json'), JSON.stringify(board, null, 2));
    const written = run(['write', wf(root, SRC)]);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'eng.md')).state, 'open');
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'base.md')).state, 'done');
    assert.equal(run(['status', root, SRC]).migrate, 'finish', 'a call after the regroup finishes the migration');

    // 12.2 steps 8 to 10: archive the ledger, move the strays, remove the old worktrees that are not in flight.
    const fin = run(['migrate', root, SRC, 'finish']);
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.ok(existsSync(path.join(wf(root, SRC), 'work', 'archive', 'campaign', 'ledger.json')));
    assert.ok(!existsSync(path.join(wf(root, SRC), 'work', 'campaign')));
    assert.ok(existsSync(path.join(wf(root, SRC), 'work', 'archive', 'stray', '_slug_', 'stray.md')));
    assert.deepEqual(fin.refused, []);
    assert.ok(!existsSync(m.wtW1), 'the old wave-1 worktree is removed');
    assert.equal(readFileSync(path.join(m.target, 'keep.txt'), 'utf8'), 'never deleted\n', 'the remove never follows a link');
    assert.ok(existsSync(m.wtOther), 'a worktree that is not the campaign\'s stays');
    assert.ok(existsSync(m.wtEng), 'the in-flight worktree stays until its packet is done');
    assert.equal(run(['status', root, SRC]).current.key, 'eng');

    // 12.3: start commits the unit's work, rebases it off the squashed wave, and merges it into the list branch.
    assert.equal(run(['land', root, SRC]).ok, true);
    const start = run(['start', root, SRC, 'eng']);
    assert.equal(start.ok, true, JSON.stringify(start));
    // Two commits (slice 1 and the snapshot) become one commit before the rebase; the old commits stay on a backup branch.
    assert.equal(git(m.wtEng, 'log', '-1', '--format=%s'), 'chore: put the work of an old unit in one commit');
    assert.match(git(m.wtEng, 'log', '-1', '--format=%b'), /work packet eng.*backup--eng/s);
    assert.equal(git(m.wtEng, 'rev-list', '--count', 'main..HEAD'), '1');
    assert.equal(git(root, 'log', '-1', '--format=%s', `campaign/${SRC}/backup--eng`), 'chore: save the uncommitted work of an old unit');
    assert.equal(git(root, 'log', '-1', '--format=%s'), 'chore: merge the work of an old unit');
    assert.deepEqual(start.migration.steps.map((s) => Object.keys(s)[0]), ['snapshot', 'squashed', 'rebased', 'merged']);
    assert.equal(readFileSync(path.join(root, 'app.txt'), 'utf8').replace(/\r\n/g, '\n'), 'v0\nengine\n');
    assert.equal(readFileSync(path.join(root, 'eng.txt'), 'utf8').replace(/\r\n/g, '\n'), 'not committed\n');
    assert.equal(git(root, 'log', '--format=%s', 'main..HEAD').split('\n').filter((s) => s === 'wave 1 work').length, 0, 'the squashed wave is not merged twice');
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'eng.md')).migrated.merged, true);
    assert.equal(run(['start', root, SRC, 'eng']).migration.skipped, 'already merged');

    // done removes the unit's worktree with the guarded remove.
    assert.equal(run(['built', root, SRC, 'eng']).ok, true);
    review(root, 'eng', [['d-eng', 'honored', 'app.txt:2', '—'], ['d-ext', 'honored', 'app.txt:2', '—']]);
    const done = run(['done', root, SRC, 'eng']);
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.worktree?.removed, true, JSON.stringify(done.worktree));
    assert.ok(!existsSync(m.wtEng));
  } finally {
    try { git(root, 'worktree', 'remove', '--force', m.wtOther); } catch { /* gone */ }
    rmSync(root, { recursive: true, force: true });
    rmSync(m.outside, { recursive: true, force: true });
  }
});

/** A records repo for a linked project: a bare remote and the clone of this machine, in SDLC_HOME. */
function recordsWorld() {
  const top = tmp('mig-records ');
  const bare = path.join(top, 'records.git');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  const home = path.join(top, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha' } }));
  execFileSync('git', ['clone', '-q', bare, path.join(home, 'records')], { stdio: 'ignore' });
  const saved = { ...process.env };
  Object.assign(process.env, { SDLC_HOME: home, SDLC_RECORDS_PUSH: 'off', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { clone: path.join(home, 'records'), done };
}

test('12.2 linked: the migration brings the worktree records into the clone, a change on both sides is a conflict, and each command commits its writes', () => {
  const r = recordsWorld();
  const m = makeOldCampaign();
  const { root } = m;
  try {
    // The link waits for worktree records that the main checkout lacks: link first, then the old run writes on in its worktree.
    const wtEng = path.join(m.wtEng, '.ai', 'workflows', 'eng');
    const held = Object.fromEntries(['00-index.md', '05-implement-s1.md'].map((n) => [n, readFileSync(path.join(wtEng, n))]));
    rmSync(wtEng, { recursive: true, force: true });
    const l = linkProject(root, 'demo');
    assert.equal(l.ok, true, JSON.stringify(l));
    mkdirSync(wtEng, { recursive: true });
    for (const [n, b] of Object.entries(held)) writeFileSync(path.join(wtEng, n), b);
    const clone = (...p) => path.join(r.clone, 'demo', ...p);
    // The clone copy of the index changes too.
    appendFileSync(clone('eng', '00-index.md'), '\nclone note\n');

    const rep = run(['migrate', root, SRC, 'report']);
    assert.equal(rep.ok, true, JSON.stringify(rep));
    assert.equal(rep.linked, 'demo');
    assert.match(readFileSync(clone(SRC, 'work', 'migration.md'), 'utf8'), /Records: linked as `demo` in the records repo/);
    // The commit takes every change that no commit holds: the report, and the clone note above.
    assert.deepEqual([...rep.committed].sort(), ['eng', SRC].sort());
    assert.ok(git(r.clone, 'log', '-2', '--format=%s', 'main').split(/\r?\n/).includes(`demo/${SRC}: campaign migrate`));

    const ap = migrateApply(root, SRC, {}, { isMerged: merged });
    assert.equal(ap.ok, true, JSON.stringify(ap));
    assert.ok(existsSync(clone('eng', '05-implement-s1.md')), 'the worktree record goes into the clone');
    assert.ok(!existsSync(path.join(wf(root, 'eng'), '05-implement-s1.md')), 'not into the local folder');
    assert.deepEqual(ap.records[0].conflicts.map((c) => c.rel), ['workflows/eng/00-index.md']);
    assert.notEqual(frontmatterOfDoc(clone('eng'), '00-index.md')['current-stage'], 'implement', 'the clone copy stays; the worktree copy does not win');
    assert.ok(existsSync(clone(SRC, 'work', 'campaign', 'records', 'conflicts', 'eng')), 'step 6 finds the worktree copy in the conflict store of the migration');

    // write takes the local path of the source, finds the board in the clone, and commits what the migration left.
    const boardPath = clone(SRC, 'brainstorm-board.json');
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    Object.assign(board.work.find((w) => w.key === 'later'), { goal: 'Do it later.', 'acceptance-criteria': ['It is done.'], ...WRITE_UP });
    writeFileSync(boardPath, JSON.stringify(board, null, 2));
    const written = run(['write', wf(root, SRC)]);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.ok(existsSync(clone(SRC, 'work', 'later.md')));
    assert.deepEqual([...written.committed].sort(), ['eng', SRC].sort());
    assert.equal(git(r.clone, 'show', 'main:demo/eng/05-implement-s1.md').trim(), '# Implement s1');
    git(r.clone, 'cat-file', '-e', `main:demo/${SRC}/work/later.md`);
    assert.equal(run(['write', wf(root, SRC)]).committed, undefined, 'a command that changes nothing makes no commit');
  } finally {
    dropOldCampaign(m);
    r.done();
  }
});

/** An old campaign, migrated and regrouped: the list is written and the walk is on the list branch. */
function migratedList(m) {
  assert.equal(migrateApply(m.root, SRC, {}, { isMerged: merged }).ok, true);
  const boardPath = path.join(wf(m.root, SRC), 'brainstorm-board.json');
  const board = JSON.parse(readFileSync(boardPath, 'utf8'));
  Object.assign(board.work.find((w) => w.key === 'later'), { goal: 'Do it later.', 'acceptance-criteria': ['It is done.'], ...WRITE_UP });
  writeFileSync(boardPath, JSON.stringify(board, null, 2));
  assert.equal(run(['write', wf(m.root, SRC)]).ok, true);
  assert.equal(run(['land', m.root, SRC]).ok, true);
}

function dropOldCampaign(m) {
  for (const w of [m.wtOther, m.wtEng, m.wtW1]) { try { git(m.root, 'worktree', 'remove', '--force', w); } catch { /* gone */ } }
  rmSync(m.root, { recursive: true, force: true });
  rmSync(m.outside, { recursive: true, force: true });
}

test('12.3: start after a rebase by hand does not rebase again', () => {
  const m = makeOldCampaign();
  try {
    migratedList(m);
    // The person rebases the unit by hand, as the conflict message asks.
    git(m.wtEng, 'add', 'eng.txt');
    git(m.wtEng, 'commit', '-qm', 'eng: by hand');
    git(m.wtEng, 'rebase', '-q', '--onto', `packets/${SRC}`, m.W2);
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, true, JSON.stringify(start));
    assert.deepEqual(start.migration.steps.map((s) => Object.keys(s)[0]), ['merged'], 'no second rebase and no one-commit step');
    assert.equal(readFileSync(path.join(m.root, 'app.txt'), 'utf8').replace(/\r\n/g, '\n'), 'v0\nengine\n');
    assert.equal(readFileSync(path.join(m.root, 'eng.txt'), 'utf8').replace(/\r\n/g, '\n'), 'not committed\n');
  } finally { dropOldCampaign(m); }
});

test('12.3: the snapshot commits tracked changes and small untracked files, and names the scratch and large files it leaves out', () => {
  const m = makeOldCampaign();
  try {
    migratedList(m);
    writeFileSync(path.join(m.wtEng, 'app.txt'), 'v0\nengine\nchanged\n');
    mkdirSync(path.join(m.wtEng, '.scratch', 'src'), { recursive: true });
    writeFileSync(path.join(m.wtEng, '.scratch', 'src', 'notes.md'), 'scratch\n');
    mkdirSync(path.join(m.wtEng, 'lib'), { recursive: true });
    writeFileSync(path.join(m.wtEng, 'lib', 'big.bin'), Buffer.alloc(1024 * 1024 + 1, 1));
    writeFileSync(path.join(m.wtEng, 'lib', 'small [1].txt'), 'small\n');
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, true, JSON.stringify(start));
    const snap = start.migration.steps[0];
    assert.equal(snap.snapshot, 3, JSON.stringify(snap));
    assert.deepEqual(snap.leftOut.map((f) => [f.path, f.reason]).sort(), [['.scratch/src/notes.md', 'scratch'], ['lib/big.bin', '1 MB or more']]);
    const files = git(m.root, 'ls-tree', '-r', '--name-only', 'HEAD').split('\n');
    for (const f of ['app.txt', 'eng.txt', 'lib/small [1].txt']) assert.ok(files.includes(f), `${f} is in the commit`);
    for (const f of ['.scratch/src/notes.md', 'lib/big.bin']) assert.ok(!files.includes(f), `${f} is not in the commit`);
    assert.ok(existsSync(path.join(m.wtEng, '.scratch', 'src', 'notes.md')) && existsSync(path.join(m.wtEng, 'lib', 'big.bin')), 'the files left out stay in the worktree');
    assert.equal(readFileSync(path.join(m.root, 'app.txt'), 'utf8').replace(/\r\n/g, '\n'), 'v0\nengine\nchanged\n');
  } finally { dropOldCampaign(m); }
});

test('12.3: the one-commit step keeps the step ledger: the done steps of the unit stay done in the squash commit', () => {
  const m = makeOldCampaign();
  try {
    const wtDir = path.join(m.wtEng, '.ai', 'workflows', 'eng');
    writeFileSync(path.join(wtDir, '04-plan-s1.md'), '---\ntype: plan\n---\n# Plan: s1\n\n## Step-by-Step Plan\n\n1. **Engine** — app.txt.\n2. **Rest** — eng.txt.\n');
    const sha = git(m.wtEng, 'rev-parse', 'HEAD');
    writeFileSync(path.join(wtDir, 'steps.jsonl'), `${JSON.stringify({ at: '2026-10-20T10:00:00Z', slice: 's1', event: 'done', step: 1, sha, ...commitIdentity(m.wtEng, sha), branch: m.UNIT })}\n`);
    migratedList(m);
    const dir = wf(m.root, 'eng');
    assert.deepEqual(whereOf(dir, 's1', gitSteps(m.root)).done.map((d) => [d.n, d.state ?? 'done']), [[1, 'done']]);
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, true, JSON.stringify(start));
    const squashed = start.migration.steps.find((s) => s.squashed);
    assert.equal(squashed.stepLedger?.commits, 2, JSON.stringify(squashed));
    const w = whereOf(dir, 's1', gitSteps(m.root));
    assert.deepEqual(w.done.map((d) => [d.n, d.state, d.oldSha, d.sha]), [[1, 'moved', sha, git(m.root, 'rev-parse', m.UNIT)]], JSON.stringify(w));
    assert.deepEqual(w.dropped, []);
    assert.equal(w.next.n, 2);
  } finally { dropOldCampaign(m); }
});

test('12.3: a squashed unit whose commits are all in the wave base is refused before the snapshot', () => {
  const m = makeOldCampaign();
  try {
    git(m.root, 'branch', '-f', m.W2, m.UNIT);
    migratedList(m);
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, false);
    assert.match(start.error, /no commit beyond the wave base/);
    assert.equal(git(m.wtEng, 'log', '-1', '--format=%s'), 'eng: slice 1', 'no snapshot commit');
  } finally { dropOldCampaign(m); }
});

/** A commit-msg hook as strict as a real repo's: a conventional type, and a subject of at most 70 characters. */
function strictHook(root, extra = '') {
  const file = path.join(root, git(root, 'rev-parse', '--git-common-dir'), 'hooks', 'commit-msg');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\nsubject=$(head -n 1 "$1")\ncase "$subject" in\n  feat:*|fix:*|chore:*|docs:*|test:*) ;;\n  *) echo "no conventional type: $subject" >&2; exit 1 ;;\nesac\n[ \${#subject} -le 70 ] || { echo "the subject is too long" >&2; exit 1; }\n${extra}`);
  chmodSync(file, 0o755);
}

test('12.3: the walk\'s own commits and merges pass a strict commit-msg hook', () => {
  const m = makeOldCampaign();
  try {
    migratedList(m);
    strictHook(m.root);
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, true, JSON.stringify(start));
    assert.deepEqual(start.migration.steps.map((s) => Object.keys(s)[0]), ['snapshot', 'squashed', 'rebased', 'merged']);
  } finally { dropOldCampaign(m); }
});

test('12.3: a merge commit that the hook refuses is a refusal, not a conflict, and leaves no merge open', () => {
  const m = makeOldCampaign();
  try {
    migratedList(m);
    strictHook(m.root, 'case "$subject" in chore:\\ merge*) echo "no merge commits" >&2; exit 1 ;; esac\n');
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, false);
    assert.equal(start.conflict, undefined, JSON.stringify(start));
    assert.equal(start.refused, 'merge');
    assert.match(start.error, /no merge commits/);
    assert.ok(!existsSync(path.join(m.root, '.git', 'MERGE_HEAD')), 'the merge is aborted');
    assert.equal(git(m.root, 'status', '--porcelain', '--untracked-files=no'), '');
  } finally { dropOldCampaign(m); }
});

test('12.2: the report names the steers that wait for another unit and the old stacked PRs; apply keeps the tech stack', () => {
  const m = makeOldCampaign();
  try {
    const engDir = path.join(m.wtEng, '.ai', 'workflows', 'eng');
    addDecision(engDir, { kind: 'steer', answer: 'Do not start the slice s2 until the unit later has its plan.' });
    addDecision(engDir, { kind: 'steer', answer: 'Keep the engine small.' });
    const ledgerFile = path.join(wf(m.root, SRC), 'work', 'campaign', 'ledger.json');
    const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
    ledger.stack = { enabled: true, number: null, 'max-unshipped': 2 };
    writeFileSync(ledgerFile, JSON.stringify(ledger));
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    utimesSync(ledgerFile, old, old);
    const rep = migrationReport(m.root, SRC, {}, { isMerged: merged });
    assert.deepEqual(rep.waits.map((w) => [w.unit, w.names]), [['eng', ['later']]], JSON.stringify(rep.waits));
    assert.equal(rep.prStack.enabled, true);
    run(['migrate', m.root, SRC, 'report']);
    const md = readFileSync(path.join(wf(m.root, SRC), 'work', 'migration.md'), 'utf8');
    assert.match(md, /## Steers that name another unit[\s\S]*`eng` D-001 names `later`/);
    assert.match(md, /pr-shape: stacked/);
    const ap = migrateApply(m.root, SRC, {}, { isMerged: merged });
    assert.equal(ap.ok, true, JSON.stringify(ap));
    const board = JSON.parse(readFileSync(path.join(wf(m.root, SRC), 'brainstorm-board.json'), 'utf8'));
    assert.deepEqual(board.stack, { platforms: ['node'], languages: ['js'], 'user-confirmed': true }, 'the PR-stack setting never enters the board');
    assert.ok(existsSync(path.join(m.root, ap.backup)), 'apply keeps a copy of the board');
  } finally { dropOldCampaign(m); }
});

test('12.4: migrate regroup gives each shared kept decision one home, by the earliest live owner', () => {
  const m = makeOldCampaign();
  try {
    assert.equal(migrateApply(m.root, SRC, {}, { isMerged: merged }).ok, true);
    const boardPath = path.join(wf(m.root, SRC), 'brainstorm-board.json');
    const board = JSON.parse(readFileSync(boardPath, 'utf8'));
    board.items.push({ ...board.items[0], key: 'd-x', text: 'Decision d-x.' });
    board.work.find((w) => w.key === 'later').items.push('d-eng');
    board.work.push(
      { key: 'thread', title: 'Old thread', shape: 'intake', slug: 'thread', entry: 'x', state: 'routed', order: 5, 'why-here': 'an old thread', items: ['d-base', 'd-later', 'd-x'] },
      { key: 'thread-2', title: 'Old thread 2', shape: 'intake', slug: 'thread-2', entry: 'x', state: 'routed', order: 6, 'why-here': 'an old thread', items: ['d-x'] },
    );
    writeFileSync(boardPath, JSON.stringify(board, null, 2));
    const before = readFileSync(boardPath, 'utf8');

    const dry = run(['migrate', m.root, SRC, 'regroup', '--dry-run']);
    assert.equal(dry.ok, true, JSON.stringify(dry));
    assert.equal(dry.moved, 3);
    assert.deepEqual(dry.unsettled.map((u) => [u.key, u.packets]), [['d-x', ['thread', 'thread-2']]]);
    assert.equal(readFileSync(boardPath, 'utf8'), before, 'a dry run writes nothing');

    const out = run(['migrate', m.root, SRC, 'regroup']);
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(out.groups, { 'eng <- later': 1, 'base <- thread': 1, 'later <- thread': 1 });
    assert.ok(existsSync(path.join(m.root, out.backup)));
    const after = JSON.parse(readFileSync(boardPath, 'utf8'));
    const items = (key) => after.work.find((w) => w.key === key).items;
    assert.deepEqual(items('later'), ['d-later'], 'a started packet keeps the decision; the first not-started unit gets the rest');
    assert.deepEqual(items('thread'), ['d-x'], 'an old thread packet keeps only what no unit holds');
    assert.deepEqual(items('eng').sort(), ['d-eng', 'd-ext']);
    assert.deepEqual(out.packets.find((p) => p.key === 'thread').decisions, 1);
  } finally { dropOldCampaign(m); }
});

test('12.2: a fresh yolo journal in a unit worktree makes the old run live', () => {
  const m = makeOldCampaign();
  try {
    assert.equal(migrationReport(m.root, SRC, {}, { isMerged: merged }).live, false);
    writeFileSync(path.join(m.wtEng, '.ai', 'workflows', 'eng', '.driver-journal.jsonl'), '{"event":"agent-start"}\n');
    assert.equal(migrationReport(m.root, SRC, {}, { isMerged: merged }).live, true);
    assert.equal(migrateApply(m.root, SRC, {}, { isMerged: merged }).ok, false);
  } finally { dropOldCampaign(m); }
});

test('close: a dropped migrated packet removes its old worktree and keeps its branch', () => {
  const m = makeOldCampaign();
  try {
    migratedList(m);
    git(m.wtEng, 'add', 'eng.txt');
    git(m.wtEng, 'commit', '-qm', 'eng: the rest');
    const closed = run(['close', m.root, SRC, 'eng', 'dropped']);
    assert.equal(closed.ok, true, JSON.stringify(closed));
    assert.equal(closed.worktree?.removed, true, JSON.stringify(closed.worktree));
    assert.ok(!existsSync(m.wtEng));
    assert.ok(git(m.root, 'rev-parse', '--verify', m.UNIT));
  } finally { dropOldCampaign(m); }
});

test('12.7: the guarded remove asks before it deletes ignored files, and refuses past its link limit', () => {
  const m = makeOldCampaign();
  try {
    writeFileSync(path.join(m.wtW1, '.gitignore'), '.ai/\nnode_modules\n.env\nlocal.properties\nsub/\n');
    git(m.wtW1, '-c', 'user.email=c@test', '-c', 'user.name=c', 'commit', '-qam', 'ignore more');
    writeFileSync(path.join(m.wtW1, '.env'), 'SECRET=1\n');
    writeFileSync(path.join(m.wtW1, 'local.properties'), 'sdk.dir=x\n');
    const asked = run(['remove-worktree', m.root, SRC, m.wtW1]);
    assert.deepEqual([asked.ok, asked.ignoredAtRisk, asked.ignored], [false, true, ['.env']], JSON.stringify(asked));
    mkdirSync(path.join(m.wtW1, 'sub'));
    symlinkSync(m.target, path.join(m.wtW1, 'sub', 'deps'), 'junction');
    const limited = removeWorktree(m.root, SRC, m.wtW1, { allowIgnored: true, linkLimit: 1 });
    assert.equal(limited.ok, false);
    assert.match(limited.error, /more than 1 links/);
    assert.ok(existsSync(m.wtW1));
    const removed = run(['remove-worktree', m.root, SRC, m.wtW1, '--allow-ignored']);
    assert.equal(removed.ok, true, JSON.stringify(removed));
    assert.equal(removed.linksRemoved, 2);
    assert.equal(readFileSync(path.join(m.target, 'keep.txt'), 'utf8'), 'never deleted\n', 'the remove never follows a link');
  } finally { dropOldCampaign(m); }
});

test('12.7: the guarded remove refuses a worktree with uncommitted code and never touches another worktree', () => {
  const m = makeOldCampaign();
  try {
    const dirty = run(['remove-worktree', m.root, SRC, m.wtEng]);
    assert.equal(dirty.ok, false);
    assert.match(dirty.error, /uncommitted change/);
    const other = run(['remove-worktree', m.root, SRC, m.wtOther]);
    assert.deepEqual([other.ok, other.untouched], [false, true]);
    assert.ok(existsSync(m.wtEng) && existsSync(m.wtOther));
  } finally {
    for (const w of [m.wtOther, m.wtEng, m.wtW1]) { try { git(m.root, 'worktree', 'remove', '--force', w); } catch { /* gone */ } }
    rmSync(m.root, { recursive: true, force: true });
    rmSync(m.outside, { recursive: true, force: true });
  }
});

test('12.7: remove-worktree finds the records manifest of the unit, so a base copy that main moved past is not pending', () => {
  const m = makeOldCampaign();
  try {
    const wtDir = path.join(m.wtEng, '.ai', 'workflows', 'eng');
    const mainIdx = path.join(wf(m.root, 'eng'), '00-index.md');
    // The worktree holds the base copy of the index; the main checkout changed it since.
    writeFileSync(path.join(wtDir, '00-index.md'), readFileSync(mainIdx));
    rmSync(path.join(wtDir, '05-implement-s1.md'));
    appendFileSync(mainIdx, '\nmain moved on\n');
    git(m.wtEng, 'add', 'eng.txt');
    git(m.wtEng, 'commit', '-qm', 'eng: the rest');
    const blind = removeWorktree(m.root, SRC, m.wtEng);
    assert.deepEqual(blind.pending?.map((p) => p.rel), ['workflows/eng/00-index.md'], 'with no manifest the base copy looks lost');
    const removed = run(['remove-worktree', m.root, SRC, m.wtEng]);
    assert.equal(removed.ok, true, JSON.stringify(removed));
    assert.ok(!existsSync(m.wtEng));
  } finally { dropOldCampaign(m); }
});

const FAKE_GH = path.resolve(import.meta.dirname, '..', 'fixtures', 'fake-gh.mjs');

/** Run `fn` with the fake gh, and return its log of calls. */
function withFakeGh(fn) {
  const log = path.join(tmp('fake-gh '), 'calls.jsonl');
  const saved = { bin: process.env.SDLC_GH_BIN, log: process.env.FAKE_GH_LOG };
  process.env.SDLC_GH_BIN = FAKE_GH;
  process.env.FAKE_GH_LOG = log;
  try {
    fn();
  } finally {
    for (const [k, v] of [['SDLC_GH_BIN', saved.bin], ['FAKE_GH_LOG', saved.log]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
}

function addRemote(root) {
  const bare = tmp('remote ');
  git(bare, 'init', '-q', '--bare', '-b', 'main');
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  return bare;
}

test('a done packet pushes the list branch and opens one draft PR, then only pushes', () => {
  const root = builtPacket(['d-one']);
  try {
    const bare = addRemote(root);
    review(root, 'demo-engine', [['d-one', 'honored', 'app.txt:1', '—']]);
    let r;
    const calls = withFakeGh(() => { r = run(['done', root, SRC, 'engine']); });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.publish.pushed, r.publish.opened, r.publish.pr], [true, true, 7]);
    assert.ok(calls.some((c) => c[0] === 'pr' && c[1] === 'create' && c.includes('--draft')), 'the PR opens as a draft');
    assert.equal(git(bare, 'rev-parse', `packets/${SRC}`), git(root, 'rev-parse', `packets/${SRC}`), 'the list branch is pushed');
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'index.md'))['pr-number'], 7);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a stored PR that merged earlier gets a new draft PR', () => {
  const root = builtPacket(['d-one']);
  const saved = process.env.FAKE_GH_PR;
  try {
    addRemote(root);
    review(root, 'demo-engine', [['d-one', 'honored', 'app.txt:1', '—']]);
    const listFile = path.join(wf(root, SRC), 'work', 'index.md');
    writeFileSync(listFile, readFileSync(listFile, 'utf8').replace(/^---\r?\n/, '---\npr-number: 3\n'));
    process.env.FAKE_GH_PR = '{"state":"MERGED"}';
    let r;
    const calls = withFakeGh(() => { r = run(['done', root, SRC, 'engine']); });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual([r.publish.opened, r.publish.pr], [true, 7], 'the merged PR #3 is replaced by a new draft');
    assert.ok(calls.some((c) => c[0] === 'pr' && c[1] === 'create'));
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'index.md'))['pr-number'], 7);
  } finally {
    if (saved === undefined) delete process.env.FAKE_GH_PR; else process.env.FAKE_GH_PR = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

test('land refuses to cut the list branch from a trunk that diverged from its remote', () => {
  const root = makeRepo();
  try {
    const bare = addRemote(root);
    const other = tmp('other ');
    git(other, 'clone', '-q', bare, '.');
    git(other, 'config', 'user.email', 'o@test');
    git(other, 'config', 'user.name', 'o');
    writeFileSync(path.join(other, 'b.txt'), 'theirs\n');
    git(other, 'add', '.');
    git(other, 'commit', '-q', '-m', 'theirs');
    git(other, 'push', '-q', 'origin', 'main');
    writeFileSync(path.join(root, 'a.txt'), 'ours\n');
    git(root, 'add', 'a.txt');
    git(root, 'commit', '-q', '-m', 'ours');
    writeBoard(root, [{ key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP }], ['d-one']);
    assert.equal(run(['write', wf(root, SRC)]).ok, true);
    const land = run(['land', root, SRC]);
    assert.equal(land.ok, false);
    assert.equal(land.base.state, 'diverged');
    rmSync(other, { recursive: true, force: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the stacked shape: each build packet lands on its own layer, made by gh stack init and add', () => {
  const root = makeRepo();
  try {
    mkdirSync(path.join(root, '.ai'), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'ship-plan.md'), '---\nschema: sdlc/v1\ntype: ship-plan\nslug: ship-plan\nproject-name: demo\nplan-version: 1\npr-shape: stacked\n---\n');
    const packet = (key, order) => ({ key, title: key, shape: 'intake', slug: `demo-${key}`, entry: 'x', state: 'proposed', order, ...(order > 1 ? { 'why-here': 'It needs the engine.' } : {}), items: [`d-${key}`], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP });
    writeBoard(root, [packet('engine', 1), packet('ui', 2)], ['d-engine', 'd-ui']);
    const w = run(['write', wf(root, SRC)]);
    assert.equal(w.ok, true, JSON.stringify(w));
    let first;
    const calls = withFakeGh(() => {
      assert.match(run(['land', root, SRC]).error, /pass the packet key/);
      assert.equal(run(['open', root, SRC, 'engine']).ok, true);
      first = run(['land', root, SRC, 'engine']);
      assert.equal(run(['start', root, SRC, 'engine']).ok, true);
      writeFileSync(path.join(root, 'app.txt'), 'engine\n');
      git(root, 'commit', '-q', '-am', 'engine');
      assert.equal(run(['built', root, SRC, 'engine']).ok, true);
      review(root, 'demo-engine', [['d-engine', 'honored', 'app.txt:1', '—']]);
      const done = run(['done', root, SRC, 'engine']);
      assert.equal(done.ok, true, done.error);
      assert.equal(done.shape, 'stacked');
      assert.equal(run(['open', root, SRC, 'ui']).ok, true);
      const second = run(['land', root, SRC, 'ui']);
      assert.equal(second.from, `packets/${SRC}--engine`, 'the second layer starts from the first');
    });
    assert.deepEqual([first.ok, first.branch, first.from], [true, `packets/${SRC}--engine`, 'main']);
    assert.deepEqual(calls.filter((c) => c[0] === 'stack').map((c) => c.slice(0, 2)), [['stack', 'init'], ['stack', 'add']]);
    assert.equal(git(root, 'branch', '--show-current'), `packets/${SRC}--ui`);
    assert.equal(git(root, 'merge-base', '--is-ancestor', `packets/${SRC}--engine`, 'HEAD') === '', true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a question left to the build waits in open-questions; status shows it, and an answer clears it', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one', 'q-format'], goal: 'Build the engine.', 'acceptance-criteria': ['The engine runs.'], ...WRITE_UP },
    ], ['d-one']);
    const boardFile = path.join(dir, 'brainstorm-board.json');
    const board = JSON.parse(readFileSync(boardFile, 'utf8'));
    board.items.push({ key: 'q-format', kind: 'question', thread: 'main', text: 'Which format does the export use?', source: 'agent', state: 'for-plan', 'left-to-build': 'ask' });
    writeFileSync(boardFile, JSON.stringify(board, null, 2));
    assert.equal(run(['write', dir]).ok, true);
    assert.equal(run(['open', root, SRC, 'engine']).ok, true);

    const st = run(['status', root, SRC]);
    assert.equal(st.current.step, 'slice');
    assert.deepEqual(st.current.questions, [{ key: 'q-format', question: 'Which format does the export use?' }]);

    execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/wf.mjs', import.meta.url)), 'decide', 'add', root, 'demo-engine', '--kind', 'answer', '--key', 'q-format', '--stage', 'slice', '--question', 'Which format does the export use?', '--answer', 'CSV'], { encoding: 'utf8' });
    assert.deepEqual(rec(root, 'demo-engine', '00-index.md')['open-questions'], []);
    assert.equal(run(['status', root, SRC]).current.questions, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// A built packet whose fidelity rows are honored: done is the next step.
function readyPacket(extra = []) {
  const root = makeRepo();
  const dir = writeBoard(root, [
    { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
    ...extra,
  ], ['d-one', ...extra.flatMap((w) => w.items)]);
  assert.equal(run(['write', dir]).ok, true);
  assert.equal(run(['open', root, SRC, 'engine']).ok, true);
  run(['land', root, SRC]);
  assert.equal(run(['start', root, SRC, 'engine']).ok, true);
  writeFileSync(path.join(root, 'app.txt'), 'v1 engine\n');
  git(root, 'commit', '-qam', 'engine');
  assert.equal(run(['built', root, SRC, 'engine']).ok, true);
  review(root, 'demo-engine', [['d-one', 'honored', 'app.txt:1', '—']]);
  return root;
}

test('done waits while the checkout has changes outside .ai/, and a tracked .ai/ change is not one', () => {
  const root = readyPacket();
  try {
    writeFileSync(path.join(root, 'scratch.txt'), 'work in progress\n');
    const busy = run(['done', root, SRC, 'engine']);
    assert.deepEqual([busy.ok, busy.busy, busy.dirty], [false, true, ['scratch.txt']], JSON.stringify(busy));
    rmSync(path.join(root, 'scratch.txt'));
    // A tracked file under .ai/ with a change: the first status line starts with a space.
    mkdirSync(path.join(root, '.ai'), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'aaa-note.txt'), 'one\n');
    git(root, 'add', '-f', '.ai/aaa-note.txt');
    git(root, 'commit', '-qm', 'a tracked note');
    writeFileSync(path.join(root, '.ai', 'aaa-note.txt'), 'two\n');
    const done = run(['done', root, SRC, 'engine']);
    assert.equal(done.ok, true, JSON.stringify(done));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('done waits while the driver of a later packet runs in the checkout', () => {
  const root = readyPacket([{ key: 'screen', title: 'Screen', shape: 'intake', slug: 'demo-screen', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it shows the engine', items: ['d-two'], goal: 'Show it.', 'acceptance-criteria': ['It shows.'], ...WRITE_UP }]);
  try {
    assert.equal(run(['open', root, SRC, 'screen']).ok, true);
    const journal = path.join(wf(root, 'demo-screen'), '.driver-journal.jsonl');
    writeFileSync(journal, `${JSON.stringify({ at: new Date().toISOString(), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:a' })}\n`);
    const busy = run(['done', root, SRC, 'engine']);
    assert.deepEqual([busy.ok, busy.busy, busy.running], [false, true, 'demo-screen'], JSON.stringify(busy));
    appendFileSync(journal, `${JSON.stringify({ at: new Date().toISOString(), run: 'r1', event: 'run-end', agent: 'main-session' })}\n`);
    assert.equal(run(['done', root, SRC, 'engine']).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the guarded remove takes away only the links that git does not track', () => {
  const root = makeRepo('links ');
  try {
    const blob = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], { input: 'target', encoding: 'utf8' }).trim();
    git(root, 'update-index', '--add', '--cacheinfo', `120000,${blob},tracked-link`);
    const links = [path.join(root, 'tracked-link'), path.join(root, 'node_modules')];
    assert.deepEqual(untrackedLinks(root, links), [path.join(root, 'node_modules')]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('12.3: start stops before the one-commit step when a tracked .ai/ file has a change', () => {
  const m = makeOldCampaign();
  try {
    writeFileSync(path.join(m.wtEng, '.ai', 'workflows', 'eng', 'tracked.md'), 'one\n');
    git(m.wtEng, 'add', '-f', '.ai/workflows/eng/tracked.md');
    git(m.wtEng, 'commit', '-qm', 'eng: a tracked record');
    writeFileSync(path.join(m.wtEng, '.ai', 'workflows', 'eng', 'tracked.md'), 'two\n');
    migratedList(m);
    const before = git(m.wtEng, 'rev-list', '--count', 'HEAD');
    const start = run(['start', m.root, SRC, 'eng']);
    assert.equal(start.ok, false, JSON.stringify(start));
    assert.deepEqual(start.unstaged, ['.ai/workflows/eng/tracked.md']);
    assert.match(start.error, /git does not rebase a tree with changes/);
    assert.equal(git(m.root, 'branch', '--list', `campaign/${SRC}/backup--eng`), '', 'no one-commit step ran');
    assert.ok(Number(git(m.wtEng, 'rev-list', '--count', 'HEAD')) <= Number(before) + 1, 'at most the snapshot commit');
  } finally { dropOldCampaign(m); }
});

// ---------------------------------------------------------------- next, skip, plan

/** Run the exact command line of a `next` action, and return its JSON. */
function execAction(a) {
  assert.ok(a.command, `the action ${a.action} has a command: ${JSON.stringify(a)}`);
  let out;
  try { out = execSync(a.command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = e.stdout; }
  return JSON.parse(out);
}
const journalLine = (root, slug, line) => appendFileSync(path.join(wf(root, slug), '.driver-journal.jsonl'), `${JSON.stringify(line)}\n`);
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const packetFiles = (root) => {
  const dir = path.join(wf(root, SRC), 'work');
  return readdirSync(dir).filter((n) => n.endsWith('.md')).sort().map((n) => readFileSync(path.join(dir, n), 'utf8'));
};

test('next gives one action at a time over the whole walk, and changes nothing', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
      { key: 'screen', title: 'Screen', shape: 'intake', slug: 'demo-screen', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it shows the engine', items: ['d-two'], goal: 'Show it.', 'acceptance-criteria': ['It shows.'], ...WRITE_UP, 'try-out': 'yes' },
      { key: 'why-slow', title: 'Why slow', shape: 'rca', slug: 'why-slow', entry: 'x', state: 'proposed', order: 3, 'why-here': 'it measures the screen', items: ['d-three'] },
    ], ['d-one', 'd-two', 'd-three']);
    assert.equal(run(['write', dir]).ok, true);
    const next = (...flags) => run(['next', root, SRC, ...flags]);

    // Each written build packet opens first, in list order. next itself changes nothing.
    const before = [packetFiles(root), git(root, 'branch', '--show-current'), git(root, 'status', '--porcelain')];
    let a = next();
    assert.deepEqual([a.ok, a.action, a.key], [true, 'open', 'engine']);
    assert.match(a.command, /campaign\.mjs" open ".+" brainstorm-demo engine$/);
    assert.match(a.then.next, /campaign\.mjs" next ".+" brainstorm-demo$/);
    assert.deepEqual([packetFiles(root), git(root, 'branch', '--show-current'), git(root, 'status', '--porcelain')], before, 'next is read-only');
    assert.equal(execAction(a).opened, true);
    a = next();
    assert.deepEqual([a.action, a.key], ['open', 'screen']);
    execAction(a);

    // Once per call: the plan, then how far to go.
    a = next();
    assert.equal(a.action, 'ask-how-far');
    assert.match(a.command, /campaign\.mjs" plan ".+" brainstorm-demo$/);
    assert.match(a.shipReady, /wf\.mjs" ship ready ".+" brainstorm-demo$/);
    assert.match(a.then.next, /--how-far <next\|all\|N> --since \S+ --run-decisions "<answer>"$/);
    const F = ['--how-far', 'all', '--since', a.since, '--run-decisions', 'Stop and wait for me'];

    a = next(...F);
    assert.deepEqual([a.action, a.key], ['land', 'engine']);
    assert.equal(execAction(a).branch, `packets/${SRC}`);
    a = next(...F);
    assert.deepEqual([a.action, a.args], ['slice', { slug: 'demo-engine' }], 'the first packet reviews from the trunk: start changes nothing');
    writeFileSync(path.join(wf(root, 'demo-engine'), '03-slice.md'), '---\ntype: slice\n---\n');
    a = next(...F);
    assert.deepEqual([a.action, a.args], ['launch-driver', { slug: 'demo-engine' }]);
    assert.match(a.command, /wf\.mjs" decide add ".+" demo-engine --kind steer --key run-decisions --question ".+" --answer "Stop and wait for me"$/);
    addDecision(wf(root, 'demo-engine'), { kind: 'steer', key: 'run-decisions', question: 'q', answer: 'Stop and wait for me' });
    assert.equal(next(...F).command, undefined, 'the answer is recorded once');

    // The run: live, then a clean end.
    journalLine(root, 'demo-engine', { at: new Date().toISOString(), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:a' });
    a = next(...F);
    assert.deepEqual([a.action, a.slug], ['wait', 'demo-engine']);
    writeFileSync(path.join(root, 'app.txt'), 'v1 engine\n');
    git(root, 'commit', '-qam', 'engine');
    journalLine(root, 'demo-engine', { at: ago(60_000), run: 'r1', event: 'run-end', agent: 'run-end' });
    a = next(...F);
    assert.equal(a.action, 'built');
    assert.equal(execAction(a).state, 'built');
    a = next(...F);
    assert.equal(a.action, 'launch-driver');
    assert.match(a.why, /no ## Decision Fidelity table/);

    // The fidelity rows, a fix, the rows again, the approval, done.
    review(root, 'demo-engine', [['d-one', 'narrowed', 'app.txt:1', '—']]);
    a = next(...F);
    assert.deepEqual([a.action, a.ask.map((e) => [e.key, e.kind])], ['ask', [['engine', 'fidelity']]]);
    const ledger = mergeRun({ findings: [], runs: [] }, [{ key: 'd-one', dimension: 'intent-fidelity', severity: 'HIGH', file: null, issue: 'narrowed', fix: 'widen it' }], { dimensions: ['intent-fidelity'] });
    writeLedger(wf(root, 'demo-engine'), ledger.ledger);
    a = next(...F);
    assert.deepEqual([a.action, a.args], ['fix-run', { slug: 'demo-engine', reviewFindings: true }]);
    journalLine(root, 'demo-engine', { at: new Date(Date.now() + 2000).toISOString(), run: 'r2', event: 'run-end', agent: 'run-end' });
    assert.equal(next(...F).action, 'ask', 'after the fix run the rows are asked again');
    addDecision(wf(root, 'demo-engine'), { kind: 'approval', key: 'd-one', answer: 'approved', question: 'q' });
    a = next(...F);
    assert.equal(a.action, 'done');
    assert.equal(execAction(a).state, 'done');
    assert.ok(fm(path.join(dir, 'work', 'demo-engine.md'))['done-at'], 'done stamps done-at');

    // How far: the next packet only ends the call here.
    a = next('--how-far', 'next', '--since', F[3]);
    assert.deepEqual([a.action, a.doneThisCall, a.nextPacket?.key], ['end', ['engine'], 'screen']);
    assert.equal(a.tell, `Type \`/wf campaign ${SRC}\``);
    a = next('--end');
    assert.deepEqual([a.action, a.why, a.nextPacket?.key], ['end', 'the call ends', 'screen'], '--end ends the call');

    // The second packet: start moves its base to the end branch of the first.
    a = next(...F);
    assert.deepEqual([a.action, a.key], ['start', 'screen']);
    assert.match(a.why, /start sets it to packets\/brainstorm-demo--engine/);
    assert.equal(execAction(a).base, `packets/${SRC}--engine`);
    writeFileSync(path.join(wf(root, 'demo-screen'), '03-slice.md'), '---\ntype: slice\n---\n');
    journalLine(root, 'demo-screen', { at: ago(60_000), run: 'r1', event: 'run-end', agent: 'run-end', stoppedAt: 'verify', reason: 'a check failed twice' });
    a = next(...F);
    assert.deepEqual([a.action, a.stoppedAt, a.args], ['driver-stop', 'verify', { slug: 'demo-screen' }]);
    assert.match(a.tell, /stopped at verify: a check failed twice/);
    journalLine(root, 'demo-screen', { at: ago(30_000), run: 'r2', event: 'run-end', agent: 'run-end' });
    assert.equal(execAction(next(...F)).state, 'built');
    review(root, 'demo-screen', [['d-two', 'honored', 'app.txt:1', '—']]);
    a = next(...F);
    assert.deepEqual([a.action, a.ask.map((e) => e.kind)], ['ask', ['try-out']]);
    addDecision(wf(root, 'demo-screen'), { kind: 'try-out', key: 'try-out', answer: 'works', question: 'q' });
    assert.equal(execAction(next(...F)).state, 'done');

    // A routed packet: the person runs its command; a complete workflow closes it.
    a = next(...F);
    assert.deepEqual([a.action, a.route, a.tell], ['route-stop', '/wf intake rca why-slow', 'Type `/wf intake rca why-slow`']);
    mkdirSync(wf(root, 'why-slow'), { recursive: true });
    writeFileSync(path.join(wf(root, 'why-slow'), '00-index.md'), '---\nschema: sdlc/v1\ntype: workflow-index\nslug: why-slow\nstatus: complete\n---\n');
    a = next(...F);
    assert.equal(a.action, 'close');
    assert.equal(execAction(a).state, 'done');
    a = next(...F);
    assert.deepEqual([a.action, a.tell], ['hand-off', `Type \`/wf ship packets/${SRC}\``]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('skip: a later packet runs ahead only with the answer of the person, and the skipped packet runs later on the list branch as it then is', () => {
  const root = makeRepo();
  try {
    const packet = (key, order, extra = {}) => ({ key, title: key, shape: 'intake', slug: `demo-${key}`, entry: 'x', state: 'proposed', order, ...(order > 1 ? { 'why-here': `${key} comes after the ones before it` } : {}), items: [`d-${key}`], goal: `Build ${key}.`, 'acceptance-criteria': [`${key} works.`], ...WRITE_UP, ...extra });
    const dir = writeBoard(root, [packet('engine', 1), packet('screen', 2, { 'ux-impact': 'visual', 'try-out': 'yes' }), packet('api', 3), packet('docs', 4)], ['d-engine', 'd-screen', 'd-api', 'd-docs']);
    assert.equal(run(['write', dir]).ok, true);
    const file = (key) => path.join(dir, 'work', `demo-${key}.md`);
    const next = (...flags) => run(['next', root, SRC, '--how-far', 'all', '--since', '2026-01-01T00:00:00Z', ...flags]);

    // A skip of a written packet survives a write of the list.
    assert.match(run(['skip', root, SRC, 'docs']).error, /needs --reason/);
    assert.equal(run(['skip', root, SRC, 'docs', '--reason', 'later']).changed, true);
    const boardFile = path.join(dir, 'brainstorm-board.json');
    const board = JSON.parse(readFileSync(boardFile, 'utf8'));
    board.work.find((w) => w.key === 'docs').goal = 'Write the docs.';
    writeFileSync(boardFile, JSON.stringify(board, null, 2));
    const w = run(['write', dir]);
    assert.deepEqual(w.changed, ['docs']);
    assert.deepEqual([fm(file('docs')).skipped.reason, fm(file('docs')).skipped.by], ['later', 'person']);
    assert.match(readFileSync(file('docs'), 'utf8'), /Write the docs\./);
    assert.equal(run(['unskip', root, SRC, 'docs']).changed, true);
    assert.equal(fm(file('docs')).skipped, undefined);
    assert.equal(run(['unskip', root, SRC, 'docs']).changed, false);

    for (const k of ['engine', 'screen', 'api', 'docs']) assert.equal(run(['open', root, SRC, k]).ok, true);
    run(['land', root, SRC]);
    assert.equal(run(['start', root, SRC, 'engine']).ok, true);
    writeFileSync(path.join(root, 'app.txt'), 'engine\n');
    git(root, 'commit', '-qam', 'engine');
    run(['built', root, SRC, 'engine']);
    review(root, 'demo-engine', [['d-engine', 'honored', 'app.txt:1', '—']]);
    assert.equal(run(['done', root, SRC, 'engine']).ok, true);
    const engineEnd = git(root, 'rev-parse', `packets/${SRC}--engine`);

    // The design of the screen is not settled: the walk stops, and the person skips it.
    let a = next();
    assert.deepEqual([a.action, a.key, a.tell], ['design-stop', 'screen', 'Type `/wf design demo-screen`']);
    const skip = run(['skip', root, SRC, 'screen', '--reason', 'the brand is not ready']);
    assert.deepEqual([skip.ok, skip.state, skip.skipped.reason], [true, 'open', 'the brand is not ready']);
    assert.equal(fm(file('screen')).state, 'open', 'a skipped packet keeps its state');
    let st = run(['status', root, SRC]);
    assert.deepEqual(st.packets.find((p) => p.key === 'screen').skipped.reason, 'the brand is not ready');
    assert.deepEqual(st.skipped.map((s) => s.key), ['screen']);
    assert.equal(st.current, null, 'no later packet runs without the person');
    assert.deepEqual(st.held.map((h) => [h.key, h.waitsFor]), [['api', ['screen']], ['docs', ['screen', 'api']]]);
    assert.equal(st.finished, false);

    // next asks which may run ahead, with the why-here of each.
    a = next();
    assert.equal(a.action, 'ask');
    assert.equal(a.ask[0].kind, 'ahead');
    assert.deepEqual(a.ask[0].candidates.map((c) => [c.key, c['why-here']]), [['api', 'api comes after the ones before it'], ['docs', 'docs comes after the ones before it']]);
    assert.match(a.then.record, /campaign\.mjs" ahead ".+" brainstorm-demo <key>\.\.\.$/);
    assert.match(run(['ahead', root, SRC, 'engine']).error, /does not wait for a skipped packet/);
    const ahead = run(['ahead', root, SRC, 'api']);
    assert.deepEqual(ahead.recorded, [{ key: 'api', 'ahead-of': ['screen'] }]);
    assert.deepEqual(fm(file('api'))['ahead-of'], ['screen']);

    // api runs ahead: it reviews from the end branch of engine, never from the skipped screen.
    st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current['ahead-of']], ['api', ['screen']]);
    a = next();
    assert.deepEqual([a.action, a.key], ['start', 'api']);
    assert.equal(run(['start', root, SRC, 'api']).base, `packets/${SRC}--engine`);
    writeFileSync(path.join(root, 'api.txt'), 'api\n');
    git(root, 'add', 'api.txt');
    git(root, 'commit', '-qm', 'api');
    assert.match(run(['skip', root, SRC, 'api', '--reason', 'x']).error, /holds work of api that is not built/);
    assert.match(run(['unskip', root, SRC, 'screen']).error, /api runs ahead of screen/);
    run(['built', root, SRC, 'api']);
    review(root, 'demo-api', [['d-api', 'honored', 'api.txt:1', '—']]);
    assert.equal(run(['done', root, SRC, 'api']).ok, true);
    const apiEnd = git(root, 'rev-parse', `packets/${SRC}--api`);
    assert.notEqual(apiEnd, engineEnd);

    // docs still waits on screen: the walk asks again, never guesses.
    a = next();
    assert.deepEqual([a.action, a.ask[0].candidates.map((c) => [c.key, c.waitsFor])], ['ask', [['docs', ['screen']]]]);

    // The skip is taken back: screen runs, on the list branch as it is now.
    assert.equal(run(['unskip', root, SRC, 'screen']).changed, true);
    setRecordFields(wf(root, 'demo-screen'), '00-index.md', { 'ux-impact': 'none' });
    a = next();
    assert.deepEqual([a.action, a.key], ['start', 'screen']);
    assert.equal(run(['start', root, SRC, 'screen']).base, `packets/${SRC}--api`, 'the skipped packet reviews only its own work');
    assert.equal(run(['status', root, SRC]).finished, false, 'ship waits for every packet');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('skip: a skipped built packet holds nothing, and asks nothing until the skip is taken back', () => {
  const root = makeRepo();
  try {
    const dir = writeBoard(root, [
      { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP },
      { key: 'api', title: 'Api', shape: 'intake', slug: 'demo-api', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it serves the engine', items: ['d-two'], goal: 'Serve it.', 'acceptance-criteria': ['It serves.'], ...WRITE_UP },
    ], ['d-one', 'd-two']);
    assert.equal(run(['write', dir]).ok, true);
    run(['open', root, SRC, 'engine']);
    run(['land', root, SRC]);
    run(['start', root, SRC, 'engine']);
    writeFileSync(path.join(root, 'app.txt'), 'engine\n');
    git(root, 'commit', '-qam', 'engine');
    run(['built', root, SRC, 'engine']);
    review(root, 'demo-engine', [['d-one', 'narrowed', 'app.txt:1', '—']]);
    assert.equal(run(['status', root, SRC]).current.key, 'engine');
    assert.equal(run(['skip', root, SRC, 'engine', '--reason', 'I look at it tomorrow']).ok, true);
    const st = run(['status', root, SRC]);
    assert.deepEqual([st.current.key, st.current.step, st.held], ['api', 'open', undefined]);
    assert.deepEqual([...st.ask, ...st.askLater], [], 'the rows of a skipped packet wait for the person');
    run(['open', root, SRC, 'api']);
    assert.equal(run(['start', root, SRC, 'api']).base, `packets/${SRC}--engine`, 'its built work is on the list branch');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('skip: the stacked shape refuses a skip and an ahead answer', () => {
  const root = makeRepo();
  try {
    mkdirSync(path.join(root, '.ai'), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'ship-plan.md'), '---\nschema: sdlc/v1\ntype: ship-plan\nslug: ship-plan\nproject-name: demo\nplan-version: 1\npr-shape: stacked\n---\n');
    const packet = (key, order) => ({ key, title: key, shape: 'intake', slug: `demo-${key}`, entry: 'x', state: 'proposed', order, ...(order > 1 ? { 'why-here': 'It needs the engine.' } : {}), items: [`d-${key}`], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP });
    writeBoard(root, [packet('engine', 1), packet('ui', 2)], ['d-engine', 'd-ui']);
    assert.equal(run(['write', wf(root, SRC)]).ok, true);
    const r = run(['skip', root, SRC, 'engine', '--reason', 'later']);
    assert.equal(r.ok, false);
    assert.match(r.error, /stacked shape builds each layer on the layer below it/);
    assert.equal(fm(path.join(wf(root, SRC), 'work', 'demo-engine.md')).skipped, undefined);
    assert.match(run(['ahead', root, SRC, 'ui']).error, /stacked shape/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** A past run: an index with `slices` complete slices, and cost rows. */
function pastRun(root, slug, slices, rows) {
  mkdirSync(wf(root, slug), { recursive: true });
  writeFileSync(path.join(wf(root, slug), '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\nslices:\n${Array.from({ length: slices }, (_, i) => `  - slug: s${i}\n    status: complete\n`).join('')}---\n`);
  writeFileSync(path.join(wf(root, slug), 'cost-2026-10.jsonl'), rows.map((r, i) => JSON.stringify({ ts: `2026-10-01T00:00:${String(i).padStart(2, '0')}Z`, host: 'claude', session: 's', turn: i + 1, key: 'implement', slug, slice: 's0', main: null, subagents: [], external: [], ...r })).join('\n') + '\n');
}
const usage = (input, output, cacheRead, cacheWrite = 0) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite });

function mixedList(root) {
  const dir = writeBoard(root, [
    { key: 'engine', title: 'Engine', shape: 'intake', slug: 'demo-engine', entry: 'x', state: 'proposed', order: 1, items: ['d-one'], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP, 'estimated-slices': 8 },
    { key: 'screen', title: 'Screen', shape: 'intake', slug: 'demo-screen', entry: 'x', state: 'proposed', order: 2, 'why-here': 'it shows the engine', items: ['d-two', 'q-format'], goal: 'Show it.', 'acceptance-criteria': ['It shows.'], ...WRITE_UP, 'ux-impact': 'visual', 'try-out': 'yes', 'estimated-slices': 10 },
    { key: 'why-slow', title: 'Why slow', shape: 'rca', slug: 'why-slow', entry: 'x', state: 'proposed', order: 3, 'why-here': 'it measures the screen', items: ['d-three'] },
  ], ['d-one', 'd-two', 'd-three']);
  const boardFile = path.join(dir, 'brainstorm-board.json');
  const board = JSON.parse(readFileSync(boardFile, 'utf8'));
  board.items.push({ key: 'q-format', kind: 'question', thread: 'main', text: 'Which format?', source: 'agent', state: 'for-plan', 'left-to-build': 'ask' });
  writeFileSync(boardFile, JSON.stringify(board, null, 2));
  assert.equal(run(['write', dir]).ok, true);
  return dir;
}

test('plan shows the whole walk: forms, states, design, stops, slices, and a cost range per column only from past runs', () => {
  const root = makeRepo();
  try {
    mixedList(root);
    const before = packetFiles(root);
    let p = run(['plan', root, SRC, '--full']);
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.deepEqual(packetFiles(root), before, 'plan is read-only');
    assert.deepEqual(p.packets.map((r) => [r.key, r.form, r.state, r.design, r.estimatedSlices]), [
      ['engine', 'intake', 'written', 'none', 8], ['screen', 'intake', 'written', 'needed', 10], ['why-slow', 'rca', 'written', 'none', null],
    ]);
    assert.deepEqual(p.packets.map((r) => r.stops.map((s) => s.kind)), [[], ['design', 'carried', 'try-out'], ['route']]);
    assert.equal(p.packets[1].stops.find((s) => s.kind === 'carried').count, 1);
    assert.equal(p.packets[2].stops[0].route, '/wf intake rca why-slow');
    assert.deepEqual(p.totals.stops, { route: { count: 1, packets: 'why-slow' }, design: { count: 1, packets: 'screen' }, carried: { count: 1, packets: 'screen' }, 'try-out': { count: 1, packets: 'screen' } });
    assert.equal(p.totals.slicesLeft, 18);
    // No past run: no number.
    assert.deepEqual([p.cost.runs, p.cost.perSlice, p.totals.cost, p.packets[0].cost], [0, null, null, null]);
    assert.match(p.cost.note, /no cost estimate/);

    // Two past runs with cost rows and complete slices: each column apart.
    pastRun(root, 'old-one', 2, [{ main: { model: 'm', ...usage(200, 1000, 50_000, 4000) } }]);
    pastRun(root, 'old-two', 1, [{ main: { model: 'm', ...usage(300, 3000, 90_000, 6000) } }]);
    p = run(['plan', root, SRC, '--full']);
    assert.deepEqual([p.cost.runs, p.cost.slices, p.cost.unit], [2, 3, 'tokens']);
    assert.deepEqual(Object.keys(p.cost.perSlice), ['output', 'input', 'cacheWrite', 'cacheRead'], 'output and fresh input lead');
    assert.deepEqual([p.cost.perSlice.output.low, p.cost.perSlice.output.high, p.cost.perSlice.input.low, p.cost.perSlice.cacheRead.high], [500, 3000, 100, 90_000]);
    assert.deepEqual(p.packets[0].cost.output, { low: 8 * 500, high: 8 * 3000 });
    assert.equal(p.packets[2].cost, undefined, 'a routed packet has no build cost');
    assert.deepEqual(p.totals.cost.output, { low: 18 * 500, high: 18 * 3000 });
    assert.equal(p.totals.costLine, 'output 9k–54k, fresh input 2k–5k tokens; cache write 36k–108k, cache read 450k–1.6M');

    // The compact default: totals, the stops, the next packets in full, and the cost line.
    p = run(['plan', root, SRC]);
    assert.deepEqual(p.next.map((r) => r.key), ['engine', 'screen', 'why-slow']);
    assert.equal(p.next[0].cost, 'output 4k–24k, fresh input 800–2k tokens; cache write 16k–48k, cache read 200k–720k');
    assert.equal(p.cost.perSlice, 'per slice: output 500–3k, fresh input 100–300 tokens; cache write 2k–6k, cache read 25k–90k');
    assert.deepEqual([p.rest, p.closed], [[], { done: 0, dropped: 0 }]);
    assert.match(p.full, /campaign\.mjs" plan ".+" brainstorm-demo --full$/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plan gives no cost from rows that book a sub-agent again, or from a figure past the bound', () => {
  const root = makeRepo();
  try {
    mixedList(root);
    // The failing shape: each row books the same sub-agent again with the same usage.
    const agent = { agent_id: 'a0cac6f94da7', model: 'claude-opus', ...usage(358, 1946, 41_052_828) };
    pastRun(root, 'rebooked', 2, Array.from({ length: 5 }, () => ({ main: { model: 'm', ...usage(10, 100, 5000) }, subagents: [agent] })));
    let p = run(['plan', root, SRC, '--full']);
    assert.deepEqual([p.cost.runs, p.cost.perSlice, p.totals.cost], [0, null, null]);
    assert.match(p.cost.note, /^the cost rows of this project cannot be summed: /);
    assert.deepEqual(p.cost.excluded.map((e) => e.slug), ['rebooked']);
    assert.match(p.cost.excluded[0].reason, /^4 sub-agent entries book again a usage that an earlier row booked; scripts\/cost-rebuild\.mjs repairs/);

    // A clean run past the bound is left out too; a clean run in the bound is the basis.
    pastRun(root, 'huge', 1, [{ main: { model: 'm', ...usage(10, 100, 2_000_000_000) } }]);
    pastRun(root, 'clean', 1, [{ main: { model: 'm', ...usage(10, 100, 5000) } }, { subagents: [{ agent_id: 'b1', model: 'm', ...usage(5, 50, 1000) }] }]);
    p = run(['plan', root, SRC]);
    assert.deepEqual([p.cost.runs, p.cost.excluded, p.cost.excludedWhy.length], [1, 2, 2]);
    assert.ok(p.cost.excludedWhy.some((w) => /is above the bound of 1,000,000,000/.test(w)));
    assert.equal(p.cost.perSlice, 'per slice: output 150, fresh input 15 tokens; cache write 0, cache read 6k');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plan is compact by default: a list of 60 packets stays under the ceiling, and --full gives every packet', () => {
  const root = makeRepo();
  try {
    const work = Array.from({ length: 60 }, (_, i) => ({
      key: `packet-number-${String(i + 1).padStart(2, '0')}-of-the-long-list`, title: `A long title of packet ${i + 1} `.repeat(12), shape: 'intake', slug: `packet-number-${String(i + 1).padStart(2, '0')}-of-the-long-list`, entry: 'x', state: 'proposed',
      order: i + 1, ...(i ? { 'why-here': 'it builds on the one before it' } : {}), items: [`d-${i + 1}`], goal: 'Build it.', 'acceptance-criteria': ['It runs.'], ...WRITE_UP,
      ...(i % 2 ? { 'ux-impact': 'visual', 'try-out': 'yes' } : {}),
    }));
    writeBoard(root, work, work.map((w) => w.items[0]));
    assert.equal(run(['write', wf(root, SRC)]).ok, true);
    pastRun(root, 'old-one', 2, [{ main: { model: 'm', ...usage(200, 1000, 50_000, 4000) } }]);
    const p = run(['plan', root, SRC]);
    const size = JSON.stringify(p, null, 2).length;
    assert.ok(size < PLAN_CEILING, `the compact plan is ${size} characters`);
    assert.equal(p.next.length, PLAN_NEXT);
    assert.ok(p.next.every((r) => r.title.length <= PLAN_TITLE));
    assert.equal(p.rest.length, 60 - PLAN_NEXT);
    assert.match(p.rest[0], /^packet-number-06-of-the-long-list · intake · written · design needed · 8 slices$/);
    assert.equal(p.totals.stops['try-out'].count, 30);
    assert.match(p.totals.stops['try-out'].packets, new RegExp(` and ${30 - PLAN_KEYS} more$`));
    const full = run(['plan', root, SRC, '--full']);
    assert.equal(full.packets.length, 60);
    assert.ok(JSON.stringify(full, null, 2).length > size * 2, 'the full plan holds every packet');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
