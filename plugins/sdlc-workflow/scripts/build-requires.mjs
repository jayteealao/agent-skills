#!/usr/bin/env node
/**
 * scripts/build-requires.mjs — builds hooks/mod/requires.ts from the
 * `## Requires` tables of the stage references (ARTIFACT-SPLIT-PLAN.md S1, S6).
 *
 * The mod's read check (hooks/mod/readledger.ts) reads the generated module:
 * which stage writes which artifact, and which inputs and procedure files the
 * writer must read first. The module is data only, sorted by reference, so the
 * same tables always give the same bytes.
 *
 * USAGE
 *   node scripts/build-requires.mjs            # write hooks/mod/requires.ts
 *   node scripts/build-requires.mjs --check    # exit 1 when the file on disk is out of date
 *   --reference <dir>   the reference tree (default skills/wf/reference)
 *   --out <file>        the module to write (default hooks/mod/requires.ts)
 *
 * A reference with no table contributes nothing; zero tables give an empty
 * list. A malformed table (an unknown Kind, a missing column) fails the run.
 * Files whose name starts with `_` are sub-procedures and never carry a table.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REFERENCE = path.join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const DEFAULT_OUT = path.join(PLUGIN_ROOT, 'hooks', 'mod', 'requires.ts');

export const KINDS = ['artifact', 'procedure', 'writes'];
const HEADER = ['input', 'kind', 'when', 'sections'];

/** The stage key of a reference path relative to reference/: `intake/fix.md` → `intake:fix`. */
export function stageKeyOf(rel) {
  return rel.replace(/\\/g, '/').replace(/\.md$/u, '').split('/').join(':');
}

/** The cells of one markdown table row, trimmed; null when the line is not a row. */
function cellsOf(line) {
  const text = line.trim();
  if (!text.startsWith('|')) return null;
  const inner = text.replace(/^\|/u, '').replace(/\|$/u, '');
  return inner.split('|').map((cell) => cell.trim());
}

/**
 * Parses the `## Requires` table of one reference's text.
 *
 * Returns `{ rows, errors }`: rows is null when the text has no `## Requires`
 * heading outside fenced code. Each row is `{ input, kind, when, sections,
 * file }`; `file` is false for a free-text input (no backticks), which the mod
 * ignores.
 */
export function parseRequires(text) {
  const lines = text.split(/\r?\n/u);
  const errors = [];
  let fence = null;
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const mark = /^\s*(```+|~~~+)/u.exec(line);
    if (mark) {
      const kind = mark[1].slice(0, 3);
      if (fence === null) fence = kind;
      else if (kind === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^##\s+Requires\s*$/u.test(line)) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return { rows: null, errors };
  const rows = [];
  let inTable = false;
  let sawSeparator = false;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^#{1,2}\s/u.test(line)) break;
    const cells = cellsOf(line);
    if (cells === null) {
      if (inTable) break;
      continue;
    }
    if (!inTable) {
      const header = cells.map((cell) => cell.toLowerCase());
      if (HEADER.some((name, at) => header[at] !== name)) {
        errors.push(`line ${index + 1}: the table header must be | Input | Kind | When | Sections |`);
        return { rows, errors };
      }
      inTable = true;
      continue;
    }
    if (!sawSeparator) {
      if (cells.every((cell) => /^:?-+:?$/u.test(cell))) {
        sawSeparator = true;
        continue;
      }
      errors.push(`line ${index + 1}: the header row needs a |---| separator`);
      return { rows, errors };
    }
    if (cells.length < 4) {
      errors.push(`line ${index + 1}: a row needs four cells`);
      continue;
    }
    const [inputCell, kindCell, whenCell, sectionsCell] = cells;
    const kind = kindCell.toLowerCase();
    if (!KINDS.includes(kind)) {
      errors.push(`line ${index + 1}: unknown Kind "${kindCell}" (artifact, procedure, writes)`);
      continue;
    }
    const code = /`([^`]+)`/u.exec(inputCell);
    const input = code ? code[1].trim() : inputCell;
    const sections = sectionsCell === '' ? [] : sectionsCell.split(';').map((name) => name.trim()).filter((name) => name !== '');
    rows.push({ input, kind, when: kind === 'writes' ? '' : whenCell.trim().toLowerCase(), sections: kind === 'writes' ? [] : sections, file: code !== null });
  }
  return { rows, errors };
}

/** Every `.md` under dir, relative, forward slashes, sorted. */
function markdownFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) found.push(...markdownFiles(abs, base));
    else if (name.endsWith('.md')) found.push(path.relative(base, abs).replace(/\\/g, '/'));
  }
  return found;
}

/** Every table in the reference tree: `{ entries, errors }`, entries sorted by reference. */
export function collectRequires(referenceDir) {
  const entries = [];
  const errors = [];
  if (!existsSync(referenceDir)) return { entries, errors };
  for (const rel of markdownFiles(referenceDir)) {
    if (path.posix.basename(rel).startsWith('_')) continue;
    const parsed = parseRequires(readFileSync(path.join(referenceDir, rel), 'utf8'));
    for (const error of parsed.errors) errors.push(`${rel}: ${error}`);
    if (parsed.rows === null) continue;
    const rows = parsed.rows.filter((row) => row.file).map(({ input, kind, when, sections }) => ({ input, kind, when, sections }));
    entries.push({ reference: rel, stage: stageKeyOf(rel), rows });
  }
  entries.sort((a, b) => (a.reference < b.reference ? -1 : a.reference > b.reference ? 1 : 0));
  return { entries, errors };
}

/** The module text for the entries: typed data, LF line ends. */
export function renderRequires(entries) {
  const body = entries.length === 0 ? '[]' : JSON.stringify(entries, null, 2);
  return [
    '// Generated by scripts/build-requires.mjs from the `## Requires` tables in',
    '// skills/wf/reference/. Do not edit: run `node scripts/build-requires.mjs`.',
    "import type { RequiresEntry } from './readledger.ts'",
    '',
    `export const REQUIRES: readonly RequiresEntry[] = ${body}`,
    '',
  ].join('\n');
}

/** Runs the build; returns the exit code. */
export function main(argv = process.argv.slice(2), log = console.log, warn = console.error) {
  const flag = (name) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const check = argv.includes('--check');
  const referenceDir = path.resolve(flag('--reference') ?? DEFAULT_REFERENCE);
  const out = path.resolve(flag('--out') ?? DEFAULT_OUT);
  const { entries, errors } = collectRequires(referenceDir);
  if (errors.length > 0) {
    for (const error of errors) warn(`build-requires: ${error}`);
    return 1;
  }
  const text = renderRequires(entries);
  if (check) {
    const current = existsSync(out) ? readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== text) {
      warn(`build-requires: ${path.relative(process.cwd(), out)} is out of date; run node scripts/build-requires.mjs`);
      return 1;
    }
    log(`build-requires: up to date (${entries.length} tables)`);
    return 0;
  }
  writeFileSync(out, text);
  log(`build-requires: wrote ${entries.length} tables to ${path.relative(process.cwd(), out)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
