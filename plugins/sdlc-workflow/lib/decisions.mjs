// The decision store of a workflow: .ai/workflows/<slug>/decisions.yaml.
//
// One keyed list holds every answer, standing steer, approval, try-out verdict and delegated
// choice. An entry is live until a later entry supersedes it. A later entry with the same key
// and the same scope supersedes the earlier one, so a question is asked once and a reversal is
// one more entry. A brief takes only the live entries in its scope.
//
//   id             D-001, D-002, ... in the order of writing
//   at             the time of writing (ISO 8601, seconds)
//   kind           answer | steer | approval | try-out | delegate | note | settled
//                  steer: a standing rule of the person. note: a hand-off from a stage to one
//                  slice, open until it is ended. settled: a decision that a stage settled itself;
//                  it is kept for the count and the audit, and no list or brief shows it unless asked.
//   key            a stable question key, or null for a free steer
//   question       the question as asked, or null
//   answer         the answer, exact
//   by             person | policy | delegate | standing:<id> (a case that a standing answer settled)
//                  | standing rule (a standing answer of the project) | standing default (of a campaign)
//   scope          { packet, slice, files } — an absent field means every packet, slice or file
//   stage          the stage that asked, or null
//   source         where the entry came from (a stage, or the file an import read)
//   rewrote        the records that the answer changed, for an answer that changes the build
//   class          implementation-detail | intent-bearing, for a settled or a delegate entry
//   superseded-by  the id of the entry that replaced this one, `ended` for an entry that was
//                  ended with no successor (with ended-at and ended-why), or null
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { withFileLock } from './file-lock.mjs';
import { parse, stringify } from './yaml.mjs';
import { agentFix, refuse } from './fix.mjs';
import { callerActor, personOnly } from './actor.mjs';

export const DECISIONS_FILE = 'decisions.yaml';
export const KINDS = ['answer', 'steer', 'approval', 'try-out', 'delegate', 'note', 'settled'];
export const BY = ['person', 'policy', 'delegate', 'stage'];
/** The stages that run as agents of a build. They write notes and settled entries, never a steer. */
export const STAGE_WRITERS = ['plan', 'implement', 'verify', 'review'];
export const CLASSES = ['implementation-detail', 'intent-bearing'];
/** The `superseded-by` of an entry that was ended with no successor. */
export const ENDED = 'ended';
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

/** Write the store whole, through a temp file of this write. */
export function writeDecisions(slugDir, list) {
  writeFileAtomic(join(slugDir, DECISIONS_FILE), storeText(list));
}

// A read-modify-write of the store holds the lock of the store file, so two writers lose no
// entry and never mint one id twice.
const withStoreLock = (slugDir, fn) => withFileLock(join(slugDir, DECISIONS_FILE), fn);

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
// it supersedes only an earlier verdict of its own kind. A note and a settled entry are what a
// build stage wrote: each supersedes only its own kind, so it never takes the place of an answer or
// a steer of the person under the same key. Every other kind is a choice.
const OWN_FAMILY = ['approval', 'try-out', 'note', 'settled'];
const familyOf = (kind) => (OWN_FAMILY.includes(kind) ? kind : 'choice');

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

/** The prefix of the key of a standing answer: `standing:<kind>` settles each question `<kind>:<case>`. */
export const STANDING_PREFIX = 'standing:';

/** True when an entry was settled by a standing answer: its `by` is `standing:<id>`. */
const byStanding = (by) => typeof by === 'string' && by.startsWith(STANDING_PREFIX);

/**
 * The `by` of an entry that a standing answer of the project settled (`standing rule`,
 * lib/standing.mjs), or a standing default of a campaign (`standing default`).
 */
export const STANDING_BY = ['standing rule', 'standing default'];

const settledByStanding = (by) => byStanding(by) || STANDING_BY.includes(by);

/**
 * The live entries in a scope, in the order of writing. `by: 'standing'` takes the cases that a
 * standing answer settled. A `settled` entry is given only when `kind` asks for it: it is a record
 * of what a stage chose, not an input of the next stage. A note of one slice is given only to a
 * query of that slice.
 */
