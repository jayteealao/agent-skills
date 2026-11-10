// The inputs of one stage run, in one call: `wf.mjs requires`.
//
// It reads the `## Requires` table of a stage reference (lib/requires-tables.mjs) and resolves
// each row for one workflow, by the rules of skills/wf/reference/_requires.md:
//   - an `artifact` row gives its content: a record through the record access (lib/records.mjs),
//     a file of the workflow folder or of the project by its path, only the named sections when
//     the row names some;
//   - a `procedure` row gives the path of its reference file, and `read` says whether the agent
//     must read it for this run;
//   - `if-present`, `on-resume` and `mode:<name>` rows apply by the Modes and the disk facts;
//   - a missing input is listed, and `stop` says when it stops the stage.
// Over the size limit, the largest artifacts come back as their outline and the command that
// reads each part, so the agent reads only what it needs.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { reviewScopeOf } from './lifecycle-done.mjs';

import { safeParseFrontmatter } from './frontmatter.mjs';
import { INDEX_NAME, docText, listDocs, outlineOf, readDoc, sectionText, sectionsOf } from './records.mjs';
import { workflowDir, workflowsRoot } from './records-root.mjs';
import { parseRequires, stageKeyOf } from './requires-tables.mjs';
import { agentFix, personFix } from './fix.mjs';

/** The total size of the content that one call returns whole, in bytes. */
export const REQUIRES_MAX_BYTES = 60 * 1024;

const bytes = (s) => Buffer.byteLength(String(s ?? ''), 'utf8');
const RECORD_NAME = /^\d{2}[a-z]?-[^/]+\.md$/;
const CHANGE_TYPES = new Set(['fix', 'hotfix', 'refactor']);

/** The reference file of a stage or an intake mode: `plan`, `plan.md`, `intake:fix`, `intake/fix`, `fix`, `augment:profile`. Null when none has a table. */
export function referenceOf(referenceDir, stage) {
  const s = String(stage ?? '').replace(/\\/g, '/').replace(/:/g, '/').replace(/\.md$/, '').replace(/^\/+/, '');
  if (!s || s.split('/').some((p) => p === '..' || p.startsWith('_'))) return null;
  for (const rel of [`${s}.md`, `intake/${s}.md`, `augment/${s}.md`]) {
    const file = join(referenceDir, rel);
    if (existsSync(file) && parseRequires(readFileSync(file, 'utf8')).rows !== null) return rel;
  }
  return null;
}

const globRe = (pattern) => new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);

/** The text of a record or a file that the content of a disk fact is read from, or ''. */
function textOf(dir, name) {
  const doc = RECORD_NAME.test(name) || name === INDEX_NAME ? readDoc(dir, name) : null;
  if (doc) return docText(doc);
  try { return readFileSync(join(dir, name), 'utf8'); } catch { return ''; }
}

/** The modes whose disk fact is true for a workflow (_requires.md, Modes). */
export function diskModes(dir, { index = {}, slice = null, writes = [] } = {}) {
  const modes = new Set();
  const deferrals = Array.isArray(index['runtime-evidence-deferrals']) ? index['runtime-evidence-deferrals'] : [];
  if (deferrals.some((d) => d && typeof d === 'object' && d['cleared-by'] == null)) modes.add('deferral');
  const observable = /observable:\s*true|kind:\s*user-observable/;
  if ([slice ? `03-slice-${slice}.md` : null, ...writes].filter(Boolean).some((n) => observable.test(textOf(dir, n)))) modes.add('user-observable');
  const design = readDoc(dir, '02b-design.md') !== null;
  const craft = readDoc(dir, '02c-craft.md') !== null;
  if (design || craft) modes.add('design');
  const augments = index.augmentations;
  if (craft || (Array.isArray(augments) ? augments.length : augments && typeof augments === 'object' ? Object.keys(augments).length : 0)) modes.add('augment');
  if (index['origin-packet']) modes.add('packet');
  if (reviewScopeOf(index, dir) === 'slug-wide') modes.add('slug-wide');
  if (CHANGE_TYPES.has(String(index['workflow-type'] ?? ''))) modes.add('change');
  return modes;
}

/** Where an artifact input lives: { base, rel, record } — a record of the workflow, or a file under `base`. */
function placeOf(projectRoot, dir, input) {
  if (input.startsWith('/.ai/workflows/')) return { base: workflowsRoot(projectRoot), rel: input.slice('/.ai/workflows/'.length), record: false };
  if (input.startsWith('/.ai/')) return { base: join(projectRoot, '.ai'), rel: input.slice('/.ai/'.length), record: false };
  return { base: dir, rel: input, record: RECORD_NAME.test(input) || input === INDEX_NAME };
}

