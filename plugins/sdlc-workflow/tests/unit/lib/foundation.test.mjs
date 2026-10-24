import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepStrictEqual, equal, match, ok } from 'node:assert/strict';

import { parseFrontmatter, safeParseFrontmatter } from '../../../lib/frontmatter.mjs';
import {
  defaultFrontmatterSchemaPath,
  findFrontmatterBranch,
  loadJsonSchema,
  validateFrontmatter,
  validateFrontmatterFile,
} from '../../../lib/schema-validator.mjs';
import {
  DEFAULT_SDLC_CONFIG,
  configHash,
  configPathFor,
  loadConfigWithMeta,
} from '../../../lib/config.mjs';
import {
  activeWorkflowIndexes,
  scanWorkflowIndexes,
} from '../../../lib/workflow-index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const SCHEMA_PATH = defaultFrontmatterSchemaPath();

function tempDir(prefix = 'sdlc-foundation-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeMd(path, frontmatter, body = 'body\n') {
  mkdirSync(dirname(path), { recursive: true });
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${formatYamlScalar(value)}`)
    .join('\n');
  writeFileSync(path, `---\n${yaml}\n---\n${body}`, 'utf-8');
}

function formatYamlScalar(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(value);
}

function validIntakeFrontmatter() {
  return {
    schema: 'sdlc/v1',
    type: 'intake',
    slug: 'demo-slug',
    status: 'complete',
    'stage-number': 1,
    'created-at': '2026-05-11T12:00:00Z',
    'updated-at': '2026-05-11T12:05:00Z',
    tags: [],
    refs: {},
    'next-command': '/wf shape demo-slug',
    'next-invocation': 'shape',
  };
}

test('frontmatter: parses data, raw matter, and body content', () => {
  const parsed = parseFrontmatter('---\nschema: sdlc/v1\ntype: intake\n---\n# Body\n');
  equal(parsed.data.schema, 'sdlc/v1');
  equal(parsed.data.type, 'intake');
  match(parsed.raw, /schema: sdlc\/v1/);
  match(parsed.content, /# Body/);
});

test('frontmatter: safe parser reports YAML errors without throwing', () => {
  const parsed = safeParseFrontmatter('---\n:\n---\nbody\n');
  equal(parsed.data, null);
  match(parsed.parseError, /<memory>|can not read|end of the stream|missed comma|bad indentation/i);
});

test('schema-validator: selects the same branch layout as the Python verifier', async () => {
  const schema = await loadJsonSchema(SCHEMA_PATH);
  equal(findFrontmatterBranch(schema, 'intake')?.properties?.type?.const, 'intake');
  equal(findFrontmatterBranch(schema, 'design-contract')?.properties?.type?.const, 'design-contract');
  equal(findFrontmatterBranch(schema, 'craft'), null);
});

test('schema-validator: validates frontmatter', () => {
  const valid = validateFrontmatter(validIntakeFrontmatter(), { schemaPath: SCHEMA_PATH });
  equal(valid.valid, true);

  const invalid = validateFrontmatter({ schema: 'sdlc/v1', type: 'intake' }, { schemaPath: SCHEMA_PATH });
  equal(invalid.valid, false);
  ok(invalid.errors.some((err) => err.keyword === 'required'));

});

test('schema-validator: provenance is an accepted optional field (adopt mode)', () => {
  // /wf intake adopt stamps every reconstructed artifact provenance:adopted; the
  // field is documented on the shared `base` def. The per-type branch validator is
  // permissive (this schema uses no additionalProperties:false), so the point of
  // this test is that stamping provenance never breaks validation and that the
  // default (authored / absent) path stays valid.
  for (const provenance of ['adopted', 'authored']) {
    const r = validateFrontmatter(
      { ...validIntakeFrontmatter(), provenance },
      { schemaPath: SCHEMA_PATH },
    );
    equal(r.valid, true);
  }
  // Absent provenance (the authored default) remains valid.
  equal(validateFrontmatter(validIntakeFrontmatter(), { schemaPath: SCHEMA_PATH }).valid, true);
});

test('schema-validator: admits the four wf-docs intermediate artifact types', async () => {
  // The /wf-docs orchestrator writes discover/audit/plan/generate artifacts that
  // claim `schema: sdlc/v1`. Each must select its own branch (so the claim is
  // backed) and require `run-id` (the field that links the four steps to one run).
  const schema = await loadJsonSchema(SCHEMA_PATH);
  const docsTypes = ['docs-discover', 'docs-audit', 'docs-plan', 'docs-generate'];

  for (const type of docsTypes) {
    // 1. The oneOf branch exists and is keyed on the right type const.
    equal(
      findFrontmatterBranch(schema, type)?.properties?.type?.const,
      type,
      `${type}: branch is selectable`,
    );

    // 2. A minimal valid fixture passes.
    const valid = validateFrontmatter({
      schema: 'sdlc/v1',
      type,
      'run-id': '20260603T1200Z',
      status: 'complete',
      'created-at': '2026-06-03T12:00:00Z',
    }, { schemaPath: SCHEMA_PATH });
    equal(valid.valid, true, `${type}: minimal fixture is valid`);

    // 3. Dropping run-id trips the required-field check.
    const missingRunId = validateFrontmatter({
      schema: 'sdlc/v1',
      type,
      status: 'complete',
      'created-at': '2026-06-03T12:00:00Z',
    }, { schemaPath: SCHEMA_PATH });
    equal(missingRunId.valid, false, `${type}: missing run-id is rejected`);
    ok(
      missingRunId.errors.some((err) => err.keyword === 'required'),
      `${type}: reports a required-field error`,
    );
  }
});

test('schema-validator: admits ideation and the five dep-update artifact types', async () => {
  const schema = await loadJsonSchema(SCHEMA_PATH);

  // ideation is keyed on `focus` (no slug / run-id / status).
  equal(findFrontmatterBranch(schema, 'ideation')?.properties?.type?.const, 'ideation');
  equal(
    validateFrontmatter(
      { schema: 'sdlc/v1', type: 'ideation', focus: 'all', 'created-at': '2026-06-04T00:00:00Z' },
      { schemaPath: SCHEMA_PATH },
    ).valid,
    true,
    'ideation: minimal fixture valid',
  );
  const ideationBad = validateFrontmatter(
    { schema: 'sdlc/v1', type: 'ideation', 'created-at': '2026-06-04T00:00:00Z' },
    { schemaPath: SCHEMA_PATH },
  );
  equal(ideationBad.valid, false, 'ideation: missing focus rejected');
  ok(ideationBad.errors.some((err) => err.keyword === 'required'));

  // dep-* run families all require run-id.
  for (const type of ['dep-scan', 'dep-research', 'dep-plan', 'dep-implement', 'dep-verify']) {
    equal(findFrontmatterBranch(schema, type)?.properties?.type?.const, type, `${type}: branch selectable`);
    const valid = validateFrontmatter(
      { schema: 'sdlc/v1', type, 'run-id': '20260604T1200Z', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' },
      { schemaPath: SCHEMA_PATH },
    );
    equal(valid.valid, true, `${type}: minimal fixture valid`);
    const bad = validateFrontmatter(
      { schema: 'sdlc/v1', type, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' },
      { schemaPath: SCHEMA_PATH },
    );
    equal(bad.valid, false, `${type}: missing run-id rejected`);
    ok(bad.errors.some((err) => err.keyword === 'required'), `${type}: required error`);
  }
});

test('config: loads defaults, merges local overrides, validates schema, and hashes stably', async () => {
  const tmp = tempDir();
  try {
    const defaults = await loadConfigWithMeta(tmp);
    equal(defaults.exists, false);
    equal(defaults.config.checks, 'strict');
    equal(defaults.config.view, undefined);
    equal(defaults.config.hooks, undefined);
    equal(defaults.config.checks, DEFAULT_SDLC_CONFIG.checks);

    const cfgPath = configPathFor(tmp);
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({
      checks: 'warn',
      view: { render: { concurrency: 2 } },
      hooks: { autoStage: false },
    }), 'utf-8');

    const loaded = await loadConfigWithMeta(tmp);
    equal(loaded.exists, true);
    equal(loaded.validation.valid, true);
    equal(loaded.config.checks, 'warn');
    equal(loaded.config.view, undefined, 'the old view settings are dropped');
    equal(loaded.config.hooks, undefined, 'the old hook switches are dropped');
    ok(loaded.warnings.some((w) => /no longer read and are ignored: hooks, view/.test(w)));

    equal(
      configHash({ b: 2, a: { z: true, y: false } }),
      configHash({ a: { y: false, z: true }, b: 2 }),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('config: an unknown checks mode fails validation', async () => {
  const tmp = tempDir();
  try {
    const cfgPath = configPathFor(tmp);
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({ checks: 'loud' }), 'utf-8');
    const loaded = await loadConfigWithMeta(tmp);
    equal(loaded.validation.valid, false);
    ok(loaded.warnings.some((w) => /invalid sdlc config/.test(w)));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('config: a retired setting is dropped with one warning and the config stays valid', async () => {
  const tmp = tempDir();
  try {
    const cfgPath = configPathFor(tmp);
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({ campaign: { isolation: { 'build-dirs': ['out'] } }, yolo: { usageBudget: { fiveHourPause: 80 }, protectedFiles: ['a.md'] } }), 'utf-8');
    const loaded = await loadConfigWithMeta(tmp);
    equal(loaded.validation.valid, true, 'the old settings do not fail validation');
    equal(loaded.config.campaign, undefined);
    equal(loaded.config.yolo.usageBudget, undefined);
    deepStrictEqual(loaded.config.yolo.protectedFiles, ['a.md'], 'the other settings stay');
    equal(loaded.warnings.filter((w) => /no longer read and are ignored: campaign, yolo\.usageBudget/.test(w)).length, 1);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('workflow-index: scans active, stale, complete, and invalid workflow indexes', async () => {
  const tmp = tempDir();
  try {
    const root = join(tmp, '.ai', 'workflows');

    const activeIndex = join(root, 'active-flow', '00-index.md');
    writeMd(activeIndex, {
      schema: 'sdlc/v1',
      type: 'index',
      slug: 'active-flow',
      status: 'active',
      title: 'Active flow',
      'current-stage': 'plan',
    });

    const staleIndex = join(root, 'stale-flow', '00-index.md');
    const staleArtifact = join(root, 'stale-flow', '01-intake.md');
    writeMd(staleIndex, {
      schema: 'sdlc/v1',
      type: 'index',
      slug: 'stale-flow',
      status: 'active',
      title: 'Stale flow',
      'current-stage': 'implement',
    });
    writeMd(staleArtifact, { schema: 'sdlc/v1', type: 'intake', slug: 'stale-flow' });

    const completeIndex = join(root, 'done-flow', '00-index.md');
    writeMd(completeIndex, {
      schema: 'sdlc/v1',
      type: 'index',
      slug: 'done-flow',
      status: 'complete',
      title: 'Done flow',
      'current-stage': 'complete',
    });

    const invalidIndex = join(root, 'invalid-flow', '00-index.md');
    mkdirSync(dirname(invalidIndex), { recursive: true });
    writeFileSync(invalidIndex, 'no frontmatter\n', 'utf-8');

    const oldDate = new Date('2026-01-01T00:00:00Z');
    const newDate = new Date('2026-01-02T00:00:00Z');
    utimesSync(staleIndex, oldDate, oldDate);
    utimesSync(staleArtifact, newDate, newDate);

    const workflows = await scanWorkflowIndexes({ projectRoot: tmp });
    equal(workflows.length, 4);

    const bySlug = new Map(workflows.map((workflow) => [workflow.slug, workflow]));
    equal(bySlug.get('active-flow').classification, 'active');
    equal(bySlug.get('stale-flow').classification, 'stale');
    equal(bySlug.get('done-flow').classification, 'complete');
    equal(bySlug.get('invalid-flow').classification, 'invalid');

    deepStrictEqual(
      activeWorkflowIndexes(workflows).map((workflow) => workflow.slug).sort(),
      ['active-flow', 'stale-flow'],
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
