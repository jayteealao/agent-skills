// The compose sync on a local remote: the fence of the owners (a non-owner, a stale owner, a
// claim on an old copy, two computers that make one workflow, a hand-over, add-only messages),
// the guards (nothing that no commit may hold reaches the remote), and a kill at each step (no
// write that was on the disk is lost).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SNAPSHOT_CACHE, composeSync, gitFailure, mayChange, parseOwner } from '../../lib/records-compose.mjs';
import { keptOutOfCommits } from '../../lib/records-sync.mjs';

const ENGINE = join(import.meta.dirname, '..', '..', 'lib', 'records-compose.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-compose-'));
  const bare = join(top, 'h.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const saved = { ...process.env };
  Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_HOME: join(top, 'sdlc') });
  const clone = (name) => {
    const dir = join(top, name);
    git(top, 'clone', '-q', '-c', 'core.autocrlf=false', bare, dir);
    git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    return dir;
  };
  const w = (dir, p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  const r = (dir, p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null);
  const up = (p) => { try { return git(bare, 'show', `main:${p}`); } catch { return null; } };
  const sync = (dir, me) => composeSync(dir, { me, held: (p) => (keptOutOfCommits(p, dir) ? 'kept out of the commits' : null), kill: null });
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true, maxRetries: 5 });
  };
  return { top, bare, clone, w, r, up, sync, done };
}

/** Computers c and d, with four workflows of project p that c owns, on the remote. */
function two(x) {
  const c = x.clone('C');
  x.w(c, '.gitignore', '*/INDEX.md\n.draft/\n');
  for (const u of ['x', 'y', 'z']) { x.w(c, `p/${u}/owner`, 'c 1\n'); x.w(c, `p/${u}/log`, '1\n'); }
  assert.equal(x.sync(c, 'c').pushed, true);
  const d = x.clone('D');
  x.sync(d, 'd');
  return { c, d };
}

test('the owner rules', () => {
  assert.deepEqual(parseOwner('dragon 3\n'), { machine: 'dragon', epoch: 3 });
  assert.equal(parseOwner('Dragon x'), null);
  const t = (m) => new Map(Object.entries(m));
  const text = (e) => e ?? '';
  const u = { kind: 'workflow', unit: 'p/x' };
  const B = t({ 'p/x/owner': 'c 1' });
  assert.equal(mayChange(u, ['p/x/log'], { B, U: B, L: B, text, me: 'c' }), true, 'the owner');
  assert.equal(mayChange(u, ['p/x/log'], { B, U: B, L: B, text, me: 'd' }), false, 'not the owner');
  assert.equal(mayChange(u, ['p/x/owner'], { B, U: B, L: t({ 'p/x/owner': 'd 2' }), text, me: 'd' }), true, 'a claim at n + 1');
  assert.equal(mayChange(u, ['p/x/owner'], { B, U: B, L: t({ 'p/x/owner': 'd 3' }), text, me: 'd' }), false, 'a claim that skips an epoch');
  assert.equal(mayChange({ kind: 'machine', unit: '.machines/c', machine: 'c' }, ['.machines/c.json'], { B, U: B, L: B, text, me: 'd' }), false);
});

