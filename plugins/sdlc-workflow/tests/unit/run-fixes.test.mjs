// A driver run that asks, lives, dies and stops: the kind of a stop, the life of a run by its host
// process, one driver per workflow, the events that wake a session, and the new entries of a list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendStep, stopKind, whereLine, whereOf } from '../../lib/steps.mjs';
import { DEAD_AFTER_MS, markBusy, progressLine, progressOf, readProgress, writeProgress } from '../../lib/progress.mjs';
import { addDecision } from '../../lib/decisions.mjs';
import { decideAdd } from '../../lib/wf-ops.mjs';
import { stageYoloDriver } from '../../scripts/stage-yolo-driver.mjs';
import { isNews, isRoutine, stopLands } from '../../scripts/yolo-watch.mjs';
import { runNotice } from '../../hooks/run-notice.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const watch = path.join(pluginRoot, 'scripts', 'yolo-watch.mjs');
const cli = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const T0 = Date.parse('2026-11-25T10:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-runfix-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '04-plan-api.md'), '## Step-by-Step Plan\n\n1. **A** — x\n2. **B** — y\n3. **C** — z\n');
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a stop that waits on the person is a question, and only a real failure counts toward the split', () => {
  assert.equal(stopKind(undefined, 'cargo test failed in pass.rs'), 'fail');
  assert.equal(stopKind('fail', 'the steer asks the person before placing it'), 'question');
  assert.equal(stopKind('fail', 'question kcs-set-depth-third-pilot-scattered for the person'), 'question');
  assert.equal(stopKind('fail', 'the gate refused'), 'fail');
  assert.equal(stopKind('fail', 'the build broke', { held: true }), 'question', 'a held question of the slice decides');
  assert.equal(stopKind('gate', 'ask the person'), 'gate', 'a kind other than fail stays');
  const f = fixture();
  try {
    appendStep(f.dir, { slice: 'api', event: 'start', step: 1, head: 'a' }, { now: at(0) });
    appendStep(f.dir, { slice: 'api', event: 'hard-stop', kind: 'question', reason: 'asks the person' }, { now: at(1) });
    appendStep(f.dir, { slice: 'api', event: 'hard-stop', kind: 'question', reason: 'asks the person again' }, { now: at(2) });
    let w = whereOf(f.dir, 'api');
    assert.equal(w.hardStops, 0);
    assert.equal(w.splitQuestion, false, 'two questions are not two failures');
    appendStep(f.dir, { slice: 'api', event: 'hard-stop', kind: 'fail', reason: 'the suite is red' }, { now: at(3) });
    w = whereOf(f.dir, 'api');
    assert.deepEqual(w.failStops, [{ at: at(3), reason: 'the suite is red' }]);
    assert.match(whereLine(w), /1 hard-stop\(s\) \[2026-11-25T10:03 the suite is red\]/, 'the line shows what was counted');
    appendStep(f.dir, { slice: 'api', event: 'retry' }, { now: at(4) });
    assert.deepEqual(whereOf(f.dir, 'api').failStops, []);
  } finally { f.done(); }
});

test('wf.mjs step stop: a reason that asks the person is stored as a question', () => {
  const f = fixture();
  try {
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '1']).status, 0);
    const r = cli(wf, ['step', 'stop', f.root, 'demo', 'api', '--kind', 'fail', '--reason', 'the steer asks the person before placing it', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).kind, 'question');
    assert.equal(whereOf(f.dir, 'api').hardStops, 0);
  } finally { f.done(); }
});

test('the life of a driver run is asked of its host process, and silence decides only with no process', () => {
  const f = fixture();
  try {
    const me = hostname();
    const late = T0 + DEAD_AFTER_MS + 21 * 60000;
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', stage: 'implement', slice: 'api', status: 'running', hostPid: 4242, host: me }, { now: at(0) });
    // The host lives: a long command is not death, and the line gives no resume command.
    let p = progressOf(f.dir, 'demo', { now: late, alive: () => true, host: me });
    assert.equal(p.dead, false);
    assert.equal(p.state, 'running');
    assert.match(progressLine(p), /^running implement api: no line for \d+ min, and its host process is alive\. A long command writes no line\. Do not start another run/);
    assert.doesNotMatch(progressLine(p), /Resume with/);
    // The host is gone: the run is dead at once, with no wait for silence.
    p = progressOf(f.dir, 'demo', { now: T0 + 60000, alive: () => false, host: me });
    assert.equal(p.dead, true);
    assert.equal(progressLine(p), 'stopped at implement api: the host process that ran it is gone. Resume with /wf yolo demo');
    // Another machine: there is no process to ask, so silence decides as before.
    p = progressOf(f.dir, 'demo', { now: late, alive: () => { throw new Error('not asked'); }, host: 'another-machine' });
    assert.equal(p.hostAlive, null);
    assert.equal(p.dead, true);
    assert.match(progressLine(p), /no sign of life for \d+ min\. Resume with/);
  } finally { f.done(); }
});

