#!/usr/bin/env node
/**
 * One-shot migrator for the /review router (PR-1).
 *
 * Reads each commands/review-*.md and commands/review/*.md, splits frontmatter
 * from body, relocates the body byte-for-byte to skills/review/reference/<key>.md
 * (with kept frontmatter for description/args), and writes:
 *
 *   - skills/review/router-metadata.json    (router key + shim entries for each old command)
 *   - skills/review/migration-manifest.json (SHA-256 of each original body for verifier)
 *
 * Run once, before invoking router-shim.mjs.
 *
 * Usage:
 *   node plugins/sdlc-workflow/scripts/migrate-review.mjs
 *
 * After this runs, the originals are still on disk untouched. router-shim.mjs
 * is the step that replaces them with redirect shims.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// Aggregates: commands/review-*.md (excluding commands/review.md which is the new router)
const AGGREGATES = [
  { old: 'commands/review-all.md',          sub: 'all' },
  { old: 'commands/review-architecture.md', sub: 'architecture' },
  { old: 'commands/review-infra.md',        sub: 'infra' },
  { old: 'commands/review-pre-merge.md',    sub: 'pre-merge' },
  { old: 'commands/review-quick.md',        sub: 'quick' },
  { old: 'commands/review-security.md',     sub: 'security' },
  { old: 'commands/review-ux.md',           sub: 'ux' },
];

// Per-dimension files live under commands/review/. Discover them dynamically so
// new dimensions added before this script runs are picked up automatically.
function discoverDimensions() {
  const dir = join(PLUGIN_ROOT, 'commands', 'review');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      old: `commands/review/${f}`,
      sub: f.replace(/\.md$/, ''),
      isNested: true,
    }));
}

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error('No frontmatter found');
  return { frontmatter: m[1], body: m[2] };
}

function parseFrontmatterFields(fm) {
  // Minimal YAML extraction: top-level scalar fields and the args block.
  // We don't need a full YAML parser — frontmatter shape is constrained and
  // we only read the fields the migration cares about.
  const fields = {};
  const lines = fm.split(/\r?\n/);
  let inArgs = false;
  let argsRaw = [];
  let argHint = null;

  for (const line of lines) {
    if (inArgs) {
      // args block ends when a top-level field starts (no leading whitespace)
      if (/^[A-Za-z][\w-]*\s*:/.test(line)) {
        inArgs = false;
        // fall through to top-level handling
      } else {
        argsRaw.push(line);
        continue;
      }
    }
    const topMatch = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!topMatch) continue;
    const [, key, valRaw] = topMatch;
    const val = valRaw.trim();
    if (key === 'args') {
      inArgs = true;
      continue;
    }
    if (key === 'name') fields.name = stripQuotes(val);
    else if (key === 'description') fields.description = stripQuotes(val);
    else if (key === 'argument-hint') argHint = stripQuotes(val);
    else if (key === 'disable-model-invocation') {/* drop */}
  }

  fields.argsRaw = argsRaw.join('\n');
  fields.argumentHint = argHint;
  return fields;
}

function stripQuotes(s) {
  if (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) {
    try { return JSON.parse(s.startsWith("'") ? `"${s.slice(1, -1).replace(/"/g, '\\"')}"` : s); }
    catch { return s.slice(1, -1); }
  }
  return s;
}

function buildReferenceFile(fields, body) {
  // Reference frontmatter: keep description and args, drop name and disable-model-invocation.
  const lines = ['---'];
  if (fields.description) lines.push(`description: ${JSON.stringify(fields.description)}`);
  if (fields.argsRaw && fields.argsRaw.trim().length > 0) {
    lines.push('args:');
    for (const l of fields.argsRaw.split('\n')) {
      if (l.length > 0) lines.push(l);
    }
  }
  lines.push('---');
  lines.push('');
  return lines.join('\n') + body;
}

