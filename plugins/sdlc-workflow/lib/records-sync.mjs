// The records repo on this machine: link a project, commit and push its records, pull the work
// of other machines, and show the state of the clone.
//
// Every records commit goes to the main branch of the clone, limited to one path
// (`git commit -- <project>/<slug>`), through one function, `commitPaths`. A machine-wide lock
// (~/.sdlc/records.lock) is held around the add and the commit, because the sessions of several
// projects commit to the one clone. After each commit the push runs in the background. When the
// remote rejects it, the push rebases the local commits on the remote tip and pushes again: two
// machines write other workflow folders, so the rebase applies. A conflict in one file stops the
// push, and `records status` names the file. Offline work stays in local commits, and the next
// push carries it.
//
// The clone of an older version kept each open workflow on a branch `live/<project>/<slug>`.
// `migrateLive` puts the folder of each such branch on the main branch once, and moves the ref
// to `refs/archive/live/`, so a person can restore it.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { pidAlive } from './proc.mjs';
import { PROJECT_NAME_RE, isLocalOnly, linkedProject, localWorkflowsRoot, recordsHome } from './records-root.mjs';
import { maxFileBytes, sweepRunFiles } from './run-files.mjs';

// A call that only asks the remote (ls-remote) ends after 20 seconds, so an offline machine goes
// on quickly. A transfer (push, fetch) runs as long as data moves: git itself stops a transfer
// that moves less than 1 KB a second for 60 seconds. A kill by the timeout is the last resort:
// on Windows it ends `git push` but leaves its upload running, and the next try starts the same
// upload again beside it.
const NET_TIMEOUT_MS = 20_000;
const TRANSFER_TIMEOUT_MS = 60 * 60_000;
const LOCAL_TIMEOUT_MS = 10 * 60_000;
const STALL_LIMIT = ['-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=60'];

/** The timeout of one git call in the records home, in milliseconds. */
export function timeoutOf(args, net) {
  if (!net) return LOCAL_TIMEOUT_MS;
  return args[0] === 'push' || args[0] === 'fetch' ? TRANSFER_TIMEOUT_MS : NET_TIMEOUT_MS;
}
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** This machine's name in the records: `records.machine` of ~/.sdlc/config.json, else the host name. */
export function machineName() {
  const m = readMachineConfig().records?.machine;
  const raw = m && String(m).trim() ? String(m).trim() : hostname();
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'machine';
}

/**
 * Every git call in the records home: a folder of an archived campaign can pass the 260
 * characters of a Windows path, and a pull writes the files as the scripts wrote them (LF), never
 * with the line endings of this machine.
 */
const LONG_PATHS = ['-c', 'core.longpaths=true', '-c', 'core.autocrlf=input'];

