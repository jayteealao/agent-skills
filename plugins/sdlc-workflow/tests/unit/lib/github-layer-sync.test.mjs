// The GitHub layer across machines: one issue per workflow on every machine, a failing entry
// that is parked so the rest go on, every comment of the person imported, and an issue that
// stays open through ship. A fake runner stands in for gh; nothing is written to GitHub.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAYER_MARK, backfill, flushOutbox, issueComments, layerStatus, noteAnswer, noteChange, outboxPath } from '../../../lib/github-layer.mjs';
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
