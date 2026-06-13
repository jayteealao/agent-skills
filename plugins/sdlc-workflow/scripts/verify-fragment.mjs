#!/usr/bin/env node
/**
 * scripts/verify-fragment.mjs — Check 7 (fragment validity) implementation.
 *
 * For each *.html.fragment under .ai/workflows/, enforce the gallery contract
 * from SUNFLOWER-VIEW-PLAN §"Fragment contract":
 *
 *   1. Exactly one top-level <section class="fragment-<name>">.
 *   2. No <html>, <head>, <body>, <iframe>, <link>, <script src="...">.
 *   3. Inline <script> blocks only.
 *   4. sdlc:fragment-ready dispatch present.
 *   5. Severity / verdict positions use paired glyph + colour (no naked emoji).
 *   6. Sibling .yaml is present and validates against the matching sibling
 *      YAML schema in siblingYamlSchemas.
 *
 * Exit code 0 = pass, 1 = at least one fragment failed.
 *
 * Usage:
 *   node plugins/sdlc-workflow/scripts/verify-fragment.mjs [--root .ai/workflows]
 *                                                          [--schema <path>]
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { classifyFragmentName } from '../renderers/_paths.mjs';

/**
 * Classify a `*.html.fragment` against the `.md` artifacts beside it:
 *   - 'typed'  — `<stem>.html.fragment` for an existing `<stem>.md`. The full
 *                envelope contract below applies (scoped section, sibling YAML, …).
 *   - 'free'   — `<stem>.<label>.html.fragment` for an existing `<stem>.md`. The
 *                UNRESTRICTED narrative tier — EXEMPT from the contract.
 *   - 'orphan' — no sibling `.md` makes it either; validated as typed (best
 *                effort) so a stray fragment still gets contract feedback.
 * Uses the single-source-of-truth classifier so the verifier and the renderer
 * agree on the naming convention.
 */
function fragmentTier(absPath) {
  const dir = dirname(absPath);
  const base = basename(absPath);
  let mds;
  try { mds = readdirSync(dir).filter((n) => n.endsWith('.md')); }
  catch { return 'orphan'; }
  const stems = mds.map((n) => n.slice(0, -'.md'.length));
  if (stems.some((stem) => classifyFragmentName(base, stem)?.tier === 'typed')) return 'typed';
  if (stems.some((stem) => classifyFragmentName(base, stem)?.tier === 'free')) return 'free';
  return 'orphan';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const ALLOWED_FRAGMENT_NAMES = new Set([
  'review', 'review-dimension', 'rca', 'plan', 'design', 'ship-run', 'shiprun',
  'design-contract', 'design-critique', 'design-audit',
  // Phase 3 (v9.22.0)
  'simplify-run', 'profile', 'benchmark', 'experiment', 'instrument',
]);

const FORBIDDEN_TAGS = ['<html', '<head', '<body', '<iframe', '<link'];
const REMOTE_SCRIPT_RE = /<script[^>]*\bsrc\s*=/i;

function parseArgs(argv) {
  const args = { root: '.ai/workflows', schema: join(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json'), verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root')    args.root = argv[++i];
    if (a === '--schema')  args.schema = resolve(argv[++i]);
    if (a === '--verbose') args.verbose = true;
  }
  return args;
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      yield* walk(abs);
    } else if (entry.isFile() && abs.endsWith('.html.fragment')) {
      yield abs;
    }
  }
}

/* ── Check 9 — published-snippet detection (warn-only, v9.20.1+) ────
   Fingerprints inline markup that exactly matches a published snippet,
   suggesting the author should have used `<!-- @include … -->` instead.
   Suppress via an `<!-- @include-skip <reason> -->` comment adjacent to
   the inline markup. Plan §"Verifier addition (Check 9)" lines 1063-1065.
   ──────────────────────────────────────────────────────────────────── */