/** One git call in the records home. */
export function gitIn(home, args, { input, net = false } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const r = spawnSync('git', [...LONG_PATHS, ...(net ? STALL_LIMIT : []), '-C', home, ...args], { input, env, encoding: 'utf8', windowsHide: true, timeout: timeoutOf(args, net), maxBuffer: 32 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? r.error?.message ?? '').trim() };
}
const sha = (home, ref) => {
  const r = gitIn(home, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout : null;
};
const isAncestor = (home, a, b) => gitIn(home, ['merge-base', '--is-ancestor', a, b]).status === 0;
const nulList = (items) => `${items.join('\0')}\0`;

/** The main branch of the records clone: the branch that HEAD names. */
export function mainBranch(home) {
  const r = gitIn(home, ['symbolic-ref', '--short', 'HEAD']);
  return r.status === 0 && r.stdout ? r.stdout : 'main';
}
const hasRemote = (home) => gitIn(home, ['remote', 'get-url', 'origin']).status === 0;
const trackingRef = (home) => `refs/remotes/origin/${mainBranch(home)}`;

// ---------------------------------------------------------------- local state

const statePath = () => join(sdlcHomeDir(), 'records-state.json');
export function readState() {
  const empty = { failures: {}, migratedLive: [] };
  try { return { ...empty, ...JSON.parse(readFileSync(statePath(), 'utf8')) }; } catch { return empty; }
}
function writeState(s) {
  mkdirSync(sdlcHomeDir(), { recursive: true });
  const tmp = `${statePath()}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  renameSync(tmp, statePath());
}
/** Change the state file: read it, apply `fn`, write it. */
function updateState(fn) {
  const s = readState();
  fn(s);
  writeState(s);
  return s;
}

/** Note that this machine holds (or no longer holds) the lease of a workflow, so a lost lease can be told apart. */
export function markHeld(key, on) {
  updateState((s) => {
    s.held = { ...(s.held ?? {}) };
    if (on) s.held[key] = nowIso(); else delete s.held[key];
  });
}

/** The log of the records steps that failed: one JSON line each, in ~/.sdlc/records-log.jsonl. */
export const recordsLogPath = () => join(sdlcHomeDir(), 'records-log.jsonl');
export function logRecordsFailure({ project = null, slug = null, step, error }) {
  const entry = { at: nowIso(), project, slug, step, error: String(error ?? '').split('\n')[0] };
  try {
    mkdirSync(sdlcHomeDir(), { recursive: true });
    appendFileSync(recordsLogPath(), `${JSON.stringify(entry)}\n`);
    // The state keeps the last failure of each workflow until a later commit or push works.
    if (project && slug) updateState((s) => { s.failures = { ...(s.failures ?? {}), [`${project}/${slug}`]: entry }; });
  } catch { /* a log that cannot be written must not fail the step */ }
}
const clearFailure = (s, key) => { if (s.failures?.[key]) delete s.failures[key]; };
export function readRecordsLog() {
  try {
    return readFileSync(recordsLogPath(), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

// ---------------------------------------------------------------- content

const lf = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
/** Two contents are the same when their bytes match with the line endings normalized. */
export const sameContent = (a, b) => a.equals(b) || lf(a).equals(lf(b));

/** True when the bytes (or their line-ending normal form) were a version of `path` in the history of `ref`. */
function inHistory(home, ref, path, bytes) {
  const ids = new Set();
  for (const b of [bytes, lf(bytes)]) {
    const h = spawnSync('git', [...LONG_PATHS, '-C', home, 'hash-object', '--stdin', '--no-filters'], { input: b, encoding: 'utf8', windowsHide: true });
    if (h.status === 0) ids.add(h.stdout.trim());
  }
  const log = gitIn(home, ['log', '--format=', '--raw', '--no-abbrev', '--no-renames', ref, '--', path]);
  if (log.status !== 0) return false;
  for (const line of log.stdout.split('\n')) {
    const m = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) /.exec(line);
    if (m && (ids.has(m[1]) || ids.has(m[2]))) return true;
  }
  return false;
}

// ---------------------------------------------------------------- the files that stay out of the commits

/**
 * The size above which a record file stays on this machine, in bytes: `records.max-file-mb` of
 * ~/.sdlc/config.json, else 5 MB. Such a file (a test trace, a large log) belongs in
 * <root>/.ai/evidence/<slug>/: the commit of a workflow folder moves it there first, and no
 * commit holds it.
 */
export const maxCommitBytes = maxFileBytes;

const tooLarge = (abs, limit = maxCommitBytes()) => {
  try { return statSync(abs).size > limit; } catch { return false; }
};

/**
 * True for a path of the records home that stays out of every commit: a local-only file, a
 * generated INDEX.md, or, when `home` is given, a file above the size limit. Each commit of a
 * workflow folder moves such files out first (sweepRunFiles), so this is a guard: it can go when
 * no clone holds such a file.
 */
export function keptOutOfCommits(file, home = null) {
  const parts = String(file).replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] === '.machines') return false;
  const rel = parts.slice(1).join('/');
  return rel === 'INDEX.md' || isLocalOnly(rel) || Boolean(home && tooLarge(join(home, file)));
}

/** The files under `dir` of the records home that stay out of every commit, relative to the home. */
function keptOutFiles(home, dir) {
  const out = [];
  const walk = (abs, rel) => {
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else if (e.isFile() && keptOutOfCommits(r, home)) out.push(r);
    }
  };
  walk(join(home, dir), dir.replace(/\\/g, '/'));
  if (!out.length) return out;
  // A file that git ignores (a draft) stays out by itself, and git add refuses an ignored path that a pathspec names.
  const ignored = new Set(gitIn(home, ['check-ignore', '-z', '--stdin'], { input: nulList(out) }).stdout.split('\0').filter(Boolean));
  return out.filter((f) => !ignored.has(f));
}

// ---------------------------------------------------------------- the records lock

const LOCK_WAIT_MS = 30_000;
const LOCK_STALE_MS = 10 * 60_000;
const PUSH_WAIT_MS = 15 * 60_000;
const PUSH_STALE_MS = 2 * 60 * 60_000;
const BUSY_CODES = new Set(['EEXIST', 'EPERM', 'EBUSY']);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The machine-wide lock of the records commits: the sessions of several projects commit to one clone. */
export const recordsLockPath = () => join(sdlcHomeDir(), 'records.lock');
/** One push of the records runs at a time on this machine. */
const pushLockPath = () => join(sdlcHomeDir(), 'records-push.lock');

/** True when the lock file names a process of this machine that has ended, or is older than `staleMs`. */
function staleLock(path, staleMs) {
  let text;
  let age;
  try { text = readFileSync(path, 'utf8'); age = Date.now() - statSync(path).mtimeMs; } catch { return false; }
  let holder;
  try { holder = JSON.parse(text); } catch { return age > 5_000; }
  if (holder?.host === hostname() && !pidAlive(Number(holder.pid))) return true;
  return age > staleMs;
}

/** Take the lock file `path`: wait up to `waitMs`, and remove a stale lock. Returns true when this process holds it. */
export function takeLock(path, { waitMs = LOCK_WAIT_MS, staleMs = LOCK_STALE_MS } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, host: hostname(), at: nowIso() }), { flag: 'wx' });
      return true;
    } catch (e) { if (!BUSY_CODES.has(e.code)) return false; }
    if (staleLock(path, staleMs)) { rmSync(path, { force: true }); continue; }
    if (Date.now() >= until) return false;
    sleep(25);
  }
}

/** Give up the lock file `path` when this process holds it. */
export function dropLock(path) {
  try { if (JSON.parse(readFileSync(path, 'utf8')).pid === process.pid) rmSync(path, { force: true }); } catch { /* gone */ }
}

/** Run `fn` while this process holds the records lock. Throws when the lock stays busy. */
export function withRecordsLock(fn, opts = {}) {
  const path = recordsLockPath();
  if (!takeLock(path, opts)) throw new Error(`the records lock ${path} stayed busy`);
  try { return fn(); } finally { dropLock(path); }
}

// ---------------------------------------------------------------- commit

const WF_CLI = fileURLToPath(new URL('../scripts/wf.mjs', import.meta.url));

/** Run `wf.mjs <args>` detached. SDLC_RECORDS_FOREGROUND=1 runs it in this process's time, for tests. */
export function inBackground(args) {
  if (process.env.SDLC_RECORDS_FOREGROUND === '1') { spawnSync(process.execPath, [WF_CLI, ...args], { stdio: 'ignore', windowsHide: true }); return; }
  try {
    spawn(process.execPath, [WF_CLI, ...args], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch { /* the next push carries it */ }
}

/** Start the background push. SDLC_RECORDS_PUSH=off leaves it out, for tests that push by hand. */
function queuePush(args) {
  if (process.env.SDLC_RECORDS_PUSH !== 'off') inBackground(args);
}

/** The `<project>/<slug>` of a records path, for the log; null for a path outside a workflow. */
function workflowOfPath(p) {
  const [project, slug] = String(p).replace(/\\/g, '/').split('/');
  return PROJECT_NAME_RE.test(project ?? '') && slug && !slug.startsWith('.') ? { project, slug } : { project: null, slug: null };
}

/**
 * Make one records commit: `git add` and `git commit`, both limited to `paths`, on the main
 * branch of the clone, under the records lock. No draft, run file or file over the size limit
 * goes in. Every records commit goes through here. After the commit the push runs in the
 * background (`pushArgs` names the wf.mjs command; `push: false` leaves the push to the caller).
 * Returns the new commit, the old tip when nothing changed, or null when the commit failed; the
 * records log says why.
 */
export function commitPaths(home, { paths, message, push = true, pushArgs = null }) {
  if (!existsSync(join(home, '.git'))) return null;
  ensureMigrated(home);
  let commit = null;
  try {
    commit = withRecordsLock(() => commitLocked(home, paths, message));
  } catch (e) {
    logRecordsFailure({ ...workflowOfPath(paths[0]), step: 'commit', error: e.message });
    return null;
  }
  const { project, slug } = workflowOfPath(paths[0]);
  if (project && slug && readState().failures?.[`${project}/${slug}`]?.step === 'commit') updateState((s) => clearFailure(s, `${project}/${slug}`));
  if (commit && push) queuePush(pushArgs ?? ['records', 'push', home]);
  return commit;
}

function commitLocked(home, paths, message) {
  const head = sha(home, 'HEAD');
  const specs = [];
  const roots = [];
  for (const p of paths) {
    const rel = String(p).replace(/\\/g, '/').replace(/\/+$/, '');
    // A folder that still has a live branch of an older version waits for the move of that branch.
    if (sha(home, `${LIVE_PREFIX}${rel}`)) throw new Error(`${rel} still has a live branch; run wf.mjs records migrate`);
    const onDisk = existsSync(join(home, rel));
    if (!onDisk && !gitIn(home, ['ls-files', '--', rel]).stdout) continue;
    // A file that stays out of the commits is not even hashed: the add and the commit skip it.
    const mine = [rel, ...(onDisk ? keptOutFiles(home, rel).map((f) => `:(exclude,literal)${f}`) : [])];
    // A failed add is a failed commit, never a commit that leaves the files out.
    const add = gitIn(home, ['add', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(mine) });
    if (add.status !== 0) throw new Error(`the add of ${rel} failed: ${add.stderr.split('\n')[0]}`);
    specs.push(...mine);
    roots.push(rel);
  }
  if (!roots.length || gitIn(home, ['diff', '--cached', '--quiet', '--', ...roots]).status === 0) return head;
  const c = gitIn(home, ['commit', '-q', '-m', message, '--pathspec-from-file=-', '--pathspec-file-nul'], { input: nulList(specs) });
  if (c.status !== 0) throw new Error(`the commit failed: ${(c.stderr || c.stdout).split('\n')[0]}`);
  return sha(home, 'HEAD');
}

// ---------------------------------------------------------------- push and pull

const PUSH_TRIES = 3;

/** The files that a failed merge or rebase names: the conflicts, else the files that it listed. */
function filesOfFailure(home, stderr) {
  const conflicts = gitIn(home, ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
  return conflicts.length ? conflicts : String(stderr).split('\n').filter((l) => /^\s+\S/.test(l)).map((l) => l.trim());
}

/**
 * Bring the commits of other machines onto the main branch of the clone: fetch the remote tip,
 * then, under the records lock, fast-forward to it, or rebase the local commits on it
 * (`git pull --rebase` in two steps, so the lock is not held over the network). The uncommitted
 * files stay (`--autostash`). A conflict aborts the rebase and returns its files.
 * Returns `{ ok, from, to }`, `{ offline, reason }` or `{ conflict, files, reason }`.
 */
export function pullRecords(home = recordsHome(), { fetched = false } = {}) {
  if (!hasRemote(home)) return { offline: true, reason: 'the records clone has no remote' };
  const main = mainBranch(home);
  if (!fetched) {
    const f = gitIn(home, ['fetch', '-q', 'origin', `+refs/heads/${main}:refs/remotes/origin/${main}`], { net: true });
    if (f.status !== 0) return { offline: true, reason: f.stderr.split('\n')[0] || 'the fetch failed' };
  }
  try {
    return withRecordsLock(() => {
      const from = sha(home, 'HEAD');
      const theirs = sha(home, `refs/remotes/origin/${main}`);
      if (!theirs || theirs === from || (from && isAncestor(home, theirs, from))) return { ok: true, from, to: from };
      const forward = !from || isAncestor(home, from, theirs);
      const r = forward ? gitIn(home, ['merge', '-q', '--ff-only', theirs]) : gitIn(home, ['rebase', '-q', '--autostash', theirs]);
      if (r.status === 0) return { ok: true, from, to: sha(home, 'HEAD') };
      const files = filesOfFailure(home, r.stderr);
      if (!forward) gitIn(home, ['rebase', '--abort']);
      return { conflict: true, files, reason: files.length ? `a conflict in ${files.join(', ')}` : (r.stderr.split('\n').find(Boolean) ?? 'the pull failed') };
    });
  } catch (e) { return { failed: true, reason: e.message }; }
}

/**
 * Push the main branch of the clone. One push runs at a time on this machine; a second waits for
 * it, and then finds nothing left to push. A rejected push pulls (rebase) and pushes again, up to
 * three times. A conflict stops the push: the rebase is aborted, the records log and the state
 * name the files, and `records status` shows them.
 * Returns `{ pushed }`, `{ offline }`, `{ busy }` or `{ conflict, files }`, with a `reason`.
 */
export function pushRecords(home = recordsHome()) {
  if (!existsSync(join(home, '.git'))) return { pushed: false, reason: `no records clone at ${home}` };
  if (!hasRemote(home)) return { pushed: false, offline: true, reason: 'the records clone has no remote' };
  if (!takeLock(pushLockPath(), { waitMs: PUSH_WAIT_MS, staleMs: PUSH_STALE_MS })) return { pushed: false, busy: true, reason: 'another push of the records stayed busy' };
  let r;
  try { r = pushLoop(home); } finally { dropLock(pushLockPath()); }
  updateState((s) => {
    if (r.pushed) {
      delete s.pushConflict;
      for (const [k, v] of Object.entries(s.failures ?? {})) if (v.step !== 'commit') delete s.failures[k];
    } else if (r.conflict) s.pushConflict = { at: nowIso(), files: r.files, reason: r.reason };
  });
  if (!r.pushed && !r.offline) logRecordsFailure({ step: 'push', error: r.reason });
  return r;
}

function pushLoop(home) {
  const main = mainBranch(home);
  const ref = `refs/heads/${main}`;
  for (let i = 0; i < PUSH_TRIES; i += 1) {
    const local = sha(home, ref);
    if (!local) return { pushed: false, reason: 'the main branch has no commit' };
    if (local === sha(home, `refs/remotes/origin/${main}`)) return { pushed: true, upToDate: true };
    const p = gitIn(home, ['push', '-q', 'origin', `${ref}:${ref}`], { net: true });
    if (p.status === 0) {
      gitIn(home, ['update-ref', `refs/remotes/origin/${main}`, local]);
      return { pushed: true };
    }
    const pulled = pullRecords(home);
    if (!pulled.ok) return { pushed: false, ...pulled };
  }
  return { pushed: false, reason: `the push was rejected ${PUSH_TRIES} times` };
}

// ---------------------------------------------------------------- the move of the live branches

const LIVE_PREFIX = 'refs/heads/live/';
const ARCHIVE_PREFIX = 'refs/archive/live/';

/** The live branches of an older version in the clone: `[{ ref, name, sha }]`, with `name` = `<project>/<slug>`. */
function liveRefs(home) {
  const r = gitIn(home, ['for-each-ref', '--format=%(refname) %(objectname)', LIVE_PREFIX]);
  return r.stdout.split('\n').filter(Boolean).map((l) => {
    const [ref, oid] = l.split(' ');
    return { ref, name: ref.slice(LIVE_PREFIX.length), sha: oid };
  });
}

/** Move the live branches once: at the first records commit or sync of a clone that has them and no mark. */
function ensureMigrated(home) {
  if (readState().liveMigrated) return;
  if (liveRefs(home).length) migrateLive(home);
  else updateState((s) => { s.liveMigrated = nowIso(); });
}

/** What the move does with one live branch: the tip it takes, and whether the folder needs a commit. */
function planMove(home, { ref, name, sha: local }) {
  const remote = sha(home, `refs/remotes/origin/live/${name}`);
  let tip = local;
  let diverged = false;
  if (remote && remote !== local) {
    if (isAncestor(home, local, remote)) tip = remote;
    else if (!isAncestor(home, remote, local)) diverged = true;
  }
  const tree = gitIn(home, ['rev-parse', '--verify', '--quiet', `${tip}:${name}`]).stdout || null;
  const mainTree = gitIn(home, ['rev-parse', '--verify', '--quiet', `HEAD:${name}`]).stdout || null;
  const action = !tree ? 'no-folder' : tree === mainTree ? 'same' : 'commit';
  return { ref, name, sha: local, tip, ...(remote && remote !== local ? { remote } : {}), diverged, action };
}

/**
 * The working tree of `name` showed the live tip `from`; the main branch now holds `to`. Write
 * each file that changed between them, unless this machine changed it: such a file stays, and is
 * returned.
 */
function catchUpFolder(home, from, to, name) {
  const kept = [];
  const d = spawnSync('git', [...LONG_PATHS, '-C', home, 'diff', '--name-only', '-z', '--no-renames', from, to, '--', name], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  for (const file of (d.stdout ?? '').split('\0').filter(Boolean)) {
    const abs = join(home, file);
    const was = gitIn(home, ['rev-parse', '--verify', '--quiet', `${from}:${file}`]).stdout || null;
    const now = existsSync(abs) ? gitIn(home, ['hash-object', '--', file]).stdout : null;
    if (now !== was) { kept.push(file); continue; }
    if (gitIn(home, ['cat-file', '-e', `${to}:${file}`]).status === 0) gitIn(home, ['checkout-index', '-f', '-q', '--', file]);
    else rmSync(abs, { force: true });
  }
  return kept;
}

function moveOne(home, m) {
  if (m.action === 'commit') {
    gitIn(home, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', m.name]);
    const ls = spawnSync('git', [...LONG_PATHS, '-C', home, 'ls-tree', '-r', '-z', '--full-tree', m.tip, '--', m.name], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (ls.status !== 0 || gitIn(home, ['update-index', '-z', '--index-info'], { input: ls.stdout }).status !== 0) throw new Error(`the tree of ${m.ref} could not be read`);
    const c = gitIn(home, ['commit', '-q', '-m', `${m.name}: the records of the live branch`]);
    if (c.status !== 0) throw new Error(`the commit of ${m.name} failed: ${(c.stderr || c.stdout).split('\n')[0]}`);
    m.commit = sha(home, 'HEAD');
    if (m.tip !== m.sha) m.kept = catchUpFolder(home, m.sha, m.tip, m.name);
  }
  if (m.diverged && gitIn(home, ['update-ref', `refs/archive/live-remote/${m.name}`, m.remote]).status !== 0) throw new Error(`the archive of the remote tip of ${m.ref} failed`);
  if (gitIn(home, ['update-ref', `${ARCHIVE_PREFIX}${m.name}`, m.tip]).status !== 0) throw new Error(`the archive of ${m.ref} failed`);
  if (gitIn(home, ['update-ref', '-d', m.ref, m.sha]).status !== 0) throw new Error(`the delete of ${m.ref} failed`);
}

/**
 * Move the live branches of an older version onto the main branch. For each branch, one commit
 * puts the folder of its tip on the main branch. The live tip wins over the main copy, because
 * it is the newer work; the old main tree stays in the history. A remote branch that is ahead is
 * fetched first, and its tip is used. Then the ref moves to `refs/archive/live/<name>` (never
 * pushed), and records-state.json keeps `{ ref, sha, at }` in `migratedLive`, so a person can
 * restore it. The uncommitted files of the working tree stay. With `dryRun`, nothing changes and
 * the plan is returned. Returns `{ moved, failed, dryRun }`.
 */
export function migrateLive(home = recordsHome(), { dryRun = false } = {}) {
  const out = { moved: [], failed: [], dryRun };
  if (!existsSync(join(home, '.git'))) return { ...out, reason: `no records clone at ${home}` };
  const refs = liveRefs(home);
  if (refs.length && !dryRun && hasRemote(home)) gitIn(home, ['fetch', '-q', 'origin', `+${LIVE_PREFIX}*:refs/remotes/origin/live/*`], { net: true });
  const plan = refs.map((r) => planMove(home, r));
  if (dryRun) return { ...out, moved: plan };
  const at = nowIso();
  if (plan.length) {
    try {
      withRecordsLock(() => {
        // The index holds the main tip, so each commit holds only the folder of its branch.
        if (gitIn(home, ['diff', '--cached', '--quiet']).status !== 0) gitIn(home, sha(home, 'HEAD') ? ['reset', '-q'] : ['read-tree', '--empty']);
        for (const m of plan) {
          try { moveOne(home, m); out.moved.push(m); } catch (e) { out.failed.push({ ...m, reason: e.message }); }
        }
      });
    } catch (e) {
      logRecordsFailure({ step: 'migrate', error: e.message });
      return { ...out, failed: plan, reason: e.message };
    }
  }
  updateState((s) => {
    s.migratedLive = [...(s.migratedLive ?? []), ...out.moved.map((m) => ({ ref: m.ref, sha: m.tip, at, ...(m.tip !== m.sha ? { local: m.sha } : {}), ...(m.diverged ? { remote: m.remote } : {}) }))];
    if (!out.failed.length) s.liveMigrated = at;
  });
  for (const f of out.failed) logRecordsFailure({ ...workflowOfPath(f.name), step: 'migrate', error: f.reason });
  if (out.moved.some((m) => m.commit)) queuePush(['records', 'push', home]);
  return out;
}

// ---------------------------------------------------------------- the clone's own files

/**
 * The lines of the .gitignore of the records repo: the registry of each project is generated, and
 * the drafts of the agents (<wf-dir>/.draft/) stay on this machine.
 */
export const CLONE_IGNORE = ['*/INDEX.md', '.draft/'];

/** Write the .gitignore of the records repo on its main branch when a line is missing. */
export function ensureCloneIgnore(home) {
  const file = join(home, '.gitignore');
  const have = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = have.split(/\r?\n/);
  const missing = CLONE_IGNORE.filter((l) => !lines.includes(l));
  if (!missing.length) return false;
  writeFileSync(file, `${have}${have && !have.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  commitPaths(home, { paths: ['.gitignore'], message: 'records: the generated INDEX.md files and the drafts stay out of git', push: false });
  return true;
}

// ---------------------------------------------------------------- link

/**
 * The record files that the product repo of a project tracks, and the `.gitignore` line that it
 * lacks. A linked project keeps its records in the clone: a tracked record file reaches every PR
 * of the product repo, and a record folder that git neither tracks nor ignores is one
 * `git add -A` away from a commit. Returns `{ tracked, ignoreLine }`; both are empty outside git.
 */
export function productRepoGaps(root) {
  const tracked = gitIn(root, ['ls-files', '--', `.ai/workflows`]);
  if (tracked.status !== 0) return { tracked: [], ignoreLine: null };
  const files = tracked.stdout ? tracked.stdout.split('\n').filter(Boolean) : [];
  const ignored = gitIn(root, ['check-ignore', '-q', '--no-index', '--', `.ai/workflows/x`]).status === 0;
  return { tracked: files, ignoreLine: ignored ? null : `.ai/workflows/` };
}

/** The lines that tell the person how to close the gaps of `productRepoGaps`. */
export function productRepoGapLines(gaps) {
  const lines = [];
  if (gaps?.tracked?.length) {
    lines.push(`records-warning: the product repo tracks ${gaps.tracked.length} record file(s) under .ai/workflows/, which reach every PR. ` +
      `Run \`git rm -r --cached -- .ai/workflows\` and commit it on a branch of its own.`);
  }
  if (gaps?.ignoreLine) lines.push(`records-warning: git neither tracks nor ignores .ai/workflows/. Add the line \`${gaps.ignoreLine}\` to .gitignore.`);
  return lines;
}

/**
 * True when a worktree keeps its own `.ai/sdlc-config.json` that does not name `project`. Such a
 * worktree is a separate record store: it is not linked with the main checkout, and its records
 * stay in it.
 */
function separateStore(wt, project) {
  const file = join(wt, '.ai', 'sdlc-config.json');
  if (!existsSync(file)) return false;
  try { return JSON.parse(readFileSync(file, 'utf8')).records?.project !== project; } catch { return true; }
}

/**
 * The workflow files that a git worktree of the project holds and the main checkout lacks or
 * holds with other content. The main copy is the local file, else the clone copy. The link waits
 * for these files: a worktree that a session left at a later stage would lose them. A separate
 * record store is not scanned: its files go to `separate`, by worktree, and the link reports them.
 */
export function worktreeRecords(root, project, separate = null) {
  const list = gitIn(root, ['worktree', 'list', '--porcelain']);
  if (list.status !== 0) return [];
  const self = resolve(root);
  const home = recordsHome();
  const local = localWorkflowsRoot(root);
  const out = [];
  for (const m of list.stdout.matchAll(/^worktree (.+)$/gm)) {
    const wt = resolve(m[1]);
    if (wt.toLowerCase() === self.toLowerCase()) continue;
    const dir = localWorkflowsRoot(wt);
    if (!existsSync(dir)) continue;
    if (separateStore(wt, project)) { separate?.push(wt); continue; }
    const walk = (d, rel) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (isLocalOnly(r) || (!rel && (e.name.startsWith('_') && e.name !== '_design'))) continue;
        const src = join(d, e.name);
        if (e.isDirectory()) { walk(src, r); continue; }
        if (!e.isFile() || !rel) continue;
        const mine = readFileSync(src);
        const main = [join(local, r), join(home, project, r)].find((p) => existsSync(p));
        if (!main || !sameContent(mine, readFileSync(main))) out.push({ worktree: wt, file: r });
      }
    };
    walk(dir, '');
  }
  return out;
}