test('a suite that runs is a sign of life in each running driver run', () => {
  const f = fixture();
  try {
    const live = { alive: () => true, host: 'this-machine' };
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', stage: 'verify', slice: 'api', status: 'running' }, { now: at(0) });
    assert.equal(markBusy(f.root, 'the gate suite', { now: at(40), ...live }), 0, 'a record that names no host of this machine is not touched');
    writeProgress(f.dir, { hostPid: 4242, host: 'this-machine' }, { now: at(1) });
    assert.equal(markBusy(f.root, 'the gate suite', { now: at(40), alive: () => false, host: 'this-machine' }), 0, 'a run whose host is gone is not made to look alive');
    assert.equal(markBusy(f.root, 'the gate suite', { now: at(40), ...live }), 1);
    let p = readProgress(f.dir);
    assert.deepEqual(p.busy, { what: 'the gate suite', at: at(40) });
    assert.equal(p.updatedAt, at(40));
    assert.equal(progressLine(progressOf(f.dir, 'demo', { now: T0 + 41 * 60000, host: 'x' })), 'running verify api, in the gate suite');
    markBusy(f.root, null, { now: at(50), ...live });
    p = readProgress(f.dir);
    assert.equal(p.busy, null);
    writeProgress(f.dir, { status: 'stopped' }, { now: at(51) });
    // A new stage ends the mark of a suite that was cut off.
    markBusy(f.root, 'the unit suite', { now: at(51), ...live });
    assert.equal(writeProgress(f.dir, { stage: 'review' }, { now: at(52) }).busy, null);
    writeProgress(f.dir, { status: 'stopped' }, { now: at(53) });
    assert.equal(markBusy(f.root, 'x', live), 0, 'a run that stopped is not marked');
  } finally { f.done(); }
});

test('the staging refuses a second driver over a run whose host process lives, and --take-over starts over it', () => {
  const f = fixture();
  try {
    const source = path.join(f.root, 'driver.js');
    writeFileSync(source, '// driver\n');
    const live = () => ({ status: 'running', hostAlive: true, hostPid: 4242, stage: 'implement', slice: 'api', run: 'r1', quietMinutes: 51 });
    assert.throws(() => stageYoloDriver(f.root, { slug: 'demo', source, progressOf: live, log: () => {} }),
      (e) => /a run of demo is recorded as running \(implement api, run r1\), and its host process 4242 is alive/.test(e.message)
        && /--take-over/.test(JSON.stringify(e.fix)));
    assert.ok(stageYoloDriver(f.root, { slug: 'demo', source, progressOf: live, takeOver: true, log: () => {} }).scriptPath);
    // A run whose host is gone, or that stopped, is no reason to refuse.
    assert.ok(stageYoloDriver(f.root, { slug: 'demo', source, progressOf: () => ({ status: 'running', hostAlive: false }), log: () => {} }).scriptPath);
    assert.ok(stageYoloDriver(f.root, { slug: 'demo', source, progressOf: () => ({ status: 'stopped', hostAlive: true }), log: () => {} }).scriptPath);
    assert.ok(stageYoloDriver(f.root, { slug: 'demo', source, progressOf: () => null, log: () => {} }).scriptPath);
  } finally { f.done(); }
});

test('the notice of a dead run says how many files the checkout holds uncommitted', () => {
  const f = fixture();
  try {
    const git = (...a) => spawnSync('git', ['-C', f.root, ...a], { encoding: 'utf8' });
    git('init', '-q');
    writeFileSync(path.join(f.root, 'left.txt'), 'x\n');
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', stage: 'review', status: 'running', hostPid: 1, host: 'another-machine' }, { now: at(0) });
    const text = runNotice(f.root, { now: T0 + DEAD_AFTER_MS + 60000 });
    assert.match(text, /- demo: stopped at review: no sign of life/);
    assert.match(text, /The checkout has \d+ uncommitted files?: a run that died may have left them\. The next run judges them before its own work/);
  } finally { f.done(); }
});

test('the watch wakes the session for news only; routine events go to the commentary', () => {
  assert.equal(isRoutine({ event: 'stage-start', stage: 'plan' }), true);
  assert.equal(isRoutine({ event: 'commit' }), true);
  assert.equal(isRoutine({ event: 'stage-end', stage: 'implement', status: 'complete' }), false, 'the end of a stage is the stage note of the person');
  for (const event of ['question', 'stop', 'run-end', 'stale', 'decision']) assert.equal(isRoutine({ event }), false, event);
  assert.equal(isNews({ event: 'stage-start', stage: 'implement' }), false);
  assert.match(stopLands('current'), /the next stage does not start/);
  assert.match(stopLands('verify'), /after the next verify stage that ends from now on, before the stage that follows it/);
});

test('stop-check writes the journal line of a stop, so the agent that was stopped writes no heartbeat', () => {
  const f = fixture();
  try {
    assert.deepEqual(JSON.parse(cli(watch, ['stop-check', f.root, 'demo']).stdout), { stop: false });
    const c = cli(watch, ['control', f.root, 'demo', 'stop']);
    assert.equal(c.status, 0, c.stderr);
    assert.match(c.stderr, /The run ends when the agent that runs now returns/);
    const r = cli(watch, ['stop-check', f.root, 'demo']);
    assert.equal(JSON.parse(r.stdout).stop, true, r.stderr);
    const found = [path.join(f.root, '.ai', 'run', 'demo', '.driver-journal.jsonl'), path.join(f.dir, '.driver-journal.jsonl')]
      .map((p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } }).join('');
    assert.match(found, /"event":"stop-honoured","agent":"stop-check","reason":"stop after the current agent"/);
    assert.doesNotMatch(found, /agent-start/);
  } finally { f.done(); }
});

