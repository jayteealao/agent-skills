// The tools of the history rewrite of a records repo: images, video and archives leave every
// commit, after the images of HEAD went to the image store (lib/records-images.mjs). Each step
// is a separate command, and none of them changes the live clone or the remote:
//
//   list     what the history holds, by kind: images and archives, with sizes. The person picks
//            the archive list from it.
//   check    the clone is quiet: no unsaved path, nothing unpushed, no live branch, no file
//            written in the last two minutes.
//   backup   a bundle of all refs, restored into an empty folder and compared, before anything else.
//   export   every image at HEAD gets its reference (design images go to the store); evidence is
//            copied into the cache of this computer, so a fresh clone gets it back.
//   mirror   a mirror of the clone, rewritten with `git fast-export --no-data` and `fast-import`:
//            the lines of the removed paths are dropped, and no blob is copied. The commit map
//            (old id, new id) is kept beside it.
//   verify   the mirror passes fsck, holds the same files at HEAD except the removed ones, and no
//            removed path in any commit.
//
// The force push is not a step of this module: the person says yes to it, with the sizes and the
// place of the backup, and it runs as one git command with --force-with-lease.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { machineName, sdlcHomeDir } from './home.mjs';
import { IMAGE_RE, cacheDir, imageFiles, isDesignImage, readRef, uploadImages } from './records-images.mjs';

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'];
export const ARCHIVE_RE = /\.(apk|aab|ipa|zip|tar|tgz|gz|bz2|xz|7z|rar|jar|dmg|exe|msi)$/i;

const git = (dir, args, o = {}) => {
  const r = spawnSync('git', ['-C', dir, '-c', 'core.quotepath=false', '-c', 'core.longpaths=true', ...args], { encoding: 'utf8', windowsHide: true, timeout: o.timeout ?? 30 * 60_000, maxBuffer: 1 << 30 });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: String(r.stderr ?? '').trim() };
};
const must = (dir, args, o) => { const r = git(dir, args, o); if (!r.ok) throw new Error(`git ${args[0]} failed: ${r.err.split('\n')[0]}`); return r.out; };

/** The removed paths: images and video, and the archives that the person listed. */
export function removedTest({ exts = IMAGE_EXTS, archives = [] } = {}) {
  const ext = new RegExp(`\\.(${exts.map((e) => e.replace(/[^a-z0-9]/gi, '')).join('|')})$`, 'i');
  const named = new Set(archives);
  return (path) => ext.test(path) || named.has(path);
}

/** What the history holds: `{ images: { count, bytes }, archives: [{ path, bytes }], other: { count, bytes } }`, unique blobs. */
export function listHistory(home) {
  const objects = must(home, ['rev-list', '--objects', '--all']).split('\n');
  const r = spawnSync('git', ['-C', home, 'cat-file', '--batch-check=%(objecttype) %(objectname) %(objectsize) %(rest)'], { input: objects.join('\n'), encoding: 'utf8', maxBuffer: 1 << 30, windowsHide: true });
  const seen = new Set();
  const out = { images: { count: 0, bytes: 0 }, archives: [], other: { count: 0, bytes: 0 } };
  for (const line of String(r.stdout).split('\n')) {
    const [type, sha, size, ...rest] = line.split(' ');
    if (type !== 'blob' || seen.has(sha)) continue;
    seen.add(sha);
    const path = rest.join(' ');
    const bytes = Number(size);
    if (IMAGE_RE.test(path)) { out.images.count += 1; out.images.bytes += bytes; } else if (ARCHIVE_RE.test(path)) out.archives.push({ path, bytes }); else { out.other.count += 1; out.other.bytes += bytes; }
  }
  out.archives.sort((a, b) => b.bytes - a.bytes);
  return out;
}