/**
 * Link a project to the records repo: name it in `.ai/sdlc-config.json`, and move its workflow
 * folders into `<records home>/<project>/`, once. After the link, each workflow has one folder,
 * its wf-dir in the clone, and the drafts go to <wf-dir>/.draft/.
 * - Each file moves by a rename, with the rule of `moveLocalAtLink`, so a folder that the clone
 *   holds already is merged. A local file whose content differs from the clone copy moves to
 *   `.ai/workflows/.conflicts/<slug>/`, and the link reports it. The config is written in that
 *   case too, because the clone copy is complete.
 * - A file that a session writes by the local path during the link stays local. The pre-write
 *   check refuses such a write after the link, and names the wf-dir path.
 * - Each workflow folder gets one commit on the main branch, open or closed, and one push follows.
 * - The link refuses while a worktree of the project holds workflow files that the main checkout
 *   lacks or holds with other content.
 * - The link commits nothing in the product repo. It reports the record files that the product
 *   repo tracks, and the `.gitignore` line that it lacks.
 */
export function linkProject(root, project) {
  if (!PROJECT_NAME_RE.test(String(project ?? ''))) return { ok: false, reason: `the project name ${project} must match ${PROJECT_NAME_RE}` };
  const home = recordsHome();
  if (!existsSync(join(home, '.git'))) return { ok: false, reason: `no records clone at ${home}: git clone <records repo> "${home}"` };
  const configFile = join(root, '.ai', 'sdlc-config.json');
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  if (config.records?.project && config.records.project !== project && linkedProject(root)) {
    return { ok: false, reason: `the project is linked as ${config.records.project}` };
  }
  const separate = [];
  const waiting = worktreeRecords(root, project, separate);
  if (waiting.length) {
    const shown = waiting.slice(0, 20).map((w) => `${w.worktree}: ${w.file}`).join('\n  ');
    return { ok: false, worktreeFiles: waiting, reason: `${waiting.length} workflow file(s) in a worktree of the project are not in the main checkout. Copy them home or remove the worktree, then link again:\n  ${shown}` };
  }
  const target = join(home, project);
  mkdirSync(target, { recursive: true });
  ensureCloneIgnore(home);
  const local = localWorkflowsRoot(root);
  mkdirSync(local, { recursive: true });
  config.records = { ...(config.records ?? {}), project };
  mkdirSync(join(root, '.ai'), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  // The global registry (INDEX.md) moves too: the scripts read it in the records home.
  moveLocalAtLink(root, null);
  const moved = [];
  const conflicts = [];
  for (const e of readdirSync(local, { withFileTypes: true })) {
    // The project's design records (`_design`) move too; another `_` or `.` folder stays.
    if (!e.isDirectory() || e.name.startsWith('.') || (e.name.startsWith('_') && e.name !== '_design')) continue;
    const a = moveLocalAtLink(root, e.name);
    if (!a) continue;
    if (a.moved.length || a.conflicts.length || existsSync(join(target, e.name))) moved.push(e.name);
    for (const f of a.conflicts) conflicts.push(`${e.name}/${f}`);
    if (e.name === '_design') commitPaths(home, { paths: [`${project}/_design`], message: `${project}: move the design records into the records repo`, push: false });
    else commitWorkflow(root, e.name, `${project}/${e.name}: move the records into the records repo`, { push: false });
  }
  writeMachineFacts(root, {}, { push: false });
  queuePush(['records', 'push', root]);
  const gaps = productRepoGaps(root);
  return { ok: true, home, project, moved, conflicts, separate, tracked: gaps.tracked, ignoreLine: gaps.ignoreLine };
}

// ---------------------------------------------------------------- adopt local files

/** Keep a local copy that lost to the clone copy in `.ai/workflows/.conflicts/<slug>/`, which stays on this machine. */
function parkConflict(localRoot, slug, rel, src) {
  const base = join(localRoot, '.conflicts', slug ?? '_top', rel);
  let to = base;
  for (let n = 1; existsSync(to); n += 1) {
    if (sameContent(readFileSync(to), readFileSync(src))) { rmSync(src, { force: true }); return to; }
    to = `${base}.${n}`;
  }
  mkdirSync(dirname(to), { recursive: true });
  try { renameSync(src, to); } catch { cpSync(src, to); rmSync(src, { force: true }); }
  return to;
}

/**
 * The one-time move of the link: the files of the local folder of a workflow go into the records
 * home. Only the link runs it; after the link, every writer uses the wf-dir in the clone. The old
 * drafts stay, and `record put` still reads them for one release. The rule compares content,
 * never times:
 * - A local copy with the same content as the clone copy (line endings aside) is deleted.
 * - A local copy that was once a version of the file (in the history of its branch) is stale:
 *   a checkout, a restore or a stash put it back. It is deleted.
 * - A local copy of a file that the clone lacks moves into the clone.
 * - Otherwise the clone copy stays, and the local copy moves to `.ai/workflows/.conflicts/<slug>/`
 *   and is reported.
 * `slug` null moves the top-level files of the local workflows folder (INDEX.md, which the
 * clone rebuilds). Returns `{ moved, stale, conflicts }`, or null when the project is not linked.
 */
function moveLocalAtLink(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const out = { moved: [], stale: [], conflicts: [] };
  const home = recordsHome();
  const localRoot = localWorkflowsRoot(root);
  const from = slug ? join(localRoot, slug) : localRoot;
  const toRel = slug ? `${project}/${slug}` : project;
  const to = join(home, toRel);
  if (!existsSync(from)) return out;
  const tipRef = `refs/heads/${mainBranch(home)}`;
  const tip = sha(home, tipRef);
  const move = (src, dst) => {
    mkdirSync(dirname(dst), { recursive: true });
    try { renameSync(src, dst); } catch { cpSync(src, dst); rmSync(src, { force: true }); }
  };
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (isLocalOnly(slug ? `${slug}/${r}` : r)) continue;
      const src = join(dir, e.name);
      if (e.isDirectory()) {
        // Without a slug only the top-level files move; each workflow folder adopts on its own.
        if (!slug) continue;
        walk(src, r);
        if (!readdirSync(src).length) rmSync(src, { recursive: true, force: true });
        continue;
      }
      if (!e.isFile()) continue;
      const dst = join(to, r);
      const mine = readFileSync(src);
      if (existsSync(dst) && sameContent(mine, readFileSync(dst))) { rmSync(src, { force: true }); continue; }
      // The registry is rebuilt in the clone: a local copy only fills a clone that has none.
      if (!slug && r === 'INDEX.md') {
        if (existsSync(dst)) rmSync(src, { force: true }); else { move(src, dst); out.moved.push(r); }
        continue;
      }
      const inHome = `${toRel}/${r}`;
      if (tip && inHistory(home, tipRef, inHome, mine)) { rmSync(src, { force: true }); out.stale.push(r); continue; }
      if (!existsSync(dst)) { move(src, dst); out.moved.push(r); continue; }
      parkConflict(localRoot, slug, r, src);
      out.conflicts.push(r);
    }
  };
  walk(from, '');
  return out;
}

