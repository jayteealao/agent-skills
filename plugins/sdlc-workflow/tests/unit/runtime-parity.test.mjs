// tests/unit/runtime-parity.test.mjs — the shipped runtime is self-contained and
// reproduces its own identity (SINGLE-SOURCE-PLAN W6; rewritten from the deleted
// codex tree's tests/runtime-parity.test.mjs).
//
// One tree now serves both hosts, so the cross-package byte-parity gate
// (sync-codex-runtime --check) is gone by construction. What remains worth
// proving is the self-contained half: the bundled verifier, run from the plugin
// root exactly as a Codex or Claude hook would run it, reports the payload
// valid and reproduces the declared buildId; and runtime-manifest.json carries
// the shared identity surface the hub adopts on. The old assertion 3 (a
// runtime-baseline.json pin) is deleted — that file recorded which Claude build
// a Codex snapshot was synced from, and there is no sync any more.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PKG_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('bundled verify-runtime reports the plugin-root runtime as valid (self-contained)', () => {
  const out = execFileSync(process.execPath, [join(PKG_ROOT, 'dist', 'verify-runtime.mjs'), '--json'], {
    encoding: 'utf-8',
  });
  const result = JSON.parse(out);
  assert.equal(result.ok, true, `verify-runtime problems: ${JSON.stringify(result.problems)}`);
  assert.ok(result.runtimeVersion, 'runtimeVersion present');
  assert.equal(result.computedBuildId, result.declaredBuildId, 'payload reproduces its declared buildId');
});

test('runtime-manifest.json carries the shared identity surface', () => {
  const m = JSON.parse(readFileSync(join(PKG_ROOT, 'runtime-manifest.json'), 'utf-8'));
  assert.equal(m.family, 'sdlc-workflow');
  assert.equal(m.hubName, 'sdlc-workflow-hub');
  assert.equal(m.hubProtocolVersion, 1);
  assert.equal(m.artifactSchema, 'sdlc/v1');
  assert.equal(m.registryVersion, 2);
  assert.equal(m.hubConfigVersion, 1);
  assert.ok(typeof m.runtimeVersion === 'string' && m.runtimeVersion, 'runtimeVersion set');
  assert.ok(typeof m.buildId === 'string' && m.buildId.length === 64, 'buildId is a sha256 hex');
});

test('the plugin root carries every entrypoint needed to operate the hub standalone', () => {
  for (const rel of [
    join('dist', 'hub-serve.mjs'),
    join('dist', 'hub-ensure.mjs'),
    join('dist', 'render-sunflower.mjs'),
    join('dist', 'render-sunflower-serve.mjs'),
    join('dist', 'verify-runtime.mjs'),
    join('dist', 'seed-memory.mjs'),
    join('dist', 'code-browser.js'),
    join('dist', 'code-browser.css'),
    join('docs', 'site', 'index.html'),
    join('tests', 'frontmatter.schema.json'),
    'runtime-manifest.json',
  ]) {
    assert.ok(existsSync(join(PKG_ROOT, rel)), `missing runtime entry: ${rel}`);
  }
});

test('no second runtime copy exists — the sync apparatus is gone', () => {
  for (const rel of [
    'runtime',
    'runtime-baseline.json',
    join('scripts', 'sync-codex-runtime.mjs'),
    join('scripts', 'measure-host-divergence.mjs'),
  ]) {
    assert.ok(!existsSync(join(PKG_ROOT, rel)), `stale two-tree artifact still present: ${rel}`);
  }
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
  for (const script of ['sync:codex', 'verify:codex']) {
    assert.ok(!(script in pkg.scripts), `package.json still declares ${script}`);
  }
});
