// The quiet dispatch: on one computer it commits nothing, fetches nothing and asks the remote
// nothing, and it prints no records line and no lease line while the records are in order. The
// remote of the clone is a path that does not exist, so any network call fails, and GIT_TRACE
// counts each git call. A records problem comes as one line: `records: ask` or `records: stop`.
// A fake gh stands in for GitHub; nothing reaches the network.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INDEX_NAME } from '../../lib/records.mjs';
import { linkProject, pushRecords } from '../../lib/records-sync.mjs';

const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const iso = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** One computer with a linked project. `config` adds to ~/.sdlc/config.json. */
function world(config = {}) {
  const top = mkdtempSync(join(tmpdir(), 'records-quiet-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const home = join(top, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', ...config } }));
  const clone = join(home, 'records');
  git(top, 'clone', '-q', bare, clone);
  const root = join(top, 'project');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), `---\nschema: sdlc/v1\ntype: index\nslug: w1\ntitle: W1\nstatus: active\ncurrent-stage: plan\nnext-invocation: /wf plan w1\n---\n`);
  const saved = { ...process.env };
  const env = { SDLC_HOME: home, SDLC_RECORDS_PUSH: 'off', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };
  Object.assign(process.env, env);
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { top, bare, home, clone, root, env, done };
}

/** Link the project, push once, then point the remote at a path that does not exist. */
function linkedOffline(w) {
  assert.equal(linkProject(w.root, 'notes').ok, true);
  assert.equal(pushRecords(w.clone).pushed, true);
  git(w.clone, 'remote', 'set-url', 'origin', join(w.top, 'no-such-remote.git'));
}

