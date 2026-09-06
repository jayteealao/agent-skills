#!/usr/bin/env node
// scripts/extract-capabilities.mjs — the capability inventory extractor
// (WIDE-VIEW-REPAIR-PLAN §3.1, wave W0).
//
// A capability is what the prose makes the model do: an artifact written, a
// frontmatter field, a gate, a STOP condition, a sub-agent dispatch, an
// invocation, a config key, a citation, a rubric check. Wording is not a
// capability. This script walks every skills/**/*.md and records those nine
// categories deterministically, so a prose cut can be checked by machine
// (verify-capabilities.mjs) before a human reads it.
//
// Two kinds of category:
//   per-file   — artifacts, gates, stops, dispatches, rubric-checks
//                (the entry must survive in the same file, or be moved/retired)
//   tree-wide  — fields, invocations, config, citations
//                (the entry must survive somewhere in the tree, or be retired)
//
// Usage:
//   node scripts/extract-capabilities.mjs            # JSON to stdout
//   node scripts/extract-capabilities.mjs --write    # write the committed baseline
//   node scripts/extract-capabilities.mjs --summary  # counts per category
//
// The committed baseline lives at docs/internal/capability-inventory/baseline.json.
// Never edit it by hand: regenerate it with --write in the release that
// intentionally changes the inventory, and explain every removal in retired.json
// or moved.json in the same commit.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const INVENTORY_DIR = join(PLUGIN_ROOT, 'docs', 'internal', 'capability-inventory');
export const BASELINE_PATH = join(INVENTORY_DIR, 'baseline.json');

export const PER_FILE_CATEGORIES = ['artifacts', 'gates', 'stops', 'dispatches', 'rubric-checks'];
export const TREE_WIDE_CATEGORIES = ['fields', 'invocations', 'config', 'citations'];
export const CATEGORIES = [...PER_FILE_CATEGORIES, ...TREE_WIDE_CATEGORIES];

const SCAN_DIR = 'skills';
const RUBRIC_DIR = 'skills/wf/reference/review';
// Rubric bodies name their check lists under these headings (the plan's draft said
// "What to look for" / "Checks"; the tree uses these two — recorded in the plan §16).
const RUBRIC_CHECK_HEADINGS = /^#{1,4}\s+(PRIMARY QUESTIONS|NON-NEGOTIABLES|What to look for|Severity calibration)\b/;

