#!/usr/bin/env node
/**
 * tests/run-all.mjs — discovers every `*.test.mjs` under tests/ and hands the
 * list to `node --test`. Codex-tree twin of the main plugin's runner.
 *
 * WHY THIS EXISTS: `scripts.test` used to name its test files explicitly, so a
 * newly added test was inert until someone remembered to append its path — a
 * failure that is completely silent (the file exists, passes when run directly,
 * reviews clean, never runs). In the main tree that let three drift-guard suites
 * ship across three releases without ever executing. Discovery must be automatic.
 *
 * A plain glob in package.json cannot do this portably: `node --test` only gained
 * glob-pattern arguments in Node 21, while this package declares `engines.node
 * >=20` and CI pins Node 20 — and conversely, passing a directory (`node --test
 * tests/`) works on Node 20 but is treated as an entry *module* on Node 22+.
 * Neither form spans the supported range, so discovery happens here in plain fs.
 * Verified against v20.20.2 and v22.15.0.
 *
 * Only `*.test.mjs` counts as a test — helpers and spawned workers must never be
 * executed as one.
 */
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(TESTS_DIR, '..');

function collect(dir) {
  const found = [];
  for (const entry of readdirSync(dir).sort()) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) found.push(...collect(abs));
    else if (entry.endsWith('.test.mjs')) found.push(abs);
  }
  return found;
}

const argv = process.argv.slice(2);
const passThroughFlags = argv.filter((a) => a.startsWith('-'));
const filters = argv.filter((a) => !a.startsWith('-'));

let files = collect(TESTS_DIR);

// A discovery walk that finds nothing is the same silent failure this script
// exists to kill — fail loudly rather than report a cheerful zero.
if (files.length === 0) {
  console.error('[run-all] no *.test.mjs found under tests/ — discovery is broken, not the suite');
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