/** Run wf.mjs with GIT_TRACE: `{ stdout, status, git }`, where `git` lists the git commands that ran. */
function cli(w, args, extra = {}) {
  const trace = join(w.top, `trace-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  const r = spawnSync(process.execPath, [WF, ...args], { encoding: 'utf8', env: { ...process.env, ...w.env, GIT_TRACE: trace, ...extra } });
  const lines = existsSync(trace) ? readFileSync(trace, 'utf8').split(/\r?\n/) : [];
  const calls = lines.map((l) => /trace: built-in: git (\S+)/.exec(l)?.[1]).filter(Boolean);
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, git: calls };
}

const NETWORK = ['fetch', 'push', 'pull', 'ls-remote', 'clone', 'commit', 'commit-tree', 'merge', 'rebase', 'add'];
const recordsLines = (text) => text.split(/\r?\n/).filter((l) => /^records|^lease|^messages:|^github-/.test(l));

test('one computer: a status call and a call on a workflow make no network call, no commit, and print no records line', () => {
  const w = world();
  try {
    linkedOffline(w);
    for (const tokens of [['status'], ['status', 'w1'], ['w1']]) {
      const r = cli(w, ['dispatch', w.root, '--host', 'claude', '--', ...tokens]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /^wf dispatch: /);
      assert.deepEqual(r.git.filter((c) => NETWORK.includes(c)), [], `${tokens.join(' ')}: ${r.git.join(', ')}`);
      assert.deepEqual(recordsLines(r.stdout), [], r.stdout);
    }
    // The status call runs no git at all in this project.
    assert.deepEqual(cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status']).git, []);
  } finally { w.done(); }
});

test('two computers: the call on a workflow claims the lease; an unreachable remote is one ask line, and no stops the key', () => {
  const w = world();
  try {
    linkedOffline(w);
    writeFileSync(join(w.clone, '.machines', 'beta.json'), JSON.stringify({ machine: 'beta', projects: {} }));
    const r = cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'w1']);
    assert.ok(r.git.includes('ls-remote'), 'the claim asks the remote');
    const lines = recordsLines(r.stdout);
    assert.equal(lines.length, 1, r.stdout);
    assert.match(lines[0], /^records: ask "The records repo cannot be reached, so no other computer knows that w1 runs here\. Continue\?" yes=`wf\.mjs lease show ".+" w1` no=`wf\.mjs lease decline ".+" w1`$/);
    assert.equal(cli(w, ['lease', 'decline', w.root, 'w1']).status, 1, 'no stops the key');
    assert.equal(cli(w, ['lease', 'show', w.root, 'w1']).status, 0, 'yes runs the key');
    // A status call claims nothing.
    assert.deepEqual(recordsLines(cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status']).stdout), []);
  } finally { w.done(); }
});

test('a failed push in the records log is one ask line; no asks again only about a newer failure; a push that works clears it', () => {
  const w = world();
  try {
    linkedOffline(w);
    const log = join(w.home, 'records-log.jsonl');
    appendFileSync(log, `${JSON.stringify({ at: iso(Date.now() - 60_000), project: null, slug: null, step: 'push', error: 'the push was rejected 3 times' })}\n`);
    const r = cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'w1']);
    assert.deepEqual(r.git.filter((c) => NETWORK.includes(c)), []);
    const [line, ...rest] = recordsLines(r.stdout);
    assert.deepEqual(rest, []);
    assert.match(line, /^records: ask "The last push of the records failed at \S+: the push was rejected 3 times\. Retry in the background\?" yes=`wf\.mjs records retry ".+" w1` no=`wf\.mjs records dismiss ".+"`$/);

    assert.equal(cli(w, ['records', 'dismiss', w.root]).status, 0);
    assert.deepEqual(recordsLines(cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'w1']).stdout), [], 'the person said no');

    appendFileSync(log, `${JSON.stringify({ at: iso(Date.now() + 60_000), step: 'push', error: 'offline' })}\n`);
    assert.equal(recordsLines(cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status']).stdout).length, 1, 'a newer failure asks again');
    appendFileSync(log, `${JSON.stringify({ at: iso(Date.now() + 120_000), step: 'push', ok: true })}\n`);
    assert.deepEqual(recordsLines(cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status']).stdout), [], 'a push that works clears it');
  } finally { w.done(); }
});

test('records status --problems prints only the failed pushes, the conflicts and the files in no commit, at most 40 lines', () => {
  const w = world();
  try {
    linkedOffline(w);
    assert.equal(cli(w, ['records', 'status', w.root, '--problems']).stdout.trim(), 'records: no problem');
    appendFileSync(join(w.home, 'records-log.jsonl'), `${JSON.stringify({ at: iso(), step: 'push', error: 'the push was rejected 3 times' })}\n`);
    writeFileSync(join(w.clone, 'notes', 'w1', 'stray.md'), 'x');
    const few = cli(w, ['records', 'status', w.root, '--problems']).stdout.trim().split(/\r?\n/);
    assert.deepEqual(few.map((l) => l.split(':')[0]), ['push failed', 'in no commit']);
    assert.match(few[1], /notes\/w1\/stray\.md$/);
    for (let i = 0; i < 50; i += 1) writeFileSync(join(w.clone, 'notes', 'w1', `n${i}.md`), 'x');
    const many = cli(w, ['records', 'status', w.root, '--problems']).stdout.trim().split(/\r?\n/);
    assert.equal(many.length, 40);
    assert.match(many.at(-1), /^and 13 more line\(s\): wf\.mjs records status /);
  } finally { w.done(); }
});

/** A fake gh: it logs each call, answers an issue URL, and fails each call when FAKE_GH_FAIL is set. */
function fakeGh(top) {
  const file = join(top, 'fake-gh.mjs');
  writeFileSync(file, [
    "import { appendFileSync } from 'node:fs';",
    "appendFileSync(process.env.FAKE_GH_LOG, `${process.argv.slice(2).join(' ')}\\n`);",
    "if (process.env.FAKE_GH_FAIL) { process.stderr.write(process.env.FAKE_GH_FAIL); process.exit(1); }",
    "if (process.argv[2] === 'issue' && process.argv[3] === 'create') process.stdout.write('https://github.com/me/wf-records/issues/7\\n');",
    "if (process.argv[2] === 'issue' && process.argv[3] === 'list') process.stdout.write('[]');",
    "if (process.argv[2] === 'issue' && process.argv[3] === 'view') process.stdout.write(JSON.stringify({ comments: [] }));",
  ].join('\n'));
  return { SDLC_GH_BIN: file, FAKE_GH_LOG: join(top, 'gh.log'), SDLC_RECORDS_FOREGROUND: '1' };
}

test('the link queues each workflow for its issue as its last step; the flush writes its result to the records log', () => {
  const w = world({ repo: 'me/wf-records' });
  try {
    const gh = fakeGh(w.top);
    const r = cli(w, ['records', 'link', w.root, 'notes'], gh);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /github: queued 1 workflow\(s\)/);
    assert.match(readFileSync(gh.FAKE_GH_LOG, 'utf8'), /^issue create --repo me\/wf-records --title notes\/w1: W1/m);
    const flush = readFileSync(join(w.home, 'records-log.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l)).filter((e) => e.step === 'flush');
    assert.deepEqual(flush.map((e) => [e.background, e.sent, e.left, e.error]), [[true, 1, 0, null]]);
    assert.ok(existsSync(join(w.clone, 'notes', 'w1', 'layer.json')), 'the issue number is in the workflow folder');
  } finally { w.done(); }
});

test('the dispatch imports no comments and calls no gh; a failed flush and a queue older than one day are one ask line', () => {
  const w = world({ repo: 'me/wf-records' });
  try {
    linkedOffline(w);
    const gh = fakeGh(w.top);
    // A status call with an empty queue starts no flush, so no gh call runs at all.
    const quiet = cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status'], gh);
    assert.deepEqual(recordsLines(quiet.stdout), []);
    assert.ok(!existsSync(gh.FAKE_GH_LOG), 'no gh call');

    // An edit that waits for two days, and a background flush that fails.
    mkdirSync(join(w.home, 'outbox'), { recursive: true });
    writeFileSync(join(w.home, 'outbox', 'github.jsonl'), `${JSON.stringify({ id: 'old-1', at: iso(Date.now() - 2 * 86_400_000), op: 'comment', repo: 'me/wf-records', project: 'notes', slug: 'w1', root: w.root, body: 'x' })}\n`);
    const first = cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status'], { ...gh, FAKE_GH_FAIL: 'HTTP 422: Validation Failed' });
    const [line] = recordsLines(first.stdout);
    assert.match(line, /^records: ask "1 GitHub issue edit\(s\) wait since \S+\. Retry in the background\?" yes=`wf\.mjs records retry ".+"` no=`wf\.mjs records dismiss ".+"`$/);
    const second = cli(w, ['dispatch', w.root, '--host', 'claude', '--', 'status'], { ...gh, FAKE_GH_FAIL: 'HTTP 422: Validation Failed' });
    assert.match(recordsLines(second.stdout)[0], /^records: ask "The last send of the GitHub issue edits failed at \S+: no issue yet for notes\/w1; 1 GitHub issue edit\(s\) wait since /);
    assert.ok(!existsSync(gh.FAKE_GH_LOG) || !/issue view/.test(readFileSync(gh.FAKE_GH_LOG, 'utf8')), 'the dispatch of a status call imports no comments');
    // The import of the comments runs in the flush that the dispatch starts in the background.
    writeFileSync(join(w.clone, 'notes', 'w1', 'layer.json'), JSON.stringify({ key: 'notes/w1', repo: 'me/wf-records', number: 7, url: 'https://github.com/me/wf-records/issues/7' }));
    const flushed = cli(w, ['gh', 'flush', w.root, 'w1'], gh);
    assert.equal(flushed.status, 0, flushed.stdout);
    assert.match(readFileSync(gh.FAKE_GH_LOG, 'utf8'), /^issue view 7 --repo me\/wf-records --json comments$/m, 'the flush imports the comments of the workflow');

    // records status gives the parked count.
    writeFileSync(join(w.home, 'outbox', 'github-parked.jsonl'), `${JSON.stringify({ id: 'p-1', op: 'comment', project: 'notes', slug: 'w1', parkedAt: iso(), error: 'HTTP 422' })}\n`);
    assert.match(cli(w, ['records', 'status', w.root]).stdout, /^github: 0 queued, 1 parked \(failed 3 flushes\); wf\.mjs gh status /m);
  } finally { w.done(); }
});
