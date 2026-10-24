#!/usr/bin/env node
// scripts/generate.mjs — writes the files that copy the /wf key surface from skills/wf/keys.json:
// the key tables and argument hint of SKILL.md, the key count of route.md, the README key
// table, the manifest descriptions, the catalog description and agents/openai.yaml.
//
//   node scripts/generate.mjs           write every target
//   node scripts/generate.mjs --check   write nothing; exit 1 and name each target that differs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY_REL = join('skills', 'wf', 'keys.json');

export function loadRegistry(root = PLUGIN_ROOT) {
  return JSON.parse(readFileSync(join(root, REGISTRY_REL), 'utf8'));
}

export const HOSTS = [['claude', 'Claude Code'], ['codex', 'Codex'], ['pi', 'pi']];
const HOST_VALUE = /^(full|differs: \S.*|gap: \S.*)$/;

/** The shape errors of a registry: missing fields, unknown groups, bad host values, missing reference files. */
export function registryErrors(reg, root = PLUGIN_ROOT) {
  const errors = [];
  const groups = new Set((reg.groups ?? []).map((g) => g.id));
  const names = new Set();
  const checkHosts = (id, hosts) => {
    for (const [h] of HOSTS) {
      if (!HOST_VALUE.test(String(hosts?.[h] ?? ''))) errors.push(`${id}: host ${h} must be "full", "differs: <how>" or "gap: <reason>"`);
    }
  };
  const checkRef = (id, ref) => {
    if (!ref || !existsSync(join(root, 'skills', 'wf', ref))) errors.push(`${id}: reference ${ref} does not exist`);
  };
  for (const k of reg.keys ?? []) {
    if (names.has(k.name)) errors.push(`${k.name}: the key appears twice`);
    names.add(k.name);
    if (!groups.has(k.group)) errors.push(`${k.name}: unknown group ${k.group}`);
    for (const field of ['does', 'writes']) if (typeof k[field] !== 'string' || !k[field]) errors.push(`${k.name}: no ${field}`);
    if (!Array.isArray(k.args) || !k.args.length) errors.push(`${k.name}: no args`);
    if (!Array.isArray(k.artifacts)) errors.push(`${k.name}: no artifacts list`);
    checkRef(k.name, k.reference);
    checkHosts(k.name, k.hosts);
    for (const s of k.subkeys ?? []) { checkRef(`${k.name} ${s.name}`, s.reference); checkHosts(`${k.name} ${s.name}`, s.hosts); }
    for (const m of k.modes ?? []) {
      checkRef(`${k.name} ${m.name}`, m.reference);
      if (!['entry', 'maintenance'].includes(m.kind)) errors.push(`${k.name} ${m.name}: kind must be entry or maintenance`);
      if (m.hosts) checkHosts(`${k.name} ${m.name}`, m.hosts);
    }
  }
  return errors;
}
const tick = (s) => `\`${s}\``;
const orList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);
const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** Every key, sub-key and mode name with its host row, as `{ id, hosts }`. */
export function hostRows(reg) {
  const rows = [];
  for (const k of reg.keys) {
    rows.push({ id: k.name, hosts: k.hosts });
    for (const s of k.subkeys ?? []) rows.push({ id: `${k.name} ${s.name}`, hosts: s.hosts ?? k.hosts });
    for (const m of k.modes ?? []) rows.push({ id: `${k.name} ${m.name}`, hosts: m.hosts ?? k.hosts });
  }
  return rows;
}

export function context(reg) {
  const modes = reg.keys.find((k) => k.name === 'intake')?.modes ?? [];
  // Rows with the same gap hosts share one clause: `a`, `b` and `c` are not available on Codex or pi.
  const byHosts = new Map();
  for (const r of hostRows(reg)) {
    const on = HOSTS.filter(([h]) => String(r.hosts?.[h] ?? '').startsWith('gap:')).map(([, label]) => label);
    if (on.length) byHosts.set(andList(on), [...(byHosts.get(andList(on)) ?? []), tick(r.id)]);
  }
  const gaps = [...byHosts].map(([on, ids]) => `${andList(ids)} ${ids.length < 2 ? 'has a gap' : 'have gaps'} on ${on}`);
  return {
    keyCount: String(reg.keys.length),
    stageCount: String(reg.keys.filter((k) => k.stage).length),
    keyList: reg.keys.map((k) => k.name).join(', '),
    entryModes: modes.filter((m) => m.kind === 'entry').map((m) => tick(m.name)).join(', '),
    maintenanceModes: orList(modes.filter((m) => m.kind === 'maintenance').map((m) => tick(m.name))),
    hostGaps: gaps.length ? `${gaps.join('; ')}` : 'every key runs on every host',
  };
}

