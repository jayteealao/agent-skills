// The GitHub layer across machines: one issue per workflow on every machine, a failing entry
// that is parked so the rest go on, every comment of the person imported, and an issue that
// stays open through ship. A fake runner stands in for gh; nothing is written to GitHub.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYER_MARK, backfill, flushOutbox, issueComments, layerOf, layerStatus, noteAnswer, noteChange, outboxPath, parkedPath, readOutbox } from '../../../lib/github-layer.mjs';
import { importComments } from '../../../lib/messages.mjs';
import { setFields } from '../../../lib/records.mjs';

const machine = (top, name) => {
  const home = join(top, `home-${name}`);
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { repo: 'me/wf-records' } }));
  return home;
};

function setup() {
  const top = mkdtempSync(join(tmpdir(), 'gh-sync-'));
  const root = join(top, 'project');
  for (const slug of ['add-tags', 'b']) {
    mkdirSync(join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\ntitle: ${slug}\nstatus: active\ncurrent-stage: intake\n---\n`);
  }
  writeFileSync(join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ records: { project: 'notes' } }));
  const saved = process.env.SDLC_HOME;
  const as = (home) => { process.env.SDLC_HOME = home; };
  const done = () => {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  };
  return { top, root, dir: (s) => join(root, '.ai', 'workflows', s), as, done };
}

const fakeGh = ({ fail = null, list = [] } = {}) => {
  const calls = [];
  const run = (cmd, args, { input } = {}) => {
    calls.push({ args, input });
    if (fail && args.slice(0, 2).join(' ') === fail) return { status: 1, stdout: '', stderr: 'offline' };
    if (args[0] === 'issue' && args[1] === 'create') return { status: 0, stdout: 'https://github.com/me/wf-records/issues/12', stderr: '' };
    if (args[0] === 'issue' && args[1] === 'list') return { status: 0, stdout: JSON.stringify(list), stderr: '' };
    if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ comments: [] }), stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls, verbs: () => calls.map((c) => c.args.slice(0, 2).join(' ')) };
};

test('a second machine uses the issue of the first: from layer.json, else by the hidden key', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    noteChange(t.root, 'add-tags');
    const a = fakeGh();
    flushOutbox({ run: a.run });
    assert.ok(a.verbs().includes('issue create'));
    assert.match(a.calls.find((c) => c.args[0] === 'issue' && c.args[1] === 'create').input, /<!-- wf-key: notes\/add-tags -->/);
    const file = JSON.parse(readFileSync(join(t.dir('add-tags'), 'layer.json'), 'utf8'));
    assert.deepEqual([file.key, file.number], ['notes/add-tags', 12]);

    // Machine b has its own state and no issue in it; the synced layer.json names the issue.
    t.as(machine(t.top, 'b'));
    noteChange(t.root, 'add-tags');
    const b = fakeGh();
    flushOutbox({ run: b.run });
    assert.ok(!b.verbs().includes('issue create'), b.verbs().join(', '));
    assert.equal(b.calls.find((c) => c.args[1] === 'edit').args[2], '12');
    const view = fakeGh();
    issueComments(t.root, 'add-tags', { run: view.run });
    assert.deepEqual(view.calls[0].args.slice(0, 3), ['issue', 'view', '12']);

    // Machine c has no layer.json either: the search finds the issue by its key.
    rmSync(join(t.dir('add-tags'), 'layer.json'));
    t.as(machine(t.top, 'c'));
    noteChange(t.root, 'add-tags');
    const c = fakeGh({ list: [{ number: 12, url: 'https://github.com/me/wf-records/issues/12', title: 'x', body: 'text\n<!-- wf-key: notes/add-tags -->\n' }] });
    flushOutbox({ run: c.run });
    assert.ok(!c.verbs().includes('issue create'));
    assert.equal(JSON.parse(readFileSync(join(t.dir('add-tags'), 'layer.json'), 'utf8')).number, 12);
  } finally { t.done(); }
});

test('a machine that knows the issue from layer.json reads its label and state, so it removes a needs-me and reopens what another machine set', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    noteChange(t.root, 'add-tags');
    flushOutbox({ run: fakeGh().run });
    t.as(machine(t.top, 'b'));
    noteChange(t.root, 'add-tags');
    const calls = [];
    const run = (cmd, args) => {
      calls.push(args);
      if (args[0] === 'issue' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ labels: [{ name: 'needs-me' }, { name: 'wf' }], state: 'CLOSED' }), stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    assert.equal(flushOutbox({ run }).error, null);
    assert.deepEqual(calls.find((a) => a[1] === 'view').slice(-2), ['--json', 'labels,state']);
    assert.ok(calls.some((a) => a[1] === 'edit' && a.includes('--remove-label') && a.includes('needs-me')), 'the needs-me label goes');
    assert.ok(calls.some((a) => a[0] === 'issue' && a[1] === 'reopen'), 'the issue opens again');
  } finally { t.done(); }
});

test('a worktree with no config of its own queues the GitHub edits of the main worktree', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    // The main checkout holds .git and the config; the worktree has only a .git file.
    mkdirSync(join(t.root, '.git', 'worktrees', 'wt'), { recursive: true });
    writeFileSync(join(t.root, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
    const wt = join(t.top, 'wt');
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, '.git'), `gitdir: ${join(t.root, '.git', 'worktrees', 'wt')}\n`);
    assert.deepEqual(layerOf(wt), { repo: 'me/wf-records', owner: 'me', project: 'notes', board: null });
  } finally { t.done(); }
});

test('the flush lock names its process; a lock of an ended process is taken over at once', () => {
  const t = setup();
  try {
    const home = machine(t.top, 'a');
    t.as(home);
    noteChange(t.root, 'add-tags');
    mkdirSync(join(home, 'outbox'), { recursive: true });
    const lock = join(home, 'outbox', 'flush.lock');
    writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 7, host: hostname(), at: new Date().toISOString() }));
    let held = null;
    const gh = fakeGh();
    const run = (cmd, args, o) => { held ??= JSON.parse(readFileSync(lock, 'utf8')); return gh.run(cmd, args, o); };
    const r = flushOutbox({ run });
    assert.equal(r.busy, undefined);
    assert.equal(r.sent, 1);
    assert.deepEqual([held.pid, held.host], [process.pid, hostname()]);
    assert.equal(existsSync(lock), false, 'the flush gives the lock up');
  } finally { t.done(); }
});

test('an entry that fails three flushes is parked, and the entries after it go out', () => {
  const t = setup();
  try {
    const home = machine(t.top, 'a');
    t.as(home);
    mkdirSync(join(home, 'outbox'), { recursive: true });
    appendFileSync(outboxPath(), `${JSON.stringify({ id: 'ghost-1', op: 'comment', repo: 'me/wf-records', project: 'notes', slug: 'ghost', body: 'x' })}\n`);
    noteChange(t.root, 'add-tags');
    const gh = fakeGh();
    assert.deepEqual([flushOutbox({ run: gh.run }).left, flushOutbox({ run: gh.run }).left], [2, 2], 'two failures hold the queue');
    const third = flushOutbox({ run: gh.run });
    assert.deepEqual([third.sent, third.left, third.parked], [1, 0, 1]);
    const s = layerStatus(t.root);
    assert.deepEqual(s.parked.map((p) => [p.workflow, p.op]), [['notes/ghost', 'comment']]);
    assert.match(s.parked[0].error, /no issue yet/);
  } finally { t.done(); }
});

test('a sign-in failure or a rate limit parks nothing, stops the flush and puts the parked entries back', async () => {
  const { readParked, AUTH_ERROR } = await import('../../../lib/github-layer.mjs');
  assert.ok(AUTH_ERROR.test('gh issue edit 12: HTTP 401: Bad credentials'));
  assert.ok(AUTH_ERROR.test('To get started with GitHub CLI, please run:  gh auth login'));
  assert.ok(AUTH_ERROR.test('gh issue create: HTTP 403: API rate limit exceeded for user'));
  assert.ok(!AUTH_ERROR.test('gh issue edit 403: HTTP 422: Validation Failed'), 'an issue number is not a status');
  const t = setup();
  try {
    const home = machine(t.top, 'a');
    t.as(home);
    noteChange(t.root, 'add-tags');
    assert.equal(flushOutbox({ run: fakeGh().run }).sent, 1, 'the issue exists');
    appendFileSync(parkedPath(), `${JSON.stringify({ id: 'old-1', op: 'comment', repo: 'me/wf-records', project: 'notes', slug: 'add-tags', body: 'parked once', parkedAt: '2026-11-01T00:00:00Z', error: 'HTTP 422' })}\n`);
    noteAnswer(t.root, 'add-tags', { question: 'Which store?', answer: 'SQLite', by: 'person' });
    const signedOut = () => ({ status: 1, stdout: '', stderr: 'HTTP 401: Bad credentials (https://api.github.com/graphql)' });
    const waits = [];
    for (let i = 0; i < 4; i += 1) {
      const r = flushOutbox({ run: signedOut, wait: (ms) => waits.push(ms) });
      assert.deepEqual([r.sent, r.parked], [0, 0], `flush ${i + 1} parks nothing`);
      assert.match(r.error, /HTTP 401/);
    }
    assert.deepEqual(waits, [], 'a sign-in failure gets no network retry');
    assert.equal(readParked().length, 0, 'the parked entry is back in the queue');
    assert.deepEqual(readOutbox().map((e) => [e.op, e.body ?? null]), [['comment', 'parked once'], ['comment', readOutbox()[1].body]], 'the parked entry goes first');
    assert.equal(readOutbox()[0].parkedAt, undefined);
    const gh = fakeGh();
    const r = flushOutbox({ run: gh.run });
    assert.deepEqual([r.sent, r.left, r.error], [2, 0, null], 'the next pass sends them');
    assert.deepEqual(gh.verbs(), ['issue comment', 'issue comment']);
  } finally { t.done(); }
});

test('another failure parks the entry after three flushes, as before', () => {
  const t = setup();
  try {
    const home = machine(t.top, 'a');
    t.as(home);
    noteChange(t.root, 'add-tags');
    const bad = (cmd, args) => (args[0] === 'label' ? { status: 1, stdout: '', stderr: 'HTTP 422: Validation Failed' } : { status: 0, stdout: '', stderr: '' });
    const r = [1, 2, 3].map(() => flushOutbox({ run: bad, wait: () => {} }));
    assert.deepEqual(r.map((x) => [x.parked, x.requeued]), [[0, 0], [0, 0], [1, 0]]);
  } finally { t.done(); }
});

test('the import keeps two comments of one second and a comment of the person that starts with **note**', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    const at = '2026-10-25T10:00:00Z';
    const added = importComments(t.root, 'add-tags', [
      { createdAt: at, url: 'https://github.com/me/wf-records/issues/12#issuecomment-101', body: 'first', author: { login: 'jt' } },
      { createdAt: at, url: 'https://github.com/me/wf-records/issues/12#issuecomment-102', body: 'second', author: { login: 'jt' } },
      { createdAt: at, url: 'https://github.com/me/wf-records/issues/12#issuecomment-103', body: '**note** this is mine', author: { login: 'jt' } },
      { createdAt: at, url: 'https://github.com/me/wf-records/issues/12#issuecomment-104', body: `**Answer**: yes\n\n${LAYER_MARK}`, author: { login: 'jt' } },
    ]);
    assert.equal(added.length, 3);
    const inbox = readdirSync(join(t.dir('add-tags'), 'inbox')).sort();
    assert.deepEqual(inbox, ['20261025T100000Z-github-note-101.md', '20261025T100000Z-github-note-102.md', '20261025T100000Z-github-note-103.md']);
    assert.equal(importComments(t.root, 'add-tags', [{ createdAt: at, url: '#issuecomment-101', body: 'first' }]).length, 0, 'a second import adds nothing');
    // The answers that the layer writes carry the mark.
    noteAnswer(t.root, 'add-tags', { question: 'q', answer: 'a' });
    assert.ok(readFileSync(outboxPath(), 'utf8').includes(JSON.stringify(LAYER_MARK).slice(1, -1)));
  } finally { t.done(); }
});

test('a shipped workflow keeps its issue open; a closed one closes it', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    noteChange(t.root, 'add-tags');
    flushOutbox({ run: fakeGh().run });
    setFields(t.dir('add-tags'), '00-index.md', { status: 'shipped' });
    noteChange(t.root, 'add-tags');
    const shipped = fakeGh();
    flushOutbox({ run: shipped.run });
    assert.ok(!shipped.verbs().includes('issue close'));
    setFields(t.dir('add-tags'), '00-index.md', { status: 'closed' });
    noteChange(t.root, 'add-tags');
    const closed = fakeGh();
    flushOutbox({ run: closed.run });
    assert.ok(closed.verbs().includes('issue close'));
    assert.ok(existsSync(join(t.dir('add-tags'), 'layer.json')));
  } finally { t.done(); }
});

test('backfill queues every workflow again, also one that did not change', () => {
  const t = setup();
  try {
    t.as(machine(t.top, 'a'));
    noteChange(t.root, 'add-tags');
    noteChange(t.root, 'b');
    assert.equal(noteChange(t.root, 'add-tags').queued, false, 'no change, no entry');
    assert.deepEqual(backfill(t.root, ['add-tags', 'b']), ['add-tags', 'b']);
    assert.equal(readFileSync(outboxPath(), 'utf8').trim().split('\n').length, 4);
  } finally { t.done(); }
});
