// tests/runtime-parity.test.mjs
//
// Workstream D self-contained verification for the native Codex package: the
// shipped runtime/ must be a complete, internally-consistent shared runtime that
// reproduces its own buildId — provable with NO dependency on the Claude plugin
// (this test spawns only the bundled verifier inside runtime/dist).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNTIME = join(PKG_ROOT, 'runtime');

test('bundled verify-runtime reports the Codex runtime as valid (self-contained)', () => {
  const out = execFileSync(process.execPath, [join(RUNTIME, 'dist', 'verify-runtime.mjs'), '--json'], {
    encoding: 'utf-8',
  });
  const result = JSON.parse(out);
  assert.equal(result.ok, true, `verify-runtime problems: ${JSON.stringify(result.problems)}`);
  assert.ok(result.runtimeVersion, 'runtimeVersion present');
  assert.equal(result.computedBuildId, result.declaredBuildId, 'payload reproduces its declared buildId');
});

test('runtime-manifest.json carries the shared identity surface', () => {
  const m = JSON.parse(readFileSync(join(RUNTIME, 'runtime-manifest.json'), 'utf-8'));
  assert.equal(m.family, 'sdlc-workflow');
  assert.equal(m.hubName, 'sdlc-workflow-hub');
  assert.equal(m.hubProtocolVersion, 1);
  assert.equal(m.artifactSchema, 'sdlc/v1');
  assert.equal(m.registryVersion, 2);
  assert.equal(m.hubConfigVersion, 1);
  assert.ok(typeof m.runtimeVersion === 'string' && m.runtimeVersion, 'runtimeVersion set');
  assert.ok(typeof m.buildId === 'string' && m.buildId.length === 64, 'buildId is a sha256 hex');
});

test('runtime-baseline.json pins the synced shared runtime build', () => {
  const baseline = JSON.parse(readFileSync(join(PKG_ROOT, 'runtime-baseline.json'), 'utf-8'));
  const manifest = JSON.parse(readFileSync(join(RUNTIME, 'runtime-manifest.json'), 'utf-8'));
  assert.equal(baseline.sharedRuntimeBuildId, manifest.buildId, 'baseline buildId matches the shipped runtime');
  assert.equal(baseline.claudeBaselineVersion, manifest.runtimeVersion);
});

test('runtime/ carries every entrypoint needed to operate the hub standalone', () => {
  for (const rel of [
    join('dist', 'hub-serve.mjs'),
    join('dist', 'hub-ensure.mjs'),
    join('dist', 'render-sunflower.mjs'),
    join('dist', 'render-sunflower-serve.mjs'),
    join('dist', 'verify-runtime.mjs'),
    join('dist', 'code-browser.js'),
    join('dist', 'code-browser.css'),
    join('docs', 'site', 'index.html'),
    join('tests', 'frontmatter.schema.json'),
    'runtime-manifest.json',
  ]) {
    assert.ok(existsSync(join(RUNTIME, rel)), `missing runtime entry: ${rel}`);
  }
});
