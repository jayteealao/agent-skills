// The edits of a brainstorm board in one call each: `wf.mjs board add|move|regroup|remove|set|
// prose|apply|render|adopt`, and the `wf.board` namespace of the library. Each edit reads the
// board, changes it, validates the whole board against $defs.brainstormBoard, and writes it only
// when it is valid, so no edit leaves a board that the write hook would refuse. Each write also
// renders the person's document from the board (lib/brainstorm-doc.mjs) in the same call, so
// the board and the document cannot drift.
//
//   add      items, threads, areas, work packets, log entries, sketches, budgets or briefs
//   move     items into a thread (with `newThread`, the thread is made first)
//   regroup  threads into another area
//   remove   items that nothing else names
//   set      fields of one entry, or of the board itself
//   prose    the summary, the story of a session, the brief of an area, or a carried section
//   apply    one change file with any of the above: the edit of a whole batch in one call; its
//            `close` part scopes whole areas (an area close, or the never-closed areas at done)
//   digest   read only: per area what is kept, later and cut, the undecided ideas, the open items
//            and their handling, and the proposal for each item that is not settled
//   render   the document from the board, now
//   adopt    the prose of a hand-written document into the board, then render
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { prepareDocument } from './brainstorm-doc.mjs';
import { frontmatterOfDoc } from './records.mjs';
import { formatValidationErrors, validateBrainstormBoard } from './schema-validator.mjs';
import { agentFix, refuse } from './fix.mjs';

// A refused board command is an input that the agent changes: the message names the valid keys,
// kinds or fields.
const bad = (message, doText = 'Change the input as the error says (it names the valid keys, kinds or fields), then run the board command again.') => refuse(message, agentFix(doText));

export const BOARD_KINDS = ['item', 'thread', 'area', 'work', 'log', 'sketch', 'budget', 'brief'];
export const PROSE_KINDS = ['summary', 'story', 'brief', 'carried'];
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const FIELD = { item: 'items', thread: 'threads', area: 'areas', work: 'work', log: 'log', sketch: 'sketches', budget: 'budgets', brief: 'briefs' };
// Areas, threads, items and work packets share one key space; a sketch, a budget and a brief each have their own.
const SHARED = new Set(['item', 'thread', 'area', 'work']);
// The lists that only their own command changes; `set` with no key changes the other board fields.
const NOT_TOP = new Set(['schema', 'artifact', 'slug', 'areas', 'threads', 'items', 'work', 'log', 'sketches', 'budgets', 'briefs', 'stories', 'carried', 'archived']);

/** The board file of a brainstorm: the `board:` field of its lead record, else brainstorm-board.json. */
export function boardPath(dir, file = null) {
  const name = file ?? frontmatterOfDoc(dir, '01-brainstorm.md')?.board ?? 'brainstorm-board.json';
  return join(dir, name);
}

export function readBoard(dir, file = null) {
  const path = boardPath(dir, file);
  if (!existsSync(path)) throw bad(`board: no board at ${path}`, 'Run the command again with the slug of the workflow whose folder holds the board (its 01-brainstorm.md names the board file).');
  return { path, board: JSON.parse(readFileSync(path, 'utf8')) };
}

function assertValid(board) {
  const v = validateBrainstormBoard(board);
  if (!v.valid) throw bad(`board: the change would break the board, so nothing is written:\n${formatValidationErrors(v.errors)}`, 'Change the input so that the board passes its schema (the errors name each field), then run the command again.');
}

/**
 * Validate the board, render its document, and write both. The board is written first, then
 * the document; a document that would not validate stops both writes.
 */
