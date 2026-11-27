// Images of the records, outside git. With `records.images` in ~/.sdlc/config.json, an image or
// a video of the records clone never goes into a commit. In its place, a small reference file
// beside it goes into the commit: `<file>.img.json`, with `{ sha256, bytes, machine, at }`.
//
//   design images   the files under `<project>/_design/` and under a `design*` folder of a
//                   workflow. They go to an object store (a Cloudflare bucket, or any store with
//                   the Amazon storage API) at
//                   the key `sha256/<hash>`, written once with `If-None-Match: *`: an object
//                   never changes. The upload comes first, then the reference: a reference is
//                   never ahead of its object.
//   evidence        every other image (verify evidence most of all) stays on the computer that
//                   made it. Its reference says `local: <machine>`; another computer reports
//                   "on <machine> only", and no gate fails for it.
//
// A reader on another computer gets the file through `fetchImages`: from the cache
// (~/.sdlc/cache/sha256/<hash>, outside the records) or from the store, with the hash checked,
// and copies it into the live folder, where the guard of the sync keeps it out of the commits.
// So the design server, the canvas and the gates read the plain path, as before.
//
// The configuration of a computer (its key never goes into the records, a log or a message):
//   { "records": { "images": { "endpoint": "https://<account>.r2.cloudflarestorage.com",
//       "bucket": "wf-records", "keyId": "...", "secret": "...", "region": "auto" } } }
//
// The sync entry points run the network part in a child process (`node records-images.mjs
// <upload|fetch> <json>`), so a synchronous caller (the committer, a gate) can use them.
import { createHash, createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFileAtomic } from './atomic-write.mjs';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';

export const IMAGE_RE = /\.(png|jpe?g|webp|gif|mp4|webm)$/i;
/** The globs of the same files, for a git pathspec (a test holds the two together). */
export const IMAGE_GLOBS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'].map((e) => `**/*.${e}`);
export const REF_SUFFIX = '.img.json';
const MAX_BYTES = 200 * 1024 * 1024;
const SAVE_EVERY = 200;

export const isImage = (p) => IMAGE_RE.test(String(p));
export const refPathOf = (p) => `${p}${REF_SUFFIX}`;

/** True for an image that goes to the store: under `_design/`, or under a `design*` folder of a workflow. */
export function isDesignImage(rel) {
  const parts = String(rel).replace(/\\/g, '/').split('/');
  if (parts.length < 3) return false;
  if (parts[1] === '_design') return true;
  return parts.slice(2, -1).some((x) => /^design/i.test(x));
}

/** The store settings of this computer, or null when images stay in git. */
export function imagesConfig(config = readMachineConfig()) {
  const c = config?.records?.images;
  return c && typeof c === 'object' && c.endpoint && c.bucket ? c : null;
}

export const cacheDir = (home = sdlcHomeDir()) => join(home, 'cache', 'sha256');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const HASH_RE = /^[0-9a-f]{64}$/;

/** The reference of an image, or null. */
export function readRef(file) {
  try {
    const r = JSON.parse(readFileSync(refPathOf(file), 'utf8'));
    return r && HASH_RE.test(r.sha256 ?? '') ? r : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- the store (the Amazon storage API, signature version 4)

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, s) => createHmac('sha256', key).update(s).digest();

/** The headers of a signed request (AWS signature version 4, which a Cloudflare bucket takes with region `auto`). */
export function signRequest({ method, url, headers = {}, body = Buffer.alloc(0), keyId, secret, region = 'auto', now = new Date() }) {
  const u = new URL(url);
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const payload = sha256(body);
  const all = { ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()])), host: u.host, 'x-amz-content-sha256': payload, 'x-amz-date': amzDate };
  const names = Object.keys(all).sort();
  const canonical = [
    method,
    u.pathname.split('/').map((s) => enc(decodeURIComponent(s))).join('/'),
    [...u.searchParams].map(([k, v]) => `${enc(k)}=${enc(v)}`).sort().join('&'),
    names.map((n) => `${n}:${all[n]}\n`).join(''),
    names.join(';'),
    payload,
  ].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${keyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

function objectUrl(cfg, hash) {
  return `${String(cfg.endpoint).replace(/\/+$/, '')}/${cfg.bucket}/sha256/${hash}`;
}

/** Put an object once: an object that exists is the same bytes, so a 412 is a success. */
export async function putObject(cfg, hash, body) {
  const url = objectUrl(cfg, hash);
  const headers = signRequest({ method: 'PUT', url, headers: { 'if-none-match': '*', 'content-type': 'application/octet-stream' }, body, keyId: cfg.keyId, secret: cfg.secret, region: cfg.region ?? 'auto' });
  const r = await fetch(url, { method: 'PUT', headers, body });
  if (r.ok || r.status === 412) return { ok: true, existed: r.status === 412 };
  return { ok: false, why: `the store answered ${r.status}` };
}

export async function getObject(cfg, hash) {
  const url = objectUrl(cfg, hash);
  const headers = signRequest({ method: 'GET', url, keyId: cfg.keyId, secret: cfg.secret, region: cfg.region ?? 'auto' });
  const r = await fetch(url, { headers });
  if (!r.ok) return { ok: false, why: r.status === 404 ? 'the store has no such object' : `the store answered ${r.status}` };
  return { ok: true, body: Buffer.from(await r.arrayBuffer()) };
}

// ---------------------------------------------------------------- upload

const indexPath = (home) => join(home, 'images-index.json');
function readIndex(home) { try { return JSON.parse(readFileSync(indexPath(home), 'utf8')); } catch { return {}; } }

/** The image files of the clone, relative to it (no `.git`). */
export function imageFiles(clone, under = '') {
  const out = [];
  const walk = (abs, rel) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else if (e.isFile() && isImage(e.name)) out.push(r);
    }
  };
  walk(under ? join(clone, ...under.split('/')) : clone, under);
  return out;
}