test('the fence: a non-owner, a stale owner, a claim on an old copy, two makers, a hand-over, messages', () => {
  const x = world();
  try {
    const { c, d } = two(x);
    let a;
    x.w(d, 'p/x/log', 'intruder\n'); a = x.sync(d, 'd');
    assert.ok(x.up('p/x/log') === '1' && a.fenced.includes('p/x') && a.parked, 'a non-owner is parked');
    x.w(d, 'p/x/log', '1\n'); x.sync(d, 'd');

    x.w(d, 'p/x/owner', 'd 2\n'); x.w(d, 'p/x/log', 'd work\n');
    x.w(c, 'p/x/log', 'c late\n'); x.w(c, 'p/y/log', 'c y2\n');
    x.sync(d, 'd'); a = x.sync(c, 'c');
    assert.deepEqual(a.fenced, ['p/x'], 'only the taken unit stops');
    assert.equal(x.up('p/y/log'), 'c y2');
    assert.equal(x.up('p/x/log'), 'd work');
    assert.deepEqual(x.sync(c, 'c').fenced, ['p/x'], 'the stale owner stays fenced');
    assert.equal(x.r(c, 'p/x/log'), 'c late\n', 'its late work stays on its disk');

    x.w(c, 'p/y/inbox/c1', 'c'); x.w(d, 'p/y/inbox/d1', 'd');
    x.sync(c, 'c'); x.sync(d, 'd'); x.sync(c, 'c');
    assert.equal(x.r(c, 'p/y/inbox/d1'), 'd');
    assert.equal(x.r(d, 'p/y/inbox/c1'), 'c');
    x.w(d, 'p/y/inbox/c1', 'evil'); x.sync(d, 'd');
    assert.equal(x.up('p/y/inbox/c1'), 'c', 'a message is never changed');
    x.w(d, 'p/y/inbox/c1', 'c');

    x.w(c, 'p/z/log', 'c newest\n'); x.sync(c, 'c');
    x.w(d, 'p/z/owner', 'd 2\n'); x.sync(d, 'd');
    assert.equal(x.up('p/z/owner'), 'c 1', 'a claim on an old copy is refused');

    x.w(c, 'p/y/é ü.md', 'ok\n'); x.sync(c, 'c'); x.sync(d, 'd');
    assert.equal(x.r(d, 'p/y/é ü.md'), 'ok\n', 'a file name that is not ASCII');

    x.w(c, 'p/m/owner', 'c 1\n'); x.w(d, 'p/m/owner', 'd 1\n'); x.w(c, 'p/m/a', 'C'); x.w(d, 'p/m/a', 'D');
    x.sync(c, 'c'); a = x.sync(d, 'd');
    assert.ok(x.up('p/m/a') === 'C' && a.fenced.includes('p/m'), 'two computers make one workflow: the first wins');

    x.w(c, 'p/y/owner', 'd 2\n'); x.sync(c, 'c'); x.sync(d, 'd');
    x.w(d, 'p/y/log', 'd has it\n'); x.sync(d, 'd');
    assert.equal(x.up('p/y/log'), 'd has it', 'a hand-over');
  } finally { x.done(); }
});

test('the guards: nothing that no commit may hold reaches the remote', () => {
  const x = world();
  try {
    mkdirSync(process.env.SDLC_HOME, { recursive: true });
    writeFileSync(join(process.env.SDLC_HOME, 'config.json'), JSON.stringify({ records: { 'max-file-mb': 0.001 } }));
    const { c } = two(x);
    x.w(c, 'p/x/.draft/04-plan.md', 'draft');
    x.w(c, 'p/INDEX.md', 'generated');
    x.w(c, 'p/answers.jsonl', '{}\n');
    x.w(c, 'p/x/big.bin', 'x'.repeat(4096));
    x.w(c, 'README.md', 'no unit');
    x.w(c, 'p/x/log', 'sent\n');
    x.w(c, 'p/y/records.lock', JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString(), id: 'a' }));
    x.w(c, 'p/y/log', 'held while written\n');
    const a = x.sync(c, 'c');
    assert.equal(x.up('p/x/log'), 'sent');
    for (const p of ['p/x/.draft/04-plan.md', 'p/INDEX.md', 'p/answers.jsonl', 'p/x/big.bin', 'README.md', 'p/y/records.lock']) assert.equal(x.up(p), null, p);
    assert.equal(x.up('p/y/log'), '1', 'a unit whose lock is held waits');
    assert.ok(a.held.some((h) => h.path === 'README.md' && /no unit/.test(h.why)));
    rmSync(join(c, 'p/y/records.lock'));
    x.sync(c, 'c');
    assert.equal(x.up('p/y/log'), 'held while written', 'it goes at the next sync');
    assert.equal(x.up('p/x/big.bin'), null);
  } finally { x.done(); }
});