/** The names that an input fits: a record name, or a path under `base`. */
function namesOf(place, dir) {
  if (!place.rel.includes('*')) {
    if (place.record) return readDoc(dir, place.rel) ? [place.rel] : [];
    const file = join(place.base, place.rel);
    return existsSync(file) && statSync(file).isFile() ? [place.rel] : [];
  }
  const re = globRe(place.rel);
  if (place.record) return listDocs(dir).filter((n) => re.test(n));
  const folder = posix.dirname(place.rel);
  const abs = join(place.base, folder === '.' ? '' : folder);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) return [];
  return readdirSync(abs, { withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => (folder === '.' ? e.name : `${folder}/${e.name}`)).filter((n) => re.test(n)).sort();
}

/** The `##` headings and their sizes of a text, for the outline of a file. */
function textOutline(text) {
  const { lines, sections } = sectionsOf(text);
  return { bytes: bytes(text), sections: sections.map((s) => ({ heading: s.heading, bytes: bytes(lines.slice(s.start, s.end).join('\n')) })) };
}

/** One artifact, read: its content, or only its named sections, with what it could not find. */
function readArtifact(place, dir, name, sections) {
  if (place.record) {
    const doc = readDoc(dir, name);
    const path = doc.path;
    if (!sections.length) return { path, content: docText(doc), outline: () => { const o = outlineOf(doc); return { bytes: o.bytes, sections: o.sections }; } };
    const parts = [];
    const absent = [];
    for (const h of sections) {
      try { parts.push(`## ${h}\n\n${sectionText(doc.body ?? '', h)}`); } catch { absent.push(h); }
    }
    return { path, content: parts.join('\n'), absent, outline: () => { const o = outlineOf(doc); return { bytes: o.bytes, sections: o.sections }; } };
  }
  const path = join(place.base, name);
  const text = readFileSync(path, 'utf8');
  if (!sections.length || !/\.md$/.test(name)) return { path, content: text, outline: () => textOutline(text) };
  const body = safeParseFrontmatter(text).content ?? text;
  const parts = [];
  const absent = [];
  for (const h of sections) {
    try { parts.push(`## ${h}\n\n${sectionText(body, h)}`); } catch { absent.push(h); }
  }
  return { path, content: parts.join('\n'), absent, outline: () => textOutline(text) };
}

