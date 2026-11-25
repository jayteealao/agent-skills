// The operations of wf.mjs, read from the forms in the header of scripts/wf.mjs: each form gives
// one or more operations (`record get`, `findings table`, `findings metrics`), with their
// positional arguments and their flags. A tool call names an operation and gives its arguments
// by name; `argvOf` builds the command line that a person would type, and `callOf` reads one.
// The header is the one source: a form that changes there changes here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BOOLEAN_FLAGS } from '../cli-flags.mjs';

export const WF_SCRIPT = join(fileURLToPath(new URL('../..', import.meta.url)), 'scripts', 'wf.mjs');

/** The blocks of the header comment of a script: `{ name, form, about }`. */
export function headerBlocks(file = WF_SCRIPT) {
  const src = readFileSync(file, 'utf8');
  const head = src.slice(src.indexOf('/**'), src.indexOf('*/'));
  const blocks = [];
  for (const line of head.split(/\r?\n/)) {
    const m = /^ \* {3}(\S+)(.*)$/.exec(line);
    if (m) blocks.push({ name: m[1], form: `${m[1]}${m[2]}`, about: [] });
    else if (blocks.length && /^ \* {4,}\S/.test(line)) blocks.at(-1).about.push(line.replace(/^ \*\s+/, ''));
  }
  return blocks.map((b) => ({ ...b, about: b.about.join(' ') }));
}