// ---------------------------------------------------------------- commit and push

/**
 * Commit one workflow's folder on the main branch of the clone. The background push that follows
 * runs `wf.mjs records <verb> <root> <slug>`: `push`, or `close` for a closed workflow, which also
 * releases its lease. `push: false` leaves the push to the caller. Returns
 * `{ commit, project, home, conflicts }`, or null when unlinked; `conflicts` is empty, because no
 * local file moves into the clone here.
 */
export function commitWorkflow(root, slug, message, { push = true, verb = 'push' } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  // The run files and the files over the cap leave the clone before the commit.
  try { sweepRunFiles(root, slug, join(home, project, slug), { machine: machineName() }); } catch { /* the guard of the commit keeps them out */ }
  const commit = commitPaths(home, { paths: [`${project}/${slug}`], message, push, pushArgs: ['records', verb, root, slug] });
  return { commit, project, home, conflicts: [] };
}

/**
 * Commit every change of the clone of a project that no commit holds yet: the design records and
 * each workflow folder, one commit each. A folder with no change makes no commit, and no commit
 * here starts a push: the caller pushes once. Returns the slugs that got a new commit.
 */
function commitPending(root, project, home, label = `the records of ${machineName()} before a sync`) {
  if (existsSync(join(home, project, '_design'))) commitPaths(home, { paths: [`${project}/_design`], message: `${project}: the design records before a sync`, push: false });
  // The folders that differ from the main branch: the open workflows, and a closed one with a new file.
  const st = spawnSync('git', [...LONG_PATHS, '-C', home, 'status', '--porcelain', '-z', '--untracked-files=all', '--', `${project}/`], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const slugs = new Set();
  for (const row of (st.stdout ?? '').split('\0')) {
    const file = row.slice(3);
    const [p, s, rest] = file.split('/');
    if (p !== project || !s || rest === undefined || s.startsWith('.') || s.startsWith('_') || keptOutOfCommits(file, home)) continue;
    slugs.add(s);
  }
  const committed = [];
  for (const s of slugs) {
    const before = sha(home, 'HEAD');
    const message = `${project}/${s}: ${label}`;
    if (root) commitWorkflow(root, s, message, { push: false });
    else commitPaths(home, { paths: [`${project}/${s}`], message, push: false });
    if (sha(home, 'HEAD') !== before) committed.push(s);
  }
  return committed;
}

/**
 * Commit the records that a writer other than the wf.mjs record commands left in the clone, such
 * as the campaign script, then start one background push. Give `root` for a linked project, or
 * `project` for a writer that knows only the clone folder. Returns the slugs with a new commit,
 * or null when the records are not in a clone.
 */
export function commitRecords({ root = null, project = null, label }) {
  const name = root ? linkedProject(root) : project;
  if (!name || !PROJECT_NAME_RE.test(name)) return null;
  const home = recordsHome();
  if (!existsSync(join(home, '.git')) || !existsSync(join(home, name))) return null;
  const before = sha(home, 'HEAD');
  const committed = commitPending(root, name, home, label);
  if (sha(home, 'HEAD') !== before) queuePush(['records', 'push', root ?? home]);
  return committed;
}

/**
 * Close a workflow: a normal records commit of its folder, then the push of the clone, in this
 * process's time. Returns `{ ok, commit, pushed, reason }`, or null when unlinked.
 */
export function closeRecords(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const c = commitWorkflow(root, slug, `${project}/${slug}: close`, { push: false });
  if (!c.commit) return { ok: false, reason: 'the commit of the workflow folder failed' };
  const p = pushRecords(c.home);
  return { ok: true, commit: c.commit, pushed: Boolean(p.pushed), ...(!p.pushed && p.reason ? { reason: p.reason } : {}) };
}

// ---------------------------------------------------------------- sync

/** The per-machine facts of this machine: its own file, which no other machine reads as true. */
export function machineFactsPath(home = recordsHome(), machine = machineName()) {
  return join(home, '.machines', `${machine}.json`);
}
export function readMachineFacts(home = recordsHome(), machine = machineName()) {
  try { return JSON.parse(readFileSync(machineFactsPath(home, machine), 'utf8')); } catch { return { machine, projects: {}, reads: {} }; }
}
export function writeMachineFacts(root, change = {}, { push = true } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const facts = readMachineFacts(home);
  const before = JSON.stringify(facts);
  facts.projects = { ...facts.projects, [project]: { ...(facts.projects?.[project] ?? {}), root } };
  if (change.reads) facts.reads = { ...facts.reads, ...change.reads };
  if (JSON.stringify(facts) === before) return facts;
  mkdirSync(join(home, '.machines'), { recursive: true });
  writeFileSync(machineFactsPath(home), `${JSON.stringify(facts, null, 2)}\n`);
  commitPaths(home, { paths: [`.machines/${machineName()}.json`], message: `${machineName()}: machine facts`, push });
  return facts;
}

/**
 * Pull the work of other machines and push the work of this one. The uncommitted files of the
 * project go into commits first. Then the main branch pulls (fetch and rebase) and pushes; the
 * leases come with the fetch. Returns `{ project, pulled, pushed, conflicts, offline }`, where
 * `pulled` names the workflows of the project that the pull changed.
 */
export function syncRecords(root) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const out = { project, pulled: [], pushed: false, conflicts: [], offline: false };
  ensureMigrated(home);
  commitPending(root, project, home);
  ensureCloneIgnore(home);
  writeMachineFacts(root, {}, { push: false });
  if (!hasRemote(home)) { out.offline = true; return out; }
  const main = mainBranch(home);
  const f = gitIn(home, ['fetch', '-q', '--prune', 'origin', `+refs/heads/${main}:refs/remotes/origin/${main}`, '+refs/leases/*:refs/leases/*'], { net: true });
  if (f.status !== 0) { out.offline = true; return out; }
  const pull = pullRecords(home, { fetched: true });
  if (!pull.ok) { out.conflicts.push(`${main}: ${pull.reason}`); return out; }
  if (pull.to && pull.to !== pull.from) {
    const changed = pull.from
      ? gitIn(home, ['diff', '--name-only', pull.from, pull.to, '--', `${project}/`])
      : gitIn(home, ['ls-tree', '-r', '--name-only', pull.to, '--', `${project}/`]);
    out.pulled = [...new Set(changed.stdout.split('\n').map((x) => x.split('/')[1]).filter(Boolean))];
  }
  const p = pushRecords(home);
  out.pushed = Boolean(p.pushed);
  if (p.conflict) out.conflicts.push(`${main}: ${p.reason}`);
  else if (p.offline) out.offline = true;
  return out;
}

