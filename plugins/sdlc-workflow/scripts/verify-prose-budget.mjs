#!/usr/bin/env node
// scripts/verify-prose-budget.mjs — the prose budget ratchet
// (WIDE-VIEW-REPAIR-PLAN §4.2, §6.2, §3.4; wave W1).
//
// Every skills/**/*.md belongs to one budget class (§4.1) and gets that class's
// line budget. `prose-budget.json` records the budgets and three ratchets:
//
//   exceptions   {"<file>": <lines>}         a file over its class budget at W1
//                                            start; it may shrink, never grow
//   tokens       {"<name>": {pattern, allowed, files: {"<file>": <count>}}}
//                                            emphasis words (§6.1) and version
//                                            strings (§4.2.4); a file may not
//                                            gain a token; the total may not
//                                            exceed `allowed` once the file
//                                            counts reach zero
//   load         {"<key>": {core, instructed}} a key over its §1.1 target; may
//                                            shrink, never grow
//
// A shrink lowers the recorded number (`--update` does that for you); a file
// that meets its budget drops out of `exceptions`. Absolute rules with no
// ratchet: no file over `hardCapLines`, and a rubric carries at most one code
// fence, tagged `yaml`.
//
// Usage:
//   node scripts/verify-prose-budget.mjs            # gate (exit 1 on failure)
//   node scripts/verify-prose-budget.mjs --update   # lower every ratchet to the tree
//   node scripts/verify-prose-budget.mjs --json     # machine-readable report
//   node scripts/verify-prose-budget.mjs --root <dir>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_ROOT, listProseFiles } from './extract-capabilities.mjs';
import { listKeys, measureLoad, wordCount } from './measure-load.mjs';

export const BUDGET_PATH = join(PLUGIN_ROOT, 'docs', 'internal', 'capability-inventory', 'prose-budget.json');

const RUBRIC_DIR = 'skills/wf/reference/review/';
const REF = 'skills/wf/reference/';

/** §4.1 class of one plugin-relative prose path. */
export function classOf(rel, keys) {
  const base = posix.basename(rel);
  if (rel === 'skills/wf/SKILL.md') return 'dispatcher';
  if (/^skills\/[^/]+\/SKILL\.md$/.test(rel)) return 'dispatcher';
  if (!rel.startsWith(REF)) return 'sub-procedure';
  const sub = rel.slice(REF.length);
  if (sub === '_ste-procedural.md' || sub === '_story-arc.md') return 'rule-set';
  if (!sub.includes('/')) {
    if (base.startsWith('_')) return 'shared-contract';
    if (base === 'runtime-adapters.md') return 'adapter';
    if (keys.includes(base.replace(/\.md$/, ''))) return 'stage-body';
    return 'sub-procedure';
  }
  if (sub.startsWith('review/')) return base.startsWith('_') ? 'stage-body' : 'rubric';
  if (sub.startsWith('intake/')) return 'stage-body';
  if (sub.startsWith('ship-plan/ship-plan-templates/')) return 'template';
  if (sub.startsWith('runtime-adapters/')) return 'adapter';
  return 'sub-procedure';
}

function lineCount(text) {
  const n = text.split(/\r?\n/).length;
  return text.endsWith('\n') ? n - 1 : n;
}

function countMatches(text, pattern) {
  return (text.match(new RegExp(pattern, 'g')) ?? []).length;
}

