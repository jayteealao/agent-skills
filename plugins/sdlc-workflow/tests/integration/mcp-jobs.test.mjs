// The jobs of the MCP server: a job runs on after the process that started it ends; two starts of
// the same job at once make one job; a wf_job call starts a job, a wait sees its end, and the job
// verbs read and stop it.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jobFile, jobState, listJobs, readJob } from '../../lib/jobs.mjs';
import { pidAlive } from '../../lib/proc.mjs';
import { SERVER_JOBS, callTool } from '../../mcp/tools.mjs';

const JOBS = new URL('../../lib/jobs.mjs', import.meta.url).href;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-jobs-'));
  mkdirSync(join(root, '.ai', 'workflows', 'demo'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  return { root, done: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

/** Start a job from a separate node process, which exits as soon as the job has started. */
function startFrom(root, key, out, ms) {
  const code = `import { startJob } from ${JSON.stringify(JOBS)};
    const j = startJob(${JSON.stringify(root)}, 'demo', { argv: [process.execPath, '-e', ${JSON.stringify(`setTimeout(() => require('fs').writeFileSync(${JSON.stringify(out)}, process.env.WF_ACTOR + ' ' + (process.env.SECRET_OF_SERVER ?? 'none')), ${ms})`)}], env: { WF_ACTOR: 'implement:api' }, unset: ['SECRET_OF_SERVER'], key: ${JSON.stringify(key)}, by: 'implement:api', name: 'sleep' });
    console.log(JSON.stringify({ id: j.id, existing: Boolean(j.existing) }));`;
  return new Promise((done) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, SECRET_OF_SERVER: 'x' }, stdio: ['ignore', 'pipe', 'inherit'] });
    let s = '';
    child.stdout.on('data', (d) => { s += d; });
    child.on('close', () => done(JSON.parse(s.trim())));
  });
}

const until = async (fn, ms = 30_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (fn()) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
};

test('a job runs on after its starter exits, with the env it names and no other', async () => {
  const p = project();
  try {
    const out = join(p.root, 'out.txt');
    const r = await startFrom(p.root, 'k1', out, 1500);
    assert.ok(r.id);
    assert.equal(existsSync(out), false, 'the starter returned before the command ended');
    assert.ok(await until(() => existsSync(out)), 'the command ended after its starter');
    assert.equal(readFileSync(out, 'utf8'), 'implement:api none');
    assert.ok(await until(() => jobState(p.root, 'demo', r.id).state === 'done'));
    assert.equal(jobState(p.root, 'demo', r.id).exit, 0);
    const rec = JSON.parse(readFileSync(join(p.root, '.ai', 'run', 'demo', 'jobs', `${r.id}.json`), 'utf8'));
    assert.deepEqual(rec.env, { WF_ACTOR: 'implement:api' }, 'the record holds only the named env');
  } finally { p.done(); }
});

test('two starts of one job at once make one job, and the key is free after its end', async () => {
  const p = project();
  try {
    const out = join(p.root, 'out.txt');
    const both = await Promise.all([startFrom(p.root, 'same', out, 3000), startFrom(p.root, 'same', out, 3000)]);
    const ids = new Set(both.map((b) => b.id).filter(Boolean));
    assert.equal(ids.size, 1, JSON.stringify(both));
    assert.equal(both.filter((b) => b.existing).length, 1);
    assert.equal(listJobs(p.root, 'demo').length, 1);
    const [id] = ids;
    assert.ok(await until(() => jobState(p.root, 'demo', id).state === 'done'));
    const again = await startFrom(p.root, 'same', out, 10);
    assert.equal(again.existing, false, 'a key whose job ended is free');
    assert.notEqual(again.id, id);
    assert.ok(await until(() => jobState(p.root, 'demo', again.id).state === 'done'));
  } finally { p.done(); }
});

