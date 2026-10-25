// The library of `wf.mjs run`: each function of lib/wf-api.mjs, all or nothing, the dry run, a
// refused write with the CLI message, a script path outside the project, the run log, and a
// describe that names every form of the header.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { API_LOG, openWorkflow, runScript } from '../../lib/wf-api.mjs';
import { INDEX_NAME, frontmatterOfDoc, writeDoc } from '../../lib/records.mjs';
import { describeAll, helpText } from '../../scripts/wf.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wfCli = path.join(pluginRoot, 'scripts', 'wf.mjs');
const home = path.join(tmpdir(), 'sdlc-api-home');
const cli = (args) => spawnSync(process.execPath, [wfCli, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: home } });

function fixture() {
  process.env.SDLC_HOME = home;
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-api-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'verify', 'updated-at': '2026-10-25T10:00:00Z', 'open-questions': ['db'] } });
  writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', status: 'complete', slices: [{ slug: 'api', status: 'defined' }, { slug: 'ui', status: 'defined' }] } });
  const metrics = Object.fromEntries(['checks-run', 'checks-passed', 'acceptance-met', 'acceptance-total', 'interactive-checks-run', 'interactive-checks-passed', 'issues-found'].map((k) => [`metric-${k}`, 0]));
  writeDoc(dir, '06-verify-api.md', { frontmatter: { schema: 'sdlc/v1', type: 'verify', slug: 'demo', 'slice-slug': 'api', status: 'complete', 'stage-number': 6, 'created-at': '2026-10-25T10:00:00Z', 'updated-at': '2026-10-25T10:00:00Z', result: 'pass', convergence: 'converged', ...metrics, 'evidence-dir': '', tags: [], refs: {}, 'next-command': '', 'next-invocation': '' } });
  const doc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  const board = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(doc)[1]);
  Object.assign(board, { slug: 'demo', 'updated-at': '2026-10-25T10:00:00Z' });
  writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(board, null, 2));
  const script = (name, text) => {
    const file = path.join(dir, '.draft', name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
  return { root, dir, script, index: () => frontmatterOfDoc(dir, INDEX_NAME), done: () => rmSync(root, { recursive: true, force: true }) };
}

test('records: get, getMany, fields, list, set, put and draft', () => {
  const f = fixture();
  try {
    const wf = openWorkflow(f.root, 'demo');
    assert.equal(wf.records.get('index').frontmatter.status, 'active');
    assert.equal(wf.records.get('09-nope'), null);
    assert.deepEqual(Object.keys(wf.records.getMany(['03-slice', '06-verify-api'])), ['03-slice.md', '06-verify-api.md']);
    assert.deepEqual(wf.records.fields('06-verify-api', ['result', 'convergence', 'missing']), { result: 'pass', convergence: 'converged', missing: null });
    assert.ok(wf.records.list().includes('03-slice.md'));
    wf.records.set('03-slice', 'slices[ui].status', 'in-progress');
    wf.records.set('index', 'workflow-files+', '03-slice.md');
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.map((s) => s.status), ['defined', 'in-progress']);
    assert.deepEqual(f.index()['workflow-files'], ['03-slice.md']);
    const fm = { ...wf.records.get('06-verify-api').frontmatter, result: 'fail' };
    wf.records.put('06-verify-api', { frontmatter: fm, body: '# Verify\n' });
    assert.equal(frontmatterOfDoc(f.dir, '06-verify-api.md').result, 'fail');
    const draft = wf.records.draft('03-slice');
    assert.match(readFileSync(draft, 'utf8'), /slice-index/);
  } finally { f.done(); }
});

test('a refused write throws the message of the CLI', () => {
  const f = fixture();
  try {
    const wf = openWorkflow(f.root, 'demo');
    const bad = cli(['record', 'set', f.root, 'demo', '03-slice', 'slices[ui].status=finished']);
    assert.equal(bad.status, 1);
    const cliMessage = /wf\.mjs: (.*)/.exec(bad.stderr)[1];
    assert.throws(() => wf.records.set('03-slice', 'slices[ui].status', 'finished'), (e) => e.message === cliMessage);
    assert.throws(() => wf.records.put('06-verify-api', { frontmatter: { type: 'verify' } }), /record put: refused 06-verify-api\.md/);
    assert.throws(() => openWorkflow(f.root, 'nope'), /no workflow folder/);
  } finally { f.done(); }
});

test('decisions: add settles the question, addMany, list and answered', () => {
  const f = fixture();
  try {
    const wf = openWorkflow(f.root, 'demo');
    const r = wf.decisions.add({ kind: 'answer', key: 'db', question: 'Which database?', answer: 'postgres', by: 'person' });
    assert.equal(r.settled, true);
    assert.deepEqual(f.index()['open-questions'], []);
    wf.decisions.addMany([{ kind: 'answer', key: 'auth', question: 'Auth?', answer: 'oauth', by: 'person' }, { kind: 'answer', key: 'db', question: 'Which database?', answer: 'sqlite', by: 'person' }]);
    assert.deepEqual(wf.decisions.list().map((d) => [d.key, d.answer]).sort(), [['auth', 'oauth'], ['db', 'sqlite']]);
    assert.equal(wf.decisions.list({ all: true }).length, 3);
    const a = wf.decisions.answered(['db', 'cache']);
    assert.equal(a.db.answer, 'sqlite');
    assert.equal(a.cache, null);
  } finally { f.done(); }
});

