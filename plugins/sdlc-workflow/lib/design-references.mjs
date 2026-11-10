// The references of a design: `.ai/design/references.json`.
//
// Each reference names a file that a design agent can read: a picture, a page, a document, or
// the export of a canvas or a web page. A link alone is not enough, because a sub-agent cannot
// open a canvas or a page behind a login, so a link must also name its exported file. The
// check runs before a design agent starts, and an unreadable reference stops the run.
//
// The design server shows each reference to everyone on the tailnet, so a reference is limited
// to what a reference is: a picture, a page or a document, in a folder that is not hidden. A
// dotfile, a file of `.git/` or of another hidden folder, and a file of another type (a config,
// a key, source code) is refused. `.ai/design/` is the one hidden folder that holds references.
// The real path counts: a link in the repo that leads out of it is refused.
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { KEY_RE, REFERENCES_FILE, SURFACE_REL, surfaceDir, withDesignLock, writeJson } from './design-surface.mjs';
import { agentFix, refuse } from './fix.mjs';

const KINDS = new Set(['image', 'page', 'document', 'canvas', 'screen', 'other']);
/** The file types of a reference. */
export const REFERENCE_TYPES = Object.freeze(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.html', '.htm', '.md', '.txt']);

/** The reference entries, as written. */
export function readReferences(root) {
  try {
    const j = JSON.parse(readFileSync(join(surfaceDir(root), REFERENCES_FILE), 'utf8'));
    return Array.isArray(j.references) ? j.references : [];
  } catch { return []; }
}

const outside = (rel) => !rel || rel.startsWith('..') || isAbsolute(rel);

/** Why one reference cannot be read, or null when it can. */
function problemOf(root, r) {
  if (!r || typeof r !== 'object') return 'the entry is not an object';
  if (!KEY_RE.test(String(r.key ?? ''))) return `the key ${r.key} is not kebab-case`;
  if (r.kind && !KINDS.has(r.kind)) return `the kind ${r.kind} is not one of ${[...KINDS].join(', ')}`;
  if (!r.file) return r.link ? 'a link alone cannot be read by a sub-agent: export it to a file and name the file' : 'the entry names no file';
  if (typeof r.file !== 'string' || r.file.includes('\0')) return 'the file is not a path';
  const abs = isAbsolute(r.file) ? r.file : resolve(root, r.file);
  const rel = relative(resolve(root), abs);
  // An absolute path is checked too: only one inside the repo passes.
  if (outside(rel)) return `the file ${r.file} is outside the repo`;
  const parts = rel.split(sep);
  const inSurface = `${parts.slice(0, 2).join('/')}` === SURFACE_REL;
  if ((inSurface ? parts.slice(2) : parts).some((p) => p.startsWith('.'))) return `the file ${r.file} is hidden or in a hidden folder: a reference is a file of .ai/design/ or of a folder that is not hidden`;
  if (!REFERENCE_TYPES.includes(extname(rel).toLowerCase())) return `the file ${r.file} is not a picture, a page or a document (${REFERENCE_TYPES.join(' ')})`;
  if (r.link && !/^https?:\/\//i.test(String(r.link))) return `the link ${r.link} is not an http or https address`;
  if (!existsSync(abs)) return `the file ${r.file} does not exist`;
  try {
    // A link in the repo can lead out of it: the place of the real file decides.
    if (outside(relative(realpathSync(resolve(root)), realpathSync(abs)))) return `the file ${r.file} is a link that leaves the repo`;
    const st = statSync(abs);
    if (!st.isFile()) return `${r.file} is not a file`;
    if (st.size === 0) return `${r.file} is empty`;
    readFileSync(abs).subarray(0, 1);
  } catch (e) { return `${r.file} cannot be read (${e.code ?? 'the read failed'})`; }
  return null;
}

/**
 * Add or change one reference. The file must be readable and inside the repo; a link alone is
 * refused, because a sub-agent cannot open it.
 */
export function addReference(root, { key, file = null, kind = 'other', link = null, note = null }) {
  const entry = { key, kind, file, ...(link ? { link } : {}), ...(note ? { note } : {}) };
  const problem = problemOf(root, entry);
  if (problem) throw refuse(problem, agentFix('Name a readable picture, page or document inside the repo, with a kebab-case key, then add the reference again.'));
  const path = join(surfaceDir(root), REFERENCES_FILE);
  withDesignLock(path, () => {
    const refs = readReferences(root).filter((r) => r?.key !== key);
    refs.push({ ...entry, file: String(file).replace(/\\/g, '/') });
    writeJson(path, { references: refs });
  });
  return entry;
}

/** Check every reference. Returns `{ ok, references: [{ ...entry, readable, problem }] }`. */
export function checkReferences(root) {
  const seen = new Set();
  const references = readReferences(root).map((r) => {
    let problem = problemOf(root, r);
    if (!problem && seen.has(r.key)) problem = `the key ${r.key} is used twice`;
    seen.add(r?.key);
    return { ...(r && typeof r === 'object' ? r : {}), readable: !problem, problem };
  });
  return { ok: references.every((r) => r.readable), references };
}
