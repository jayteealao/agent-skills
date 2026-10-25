// The references of a design: `.ai/design/references.json`.
//
// Each reference names a file that a design agent can read: a picture, a page, a document, or
// the export of a canvas or a web page. A link alone is not enough, because a sub-agent cannot
// open a canvas or a page behind a login, so a link must also name its exported file. The
// check runs before a design agent starts, and an unreadable reference stops the run.
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { KEY_RE, REFERENCES_FILE, surfaceDir } from './design-surface.mjs';

const KINDS = new Set(['image', 'page', 'document', 'canvas', 'screen', 'other']);

/** The reference entries, as written. */
export function readReferences(root) {
  try {
    const j = JSON.parse(readFileSync(join(surfaceDir(root), REFERENCES_FILE), 'utf8'));
    return Array.isArray(j.references) ? j.references : [];
  } catch { return []; }
}

/** Why one reference cannot be read, or null when it can. */
function problemOf(root, r) {
  if (!r || typeof r !== 'object') return 'the entry is not an object';
  if (!KEY_RE.test(String(r.key ?? ''))) return `the key ${r.key} is not kebab-case`;
  if (r.kind && !KINDS.has(r.kind)) return `the kind ${r.kind} is not one of ${[...KINDS].join(', ')}`;
  if (!r.file) return r.link ? 'a link alone cannot be read by a sub-agent: export it to a file and name the file' : 'the entry names no file';
  const abs = isAbsolute(r.file) ? r.file : resolve(root, r.file);
  const rel = relative(resolve(root), abs);
  if (!isAbsolute(r.file) && (rel.startsWith('..') || isAbsolute(rel))) return `the file ${r.file} is outside the repo`;
  if (!existsSync(abs)) return `the file ${r.file} does not exist`;
  try {
    const st = statSync(abs);
    if (!st.isFile()) return `${r.file} is not a file`;
    if (st.size === 0) return `${r.file} is empty`;
    readFileSync(abs).subarray(0, 1);
  } catch (e) { return `${r.file} cannot be read: ${e.message}`; }
  return null;
}

/**
 * Add or change one reference. The file must be readable and inside the repo; a link alone is
 * refused, because a sub-agent cannot open it.
 */
export function addReference(root, { key, file = null, kind = 'other', link = null, note = null }) {
  const entry = { key, kind, file, ...(link ? { link } : {}), ...(note ? { note } : {}) };
  const problem = problemOf(root, entry);
  if (problem) throw new Error(problem);
  const refs = readReferences(root).filter((r) => r?.key !== key);
  refs.push({ ...entry, file: String(file).replace(/\\/g, '/') });
  const path = join(surfaceDir(root), REFERENCES_FILE);
  writeFileSync(`${path}.tmp`, `${JSON.stringify({ references: refs }, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return entry;
}

/** Check every reference. Returns `{ ok, references: [{ ...entry, readable, problem }] }`. */
export function checkReferences(root) {
  const seen = new Set();
  const references = readReferences(root).map((r) => {
    let problem = problemOf(root, r);
    if (!problem && seen.has(r.key)) problem = `the key ${r.key} is used twice`;
    seen.add(r?.key);
    return { ...r, readable: !problem, problem };
  });
  return { ok: references.every((r) => r.readable), references };
}