// ---------------------------------------------------------------- another project

const fetchedOther = new Set();

/**
 * Where this machine reads a workflow of another project. A workflow folder in the clone is read
 * there (`{ folder: true }`). Else the commit that has it is read with git (`{ ref }`): the
 * remote main branch, fetched into `refs/wf-other/main` once per process and clone, so the fetch leaves the
 * remote-tracking ref of the pull as it is. Offline, the tip of the last fetch is read.
 */
export function otherProjectSource(project, slug, home = recordsHome()) {
  if (!existsSync(join(home, '.git'))) return null;
  if (existsSync(join(home, project, slug))) return { folder: true };
  const main = mainBranch(home);
  if (hasRemote(home) && !fetchedOther.has(home)) {
    fetchedOther.add(home);
    gitIn(home, ['fetch', '-q', 'origin', `+refs/heads/${main}:refs/wf-other/main`], { net: true });
  }
  const key = `${project}/${slug}`;
  for (const ref of ['refs/wf-other/main', `refs/remotes/origin/${main}`, `refs/heads/${main}`]) {
    if (sha(home, ref) && gitIn(home, ['cat-file', '-e', `${ref}:${key}`]).status === 0) return { ref };
  }
  return null;
}

/** The names in the folder `path` of the commit `ref`; an empty list when the folder is missing. */
export function namesAt(ref, path, home = recordsHome()) {
  const ls = gitIn(home, ['ls-tree', '--name-only', `${ref}:${path}`]);
  return ls.status === 0 ? ls.stdout.split('\n').filter(Boolean) : [];
}

