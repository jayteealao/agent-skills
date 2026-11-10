// lib/requires-resolve.mjs and `wf.mjs requires`: the inputs of a stage run in one call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { collectRequires } from '../../lib/requires-tables.mjs';
import { referenceOf, resolveRequires } from '../../lib/requires-resolve.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REF_DIR = path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const WF = path.join(PLUGIN_ROOT, 'scripts', 'wf.mjs');

function fixture(index = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-requires-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const fm = { schema: 'sdlc/v1', type: 'index', slug: 'demo', status: 'active', 'current-stage': 'plan', ...index };
  const yaml = (o) => Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
  const put = (name, front, body = '') => {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, front === null ? body : `---\n${yaml({ schema: 'sdlc/v1', slug: 'demo', ...front })}\n---\n${body}`);
  };
  put('00-index.md', fm);
  return { root, dir, put, done: () => rmSync(root, { recursive: true, force: true }) };
}

const run = (f, stage, opts = {}) => resolveRequires({ projectRoot: f.root, referenceDir: REF_DIR, slug: 'demo', stage, ...opts });

test('every Requires table of the reference tree resolves, in every mode it names', () => {
  const { entries, errors } = collectRequires(REF_DIR);
  assert.deepEqual(errors, []);
  assert.ok(entries.length >= 40, `only ${entries.length} tables`);
  const f = fixture({ 'selected-slice': 'api', 'workflow-type': 'fix' });
  try {
    for (const e of entries) {
      assert.equal(referenceOf(REF_DIR, e.stage), e.reference, `${e.stage} names ${e.reference}`);
      const modes = [...new Set(e.rows.filter((r) => r.when.startsWith('mode:')).map((r) => r.when.slice(5)))];
      for (const r of [run(f, e.stage), run(f, e.stage, { modes, resume: true })]) {
        assert.equal(r.ok, true, `${e.reference}: ${r.error}`);
        for (const p of r.procedures) assert.ok(existsSync(p.path), `${e.reference}: ${p.input}`);
        assert.ok(r.procedures.every((p) => typeof p.read === 'boolean'));
      }
      const all = run(f, e.stage, { modes });
      for (const row of e.rows.filter((x) => x.kind === 'procedure' && x.when.startsWith('mode:'))) {
        assert.equal(all.procedures.find((p) => p.input === row.input && p.when === row.when)?.read, true, `${e.reference}: ${row.input} is read under ${row.when}`);
      }
    }
  } finally { f.done(); }
});

test('a stage name, a file name, an intake mode and an unknown stage', () => {
  assert.equal(referenceOf(REF_DIR, 'plan'), 'plan.md');
  assert.equal(referenceOf(REF_DIR, 'plan.md'), 'plan.md');
  assert.equal(referenceOf(REF_DIR, 'intake:fix'), 'intake/fix.md');
  assert.equal(referenceOf(REF_DIR, 'fix'), 'intake/fix.md');
  assert.equal(referenceOf(REF_DIR, 'augment:profile'), 'augment/profile.md');
  assert.equal(referenceOf(REF_DIR, 'campaign'), null, 'a driver has no table');
  assert.equal(referenceOf(REF_DIR, '../SKILL'), null);
  assert.equal(referenceOf(REF_DIR, '_requires'), null);
});

test('conditions: if-present, mode rows from the disk and from the argument, on-resume', () => {
  const f = fixture({ 'selected-slice': 'api' });
  try {
    f.put('02-shape.md', { type: 'shape', status: 'complete' }, '## Acceptance Criteria\n\n- AC-1\n');
    let r = run(f, 'plan');
    assert.equal(r.ok, true);
    assert.equal(r.stop, false);
    assert.deepEqual(r.artifacts.map((a) => a.name), ['00-index.md', '02-shape.md']);
    assert.ok(r.skipped.some((s) => s.input === '02b-design.md' && s.absent), 'an if-present input that is absent is skipped');
    assert.equal(r.procedures.find((p) => p.input === 'design/_lane.md').read, true);
    assert.equal(r.procedures.find((p) => p.input === 'design/_design-context.md').read, false);
    assert.equal(r.procedures.find((p) => p.input === 'augment/profile.md').read, false);
    // A disk fact turns a mode on: 02b-design.md exists, so mode:design applies.
    f.put('02b-design.md', { type: 'design', status: 'complete' }, '## Brief\n\nbig buttons\n');
    r = run(f, 'plan');
    assert.ok(r.modes.some((m) => m.name === 'design' && m.from === 'disk'));
    assert.equal(r.procedures.find((p) => p.input === 'design/_design-context.md').read, true);
    assert.ok(r.artifacts.some((a) => a.name === '02b-design.md'));
    // A mode of the argument applies too.
    r = run(f, 'plan', { modes: ['profile'] });
    assert.equal(r.procedures.find((p) => p.input === 'augment/profile.md').read, true);
    // on-resume: a stage artifact that is not complete means the run resumes.
    r = run(f, 'implement', { slice: 'api' });
    assert.equal(r.resume.applies, false);
    f.put('05-implement-api.md', { type: 'implement', status: 'in-progress', modes: ['reviews'] });
    r = run(f, 'implement', { slice: 'api' });
    assert.equal(r.resume.applies, true);
    assert.match(r.resume.from, /05-implement-api\.md is in-progress/);
    assert.ok(r.modes.some((m) => m.name === 'reviews' && m.from === 'frontmatter'), 'the modes: list of the stage artifact applies');
  } finally { f.done(); }
});

