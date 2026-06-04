#!/usr/bin/env node
/**
 * tests/e2e/acceptance.mjs — end-to-end acceptance test.
 *
 * Builds a synthetic .ai/workflows/ tree with one schema-valid artifact for
 * every *render-eligible* admitted type (one per slug), runs the real
 * `render-sunflower.mjs --clean --diag` over it in a temp dir, then asserts the
 * joint acceptance condition:
 *
 *   1. render exits 0
 *   2. no `[render] no renderer for: X`   → every eligible type has a renderer
 *   3. `… N schema warnings`, N == 0       → every fixture is schema-valid
 *   4. no `[render]/[renderer]` error line → no renderer threw / failed to load
 *   5. every eligible type appears as data-artifact-type in the output tree
 *
 * "Render-eligible" = every type const in the frontmatter schema's `oneOf`
 * MINUS an explicit NOT_RENDERED set (the wf-docs intermediate artifacts and the
 * wf-quick/wf-meta lanes that intentionally fall through to fallbackRender). The
 * exclusion list is hardcoded ON PURPOSE: a newly-admitted type that forgets its
 * renderer is NOT auto-excluded — it is discovered, trips signal 2, and fails.
 *
 * Dispatch (loadRenderer → frontmatter `type`) and view-path resolution
 * (resolveViewPath → filename) are independent, so each fixture uses the same
 * resolvable filename and varies only its slug directory and frontmatter type.
 *
 * Usage:  node tests/e2e/acceptance.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');
const SCHEMA_PATH = join(PLUGIN_ROOT, 'tests', 'frontmatter.schema.json');

// A filename resolveViewPath() accepts (→ non-null view path). Reused for every
// type; only the slug + frontmatter type vary.
const RESOLVABLE_FILE = '01-intake.md';

// Admitted types that intentionally have no dedicated renderer. After the
// all-artifacts projection work this is just `routing` (90-next.md) — a
// regenerable point-in-time snapshot that duplicates 00-index's next-command, so
// it renders via fallbackRender by choice. Kept explicit so a forgotten renderer
// for a NEW type is caught rather than silently excluded.
const NOT_RENDERED = new Set([
  'routing',
]);

/* ───────────────────────── schema-driven fixture generator ───────────────── */

function resolveRef(schema, ref) {
  return ref.replace(/^#\//, '').split('/').reduce((cur, part) => cur?.[part], schema);
}

// Minimal value satisfying a property schema. Generic so a newly-required field
// is auto-filled — the test never hardcodes per-type frontmatter shapes.
function stubValue(schema, prop, depth = 0) {
  if (!prop || depth > 6) return 'e2e';

  if (prop.$ref) {
    const name = prop.$ref.split('/').pop();
    if (name === 'iso8601') return '2026-06-03T12:00:00Z';
    if (name === 'runId') return '20260603T1200Z';
    if (name === 'slug') return 'e2e';
    return stubValue(schema, resolveRef(schema, prop.$ref), depth + 1);
  }
  if (prop.const !== undefined) return prop.const;
  if (prop.enum) return prop.enum[0];
  if (prop.anyOf || prop.oneOf) return stubValue(schema, (prop.anyOf ?? prop.oneOf)[0], depth + 1);

  const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
  if (type === 'integer' || type === 'number') return prop.minimum ?? 0;
  if (type === 'boolean') return false;
  if (type === 'array') {
    const min = prop.minItems ?? 0;
    if (min > 0) {
      const item = stubValue(schema, prop.items ?? {}, depth + 1);
      return Array.from({ length: min }, () => item);
    }
    return [];
  }
  if (type === 'object') {
    const obj = {};
    for (const req of prop.required ?? []) obj[req] = stubValue(schema, prop.properties?.[req], depth + 1);
    return obj;
  }
  if (prop.pattern) {
    if (/^\^\\d\{4\}/.test(prop.pattern)) return '2026-06-03T12:00:00Z';
    if (/^\^\\d\{8\}/.test(prop.pattern)) return '20260603T1200Z';
  }
  return 'e2e';
}

function buildFrontmatter(schema, baseDef, branch, type, slug) {
  const fm = { schema: 'sdlc/v1', type, slug };
  const props = { ...(baseDef.properties ?? {}), ...(branch.properties ?? {}) };
  const required = new Set([...(baseDef.required ?? []), ...(branch.required ?? [])]);
  for (const field of required) {
    if (field === 'schema' || field === 'type' || field === 'slug') continue;
    fm[field] = stubValue(schema, props[field]);
  }
  if (!('title' in fm)) fm.title = `E2E ${type}`;
  return fm;
}

/* ───────────────────────── corpus + run ───────────────────────── */

function buildBranchIndex(schema) {
  const oneOf = schema.allOf.find((x) => x.oneOf).oneOf;
  const byType = new Map();
  const order = [];
  for (const ref of oneOf) {
    const branch = resolveRef(schema, ref.$ref);
    const t = branch.properties?.type;
    const types = t?.const ? [t.const] : (t?.enum ?? []);
    for (const type of types) {
      if (!byType.has(type)) { byType.set(type, branch); order.push(type); }
    }
  }
  return { byType, order };
}

function* walkHtml(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) yield* walkHtml(abs);
    else if (e.isFile() && abs.endsWith('.html')) yield abs;
  }
}