const TOKEN = /\[?\(?<[^>]*>[^\s]*|"[^"]*"|\S+/g;
const plainVerb = /^[a-z][a-z-]*(\|[a-z][a-z-]*)*$/;
const angleVerbs = /^<([a-z][a-z -]*(\|[a-z][a-z -]*)+)>$/;
const nameOf = (inner) => inner.split('|')[0].replace(/=.*/, '').replace(/\.\.\.$/, '').replace(/\.tokens\.json$/, '-files').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

/** The operations of one form. A form whose first word lists verbs gives one operation for each verb. */
export function opsOfForm(block) {
  const tokens = block.form.match(TOKEN).slice(1);
  // `design server start [--port n]|stop|status` lists its verbs around a flag.
  if (block.name === 'design' && tokens[0] === 'server' && tokens[1] === 'start') {
    return ['start', 'stop', 'status'].map((v) => op(block, ['design', 'server', v], v === 'start' ? ['[--port', 'n]'] : []));
  }
  let verbs = [[block.name]];
  let i = 0;
  for (; i < tokens.length; i += 1) {
    const t = tokens[i];
    const alt = angleVerbs.exec(t)?.[1] ?? (plainVerb.test(t) ? t : null);
    if (!alt) break;
    const words = alt.split('|').map((w) => w.trim().split(' ')[0]);
    verbs = verbs.flatMap((v) => words.map((w) => [...v, w]));
  }
  return verbs.map((v) => op(block, v, tokens.slice(i)));
}

function op(block, words, rest) {
  const positionals = [];
  const flags = new Map();
  let depth = 0;
  let flagDepth = null;
  let afterDash = false;
  let value = false;
  for (const raw of rest) {
    const opens = (raw.match(/[[(]/g) ?? []).length;
    const closes = (raw.match(/[\])]/g) ?? []).length;
    const bare = raw.replace(/^[[(]+/, '');
    if (raw === '[--]' || raw === '--') { afterDash = true; continue; }
    if (flagDepth === null && bare.startsWith('--')) flagDepth = depth + Math.min(opens, 1);
    for (const m of raw.matchAll(/--([a-z][a-z0-9-]*)/g)) flags.set(m[1], { name: m[1], boolean: BOOLEAN_FLAGS.has(m[1]) });
    // A flag outside brackets takes the next word as its value: `--to <slug>`.
    const isValue = value;
    value = flagDepth === null || (depth === 0 && !opens) ? /^--[a-z][a-z0-9-]*$/.test(raw) && !BOOLEAN_FLAGS.has(raw.slice(2)) : false;
    if (isValue) { depth += opens - closes; continue; }
    if (flagDepth === null) {
      const inner = /<([^>]*)>/.exec(raw)?.[1] ?? (/^\[?([a-z][a-zA-Z=.]*)\.\.\.\]?$/.exec(raw)?.[1] ?? null);
      if (inner) {
        const literal = inner.includes('|') && !inner.includes('<') && /^[a-z|-]+$/.test(inner);
        positionals.push({
          // A list of words (`<item|thread|area>`) is the type of the call: `kind` is a flag of some forms.
          name: literal ? 'type' : nameOf(inner),
          optional: raw.startsWith('[') || depth > 0,
          variadic: raw.includes('...') || afterDash,
          ...(literal ? { values: inner.split('|') } : {}),
          ...(afterDash ? { afterDash: true } : {}),
        });
      }
    }
    depth += opens - closes;
    if (flagDepth !== null && depth < flagDepth) flagDepth = null;
    if (flagDepth !== null && depth === 0 && !opens && !closes) flagDepth = null;
  }
  // The about text names the flags of a form that runs over more lines.
  for (const m of block.about.matchAll(/(?<![\w-])--([a-z][a-z0-9-]*)/g)) if (!flags.has(m[1])) flags.set(m[1], { name: m[1], boolean: BOOLEAN_FLAGS.has(m[1]) });
  return { name: words.join(' '), words, form: block.form, about: block.about, positionals, flags: [...flags.values()] };
}

let cached = null;
/** Every operation of wf.mjs, by name. */
export function allOps() {
  if (cached) return cached;
  cached = new Map();
  for (const b of headerBlocks()) for (const o of opsOfForm(b)) {
    // Two forms of one operation (status with and without --brief) join their arguments.
    const had = cached.get(o.name);
    if (!had) { cached.set(o.name, { ...o, forms: [o.form] }); continue; }
    had.forms.push(o.form);
    for (const p of o.positionals) if (!had.positionals.some((q) => q.name === p.name)) had.positionals.push({ ...p, optional: true });
    for (const f of o.flags) if (!had.flags.some((g) => g.name === f.name)) had.flags.push(f);
  }
  return cached;
}

const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]).map(String);

/**
 * The command line of a call: `{ root, <positional>: value, <flag>: value }`. A list fills a
 * variadic positional, or joins with commas for a flag (`--mode` repeats). Throws on a field that
 * the operation does not have, or a missing positional.
 */
export function argvOf(opName, fields = {}) {
  const o = allOps().get(opName);
  if (!o) throw new Error(`no operation ${opName}`);
  const known = new Set([...o.positionals.map((p) => p.name), ...o.flags.map((f) => f.name)]);
  const extra = Object.keys(fields).filter((k) => !known.has(k) && fields[k] !== undefined);
  if (extra.length) throw new Error(`${opName} has no field ${extra.join(', ')}; its fields are: ${[...known].join(', ') || 'none'}`);
  const before = [];
  const after = [];
  for (const p of o.positionals) {
    const v = fields[p.name];
    if (v === undefined || v === null || v === '') {
      if (!p.optional) throw new Error(`${opName} needs ${p.name}`);
      continue;
    }
    if (p.values && !p.values.includes(String(v))) throw new Error(`${opName}: ${p.name} is one of ${p.values.join(', ')}`);
    (p.afterDash ? after : before).push(...(p.variadic ? asList(v) : [String(v)]));
  }
  const flags = [];
  for (const f of o.flags) {
    const v = fields[f.name];
    if (v === undefined || v === null || v === false) continue;
    if (f.boolean) { flags.push(`--${f.name}`); continue; }
    if (f.name === 'mode' && Array.isArray(v)) for (const x of v) flags.push('--mode', String(x));
    else flags.push(`--${f.name}`, Array.isArray(v) ? v.join(',') : String(v));
  }
  return [...o.words, ...before, ...flags, ...(after.length ? ['--', ...after] : [])];
}

/** The operation and the fields of a command line: the reverse of `argvOf`. */
export function callOf(argv) {
  const ops = [...allOps().values()].sort((a, b) => b.words.length - a.words.length);
  const o = ops.find((x) => x.words.every((w, i) => argv[i] === w));
  if (!o) return null;
  const pos = [];
  const fields = {};
  const rest = argv.slice(o.words.length);
  const dash = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--') { dash.push(...rest.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (BOOLEAN_FLAGS.has(name)) fields[name] = true;
      else {
        const v = rest[(i += 1)];
        fields[name] = name === 'mode' && fields.mode ? [fields.mode, v].flat() : v;
      }
    } else pos.push(a);
  }
  const fill = (list, values) => {
    const required = list.filter((p) => !p.optional).length;
    let spare = values.length - required;
    for (let k = 0; k < list.length && values.length; k += 1) {
      const p = list[k];
      if (p.optional && spare <= 0) continue;
      if (p.optional) spare -= 1;
      if (p.variadic) {
        const keep = list.slice(k + 1).filter((q) => !q.optional).length;
        fields[p.name] = values.splice(0, Math.max(1, values.length - keep));
      } else fields[p.name] = values.shift();
    }
  };
  fill(o.positionals.filter((p) => !p.afterDash), pos);
  fill(o.positionals.filter((p) => p.afterDash), dash);
  return { op: o.name, fields };
}
