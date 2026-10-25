// tests/unit/lib/records.test.mjs
//
// The record layout: the place of each old file, the reader of both layouts, the split of
// the index, the check of a draft, and the migration with its redirect map.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DRAFT_DIR, draftPath, listDocs, locate, migrateWorkflow, putDraft, readDoc, redirectOf, setFields, writeDoc,
} from '../../../lib/records.mjs';
import { parse } from '../../../lib/yaml.mjs';
import { stampOf } from '../../../scripts/wf.mjs';

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
    const fm = setFields(dir, '00-index.md', { 'current-stage': 'verify', 'pr-url': null }, { now: 'T' });
    assert.equal(fm['current-stage'], 'verify');
    assert.equal(fm['updated-at'], 'T');
    assert.equal(readDoc(dir, '00-index.md').frontmatter['pr-url'], undefined);
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
