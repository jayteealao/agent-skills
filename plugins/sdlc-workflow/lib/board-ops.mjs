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
//   apply    one change file with any of the above: the edit of a whole batch in one call
//   render   the document from the board, now
//   adopt    the prose of a hand-written document into the board, then render
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { prepareDocument } from './brainstorm-doc.mjs';
import { frontmatterOfDoc } from './records.mjs';
import { formatValidationErrors, validateBrainstormBoard } from './schema-validator.mjs';

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
  if (!existsSync(path)) throw new Error(`board: no board at ${path}`);
  return { path, board: JSON.parse(readFileSync(path, 'utf8')) };
}

function assertValid(board) {
  const v = validateBrainstormBoard(board);
  if (!v.valid) throw new Error(`board: the change would break the board, so nothing is written:\n${formatValidationErrors(v.errors)}`);
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
    throw new Error(`board: ${e.message}\nNothing is written.`);
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
  if (!list(b, 'threads').some((t) => t.key === key)) throw new Error(`board: no thread ${key}; the threads are: ${names(list(b, 'threads'))}`);
}
function needArea(b, key) {
  if (!list(b, 'areas').some((a) => a.key === key)) throw new Error(`board: no area ${key}; the areas are: ${names(list(b, 'areas'))}`);
}

// ---------------------------------------------------------------- the changes, as pure steps

