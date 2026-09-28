// tests/unit/renderers/project-explainer.test.mjs
//
// Project-level explainers (ARTIFACT-SPLIT-PLAN S2): `.ai/ship-plan.md` and
// `.ai/surface-sweep-<date>.md` live outside any workflow slug. Their explainer
// fragments route to the project page and render at its top.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { storageRoute, resolveViewPath, projectArtifactType } from '../../../renderers/_paths.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');

test('storageRoute: project-level explainers route to their project page', () => {
  assert.deepEqual(storageRoute('.ai/ship-plan.explainer.html.fragment'),
    { route: 'explainer', parent: '.ai/ship-plan.md' });
  assert.deepEqual(storageRoute('/.ai/ship-plan.explainer.html.fragment'),
    { route: 'explainer', parent: '.ai/ship-plan.md' });
  assert.deepEqual(storageRoute('.ai/surface-sweep-2026-09-28.explainer.html.fragment'),
    { route: 'explainer', parent: '.ai/surface-sweep-2026-09-28.md' });
  assert.equal(storageRoute('.ai/ship-plan.md').route, 'page');
  assert.equal(storageRoute('/.ai/surface-sweep-2026-09-28.md').route, 'page');
  assert.equal(storageRoute('.ai/unknown-notes.md').route, 'unrouted');
  // A workflow-relative path is unchanged.
  assert.equal(storageRoute('06-verify-auth.md').route, 'page');
});

test('projectArtifactType and resolveViewPath know ship-plan and surface-sweep', () => {
  assert.equal(projectArtifactType('.ai/ship-plan.md'), 'ship-plan');
  assert.equal(projectArtifactType('.ai/surface-sweep-2026-09-28.md'), 'surface-sweep');
  assert.equal(projectArtifactType('PRODUCT.md'), 'project-context');
  assert.equal(projectArtifactType('.ai/workflows/x/00-index.md'), null);
  assert.deepEqual(resolveViewPath('.ai/surface-sweep-2026-09-28.md', { kind: 'project' }),
    { viewRel: 'project/surface-sweep-2026-09-28.html', kind: 'surface-sweep' });
  assert.deepEqual(resolveViewPath('.ai/ship-plan.md', { kind: 'project' }),
    { viewRel: 'project/ship-plan.html', kind: 'ship-plan' });
});

function write(abs, text) {
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, 'utf-8');
}

test('render: ship-plan and surface-sweep explainers render at the top of their project pages', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-projxpl-'));
  const ai = join(tmp, '.ai');
  try {
    write(join(ai, 'workflows', 'feat-p', '00-index.md'),
      '---\nschema: sdlc/v1\ntype: index\nslug: feat-p\ntitle: Feat P\nstatus: active\n---\n');
    write(join(ai, 'ship-plan.md'),
      '---\nschema: sdlc/v1\ntype: ship-plan\ntitle: Ship plan\n---\n## Targets\nSHIP-PLAN-BODY\n');
    write(join(ai, 'ship-plan.explainer.html.fragment'), '<p>SHIP-XPL: how this repo ships.</p>');
    write(join(ai, 'surface-sweep-2026-09-28.md'), [
      '---', 'schema: sdlc/v1', 'type: surface-sweep', 'scope-path: "src/"', 'findings-count: 2', '---',
      '# Surface Sweep — src/', '## Findings', 'SWEEP-BODY',
    ].join('\n'));
    write(join(ai, 'surface-sweep-2026-09-28.explainer.html.fragment'), '<p>SWEEP-XPL: two defects found.</p>');
    const child = spawnSync(process.execPath, [SCRIPT, '--plugin-root', PLUGIN_ROOT, '--clean', '--no-shared-output'],
      { cwd: tmp, encoding: 'utf-8' });
    assert.equal(child.status, 0, `renderer exited ${child.status}: ${child.stderr}`);

    const view = join(ai, '_view', 'project');
    for (const [file, xpl, body] of [
      ['ship-plan.html', 'SHIP-XPL', 'SHIP-PLAN-BODY'],
      ['surface-sweep-2026-09-28.html', 'SWEEP-XPL', 'SWEEP-BODY'],
    ]) {
      const html = readFileSync(join(view, file), 'utf-8');
      assert.match(html, /part-explainer/, `${file}: explainer slot`);
      assert.ok(html.indexOf(xpl) > 0, `${file}: explainer rendered`);
      assert.ok(html.indexOf(xpl) < html.indexOf(body), `${file}: explainer above the record`);
      assert.doesNotMatch(html, /class="narrative-fragments"/, `${file}: explainer is not a foot fragment`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
