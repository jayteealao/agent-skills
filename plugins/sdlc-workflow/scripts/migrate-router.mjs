#!/usr/bin/env node
/**
 * Manifest rebuilder for skill-mode routers (v9.0.0-alpha.1+).
 *
 * Generalised across routers via --router <key>. Walks every reference under
 * skills/<key>/reference/*.md and writes:
 *
 *   - skills/<key>/router-metadata.json    (skill name, dimension key list,
 *                                           and an optional aggregates map for
 *                                           sweeps. The aggregates map is
 *                                           policy data — preserved across
 *                                           runs; hand-edit to change it.)
 *   - skills/<key>/migration-manifest.json (SHA-256 + size of each reference
 *                                           body, used by
 *                                           verify-router-migration.mjs to
 *                                           detect drift in CI.)
 *
 * Usage:
 *
 *   node plugins/sdlc-workflow/scripts/migrate-router.mjs --router review
 *   node plugins/sdlc-workflow/scripts/migrate-router.mjs --router wf-quick
 *
 * If --router is omitted, defaults to "review" for backward compatibility with
 * the script's prior incarnation as migrate-review.mjs.
 *
 * Historical note: this script began life as migrate-review.mjs, the one-shot
 * relocator for PR-1 of the router migration plan (v8.32.0). v9.0.0-alpha.1
 * removed the legacy command shims and the curated aggregate reference bodies;
 * the script's job became "rebuild manifest from reference dir; preserve
 * hand-maintained aggregates map." PR-2 (v9.0.0-alpha.2) generalises across
 * routers so /wf-quick, /wf-meta, and the lifecycle bundle can reuse it.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { router: 'review', description: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--router') opts.router = args[++i];
    else if (args[i] === '--description') opts.description = args[++i];
  }
  return opts;
}

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

function readField(fm, key) {
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'm');
  const m = fm.match(re);
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

function sha256(s) {
  // Normalize line endings before hashing so the manifest verifies identically
  // across Windows (autocrlf=true) and Linux clones.
  const normalized = s.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function loadExistingMeta(metaPath) {
  if (!existsSync(metaPath)) return {};
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch (err) {
    console.warn(`  warn: could not parse ${metaPath}: ${err.message}`);
    return {};
  }
}

function defaultDescriptionFor(router, dimensionCount, aggregateCount) {
  if (router === 'review') {
    return (
      `Code review skill. ${dimensionCount} per-dimension reviews (correctness, security, performance, ...) ` +
      `plus ${aggregateCount} named multi-dimension sweeps (each dispatches one sub-agent per ` +
      `dimension in its composition). Single dimension: /review <dim>. Sweep: /review sweep <aggregate>.`
    );
  }
  if (aggregateCount === 0) {
    return (
      `Skill router for /${router}. ${dimensionCount} sub-commands. Invoke as /${router} <subcommand> <args>.`
    );
  }
  return (
    `Skill router for /${router}. ${dimensionCount} sub-commands plus ${aggregateCount} named sweeps. ` +
    `Single sub-command: /${router} <key>. Sweep: /${router} sweep <aggregate>.`
  );
}

function main() {
  const opts = parseArgs();
  const router = opts.router;
  const SKILL_DIR = join(PLUGIN_ROOT, 'skills', router);
  const REF_DIR = join(SKILL_DIR, 'reference');
  const META_PATH = join(SKILL_DIR, 'router-metadata.json');

  if (!existsSync(REF_DIR)) {
    console.error(`Reference dir missing: ${REF_DIR}`);
    process.exit(1);
  }

  const existing = loadExistingMeta(META_PATH);
  const aggregates = existing.aggregates && typeof existing.aggregates === 'object'
    ? existing.aggregates
    : {};
  // Policy block — preserved across regenerations like aggregates. The regenerator
  // rebuilds dimensions and descriptions from the reference files but must NOT
  // destroy hand-edited model assignments. See verify-router-migration.mjs Check 4
  // for the schema this expects.
  const models = existing.models && typeof existing.models === 'object'
    ? existing.models
    : undefined;

  const entries = [];
  const dimensions = [];

  const files = readdirSync(REF_DIR).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    if (file.startsWith('_aggregate-')) {
      console.warn(`  warn: legacy aggregate reference still present: ${file}. v9.0.0-alpha.1 removed these; consider deleting.`);
      continue;
    }
    const abs = join(REF_DIR, file);
    const text = readFileSync(abs, 'utf-8');
    const split = splitFrontmatter(text);
    if (!split) {
      console.warn(`  skip: ${file} has no YAML frontmatter — treating as plain reference, not a sub-command.`);
      continue;
    }
    const { frontmatter, body } = split;
    const description = readField(frontmatter, 'description') || '';
    const argumentHint = readField(frontmatter, 'argument-hint') || '[args]';
    const key = file.replace(/\.md$/, '');

    dimensions.push(key);
    entries.push({
      key,
      kind: 'dimension',
      referencePath: `skills/${router}/reference/${file}`,
      bodyHash: sha256(body),
      bodyBytes: Buffer.byteLength(body, 'utf-8'),
      description,
      argumentHint,
    });

    console.log(`  + ${file}  (${body.length} chars, sha=${sha256(body).slice(0, 8)})`);
  }

  // Validate aggregates compositions reference only known dimensions.
  const dimSet = new Set(dimensions);
  const compositionWarnings = [];
  for (const [agg, composition] of Object.entries(aggregates)) {
    if (!Array.isArray(composition)) {
      compositionWarnings.push(`aggregate "${agg}" composition is not an array`);
      continue;
    }
    for (const d of composition) {
      if (!dimSet.has(d)) {
        compositionWarnings.push(`aggregate "${agg}" references unknown dimension "${d}"`);
      }
    }
  }

  const description = opts.description
    || existing.description
    || defaultDescriptionFor(router, dimensions.length, Object.keys(aggregates).length);

  const routerMeta = {
    skill: router,
    description,
    dimensions,
    aggregates,
    ...(models !== undefined ? { models } : {}),
  };
  writeFileSync(META_PATH, JSON.stringify(routerMeta, null, 2) + '\n', 'utf-8');

  const manifest = { generatedAt: new Date().toISOString(), entries };
  writeFileSync(
    join(SKILL_DIR, 'migration-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );

  console.log(`\nProcessed ${entries.length} reference(s) for /${router}.`);
  console.log(`Wrote: router-metadata.json, migration-manifest.json`);
  if (compositionWarnings.length > 0) {
    console.warn(`\nComposition warnings:`);
    for (const w of compositionWarnings) console.warn(`  - ${w}`);
  }
}

main();
