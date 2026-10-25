// The record layout of a workflow: YAML files that scripts write.
//
// A workflow folder holds these record files:
//
//   state.yaml         the hot fields of the workflow: stage, slice, branch, status, open
//                      questions, person tasks, next invocation, progress
//   meta.yaml          the cold fields: title, type, dates, branch strategy, base, PR, tags
//   intake.yaml        the brief of intake and its shape phase (01-*, 02-*)
//   design.yaml        the design brief, the craft contract and the design checks (02b, 02c, 07-design-*)
//   slices.yaml        the roster and the plan, implement and verify summaries of all slices
//   slice-<s>.yaml     one slice: the slice, plan, implement and verify sections
//   review.yaml        a review of the whole workflow; review-<s>.yaml a review of one slice,
//                      with one section for each review command
//   augment.yaml       the add-ons (04b, 04c, 05b-05z, 08b, 00-sync)
//   ship.yaml          the PR phase, the ship runs, the run log and the rollbacks (08, 09-*)
//   retro.yaml         the retro, the recap and the close record (10-*, 90-*, 99-*)
//
// A record file is { schema: sdlc/v2, type: record, file, slug, slice?, sections }. Each
// section is { name, frontmatter, body }: `name` is the file name of the old layout, so every
// reader and the redirect map can name a section by its old file. The frontmatter keeps the
// fields and the schema type of the old file.
//
// An agent does not write a record. It writes a draft (.draft/<old name>.md, Markdown with
// frontmatter), and `wf.mjs record put` checks the draft and writes its section.
//
// For one release, a reader reads the old layout too: readDoc gives the section when it
// exists, and else the old Markdown file. A file name of the old layout that has no place in
// this table stays a Markdown file.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { safeParseFrontmatter } from './frontmatter.mjs';
import { validateFrontmatter, formatValidationErrors } from './schema-validator.mjs';
import { parse, stringify } from './yaml.mjs';

export const RECORD_SCHEMA = 'sdlc/v2';
export const STATE_FILE = 'state.yaml';
export const META_FILE = 'meta.yaml';
export const DRAFT_DIR = '.draft';
export const OLD_DIR = '.old';
export const REDIRECTS_FILE = 'redirects.yaml';
export const INDEX_NAME = '00-index.md';

// The fields of the index that change at each stage. The rest of the index is cold.
export const HOT_FIELDS = new Set([
  'status', 'current-stage', 'stage-number', 'selected-slice', 'branch', 'open-questions', 'person-tasks',
  'next-command', 'next-invocation', 'recommended-next-invocation', 'progress', 'updated-at',
]);
// The sections of a slice file, in the order of the lifecycle.
const SLICE_STEMS = ['slice', 'plan', 'implement', 'verify'];
const SLICE_FILES = { '03': 'slice', '04': 'plan', '05': 'implement', '06': 'verify' };

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Every record file name of the layout, for the hooks: a script writes these, an agent does not. */
export const RECORD_FILE_RE = /^(state|meta|intake|design|slices|review|augment|ship|retro|redirects)\.yaml$|^(slice|review)-.+\.yaml$/;

/**
 * The place of a file name of the old layout: { file, section, slice } or null.
 * `slices` (the slice names of the roster) splits `07-review-<slice>-<command>.md`.
 */