function renderedTypes(viewRoot) {
  const found = new Set();
  for (const html of walkHtml(viewRoot)) {
    const text = readFileSync(html, 'utf-8');
    for (const m of text.matchAll(/data-artifact-type="([^"]+)"/g)) found.add(m[1]);
  }
  return found;
}

function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf-8'));
  const baseDef = schema.$defs.base;
  const { byType, order } = buildBranchIndex(schema);

  const eligible = order.filter((t) => !NOT_RENDERED.has(t));
  const excluded = order.filter((t) => NOT_RENDERED.has(t));

  console.log(`[e2e] admitted: ${order.length} · render-eligible: ${eligible.length} · excluded (fall-through): ${excluded.length}`);
  console.log(`[e2e] excluded by design: ${excluded.slice().sort().join(', ')}`);

  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-e2e-'));
  try {
    for (const type of eligible) {
      const slug = `t-${type}`;
      const slugDir = join(tmp, '.ai', 'workflows', slug);
      mkdirSync(slugDir, { recursive: true });
      const fm = buildFrontmatter(schema, baseDef, byType.get(type), type, slug);
      const content = `---\n${yaml.dump(fm, { lineWidth: 120 })}---\n\n## ${type}\n\nSynthetic e2e fixture for \`${type}\`.\n`;
      writeFileSync(join(slugDir, RESOLVABLE_FILE), content, 'utf-8');
    }

    const child = spawnSync(process.execPath, [RENDER, '--clean', '--diag', '--plugin-root', PLUGIN_ROOT], {
      cwd: tmp,
      encoding: 'utf-8',
    });

    const stdout = child.stdout ?? '';
    const stderr = child.stderr ?? '';
    const failures = [];

    if (child.status !== 0) failures.push(`render exited with status ${child.status}`);

    const missingLine = stdout.split('\n').find((l) => l.includes('[render] no renderer for:'));
    if (missingLine) failures.push(missingLine.trim());

    const warnMatch = stdout.match(/(\d+)\s+schema warnings?/);
    const schemaWarnings = warnMatch ? Number(warnMatch[1]) : null;
    if (schemaWarnings === null) failures.push('could not parse schema-warnings count');
    else if (schemaWarnings > 0) failures.push(`schema warnings: ${schemaWarnings} > 0`);

    const renderErrors = stderr.split('\n').filter((l) => /^\[render(er)?\] /.test(l));
    if (renderErrors.length) failures.push(`render errors on stderr:\n    ${renderErrors.join('\n    ')}`);

    // Coverage: every eligible type must appear as a rendered artifact page.
    const rendered = renderedTypes(join(tmp, '.ai', '_view'));
    const uncovered = eligible.filter((t) => !rendered.has(t));
    if (uncovered.length) failures.push(`types planted but never rendered: ${uncovered.join(', ')}`);

    console.log(stdout.trim());
    if (failures.length) {
      console.error(`\n[e2e] FAIL (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
      for (const f of failures) console.error(`  - ${f}`);
      if (stderr.trim()) console.error(`\n[e2e] stderr:\n${stderr.trim()}`);
      process.exit(1);
    }

    console.log('[render] no renderer for: (none)');
    console.log(`[e2e] PASS — ${eligible.length} eligible types rendered, 0 missing renderers, ${schemaWarnings} schema warnings`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