/** Code fences in a rubric other than one tagged `yaml`. */
function rubricFenceViolations(text) {
  const fences = [...text.matchAll(/^```([^\n]*)$/gm)].map((m) => m[1].trim());
  const openers = fences.filter((_, i) => i % 2 === 0);
  const yaml = openers.filter((t) => t === 'yaml').length;
  const other = openers.length - yaml;
  return other + Math.max(0, yaml - 1);
}

export function readBudget(path = BUDGET_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Measure the tree against the budget file.
 * @returns {{ failures: string[], files: object, tokens: object, load: object }}
 */
export function checkBudget(budget, root = PLUGIN_ROOT) {
  const failures = [];
  const keys = listKeys(root);
  const files = {};
  const tokenCounts = {};
  for (const name of Object.keys(budget.tokens ?? {})) tokenCounts[name] = {};

  for (const rel of listProseFiles(root)) {
    const text = readFileSync(join(root, rel), 'utf8');
    const cls = classOf(rel, keys);
    const lines = lineCount(text);
    const cap = budget.classes[cls];
    if (cap === undefined) failures.push(`${rel}: class "${cls}" has no budget in prose-budget.json`);
    files[rel] = { class: cls, lines, budget: cap };

    if (lines > (budget.hardCapLines ?? Infinity)) {
      failures.push(`${rel}: ${lines} lines exceeds the hard cap of ${budget.hardCapLines}`);
    }
    // Frontmatter integrity: an unwrap pass must never join the `---` delimiter to the keys.
    if (text.startsWith('---')) {
      const first = text.split(/\r?\n/, 1)[0];
      if (first !== '---') {
        failures.push(
          `${rel}: line 1 is \`${first.slice(0, 48)}…\` — the frontmatter delimiter must stand alone on its own line`,
        );
      } else if (!/^---\r?\n[\s\S]*?\r?\n---\r?\n/.test(text)) {
        failures.push(`${rel}: opens a frontmatter block that never closes on its own \`---\` line`);
      }
    }
    const excepted = budget.exceptions?.[rel];
    if (cap !== undefined && lines > cap) {
      if (excepted === undefined) {
        failures.push(`${rel}: ${lines} lines over the ${cls} budget of ${cap} and not in exceptions`);
      } else if (lines > excepted) {
        failures.push(`${rel}: grew from ${excepted} to ${lines} lines (${cls} budget ${cap}); a budgeted file may not grow`);
      } else if (lines < excepted) {
        failures.push(`${rel}: shrank to ${lines} lines; lower its exceptions entry from ${excepted} (run --update)`);
      }
    } else if (excepted !== undefined) {
      failures.push(`${rel}: meets its ${cls} budget (${lines} ≤ ${cap}); remove its exceptions entry (run --update)`);
    }

    if (cls === 'rubric') {
      const bad = rubricFenceViolations(text);
      const allowedBad = budget.rubricFenceExceptions?.[rel];
      if (bad > 0 && allowedBad === undefined) failures.push(`${rel}: ${bad} code fence(s) other than one \`yaml\` fence`);
      else if (allowedBad !== undefined && bad > allowedBad) failures.push(`${rel}: rubric fences grew from ${allowedBad} to ${bad}`);
      else if (allowedBad !== undefined && bad < allowedBad) failures.push(`${rel}: rubric fences fell to ${bad}; lower rubricFenceExceptions from ${allowedBad} (run --update)`);
    }

    for (const [name, rule] of Object.entries(budget.tokens ?? {})) {
      const n = countMatches(text, rule.pattern);
      if (n > 0) tokenCounts[name][rel] = n;
      const recorded = rule.files?.[rel] ?? 0;
      const allowedHere = rule.allowedFiles?.[rel] ?? 0;
      if (n > Math.max(recorded, allowedHere)) {
        failures.push(`${rel}: ${name} appears ${n} times (recorded ${recorded}, allowed ${allowedHere}); a file may not gain this token`);
      } else if (n < recorded && n > allowedHere) {
        failures.push(`${rel}: ${name} fell to ${n}; lower its tokens.${name}.files entry from ${recorded} (run --update)`);
      } else if (n <= allowedHere && recorded > 0) {
        failures.push(`${rel}: ${name} is within its allowance (${n} ≤ ${allowedHere}); remove its tokens.${name}.files entry (run --update)`);
      }
    }
  }
  for (const [name, rule] of Object.entries(budget.tokens ?? {})) {
    for (const rel of Object.keys(rule.files ?? {})) {
      if (!(rel in files)) failures.push(`tokens.${name}.files names a missing file ${rel}; remove it (run --update)`);
    }
  }
  for (const rel of Object.keys(budget.exceptions ?? {})) {
    if (!(rel in files)) failures.push(`exceptions names a missing file ${rel}; remove it (run --update)`);
  }

  // Plan §16: a per-file word budget raised above its class target. Each entry needs a
  // reason, may only fall, and is dropped once the file fits its class target again.
  const wordBudgets = {};
  for (const [rel, entry] of Object.entries(budget.wordBudgets ?? {})) {
    if (!(rel in files)) { failures.push(`wordBudgets names a missing file ${rel}; remove it`); continue; }
    if (!entry || typeof entry.reason !== 'string' || !entry.reason.trim()) failures.push(`wordBudgets ${rel}: needs a non-empty reason`);
    const words = wordCount(rel, root);
    const classTarget = (budget.classes?.[files[rel].class] ?? 0) * 11;
    wordBudgets[rel] = { words, budget: entry.words, classTarget };
    if (!Number.isFinite(entry.words)) failures.push(`wordBudgets ${rel}: words must be a number`);
    else if (words > entry.words) failures.push(`wordBudgets ${rel}: grew from ${entry.words} to ${words} words; a raised budget may not grow`);
    else if (words < entry.words) failures.push(`wordBudgets ${rel}: fell to ${words}; lower its entry from ${entry.words} (run --update)`);
    if (words <= classTarget) failures.push(`wordBudgets ${rel}: within its class target (${words} ≤ ${classTarget}); remove the entry (run --update)`);
  }

  const measured = measureLoad(root);
  const load = {};
  for (const key of keys) {
    const k = measured.keys[key];
    const excepted = budget.load?.[key];
    load[key] = { core: k.core.words, instructed: k.instructed.words, target: k.target };
    for (const dim of ['core', 'instructed']) {
      const words = k[dim].words;
      const target = k.target[dim];
      const recorded = excepted?.[dim];
      if (words > target) {
        if (recorded === undefined) failures.push(`load ${key}.${dim}: ${words} words over the target of ${target} and not in load exceptions`);
        else if (words > recorded) failures.push(`load ${key}.${dim}: grew from ${recorded} to ${words} words (target ${target}); a key's load may not grow`);
        else if (words < recorded) failures.push(`load ${key}.${dim}: fell to ${words}; lower its load entry from ${recorded} (run --update)`);
      } else if (recorded !== undefined) {
        failures.push(`load ${key}.${dim}: within target (${words} ≤ ${target}); remove its load entry (run --update)`);
      }
    }
  }
  return { failures, files, tokens: tokenCounts, load, wordBudgets };
}

