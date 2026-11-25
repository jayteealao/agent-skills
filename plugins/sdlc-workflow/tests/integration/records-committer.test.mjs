// The records committer with `records.sync: compose`, on a local remote: a write commits nothing
// and wakes the committer, `records flush` waits for the push and says when it did not land, a
// newer format of the repo stops every write, and the committer process starts, syncs and ends.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME, setFields } from '../../lib/records.mjs';
import { workflowDir } from '../../lib/records-root.mjs';
import { linkProject, pushRecords } from '../../lib/records-sync.mjs';
import { committerAlive, committerLockPath, readSyncState, wakeCommitter } from '../../lib/records-committer.mjs';
import { recordsLine } from '../../lib/records-line.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cli = (...args) => spawnSync(process.execPath, [WF, ...args], { encoding: 'utf8', env: process.env });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-committer-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const home = join(top, 'home');
  mkdirSync(home, { recursive: true });
  const config = (sync) => writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', ...(sync ? { sync } : {}) } }));
  config(null);
  git(top, 'clone', '-q', bare, join(home, 'records'));
  const root = join(top, 'project');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: active\ncurrent-stage: plan\n---\n');
  const saved = { ...process.env };
  Object.assign(process.env, { SDLC_HOME: home, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off' });
  delete process.env.WF_ACTOR;
  linkProject(root, 'notes');
  assert.equal(pushRecords().pushed, true);
  config('compose');
  const remote = (path) => { try { return git(top, '--git-dir', bare, 'show', `main:${path}`); } catch { return null; } };
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true, maxRetries: 5 });
  };
  return { top, bare, home, root, clone: join(home, 'records'), remote, done };
}

test('a write wakes the committer, which sends it: no commit of its own, and the state says when', () => {
  const w = world();
  try {
    delete process.env.SDLC_RECORDS_PUSH;
    process.env.SDLC_RECORDS_FOREGROUND = '1';
    const before = git(w.clone, 'rev-list', '--count', 'HEAD');
    const r = cli('record', 'set', w.root, 'w1', 'index', 'current-stage=implement');
    assert.equal(r.status, 0, r.stderr);
    assert.match(w.remote('notes/w1/state.yaml') ?? '', /current-stage: implement/, 'the change reached the remote');
    assert.match(git(w.top, '--git-dir', w.bare, 'log', '-1', '--format=%s', 'main'), /^sync alpha$/, 'the committer made the commit');
    assert.equal(Number(git(w.clone, 'rev-list', '--count', 'HEAD')), Number(before) + 1, 'one sync commit, no commit of the write');
    const s = readSyncState();
    assert.ok(s.lastPush && !s.lastError, JSON.stringify(s));
  } finally { w.done(); }
});

test('records flush waits for the push, and exits 1 with the reason when it did not land', () => {
  const w = world();
  try {
    setFields(workflowDir(w.root, 'w1'), INDEX_NAME, { 'current-stage': 'verify' });
    const ok = cli('records', 'flush', w.root, 'w1');
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /records: sent w1/);
    assert.match(w.remote('notes/w1/state.yaml') ?? '', /current-stage: verify/);

    git(w.clone, 'remote', 'set-url', 'origin', join(w.top, 'no-such.git'));
    setFields(workflowDir(w.root, 'w1'), INDEX_NAME, { 'current-stage': 'review' });
    const bad = cli('records', 'flush', w.root, 'w1');
    assert.equal(bad.status, 1, bad.stdout);
    assert.match(bad.stdout, /records: not sent: /);
    assert.ok(readSyncState().lastError?.error, 'the state keeps the failure');
    const line = recordsLine(w.root, { target: 'w1', claim: false }).line ?? '';
    assert.match(line, /records sync failed/i, 'the dispatch shows it');
    git(w.clone, 'remote', 'set-url', 'origin', w.bare);
    assert.equal(cli('records', 'flush', w.root, 'w1').status, 0);
    assert.equal(recordsLine(w.root, { target: 'w1', claim: false }).line, null, 'a good sync clears it');
  } finally { w.done(); }
});

test('a repo in a newer format of the records is not written', () => {
  const w = world();
  try {
    const other = join(w.top, 'other');
    git(w.top, 'clone', '-q', w.bare, other);
    writeFileSync(join(other, '.records-epoch'), '2\n');
    git(other, 'add', '.records-epoch');
    git(other, 'commit', '-q', '-m', 'format 2');
    git(other, 'push', '-q', 'origin', 'HEAD:main');
    setFields(workflowDir(w.root, 'w1'), INDEX_NAME, { 'current-stage': 'verify' });
    const r = cli('records', 'flush', w.root, 'w1');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /format 2.*update the plugin/);
    assert.doesNotMatch(w.remote('notes/w1/state.yaml') ?? '', /current-stage: verify/);
  } finally { w.done(); }
});

test('the committer process starts once, sends an urgent change, and ends when idle', async () => {
  const w = world();
  try {
    delete process.env.SDLC_RECORDS_PUSH;
    process.env.SDLC_COMMITTER_TIMES = JSON.stringify({ tickMs: 100, quietMs: 400, jitterMs: 1, urgentGapMs: 0, idleMs: 2_500, heartbeatMs: 100, watchMs: 400 });
    setFields(workflowDir(w.root, 'w1'), INDEX_NAME, { 'current-stage': 'implement' });
    wakeCommitter({ urgent: true });
    wakeCommitter({ urgent: true });
    let until = Date.now() + 30_000;
    while (!/current-stage: implement/.test(w.remote('notes/w1/state.yaml') ?? '') && Date.now() < until) await pause(200);
    assert.match(w.remote('notes/w1/state.yaml') ?? '', /current-stage: implement/, 'the committer sent it');
    assert.equal(committerAlive(), true, 'it runs, behind its lock');
    until = Date.now() + 30_000;
    while (committerAlive() && Date.now() < until) await pause(200);
    assert.equal(committerAlive(), false, 'it ended after the idle time');
    assert.equal(existsSync(committerLockPath()), false, 'and gave up its lock');
  } finally { w.done(); }
});