export function fill(text, ctx) {
  return text.replace(/\{([A-Za-z]+)\}/g, (m, name) => {
    if (typeof ctx[name] !== 'string') throw new Error(`keys.json: unknown placeholder ${m}`);
    return ctx[name];
  });
}

const cellArgs = (forms) => forms.map((f) => tick(f.replace(/\|/g, '\\|'))).join(' · ');

function hostSentence(reg) {
  const lines = [];
  for (const r of hostRows(reg)) {
    // Hosts with the same value share one line.
    const byValue = new Map();
    for (const [h, label] of HOSTS) {
      const v = String(r.hosts?.[h] ?? '');
      if (v.startsWith('gap:') || v.startsWith('differs:')) byValue.set(v, [...(byValue.get(v) ?? []), label]);
    }
    for (const [v, labels] of byValue) {
      const on = labels.length < 2 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
      lines.push(`- \`${r.id}\` on ${on}: ${v.slice(v.indexOf(':') + 1).trim()}.`);
    }
  }
  if (!lines.length) return 'Every key runs on Claude Code, Codex and pi in the same form.';
  return ['Every key runs on Claude Code, Codex and pi in the same form, with these exceptions:', '', ...lines].join('\n');
}

export function skillBlock(reg) {
  const ctx = context(reg);
  const out = [];
  for (const g of reg.groups) {
    const keys = reg.keys.filter((k) => k.group === g.id);
    out.push(`### ${g.title}`, '', '| Key | Arguments | Does | Writes |', '|---|---|---|---|');
    for (const k of keys) out.push(`| ${tick(k.name)} | ${cellArgs(k.args)} | ${fill(k.does, ctx)} | ${k.writes} |`);
    out.push('');
  }
  out.push('| Sub-key | Reference |', '|---|---|');
  for (const k of reg.keys.filter((x) => x.subkeys?.length)) {
    out.push(`| ${k.subkeys.map((s) => tick(`${k.name} ${s.name}`)).join(', ')} | ${k.subkeys.map((s) => tick(s.reference)).join(', ')} |`);
  }
  out.push('', hostSentence(reg));
  return out.join('\n');
}

/** The host table of _host-invocation.md: each row that is not the same on every host. */
export function hostTable(reg) {
  const out = ['| Key | Claude Code | Codex | pi |', '|---|---|---|---|'];
  for (const r of hostRows(reg)) {
    const vals = HOSTS.map(([h]) => String(r.hosts?.[h] ?? ''));
    if (vals.every((v) => v === 'full')) continue;
    out.push(`| ${tick(r.id)} | ${vals.map((v) => (v === 'full' ? 'full' : v.replace(/\|/g, '\\|'))).join(' | ')} |`);
  }
  return out.join('\n');
}

export function readmeBlock(reg) {
  const ctx = context(reg);
  const rows = ['| Key | Does |', '|---|---|', ...reg.keys.map((k) => `| ${tick(k.name)} | ${fill(k.summary ?? k.does, ctx)} |`)];
  return [...rows, '', `${ctx.hostGaps[0].toUpperCase()}${ctx.hostGaps.slice(1)}.`].join('\n');
}

const BEGIN = '<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->';
const END = '<!-- end generated -->';

function replaceBlock(text, block, file) {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END, a);
  if (a < 0 || b < 0) throw new Error(`${file}: no generated block markers`);
  return `${text.slice(0, a + BEGIN.length)}\n${block}\n${text.slice(b)}`;
}

