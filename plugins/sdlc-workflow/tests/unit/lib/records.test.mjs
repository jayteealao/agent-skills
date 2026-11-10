// tests/unit/lib/records.test.mjs
//
// The record layout: the place of each old file, the reader of both layouts, the split of
// the index, the check of a draft, and the migration with its redirect map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DRAFT_DIR, clearKept, draftPath, listDocs, locate, markSuperseded, migrateWorkflow, putDraft, readDoc, redirectOf, setFields, writeDoc,
} from '../../../lib/records.mjs';
import { parse } from '../../../lib/yaml.mjs';
import { fieldOf, stampOf } from '../../../scripts/wf.mjs';

function folder() {
  const root = mkdtempSync(join(tmpdir(), 'records-'));
  const dir = join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  return { root, dir };
}

const md = (fm, body = '') => `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${body}`;

test('each file of the old layout has one place', () => {
  assert.deepEqual(locate('00-index.md'), { file: 'state.yaml', section: null, slice: null });
  assert.deepEqual(locate('01-intake.md'), { file: 'intake.yaml', section: 'intake', slice: null });
  assert.deepEqual(locate('01-rca.md'), { file: 'intake.yaml', section: 'rca', slice: null });
  assert.deepEqual(locate('02-shape.md'), { file: 'intake.yaml', section: 'shape', slice: null });
  assert.deepEqual(locate('02c-craft.md'), { file: 'design.yaml', section: 'craft', slice: null });
  assert.deepEqual(locate('03-slice.md'), { file: 'slices.yaml', section: 'slice', slice: null });
  assert.deepEqual(locate('04-plan-cli-json.md'), { file: 'slice-cli-json.yaml', section: 'plan', slice: 'cli-json' });
  assert.deepEqual(locate('06-verify-a.md'), { file: 'slice-a.yaml', section: 'verify', slice: 'a' });
  assert.deepEqual(locate('07-review-a-b-security.md', { slices: ['a', 'a-b'] }), { file: 'review-a-b.yaml', section: 'security', slice: 'a-b' });
  assert.deepEqual(locate('07-review-a-b.md', { slices: ['a', 'a-b'] }), { file: 'review-a-b.yaml', section: 'review', slice: 'a-b' });
  assert.deepEqual(locate('07-design-audit.md'), { file: 'design.yaml', section: 'design-audit', slice: null });
  assert.deepEqual(locate('04b-instrument.md'), { file: 'augment.yaml', section: 'instrument', slice: null });
  assert.deepEqual(locate('09-ship-run-r1.md'), { file: 'ship.yaml', section: 'ship-run-r1', slice: null });
  assert.deepEqual(locate('10-retro.md'), { file: 'retro.yaml', section: 'retro', slice: null });
  assert.equal(locate('risk-register.md'), null);
  assert.equal(redirectOf('05-implement-a.md'), 'slice-a.yaml#implement');
  assert.equal(redirectOf('00-index.md'), 'state.yaml + meta.yaml');
});

