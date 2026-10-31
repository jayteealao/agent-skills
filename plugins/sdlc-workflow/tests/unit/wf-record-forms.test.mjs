// The record forms that fit the work of the agents: `record set` on list items and lists,
// `record stage-done`, `record get` with several names and `--fields`, and `status --brief`
// with the saved outcome of the last driver run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    assert.match(bad.stderr, /the values are: defined, in-progress, complete, deferred, skipped/);
    assert.match(bad.stderr, /list\[<slug>\]\.field=v/);
    assert.equal(run(['record', 'set', f.root, 'demo', 'index', 'workflow-files+=03-slice.md']).status, 0);
    assert.deepEqual(frontmatterOfDoc(f.dir, INDEX_NAME)['workflow-files'], ['00-index.md', '03-slice.md']);
  } finally { f.done(); }
});

test('record set: += of a flow map adds an object to a list, as a compressed slice records itself', () => {
  const f = fixture();
  try {
    const r = run(['record', 'set', f.root, 'demo', 'index', 'workflow-files+=03-slice-fix-x.md', 'compressed-slices+={slug: fix-x, slice-type: fix, created-at: "2026-10-31T09:00:00Z"}']);
    assert.equal(r.status, 0, r.stderr);
    const fm = frontmatterOfDoc(f.dir, INDEX_NAME);
    assert.deepEqual(fm['compressed-slices'], [{ slug: 'fix-x', 'slice-type': 'fix', 'created-at': '2026-10-31T09:00:00Z' }]);
    assert.deepEqual(fm['workflow-files'], ['00-index.md', '03-slice-fix-x.md']);
    assert.notEqual(fm['updated-at'], '2026-10-25T10:00:00Z');
    assert.equal(run(['record', 'set', f.root, 'demo', '03-slice', 'slices+={slug: fix-x, status: defined}', 'total-slices=4']).status, 0);
    const roster = frontmatterOfDoc(f.dir, '03-slice.md');
    assert.deepEqual(roster.slices.at(-1), { slug: 'fix-x', status: 'defined' });
    assert.equal(roster['total-slices'], 4);
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

const rosterOf = (dir) => Object.fromEntries(frontmatterOfDoc(dir, '03-slice.md').slices.map((s) => [s.slug, s.status]));
const verifyRecord = (dir, slice, fields) => writeDoc(dir, `06-verify-${slice}.md`, { frontmatter: { schema: 'sdlc/v1', type: 'verify', slug: 'demo', 'slice-slug': slice, status: 'complete', ...fields } });
const setDeferrals = (dir, list) => writeDoc(dir, INDEX_NAME, { frontmatter: { ...frontmatterOfDoc(dir, INDEX_NAME), 'runtime-evidence-deferrals': list } });

test('stage-done after implement sets the roster status of the slice to in-progress', () => {
  const f = fixture();
  try {
    const r = run(['record', 'stage-done', f.root, 'demo', 'implement', 'api', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout)['roster-status'], 'in-progress');
    assert.deepEqual(rosterOf(f.dir), { api: 'in-progress', ui: 'defined', docs: 'defined' });
  } finally { f.done(); }
});

test('stage-done after verify sets complete for a pass', () => {
  const f = fixture();
  try {
    verifyRecord(f.dir, 'api', { result: 'pass', convergence: 'converged' });
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'verify', 'api']).status, 0);
    assert.equal(rosterOf(f.dir).api, 'complete');
  } finally { f.done(); }
});

test('stage-done after verify sets deferred for a partial whose only residue is an open deferral', () => {
  const f = fixture();
  try {
    verifyRecord(f.dir, 'api', { result: 'partial', convergence: 'not-needed', 'interactive-verification': 'deferred' });
    setDeferrals(f.dir, [{ slice: 'api', reason: 'no device', 'cleared-by': null }]);
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'verify', 'api']).status, 0);
    assert.equal(rosterOf(f.dir).api, 'deferred');
    // A deferred slice is built: the review routes past it to the next open slice.
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'review', 'ui']).status, 0);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-invocation'], '/wf plan demo docs');
  } finally { f.done(); }
});

