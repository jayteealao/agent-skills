// tests/unit/stamp-version.test.mjs
//
// The version stamp (WIDE-VIEW-REPAIR-PLAN §9.2): package.json is the one
// source; `npm version` runs scripts/stamp-version.mjs, which writes every
// other carrier. These tests copy the real carriers into a scratch tree, stamp
// a new version, and prove (a) the release-versions gate accepts the result,
// (b) a second stamp changes nothing, and (c) file formatting survives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stampVersion } from '../../scripts/stamp-version.mjs';
import { checkVersions } from '../../scripts/verify-release-versions.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(PLUGIN_ROOT, '..', '..');

const PLUGIN_FILES = [
  'package.json',
  'package-lock.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  'docs/site/nav.html',
  'runtime-manifest.json',
];
const REPO_FILES = ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json'];

function scratchTree() {
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-stamp-'));
  const plugin = join(repo, 'plugins', 'sdlc-workflow');
  for (const rel of PLUGIN_FILES) {
    mkdirSync(dirname(join(plugin, rel)), { recursive: true });
    copyFileSync(join(PLUGIN_ROOT, rel), join(plugin, rel));
  }
  for (const rel of REPO_FILES) {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    copyFileSync(join(REPO_ROOT, rel), join(repo, rel));
  }
  return { repo, plugin };
}

function bumpPackageJson(plugin, version) {
  const p = join(plugin, 'package.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.version = version;
  writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
}

function bumpManifest(plugin, version) {
  // The build derives runtimeVersion; the test stands in for it.
  const p = join(plugin, 'runtime-manifest.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  j.runtimeVersion = version;
  writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
}

test('stamp-version: stamps every carrier from package.json and the gate accepts the tree', () => {
  const { repo, plugin } = scratchTree();
  try {
    bumpPackageJson(plugin, '99.1.2');
    bumpManifest(plugin, '99.1.2');
    const r = stampVersion({ pluginRoot: plugin, repoRoot: repo });
    assert.equal(r.version, '99.1.2');
    assert.deepEqual(r.changed.sort(), [
      '../../.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      '.codex-plugin/plugin.json',
      'docs/site/nav.html',
      'package-lock.json',
    ]);
    assert.deepEqual(r.missing, []);

    const gate = checkVersions({ pluginRoot: plugin, repoRoot: repo });
    assert.deepEqual(gate.problems, []);
    assert.equal(gate.version, '99.1.2');

    const lock = JSON.parse(readFileSync(join(plugin, 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '99.1.2');
    assert.equal(lock.packages[''].version, '99.1.2');
    assert.match(readFileSync(join(plugin, 'docs/site/nav.html'), 'utf8'), /plugin docs · v99\.1\.2/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('stamp-version: a second stamp is a no-op (idempotent)', () => {
  const { repo, plugin } = scratchTree();
  try {
    bumpPackageJson(plugin, '99.3.4');
    stampVersion({ pluginRoot: plugin, repoRoot: repo });
    const again = stampVersion({ pluginRoot: plugin, repoRoot: repo });
    assert.deepEqual(again.changed, []);
    assert.equal(again.unchanged.length, 5);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('stamp-version: edits are textual, so formatting and escapes survive', () => {
  const { repo, plugin } = scratchTree();
  try {
    const before = readFileSync(join(repo, '.claude-plugin/marketplace.json'), 'utf8');
    const catalogVersion = JSON.parse(before).version;
    bumpPackageJson(plugin, '99.5.6');
    stampVersion({ pluginRoot: plugin, repoRoot: repo });
    const after = readFileSync(join(repo, '.claude-plugin/marketplace.json'), 'utf8');
    // Only the plugin entry's version token moved; the catalog's own version and
    // the `—` escapes in the description are untouched.
    assert.equal(JSON.parse(after).version, catalogVersion, 'the catalog release line is not a plugin carrier');
    assert.equal(after.includes('\\u2014'), before.includes('\\u2014'), 'escape sequences survive');
    assert.equal(after.split('\n').length, before.split('\n').length, 'line count is unchanged');
    assert.equal(JSON.parse(after).plugins.find((p) => p.name === 'sdlc-workflow').version, '99.5.6');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('stamp-version: --check semantics — dryRun reports drift without writing', () => {
  const { repo, plugin } = scratchTree();
  try {
    bumpPackageJson(plugin, '99.7.8');
    const dry = stampVersion({ pluginRoot: plugin, repoRoot: repo, dryRun: true });
    assert.equal(dry.changed.length, 5);
    assert.notEqual(JSON.parse(readFileSync(join(plugin, '.claude-plugin/plugin.json'), 'utf8')).version, '99.7.8');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('stamp-version: a non-semver package version is refused', () => {
  const { repo, plugin } = scratchTree();
  try {
    bumpPackageJson(plugin, 'nine');
    assert.throws(() => stampVersion({ pluginRoot: plugin, repoRoot: repo }), /not a semver string/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
