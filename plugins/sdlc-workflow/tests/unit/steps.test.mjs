// lib/steps.mjs and `wf.mjs step`: the step record of a slice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { STEPS_FILE, appendSquash, appendStep, lastSlice, planSteps, readSteps, whereLine, whereOf } from '../../lib/steps.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN = '---\ntype: plan\n---\n# Plan: api\n\n## Step-by-Step Plan\n\n1. **Route** — files: `a.js`. Done when: `npm test` passes.\n2. **Store** — files: `b.js`.\n3. Docs - write the readme\n\n## Handover\n\n1. not a step\n';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-steps-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '04-plan-api.md'), PLAN);
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('planSteps reads the numbered steps of the plan section only', () => {
  const f = fixture();
  try {
    assert.deepEqual(planSteps(f.dir, 'api'), [{ n: 1, title: 'Route' }, { n: 2, title: 'Store' }, { n: 3, title: 'Docs' }]);
    assert.deepEqual(planSteps(f.dir, 'none'), []);
  } finally { f.done(); }
});

test('appendStep refuses an unknown event, a missing slice, and a start with no step', () => {
  const f = fixture();
  try {
    assert.throws(() => appendStep(f.dir, { slice: 'api', event: 'begin' }), /event must be one of/);
    assert.throws(() => appendStep(f.dir, { event: 'retry' }), /needs a slice/);
    assert.throws(() => appendStep(f.dir, { slice: 'api', event: 'start' }), /step number above 0/);
  } finally { f.done(); }
});

test('whereOf: done steps, the running step, the next step, the stop count and a complete slice', () => {
  const f = fixture();
  try {
    const ok = new Set(['s1', 's2']);
    const isAncestor = (sha) => ok.has(sha);
    appendStep(f.dir, { slice: 'api', event: 'start', step: 1, title: 'Route' }, { now: '2026-10-24T10:00:00Z' });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 1, sha: 's1' });
    appendStep(f.dir, { slice: 'api', event: 'start', step: 2, title: 'Store' });
    let w = whereOf(f.dir, 'api', { isAncestor });
    assert.deepEqual(w.done, [{ n: 1, sha: 's1' }]);
    assert.deepEqual(w.current, { n: 2, title: 'Store', at: w.current.at });
    assert.deepEqual(w.next, { n: 2, title: 'Store' });
    assert.equal(whereLine(w), 'api: 1 of 3 steps done; step 2 (Store) is running');
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2, sha: 'gone' });
    appendStep(f.dir, { slice: 'api', event: 'hard-stop', reason: 'x' });
    appendStep(f.dir, { slice: 'api', event: 'hard-stop', reason: 'y' });
    w = whereOf(f.dir, 'api', { isAncestor });
    assert.deepEqual(w.done.map((d) => d.n), [1], 'a sha outside the history of HEAD does not count');
    assert.equal(w.splitQuestion, true);
    assert.match(whereLine(w), /2 hard-stop\(s\): ask the person to split the slice/);
    appendStep(f.dir, { slice: 'api', event: 'retry' });
    assert.equal(whereOf(f.dir, 'api', { isAncestor }).hardStops, 0);
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2, sha: 's2' });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 3, sha: null });
    appendStep(f.dir, { slice: 'api', event: 'complete', sha: 's2' });
    w = whereOf(f.dir, 'api', { isAncestor });
    assert.equal(w.complete, true);
    assert.equal(whereLine(w), 'api: complete at s2');
  } finally { f.done(); }
});