export function locate(name, { slices = [] } = {}) {
  const n = basename(String(name ?? ''));
  if (n === INDEX_NAME) return { file: STATE_FILE, section: null, slice: null };
  const m = /^(\d{2})([a-z]?)-(.+)\.md$/.exec(n);
  if (!m) return null;
  const [, num, letter, rest] = m;
  if (num === '00' && rest === 'sync' && !letter) return { file: 'augment.yaml', section: 'sync', slice: null };
  if (num === '01' && !letter) return { file: 'intake.yaml', section: rest, slice: null };
  if (num === '02' && !letter) return { file: 'intake.yaml', section: rest, slice: null };
  if (num === '02') return { file: 'design.yaml', section: rest, slice: null };
  const stem = SLICE_FILES[num];
  if (stem && !letter) {
    if (rest === stem) return { file: 'slices.yaml', section: stem, slice: null };
    if (rest.startsWith(`${stem}-`)) {
      const slice = rest.slice(stem.length + 1);
      return { file: `slice-${slice}.yaml`, section: stem, slice };
    }
    return null;
  }
  if (num === '07' && !letter) {
    if (rest.startsWith('design-')) return { file: 'design.yaml', section: rest, slice: null };
    if (rest === 'review') return { file: 'review.yaml', section: 'review', slice: null };
    if (!rest.startsWith('review-')) return null;
    const tail = rest.slice('review-'.length);
    const known = [...slices].sort((a, b) => b.length - a.length).find((s) => tail === s || tail.startsWith(`${s}-`));
    if (known && tail !== known) return { file: `review-${known}.yaml`, section: tail.slice(known.length + 1), slice: known };
    return { file: `review-${tail}.yaml`, section: 'review', slice: tail };
  }
  if (letter && ['04', '05', '08'].includes(num)) return { file: 'augment.yaml', section: rest, slice: null };
  if ((num === '08' || num === '09') && !letter) return { file: 'ship.yaml', section: rest, slice: null };
  if (['10', '90', '99'].includes(num) && !letter) return { file: 'retro.yaml', section: rest, slice: null };
  return null;
}

/** The new place of an old path, as `<file>#<section>`, or null. The redirect map is made of these. */
export function redirectOf(name, opts) {
  const loc = locate(name, opts);
  if (!loc) return null;
  return loc.section ? `${loc.file}#${loc.section}` : `${STATE_FILE} + ${META_FILE}`;
}

// ---------------------------------------------------------------- files

function readYaml(file) {
  if (!existsSync(file)) return null;
  try { return parse(readFileSync(file, 'utf8')) ?? null; } catch { return null; }
}

function writeYaml(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, `${stringify(value)}\n`);
  renameSync(`${file}.tmp`, file);
}

const slicesOfDir = (dir) => {
  const roster = readDoc(dir, '03-slice.md')?.frontmatter?.slices;
  return (Array.isArray(roster) ? roster : []).map((s) => (typeof s === 'string' ? s : s?.slug)).filter(Boolean);
};

const stripKeys = (o, keys) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k)));

// ---------------------------------------------------------------- read

/** The index of a workflow as one frontmatter: state.yaml over meta.yaml, or the old 00-index.md. */
function readIndex(dir) {
  const state = readYaml(join(dir, STATE_FILE));
  const cold = readYaml(join(dir, META_FILE));
  if (state || cold) {
    const frontmatter = {
      ...stripKeys(cold, ['schema', 'type', 'body', 'index-type']),
      ...stripKeys(state, ['schema', 'type']),
      schema: 'sdlc/v1',
      type: cold?.['index-type'] ?? 'index',
    };
    return { frontmatter, body: cold?.body ?? '', layout: 'yaml', path: join(dir, STATE_FILE) };
  }
  return readOld(dir, INDEX_NAME);
}

function readOld(dir, name) {
  const path = join(dir, name);
  if (!existsSync(path)) return null;
  const parsed = safeParseFrontmatter(readFileSync(path, 'utf8'), { filePath: path });
  if (parsed.parseError) return { frontmatter: null, body: '', layout: 'md', path, parseError: parsed.parseError };
  return { frontmatter: parsed.data ?? {}, body: parsed.content ?? '', layout: 'md', path };
}

/**
 * One record, by its file name of the old layout: { frontmatter, body, layout, path }, or
 * null when neither layout has it. The new layout wins.
 */
export function readDoc(dir, name, opts = {}) {
  const n = basename(name);
  if (n === INDEX_NAME) return readIndex(dir);
  const loc = locate(n, { slices: opts.slices ?? (/^07-review-/.test(n) ? slicesOfDir(dir) : []) });
  if (loc) {
    const sec = readYaml(join(dir, loc.file))?.sections?.[loc.section];
    if (sec) return { frontmatter: sec.frontmatter ?? {}, body: sec.body ?? '', layout: 'yaml', path: join(dir, loc.file), section: loc.section };
  }
  return readOld(dir, n);
}

