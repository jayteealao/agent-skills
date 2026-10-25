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

/** The text of a store that holds a list. */
export const storeText = (list) => `${stringify({ schema: 'sdlc/v1', type: 'decisions', decisions: list })}\n`;

/** Write the store whole, through a temporary file. */
export function writeDecisions(slugDir, list) {
  const file = join(slugDir, DECISIONS_FILE);
  writeFileSync(`${file}.tmp`, storeText(list));
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

// An approval or a try-out verdict sits beside the choice that it judges, under the same key:
// it supersedes only an earlier verdict of its own kind. Every other kind is a choice.
const familyOf = (kind) => (kind === 'approval' || kind === 'try-out' ? kind : 'choice');

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
 * Append an entry to a list in memory. A live entry with the same key and the same scope is
 * superseded by the new one. Returns { entry, superseded }.
 */
export function appendEntry(list, input, { now = nowIso() } = {}) {
  const kind = input.kind ?? 'answer';
  const by = input.by ?? 'person';
  if (!KINDS.includes(kind)) {
    throw new Error(`kind ${kind} is not a kind; the kinds are: answer (a decision or a choice), steer (a standing constraint), approval (a sign-off of a decision), try-out (a manual check: works or fails), delegate (a decision that the run made for the person)`);
  }
  if (!BY.includes(by)) throw new Error(`by must be one of ${BY.join(', ')}`);
  if (input.answer == null || String(input.answer).trim() === '') throw new Error('an answer is required');
  if (kind !== 'steer' && !input.key) throw new Error(`a${/^[aeiou]/.test(kind) ? 'n' : ''} ${kind} needs --key <a short stable name of the question>`);
  const max = list.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^D-/, '')) || 0), 0);
  const entry = {
    id: idOf(max + 1),
    at: input.at ?? now,
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
      if (isLive(e) && e.key === entry.key && sameScope(e.scope, entry.scope) && familyOf(e.kind) === familyOf(kind)) {
        e['superseded-by'] = entry.id;
        superseded.push(e.id);
      }
    }
  }
  list.push(entry);
  return { entry, superseded };
}

/**
 * Add an entry and write the store. The first write of a workflow that still has
 * po-answers.md or steer.md imports them first, so the store holds every earlier answer.
 */
export function addDecision(slugDir, input, { now = nowIso() } = {}) {
  if (!existsSync(join(slugDir, DECISIONS_FILE)) && hasLegacy(slugDir)) importLegacy(slugDir, { now });
  const list = readDecisions(slugDir);
  const r = appendEntry(list, input, { now });
  writeDecisions(slugDir, list);
  return r;
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

/**
 * Read the verdict lines that a campaign walk appended to po-answers.md:
 * `- <key>: approved` is an approval, `- try-out: works` (or `fails`) is a try-out.
 */
export function parseLegacyVerdicts(text) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^-\s+\W*([A-Za-z0-9][\w.-]*)\W*:\s+(approved|works|fails)\b(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, verdict, rest] = m;
    const note = rest.replace(/^\s*[—–-]\s*/, '').trim();
    if (key === 'try-out') rows.push({ kind: 'try-out', key: 'try-out', answer: verdict, question: note || null });
    else if (verdict === 'approved') rows.push({ kind: 'approval', key, answer: 'approved', question: note || null });
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

/** The entries that po-answers.md and steer.md hold, as store inputs, oldest first. */
export function legacyInputs(slugDir) {
  const inputs = [];
  const answers = join(slugDir, LEGACY_ANSWERS);
  if (existsSync(answers)) {
    const text = readFileSync(answers, 'utf8');
    const seen = new Map();
    for (const r of parseLegacyAnswers(text)) {
      // Each old question gets its own key: the log never named one, and two answers to
      // different questions must not supersede each other.
      const base = `legacy-${slugKey(r.question ?? r.answer)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      inputs.push({ kind: 'answer', key: n > 1 ? `${base}-${n}` : base, question: r.question, answer: r.answer,
        by: 'person', stage: r.stage, source: LEGACY_ANSWERS, at: r.at ?? undefined });
    }
    for (const v of parseLegacyVerdicts(text)) inputs.push({ ...v, by: 'person', source: LEGACY_ANSWERS });
  }
  const steer = join(slugDir, LEGACY_STEER);
  if (existsSync(steer)) {
    for (const s of parseLegacySteer(readFileSync(steer, 'utf8'))) {
      inputs.push({ kind: 'steer', key: null, answer: s, by: 'person', source: LEGACY_STEER });
    }
  }
  return inputs;
}

export const hasLegacy = (slugDir) => existsSync(join(slugDir, LEGACY_ANSWERS)) || existsSync(join(slugDir, LEGACY_STEER));

/**
 * Import po-answers.md and steer.md into the store. An entry that the store already holds
 * (the same source, key and answer) is not added again, so an import can run twice.
 * The old files stay. Returns { added, skipped }.
 */
export function importLegacy(slugDir, { now = nowIso() } = {}) {
  const list = readDecisions(slugDir);
  const sig = (e) => `${e.source}\u0000${e.key}\u0000${e.answer}`;
  const have = new Set(list.map(sig));
  let added = 0;
  let skipped = 0;
  for (const input of legacyInputs(slugDir)) {
    if (have.has(sig({ key: null, ...input }))) { skipped += 1; continue; }
    const { entry } = appendEntry(list, input, { now });
    have.add(sig(entry));
    added += 1;
  }
  if (added) writeDecisions(slugDir, list);
  return { added, skipped };
}

/**
 * The decisions of a workflow: the store, or, before the first write, the entries that
 * po-answers.md and steer.md hold, read in memory.
 */
export function decisionsOf(slugDir) {
  if (existsSync(join(slugDir, DECISIONS_FILE))) return readDecisions(slugDir);
  const list = [];
  for (const input of legacyInputs(slugDir)) appendEntry(list, input);
  return list;
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