/** The problems that stop a rewrite now; empty when the clone is quiet. */
export function checkQuiet(home, { quietMs = 120_000, now = Date.now() } = {}) {
  const problems = [];
  const dirty = git(home, ['status', '--porcelain']).out.split('\n').filter(Boolean);
  if (dirty.length) problems.push(`${dirty.length} path(s) not saved in a commit`);
  const main = git(home, ['symbolic-ref', '--short', 'HEAD']).out || 'main';
  const ahead = git(home, ['rev-list', '--count', `origin/${main}..HEAD`]).out;
  if (ahead && ahead !== '0') problems.push(`${ahead} commit(s) not pushed`);
  const live = git(home, ['for-each-ref', '--format=%(refname)', 'refs/heads/live/', 'refs/remotes/origin/live/']).out.split('\n').filter(Boolean);
  if (live.length) problems.push(`${live.length} live branch(es): move them first (wf.mjs records migrate)`);
  let young = 0;
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p); else { try { if (now - statSync(p).mtimeMs < quietMs) young += 1; } catch { /* gone */ } }
    }
  };
  walk(home);
  if (young) problems.push(`${young} file(s) written in the last ${Math.round(quietMs / 1000)} s: a process still writes`);
  return problems;
}

/** A bundle of all refs, restored into an empty folder and compared. Returns `{ bundle, tree }`. */
export function backupBundle(home, outDir, { stamp = new Date().toISOString().replace(/[:.]/g, '-') } = {}) {
  mkdirSync(outDir, { recursive: true });
  const bundle = join(outDir, `records-${stamp}.bundle`);
  must(home, ['bundle', 'create', bundle, '--all']);
  const restore = join(outDir, `restore-${stamp}`);
  const c = spawnSync('git', ['clone', '-q', '--no-checkout', bundle, restore], { encoding: 'utf8', windowsHide: true, timeout: 60 * 60_000 });
  if (c.status !== 0) throw new Error(`the bundle does not restore: ${String(c.stderr).split('\n')[0]}`);
  const tree = must(home, ['rev-parse', 'HEAD^{tree}']);
  const back = must(restore, ['rev-parse', 'HEAD^{tree}']);
  if (tree !== back) throw new Error(`the restored bundle has another HEAD tree (${back}, not ${tree})`);
  return { bundle, restore, tree };
}

/**
 * The images of HEAD leave git: references for all, design images in the store, evidence copied
 * into the cache of this computer. Returns the result of the upload and the count of evidence copied.
 */
export async function exportImages(home, { sdlc = sdlcHomeDir(), machine = machineName(), cfg } = {}) {
  const up = await uploadImages(home, { home: sdlc, machine, cfg });
  let kept = 0;
  mkdirSync(cacheDir(sdlc), { recursive: true });
  for (const rel of imageFiles(home)) {
    if (isDesignImage(rel)) continue;
    const file = join(home, ...rel.split('/'));
    const ref = readRef(file);
    if (!ref) continue;
    const to = join(cacheDir(sdlc), ref.sha256);
    if (!existsSync(to)) { copyFileSync(file, to); kept += 1; }
  }
  return { ...up, keptLocal: kept };
}

const unquote = (p) => (p.startsWith('"') ? JSON.parse(p) : p);

/**
 * A mirror of `home` at `outDir/mirror.git`, rewritten without the removed paths. Returns
 * `{ mirror, map, dropped }`: `map` is the file of the commit map, `dropped` the count of lines.
 */
