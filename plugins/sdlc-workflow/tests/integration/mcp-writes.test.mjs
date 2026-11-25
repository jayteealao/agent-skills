// The typed writes of the wf MCP server, called in-process on the code-mode fixture: a refusal
// has the text of the CLI, content goes inline with no file, wf_read runs short items together,
// and writers that run at the same time lose no change.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';
import { callTool } from '../../mcp/tools.mjs';
import { docText, frontmatterOfDoc } from '../../lib/records.mjs';
import { permissionFlag } from '../../lib/ops/code-host.mjs';

let top;
let saved;
before(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-writes-')));
  saved = { ...process.env };
  Object.assign(process.env, { SDLC_HOME: join(top, 'home'), SDLC_RECORDS_PUSH: 'off' });
  delete process.env.WF_ACTOR;
});
after(() => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  rmSync(top, { recursive: true, force: true, maxRetries: 5 });
});

let n = 0;
const fresh = () => makeFixture(join(top, `r${(n += 1)}`));
const cli = (f, argv) => spawnSync(process.execPath, [join(PLUGIN_ROOT, 'scripts', 'wf.mjs'), ...argv], { cwd: f.root, encoding: 'utf8', env: { ...process.env, WF_ACTOR: 'agent' } });
const cliError = (r) => r.stderr.split(/\r?\n/).filter((l) => l && !/^fix(\.\w+)?:/.test(l)).join('\n').replace(/^wf\.mjs:\s*/gm, '');
const status = (f, s) => frontmatterOfDoc(f.dir, '03-slice.md').slices.find((x) => x.slug === s).status;

test('a refusal of a tool has the text of the CLI', async () => {
  const f = fresh();
  const cases = [
    ['wf_decide', { op: 'add', slug: SLUG, kind: 'answer', key: 'x', question: 'Which?', answer: 'a', by: 'person' }, ['decide', 'add', '.', SLUG, '--kind', 'answer', '--key', 'x', '--question', 'Which?', '--answer', 'a', '--by', 'person']],
    ['wf_run', { op: 'record set', slug: SLUG, name: '03-slice', path: 'slices[s4].status=bogus' }, ['record', 'set', '.', SLUG, '03-slice', 'slices[s4].status=bogus']],
    ['wf_run', { op: 'slice drop', slug: SLUG, slice: 'nope', reason: 'r' }, ['slice', 'drop', '.', SLUG, 'nope', '--reason', 'r']],
  ];
  for (const [tool, args, argv] of cases) {
    const t = await callTool(tool, args, { root: f.root });
    const c = cli(f, argv);
    assert.equal(t.ok, false, tool);
    assert.notEqual(c.status, 0);
    assert.equal(t.error.message, cliError(c), argv.join(' '));
  }
});

test('content goes inline: record put, findings add, decide add_many, and no file is left', async () => {
  const f = fresh();
  const got = await callTool('wf_read', { slug: SLUG, items: [{ record: '03-slice' }] }, { root: f.root });
  assert.equal(got.ok, true, JSON.stringify(got));
  const text = docText(got.data[0].data);
  assert.match(text, /^---\n/);
  const put = await callTool('wf_run', { op: 'record put', slug: SLUG, records: { '03-slice': `${text.trimEnd()}\n\nA line put inline.\n` } }, { root: f.root });
  assert.equal(put.ok, true, JSON.stringify(put));
  assert.match((await callTool('wf_read', { slug: SLUG, items: [{ record: '03-slice' }] }, { root: f.root })).data[0].data.body, /A line put inline\./);
  const bad = await callTool('wf_run', { op: 'record put', slug: SLUG, records: { '../x': 'y' } }, { root: f.root });
  assert.match(bad.error.message, /no record name/);

  const found = await callTool('wf_run', { op: 'findings add', slug: SLUG, source: 'review', found: [{ severity: 'HIGH', file: 'src/a.js', line: 3, issue: 'A bug put inline', dimension: 'correctness' }] }, { root: f.root });
  assert.equal(found.ok, true, JSON.stringify(found));
  const list = await callTool('wf_read', { slug: SLUG, items: [{ findings: { open: true } }] }, { root: f.root });
  assert.match(JSON.stringify(list.data[0].data), /A bug put inline/);

  const many = await callTool('wf_decide', { op: 'add_many', slug: SLUG, entries: [
    { kind: 'answer', key: 'cache', question: 'Which cache?', answer: 'redis', by: 'stage' },
    { kind: 'answer', key: 'queue', question: 'Which queue?', answer: 'sqs', by: 'stage' },
  ] }, { root: f.root });
  assert.equal(many.ok, true, JSON.stringify(many));
  const keys = (await callTool('wf_read', { slug: SLUG, items: [{ decisions: true }] }, { root: f.root })).data[0].data;
  assert.ok(['cache', 'queue'].every((k) => JSON.stringify(keys).includes(`"${k}"`)), JSON.stringify(keys).slice(0, 300));

  const both = await callTool('wf_run', { op: 'findings add', slug: SLUG, found: [], 'found-json': 'x.json' }, { root: f.root });
  assert.match(both.error.message, /not both/);
  const inline = join(f.dir, '.draft', '.inline');
  assert.deepEqual(existsSync(inline) ? readdirSync(inline) : [], [], 'no inline file is left');
});