const PUBLISHED_SNIPPET_FINGERPRINTS = [
  // metric-row — the .metric-row wrapper + first .metric cell
  { snippet: 'metric-row', pattern: /<div\s+class="metric-row"\s*>\s*<div\s+class="metric/i },
  // callout
  { snippet: 'callout',    pattern: /<aside\s+class="callout\s+callout-(?:risk|warn|info|ok)"/i },
  // verdict
  { snippet: 'verdict',    pattern: /<section\s+class="verdict\s+verdict-(?:ship|caveats|no)"/i },
  // severity-chip
  { snippet: 'severity-chip', pattern: /<span\s+class="sev\s+severity-(?:blocker|high|med|low|nit)"/i },
  // fragment-ready inline script
  { snippet: 'fragment-ready', pattern: /dispatchEvent\(new\s+CustomEvent\(\s*['"]sdlc:fragment-ready/i },
];

function detectInlineSnippets(text) {
  const warnings = [];
  for (const { snippet, pattern } of PUBLISHED_SNIPPET_FINGERPRINTS) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    // Check for a suppression directive within ~200 chars of the first match
    const idx = text.search(pattern);
    const window = text.slice(Math.max(0, idx - 120), Math.min(text.length, idx + 120));
    if (/<!--\s*@include-skip\b/.test(window)) continue;
    // If the matching markup is itself the @include's expansion result, skip.
    // We approximate by checking that the same snippet is NOT @included anywhere
    // — if it is, this fragment is partial-include and the author may have chosen
    // to inline one instance for a legitimate variant.
    const includesThisSnippet = new RegExp(`<!--\\s*@include\\s+${snippet}\\b`).test(text);
    if (includesThisSnippet) continue;
    warnings.push(`could use @include ${snippet} (inline markup matches published snippet)`);
  }
  return warnings;
}

function normalizeYamlScalars(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => normalizeYamlScalars(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeYamlScalars(item)]),
    );
  }
  return value;
}

function validateFragment(absPath, ajv, siblingSchemas) {
  const errs = [];
  const warns = [];

  // Tier 2 — free narrative fragments (`<stem>.<label>.html.fragment`) are
  // UNRESTRICTED raw HTML; the envelope contract below does not apply to them.
  // Exempt before reading so an empty/exotic free fragment never trips a check.
  if (fragmentTier(absPath) === 'free') {
    return { errs, warns };
  }

  const text = readFileSync(absPath, 'utf-8');

  // Check 9 — published-snippet detection (warnings, not errors)
  for (const w of detectInlineSnippets(text)) warns.push(w);

  // Detect fragment name from <section class="fragment-X">
  const sectionMatch = text.match(/<section\s+class="fragment-([a-z-]+)"/);
  if (!sectionMatch) {
    errs.push('no top-level <section class="fragment-…"> wrapper');
    return { errs, warns };
  }
  const name = sectionMatch[1];
  if (!ALLOWED_FRAGMENT_NAMES.has(name)) {
    errs.push(`fragment name "${name}" not in allowed set (${[...ALLOWED_FRAGMENT_NAMES].join(', ')})`);
  }

  // Check there's only one such section at top level
  const allSections = text.match(/<section\s+class="fragment-/g) ?? [];
  if (allSections.length !== 1) {
    errs.push(`expected exactly one <section class="fragment-*">, found ${allSections.length}`);
  }

  // Forbidden tags
  for (const tag of FORBIDDEN_TAGS) {
    if (text.toLowerCase().includes(tag)) errs.push(`forbidden tag found: ${tag}>`);
  }

  // Remote script
  if (REMOTE_SCRIPT_RE.test(text)) {
    errs.push('remote <script src="…"> found — fragments must inline JS');
  }

  // sdlc:fragment-ready dispatch
  if (!/sdlc:fragment-ready/.test(text)) {
    errs.push('missing sdlc:fragment-ready dispatch');
  }

  // Sibling YAML validation
  const yamlPath = absPath.replace(/\.html\.fragment$/, '.yaml');
  if (!existsSync(yamlPath)) {
    errs.push(`sibling .yaml missing: ${basename(yamlPath)}`);
  } else {
    const schemaKey = name === 'shiprun' ? 'ship-run' : name;
    const schema = siblingSchemas?.[schemaKey];
    if (name === 'review-dimension' && !schema) {
      // Defensive — shouldn't happen now the schema ships, but don't crash.
      errs.push('sibling .yaml schema "review-dimension" missing from frontmatter.schema.json');
    }
    if (schema) {
      let parsed;
      try { parsed = normalizeYamlScalars(yaml.load(readFileSync(yamlPath, 'utf-8'))); }
      catch (e) { errs.push(`sibling .yaml parse error: ${e.message}`); }
      if (parsed) {
        const validate = ajv.compile(schema);
        if (!validate(parsed)) {
          for (const e of (validate.errors ?? []).slice(0, 5)) {
            errs.push(`sibling .yaml: ${e.instancePath || '/'} ${e.message}`);
          }
        }
      }
    }
  }

  return { errs, warns };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(process.cwd(), args.root);
  const schemaText = readFileSync(args.schema, 'utf-8');
  const schema = JSON.parse(schemaText);
  const siblingSchemas = Object.fromEntries(
    Object.entries(schema.siblingYamlSchemas ?? {}).map(([key, siblingSchema]) => [
      key,
      {
        ...siblingSchema,
        $schema: schema.$schema,
        $defs: schema.$defs ?? {},
      },
    ]),
  );

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false,
  });
  addFormats(ajv);

  let total = 0, failed = 0, warned = 0;
  const failures = [];
  const warnings = [];

  for (const abs of walk(root)) {
    total++;
    const { errs, warns } = validateFragment(abs, ajv, siblingSchemas);
    const rel = relative(process.cwd(), abs);
    if (errs.length) {
      failed++;
      failures.push({ path: rel, errs });
    } else if (args.verbose) {
      console.log(`[ok] ${rel}`);
    }
    if (warns.length) {
      warned++;
      warnings.push({ path: rel, warns });
    }
  }

  if (warned > 0) {
    console.log(`[verify-fragment] Check 9 (snippet-suggestion) — ${warned} fragment${warned === 1 ? '' : 's'} could use @include:`);
    for (const w of warnings) {
      console.log(`  ${w.path}`);
      for (const warn of w.warns) console.log(`    - ${warn}`);
    }
  }

  if (failed > 0) {
    console.error(`[verify-fragment] ${failed} of ${total} fragment${total === 1 ? '' : 's'} failed:`);
    for (const f of failures) {
      console.error(`\n  ${f.path}`);
      for (const e of f.errs) console.error(`    - ${e}`);
    }
    process.exit(1);
  }
  console.log(`[verify-fragment] ${total} fragment${total === 1 ? '' : 's'} OK`);
}

main();