/**
 * Give every image of the clone its reference: upload a design image, then write its reference;
 * an evidence image gets a `local` reference. An image whose size and time did not change since
 * the last pass is not read again. The index of what was read is saved every SAVE_EVERY images,
 * so a pass that is stopped keeps its work. With `budgetMs`, the pass uploads no more once the
 * time is spent: the images left wait for the next pass (`deferred`), so a large backlog does not
 * hold back the commit of a sync. Returns `{ uploaded, local, deferred, failed: [{ path, why }] }`.
 */
export async function uploadImages(clone, { home = sdlcHomeDir(), machine, cfg = imagesConfig(readMachineConfig(home)), budgetMs = null } = {}) {
  const out = { uploaded: [], local: [], deferred: 0, failed: [] };
  if (!cfg) return out;
  const index = readIndex(home);
  const seen = {};
  const until = budgetMs == null ? Infinity : Date.now() + budgetMs;
  let read = 0;
  for (const rel of imageFiles(clone)) {
    if (rel.split('/').length < 2 || rel.startsWith('.')) continue;
    const file = join(clone, ...rel.split('/'));
    let st;
    try { st = statSync(file); } catch { continue; }
    const known = index[rel];
    const ref = readRef(file);
    if (known && known.size === st.size && known.mtimeMs === st.mtimeMs && ref?.sha256 === known.sha256) { seen[rel] = known; continue; }
    if (st.size > MAX_BYTES) { out.failed.push({ path: rel, why: `over ${MAX_BYTES >> 20} MB` }); continue; }
    // Past the budget, an image that needs a read waits; what the index knows is kept for it.
    if (Date.now() > until) { out.deferred += 1; if (known) seen[rel] = known; continue; }
    if (++read % SAVE_EVERY === 0) writeFileAtomic(indexPath(home), JSON.stringify({ ...index, ...seen }));
    const body = readFileSync(file);
    const hash = sha256(body);
    seen[rel] = { size: st.size, mtimeMs: st.mtimeMs, sha256: hash };
    if (ref?.sha256 === hash) continue;
    const row = { sha256: hash, bytes: body.length, machine, at: new Date().toISOString() };
    if (isDesignImage(rel)) {
      const p = await putObject(cfg, hash, body).catch((e) => ({ ok: false, why: e.message }));
      if (!p.ok) { out.failed.push({ path: rel, why: p.why }); delete seen[rel]; continue; }
      writeFileAtomic(refPathOf(file), `${JSON.stringify(row, null, 2)}\n`);
      out.uploaded.push(rel);
    } else {
      writeFileAtomic(refPathOf(file), `${JSON.stringify({ ...row, local: machine }, null, 2)}\n`);
      out.local.push(rel);
    }
  }
  writeFileAtomic(indexPath(home), JSON.stringify(seen));
  return out;
}

// ---------------------------------------------------------------- fetch

/** The references under `dirs` (absolute folders of the clone) whose image is absent or other. */
function wanted(dirs) {
  const out = [];
  const walk = (abs) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(abs, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(REF_SUFFIX)) out.push(p.slice(0, -REF_SUFFIX.length));
    }
  };
  for (const d of dirs) if (d && existsSync(d)) walk(d);
  return out.filter((file) => !existsSync(file));
}

