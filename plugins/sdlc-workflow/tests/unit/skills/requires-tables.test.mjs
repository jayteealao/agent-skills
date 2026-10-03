// ARTIFACT-SPLIT-PLAN W2 — the Requires-table guard (build spec S1).
//
// Every stage reference that writes a stage artifact carries one `## Requires`
// table. The table replaces the prose read orders of Step 0, and the mod's read
// check (S6) reads it through hooks/mod/requires.ts. This test pins:
//   (a) each stage reference has exactly one table that parses, with a `writes`
//       row unless the reference is a listed reader or router;
//   (b) no Step 0 / Orient "Read `<file>`" or "Load `<file>`" sentence names a
//       workflow artifact or a procedure file that the table does not name;
//   (c) each `procedure` row names a file on disk, and each `artifact` / `writes`
//       row uses only the `<slice>` and `<mode>` placeholders.
// Covered elsewhere, not duplicated here:
//   (d) hooks/mod/requires.ts is current — tests/unit/mod/build-requires.test.mjs
//       runs `node scripts/build-requires.mjs --check`.
//   (e) the prose budget does not grow — tests/unit/prose-budget.test.mjs runs
//       scripts/verify-prose-budget.mjs against the committed ceilings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRequires } from '../../../scripts/build-requires.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF_DIR = path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference');

// The stage references: each owns a stage run and carries a Requires table.
const STAGE_REFERENCES = [
  'augment/benchmark.md', 'augment/experiment.md', 'augment/instrument.md', 'augment/profile.md',
  'brainstorm.md', 'close.md', 'design.md', 'docs.md', 'handoff.md', 'implement.md', 'intake.md',
  'intake/adopt.md', 'intake/audit.md', 'intake/brainstorm.md', 'intake/default.md', 'intake/discover.md',
  'intake/extend.md', 'intake/fix.md', 'intake/hotfix.md', 'intake/ideate.md', 'intake/investigate.md',
  'intake/rca.md', 'intake/refactor.md', 'intake/update-deps.md', 'observability.md', 'plan.md', 'probe.md',
  'recap.md', 'retro.md', 'review.md', 'shape.md', 'ship-plan.md', 'ship.md', 'simplify.md', 'slice.md',
  'status.md', 'task.md', 'verify.md',
];

// Stage references with a table but no `writes` row.
const NO_WRITES = new Map([
  ['status.md', 'a reader: it writes no stage artifact'],
  ['intake.md', 'the intake dispatcher: the mode reference it loads writes the lead'],
  ['brainstorm.md', 'a router to intake/brainstorm.md, which writes 01-brainstorm.md'],
]);

// References without a table. `_*.md` sub-procedures never carry one (S1); these
// are the other files, each loaded by a stage reference that owns the table.
const NO_TABLE = [
  [/^auto\.md$|^yolo\.md$|^campaign\.md$/, 'lifecycle drivers: they run stage references, which carry the tables'],
  [/^intake\/amend\.md$/, 'edits 00-index.md only; writes no stage artifact'],
  [/^intake\/modernize\.md$/, 'backfills fields of existing artifacts; writes no stage artifact'],
  [/^design\/[^/]+\.md$/, 'design moves and sub-steps, loaded by design.md (and by shape, slice, plan, retro)'],
  [/^docs\/[^/]+\.md$/, 'Diátaxis primitives, loaded by docs.md and handoff.md'],
  [/^review\/[^/]+\.md$/, 'review dimensions, loaded by review.md'],
  [/^runtime-adapters(\/[^/]+)?\.md$/, 'runtime adapters, loaded as procedure rows by probe and verify'],
  [/^ship-plan\/.+\.md$/, 'ship-plan sub-commands and templates, loaded by ship-plan.md'],
  [/^ship\/(announce|rollback)\.md$/, 'ship phases, loaded by ship.md'],
  [/^observability\/[^/]+\.md$/, 'observability sub-commands, loaded by observability.md'],
  [/^augment\/wide-event-observability\.md$/, 'an observability playbook, loaded by augment/instrument.md'],
];

function markdownFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) found.push(...markdownFiles(abs, base));
    else if (name.endsWith('.md')) found.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return found;
}

const read = (rel) => readFileSync(path.join(REF_DIR, rel), 'utf8');

