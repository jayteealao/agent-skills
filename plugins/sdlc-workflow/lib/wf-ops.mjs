// The record and decision operations that the CLI (scripts/wf.mjs) and the library
// (lib/wf-api.mjs) share. Each one returns data and prints nothing, so both doors keep the
// same rules: the record names, the enum check of the schema, and the settle of a question.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDecision } from './decisions.mjs';
import { PATH_FORMS, applySet, enumAt, parseSetArg } from './record-path.mjs';
import { INDEX_NAME, frontmatterOfDoc, listDocs, markSuperseded, readDoc, setFields } from './records.mjs';

const SCHEMA_FILE = fileURLToPath(new URL('../schemas/frontmatter.schema.json', import.meta.url));

export function schemaOf() {
  return JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
}

export function resolveRef(schema, node) {
  let n = node;
  while (n?.$ref) n = schema.$defs[n.$ref.split('/').pop()];
  return n ?? {};
}

/** The definition whose `type` property accepts the given artifact type. */
export function defOfType(schema, type) {
  for (const branch of (schema.allOf ?? []).flatMap((a) => a.oneOf ?? [])) {
    const def = resolveRef(schema, branch);
    const t = def.properties?.type;
    if (t?.const === type || t?.enum?.includes(type)) return def;
  }
  return null;
}

// An answer settles its question at once: its key leaves `open-questions` of the index.
// Only a stage rewrites the rest of the index, so without this the status shows the
// workflow as blocked until that stage runs again.
export function settleQuestion(dir, key) {
  if (!key) return false;
  const open = frontmatterOfDoc(dir, INDEX_NAME)?.['open-questions'];
  if (!Array.isArray(open)) return false;
  const kept = open.filter((q) => (q && typeof q === 'object' ? q.key ?? q.id : q) !== key);
  if (kept.length === open.length) return false;
  setFields(dir, INDEX_NAME, { 'open-questions': kept });
  return true;
}

// A stage that holds a question and continues with other work publishes it in `open-questions`
// of the index, so the watch and a look-in can name its exact key. A second hold of the same key
// replaces the entry. `settleQuestion` removes it when an answer with that key is recorded.
export function holdQuestion(dir, q) {
  if (!q?.key) throw new Error('decide hold: --key is required');
  if (!q.question) throw new Error('decide hold: --question is required');
  const fm = frontmatterOfDoc(dir, INDEX_NAME);
  if (!fm) throw new Error(`decide hold: the workflow has no ${INDEX_NAME}`);
  const open = Array.isArray(fm['open-questions']) ? fm['open-questions'] : [];
  const entry = {
    key: q.key, question: q.question, stage: q.stage ?? null,
    ...(q.slice && q.slice !== 'slug-wide' ? { slice: q.slice } : {}),
    ...(q.options?.length ? { options: q.options } : {}),
    ...(q.recommended ? { recommended: q.recommended } : {}),
    'held-at': q.heldAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  const kept = open.filter((x) => (x && typeof x === 'object' ? x.key ?? x.id : x) !== q.key);
  setFields(dir, INDEX_NAME, { 'open-questions': [...kept, entry] });
  return { entry, replaced: kept.length !== open.length };
}

// The short names of a record for `record get` and `record set`.
const RECORD_ALIASES = { index: INDEX_NAME, state: INDEX_NAME, meta: INDEX_NAME };
// A name without `.md` (`05-implement-api`) names the same record.
export const recordName = (n) => RECORD_ALIASES[n] ?? (/^\d{2}[a-z]?-[^.]+$/.test(n) ? `${n}.md` : n);
export const noRecord = (name, slug, dir) => `no record ${name} in ${slug}; its records are: ${listDocs(dir).join(', ') || 'none'}`;

/**
 * Apply the path forms of `record set` to one record (lib/record-path.mjs). A value outside the
 * enum of the schema is refused with the allowed values. Returns `{ frontmatter, keys }`.
 */
export function setRecordPaths(dir, name, args, { slug = basename(dir) } = {}) {
  const doc = readDoc(dir, name);
  if (!doc?.frontmatter) throw new Error(noRecord(name, slug, dir));
  const schema = schemaOf();
  const def = defOfType(schema, doc.frontmatter.type ?? (name === INDEX_NAME ? 'index' : null));
  const fm = structuredClone(doc.frontmatter);
  const changes = args.map((a) => (typeof a === 'string'
    ? parseSetArg(a, { onRepair: (k, v) => process.stderr.write(`wf.mjs: ${k} began with the Git install path, which Git Bash put in front of /wf; it is set to ${v}\n`) })
    : a));
  for (const c of changes) {
    const allowed = def && c.op === '=' && c.value !== null ? enumAt(def, c.path, (n) => resolveRef(schema, n)) : null;
    if (allowed && !allowed.includes(c.value)) {
      throw new Error(`record set: ${c.key}=${c.value} is not allowed; the values are: ${allowed.join(', ')}. The path forms are: ${PATH_FORMS}`);
    }
    applySet(fm, c);
  }
  const top = [...new Set(changes.map((c) => c.path[0].key))];
  const written = setFields(dir, name, Object.fromEntries(top.map((k) => [k, fm[k] ?? null])));
  return { frontmatter: written, keys: changes.map((c) => c.key) };
}

/** The frontmatter fields `keys` of a record; a missing field reads as null. */
export const pick = (fm, keys) => Object.fromEntries(keys.map((k) => [k, k.split('.').reduce((v, p) => (v == null ? undefined : v[p]), fm) ?? null]));

/**
 * Record one answer or decision as `decide add` does: the entry supersedes the older ones of
 * its key, the records that name them get a marker, and an answer settles its open question.
 * `a` is `{ kind, key, question, answer, by, packet, slice, files, stage, source, rewrote }`.
 */
export function decideAdd(dir, a, { by = null, stage = null } = {}) {
  const r = addDecision(dir, {
    kind: a.kind, key: a.key, question: a.question, answer: a.answer, by: a.by ?? by,
    scope: { packet: a.packet, slice: a.slice && a.slice !== 'slug-wide' ? a.slice : undefined, files: a.files },
    stage: a.stage ?? stage, source: a.source, rewrote: Array.isArray(a.rewrote) ? a.rewrote : [],
  });
  const marked = markSuperseded(dir, r.superseded, r.entry.id);
  return { ...r, marked, settled: r.entry.kind !== 'steer' && settleQuestion(dir, r.entry.key) };
}
