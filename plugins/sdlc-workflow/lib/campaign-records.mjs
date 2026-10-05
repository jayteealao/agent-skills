// lib/campaign-records.mjs — the local records mode of /wf campaign (13).
//
// A repo that does not track .ai/ (artifactTracking: ignored, or a gitignored
// .ai/workflows) cannot carry the workflow records on the wave branches. In
// that repo the records live in the main checkout. A worktree gets a copy of
// the main .ai/ tree when the campaign adds it, and every record that the
// worktree creates or changes comes back before the campaign removes it.
//
// The sync is three-way and never deletes: a manifest in the main checkout
// keeps, for each file, the content hash that both sides last agreed on (the
// base). A side whose hash equals the base did not change the file. When both
// sides changed a file, the main copy stays, and the worktree copy is kept in
// the conflict store, so neither version is lost. Every copy goes to a temp
// file first, its hash is checked, and a rename puts it in place.
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const MANIFEST_VERSION = 1;
/** The workflow registry: a both-sides change merges its rows (status.md, INDEX.md). */
export const REGISTRY = 'workflows/INDEX.md';
/** Machine-local files. They never travel: each checkout keeps its own. */
const MACHINE_LOCAL = new Set(['.watch-state.json']);
const TEMP_RE = /\.records-\d+-[0-9a-f]+\.tmp$/;

const posix = (p) => p.split('\\').join('/');

/** True for a path (relative to .ai/, posix) that the sync never copies: machine-local files, render caches, its own temp files. */
export function isSkipped(rel) {
  const parts = rel.split('/');
  const base = parts[parts.length - 1];
  return MACHINE_LOCAL.has(base) || parts.includes('_view') || TEMP_RE.test(base);
}

export function hashFile(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

/** Every file under `dir`, keyed by its posix path relative to `dir`. Links are listed apart: the sync never follows them. */
export function walk(dir) {
  const files = new Map();
  const links = [];
  if (!existsSync(dir)) return { files, links };
  const visit = (abs, rel) => {
    for (const name of readdirSync(abs)) {
      const a = join(abs, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(a);
      if (st.isSymbolicLink()) links.push(r);
      else if (st.isDirectory()) visit(a, r);
      else if (st.isFile()) files.set(r, a);
    }
  };
  visit(dir, '');
  return { files, links };
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Write `bytes` to `dest` by temp file and rename, then check the hash on disk. Throws when the check fails. */
function putVerified(dest, bytes, hash, mtime = null) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = join(dirname(dest), `.records-${process.pid}-${randomBytes(4).toString('hex')}.tmp`);
  writeFileSync(tmp, bytes);
  if (hashFile(tmp) !== hash) {
    rmSync(tmp, { force: true });
    throw new Error(`records: the temp copy of ${dest} does not match its source`);
  }
  if (mtime) utimesSync(tmp, mtime, mtime);
  // Windows refuses a rename onto a file that another process holds open for a moment.
  for (let i = 0; ; i++) {
    try { renameSync(tmp, dest); break; } catch (e) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { rmSync(tmp, { force: true }); throw e; }
      pause(100 * (i + 1));
    }
  }
  if (hashFile(dest) !== hash) throw new Error(`records: ${dest} does not match its source after the copy`);
}

function copyVerified(src, dest, hash) {
  putVerified(dest, readFileSync(src), hash, statSync(src).mtime);
}

export function loadManifest(file, id) {
  try {
    const m = JSON.parse(readFileSync(file, 'utf8'));
    if (m && m.files) return m;
  } catch { /* absent or torn: start again; a missing base only makes the sync more careful */ }
  return { version: MANIFEST_VERSION, id, files: {} };
}

export function saveManifest(file, manifest, now) {
  manifest['updated-at'] = now;
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  putVerified(file, text, createHash('sha256').update(text).digest('hex'));
}

const entryOf = (manifest, rel) => (manifest.files[rel] ??= { base: null, kept: [] });

/**
 * The registry rows of both sides, merged: one row per slug, the row with the
 * newer updated-at (column 5) wins, and the main header stays.
 */
export function mergeRegistry(mainText, otherText) {
  const header = [];
  const rows = new Map();
  const take = (text, isMain) => {
    for (const line of String(text).split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (line.startsWith('#')) { if (isMain) header.push(line); continue; }
      const cols = line.split('\t');
      const prev = rows.get(cols[0]);
      if (!prev || String(cols[4] ?? '') > String(prev[4] ?? '')) rows.set(cols[0], cols);
    }
  };
  take(mainText, true);
  take(otherText, false);
  const body = [...rows.keys()].sort().map((k) => rows.get(k).join('\t'));
  return `${[...header, ...body].join('\n')}\n`;
}

/**
 * Main to worktree. A file the worktree lacks is copied, unless the worktree
 * deleted it after an earlier copy. A file the worktree did not change since
 * the base takes the main version. A file the worktree changed stays: `out`
 * brings it back. `exclude(rel)` keeps folders that the main checkout owns.
 */
export function recordsIn({ main, worktree, manifest, exclude = () => false }) {
  const src = walk(join(main, '.ai'));
  const dst = walk(join(worktree, '.ai'));
  const res = { copied: [], refreshed: [], same: 0, keptInWorktree: [], deletedInWorktree: [] };
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const mh = hashFile(abs);
    const e = manifest.files[rel];
    const target = join(worktree, '.ai', ...rel.split('/'));
    if (!dst.files.has(rel)) {
      if (e?.base) { res.deletedInWorktree.push(rel); continue; }
      copyVerified(abs, target, mh);
      entryOf(manifest, rel).base = mh;
      res.copied.push(rel);
      continue;
    }
    const wh = hashFile(dst.files.get(rel));
    if (wh === mh) { entryOf(manifest, rel).base = mh; res.same++; continue; }
    if (e?.base && wh === e.base) {
      copyVerified(abs, target, mh);
      e.base = mh;
      res.refreshed.push(rel);
      continue;
    }
    res.keptInWorktree.push(rel);
  }
  return res;
}

