// WF-CAMPAIGN-DRIVER-PLAN W1 — the CLI of the wave driver (scripts/campaign.mjs):
// `wave <n> launch` and `record`, `slice-done`, `merge-in --at`, `needs`,
// `contract amend`, `await`, `question consumed`, `ask --unit`, `reply --by --move`,
// the live run of D25 (`driving`, `run-live`, `owner`), and `back`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';
// The worktrees default to <SDLC_HOME>/cw. Keep them out of the real ~/.sdlc when this file runs alone.
if (!process.env.SDLC_HOME?.trim()) process.env.SDLC_HOME = mkdtempSync(path.join(os.tmpdir(), 'campaign-home-'));

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function runIn(root, b, args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, b, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}
const run = (root, ...args) => runIn(root, B, args);

/** Run a command in a child process; resolves with its JSON result. */
function runAsync(root, ...args) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [SCRIPT, args[0], root, B, ...args.slice(1)], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('exit', () => done(JSON.parse(out)));
  });
}

function packetFile(root, fm) {
  const dir = path.join(root, '.ai', 'workflows', B, 'work');
  mkdirSync(dir, { recursive: true });
  const full = {
    schema: 'sdlc/v1', type: 'work-packet', slug: B, title: `Piece ${fm.key}`, form: 'intake', 'target-slug': null,
    urgency: 'normal', revision: 1, 'origin-brainstorm': B, order: 1, 'depends-on': [], provides: [], expects: [],
    'carried-decisions': [], 'ux-impact': 'none', state: 'proposed', 'routed-to': null, ...fm,
  };
  writeFileSync(path.join(dir, `${fm['work-slug']}.md`), `---\n${JSON.stringify(full, null, 2)}\n---\n\n# ${full.title}\n`);
}

const ISOLATION = { parallel: true, 'port-env': { PORT: 3000 }, 'build-dirs': ['target'], 'heavy-suites': ['npm test'], 'min-free-gb': 0 };
const ledgerFile = (root) => path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'ledger.json');
const journalFile = (root) => path.join(root, '.ai', 'workflows', B, 'work', 'campaign', '.campaign-journal.jsonl');
const readLedger = (root) => JSON.parse(readFileSync(ledgerFile(root), 'utf8'));
const readJournal = (root) => readFileSync(journalFile(root), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/**
 * Two units in one wave: W1 `engine` (slices s1, s2) provides `tick`; W2 `squads`
 * (slices p1, p2) needs W1 through s1 before p2. The slug records are tracked.
 */
function makeRepo({ isolation = ISOLATION } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cwav '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1, provides: [{ key: 'tick', text: 'one tick each 16 ms' }] });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2, needs: [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick' }] });
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': 1 })}\n---\n`);
  for (const [slug, slices] of [['engine', ['s1', 's2']], ['squads', ['p1', 'p2']]]) {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\nslices:\n${slices.map((s) => `  - {slug: ${s}, status: defined}`).join('\n')}\n---\n`);
  }
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  if (isolation) writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation } }));
  return root;
}

function startWave(root) {
  const o = run(root, 'orient');
  assert.equal(o.ok, true, JSON.stringify(o));
  // WF-CAMPAIGN-ORDER-PLAN 4.4: the person confirms the graph before setup.
  const c = run(root, 'deps', 'confirm');
  assert.equal(c.ok, true, JSON.stringify(c));
  for (const [k, v] of [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']]) run(root, 'answer', k, v);
  run(root, 'unit', 'W1', 'prepared');
  run(root, 'unit', 'W2', 'prepared');
  const st = run(root, 'wave', '1', 'start');
  assert.equal(st.ok, true, JSON.stringify(st));
  git(root, 'branch', st.branch, st.base);
  return st;
}

/** Age every line of the wave run, and the run itself, by `minutes`. */
function ageRun(root, minutes) {
  const ledger = readLedger(root);
  const w = ledger.waves.find((x) => x.n === 1);
  const old = (iso) => new Date(Date.parse(iso) - minutes * 60_000).toISOString();
  w.run.at = old(w.run.at);
  writeFileSync(ledgerFile(root), JSON.stringify(ledger, null, 2));
  const lines = readJournal(root).map((l) => (l.run === w.run.id ? { ...l, at: old(l.at) } : l));
  writeFileSync(journalFile(root), `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
}

