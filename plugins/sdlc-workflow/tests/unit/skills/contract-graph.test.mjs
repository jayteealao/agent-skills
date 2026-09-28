// ARTIFACT-SPLIT-PLAN W1 — the contract-graph guard.
//
// A consumer stage cites a section (`## Heading`) or a frontmatter key of an
// artifact that another stage writes. When the producer's template does not
// declare that section or key, the consumer reads nothing, and the read check
// (S6) cannot count a read of a section that does not exist. This test reads
// every reference under skills/wf/reference, collects the citations, and checks
// each one against the producer's template.
//
// Citation sources, most reliable first:
//   1. The Sections cell of each `## Requires` row (kind `artifact`).
//   2. Explicit section citations in prose:
//        `02-shape.md` `## Out of Scope`   `02-shape.md`'s `## X`
//        `02-shape.md` → `## X`            `02-shape.md → ## X`
//        `## X` (section|table)? in|of|from `02-shape.md`
//        `01-intake.md` carries `## X`     `09-ship-run-*.md` (...) and read its `## X`
//   3. Explicit key citations in prose:
//        `00-index.md` `branch:`           `00-index.md`'s `intent-risks`
//        `00-index.md` → `key`             `key` (key|field)? in|from `00-index.md`
//
// A section is declared when a producer template holds a `## X` heading line
// (an optional ` (qualifier)` or ` — note` may follow) or a backticked
// `## X` token (the list form "- `## X` — what goes here"). A key is declared
// when a producer template holds a YAML line `key:` (optionally a `- key:` list
// entry) or a backticked `key` / `key:` token that opens a list item or a table
// cell. An artifact written by several producers (02-shape.md comes from shape
// and from each change mode) passes when at least one of its producers declares
// the cited name: the mode-specific sections (hotfix `## Root Cause`, refactor
// `## Baseline Command`) live in one producer only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequires } from '../../../scripts/build-requires.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF_DIR = path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference');

