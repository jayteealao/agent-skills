// The talk of a run with real processes: a long command as a job that keeps a claim, a wait that a
// message of another agent ends, and a question wait that a message ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-talk-jobs-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const cli = (...args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', timeout: 60_000 });
  const talk = (verb, ...args) => cli('talk', verb, root, 'demo', ...args);
  return {
    root, dir, cli, talk,
    done: () => { talk('jobs', '--stop'); rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); },
  };
}
const sleepJs = (ms, code = 0) => `setTimeout(()=>process.exit(${code}),${ms})`;
const jobId = (out) => /J-[0-9TZ]+-[0-9a-f]+/.exec(out)?.[0] ?? null;

test('a job keeps the claim of its starter while it runs, gives it back at its end, and the wait prints the exit', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), JSON.stringify({ resources: [{ key: 'box', about: 'the one test machine' }] }));
    assert.match(f.talk('resources').stdout, /^box — the one test machine: free/);
    let r = f.talk('job', '--as', 'verify:api', '--claim', 'box', '--', process.execPath, '-e', sleepJs(200));
    assert.match(r.stderr, /verify:api does not hold box/, 'a job cannot keep a claim that its starter does not hold');
    r = f.talk('wait', '--as', 'verify:api', '--claim', 'box', '--seconds', '5');
    assert.match(r.stdout, /^you hold box until \d\d:\d\d \(epoch 1\)/, r.stdout + r.stderr);
    assert.equal(f.talk('claim', 'box', '--as', 'implement:web').status, 1, 'the second agent does not get it');
    r = f.talk('job', '--as', 'verify:api', '--name', 'end-run', '--claim', 'box', '--', process.execPath, '-e', `console.log('ran');${sleepJs(1500, 3)}`);
    assert.equal(r.status, 0, r.stderr);
    const id = jobId(r.stdout);
    assert.ok(id, r.stdout);
    assert.match(f.talk('resources').stdout, /box — the one test machine: held by verify:api@demo until .*; waiting: implement:web@demo/);
    // The resource belongs to the project: an agent of another workflow sees the same holder and does not get it.
    mkdirSync(path.join(f.root, '.ai', 'workflows', 'other'), { recursive: true });
    const other = f.cli('talk', 'claim', f.root, 'other', 'box', '--as', 'verify:api');
    assert.equal(other.status, 1, 'the same agent name in another workflow is another holder');
    assert.match(other.stdout, /box is held by verify:api@demo/);
    r = f.talk('wait', '--as', 'verify:api', '--job', id, '--seconds', '30');
    assert.match(r.stdout, new RegExp(`^the job ${id} ended: exit 3\\. Output: `), r.stdout + r.stderr);
    assert.match(r.stdout, /--- the end of the output ---\nran/);
    // The runner gave the resource back: the agent that waited takes it.
    assert.match(f.talk('wait', '--as', 'implement:web', '--claim', 'box', '--seconds', '10').stdout, /^you hold box until .* \(epoch 2\)/);
    assert.match(f.talk('jobs').stdout, new RegExp(`^${id} end-run by verify:api: exit 3`));
    assert.match(f.talk('list').stdout, /resources:\n {2}box: held by implement:web@demo/);
  } finally { f.done(); }
});

