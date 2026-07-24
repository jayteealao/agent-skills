#!/usr/bin/env node
/**
 * tests/run-all.mjs — discovers every unit/integration test under tests/ and
 * hands the list to `node --test`.
 *
 * WHY THIS EXISTS (and is not just a glob in package.json):
 *
 * `scripts.test` used to be a hand-maintained list of ~40 explicit file paths.
 * A new test file was completely inert until someone remembered to append it,
 * and that failed in the quietest possible way — the file exists, passes when
 * run directly, reviews clean, and never runs in CI. Three drift-guard suites
 * (`steering`, `intake-shape-hardening` v9.136.0, `consult-trigger-coverage`
 * v9.139.0 — the latter cited in its own release notes as the guard pinning
 * that change) were found during the v9.140.0 release having never executed
 * once. Discovery must be automatic, or the guards are decorative.
 *
 * The obvious fix — `node --test "tests/**\/*.test.mjs"` — does not work,
 * because no single `node --test` invocation covers this repo's Node range:
 *
 *   form                          Node 20 (CI pin, engines)   Node 22 (maintainer)
 *   node --test tests/            walks correctly             MODULE_NOT_FOUND
 *                                                             (dir treated as an entry module)
 *   node --test "tests/**\/*.test.mjs"   "Could not find …"   correct
 *                                 (globs landed in Node 21)
 *   node --test  (bare, walks CWD) too broad                  too broad — sweeps dist/
 *
 * So discovery happens here, in plain fs, which behaves identically on every
 * supported Node. Verified empirically against v20.20.2 and v22.15.0.
 *
 * SCOPE — only `*.test.mjs` under tests/ is a test. Three kinds of file live
 * here and must never be executed as one:
 *   - tests/e2e/acceptance.mjs      — its own entry point (`npm run test:e2e`);
 *                                     builds a synthetic workflow tree and runs
 *                                     the real renderer.
 *   - tests/helpers/*.mjs           — processes spawned BY tests (the cross-host
 *                                     lock race contender).
 *   - tests/unit/snapshots/_fixtures.mjs, snapshot-harness.mjs — imported modules.
 * The `*.test.mjs` suffix already excludes all three; the assertion below keeps
 * it that way if someone later renames one.
 *
 * USAGE
 *   node tests/run-all.mjs                      # everything
 *   node tests/run-all.mjs skills               # only paths containing "skills"
 *   node tests/run-all.mjs --test-concurrency=1 # flags pass through to node --test
 */
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(TESTS_DIR, '..');

/** Recursively collect every `*.test.mjs` under `dir`. */
function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      found.push(...collect(abs));
    } else if (entry.endsWith('.test.mjs')) {
      found.push(abs);
    }
  }
  return found;
}

const argv = process.argv.slice(2);
const passThroughFlags = argv.filter((a) => a.startsWith('-'));
const filters = argv.filter((a) => !a.startsWith('-'));

let files = collect(TESTS_DIR);

// A discovery walk that finds nothing is the same silent failure this script
// exists to kill — fail loudly instead of reporting a cheerful zero.
if (files.length === 0) {
  console.error('[run-all] no *.test.mjs found under tests/ — discovery is broken, not the suite');
  process.exit(1);
}

// Belt-and-braces: the suffix filter should already exclude the non-test .mjs
// files documented above. If one is ever renamed into the set, say so loudly.
const FORBIDDEN = ['e2e/acceptance', 'helpers/', 'snapshot-harness', '_fixtures'];
const leaked = files.filter((f) => {
  const rel = path.relative(PLUGIN_ROOT, f).split(path.sep).join('/');
  return FORBIDDEN.some((bad) => rel.includes(bad));
});
if (leaked.length > 0) {
  console.error('[run-all] refusing to run non-test modules picked up by discovery:');
  for (const f of leaked) console.error('  ' + path.relative(PLUGIN_ROOT, f).split(path.sep).join('/'));
  console.error('  (these are entry points / spawned workers / imported helpers — see the header)');
  process.exit(1);
}

const discovered = files.length;

if (filters.length > 0) {
  files = files.filter((f) => {
    const rel = path.relative(PLUGIN_ROOT, f).split(path.sep).join('/');
    return filters.some((needle) => rel.includes(needle));
  });
  if (files.length === 0) {
    console.error(`[run-all] no test files matched: ${filters.join(', ')}`);
    process.exit(1);
  }
}

const rel = files.map((f) => path.relative(PLUGIN_ROOT, f).split(path.sep).join('/'));
console.error(
  filters.length > 0
    ? `[run-all] ${rel.length} of ${discovered} discovered test files match: ${filters.join(', ')}`
    : `[run-all] ${discovered} test files discovered under tests/`,
);

const result = spawnSync(process.execPath, ['--test', ...passThroughFlags, ...rel], {
  cwd: PLUGIN_ROOT,
  stdio: 'inherit',
});

if (result.error) {
  console.error('[run-all] failed to spawn node --test:', result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