test('a squash keeps the step ledger: each step whose commit the squash holds is moved to the squash commit', () => {
  const f = fixture();
  try {
    appendStep(f.dir, { slice: 'api', event: 'done', step: 1, sha: 's1', patchId: 'p1', branch: 'unit' });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2, noChange: true, head: 's1', branch: 'unit' });
    appendStep(f.dir, { slice: 'api', event: 'done', step: 3, sha: 's3', patchId: 'p3', branch: 'unit' });
    assert.throws(() => appendSquash(f.dir, { sha: 'q', commits: [] }), /needs the squash commit/);
    appendSquash(f.dir, { sha: 'q', patchId: 'pq', commits: ['s3', 's1'], branch: 'unit' });
    const none = () => null;
    let w = whereOf(f.dir, 'api', { isAncestor: (sha) => sha === 'q', findMoved: none });
    assert.deepEqual(w.done, [{ n: 1, sha: 'q', state: 'moved', oldSha: 's1' }, { n: 2, sha: null, noChange: true }, { n: 3, sha: 'q', state: 'moved', oldSha: 's3' }]);
    assert.equal(w.complete, false);
    assert.equal(w.next, null);
    // A rebase gives the squash commit a new sha with the same patch id.
    const findMoved = (row) => (row.patchId === 'pq' ? 'q2' : null);
    w = whereOf(f.dir, 'api', { isAncestor: (sha) => sha === 'q2', findMoved });
    assert.deepEqual(w.done.map((d) => [d.n, d.sha]), [[1, 'q2'], [2, null], [3, 'q2']]);
    // A second squash takes the first one in.
    appendSquash(f.dir, { sha: 'r', commits: ['q'] });
    w = whereOf(f.dir, 'api', { isAncestor: (sha) => sha === 'r', findMoved: none });
    assert.deepEqual(w.done.map((d) => [d.n, d.sha]), [[1, 'r'], [2, null], [3, 'r']]);
    w = whereOf(f.dir, 'api', { isAncestor: () => false, findMoved: none });
    assert.deepEqual(w.dropped.map((d) => d.n), [1, 2, 3], 'a squash commit that left the branch drops its steps');
    assert.equal(lastSlice(f.dir), 'api', 'a squash row names no slice');
  } finally { f.done(); }
});

test('the old .implement-progress.jsonl is read, its step rows as done', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, '.implement-progress.jsonl'), '{"slice":"api","event":"step","step":1,"sha":"s1"}\nnot json\n');
    appendStep(f.dir, { slice: 'api', event: 'done', step: 2, sha: 's2' });
    assert.deepEqual(readSteps(f.dir).map((r) => [r.event, r.step]), [['done', 1], ['done', 2]]);
    assert.deepEqual(whereOf(f.dir, 'api').next, { n: 3, title: 'Docs' });
  } finally { f.done(); }
});

test('wf.mjs step: start, done with HEAD, and where on a real git history', () => {
  const f = fixture();
  const git = (...a) => execFileSync('git', a, { cwd: f.root, encoding: 'utf8' }).trim();
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'step', ...a], { encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 't@t');
    git('config', 'user.name', 't');
    writeFileSync(path.join(f.root, 'a.js'), '1\n');
    git('add', 'a.js');
    git('commit', '-qm', 'one');
    assert.equal(cli('start', f.root, 'demo', 'api', '1', '--title', 'Route').status, 0);
    writeFileSync(path.join(f.root, 'a.js'), '2\n');
    git('commit', '-qam', 'step 1');
    const head = git('rev-parse', 'HEAD');
    const done = cli('done', f.root, 'demo', 'api', '1', '--sha', 'HEAD');
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, new RegExp(`^done api step 1 ${head.slice(0, 8)}`));
    const row = JSON.parse(readFileSync(path.join(f.dir, STEPS_FILE), 'utf8').trim().split('\n').pop());
    assert.equal(row.sha, head);
    assert.equal(cli('where', f.root, 'demo').stdout.trim(), 'api: 1 of 3 steps done; next: step 2 (Store)');
    assert.match(cli('done', f.root, 'demo', 'api', '2', '--sha', 'nope').stderr, /nope is not a commit/);
    assert.match(cli('start', f.root, 'demo').stderr, /<slice> is required/);
  } finally { f.done(); }
});