const quote = (s) => (/^[A-Za-z0-9#._/:\\=,+-]+$/.test(String(s)) ? String(s) : `"${String(s).replace(/"/g, '\\"')}"`);

/**
 * Resolve the Requires table of a stage for one workflow.
 *
 * `stage` names the reference (see referenceOf); `modes` are the modes of this run that the
 * caller knows (a command argument, `triage`); `resume` says that the run resumes a stage run.
 * Returns { ok, reference, stage, slug, slice, modes, resume, artifacts, procedures, missing,
 * skipped, notes, guard, stop }. `ok` is false only when the call itself is wrong.
 */
export function resolveRequires({ projectRoot, referenceDir, slug, stage, modes = [], slice = null, resume = false, maxBytes = REQUIRES_MAX_BYTES }) {
  const rel = referenceOf(referenceDir, stage);
  if (!rel) return { ok: false, error: `no stage reference with a ## Requires table for ${stage}`, fix: agentFix('Run requires again with the name of a stage whose reference has a ## Requires table, such as plan or implement.') };
  const dir = workflowDir(projectRoot, slug);
  if (!existsSync(dir)) return { ok: false, error: `no workflow folder ${dir}`, fix: agentFix('List the workflows with status, then run requires again with a slug that it names.', 'wf.mjs status <root>') };
  const { rows, errors } = parseRequires(readFileSync(join(referenceDir, rel), 'utf8'));
  if (errors.length) return { ok: false, error: `${rel}: the Requires table does not parse: ${errors.join('; ')}`, fix: personFix(`Report this error: the Requires table of ${rel} does not parse, which is a defect of the plugin.`) };
  const index = readDoc(dir, INDEX_NAME)?.frontmatter ?? {};
  const key = stageKeyOf(rel);
  const sliceName = slice && slice !== 'slug-wide' ? slice : index['selected-slice'] ?? null;
  const intakeMode = key.startsWith('intake:') ? key.slice('intake:'.length) : null;
  const modeName = intakeMode ?? (index['workflow-type'] ? String(index['workflow-type']) : null);
  const fill = (input) => {
    let out = input;
    if (out.includes('<slice>')) { if (!sliceName) return { input: out, unresolved: 'no slice: pass --slice <slice>' }; out = out.replace(/<slice>/g, sliceName); }
    if (out.includes('<mode>')) { if (!modeName) return { input: out, unresolved: 'no mode: the index has no workflow-type' }; out = out.replace(/<mode>/g, modeName); }
    return { input: out };
  };

  // The stage artifact of this table: its `modes:` list and its status say which modes apply
  // and whether this run resumes.
  const writes = rows.filter((r) => r.kind === 'writes' && r.file).map((r) => fill(r.input)).filter((w) => !w.unresolved).map((w) => w.input);
  const written = writes.flatMap((w) => namesOf(placeOf(projectRoot, dir, w), dir).map((n) => ({ w, n })));
  const applied = new Map(modes.map((m) => [m, 'argument']));
  for (const { n } of written) {
    const fm = RECORD_NAME.test(n) ? readDoc(dir, n)?.frontmatter : null;
    for (const m of Array.isArray(fm?.modes) ? fm.modes : []) if (!applied.has(String(m))) applied.set(String(m), 'frontmatter');
  }
  for (const m of diskModes(dir, { index, slice: sliceName, writes: written.map((x) => x.n).filter((n) => RECORD_NAME.test(n)) })) if (!applied.has(m)) applied.set(m, 'disk');
  const open = written.find(({ n }) => {
    const st = RECORD_NAME.test(n) ? readDoc(dir, n)?.frontmatter?.status : null;
    return st != null && !['complete', 'completed', 'closed', 'done'].includes(String(st));
  });
  const resumes = Boolean(resume) || Boolean(open);

  const applies = (when) => when === 'always' || when === 'if-present' || (when === 'on-resume' && resumes) || (when.startsWith('mode:') && applied.has(when.slice(5)));
  const artifacts = [];
  const procedures = [];
  const missing = [];
  const skipped = [];
  const notes = [];
  for (const row of rows) {
    if (row.kind === 'writes') continue;
    if (!row.file) { notes.push(`free-text input (no file): ${row.input}`); continue; }
    if (row.kind === 'procedure') {
      const need = applies(row.when) && row.when !== 'if-present';
      const path = join(referenceDir, row.input);
      if (!existsSync(path)) { missing.push({ input: row.input, kind: 'procedure', when: row.when, stop: need, reason: 'the reference file does not exist' }); continue; }
      procedures.push({ input: row.input, path, when: row.when, read: need, ...(row.sections.length ? { sections: row.sections } : {}) });
      continue;
    }
    if (!applies(row.when)) { skipped.push({ input: row.input, when: row.when }); continue; }
    // A required input is mandatory to exist: an `always` row, and an `on-resume` row of a resumed run.
    const required = row.when === 'always' || row.when === 'on-resume';
    const filled = fill(row.input);
    if (filled.unresolved) { missing.push({ input: row.input, kind: 'artifact', when: row.when, stop: required, reason: filled.unresolved }); continue; }
    const place = placeOf(projectRoot, dir, filled.input);
    const names = namesOf(place, dir);
    if (!names.length) {
      if (row.when !== 'if-present' && !row.when.startsWith('mode:')) missing.push({ input: filled.input, kind: 'artifact', when: row.when, stop: required, reason: 'not on disk' });
      else skipped.push({ input: filled.input, when: row.when, absent: true });
      continue;
    }
    for (const name of names) {
      const r = readArtifact(place, dir, name, row.sections);
      const entry = { input: filled.input, name, record: place.record, when: row.when, ...(row.sections.length ? { sections: row.sections } : {}), path: r.path, bytes: bytes(r.content), content: r.content };
      if (r.absent?.length) {
        entry.absentSections = r.absent;
        missing.push({ input: `${name} ## ${r.absent.join('; ## ')}`, kind: 'section', when: row.when, stop: false, reason: 'the named section is not in the file' });
      }
      Object.defineProperty(entry, 'outlineOf', { value: r.outline, enumerable: false });
      artifacts.push(entry);
    }
  }

  // The size guard: the largest artifacts become their outline until the rest fits.
  const total = artifacts.reduce((n, a) => n + a.bytes, 0);
  const outlined = [];
  let kept = total;
  for (const a of [...artifacts].sort((x, y) => y.bytes - x.bytes)) {
    if (kept <= maxBytes) break;
    kept -= a.bytes;
    a.outline = a.outlineOf();
    a.read = a.record
      ? `wf.mjs record get ${quote(projectRoot)} ${slug} ${a.name} --section "<heading>"${a.sections?.length ? '' : ' (or --full)'}`
      : `read ${a.path} with the file-read tool`;
    delete a.content;
    outlined.push(a.name);
  }
  const guard = { maxBytes, totalBytes: total, returnedBytes: kept, outlined };
  if (outlined.length) notes.push(`over ${Math.round(maxBytes / 1024)} KB: ${outlined.join(', ')} came back as an outline; read each part you need with its read command`);

  return {
    ok: true,
    reference: rel,
    stage: key,
    slug,
    slice: sliceName,
    modes: [...applied].map(([name, from]) => ({ name, from })),
    resume: { applies: resumes, from: resume ? 'argument' : open ? `${open.n} is ${readDoc(dir, open.n)?.frontmatter?.status}` : null },
    artifacts,
    procedures,
    missing,
    skipped,
    notes,
    guard,
    stop: missing.some((m) => m.stop),
  };
}