export function liveDecisions(list, query = {}, { by = null, kind = null } = {}) {
  // `kind` takes one kind, or several with commas.
  const kinds = kind ? String(kind).split(',').map((k) => k.trim()).filter(Boolean) : null;
  const q = cleanScope(query);
  return list.filter((e) => isLive(e) && inScope(e, query)
    && (e.kind !== 'settled' || Boolean(kinds?.includes('settled')))
    && (e.kind !== 'note' || !cleanScope(e.scope).slice || !q.slice || cleanScope(e.scope).slice === q.slice)
    && (e.kind !== 'note' || Boolean(q.slice) || Boolean(q.files) || Boolean(kinds?.includes('note')))
    && (!by || (by === 'standing' ? settledByStanding(e.by) : e.by === by)) && (!kinds || kinds.includes(e.kind)));
}

/** The kind of a question key: the part before the first colon, or null for a key with no colon. */
export function kindOfKey(key) {
  const k = String(key ?? '');
  if (k.startsWith(STANDING_PREFIX)) return null;
  const i = k.indexOf(':');
  return i > 0 ? k.slice(0, i) : null;
}

/**
 * The live entry that answers a question key in a scope, or null. With no entry for the key
 * itself, a live standing answer `standing:<kind>` answers a key `<kind>:<case>`.
 */
export function answeredBy(list, key, query = {}) {
  if (!key) return null;
  const live = liveDecisions(list, query);
  const hit = mostSpecific(live.filter((e) => e.key === key), query);
  if (hit) return hit;
  const kind = kindOfKey(key);
  if (!kind) return null;
  return mostSpecific(live.filter((e) => e.kind === 'steer' && e.key === `${STANDING_PREFIX}${kind}`), query);
}

/**
 * The entry of `hits` (all live, all in the scope of `query`) that fits the query best: one of
 * exactly the query scope; else, for a query that names a slice, one of that slice over one with
 * no slice; for a query with no slice, one with no slice over one of a slice. A tie goes to the
 * entry written last.
 */