test('a reader reads the old file until its section exists, then the section', () => {
  const { root, dir } = folder();
  try {
    writeFileSync(join(dir, '04-plan-a.md'), md({ type: 'plan', status: 'draft' }, '## Step-by-Step Plan\n\n1. one\n'));
    assert.equal(readDoc(dir, '04-plan-a.md').layout, 'md');
    assert.equal(readDoc(dir, '04-plan-a.md').frontmatter.status, 'draft');
    writeDoc(dir, '04-plan-a.md', { frontmatter: { type: 'plan', status: 'complete' }, body: '1. two\n' });
    const doc = readDoc(dir, '04-plan-a.md');
    assert.equal(doc.layout, 'yaml');
    assert.ok(!existsSync(join(dir, '04-plan-a.md')) && existsSync(join(dir, '.old', '04-plan-a.md')), 'the first write retires the old file');
    assert.deepEqual(parse(readFileSync(join(dir, 'redirects.yaml'), 'utf8')).redirects, [{ from: '04-plan-a.md', to: 'slice-a.yaml#plan' }]);
    assert.equal(doc.frontmatter.status, 'complete');
    assert.equal(doc.body, '1. two\n');
    const file = parse(readFileSync(join(dir, 'slice-a.yaml'), 'utf8'));
    assert.equal(file.schema, 'sdlc/v2');
    assert.equal(file.slice, 'a');
    assert.equal(file.sections.plan.name, '04-plan-a.md');
    assert.equal(readDoc(dir, '05-implement-a.md'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the index splits into a hot state file and a cold meta file, and reads back whole', () => {
  const { root, dir } = folder();
  try {
    const fm = { schema: 'sdlc/v1', type: 'index', slug: 'demo', title: 'Demo', status: 'active', 'current-stage': 'plan', 'base-branch': 'main', tags: ['x'] };
    writeDoc(dir, '00-index.md', { frontmatter: fm, body: 'notes\n' });
    const state = parse(readFileSync(join(dir, 'state.yaml'), 'utf8'));
    const meta = parse(readFileSync(join(dir, 'meta.yaml'), 'utf8'));
    assert.equal(state['current-stage'], 'plan');
    assert.equal(state.title, undefined);
    assert.equal(meta.title, 'Demo');
    assert.equal(meta['current-stage'], undefined);
    const back = readDoc(dir, '00-index.md');
    assert.deepEqual(Object.keys(back.frontmatter).sort(), Object.keys(fm).sort());
    assert.equal(back.body, 'notes\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('setFields merges into a record and deletes a null field', () => {
  const { root, dir } = folder();
  try {
    writeDoc(dir, '00-index.md', { frontmatter: { slug: 'demo', status: 'active', 'updated-at': 'old', 'pr-url': 'x' } });
    const fm = setFields(dir, '00-index.md', { 'current-stage': 'verify', 'pr-url': null, 'progress.plan': 'complete' }, { now: 'T' });
    assert.equal(fm['current-stage'], 'verify');
    assert.deepEqual(fm.progress, { plan: 'complete' });
    assert.deepEqual(setFields(dir, '00-index.md', { 'progress.verify': 'in-progress' }).progress, { plan: 'complete', verify: 'in-progress' });
    assert.equal(fm['updated-at'], 'T');
    assert.equal(readDoc(dir, '00-index.md').frontmatter['pr-url'], undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('record set undoes the Git Bash path conversion of a leading /wf, and nothing else', () => {
  const quiet = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.deepEqual(fieldOf('next-invocation=C:/Program Files/Git/wf implement demo s1'), ['next-invocation', '/wf implement demo s1']);
    assert.deepEqual(fieldOf('next-command=D:\\Tools\\Git\\wf'), ['next-command', '/wf']);
    assert.deepEqual(fieldOf('next-command=/wf plan demo'), ['next-command', '/wf plan demo']);
    assert.deepEqual(fieldOf('note=C:/Program Files/Git/usr/bin'), ['note', 'C:/Program Files/Git/usr/bin']);
    assert.deepEqual(fieldOf('note=C:/Program Files/Git/wfx'), ['note', 'C:/Program Files/Git/wfx']);
  } finally { process.stderr.write = quiet; }
});

test('a superseded decision marks every record that names it', () => {
  const { root, dir } = folder();
  try {
    writeDoc(dir, '04-plan-a.md', { frontmatter: { type: 'plan' }, body: 'Per D-003, use the queue.\n' });
    writeDoc(dir, '04-plan-b.md', { frontmatter: { type: 'plan', refs: { decision: 'D-0031' } }, body: 'none\n' });
    assert.deepEqual(markSuperseded(dir, ['D-003'], 'D-007'), ['04-plan-a.md']);
    assert.deepEqual(readDoc(dir, '04-plan-a.md').frontmatter['superseded-decisions'], { 'D-003': 'D-007' });
    assert.equal(readDoc(dir, '04-plan-b.md').frontmatter['superseded-decisions'], undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a good draft is written into its section and deleted; a bad draft stays', () => {
  const { root, dir } = folder();
  try {
    mkdirSync(join(dir, DRAFT_DIR));
    const good = draftPath(dir, '04-plan-a.md');
    writeFileSync(good, `${stampOf('plan', { slug: 'demo', slice: 'a' })}\n## Step-by-Step Plan\n\n1. one\n`);
    const r = putDraft(dir, good);
    assert.deepEqual(r.errors, []);
    assert.equal(r.file, 'slice-a.yaml');
    assert.equal(existsSync(good), false);
    assert.match(readDoc(dir, '04-plan-a.md').body, /1\. one/);

    const bad = draftPath(dir, '05-implement-a.md');
    writeFileSync(bad, md({ schema: 'sdlc/v1', type: 'implement', slug: 'other' }));
    const b = putDraft(dir, bad);
    assert.ok(b.errors.some((e) => /slug other/.test(e)));
    assert.ok(existsSync(bad));
    assert.equal(readDoc(dir, '05-implement-a.md'), null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('migration moves the old files to .old/, writes the redirect map, and keeps unknown files', () => {
  const { root, dir } = folder();
  try {
    writeFileSync(join(dir, '00-index.md'), md({ schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', title: 'T' }));
    writeFileSync(join(dir, '03-slice.md'), md({ type: 'slice-index', slices: ['a'] }));
    writeFileSync(join(dir, '07-review-a-security.md'), md({ type: 'review-command' }, 'sec\n'));
    writeFileSync(join(dir, 'risk-register.md'), md({ type: 'risk-register' }));
    const before = listDocs(dir);
    const r = migrateWorkflow(dir, { now: 'T' });
    assert.deepEqual(r.kept, []);
    assert.deepEqual(listDocs(dir), before);
    assert.ok(existsSync(join(dir, '.old', '07-review-a-security.md')));
    assert.ok(existsSync(join(dir, 'risk-register.md')));
    assert.equal(readDoc(dir, '07-review-a-security.md').body, 'sec\n');
    const map = parse(readFileSync(join(dir, 'redirects.yaml'), 'utf8')).redirects;
    assert.deepEqual(map.find((m) => m.from === '07-review-a-security.md'), { from: '07-review-a-security.md', to: 'review-a.yaml#security' });
    assert.equal(readDoc(dir, '00-index.md').frontmatter.title, 'T');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a record file that does not parse refuses a write and names the file; put and set exit non-zero', () => {
  const { root, dir } = folder();
  try {
    writeDoc(dir, '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'intake' } });
    writeDoc(dir, '01-intake.md', { frontmatter: { schema: 'sdlc/v1', type: 'intake', slug: 'demo' }, body: 'the intake\n' });
    const broken = 'schema: sdlc/record/v1\nsections:\n  intake: [unclosed\n';
    writeFileSync(join(dir, 'intake.yaml'), broken);
    assert.throws(() => writeDoc(dir, '01-rca.md', { frontmatter: { slug: 'demo' }, body: 'x\n' }), /intake\.yaml does not parse.*repair it first/);
    assert.throws(() => setFields(dir, '01-intake.md', { title: 'x' }), /intake\.yaml does not parse/);
    assert.equal(readFileSync(join(dir, 'intake.yaml'), 'utf8'), broken, 'the file is left as it was');

    const wf = join(import.meta.dirname, '..', '..', '..', 'scripts', 'wf.mjs');
    mkdirSync(join(dir, DRAFT_DIR), { recursive: true });
    writeFileSync(draftPath(dir, '01-brainstorm.md'), md({ schema: 'sdlc/v1', type: 'brainstorm', slug: 'demo', topic: 't', status: 'open', 'created-at': '2026-11-10T00:00:00Z' }, 'the ideas\n'));
    const put = spawnSync(process.execPath, [wf, 'record', 'put', root, 'demo', '01-brainstorm.md'], { encoding: 'utf8' });
    assert.equal(put.status, 1);
    assert.match(put.stdout, /refused 01-brainstorm\.md: .*intake\.yaml does not parse/);
    assert.ok(existsSync(draftPath(dir, '01-brainstorm.md')), 'the draft stays for the next try');
    const set = spawnSync(process.execPath, [wf, 'record', 'set', root, 'demo', '01-intake.md', 'title=x'], { encoding: 'utf8' });
    assert.notEqual(set.status, 0);
    assert.match(set.stderr + set.stdout, /intake\.yaml does not parse/);
    assert.equal(readFileSync(join(dir, 'intake.yaml'), 'utf8'), broken);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('four processes that set other fields of one record at once lose no field', async () => {
  const { root, dir } = folder();
  try {
    writeDoc(dir, '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'intake' } });
    const lib = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'lib', 'records.mjs')).href;
    const code = (n) => `const { setFields } = await import(${JSON.stringify(lib)}); for (let i = 0; i < 10; i++) setFields(${JSON.stringify(dir)}, '00-index.md', { ['note-${n}-' + i]: 'v' });`;
    const codes = await Promise.all([0, 1, 2, 3].map((n) => new Promise((res) => {
      spawn(process.execPath, ['--input-type=module', '-e', code(n)], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', res);
    })));
    assert.deepEqual(codes, [0, 0, 0, 0]);
    const fm = readDoc(dir, '00-index.md').frontmatter;
    assert.equal(Object.keys(fm).filter((k) => k.startsWith('note-')).length, 40);
    assert.deepEqual(readdirSync(dir).filter((f) => /\.tmp$|\.lock$/.test(f)), [], 'no temp file or lock is left');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the kept drafts of slice api go at its stage-done; those of slice public-api stay', () => {
  const { root, dir } = folder();
  try {
    writeDoc(dir, '03-slice.md', { frontmatter: { schema: 'sdlc/v1', type: 'slice-index', slug: 'demo', slices: ['api', 'public-api'] } });
    const kept = join(dir, DRAFT_DIR, '.put');
    mkdirSync(kept, { recursive: true });
    for (const n of ['05-implement-api.md', '05-implement-public-api.md', '06-verify-public-api.md']) writeFileSync(join(kept, n), 'x');
    assert.equal(clearKept(dir, { slice: 'api' }), 1);
    assert.deepEqual(readdirSync(kept).sort(), ['05-implement-public-api.md', '06-verify-public-api.md']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('four sessions that refresh other rows of INDEX.md at once keep every row', async () => {
  const root = mkdtempSync(join(tmpdir(), 'index-race-'));
  try {
    const wfRoot = join(root, '.ai', 'workflows');
    const slugs = ['a', 'b', 'c', 'd'];
    for (const s of slugs) writeDoc(join(wfRoot, s), '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: s, status: 'active', 'current-stage': 'intake' } });
    const { reconcileIndex } = await import('../../../scripts/wf.mjs');
    await reconcileIndex(root);
    for (const s of slugs) setFields(join(wfRoot, s), '00-index.md', { branch: `feat/${s}` });
    const wf = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'scripts', 'wf.mjs')).href;
    // The four start together, after their imports, and each refreshes its row many times.
    const at = Date.now() + 3000;
    const lib = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'lib', 'records.mjs')).href;
    const dirOf = (s) => JSON.stringify(join(wfRoot, s));
    const code = (s) => `const { refreshIndexRow } = await import(${JSON.stringify(wf)}); const { setFields } = await import(${JSON.stringify(lib)}); while (Date.now() < ${at}); for (let i = 0; i < 40; i++) { setFields(${dirOf(s)}, '00-index.md', { branch: 'feat/${s}-' + i }); await refreshIndexRow(${JSON.stringify(root)}, '${s}'); }`;
    const codes = await Promise.all(slugs.map((s) => new Promise((res) => {
      spawn(process.execPath, ['--input-type=module', '-e', code(s)], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', res);
    })));
    assert.deepEqual(codes, [0, 0, 0, 0]);
    const rows = readFileSync(join(wfRoot, 'INDEX.md'), 'utf8').split('\n').filter((l) => /^[a-d]\t/.test(l));
    assert.equal(rows.length, 4);
    for (const r of rows) assert.match(r, /\tfeat\/[a-d]-39\t/, `every row has its last refresh: ${r}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
