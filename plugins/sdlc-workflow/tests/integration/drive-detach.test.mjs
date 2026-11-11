// A driver run on Codex that leaves the session free: the detached start, the watch that
// queues its news for the session, the activity of a driven agent, and the live view.
// A stand-in for the codex CLI records each call, so no test starts Codex.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  codexEnv, createDriveActivity, driveRunsDir, newestRun, pendingCommandOf, queueMessage, readRunInfo, runAgents, runView,
  runViewLines, safeLabel, sandboxProblem, sessionThread, startDetached, watchMessage,
} from '../../lib/drive-detach.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WATCH = path.join(pluginRoot, 'scripts', 'yolo-watch.mjs');
const WF = path.join(pluginRoot, 'scripts', 'wf.mjs');
const W = await import(new URL('../../scripts/yolo-watch.mjs', import.meta.url));

const SLUG = 'demo';
const RUN = '20261110T100000Z-demo';
const THREAD = '01a1c74c-0000-7000-8000-000000000001';

const tmp = (name) => mkdtempSync(path.join(os.tmpdir(), `${name} `));
const drop = (dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });

/** A project with one workflow and an empty driver journal. */
function project() {
  const root = tmp('drive detach');
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(path.join(root, 'a.txt'), 'a\n');
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'base']);
  mkdirSync(path.join(root, '.ai', 'workflows', SLUG), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'workflows', SLUG, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${SLUG}\nstatus: in-progress\n---\n`);
  writeFileSync(W.journalPath(root, SLUG), '');
  return root;
}

/** A stand-in for codex.js: it appends its argv to a log, and exits with SDLC_FAKE_EXIT. */
function fakeCodex(dir) {
  const file = path.join(dir, 'fake-codex.mjs');
  const log = path.join(dir, 'codex-calls.jsonl');
  writeFileSync(file, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), thread: process.env.CODEX_THREAD_ID ?? null, sandbox: process.env.CODEX_SANDBOX_NETWORK_DISABLED ?? null }) + '\\n');\nif (process.argv[2] === 'queue') console.log('Queued message x.');\nprocess.exit(Number(process.env.SDLC_FAKE_EXIT || 0));\n`);
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  return { file, calls };
}

test('the session of a command, and the env of a codex call that leaves the session marks out', () => {
  assert.equal(sessionThread({ CODEX_THREAD_ID: 'a', CODEX_SESSION_ID: 'b' }), 'a');
  assert.equal(sessionThread({ CODEX_SESSION_ID: 'b' }), 'b');
  assert.equal(sessionThread({}), null);
  const env = codexEnv({ PATH: 'p', CODEX_HOME: 'h', CODEX_THREAD_ID: 't', CODEX_SESSION_ID: 's', CODEX_CI: '1', CODEX_SANDBOX_NETWORK_DISABLED: '1', CODEX_VERSION: '0.160.0' }, { X: '1' });
  assert.deepEqual(env, { PATH: 'p', CODEX_HOME: 'h', CODEX_VERSION: '0.160.0', X: '1' });
});

test('sandboxProblem: a Codex home that takes a write is no problem, and a missing one is no sandbox', () => {
  const home = tmp('codex home');
  try {
    assert.equal(sandboxProblem({ CODEX_HOME: home }), null);
    assert.equal(sandboxProblem({ CODEX_HOME: path.join(home, 'none') }), null);
    // A file where the home should be: no write lands in it, as in the sandbox.
    const blocked = path.join(home, 'blocked');
    writeFileSync(blocked, '');
    assert.match(sandboxProblem({ CODEX_HOME: blocked }), /cannot write the Codex home .*inside the sandbox/);
  } finally { drop(home); }
});

