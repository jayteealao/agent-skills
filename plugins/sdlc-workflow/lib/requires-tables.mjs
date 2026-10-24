// lib/requires-tables.mjs — reads the `## Requires` tables of the stage references.
//
// Each stage reference that writes a stage artifact names, in one table, every
// input its writer must read and every procedure file it must load. The tests
// and scripts/measure-artifacts.mjs read the tables through this module. A
// malformed table (an unknown Kind, a missing column) is an error. Files whose
// name starts with `_` are sub-procedures and never carry a table.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

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
 * file }`; `file` is false for a free-text input (no backticks).
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
