#!/usr/bin/env node
// scripts/verify-capabilities.mjs — the capability regression gate
// (WIDE-VIEW-REPAIR-PLAN §3.2, wave W0).
//
// Re-extracts the inventory from the working tree and compares it with the
// committed baseline. Every baseline entry must still exist:
//   per-file categories  — in the same file, or in the file named for it in
//                          moved.json ({from, to, entry, category?}), or under
//                          new words named in reworded.json
//                          ({file, category, from, to} — `to` must exist), or in
//                          retired.json ({entry, reason, release, file?, category?})
//   tree-wide categories — somewhere in the tree, or in retired.json
// Rubric checks compare per rubric GROUP: groups.json maps a rubric file to a
// group name (default: the file itself), so W4's merge can move a check from
// testing.md into correctness.md by declaring both files members of one group.
//
// Exit 1 on any unexplained absence, printing file, category, and entry.
// New entries are reported as information; they never fail the gate.
//
// Usage:
//   node scripts/verify-capabilities.mjs           # gate
//   node scripts/verify-capabilities.mjs --json    # machine-readable report
//   node scripts/verify-capabilities.mjs --root <dir> --baseline <file>   (tests)

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_PATH,
  INVENTORY_DIR,
  PER_FILE_CATEGORIES,
  PLUGIN_ROOT,
  TREE_WIDE_CATEGORIES,
  extractInventory,
} from './extract-capabilities.mjs';

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Compare a baseline inventory with a current one.
 * @returns {{ missing: Array<{file, category, entry}>, added: Array<{file, category, entry}>, retired: number, moved: number, errors: string[] }}
 */
export function compareInventories(baseline, current, { moved = [], retired = [], groups = {}, reworded = [] } = {}) {
  const errors = [];
  const missing = [];
  const added = [];

  for (const [i, r] of retired.entries()) {
    if (!r || typeof r.entry !== 'string' || !r.reason || !r.release) {
      errors.push(`retired.json[${i}] needs {entry, reason, release}`);
    }
  }
  for (const [i, m] of moved.entries()) {
    if (!m || typeof m.entry !== 'string' || !m.from || !m.to) {
      errors.push(`moved.json[${i}] needs {from, to, entry}`);
    }
  }
  for (const [i, r] of reworded.entries()) {
    if (!r || typeof r.file !== 'string' || typeof r.category !== 'string' || typeof r.from !== 'string' || typeof r.to !== 'string') {
      errors.push(`reworded.json[${i}] needs {file, category, from, to}`);
    }
  }

  const isRetired = (file, category, entry) =>
    retired.some((r) => r.entry === entry && (!r.category || r.category === category) && (!r.file || r.file === file));

  const movedTargets = (file, category, entry) =>
    moved
      .filter((m) => m.from === file && m.entry === entry && (!m.category || m.category === category))
      .map((m) => m.to);

  const groupOf = (file) => groups[file] ?? file;
  const filesInGroup = (file) => {
    const g = groupOf(file);
    return Object.keys(current.files).filter((f) => groupOf(f) === g);
  };

  const has = (file, category, entry) => {
    const f = current.files[file];
    return Boolean(f && f[category] && f[category].includes(entry));
  };

  // A reworded sentence survives when its new first words exist in the same file.
  const rewordedTo = (file, category, entry) =>
    reworded.filter((r) => r.file === file && r.category === category && r.from === entry).map((r) => r.to);

  for (const [file, cats] of Object.entries(baseline.files)) {
    for (const category of PER_FILE_CATEGORIES) {
      for (const entry of cats[category] ?? []) {
        if (has(file, category, entry)) continue;
        if (category === 'rubric-checks' && filesInGroup(file).some((f) => has(f, category, entry))) continue;
        if (movedTargets(file, category, entry).some((to) => has(to, category, entry))) continue;
        if (rewordedTo(file, category, entry).some((to) => has(file, category, to))) continue;
        if (isRetired(file, category, entry)) continue;
        missing.push({ file, category, entry });
      }
    }
  }
  for (const [file, cats] of Object.entries(current.files)) {
    for (const category of PER_FILE_CATEGORIES) {
      for (const entry of cats[category] ?? []) {
        const b = baseline.files[file];
        if (!(b && b[category] && b[category].includes(entry))) added.push({ file, category, entry });
      }
    }
  }

  for (const category of TREE_WIDE_CATEGORIES) {
    const cur = new Set(current.treeWide[category] ?? []);
    for (const entry of baseline.treeWide[category] ?? []) {
      if (cur.has(entry)) continue;
      if (isRetired('*', category, entry)) continue;
      missing.push({ file: '*', category, entry });
    }
    const base = new Set(baseline.treeWide[category] ?? []);
    for (const entry of cur) if (!base.has(entry)) added.push({ file: '*', category, entry });
  }

  return { missing, added, retired: retired.length, moved: moved.length, reworded: reworded.length, errors };
}

export function runGate({ root = PLUGIN_ROOT, baselinePath = BASELINE_PATH, inventoryDir = INVENTORY_DIR } = {}) {
  if (!existsSync(baselinePath)) {
    return { ok: false, errors: [`baseline missing: ${baselinePath} — run \`node scripts/extract-capabilities.mjs --write\``], missing: [], added: [] };
  }
  const baseline = readJson(baselinePath);
  const current = extractInventory(root);
  const moved = readJson(join(inventoryDir, 'moved.json'), []);
  const retired = readJson(join(inventoryDir, 'retired.json'), []);
  const groups = readJson(join(inventoryDir, 'groups.json'), {});
  const reworded = readJson(join(inventoryDir, 'reworded.json'), []);
  const report = compareInventories(baseline, current, { moved, retired, groups, reworded });
  return { ok: report.errors.length === 0 && report.missing.length === 0, counts: current.counts, ...report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const root = arg('--root') ? resolve(arg('--root')) : PLUGIN_ROOT;
  const baselinePath = arg('--baseline') ? resolve(arg('--baseline')) : (arg('--root') ? join(root, 'docs/internal/capability-inventory/baseline.json') : BASELINE_PATH);
  const inventoryDir = arg('--root') ? join(root, 'docs/internal/capability-inventory') : INVENTORY_DIR;
  const report = runGate({ root, baselinePath, inventoryDir });

  if (argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const e of report.errors) console.error(`[capabilities] ERROR ${e}`);
    for (const m of report.missing) console.error(`[capabilities] MISSING ${m.file} :: ${m.category} :: ${m.entry}`);
    if (report.added.length) console.log(`[capabilities] ${report.added.length} new entr${report.added.length === 1 ? 'y' : 'ies'} (informational)`);
    if (report.ok) {
      console.log(`[capabilities] OK — every baseline capability present (${report.retired} retired, ${report.moved} moved, ${report.reworded} reworded)`);
    } else {
      console.error(`[capabilities] FAIL — ${report.missing.length} missing, ${report.errors.length} errors. Explain each in docs/internal/capability-inventory/retired.json or moved.json.`);
    }
  }
  process.exit(report.ok ? 0 : 1);
}