test('stage-done after verify sets in-progress for any other outcome', () => {
  const f = fixture();
  try {
    run(['record', 'set', f.root, 'demo', '03-slice', 'slices[api].status=deferred']);
    // A cleared deferral does not count; a partial with no open deferral stays in progress.
    verifyRecord(f.dir, 'api', { result: 'partial', convergence: 'converged' });
    setDeferrals(f.dir, [{ slice: 'api', 'cleared-by': 'probe run 2' }]);
    run(['record', 'stage-done', f.root, 'demo', 'verify', 'api']);
    assert.equal(rosterOf(f.dir).api, 'in-progress');
    // An open deferral with a failure left after the fix round is not deferred.
    verifyRecord(f.dir, 'ui', { result: 'partial', convergence: 'escalated' });
    setDeferrals(f.dir, [{ slice: 'ui', 'cleared-by': null }]);
    run(['record', 'stage-done', f.root, 'demo', 'verify', 'ui']);
    assert.equal(rosterOf(f.dir).ui, 'in-progress');
    verifyRecord(f.dir, 'docs', { result: 'fail', convergence: 'escalated' });
    run(['record', 'stage-done', f.root, 'demo', 'verify', 'docs']);
    assert.equal(rosterOf(f.dir).docs, 'in-progress');
  } finally { f.done(); }
});

test('stage-done does not change a skipped, dropped or complete roster entry', () => {
  const f = fixture();
  try {
    run(['record', 'set', f.root, 'demo', '03-slice', 'slices[api].status=complete', 'slices[ui].status=skipped', 'slices[docs].status=dropped']);
    for (const s of ['api', 'ui', 'docs']) {
      verifyRecord(f.dir, s, { result: 'fail', convergence: 'escalated' });
      const r = run(['record', 'stage-done', f.root, 'demo', 'verify', s, '--json']);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(JSON.parse(r.stdout)['roster-status'], undefined);
    }
    run(['record', 'stage-done', f.root, 'demo', 'implement', 'api']);
    assert.deepEqual(rosterOf(f.dir), { api: 'complete', ui: 'skipped', docs: 'dropped' });
  } finally { f.done(); }
});

