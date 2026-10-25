// The /wf key registry, skills/wf/keys.json: its loader, its shape check and its host rows.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REGISTRY_REL = join('skills', 'wf', 'keys.json');
export const HOSTS = [['claude', 'Claude Code'], ['codex', 'Codex'], ['pi', 'pi']];
const HOST_VALUE = /^(full|differs: \S.*|gap: \S.*)$/;

export function loadRegistry(root = PLUGIN_ROOT) {
  return JSON.parse(readFileSync(join(root, REGISTRY_REL), 'utf8'));
}

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

/** The words that a slug may not be, because Step 0 reads them as a command word first. */
export function reservedWords(reg) {
  const words = new Set();
  for (const k of reg.keys) {
    words.add(k.name);
    for (const s of k.subkeys ?? []) words.add(s.name);
    for (const m of k.modes ?? []) words.add(m.name);
  }
  return words;
}

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
    if (k.alias !== undefined) {
      // An alias keeps an old key for one release: it names a stage key, and is no stage itself.
      if (!(reg.keys ?? []).some((x) => x.name === k.alias && x.stage)) errors.push(`${k.name}: alias ${k.alias} is not a stage key`);
      if (k.stage) errors.push(`${k.name}: an alias is not a stage`);
    }
    for (const s of k.subkeys ?? []) { checkRef(`${k.name} ${s.name}`, s.reference); checkHosts(`${k.name} ${s.name}`, s.hosts); }
    for (const m of k.modes ?? []) {
      checkRef(`${k.name} ${m.name}`, m.reference);
      if (!['entry', 'maintenance'].includes(m.kind)) errors.push(`${k.name} ${m.name}: kind must be entry or maintenance`);
      if (m.hosts) checkHosts(`${k.name} ${m.name}`, m.hosts);
    }
  }
  return errors;
}
