#!/usr/bin/env node
/**
 * One-off rewriter for the v9.0.0-alpha.1 shim removal.
 *
 * After the legacy /review-X (aggregate) and /review:X (dimension) shim
 * commands were deleted, prose references inside review reference bodies and
 * other plugin docs need to be updated to the router syntax:
 *
 *   /review-<aggregate>     -> /review pass <aggregate>
 *   /review:<dimension>     -> /review <dimension>
 *
 * Walks skills/review/reference/*.md plus a small allowlist of other files.
 * Idempotent: running twice produces no further changes.
 *
 * After running this, re-run scripts/migrate-review.mjs to regenerate
 * migration-manifest.json with the new body hashes.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const AGGREGATES = ['all', 'architecture', 'infra', 'pre-merge', 'quick', 'security', 'ux'];
const DIMENSIONS = [
  'accessibility', 'api-contracts', 'architecture', 'backend-concurrency', 'ci',
  'code-simplification', 'correctness', 'cost', 'data-integrity', 'docs', 'dx',
  'frontend-accessibility', 'frontend-performance', 'infra', 'infra-security',
  'logging', 'maintainability', 'migrations', 'observability', 'overengineering',
  'performance', 'privacy', 'refactor-safety', 'release', 'reliability',
  'scalability', 'security', 'style-consistency', 'supply-chain', 'testing',
  'ux-copy',
];

// Aggregate names that have no overlapping dimension key. Their colon-form
// (e.g. /review:all) was an alternate older spelling of the aggregate command;
// rewrite to /review pass <key>. The three names that overlap with dimensions
// (architecture, infra, security) intentionally fall under the dimension rule
// instead — the colon-form for those was always the dimension command.
const AGGREGATE_ONLY = AGGREGATES.filter((k) => !DIMENSIONS.includes(k));

// Order: longest aggregate names first so /review-pre-merge isn't shadowed by
// a hypothetical /review-pre rule, and longest dimensions first to avoid
// shadowing. Sort by length descending.
//
// The trailing /review pass -> /review sweep rule replaces the v8.32 'pass'
// disambiguation keyword with the v9.0.0-alpha.1 'sweep' keyword. The
// transformation is applied LAST so the prior aggregate hyphen and colon
// rules feed into it correctly.
const REPLACEMENTS = [
  ...AGGREGATES.map((k) => ({ from: `/review-${k}`, to: `/review sweep ${k}` })),
  ...AGGREGATE_ONLY.map((k) => ({ from: `/review:${k}`, to: `/review sweep ${k}` })),
  ...DIMENSIONS.map((k) => ({ from: `/review:${k}`, to: `/review ${k}` })),
  // Catch any legacy /review pass <agg> that survived from the v8.32 sweep.
  ...AGGREGATES.map((k) => ({ from: `/review pass ${k}`, to: `/review sweep ${k}` })),
].sort((a, b) => b.from.length - a.from.length);

function rewrite(text) {
  let out = text;
  let changes = 0;
  for (const { from, to } of REPLACEMENTS) {
    if (out.includes(from)) {
      const before = out;
      out = out.split(from).join(to);
      changes += (before.length !== out.length || before !== out) ? 1 : 0;
    }
  }
  return { out, changes };
}

function processFile(absPath) {
  const text = readFileSync(absPath, 'utf-8');
  const { out, changes } = rewrite(text);
  if (out !== text) {
    writeFileSync(absPath, out, 'utf-8');
    console.log(`  rewrote ${absPath.replace(PLUGIN_ROOT, '<plugin>')}  (${changes} pattern(s) hit)`);
    return 1;
  }
  return 0;
}

function main() {
  const targets = [];

  // 1. All reference files
  const refDir = join(PLUGIN_ROOT, 'skills', 'review', 'reference');
  for (const f of readdirSync(refDir)) {
    if (f.endsWith('.md')) targets.push(join(refDir, f));
  }

  // 2. The skill body (was the router file pre-v9.0.0-alpha.1)
  targets.push(join(PLUGIN_ROOT, 'skills', 'review', 'SKILL.md'));

  // 3. README
  targets.push(join(PLUGIN_ROOT, 'README.md'));

  let changed = 0;
  for (const t of targets) {
    try {
      if (statSync(t).isFile()) changed += processFile(t);
    } catch (err) {
      console.warn(`  skip ${t}: ${err.message}`);
    }
  }

  console.log(`\nRewrote ${changed} file(s) of ${targets.length} target(s).`);
}

main();