/** The frontmatter of one record, or null. */
export const frontmatterOfDoc = (dir, name, opts) => readDoc(dir, name, opts)?.frontmatter ?? null;

/** True when either layout has the record. */
export const hasDoc = (dir, name, opts) => readDoc(dir, name, opts) !== null;

/** The old-layout names of every record of a workflow, in either layout, sorted. */
export function listDocs(dir) {
  if (!existsSync(dir)) return [];
  const names = new Set();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    if (e.name === STATE_FILE || e.name === META_FILE) names.add(INDEX_NAME);
    else if (RECORD_FILE_RE.test(e.name) && e.name !== REDIRECTS_FILE) {
      for (const sec of Object.values(readYaml(join(dir, e.name))?.sections ?? {})) if (sec?.name) names.add(sec.name);
    } else if (/^\d{2}[a-z]?-.+\.md$/.test(e.name) || e.name === INDEX_NAME) names.add(e.name);
  }
  return [...names].sort();
}

// ---------------------------------------------------------------- write

function sectionOrder(file, sections) {
  if (!/^slice-/.test(file)) return sections;
  const keys = Object.keys(sections).sort((a, b) => {
    const ia = SLICE_STEMS.indexOf(a); const ib = SLICE_STEMS.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return Object.fromEntries(keys.map((k) => [k, sections[k]]));
}

function writeIndex(dir, frontmatter, body) {
  const slug = frontmatter.slug ?? basename(dir);
  const hot = {}; const cold = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (k === 'schema' || k === 'type') continue;
    (HOT_FIELDS.has(k) ? hot : cold)[k] = v;
  }
  writeYaml(join(dir, STATE_FILE), { schema: RECORD_SCHEMA, type: 'state', slug, ...stripKeys(hot, ['slug']) });
  const indexType = frontmatter.type && frontmatter.type !== 'index' ? { 'index-type': frontmatter.type } : {};
  writeYaml(join(dir, META_FILE), { schema: RECORD_SCHEMA, type: 'meta', ...indexType, ...cold, slug, ...(body && body.trim() ? { body } : {}) });
}

/** Write one record into the new layout, by its file name of the old layout. Returns its place. */
export function writeDoc(dir, name, { frontmatter, body = '' }, opts = {}) {
  const n = basename(name);
  // A body ends with one newline: trailing blank lines carry nothing, and the YAML of the
  // last block of a file would not keep them.
  const text = String(body ?? '').replace(/\r\n/g, '\n').replace(/\n{2,}$/, '\n');
  if (n === INDEX_NAME) { writeIndex(dir, frontmatter ?? {}, text); return { file: STATE_FILE, section: null }; }
  const loc = locate(n, { slices: opts.slices ?? (/^07-review-/.test(n) ? slicesOfDir(dir) : []) });
  if (!loc) throw new Error(`${n} has no place in the record layout`);
  const file = join(dir, loc.file);
  const doc = readYaml(file) ?? {};
  const sections = { ...(doc.sections ?? {}), [loc.section]: { name: n, frontmatter: frontmatter ?? {}, body: text } };
  writeYaml(file, {
    schema: RECORD_SCHEMA,
    type: 'record',
    file: loc.file.replace(/\.yaml$/, ''),
    slug: frontmatter?.slug ?? doc.slug ?? basename(dir),
    ...(loc.slice ? { slice: loc.slice } : {}),
    sections: sectionOrder(loc.file, sections),
  });
  return loc;
}

/** Merge field changes into one record, in the new layout. A null value deletes the field. */
export function setFields(dir, name, changes, { now = nowIso(), opts } = {}) {
  const doc = readDoc(dir, name, opts);
  if (!doc || !doc.frontmatter) throw new Error(`no record ${name} in ${dir}`);
  const fm = { ...doc.frontmatter };
  for (const [k, v] of Object.entries(changes)) { if (v === null) delete fm[k]; else fm[k] = v; }
  if (!Object.hasOwn(changes, 'updated-at') && Object.hasOwn(fm, 'updated-at')) fm['updated-at'] = now;
  writeDoc(dir, name, { frontmatter: fm, body: doc.body }, opts);
  return fm;
}

// ---------------------------------------------------------------- drafts

/** The draft path of a record. */
export const draftPath = (dir, name) => join(dir, DRAFT_DIR, basename(name));

/**
 * Check a draft and write it into its section, then delete the draft. Returns
 * { name, file, section, errors }. A draft with errors stays, and nothing is written.
 */
export function putDraft(dir, path) {
  const name = basename(path);
  const errors = [];
  if (!locate(name) && name !== INDEX_NAME) errors.push(`${name} has no place in the record layout`);
  const text = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (text === null) errors.push(`no draft ${path}`);
  const parsed = text === null ? null : safeParseFrontmatter(text, { filePath: path });
  if (parsed?.parseError) errors.push(`frontmatter: ${parsed.parseError}`);
  const fm = parsed?.data ?? null;
  if (parsed && !parsed.parseError && (!fm || !Object.keys(fm).length)) errors.push('the draft has no frontmatter');
  if (fm && Object.keys(fm).length) {
    if (fm.slug && fm.slug !== basename(dir)) errors.push(`slug ${fm.slug} is not the workflow folder ${basename(dir)}`);
    const v = validateFrontmatter(fm);
    if (!v.valid) errors.push(formatValidationErrors(v.errors));
  }
  if (errors.length) return { name, file: null, section: null, errors };
  const loc = writeDoc(dir, name, { frontmatter: fm, body: parsed.content });
  rmSync(path, { force: true });
  return { name, file: loc.file, section: loc.section, errors: [] };
}

/** Every draft of a workflow, oldest name first: the index last, so it sees the stage records. */
export function draftsOf(dir) {
  const d = join(dir, DRAFT_DIR);
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith('.md'))
    .sort((a, b) => (a === INDEX_NAME) - (b === INDEX_NAME) || a.localeCompare(b))
    .map((f) => join(d, f));
}

