// The record forms that fit the work of the agents: `record set` on list items and lists,
// `record stage-done`, `record get` with several names and `--fields`, and `status --brief`
// with the saved outcome of the last driver run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '../../lib/yaml.mjs';
import { applySet, parseSetArg } from '../../lib/record-path.mjs';
import { INDEX_NAME, frontmatterOfDoc, writeDoc } from '../../lib/records.mjs';
import { readDriverOutcome, writeProgress } from '../../lib/progress.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: path.join(tmpdir(), 'sdlc-forms-home') } });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-forms-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'plan', 'updated-at': '2026-10-25T10:00:00Z', 'workflow-files': ['00-index.md'], 'open-questions': ['db'] } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', 'best-first-slice': 'api', slices: [{ slug: 'api', status: 'defined' }, { slug: 'ui', status: 'defined' }, { slug: 'docs', status: 'defined' }] } });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('the path forms change one list item, append and remove, and leave the input unchanged', () => {
  const fm = { slices: [{ slug: 'api', status: 'defined' }], tags: ['a'] };
  const before = JSON.stringify(fm);
  const copy = structuredClone(fm);
  applySet(copy, parseSetArg('slices[api].status=in-progress'));
  applySet(copy, parseSetArg('slices[0].complexity=s'));
  applySet(copy, parseSetArg('tags+=b'));
  applySet(copy, parseSetArg('tags+=b'));
  applySet(copy, parseSetArg('tags-=a'));
  assert.deepEqual(copy, { slices: [{ slug: 'api', status: 'in-progress', complexity: 's' }], tags: ['b'] });
  assert.equal(JSON.stringify(fm), before);
  assert.throws(() => applySet(copy, parseSetArg('slices[zz].status=x')), /has no item zz; its items are: api/);
  assert.throws(() => parseSetArg('nokey'), /is not a path form\. The forms are:/);
});

test('record set changes a roster item by slug, refuses a value outside the schema enum, and appends to a list', () => {
  const f = fixture();
  try {
    const r = run(['record', 'set', f.root, 'demo', '03-slice', 'slices[ui].status=in-progress']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.map((s) => s.status), ['defined', 'in-progress', 'defined']);
    const bad = run(['record', 'set', f.root, 'demo', '03-slice', 'slices[ui].status=finished']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /the values are: defined, in-progress, complete, skipped/);
    assert.match(bad.stderr, /list\[<slug>\]\.field=v/);
    assert.equal(run(['record', 'set', f.root, 'demo', 'index', 'workflow-files+=03-slice.md']).status, 0);
    assert.deepEqual(frontmatterOfDoc(f.dir, INDEX_NAME)['workflow-files'], ['00-index.md', '03-slice.md']);
  } finally { f.done(); }
});

test('record stage-done writes the stage, the progress, the next route and the stage files', () => {
  const f = fixture();
  try {
    writeDoc(f.dir, '04-plan-api.md', { frontmatter: { schema: 'sdlc/v1', type: 'plan', slug: 'demo', 'slice-slug': 'api', status: 'complete' } });
    const r = run(['record', 'stage-done', f.root, 'demo', 'plan', 'api', '--json']);
    assert.equal(r.status, 0, r.stderr);
    const idx = frontmatterOfDoc(f.dir, INDEX_NAME);
    assert.equal(idx['current-stage'], 'plan');
    assert.equal(idx.progress.plan, 'in-progress', 'ui and docs have no plan yet');
    assert.equal(idx['next-command'], 'wf-implement');
    assert.equal(idx['next-invocation'], '/wf implement demo api');
    assert.equal(idx['selected-slice'], 'api');
    assert.deepEqual(idx['workflow-files'], ['00-index.md', '04-plan-api.md']);

    // A review of the last open slice routes to ship; one with an open slice after it routes to its plan.
    run(['record', 'set', f.root, 'demo', '03-slice', 'slices[ui].status=complete', 'slices[docs].status=complete']);
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'review', 'api']).status, 0);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-invocation'], '/wf ship demo');
    run(['record', 'set', f.root, 'demo', '03-slice', 'slices[docs].status=defined']);
    run(['record', 'stage-done', f.root, 'demo', 'review', 'api']);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-invocation'], '/wf plan demo docs');
    // --next replaces the default route.
    run(['record', 'stage-done', f.root, 'demo', 'verify', 'api', '--next', '/wf ship demo']);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-command'], 'wf-ship');
    const bad = run(['record', 'stage-done', f.root, 'demo', 'plan', 'nope']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /nope is not in the roster; its slices are: api, ui, docs/);
  } finally { f.done(); }
});

test('record get reads several records in one call, and --fields prints only those fields', () => {
  const f = fixture();
  try {
    const both = run(['record', 'get', f.root, 'demo', 'index', '03-slice', '--fields', 'status,best-first-slice', '--json']);
    assert.equal(both.status, 0, both.stderr);
    assert.deepEqual(JSON.parse(both.stdout), { '00-index.md': { status: 'active', 'best-first-slice': null }, '03-slice.md': { status: 'complete', 'best-first-slice': 'api' } });
    const one = run(['record', 'get', f.root, 'demo', 'index', '--fields', 'status']);
    assert.deepEqual(parse(one.stdout), { status: 'active' });
    const missing = run(['record', 'get', f.root, 'demo', 'index', 'nope']);
    assert.equal(missing.status, 1);
    assert.match(missing.stdout, /==> 00-index\.md <==/);
    assert.match(missing.stderr, /no record nope/);
  } finally { f.done(); }
});

test('status --brief prints the stage, the questions, the slices and the last run in under 2 KB', () => {
  const f = fixture();
  try {
    writeDoc(f.dir, '06-verify-api.md', { frontmatter: { schema: 'sdlc/v1', type: 'verify', slug: 'demo', 'slice-slug': 'api', status: 'complete', result: 'pass', convergence: 'converged' } });
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', status: 'running' });
    assert.equal(readDriverOutcome(f.dir), null, 'a running run saves no outcome');
    writeProgress(f.dir, { status: 'stopped', reason: 'a gate', resume: '/wf yolo demo' });
    assert.equal(readDriverOutcome(f.dir).status, 'stopped');
    const r = run(['status', f.root, 'demo', '--brief']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.length < 2048);
    assert.match(r.stdout, /^demo: active at plan/);
    assert.match(r.stdout, /slices: api=pass, ui=defined, docs=defined/);
    assert.match(r.stdout, /questions: 1 open: db/);
    assert.match(r.stdout, /last run: yolo r1 stopped: a gate; resume: \/wf yolo demo/);
    const j = JSON.parse(run(['status', f.root, 'demo', '--brief', '--json']).stdout);
    assert.deepEqual(j.slices[0], { slice: 'api', roster: 'defined', result: 'pass', convergence: 'converged' });
  } finally { f.done(); }
});