test('a message of another agent ends the wait for a job at once, and an agent stops only its own jobs', async () => {
  const f = fixture();
  try {
    const id = jobId(f.talk('job', '--as', 'verify:api', '--name', 'long', '--', process.execPath, '-e', sleepJs(60_000)).stdout);
    const other = jobId(f.talk('job', '--as', 'implement:web', '--name', 'other', '--', process.execPath, '-e', sleepJs(60_000)).stdout);
    assert.ok(id && other);
    const started = Date.now();
    const waiting = spawn(process.execPath, [wf, 'talk', 'wait', f.root, 'demo', '--as', 'verify:api', '--job', id, '--seconds', '40'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    waiting.stdout.on('data', (d) => { out += d; });
    const ended = new Promise((res) => waiting.on('exit', res));
    await new Promise((res) => setTimeout(res, 1500));
    f.talk('post', '--as', 'implement:web', '--to', 'verify:api', '--wants-reply', '--fallback', 'go on with the step', '--text', 'I am about to regenerate. Are more fixes coming?');
    await ended;
    assert.ok(Date.now() - started < 20_000, 'the wait ended on the message, not on its time');
    assert.match(out, /^message: T-1 .* implement:web → verify:api \[request, wants a reply\]: I am about to regenerate/);
    assert.match(out, /What you waited for is not there yet\. Run this command again now\./);
    // The message has its receipt: the next wait does not print it again.
    assert.match(f.talk('wait', '--as', 'verify:api', '--job', id, '--seconds', '1').stdout, /^still waiting for the job/);
    assert.match(f.talk('reply', 'T-1', '--as', 'verify:api', '--text', 'one more, in 5 minutes').stdout, /verify:api → implement:web \(re T-1\)/);
    assert.match(f.talk('read', '--as', 'implement:web').stdout, /one more, in 5 minutes/);
    assert.match(f.talk('read', '--as', 'implement:web').stdout, /^no new messages for implement:web/);
    assert.equal(f.talk('jobs', '--stop', '--as', 'verify:api').stdout.trim(), `stopped ${id}`);
    assert.match(f.talk('jobs').stdout, new RegExp(`${other} other by implement:web: running`), 'the job of the other agent runs on');
    assert.match(f.talk('wait', '--as', 'verify:api', '--job', id, '--seconds', '1').stdout, /ended: stopped/);
  } finally { f.done(); }
});

test('a job ends at its time limit, and when the host process of its run is gone', async () => {
  const f = fixture();
  try {
    const slow = jobId(f.talk('job', '--as', 'verify:api', '--name', 'slow', '--max-min', '0.03', '--', process.execPath, '-e', sleepJs(60_000)).stdout);
    let r = f.talk('wait', '--as', 'verify:api', '--job', slow, '--seconds', '30');
    assert.match(r.stdout, new RegExp(`^the job ${slow} ended`), r.stdout + r.stderr);
    assert.match(f.talk('jobs').stdout, /slow by verify:api: ended at its time limit of 0 minutes/);
    // A job that has no exit code proves no check.
    r = f.cli('step', 'check', f.root, 'demo', 'demo', '--name', 'tests', '--job', slow);
    assert.match(r.stderr, new RegExp(`the job ${slow} has no exit code \\(ended at its time limit\\)`));
    // The host of the run: a process that ends 1 second from now.
    const host = spawn(process.execPath, ['-e', sleepJs(1000)], { stdio: 'ignore' });
    const orphan = jobId(spawnSync(process.execPath, [wf, 'talk', 'job', f.root, 'demo', '--as', 'verify:api', '--name', 'orphan', '--', process.execPath, '-e', sleepJs(60_000)],
      { encoding: 'utf8', env: { ...process.env, SDLC_DRIVER_PID: String(host.pid) } }).stdout);
    await new Promise((res) => host.on('exit', res));
    r = f.talk('wait', '--as', 'verify:api', '--job', orphan, '--seconds', '30');
    assert.match(r.stdout, new RegExp(`^the job ${orphan} ended`), r.stdout + r.stderr);
    assert.match(f.talk('jobs').stdout, /orphan by verify:api: ended, because the host of its run was gone/);
  } finally { f.done(); }
});

test('a message ends a question wait too: the stage reads it, then waits on', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, 'state.yaml'), 'schema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\nupdated-at: "2026-11-25T10:00:00Z"\n');
    const decide = (...args) => f.cli('decide', ...args);
    assert.equal(decide('hold', f.root, 'demo', '--key', 'db', '--question', 'Which database?', '--stage', 'plan', '--slice', 'api').status, 0);
    f.talk('post', '--as', 'implement:web', '--to', 'api', '--text', 'the cache key moved to src/key.js');
    let r = decide('wait', f.root, 'demo', '--key', 'db', '--stage', 'plan', '--slice', 'api', '--seconds', '20');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^message: T-1 .* implement:web → api: the cache key moved to src\/key\.js\n/);
    assert.match(r.stdout, /still waiting for: db\. Run this command again now\./);
    // The same wait again blocks for its time: the message was read.
    r = decide('wait', f.root, 'demo', '--key', 'db', '--stage', 'plan', '--slice', 'api', '--seconds', '0.05');
    assert.match(r.stdout, /^still waiting for: db\. Run this command again now\./);
    // A wait of the talk for the same key returns the answer of the person.
    decide('add', f.root, 'demo', '--key', 'db', '--question', 'Which database?', '--answer', 'sqlite', '--by', 'person');
    assert.match(f.talk('wait', '--as', 'plan:api', '--key', 'db', '--seconds', '5').stdout, /^answered: .*sqlite/);
    const journal = readFileSync(path.join(f.dir, '.driver-journal.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(journal.some((l) => l.event === 'waiting') && journal.some((l) => l.event === 'wait-end'), 'the watch reads that the agent waits');
  } finally { f.done(); }
});
