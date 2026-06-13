#!/usr/bin/env node
// Doc-site legibility guard (Phase 7 of docs/internal/archived/DOC-SITE-REWRITE-PLAN.md).
//
// Warning-only during Phases 1-6; promotes to a hard CI gate in Phase 7.
// Four invariants, all testable without external deps:
//
//   (1) LEDE: every page has <p class="lede"> (P1 — job before machine).
//   (2) RELATED: every page (except index) has <div class="related"> (P9 — where next).
//   (3) BANNED: controlled-vocab banned terms don't appear raw in user-facing text.
//       Terms that must NOT appear: "skill router", "sunflower view", "sunflower",
//       "readiness gate", "readiness verdict", "compressed flow", "augmentation"
//       (outside the augmentations page), "router" as a standalone term.
//   (4) PLACEHOLDER: <...> and the word "fictional" don't appear in tutorial/how-to pages (P5).
//
// Run:  node scripts/verify-doc-legibility.mjs [--hard]
//   --hard  Exit non-zero on any warning (enables Phase 7 gate mode).

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HARD_MODE = process.argv.includes('--hard');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'docs', 'site');
const warnings = [];

// --- collect every html page ----------------------------------------------
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.html') && e.name !== 'nav.html') out.push(full);
  }
  return out;
}
const htmlFiles = walk(SITE);

// Banned terms: [pattern, replacement hint, pages to EXEMPT by substring match]
// The glossary is always exempt because it explicitly maps old terms to new ones.
const GLOSSARY = 'reference/glossary.html';
const BANNED_TERMS = [
  { pat: /skill router/gi, hint: 'use "command"', exempt: [GLOSSARY] },
  {
    pat: /\bsunflower\b/gi,
    hint: 'use "dashboard"',
    exempt: ['reference/serve.html', GLOSSARY, 'whats-new.html', 'reference/hooks.html'],
  },
  {
    pat: /readiness gate/gi,
    hint: 'use "readiness check"',
    // the-readiness-gate.html is the explanation page about this concept; it legitimately names it
    exempt: [GLOSSARY, 'explanation/the-readiness-gate.html'],
  },
  { pat: /readiness verdict/gi, hint: 'use "readiness check"', exempt: [GLOSSARY] },
  { pat: /compressed flow/gi, hint: 'use "quick command"', exempt: [GLOSSARY] },
  // "augmentation" is ok on the augmentations page itself and add-ons how-to
  {
    pat: /\baugmentation(?:s)?\b/gi,
    hint: 'use "add-on"',
    exempt: [GLOSSARY, 'explanation/augmentations-model.html', 'how-to/use-augmentations.html', 'reference/artifacts.html', 'reference/wf-design.html'],
  },
  // "router" alone (not "skill router") is an insider term; code blocks are stripped before this check runs
  { pat: /\brouter\b/gi, hint: 'use "command"', exempt: [GLOSSARY, 'explanation/adaptive-routing.html', 'reference/commands.html'] },
];

// Pages that should never have placeholder-style text
const PLACEHOLDER_RE = /<[a-z][^>]{0,40}>/i; // matches <feature description> etc.
const FICTIONAL_RE = /\bfictional\b/i;
const PLACEHOLDER_QUADRANTS = ['tutorials/', 'how-to/'];

// --- (1) lede check -------------------------------------------------------
const SKIP_LEDE = ['index.html', 'nav.html'];
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (SKIP_LEDE.some((s) => rel.endsWith(s))) continue;
  const html = readFileSync(f, 'utf8');
  if (!html.includes('class="lede"')) {
    warnings.push(`[P1/LEDE]    ${rel}: missing <p class="lede"> (job-first opening)`);
  }
}

// --- (2) related check ----------------------------------------------------
const SKIP_RELATED = ['index.html', 'whats-new.html'];
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (SKIP_RELATED.some((s) => rel.endsWith(s))) continue;
  const html = readFileSync(f, 'utf8');
  if (!html.includes('class="related"')) {
    warnings.push(`[P9/RELATED]  ${rel}: missing <div class="related"> (where-next block)`);
  }
}

// --- (3) banned terms check -----------------------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  // Strip HTML tags for text-level checks (keep code blocks — they're exempt for some terms)
  const html = readFileSync(f, 'utf8');
  // Extract only the <main> body (skip sidebar, scripts)
  const mainMatch = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!mainMatch) continue;
  const mainHtml = mainMatch[1];
  // Strip pager, code blocks, then all remaining tags+attributes — vocab check runs on plain text only
  const textOnly = mainHtml
    .replace(/<div class="pager">[\s\S]*?<\/div>/gi, '')
    .replace(/<(?:pre|code)[^>]*>[\s\S]*?<\/(?:pre|code)>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  for (const { pat, hint, exempt } of BANNED_TERMS) {
    if (exempt.some((e) => rel.endsWith(e))) continue;
    pat.lastIndex = 0;
    const m = pat.exec(textOnly);
    if (m) {
      warnings.push(`[P3/VOCAB]   ${rel}: banned term "${m[0]}" — ${hint}`);
    }
  }
}

// --- (4) placeholder check ------------------------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (!PLACEHOLDER_QUADRANTS.some((q) => rel.startsWith(q))) continue;
  const html = readFileSync(f, 'utf8');
  const mainMatch = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!mainMatch) continue;
  const mainHtml = mainMatch[1];
  // Only check text nodes (strip all tags)
  const textOnly = mainHtml.replace(/<[^>]+>/g, ' ');
  if (FICTIONAL_RE.test(textOnly)) {
    warnings.push(`[P5/PLACEHOLDER] ${rel}: word "fictional" found in tutorial/how-to`);
  }
  // Check for angle-bracket placeholder tokens in visible text.
  // Placeholders look like <slug>, <feature description>, <path/to/file>.
  // We match only INSIDE code blocks (pre/code), where placeholders appear as literal text.
  // Normal HTML tags (which have attributes, namespaces, or are outside code) are excluded.
  const codeBlockContent = [...mainHtml.matchAll(/<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ''));  // strip any inner tags, e.g. nested <code>
  for (const block of codeBlockContent) {
    const phMatch = block.match(/<([a-z][a-z0-9 _/-]{2,40})>/i);
    if (phMatch && !/^(div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|code|pre|a|strong|em|span|small|details|summary|dl|dt|dd|hr|blockquote|img|br|nav|main|header|footer|aside|section)$/i.test(phMatch[1].trim())) {
      warnings.push(`[P5/PLACEHOLDER] ${rel}: placeholder <${phMatch[1]}> in code block`);
      break;
    }
  }
}

// --- report ---------------------------------------------------------------
if (warnings.length === 0) {
  console.log(
    `✓ doc-site legibility OK — ${htmlFiles.length} pages checked; no vocabulary violations, all lede/related blocks present.`,
  );
  process.exit(0);
}

const mode = HARD_MODE ? '✗ HARD' : '⚠ WARN';
console.error(`${mode} doc-site legibility (${warnings.length} issue(s)):`);
for (const w of warnings) console.error(`  ${w}`);

if (HARD_MODE) {
  process.exit(1);
} else {
  console.error(`\n  (Run with --hard to promote to a CI gate once tuned.)`);
  process.exit(0);
}