// ---- producer map -----------------------------------------------------------
// Artifact file (relative to .ai/workflows/<slug>/, or /.ai/ for project files)
// → the template file(s) that define it, relative to skills/wf/reference/.
// `match` runs on the cited name after each `<placeholder>` becomes `*`, so a
// cited `05-implement-<slice-slug>.md` is tested as `05-implement-*.md`.
export const PRODUCERS = [
  // The index template, the other intake modes' index templates, and the optional
  // handoff config keys (`public-surface`, `review-bots`, `pre-push-checks`, ...).
  { match: /^00-index\.md$/, templates: ['intake/default/_artifact.md', '_handoff-config.md', 'intake/rca.md', 'intake/adopt.md', 'intake/brainstorm.md', 'intake/ideate.md', 'intake/investigate.md', 'intake/discover.md', 'intake/_change-mode-tail.md', 'simplify/_artifact.md'] },
  { match: /^po-answers\.md$/, templates: ['intake/default/_artifact.md'] },
  // Intake mode leads (01-<mode>.md).
  { match: /^01-intake\.md$/, templates: ['intake/default/_artifact.md'] },
  { match: /^01-rca\.md$/, templates: ['intake/rca/_artifact.md', 'intake/rca.md'] },
  { match: /^01-fix\.md$/, templates: ['intake/fix.md', 'intake/_change-mode-tail.md'] },
  { match: /^01-hotfix\.md$/, templates: ['intake/hotfix.md', 'intake/_change-mode-tail.md'] },
  { match: /^01-refactor\.md$/, templates: ['intake/refactor.md', 'intake/_change-mode-tail.md'] },
  { match: /^01-update-deps\.md$/, templates: ['intake/update-deps.md', 'intake/_change-mode-tail.md'] },
  { match: /^01-adopt\.md$/, templates: ['intake/adopt/_artifacts.md'] },
  { match: /^01-audit\.md$/, templates: ['intake/audit.md'] },
  { match: /^01-brainstorm\.md$/, templates: ['intake/brainstorm/_artifact.md'] },
  { match: /^01-discover\.md$/, templates: ['intake/discover.md', 'intake/discover/_research.md'] },
  { match: /^01-ideate\.md$/, templates: ['intake/ideate/_artifact.md'] },
  { match: /^01-investigate\.md$/, templates: ['intake/investigate.md', 'intake/investigate/_artifact.md'] },
  { match: /^01-task\.md$/, templates: ['task.md'] },
  { match: /^01-simplify\.md$/, templates: ['simplify/_artifact.md'] },
  // A `01-*` / `01-<mode>` citation means "the lead of whichever intake mode ran": every lead template.
  { match: /^01-\*\.md$/, templates: ['intake/default/_artifact.md', 'intake/rca/_artifact.md', 'intake/rca.md', 'intake/fix.md', 'intake/hotfix.md', 'intake/refactor.md', 'intake/update-deps.md', 'intake/_change-mode-tail.md', 'intake/adopt/_artifacts.md', 'task.md'] },
  // Shape: the standard template, then each producer that synthesizes a shape.
  { match: /^02-shape\.md$/, templates: ['shape.md', 'intake/rca/_artifact.md', 'intake/fix.md', 'intake/hotfix.md', 'intake/refactor.md', 'intake/update-deps.md', 'intake/_change-mode-tail.md', 'intake/adopt/_artifacts.md'] },
  { match: /^02b-design\.md$/, templates: ['design/shape.md'] },
  { match: /^02c-craft\.md$/, templates: ['design/contract.md'] },
  // Slices: the master index and the per-slice files (standard, extension, probe, simplify).
  { match: /^03-slice\.md$/, templates: ['slice.md', 'intake/fix.md', 'intake/hotfix.md', 'intake/refactor.md', 'intake/update-deps.md', 'intake/adopt/_artifacts.md', 'intake/extend/_artifacts.md'] },
  { match: /^03-slice-probe-.*\.md$/, templates: ['probe/_artifact.md'] },
  { match: /^03-slice-simplify-.*\.md$/, templates: ['simplify/_artifact.md'] },
  { match: /^03-slice-.+\.md$/, templates: ['slice.md', 'intake/extend/_artifacts.md', 'probe/_artifact.md'] },
  // Plans, implement and verify records (master and per slice; update-deps self-authors 05/06).
  { match: /^04-plan(-.+)?\.md$/, templates: ['plan.md', 'intake/fix.md', 'intake/hotfix.md', 'intake/refactor.md', 'intake/update-deps.md', 'intake/adopt/_artifacts.md'] },
  { match: /^04b-instrument\.md$/, templates: ['augment/instrument/_artifact.md'] },
  { match: /^04c-experiment\.md$/, templates: ['augment/experiment/_artifact.md'] },
  { match: /^05-implement(-.+)?\.md$/, templates: ['implement/_artifact.md', 'intake/update-deps/_exec-artifacts.md', 'intake/adopt/_artifacts.md', 'task.md'] },
  { match: /^05c-benchmark\.md$/, templates: ['augment/benchmark/_artifact.md'] },
  { match: /^06-verify(-.+)?\.md$/, templates: ['verify/_artifact.md', 'intake/update-deps/_exec-artifacts.md', 'task.md'] },
  // Reviews: the sweep ledger (slug-wide or per slice) and the design reviews.
  { match: /^07-design-audit\.md$/, templates: ['design/audit.md'] },
  { match: /^07-design-critique\.md$/, templates: ['design/critique.md'] },
  { match: /^07-review(-.+)?\.md$/, templates: ['review/_artifact.md', 'intake/audit.md'] },
  // Handoff, docs, ship, retro, recap, close.
  { match: /^08-handoff\.md$/, templates: ['handoff.md'] },
  { match: /^08b-docs-index\.md$/, templates: ['docs/_artifacts.md'] },
  { match: /^09-ship-run(-.+)?\.md$/, templates: ['ship/_run-artifact.md'] },
  { match: /^09-ship-runs\.md$/, templates: ['ship/_run-artifact.md'] },
  { match: /^10-retro\.md$/, templates: ['retro/_artifact.md'] },
  { match: /^90-recap\.md$/, templates: ['recap.md'] },
  { match: /^99-close\.md$/, templates: ['close.md'] },
  { match: /^skip-slice-.+\.md$/, templates: ['close.md'] },
  // Project-level files.
  { match: /^\/\.ai\/ship-plan\.md$/, templates: ['ship-plan/init/_artifact.md'] },
  { match: /^\/\.ai\/observability\.md$/, templates: ['observability/init/_artifact.md', 'observability/build/_artifact.md'] },
  { match: /^\/\.ai\/profiles\/\*\/01-profile\.md$/, templates: ['augment/profile/_artifact.md'] },
];

// Citations of legacy artifacts (old slugs). Each has no current producer.
export const LEGACY = new Map([
  ['01-quick.md', 'the pre-v9.83 quick-mode lead; still read on old slugs, no longer written'],
  ['09-ship.md', 'the pre-ship-run single ship record; retro still reads it on old slugs'],
  ['03-slice-index.md', 'the pre-rename slice master; old slugs only'],
]);

