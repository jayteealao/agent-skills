import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import {
  defaultFrontmatterSchemaPath,
  validateFrontmatter,
} from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const SCHEMA_PATH = defaultFrontmatterSchemaPath();

function tempDir(prefix = 'sdlc-phase3-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

function md(frontmatter, body = 'Body\n') {
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${yamlValue(value)}`)
    .join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(value);
}

function indexFrontmatter() {
  return {
    schema: 'sdlc/v1',
    type: 'index',
    slug: 'demo',
    title: 'Demo',
    status: 'active',
    'current-stage': 'implement',
    'stage-number': 5,
    'created-at': '2026-05-24T10:00:00Z',
    'updated-at': '2026-05-24T10:00:00Z',
    'selected-slice': 'core',
    'branch-strategy': 'none',
    branch: '',
    'base-branch': '',
    'review-scope': 'slug-wide',
    'pr-url': '',
    'pr-number': null,
    'open-questions': [],
    tags: [],
    'next-command': '/wf verify demo',
    'next-invocation': 'verify',
    'workflow-files': [],
    progress: { intake: 'complete', implement: 'in-progress' },
  };
}

test('phase 3 schema admits project, extras, and docs-index artifact types', () => {
  const samples = [
    { schema: 'sdlc/v1', type: 'project-context', title: 'Product', status: 'active', source: 'PRODUCT.md' },
    { schema: 'sdlc/v1', type: 'ship-plan', slug: 'demo', 'project-name': 'demo', 'plan-version': 1 },
    {
      schema: 'sdlc/v1',
      type: 'announce',
      slug: 'demo',
      title: 'Announcement',
      status: 'ready',
      scope: 'external',
      audience: 'customers',
      channel: 'release-notes',
      'scheduled-at': '2026-05-24T12:00:00Z',
    },
    {
      schema: 'sdlc/v1',
      type: 'risk-register',
      slug: 'demo',
      title: 'Risks',
      status: 'active',
      risks: [
        {
          id: 'R1',
          description: 'Dependency delay',
          likelihood: 'medium',
          impact: 'high',
          mitigation: 'Timebox decision',
          owner: 'team',
          status: 'open',
        },
      ],
    },
    {
      schema: 'sdlc/v1',
      type: 'estimate',
      slug: 'demo',
      title: 'Estimate',
      status: 'ready',
      methodology: 'story-points',
      estimates: [{ 'slice-or-task': 'core', value: 5, confidence: 'high' }],
      total: 5,
      'confidence-range': '3-8',
      confidence: 'high',
    },
    { schema: 'sdlc/v1', type: 'docs-index', slug: 'demo', title: 'Docs', status: 'complete' },
  ];
  for (const sample of samples) {
    equal(validateFrontmatter(sample, { schemaPath: SCHEMA_PATH }).valid, true, sample.type);
  }
});

test('phase 3 schema rejects loose workflow extras without planned required fields', () => {
  // announce relaxed to schema/type/slug in v9.35.0 — the wf-meta template emits
  // audiences/channels lists + created-at, not the old strict title/status/scope/
  // audience/channel/scheduled-at — so it's no longer a "strict reject" case.
  const samples = [
    { schema: 'sdlc/v1', type: 'risk-register', slug: 'demo', title: 'Risks', status: 'active' },
    { schema: 'sdlc/v1', type: 'estimate', slug: 'demo', title: 'Estimate', status: 'ready' },
  ];
  for (const sample of samples) {
    equal(validateFrontmatter(sample, { schemaPath: SCHEMA_PATH }).valid, false, sample.type);
  }
});