/** The text of the file `path` in the commit `ref`, or null. */
export function textAt(ref, path, home = recordsHome()) {
  const r = gitIn(home, ['show', `${ref}:${path}`]);
  return r.status === 0 ? r.stdout : null;
}

/** The tree `tree` (null: empty) with the blob `blob` at the path `parts`, built with mktree. */
function treeWith(home, tree, parts, blob) {
  const [name, ...rest] = parts;
  const ls = tree ? spawnSync('git', [...LONG_PATHS, '-C', home, 'ls-tree', '-z', tree], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 }).stdout ?? '' : '';
  const entries = ls.split('\0').filter(Boolean);
  const old = entries.find((e) => e.slice(e.indexOf('\t') + 1) === name);
  const oldTree = old && / tree /.test(old.slice(0, old.indexOf('\t'))) ? old.slice(0, old.indexOf('\t')).split(' ')[2] : null;
  const entry = rest.length ? `040000 tree ${treeWith(home, oldTree, rest, blob)}\t${name}` : `100644 blob ${blob}\t${name}`;
  return gitIn(home, ['mktree', '-z'], { input: nulList([...entries.filter((e) => e !== old), entry]) }).stdout;
}

/**
 * Put one new file in the workflow folder of another project, when this clone does not hold that
 * folder, and push it: one commit on the remote tip of the main branch that adds only that file.
 * No local branch and no file of the working tree change; the next pull brings the commit. A
 * rejected push builds again on the new tip. Returns `{ pushed, offline, reason }`.
 */