const RE_ARTIFACT = /\b\d{2}[a-z]?-[a-z-]+(?:<[^>]+>)?\.(?:md|yaml|html\.fragment)\b/g;
const RE_FIELD = /`([a-z][a-z0-9-]*):`/g;
const RE_STOP = /\bSTOP\b/;
const RE_DISPATCH_HEADING = /sub-agent \d|research sub-agent|reviewer/i;
const RE_DISPATCH_SENTENCE = /\b(dispatch|launch)\w*\b[\s\S]*\bsub-agents?\b|\bsub-agents?\b[\s\S]*\b(dispatch|launch)\w*\b/i;
const RE_INVOCATION_TICKED = /`(\/wf [a-z-]+(?: [^`]+)?)`/g;
const RE_INVOCATION_BARE = /(?<![`\w])\/wf ([a-z-]+)(?![\w-])/g;
const RE_INVOCATION_OTHER = /(?<![`\w/])\/(consult|study-sources|imagery|uiproto|diataxis)\b/g;
const RE_CONFIG_KEY = /\b(hooks|view|semantic|solutions|memory)\.[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*/g;
const RE_ENV = /\bSDLC_[A-Z][A-Z0-9_]*/g;
const RE_CITATION = /\]\(([^)\s#]+\.md)(?:#[^)]*)?\)/g;
const RE_LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/** Every *.md under dir, recursively, as plugin-root-relative posix paths, sorted. */
export function listProseFiles(root = PLUGIN_ROOT, dir = SCAN_DIR) {
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs).sort()) {
      const p = join(abs, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) out.push(toPosix(relative(root, p)));
    }
  };
  const start = join(root, dir);
  if (existsSync(start)) walk(start);
  return out.sort();
}

function toPosix(p) {
  return p.split(sep).join('/');
}

/**
 * Strip markdown link syntax (keep the link text), emphasis, code ticks, arrows,
 * and collapse whitespace. Underscores stay: `_gate-question.md` is a name.
 */
export function normalizeText(s) {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*>#|]/g, ' ')
    .replace(/→|—|–/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function firstWords(s, n) {
  return normalizeText(s).split(' ').filter(Boolean).slice(0, n).join(' ');
}

/** Placeholders (`<slug>`, `<slice-slug>`, `<key>`) normalize to `<X>`. */
export function normalizePlaceholders(s) {
  return s.replace(/<[^>]+>/g, '<X>');
}

export function paragraphs(text) {
  return text.split(/\r?\n\s*\r?\n/);
}

/** Sentences of a paragraph: split on line breaks, then on sentence enders. */
export function sentences(paragraph) {
  const out = [];
  for (const line of paragraph.split(/\r?\n/)) {
    for (const s of line.split(/(?<=[.!?])\s+(?=[A-Z`*(\[])/)) {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function uniqSorted(arr) {
  return [...new Set(arr)].sort();
}

/** Extract every category for one file. `rel` is plugin-root-relative posix. */
export function extractFile(rel, text, root = PLUGIN_ROOT) {
  const perFile = {
    artifacts: [],
    gates: [],
    stops: [],
    dispatches: [],
    'rubric-checks': [],
  };
  const treeWide = { fields: [], invocations: [], config: [], citations: [] };

  for (const m of text.matchAll(RE_ARTIFACT)) perFile.artifacts.push(normalizePlaceholders(m[0]));
  for (const m of text.matchAll(RE_FIELD)) treeWide.fields.push(m[1] + ':');

  // `/wf <key>[ <token>]` — one extra token at most (the mode or the placeholder);
  // example arguments after it are wording, not capability.
  for (const m of text.matchAll(RE_INVOCATION_TICKED)) {
    const tokens = normalizePlaceholders(m[1]).replace(/\s+/g, ' ').trim().split(' ');
    const kept = tokens.slice(0, 3).filter((t, i) => i < 2 || /^[a-z][a-z-]*$|^<X>$/.test(t));
    treeWide.invocations.push(kept.join(' '));
  }
  for (const m of text.matchAll(RE_INVOCATION_BARE)) treeWide.invocations.push(`/wf ${m[1]}`);
  for (const m of text.matchAll(RE_INVOCATION_OTHER)) treeWide.invocations.push(`/${m[1]}`);

  for (const m of text.matchAll(RE_CONFIG_KEY)) {
    if (/\.(json|mjs|md|yaml|html)$/.test(m[0])) continue;
    treeWide.config.push(m[0]);
  }
  for (const m of text.matchAll(RE_ENV)) treeWide.config.push(m[0]);

  for (const m of text.matchAll(RE_CITATION)) {
    const raw = m[1];
    if (/^https?:/.test(raw)) continue;
    const abs = resolve(root, dirname(rel), raw);
    const relTarget = toPosix(relative(root, abs));
    treeWide.citations.push(existsSync(abs) ? relTarget : `unresolved:${relTarget}`);
  }

  for (const para of paragraphs(text)) {
    if (para.includes('_gate-question.md')) perFile.gates.push(firstWords(para, 8));
    for (const s of sentences(para)) {
      if (RE_STOP.test(s)) perFile.stops.push(firstWords(s, 8));
      if (RE_DISPATCH_SENTENCE.test(s)) perFile.dispatches.push(firstWords(s, 8));
    }
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line) && RE_DISPATCH_HEADING.test(line)) {
      perFile.dispatches.push(`heading: ${normalizeText(line)}`);
    }
  }

  if (rel.startsWith(RUBRIC_DIR + '/') && !posix.basename(rel).startsWith('_')) {
    // A check heading opens the block; deeper headings (the `### <alias>`
    // sections of a merged rubric) stay inside it; a heading at the same or a
    // shallower level closes it unless it is itself a check heading.
    let inChecks = false;
    let checksLevel = 0;
    for (const line of text.split(/\r?\n/)) {
      const h = line.match(/^(#{1,6})\s/);
      if (h) {
        if (RUBRIC_CHECK_HEADINGS.test(line)) { inChecks = true; checksLevel = h[1].length; }
        else if (!(inChecks && h[1].length > checksLevel)) inChecks = false;
        continue;
      }
      if (!inChecks) continue;
      const m = line.match(RE_LIST_ITEM);
      if (m) perFile['rubric-checks'].push(firstWords(m[1], 6));
    }
  }

  for (const k of Object.keys(perFile)) perFile[k] = uniqSorted(perFile[k].filter(Boolean));
  for (const k of Object.keys(treeWide)) treeWide[k] = uniqSorted(treeWide[k].filter(Boolean));
  return { perFile, treeWide };
}

/**
 * Extract the whole inventory. Shape:
 * {
 *   files: { "<rel>": { artifacts:[], gates:[], stops:[], dispatches:[], "rubric-checks":[] } },
 *   treeWide: { fields:[], invocations:[], config:[], citations:[] },
 *   counts: { <category>: n, files: n }
 * }
 */
export function extractInventory(root = PLUGIN_ROOT) {
  const files = {};
  const union = { fields: new Set(), invocations: new Set(), config: new Set(), citations: new Set() };
  for (const rel of listProseFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8');
    const { perFile, treeWide } = extractFile(rel, text, root);
    files[rel] = perFile;
    for (const k of Object.keys(union)) for (const e of treeWide[k]) union[k].add(e);
  }
  const treeWide = {};
  for (const k of Object.keys(union)) treeWide[k] = [...union[k]].sort();
  const counts = { files: Object.keys(files).length };
  for (const c of PER_FILE_CATEGORIES) {
    counts[c] = Object.values(files).reduce((n, f) => n + f[c].length, 0);
  }
  for (const c of TREE_WIDE_CATEGORIES) counts[c] = treeWide[c].length;
  return { files, treeWide, counts };
}

export function writeBaseline(inventory, path = BASELINE_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(inventory, null, 2) + '\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  // --root <dir>: extract from another checkout (a `git archive HEAD` export), so
  // the committed baseline describes the committed tree, not a dirty working tree.
  const rootArg = argv.indexOf('--root');
  const inventory = extractInventory(rootArg >= 0 ? resolve(argv[rootArg + 1]) : PLUGIN_ROOT);
  if (argv.includes('--write')) {
    writeBaseline(inventory);
    console.log(`wrote ${toPosix(relative(PLUGIN_ROOT, BASELINE_PATH))}`);
    console.log(JSON.stringify(inventory.counts));
  } else if (argv.includes('--summary')) {
    console.log(JSON.stringify(inventory.counts, null, 2));
  } else {
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
  }
}