test('queueMessage calls codex queue with the thread and the text as one argument each', () => {
  const calls = [];
  const run = (cmd, args, opts) => { calls.push({ cmd, args, env: opts.env }); return { status: 0, stdout: 'Queued', stderr: '' }; };
  const text = 'two words\nand "quotes"';
  assert.deepEqual(queueMessage(THREAD, text, { entry: { cmd: 'node', pre: ['codex.js'] }, env: { CODEX_THREAD_ID: 'x', A: '1' }, run }), { ok: true });
  assert.deepEqual(calls[0].args, ['codex.js', 'queue', '--thread', THREAD, '--message', text]);
  assert.deepEqual(calls[0].env, { A: '1' });
  const bad = queueMessage(THREAD, 'x', { entry: { cmd: 'node', pre: [] }, run: () => ({ status: 1, stdout: '', stderr: 'warn\nError: no such thread\n' }) });
  assert.deepEqual(bad, { ok: false, reason: 'warn Error: no such thread' });
  assert.equal(queueMessage(THREAD, 'x', { entry: null }).ok, false);
});

test('a watch message says that a script wrote it, holds each event as JSON, and names the outcome at the run end', () => {
  const events = [{ event: 'stage-end', slug: SLUG, stage: 'plan' }, { event: 'run-end', slug: SLUG }];
  const text = watchMessage(events, { slug: SLUG, pluginRoot: '/p', projectRoot: '/r', resultFile: '/r/result.json' });
  const lines = text.split('\n');
  assert.match(lines[0], /^\[sdlc-workflow watch\] This message was written by the watch script of the yolo run of demo\. The person did not write it\./);
  assert.match(lines[1], /_commentary\.md/);
  assert.deepEqual(lines.slice(2, 4).map((l) => JSON.parse(l)), events);
  assert.match(lines[4], /The run ended\. Its outcome is in "\/r\/result\.json"/);
  assert.equal(watchMessage([events[0]], { slug: SLUG, pluginRoot: '/p', projectRoot: '/r' }).split('\n').length, 3);
});

test('the activity of a driven agent is its events file, and a command with no end waits', () => {
  const root = tmp('drive activity');
  try {
    const dir = path.join(driveRunsDir(root), RUN);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `a003-${safeLabel('implement:api')}.events.jsonl`);
    const ev = (o) => `${JSON.stringify(o)}\n`;
    writeFileSync(file, ev({ type: 'thread.started', thread_id: 't' })
      + ev({ type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'npm test' } })
      + ev({ type: 'item.completed', item: { id: 'i1', type: 'command_execution', command: 'npm test', exit_code: 0 } })
      + ev({ type: 'item.completed', item: { id: 'i2', type: 'agent_message', text: 'next' } })
      + ev({ type: 'item.started', item: { id: 'i3', type: 'command_execution', command: 'npm run build' } }));
    const t = Date.parse('2026-11-10T10:30:00Z');
    utimesSync(file, t / 1000, t / 1000);
    const find = createDriveActivity({ runsDir: driveRunsDir(root), now: () => t + 1000 });
    assert.equal(find('implement:api', t - 5 * 60_000), t);
    assert.equal(find.fileOf('implement:api', t - 5 * 60_000), file);
    assert.equal(find('implement:api', t + 10 * 60_000), null, 'a file older than the start of the agent is another agent');
    assert.equal(find('verify:api', t), null);
    assert.equal(find.pendingOf('implement:api', t).tool, 'npm run build');
    assert.equal(pendingCommandOf(path.join(dir, 'none.jsonl')), null);
    appendFileSync(file, ev({ type: 'item.completed', item: { id: 'i3', type: 'command_execution', command: 'npm run build', exit_code: 0 } }));
    assert.equal(pendingCommandOf(file), null);
  } finally { drop(root); }
});

