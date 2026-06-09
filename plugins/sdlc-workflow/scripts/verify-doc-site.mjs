#!/usr/bin/env node
// Doc-site de-rot guard (Phase 1 / L5 of DOC-SITE-DEVIATIONS.md).
//
// Two invariants, both single-sourced — no hard-coded version or page list:
//   (a) VERSION: every docs/site/**/*.html sidebar brand stamps the version in
//       .claude-plugin/plugin.json. Catches the "frozen footer" drift.
//   (b) PAGERS: every page's Previous/Next links follow nav.html's reading
//       order. Catches the "skipped page" drift (e.g. hooks → glossary skipping
//       serve/types). nav.html is generated from SIDEBAR by _build_pages.py, so
//       it is the canonical order.
//
// Exit non-zero on any violation so CI fails. No deps.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'docs', 'site');
const errors = [];

// --- source of truth: plugin version --------------------------------------
const version = JSON.parse(
  readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
).version;

// --- collect every html page ----------------------------------------------
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const htmlFiles = walk(SITE);

// --- (a) version brand check -----------------------------------------------
const BRAND_RE = /plugin docs · v([0-9][^<\s]*)/;
for (const f of htmlFiles) {
  const html = readFileSync(f, 'utf8');
  const m = html.match(BRAND_RE);
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (!m) {
    errors.push(`${rel}: no version brand found`);
  } else if (m[1] !== version) {
    errors.push(`${rel}: brand version v${m[1]} ≠ plugin.json v${version}`);
  }
}

// --- (b) pager adjacency vs nav order --------------------------------------
const navHtml = readFileSync(path.join(SITE, 'nav.html'), 'utf8');
const navOrder = [...navHtml.matchAll(/data-href="([^"]+\.html)"/g)].map((m) => m[1]);
const posOf = new Map(navOrder.map((p, i) => [p, i]));

const resolveHref = (pageRel, href) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(pageRel), href));

for (let i = 0; i < navOrder.length; i++) {
  const pageRel = navOrder[i];
  const file = path.join(SITE, pageRel);
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    errors.push(`${pageRel}: nav-linked page is missing on disk`);
    continue;
  }
  const pager = html.match(/<div class="pager">([\s\S]*?)<\/div>/);
  const expectPrev = i > 0 ? navOrder[i - 1] : null;
  const expectNext = i < navOrder.length - 1 ? navOrder[i + 1] : null;

  if (!pager) {
    if (expectPrev || expectNext) errors.push(`${pageRel}: missing pager`);
    continue;
  }
  const block = pager[1];
  const prevHref = block.match(/class="prev"[^>]*href="([^"]+)"/)?.[1];
  const nextHref = block.match(/class="next"[^>]*href="([^"]+)"/)?.[1];

  // index.html is the landing page: no "Previous" expected.
  const prevRequired = expectPrev && pageRel !== 'index.html';

  if (prevRequired && !prevHref) errors.push(`${pageRel}: pager missing Previous (expected ${expectPrev})`);
  if (prevHref) {
    const got = resolveHref(pageRel, prevHref);
    if (got !== expectPrev) errors.push(`${pageRel}: Previous → ${got}, expected ${expectPrev}`);
  }
  if (expectNext && !nextHref) errors.push(`${pageRel}: pager missing Next (expected ${expectNext})`);
  if (nextHref) {
    const got = resolveHref(pageRel, nextHref);
    if (got !== expectNext) errors.push(`${pageRel}: Next → ${got}, expected ${expectNext}`);
  }
}

// --- report ----------------------------------------------------------------
if (errors.length) {
  console.error(`✗ doc-site verification failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ doc-site OK — ${htmlFiles.length} pages stamped v${version}; ` +
    `${navOrder.length} pagers consistent with nav.html order.`,
);
