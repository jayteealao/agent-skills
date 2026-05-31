// renderers/_link-graph.mjs
// Resolve cross-artifact refs: values to view-tree URLs. Two-pass: pass 1
// collects every artifact's view path; pass 2 rewrites refs: in each renderer
// invocation. Broken refs render with `.broken-link` class.

import { posix as path } from 'node:path';

import { resolveViewPath } from './_paths.mjs';

/**
 * Build pathMap: storagePath → viewPath for every artifact in a slug. Used
 * before any renderer runs so refs: can be rewritten.
 *
 * Off-pipeline artifacts (kind: simplify | profile) need their kind passed
 * to `resolveViewPath` so the off-pipeline branch fires; otherwise they
 * return null and silently drop out of the path map.
 *
 * @param {Array<{ path: string, kind?: string }>} artifacts — list with storage-relative paths
 * @returns {Map<string,string>}
 */
export function buildPathMap(artifacts) {
  const map = new Map();
  for (const a of artifacts) {
    const r = resolveViewPath(a.path, { kind: a.kind });
    if (r) map.set(a.path, r.viewRel);
  }
  return map;
}

/**
 * Rewrite a single refs entry. Accepts either a string or an array. Returns
 * an array of `{ role, label, href, broken }` records for downstream rendering.
 */
export function resolveRefs(refs, pathMap, currentStorageRel) {
  if (!refs) return [];
  const out = [];
  const currentViewRel = pathMap.get(currentStorageRel) ?? '';
  for (const [role, val] of Object.entries(refs)) {
    const vals = Array.isArray(val) ? val : [val];
    for (const v of vals) {
      if (typeof v !== 'string') continue;
      const target = pathMap.get(v);
      if (target) {
        out.push({
          role,
          label: v,
          href:  relativeBetween(currentViewRel, target),
          broken: false,
        });
      } else {
        out.push({ role, label: v, href: '', broken: true });
      }
    }
  }
  return out;
}

/**
 * Compute a relative URL from one view path to another, both relative to the
 * slug view root.
 */
export function relativeBetween(fromViewRel, toViewRel) {
  const fromParts = fromViewRel.split('/').slice(0, -1); // drop INDEX.html
  const toParts   = toViewRel.split('/');
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) common++;
  const up = '../'.repeat(fromParts.length - common);
  const down = toParts.slice(common).join('/');
  return up + down || './';
}

/**
 * Rewrite inline markdown body links that point at sibling source `.md` files
 * (e.g. a plan summary's prose linking `04-plan-behaviors.md`) to the rendered
 * view page (`plan/behaviors/INDEX.html`), made relative to the current page.
 *
 * `md2html` does NOT rewrite links, and `resolveRefs` only covers structured
 * `refs:` frontmatter — so without this, prose cross-references to siblings
 * resolve to source `.md` paths that don't exist in the view (404). Conservative:
 * only `<a>` hrefs ending in `.md` whose target is in the slug's pathMap are
 * rewritten; external/absolute/unknown links pass through untouched, so this
 * never INTRODUCES a broken link.
 *
 * @param {string} html — rendered body HTML
 * @param {{ pathMap: Map<string,string>, fromStorageRel: string, fromViewRel: string }} ctx
 */
export function rewriteBodyLinks(html, { pathMap, fromStorageRel, fromViewRel } = {}) {
  if (!html || !pathMap || !fromViewRel) return html;
  const fromDir = path.dirname(String(fromStorageRel || ''));
  return html.replace(/(<a\b[^>]*?\shref=")([^"]+)(")/gi, (full, pre, href, post) => {
    const hashAt = href.indexOf('#');
    const rawPath = hashAt >= 0 ? href.slice(0, hashAt) : href;
    const hash    = hashAt >= 0 ? href.slice(hashAt) : '';
    // Skip empties, pure anchors, absolute paths, and scheme URLs (http:, mailto:…).
    if (!rawPath || rawPath.startsWith('#') || rawPath.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(rawPath)) return full;
    if (!/\.md$/i.test(rawPath)) return full;
    const targetStorage = path.join(fromDir, rawPath).replace(/^\.\//, '');
    const targetView = pathMap.get(targetStorage) ?? pathMap.get(rawPath);
    if (!targetView) return full;   // unknown target → leave as authored (no new breakage)
    return `${pre}${relativeBetween(fromViewRel, targetView)}${hash}${post}`;
  });
}

/**
 * Render a resolved-refs block as a `<dl>` for the artifact header.
 */
export function renderRefs(resolved) {
  if (!resolved?.length) return '';
  const rows = resolved.map((r) => {
    const label = escape(r.label);
    return r.broken
      ? `<dt>${escape(r.role)}</dt><dd><span class="broken-link" title="missing artifact">${label}</span></dd>`
      : `<dt>${escape(r.role)}</dt><dd><a href="${escape(r.href)}">${label}</a></dd>`;
  }).join('');
  return `<dl class="refs-card">${rows}</dl>`;
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
