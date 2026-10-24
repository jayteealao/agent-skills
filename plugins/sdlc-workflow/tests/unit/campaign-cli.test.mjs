// WF-PIECES-PLAN sections 6 and 12 — the disk side of /wf campaign in scripts/campaign.mjs:
// the serial walk over one list (status, open, land, start, built, done), the review base
// of 6.2, the fidelity and try-out gates, `slice-order add`, and the migration of
// an old wave campaign (report, apply, start of a migrated packet, finish, the guarded remove).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { migrateApply, migrationReport, removeWorktree, run } from '../../scripts/campaign.mjs';
import { safeParseFrontmatter } from '../../lib/frontmatter.mjs';
import { hashFile } from '../../lib/campaign-records.mjs';
import { setFrontmatterValue } from '../../lib/roster-edit.mjs';

const SRC = 'brainstorm-demo';
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const fm = (file) => safeParseFrontmatter(readFileSync(file, 'utf8')).data;
const wf = (root, slug) => path.join(root, '.ai', 'workflows', slug);
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
    const index = fm(path.join(wf(root, 'demo-engine'), '00-index.md'));
    assert.equal(index['workflow-type'], 'feature');
    assert.equal(index.branch, `packets/${SRC}`);
    assert.equal(index['origin-packet'], `.ai/workflows/${SRC}/work/demo-engine.md`);
    assert.equal(index['review-scope'], 'slug-wide');
    assert.equal(index.stack['user-confirmed'], true);
    assert.match(readFileSync(path.join(wf(root, 'demo-engine'), '01-intake.md'), 'utf8'), /The engine runs\./);
    assert.match(readFileSync(path.join(wf(root, 'demo-engine'), '02-shape.md'), 'utf8'), /\| \*\*d-one\*\* — Decision d-one\. \| honored \|/);
    // A risk the person confirmed at brainstorm done is carried, never open: handoff.md refuses an open risk.
    assert.deepEqual(index['intent-risks'].map((r) => [r.id, r.status, r['po-ratified']]), [['RIM-1', 'carried', true]]);
    assert.match(readFileSync(path.join(wf(root, 'demo-engine'), '02-shape.md'), 'utf8'), /## Unknowns \/ Open Questions\n\n- \*\*RIM-1\*\* \(carried to the slug-wide review\) — The engine is slow\./);
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
    appendFileSync(path.join(wf(root, 'demo-engine'), 'po-answers.md'), '\n- d-one: approved — fine for now\n');

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
    assert.equal(fm(path.join(wf(root, 'demo-engine'), '00-index.md'))['base-branch'], 'main', 'done puts base-branch back to the trunk');
    assert.equal(fm(path.join(dir, 'work', 'demo-engine.md')).state, 'done');

    // The second packet: design first, then its review base is the end branch of the first.
    assert.equal(run(['open', root, SRC, 'screen']).ok, true);
    const screenIndex = fm(path.join(wf(root, 'demo-screen'), '00-index.md'));
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
    appendFileSync(path.join(wf(root, 'demo-screen'), 'po-answers.md'), '\n- try-out: works — the screen shows the engine\n');
    assert.equal(run(['done', root, SRC, 'screen']).ok, true);
    assert.equal(run(['status', root, SRC]).finished, true);
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
    assert.deepEqual(st.current.rows.map((r) => [r.key, r.verdict]), [['d-one', 'narrowed'], ['d-two', 'partial']], 'only a po-answers.md line approves a row');
    appendFileSync(path.join(wf(root, 'demo-engine'), 'po-answers.md'), '\n## Decision fidelity approvals\n\n- **d-one**: approved — fine\n- d-two: approved — fine\n');
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
    const idx = path.join(wf(root, 'demo-engine'), '00-index.md');
    writeFileSync(idx, setFrontmatterValue(readFileSync(idx, 'utf8'), 'slices', [{ slug: 'core', status: 'complete' }, { slug: 'fix-1', status: 'defined' }]));
    const st = run(['status', root, SRC]);
    assert.deepEqual([st.current.step, st.current.state], ['yolo', 'built']);
    assert.match(st.current.reason, /fix-1/);
    assert.match(run(['done', root, SRC, 'engine']).error, /fix-1 of demo-engine are not complete/);
    assert.deepEqual([run(['reopen', root, SRC, 'engine']).changed, fm(path.join(wf(root, SRC), 'work', 'demo-engine.md')).state], [true, 'open']);
    assert.equal(run(['reopen', root, SRC, 'engine']).changed, false);
    // The driver builds the slice.
    writeFileSync(idx, setFrontmatterValue(readFileSync(idx, 'utf8'), 'slices', [{ slug: 'core', status: 'complete' }, { slug: 'fix-1', status: 'complete' }]));
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
    writeFileSync(path.join(dir, '03-slice.md'), '---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n  - {slug: s2, status: defined}\n  - {slug: s3, status: defined}\n---\n\n# Slices\n');
    writeFileSync(path.join(dir, '03-slice-s1.md'), '---\nslice: s1\ndepends-on: []\n---\n');
    writeFileSync(path.join(dir, '04-plan.md'), '---\nslug: engine\nimplementation-order:\n  - s1\n  - s2\n  - s3\n---\n');
    const r = run(['slice-order', root, 'engine', 'add', '--slice', 's1', '--after', 's3', '--why', 'the plan of s3 makes the table']);
    assert.equal(r.added, true, JSON.stringify(r));
    assert.deepEqual(r.walkOrder, ['s2', 's3', 's1']);
    assert.match(readFileSync(path.join(dir, '03-slice.md'), 'utf8'), /- \{slug: s1, status: defined, depends-on: \[s3\]\}/);
    assert.match(readFileSync(path.join(dir, '03-slice-s1.md'), 'utf8'), /depends-on: \[s3\]/);
    assert.match(readFileSync(path.join(dir, '04-plan.md'), 'utf8'), /implementation-order: \[s2, s3, s1\]/);
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
    const idx = fm(path.join(wf(root, 'eng'), '00-index.md'));
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
    assert.match(git(m.wtEng, 'log', '-1', '--format=%s'), /^eng: the work of the old unit, in one commit/);
    assert.equal(git(m.wtEng, 'rev-list', '--count', 'main..HEAD'), '1');
    assert.match(git(root, 'log', '-1', '--format=%s', `campaign/${SRC}/backup--eng`), /wip\(eng\): migration snapshot/);
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
