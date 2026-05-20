// components/_components.mjs — snippet expander (v9.20.1, Phase 1.5)
//
// Replaces every `<!-- @include <name> <json> -->` directive in a fragment
// with the corresponding components/<name>.html.snippet content, substituting
// {{token}} placeholders from the json payload. Runs to fixed point bounded
// by maxDepth=4 (snippets may include other snippets).
//
// Placeholder grammar:
//   {{name}}      → HTML-escaped substitution
//   {{{name}}}    → raw substitution (snippet-author use only)
//
// Suppression:
//   <!-- @include-skip <reason> -->  — author note to verifier Check 9 that
//                                       an inline copy is intentional.
//
// See SUNFLOWER-VIEW-PLAN §"Expander contract" / §"Include syntax".

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const INCLUDE_RE = /<!--\s*@include\s+([a-z][a-z0-9-]*)\s+([\s\S]*?)\s*-->/g;

const snippetCache = new Map();

function loadSnippet(componentsRoot, name) {
  const cacheKey = `${componentsRoot}::${name}`;
  if (snippetCache.has(cacheKey)) return snippetCache.get(cacheKey);
  const path = join(componentsRoot, `${name}.html.snippet`);
  if (!existsSync(path)) {
    throw new Error(`@include: snippet not found: ${name}.html.snippet`);
  }
  const text = readFileSync(path, 'utf-8');
  snippetCache.set(cacheKey, text);
  return text;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a snippet body by substituting placeholders from `data`. Supports:
 *   - `{{key}}`  — HTML-escaped scalar
 *   - `{{{key}}}` — raw scalar (caller's responsibility to ensure safety)
 *   - `{{#each list}}…{{/each}}` — loop block (inside the loop, `{{this.k}}`
 *                                  references the current item's keys);
 *                                  nested loops supported via depth counting.
 *
 * Loops are kept intentionally minimal — enough for `metric-row.html.snippet`
 * to iterate a `metrics: [...]` array with nested per-item style classes,
 * but not Turing-complete.
 */
function renderSnippet(body, data) {
  // Resolve `{{#each X}}…{{/each}}` blocks with depth-counting so nested
  // loops bind to the correct opener. Walks the string once.
  let out = '';
  let i = 0;
  const eachOpenRe = /\{\{#each\s+([a-z0-9_.-]+)\s*\}\}/g;
  const blockRe    = /\{\{(#each\s+[a-z0-9_.-]+\s*|\/each)\}\}/g;

  while (i < body.length) {
    eachOpenRe.lastIndex = i;
    const open = eachOpenRe.exec(body);
    if (!open) {
      out += body.slice(i);
      break;
    }
    out += body.slice(i, open.index);

    const innerStart = open.index + open[0].length;
    blockRe.lastIndex = innerStart;
    let depth = 1, innerEnd = -1, blockEnd = -1;
    let m;
    while ((m = blockRe.exec(body)) !== null) {
      if (m[1].startsWith('#each')) depth++;
      else { depth--; if (depth === 0) { innerEnd = m.index; blockEnd = blockRe.lastIndex; break; } }
    }
    if (innerEnd < 0) throw new Error('unbalanced {{#each}} … {{/each}} in snippet');

    const inner = body.slice(innerStart, innerEnd);
    const list = resolvePath(data, open[1]);
    if (Array.isArray(list)) {
      for (const item of list) {
        out += renderSnippet(inner, { ...data, this: item });
      }
    }
    i = blockEnd;
  }

  // Raw placeholders first (so HTML-escape pass doesn't double-escape them).
  out = out.replace(/\{\{\{([a-z0-9_.-]+)\}\}\}/g, (_, key) => {
    const v = resolvePath(data, key);
    return v == null ? '' : String(v);
  });

  // HTML-escaped placeholders.
  out = out.replace(/\{\{([a-z0-9_.-]+)\}\}/g, (_, key) => {
    const v = resolvePath(data, key);
    return v == null ? '' : escapeHtml(v);
  });

  return out;
}

function resolvePath(obj, dotted) {
  if (!obj) return undefined;
  return dotted.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/**
 * Expand `<!-- @include <name> <json> -->` tokens in `html` to a fixed point.
 *
 * @param {string} html — fragment HTML (post-validation, pre-shell-wrap)
 * @param {object} ctx
 * @param {string} ctx.componentsRoot — absolute path to components/ directory
 * @param {number} [ctx.maxDepth=4]   — recursion bound
 * @returns {string} expanded HTML
 */
export function expand(html, ctx) {
  if (!html || typeof html !== 'string') return html ?? '';
  const componentsRoot = ctx?.componentsRoot;
  if (!componentsRoot) throw new Error('expand: ctx.componentsRoot required');
  const maxDepth = ctx?.maxDepth ?? 4;

  let current = html;
  for (let depth = 0; depth <= maxDepth; depth++) {
    if (!INCLUDE_RE.test(current)) return current;
    INCLUDE_RE.lastIndex = 0;

    if (depth === maxDepth) {
      throw new Error(`@include: expansion exceeded maxDepth=${maxDepth} (possible cycle)`);
    }

    current = current.replace(INCLUDE_RE, (match, name, payloadRaw) => {
      let data;
      try {
        data = payloadRaw.trim() ? JSON.parse(payloadRaw.trim()) : {};
      } catch (err) {
        throw new Error(`@include ${name}: invalid JSON payload — ${err.message}`);
      }
      const snippet = loadSnippet(componentsRoot, name);
      return renderSnippet(snippet, data);
    });
  }
  return current;
}

/** Reset the snippet file cache. Used by tests to pick up author edits. */
export function clearCache() {
  snippetCache.clear();
}