export async function rewriteMirror(home, outDir, { exts, archives } = {}) {
  const removed = removedTest({ exts, archives });
  mkdirSync(outDir, { recursive: true });
  const mirror = join(outDir, 'mirror.git');
  if (existsSync(mirror)) throw new Error(`${mirror} exists: give an empty folder`);
  const c = spawnSync('git', ['clone', '-q', '--mirror', home, mirror], { encoding: 'utf8', windowsHide: true, timeout: 60 * 60_000 });
  if (c.status !== 0) throw new Error(`the mirror clone failed: ${String(c.stderr).split('\n')[0]}`);
  const oldMarks = join(outDir, 'old.marks');
  const newMarks = join(outDir, 'new.marks');
  const exp = spawn('git', ['-C', mirror, '-c', 'core.quotepath=false', 'fast-export', '--all', '--no-data', '--signed-tags=strip', '--tag-of-filtered-object=drop', '--reencode=no', `--export-marks=${oldMarks}`], { windowsHide: true });
  const imp = spawn('git', ['-C', mirror, 'fast-import', '--force', '--quiet', `--export-marks=${newMarks}`], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
  let impErr = '';
  imp.stderr.on('data', (d) => { impErr += d; });
  let dropped = 0;
  // The stream with --no-data holds no blob, only commands; a `data <n>` block (a message) is
  // passed through by its byte count, so a message line that looks like a command is never read
  // as one, and a CR in a message stays.
  let buf = Buffer.alloc(0);
  let skip = 0;
  const write = (b) => new Promise((ok) => { if (imp.stdin.write(b)) ok(); else imp.stdin.once('drain', ok); });
  for await (const chunk of exp.stdout) {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (skip > 0) {
        if (!buf.length) break;
        const n = Math.min(skip, buf.length);
        await write(buf.subarray(0, n));
        buf = buf.subarray(n);
        skip -= n;
        continue;
      }
      const nl = buf.indexOf(10);
      if (nl < 0) break;
      const line = buf.subarray(0, nl).toString('utf8');
      const whole = buf.subarray(0, nl + 1);
      buf = buf.subarray(nl + 1);
      const m = /^M \d+ \S+ (.+)$/.exec(line);
      if (m && removed(unquote(m[1]))) { dropped += 1; continue; }
      const d = /^data (\d+)$/.exec(line);
      if (d) skip = Number(d[1]);
      await write(whole);
    }
  }
  if (buf.length) await write(buf);
  imp.stdin.end();
  const [ec, ic] = await Promise.all([new Promise((ok) => exp.on('close', ok)), new Promise((ok) => imp.on('close', ok))]);
  if (ec !== 0 || ic !== 0) throw new Error(`the rewrite failed: ${impErr.split('\n')[0] || `fast-export ${ec}, fast-import ${ic}`}`);
  must(mirror, ['reflog', 'expire', '--expire=now', '--all']);
  must(mirror, ['gc', '-q', '--prune=now']);
  // The commit map: the same mark in both files.
  const marks = (f) => new Map(readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ')));
  const before = marks(oldMarks);
  const after = marks(newMarks);
  const map = join(outDir, 'commit-map.txt');
  const out = createWriteStream(map);
  for (const [mark, sha] of before) if (after.has(mark) && git(mirror, ['cat-file', '-t', after.get(mark)]).out === 'commit') out.write(`${sha} ${after.get(mark)}\n`);
  await new Promise((ok) => out.end(ok));
  return { mirror, map, dropped };
}

/** The checks of a rewritten mirror against the clone. Returns the problems; empty when it passes. */
export function verifyMirror(home, mirror, { exts, archives } = {}) {
  const removed = removedTest({ exts, archives });
  const problems = [];
  const f = git(mirror, ['fsck', '--no-dangling'], { timeout: 60 * 60_000 });
  if (!f.ok) problems.push(`fsck: ${f.err.split('\n')[0]}`);
  const tree = (dir) => new Map(must(dir, ['ls-tree', '-r', 'HEAD']).split('\n').filter(Boolean).map((l) => { const t = l.indexOf('\t'); return [l.slice(t + 1), l.slice(0, t).split(' ')[2]]; }));
  const a = tree(home);
  const b = tree(mirror);
  let differ = 0;
  for (const [p, sha] of a) if (!removed(p) && b.get(p) !== sha) differ += 1;
  for (const p of b.keys()) if (!a.has(p)) differ += 1;
  if (differ) problems.push(`${differ} file(s) at HEAD differ from the clone`);
  const left = must(mirror, ['rev-list', '--objects', '--all']).split('\n').map((l) => l.slice(41)).filter((p) => p && removed(p));
  if (left.length) problems.push(`${left.length} removed path(s) still in a commit, such as ${left[0]}`);
  return problems;
}