// ---- extraction -------------------------------------------------------------
const FILE = String.raw`(?:\d{2}[a-z]?-[A-Za-z0-9<>*_-]+|po-answers|00-index)\.md`;
const HEADING = String.raw`##[ \t]+([^\`\n]+?)`;
const KEY = String.raw`([a-z][a-z0-9-]*):?`;
const SECTION_PATTERNS = [
  // `FILE` `## H`, `FILE`'s `## H`, `FILE` → `## H`
  new RegExp(String.raw`\`(${FILE})\`(?:'s)?[ \t]*(?:→[ \t]*)?\`${HEADING}\``, 'g'),
  // `FILE → ## H`
  new RegExp(String.raw`\`(${FILE})[ \t]*→[ \t]*${HEADING}\``, 'g'),
  // `FILE` carries|has|holds|contains (a|an|the)? `## H`
  new RegExp(String.raw`\`(${FILE})\`[ \t]+(?:carries|has|holds|contains)[ \t]+(?:(?:a|an|the)[ \t]+)?\`${HEADING}\``, 'g'),
  // `FILE` ... read its `## H` (the same sentence)
  new RegExp(String.raw`\`(${FILE})\`[^.\`]*(?:\`[^\`]*\`[^.\`]*)*?read its[ \t]+\`${HEADING}\``, 'g'),
];
const SECTION_REVERSE = new RegExp(String.raw`\`${HEADING}\`[ \t]+(?:(?:section|table|block)[ \t]+)?(?:in|of|from)[ \t]+(?:the[ \t]+)?\`(${FILE})\``, 'g');
const KEY_PATTERNS = [
  // `FILE` `key`, `FILE`'s `key`, `FILE` → `key`, `FILE` frontmatter `key`
  new RegExp(String.raw`\`(${FILE})\`(?:'s)?[ \t]*(?:frontmatter[ \t]+)?(?:→[ \t]*)?\`${KEY}\``, 'g'),
];
const KEY_REVERSE = new RegExp(String.raw`\`${KEY}\`[ \t]+(?:(?:key|field)[ \t]+)?(?:in|from)[ \t]+(?:the[ \t]+)?\`(${FILE})\``, 'g');

/** Cited file name → the name the producer map matches (placeholders become `*`). */
export function normalizeArtifact(name) {
  return name.replace(/<[^>]+>/g, '*').replace(/\*+/g, '*');
}

function markdownFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) found.push(...markdownFiles(abs, base));
    else if (name.endsWith('.md')) found.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return found;
}

/** Every citation in the reference tree: `{ source, line, artifact, kind: 'section'|'key', name, via }`. */
export function collectCitations(refDir) {
  const citations = [];
  for (const rel of markdownFiles(refDir)) {
    const text = readFileSync(path.join(refDir, rel), 'utf8');
    const { rows } = parseRequires(text);
    for (const row of rows ?? []) {
      if (row.kind !== 'artifact' || !row.file || row.sections.length === 0) continue;
      for (const name of row.sections) citations.push({ source: rel, line: 0, artifact: row.input, kind: 'section', name, via: 'requires' });
    }
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const at = index + 1;
      for (const re of SECTION_PATTERNS) {
        for (const m of line.matchAll(re)) citations.push({ source: rel, line: at, artifact: m[1], kind: 'section', name: m[2].trim(), via: 'prose' });
      }
      for (const m of line.matchAll(SECTION_REVERSE)) citations.push({ source: rel, line: at, artifact: m[2], kind: 'section', name: m[1].trim(), via: 'prose' });
      for (const re of KEY_PATTERNS) {
        for (const m of line.matchAll(re)) citations.push({ source: rel, line: at, artifact: m[1], kind: 'key', name: m[2], via: 'prose' });
      }
      for (const m of line.matchAll(KEY_REVERSE)) citations.push({ source: rel, line: at, artifact: m[2], kind: 'key', name: m[1], via: 'prose' });
    });
  }
  return citations;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the template text declares `## name`. */
export function declaresSection(text, name) {
  const h = escapeRe(name);
  const headingLine = new RegExp(String.raw`^##[ \t]+${h}(?:[ \t]+(?:\(.*\)|—.*))?[ \t]*$`, 'm');
  const token = new RegExp(String.raw`\`##[ \t]+${h}(?:[ \t]*\([^\`]*)?\``);
  return headingLine.test(text) || token.test(text);
}