test('the watcher calls a silent Codex agent that sits in a command waiting, not hung', () => {
  const root = project();
  try {
    const T0 = Date.parse('2026-11-10T10:00:00Z');
    const at = (min) => new Date(T0 + min * 60_000).toISOString();
    // The lines of a journal that are older than the watch are history: the watch starts first.
    let clock = T0;
    const w = W.createWatcher({ projectRoot: root, slugs: [SLUG], now: () => clock, projectsDir: path.join(root, 'no-claude') });
    appendFileSync(W.journalPath(root, SLUG), `${JSON.stringify({ run: RUN, at: at(1), seq: 1, event: 'agent-start', agent: 'implement:api', phase: 'Drive', stage: 'implement', slice: 'api' })}\n`);
    const dir = path.join(driveRunsDir(root), RUN);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'a001-implement_api.events.jsonl');
    writeFileSync(file, `${JSON.stringify({ type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'gradlew test' } })}\n`);
    utimesSync(file, (T0 + 2 * 60_000) / 1000, (T0 + 2 * 60_000) / 1000);
    clock = T0 + 3 * 60_000;
    assert.deepEqual(w.pollJournals().map((e) => e.event), ['stage-start']);
    clock = T0 + 40 * 60_000;
    const stale = w.pollJournals().find((e) => e.event === 'stale');
    assert.ok(stale, 'a silent agent gives a stale event');
    assert.deepEqual([stale.signal, stale.tool], ['pending-tool', 'gradlew test']);
  } finally { drop(root); }
});

test('the queue sender holds a commit until news comes, sends one message, and keeps its events when the send fails', () => {
  const root = project();
  try {
    const sent = [];
    let ok = true;
    const q = W.createQueueSender({ thread: THREAD, slugs: [SLUG], root, log: () => {}, send: (thread, text) => { if (ok) sent.push({ thread, text }); return ok ? { ok: true } : { ok: false, reason: 'down' }; } });
    assert.deepEqual(q.push([{ event: 'commit', slug: SLUG, sha: 'abc' }, { event: 'look-in', slug: SLUG, quiet: true }]), { sent: 0 });
    assert.equal(q.held(), 1, 'a quiet event is not held');
    ok = false;
    assert.deepEqual(q.push([{ event: 'stage-end', slug: SLUG, stage: 'plan' }]), { sent: 0, reason: 'down' });
    assert.equal(q.held(), 2);
    ok = true;
    assert.deepEqual(q.push([]), { sent: 2 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].thread, THREAD);
    assert.deepEqual(sent[0].text.split('\n').slice(2).map((l) => JSON.parse(l).event), ['commit', 'stage-end']);
    assert.equal(q.held(), 0);
  } finally { drop(root); }
});

test('the watch process queues the news of a run for the session and ends at the run end', async () => {
  const root = project();
  const fake = fakeCodex(root);
  try {
    const row = (o) => `${JSON.stringify({ run: RUN, at: new Date().toISOString(), ...o })}\n`;
    // The lines of a journal that are older than the watch are history: the run writes after the watch starts.
    const child = spawn(process.execPath, [WATCH, root, SLUG, '--queue', THREAD], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SDLC_CODEX_ENTRY: fake.file, SDLC_WATCH_JOURNAL_MS: '200', SDLC_WATCH_LOCK_DIR: path.join(root, 'locks'), CODEX_THREAD_ID: 'outer', CODEX_SANDBOX_NETWORK_DISABLED: '1' },
    });
    const r = { stdout: '', stderr: '', status: null };
    child.stdout.on('data', (d) => { r.stdout += d; });
    child.stderr.on('data', (d) => { r.stderr += d; });
    const ended = new Promise((res) => { child.on('exit', (code) => { r.status = code; res(); }); });
    const kill = setTimeout(() => child.kill(), 45_000);
    await new Promise((res) => { setTimeout(res, 2500); });
    appendFileSync(W.journalPath(root, SLUG),
      row({ seq: 1, event: 'agent-start', agent: 'plan:api', phase: 'Drive', stage: 'plan', slice: 'api' })
      + row({ seq: 1, event: 'agent-end', agent: 'plan:api', status: 'complete' })
      + row({ seq: 2, event: 'run-end', agent: 'driver', stoppedAt: null }));
    await ended;
    clearTimeout(kill);
    assert.equal(r.status, 0, r.stderr);
    const printed = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l).event);
    assert.ok(printed.includes('run-end'), `the events still print: ${printed}`);
    const calls = fake.calls();
    assert.equal(calls.length, 1, 'one poll with news is one message');
    assert.deepEqual(calls[0].argv.slice(0, 4), ['queue', '--thread', THREAD, '--message']);
    assert.deepEqual([calls[0].thread, calls[0].sandbox], [null, null], 'the codex call carries no mark of the session');
    const body = calls[0].argv[4].split('\n');
    assert.match(body[0], /^\[sdlc-workflow watch\]/);
    assert.deepEqual(body.slice(2, -1).map((l) => JSON.parse(l).event), ['stage-start', 'stage-end', 'run-end']);
    assert.match(body.at(-1), /^The run ended\./);
  } finally { drop(root); }
});