test('decide list --since prints only the newer entries', () => {
  const f = fixture();
  try {
    addDecision(f.dir, { kind: 'steer', answer: 'no new runtime deps' });
    addDecision(f.dir, { kind: 'steer', answer: 'api keeps its route', scope: { slice: 'api' } });
    const all = cli(wf, ['decide', 'list', f.root, 'demo', '--kind', 'steer,note', '--slice', 'api', '--rules']);
    assert.match(all.stdout, /D-001/);
    assert.match(all.stdout, /D-002/);
    assert.equal(cli(wf, ['decide', 'list', f.root, 'demo', '--kind', 'steer,note', '--slice', 'api', '--rules', '--since', 'D-002']).stdout.trim(), 'no entries after D-002');
    addDecision(f.dir, { kind: 'steer', answer: 'ask me before the value is placed', scope: { slice: 'api' } });
    const fresh = cli(wf, ['decide', 'list', f.root, 'demo', '--kind', 'steer,note', '--slice', 'api', '--rules', '--since', 'D-002']).stdout;
    assert.match(fresh, /D-003/);
    assert.doesNotMatch(fresh, /D-001|D-002/);
  } finally { f.done(); }
});

test('a note to a slice that is complete is refused', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, '03-slice.md'), '---\nschema: sdlc/v1\ntype: slice-index\nslug: demo\nslices:\n  - slug: api\n    status: complete\n  - slug: web\n    status: defined\n---\n');
    assert.throws(() => decideAdd(f.dir, { kind: 'note', slice: 'api', stage: 'implement', answer: 'this red test is yours' }),
      (e) => /the slice api is complete, so it reads no note/.test(e.message) && /yours to make green/.test(JSON.stringify(e.fix)));
    assert.equal(decideAdd(f.dir, { kind: 'note', slice: 'web', stage: 'implement', answer: 'the store changed under you' }).entry.kind, 'note');
  } finally { f.done(); }
});

test('step done takes a commit that was made before the start row, when it is new since the last done step', () => {
  const f = fixture();
  try {
    const git = (...a) => spawnSync('git', ['-C', f.root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
    git('init', '-q');
    const commit = (name) => { writeFileSync(path.join(f.root, name), `${name}\n`); git('add', '--', name); git('commit', '-q', '-m', name); return git('rev-parse', 'HEAD').stdout.trim(); };
    commit('base.txt');
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '1']).status, 0);
    commit('one.txt');
    assert.equal(cli(wf, ['step', 'done', f.root, 'demo', 'api', '1', '--sha', 'HEAD']).status, 0);
    // Step 2 is committed first, and its start row is written after the commit.
    commit('two.txt');
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '2']).status, 0);
    const done = cli(wf, ['step', 'done', f.root, 'demo', 'api', '2', '--sha', 'HEAD']);
    assert.equal(done.status, 0, done.stderr);
    // A step that made no commit is still refused: HEAD is the commit of step 2.
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '3']).status, 0);
    const none = cli(wf, ['step', 'done', f.root, 'demo', 'api', '3', '--sha', 'HEAD']);
    assert.notEqual(none.status, 0);
    assert.match(none.stderr, /is the commit of step 2|made no commit/);
  } finally { f.done(); }
});

test('control stop --after step: step done tells the agent to end after the step, and clear takes it back', () => {
  const f = fixture();
  try {
    const stop = cli(wf, ['control', 'stop', f.root, 'demo', '--after', 'step', '--json']);
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(JSON.parse(stop.stdout).request.after, 'step');
    assert.match(JSON.parse(stop.stdout).lands, /ends after the step that it ends next/);
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '1']).status, 0);
    const done = cli(wf, ['step', 'done', f.root, 'demo', 'api', '1', '--no-change', '--json']);
    assert.equal(done.status, 0, done.stderr);
    assert.match(JSON.parse(done.stdout).next, /stop requested \(stop after the current step\): end the stage now\. .*do not start step 2/);
    assert.match(cli(wf, ['control', 'show', f.root, 'demo']).stdout, /stop request: after step/);
    assert.equal(cli(wf, ['control', 'clear', f.root, 'demo', '--force']).status, 0);
    assert.equal(cli(wf, ['step', 'start', f.root, 'demo', 'api', '2']).status, 0);
    const next = cli(wf, ['step', 'done', f.root, 'demo', 'api', '2', '--no-change', '--json']);
    assert.equal(JSON.parse(next.stdout).next, undefined, 'no request, no stop');
    assert.match(cli(wf, ['control', 'stop', f.root, 'demo', '--after', 'lunch']).stderr, /--after must be one of current, step/);
  } finally { f.done(); }
});
