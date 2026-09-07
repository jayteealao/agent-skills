#!/usr/bin/env node
// scripts/verify-surface.mjs — the surface freeze (WIDE-VIEW-REPAIR-PLAN §11, wave W9).
//
// `docs/internal/surface-policy.json` pins six counts of the /wf surface. This
// gate counts each from the tree and fails when a count exceeds its pin:
//
//   keys              rows of the four key tables in skills/wf/SKILL.md
//   intakeModes       the mode keyword set named in skills/wf/reference/intake.md
//   reviewRubrics     skills/wf/reference/review/<rubric>.md (no underscore files)
//   aggregates        rows of the "| Aggregate | Rubrics |" table in review.md
//   artifactStems     distinct artifact names in the capability inventory's
//                     `artifacts` union (the W0 extractor, run on the tree)
//   frontmatterTypes  distinct `type` values the schema's oneOf branches accept
//
// Raising a pin is a one-line change to surface-policy.json in the same pull
// request as the new key, mode, rubric, aggregate, or artifact — a change a
// reviewer sees. docs/internal/SURFACE-POLICY.md states what earns that change.
//
// Usage:
//   node scripts/verify-surface.mjs            # gate (exit 1 on any count over its pin)
//   node scripts/verify-surface.mjs --json     # { counts, policy, failures, slack }
//   node scripts/verify-surface.mjs --root <dir>

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ROOT, extractInventory } from './extract-capabilities.mjs';

export const POLICY_REL = join('docs', 'internal', 'surface-policy.json');
export const POLICY_PATH = join(PLUGIN_ROOT, POLICY_REL);
export const DIMENSIONS = ['keys', 'intakeModes', 'reviewRubrics', 'aggregates', 'artifactStems', 'frontmatterTypes'];

const read = (root, ...p) => readFileSync(join(root, ...p), 'utf-8');

/** Rows of every markdown table whose header row starts with `| <first> |`. */
export function tableRows(text, first) {
  const rows = [];
  let inTable = false;
  for (const line of text.split(/\r?\n/)) {
    if (new RegExp(`^\\| ${first} \\|`).test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (/^\|[-| ]+\|$/.test(line)) continue; // the separator row
    if (!line.startsWith('|')) { inTable = false; continue; }
    rows.push(line);
  }
  return rows;
}

/** The key names in the SKILL.md key tables (first cell, backticked). */
export function countKeys(root = PLUGIN_ROOT) {
  const rows = tableRows(read(root, 'skills', 'wf', 'SKILL.md'), 'Key');
  return rows.map((r) => /^\| `([a-z][a-z-]*)`/.exec(r)?.[1]).filter(Boolean);
}

/** The intake mode keyword set, as intake.md names it. */
export function countIntakeModes(root = PLUGIN_ROOT) {
  const m = /The \*\*mode keyword set\*\* is: ([^\n]+?)\./.exec(read(root, 'skills', 'wf', 'reference', 'intake.md'));
  if (!m) return [];
  return [...m[1].matchAll(/`([a-z-]+)`/g)].map((x) => x[1]);
}

/** Rubric files under review/ (underscore files are shared procedure, not rubrics). */
export function countReviewRubrics(root = PLUGIN_ROOT) {
  return readdirSync(join(root, 'skills', 'wf', 'reference', 'review'))
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort();
}

/** Aggregate keys of the review.md aggregate table. */
export function countAggregates(root = PLUGIN_ROOT) {
  const rows = tableRows(read(root, 'skills', 'wf', 'reference', 'review.md'), 'Aggregate');
  return rows.map((r) => /^\| `([a-z-]+)`/.exec(r)?.[1]).filter(Boolean);
}

/** Distinct artifact names across the inventory's per-file `artifacts`. */
export function countArtifactStems(root = PLUGIN_ROOT) {
  const inv = extractInventory(root);
  const set = new Set();
  for (const f of Object.values(inv.files ?? {})) for (const a of f.artifacts ?? []) set.add(a);
  return [...set].sort();
}

/** Distinct `type` values the frontmatter schema's oneOf branches accept. */
export function countFrontmatterTypes(root = PLUGIN_ROOT) {
  const schema = JSON.parse(read(root, 'tests', 'frontmatter.schema.json'));
  const branches = (schema.allOf ?? []).flatMap((a) => a.oneOf ?? []);
  const types = new Set();
  for (const b of branches) {
    const name = b.$ref?.split('/').pop();
    const t = schema.$defs?.[name]?.properties?.type;
    if (t?.const) types.add(t.const);
    for (const e of t?.enum ?? []) types.add(e);
  }
  return [...types].sort();
}

/** Every dimension's members (arrays), so a failure can name what grew. */
export function surfaceMembers(root = PLUGIN_ROOT) {
  return {
    keys: countKeys(root),
    intakeModes: countIntakeModes(root),
    reviewRubrics: countReviewRubrics(root),
    aggregates: countAggregates(root),
    artifactStems: countArtifactStems(root),
    frontmatterTypes: countFrontmatterTypes(root),
  };
}

export function countSurface(root = PLUGIN_ROOT) {
  const members = surfaceMembers(root);
  return Object.fromEntries(DIMENSIONS.map((d) => [d, members[d].length]));
}

export function readPolicy(path = POLICY_PATH) {
  if (!existsSync(path)) throw new Error(`surface policy missing: ${path}`);
  const policy = JSON.parse(readFileSync(path, 'utf-8'));
  for (const d of DIMENSIONS) {
    if (!Number.isInteger(policy[d])) throw new Error(`surface policy: "${d}" must be an integer`);
  }
  return policy;
}

/**
 * Compare counts with the policy. A count over its pin is a failure. A count
 * under its pin is slack (reported, never a failure): the pin is a ceiling.
 */
export function checkSurface(counts, policy) {
  const failures = [];
  const slack = [];
  for (const d of DIMENSIONS) {
    if (counts[d] > policy[d]) failures.push(`${d}: ${counts[d]} exceeds the pin of ${policy[d]} — raise surface-policy.json in the same pull request, with the earn rule in SURFACE-POLICY.md met`);
    else if (counts[d] < policy[d]) slack.push(`${d}: ${counts[d]} of ${policy[d]}`);
  }
  return { failures, slack };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : (process.argv[i + 1] ?? true);
}

function main() {
  const root = arg('--root') ? resolve(String(arg('--root'))) : PLUGIN_ROOT;
  const policy = readPolicy(join(root, POLICY_REL));
  const counts = countSurface(root);
  const { failures, slack } = checkSurface(counts, policy);
  if (arg('--json')) {
    process.stdout.write(`${JSON.stringify({ counts, policy, failures, slack }, null, 2)}\n`);
    process.exit(failures.length ? 1 : 0);
  }
  for (const f of failures) console.error(`[surface] FAIL ${f}`);
  for (const s of slack) console.log(`[surface] slack ${s}`);
  if (failures.length) {
    console.error(`[surface] ${failures.length} count(s) over the pin.`);
    process.exit(1);
  }
  console.log(`[surface] OK — ${DIMENSIONS.map((d) => `${d} ${counts[d]}/${policy[d]}`).join(', ')}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