test('startDetached starts the driver and the watch, and writes the record of the run', () => {
  const root = project();
  try {
    const started = [];
    const start = (cmd, argv, opts) => { started.push({ cmd, argv, opts }); return { pid: 1000 + started.length, unref() {} }; };
    const r = startDetached({
      projectRoot: root, slug: SLUG, run: RUN, driveArgv: ['wf.mjs', 'drive'], watchArgv: ['yolo-watch.mjs'], thread: THREAD, start,
      env: { PATH: 'p', CODEX_THREAD_ID: THREAD, CODEX_SANDBOX_NETWORK_DISABLED: '1' }, now: () => new Date('2026-11-10T10:00:00Z'),
    });
    assert.deepEqual([r.pid, r.watchPid, r.thread, r.run], [1001, 1002, THREAD, RUN]);
    assert.deepEqual(started.map((s) => [s.cmd, s.argv, s.opts.detached, s.opts.cwd]), [[process.execPath, ['wf.mjs', 'drive'], true, root], [process.execPath, ['yolo-watch.mjs', '--driver-pid', '1001'], true, root]]);
    assert.deepEqual(started[0].opts.env, { PATH: 'p' });
    assert.deepEqual(readRunInfo(r.runDir), { run: RUN, slug: SLUG, pid: 1001, watchPid: 1002, thread: THREAD, startedAt: '2026-11-10T10:00:00.000Z' });
    assert.equal(newestRun(root, SLUG), RUN);
    assert.equal(newestRun(root, 'other'), null);
    const none = startDetached({ projectRoot: root, slug: SLUG, run: `2${RUN}`, driveArgv: ['x'], start, env: {} });
    assert.equal(none.watchPid, null);
  } finally { drop(root); }
});