// ---------------------------------------------------------------- migration

/**
 * Move a workflow of the old layout into the new one. Each old record is written into its
 * section and moved to .old/; redirects.yaml maps each old path to its new place. A record
 * whose section exists already is moved only.
 */
export function migrateWorkflow(dir, { now = nowIso() } = {}) {
  const slices = slicesOfDir(dir);
  const moved = [];
  const kept = [];
  const old = readdirSync(dir).filter((f) => /^\d{2}[a-z]?-.+\.md$/.test(f)).sort((a, b) => (a === INDEX_NAME) - (b === INDEX_NAME) || a.localeCompare(b));
  for (const name of old) {
    const loc = locate(name, { slices });
    if (!loc) { kept.push(name); continue; }
    const doc = readOld(dir, name);
    if (!doc?.frontmatter) { kept.push(name); continue; }
    const sec = loc.section ? readYaml(join(dir, loc.file))?.sections?.[loc.section] : null;
    const hasNew = loc.section ? !!sec : existsSync(join(dir, STATE_FILE));
    if (!hasNew) writeDoc(dir, name, doc, { slices });
    mkdirSync(join(dir, OLD_DIR), { recursive: true });
    renameSync(join(dir, name), join(dir, OLD_DIR, name));
    moved.push({ from: name, to: redirectOf(name, { slices }) });
  }
  if (moved.length) {
    const prior = readYaml(join(dir, REDIRECTS_FILE))?.redirects ?? [];
    const seen = new Set(moved.map((m) => m.from));
    writeYaml(join(dir, REDIRECTS_FILE), {
      schema: RECORD_SCHEMA, type: 'redirects', slug: basename(dir), 'migrated-at': now,
      redirects: [...prior.filter((r) => !seen.has(r.from)), ...moved],
    });
  }
  return { moved, kept };
}