/** True when a folder holds a reference whose image is absent: the cheap test before a fetch. */
export const needsFetch = (dirs) => wanted(dirs).length > 0;

/**
 * Bring the absent images of `dirs` into the live folder. Returns `{ fetched, local: [{ file,
 * machine }], failed: [{ file, why }] }`: `local` is an image that stays on another computer.
 */
export async function fetchImages(dirs, { home = sdlcHomeDir(), machine = null, cfg = imagesConfig(readMachineConfig(home)), place = process.env.SDLC_MCP_READ !== '1' } = {}) {
  const out = { fetched: [], cached: [], local: [], failed: [] };
  for (const file of wanted(dirs)) {
    const ref = readRef(file);
    if (!ref) { out.failed.push({ file, why: 'its reference is not readable' }); continue; }
    const cached = join(cacheDir(home), ref.sha256);
    let body = existsSync(cached) ? readFileSync(cached) : null;
    if (body && sha256(body) !== ref.sha256) body = null;
    // Evidence stays on the computer that made it: there, the cache gives it back (a fresh clone
    // after the rewrite); anywhere else, it is "on <machine> only".
    if (ref.local && !body) {
      out[ref.local === machine ? 'failed' : 'local'].push(ref.local === machine ? { file, why: 'made on this computer, and gone from it and from its cache' } : { file, machine: ref.local });
      continue;
    }
    if (!body) {
      if (!cfg) { out.failed.push({ file, why: 'this computer has no image store (records.images)' }); continue; }
      const g = await getObject(cfg, ref.sha256).catch((e) => ({ ok: false, why: e.message }));
      if (!g.ok) { out.failed.push({ file, why: g.why }); continue; }
      if (sha256(g.body) !== ref.sha256) { out.failed.push({ file, why: 'the object does not match its hash' }); continue; }
      body = g.body;
      writeFileAtomic(cached, body);
    }
    // A read (a call of the MCP server) fills the cache and nothing else; the gate counts a cached
    // image as present.
    if (place) {
      const tmp = `${file}.fetch-${process.pid}`;
      mkdirSync(dirname(file), { recursive: true });
      copyFileSync(cached, tmp);
      renameSync(tmp, file);
      out.fetched.push(file);
    } else out.cached.push(file);
  }
  return out;
}

// ---------------------------------------------------------------- the synchronous entry points

const SELF = fileURLToPath(import.meta.url);
function child(verb, args, timeout) {
  const r = spawnSync(process.execPath, [SELF, verb, JSON.stringify(args)], { encoding: 'utf8', windowsHide: true, timeout, env: process.env });
  try { return JSON.parse(r.stdout); } catch { return { error: (r.stderr || `the ${verb} of the images stopped`).trim().split('\n')[0] }; }
}

/** `uploadImages` for a synchronous caller (the committer). */
export const uploadImagesSync = (clone, opts) => child('upload', { clone, ...opts }, 10 * 60_000);

/** `fetchImages` for a synchronous caller (a gate), only when something is absent. */
export function fetchImagesSync(dirs, opts = {}) {
  if (!needsFetch(dirs)) return { fetched: [], cached: [], local: [], failed: [] };
  return child('fetch', { dirs, ...opts }, 5 * 60_000);
}

/**
 * Fold the fetch into the problems of a gate: a file that could not be fetched says so, apart
 * from a file that was never made; a file that stays on another computer fails no gate.
 */
export function foldFetch(problems, fetched, root) {
  if (!problems?.length || !fetched) return problems;
  const tail = (f) => relative(root, f).replace(/\\/g, '/').split('/').slice(-2).join('/');
  const present = [...(fetched.local ?? []).map((l) => tail(l.file)), ...(fetched.cached ?? []).map(tail)];
  const failed = new Map((fetched.failed ?? []).map((f) => [tail(f.file), f.why]));
  const out = [];
  for (const p of problems) {
    if (present.some((t) => p.includes(t))) continue;
    const hit = [...failed.keys()].find((t) => p.includes(t));
    out.push(hit ? `cannot fetch ${hit}: ${failed.get(hit)}` : p);
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [verb, json] = process.argv.slice(2);
  const args = JSON.parse(json ?? '{}');
  const run = verb === 'upload' ? uploadImages(args.clone, args) : verb === 'fetch' ? fetchImages(args.dirs, args) : Promise.reject(new Error(`no verb ${verb}`));
  run.then((r) => process.stdout.write(JSON.stringify(r)), (e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
