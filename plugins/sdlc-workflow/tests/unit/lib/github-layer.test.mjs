// The GitHub layer: the ordered outbox, one issue per workflow, the needs-me label and the
// answers as comments. A fake runner stands in for gh; nothing is written to GitHub.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { flushOutbox, issueBody, layerOf, layerStatus, noteAnswer, noteChange, readOutbox, statusBlock } from '../../../lib/github-layer.mjs';
import { setFields } from '../../../lib/records.mjs';

function setup({ machine = { records: { repo: 'me/wf-records', board: 3 } }, project = 'notes' } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'gh-layer-home-'));
  const root = mkdtempSync(join(tmpdir(), 'gh-layer-'));
  writeFileSync(join(home, 'config.json'), JSON.stringify(machine));
  mkdirSync(join(root, '.ai', 'workflows', 'add-tags'), { recursive: true });
  writeFileSync(join(root, '.ai', 'sdlc-config.json'), JSON.stringify(project ? { records: { project } } : {}));
  writeFileSync(join(root, '.ai', 'workflows', 'add-tags', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: add-tags\ntitle: Add tags\nstatus: active\ncurrent-stage: intake\nprogress:\n  intake: in-progress\n---\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const done = () => {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(home, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  };
  return { root, dir: join(root, '.ai', 'workflows', 'add-tags'), done };
}

/** A fake gh: issue create answers an issue URL; `fail` makes one verb fail. */
const fakeGh = ({ fail = null } = {}) => {
  const calls = [];
  const run = (cmd, args, { input } = {}) => {
    calls.push({ args, input });
    if (fail && args.slice(0, 2).join(' ') === fail) return { status: 1, stdout: '', stderr: 'offline' };
    if (args[0] === 'issue' && args[1] === 'create') return { status: 0, stdout: 'https://github.com/me/wf-records/issues/12', stderr: '' };
    return { status: 0, stdout: '', stderr: '' };
  };
  return { run, calls, verbs: () => calls.map((c) => c.args.slice(0, 2).join(' ')) };
};

test('the layer is off unless the machine names the repo and the project names itself', () => {
  const a = setup({ project: null });
  try { assert.equal(layerOf(a.root), null); assert.equal(noteChange(a.root, 'add-tags'), null); } finally { a.done(); }
  const b = setup({ machine: {} });
  try { assert.equal(layerOf(b.root), null); } finally { b.done(); }
  const c = setup();
  try { assert.deepEqual(layerOf(c.root), { repo: 'me/wf-records', owner: 'me', project: 'notes', board: 3 }); } finally { c.done(); }
});

test('one progress edit per change; the issue number is kept; the board gets the issue once', () => {
  const t = setup();
  try {
    assert.deepEqual(noteChange(t.root, 'add-tags'), { queued: true });
    assert.deepEqual(noteChange(t.root, 'add-tags'), { queued: false }, 'no change, no edit');
    const gh = fakeGh();
    assert.deepEqual(flushOutbox({ run: gh.run }), { sent: 1, left: 0, error: null, parked: 0 });
    assert.deepEqual(gh.verbs(), ['label create', 'label create', 'label create', 'issue list', 'issue create', 'project item-add']);
    assert.match(gh.calls[4].input, /```json\n\{\n {2}"schema": "wf-status\/1"/);

    setFields(t.dir, '00-index.md', { 'current-stage': 'shape', 'person-tasks': [{ id: 'x', task: 'Log in to GitHub' }] });
    noteChange(t.root, 'add-tags');
    const gh2 = fakeGh();
    flushOutbox({ run: gh2.run });
    assert.deepEqual(gh2.verbs(), ['issue edit', 'issue edit']);
    assert.deepEqual(gh2.calls[1].args.slice(-2), ['--add-label', 'needs-me']);
    assert.deepEqual(layerStatus(t.root).issues.map((i) => [i.workflow, i.number, i.needsMe]), [['notes/add-tags', 12, true]]);

    setFields(t.dir, '00-index.md', { status: 'closed', 'person-tasks': [] });
    noteChange(t.root, 'add-tags');
    const gh3 = fakeGh();
    flushOutbox({ run: gh3.run });
    assert.deepEqual(gh3.verbs(), ['issue edit', 'issue edit', 'issue close']);
  } finally { t.done(); }
});

test('a failed entry stops the flush and stays at the head, in order', () => {
  const t = setup();
  try {
    noteChange(t.root, 'add-tags');
    noteAnswer(t.root, 'add-tags', { question: 'Which tag store?', answer: 'SQLite', by: 'person' });
    assert.deepEqual(readOutbox().map((e) => e.op), ['sync', 'comment']);
    const off = fakeGh({ fail: 'issue create' });
    const r = flushOutbox({ run: off.run });
    assert.deepEqual([r.sent, r.left], [0, 2]);
    assert.match(layerStatus(t.root).error.message, /offline/);
    const on = fakeGh();
    assert.deepEqual(flushOutbox({ run: on.run }), { sent: 2, left: 0, error: null, parked: 0 });
    assert.deepEqual(on.verbs().slice(-2), ['project item-add', 'issue comment']);
    assert.match(on.calls.at(-1).input, /Which tag store\?\n\n> SQLite/);
    assert.equal(layerStatus(t.root).error, null);
  } finally { t.done(); }
});

test('the body lists what needs the person and ends with the status block', () => {
  const block = statusBlock('notes', 'a', { title: 'A', status: 'active', 'open-questions': ['Which store?'], progress: { intake: 'complete' } });
  const body = issueBody(block);
  assert.match(body, /## Needs me\n\nAnswer these in the session, not here\.\n\n- Which store\?/);
  assert.equal(JSON.parse(/```json\n([\s\S]+)\n```\n$/.exec(body)[1]).needsMe[0], 'Which store?');
});
