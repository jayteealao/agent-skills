// The path forms of `record set`, shared by the CLI and the library (lib/wf-api.mjs).
//
//   field=value               set a field (null deletes it)
//   a.b=value                 set a field in a map
//   list[<slug>].field=value  set a field of the list item whose slug (or id, or name) is <slug>
//   list[0].field=value       set a field of the list item at a position
//   list+=value               append to a list (an equal item already there is kept once)
//   list-=value               remove from a list: equal items, or the item whose slug is the value
//
// A value reads as YAML: `in-progress`, `3`, `[a, b]`, `{slug: x, status: defined}`, `null`.
import { parse as parseYaml } from './yaml.mjs';
import { undoGitBashPath } from './msys.mjs';

export const PATH_FORMS = 'field=v, a.b=v, list[<slug>].field=v, list[0].field=v, list+=v, list-=v';

const SEGMENT = /^([A-Za-z0-9_-]+)(?:\[([^\]]+)\])?$/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (item) => (item && typeof item === 'object' ? item.slug ?? item.id ?? item.name ?? null : null);

/** `key=value`, `key+=value` or `key-=value` → { path, op, value, key }. */
export function parseSetArg(arg, { onRepair = null } = {}) {
  const m = /^([^=+-][^=]*?)(\+=|-=|=)([\s\S]*)$/.exec(String(arg));
  if (!m) throw new Error(`record set: ${arg} is not a path form. The forms are: ${PATH_FORMS}`);
  const [, key, op, rawValue] = m;
  const path = parsePath(key, 'record set');
  // Git Bash turns `key=/wf ...` into `key=C:/Program Files/Git/wf ...`; lib/msys.mjs undoes it.
  const { value: raw, repaired } = undoGitBashPath(rawValue);
  if (repaired && onRepair) onRepair(key, raw);
  let value;
  try { value = raw === '' ? '' : parseYaml(raw); } catch { value = raw; }
  return { path, op, value, key };
}

/** `a.b`, `list[<slug>].field` or `list[0]` → [{ key, sel? }]. `verb` names the command in an error. */
export function parsePath(key, verb = 'record set') {
  return String(key).split('.').map((seg) => {
    const s = SEGMENT.exec(seg);
    if (!s) throw new Error(`${verb}: ${key} is not a path. The forms are: ${PATH_FORMS}`);
    return s[2] === undefined ? { key: s[1] } : { key: s[1], sel: s[2] };
  });
}

function selectIn(list, sel, where, verb = 'record set') {
  if (!Array.isArray(list)) throw new Error(`${verb}: ${where} is not a list`);
  if (/^\d+$/.test(sel)) {
    const i = Number(sel);
    if (i >= list.length) throw new Error(`${verb}: ${where} has ${list.length} item(s); position ${i} is not one of them`);
    return i;
  }
  const i = list.findIndex((item) => keyOf(item) === sel);
  if (i < 0) throw new Error(`${verb}: ${where} has no item ${sel}; its items are: ${list.map(keyOf).filter(Boolean).join(', ') || 'none'}`);
  return i;
}

/**
 * The value at a path of `record set` (`slices[api].status`, `progress.plan`), for `record get
 * --field`. A field that is not there is an error that names the fields at that level.
 */
export function getPath(fm, key) {
  const verb = 'record get';
  let at = fm;
  const path = parsePath(key, verb);
  for (let n = 0; n < path.length; n += 1) {
    const { key: k, sel } = path[n];
    const where = path.slice(0, n + 1).map((p) => p.key).join('.');
    if (!at || typeof at !== 'object' || Array.isArray(at) || !Object.hasOwn(at, k)) {
      const fields = at && typeof at === 'object' && !Array.isArray(at) ? Object.keys(at) : [];
      throw new Error(`${verb}: no field ${where}; the fields there are: ${fields.join(', ') || 'none'}`);
    }
    at = at[k];
    if (sel !== undefined) at = at[selectIn(at, sel, where, verb)];
  }
  return at;
}

/** A copy of a map or a list, so a change never edits the object that was read. */
const copy = (v) => (Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...v } : v);

/**
 * Apply one parsed change to a frontmatter object, in place. Returns the top-level key that
 * changed. A list item is copied on the way, so the caller's input stays unchanged.
 */
export function applySet(fm, { path, op, value, key }) {
  let at = fm;
  const last = path.length - 1;
  for (let n = 0; n <= last; n += 1) {
    const { key: k, sel } = path[n];
    const where = path.slice(0, n + 1).map((p) => p.key).join('.');
    if (n === last && sel === undefined) {
      if (op === '=') {
        if (value === null) delete at[k]; else at[k] = value;
      } else {
        const list = at[k] === undefined ? [] : at[k];
        if (!Array.isArray(list)) throw new Error(`record set: ${key}: ${where} is not a list, so ${op} does not apply`);
        if (op === '+=') at[k] = list.some((i) => same(i, value)) ? [...list] : [...list, value];
        else {
          const kept = list.filter((i) => !same(i, value) && !(typeof value === 'string' && keyOf(i) === value));
          if (kept.length === list.length) throw new Error(`record set: ${key}: ${where} has no item ${JSON.stringify(value)}`);
          at[k] = kept;
        }
      }
      break;
    }
    at[k] = copy(at[k] ?? (sel === undefined ? {} : undefined));
    if (sel === undefined) { at = at[k]; continue; }
    const i = selectIn(at[k], sel, where);
    if (n === last) {
      if (op !== '=') throw new Error(`record set: ${key}: ${op} needs a list, not a list item`);
      if (value === null) at[k].splice(i, 1); else at[k][i] = value;
      break;
    }
    at[k][i] = copy(at[k][i]);
    at = at[k][i];
  }
  return path[0].key;
}

/**
 * The enum that the schema allows at a path, or null. `def` is the definition of the record
 * type; `resolve` follows a $ref.
 */
export function enumAt(def, path, resolve) {
  let node = def;
  for (const { key, sel } of path) {
    node = resolve(node?.properties?.[key]);
    if (sel !== undefined) node = resolve(node?.items);
    if (!node) return null;
  }
  return Array.isArray(node?.enum) ? node.enum : null;
}