/** The board with entries of one kind added. Each keyed entry needs a new key. */
export function addEntries(board, kind, entries, { now = nowIso() } = {}) {
  if (!BOARD_KINDS.includes(kind)) throw new Error(`board add: ${kind} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  const add = Array.isArray(entries) ? entries : [entries];
  const field = FIELD[kind];
  const keys = SHARED.has(kind) ? keysOf(board) : new Set(list(board, field).map((x) => x?.key).filter(Boolean));
  for (const e of add) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('board add: each entry is a JSON object');
    if (kind === 'log') continue;
    if (!KEY.test(String(e.key ?? ''))) throw new Error(`board add: the key ${e.key} is not kebab-case words`);
    if (keys.has(e.key)) throw new Error(`board add: the key ${e.key} is in use; keys are unique across areas, threads, items and work`);
    if ((kind === 'item' || kind === 'sketch') && e.thread) needThread(board, e.thread);
    if (kind === 'thread' && e.area) needArea(board, e.area);
    keys.add(e.key);
  }
  const sessions = Number(board.sessions) || 1;
  const fill = (e) => {
    if (kind === 'thread') return { state: 'live', 'routed-to': null, ...e };
    if (kind === 'area') return { state: 'open', scope: null, ...e };
    // A new decision records when the person made it.
    if (kind === 'item' && e.kind === 'decision') return { ...e, session: e.session ?? sessions, 'decided-at': e['decided-at'] ?? now };
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
  if (!hits.length) throw new Error(`board set: no entry ${key} among the areas, threads, items, work, sketches, budgets and briefs`);
  if (hits.length > 1) throw new Error(`board set: ${key} names entries in ${hits.map((h) => h[0]).join(' and ')}; rename one of them`);
  return hits[0];
}

/**
 * The board with fields set on the entry `key`, or on the board itself when `key` is null.
 * A null value removes the field.
 */
export function setEntryFields(board, key, fields) {
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) throw new Error('board set: give at least one field=value');
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
    if (blocked.length) throw new Error(`board set: ${blocked.join(', ')} change only with their own command (board add, prose, move, regroup or remove)`);
    return apply(board);
  }
  if (Object.hasOwn(fields, 'key')) throw new Error('board set: a key is stable once written; add a new entry and mark the old one instead');
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
    if (!t) throw new Error('board prose summary: the text is empty');
    return { ...board, summary: t };
  }
  if (what === 'story') {
    if (!t) throw new Error('board prose story: the text is empty');
    const n = session == null ? Number(board.sessions) || 1 : Number(session);
    if (!Number.isInteger(n) || n < 1) throw new Error(`board prose story: --session ${session} is not a session number`);
    const day = date ?? now.slice(0, 10);
    const stories = list(board, 'stories').filter((s) => s.session !== n);
    const prior = list(board, 'stories').find((s) => s.session === n);
    return { ...board, stories: [...stories, { ...prior, session: n, text: t, date: prior?.date && !date ? prior.date : day }].sort((a, b) => a.session - b.session) };
  }
  if (what === 'brief') {
    if (!area) throw new Error('board prose brief: --area <area> is required');
    needArea(board, area);
    if (!t) throw new Error('board prose brief: the text is empty');
    return { ...board, areas: list(board, 'areas').map((a) => (a.key === area ? { ...a, brief: t } : a)) };
  }
  if (what === 'carried') {
    if (!heading) throw new Error('board prose carried: --heading <heading> is required');
    const rest = list(board, 'carried').filter((c) => c.heading !== heading);
    const prior = list(board, 'carried').find((c) => c.heading === heading);
    return { ...board, carried: t ? [...rest, { ...prior, heading, text: t }] : rest };
  }
  throw new Error(`board prose: ${what} is not a prose field; the fields are: ${PROSE_KINDS.join(', ')}`);
}

// ---------------------------------------------------------------- the commands

/** Add entries of one kind. Each keyed entry needs a new key. */
export function boardAdd(dir, kind, entries, { file = null } = {}) {
  if (!BOARD_KINDS.includes(kind)) throw new Error(`board add: ${kind} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
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
    if (keysOf(board).has(newThread.key)) throw new Error(`board move: the key ${newThread.key} is in use`);
    if (!KEY.test(String(newThread.key ?? ''))) throw new Error(`board move: the key ${newThread.key} is not kebab-case words`);
    if (!newThread.name) throw new Error('board move: a new thread needs --name');
    if (newThread.area) needArea(board, newThread.area);
    next = { ...board, threads: [...list(board, 'threads'), { key: newThread.key, name: newThread.name, ...(newThread.area ? { area: newThread.area } : {}), state: 'live', 'routed-to': null }] };
  } else needThread(board, to);
  const items = list(next, 'items');
  const missing = itemKeys.filter((k) => !items.some((i) => i.key === k));
  if (missing.length) throw new Error(`board move: no item ${missing.join(', ')}`);
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
  if (missing.length) throw new Error(`board remove: no item ${missing.join(', ')}`);
  for (const k of itemKeys) {
    const where = namesOf(board, k).filter((w) => !itemKeys.some((other) => w === `item ${other}`));
    if (where.length) throw new Error(`board remove: ${k} is named by ${where.join(', ')}; change those first, or mark the item with replaced-by or scope: cut`);
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
  if (!args.length) throw new Error('board set: give at least one field=value');
  return Object.fromEntries(args.map((a) => {
    const n = String(a).indexOf('=');
    if (n < 1) throw new Error(`board set: ${a} is not field=value`);
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

/**
 * Apply one change file in one write: the edit of a whole batch.
 *   { "add": { "<kind>": [entries] }, "set": { "<key>": { field: value } }, "board": { field: value },
 *     "summary": text, "story": { "session": n, "date": d, "text": t } or text,
 *     "briefs": { "<area>": text }, "remove": [item keys] }
 * The steps run in that order. A null value removes a field.
 */
export function applyChange(board, change, { now = nowIso() } = {}) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) throw new Error('board apply: the change file holds one JSON object');
  const known = new Set(['add', 'set', 'board', 'summary', 'story', 'briefs', 'remove']);
  const odd = Object.keys(change).filter((k) => !known.has(k));
  if (odd.length) throw new Error(`board apply: ${odd.join(', ')} is not a part of a change; the parts are: ${[...known].join(', ')}`);
  let next = board;
  const done = [];
  const order = ['area', 'thread', 'item', 'work', 'sketch', 'budget', 'brief', 'log'];
  const add = change.add ?? {};
  for (const k of Object.keys(add)) if (!BOARD_KINDS.includes(k)) throw new Error(`board apply: add.${k} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  for (const kind of order) {
    if (add[kind] == null) continue;
    const xs = Array.isArray(add[kind]) ? add[kind] : [add[kind]];
    if (!xs.length) continue;
    next = addEntries(next, kind, xs, { now });
    done.push(`add ${xs.length} ${kind}`);
  }
  for (const [key, fields] of Object.entries(change.set ?? {})) { next = setEntryFields(next, key, fields); done.push(`set ${key}`); }
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