function sha256(s) {
  // Normalize line endings before hashing so the manifest verifies identically
  // across Windows (autocrlf=true) and Linux clones.
  const normalized = s.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function deriveArgumentHint(fields) {
  // Canonical default for review commands when not explicit.
  return fields.argumentHint || '[scope] [target]';
}

function main() {
  const refDir = join(PLUGIN_ROOT, 'skills', 'review', 'reference');
  mkdirSync(refDir, { recursive: true });

  const all = [
    ...AGGREGATES.map((a) => ({ ...a, key: `_aggregate-${a.sub}`, isAggregate: true })),
    ...discoverDimensions().map((d) => ({ ...d, key: d.sub, isAggregate: false })),
  ];

  const shims = [];
  const manifest = { generatedAt: new Date().toISOString(), entries: [] };

  for (const item of all) {
    const refPath = join(refDir, `${item.key}.md`);
    const oldAbs = join(PLUGIN_ROOT, item.old);
    let source;

    // Idempotence: once a reference file exists, IT is the canonical body
    // source. The original commands/*.md will have been replaced by a shim
    // that redirects to the router; reading from it on a re-run would
    // overwrite the reference with shim content.
    if (existsSync(refPath)) {
      source = readFileSync(refPath, 'utf-8');
    } else if (existsSync(oldAbs)) {
      const original = readFileSync(oldAbs, 'utf-8');
      // First-run guard: if the source is already a shim, refuse — the user
      // ran shim generation before the migrator. Migration must run on the
      // pre-shim originals.
      if (original.includes('<!-- sdlc-workflow-pinned-shim -->')) {
        console.error(
          `REFUSE: ${item.old} is already a shim and no reference exists yet.\n` +
          `        Restore the original from git history before running the migrator:\n` +
          `        git checkout <pre-migration-sha> -- ${item.old}`
        );
        process.exit(1);
      }
      source = original;
    } else {
      console.error(`MISSING source: ${item.old}`);
      continue;
    }

    const { frontmatter, body } = splitFrontmatter(source);
    const fields = parseFrontmatterFields(frontmatter);

    // Write reference file (frontmatter rebuilt minus name + disable-model-invocation).
    // On re-runs from an existing reference, this is effectively a no-op rebuild
    // that re-canonicalizes the frontmatter; body is preserved.
    writeFileSync(refPath, buildReferenceFile(fields, body), 'utf-8');

    const bodyHash = sha256(body);

    // Aggregates redirect to "/review pass <name>" so they don't collide with
    // per-dimension keys of the same name (architecture, infra, security).
    const shimSub = item.isAggregate ? `pass ${item.sub}` : item.sub;
    shims.push({
      oldPath: item.old,
      subcommand: shimSub,
      kind: item.isAggregate ? 'aggregate' : 'dimension',
      key: item.sub,
      description: fields.description || '',
      argumentHint: deriveArgumentHint(fields),
    });

    manifest.entries.push({
      oldPath: item.old,
      referencePath: `skills/review/reference/${item.key}.md`,
      bodyHash,
      bodyBytes: Buffer.byteLength(body, 'utf-8'),
      description: fields.description || '',
      argumentHint: deriveArgumentHint(fields),
    });

    console.log(`  + skills/review/reference/${item.key}.md  (${body.length} chars, sha=${bodyHash.slice(0, 8)})`);
  }

  // Router metadata
  const routerMeta = {
    router: '/review',
    description: 'Code review router. Per-dimension reviews (security, correctness, ...) plus 7 aggregates (all, architecture, infra, pre-merge, quick, security, ux).',
    shims,
  };
  writeFileSync(
    join(PLUGIN_ROOT, 'skills', 'review', 'router-metadata.json'),
    JSON.stringify(routerMeta, null, 2),
    'utf-8',
  );

  // Verifier manifest
  writeFileSync(
    join(PLUGIN_ROOT, 'skills', 'review', 'migration-manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  console.log(`\nMigrated ${all.length} review commands.`);
  console.log(`Wrote: skills/review/reference/*, router-metadata.json, migration-manifest.json`);
}

main();