test('a wait keeps no state: its next call carries the cursor, and each message comes once', async () => {
  const p = project();
  const me = { root: p.root, caller: 'verify:api' };
  try {
    const first = await callTool('wf_wait', { op: 'talk wait', slug: 'demo', as: 'verify:api', seconds: 1 }, me);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.data.state, 'waiting');
    const again = first.next[0];
    assert.equal(again.tool, 'wf_wait');
    assert.equal(again.arguments.after, first.data.cursor);
    // A message arrives while nobody waits: the next call (after a compaction, from the result alone) gets it.
    const post = await callTool('wf_run', { op: 'talk post', slug: 'demo', as: 'driver', to: 'verify:api', text: 'the base moved' }, { root: p.root, caller: 'driver' });
    assert.equal(post.ok, true, JSON.stringify(post));
    const second = await callTool('wf_wait', again.arguments, me);
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.data.messages.length, 1);
    assert.match(second.data.messages[0].text, /the base moved/);
    const third = await callTool('wf_wait', { ...again.arguments, after: second.data.cursor, seconds: 1 }, me);
    assert.equal(third.data.state, 'waiting');
    assert.equal(third.data.messages.length, 0, 'a message that was read does not come again');
    // A watch reads once; a long wait is held under the limit of a call.
    const watch = await callTool('wf_wait', { op: 'progress watch', slug: 'demo' }, me);
    assert.equal(watch.ok, true, JSON.stringify(watch));
  } finally { p.done(); }
});

test('wf_job starts an operation as a job; the wait, status, logs and list read it; stop ends it', async () => {
  const p = project();
  const ctx = { root: p.root, caller: 'verify:api' };
  try {
    // goal status of a workflow with no goal ends at once with a JSON answer.
    const s = await callTool('wf_job', { op: 'goal status', slug: 'demo' }, ctx);
    // goal status is a read: it runs as a job only from wf_job, which refuses it.
    assert.equal(s.ok, false);
    assert.match(s.error.message, /belongs to wf_query/);

    const r = await callTool('wf_job', { op: 'goal check', slug: 'demo' }, ctx);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.match(r.data.job, /^J-/);
    const wait = r.next.find((n) => n.tool === 'wf_wait');
    assert.deepEqual(wait.arguments, { op: 'talk wait', slug: 'demo', as: 'verify:api', job: r.data.job });
    const w = await callTool('wf_wait', { ...wait.arguments, seconds: '60' }, ctx);
    assert.equal(w.ok, true, JSON.stringify(w));
    const st = await callTool('wf_job', { op: 'status', slug: 'demo', job: r.data.job }, ctx);
    assert.equal(st.data.state, 'done');
    assert.equal(typeof st.data.exit, 'number');
    const logs = await callTool('wf_job', { op: 'logs', slug: 'demo', job: r.data.job }, ctx);
    assert.ok(logs.data.size > 0, 'the output of the operation is in the log');
    const list = await callTool('wf_job', { op: 'list', slug: 'demo' }, ctx);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].op, 'goal check');

    // A job of no workflow goes with the jobs of the server; stop ends a running one.
    const long = await callTool('wf_job', { op: 'optimize metric-check', slug: 'demo', cmd: 'node -e "setTimeout(() => {}, 60000)"' }, ctx);
    assert.equal(long.ok, true, JSON.stringify(long));
    const twice = await callTool('wf_job', { op: 'optimize metric-check', slug: 'demo', cmd: 'node -e "setTimeout(() => {}, 60000)"' }, ctx);
    assert.equal(twice.data.job, long.data.job, 'the same call while it runs is that job');
    assert.equal(twice.data.existing, true);
    const stop = await callTool('wf_job', { op: 'stop', slug: 'demo', job: long.data.job }, ctx);
    assert.equal(stop.data.state, 'done');
    assert.equal(stop.data.stopped, true);
    // The stop came before the runner wrote its process: the runner sees the stop mark and ends.
    const ended = () => { const rec = readJob(jobFile(p.root, 'demo', long.data.job)); return Number.isInteger(rec.runnerPid) && !pidAlive(rec.runnerPid) && !pidAlive(rec.childPid); };
    assert.ok(await until(ended, 20_000), 'the processes of a stopped job end');
    assert.equal(readJob(jobFile(p.root, 'demo', long.data.job)).state, 'done', 'the runner keeps the end of the stop');
    assert.equal(SERVER_JOBS, 'mcp-jobs');
  } finally { p.done(); }
});