/** True when the template text declares the frontmatter key. */
export function declaresKey(text, name) {
  const k = escapeRe(name);
  const yamlLine = new RegExp(String.raw`^[ \t]*(?:-[ \t]+)?${k}:`, 'm');
  const listOrCell = new RegExp(String.raw`^[ \t]*(?:[-*][ \t]+|\d+\.[ \t]+|\|[ \t]*)(?:\*\*)?\`${k}:?\``, 'm');
  return yamlLine.test(text) || listOrCell.test(text);
}

/** Runs the whole check on a reference tree: `{ citations, failures }`. */
export function checkContracts(refDir) {
  const citations = collectCitations(refDir);
  const failures = [];
  const cache = new Map();
  const read = (rel) => {
    if (!cache.has(rel)) {
      const abs = path.join(refDir, rel);
      cache.set(rel, existsSync(abs) ? readFileSync(abs, 'utf8') : null);
    }
    return cache.get(rel);
  };
  for (const c of citations) {
    const where = `${c.source}${c.line ? `:${c.line}` : ' (## Requires)'}`;
    const normalized = normalizeArtifact(c.artifact);
    if (LEGACY.has(c.artifact)) continue;
    const producer = PRODUCERS.find((p) => p.match.test(normalized));
    if (!producer) {
      failures.push(`${where}: cites ${c.kind} "${c.name}" of \`${c.artifact}\`, which has no producer in PRODUCERS`);
      continue;
    }
    const declares = c.kind === 'section' ? declaresSection : declaresKey;
    const found = producer.templates.some((rel) => {
      const text = read(rel);
      return text !== null && declares(text, c.name);
    });
    if (!found) {
      const label = c.kind === 'section' ? `## ${c.name}` : `key \`${c.name}\``;
      failures.push(`${where}: \`${c.artifact}\` ${label} — no producer template declares it (${producer.templates.join(', ')})`);
    }
  }
  return { citations, failures };
}

// ---- tests ------------------------------------------------------------------
test('every producer template in the map exists', () => {
  for (const p of PRODUCERS) {
    for (const rel of p.templates) assert.ok(existsSync(path.join(REF_DIR, rel)), `${p.match}: missing template ${rel}`);
  }
});

test('every `writes` row of every Requires table has a producer (every key and intake mode is covered)', () => {
  const missing = [];
  for (const rel of markdownFiles(REF_DIR)) {
    const { rows } = parseRequires(readFileSync(path.join(REF_DIR, rel), 'utf8'));
    for (const row of rows ?? []) {
      if (row.kind !== 'writes') continue;
      const normalized = normalizeArtifact(row.input);
      if (!PRODUCERS.some((p) => p.match.test(normalized))) missing.push(`${rel}: ${row.input}`);
    }
  }
  assert.deepEqual(missing, [], `writes rows with no producer template:\n${missing.join('\n')}`);
});

test('every cited section and key is declared by the producer template', () => {
  const { citations, failures } = checkContracts(REF_DIR);
  assert.ok(citations.length >= 100, `expected at least 100 citations, found ${citations.length}`);
  assert.ok(citations.some((c) => c.via === 'requires'), 'no Requires Sections citation was collected');
  assert.deepEqual(failures, [], `contract-graph mismatches:\n${failures.join('\n')}`);
});

test('self-test: removing a cited section or key from a template fails the check', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'contract-graph-'));
  try {
    cpSync(REF_DIR, dir, { recursive: true });
    // Section: implement/_artifact.md declares `## Summary of Changes`, which handoff's Requires row cites.
    const implement = path.join(dir, 'implement', '_artifact.md');
    const before = readFileSync(implement, 'utf8');
    const after = before.split(/\r?\n/).filter((line) => !line.includes('## Summary of Changes')).join('\n');
    assert.notEqual(after, before, 'the fixture edit removed nothing');
    writeFileSync(implement, after);
    // Key: the 01-intake.md template declares `recommended-routes`, which intake/default.md cites.
    const intake = path.join(dir, 'intake', 'default', '_artifact.md');
    const intakeBefore = readFileSync(intake, 'utf8');
    const intakeAfter = intakeBefore.split(/\r?\n/).filter((line) => !/^\s*recommended-routes:/.test(line)).join('\n');
    assert.notEqual(intakeAfter, intakeBefore, 'the fixture edit removed no key');
    writeFileSync(intake, intakeAfter);

    const { failures } = checkContracts(dir);
    assert.ok(failures.some((f) => f.includes('## Summary of Changes')), `no failure for the removed section:\n${failures.join('\n')}`);
    assert.ok(failures.some((f) => f.includes('`recommended-routes`')), `no failure for the removed key:\n${failures.join('\n')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
