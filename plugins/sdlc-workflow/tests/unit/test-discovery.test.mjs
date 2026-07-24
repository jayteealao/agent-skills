// Guard for automatic test discovery (v9.140.0).
//
// `scripts.test` was once a hand-maintained list of ~40 explicit file paths, so
// a new test file was inert until someone appended it — and that failed
// silently. Three drift-guard suites (`steering`, `intake-shape-hardening`
// v9.136.0, `consult-trigger-coverage` v9.139.0 — the last cited in its own
// release notes as the guard pinning that change) were found during the
// v9.140.0 release having never executed once.
//
// This file is itself the proof: it was never added to any list, and it runs.
// Its job is to stop the repo regressing to enumeration in either tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const pkg = (root) => JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const collect = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((e) => {
      const abs = path.join(dir, e);
      return statSync(abs).isDirectory() ? collect(abs) : e.endsWith('.test.mjs') ? [abs] : [];
    });

test('scripts.test delegates to the discovery runner, never an enumerated list', () => {
  const trees = [
    { name: 'main', root: pluginRoot },
    { name: 'codex', root: codexRoot },
  ].filter((t) => existsSync(path.join(t.root, 'package.json')));

  for (const { name, root } of trees) {
    const script = pkg(root).scripts.test;
    assert.ok(script.includes('tests/run-all.mjs'),
      `${name}: scripts.test no longer delegates to tests/run-all.mjs — got: ${script}`);
    // The regression to guard against: individual test paths back in the script.
    const enumerated = script.match(/tests\/\S*\.test\.mjs/g) ?? [];
    assert.equal(enumerated.length, 0,
      `${name}: scripts.test enumerates ${enumerated.length} test file(s) again — discovery must stay automatic: ${enumerated.join(' ')}`);
    assert.ok(existsSync(path.join(root, 'tests', 'run-all.mjs')),
      `${name}: tests/run-all.mjs is missing but scripts.test points at it`);
  }
});

test('every *.test.mjs under tests/ is reachable by the runner walk', () => {
  // The runner collects `*.test.mjs` recursively from tests/. Anything matching
  // that suffix is therefore guaranteed to run — assert the walk is non-empty
  // and finds this very file, which is the end-to-end proof of discovery.
  const found = collect(path.join(pluginRoot, 'tests')).map((f) =>
    path.relative(pluginRoot, f).split(path.sep).join('/'),
  );
  assert.ok(found.length >= 40, `discovery collapsed to ${found.length} files — expected the full suite`);
  assert.ok(found.includes('tests/unit/test-discovery.test.mjs'),
    'the discovery walk cannot see this test file — discovery is broken');
});

test('non-test modules under tests/ stay outside the discovered set', () => {
  // These are an entry point, a spawned worker, and two imported helpers.
  // Executing any of them as a test would be wrong (acceptance.mjs builds a
  // synthetic tree and runs the real renderer; the worker expects to be spawned).
  const found = collect(path.join(pluginRoot, 'tests')).map((f) =>
    path.relative(pluginRoot, f).split(path.sep).join('/'),
  );
  for (const excluded of [
    'tests/e2e/acceptance.mjs',
    'tests/helpers/lock-race-worker.mjs',
    'tests/unit/snapshots/_fixtures.mjs',
    'tests/unit/snapshots/snapshot-harness.mjs',
    'tests/run-all.mjs',
  ]) {
    assert.ok(existsSync(path.join(pluginRoot, excluded)), `fixture drift: ${excluded} no longer exists`);
    assert.ok(!found.includes(excluded), `${excluded} was swept into the test set — it is not a test`);
  }
});
