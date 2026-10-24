// lib/progress.mjs, `wf.mjs progress`, and the session-start notice of hooks/run-notice.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DEAD_AFTER_MS, etaSeconds, progressLine, progressOf, stoppedRuns, writeProgress } from '../../lib/progress.mjs';
import { appendStep } from '../../lib/steps.mjs';
import { runNotice } from '../../hooks/run-notice.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T0 = Date.parse('2026-10-24T10:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-progress-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '04-plan-api.md'), '## Step-by-Step Plan\n\n1. **A** — x\n2. **B** — y\n3. **C** — z\n4. **D** — w\n');
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('writeProgress merges a change, and a new run id starts a new record', () => {
  const f = fixture();
  try {
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', stage: 'plan', status: 'running' }, { now: at(0) });
    let p = writeProgress(f.dir, { stage: 'implement', slice: 'api' }, { now: at(5) });
    assert.deepEqual([p.run, p.stage, p.slice, p.startedAt, p.updatedAt], ['r1', 'implement', 'api', at(0), at(5)]);
    p = writeProgress(f.dir, { run: 'r2', status: 'running' }, { now: at(9) });
    assert.deepEqual([p.stage, p.startedAt], [undefined, at(9)]);
    assert.throws(() => writeProgress(f.dir, { status: 'paused' }), /status must be one of/);
  } finally { f.done(); }
});

test('etaSeconds: the mean time of a done step times the open steps', () => {
  const f = fixture();
  try {
    appendStep(f.dir, { slice: 'api', event: 'start', step: 1 }, { now: at(0) });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 1 }, { now: at(4) });
    appendStep(f.dir, { slice: 'api', event: 'start', step: 2 }, { now: at(4) });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2 }, { now: at(10) });
    assert.equal(etaSeconds(f.dir, 'api'), 600, '5 minutes a step, 2 steps open');
    assert.equal(etaSeconds(f.dir, 'none'), null);
  } finally { f.done(); }
});

test('progressOf: a running run that is quiet too long is stopped, and the journal counts as a sign of life', () => {
  const f = fixture();
  try {
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', stage: 'implement', slice: 'api', status: 'running', step: { n: 2, of: 4, title: 'B' } }, { now: at(0) });
    let p = progressOf(f.dir, 'demo', { now: T0 + DEAD_AFTER_MS + 60000 });
    assert.equal(p.dead, true);
    assert.equal(progressLine(p), 'stopped at implement api step 2 of 4 (B): no sign of life for 31 min. Resume with /wf yolo demo');
    writeFileSync(path.join(f.dir, '.driver-journal.jsonl'), `${JSON.stringify({ at: at(30), event: 'agent-start' })}\n`);
    p = progressOf(f.dir, 'demo', { now: T0 + DEAD_AFTER_MS + 60000 });
    assert.equal(p.dead, false);
    assert.equal(progressLine(p), 'running implement api step 2 of 4 (B)');
    writeProgress(f.dir, { status: 'waiting', reason: 'two questions' }, { now: at(31) });
    assert.equal(progressLine(progressOf(f.dir, 'demo', { now: T0 + 32 * 60000 })), 'waiting on the person at implement api step 2 of 4 (B): two questions');
  } finally { f.done(); }
});

test('stoppedRuns and the notice: dead and stopped runs of the last 7 days only', () => {
  const f = fixture();
  try {
    assert.equal(runNotice(f.root), null);
    writeProgress(f.dir, { run: 'r1', stage: 'verify', slice: 'api', status: 'stopped', reason: 'a question', resume: '/wf yolo demo' }, { now: at(0) });
    assert.deepEqual(stoppedRuns(f.root, { now: T0 + 60000 }), [{ slug: 'demo', line: 'stopped at verify api: a question. Resume with /wf yolo demo' }]);
    assert.equal(runNotice(f.root, { now: T0 + 60000 }), 'Stopped workflow runs:\n- demo: stopped at verify api: a question. Resume with /wf yolo demo');
    assert.deepEqual(stoppedRuns(f.root, { now: T0 + 8 * 86400000 }), []);
  } finally { f.done(); }
});

test('wf.mjs progress set and show; step start keeps the step current', () => {
  const f = fixture();
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...a], { encoding: 'utf8' });
  try {
    assert.equal(cli('progress', 'set', f.root, 'demo', '--run', 'r1', '--driver', 'yolo', '--stage', 'implement', '--slice', 'api', '--status', 'running').stdout.trim(), 'running implement api');
    assert.equal(cli('step', 'start', f.root, 'demo', 'api', '1', '--title', 'A').status, 0);
    assert.equal(cli('progress', 'show', f.root, 'demo').stdout.trim(), 'running implement api step 1 of 4 (A)');
    writeFileSync(path.join(f.dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: implement\nupdated-at: "2026-10-24T10:00:00Z"\n---\n');
    const st = cli('status', f.root, 'demo');
    assert.match(st.stdout, /^run: running implement api step 1 of 4 \(A\)$/m);
  } finally { f.done(); }
});

test('hooks/run-notice.mjs prints a systemMessage for a stopped run and nothing on compact', () => {
  const f = fixture();
  const hook = (input) => spawnSync(process.execPath, [path.join(pluginRoot, 'hooks', 'run-notice.mjs')], { input: JSON.stringify(input), encoding: 'utf8' });
  try {
    writeProgress(f.dir, { run: 'r1', stage: 'review', status: 'stopped', reason: 'dont-ship' });
    const r = hook({ cwd: f.root, source: 'startup' });
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).systemMessage, /- demo: stopped at review: dont-ship\. Resume with \/wf demo/);
    assert.equal(hook({ cwd: f.root, source: 'compact' }).stdout, '');
  } finally { f.done(); }
});
