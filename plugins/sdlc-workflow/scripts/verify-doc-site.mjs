#!/usr/bin/env node
// Doc-site structural guard (hand-authored site regime, 2026-07 rebuild).
//
// The site has no generator: pages are plain HTML, and nav.html is the single
// hand-edited source of both the sidebar and the version brand. Four
// invariants, all single-sourced:
//   (a) BRAND: nav.html's one brand line stamps the version from
//       .claude-plugin/plugin.json. A release bumps exactly that line.
//   (b) NAV LINKS: every href in nav.html resolves to a file on disk.
//   (c) NO ORPHANS: every *.html page on disk (except index.html and nav.html
//       itself) is linked from nav.html — a page nobody can navigate to is a
//       mistake, not a hidden extra.
//   (d) SIDEBAR MOUNT: every page carries <aside id="sidebar">, includes
//       nav.js, and declares the data-root matching its directory depth, so
//       the fetched sidebar resolves everywhere.
//
// Exit non-zero on any violation so CI fails. No deps.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'docs', 'site');
const errors = [];

// --- source of truth: plugin version --------------------------------------
const version = JSON.parse(
  readFileSync(path.join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'),
).version;

// --- (a) brand in nav.html --------------------------------------------------
const navHtml = readFileSync(path.join(SITE, 'nav.html'), 'utf8');
const brand = navHtml.match(/plugin docs · v([0-9][^<\s]*)/);
if (!brand) {
  errors.push('nav.html: no version brand line ("plugin docs · vX.Y.Z") found');
} else if (brand[1] !== version) {
  errors.push(`nav.html: brand v${brand[1]} ≠ plugin.json v${version}`);
}

// --- (b) every nav href exists on disk -------------------------------------
const navLinks = [...navHtml.matchAll(/href="([^"#]+\.html)"/g)].map((m) => m[1]);
for (const href of navLinks) {
  if (!existsSync(path.join(SITE, href))) {
    errors.push(`nav.html: link "${href}" has no file on disk`);
  }
}

// --- (c) every page on disk is reachable from the nav ----------------------
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const pages = walk(SITE)
  .map((f) => path.relative(SITE, f).replace(/\\/g, '/'))
  .filter((rel) => rel !== 'nav.html');

const linked = new Set(navLinks);
for (const rel of pages) {
  if (rel === 'index.html') continue; // landing page: reachable via the brand link
  if (!linked.has(rel)) errors.push(`${rel}: not linked from nav.html (orphan page)`);
}

// --- (d) sidebar mount + nav.js + data-root depth ---------------------------
for (const rel of pages) {
  const html = readFileSync(path.join(SITE, rel), 'utf8');
  const depth = rel.split('/').length - 1;
  const expectRoot = '../'.repeat(depth);

  if (!/<aside id="sidebar">/.test(html)) {
    errors.push(`${rel}: missing <aside id="sidebar"> mount`);
  }
  if (!html.includes(`src="${expectRoot}nav.js"`)) {
    errors.push(`${rel}: missing or mis-pathed nav.js include (expected src="${expectRoot}nav.js")`);
  }
  const rootAttr = html.match(/<body data-root="([^"]*)"/);
  if (!rootAttr) {
    errors.push(`${rel}: <body> missing data-root attribute`);
  } else if (rootAttr[1] !== expectRoot) {
    errors.push(`${rel}: data-root="${rootAttr[1]}" but page depth expects "${expectRoot}"`);
  }
  if (!html.includes(`href="${expectRoot}style.css"`)) {
    errors.push(`${rel}: missing or mis-pathed style.css link`);
  }
}

// --- report ----------------------------------------------------------------
if (errors.length) {
  console.error(`✗ doc-site verification failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ doc-site OK — brand v${version}; ${navLinks.length} nav links resolve; ` +
    `${pages.length} pages, no orphans, sidebar mounts consistent.`,
);
