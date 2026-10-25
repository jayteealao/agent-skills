// lib/roster-edit.mjs — edits of a slice roster.
//
// The slice stage owns the roster (03-slice.md). Two campaign commands add one field to
// it: `slice-order add` adds a `depends-on` edge, and `unit <ext> defer` names the unit of
// a slice. The text edits change the lines of one roster entry or one frontmatter key, so
// the rest of a Markdown file keeps its form, its comments, and its line ends. The record
// edits (rosterOf, setRosterEntry) read the roster in either layout and write it into the
// record layout.
import { readDoc, writeDoc } from './records.mjs';
import { parse as parseYaml, stringify } from './yaml.mjs';

export const ROSTER_DOC = '03-slice.md';

const FM = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---)/;

/** A value as one YAML flow line: `[a, b]`, `[]`, a plain or a quoted scalar. */
const flow = (v) => stringify(v, { flow: true });

const indentOf = (line) => /^ */.exec(line)[0].length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function split(text) {
  const m = FM.exec(text);
  if (!m) return null;
  const eol = m[2].includes('\r\n') ? '\r\n' : '\n';
  return { m, eol, lines: m[2].split(/\r?\n/) };
}

const join = (text, s, lines) => text.replace(s.m[0], () => `${s.m[1]}${lines.join(s.eol)}${s.m[3]}`);

/** The entries of the `slices:` list as { start, end, indent, flow, data }, or null. */
function entries(lines) {
  const at = lines.findIndex((l) => /^slices:\s*$/.test(l));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end]) || /^-/.test(lines[end]))) end++;
  const first = lines.slice(at + 1, end).find((l) => /^\s*- /.test(l));
  if (!first) return [];
  const indent = indentOf(first);
  const out = [];
  for (let i = at + 1; i < end; i++) {
    if (!(indentOf(lines[i]) === indent && lines[i].slice(indent).startsWith('- '))) continue;
    let j = i + 1;
    while (j < end && !(indentOf(lines[j]) === indent && lines[j].slice(indent).startsWith('- ')) && (indentOf(lines[j]) > indent || !lines[j].trim())) j++;
    while (j > i + 1 && !lines[j - 1].trim()) j--;
    const rest = lines[i].slice(indent + 2);
    let data = null;
    try {
      data = rest.trim().startsWith('{')
        ? parseYaml(rest)
        : parseYaml([' '.repeat(indent + 2) + rest, ...lines.slice(i + 1, j)].map((l) => l.slice(indent + 2)).join('\n'));
    } catch { data = null; }
    out.push({ start: i, end: j, indent, flow: rest.trim().startsWith('{'), data: data && typeof data === 'object' ? data : null });
  }
  return out;
}

/** One roster entry, from its fields. */
const rosterEntry = (d) => ({
  slug: String(d.slug ?? d.slice),
  status: d.status ?? null,
  dependsOn: (Array.isArray(d['depends-on']) ? d['depends-on'] : []).map(String),
  unit: d.unit ? String(d.unit) : null,
  source: d.source ? String(d.source) : null,
  extensionRound: Number.isFinite(Number(d['extension-round'])) ? Number(d['extension-round']) : null,
});
const isEntry = (d) => d && typeof d === 'object' && (d.slug || d.slice);

/** The roster of a 03-slice.md text: [{ slug, status, dependsOn, unit, source, extensionRound }]. */
export function rosterEntries(text) {
  const s = split(String(text ?? ''));
  if (!s) return [];
  return (entries(s.lines) ?? []).map((e) => e.data).filter(isEntry).map(rosterEntry);
}

/** The roster of a workflow folder, in either layout, as rosterEntries gives it; [] when it has none. */
export function rosterOf(dir) {
  const slices = readDoc(dir, ROSTER_DOC)?.frontmatter?.slices;
  return (Array.isArray(slices) ? slices : []).filter(isEntry).map(rosterEntry);
}

/**
 * Set `fields` on the roster entry `slug` of a workflow folder, and write the roster into
 * the record layout. Returns the new roster, or null when the roster has no such entry.
 */
