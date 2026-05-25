import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import { render as renderDocsIndex } from '../../../renderers/docs-index.mjs';
import { createSdlcStaticServer } from '../../../scripts/render-sunflower-serve.mjs';
import {
  defaultFrontmatterSchemaPath,
  validateFrontmatter,
} from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const RENDER = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');
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

test('phase 3 walker renders project context, workflow extras, and docs index', () => {
  const tmp = tempDir();
  try {
    write(join(tmp, 'PRODUCT.md'), '# Product\nMarket context.\n');
    write(join(tmp, 'DESIGN.md'), md({
      schema: 'sdlc/v1',
      type: 'project-context',
      title: 'Design context',
      status: 'active',
      source: 'DESIGN.md',
    }, '# Design\nDesign context.\n'));
    write(join(tmp, '.ai', 'ship-plan.md'), '# Ship plan\nRelease notes.\n');
    write(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(indexFrontmatter()));
    write(join(tmp, '.ai', 'workflows', 'demo', 'announce.md'), md({
      schema: 'sdlc/v1',
      type: 'announce',
      slug: 'demo',
      title: 'Announcement',
      status: 'ready',
      scope: 'external',
      audience: 'customers',
      channel: 'release-notes',
      'scheduled-at': '2026-05-24T12:00:00Z',
      'audiences-count': 2,
      'channels-count': 1,
    }));
    write(join(tmp, '.ai', 'workflows', 'demo', 'risk-register.md'), md({
      schema: 'sdlc/v1',
      type: 'risk-register',
      slug: 'demo',
      title: 'Risk register',
      status: 'active',
      risks: [
        {
          id: 'R1',
          description: 'Late dependency decision',
          likelihood: 'medium',
          impact: 'high',
          mitigation: 'Timebox the decision',
          owner: 'team',
          status: 'open',
        },
      ],
      'risks-total': 3,
      'risks-high': 1,
      'risks-open': 2,
    }));
    write(join(tmp, '.ai', 'workflows', 'demo', 'estimate.md'), md({
      schema: 'sdlc/v1',
      type: 'estimate',
      slug: 'demo',
      title: 'Estimate',
      status: 'ready',
      methodology: 'story-points',
      estimates: [
        { 'slice-or-task': 'core', value: 5, confidence: 'medium' },
      ],
      total: 5,
      'confidence-range': '3-8',
      confidence: 'medium',
      'estimate-points': 5,
      'uncertainty-count': 1,
    }));
    write(join(tmp, '.ai', 'workflows', 'demo', '08b-docs-index.md'), md({
      schema: 'sdlc/v1',
      type: 'docs-index',
      slug: 'demo',
      title: 'Docs index',
      status: 'complete',
      'run-id': 'docs-20260524-1000',
      'gaps-found': 0,
      'actions-completed': 2,
    }));
    write(join(tmp, '.ai', 'workflows', 'demo', '08b-docs-index.yaml'), 'docs:\n  - path: README.md\n    type: readme\n    status: updated\n    action: update\n');
    write(join(tmp, '.ai', 'docs', 'docs-20260524-1000', '08b-docs-index.md'), md({
      schema: 'sdlc/v1',
      type: 'docs-index',
      slug: 'docs-20260524-1000',
      title: 'Project documentation index',
      status: 'complete',
      'run-id': 'docs-20260524-1000',
      'gaps-found': 1,
      'actions-completed': 1,
    }));
    write(join(tmp, '.ai', 'docs', 'docs-20260524-1000', '08b-docs-index.yaml'), 'docs:\n  - path: docs/api.md\n    type: reference\n    status: created\n    action: create\n');

    const result = spawnSync(process.execPath, [RENDER, '--plugin-root', PLUGIN_ROOT], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    equal(result.status, 0, result.stderr);
    ok(existsSync(join(tmp, '.ai', '_view', 'project', 'PRODUCT.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'project', 'DESIGN.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'project', 'ship-plan.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'demo', 'announce', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'demo', 'risk-register', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'demo', 'estimate', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'demo', 'docs-index', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'docs', 'docs-20260524-1000', 'docs-index', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', '.last-render')));
    match(result.stdout, /files written/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase 3 schema admits project, extras, and docs-index artifact types', () => {
  const samples = [
    { schema: 'sdlc/v1', type: 'project-context', title: 'Product', status: 'active', source: 'PRODUCT.md' },
    { schema: 'sdlc/v1', type: 'ship-plan', title: 'Ship plan', status: 'active', source: '.ai/ship-plan.md' },
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
  const samples = [
    { schema: 'sdlc/v1', type: 'announce', slug: 'demo', title: 'Announcement', status: 'ready' },
    { schema: 'sdlc/v1', type: 'risk-register', slug: 'demo', title: 'Risks', status: 'active' },
    { schema: 'sdlc/v1', type: 'estimate', slug: 'demo', title: 'Estimate', status: 'ready' },
  ];
  for (const sample of samples) {
    equal(validateFrontmatter(sample, { schemaPath: SCHEMA_PATH }).valid, false, sample.type);
  }
});

test('docs-index renderer consumes sibling docs table', () => {
  const out = renderDocsIndex({
    path: '08b-docs-index.md',
    frontmatter: { type: 'docs-index', status: 'complete', title: 'Docs index', 'gaps-found': 0 },
    siblingYaml: {
      docs: [{ path: 'README.md', type: 'readme', status: 'updated', action: 'update' }],
    },
    body: '## Summary\nDone.',
    history: [],
    fragment: null,
  }, { slug: 'demo' });

  match(out.bodyHtml, /docs-index-table/);
  match(out.bodyHtml, /README\.md/);
  match(out.bodyHtml, /Summary/);
});

test('bootstrap dry-run reports missing workflow and project renders', () => {
  const tmp = tempDir();
  try {
    write(join(tmp, 'PRODUCT.md'), '# Product\n');
    write(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(indexFrontmatter()));

    const result = spawnSync(process.execPath, [
      RENDER,
      '--bootstrap',
      '--dry-run',
      '--plugin-root', PLUGIN_ROOT,
    ], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    equal(result.status, 0, result.stderr);
    match(result.stdout, /render demo \(missing\)/);
    match(result.stdout, /render project \(missing\)/);
    match(result.stdout, /dry-run complete: 2 render jobs/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('bootstrap wet run renders concurrent jobs and finalizes shared outputs once', () => {
  const tmp = tempDir();
  try {
    write(join(tmp, 'PRODUCT.md'), '# Product\n');
    write(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(indexFrontmatter()));
    write(join(tmp, '.ai', 'workflows', 'second', '00-index.md'), md({
      ...indexFrontmatter(),
      slug: 'second',
      title: 'Second',
    }));
    write(join(tmp, '.ai', 'docs', 'docs-20260524-1000', '08b-docs-index.md'), md({
      schema: 'sdlc/v1',
      type: 'docs-index',
      slug: 'docs-20260524-1000',
      title: 'Docs index',
      status: 'complete',
      'run-id': 'docs-20260524-1000',
    }));

    const result = spawnSync(process.execPath, [
      RENDER,
      '--bootstrap',
      '--concurrency', '4',
      '--plugin-root', PLUGIN_ROOT,
    ], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    equal(result.status, 0, result.stderr);
    ok(existsSync(join(tmp, '.ai', '_view', 'demo', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'second', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'project', 'PRODUCT.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'docs', 'docs-20260524-1000', 'docs-index', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'INDEX.html')));
    ok(existsSync(join(tmp, '.ai', '_view', 'INDEX.yaml')));
    ok(existsSync(join(tmp, '.ai', '_view', '.last-render')));
    match(result.stdout, /rendering shared outputs \(finalize\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('renderer-hosted serve exposes health, static files, and blocks traversal', async () => {
  const tmp = tempDir();
  try {
    const viewRoot = join(tmp, '.ai', '_view');
    write(join(viewRoot, 'INDEX.html'), '<!doctype html><title>sdlc</title>');
    write(join(viewRoot, '_assets', 'sdlc.css'), 'body{}');
    write(join(viewRoot, 'demo', 'INDEX.html'), '<!doctype html><title>demo</title>');
    write(join(viewRoot, '.last-render'), JSON.stringify({ renderedAt: '2026-05-24T10:00:00Z' }));

    const server = createSdlcStaticServer({ viewRoot, liveReload: false, configHash: 'abc123' });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const { port } = server.address();
    try {
      const health = await fetch(`http://127.0.0.1:${port}/__sdlc/health`);
      equal(health.status, 200);
      const payload = await health.json();
      equal(payload.status, 'ok');
      equal(payload.ok, true);
      equal(payload.configHash, 'abc123');
      equal(payload.slugs.includes('demo'), true);

      const asset = await fetch(`http://127.0.0.1:${port}/sdlc/_assets/sdlc.css`);
      equal(asset.status, 200);
      match(await asset.text(), /body/);

      const traversal = await fetch(`http://127.0.0.1:${port}/%2e%2e/package.json`);
      ok([403, 404].includes(traversal.status));
    } finally {
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('renderer-hosted serve emits reload SSE events when last-render changes', async () => {
  const tmp = tempDir();
  try {
    const viewRoot = join(tmp, '.ai', '_view');
    write(join(viewRoot, 'INDEX.html'), '<!doctype html><title>sdlc</title>');
    write(join(viewRoot, '.last-render'), JSON.stringify({ renderedAt: '2026-05-24T10:00:00Z' }));

    const server = createSdlcStaticServer({ viewRoot, liveReload: true, configHash: 'abc123' });
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const { port } = server.address();
    const controller = new AbortController();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/__sdlc/events`, {
        signal: controller.signal,
      });
      equal(response.status, 200);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const sawReload = (async () => {
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          const remaining = Math.max(1, deadline - Date.now());
          const chunk = await Promise.race([
            reader.read(),
            new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), remaining)),
          ]);
          if (!chunk) break;
          const { value, done } = chunk;
          if (done) break;
          buffer += decoder.decode(value);
          if (buffer.includes('event: reload')) return true;
        }
        return false;
      })();
      await new Promise((resolveTick) => setTimeout(resolveTick, 100));
      write(join(viewRoot, '.last-render'), JSON.stringify({ renderedAt: '2026-05-24T10:00:01Z' }));
      equal(await sawReload, true);
      controller.abort();
    } finally {
      controller.abort();
      await new Promise((resolveClose) => server.close(resolveClose));
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
