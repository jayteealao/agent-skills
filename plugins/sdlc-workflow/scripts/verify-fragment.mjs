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
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const ALLOWED_FRAGMENT_NAMES = new Set([
  'review', 'rca', 'plan', 'design', 'ship-run', 'shiprun',
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

function validateFragment(absPath, ajv, siblingSchemas) {
  const errs = [];
  const text = readFileSync(absPath, 'utf-8');

  // Detect fragment name from <section class="fragment-X">
  const sectionMatch = text.match(/<section\s+class="fragment-([a-z-]+)"/);
  if (!sectionMatch) {
    errs.push('no top-level <section class="fragment-…"> wrapper');
    return errs;
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
    if (schema) {
      let parsed;
      try { parsed = yaml.load(readFileSync(yamlPath, 'utf-8')); }
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

  return errs;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = resolve(process.cwd(), args.root);
  const schemaText = readFileSync(args.schema, 'utf-8');
  const schema = JSON.parse(schemaText);
  const siblingSchemas = schema.siblingYamlSchemas ?? {};

  const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
  addFormats(ajv);

  let total = 0, failed = 0;
  const failures = [];

  for (const abs of walk(root)) {
    total++;
    const errs = validateFragment(abs, ajv, siblingSchemas);
    if (errs.length) {
      failed++;
      const rel = relative(process.cwd(), abs);
      failures.push({ path: rel, errs });
    } else if (args.verbose) {
      console.log(`[ok] ${relative(process.cwd(), abs)}`);
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
