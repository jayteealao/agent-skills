// The decision store of a workflow: .ai/workflows/<slug>/decisions.yaml.
//
// One keyed list holds every answer, standing steer, approval, try-out verdict and delegated
// choice. An entry is live until a later entry supersedes it. A later entry with the same key
// and the same scope supersedes the earlier one, so a question is asked once and a reversal is
// one more entry. A brief takes only the live entries in its scope.
//
//   id             D-001, D-002, ... in the order of writing
//   at             the time of writing (ISO 8601, seconds)
//   kind           answer | steer | approval | try-out | delegate
//   key            a stable question key, or null for a free steer
//   question       the question as asked, or null
//   answer         the answer, exact
//   by             person | policy | delegate
//   scope          { packet, slice, files } — an absent field means every packet, slice or file
//   stage          the stage that asked, or null
//   source         where the entry came from (a stage, or the file an import read)
//   rewrote        the records that the answer changed, for an answer that changes the build
//   superseded-by  the id of the entry that replaced this one, or null
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse, stringify } from './yaml.mjs';

export const DECISIONS_FILE = 'decisions.yaml';
export const KINDS = ['answer', 'steer', 'approval', 'try-out', 'delegate'];
export const BY = ['person', 'policy', 'delegate'];
export const LEGACY_ANSWERS = 'po-answers.md';
export const LEGACY_STEER = 'steer.md';

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const idOf = (n) => `D-${String(n).padStart(3, '0')}`;
const norm = (p) => String(p).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');

/** Read the store. A missing file is an empty store. */
export function readDecisions(slugDir) {
  const file = join(slugDir, DECISIONS_FILE);
  if (!existsSync(file)) return [];
  const doc = parse(readFileSync(file, 'utf8')) ?? {};
  return Array.isArray(doc.decisions) ? doc.decisions : [];
}

/** Write the store whole, through a temporary file. */
export function writeDecisions(slugDir, list) {
  const file = join(slugDir, DECISIONS_FILE);
  const text = `${stringify({ schema: 'sdlc/v1', type: 'decisions', decisions: list })}\n`;
  writeFileSync(`${file}.tmp`, text);
  renameSync(`${file}.tmp`, file);
}

function cleanScope(scope = {}) {
  const s = {};
  if (scope.packet) s.packet = String(scope.packet);
  if (scope.slice) s.slice = String(scope.slice);
  const files = (Array.isArray(scope.files) ? scope.files : String(scope.files ?? '').split(','))
    .map((f) => f.trim()).filter(Boolean).map(norm).sort();
  if (files.length) s.files = files;
  return s;
}

const sameScope = (a = {}, b = {}) => JSON.stringify(cleanScope(a)) === JSON.stringify(cleanScope(b));

// A file in an entry scope covers itself and, as a folder, everything under it.
const covers = (entryFile, file) => file === entryFile || file.startsWith(`${entryFile}/`) || entryFile.startsWith(`${file}/`);

/**
 * True when an entry applies to a query scope. Each field of the entry scope must agree with
 * the same field of the query; a field that the query does not give does not narrow it.
 */
export function inScope(entry, query = {}) {
  const s = cleanScope(entry.scope);
  const q = cleanScope(query);
  if (s.packet && q.packet && s.packet !== q.packet) return false;
  if (s.slice && q.slice && s.slice !== q.slice) return false;
  if (s.files && q.files && !s.files.some((f) => q.files.some((g) => covers(f, g)))) return false;
  return true;
}

export const isLive = (e) => !e['superseded-by'];

/** The live entries in a scope, in the order of writing. */
export function liveDecisions(list, query = {}, { by = null, kind = null } = {}) {
  return list.filter((e) => isLive(e) && inScope(e, query)
    && (!by || e.by === by) && (!kind || e.kind === kind));
}

/** The live entry that answers a question key in a scope, or null. */
export function answeredBy(list, key, query = {}) {
  if (!key) return null;
  const hits = liveDecisions(list, query).filter((e) => e.key === key);
  return hits.length ? hits[hits.length - 1] : null;
}

/** Drop the questions that a live entry already answers. Returns { ask, answered }. */
export function dropAnswered(list, questions, query = {}) {
  const ask = [];
  const answered = [];
  for (const q of questions) {
    const hit = answeredBy(list, q.key, { ...query, ...(q.scope ?? {}) });
    if (hit) answered.push({ ...q, decision: hit.id, answer: hit.answer });
    else ask.push(q);
  }
  return { ask, answered };
}

/**
 * Add an entry. A live entry with the same key and the same scope is superseded by the new one.
 * Returns { entry, superseded } and writes the store.
 */
