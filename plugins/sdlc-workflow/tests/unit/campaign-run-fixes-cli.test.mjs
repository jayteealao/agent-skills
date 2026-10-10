// WF-CAMPAIGN-RUN-FIXES-PLAN — the disk side of the ten campaign fixes
// (scripts/campaign.mjs): waits and merge-in (C1), steer (C2), away and the recap
// (C3), the quiet lease (C4), the outside folder and the disk estimate (C5), the
// path check (C6), the merge order (C7), the plugin version (C8), and the rules (C9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function runEnv(root, env, ...args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, B, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}
const run = (root, ...args) => runEnv(root, {}, ...args);

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
const writeLedger = (root, l) => writeFileSync(ledgerFile(root), JSON.stringify(l));

/** Two units in one wave: W2 needs W1 through slice s1 before its slice p2. */
function makeRepo({ isolation = ISOLATION, local = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cfix '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1 });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2, needs: [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick' }] });
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': 1 })}\n---\n`);
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  if (local) writeFileSync(path.join(root, '.gitignore'), '.ai/*\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ ...(local ? { artifactTracking: 'ignored' } : {}), campaign: { isolation } }));
  for (const slug of ['engine', 'squads']) {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\n---\n`);
  }
  return root;
}

function startWave(root) {
  const o = run(root, 'orient');
  assert.equal(o.ok, true, JSON.stringify(o));
  for (const [k, v] of [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']]) run(root, 'answer', k, v);
  run(root, 'unit', 'W1', 'prepared');
  run(root, 'unit', 'W2', 'prepared');
  const st = run(root, 'wave', '1', 'start');
  assert.equal(st.ok, true, JSON.stringify(st));
  git(root, 'branch', st.branch, st.base);
  return st;
}

/** W1's drive: two slices, a commit, and a passed verify for s1. */
function driveW1(wt, { file = 'engine.txt', text = 'tick\n' } = {}) {
  const dir = path.join(wt, '.ai', 'workflows', 'engine');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), '---\nslug: engine\nslices:\n  - {slug: s1, status: complete}\n  - {slug: s2, status: defined}\n---\n');
  writeFileSync(path.join(dir, '06-verify-s1.md'), '---\nslice-slug: s1\nresult: pass\n---\n');
  writeFileSync(path.join(wt, file), text);
  git(wt, 'add', file);
  git(wt, 'commit', '-q', '-m', 'engine tick');
}

// ---------------------------------------------------------------- C1

test('one wave holds both units; the wave start writes the wait, and the context file shows it', () => {
  const root = makeRepo();
  try {
    const st = startWave(root);
    assert.deepEqual(st.units.map((u) => u.key), ['W1', 'W2']);
    assert.deepEqual(st.units[1].waits, ['W1 through s1 before p2']);
    assert.deepEqual(readLedger(root).units.W2.waits, [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick', state: 'open' }]);
    assert.match(readLedger(root).waves.find((w) => w.n === 1)['plugin-version'],/^\d+\.\d+\.\d+/, 'C8: the wave records its plugin version');
    const ctx = readFileSync(run(root, 'context', 'W2').path, 'utf8');
    assert.match(ctx, /## 7\. Waits/);
    assert.match(ctx, /\*\*Open\*\*: before the slice `p2`, this branch needs W1 through `s1` \(the tick\)/);
    assert.match(ctx, /Merged into this branch: none/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge-in: refused while the drive runs or before the slice passed; then it merges, closes the wait and re-renders the context', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const w1 = run(root, 'worktree', 'W1', 'add');
    const w2 = run(root, 'worktree', 'W2', 'add');
    assert.equal(w1.ok && w2.ok, true, JSON.stringify([w1, w2]));
    run(root, 'unit', 'W2', 'running');
    assert.match(run(root, 'merge-in', 'W2', 'W1').error, /drive of W2 runs/);
    const waiting = run(root, 'unit', 'W2', 'waiting', '--on', 'W1:s1');
    assert.equal(waiting.ok, true);
    assert.equal(readLedger(root).units.W2.route, 'waits for W1:s1');
    assert.match(run(root, 'merge-in', 'W2', 'W1').error, /has not passed verify/);
    assert.equal(run(root, 'status').next.action, 'running');
    driveW1(w1.path);
    const s = run(root, 'status');
    assert.equal(s.next.action, 'merge-in', JSON.stringify(s.next));
    assert.deepEqual(s.next.merges, [{ key: 'W2', from: 'W1', through: 's1', waitingFor: 's1' }]);
    const m = run(root, 'merge-in', 'W2', 'W1');
    assert.equal(m.ok, true, JSON.stringify(m));
    assert.deepEqual(m.closed, ['W1 through s1']);
    assert.equal(m.state, 'prepared', 'the waiting unit can be driven again');
    assert.equal(readFileSync(path.join(w2.path, 'engine.txt'), 'utf8').replace(/\r\n/g, '\n'), 'tick\n');
    assert.match(readFileSync(m.context, 'utf8'), /Merged into this branch: W1 through `s1`/);
    assert.equal(git(root, 'config', '--get', 'rerere.enabled'), 'true');
    assert.equal(run(root, 'status').next.action, 'running');
    assert.match(run(root, 'merge-in', 'W2', 'W1').error, /no open wait/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merge-in aborts on a conflict and names the files; merge-order carries a unit merged in at its tip', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const w1 = run(root, 'worktree', 'W1', 'add');
    const w2 = run(root, 'worktree', 'W2', 'add');
    driveW1(w1.path, { file: 'shared.txt', text: 'from engine\n' });
    writeFileSync(path.join(w2.path, 'shared.txt'), 'from squads\n');
    git(w2.path, 'add', 'shared.txt');
    git(w2.path, 'commit', '-q', '-m', 'squads');
    const bad = run(root, 'merge-in', 'W2', 'W1');
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.conflict, ['shared.txt']);
    assert.equal(git(w2.path, 'status', '--porcelain', '--untracked-files=no'), '', 'the merge is aborted');
    // The person resolves it: W2 drops its version, then the merge-in runs clean.
    git(w2.path, 'rm', '-q', 'shared.txt');
    git(w2.path, 'commit', '-q', '-m', 'drop');
    assert.equal(run(root, 'merge-in', 'W2', 'W1').ok, true);
    run(root, 'unit', 'W1', 'finished');
    run(root, 'unit', 'W2', 'finished');
    const order = run(root, 'merge-order', '1');
    assert.equal(order.ok, true, JSON.stringify(order));
    assert.deepEqual(order.order, ['W2']);
    assert.deepEqual(order.carried, [{ key: 'W1', slug: 'engine', through: 'W2' }]);
    // W1 commits after the merge-in: it is no longer carried, and it merges first.
    writeFileSync(path.join(w1.path, 'more.txt'), 'more\n');
    git(w1.path, 'add', 'more.txt');
    git(w1.path, 'commit', '-q', '-m', 'more');
    assert.deepEqual(run(root, 'merge-order', '1').order, ['W1', 'W2']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- C2

test('steer writes the main copy and the worktree copy with the script time; a match must hit exactly one entry', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const w2 = run(root, 'worktree', 'W2', 'add');
    const a = run(root, 'steer', 'W2', 'add', '--text', 'Put run output in .scratch/');
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.equal(a.written.length, 2);
    const mainCopy = path.join(root, '.ai', 'workflows', 'squads', 'steer.md');
    const wtCopy = path.join(w2.path, '.ai', 'workflows', 'squads', 'steer.md');
    assert.equal(readFileSync(mainCopy, 'utf8'), readFileSync(wtCopy, 'utf8'));
    assert.match(readFileSync(mainCopy, 'utf8'), new RegExp(`^# Standing steering\\n\\n- Put run output in \\.scratch/ \\(the person, ${a.at}\\)\\n$`));
    run(root, 'steer', 'W2', 'add', '--text', 'Clean up the old folders', '--by', 'coordinator');
    const none = run(root, 'steer', 'W2', 'replace', '--match', 'no such entry', '--text', 'x');
    assert.equal(none.ok, false);
    assert.match(none.error, /nothing written/);
    const two = run(root, 'steer', 'W2', 'remove', '--match', 'o');
    assert.match(two.error, /2 entries match/);
    const r = run(root, 'steer', 'W2', 'replace', '--match', 'run output', '--text', 'Put run output in the worktree .scratch/ folder');
    assert.equal(r.ok, true, JSON.stringify(r));
    const text = readFileSync(wtCopy, 'utf8');
    assert.match(text, /worktree \.scratch\/ folder/);
    assert.match(text, /Clean up the old folders \(coordinator, /);
    assert.equal(run(root, 'steer', 'W2', 'remove', '--match', 'clean up').ok, true);
    const list = run(root, 'steer', 'W2', 'list');
    assert.deepEqual(list.differs, []);
    assert.equal(list.copies[0].entries.length, 1);
    const all = run(root, 'steer', 'all', 'add', '--text', 'Similar features go behind a cargo feature');
    assert.deepEqual(all.written, [path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'steer.md')]);
    assert.equal(run(root, 'steer', 'wave-1', 'add', '--text', 'both units').written.length, 3, 'W1 has no worktree; W2 has one');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('local records: a steer written to both copies syncs back with no conflict', () => {
  const root = makeRepo({ local: true });
  try {
    startWave(root);
    run(root, 'worktree', 'W2', 'add');
    run(root, 'steer', 'W2', 'add', '--text', 'an entry');
    const s = run(root, 'worktree', 'W2', 'sync');
    assert.equal(s.ok, true, JSON.stringify(s));
    assert.deepEqual(s.records.conflicts, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- C3, C9

test('rules live in the ledger and in every status; away, decided, back and recap keep the night on disk', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r1 = run(root, 'rule', 'add', '--text', 'Do not push, open a PR or merge without me');
    assert.equal(r1.rule.id, 'R1');
    run(root, 'rule', 'add', '--text', 'Ask with full context');
    assert.deepEqual(run(root, 'status').rules.map((r) => r.id), ['R1', 'R2']);
    assert.equal(run(root, 'rule', 'remove', 'R2').ok, true);
    assert.match(readFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'ledger.md'), 'utf8'), /## Standing rules/);
    const aw = run(root, 'away', '--words', 'keep the wave running, pick the best recommendations');
    assert.equal(aw.presence.state, 'away');
    assert.ok(aw.limits.some((l) => /Never push/.test(l)));
    assert.equal(run(root, 'status').presence.state, 'away');
    assert.match(run(root, 'decided', 'd1', '--question', 'Q').error, /--answer/);
    run(root, 'decided', 'd1', '--question', 'Cut the rule checker?', '--answer', 'keep it', '--why', 'the careful option');
    const d2 = run(root, 'decided', 'd2', '--question', 'Change the band?', '--answer', 'yes', '--why', 'covered by the away words', '--intent-bearing', 'true', '--options', '["yes","no"]');
    assert.equal(d2.ok, true);
    const md = readFileSync(d2.path, 'utf8');
    assert.match(md, /## d2 — .* — intent-bearing/);
    assert.match(md, /- Options: yes; no/);
    const back = run(root, 'back');
    assert.equal(back.presence.state, 'present');
    assert.deepEqual(back.recap.decided.map((d) => d.id), ['d2', 'd1'], 'the intent-bearing answer comes first');
    assert.deepEqual(run(root, 'recap').recap.decided.map((d) => d.id), ['d2', 'd1'], 'recap defaults to the last away');
    assert.deepEqual(run(root, 'recap', '--since', '2099-01-01T00:00:00Z').recap.decided, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- C4

test('the quiet lease and the heavy lock exclude each other across units', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    assert.equal(run(root, 'lock', 'acquire', 'engine').acquired, true);
    const q = run(root, 'lock', 'quiet', 'acquire', 'squads');
    assert.equal(q.acquired, false);
    assert.equal(q.heavy, 'engine');
    run(root, 'lock', 'release', 'engine');
    assert.equal(run(root, 'lock', 'quiet', 'acquire', 'squads').acquired, true);
    const h = run(root, 'lock', 'acquire', 'engine');
    assert.equal(h.acquired, false);
    assert.equal(h.quiet, 'squads');
    assert.equal(run(root, 'lock', 'acquire', 'squads').acquired, true, 'the lease holder may still take the heavy lock');
    assert.equal(run(root, 'lock', 'quiet', 'release', 'squads').released, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- C5, C6

test('the outside folder: made at add, named in the context, deleted at remove; a link stops the delete; the size goes to the history', () => {
  const outside = mkdtempSync(path.join(os.tmpdir(), 'cfix out '));
  const root = makeRepo({ isolation: { ...ISOLATION, 'outside-root': outside } });
  try {
    startWave(root);
    const a = run(root, 'worktree', 'W2', 'add');
    assert.ok(a.outside && existsSync(a.outside), JSON.stringify(a));
    assert.ok(a.outside.startsWith(outside));
    assert.match(readFileSync(run(root, 'context', 'W2').path, 'utf8'), /Outside folder: `/);
    writeFileSync(path.join(a.outside, 'big.bin'), Buffer.alloc(12 * 1024 * 1024));
    git(a.path, 'add', '.ai');
    git(a.path, 'commit', '-q', '-m', 'records');
    const r = run(root, 'worktree', 'W2', 'remove');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.outsideRemoved, a.outside);
    assert.ok(!existsSync(a.outside));
    assert.equal(readLedger(root)['disk-history'][0].key, 'W2');
    assert.ok(readLedger(root)['disk-history'][0].gb > 0);
    // A link inside the outside folder keeps the folder.
    const b = run(root, 'worktree', 'W1', 'add');
    const target = mkdtempSync(path.join(os.tmpdir(), 'cfix link '));
    writeFileSync(path.join(target, 'keep.txt'), 'keep');
    symlinkSync(target, path.join(b.outside, 'node_modules'), 'junction');
    git(b.path, 'add', '.ai');
    git(b.path, 'commit', '-q', '-m', 'records');
    const r2 = run(root, 'worktree', 'W1', 'remove');
    assert.equal(r2.ok, true, JSON.stringify(r2));
    assert.deepEqual(r2.outsideKept.links, ['node_modules']);
    assert.ok(existsSync(path.join(target, 'keep.txt')), 'the linked folder is untouched');
    rmSync(target, { recursive: true, force: true });
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('the disk estimate uses the history; the path check refuses a worktree too deep for Windows', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const l = readLedger(root);
    l['disk-history'] = [{ key: 'old', gb: 1e9, at: '2026-10-01T00:00:00Z' }];
    writeLedger(root, l);
    const full = run(root, 'worktree', 'W2', 'add');
    assert.equal(full.wait, true);
    assert.match(full.error, /from earlier units/);
    delete l['disk-history'];
    writeLedger(root, l);
    writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation: { ...ISOLATION, 'build-depth': 300 } } }));
    const deep = runEnv(root, { SDLC_CAMPAIGN_PATH_CHECK: '1' }, 'worktree', 'W2', 'add');
    assert.equal(deep.ok, false);
    assert.match(deep.error, /worktree-root/);
    const wr = mkdtempSync(path.join(os.tmpdir(), 'cw'));
    writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation: { ...ISOLATION, 'worktree-root': wr } } }));
    const ok = run(root, 'worktree', 'W2', 'add');
    assert.equal(ok.ok, true, JSON.stringify(ok));
    assert.ok(path.resolve(ok.path).startsWith(path.resolve(wr)), ok.path);
    git(root, 'worktree', 'remove', '--force', ok.path);
    rmSync(wr, { recursive: true, force: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- C8

test('status reports a newer installed plugin, and nothing for the same version', () => {
  const root = makeRepo();
  const rec = path.join(mkdtempSync(path.join(os.tmpdir(), 'cfix plug ')), 'installed_plugins.json');
  try {
    run(root, 'orient');
    const own = JSON.parse(readFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
    writeFileSync(rec, JSON.stringify({ version: 2, plugins: { 'sdlc-workflow@m': [{ scope: 'user', version: '999.0.0' }, { scope: 'local', projectPath: '/elsewhere', version: '1000.0.0' }] } }));
    assert.deepEqual(runEnv(root, { SDLC_INSTALLED_PLUGINS: rec }, 'status').pluginUpdate, { running: own, installed: '999.0.0' });
    writeFileSync(rec, JSON.stringify({ version: 2, plugins: { 'sdlc-workflow@m': [{ scope: 'user', version: own }] } }));
    assert.equal(runEnv(root, { SDLC_INSTALLED_PLUGINS: rec }, 'status').pluginUpdate, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(path.dirname(rec), { recursive: true, force: true }); }
});
