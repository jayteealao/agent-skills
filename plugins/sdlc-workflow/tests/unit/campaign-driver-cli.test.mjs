// WF-CAMPAIGN-DRIVER-PLAN — the disk side of the campaign wave driver
// (scripts/campaign.mjs). W0a: the ledger lock (D20), the lock takeover, the
// decided answer, the repeated ask, the run-time files of the merge-in check,
// and the four isolation keys of the config schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_SDLC_CONFIG, deepMerge, validateConfig } from '../../lib/config.mjs';

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

/** Two units in one wave: W2 needs W1 through slice s1 before its slice p2. */
function makeRepo({ isolation = ISOLATION } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cdrv '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1 });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2, needs: [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick' }] });
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': 1 })}\n---\n`);
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation } }));
  for (const slug of ['engine', 'squads']) {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\n---\n`);
  }
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

/** Run `n` rule adds in a child process; resolves with its exit code. */
function ruleAdds(root, tag, n) {
  const code = `
    const { execFileSync } = require('node:child_process');
    for (let i = 0; i < ${n}; i++) execFileSync(process.execPath, [${JSON.stringify(SCRIPT)}, 'rule', ${JSON.stringify(root)}, ${JSON.stringify(B)}, 'add', '--text', '${tag} ' + i], { stdio: 'ignore' });
  `;
  return new Promise((done) => spawn(process.execPath, ['-e', code], { stdio: 'ignore' }).on('exit', done));
}

// ---------------------------------------------------------------- W0a

test('D20: two processes that change the ledger at the same time lose no change', async () => {
  const root = makeRepo();
  try {
    startWave(root);
    const codes = await Promise.all([ruleAdds(root, 'a', 25), ruleAdds(root, 'b', 25)]);
    assert.deepEqual(codes, [0, 0]);
    const rules = readLedger(root).rules;
    assert.equal(rules.length, 50, 'every rule add is in the ledger');
    assert.equal(new Set(rules.map((r) => r.id)).size, 50, 'every rule id is unique');
    assert.equal(rules.filter((r) => r.text.startsWith('a ')).length, 25);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D20: a ledger lock of a process that is gone is taken over at once', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const lockFile = path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'ledger.lock');
    writeFileSync(lockFile, JSON.stringify({ holder: 'unit W1', pid: 2 ** 22 + 12345, at: new Date().toISOString() }));
    const t0 = Date.now();
    const r = run(root, 'rule', 'add', '--text', 'after a dead lock');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(Date.now() - t0 < 30_000, 'no wait for the dead holder');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('W0a: the heavy lock of a drive that ended is taken over; a running drive keeps it', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'unit', 'W1', 'running');
    run(root, 'unit', 'W2', 'running');
    assert.equal(run(root, 'lock', 'acquire', 'engine').acquired, true);
    assert.equal(run(root, 'lock', 'acquire', 'squads').acquired, false, 'the drive of engine still runs');
    run(root, 'unit', 'W1', 'finished');
    const r = run(root, 'lock', 'acquire', 'squads');
    assert.equal(r.acquired, true, JSON.stringify(r));
    assert.equal(r.takenOver, 'engine');
    // A run-end line after the lock frees it too.
    const dir = path.join(root, '.ai', 'workflows', 'squads');
    writeFileSync(path.join(dir, '.driver-journal.jsonl'), `${JSON.stringify({ at: '2999-01-01T00:00:00Z', event: 'run-end' })}\n`);
    run(root, 'unit', 'W1', 'running');
    assert.equal(run(root, 'lock', 'acquire', 'engine').takenOver, 'squads');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('W0a: decided answers the open question of the same id, by the session', () => {
  const root = makeRepo();
  try {
    startWave(root);
    run(root, 'ask', 'q1', '--wave', '1', 'Which order?');
    run(root, 'away', '--words', 'decide what you can');
    const d = run(root, 'decided', 'q1', '--question', 'Which order?', '--answer', 'A first', '--why', 'the recommended option');
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.equal(d.answered, 'q1');
    const q = readLedger(root).questions.find((x) => x.id === 'q1');
    assert.equal(q.answer, 'A first');
    assert.equal(q.by, 'session');
    assert.ok(q['answered-at']);
    assert.notEqual(run(root, 'status').next.action, 'ask', 'no open question is left');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('W0a: a second ask with the same open id and text returns the open question; another text fails', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const a = run(root, 'ask', 'q1', 'Which order?');
    assert.equal(a.ok, true);
    const b = run(root, 'ask', 'q1', 'Which order?');
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.exists, true);
    assert.equal(readLedger(root).questions.length, 1);
    assert.equal(run(root, 'ask', 'q1', 'Another question?').ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('W0a: merge-in ignores the run-time files and untracked files, and refuses a changed source file', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const w1 = run(root, 'worktree', 'W1', 'add');
    const w2 = run(root, 'worktree', 'W2', 'add');
    // W1's drive: slice s1 passed verify, with a commit.
    const dir1 = path.join(w1.path, '.ai', 'workflows', 'engine');
    writeFileSync(path.join(dir1, '00-index.md'), '---\nslug: engine\nslices:\n  - {slug: s1, status: complete}\n---\n');
    writeFileSync(path.join(dir1, '06-verify-s1.md'), '---\nslice-slug: s1\nresult: pass\n---\n');
    writeFileSync(path.join(w1.path, 'engine.txt'), 'tick\n');
    git(w1.path, 'add', 'engine.txt', '.ai');
    git(w1.path, 'commit', '-q', '-m', 'engine tick');
    // W2 committed its run-time files earlier, and its drive changed them since.
    const dir2 = path.join(w2.path, '.ai', 'workflows', 'squads');
    writeFileSync(path.join(dir2, '.driver-journal.jsonl'), '{}\n');
    writeFileSync(path.join(dir2, 'commentary.md'), '# c\n');
    writeFileSync(path.join(w2.path, 'squads.txt'), 'a\n');
    git(w2.path, 'add', '.ai', 'squads.txt');
    git(w2.path, 'commit', '-q', '-m', 'records');
    writeFileSync(path.join(dir2, '.driver-journal.jsonl'), '{}\n{"event":"waiting"}\n');
    writeFileSync(path.join(dir2, 'commentary.md'), '# c\nmore\n');
    writeFileSync(path.join(w2.path, 'untracked.txt'), 'u\n');
    run(root, 'unit', 'W2', 'waiting');
    writeFileSync(path.join(w2.path, 'squads.txt'), 'changed\n');
    const refused = run(root, 'merge-in', 'W2', 'W1');
    assert.equal(refused.ok, false);
    assert.deepEqual(refused.dirty, ['M squads.txt']);
    git(w2.path, 'checkout', '--', 'squads.txt');
    const ok = run(root, 'merge-in', 'W2', 'W1');
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.match(readFileSync(path.join(dir2, 'commentary.md'), 'utf8'), /more/, 'the run-time file keeps its change');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('W0a: the config schema takes the four isolation keys that the code reads', async () => {
  const config = deepMerge(DEFAULT_SDLC_CONFIG, { campaign: { isolation: { ...ISOLATION, 'quiet-suites': ['cargo bench'], 'outside-root': 'C:/co', 'worktree-root': 'C:/cw', 'build-depth': 160 } } });
  const v = await validateConfig(config);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
});
