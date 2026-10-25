// The edits of a brainstorm board in one call each: `wf.mjs board add|move|regroup|remove`, and
// the `wf.board` namespace of the library. Each edit reads the board, changes it, validates the
// whole board against $defs.brainstormBoard, and writes it only when it is valid, so no edit
// leaves a board that the write hook would refuse.
//
//   add      an item, a thread or an area
//   move     items into a thread (with `newThread`, the thread is made first)
//   regroup  threads into another area
//   remove   items that nothing else names
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatterOfDoc } from './records.mjs';
import { formatValidationErrors, validateBrainstormBoard } from './schema-validator.mjs';

export const BOARD_KINDS = ['item', 'thread', 'area'];
const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

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

function writeBoard(path, board) {
  const next = { ...board, 'updated-at': nowIso() };
  const v = validateBrainstormBoard(next);
  if (!v.valid) throw new Error(`board: the change would break the board, so nothing is written:\n${formatValidationErrors(v.errors)}`);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, path);
  return next;
}

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

/** Add entries of one kind (`item`, `thread` or `area`). Each entry needs a new key. */
export function boardAdd(dir, kind, entries, { file = null } = {}) {
  if (!BOARD_KINDS.includes(kind)) throw new Error(`board add: ${kind} is not a kind; the kinds are: ${BOARD_KINDS.join(', ')}`);
  const { path, board } = readBoard(dir, file);
  const add = Array.isArray(entries) ? entries : [entries];
  const keys = keysOf(board);
  for (const e of add) {
    if (!e || typeof e !== 'object') throw new Error('board add: each entry is a JSON object');
    if (!KEY.test(String(e.key ?? ''))) throw new Error(`board add: the key ${e.key} is not kebab-case words`);
    if (keys.has(e.key)) throw new Error(`board add: the key ${e.key} is in use; keys are unique across areas, threads, items and work`);
    if (kind === 'item' && e.thread) needThread(board, e.thread);
    if (kind === 'thread' && e.area) needArea(board, e.area);
    keys.add(e.key);
  }
  const field = { item: 'items', thread: 'threads', area: 'areas' }[kind];
  const defaults = { thread: { state: 'live', 'routed-to': null }, area: { state: 'open', scope: null } }[kind] ?? {};
  const next = { ...board, [field]: [...list(board, field), ...add.map((e) => ({ ...defaults, ...e }))] };
  writeBoard(path, next);
  return { added: add.map((e) => e.key), kind };
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
  writeBoard(path, next);
  return { moved: itemKeys, to: target };
}

/** Move threads into another area. */
export function boardRegroup(dir, threadKeys, area, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  needArea(board, area);
  for (const k of threadKeys) needThread(board, k);
  writeBoard(path, { ...board, threads: list(board, 'threads').map((t) => (threadKeys.includes(t.key) ? { ...t, area } : t)) });
  return { regrouped: threadKeys, area };
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

/** Remove items that nothing else on the board names. */
export function boardRemove(dir, itemKeys, { file = null } = {}) {
  const { path, board } = readBoard(dir, file);
  const items = list(board, 'items');
  const missing = itemKeys.filter((k) => !items.some((i) => i.key === k));
  if (missing.length) throw new Error(`board remove: no item ${missing.join(', ')}`);
  for (const k of itemKeys) {
    const where = namesOf(board, k).filter((w) => !itemKeys.some((other) => w === `item ${other}`));
    if (where.length) throw new Error(`board remove: ${k} is named by ${where.join(', ')}; change those first, or mark the item with replaced-by or scope: cut`);
  }
  writeBoard(path, { ...board, items: items.filter((i) => !itemKeys.includes(i.key)) });
  return { removed: itemKeys };
}

/** The items of the board, optionally of one thread. */
export function boardItems(dir, { thread = null, file = null } = {}) {
  const { board } = readBoard(dir, file);
  return list(board, 'items').filter((i) => !thread || i.thread === thread);
}