test('sections: only the named sections come back, and a section that is not there is listed', () => {
  const f = fixture({ 'selected-slice': 'api', 'workflow-type': 'fix' });
  try {
    f.put('02-shape.md', { type: 'shape' }, '## Problem\n\nlong story\n\n## Acceptance Criteria\n\n- AC-1 works\n\n## Out of Scope\n\n- sync\n');
    for (const n of ['03-slice-api.md', '04-plan-api.md', '05-implement-api.md']) f.put(n, { status: 'complete' }, '## Steps\n\n1. go\n');
    f.put('01-fix.md', { type: 'fix', status: 'complete' }, '## Repro\n\nclick\n');
    const r = run(f, 'verify', { slice: 'api' });
    assert.equal(r.stop, false);
    const shape = r.artifacts.find((a) => a.name === '02-shape.md');
    assert.deepEqual(shape.sections, ['Acceptance Criteria', 'Non-Functional Requirements', 'Edge Cases / Failure Modes', 'Out of Scope']);
    assert.match(shape.content, /## Acceptance Criteria\n\n- AC-1 works/);
    assert.match(shape.content, /## Out of Scope\n\n- sync/);
    assert.doesNotMatch(shape.content, /long story/);
    assert.deepEqual(shape.absentSections, ['Non-Functional Requirements', 'Edge Cases / Failure Modes']);
    assert.ok(r.missing.some((m) => m.kind === 'section' && !m.stop));
    // `<mode>` is the workflow type: the change mode reads 01-fix.md.
    assert.ok(r.modes.some((m) => m.name === 'change' && m.from === 'disk'));
    assert.ok(r.artifacts.some((a) => a.name === '01-fix.md'));
  } finally { f.done(); }
});

test('a missing required row stops the stage, and the CLI exits 1', () => {
  const f = fixture({ 'selected-slice': 'api' });
  try {
    const r = run(f, 'verify', { slice: 'api' });
    assert.equal(r.stop, true);
    const names = r.missing.filter((m) => m.stop).map((m) => m.input);
    assert.deepEqual(names, ['02-shape.md', '03-slice-api.md', '04-plan-api.md', '05-implement-api.md']);
    assert.ok(r.missing.every((m) => m.when === 'always'));
    // An if-present row that is absent is never a stop.
    assert.ok(!r.missing.some((m) => m.input === 'decisions.yaml'));
    const cli = spawnSync(process.execPath, [WF, 'requires', f.root, 'demo', 'verify', '--slice', 'api'], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.equal(JSON.parse(cli.stdout).stop, true);
    // No slice: a row with <slice> cannot resolve, and says how to fix it.
    const none = resolveRequires({ projectRoot: f.root, referenceDir: REF_DIR, slug: 'demo', stage: 'verify' });
    assert.equal(none.slice, 'api', 'the selected slice of the index is the default');
  } finally { f.done(); }
});

test('the size guard returns the large artifacts as their outline and says so', () => {
  const f = fixture({ 'selected-slice': 'api' });
  try {
    const big = `## Steps\n\n${'x'.repeat(5000)}\n\n## Risks\n\n${'y'.repeat(3000)}\n`;
    f.put('02-shape.md', { type: 'shape' }, '## Acceptance Criteria\n\n- AC-1\n');
    f.put('04-plan.md', { type: 'plan' }, `## Sibling Plans\n\n${'z'.repeat(9000)}\n`);
    f.put('03-slice-api.md', { type: 'slice' }, big);
    const r = run(f, 'plan', { maxBytes: 6000 });
    assert.ok(r.guard.totalBytes > 6000);
    assert.ok(r.guard.returnedBytes <= 6000);
    assert.deepEqual(r.guard.outlined, ['04-plan.md', '03-slice-api.md']);
    const slice = r.artifacts.find((a) => a.name === '03-slice-api.md');
    assert.equal(slice.content, undefined);
    assert.deepEqual(slice.outline.sections.map((s) => s.heading), ['Steps', 'Risks']);
    assert.match(slice.read, /record get .+ demo 03-slice-api\.md --section "<heading>"/);
    assert.ok(r.notes.some((n) => /came back as an outline/.test(n)));
    assert.equal(typeof r.artifacts.find((a) => a.name === '02-shape.md').content, 'string', 'a small artifact keeps its content');
    const cli = spawnSync(process.execPath, [WF, 'requires', f.root, 'demo', 'plan', '--max-bytes', '6000', '--mode', 'design', '--mode', 'profile'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    const out = JSON.parse(cli.stdout);
    assert.deepEqual(out.guard.outlined, ['04-plan.md', '03-slice-api.md']);
    assert.deepEqual(out.modes.filter((m) => m.from === 'argument').map((m) => m.name), ['design', 'profile'], '--mode repeats');
  } finally { f.done(); }
});

test('a project file and the registry of the workflows resolve under the project', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, '.ai', 'workflows', 'INDEX.md'), '# registry\ndemo\tactive\n');
    const r = run(f, 'status');
    assert.equal(r.artifacts.find((a) => a.input === '/.ai/workflows/INDEX.md')?.content, '# registry\ndemo\tactive\n');
    writeFileSync(path.join(f.root, '.ai', 'ship-plan.md'), '---\nschema: sdlc/v1\n---\n## Merge\n\nrebase\n');
    const s = run(f, 'ship');
    assert.ok(s.artifacts.some((a) => a.input === '/.ai/ship-plan.md'));
  } finally { f.done(); }
});