test('a kill at each step loses no write that was on the disk', { timeout: 300_000 }, () => {
  const x = world();
  try {
    const { c, d } = two(x);
    const killed = (dir, me, step) => spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { composeSync } from ${JSON.stringify(`file:///${ENGINE.replace(/\\/g, '/')}`)}; const r = composeSync(process.argv[1], { me: process.argv[2], kill: process.argv[3] }); console.log(JSON.stringify(r));`, dir, me, step], { encoding: 'utf8', env: process.env });
    const steps = ['snapshot', 'compose', 'push', 'apply'];
    let n = 0;
    for (let round = 0; round < 3; round += 1) {
      for (const step of steps) {
        n += 1;
        x.w(c, `p/x/l${n}`, `c${n}\n`);
        x.w(d, `p/inbox-of-d-${n}/owner`, 'd 1\n');
        x.w(d, `p/inbox-of-d-${n}/a`, `d${n}\n`);
        const kc = killed(c, 'c', step);
        assert.equal(kc.status, 9, `${step}: ${kc.stdout}${kc.stderr}`);
        const kd = killed(d, 'd', step);
        assert.equal(kd.status, 9, `${step}: ${kd.stdout}${kd.stderr}`);
        // Between the kills, the other computer pushes, so the next kill meets a remote that moved.
        if (step === 'push') x.sync(d, 'd');
      }
    }
    for (let i = 0; i < 3; i += 1) { x.sync(c, 'c'); x.sync(d, 'd'); }
    for (let i = 1; i <= n; i += 1) {
      assert.equal(x.up(`p/x/l${i}`), `c${i}`);
      assert.equal(x.up(`p/inbox-of-d-${i}/a`), `d${i}`);
      assert.equal(x.r(d, `p/x/l${i}`), `c${i}\n`);
      assert.equal(x.r(c, `p/inbox-of-d-${i}/a`), `d${i}\n`);
    }
    assert.equal(git(c, 'rev-parse', 'main'), git(d, 'rev-parse', 'main'));
  } finally { x.done(); }
});

test('a git failure says a timeout, and a warning before the error is not the error', () => {
  assert.equal(gitFailure({ status: null, err: "warning: in the working copy of 'a', CRLF will be replaced by LF" }, 120_000), 'stopped after 120 s with no answer');
  assert.equal(gitFailure({ status: 128, err: 'warning: CRLF will be replaced\nfatal: not a git repository\n' }, 1000), 'fatal: not a git repository');
  assert.equal(gitFailure({ status: 1, err: '' }, 1000), 'exit 1');
});

test('the snapshot cache: a later change is sent, the skipped files never enter a commit, a tracked one stays', () => {
  const x = world();
  try {
    const c = x.clone('C');
    x.w(c, 'p/x/owner', 'c 1\n'); x.w(c, 'p/x/log', '1\n'); x.w(c, 'p/x/old.png', 'tracked');
    assert.equal(x.sync(c, 'c').pushed, true);
    assert.equal(x.up('p/x/old.png'), 'tracked');
    assert.ok(existsSync(join(c, '.git', SNAPSHOT_CACHE)), 'the snapshot leaves its index');
    const skip = ['**/*.png'];
    const run = () => composeSync(c, { me: 'c', held: () => null, skip, kill: null });
    // An edit after the cache, of the same size: the stat data differs, so the snapshot reads it.
    x.w(c, 'p/x/log', '2\n'); x.w(c, 'p/x/new.png', 'skipped'); x.w(c, 'p/x/old.png', 'changed');
    assert.equal(run().pushed, true);
    assert.equal(x.up('p/x/log'), '2');
    assert.equal(x.up('p/x/new.png'), null, 'a skipped file never enters a commit');
    assert.equal(x.up('p/x/old.png'), 'tracked', 'a tracked skipped file stays at its base entry');
    x.w(c, 'p/x/log', '3\n');
    rmSync(join(c, '.git', SNAPSHOT_CACHE));
    assert.equal(run().pushed, true, 'with no cache, the snapshot starts from the base');
    assert.equal(x.up('p/x/log'), '3');
  } finally { x.done(); }
});