test('a wait for the run ends at the next journal line, message or job end, each once', async () => {
  const { appendFileSync } = await import('node:fs');
  const p = project();
  const me = { root: p.root, caller: 'verify:api' };
  const journal = join(p.root, '.ai', 'workflows', 'demo', '.driver-journal.jsonl');
  try {
    appendFileSync(journal, `${JSON.stringify({ run: 'r1', seq: 1, event: 'agent-start' })}\n`);
    // With no cursor the wait starts now: a line written before it is not news.
    const first = await callTool('wf_wait', { for: 'run', slug: 'demo', seconds: 1 }, me);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.data.state, 'waiting');
    const c0 = first.next[0].arguments.cursor;
    // Two lines and half of a third land while nobody waits.
    appendFileSync(journal, `${JSON.stringify({ run: 'r1', seq: 2, event: 'agent-end' })}\n${JSON.stringify({ run: 'r1', seq: 3, event: 'stage-start' })}\n{"run":"r1","se`);
    await callTool('wf_run', { op: 'talk post', slug: 'demo', as: 'driver', to: 'verify:api', text: 'look at the base' }, { root: p.root, caller: 'driver' });
    const second = await callTool('wf_wait', first.next[0].arguments, me);
    assert.equal(second.data.state, 'events');
    assert.deepEqual(second.data.events.filter((e) => e.kind === 'run').map((e) => e.seq), [2, 3], 'the torn line waits for its end');
    assert.equal(second.data.events.filter((e) => e.kind === 'message').length, 1);
    appendFileSync(journal, `q":4,"event":"run-end"}\n`);
    const third = await callTool('wf_wait', { ...second.next[0].arguments, seconds: 2 }, me);
    assert.deepEqual(third.data.events.map((e) => e.seq), [4], 'each line comes once');
    assert.notEqual(third.next[0].arguments.cursor, c0);
  } finally { p.done(); }
});

test('a client with Tasks gets a job as a Task, read from disk; a cancel ends the Task, not the job', async () => {
  const { handle, TASKS } = await import('../../mcp/server.mjs');
  const p = project();
  const saved = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = p.root;
  const modern = (caps) => ({ 'io.modelcontextprotocol/protocolVersion': '2026-07-28', ...(caps ? { 'io.modelcontextprotocol/clientCapabilities': { extensions: { [TASKS]: {} } } } : {}) });
  let id = 0;
  const rpc = async (method, params, caps = true) => (await handle({ jsonrpc: '2.0', id: ++id, method, params: { ...params, _meta: modern(caps) } })).result;
  try {
    const d = await rpc('server/discover', {});
    assert.ok(d.capabilities.extensions[TASKS]);
    const t = await rpc('tools/call', { name: 'wf_job', arguments: { op: 'goal check', slug: 'demo' } });
    assert.equal(t.resultType, 'task');
    assert.match(t.taskId, /^job~demo~J-/);
    assert.ok(['working', 'completed'].includes(t.status));
    let g;
    const end = Date.now() + 30_000;
    do { g = await rpc('tasks/get', { taskId: t.taskId }); if (g.status === 'completed') break; await new Promise((r) => setTimeout(r, 300)); } while (Date.now() < end);
    assert.equal(g.status, 'completed');
    assert.equal(g.result.structuredContent.data.op, 'goal check');

    // A cancel ends the Task; the job runs on until wf_job stop.
    const long = await rpc('tools/call', { name: 'wf_job', arguments: { op: 'optimize metric-check', slug: 'demo', cmd: 'node -e "setTimeout(() => {}, 60000)"' } });
    await rpc('tasks/cancel', { taskId: long.taskId });
    assert.equal((await rpc('tasks/get', { taskId: long.taskId })).status, 'cancelled');
    const job = long.taskId.split('~')[2];
    assert.equal(jobState(p.root, 'demo', job).state, 'running');
    const stop = await rpc('tools/call', { name: 'wf_job', arguments: { op: 'stop', slug: 'demo', job } });
    assert.equal(stop.structuredContent.data.stopped, true);
    assert.ok(await until(() => { const r = readJob(jobFile(p.root, 'demo', job)); return Number.isInteger(r.runnerPid) && !pidAlive(r.runnerPid); }, 20_000));

    // A run wait as a Task: working until an event, then completed with the next call.
    const w = await rpc('tools/call', { name: 'wf_wait', arguments: { for: 'run', slug: 'demo' } });
    assert.equal(w.status, 'working');
    const { appendFileSync } = await import('node:fs');
    appendFileSync(join(p.root, '.ai', 'workflows', 'demo', '.driver-journal.jsonl'), `${JSON.stringify({ run: 'r', seq: 1, event: 'run-end' })}\n`);
    const w2 = await rpc('tasks/get', { taskId: w.taskId });
    assert.equal(w2.status, 'completed');
    assert.equal(w2.result.structuredContent.data.events[0].event, 'run-end');

    // A client with no Tasks gets the answer of the call.
    const plain = await rpc('tools/call', { name: 'wf_job', arguments: { op: 'goal check', slug: 'demo', wait: true } }, false);
    assert.equal(plain.resultType, 'complete');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_PROJECT_DIR; else process.env.CLAUDE_PROJECT_DIR = saved;
    p.done();
  }
});
