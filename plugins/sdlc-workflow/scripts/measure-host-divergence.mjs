#!/usr/bin/env node
/**
 * scripts/measure-host-divergence.mjs — READ-ONLY measurement of how far the
 * Claude and Codex skill trees have actually diverged.
 *
 * WHY THIS EXISTS. SINGLE-SOURCE-PLAN.md's §1 numbers decide the plan's design
 * (neutrality-first with a host-mechanics budget) and its effort shape (the
 * 17/88/22/11 slice split). Numbers that steer a design must be reproducible by
 * the next reader, or the next audit has to take them on trust — so the exact
 * normalization lives here, in runnable form, rather than in prose.
 *
 * WHAT IT MEASURES. Two files are "dialect-only" different when they become
 * identical after normalizing ONLY the host dialect:
 *   1. CRLF -> LF                         (the codex tree has CRLF files)
 *   2. `$wf` and `/wf` -> <WF>            (invocation sigil)
 *   3. `${CLAUDE_PLUGIN_ROOT}`, `${PLUGIN_ROOT}`, `<skill-dir>` -> <ROOT>
 *   4. trailing whitespace stripped per line
 * Nothing else is normalized. Any surviving difference is real text.
 *
 * The per-file difference count is a MULTISET symmetric difference over trimmed
 * non-empty lines — deliberately not an LCS diff. It ignores line moves (a
 * reordered section is not a rewrite) and counts a reworded line as one
 * difference on each side. It therefore OVERSTATES divergence slightly for
 * reflowed prose, which is the safe direction for a plan that budgets effort.
 *
 * This script reads two trees and writes nothing. It is not wired into `npm
 * test`: it measures a migration, and it becomes obsolete the day the codex
 * tree is deleted (SINGLE-SOURCE-PLAN W4) — delete it in that same commit.
 *
 * USAGE
 *   node scripts/measure-host-divergence.mjs           # summary
 *   node scripts/measure-host-divergence.mjs --top=20  # + biggest divergences
 *   node scripts/measure-host-divergence.mjs --json    # machine-readable
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_SKILLS = path.join(PLUGIN_ROOT, 'skills');
const CODEX_SKILLS = path.resolve(PLUGIN_ROOT, '..', 'sdlc-workflow-codex', 'skills');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const topN = Number((argv.find((a) => a.startsWith('--top=')) ?? '--top=0').split('=')[1]);

if (!existsSync(CODEX_SKILLS)) {
  console.error(`[measure] no codex tree at ${CODEX_SKILLS} — nothing to compare.`);
  console.error('[measure] if the single-source merge has landed, delete this script.');
  process.exit(2);
}

/** Every file under `dir`, as paths relative to it. */
function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const abs = path.join(dir, entry);
    return statSync(abs).isDirectory() ? walk(abs, base) : [path.relative(base, abs)];
  });
}

/** Strip host dialect — and ONLY host dialect. */
export function normalize(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\$wf/g, '<WF>')
    .replace(/\/wf\b/g, '<WF>')
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}|\$\{PLUGIN_ROOT\}|<skill-dir>/g, '<ROOT>')
    .replace(/[ \t]+$/gm, '');
}

/** Multiset symmetric difference over trimmed non-empty lines. */
function differingLines(a, b) {
  const count = (lines) => {
    const map = new Map();
    for (const line of lines) {
      const key = line.trim();
      if (key) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const ca = count(a);
  const cb = count(b);
  let diff = 0;
  for (const [key, n] of ca) diff += Math.max(0, n - (cb.get(key) ?? 0));
  for (const [key, n] of cb) diff += Math.max(0, n - (ca.get(key) ?? 0));
  return diff;
}

const rows = [];
let identical = 0;
let dialectOnly = 0;

for (const rel of walk(CLAUDE_SKILLS)) {
  const codexFile = path.join(CODEX_SKILLS, rel);
  if (!existsSync(codexFile)) continue; // Claude-only file: a move, not a merge
  const rawA = readFileSync(path.join(CLAUDE_SKILLS, rel), 'utf8');
  const rawB = readFileSync(codexFile, 'utf8');
  if (rawA === rawB) {
    identical++;
    continue;
  }
  const a = normalize(rawA);
  const b = normalize(rawB);
  if (a === b) {
    dialectOnly++;
    continue;
  }
  const linesA = a.split('\n');
  const linesB = b.split('\n');
  const diff = differingLines(linesA, linesB);
  const total = Math.max(
    linesA.filter((l) => l.trim()).length,
    linesB.filter((l) => l.trim()).length,
  );
  rows.push({ file: rel.replace(/\\/g, '/'), diff, total, pct: total ? Math.round((100 * diff) / total) : 0 });
}

rows.sort((x, y) => y.diff - x.diff);
const median = (nums) => nums.slice().sort((x, y) => x - y)[Math.floor(nums.length / 2)] ?? 0;

const summary = {
  sharedFiles: identical + dialectOnly + rows.length,
  identical,
  dialectOnly,
  realDifference: rows.length,
  medianDifferingLines: median(rows.map((r) => r.diff)),
  medianPercentOfFile: median(rows.map((r) => r.pct)),
  filesOver20Percent: rows.filter((r) => r.pct > 20).length,
  totalDifferingLines: rows.reduce((sum, r) => sum + r.diff, 0),
};

if (asJson) {
  console.log(JSON.stringify({ summary, files: rows }, null, 2));
} else {
  console.log('host divergence — Claude skills/ vs Codex skills/ (dialect normalized)\n');
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(22)} ${v}`);
  if (topN > 0) {
    console.log(`\n  top ${topN} by differing lines:`);
    for (const r of rows.slice(0, topN)) {
      console.log(`    ${String(r.diff).padStart(4)} / ${String(r.total).padStart(4)} (${String(r.pct).padStart(3)}%)  ${r.file}`);
    }
  }
}