/** Rewrite every ratchet in `budget` to the current tree (only ever lowers what the gate checks). */
export function updateBudget(budget, root = PLUGIN_ROOT) {
  const report = checkBudget(budget, root);
  const next = { ...budget, exceptions: {}, tokens: {}, load: {}, rubricFenceExceptions: {} };
  for (const [rel, f] of Object.entries(report.files)) {
    if (f.budget !== undefined && f.lines > f.budget) next.exceptions[rel] = f.lines;
    if (f.class === 'rubric') {
      const bad = rubricFenceViolations(readFileSync(join(root, rel), 'utf8'));
      if (bad > 0) next.rubricFenceExceptions[rel] = bad;
    }
  }
  for (const [name, rule] of Object.entries(budget.tokens ?? {})) {
    const files = {};
    for (const [rel, n] of Object.entries(report.tokens[name] ?? {})) {
      if (n > (rule.allowedFiles?.[rel] ?? 0)) files[rel] = n;
    }
    next.tokens[name] = { ...rule, files: sortKeys(files) };
  }
  for (const [key, l] of Object.entries(report.load)) {
    const entry = {};
    if (l.core > l.target.core) entry.core = l.core;
    if (l.instructed > l.target.instructed) entry.instructed = l.instructed;
    if (Object.keys(entry).length) next.load[key] = entry;
  }
  // wordBudgets: keep the hand-written reason, lower `words` to the file, drop a fitted file.
  if (budget.wordBudgets) {
    next.wordBudgets = {};
    for (const [rel, w] of Object.entries(report.wordBudgets)) {
      if (w.words > w.classTarget) next.wordBudgets[rel] = { words: w.words, reason: budget.wordBudgets[rel].reason };
    }
    next.wordBudgets = sortKeys(next.wordBudgets);
  }
  next.exceptions = sortKeys(next.exceptions);
  next.rubricFenceExceptions = sortKeys(next.rubricFenceExceptions);
  next.load = sortKeys(next.load);
  return next;
}

function sortKeys(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function writeBudget(budget, path = BUDGET_PATH) {
  writeFileSync(path, JSON.stringify(budget, null, 2) + '\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const rootArg = argv.indexOf('--root');
  const root = rootArg >= 0 ? resolve(argv[rootArg + 1]) : PLUGIN_ROOT;
  const budgetPath = rootArg >= 0 ? join(root, 'docs/internal/capability-inventory/prose-budget.json') : BUDGET_PATH;
  if (!existsSync(budgetPath)) {
    console.error(`[prose] budget file missing: ${budgetPath}`);
    process.exit(1);
  }
  const budget = readBudget(budgetPath);
  if (argv.includes('--update')) {
    const next = updateBudget(budget, root);
    writeBudget(next, budgetPath);
    console.log(`[prose] wrote ${budgetPath}: ${Object.keys(next.exceptions).length} files over budget, ${Object.keys(next.load).length} keys over load target`);
    process.exit(0);
  }
  const report = checkBudget(budget, root);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const f of report.failures) console.error(`[prose] FAIL ${f}`);
    const over = Object.values(report.files).filter((f) => f.budget !== undefined && f.lines > f.budget).length;
    if (report.failures.length === 0) {
      console.log(`[prose] OK — ${Object.keys(report.files).length} files, ${over} still over budget (ratcheted), ${Object.keys(budget.load ?? {}).length} keys over load target (ratcheted)`);
    } else {
      console.error(`[prose] ${report.failures.length} failure(s). Shrink the file, or run \`node scripts/verify-prose-budget.mjs --update\` after an intentional shrink.`);
    }
  }
  process.exit(report.failures.length ? 1 : 0);
}
