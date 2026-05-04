#!/usr/bin/env node
/**
 * Manifest rebuilder for the /review skill (v9.0.0-alpha.1+).
 *
 * Walks every dimension reference under skills/review/reference/ and writes:
 *
 *   - skills/review/router-metadata.json    (skill name, dimension key list,
 *                                            aggregates composition map)
 *   - skills/review/migration-manifest.json (SHA-256 + size of each dimension
 *                                            reference body)
 *
 * The aggregates composition map (which dimension keys each named aggregate
 * dispatches when invoked via `/review sweep <agg>`) is policy data, not
 * generated content. The migrator preserves whatever aggregates section is
 * already present in router-metadata.json across runs. Hand-edit the file to
 * change compositions; the migrator keeps the edits.
 *
 *   node plugins/sdlc-workflow/scripts/migrate-review.mjs
 *
 * Historical note: this script began life as the one-shot relocator from
 * `commands/*.md` into `skills/review/reference/*.md` (v8.32 router migration).
 * v9.0.0-alpha.1 removed the legacy command shims and the curated aggregate
 * reference bodies. The script's job is now "rebuild dimension manifest;
 * preserve hand-maintained aggregates map."
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const REF_DIR = join(PLUGIN_ROOT, 'skills', 'review', 'reference');
const SKILL_DIR = join(PLUGIN_ROOT, 'skills', 'review');
const META_PATH = join(SKILL_DIR, 'router-metadata.json');

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error('No frontmatter found');
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

function loadExistingMeta() {
  if (!existsSync(META_PATH)) return {};
  try {
    return JSON.parse(readFileSync(META_PATH, 'utf-8'));
  } catch (err) {
    console.warn(`  warn: could not parse ${META_PATH}: ${err.message}`);
    return {};
  }
}

function main() {
  if (!existsSync(REF_DIR)) {
    console.error(`Reference dir missing: ${REF_DIR}`);
    process.exit(1);
  }

  const existing = loadExistingMeta();
  const aggregates = existing.aggregates && typeof existing.aggregates === 'object'
    ? existing.aggregates
    : {};
  if (Object.keys(aggregates).length === 0) {
    console.warn('  warn: no aggregates map found in router-metadata.json. Sweeps will be undefined until you populate the aggregates section.');
  }

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
    const { frontmatter, body } = splitFrontmatter(text);
    const description = readField(frontmatter, 'description') || '';
    const argumentHint = readField(frontmatter, 'argument-hint') || '[scope] [target]';
    const key = file.replace(/\.md$/, '');

    dimensions.push(key);
    entries.push({
      key,
      kind: 'dimension',
      referencePath: `skills/review/reference/${file}`,
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

  const routerMeta = {
    skill: 'review',
    description:
      `Code review skill. ${dimensions.length} per-dimension reviews (correctness, security, performance, ...) ` +
      `plus ${Object.keys(aggregates).length} named multi-dimension sweeps (each dispatches one sub-agent per ` +
      `dimension in its composition). Single dimension: /review <dim>. Sweep: /review sweep <aggregate>.`,
    dimensions,
    aggregates,
  };
  writeFileSync(META_PATH, JSON.stringify(routerMeta, null, 2) + '\n', 'utf-8');

  const manifest = { generatedAt: new Date().toISOString(), entries };
  writeFileSync(
    join(SKILL_DIR, 'migration-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );

  console.log(`\nProcessed ${entries.length} dimension reference(s).`);
  console.log(`Wrote: router-metadata.json, migration-manifest.json`);
  if (compositionWarnings.length > 0) {
    console.warn(`\nComposition warnings:`);
    for (const w of compositionWarnings) console.warn(`  - ${w}`);
  }
}

main();