export function addDecision(slugDir, input, { now = nowIso() } = {}) {
  const list = readDecisions(slugDir);
  const kind = input.kind ?? 'answer';
  const by = input.by ?? 'person';
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of ${KINDS.join(', ')}`);
  if (!BY.includes(by)) throw new Error(`by must be one of ${BY.join(', ')}`);
  if (input.answer == null || String(input.answer).trim() === '') throw new Error('an answer is required');
  if (kind !== 'steer' && !input.key) throw new Error(`a ${kind} needs a key`);
  const max = list.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^D-/, '')) || 0), 0);
  const entry = {
    id: idOf(max + 1),
    at: now,
    kind,
    key: input.key ?? null,
    question: input.question ?? null,
    answer: String(input.answer),
    by,
    scope: cleanScope(input.scope),
    stage: input.stage ?? null,
    source: input.source ?? input.stage ?? null,
    rewrote: Array.isArray(input.rewrote) ? input.rewrote.map(norm) : [],
    'superseded-by': null,
  };
  const superseded = [];
  if (entry.key) {
    for (const e of list) {
      if (isLive(e) && e.key === entry.key && sameScope(e.scope, entry.scope)) {
        e['superseded-by'] = entry.id;
        superseded.push(e.id);
      }
    }
  }
  list.push(entry);
  writeDecisions(slugDir, list);
  return { entry, superseded };
}

// ---------------------------------------------------------------- import

/** Read the entries of a po-answers.md log: `## <at> — <stage>`, then **Q:** and **A:** lines. */
export function parseLegacyAnswers(text) {
  const rows = [];
  const parts = String(text).split(/^## /m).slice(1);
  for (const part of parts) {
    const [head, ...body] = part.split(/\r?\n/);
    const m = /^(\S+)\s+[—–-]+\s+(.+?)\s*$/.exec(head.trim());
    const rest = body.join('\n');
    const q = /\*\*Q:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]+:\*\*|$)/.exec(rest);
    const a = /\*\*A:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]+:\*\*|$)/.exec(rest);
    if (!a || !a[1].trim()) continue;
    rows.push({ at: m ? m[1] : null, stage: m ? m[2] : null, question: q ? q[1].trim() : null, answer: a[1].trim() });
  }
  return rows;
}

/** Read the bullets of a steer.md file. A bullet that runs over lines is one entry. */
export function parseLegacySteer(text) {
  const rows = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    if (b) { if (cur) rows.push(cur); cur = b[1].trim(); continue; }
    if (cur !== null && line.trim() && /^\s+/.test(line)) cur += ` ${line.trim()}`;
    else if (cur !== null) { rows.push(cur); cur = null; }
  }
  if (cur) rows.push(cur);
  return rows.filter(Boolean);
}

const slugKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'answer';

/**
 * Import po-answers.md and steer.md into the store. An entry that the store already holds
 * (the same source and the same answer) is not added again, so an import can run twice.
 * The old files stay; the caller deletes them. Returns { added, skipped }.
 */
export function importLegacy(slugDir, { now = nowIso() } = {}) {
  const have = new Set(readDecisions(slugDir).map((e) => `${e.source}\u0000${e.answer}`));
  let added = 0;
  let skipped = 0;
  const add = (input) => {
    if (have.has(`${input.source}\u0000${input.answer}`)) { skipped += 1; return; }
    const { entry } = addDecision(slugDir, input, { now: input.at ?? now });
    have.add(`${entry.source}\u0000${entry.answer}`);
    added += 1;
  };
  const answers = join(slugDir, LEGACY_ANSWERS);
  if (existsSync(answers)) {
    const seen = new Map();
    for (const r of parseLegacyAnswers(readFileSync(answers, 'utf8'))) {
      // Each old question gets its own key: the log never named one, and two answers to
      // different questions must not supersede each other.
      const base = `legacy-${slugKey(r.question ?? r.answer)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      add({ kind: 'answer', key: n > 1 ? `${base}-${n}` : base, question: r.question, answer: r.answer,
        by: 'person', stage: r.stage, source: LEGACY_ANSWERS, at: r.at });
    }
  }
  const steer = join(slugDir, LEGACY_STEER);
  if (existsSync(steer)) {
    for (const s of parseLegacySteer(readFileSync(steer, 'utf8'))) {
      add({ kind: 'steer', key: null, answer: s, by: 'person', source: LEGACY_STEER });
    }
  }
  return { added, skipped };
}

// ---------------------------------------------------------------- text

/** One line per entry, for a brief or a list. */
export function decisionLine(e) {
  const where = Object.entries(cleanScope(e.scope)).map(([k, v]) => `${k}=${[].concat(v).join(',')}`).join(' ');
  const q = e.question ? `${e.question} → ` : '';
  const tail = [e.kind, e.by !== 'person' ? `by ${e.by}` : null, where || null, e['superseded-by'] ? `superseded by ${e['superseded-by']}` : null]
    .filter(Boolean).join('; ');
  return `${e.id} ${q}${e.answer} (${tail})`;
}
