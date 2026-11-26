// What the eval of the wf tools found: several steps go in one call, help names the tool call and
// the fields of an operation, and a job of no workflow is waited for by its id.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';
import { readSteps } from '../../lib/steps.mjs';
import { callTool } from '../../mcp/tools.mjs';

function project(opts) {
  const top = mkdtempSync(join(tmpdir(), 'mcp-batch-'));
  const f = makeFixture(join(top, 'repo'), opts);
  return { ...f, done: () => rmSync(top, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

test('wf_step steps: several steps of a slice in one call, in order; the first failure stops it', async () => {
  const p = project({ suite: false });
  try {
    const ok = await callTool('wf_step', { slug: SLUG, slice: 's3', steps: [{ op: 'done', n: 3, sha: 'HEAD' }, { op: 'start', n: 4, title: 'Docs' }, { op: 'done', n: 4, 'no-change': true }] }, { root: p.root });
    assert.equal(ok.ok, true, JSON.stringify(ok.error));
    assert.equal(ok.data.length, 3);
    const rows = readSteps(p.dir).filter((r) => r.slice === 's3');
    assert.ok(rows.some((r) => r.event === 'done' && r.step === 4 && r.noChange), 'step 4 is done with no change');
    const bad = await callTool('wf_step', { slug: SLUG, slice: 's3', steps: [{ op: 'start', n: 5, title: 'Tests' }, { op: 'nosuch', n: 5 }, { op: 'start', n: 6 }] }, { root: p.root });
    assert.equal(bad.ok, false);
    assert.match(bad.error.message, /^step 2 of steps/);
    assert.equal(bad.done.length, 1, 'the step before the failure is kept');
    assert.ok(!readSteps(p.dir).some((r) => r.step === 6), 'no step runs after the failure');
  } finally { p.done(); }
});

test('wf_query help: the tool, the fields and the call of each operation that the words name', async () => {
  const p = project({ findings: false, suite: false });
  try {
    const one = await callTool('wf_query', { op: 'help', command: 'profile run' }, { root: p.root });
    assert.equal(one.ok, true, JSON.stringify(one.error));
    assert.deepEqual(one.calls, [{ op: 'profile run', tool: 'wf_job', required: ['suite'], optional: [], call: 'wf_job { "op": "profile run", "suite": "<suite>" }' }]);
    const step = await callTool('wf_query', { op: 'help', command: 'step' }, { root: p.root });
    const done = step.calls.find((c) => c.op === 'step done');
    assert.equal(done.tool, 'wf_step');
    assert.deepEqual(done.required, ['slug', 'slice', 'n']);
    assert.ok(done.optional.includes('no-change (true)'));
    assert.equal(typeof step.data, 'string', 'the CLI help is still there');
  } finally { p.done(); }
});

test('code mode: board.move takes the key of a new thread as `to` too', async () => {
  const p = project({ findings: false, suite: false });
  try {
    const r = await callTool('wf_run', { slug: SLUG, code: "wf.board.move(['i1', 'i2'], 'sync', { newThread: { name: 'Sync engine' } }); return wf.board.items({ thread: 'sync' }).map((i) => i.key);" }, { root: p.root });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.deepEqual(r.data, ['i1', 'i2']);
  } finally { p.done(); }
});

test('describe of one command is its help, with the calls', async () => {
  const p = project({ findings: false, suite: false });
  try {
    const r = await callTool('wf_query', { op: 'describe', command: 'slice drop' }, { root: p.root });
    assert.equal(r.ok, true, JSON.stringify(r.error));
    assert.equal(r.calls[0].tool, 'wf_run');
    assert.match(r.warnings[0], /describe takes no command/);
  } finally { p.done(); }
});

test('a job of no workflow points to its wait, and the wait gives its end', async () => {
  const p = project({ findings: false });
  try {
    const j = await callTool('wf_job', { op: 'profile run', suite: 'fast' }, { root: p.root });
    assert.equal(j.ok, true, JSON.stringify(j.error));
    assert.deepEqual(j.next[0].arguments, { for: 'job', job: j.data.job });
    assert.ok(!j.next.some((n) => n.arguments.op === 'talk wait'), 'no talk wait on the folder of the server');
    const w = await callTool('wf_wait', j.next[0].arguments, { root: p.root });
    assert.equal(w.ok, true, JSON.stringify(w.error));
    assert.equal(w.data.state, 'done');
    assert.equal(w.data.exit, 0);
    const none = await callTool('wf_wait', { for: 'job', job: 'J-nosuch' }, { root: p.root });
    assert.equal(none.ok, false);
  } finally { p.done(); }
});