/** `## Requires` headings outside fenced code. */
function requiresHeadingCount(text) {
  let fence = null;
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const mark = /^\s*(```+|~~~+)/.exec(line);
    if (mark) {
      const kind = mark[1].slice(0, 3);
      if (fence === null) fence = kind;
      else if (kind === fence) fence = null;
      continue;
    }
    if (fence === null && /^##\s+Requires\s*$/.test(line)) count += 1;
  }
  return count;
}

test('(a) the stage-reference list matches the tree: every other reference is a listed sub-procedure', () => {
  const unlisted = [];
  for (const rel of markdownFiles(REF_DIR)) {
    if (path.posix.basename(rel).startsWith('_')) continue;
    if (STAGE_REFERENCES.includes(rel)) continue;
    if (NO_TABLE.some(([re]) => re.test(rel))) {
      assert.equal(requiresHeadingCount(read(rel)), 0, `${rel} is listed as having no table but carries one; add it to STAGE_REFERENCES`);
      continue;
    }
    unlisted.push(rel);
  }
  assert.deepEqual(unlisted, [], `references that are neither stage references nor listed sub-procedures:\n${unlisted.join('\n')}`);
});

test('(a) every stage reference has exactly one Requires table that parses, with a writes row', () => {
  for (const rel of STAGE_REFERENCES) {
    const text = read(rel);
    assert.equal(requiresHeadingCount(text), 1, `${rel}: expected exactly one ## Requires section`);
    const { rows, errors } = parseRequires(text);
    assert.deepEqual(errors, [], `${rel}: the Requires table does not parse`);
    assert.ok(rows && rows.length > 0, `${rel}: the Requires table has no rows`);
    const writes = rows.filter((row) => row.kind === 'writes');
    if (NO_WRITES.has(rel)) assert.equal(writes.length, 0, `${rel} is listed as a non-writer but has a writes row`);
    else assert.ok(writes.length > 0, `${rel}: no writes row`);
  }
});