function writeBoard(dir, path, board, { original = null, forceAdopt = false, touch = true } = {}) {
  const next = touch ? { ...board, 'updated-at': nowIso() } : board;
  assertValid(next);
  let plan;
  try { plan = prepareDocument(dir, basename(path), next, { original: original ?? board, forceAdopt }); } catch (e) {
    throw bad(`board: ${e.message}\nNothing is written.`, 'Repair the fields of the document that the error names, then run the command again.');
  }
  assertValid(plan.board);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(plan.board, null, 2)}\n`);
  renameSync(tmp, path);
  plan.commit();
  return {
    board: plan.board,
    document: plan.document,
    ...(plan.adopted ? { adopted: { taken: plan.adopted.taken, carried: plan.adopted.carried } } : {}),
    ...(plan.warnings.length ? { warnings: plan.warnings } : {}),
  };
}

/** The result of a write, without the board itself. */
const report = (w, extra) => ({ ...extra, document: w.document, ...(w.adopted ? { adopted: w.adopted } : {}), ...(w.warnings ? { warnings: w.warnings } : {}) });

/** Every key of the board: areas, threads, items and work packets share one key space. */
const keysOf = (b) => new Set([...(b.areas ?? []), ...(b.threads ?? []), ...(b.items ?? []), ...(b.work ?? [])].map((x) => x?.key).filter(Boolean));
const list = (b, field) => (Array.isArray(b[field]) ? b[field] : []);
const names = (xs) => xs.map((x) => x.key).join(', ') || 'none';

function needThread(b, key) {
  if (!list(b, 'threads').some((t) => t.key === key)) throw bad(`board: no thread ${key}; the threads are: ${names(list(b, 'threads'))}`);
}
function needArea(b, key) {
  if (!list(b, 'areas').some((a) => a.key === key)) throw bad(`board: no area ${key}; the areas are: ${names(list(b, 'areas'))}`);
}

// ---------------------------------------------------------------- the changes, as pure steps

/** The board with entries of one kind added. Each keyed entry needs a new key. */
export function addEntries(board, kind, entries, { now = nowIso() } = {}) {
  if (!BOARD_KINDS.includes(kind)) throw bad(`board add: ${kind} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  const add = Array.isArray(entries) ? entries : [entries];
  const field = FIELD[kind];
  const keys = SHARED.has(kind) ? keysOf(board) : new Set(list(board, field).map((x) => x?.key).filter(Boolean));
  for (const e of add) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw bad('board add: each entry is a JSON object');
    if (kind === 'log') continue;
    if (!KEY.test(String(e.key ?? ''))) throw bad(`board add: the key ${e.key} is not kebab-case words`);
    if (keys.has(e.key)) throw bad(`board add: the key ${e.key} is in use; keys are unique across areas, threads, items and work`);
    if ((kind === 'item' || kind === 'sketch') && e.thread) needThread(board, e.thread);
    if (kind === 'thread' && e.area) needArea(board, e.area);
    keys.add(e.key);
  }
  const sessions = Number(board.sessions) || 1;
  const fill = (e) => {
    if (kind === 'thread') return { state: 'live', 'routed-to': null, ...e };
    if (kind === 'area') return { state: 'open', scope: null, ...e };
    // A new decision records when the person made it, and is kept at once: the person scopes as
    // the loop goes. An explicit scope (null included) says the person said otherwise.
    if (kind === 'item' && e.kind === 'decision') return { ...e, ...(Object.hasOwn(e, 'scope') ? {} : { scope: 'keep' }), session: e.session ?? sessions, 'decided-at': e['decided-at'] ?? now };
    if (kind === 'log') return { session: sessions, ...e };
    return e;
  };
  const next = { ...board, [field]: [...list(board, field), ...add.map(fill)] };
  if (kind === 'log') {
    const top = Math.max(Number(board.batches) || 0, ...add.map((e) => (Number.isInteger(e.batch) ? e.batch : 0)));
    next.batches = top;
  }
  return next;
}

/** Where an entry of `key` lives: [field, index]. Throws when no entry has it, or two lists do. */
function locateKey(board, key) {
  const hits = [];
  for (const field of ['areas', 'threads', 'items', 'work', 'sketches', 'budgets', 'briefs']) {
    const n = list(board, field).findIndex((x) => x?.key === key);
    if (n >= 0) hits.push([field, n]);
  }
  if (!hits.length) throw bad(`board set: no entry ${key} among the areas, threads, items, work, sketches, budgets and briefs`);
  if (hits.length > 1) throw bad(`board set: ${key} names entries in ${hits.map((h) => h[0]).join(' and ')}; rename one of them`);
  return hits[0];
}

/**
 * The board with fields set on the entry `key`, or on the board itself when `key` is null.
 * A null value removes the field.
 */
export function setEntryFields(board, key, fields) {
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) throw bad('board set: give at least one field=value');
  const apply = (obj) => {
    const out = { ...obj };
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined) delete out[k];
      else out[k] = v;
    }
    return out;
  };
  if (key == null) {
    const blocked = Object.keys(fields).filter((k) => NOT_TOP.has(k));
    if (blocked.length) throw bad(`board set: ${blocked.join(', ')} change only with their own command (board add, prose, move, regroup or remove)`);
    return apply(board);
  }
  if (Object.hasOwn(fields, 'key')) throw bad('board set: a key is stable once written; add a new entry and mark the old one instead', 'Add a new entry with board add, and mark the old one, instead of a change of its key.');
  const [field, n] = locateKey(board, key);
  if (field === 'items' && fields.thread) needThread(board, fields.thread);
  if (field === 'threads' && fields.area) needArea(board, fields.area);
  const entries = [...list(board, field)];
  entries[n] = apply(entries[n]);
  return { ...board, [field]: entries };
}

/**
 * The board with one prose field set: the `summary`, the `story` of a session (the newest by
 * default), the `brief` of an area, or a `carried` section (an empty text removes it).
 */