function mostSpecific(hits, query) {
  if (!hits.length) return null;
  const q = cleanScope(query);
  const exact = hits.filter((e) => sameScope(e.scope, q));
  if (exact.length) return exact.at(-1);
  const sliceOfEntry = (e) => cleanScope(e.scope).slice ?? null;
  const better = hits.filter((e) => sliceOfEntry(e) === (q.slice ?? null));
  return (better.length ? better : hits).at(-1);
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
 *
 * `copied`: the entry is a copy of one that the person already recorded elsewhere, and
 * `input.source` names where. An agent of a run may carry such a copy (a packet takes the
 * decisions of its brainstorm); it still never writes a new entry in the name of the person.
 */
export function appendEntry(list, input, { now = nowIso(), copied = false } = {}) {
  const kind = input.kind ?? 'answer';
  // With no --by, the session of the person records the words of the person. An agent of a run never does.
  const by = input.by ?? (kind === 'note' || kind === 'settled' || callerActor() ? 'stage' : 'person');
  const copy = copied && typeof input.source === 'string' && input.source.trim() !== '';
  if (!copy && by === 'person') personOnly('record an entry');
  else if (!copy && (kind === 'steer' || kind === 'approval')) personOnly(`write ${kind === 'steer' ? 'a steer' : 'an approval'}`);
  if (!KINDS.includes(kind)) {
    throw refuse(`kind ${kind} is not a kind; the kinds are: answer (a decision or a choice), steer (a standing rule of the person), approval (a sign-off of a decision), try-out (a manual check: works or fails), delegate (a decision that the run made for the person), note (a hand-off from a stage to one slice), settled (a decision that a stage settled itself)`, agentFix('Run the command again with a --kind that the error lists.'));
  }
  if (!BY.includes(by) && !STANDING_BY.includes(by) && !(byStanding(by) && /^D-\d+$/.test(by.slice(STANDING_PREFIX.length)))) throw refuse(`by must be one of ${BY.join(', ')}, ${STANDING_BY.join(', ')}, or standing:<id> of a standing answer`, agentFix('Run the command again with the --by that says who decided: one of the values that the error lists.'));
  if (input.answer == null || String(input.answer).trim() === '') throw refuse('an answer is required', agentFix('Run the command again with --answer, the answer in the words of who gave it.'));
  // A steer is a standing rule of the person. A build stage that has something for a later slice
  // writes a note to that slice; a choice of its own is a settled entry.
  if (kind === 'steer' && STAGE_WRITERS.includes(input.stage)) {
    throw refuse(`the ${input.stage} stage does not write a steer: a steer is a standing rule of the person`, agentFix('For a hand-off to another slice, run the command again with --kind note --slice <the slice it is for>. For a choice that you settled, use --kind settled --class implementation-detail --slice <your slice>. To record the words of the person, leave --stage out.'));
  }
  if (kind === 'note' && !cleanScope(input.scope).slice && !cleanScope(input.scope).files) {
    throw refuse('a note needs the slice that it is for', agentFix('Run the command again with --slice <the slice that must read the note>, or with --files <paths> for a note about some files.'));
  }
  if (input.class != null && !CLASSES.includes(input.class)) throw refuse(`class must be one of ${CLASSES.join(', ')}`, agentFix('Run the command again with a --class that the error lists.'));
  if (kind === 'settled' && !input.class) throw refuse('a settled entry needs --class', agentFix(`Run the command again with --class, one of ${CLASSES.join(', ')}.`));
  const replaces = [...new Set((Array.isArray(input.replaces) ? input.replaces : []).map(String))];
  for (const id of replaces) {
    const old = list.find((e) => e.id === id);
    if (!old) throw refuse(`no entry ${id} to replace`, agentFix('Run decide list to see the ids, then run the command again with --replaces <an id of the list>.'));
  }
  if (!['steer', 'note', 'settled'].includes(kind) && !input.key) throw refuse(`a${/^[aeiou]/.test(kind) ? 'n' : ''} ${kind} needs --key <a short stable name of the question>`, agentFix('Run the command again with --key, a short stable name of the question.'));
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
    ...(input.class ? { class: input.class } : {}),
    'superseded-by': null,
  };
  const superseded = [];
  // An entry that names the entries it replaces supersedes them, whatever their key and scope:
  // a new rule that contradicts an old one takes its place, and the old one leaves every list.
  for (const e of list) {
    if (replaces.includes(e.id) && isLive(e)) { e['superseded-by'] = entry.id; superseded.push(e.id); }
  }
  if (entry.key) {
    const same = (e) => isLive(e) && e.key === entry.key && sameScope(e.scope, entry.scope) && familyOf(e.kind) === familyOf(kind);
    // The answer of the person stands until the person changes it: no stage and no delegate writes over it.
    const ofPerson = by === 'person' ? null : list.find((e) => same(e) && e.by === 'person');
    if (ofPerson) throw refuse(`the person answered ${entry.key} (${ofPerson.id}): that answer stands`, agentFix(`Follow ${ofPerson.id}. When it does not fit the case, hold the question for the person with decide hold; do not record another answer under the same key.`));
    for (const e of list) {
      if (same(e)) {
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
  return withStoreLock(slugDir, () => {
    if (!existsSync(join(slugDir, DECISIONS_FILE)) && hasLegacy(slugDir)) importLegacyLocked(slugDir, { now });
    const list = readDecisions(slugDir);
    const r = appendEntry(list, input, { now });
    writeDecisions(slugDir, list);
    return r;
  });
}

/**
 * End a live entry that has no successor: a rule that no longer holds, or a note that was handled.
 * Returns the entry, or throws when the id is not a live entry.
 */
export function endDecision(slugDir, id, why, { now = nowIso() } = {}) {
  return withStoreLock(slugDir, () => {
    const list = readDecisions(slugDir);
    const e = list.find((x) => x.id === id);
    if (!e) throw refuse(`no entry ${id}`, agentFix('Run decide list to see the ids, then run the command again with an id of the list.'));
    if (!isLive(e)) throw refuse(`entry ${id} is not live: ${e['superseded-by'] === ENDED ? 'it was ended' : `${e['superseded-by']} replaced it`}`, agentFix('Nothing to do: the entry is already out of every list.'));
    if (!String(why ?? '').trim()) throw refuse('an end needs its reason', agentFix('Run the command again with --reason "<why the entry no longer holds, or how the note was handled>".'));
    e['superseded-by'] = ENDED;
    e['ended-at'] = now;
    e['ended-why'] = String(why).trim();
    writeDecisions(slugDir, list);
    return e;
  });
}

/**
 * Move the live entries scoped to slice `from` to the slices that now hold its work: a split, a
 * merge or a move of the slice. `pick(entry)` returns the slices an entry goes to (one or more);
 * the first takes the entry itself, and each other gets a copy with a new id and `copied-from`.
 * Every move adds a line to the `moves:` history of the entry. Returns the ids moved and copied.
 */
export function rescopeDecisions(slugDir, from, pick, why, { now = nowIso() } = {}) {
  return withStoreLock(slugDir, () => {
    const list = readDecisions(slugDir);
    const moved = [];
    const copied = [];
    let max = list.reduce((m, e) => Math.max(m, Number(String(e.id).replace(/^D-/, '')) || 0), 0);
    for (const e of [...list]) {
      if (!isLive(e) || cleanScope(e.scope).slice !== from) continue;
      const to = [...new Set((pick(e) ?? []).map(String).filter(Boolean))];
      if (!to.length || (to.length === 1 && to[0] === from)) continue;
      const line = (slice) => ({ at: now, from, to: slice, why: String(why) });
      const [first, ...rest] = to;
      for (const slice of rest) {
        max += 1;
        const copy = { ...structuredClone(e), id: idOf(max), scope: { ...cleanScope(e.scope), slice }, 'copied-from': e.id, moves: [...(e.moves ?? []), line(slice)] };
        list.push(copy);
        copied.push(copy.id);
      }
      if (first !== from) {
        e.scope = { ...cleanScope(e.scope), slice: first };
        e.moves = [...(e.moves ?? []), line(first)];
        moved.push(e.id);
      }
    }
    if (moved.length || copied.length) writeDecisions(slugDir, list);
    return { moved, copied };
  });
}

const DONE_SLICE = ['complete', 'skipped', 'dropped'];

/**
 * The tidy of the steers and notes of a store, against the roster (`statusOf`: slice → status).
 * Returns { end, toNote, review }:
 * - `end`: a live steer or note of one slice whose slice is complete, skipped or dropped;
 * - `toNote`: a live steer of one open slice that a build stage wrote: it is a hand-off, so it
 *   becomes a note;
 * - `review`: each other live steer, oldest first, for the person: keep it, end it, or move it to
 *   the rules of the project. `fromStage` marks one that a build stage wrote.
 */
export function tidyPlan(list, statusOf = {}) {
  const end = [];
  const toNote = [];
  const review = [];
  for (const e of list) {
    if (!isLive(e) || (e.kind !== 'steer' && e.kind !== 'note')) continue;
    const slice = cleanScope(e.scope).slice ?? null;
    const fromStage = STAGE_WRITERS.includes(e.stage);
    if (slice && DONE_SLICE.includes(statusOf[slice])) end.push({ id: e.id, kind: e.kind, slice, why: `its slice ${slice} is ${statusOf[slice]}` });
    else if (e.kind === 'steer' && slice && fromStage) toNote.push({ id: e.id, slice });
    else if (e.kind === 'steer') review.push({ id: e.id, at: e.at, key: e.key ?? null, by: e.by, fromStage, slice, chars: String(e.answer ?? '').length + String(e.question ?? '').length });
  }
  return { end, toNote, review };
}

/** Apply the `end` and `toNote` rows of a tidy plan, and write the store. Returns the plan. */
export function applyTidy(slugDir, statusOf = {}, { now = nowIso() } = {}) {
  return withStoreLock(slugDir, () => {
    const list = readDecisions(slugDir);
    const plan = tidyPlan(list, statusOf);
    const byId = new Map(list.map((e) => [e.id, e]));
    for (const r of plan.end) { const e = byId.get(r.id); e['superseded-by'] = ENDED; e['ended-at'] = now; e['ended-why'] = r.why; }
    for (const r of plan.toNote) { const e = byId.get(r.id); e.kind = 'note'; e['was-kind'] = 'steer'; }
    if (plan.end.length || plan.toNote.length) writeDecisions(slugDir, list);
    return plan;
  });
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
export function importLegacy(slugDir, opts = {}) {
  return withStoreLock(slugDir, () => importLegacyLocked(slugDir, opts));
}

function importLegacyLocked(slugDir, { now = nowIso() } = {}) {
  const list = readDecisions(slugDir);
  const sig = (e) => `${e.source}\u0000${e.key}\u0000${e.answer}`;
  // Only the entries that the store held before this import count as known: a line that repeats
  // an earlier line of the same file (a verdict that flips back) is kept, in its order.
  const have = new Set(list.map(sig));
  let added = 0;
  let skipped = 0;
  for (const input of legacyInputs(slugDir)) {
    if (have.has(sig({ key: null, ...input }))) { skipped += 1; continue; }
    appendEntry(list, input, { now });
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

// ---------------------------------------------------------------- run decisions

/** The key of the steer entry that says how a run settles the decisions of the person. */
export const RUN_DECISIONS_KEY = 'run-decisions';

/** The question that the launch of a driver asks, recorded under RUN_DECISIONS_KEY. */
export const RUN_DECISIONS_QUESTION = 'When the run reaches a decision of yours, should it stop and wait, or take the recommended option and show you each one at the end?';

/** The 2 answers of the run-decisions question. */
export const RUN_DECISIONS_OPTIONS = ['Stop and wait for me', 'Take the recommended option and show me each one at the end'];

/**
 * The key of the answer to how far one call of a campaign walk goes, recorded in the folder of
 * the list's source. Its answers are next, all, or a number of packets: a number is free text, so
 * the key has no closed set of options and no standing answer.
 */
export const HOW_FAR_KEY = 'campaign-how-far';

/** The question of how far, recorded under HOW_FAR_KEY. */
export const HOW_FAR_QUESTION = 'How far should this call of the walk go: the next packet, all of them, or a number of packets?';

/**
 * True when a run-decisions answer says: take the recommended option, do not stop and wait.
 * That is the second option, or a plain yes to it ("take the recommended option",
 * "delegate"). An answer with a negation, a stop, a wait or an ask in it is false: when the
 * answer is unclear, the run asks.
 */
export function delegatesDecisions(answer) {
  const a = String(answer ?? '').trim().toLowerCase().replace(/[\s.!]+$/, '').replace(/\s+/g, ' ');
  if (!a) return false;
  if (a === RUN_DECISIONS_OPTIONS[1].toLowerCase()) return true;
  // A tail that only declines the digest changes nothing: "take the recommended option, no need to show me".
  // The tails are a closed list. Any other tail is read with the rest of the answer.
  const body = a.replace(/\s*(?:[,;:]|\band\b)\s*(?:no need to show me|(?:do not|don'?t) show me)(?: each one| them| the digest)?$/, '').replace(/\s*[,;:]\s*no digest$/, '');
  if (body !== a) return delegatesDecisions(body);
  // A negation, a stop, or a condition ("unless", "only for", "before", "first") is not a plain yes: the run asks.
  if (/\b(no|not|never|none|nor|neither|without|stop|wait|ask|unless|except|only|if|when|before|first|until|don'?t|doesn'?t|won'?t)\b|n't\b/.test(a)) return false;
  return /\b(take|use|pick|choose|go with|accept|follow)\b.*\brecommend/.test(a)
    || /^(the )?recommended( option| one)?$/.test(a)
    || /^(yes,? )?delegate\b/.test(a)
    || /\bdecide for me\b/.test(a);
}

/** True when the live run-decisions steer of a workflow folder takes the recommended option. */
export function runDelegatedIn(slugDir) {
  try {
    const entry = answeredBy(decisionsOf(slugDir), RUN_DECISIONS_KEY);
    // Only the person, or a standing answer of the person, lets a run settle the decisions of the person.
    return Boolean(entry) && (entry.by === 'person' || settledByStanding(entry.by)) && delegatesDecisions(entry.answer);
  } catch { return false; }
}

// ---------------------------------------------------------------- text

/** One line per entry, for a brief or a list. The key of the entry, when it has one, follows its id as `[key]`. */
export function decisionLine(e) {
  const where = Object.entries(cleanScope(e.scope)).map(([k, v]) => `${k}=${[].concat(v).join(',')}`).join(' ');
  const key = e.key ? `[${e.key}] ` : '';
  const q = e.question ? `${e.question} → ` : '';
  const gone = e['superseded-by'] === ENDED ? `ended: ${e['ended-why'] ?? ''}`.trim() : e['superseded-by'] ? `superseded by ${e['superseded-by']}` : null;
  const tail = [e.kind, e.class ?? null, e.by !== 'person' ? `by ${e.by}` : null, where || null, gone]
    .filter(Boolean).join('; ');
  return `${e.id} ${key}${q}${e.answer} (${tail})`;
}