/**
 * Worktree to main. Never deletes and never overwrites a main change:
 * - same content on both sides: nothing to do;
 * - the worktree did not change the file since the base: the main version stays;
 * - the main checkout has no such file, or did not change it: the worktree version is copied;
 * - both sides changed it: the main version stays, the worktree version goes to
 *   the conflict store (the registry also merges its rows into the main copy).
 * A file the worktree deleted stays in the main checkout, and the result names it.
 */
export function recordsOut({ main, worktree, manifest, conflictsDir, exclude = () => false }) {
  const src = walk(join(worktree, '.ai'));
  const res = { copied: [], same: 0, unchanged: 0, conflicts: [], deletedInWorktree: [], links: src.links.filter((r) => !isSkipped(r)) };
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const wh = hashFile(abs);
    const target = join(main, '.ai', ...rel.split('/'));
    const mh = existsSync(target) ? hashFile(target) : null;
    const e = entryOf(manifest, rel);
    if (mh === wh) { e.base = wh; res.same++; continue; }
    if (e.base && wh === e.base) { res.unchanged++; continue; }
    if (mh === null || (e.base && mh === e.base)) {
      // Re-read the main side just before the copy: a writer in the main checkout may have moved it.
      const now = existsSync(target) ? hashFile(target) : null;
      if (now === mh) {
        copyVerified(abs, target, wh);
        e.base = wh;
        res.copied.push(rel);
        continue;
      }
    }
    const kept = join(conflictsDir, ...rel.split('/'));
    copyVerified(abs, kept, wh);
    if (!e.kept.includes(wh)) e.kept.push(wh);
    let merged = false;
    if (rel === REGISTRY && existsSync(target)) {
      const text = mergeRegistry(readFileSync(target, 'utf8'), readFileSync(abs, 'utf8'));
      putVerified(target, text, createHash('sha256').update(text).digest('hex'));
      merged = true;
    }
    e.base = wh;
    res.conflicts.push({ rel, kept: posix(kept), merged });
  }
  for (const [rel, e] of Object.entries(manifest.files)) {
    if (e.base && !src.files.has(rel) && !isSkipped(rel) && !exclude(rel)) res.deletedInWorktree.push(rel);
  }
  return res;
}

/**
 * The worktree files that exist nowhere else: their content is neither in the
 * main checkout at the same path, nor in the conflict store, nor the base copy
 * the worktree received. Removing the worktree with any of them would lose it.
 */
export function recordsPending({ main, worktree, manifest, exclude = () => false }) {
  const src = walk(join(worktree, '.ai'));
  const pending = src.links.filter((r) => !isSkipped(r)).map((rel) => ({ rel, reason: 'a link: the sync never follows links' }));
  for (const [rel, abs] of src.files) {
    if (isSkipped(rel) || exclude(rel)) continue;
    const wh = hashFile(abs);
    const target = join(main, '.ai', ...rel.split('/'));
    if (existsSync(target) && hashFile(target) === wh) continue;
    const e = manifest.files[rel];
    if (e && (e.base === wh || e.kept.includes(wh))) continue;
    pending.push({ rel, reason: 'not in the main checkout' });
  }
  return pending;
}

/**
 * Run `fn` while holding the records lock of the main checkout. Two syncs into
 * the main checkout never interleave. A lock older than `staleMs` is taken over.
 */
export function withRecordsLock(file, holder, fn, { waitMs = 60_000, staleMs = 15 * 60_000, now = () => new Date().toISOString() } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      writeFileSync(file, JSON.stringify({ holder, pid: process.pid, at: now() }), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let cur = null;
      try { cur = JSON.parse(readFileSync(file, 'utf8')); } catch { /* torn: judge it by its age below */ }
      const at = cur?.at ? Date.parse(cur.at) : statSync(file).mtimeMs;
      if (Date.now() - at > staleMs) { rmSync(file, { force: true }); continue; }
      if (Date.now() > until) throw new Error(`records: the records lock is held by ${cur?.holder ?? 'another sync'} since ${cur?.at ?? '?'}; try again`);
      pause(250);
    }
  }
  try { return fn(); } finally { rmSync(file, { force: true }); }
}

/**
 * The ignored files of a worktree that `git worktree remove` would delete
 * without asking, from `git status --porcelain --ignored=matching`. `.ai/` is
 * the sync's business; `allow` names the disposable folders (build output).
 */
export function ignoredAtRisk(porcelain, allow = []) {
  const ok = ['node_modules', ...allow].map((d) => posix(d).replace(/^\.\//, '').replace(/\/+$/, ''));
  return String(porcelain).split(/\r?\n/)
    .filter((l) => l.startsWith('!! '))
    .map((l) => l.slice(3).replace(/^"|"$/g, '').replace(/\/$/, ''))
    .filter((p) => p !== '.ai' && !p.startsWith('.ai/'))
    .filter((p) => !ok.some((d) => p === d || p.startsWith(`${d}/`) || p.split('/').includes(d)));
}
