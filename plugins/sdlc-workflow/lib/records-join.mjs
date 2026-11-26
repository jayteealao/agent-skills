// A new computer joins the records, and a fresh checkout finds its project.
//
//   join      clone the records repo into ~/.sdlc/records with the settings that every system
//             needs (no line-end conversion, long paths), give the computer its name, check the
//             image store, and run one sync. A cloud session clones without blobs and with a
//             sparse checkout of one project and `.machines/`, and is named `cloud-<id>`.
//   the map   each computer writes the normalised remote URL of each product repo into its
//             machine facts; a checkout with no link finds its project there.
//   names     a file name that is not in NFC form, or that differs from another only in case,
//             is kept out of the commits: macOS and Windows would make one file of the two.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { writeFileAtomic } from './atomic-write.mjs';
import { machineConfigPath, machineName, readMachineConfig, sdlcHomeDir } from './home.mjs';
import { getObject, imagesConfig } from './records-images.mjs';

const git = (cwd, args, o = {}) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout: o.timeout ?? 60 * 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
};

/** The remote URL of a repo, without scheme, user, `.git` or case of the host: `github.com/owner/repo`. */
export function normalizeRemote(url) {
  let s = String(url ?? '').trim();
  if (!s) return null;
  const scp = /^[^@/:]+@([^:/]+):(.+)$/.exec(s);
  if (scp) s = `${scp[1]}/${scp[2]}`;
  else s = s.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '');
  s = s.replace(/\.git\/?$/i, '').replace(/\/+$/, '');
  const [host, ...rest] = s.split('/');
  return rest.length ? `${host.toLowerCase().replace(/:\d+$/, '')}/${rest.join('/')}` : null;
}

/** The normalised `origin` of the product repo at `root`, or null. */
export function productRemote(root) {
  const r = git(root, ['remote', 'get-url', 'origin']);
  return r.ok ? normalizeRemote(r.out) : null;
}

/** The projects of the records whose product repo has this remote, from every machine's facts. */
export function projectsForRemote(home, remote) {
  if (!remote) return [];
  const found = new Set();
  let names = [];
  try { names = readdirSync(join(home, '.machines')).filter((n) => n.endsWith('.json')); } catch { return []; }
  for (const n of names) {
    let facts = null;
    try { facts = JSON.parse(readFileSync(join(home, '.machines', n), 'utf8')); } catch { continue; }
    for (const [project, p] of Object.entries(facts?.projects ?? {})) if (p?.remote === remote) found.add(project);
  }
  return [...found].sort();
}

/** Why a set of paths may not be committed as it is: names not in NFC, and names that differ only in case. */
export function nameProblems(paths) {
  const out = new Map();
  const fold = new Map();
  for (const p of paths) {
    if (p !== p.normalize('NFC')) out.set(p, 'its name is not in NFC form, so macOS and the other systems would see two names');
    const k = p.normalize('NFC').toLowerCase();
    const other = fold.get(k);
    if (other !== undefined && other !== p) out.set(p, `its name differs from ${other} only in case, so Windows and macOS would make one file of the two`);
    else fold.set(k, p);
  }
  return out;
}

/** Write one key of `records` into the machine config of this computer, keeping the others. */
function setRecordsKey(key, value, home = sdlcHomeDir()) {
  const c = readMachineConfig(home);
  c.records = { ...(c.records ?? {}), [key]: value };
  writeFileAtomic(machineConfigPath(home), `${JSON.stringify(c, null, 2)}\n`);
}

/** A name for a cloud session: `cloud-<6 hex>`, unless the config names it already. */
export const cloudName = () => `cloud-${randomBytes(3).toString('hex')}`;

/**
 * Clone the records repo for this computer. `cloud` with `project`: a blobless clone with a
 * sparse checkout of that project and `.machines/`. Returns `{ ok, home, machine, store, reason? }`.
 */
export function joinRecords(url, { home = join(sdlcHomeDir(), 'records'), cloud = false, project = null, sdlc = sdlcHomeDir() } = {}) {
  if (existsSync(join(home, '.git'))) return { ok: false, reason: `a records clone exists at ${home}` };
  if (cloud && !project) return { ok: false, reason: 'a cloud session joins with one project: give --project' };
  const args = ['clone', '-q', '-c', 'core.autocrlf=false', '-c', 'core.longpaths=true', ...(cloud ? ['--filter=blob:none', '--sparse'] : []), url, home];
  const c = git(sdlc, args);
  if (!c.ok) return { ok: false, reason: `the clone failed: ${c.err.split('\n')[0]}` };
  for (const [k, v] of [['core.autocrlf', 'false'], ['core.longpaths', 'true'], ['core.quotepath', 'false']]) git(home, ['config', k, v]);
  if (cloud) {
    const s = git(home, ['sparse-checkout', 'set', '.machines', project]);
    if (!s.ok) return { ok: false, reason: `the sparse checkout failed: ${s.err.split('\n')[0]}` };
  }
  let machine = readMachineConfig(sdlc).records?.machine ?? null;
  if (!machine && cloud) { machine = cloudName(); setRecordsKey('machine', machine, sdlc); }
  machine ??= machineName(readMachineConfig(sdlc));
  return { ok: true, home, machine, sparse: cloud ? ['.machines', project] : null };
}

/** Check the image store with a read of an object that does not exist: 404 means that the key works. */
export async function checkStore(cfg = imagesConfig()) {
  if (!cfg) return { ok: true, store: null };
  const r = await getObject(cfg, '0'.repeat(64)).catch((e) => ({ ok: false, why: e.message }));
  if (r.ok || /no such object/.test(r.why ?? '')) return { ok: true, store: `${cfg.endpoint}/${cfg.bucket}` };
  return { ok: false, store: `${cfg.endpoint}/${cfg.bucket}`, why: r.why };
}

/** The sparse paths of a clone, or null when it has no sparse checkout. */
export function sparsePaths(home) {
  if (git(home, ['config', '--get', 'core.sparseCheckout']).out !== 'true') return null;
  const l = git(home, ['sparse-checkout', 'list']);
  return l.ok ? l.out.split('\n').map((s) => s.trim()).filter(Boolean) : null;
}