export function postFileTo(project, slug, { path, text, message }, home = recordsHome()) {
  const key = `${project}/${slug}`;
  const main = mainBranch(home);
  const tracking = `refs/remotes/origin/${main}`;
  const blob = gitIn(home, ['hash-object', '-w', '--stdin'], { input: text });
  if (blob.status !== 0) return { pushed: false, reason: blob.stderr };
  for (let attempt = 0; attempt < PUSH_TRIES; attempt += 1) {
    if (gitIn(home, ['fetch', '-q', 'origin', `+refs/heads/${main}:${tracking}`], { net: true }).status !== 0) return { pushed: false, offline: true, reason: 'the records remote is out of reach' };
    const parent = sha(home, tracking);
    if (!parent || gitIn(home, ['cat-file', '-e', `${parent}:${key}`]).status !== 0) return { pushed: false, reason: `no workflow ${key}` };
    const tree = treeWith(home, gitIn(home, ['rev-parse', `${parent}^{tree}`]).stdout, [project, slug, ...path.split('/')], blob.stdout);
    const c = tree ? gitIn(home, ['commit-tree', tree, '-p', parent, '-m', message]) : { status: 1, stderr: 'the tree could not be built' };
    if (c.status !== 0) return { pushed: false, reason: c.stderr };
    if (gitIn(home, ['push', '-q', 'origin', `${c.stdout}:refs/heads/${main}`], { net: true }).status === 0) return { pushed: true, commit: c.stdout };
  }
  return { pushed: false, reason: `the push was rejected ${PUSH_TRIES} times` };
}