test('(c) procedure rows exist on disk; artifact and writes rows use only <slice> and <mode>', () => {
  const problems = [];
  for (const rel of STAGE_REFERENCES) {
    const { rows } = parseRequires(read(rel));
    for (const row of rows ?? []) {
      if (!row.file) continue;
      if (row.kind === 'procedure') {
        if (!existsSync(path.join(REF_DIR, row.input))) problems.push(`${rel}: procedure row \`${row.input}\` does not exist`);
        continue;
      }
      for (const [placeholder] of row.input.matchAll(/<[^>]*>/g)) {
        if (placeholder !== '<slice>' && placeholder !== '<mode>') problems.push(`${rel}: ${row.kind} row \`${row.input}\` uses ${placeholder}`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

// ---- (b) Step 0 read orders -------------------------------------------------

/** The Step 0 / Orient sections of a reference: heading through the next heading of the same or a higher level. */
export function orientSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let fence = null;
  let open = null;
  lines.forEach((line, index) => {
    const mark = /^\s*(```+|~~~+)/.exec(line);
    if (mark) {
      const kind = mark[1].slice(0, 3);
      if (fence === null) fence = kind;
      else if (kind === fence) fence = null;
    }
    const heading = fence === null && !mark ? /^(#{1,6})\s+(.*)$/.exec(line) : null;
    if (heading) {
      const level = heading[1].length;
      if (open && level <= open.level) {
        sections.push(open);
        open = null;
      }
      if (!open && /\bStep\s+[A-Z]?0+\b(?!\.\d)|\bOrient\b/.test(heading[2])) open = { level, start: index + 1, lines: [] };
      return;
    }
    if (open) open.lines.push({ at: index + 1, line });
  });
  if (open) sections.push(open);
  return sections;
}

// "Read `<file>`" / "Load `<file>`" / "**Read `<file>`**" / "Load [<file>](...)".
const READ_ORDER = /\b(?:Read|Load|read|load)\b(?:\*\*)?[ \t]+(?:\*\*)?(?:`([^`]+)`|\[([^\]]+)\]\([^)]*\))/g;

/** The kind of a named file: 'artifact', 'procedure', or null for anything else. */
export function fileKind(name) {
  const base = path.posix.basename(name.replace(/\\/g, '/'));
  if (/^\d{2}[a-z]?-.+\.md$/.test(base) || base === 'po-answers.md' || base === '00-index.md') return 'artifact';
  if (/^_.+\.md$/.test(base) || /^runtime-adapters.*\.md$/.test(base)) return 'procedure';
  return null;
}

const toRegex = (pattern) => new RegExp(`^${pattern.split(/(<[^>]+>|\*)/).map((part) => (/^<[^>]+>$|^\*$/.test(part) ? '.+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('')}$`);

/** True when a table row names the cited file. */
export function tableNames(rows, rel, name) {
  const cited = name.replace(/\\/g, '/').replace(/^\.ai\/workflows\/<slug>\//, '').replace(/^(\.\.\/)+/, '');
  const kind = fileKind(cited);
  const citedText = cited.replace(/<[^>]+>/g, 'X');
  for (const row of rows) {
    if (!row.file) continue;
    if (kind === 'artifact' && row.kind !== 'procedure') {
      if (row.input === cited || toRegex(row.input).test(citedText)) return true;
    }
    if (kind === 'procedure' && row.kind === 'procedure') {
      const inDir = path.posix.join(path.posix.dirname(rel), cited);
      if (row.input === cited || row.input === inDir) return true;
    }
  }
  return false;
}

test('(b) no Step 0 / Orient read order names a file that the Requires table does not name', () => {
  const problems = [];
  let checked = 0;
  for (const rel of STAGE_REFERENCES) {
    const text = read(rel);
    const { rows } = parseRequires(text);
    for (const section of orientSections(text)) {
      for (const { at, line } of section.lines) {
        for (const m of line.matchAll(READ_ORDER)) {
          const name = (m[1] ?? m[2]).trim();
          if (!fileKind(name)) continue;
          checked += 1;
          if (!tableNames(rows ?? [], rel, name)) problems.push(`${rel}:${at}: "${m[0]}" names \`${name}\`, which the Requires table does not name`);
        }
      }
    }
  }
  assert.ok(checked >= 10, `only ${checked} Step 0 read orders were found; the scan is broken`);
  assert.deepEqual(problems, [], `Step 0 read orders outside the Requires table:\n${problems.join('\n')}`);
});

// "Load <procedure file>" anywhere in a stage reference: the W2 done-when names
// Step 0 and "load" sentences. Only procedure files count here, because a
// "load" of a workflow artifact outside Step 0 is rare and names a file the
// stage writes as often as one it reads.
const LOAD_ORDER = /\b[Ll]oad\b(?:\*\*)?[ \t]+(?:\*\*)?(?:`([^`]+)`|\[([^\]]+)\]\([^)]*\))/g;

test('(b) no "load" sentence names a procedure file that the Requires table does not name', () => {
  const problems = [];
  let checked = 0;
  for (const rel of STAGE_REFERENCES) {
    const text = read(rel);
    const { rows } = parseRequires(text);
    text.split(/\r?\n/).forEach((line, index) => {
      for (const m of line.matchAll(LOAD_ORDER)) {
        const name = (m[1] ?? m[2]).trim();
        if (fileKind(name) !== 'procedure') continue;
        checked += 1;
        if (!tableNames(rows ?? [], rel, name)) problems.push(`${rel}:${index + 1}: "${m[0]}" names \`${name}\`, which the Requires table does not name`);
      }
    });
  }
  assert.ok(checked >= 5, `only ${checked} load sentences were found; the scan is broken`);
  assert.deepEqual(problems, [], `load sentences outside the Requires table:\n${problems.join('\n')}`);
});

test('(b) self-test: the scan finds a Step 0 read of a file that the table does not name', () => {
  const fixture = [
    '# Fixture', '', '## Requires', '', '| Input | Kind | When | Sections |', '|---|---|---|---|',
    '| `00-index.md` | artifact | always | |', '| `05-implement-<slice>.md` | writes | | |', '',
    '# Step 0 — Orient', '1. **Read `00-index.md`**.', '2. Read `02-shape.md` for the criteria.', '3. Load [_gate-question.md](_gate-question.md).',
    '# Step 1 — Work', 'Read `04-plan.md` here; outside Step 0.',
  ].join('\n');
  const { rows } = parseRequires(fixture);
  const found = [];
  for (const section of orientSections(fixture)) {
    for (const { line } of section.lines) {
      for (const m of line.matchAll(READ_ORDER)) {
        const name = (m[1] ?? m[2]).trim();
        if (fileKind(name) && !tableNames(rows, 'fixture.md', name)) found.push(name);
      }
    }
  }
  assert.deepEqual(found, ['02-shape.md', '_gate-question.md']);
});
