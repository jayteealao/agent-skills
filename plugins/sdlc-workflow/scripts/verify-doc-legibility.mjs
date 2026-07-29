#!/usr/bin/env node
// Doc-site legibility guard (hand-authored site regime, 2026-07 rebuild).
//
// Four invariants, all testable without external deps:
//
//   (1) LEDE: every page has <p class="lede"> (job before machinery).
//   (2) RELATED: every page (except index) has <div class="related"> (where next).
//   (3) BANNED: controlled-vocab insider terms don't appear raw in user-facing
//       prose. Code blocks and the glossary are exempt; a few pages that ARE
//       the sanctioned home of a term are exempted per-term.
//   (4) PLACEHOLDER: tutorial pages (start/) use a concrete running example —
//       no <slug>-style placeholder tokens in code blocks, no word "fictional".
//
// Run:  node scripts/verify-doc-legibility.mjs [--hard]
//   --hard  Exit non-zero on any warning (CI gate mode).

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

// Banned terms: [pattern, replacement hint, pages to EXEMPT by suffix match].
// The glossary is always exempt — it explicitly maps insider terms to plain ones.
const GLOSSARY = 'reference/glossary.html';
const BANNED_TERMS = [
  { pat: /skill router/gi, hint: 'use "command"', exempt: [GLOSSARY] },
  {
    pat: /\bsunflower\b/gi,
    hint: 'use "the dashboard" / "workflow view"',
    exempt: [GLOSSARY, 'concepts/the-machinery.html', 'reference/hooks.html'],
  },
  {
    pat: /readiness gate/gi,
    hint: 'use "readiness check"',
    exempt: [GLOSSARY, 'concepts/evidence-and-gates.html'],
  },
  {
    pat: /readiness verdict/gi,
    hint: 'use "readiness check"',
    exempt: [GLOSSARY, 'concepts/evidence-and-gates.html', 'guides/releasing.html'],
  },
  { pat: /compressed flow/gi, hint: 'use "quick lane"', exempt: [GLOSSARY] },
  {
    pat: /\baugmentation(?:s)?\b/gi,
    hint: 'use "add-on"',
    exempt: [
      GLOSSARY,
      'guides/the-standard-lifecycle.html',
      'reference/commands.html',
      'reference/artifacts.html',
      'reference/intake-modes.html',
    ],
  },
  {
    pat: /\brouter\b/gi,
    hint: 'use "command"',
    exempt: [GLOSSARY, 'reference/commands.html'],
  },
];

const FICTIONAL_RE = /\bfictional\b/i;
const PLACEHOLDER_QUADRANTS = ['start/'];

// --- (1) lede check -------------------------------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  const html = readFileSync(f, 'utf8');
  if (!html.includes('class="lede"')) {
    warnings.push(`[LEDE]        ${rel}: missing <p class="lede"> (job-first opening)`);
  }
}

// --- (2) related check ----------------------------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (rel === 'index.html') continue;
  const html = readFileSync(f, 'utf8');
  if (!html.includes('class="related"')) {
    warnings.push(`[RELATED]     ${rel}: missing <div class="related"> (where-next block)`);
  }
}

// --- (3) banned terms check -----------------------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  const html = readFileSync(f, 'utf8');
  const mainMatch = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!mainMatch) continue;
  // Strip code blocks, then all remaining tags — vocab check runs on prose only.
  const textOnly = mainMatch[1]
    .replace(/<(?:pre|code)[^>]*>[\s\S]*?<\/(?:pre|code)>/gi, '')
    .replace(/<[^>]+>/g, ' ');

  for (const { pat, hint, exempt } of BANNED_TERMS) {
    if (exempt.some((e) => rel.endsWith(e))) continue;
    pat.lastIndex = 0;
    const m = pat.exec(textOnly);
    if (m) {
      warnings.push(`[VOCAB]       ${rel}: banned term "${m[0]}" — ${hint}`);
    }
  }
}

// --- (4) placeholder check (tutorials only) --------------------------------
for (const f of htmlFiles) {
  const rel = path.relative(SITE, f).replace(/\\/g, '/');
  if (!PLACEHOLDER_QUADRANTS.some((q) => rel.startsWith(q))) continue;
  const html = readFileSync(f, 'utf8');
  const mainMatch = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!mainMatch) continue;
  const mainHtml = mainMatch[1];
  const textOnly = mainHtml.replace(/<[^>]+>/g, ' ');
  if (FICTIONAL_RE.test(textOnly)) {
    warnings.push(`[PLACEHOLDER] ${rel}: word "fictional" found in a tutorial`);
  }
  // Placeholder tokens like <slug> or <feature description> inside code blocks.
  const codeBlockContent = [...mainHtml.matchAll(/<(?:pre|code)[^>]*>([\s\S]*?)<\/(?:pre|code)>/gi)]
    .map((m) => m[1].replace(/<[^>]+>/g, ''));
  for (const block of codeBlockContent) {
    const phMatch = block.match(/&lt;([a-z][a-z0-9 _/-]{2,40})&gt;|<([a-z][a-z0-9 _/-]{2,40})>/i);
    const token = phMatch && (phMatch[1] ?? phMatch[2]);
    if (
      token &&
      !/^(div|p|h[1-6]|ul|ol|li|table|thead|tbody|tr|th|td|code|pre|a|strong|em|span|small|details|summary|dl|dt|dd|hr|blockquote|img|br|nav|main|header|footer|aside|section)$/i.test(
        token.trim(),
      )
    ) {
      warnings.push(`[PLACEHOLDER] ${rel}: placeholder <${token}> in a tutorial code block`);
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
  console.error(`\n  (Run with --hard to promote to a CI gate.)`);
  process.exit(0);
}