export function setRosterEntry(dir, slug, fields) {
  const doc = readDoc(dir, ROSTER_DOC);
  const slices = doc?.frontmatter?.slices;
  if (!Array.isArray(slices)) return null;
  const at = slices.findIndex((d) => isEntry(d) && String(d.slug ?? d.slice) === slug);
  if (at < 0) return null;
  const next = slices.map((d, i) => (i === at ? { ...d, ...fields } : d));
  writeDoc(dir, ROSTER_DOC, { frontmatter: { ...doc.frontmatter, slices: next }, body: doc.body });
  return next.filter(isEntry).map(rosterEntry);
}

/**
 * Set `fields` on the roster entry `slug` of a 03-slice.md text. Returns the new text,
 * or null when the text has no such entry.
 */
export function editRosterEntry(text, slug, fields) {
  const s = split(String(text ?? ''));
  if (!s) return null;
  const e = (entries(s.lines) ?? []).find((x) => x.data && String(x.data.slug ?? x.data.slice) === slug);
  if (!e) return null;
  const lines = [...s.lines];
  if (e.flow) {
    lines[e.start] = `${' '.repeat(e.indent)}- ${flow({ ...e.data, ...fields })}`;
    return join(text, s, lines);
  }
  const keyIndent = e.indent + 2;
  let end = e.end;
  for (const [key, value] of Object.entries(fields)) {
    const head = new RegExp(`^ {${e.indent}}- ${esc(key)}:`);
    const body = new RegExp(`^ {${keyIndent}}${esc(key)}:`);
    let k = -1;
    for (let i = e.start; i < end; i++) if ((i === e.start && head.test(lines[i])) || (i > e.start && body.test(lines[i]))) { k = i; break; }
    if (k < 0) {
      lines.splice(end, 0, `${' '.repeat(keyIndent)}${key}: ${flow(value)}`);
      end++;
      continue;
    }
    const prefix = k === e.start ? `${' '.repeat(e.indent)}- ` : ' '.repeat(keyIndent);
    let c = k + 1;
    while (c < end && (indentOf(lines[c]) > keyIndent || (lines[c].trim().startsWith('- ') && indentOf(lines[c]) === keyIndent))) c++;
    lines.splice(k, c - k, `${prefix}${key}: ${flow(value)}`);
    end -= c - k - 1;
  }
  return join(text, s, lines);
}

/** Set one top-level frontmatter key (with its continuation lines) to `value`. Adds the key when it is absent. */
export function setFrontmatterValue(text, key, value) {
  const s = split(String(text ?? ''));
  if (!s) return null;
  const lines = [...s.lines];
  const k = lines.findIndex((l) => new RegExp(`^${esc(key)}:`).test(l));
  const line = `${key}: ${flow(value)}`;
  if (k < 0) {
    lines.push(line);
    return join(text, s, lines);
  }
  let c = k + 1;
  while (c < lines.length && lines[c].trim() && (/^\s/.test(lines[c]) || /^- /.test(lines[c]))) c++;
  lines.splice(k, c - k, line);
  return join(text, s, lines);
}

/** The value of one top-level frontmatter key, or undefined. */
export function frontmatterValue(text, key) {
  const m = FM.exec(String(text ?? ''));
  if (!m) return undefined;
  try { return (parseYaml(m[2]) ?? {})[key]; } catch { return undefined; }
}

/**
 * 4.4 step 1: the roster in topological order of `dependsOn`, with roster order as the
 * tie-break. A cycle, or a name outside the roster, keeps roster order for the slices
 * that are left. `slices` are [{ slug | slice, dependsOn }].
 */
export function rosterWalkOrder(slices) {
  const name = (s) => s.slice ?? s.slug;
  const names = new Set(slices.map(name));
  const placed = new Set();
  const out = [];
  let left = [...slices];
  while (left.length) {
    const next = left.find((s) => (s.dependsOn || []).every((d) => d === name(s) || !names.has(d) || placed.has(d)));
    if (!next) return [...out, ...left];
    out.push(next);
    placed.add(name(next));
    left = left.filter((s) => s !== next);
  }
  return out;
}

/** True when adding the edge `slice` after `after` closes a cycle in the roster. */
export function closesCycle(slices, slice, after) {
  const deps = new Map(slices.map((s) => [s.slug, new Set(s.dependsOn ?? [])]));
  if (!deps.has(slice) || !deps.has(after)) return false;
  // `after` must not depend, through any path, on `slice`.
  const seen = new Set();
  const stack = [after];
  while (stack.length) {
    const n = stack.pop();
    if (n === slice) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of deps.get(n) ?? []) stack.push(d);
  }
  return false;
}