test('findings, status, steps and board', async () => {
  const f = fixture();
  try {
    const wf = openWorkflow(f.root, 'demo');
    const add = wf.findings.add([{ dimension: 'correctness', severity: 'HIGH', issue: 'a bug', file: 'a.js', line: 3 }], { source: 'review', dimensions: ['correctness'] });
    assert.equal(add.added.length, 1);
    const [one] = wf.findings.list({ open: true });
    assert.equal(wf.findings.set(one.id, { status: 'fixed' }).status, 'fixed');
    assert.equal(wf.findings.list({ open: true }).length, 0);
    const s = await wf.status.summary();
    assert.equal(s.stage, 'verify');
    assert.deepEqual(s.slices.map((x) => [x.slice, x.result]), [['api', 'pass'], ['ui', null]]);
    assert.deepEqual(wf.steps.where(), { slice: null });
    wf.board.add('item', { key: 'cap-per-run', kind: 'idea', thread: 'limit-per-project', text: 'A cap per run.', source: 'person' });
    wf.board.move(['cap-per-run', 'limit-is-one-number'], null, { newThread: { key: 'caps', name: 'Spending caps', area: 'seeing-the-cost' } });
    assert.deepEqual(wf.board.items({ thread: 'caps' }).map((i) => i.key), ['limit-is-one-number', 'cap-per-run']);
    wf.board.add('area', { key: 'limits', name: 'Limits', side: 'solution' });
    wf.board.regroup(['caps'], 'limits');
    wf.board.remove(['cap-per-run']);
    assert.ok(!wf.board.items().some((i) => i.key === 'cap-per-run'));
  } finally { f.done(); }
});

test('a script that throws applies nothing and names the operation that failed', async () => {
  const f = fixture();
  try {
    const slices = () => JSON.stringify(frontmatterOfDoc(f.dir, '03-slice.md'));
    const before = slices();
    const r = await runScript(f.root, async ({ wf }) => {
      wf.records.set('03-slice', 'slices[api].status', 'in-progress');
      wf.decisions.add({ kind: 'answer', key: 'db', question: 'q', answer: 'a', by: 'person' });
      wf.records.set('03-slice', 'slices[ui].status', 'finished');
    }, { slug: 'demo', script: 'bad.mjs' });
    assert.equal(r.ok, false);
    assert.equal(r.failedOp, 'records.set 03-slice.md');
    assert.equal(slices(), before);
    assert.ok(!existsSync(path.join(f.dir, 'decisions.yaml')), 'the new file is gone too');
    assert.deepEqual(f.index()['open-questions'], ['db']);
  } finally { f.done(); }
});

test('wf.mjs run: the result, the dry run, the run log, and a script outside the project', () => {
  const f = fixture();
  try {
    const file = f.script('slices.mjs', `export default async function ({ wf, args }) {
  for (const s of ['api', 'ui']) wf.records.set('03-slice', \`slices[\${s}].status\`, args[0]);
  return wf.records.list().filter((n) => n.startsWith('06-verify-')).map((n) => wf.records.fields(n, ['result']));
}
`);
    const dry = cli(['run', f.root, file, 'in-progress', '--slug', 'demo', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stderr, /dry run: 2 change\(s\), none applied:\n {2}demo: records\.set 03-slice\.md \(slices\[api\]\.status\)/);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.map((s) => s.status), ['defined', 'defined']);
    const real = cli(['run', f.root, path.relative(f.root, file), 'in-progress', '--slug', 'demo', '--json']);
    assert.equal(real.status, 0, real.stderr);
    const out = JSON.parse(real.stdout);
    assert.deepEqual(out.value, [{ result: 'pass' }]);
    assert.deepEqual([out.applied, out.changed], [true, ['demo']]);
    assert.deepEqual(frontmatterOfDoc(f.dir, '03-slice.md').slices.map((s) => s.status), ['in-progress', 'in-progress']);
    const log = readFileSync(path.join(f.dir, API_LOG), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const sets = log.filter((l) => l.op === 'records.set');
    assert.deepEqual(sets.map((l) => l.applied), [false, false, true, true]);
    assert.deepEqual(sets[2].keys, ['slices[api].status']);
    assert.ok(!JSON.stringify(log).includes('in-progress'), 'the log holds no value');
    assert.deepEqual(Object.keys(sets[2]).sort(), ['applied', 'at', 'keys', 'op', 'record', 'script', 'slug', 'write']);

    const outside = path.join(tmpdir(), `outside-${process.pid}.mjs`);
    writeFileSync(outside, 'export default async () => 1;\n');
    try {
      const refused = cli(['run', f.root, outside]);
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /is outside the project/);
    } finally { rmSync(outside, { force: true }); }
    const thrown = cli(['run', f.root, f.script('bad.mjs', "export default async ({ wf }) => { wf.records.set('03-slice', 'slices[ui].status', 'finished'); };\n"), '--slug', 'demo']);
    assert.equal(thrown.status, 1);
    assert.match(thrown.stderr, /the operation that failed: records\.set 03-slice\.md\nwf\.mjs: run: nothing was applied/);
  } finally { f.done(); }
});

test('describe names every form of the header and every function of the library', () => {
  const d = describeAll();
  const commands = /Commands: (.*)/.exec(helpText())[1].split(', ');
  for (const c of commands) assert.ok(d.cli.some((e) => e.name === c), `describe has no ${c}`);
  assert.ok(d.cli.every((e) => e.example), 'each CLI form has an example');
  const f = fixture();
  try {
    const wf = openWorkflow(f.root, 'demo');
    for (const ns of ['records', 'decisions', 'findings', 'status', 'steps', 'board']) {
      for (const fn of Object.keys(wf[ns])) assert.ok(d.api.some((e) => e.name.startsWith(`wf.${ns}.${fn}(`)), `describe has no wf.${ns}.${fn}`);
    }
    assert.ok(d.api.every((e) => e.example), 'each function has an example');
  } finally { f.done(); }
  const text = cli(['describe']);
  assert.equal(text.status, 0);
  assert.match(text.stdout, /^API: wf\.mjs run/m);
});