// ---------------------------------------------------------------- state of the clone

/** The files of a workflow folder in the clone that no commit holds: changed, new or deleted. */
function uncommittedOf(home, project, slug) {
  const key = `${project}/${slug}`;
  const st = spawnSync('git', [...LONG_PATHS, '-C', home, 'status', '--porcelain', '-z', '--no-renames', '--untracked-files=all', '--', `${key}/`], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return (st.stdout ?? '').split('\0').filter((row) => row.length > 3)
    .map((row) => row.slice(3)).filter((f) => !keptOutOfCommits(f, home)).map((f) => f.slice(key.length + 1));
}

/** The commits of the main branch that touch `path` (all when null): `{ ahead, behind }` of the remote tip. */
function aheadBehind(home, path = null) {
  if (!hasRemote(home) || !sha(home, 'HEAD')) return { ahead: 0, behind: 0 };
  const tail = path ? ['--', path] : [];
  const theirs = sha(home, trackingRef(home));
  if (!theirs) return { ahead: Number(gitIn(home, ['rev-list', '--count', 'HEAD', ...tail]).stdout) || 0, behind: 0 };
  const count = (range) => Number(gitIn(home, ['rev-list', '--count', range, ...tail]).stdout) || 0;
  return { ahead: count(`${theirs}..HEAD`), behind: count(`HEAD..${theirs}`) };
}

/**
 * The health of one workflow in the clone: the uncommitted files, the commits ahead of and behind
 * the remote, the local files that the link kept aside, a file of the workflow at which the last
 * push stopped, a live branch that is not moved yet, and the last logged failure. `problem` is
 * true when any of these is not empty.
 */
export function workflowHealth(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const key = `${project}/${slug}`;
  const state = readState();
  const { ahead, behind } = aheadBehind(home, key);
  // The local copies that the link kept aside stay listed until the person deletes them.
  const kept = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), r); else kept.push(r);
    }
  };
  const parked = join(localWorkflowsRoot(root), '.conflicts', slug);
  if (existsSync(parked)) walk(parked, '');
  const conflictFiles = (state.pushConflict?.files ?? []).filter((f) => f.startsWith(`${key}/`));
  const h = {
    workflow: key,
    uncommitted: uncommittedOf(home, project, slug),
    ahead, behind,
    adoptConflicts: kept,
    conflict: conflictFiles.length ? `the last push stopped at ${conflictFiles.join(', ')}` : null,
    live: Boolean(sha(home, `${LIVE_PREFIX}${key}`)),
    lastFailure: state.failures?.[key] ?? null,
  };
  h.problem = Boolean(h.uncommitted.length || h.ahead || h.behind || h.adoptConflicts.length || h.conflict || h.live || h.lastFailure);
  return h;
}

/** The one warning line of the dispatch for a workflow with a problem in the clone, or null. */
export function healthLine(h) {
  if (!h?.problem) return null;
  const parts = [];
  if (h.uncommitted.length) parts.push(`${h.uncommitted.length} uncommitted file(s)`);
  if (h.ahead) parts.push(`${h.ahead} commit(s) not pushed`);
  if (h.behind) parts.push(`${h.behind} commit(s) of another machine not pulled`);
  if (h.adoptConflicts.length) parts.push(`local copies kept aside in .ai/workflows/.conflicts/: ${h.adoptConflicts.join(', ')}`);
  if (h.conflict) parts.push(`a push conflict: ${h.conflict}`);
  if (h.live) parts.push('a live branch of an older version is not moved yet');
  if (h.lastFailure) parts.push(`the last ${h.lastFailure.step} failed at ${h.lastFailure.at}: ${h.lastFailure.error}`);
  return `records-warning: ${h.workflow}: ${parts.join('; ')}. Run wf.mjs records status <root>.`;
}

/**
 * What the records clone holds for a project on this machine: the commits ahead of and behind
 * the remote, the files at which the last push stopped, the live branches of an older version
 * that are not moved yet, and each workflow with a problem.
 */
export function recordsStatus(root) {
  const project = linkedProject(root);
  const home = recordsHome();
  const state = readState();
  if (!project) return { linked: false, home, clone: existsSync(join(home, '.git')) };
  const live = liveRefs(home).filter((r) => r.name.startsWith(`${project}/`));
  const slugs = new Set(live.map((r) => r.name.slice(project.length + 1)));
  const dir = join(home, project);
  if (existsSync(dir)) for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) slugs.add(e.name);
  const workflows = [...slugs].sort().map((s) => workflowHealth(root, s)).filter((h) => h.problem);
  return {
    linked: true, home, project, machine: machineName(), main: mainBranch(home), remote: hasRemote(home),
    ...aheadBehind(home),
    live: live.map((r) => `${r.ref} ${r.sha.slice(0, 8)}`),
    pushConflict: state.pushConflict ?? null,
    migrated: (state.migratedLive ?? []).filter((m) => m.ref.startsWith(`${LIVE_PREFIX}${project}/`)),
    workflows,
  };
}