export function setProse(board, what, text, { session = null, date = null, area = null, heading = null, now = nowIso() } = {}) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (what === 'summary') {
    if (!t) throw bad('board prose summary: the text is empty');
    return { ...board, summary: t };
  }
  if (what === 'story') {
    if (!t) throw bad('board prose story: the text is empty');
    const n = session == null ? Number(board.sessions) || 1 : Number(session);
    if (!Number.isInteger(n) || n < 1) throw bad(`board prose story: --session ${session} is not a session number`);
    const day = date ?? now.slice(0, 10);
    const stories = list(board, 'stories').filter((s) => s.session !== n);
    const prior = list(board, 'stories').find((s) => s.session === n);
    return { ...board, stories: [...stories, { ...prior, session: n, text: t, date: prior?.date && !date ? prior.date : day }].sort((a, b) => a.session - b.session) };
  }
  if (what === 'brief') {
    if (!area) throw bad('board prose brief: --area <area> is required');
    needArea(board, area);
    if (!t) throw bad('board prose brief: the text is empty');
    return { ...board, areas: list(board, 'areas').map((a) => (a.key === area ? { ...a, brief: t } : a)) };
  }
  if (what === 'carried') {
    if (!heading) throw bad('board prose carried: --heading <heading> is required');
    const rest = list(board, 'carried').filter((c) => c.heading !== heading);
    const prior = list(board, 'carried').find((c) => c.heading === heading);
    return { ...board, carried: t ? [...rest, { ...prior, heading, text: t }] : rest };
  }
  throw bad(`board prose: ${what} is not a prose field; the fields are: ${PROSE_KINDS.join(', ')}`);
}

// ---------------------------------------------------------------- the commands