function replaceOnce(text, re, to, file) {
  if (!re.test(text)) throw new Error(`${file}: ${re} does not match`);
  return text.replace(re, to);
}

/** Replace the string value of `"<key>": "…"`, the first one after `anchor` when one is given. */
function replaceJsonString(text, key, value, file, anchor = null) {
  let from = 0;
  if (anchor) {
    const m = anchor.exec(text);
    if (!m) throw new Error(`${file}: anchor ${anchor} not found`);
    from = m.index;
  }
  const re = new RegExp(`("${key}":\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  const rest = text.slice(from);
  const m = re.exec(rest);
  if (!m) throw new Error(`${file}: no "${key}" string`);
  return text.slice(0, from) + rest.slice(0, m.index) + m[1] + JSON.stringify(value) + rest.slice(m.index + m[0].length);
}

/** Each target: [path relative to the plugin root, transform(text) → text]. */
export function targets(reg) {
  const ctx = context(reg);
  const m = reg.manifest;
  const hint = `"<${reg.keys.map((k) => k.name).join('|')}> [args...]"`;
  const count = (t, f) => replaceOnce(t, /one of the \d+ keys/, `one of the ${ctx.keyCount} keys`, f);
  return [
    ['skills/wf/SKILL.md', (t, f) => count(replaceBlock(replaceOnce(t, /^argument-hint: .*$/m, `argument-hint: ${hint}`, f), skillBlock(reg), f), f)],
    ['skills/wf/reference/route.md', count],
    ['skills/wf/reference/_host-invocation.md', (t, f) => replaceBlock(t, hostTable(reg), f)],
    ['README.md', (t, f) => replaceBlock(replaceOnce(t, /^## The \d+ keys$/m, `## The ${ctx.keyCount} keys`, f), readmeBlock(reg), f)],
    ['.claude-plugin/plugin.json', (t, f) => replaceJsonString(t, 'description', fill(m.claude, ctx), f)],
    ['../../.claude-plugin/marketplace.json', (t, f) => replaceJsonString(t, 'description', fill(m.claude, ctx), f, /"name":\s*"sdlc-workflow"/)],
    ['.codex-plugin/plugin.json', (t, f) => {
      let x = replaceJsonString(t, 'description', fill(m.codex, ctx), f);
      x = replaceJsonString(x, 'shortDescription', fill(m.codexShort, ctx), f);
      return replaceJsonString(x, 'longDescription', fill(m.codexLong, ctx), f);
    }],
    ['skills/wf/agents/openai.yaml', (t, f) => {
      const x = replaceOnce(t, /^(\s*short_description: ).*$/m, `$1${JSON.stringify(fill(m.openaiShort, ctx))}`, f);
      return replaceOnce(x, /^(\s*default_prompt: ).*$/m, `$1${JSON.stringify(fill(m.openaiPrompt, ctx))}`, f);
    }],
  ];
}

/** Run every target. Returns the relative paths whose content differs from the generated form. */
export function generate({ root = PLUGIN_ROOT, write = true } = {}) {
  const reg = loadRegistry(root);
  const errors = registryErrors(reg, root);
  if (errors.length) throw new Error(`keys.json:\n  ${errors.join('\n  ')}`);
  const changed = [];
  for (const [rel, transform] of targets(reg)) {
    const abs = join(root, rel);
    const before = readFileSync(abs, 'utf8');
    const crlf = before.includes('\r\n');
    const lf = before.replace(/\r\n/g, '\n');
    let after = transform(lf, rel);
    if (after === lf) continue;
    changed.push(relative(root, abs).replace(/\\/g, '/'));
    if (crlf) after = after.replace(/\n/g, '\r\n');
    if (write) writeFileSync(abs, after);
  }
  return changed;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const changed = generate({ write: !check });
  if (check && changed.length) {
    for (const f of changed) console.error(`[generate] out of date: ${f}`);
    console.error('[generate] run npm run generate');
    process.exit(1);
  }
  console.log(check ? '[generate] OK — every generated file matches keys.json' : `[generate] wrote ${changed.length} file(s)${changed.length ? `: ${changed.join(', ')}` : ''}`);
}