test('stage-done with no 03-slice.md writes no roster', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-forms-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  try {
    writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'workflow-files': [] } });
    const r = run(['record', 'stage-done', root, 'demo', 'implement', 'fix', '--json']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout)['roster-status'], undefined);
    assert.equal(frontmatterOfDoc(dir, '03-slice.md'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test('help: a bare call lists the commands; <command> help and an unknown form print the forms with examples', () => {
  const bare = run([]);
  assert.equal(bare.status, 0);
  assert.match(bare.stdout, /Run wf\.mjs help <command> for its forms and flags/);
  const h = run(['record', 'help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Example: wf\.mjs record set \. demo 03-slice slices\[api\]\.status=in-progress/);
  const unknown = run(['record', 'sett', '.', 'demo']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /record has no form sett\. Its forms:/);
  assert.doesNotMatch(unknown.stderr, /did you mean/i);
  assert.equal(run(['record']).status, 0);
  assert.equal(run(['nope']).status, 2);
  // Every help block carries one example.
  const all = spawnSync(process.execPath, ['-e', `import(${JSON.stringify(new URL('../../scripts/wf.mjs', import.meta.url).href)}).then((m) => { for (const c of ['record', 'step', 'decide', 'slice', 'status']) console.log(m.helpText(c)); })`], { encoding: 'utf8' });
  for (const block of all.stdout.split(/\n(?=\S)/).filter((b) => /^[a-z]+ {2,}/.test(b))) assert.match(block, /Example: wf\.mjs/, block.split('\n')[0]);
  const watch = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'yolo-watch.mjs'), 'help'], { encoding: 'utf8' });
  assert.equal(watch.status, 0);
  for (const f of ['note', 'control', 'end', 'line', 'stop-check']) assert.match(watch.stdout, new RegExp(`yolo-watch\.mjs ${f} `));
});

test('the refusals name what they need: the kinds of decide add, the question of consent grant', () => {
  const f = fixture();
  try {
    const kind = run(['decide', 'add', f.root, 'demo', '--key', 'db', '--answer', 'x', '--kind', 'decision']);
    assert.equal(kind.status, 1);
    assert.match(kind.stderr, /the kinds are: answer \(a decision or a choice\), steer/);
    const consent = run(['consent', 'grant', f.root, 'demo']);
    assert.equal(consent.status, 1);
    assert.match(consent.stdout, /ask the person this exact question .*: May I start the next steps of demo on my own/);
    assert.match(consent.stdout, /decide add .* --key consent/);
  } finally { f.done(); }
});

test('slice drop marks the roster, the slice record and the index; slice move gives the slice to another workflow', () => {
  const f = fixture();
  try {
    writeDoc(f.dir, '03-slice-ui.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'ui', status: 'defined' }, body: '## Scope\n\nthe UI\n' });
    run(['record', 'set', f.root, 'demo', 'index', 'selected-slice=docs']);
    const drop = run(['slice', 'drop', f.root, 'demo', 'docs', '--reason', 'covered by api']);
    assert.equal(drop.status, 0, drop.stderr);
    const roster = frontmatterOfDoc(f.dir, '03-slice.md').slices;
    assert.deepEqual(roster.find((s) => s.slug === 'docs'), { slug: 'docs', status: 'dropped', 'drop-reason': 'covered by api' });
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['selected-slice'], 'api', 'the selected slice moves to the next open one');
    assert.equal(run(['slice', 'drop', f.root, 'demo', 'docs', '--reason', 'again']).status, 1);
    assert.match(run(['slice', 'drop', f.root, 'demo', 'api']).stderr, /--reason/);

    const other = path.join(f.root, '.ai', 'workflows', 'demo-ui');
    mkdirSync(other, { recursive: true });
    writeDoc(other, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo-ui', status: 'active' } });
    writeDoc(other, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo-ui', status: 'complete', slices: [] } });
    const move = run(['slice', 'move', f.root, 'demo', 'ui', '--to', 'demo-ui', '--reason', 'its own PR']);
    assert.equal(move.status, 0, move.stderr);
    assert.deepEqual(frontmatterOfDoc(other, '03-slice.md').slices, [{ slug: 'ui', status: 'defined' }]);
    const moved = frontmatterOfDoc(other, '03-slice-ui.md');
    assert.equal(moved['moved-from'], 'demo');
    assert.equal(moved.slug, 'demo-ui');
    assert.equal(frontmatterOfDoc(f.dir, '03-slice.md').slices.find((s) => s.slug === 'ui')['moved-to'], 'demo-ui');
    assert.equal(frontmatterOfDoc(f.dir, '03-slice-ui.md').status, 'dropped');
    // A review after the last open slice routes to ship: the dropped slices do not count.
    assert.equal(run(['record', 'stage-done', f.root, 'demo', 'review', 'api']).status, 0);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-invocation'], '/wf ship demo');
  } finally { f.done(); }
});

test('a stored command with the Git install path in front of /wf reads repaired, and the next write stores it repaired', () => {
  const f = fixture();
  try {
    // A value written by hand, past every repair at the door.
    const state = path.join(f.dir, 'state.yaml');
    writeFileSync(state, `${readFileSync(state, 'utf8').trimEnd()}\nnext-invocation: C:/Program Files/Git/wf ship demo\n`);
    assert.equal(frontmatterOfDoc(f.dir, INDEX_NAME)['next-invocation'], '/wf ship demo');
    assert.equal(run(['record', 'set', f.root, 'demo', 'index', 'status=active']).status, 0);
    assert.match(readFileSync(state, 'utf8'), /next-invocation: \/wf ship demo/);
    writeProgress(f.dir, { run: 'r2', status: 'stopped', resume: 'C:/Program Files/Git/wf yolo demo' });
    assert.equal(JSON.parse(readFileSync(path.join(f.dir, 'progress.json'), 'utf8')).resume, '/wf yolo demo');
  } finally { f.done(); }
});
