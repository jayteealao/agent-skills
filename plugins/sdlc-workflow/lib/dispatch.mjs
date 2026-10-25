// Step 0 of skills/wf/SKILL.md in code: the tokens of a /wf call → the key, the reference
// that runs it, and where the key's own arguments start.
//
// The grammar of an argument form (keys.json `args`):
//   <slug> <slice> <branch> <mode>        a token checked on disk or against the registry
//   <dimension> <aggregate> <env> <path>  a token that the reference checks itself
//   <run-id>
//   pr#N                                  `pr#` and a number
//   text                                  every token left (one at least)
//   word                                  only that word
//   a|b|c                                 one of the choices
//   [ ... ]                               an optional group
// A token that the caller could not pass safely arrives as `@`; it fits only `text`.
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { safeParseFrontmatter } from './frontmatter.mjs';

export const UNSAFE = '@';
export const SAFE_TOKEN = /^[A-Za-z0-9#._/-]+$/;
const FREE_SLOTS = new Set(['dimension', 'aggregate', 'env', 'path', 'run-id']);

/** Parse one form into a sequence of items. An item is `{ alts: [atom], optional: false }` or `{ group: seq }`. */
export function parseForm(form) {
  let i = 0;
  const s = form.trim();
  function seq(close) {
    const items = [];
    for (;;) {
      while (s[i] === ' ') i += 1;
      if (i >= s.length) { if (close) throw new Error(`form "${form}": no closing ]`); return items; }
      if (s[i] === ']') { if (!close) throw new Error(`form "${form}": stray ]`); i += 1; return items; }
      if (s[i] === '[') { i += 1; items.push({ group: seq(true) }); continue; }
      let word = '';
      while (i < s.length && !' []'.includes(s[i])) word += s[i++];
      items.push({ alts: word.split('|').map(atomOf) });
    }
  }
  return seq(false);
}

function atomOf(word) {
  const m = /^<([a-z-]+)>$/.exec(word);
  if (m) return { slot: m[1] };
  if (word === 'text') return { text: true };
  if (word === 'pr#N') return { pr: true };
  return { word };
}

const atomName = (a) => (a.slot ? `<${a.slot}>` : a.text ? 'text' : a.pr ? 'pr#N' : a.word);
const itemName = (it) => (it.alts ? it.alts.map(atomName).join('|') : `[${it.group.map(itemName).join(' ')}]`);

/**
 * Every way the tokens fit the items: each result is `{ ok: true, slug }` or a miss
 * `{ ok: false, at, reason }`. `check(atom, token, state)` answers a slot on disk.
 */
function fit(items, tokens, i, state, check) {
  if (!items.length) {
    return i === tokens.length ? [{ ok: true, state }] : [{ ok: false, at: i, reason: `${tokens[i]} does not fit the form` }];
  }
  const [head, ...rest] = items;
  if (head.group) {
    // An optional group: take it, or skip it.
    return [...fit([...head.group, ...rest], tokens, i, state, check), ...fit(rest, tokens, i, state, check)];
  }
  if (i >= tokens.length) return [{ ok: false, at: i, reason: `missing ${itemName(head)}` }];
  const out = [];
  const t = tokens[i];
  for (const a of head.alts) {
    if (a.text) {
      for (let j = tokens.length; j > i; j -= 1) out.push(...fit(rest, tokens, j, state, check));
      continue;
    }
    if (t === UNSAFE) { out.push({ ok: false, at: i, reason: `a token does not fit ${itemName(head)}` }); continue; }
    if (a.word) {
      out.push(...(t === a.word ? fit(rest, tokens, i + 1, state, check) : [{ ok: false, at: i, reason: `${t} does not fit ${itemName(head)}` }]));
    } else if (a.pr) {
      out.push(...(/^pr#\d+$/.test(t) ? fit(rest, tokens, i + 1, state, check) : [{ ok: false, at: i, reason: `${t} does not fit ${itemName(head)}` }]));
    } else {
      const r = check(a.slot, t, state);
      out.push(...(r.ok ? fit(rest, tokens, i + 1, r.state ?? state, check) : [{ ok: false, at: i, reason: r.reason }]));
    }
  }
  return out;
}

/** Fit the tokens to every form; the first fit wins. A miss names the furthest reason. */
export function fitForms(forms, tokens, check) {
  let best = null;
  for (const form of forms) {
    for (const r of fit(parseForm(form), tokens, 0, {}, check)) {
      if (r.ok) return { ok: true, form, state: r.state };
      if (!best || r.at > best.at) best = r;
    }
  }
  return { ok: false, reason: best?.reason ?? 'no form fits' };
}

/** The disk facts that Step 0 reads: workflows, slice rosters and local branches. */
export function diskFacts(projectRoot, { git = defaultGit } = {}) {
  const wf = join(projectRoot, '.ai', 'workflows');
  return {
    hasWorkflow: (slug) => SAFE_TOKEN.test(slug) && !slug.includes('/') && existsSync(join(wf, slug, '00-index.md')),
    hasWorkflowDir: (slug) => SAFE_TOKEN.test(slug) && !slug.includes('/') && existsSync(join(wf, slug)),
    slicesOf: (slug) => {
      const file = join(wf, slug, '03-slice.md');
      if (!existsSync(file)) return [];
      const { data } = safeParseFrontmatter(readFileSync(file, 'utf8'));
      return (Array.isArray(data?.slices) ? data.slices : []).map((x) => (typeof x === 'string' ? x : x?.slug)).filter(Boolean);
    },
    hasBranch: (name) => SAFE_TOKEN.test(name) && !name.startsWith('-') && git(projectRoot, ['branch', '--list', name]).trim() !== '',
  };
}

function defaultGit(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}

function slotCheck(reg, disk) {
  const modes = new Set((reg.keys.find((k) => k.name === 'intake')?.modes ?? []).map((m) => m.name));
  return (slot, t, state) => {
    if (slot === 'slug') return disk.hasWorkflow(t) ? { ok: true, state: { ...state, slug: t } } : { ok: false, reason: `${t} not on disk` };
    if (slot === 'slice') {
      if (!state.slug) return { ok: false, reason: `${t} not on disk` };
      return disk.slicesOf(state.slug).includes(t) ? { ok: true } : { ok: false, reason: `${t} not on disk` };
    }
    if (slot === 'branch') return disk.hasBranch(t) ? { ok: true } : { ok: false, reason: `${t} not on disk` };
    if (slot === 'mode') return modes.has(t) ? { ok: true } : { ok: false, reason: `${t} does not fit <mode>` };
    if (FREE_SLOTS.has(slot)) return { ok: true };
    return { ok: false, reason: `unknown slot <${slot}>` };
  };
}

const ROUTE = 'reference/route.md';

/**
 * Dispatch the tokens of one /wf call.
 * @returns {{ key: string|null, reference: string|null, argsFrom: number, reason: string|null,
 *   firstInput?: string, subkeys?: Array<{ name: string, reference: string }>, hostNote?: string }}
 * `argsFrom` is the index of the first token that the reference receives as its arguments.
 */
export function dispatch(reg, tokens, disk, { host = null } = {}) {
  if (!tokens.length) return { key: null, reference: ROUTE, argsFrom: 0, reason: 'empty' };
  const key = reg.keys.find((k) => k.name === tokens[0]);
  if (!key) return { key: null, reference: ROUTE, argsFrom: 0, reason: 'not a key' };
  const route = (reason) => ({ key: key.name, reference: ROUTE, argsFrom: 0, reason });
  const hostOf = (row) => (host ? String(row.hosts?.[host] ?? '') : '');
  const gapOf = (row) => {
    const v = hostOf(row);
    return v.startsWith('gap: not available') ? v.slice(4).trim() : null;
  };
  const noteOf = (row) => {
    const v = hostOf(row);
    return v.startsWith('gap:') || v.startsWith('differs:') ? v : undefined;
  };

  const keyGap = gapOf(key);
  if (keyGap) return { key: key.name, reference: null, argsFrom: 1, reason: `host gap: ${keyGap}` };

  // Sub-keys: the next token names one, or the person picks one.
  if (key.subkeys?.length) {
    const sub = key.subkeys.find((s) => s.name === tokens[1]);
    if (!sub) {
      if (key.needs === 'sub-key') {
        return { key: key.name, reference: null, argsFrom: 1, reason: 'ask sub-key', subkeys: key.subkeys.map((s) => ({ name: s.name, reference: s.reference })) };
      }
    } else {
      const subGap = gapOf(sub);
      if (subGap) return { key: `${key.name} ${sub.name}`, reference: null, argsFrom: 2, reason: `host gap: ${subGap}` };
      const forms = key.args.filter((f) => f.split(' ')[0].split('|').includes(sub.name));
      const r = fitForms(forms.length ? forms : key.args, tokens.slice(1), slotCheck(reg, disk));
      if (!r.ok) return route(r.reason);
      return { key: `${key.name} ${sub.name}`, reference: sub.reference, argsFrom: 2, reason: null, hostNote: noteOf(sub) };
    }
  }

  // The intake fast path: a mode word that is not also a workflow folder.
  if (key.modes?.length && tokens.length > 1) {
    const mode = key.modes.find((m) => m.name === tokens[1]);
    if (mode && !disk.hasWorkflowDir(tokens[1])) {
      return {
        key: `${key.name} ${mode.name}`, reference: mode.reference, argsFrom: 2, reason: null,
        firstInput: 'reference/intake/_intake-context.md', hostNote: noteOf(mode),
      };
    }
  }

  const r = fitForms(key.args, tokens.slice(1), slotCheck(reg, disk));
  if (!r.ok) return route(r.reason);
  const alias = key.alias ? { aliasOf: key.alias } : {};
  return { key: key.name, reference: key.reference, argsFrom: 1, reason: null, hostNote: noteOf(key), ...alias };
}

/** The `wf dispatch:` line of SKILL.md Step 0. */
export function dispatchLine(result, tokens) {
  const args = tokens.slice(result.argsFrom);
  return `wf dispatch: key=${result.key ?? '(none)'} · args=${args.length ? args.join(' ') : '(none)'} · reference=${result.reference ?? '(none)'}`;
}