test('the view of a run lists its running, failed and ended agents, and the last commentary lines', () => {
  const root = project();
  try {
    const dir = path.join(driveRunsDir(root), RUN);
    mkdirSync(dir, { recursive: true });
    const now = Date.parse('2026-11-10T11:00:00Z');
    const stamp = (file, min) => utimesSync(file, (now - min * 60_000) / 1000, (now - min * 60_000) / 1000);
    const agent = (n, label, startedMin, lastMin, events = '') => {
      const base = path.join(dir, `a${String(n).padStart(3, '0')}-${safeLabel(label)}`);
      writeFileSync(`${base}.prompt.txt`, 'p'); stamp(`${base}.prompt.txt`, startedMin);
      writeFileSync(`${base}.events.jsonl`, events); stamp(`${base}.events.jsonl`, lastMin);
    };
    agent(1, 'orient', 50, 48);
    agent(2, 'plan:api', 47, 30);
    agent(3, 'implement:api', 29, 4, `${JSON.stringify({ type: 'item.started', item: { id: 'i1', type: 'command_execution', command: 'npm test' } })}\n`);
    writeFileSync(path.join(dir, 'drive.jsonl'), `${JSON.stringify({ n: 1, label: 'orient', ok: true })}\n${JSON.stringify({ n: 2, label: 'plan:api', ok: false, why: 'time box' })}\n`);
    writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ run: RUN, slug: SLUG, pid: 4242, watchPid: 4243, thread: THREAD, startedAt: '2026-11-10T10:10:00.000Z' }));
    const rows = runAgents(dir, { now });
    assert.deepEqual(rows.map((a) => [a.n, a.label, a.state]), [[1, 'orient', 'done'], [2, 'plan:api', 'failed'], [3, 'implement_api', 'running']]);
    assert.deepEqual([rows[2].minutes, rows[2].quietMinutes, rows[2].waitsOn], [29, 4, 'npm test']);
    const notes = path.join(root, 'commentary.md');
    writeFileSync(notes, '# Commentary\n\n- 10:11 plan api started\n- 10:30 plan api failed\n');
    const v = runView(root, SLUG, { commentaryFile: notes, now, alive: (pid) => pid === 4242 });
    assert.deepEqual([v.run, v.driver.alive, v.watch.alive, v.ended, v.notes.length], [RUN, true, false, false, 2]);
    const lines = runViewLines(v, 'running implement api');
    assert.equal(lines[0], 'running implement api');
    assert.match(lines[1], /^run 20261110T100000Z-demo: running \(pid 4242\); watch ended, news goes to session /);
    assert.equal(lines[2], 'agents: 3 started, 1 running, 1 failed');
    assert.match(lines[3], /running {2}implement_api {2}29 min, quiet 4 min, in: npm test/);
    assert.match(lines[4], /failed {3}plan:api {2}\(time box\)/);
    writeFileSync(path.join(dir, 'result.json'), '{}');
    assert.match(runViewLines(runView(root, SLUG, { now, alive: () => false }), 'done')[1], /: ended;/);
    assert.match(runViewLines(runView(root, 'other', {}), 'no progress record')[1], /^no driver run of this workflow/);
  } finally { drop(root); }
});

test('wf.mjs: progress watch --once prints the view, and drive refuses inside the sandbox before any agent starts', () => {
  const root = project();
  const home = tmp('sandboxed home');
  try {
    const view = spawnSync(process.execPath, [WF, 'progress', 'watch', root, SLUG, '--once'], { encoding: 'utf8' });
    assert.equal(view.status, 0, view.stderr);
    assert.match(view.stdout, /no progress record\nno driver run of this workflow/);
    // A file where the Codex home should be: no write lands in it, as in the sandbox.
    const blocked = path.join(home, 'codex');
    writeFileSync(blocked, '');
    const env = { ...process.env, CODEX_HOME: blocked };
    delete env.SDLC_CODEX_ENTRY;
    const r = spawnSync(process.execPath, [WF, 'drive', root, SLUG, '--detach'], { encoding: 'utf8', env });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /drive: this command cannot write the Codex home/);
    assert.match(r.stderr, /fix\.who: person/);
    assert.equal(existsSync(driveRunsDir(root)), false, 'no run folder was made');
  } finally { drop(root); drop(home); }
});

test('a watch whose driver process is gone gives one inferred run end, queues it, and exits', () => {
  const root = project();
  const fake = fakeCodex(root);
  try {
    // A process that has ended: its pid names no live process.
    const gone = spawnSync(process.execPath, ['-e', '']).pid;
    const r = spawnSync(process.execPath, [WATCH, root, SLUG, '--queue', THREAD, '--driver-pid', String(gone)], {
      encoding: 'utf8', timeout: 45_000,
      env: { ...process.env, SDLC_CODEX_ENTRY: fake.file, SDLC_WATCH_JOURNAL_MS: '200', SDLC_WATCH_LOCK_DIR: path.join(root, 'locks') },
    });
    assert.equal(r.status, 0, r.stderr);
    const events = r.stdout.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.deepEqual(events.map((e) => [e.event, e.inferred, e.stoppedAt]), [['run-end', true, 'driver']]);
    const calls = fake.calls();
    assert.equal(calls.length, 1);
    assert.match(calls[0].argv[4], /the driver process is gone, and it wrote no end of the run/);
  } finally { drop(root); }
});