/** Commit one file in a worktree, as a stage agent does. */
function commitIn(dir, file, text, msg) {
  writeFileSync(path.join(dir, file), text);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

// ---------------------------------------------------------------- launch

test('5.1: launch without an isolation contract refuses with isolation-required and changes nothing', () => {
  const root = makeRepo({ isolation: null });
  try {
    startWave(root);
    const before = readFileSync(ledgerFile(root), 'utf8');
    const r = run(root, 'wave', '1', 'launch');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'isolation-required');
    assert.equal(readFileSync(ledgerFile(root), 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D15: launch with a disk need it cannot meet returns blocked for each unit, and adds no worktree', () => {
  const root = makeRepo({ isolation: { ...ISOLATION, 'min-free-gb': 10_000_000 } });
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.deepEqual(r.blocked.map((x) => [x.key, x.cause]), [['W1', 'disk'], ['W2', 'disk']]);
    const l = readLedger(root);
    assert.equal(l.units.W1.worktree, undefined);
    assert.equal(l.units.W1.state, 'prepared');
    assert.equal(l.waves[0].run, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.1: launch adds each worktree, writes the context and the branch fields, and prints the args', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.mode, 'wave');
    assert.match(r.stage, /stage-yolo-driver\.mjs" ".+" --driver campaign-wave/);
    const a = r.args;
    assert.equal(a.brainstorm, B);
    assert.equal(a.wave, 1);
    assert.equal(a.campaignRunId, r.run);
    assert.equal(a.waveBranch, `campaign/${B}/wave-1`);
    assert.equal(a.width, 3);
    assert.equal(a.widthMax, 3);
    assert.equal(a.stopBefore, null);
    assert.equal(a.agentCeiling, 900);
    assert.match(a.cancelPath.replace(/\\/g, '/'), new RegExp(`\\.scratch/campaign/${r.run}/wave-1/cancel$`));
    assert.deepEqual(a.units.map((u) => [u.key, u.slug, u.state, u.reviewScope]), [['W1', 'engine', 'running', 'per-slice'], ['W2', 'squads', 'running', 'per-slice']]);
    assert.deepEqual(a.units[1].waits, [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick', source: 'packet', state: 'open', sha: null }]);
    for (const u of a.units) {
      assert.ok(existsSync(u.root), u.root);
      assert.ok(existsSync(u.contextPath), u.contextPath);
      const idx = readFileSync(path.join(u.root, '.ai', 'workflows', u.slug, '00-index.md'), 'utf8');
      assert.match(idx, /branch-strategy: dedicated/);
      assert.match(idx, new RegExp(`branch: ${u.branch.replace(/\//g, '\\/')}`));
      assert.match(idx, /base-branch: campaign\/realism\/wave-1/);
    }
    const l = readLedger(root);
    assert.equal(l.units.W1.state, 'running');
    assert.equal(l.waves[0].run.id, r.run);
    assert.equal(git(root, 'config', '--get', 'rerere.enabled'), 'true');
    const start = readJournal(root).find((x) => x.event === 'run-start');
    assert.equal(start.run, r.run);
    assert.deepEqual(a.expectedShared, [], 'no shared path: no pair');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('WF-CAMPAIGN-ORDER-PLAN 4.5: a shared path that the person kept in one wave reaches the wave driver as expectedShared', () => {
  const root = makeRepo();
  try {
    assert.equal(run(root, 'orient').ok, true);
    run(root, 'deps', 'W1', 'paths', '--set', 'src/engine/tick.rs');
    run(root, 'deps', 'W2', 'paths', '--set', 'src/squads/mod.rs,src/engine/tick.rs');
    assert.deepEqual(run(root, 'deps', 'plan').shared, [{ wave: 1, a: 'W1', b: 'W2', path: 'src/engine/tick.rs' }]);
    assert.equal(run(root, 'deps', 'confirm').ok, true);
    for (const [k, v] of [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']]) run(root, 'answer', k, v);
    run(root, 'unit', 'W1', 'prepared');
    run(root, 'unit', 'W2', 'prepared');
    const st = run(root, 'wave', '1', 'start');
    assert.equal(st.ok, true, JSON.stringify(st));
    git(root, 'branch', st.branch, st.base);
    const r = run(root, 'wave', '1', 'launch');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(r.args.expectedShared, [{ a: 'W1', b: 'W2', path: 'src/engine/tick.rs' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D25: a second launch refuses with run-live; after 25 silent minutes it reuses the worktrees', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const first = run(root, 'wave', '1', 'launch');
    assert.equal(first.ok, true, JSON.stringify(first));
    ageRun(root, 5);
    const again = run(root, 'wave', '1', 'launch');
    assert.equal(again.ok, false);
    assert.equal(again.error, 'run-live');
    assert.equal(again.run, first.run);
    // A waiter line keeps the run live.
    ageRun(root, 20);
    run(root, 'await', '--wave', '1', '--max', '1');
    assert.equal(run(root, 'wave', '1', 'launch').error, 'run-live');
    ageRun(root, 25);
    const later = run(root, 'wave', '1', 'launch');
    assert.equal(later.ok, true, JSON.stringify(later));
    assert.notEqual(later.run, first.run);
    assert.deepEqual(later.args.units.map((u) => u.root), first.args.units.map((u) => u.root));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D25: status gives driving with a live run, also with a ready wait; an open question gives ask with driving', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const w1 = r.args.units[0].root;
    commitIn(w1, 'engine.txt', 'tick\n', 'engine tick');
    assert.equal(run(root, 'slice-done', 'W1', 's1').ready.length, 1);
    const s = run(root, 'status');
    assert.equal(s.next.action, 'driving', JSON.stringify(s.next));
    assert.equal(s.next.run, r.run);
    run(root, 'ask', 'w1-W1-1', '--wave', '1', '--unit', 'W1', '--kind', 'stage', '--stage', 'implement', '--slice', 's2', 'Which tick rate?');
    const q = run(root, 'status');
    assert.equal(q.next.action, 'ask', JSON.stringify(q.next));
    assert.equal(q.next.driving.run, r.run);
    const owner = runIn(root, 'engine', ['owner']);
    assert.equal(owner.owned, true, JSON.stringify(owner));
    assert.equal(owner.brainstorm, B);
    assert.equal(owner.run, r.run);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- slice-done and merge-in --at

test('5.6a: slice-done commits the records without the run-time files, records cleared, and marks the wait ready', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const w1 = r.args.units[0].root;
    const rec = path.join(w1, '.ai', 'workflows', 'engine');
    commitIn(w1, 'engine.txt', 'tick\n', 'engine tick');
    writeFileSync(path.join(rec, '05-implement-s1.md'), '---\nstatus: complete\n---\n');
    writeFileSync(path.join(rec, '.driver-journal.jsonl'), '{"event":"agent-start"}\n');
    const d = run(root, 'slice-done', 'W1', 's1', '--run', '20261016T100000Z-engine');
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.equal(d.committed, true);
    assert.equal(git(w1, 'log', '-1', '--format=%s'), 'chore(engine): record s1');
    assert.deepEqual(git(w1, 'show', '--name-only', '--format=', 'HEAD').split(/\r?\n/), ['.ai/workflows/engine/05-implement-s1.md']);
    assert.match(git(w1, 'status', '--porcelain'), /\.driver-journal\.jsonl/);
    assert.deepEqual(d.ready, [{ key: 'W2', from: 'W1', through: 's1', sha: d.sha }]);
    assert.equal(d.budget.width, 3);
    assert.deepEqual(d.answered, []);
    const l = readLedger(root);
    assert.deepEqual(l.units.W1.cleared.map((c) => [c.slice, c.sha]), [['s1', d.sha]]);
    assert.equal(l.units.W1['wave-run-id'], '20261016T100000Z-engine');
    assert.equal(l.units.W2.waits[0].state, 'ready');
    // --final commits the journal too.
    const f = run(root, 'slice-done', 'W1', '--final');
    assert.equal(f.ok, true, JSON.stringify(f));
    assert.match(git(w1, 'show', '--name-only', '--format=', 'HEAD'), /\.driver-journal\.jsonl/);
    assert.equal(readLedger(root).units.W1.cleared.at(-1).slice, 'finished');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D21: merge-in --at merges the cleared commit, not the tip of the unit branch', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const [w1, w2] = r.args.units.map((u) => u.root);
    commitIn(w1, 'engine.txt', 'tick\n', 'engine tick');
    const d = run(root, 'slice-done', 'W1', 's1');
    commitIn(w1, 'later.txt', 'slice two\n', 'engine slice two');
    run(root, 'unit', 'W2', 'waiting', '--on', 'W1: s1');
    assert.match(run(root, 'merge-in', 'W2', 'W1', '--at', 'deadbeef').error, /not a cleared commit/);
    const m = run(root, 'merge-in', 'W2', 'W1', '--at', d.sha);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.ok(existsSync(path.join(w2, 'engine.txt')));
    assert.equal(existsSync(path.join(w2, 'later.txt')), false, 'the commit after the cleared slice stays out');
    assert.equal(readLedger(root).units.W2.waits[0].state, 'met');
    assert.equal(run(root, 'unit', 'W2', 'running').ok, true);
    assert.equal(readLedger(root).units.W2.route, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- needs and contract

test('5.7: needs add writes a derived entry and opens its wait; a match exists; a cycle is refused; remove drops it', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    assert.equal(run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's1', '--before', 'p2').exists, true, 'the packet declares it');
    const add = run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'src/shared.ts', '--source', 'cross-unit');
    assert.equal(add.ok, true, JSON.stringify(add));
    assert.equal(add.wait.state, 'open');
    assert.equal(add.wait.source, 'cross-unit');
    assert.equal(run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's2', '--before', 'p1').exists, true);
    const cyc = run(root, 'needs', 'W1', 'add', '--from', 'W2', '--through', 'p1', '--before', 's1');
    assert.equal(cyc.ok, false);
    assert.ok(Array.isArray(cyc.cycle), JSON.stringify(cyc));
    const list = run(root, 'needs', 'W2', 'list');
    assert.equal(list.derived.length, 1);
    assert.equal(list.graph.length, 1, "the needs entry of the ledger graph");
    const ctx = readFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'context', 'squads.md'), 'utf8');
    assert.match(ctx, /found by the wave driver: cross-unit/);
    assert.equal(readJournal(root).filter((x) => x.event === 'derived-need').length, 1);
    assert.equal(run(root, 'needs', 'W2', 'remove', '--from', 'W1', '--through', 's2', '--before', 'p1').removed, 1);
    assert.equal(readLedger(root).units.W2.waits.length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.7: needs add on a slice that passed its implement adds no wait and records a focus pair', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const w2 = r.args.units[1].root;
    writeFileSync(path.join(w2, '.ai', 'workflows', 'squads', '05-implement-p1.md'), '---\nstatus: complete\n---\n');
    const late = run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'src/shared.ts');
    assert.equal(late.late, true, JSON.stringify(late));
    const l = readLedger(root);
    assert.equal(l.units.W2.waits.length, 1);
    assert.deepEqual(l.waves[0].focus, [{ a: 'W1', aSlice: 's2', b: 'W2', bSlice: 'p1', files: 'src/shared.ts' }]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.5: contract amend reaches the context file of each unit of the wave', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    const a = run(root, 'contract', 'W1', 'amend', '--line', 'tick', '--text', 'one tick each 8 ms');
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.deepEqual(a.contexts.sort(), ['W1', 'W2']);
    const ctxDir = path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'context');
    assert.match(readFileSync(path.join(ctxDir, 'engine.md'), 'utf8'), /`tick`: one tick each 8 ms \(amended .+; was: one tick each 16 ms\)/);
    assert.match(readFileSync(path.join(ctxDir, 'squads.md'), 'utf8'), /one tick each 8 ms/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- questions and the waiter

test('5.5a: ask --unit, reply --by --move, await, question consumed', async () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    assert.equal(run(root, 'await', '--wave', '1', '--max', '0').timeout, true);
    // A question asked after the waiter started reaches the waiter.
    const waiting = runAsync(root, 'await', '--wave', '1', '--max', '60');
    await new Promise((r) => setTimeout(r, 1500));
    const q = run(root, 'ask', 'w1-W2-1', '--wave', '1', '--unit', 'W2', '--kind', 'stage', '--stage', 'plan', '--slice', 'p1', 'Keep the old squads?');
    assert.equal(q.question.unit, 'W2');
    assert.equal(q.question.kind, 'stage');
    const rep = run(root, 'reply', 'w1-W2-1', '--by', 'person', '--move', 'move it out');
    assert.equal(rep.question.move, true);
    assert.equal(rep.question.by, 'person');
    const got = await waiting;
    assert.deepEqual(got.answered, [{ id: 'w1-W2-1', unit: 'W2', kind: 'stage', answer: 'move it out', by: 'person', move: true }], JSON.stringify(got));
    assert.ok(readJournal(root).some((x) => x.event === 'answered' && x.id === 'w1-W2-1' && x.move === true));
    assert.ok(readJournal(root).some((x) => x.event === 'waiter'));
    assert.equal(run(root, 'question', 'w1-W2-1', 'consumed').consumed, true);
    assert.equal(run(root, 'await', '--wave', '1', '--max', '0').timeout, true, 'a consumed answer does not come back');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.10: await returns stopped on a campaign stop, and cancelled after --cancel', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    const c = run(root, 'await', '--wave', '1', '--cancel');
    assert.equal(c.cancelled, true);
    assert.equal(run(root, 'await', '--wave', '1', '--max', '30').cancelled, true);
    const ctl = path.join(root, '.ai', 'workflows', B, 'work', 'campaign', '.control.json');
    rmSync(c.path);
    writeFileSync(ctl, JSON.stringify({ action: 'stop', scope: 'campaign', reason: 'bed' }));
    const s = run(root, 'await', '--wave', '1', '--max', '30');
    assert.equal(s.stopped, true, JSON.stringify(s));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.5a step 7: a unit that moves out rejects every wait on it', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    const r = run(root, 'unit', 'W1', 'stopped', '--route', 'moved by the person');
    assert.deepEqual(r.rejected, [{ key: 'W2', from: 'W1', through: 's1' }]);
    assert.equal(readLedger(root).units.W2.waits[0].state, 'rejected');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- record, owner, back

test('5.11: record clears the run, also for a held outcome, which keeps the wave running', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const out = path.join(root, 'outcome.json');
    writeFileSync(out, JSON.stringify({ ok: true, wave: 1, held: true, stoppedAt: 'stop-request', units: [{ key: 'W1', state: 'running', cleared: [{ slice: 's1', sha: 'abc' }], runId: '20261016T100000Z-engine' }] }));
    const rec = run(root, 'wave', '1', 'record', '--outcome', out);
    assert.equal(rec.ok, true, JSON.stringify(rec));
    assert.equal(rec.held, true);
    assert.equal(rec.run, r.run);
    const l = readLedger(root);
    assert.equal(l.waves[0].run, undefined);
    assert.equal(l.waves[0].state, 'running');
    assert.deepEqual(l.units.W1.cleared, [{ slice: 's1', sha: 'abc' }]);
    assert.equal(l.units.W1['wave-run-id'], '20261016T100000Z-engine');
    assert.equal(runIn(root, 'engine', ['owner']).owned, false);
    assert.notEqual(run(root, 'status').next.action, 'driving');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.11: record of a boundary outcome writes merged and needs-fix; back lists the cleanup, the handoff and the open questions', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'wave', '1', 'launch');
    run(root, 'away', '--words', 'decide what you can');
    run(root, 'ask', 'w1-wave-1', '--wave', '1', 'Revert squads?');
    const out = path.join(root, 'outcome.json');
    writeFileSync(out, JSON.stringify({ ok: true, wave: 1, held: false, units: [], boundary: { merged: [{ key: 'W1', sha: 'm1' }], needsFix: [{ key: 'W2', reason: 'the wave review' }] }, derivedNeeds: [{ key: 'W2', from: 'W1', through: 's2', before: 'p1' }] }));
    const rec = run(root, 'wave', '1', 'record', '--outcome', out);
    assert.deepEqual(rec.merged, ['W1']);
    assert.equal(rec.derivedNeeds.length, 1);
    assert.equal(rec.cleanup[0].key, 'W1');
    const l = readLedger(root);
    assert.equal(l.units.W1.state, 'merged');
    assert.equal(l.units.W2.state, 'needs-fix');
    const back = run(root, 'back');
    assert.deepEqual(back.waited.map((s) => s.step), ['cleanup', 'handoff', 'question']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