test('wf_read runs short items together, and one bad item fails alone', async () => {
  const f = fresh();
  const r = await callTool('wf_read', { slug: SLUG, items: [
    { record: '03-slice', field: 'slices[s4].status' }, { decisions: { kind: 'answer' } }, { findings: true },
    { op: 'step where', slice: 's3' }, { record: 'no-such-record' }, {},
  ] }, { root: f.root });
  assert.equal(r.ok, false);
  assert.deepEqual(r.data.map((d) => d.ok), [true, true, true, true, false, false]);
  assert.equal(String(r.data[0].data).trim(), 'defined');
  assert.match(r.data[5].error.message, /needs op/);
});

test('writers at the same time lose no change', async () => {
  const f = fresh();
  const slices = ['s1', 's2', 's3', 's4', 's5', 's6'];
  const rs = await Promise.all(slices.map((s) => callTool('wf_run', { op: 'record set', slug: SLUG, name: '03-slice', path: `slices[${s}].status=deferred` }, { root: f.root })));
  assert.ok(rs.every((r) => r.ok), JSON.stringify(rs.find((r) => !r.ok)));
  assert.deepEqual(slices.map((s) => status(f, s)), slices.map(() => 'deferred'));

  const keys = ['k1', 'k2', 'k3', 'k4', 'k5'];
  const held = await Promise.all(keys.map((key) => callTool('wf_decide', { op: 'hold', slug: SLUG, key, question: `Which ${key}?`, stage: 'plan' }, { root: f.root })));
  assert.ok(held.every((r) => r.ok), JSON.stringify(held.find((r) => !r.ok)));
  const open = frontmatterOfDoc(f.dir, '00-index.md')['open-questions'].map((q) => (typeof q === 'object' ? q.key : q));
  assert.ok(keys.every((k) => open.includes(k)), `every held question is open: ${open.join(', ')}`);
});

test('a code run that keeps nothing does not undo a write of another writer', { skip: permissionFlag() ? false : 'no permission model in this Node' }, async () => {
  const f = fresh();
  const code = "wf.records.set('03-slice', 'slices[s4].status', 'in-progress'); await new Promise((r) => setTimeout(r, 4000)); return 1";
  const running = callTool('wf_run', { slug: SLUG, dryRun: true, code }, { root: f.root });
  const deadline = Date.now() + 30_000;
  while (status(f, 's4') !== 'in-progress' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.equal(status(f, 's4'), 'in-progress', 'the code wrote first');
  const other = cli(f, ['record', 'set', '.', SLUG, '03-slice', 'slices[s5].status=deferred']);
  assert.equal(other.status, 0, other.stderr);
  const r = await running;
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.applied, false);
  assert.equal(status(f, 's5'), 'deferred', 'the write of the other writer stays');
  assert.ok(r.kept?.length && r.warnings.length, JSON.stringify(r));

  const alone = await callTool('wf_run', { slug: SLUG, dryRun: true, code: "wf.records.set('03-slice', 'slices[s6].status', 'in-progress'); return 1" }, { root: f.root });
  assert.equal(alone.kept, undefined);
  assert.equal(status(f, 's6'), 'defined', 'with no other writer, the dry run puts the file back');
});
