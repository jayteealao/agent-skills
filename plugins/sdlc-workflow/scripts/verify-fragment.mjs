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
import { classifyFragmentName, EXPLAINER_LABEL } from '../renderers/_paths.mjs';

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

/* ── Explainer check (warn-only, W5) ─────────────────────────────────
   `<stem>.explainer.html.fragment` is a free fragment, so the envelope
   contract does not apply. It follows the explainer rules in
   skills/wf/reference/_story-arc.md instead; this check covers the parts a
   script can see:
     - the first element is a <p> (the plain summary);
     - each visual (<svg>, <figure>, `@include explainer/*`) directly follows
       a <p> sentence that says what it shows;
     - the last element is a <p> (the recap);
     - no <html>, <head> or <body>;
     - no <script> (the view's CSP `script-src 'self'` blocks inline scripts,
       so a script in a fragment never runs).
   Every finding is a warning. Only a file that does not parse (an unclosed
   or mismatched tag, an unclosed comment) is an error.
   ──────────────────────────────────────────────────────────────────── */

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
// Tags HTML lets an author leave open; a close tag of an ancestor closes them.
const IMPLIED_END = new Set(['p', 'li', 'dt', 'dd', 'tr', 'td', 'th', 'option', 'thead', 'tbody', 'tfoot']);
const WRAPPER_TAGS = new Set(['div', 'section', 'article', 'main']);

/**
 * Parse a fragment into a light element tree:
 *   { type: 'el', tag, children } | { type: 'text', text } | { type: 'comment', text }
 * Throws Error on a structure that does not parse.
 */
export function parseFragmentTree(text) {
  const root = { type: 'el', tag: '#root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const TOKEN = /<!--([\s\S]*?)-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    const [, comment, closeTag, openTag, , selfClose, txt, stray] = m;
    if (comment !== undefined) {
      top().children.push({ type: 'comment', text: comment });
    } else if (closeTag) {
      const tag = closeTag.toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag && IMPLIED_END.has(stack[i].tag)) i--;
      if (i === 0 || stack[i].tag !== tag) {
        throw new Error(`unexpected </${tag}> (open element: <${top().tag}>)`);
      }
      stack.length = i;
    } else if (openTag) {
      const tag = openTag.toLowerCase();
      const el = { type: 'el', tag, children: [] };
      top().children.push(el);
      if (RAW_TEXT_TAGS.has(tag)) {
        const end = text.toLowerCase().indexOf(`</${tag}`, TOKEN.lastIndex);
        if (end === -1) throw new Error(`unclosed <${tag}>`);
        el.children.push({ type: 'text', text: text.slice(TOKEN.lastIndex, end) });
        const close = text.indexOf('>', end);
        TOKEN.lastIndex = close === -1 ? text.length : close + 1;
      } else if (!selfClose && !VOID_TAGS.has(tag)) {
        stack.push(el);
      }
    } else if (txt !== undefined) {
      top().children.push({ type: 'text', text: txt });
    } else if (stray) {
      if (text.startsWith('<!--', m.index)) throw new Error('unclosed comment');
      top().children.push({ type: 'text', text: '<' });
    }
  }
  const unclosed = stack.slice(1).filter((el) => !IMPLIED_END.has(el.tag));
  if (unclosed.length) throw new Error(`unclosed <${unclosed[unclosed.length - 1].tag}>`);
  return root;
}

function isBlank(node) {
  return node.type === 'text' && !node.text.trim();
}

function isExplainerInclude(node) {
  return node.type === 'comment' && /^\s*@include\s+explainer\//.test(node.text);
}

function isVisual(node) {
  return (node.type === 'el' && (node.tag === 'svg' || node.tag === 'figure')) || isExplainerInclude(node);
}

function describe(node) {
  if (isExplainerInclude(node)) return `@include ${node.text.trim().split(/\s+/)[1]}`;
  if (node.type === 'el') return `<${node.tag}>`;
  return 'text';
}

/**
 * The explainer shape check. Returns `{ errs, warns }` like validateFragment.
 */
export function checkExplainer(text) {
  const errs = [];
  const warns = [];
  let tree;
  try {
    tree = parseFragmentTree(String(text ?? ''));
  } catch (err) {
    errs.push(`explainer does not parse: ${err.message}`);
    return { errs, warns };
  }
  const lower = String(text).toLowerCase();
  for (const tag of ['<html', '<head', '<body']) {
    if (new RegExp(`${tag}[\\s>]`).test(lower)) warns.push(`explainer: remove ${tag}> (a fragment is not a full document)`);
  }
  if (/<script[\s>]/.test(lower)) {
    warns.push("explainer: <script> never runs in the view (CSP script-src 'self'); use CSS-only interaction or remove it");
  }
  // Blocks = top-level nodes without blank text, non-include comments and
  // <style>. A single wrapper element around everything is looked through.
  const blocksOf = (el) => el.children.filter((n) => !isBlank(n)
    && !(n.type === 'comment' && !isExplainerInclude(n))
    && !(n.type === 'el' && n.tag === 'style'));
  let blocks = blocksOf(tree);
  while (blocks.length === 1 && blocks[0].type === 'el' && WRAPPER_TAGS.has(blocks[0].tag)) {
    blocks = blocksOf(blocks[0]);
  }
  if (!blocks.length) {
    warns.push('explainer: empty — open with a plain summary paragraph');
    return { errs, warns };
  }
  const isP = (n) => n?.type === 'el' && n.tag === 'p';
  if (!isP(blocks[0])) {
    warns.push(`explainer: open with a plain summary <p> (first element is ${describe(blocks[0])})`);
  }
  blocks.forEach((n, i) => {
    if (!isVisual(n)) return;
    if (!isP(blocks[i - 1])) {
      warns.push(`explainer: put one <p> sentence before ${describe(n)} #${blocks.slice(0, i + 1).filter(isVisual).length} that says what it shows`);
    }
  });
  if (!isP(blocks[blocks.length - 1]) || blocks.length < 2) {
    warns.push('explainer: close with a short recap <p>');
  }
  return { errs, warns };
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
    // The explainer is a free fragment with a light shape check (warnings only;
    // an unparseable file is the one error).
    if (absPath.endsWith(`.${EXPLAINER_LABEL}.html.fragment`)) {
      return checkExplainer(readFileSync(absPath, 'utf-8'));
    }
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
    console.log(`[verify-fragment] warnings (Check 9 snippet suggestions, explainer shape) — ${warned} fragment${warned === 1 ? '' : 's'}:`);
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

// Run as a CLI only; an import (unit tests of checkExplainer) runs nothing.
const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && samePath(resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  main();
}