/** Add entries of one kind. Each keyed entry needs a new key. */
export function boardAdd(dir, kind, entries, { file = null } = {}) {
  if (!BOARD_KINDS.includes(kind)) throw bad(`board add: ${kind} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  const { path, board } = readBoard(dir, file);
  const add = Array.isArray(entries) ? entries : [entries];
  const w = writeBoard(dir, path, addEntries(board, kind, add), { original: board });
  return report(w, { added: kind === 'log' ? add.length : add.map((e) => e.key), kind });
}

/** Move items into a thread. `newThread` ({ key, name, area }) makes the thread first. */
export function boardMove(dir, itemKeys, to, { newThread = null, file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  let next = board;
  if (newThread) {
    if (keysOf(board).has(newThread.key)) throw bad(`board move: the key ${newThread.key} is in use`);
    if (!KEY.test(String(newThread.key ?? ''))) throw bad(`board move: the key ${newThread.key} is not kebab-case words`);
    if (!newThread.name) throw bad('board move: a new thread needs --name');
    if (newThread.area) needArea(board, newThread.area);
    next = { ...board, threads: [...list(board, 'threads'), { key: newThread.key, name: newThread.name, ...(newThread.area ? { area: newThread.area } : {}), state: 'live', 'routed-to': null }] };
  } else needThread(board, to);
  const items = list(next, 'items');
  const missing = itemKeys.filter((k) => !items.some((i) => i.key === k));
  if (missing.length) throw bad(`board move: no item ${missing.join(', ')}`);
  const target = newThread ? newThread.key : to;
  next = { ...next, items: items.map((i) => (itemKeys.includes(i.key) ? { ...i, thread: target } : i)) };
  return report(writeBoard(dir, path, next, { original: board }), { moved: itemKeys, to: target });
}

/** Move threads into another area. */
export function boardRegroup(dir, threadKeys, area, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  needArea(board, area);
  for (const k of threadKeys) needThread(board, k);
  const w = writeBoard(dir, path, { ...board, threads: list(board, 'threads').map((t) => (threadKeys.includes(t.key) ? { ...t, area } : t)) }, { original: board });
  return report(w, { regrouped: threadKeys, area });
}

/** The places outside `items` that name an item: work packets, briefs, budgets, sketches, tensions, replacements. */
function namesOf(board, key) {
  const where = [];
  for (const w of list(board, 'work')) if ((w.items ?? []).includes(key)) where.push(`work ${w.key}`);
  for (const b of list(board, 'briefs')) for (const c of b.criteria ?? []) if ((c.items ?? []).includes(key)) where.push(`brief ${b.key}`);
  for (const b of list(board, 'budgets')) if (b.decision === key) where.push(`budget ${b.key}`);
  for (const s of list(board, 'sketches')) if ((s.items ?? []).includes(key)) where.push(`sketch ${s.key}`);
  for (const i of list(board, 'items')) {
    if (i.key !== key && ((i.between ?? []).includes(key) || i['replaced-by'] === key)) where.push(`item ${i.key}`);
  }
  if (list(board, 'selected').includes(key)) where.push('selected');
  return where;
}

/** The board with items removed that nothing else on the board names. */
export function removeItems(board, itemKeys) {
  const items = list(board, 'items');
  const missing = itemKeys.filter((k) => !items.some((i) => i.key === k));
  if (missing.length) throw bad(`board remove: no item ${missing.join(', ')}`);
  for (const k of itemKeys) {
    const where = namesOf(board, k).filter((w) => !itemKeys.some((other) => w === `item ${other}`));
    if (where.length) throw bad(`board remove: ${k} is named by ${where.join(', ')}; change those first, or mark the item with replaced-by or scope: cut`, 'Change the entries that name the item first, or mark the item with replaced-by or scope: cut, then run the command again.');
  }
  return { ...board, items: items.filter((i) => !itemKeys.includes(i.key)) };
}

/** Remove items that nothing else on the board names. */
export function boardRemove(dir, itemKeys, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  return report(writeBoard(dir, path, removeItems(board, itemKeys), { original: board }), { removed: itemKeys });
}

/** The `field=value` arguments of `board set` as fields: JSON when the value parses, else text; an empty value is null. */
export function boardFieldArgs(args) {
  if (!args.length) throw bad('board set: give at least one field=value');
  return Object.fromEntries(args.map((a) => {
    const n = String(a).indexOf('=');
    if (n < 1) throw bad(`board set: ${a} is not field=value`);
    const raw = String(a).slice(n + 1);
    if (raw === '') return [a.slice(0, n), null];
    try { return [a.slice(0, n), JSON.parse(raw)]; } catch { return [a.slice(0, n), raw]; }
  }));
}

/** Set fields of one entry (`key`), or of the board itself (`key` null). A null value removes the field. */
export function boardSet(dir, key, fields, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  return report(writeBoard(dir, path, setEntryFields(board, key, fields), { original: board }), { set: Object.keys(fields), on: key ?? 'board' });
}

/** Set one prose field (summary, story, brief or carried) from a text. */
export function boardProse(dir, what, text, { file = null, ...opts } = {}) {
  const { path, board } = readBoard(dir, file);
  return report(writeBoard(dir, path, setProse(board, what, text, opts), { original: board }), { prose: what, ...(opts.area ? { area: opts.area } : {}), ...(what === 'story' ? { session: opts.session ?? board.sessions ?? 1 } : {}) });
}

// ---------------------------------------------------------------- scope: the digest and the close

const WALKED = new Set(['decision', 'idea']);
const OPEN_KINDS = new Set(['question', 'tension', 'assumption']);
const SCOPED = new Set(['keep', 'later', 'cut', 'pending-cut']);
const STARTED_WORK = new Set(['open', 'built', 'done']);
/** The marks of a close: what the person can say about one item, by its kind. */
export const CLOSE_MARKS = Object.freeze({
  decision: ['keep', 'later', 'cut'],
  idea: ['keep', 'later', 'cut'],
  question: ['answered', 'ask', 'decide', 'drop'],
  tension: ['resolved', 'ask', 'decide', 'drop'],
  assumption: ['confirmed', 'rejected', 'ask', 'decide', 'drop'],
});

/** An open question, an open tension, or an assumption that is only named, that nothing cut or replaced. */
function isOpenOne(i) {
  if (!OPEN_KINDS.has(i.kind) || i['replaced-by'] || i.scope === 'cut' || i.scope === 'pending-cut') return false;
  if (i.kind === 'question') return i.state !== 'answered';
  if (i.kind === 'tension') return i.state !== 'resolved';
  return i.state !== 'confirmed' && i.state !== 'rejected';
}

/** True when the person has settled the item: a scope on a decision or an idea, a handling on an open item. */
function isSettled(i) {
  if (WALKED.has(i.kind)) return SCOPED.has(i.scope);
  if (isOpenOne(i)) return Boolean(i['left-to-build']) || i.scope === 'later';
  return true;
}

/** The mark the agent proposes for an item that is not settled: what a confirmation records. */
export function defaultMark(i) {
  if (i.kind === 'decision') return 'keep';
  if (i.kind === 'idea') return 'later';
  if (i.kind === 'question') return i.state === 'for-plan' ? 'decide' : 'ask';
  if (i.kind === 'tension') return 'ask';
  if (i.kind === 'assumption') return 'decide';
  return null;
}

/** The area of each item, by its thread; null for an item of no known area. */
function areaIndex(board) {
  const areas = new Set(list(board, 'areas').map((a) => a.key));
  const threads = new Map(list(board, 'threads').map((t) => [t.key, t.area]));
  return (i) => { const a = threads.get(i.thread); return a && areas.has(a) ? a : null; };
}

/** The items of a started work packet: a cut of one of them waits for the person. */
function startedItems(board) {
  return new Set(list(board, 'work').filter((w) => STARTED_WORK.has(w.state)).flatMap((w) => w.items ?? []));
}

/** The fields one mark sets on one item. */
function markFields(item, mark, started) {
  if (mark && typeof mark === 'object' && !Array.isArray(mark)) {
    if (!Object.keys(mark).length) throw bad(`board close: the mark of ${item.key} is an empty object`);
    if (Object.hasOwn(mark, 'key')) throw bad(`board close: the mark of ${item.key} cannot change its key`);
    return mark.scope === 'cut' && started.has(item.key) ? { ...mark, scope: 'pending-cut' } : mark;
  }
  const allowed = CLOSE_MARKS[item.kind];
  if (!allowed) throw bad(`board close: ${item.key} is a ${item.kind}; only decisions, ideas, questions, tensions and assumptions take a mark`);
  if (!allowed.includes(mark)) throw bad(`board close: ${mark} does not fit the ${item.kind} ${item.key}; its marks are: ${allowed.join(', ')}`);
  if (mark === 'keep' || mark === 'later') return { scope: mark };
  if (mark === 'cut' || mark === 'drop') return { scope: item.kind === 'decision' && started.has(item.key) ? 'pending-cut' : 'cut' };
  if (mark === 'ask' || mark === 'decide') return { 'left-to-build': mark };
  return { state: mark };
}

/** The scope of an area from the scopes of its decisions and ideas. */
function areaScope(items) {
  const s = items.filter((i) => WALKED.has(i.kind) && !i['replaced-by']).map((i) => (i.scope === 'pending-cut' ? 'keep' : i.scope));
  if (!s.length) return 'later';
  if (s.every((x) => x === s[0]) && ['keep', 'cut', 'later'].includes(s[0])) return s[0];
  return 'mixed';
}

/** The areas that a close names: a list of area keys, or `open` for every area that is not closed or holds an item not settled. */
function closeTargets(board, areas) {
  const areaOf = areaIndex(board);
  const all = list(board, 'areas');
  if (areas === 'open') {
    const open = all.filter((a) => a.scope == null || list(board, 'items').some((i) => areaOf(i) === a.key && !i['replaced-by'] && !isSettled(i)));
    return { keys: new Set(open.map((a) => a.key)), loose: true };
  }
  const keys = Array.isArray(areas) ? areas : [areas];
  if (!keys.length) throw bad('board close: name the areas to close, or "open"');
  for (const k of keys) needArea(board, k);
  return { keys: new Set(keys), loose: false };
}

/**
 * The board with whole areas scoped in one step, after the person confirmed the proposal:
 *   { "areas": ["<area>", ...] | "open", "marks": { "<item or area key>": "<mark>" | { field: value } } }
 * Each item of those areas that is not settled takes its mark, else the default mark (a decision
 * keep, an idea later, an open question ask, a question for the plan decide, a tension ask, an
 * assumption decide). A mark on an area key applies keep, later or cut to each of its decisions
 * and ideas; cut also drops its open items. A mark on an item wins over the mark of its area.
 * A cut of a decision that a started work packet holds becomes pending-cut. Each area then gets
 * the scope its decisions and ideas add up to. `open` also takes the items of no known area.
 */
export function closeAreas(board, close) {
  if (!close || typeof close !== 'object' || Array.isArray(close)) throw bad('board close: the close part holds one JSON object');
  const odd = Object.keys(close).filter((k) => !['areas', 'marks'].includes(k));
  if (odd.length) throw bad(`board close: ${odd.join(', ')} is not a part of a close; the parts are: areas, marks`);
  const { keys, loose } = closeTargets(board, close.areas ?? 'open');
  const areaOf = areaIndex(board);
  const inTarget = (i) => (areaOf(i) ? keys.has(areaOf(i)) : loose);
  const marks = close.marks ?? {};
  const items = list(board, 'items');
  const byKey = new Map(items.map((i) => [i.key, i]));
  for (const k of Object.keys(marks)) {
    if (keys.has(k)) {
      if (!['keep', 'later', 'cut'].includes(marks[k])) throw bad(`board close: the area ${k} takes keep, later or cut, not ${JSON.stringify(marks[k])}`);
      continue;
    }
    const it = byKey.get(k);
    if (!it) throw bad(`board close: no item or closed area ${k}`);
    if (!inTarget(it)) throw bad(`board close: ${k} is not in the areas this close scopes`);
  }
  const started = startedItems(board);
  const next = items.map((i) => {
    if (i['replaced-by'] || !inTarget(i)) return i;
    const own = Object.hasOwn(marks, i.key) ? marks[i.key] : undefined;
    const areaMark = areaOf(i) && Object.hasOwn(marks, areaOf(i)) ? marks[areaOf(i)] : undefined;
    let mark = own;
    if (mark === undefined && areaMark !== undefined) {
      if (WALKED.has(i.kind)) mark = areaMark;
      else if (areaMark === 'cut' && isOpenOne(i)) mark = 'drop';
    }
    if (mark === undefined) {
      if (isSettled(i)) return i;
      mark = defaultMark(i);
      if (!mark) return i;
    }
    const fields = markFields(i, mark, started);
    const out = { ...i };
    for (const [f, v] of Object.entries(fields)) { if (v === null) delete out[f]; else out[f] = v; }
    return out;
  });
  const areas = list(board, 'areas').map((a) => (keys.has(a.key) ? { ...a, scope: areaScope(next.filter((i) => areaOf(i) === a.key)) } : a));
  return { ...board, items: next, areas };
}

/** One item as the digest gives it. */
const entryOf = (i) => ({ key: i.key, kind: i.kind, text: i.text, ...(i.core ? { core: true } : {}), ...(i['first-version'] ? { 'first-version': true } : {}), ...(i.reason ? { reason: i.reason } : {}), ...(i['accepted-risk'] ? { 'accepted-risk': i['accepted-risk'] } : {}) });

/** The most characters of the default digest. A larger board gives its item texts by area (`--area`). */
export const DIGEST_CEILING = 24000;
/**
 * The question text that the digest of `done` plans for one question, in characters. No host
 * tool and no rule of _gate-question.md states a limit; this is a reading limit (about 600 words,
 * one screen), chosen so that one question stays readable in one sitting.
 */
export const QUESTION_TEXT_BUDGET = 4000;
/** The most areas in one question of the digest of `done`. */
export const AREAS_PER_QUESTION = 4;
/** The most questions in one batch: _gate-question.md, Batches. */
export const QUESTIONS_PER_BATCH = 4;

// The plain line of one item in a question: its text and the proposal, about 40 characters more.
const lineChars = (i) => String(i.text ?? '').length + 40;
const AREA_HEADER_CHARS = 80;

/**
 * The questions of the scope digest at `done`: only the areas with something for the person to
 * look at, largest first (most items to look at), at most AREAS_PER_QUESTION areas and about
 * `budget` characters a question. An area larger than one question takes questions of its own,
 * split by its items in order.
 */
export function planDigestQuestions(areas, { budget = QUESTION_TEXT_BUDGET } = {}) {
  const todo = areas.filter((a) => a.look.length).sort((x, y) => y.look.length - x.look.length);
  const questions = [];
  let cur = null;
  for (const a of todo) {
    const chars = AREA_HEADER_CHARS + a.look.reduce((n, i) => n + lineChars(i), 0);
    if (chars > budget) {
      const parts = [];
      let part = { items: [], chars: AREA_HEADER_CHARS };
      for (const i of a.look) {
        if (part.items.length && part.chars + lineChars(i) > budget) { parts.push(part); part = { items: [], chars: AREA_HEADER_CHARS }; }
        part.items.push(i.key);
        part.chars += lineChars(i);
      }
      parts.push(part);
      parts.forEach((p, n) => questions.push({ areas: [a.key], part: n + 1, of: parts.length, items: p.items, chars: p.chars }));
      continue;
    }
    if (!cur || cur.areas.length >= AREAS_PER_QUESTION || cur.chars + chars > budget) { cur = { areas: [], items: 0, chars: 0 }; questions.push(cur); }
    cur.areas.push(a.key);
    cur.items += a.look.length;
    cur.chars += chars;
  }
  return { questions, batches: Math.ceil(questions.length / QUESTIONS_PER_BATCH) };
}

/**
 * The digest of the scope of a board, read only.
 *
 * By default it is compact: per area its name, state, scope and counts, and the text only of what
 * the person must still look at (`look`): each item that is not settled, with the mark the agent
 * proposes, and each cut that waits for the person. Settled items come as counts. `questions`
 * plans the scope question of `done` (planDigestQuestions). When the default would pass
 * DIGEST_CEILING characters, the texts of the areas planned last are left out (`look-omitted`),
 * then the areas with nothing to look at are given as a count; `--area` gives them.
 *
 * `full` gives every area with every item text: kept, later, cut, pending cut, undecided, each
 * open item with its handling, and `proposed`. `areas` (a list of area keys) gives only those
 * areas, in full. With `close`, the digest shows the board as that close would leave it.
 */
export function digestOf(board, { close = null, full = false, areas: only = null, ceiling = DIGEST_CEILING } = {}) {
  const b = close ? closeAreas(board, close) : board;
  const areaOf = areaIndex(b);
  const items = list(b, 'items').filter((i) => !i['replaced-by']);
  if (only) for (const k of only) needArea(b, k);
  const byArea = new Map();
  for (const i of items) { const k = areaOf(i); if (!byArea.has(k)) byArea.set(k, []); byArea.get(k).push(i); }
  const group = (key, name, extra = {}) => {
    const xs = byArea.get(key) ?? [];
    const pick = (pred) => xs.filter(pred).map(entryOf);
    const unsettled = xs.filter((i) => !isSettled(i));
    const proposed = Object.fromEntries(unsettled.map((i) => [i.key, defaultMark(i)]).filter(([, m]) => m));
    return {
      key, name, ...extra,
      closed: (key == null || extra.scope != null) && !unsettled.length,
      kept: pick((i) => WALKED.has(i.kind) && i.scope === 'keep'),
      later: pick((i) => WALKED.has(i.kind) && i.scope === 'later'),
      cut: pick((i) => (WALKED.has(i.kind) || OPEN_KINDS.has(i.kind)) && i.scope === 'cut'),
      'pending-cut': pick((i) => i.scope === 'pending-cut'),
      undecided: pick((i) => WALKED.has(i.kind) && !SCOPED.has(i.scope)),
      open: xs.filter(isOpenOne).map((i) => ({ ...entryOf(i), state: i.state ?? null, handling: i['left-to-build'] ?? (i.scope === 'later' ? 'later' : null) })),
      proposed,
    };
  };
  const fullAreas = list(b, 'areas').map((a) => group(a.key, a.name, { state: a.state, scope: a.scope ?? null, ...(a.brief ? { brief: a.brief } : {}) }));
  const hasLoose = (byArea.get(null) ?? []).some((i) => WALKED.has(i.kind) || OPEN_KINDS.has(i.kind));
  const all = [...fullAreas, ...(hasLoose ? [group(null, 'Items of no area')] : [])];
  const count = (f) => all.reduce((n, a) => n + (Array.isArray(a[f]) ? a[f].length : Object.keys(a[f]).length), 0);
  // The compact view of each area: counts, and the text of what the person must look at.
  const compact = all.map((a) => {
    const counts = Object.fromEntries([['kept', a.kept.length], ['later', a.later.length], ['cut', a.cut.length], ['pending-cut', a['pending-cut'].length],
      ['undecided', a.undecided.length], ['open', a.open.length], ['unsettled', Object.keys(a.proposed).length]].filter(([, n]) => n));
    const xs = byArea.get(a.key) ?? [];
    const look = [
      ...xs.filter((i) => Object.hasOwn(a.proposed, i.key)).map((i) => ({ key: i.key, kind: i.kind, text: i.text, proposed: a.proposed[i.key] })),
      ...a['pending-cut'].map((i) => ({ key: i.key, kind: i.kind, text: i.text, waits: 'cut of started work' })),
    ];
    return { key: a.key, name: a.name, ...(a.key ? { state: a.state, scope: a.scope } : {}), closed: a.closed, counts, look };
  });
  const plan = planDigestQuestions(compact);
  const head = {
    status: b.status ?? 'open',
    ...(close ? { preview: true } : {}),
    totals: { areas: fullAreas.length, kept: count('kept'), later: count('later'), cut: count('cut'), 'pending-cut': count('pending-cut'), undecided: count('undecided'), open: count('open'), unsettled: count('proposed') },
    'not-closed': fullAreas.filter((a) => !a.closed).map((a) => a.key),
    'to-look': compact.filter((a) => a.look.length).map((a) => a.key),
    questions: plan.questions,
    batches: plan.batches,
    work: [...list(b, 'work')].sort((x, y) => (x.order ?? 1e9) - (y.order ?? 1e9)).map((w) => ({ key: w.key, order: w.order ?? null, title: w.title, shape: w.shape, state: w.state, ...(w.stale ? { stale: true } : {}) })),
    'stack-confirmed': b.stack?.['user-confirmed'] === true,
  };
  if (full) return { ...head, view: 'full', areas: all };
  if (only) return { ...head, view: 'area', areas: all.filter((a) => only.includes(a.key)) };
  // The compact work list: the count by state, and in full only the work packets that `done`
  // works on: proposed ones (a `done` that stopped before the write) and stale ones.
  const states = {};
  for (const w of head.work) states[w.state] = (states[w.state] ?? 0) + 1;
  const work = { packets: head.work.length, states, open: head.work.filter((w) => w.state === 'proposed' || w.stale) };
  // The ceiling: first leave out the texts of the areas planned last, then give the areas with
  // nothing to look at as a count. The questions and the totals stay whole.
  const out = { ...head, work, view: 'compact', areas: compact };
  const size = () => JSON.stringify(out).length;
  if (size() <= ceiling) return out;
  const order = plan.questions.flatMap((q) => q.areas).filter((k, n, xs) => xs.indexOf(k) === n).reverse();
  for (const k of order) {
    if (size() <= ceiling) break;
    const a = out.areas.find((x) => x.key === k);
    if (a.look.length) { a['look-omitted'] = a.look.length; a.look = []; }
  }
  if (size() > ceiling) {
    const quiet = out.areas.filter((a) => !a.look.length && !a['look-omitted']);
    out.areas = out.areas.filter((a) => a.look.length || a['look-omitted']);
    out['settled-areas'] = { count: quiet.length, kept: quiet.reduce((n, a) => n + (a.counts.kept ?? 0), 0) };
  }
  if (size() > ceiling) out.work = { ...work, open: work.open.map((w) => w.key) };
  out.truncated = `over ${ceiling} characters: run board digest with --area <key> for the texts of an area, or --full`;
  return out;
}

/** The digest of the board in `dir`; with `close`, a preview of that close. Writes nothing. */
export function boardDigest(dir, { file = null, close = null, full = false, areas = null } = {}) {
  const { board } = readBoard(dir, file);
  return digestOf(board, { close, full, areas: areas?.length ? areas : null });
}

/**
 * Apply one change file in one write: the edit of a whole batch.
 *   { "add": { "<kind>": [entries] }, "set": { "<key>": { field: value } },
 *     "close": { "areas": [...] | "open", "marks": { "<key>": mark } }, "board": { field: value },
 *     "summary": text, "story": { "session": n, "date": d, "text": t } or text,
 *     "briefs": { "<area>": text }, "remove": [item keys] }
 * The steps run in that order. A null value removes a field.
 */
export function applyChange(board, change, { now = nowIso() } = {}) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw bad('board apply: the change file holds one JSON object');
  const known = new Set(['add', 'set', 'close', 'board', 'summary', 'story', 'briefs', 'remove']);
  const odd = Object.keys(change).filter((k) => !known.has(k));
  if (odd.length) throw bad(`board apply: ${odd.join(', ')} is not a part of a change; the parts are: ${[...known].join(', ')}`);
  let next = board;
  const done = [];
  const order = ['area', 'thread', 'item', 'work', 'sketch', 'budget', 'brief', 'log'];
  const add = change.add ?? {};
  for (const k of Object.keys(add)) if (!BOARD_KINDS.includes(k)) throw bad(`board apply: add.${k} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  for (const kind of order) {
    if (add[kind] == null) continue;
    const xs = Array.isArray(add[kind]) ? add[kind] : [add[kind]];
    if (!xs.length) continue;
    next = addEntries(next, kind, xs, { now });
    done.push(`add ${xs.length} ${kind}`);
  }
  for (const [key, fields] of Object.entries(change.set ?? {})) { next = setEntryFields(next, key, fields); done.push(`set ${key}`); }
  if (change.close) { next = closeAreas(next, change.close); done.push(`close ${Array.isArray(change.close.areas) ? change.close.areas.join(', ') : change.close.areas ?? 'open'}`); }
  if (change.board) { next = setEntryFields(next, null, change.board); done.push('set board'); }
  for (const [area, text] of Object.entries(change.briefs ?? {})) { next = setProse(next, 'brief', text, { area, now }); done.push(`brief ${area}`); }
  if (change.summary != null) { next = setProse(next, 'summary', change.summary, { now }); done.push('summary'); }
  if (change.story != null) {
    const s = typeof change.story === 'string' ? { text: change.story } : change.story;
    next = setProse(next, 'story', s.text, { session: s.session ?? null, date: s.date ?? null, now });
    done.push('story');
  }
  if (change.remove?.length) { next = removeItems(next, change.remove); done.push(`remove ${change.remove.length}`); }
  return { board: next, done };
}

/** Apply one change file to the board in one write. */
export function boardApply(dir, change, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  const { board: next, done } = applyChange(board, change);
  return report(writeBoard(dir, path, next, { original: board }), { applied: done });
}

/**
 * Render the document from the board now. With `check`, write nothing and say whether the
 * document shows the board (`stale: false`). A render after another script wrote the board
 * (`campaign.mjs archive`, `write`, `migrate`) brings the document up to date.
 */
export function boardRender(dir, { file = null, check = false } = {}) {
  const { path, board } = readBoard(dir, file);
  if (check) {
    const plan = prepareDocument(dir, basename(path), board);
    return { document: plan.document, stale: plan.stale || Boolean(plan.adopted), ...(plan.adopted ? { adopt: true } : {}), ...(plan.warnings.length ? { warnings: plan.warnings } : {}) };
  }
  return report(writeBoard(dir, path, board, { touch: false }), { rendered: true });
}

/**
 * Read the prose of a hand-written document into the board, after a snapshot of both files to
 * history/, then render. A render does this by itself on the first write; run it on resume so
 * the person sees the adopted text first.
 */
export function boardAdopt(dir, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  const w = writeBoard(dir, path, board, { touch: false });
  return report(w, { adopted: w.adopted ?? { taken: [], carried: [] } });
}

/** The items of the board, optionally of one thread. */
export function boardItems(dir, { thread = null, file = null } = {}) {
  const { board } = readBoard(dir, file);
  return list(board, 'items').filter((i) => !thread || i.thread === thread);
}
