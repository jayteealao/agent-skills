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
  validateSiblingYaml,
} from '../../../lib/schema-validator.mjs';
import {
  classifyRenderState,
  latestMtimeMs,
  latestTreeMtimeMs,
  viewMtimeForSlug,
} from '../../../lib/render-state.mjs';
import {
  isPidAlive,
  pidFileStatus,
  readPidFile,
  removePidFile,
  writePidFile,
} from '../../../lib/pid-file.mjs';
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

test('schema-validator: validates frontmatter and sibling YAML schemas', () => {
  const valid = validateFrontmatter(validIntakeFrontmatter(), { schemaPath: SCHEMA_PATH });
  equal(valid.valid, true);

  const invalid = validateFrontmatter({ schema: 'sdlc/v1', type: 'intake' }, { schemaPath: SCHEMA_PATH });
  equal(invalid.valid, false);
  ok(invalid.errors.some((err) => err.keyword === 'required'));

  const sibling = validateSiblingYaml({
    artifact: 'review-dimension',
    dimension: 'security',
    parent: '07-review.md',
    rev: 1,
    verdict: 'ship',
    summary: 'clean',
    counts: { blocker: 0, high: 0, med: 0, low: 0, nit: 0 },
    findings: [],
  }, { schemaPath: SCHEMA_PATH });
  equal(sibling.valid, true);
});

test('render-state: classifies missing, stale, and fresh views', async () => {
  const tmp = tempDir();
  try {
    const source = join(tmp, 'source.md');
    const view = join(tmp, '.ai', '_view', 'demo', 'INDEX.html');
    mkdirSync(dirname(view), { recursive: true });
    writeFileSync(source, 'source', 'utf-8');
    writeFileSync(view, 'view', 'utf-8');

    const oldDate = new Date('2026-01-01T00:00:00Z');
    const newDate = new Date('2026-01-02T00:00:00Z');
    utimesSync(view, oldDate, oldDate);
    utimesSync(source, newDate, newDate);

    const sourceMtime = await latestMtimeMs([source]);
    const viewMtime = await viewMtimeForSlug(join(tmp, '.ai', '_view'), 'demo');
    deepStrictEqual(classifyRenderState({ latestArtifactMtime: sourceMtime, viewMtime }), {
      action: 'render',
      reason: 'stale',
      stale: true,
    });

    deepStrictEqual(classifyRenderState({ latestArtifactMtime: sourceMtime, viewMtime: null }), {
      action: 'render',
      reason: 'missing',
      stale: true,
    });

    equal(await latestTreeMtimeMs(join(tmp, 'missing')), null);
    deepStrictEqual(classifyRenderState({ latestArtifactMtime: oldDate.getTime(), viewMtime: newDate.getTime() }), {
      action: 'skip',
      reason: 'fresh',
      stale: false,
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pid-file: writes JSON records and checks liveness cross-platform', async () => {
  const tmp = tempDir();
  const pidPath = join(tmp, '.ai', '_view', '.bootstrap.pid');
  try {
    await writePidFile(pidPath, { pid: process.pid, label: 'test' });
    const record = await readPidFile(pidPath);
    equal(record.pid, process.pid);
    equal(record.label, 'test');
    equal(isPidAlive(process.pid), true);
    equal(isPidAlive(-1), false);

    const status = await pidFileStatus(pidPath);
    equal(status.alive, true);
    equal(status.stale, false);

    await removePidFile(pidPath);
    equal(await readPidFile(pidPath), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('config: loads defaults, merges local overrides, validates schema, and hashes stably', async () => {
  const tmp = tempDir();
  try {
    const defaults = await loadConfigWithMeta(tmp);
    equal(defaults.exists, false);
    // Serve config is machine-only (~/.sdlc/hub-config.json) — not in per-repo defaults.
    equal(defaults.config.view.serve, undefined);
    equal(defaults.config.view.hub.enabled, true);
    equal(defaults.config.view.render.concurrency, DEFAULT_SDLC_CONFIG.view.render.concurrency);

    const cfgPath = configPathFor(tmp);
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify({
      view: {
        render: { concurrency: 2 },
        hub: { enabled: false },
      },
      hooks: { autoStage: false },
    }), 'utf-8');

    const loaded = await loadConfigWithMeta(tmp);
    equal(loaded.exists, true);
    equal(loaded.validation.valid, true);
    equal(loaded.config.view.render.concurrency, 2);
    equal(loaded.config.view.render.debounceMs, 2000);
    equal(loaded.config.view.hub.enabled, false);
    equal(loaded.config.hooks.autoStage, false);

    equal(
      configHash({ b: 2, a: { z: true, y: false } }),
      configHash({ a: { y: false, z: true }, b: 2 }),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('config: per-repo view.serve is rejected — serve config is machine-only', async () => {
  const tmp = tempDir();
  try {
    const cfgPath = configPathFor(tmp);
    mkdirSync(dirname(cfgPath), { recursive: true });
    // A repo trying to set serve/daemon options locally is now a schema error
    // (view has additionalProperties:false; serve moved to ~/.sdlc/hub-config.json).
    writeFileSync(cfgPath, JSON.stringify({ view: { serve: { enabled: true, port: 5123 } } }), 'utf-8');
    const loaded = await loadConfigWithMeta(tmp);
    equal(loaded.validation.valid, false, 'view.serve fails per-repo validation');
    ok(loaded.warnings.some((w) => /invalid sdlc config/.test(w)), 'a validation warning is surfaced');
    ok(loaded.validation.errors.some((e) => /additional/i.test(e.message)), 'rejected as an additional property');
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
