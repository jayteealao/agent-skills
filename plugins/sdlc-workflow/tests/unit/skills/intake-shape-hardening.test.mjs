// The intake and shape fields in the schema (appetite, review-scope-confirmed,
// none-declared, charter-scenario) and the intake ledger lint of the write hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../../lib/schema-check.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const trees = [
  { name: 'main', root: pluginRoot },
];


// ── shape.md renumber + tooling-question relay ─────────────────────────
// ── input integrity ─────────────────────────────────────────────────────
// ── interview coverage & grounding ─────────────────────────────────────
// ── independence & surfacing ────────────────────────────────────────────
// ── Schema round-trips (main tree owns the schema) ───────────────────────────
test('schema — appetite / review-scope-confirmed / none-declared / charter-scenario validate', () => {
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'schemas', 'frontmatter.schema.json'), 'utf8'));
  const defs = schema.$defs ?? schema.definitions;
  const ajv = { compile: (s) => compile(s, { root: schema }) };
  const idx = defs.indexFrontmatter.properties;

  const appetite = ajv.compile(idx.appetite);
  assert.ok(appetite('small') && appetite('medium') && appetite('large'));
  assert.equal(appetite('xl'), false);

  const rsc = ajv.compile(idx['review-scope-confirmed']);
  assert.ok(rsc(true) && rsc(false));
  assert.equal(rsc('yes'), false);

  // Both ledgers accept the explicit none-declared string AND the entry arrays.
  for (const key of ['intent-risks', 'charter']) {
    const v = ajv.compile(idx[key]);
    assert.ok(v('none-declared'), `${key} must accept none-declared`);
    assert.equal(v('nope'), false, `${key} must reject arbitrary strings`);
  }
  assert.ok(ajv.compile(idx.charter)([{ id: 'C1', commitment: 'x', status: 'honored', 'po-ratified': true }]),
    'charter entries must accept po-ratified');

  const cs = ajv.compile(defs.shapeFrontmatter.properties['charter-scenario']);
  assert.ok(cs('authored') && cs('none — pure library change, no user-facing flow'));
});

// ── Hook — intake ledger lint (main tree only) ───────────────────────────────
const HOOK = path.join(pluginRoot, 'hooks', 'post-write-verify.mjs');

function runHook(input, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
  });
}

const INTAKE_MD = `---
schema: sdlc/v1
type: intake
slug: demo
status: complete
stage-number: 1
created-at: "2026-07-14T12:00:00Z"
updated-at: "2026-07-14T12:05:00Z"
tags: []
refs: {}
next-command: wf-shape
next-invocation: "/wf shape demo"
---
# Intake

## Restated Request
Do the thing.
`;

function writeFixture(dir, indexFrontmatter) {
  mkdirSync(path.join(dir, '.ai', 'workflows', 'demo'), { recursive: true });
  writeFileSync(path.join(dir, '.ai', 'workflows', 'demo', '01-intake.md'), INTAKE_MD, 'utf-8');
  if (indexFrontmatter !== null) {
    writeFileSync(
      path.join(dir, '.ai', 'workflows', 'demo', '00-index.md'),
      `---\n${indexFrontmatter}\n---\n`,
      'utf-8',
    );
  }
}

test('hook — a ledger-less default intake WARNS; none-declared and real ledgers stay silent', () => {
  const cases = [
    // Sibling index with neither ledger nor declaration → advisory warning.
    { index: 'slug: demo', warns: true },
    // Explicit escape → silent.
    { index: 'slug: demo\nintent-risks: none-declared\ncharter: none-declared', warns: false },
    // Real ledgers → silent.
    {
      index: 'slug: demo\nintent-risks:\n  - id: RIM-1\n    risk: x\n    severity: high\n    status: open\ncharter:\n  - id: C1\n    commitment: x\n    status: honored',
      warns: false,
    },
    // No sibling index at all (not a default-mode run in flight) → silent.
    { index: null, warns: false },
  ];
  for (const { index, warns } of cases) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'sdlc-ish-'));
    try {
      writeFixture(tmp, index);
      const result = runHook({ cwd: tmp, tool_input: { file_path: '.ai/workflows/demo/01-intake.md' } }, tmp);
      assert.equal(result.status, 0, result.stderr);
      if (warns) {
        assert.match(result.stdout, /intake ledger lint/, `expected the advisory warning for index=${JSON.stringify(index)}`);
        assert.match(result.stdout, /none-declared/, 'warning must name the escape hatch');
      } else {
        assert.ok(!/intake ledger lint/.test(result.stdout),
          `unexpected warning for index=${JSON.stringify(index)}: ${result.stdout}`);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test('hook — the intake ledger lint never fires on compressed-mode intake artifacts (01-fix.md)', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sdlc-ish-'));
  try {
    mkdirSync(path.join(tmp, '.ai', 'workflows', 'demo'), { recursive: true });
    // Same type: intake, but the compressed-mode filename — exempt by design.
    writeFileSync(path.join(tmp, '.ai', 'workflows', 'demo', '01-fix.md'), INTAKE_MD, 'utf-8');
    writeFileSync(path.join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), '---\nslug: demo\n---\n', 'utf-8');
    const result = runHook({ cwd: tmp, tool_input: { file_path: '.ai/workflows/demo/01-fix.md' } }, tmp);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!/intake ledger lint/.test(result.stdout), `compressed mode must be exempt: ${result.stdout}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ── Stack gate — one table, cited by each stage ──────────────────────────────
test('stack gate — one table in runtime-adapters.md, and each stage cites its column', () => {
  const ref = (name) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', name), 'utf-8');
  const adapters = ref('runtime-adapters.md');
  const section = adapters.slice(adapters.indexOf('## Stack gate'), adapters.indexOf('## Adapter selection'));
  assert.match(section, /\| State \| shape \| slice \| plan \| verify \| probe \|/);
  for (const state of ['missing', 'unconfirmed', 'unconfirmed by policy', 'confirmed']) {
    assert.ok(section.includes(`\n| **${state}** (`), state);
  }
  // Intake leaves the stack unconfirmed on purpose for these modes: a caveat, never a question.
  const policy = section.split('\n').find((l) => l.startsWith('| **unconfirmed by policy**'));
  for (const mode of ['hotfix', 'update-deps', 'adopt']) assert.ok(policy.includes(`\`${mode}\``), mode);
  assert.equal((policy.match(/Ask no question/g) || []).length, 4, 'shape, slice, plan and verify ask no question');
  assert.match(policy, /`stack-source: unconfirmed-auto-detect` and write a caveat in `## Caveats`/);
  for (const stage of ['shape', 'slice', 'plan', 'verify', 'probe']) {
    const text = ref(`${stage}.md`);
    assert.ok(text.includes(`Apply the ${stage} column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate.`), stage);
    assert.doesNotMatch(text, /If `stack\.user-confirmed: false`/, `${stage} keeps no copy of the gate`);
  }
});
