// WF-CAMPAIGN-THROUGHPUT-PLAN — the CLI side in scripts/campaign.mjs: edge kinds in `deps`
// (T1), `slice-done --verified` and the refresh of a review fix (T7), `locks wait` (T9),
// `schedule` (section 3), `record` at wave-ready (T2 step 1), the conventions answer (T12),
// and the launch args of the machine slots and the trial merge (T9, T13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';
// The worktrees default to <SDLC_HOME>/cw. Keep them out of the real ~/.sdlc when this file runs alone.
if (!process.env.SDLC_HOME?.trim()) process.env.SDLC_HOME = mkdtempSync(path.join(os.tmpdir(), 'campaign-home-'));

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function run(root, ...args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, B, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
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
const readLedger = (root) => JSON.parse(readFileSync(ledgerFile(root), 'utf8'));

/** W1 `engine` (s1, s2) and W2 `squads` (p1, p2) in one wave; W2 needs W1 through s1 before p2. */
function makeRepo({ isolation = ISOLATION, campaign = {} } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ctpt '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1 });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2, needs: [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick' }] });
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': 1 })}\n---\n`);
  for (const [slug, slices] of [['engine', ['s1', 's2']], ['squads', ['p1', 'p2']]]) {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\nslices:\n${slices.map((s) => `  - {slug: ${s}, status: defined}`).join('\n')}\n---\n`);
  }
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { ...(isolation ? { isolation } : {}), ...campaign } }));
  return root;
}

function setup(root) {
  const o = run(root, 'orient');
  assert.equal(o.ok, true, JSON.stringify(o));
  const c = run(root, 'deps', 'confirm');
  assert.equal(c.ok, true, JSON.stringify(c));
  for (const [k, v] of [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']]) run(root, 'answer', k, v);
  run(root, 'unit', 'W1', 'prepared');
  run(root, 'unit', 'W2', 'prepared');
}

function startWave(root) {
  setup(root);
  const st = run(root, 'wave', '1', 'start');
  assert.equal(st.ok, true, JSON.stringify(st));
  git(root, 'branch', st.branch, st.base);
  return st;
}

/** Commit one file in a worktree, as a stage agent does. */
function commitIn(dir, file, text, msg) {
  writeFileSync(path.join(dir, file), text);
  git(dir, 'add', file);
  git(dir, 'commit', '-q', '-m', msg);
  return git(dir, 'rev-parse', 'HEAD');
}

test('T1: depends-on takes a kind; a need gives evidence; kind reclassifies a legacy edge; status counts the unclassified', () => {
  const root = makeRepo();
  try {
    assert.equal(run(root, 'orient').ok, true);
    assert.equal(run(root, 'deps', 'W2', 'depends-on', 'add', 'W1', '--why', 'an old edge').ok, true);
    assert.deepEqual(run(root, 'deps', 'plan').unclassified, [{ key: 'W2', from: 'W1', by: 'person' }]);
    assert.equal(run(root, 'status').deps.unclassified, 1);
    const bad = run(root, 'deps', 'W2', 'depends-on', 'kind', 'W1', '--kind', 'need', '--why', 'x');
    assert.equal(bad.ok, false, 'a need with no evidence is refused');
    assert.match(bad.error, /a need gives --evidence/);
    const k = run(root, 'deps', 'W2', 'depends-on', 'kind', 'W1', '--kind', 'sequence', '--why', 'W2 only reads the docs of W1', '--by', 'scout');
    assert.equal(k.ok, true, JSON.stringify(k));
    const edge = readLedger(root).deps.units.W2['depends-on'][0];
    assert.equal(edge.kind, 'sequence');
    assert.equal(edge['kind-why'], 'W2 only reads the docs of W1');
    assert.equal(edge['kind-by'], 'scout');
    assert.deepEqual(run(root, 'deps', 'plan').unclassified, []);
    assert.equal(run(root, 'deps', 'W1', 'depends-on', 'add', 'W2', '--why', 'y', '--kind', 'maybe').ok, false, 'an unknown kind is refused');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T7: slice-done --verified makes the wait ready at verify; a review fix of that slice returns refresh; merge-in --refresh takes it', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'wave', '1', 'launch');
    const w1 = r.args.units[0].root;
    const v = commitIn(w1, 'engine.txt', 'tick\n', 'engine tick');
    const sv = run(root, 'slice-done', 'W1', 's1', '--verified');
    assert.equal(sv.ok, true, JSON.stringify(sv));
    assert.equal(sv.verified, true);
    assert.deepEqual(sv.ready, [{ key: 'W2', from: 'W1', through: 's1', sha: v }]);
    let wt = readLedger(root).units.W2.waits[0];
    assert.equal(wt.state, 'ready');
    assert.equal(wt['ready-on'], 'verify');
    assert.equal(git(w1, 'rev-parse', 'HEAD'), v, 'the verified mark commits nothing');
    run(root, 'unit', 'W2', 'waiting', '--on', 'W1: s1');
    const m = run(root, 'merge-in', 'W2', 'W1', '--at', v);
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.equal(readLedger(root).units.W2.waits[0].state, 'met');
    // The review of s1 changes it: the slice-done of s1 names the consumer.
    const fix = commitIn(w1, 'fix.txt', 'review fix\n', 'review fix');
    const d = run(root, 'slice-done', 'W1', 's1');
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.deepEqual(d.refresh, [{ key: 'W2', from: 'W1', through: 's1', before: 'p2', sha: fix, was: v }]);
    assert.equal(readLedger(root).units.W2.waits[0].refresh, fix);
    assert.equal(run(root, 'merge-in', 'W2', 'W1', '--at', fix).ok, false, 'with no --refresh, a met wait is no open wait');
    const rf = run(root, 'merge-in', 'W2', 'W1', '--at', fix, '--refresh');
    assert.equal(rf.ok, true, JSON.stringify(rf));
    wt = readLedger(root).units.W2.waits[0];
    assert.equal(wt.state, 'met');
    assert.equal(wt.sha, fix);
    assert.equal(wt.refresh, undefined);
    // The slice-done of a later slice is code that W2 does not need: no refresh.
    commitIn(w1, 's2.txt', 'slice two\n', 'engine s2');
    assert.equal(run(root, 'slice-done', 'W1', 's2').refresh, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T9: locks wait is free with no lock file, times out on a fresh one, and ignores a stale one', () => {
  const root = makeRepo({ isolation: { ...ISOLATION, locks: [{ name: 'db', path: '.db.lock', 'stale-minutes': 30 }] } });
  try {
    assert.equal(run(root, 'orient').ok, true);
    assert.deepEqual(run(root, 'locks', 'wait', '--max', '0'), { ok: true, free: true, waitedS: 0, locks: ['db'] });
    const lock = path.join(root, '.db.lock');
    writeFileSync(lock, 'pid 1\n');
    const held = run(root, 'locks', 'wait', '--max', '0');
    assert.equal(held.free, false, JSON.stringify(held));
    assert.equal(held.timeout, true);
    assert.deepEqual(held.held, ['db']);
    const old = new Date(Date.now() - 31 * 60_000);
    utimesSync(lock, old, old);
    assert.equal(run(root, 'locks', 'wait', '--max', '0').free, true, 'a stale lock does not hold');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('section 3: schedule simulates the wave from the rosters and the waits', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const s = run(root, 'schedule', '1');
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.equal(s.wave, 1);
    assert.deepEqual(s.units.map((u) => [u.key, u.slices]), [['W1', 2], ['W2', 2]]);
    assert.equal(s.waits, 1, 'the packet wait');
    assert.ok(s.simulated >= s.criticalPath && s.criticalPath > 0, JSON.stringify(s));
    assert.deepEqual(s.unsliced, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T2 step 1: record of a merged boundary sets ready-at; a stop before the next wave does not', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const out = path.join(root, 'outcome.json');
    writeFileSync(out, JSON.stringify({ wave: 1, units: [], held: false, boundary: { merged: [{ key: 'W1', sha: 'm1' }], needsFix: [], notMerged: [] } }));
    const l = readLedger(root);
    l.waves[0].state = 'boundary';
    writeFileSync(ledgerFile(root), JSON.stringify(l, null, 2));
    const rec = run(root, 'wave', '1', 'record', '--outcome', out);
    assert.equal(rec.ok, true, JSON.stringify(rec));
    assert.ok(readLedger(root).waves[0]['ready-at'], 'the wave is ready');
    assert.equal(rec.nextWave, undefined, 'no planned wave is left');
    const root2 = makeRepo();
    try {
      startWave(root2);
      const out2 = path.join(root2, 'outcome.json');
      writeFileSync(out2, JSON.stringify({ wave: 1, units: [], held: false, stopBeforeNextWave: true, reason: 'the person stops', boundary: { merged: [{ key: 'W1', sha: 'm1' }] } }));
      run(root2, 'wave', '1', 'record', '--outcome', out2);
      assert.equal(readLedger(root2).waves[0]['ready-at'], undefined);
    } finally { rmSync(root2, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('T12, T9, T13: the conventions answer and the launch args of the machine slots, the locks and the trial merge', () => {
  const root = makeRepo({ isolation: { ...ISOLATION, 'machine-width': 1, locks: [{ name: 'db', path: '.db.lock' }] } });
  try {
    startWave(root);
    assert.throws(() => execFileSync(process.execPath, [SCRIPT, 'answer', root, B, 'conventions', 'maybe'], { stdio: 'pipe' }));
    const a = run(root, 'wave', '1', 'launch').args;
    assert.equal(a.conventions, true, 'on by default');
    assert.equal(a.machineWidth, 1);
    assert.deepEqual(a.locks, ['db']);
    assert.equal(a.trialMerge, true);
    const idx = readLedger(root).units;
    const top = Math.max(idx.W1.worktree.index, idx.W2.worktree.index);
    assert.deepEqual(a.trialPorts, { PORT: 3000 + 100 * (top + 1) }, 'the trial ports are past every unit');
    assert.equal(run(root, 'answer', 'conventions', 'off').ok, true);
    assert.equal(readLedger(root).answers.conventions, 'off', 'the next launch passes conventions: false (conventionsOn)');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
