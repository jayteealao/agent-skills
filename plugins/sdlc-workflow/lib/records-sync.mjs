// The records repo on this machine: link a project, commit and push its records, pull the work
// of other machines, and squash a workflow's history when it closes.
//
// Each open workflow has its own branch, `live/<project>/<slug>`. A commit goes to that branch
// at each step and stage boundary, built with plumbing (a temporary index), so the working tree
// and the main branch stay as they are. When the workflow closes, one commit puts its folder on
// the main branch and the live branch is deleted. A write after the close makes a live branch
// again, and the next sync puts that batch on the main branch as one more commit.
//
// A push that the remote rejects is merged with `git merge-tree`: two machines that wrote other
// files (a message in `inbox/`, say) merge cleanly. A real conflict stops and is reported.
// Offline work stays in the local refs, and the next sync pushes it.
//
// No step deletes a file that is not in a commit. A sync commits the clone first, and a move of
// a ref writes only the files that changed between the two commits (`applyTree`). A ref that a
// step deletes is kept in ~/.sdlc/records-state.json under `dropped`, so a person can recover it.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { DRAFT_DIR, INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { TERMINAL_WORKFLOW_STATUSES } from './workflow-index.mjs';
import { PROJECT_NAME_RE, isLocalOnly, linkedProject, localWorkflowsRoot, recordsHome } from './records-root.mjs';
import { otherLease } from './leases.mjs';

const NET_TIMEOUT_MS = 20_000;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const MAX_DROPPED = 200;

/** This machine's name in the records: `records.machine` of ~/.sdlc/config.json, else the host name. */
export function machineName() {
  const m = readMachineConfig().records?.machine;
  const raw = m && String(m).trim() ? String(m).trim() : hostname();
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'machine';
}

/** One git call in the records home. `index` names a temporary index file. */
export function gitIn(home, args, { input, index, net = false } = {}) {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(index ? { GIT_INDEX_FILE: index } : {}) };
  const r = spawnSync('git', ['-C', home, ...args], { input, env, encoding: 'utf8', windowsHide: true, timeout: net ? NET_TIMEOUT_MS : 60_000, maxBuffer: 32 * 1024 * 1024 });
  return { status: r.error ? 127 : r.status ?? 1, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? r.error?.message ?? '').trim() };
}
const sha = (home, ref) => {
  const r = gitIn(home, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return r.status === 0 ? r.stdout : null;
};
const isAncestor = (home, a, b) => gitIn(home, ['merge-base', '--is-ancestor', a, b]).status === 0;
const zeroOid = (oid) => '0'.repeat(oid.length);

/** The main branch of the records clone: the branch that HEAD names. */
export function mainBranch(home) {
  const r = gitIn(home, ['symbolic-ref', '--short', 'HEAD']);
  return r.status === 0 && r.stdout ? r.stdout : 'main';
}
export const liveRef = (project, slug) => `refs/heads/live/${project}/${slug}`;
const remoteLiveRef = (project, slug) => `refs/remotes/origin/live/${project}/${slug}`;
const hasRemote = (home) => gitIn(home, ['remote', 'get-url', 'origin']).status === 0;

// ---------------------------------------------------------------- local state

const statePath = () => join(sdlcHomeDir(), 'records-state.json');
export function readState() {
  const empty = { pendingClose: [], conflicts: {}, failures: {}, dropped: [] };
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
    // The state keeps the last failure of each workflow until a push or a close of it works.
    if (project && slug) updateState((s) => { s.failures = { ...(s.failures ?? {}), [`${project}/${slug}`]: entry }; });
  } catch { /* a log that cannot be written must not fail the step */ }
}
const clearFailure = (s, key) => { if (s.failures?.[key]) delete s.failures[key]; };
export function readRecordsLog() {
  try {
    return readFileSync(recordsLogPath(), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

/** Delete a local ref, and keep its old tip in the state under `dropped`. */
function dropRef(home, ref, reason) {
  const old = sha(home, ref);
  if (!old) return true;
  updateState((s) => {
    s.dropped = [...(s.dropped ?? []), { at: nowIso(), ref, sha: old, reason }].slice(-MAX_DROPPED);
  });
  return gitIn(home, ['update-ref', '-d', ref, old]).status === 0;
}

// ---------------------------------------------------------------- content

const blobBytes = (home, oid) => spawnSync('git', ['-C', home, 'cat-file', 'blob', oid], { windowsHide: true, maxBuffer: 256 * 1024 * 1024 }).stdout ?? Buffer.alloc(0);
const lf = (buf) => Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
/** Two contents are the same when their bytes match with the line endings normalized. */
export const sameContent = (a, b) => a.equals(b) || lf(a).equals(lf(b));

/** The blob of `path` in commit `commit`, as bytes, or null. */
function blobAt(home, commit, path) {
  const r = gitIn(home, ['rev-parse', '--verify', '--quiet', `${commit}:${path}`]);
  return r.status === 0 ? blobBytes(home, r.stdout) : null;
}

/** True when the bytes (or their line-ending normal form) were a version of `path` in the history of `ref`. */
function inHistory(home, ref, path, bytes) {
  const ids = new Set();
  for (const b of [bytes, lf(bytes)]) {
    const h = spawnSync('git', ['-C', home, 'hash-object', '--stdin', '--no-filters'], { input: b, encoding: 'utf8', windowsHide: true });
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

const emptyTreeOf = new Map();
const emptyTree = (home) => {
  if (!emptyTreeOf.has(home)) emptyTreeOf.set(home, gitIn(home, ['mktree'], { input: '' }).stdout);
  return emptyTreeOf.get(home);
};

function pruneEmpty(home, file, stop) {
  let dir = dirname(join(home, file));
  const end = join(home, stop);
  while (dir.length > end.length && dir.startsWith(end)) {
    try { if (readdirSync(dir).length) return; rmSync(dir, { recursive: true, force: true }); } catch { return; }
    dir = dirname(dir);
  }
}

/**
 * Bring the working tree of `path` from commit `from` to commit `to`: write each file that
 * differs, and delete each file that `from` has and `to` lacks. A file that neither commit has
 * stays. A working file whose bytes match neither commit is a change of this machine: it stays,
 * and it is reported as a conflict. `skip(file)` leaves a path out. `from` null is the empty tree.
 * Returns `{ written, deleted, conflicts }`.
 */
export function applyTree(home, from, to, path, { skip = () => false } = {}) {
  const out = { written: [], deleted: [], conflicts: [] };
  if (!to || from === to) return out;
  const d = spawnSync('git', ['-C', home, 'diff', '--raw', '-z', '--no-renames', '--no-abbrev', from ?? emptyTree(home), to, '--', path], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (d.status !== 0) return out;
  const parts = d.stdout.split('\0');
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [meta, file] = [parts[i], parts[i + 1]];
    if (!meta.startsWith(':') || !file || skip(file)) continue;
    const [, , src, dst, st] = meta.slice(1).split(' ');
    const target = join(home, file);
    const want = st.startsWith('D') ? null : blobBytes(home, dst);
    const had = st.startsWith('A') ? null : blobBytes(home, src);
    const cur = existsSync(target) && statSync(target).isFile() ? readFileSync(target) : null;
    if (cur && want && sameContent(cur, want)) continue;
    if (cur && !(had && sameContent(cur, had))) { out.conflicts.push(file); continue; }
    if (!want) {
      if (cur) { rmSync(target, { force: true }); out.deleted.push(file); pruneEmpty(home, file, path.replace(/\/+$/, '')); }
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, want);
    out.written.push(file);
  }
  return out;
}

/** The folders `<project>/<slug>` that have a live branch on this machine, of every project. */
function liveFolders(home) {
  const r = gitIn(home, ['for-each-ref', '--format=%(refname)', 'refs/heads/live/']);
  return new Set(r.stdout.split('\n').filter(Boolean).map((ref) => ref.slice('refs/heads/live/'.length)));
}
/** The skip rule of a move of the main branch: a folder with a live branch shows that branch. */
function skipLive(home) {
  const live = liveFolders(home);
  return (file) => {
    const [p, s] = file.split('/');
    return s !== undefined && live.has(`${p}/${s}`);
  };
}

/** Move the main branch from `from` to `to`: the ref, the index and the files of the working tree. */
function moveMain(home, from, to) {
  const main = `refs/heads/${mainBranch(home)}`;
  if (gitIn(home, ['update-ref', main, to, ...(from ? [from] : [])]).status !== 0) return null;
  gitIn(home, ['read-tree', to]);
  return applyTree(home, from, to, '.', { skip: skipLive(home) });
}

// ---------------------------------------------------------------- plumbing commit

/** True for a path of the records home that stays out of every commit: a local-only file, or a generated INDEX.md. */
export function keptOutOfCommits(file) {
  const parts = String(file).replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] === '.machines') return false;
  const rel = parts.slice(1).join('/');
  return rel === 'INDEX.md' || isLocalOnly(rel);
}

/** Remove from a temporary index each path under `paths` that stays out of the commits. */
function dropLocalOnly(home, index, paths) {
  const ls = spawnSync('git', ['-C', home, 'ls-files', '-z', '--cached', '--', ...paths], { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: index }, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const out = (ls.stdout ?? '').split('\0').filter((f) => f && keptOutOfCommits(f));
  if (out.length) gitIn(home, ['rm', '-q', '--cached', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul'], { index, input: `${out.join('\0')}\0` });
}

/**
 * Build a commit on `ref` whose tree is the tip of `ref` (else the tip of `base`) changed by
 * `fill(index)`. The ref moves with a compare-and-swap; a second writer that moved it first makes
 * this one build again on the new tip. Returns the new commit, the old one when nothing changed,
 * or null when the commit failed.
 */
function buildCommit(home, { ref, base, paths, message, fill }) {
  const index = join(home, '.git', `wf-index-${process.pid}`);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = sha(home, ref);
      const parent = current ?? (base ? sha(home, base) : null);
      const read = parent ? gitIn(home, ['read-tree', parent], { index }) : gitIn(home, ['read-tree', '--empty'], { index });
      if (read.status !== 0) return null;
      fill(index);
      dropLocalOnly(home, index, paths);
      const tree = gitIn(home, ['write-tree'], { index });
      if (tree.status !== 0) return null;
      if (parent && gitIn(home, ['rev-parse', `${parent}^{tree}`]).stdout === tree.stdout) return parent;
      const c = gitIn(home, ['commit-tree', tree.stdout, ...(parent ? ['-p', parent] : []), '-m', message]);
      if (c.status !== 0) return null;
      const u = gitIn(home, ['update-ref', ref, c.stdout, current ?? zeroOid(c.stdout)]);
      if (u.status === 0) return c.stdout;
    }
    return null;
  } finally {
    rmSync(index, { force: true });
  }
}

/**
 * Commit `paths` of the working tree onto `ref`, whose parent is the tip of `ref`, else the tip
 * of `base`. Nothing else of the tree changes, and no draft or local-only file goes in. Returns
 * the new commit, the old one when nothing changed, or null when the commit failed.
 */
export function commitPaths(home, { ref, base = null, paths, message }) {
  return buildCommit(home, {
    ref, base, paths, message,
    fill: (index) => {
      for (const p of paths) {
        gitIn(home, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', p], { index });
        if (existsSync(join(home, p))) gitIn(home, ['add', '-A', '-f', '--', p], { index });
      }
    },
  });
}

/** Commit onto `ref` the files of `paths` as commit `source` has them. */
function commitFrom(home, { ref, source, paths, message }) {
  return buildCommit(home, {
    ref, base: null, paths, message,
    fill: (index) => {
      for (const p of paths) {
        gitIn(home, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', p], { index });
        const ls = spawnSync('git', ['-C', home, 'ls-tree', '-r', '-z', '--full-tree', source, '--', p], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
        if (ls.status === 0 && ls.stdout) gitIn(home, ['update-index', '-z', '--index-info'], { index, input: ls.stdout });
      }
    },
  });
}

// ---------------------------------------------------------------- the clone's own files

/** The lines of the .gitignore of the records repo: the registry of each project is generated. */
export const CLONE_IGNORE = ['*/INDEX.md'];

/** Write the .gitignore of the records repo on its main branch when a line is missing. */
export function ensureCloneIgnore(home) {
  const file = join(home, '.gitignore');
  const have = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = have.split(/\r?\n/);
  const missing = CLONE_IGNORE.filter((l) => !lines.includes(l));
  if (!missing.length) return false;
  writeFileSync(file, `${have}${have && !have.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
  const c = commitPaths(home, { ref: `refs/heads/${mainBranch(home)}`, paths: ['.gitignore'], message: 'records: the generated INDEX.md files stay out of git' });
  if (c) gitIn(home, ['read-tree', c]);
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
 * The workflow files that a git worktree of the project holds and the main checkout lacks or
 * holds with other content. The main copy is the local file, else the clone copy. The link waits
 * for these files: a worktree that a session left at a later stage would lose them.
 */
export function worktreeRecords(root, project) {
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
 * folders into `<records home>/<project>/`. The drafts stay where the agents write them.
 * - Each file moves by a rename, with the rule of `adoptLocal`, so a folder that the clone holds
 *   already is merged. A local file whose content differs from the clone copy moves to
 *   `.ai/workflows/.conflicts/<slug>/`, and the link reports it. The config is written in that
 *   case too, because the clone copy is complete.
 * - A file that a session writes during the link stays local, and the next adopt moves it.
 * - A closed workflow is squashed onto the main branch.
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
  const waiting = worktreeRecords(root, project);
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
  adoptLocal(root, null);
  const moved = [];
  const conflicts = [];
  for (const e of readdirSync(local, { withFileTypes: true })) {
    // The project's design records (`_design`) move too; another `_` or `.` folder stays.
    if (!e.isDirectory() || e.name.startsWith('.') || (e.name.startsWith('_') && e.name !== '_design')) continue;
    const a = adoptLocal(root, e.name, { strict: true });
    if (!a) continue;
    if (a.moved.length || a.conflicts.length || existsSync(join(target, e.name))) moved.push(e.name);
    for (const f of a.conflicts) conflicts.push(`${e.name}/${f}`);
    if (e.name === '_design') {
      const c = commitPaths(home, { ref: `refs/heads/${mainBranch(home)}`, paths: [`${project}/_design`], message: `${project}: move the design records into the records repo` });
      if (c) gitIn(home, ['read-tree', c]);
    } else commitWorkflow(root, e.name, `${project}/${e.name}: move the records into the records repo`);
  }
  const squashed = [];
  for (const slug of moved) {
    if (slug === '_design') continue;
    const status = String(frontmatterOfDoc(join(target, slug), INDEX_NAME)?.status ?? '');
    if (!TERMINAL_WORKFLOW_STATUSES.has(status)) continue;
    const s = squashWorkflow(root, slug);
    if (s?.ok !== false) squashed.push(slug);
  }
  writeMachineFacts(root);
  const gaps = productRepoGaps(root);
  return { ok: true, home, project, moved, conflicts, squashed, tracked: gaps.tracked, ignoreLine: gaps.ignoreLine };
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
 * Move the files that a writer put in the local folder of a linked workflow into the records
 * home: an agent that writes by the local path, a test runner, a shell redirect. The drafts
 * stay. The rule compares content, never times:
 * - A local copy with the same content as the clone copy (line endings aside) is deleted.
 * - A local copy that was once a version of the file (in the history of its branch) is stale:
 *   a checkout, a restore or a stash put it back. It is deleted.
 * - A local copy of a file that the clone lacks, or whose clone copy is the committed one, is the
 *   newer write. It moves into the clone.
 * - Otherwise the clone copy has its own change. It stays, and the local copy moves to
 *   `.ai/workflows/.conflicts/<slug>/` and is reported.
 * `slug` null adopts the top-level files of the local workflows folder (INDEX.md, which the
 * clone rebuilds). With `strict` (the link), every clone copy with other content stays, and the
 * local copy moves aside. Returns `{ moved, stale, conflicts }`, or null when the project is not linked.
 */
export function adoptLocal(root, slug, { strict = false } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const out = { moved: [], stale: [], conflicts: [] };
  const home = recordsHome();
  const localRoot = localWorkflowsRoot(root);
  const from = slug ? join(localRoot, slug) : localRoot;
  const toRel = slug ? `${project}/${slug}` : project;
  const to = join(home, toRel);
  if (!existsSync(from)) return out;
  const tipRef = slug && sha(home, liveRef(project, slug)) ? liveRef(project, slug) : `refs/heads/${mainBranch(home)}`;
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
      const committed = tip ? blobAt(home, tip, inHome) : null;
      if (!existsSync(dst) || (!strict && committed && sameContent(readFileSync(dst), committed))) { move(src, dst); out.moved.push(r); continue; }
      parkConflict(localRoot, slug, r, src);
      out.conflicts.push(r);
    }
  };
  walk(from, '');
  return out;
}

/** The workflows of a linked project with files in the local folder that belong in the records home. */
function localStrays(root) {
  const localRoot = localWorkflowsRoot(root);
  if (!existsSync(localRoot)) return [];
  return readdirSync(localRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !isLocalOnly(e.name) && readdirSync(join(localRoot, e.name)).some((f) => f !== DRAFT_DIR))
    .map((e) => e.name);
}

// ---------------------------------------------------------------- commit and push

/**
 * Commit one workflow's folder to its live branch. Returns `{ commit, project, home, conflicts }`,
 * or null when unlinked; `conflicts` are the local files that `adoptLocal` kept aside.
 */
export function commitWorkflow(root, slug, message) {
  const project = linkedProject(root);
  if (!project) return null;
  const adopted = adoptLocal(root, slug);
  const home = recordsHome();
  const commit = commitPaths(home, { ref: liveRef(project, slug), base: `refs/heads/${mainBranch(home)}`, paths: [`${project}/${slug}`], message });
  if (!commit) logRecordsFailure({ project, slug, step: 'commit', error: 'the commit of the workflow folder failed' });
  return { commit, project, home, conflicts: adopted?.conflicts ?? [] };
}

/**
 * Commit every change of the clone of a project that no commit holds yet: the design records on
 * the main branch, and each workflow folder on its live branch. A folder with no change makes no
 * commit. After this, a move of a ref loses no file. With `root` null, the local files are not
 * adopted. Returns the slugs whose live branch got a new commit.
 */
function commitPending(root, project, home, label = `the records of ${machineName()} before a sync`) {
  const main = `refs/heads/${mainBranch(home)}`;
  if (existsSync(join(home, project, '_design'))) {
    const c = commitPaths(home, { ref: main, paths: [`${project}/_design`], message: `${project}: the design records before a sync` });
    if (c) gitIn(home, ['read-tree', c]);
  }
  // The folders that differ from the main branch: the open workflows, and a closed one with a new file.
  const st = spawnSync('git', ['-C', home, 'status', '--porcelain', '-z', '--untracked-files=all', '--', `${project}/`], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const slugs = new Set();
  for (const row of (st.stdout ?? '').split('\0')) {
    const file = row.slice(3);
    const [p, s, rest] = file.split('/');
    if (p !== project || !s || rest === undefined || s.startsWith('.') || s.startsWith('_') || keptOutOfCommits(file)) continue;
    slugs.add(s);
  }
  const committed = [];
  for (const s of slugs) {
    const ref = liveRef(project, s);
    const before = sha(home, ref);
    const message = `${project}/${s}: ${label}`;
    if (root) commitWorkflow(root, s, message);
    else commitPaths(home, { ref, base: main, paths: [`${project}/${s}`], message });
    if (sha(home, ref) !== before) committed.push(s);
  }
  return committed;
}

/**
 * Commit the records that a writer other than the wf.mjs record commands left in the clone, such
 * as the campaign script. The next sync pushes the commits. Give `root` for a linked project, or
 * `project` for a writer that knows only the clone folder. Returns the slugs with a new commit,
 * or null when the records are not in a clone.
 */
export function commitRecords({ root = null, project = null, label }) {
  const name = root ? linkedProject(root) : project;
  if (!name || !PROJECT_NAME_RE.test(name)) return null;
  const home = recordsHome();
  if (!existsSync(join(home, '.git')) || !existsSync(join(home, name))) return null;
  return commitPending(root, name, home, label);
}

/**
 * Push a ref. A rejected push fetches the remote tip, merges the two trees, writes the changed
 * files and pushes again. A live branch writes its folder; the main branch writes every folder
 * that has no live branch here. Returns `{ pushed, offline, conflict }`.
 */
export function pushRef(home, ref, { folder = null } = {}) {
  if (!hasRemote(home)) return { pushed: false, offline: true, reason: 'the records clone has no remote' };
  const local = sha(home, ref);
  if (!local) return { pushed: false, reason: `no ref ${ref}` };
  const isMain = ref === `refs/heads/${mainBranch(home)}`;
  const follow = (from, to) => {
    if (isMain) { gitIn(home, ['read-tree', to]); applyTree(home, from, to, '.', { skip: skipLive(home) }); } else if (folder) applyTree(home, from, to, folder);
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const p = gitIn(home, ['push', '-q', 'origin', `${ref}:${ref}`], { net: true });
    if (p.status === 0) return { pushed: true };
    const f = gitIn(home, ['fetch', '-q', 'origin', `+${ref}:refs/wf-remote/${ref.slice(5)}`], { net: true });
    if (f.status !== 0) return { pushed: false, offline: true, reason: (p.stderr || f.stderr).split('\n')[0] };
    const theirs = sha(home, `refs/wf-remote/${ref.slice(5)}`);
    const ours = sha(home, ref);
    if (!theirs || isAncestor(home, theirs, ours)) continue;
    if (isAncestor(home, ours, theirs)) {
      if (gitIn(home, ['update-ref', ref, theirs, ours]).status !== 0) continue;
      follow(ours, theirs);
      return { pushed: true, fastForward: true };
    }
    const m = gitIn(home, ['merge-tree', '--write-tree', '--allow-unrelated-histories', ours, theirs]);
    if (m.status !== 0) return { pushed: false, conflict: true, reason: m.stdout.split('\n').slice(1).join('; ') || 'the trees conflict' };
    const tree = m.stdout.split('\n')[0];
    const c = gitIn(home, ['commit-tree', tree, '-p', ours, '-p', theirs, '-m', `merge ${ref.slice(11)} from another machine`]);
    if (c.status !== 0) return { pushed: false, reason: c.stderr };
    if (gitIn(home, ['update-ref', ref, c.stdout, ours]).status !== 0) continue;
    follow(ours, c.stdout);
  }
  return { pushed: false, reason: 'the push was rejected three times' };
}

/**
 * Push the live branch of one workflow. While another machine holds the lease, nothing is
 * pushed (`leaseLost`): the commit stays on the local live branch, and the next sync after a
 * claim pushes it. `lease: 'local'` reads the lease ref that a sync just fetched, with no call.
 */
export function pushWorkflow(root, slug, { lease = 'remote' } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const other = lease === 'none' ? null : otherLease(root, slug, { remote: lease === 'remote' });
  if (other) return { pushed: false, leaseLost: true, lease: other, reason: `the lease belongs to ${other.machine} until ${other.expires}` };
  const r = pushRef(home, liveRef(project, slug), { folder: `${project}/${slug}` });
  const key = `${project}/${slug}`;
  updateState((state) => {
    if (r.conflict) state.conflicts[key] = { at: nowIso(), reason: r.reason };
    else if (r.pushed) { delete state.conflicts[key]; clearFailure(state, key); }
  });
  return r;
}

/** The remote tips of `refs`, as a Map of ref → sha; null when the remote is out of reach. */
function remoteTips(home, refs) {
  if (!hasRemote(home)) return null;
  const ls = gitIn(home, ['ls-remote', 'origin', ...refs], { net: true });
  if (ls.status !== 0) return null;
  return new Map(ls.stdout.split('\n').filter(Boolean).map((l) => l.split('\t').reverse()));
}

/** Delete a remote ref only while it still points at `expect`. */
const deleteRemote = (home, ref, expect) => gitIn(home, ['push', '-q', `--force-with-lease=${ref}:${expect}`, 'origin', `:${ref}`], { net: true }).status === 0;

// ---------------------------------------------------------------- close

/**
 * Squash a closed workflow onto the main branch: one commit that puts its folder there, then
 * the live branch is deleted. The squash takes the live branch with the work that other machines
 * pushed to it. Offline, the close waits in the local state for the next sync.
 */
export function squashWorkflow(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const key = `${project}/${slug}`;
  const ref = liveRef(project, slug);
  commitWorkflow(root, slug, `${key}: close`);
  const main = mainBranch(home);
  const tips = remoteTips(home, [`refs/heads/${main}`, ref]);
  const online = Boolean(tips);
  if (tips?.has(`refs/heads/${main}`)) gitIn(home, ['fetch', '-q', 'origin', `+refs/heads/${main}:refs/remotes/origin/${main}`], { net: true });
  // The live work of another machine comes in first, so the squash holds both sides.
  // `remoteTip` is the remote live tip that the squash holds: the lease of its delete.
  let remoteTip = null;
  if (tips?.has(ref)) {
    gitIn(home, ['fetch', '-q', 'origin', `+${ref}:${remoteLiveRef(project, slug)}`], { net: true });
    remoteTip = sha(home, remoteLiveRef(project, slug));
    const ours = sha(home, ref);
    if (remoteTip && remoteTip !== ours && !(ours && isAncestor(home, remoteTip, ours))) {
      const p = pushWorkflow(root, slug, { lease: 'local' });
      if (!p?.pushed) {
        logRecordsFailure({ project, slug, step: 'close', error: p?.reason ?? 'the live branch did not merge' });
        return { ok: false, reason: `the live branch of another machine did not merge: ${p?.reason ?? 'unknown'}` };
      }
      remoteTip = sha(home, ref);
    }
  }
  const remoteMain = online ? sha(home, `refs/remotes/origin/${main}`) : null;
  const localMain = sha(home, `refs/heads/${main}`);
  // The squash goes on the newest main this machine knows.
  if (remoteMain && remoteMain !== localMain && (!localMain || isAncestor(home, localMain, remoteMain))) moveMain(home, localMain, remoteMain);
  const live = sha(home, ref);
  // The trailer names the live tip that the squash holds: a later fold merges from it.
  const message = `${key}: the records of the closed workflow${live ? `\n\n${SQUASHED_TRAILER}: ${live}` : ''}`;
  const commit = live
    ? commitFrom(home, { ref: `refs/heads/${main}`, source: live, paths: [key], message })
    : commitPaths(home, { ref: `refs/heads/${main}`, paths: [key], message });
  if (!commit) {
    logRecordsFailure({ project, slug, step: 'close', error: 'the squash commit failed' });
    return { ok: false, reason: 'the squash commit failed' };
  }
  // HEAD names the main branch: the index follows the new tip, the working tree keeps its files.
  gitIn(home, ['read-tree', commit]);
  const pushed = online ? pushRef(home, `refs/heads/${main}`) : { pushed: false, offline: true };
  let keptLive = false;
  if (pushed.pushed && live) {
    // A remote live branch that moved after the merge keeps its new commits for the next sync.
    if (remoteTip && !deleteRemote(home, ref, remoteTip)) keptLive = true;
    else dropRef(home, ref, `${key}: squashed onto ${main}`);
  }
  updateState((state) => {
    if (pushed.pushed) { state.pendingClose = state.pendingClose.filter((k) => k !== key); clearFailure(state, key); }
    else if (!state.pendingClose.includes(key)) state.pendingClose.push(key);
  });
  if (!pushed.pushed && !pushed.offline) logRecordsFailure({ project, slug, step: 'close', error: pushed.reason });
  return { ok: true, commit, pushed: Boolean(pushed.pushed), pending: !pushed.pushed, ...(keptLive ? { keptLive } : {}), ...(pushed.reason ? { reason: pushed.reason } : {}) };
}

const SQUASHED_TRAILER = 'Squashed-live';

/**
 * Put the records that a live branch got after its workflow closed on the main branch, as one
 * more commit, and delete the live branch. The merge starts from the newest tip that the main
 * branch already holds: the live tip of the last squash, or the remote tip that this machine
 * knew before the sync (`pushedTip`). A live branch with nothing past that tip, or with the
 * same folder as the main branch, is only deleted. Returns `{ folded, dropped, reason }`.
 */
function foldAfterClose(root, project, slug, home, { remote, pushedTip = null }) {
  const key = `${project}/${slug}`;
  const ref = liveRef(project, slug);
  const main = `refs/heads/${mainBranch(home)}`;
  const live = sha(home, ref);
  const tip = sha(home, main);
  if (!live || !tip) return { folded: false };
  const liveTree = gitIn(home, ['rev-parse', '--verify', '--quiet', `${live}:${key}`]).stdout;
  const mainTree = gitIn(home, ['rev-parse', '--verify', '--quiet', `${tip}:${key}`]).stdout;
  const squashed = gitIn(home, ['log', '-1', `--format=%(trailers:key=${SQUASHED_TRAILER},valueonly)`, tip, '--', key]).stdout.trim();
  const held = [squashed, pushedTip].filter((c) => c && sha(home, c));
  // The live branch goes on both sides; a remote tip that this machine lacks keeps it.
  const drop = (folded, why) => {
    const theirs = remote ? sha(home, remoteLiveRef(project, slug)) : null;
    if (theirs && (!isAncestor(home, theirs, live) || !deleteRemote(home, ref, theirs))) return { folded, dropped: false };
    dropRef(home, ref, `${key}: ${why}`);
    // With no live branch, the folder shows the main branch.
    applyTree(home, live, sha(home, main), key);
    return { folded, dropped: true };
  };
  if (liveTree === mainTree) return drop(false, 'the same folder is on the main branch');
  if (held.some((c) => isAncestor(home, live, c))) return drop(false, 'the main branch holds this live branch');
  const mergeBase = held.find((c) => isAncestor(home, c, live)) ?? null;
  const m = gitIn(home, ['merge-tree', '--write-tree', ...(mergeBase ? [`--merge-base=${mergeBase}`] : ['--allow-unrelated-histories']), tip, live]);
  if (m.status !== 0) return { folded: false, reason: `${slug}: the records after the close conflict with ${mainBranch(home)}` };
  const c = gitIn(home, ['commit-tree', m.stdout.split('\n')[0], '-p', tip, '-m', `${key}: records after close`]);
  if (c.status !== 0 || gitIn(home, ['update-ref', main, c.stdout, tip]).status !== 0) return { folded: false, reason: `${slug}: the commit of the records after the close failed` };
  gitIn(home, ['read-tree', c.stdout]);
  if (remote) {
    const p = pushRef(home, main);
    if (!p.pushed) return { folded: true, dropped: false, reason: `${mainBranch(home)}: ${p.reason ?? 'not pushed'}` };
  }
  return drop(true, 'folded after the close');
}

// ---------------------------------------------------------------- sync

/** The per-machine facts of this machine: its own file, which no other machine reads as true. */
export function machineFactsPath(home = recordsHome(), machine = machineName()) {
  return join(home, '.machines', `${machine}.json`);
}
export function readMachineFacts(home = recordsHome(), machine = machineName()) {
  try { return JSON.parse(readFileSync(machineFactsPath(home, machine), 'utf8')); } catch { return { machine, projects: {}, reads: {} }; }
}
export function writeMachineFacts(root, change = {}) {
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
  const main = mainBranch(home);
  const commit = commitPaths(home, { ref: `refs/heads/${main}`, paths: [`.machines/${machineName()}.json`], message: `${machineName()}: machine facts` });
  if (commit) gitIn(home, ['read-tree', commit]);
  return facts;
}

/**
 * Pull the work of other machines. The uncommitted files of the clone go into commits first.
 * The main branch and every live branch of the project that this machine does not hold move to
 * the remote tip, and only the changed files are written. A live branch that this machine holds
 * is pushed instead. A live branch of a closed workflow is folded onto the main branch. Returns
 * what moved, with `conflicts` (refs that did not merge) and `adoptConflicts` (local files kept aside).
 */
export function syncRecords(root, { holds = () => false } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const out = { project, pulled: [], pushed: [], folded: [], conflicts: [], fileConflicts: [], adoptConflicts: [], offline: false };
  // The files that writers put in the local folder go home first, so the push carries them.
  adoptLocal(root, null);
  for (const slug of localStrays(root)) {
    const c = commitWorkflow(root, slug, `${slug}: adopt the local files`);
    for (const f of c?.conflicts ?? []) out.adoptConflicts.push(`${slug}/${f}`);
  }
  commitPending(root, project, home);
  ensureCloneIgnore(home);
  if (!hasRemote(home)) { out.offline = true; return out; }
  // The remote live tips that this machine knew: a fetch prunes the tips of closed workflows.
  const prefix = `refs/remotes/origin/live/${project}/`;
  const knownRemote = new Map(gitIn(home, ['for-each-ref', '--format=%(refname) %(objectname)', prefix]).stdout.split('\n').filter(Boolean)
    .map((l) => { const [r, o] = l.split(' '); return [r.slice(prefix.length), o]; }));
  const f = gitIn(home, ['fetch', '-q', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*', '+refs/leases/*:refs/leases/*'], { net: true });
  if (f.status !== 0) { out.offline = true; return out; }
  const main = mainBranch(home);
  // A close that waited for the network goes out first.
  for (const key of [...readState().pendingClose]) {
    if (key.startsWith(`${project}/`)) squashWorkflow(root, key.slice(project.length + 1));
  }
  const remoteMain = sha(home, `refs/remotes/origin/${main}`);
  const localMain = sha(home, `refs/heads/${main}`);
  if (remoteMain !== localMain) {
    if (remoteMain && (!localMain || isAncestor(home, localMain, remoteMain))) {
      const a = moveMain(home, localMain, remoteMain);
      for (const c of a?.conflicts ?? []) out.fileConflicts.push(c);
    } else {
      // This machine has main commits that the remote lacks: a squash or machine facts.
      const r = pushRef(home, `refs/heads/${main}`);
      if (!r.pushed) out.conflicts.push(`${main}: ${r.reason}`);
    }
    const tip = sha(home, `refs/heads/${main}`);
    if (tip && tip !== localMain) {
      const changed = gitIn(home, ['diff', '--name-only', localMain ?? emptyTree(home), tip, '--', `${project}/`]);
      for (const p of new Set(changed.stdout.split('\n').filter(Boolean).map((x) => x.split('/')[1]))) out.pulled.push(p);
    }
  }
  const remotes = gitIn(home, ['for-each-ref', '--format=%(refname)', `refs/remotes/origin/live/${project}/`]);
  const seen = new Set();
  for (const ref of remotes.stdout.split('\n').filter(Boolean)) {
    const slug = ref.slice(`refs/remotes/origin/live/${project}/`.length);
    seen.add(slug);
    const theirs = sha(home, ref);
    const ours = sha(home, liveRef(project, slug));
    if (theirs === ours) continue;
    if (holds(slug) || (ours && isAncestor(home, theirs, ours))) {
      const r = pushWorkflow(root, slug, { lease: 'local' });
      if (r?.pushed) out.pushed.push(slug); else if (r?.conflict) out.conflicts.push(`${slug}: ${r.reason}`);
      continue;
    }
    if (!ours || isAncestor(home, ours, theirs)) {
      // The folder shows the main branch until this machine has the live branch.
      const from = ours ?? sha(home, `refs/heads/${main}`);
      if (gitIn(home, ['update-ref', liveRef(project, slug), theirs, ...(ours ? [ours] : [])]).status !== 0) continue;
      const a = applyTree(home, from, theirs, `${project}/${slug}`);
      for (const c of a.conflicts) out.fileConflicts.push(c);
      out.pulled.push(slug);
    } else {
      const r = pushWorkflow(root, slug, { lease: 'local' });
      if (r?.pushed) out.pulled.push(slug); else out.conflicts.push(`${slug}: ${r?.reason ?? 'the branches diverged'}`);
    }
  }
  // A live branch that only this machine has goes out. A live branch of a workflow that is on
  // the main branch holds records written after the close: they go onto the main branch.
  const tip = sha(home, `refs/heads/${main}`);
  const pending = new Set(readState().pendingClose);
  const locals = gitIn(home, ['for-each-ref', '--format=%(refname)', `refs/heads/live/${project}/`]);
  for (const ref of locals.stdout.split('\n').filter(Boolean)) {
    const slug = ref.slice(`refs/heads/live/${project}/`.length);
    const key = `${project}/${slug}`;
    if (tip && !pending.has(key) && gitIn(home, ['cat-file', '-e', `${tip}:${key}`]).status === 0) {
      const r = foldAfterClose(root, project, slug, home, { remote: true, pushedTip: knownRemote.get(slug) ?? null });
      if (r.folded) out.folded.push(slug);
      if (r.reason) out.conflicts.push(r.reason);
      continue;
    }
    if (seen.has(slug)) continue;
    const r = pushWorkflow(root, slug, { lease: 'local' });
    if (r?.pushed) out.pushed.push(slug);
  }
  writeMachineFacts(root);
  return out;
}

// ---------------------------------------------------------------- another project

const fetchedOther = new Set();

/**
 * Where this machine reads a workflow of another project. A workflow with a local live branch is
 * in the folder of the clone (`{ folder: true }`). Else the commit that has it is read with git:
 * the remote live branch for an open workflow, the main branch for a closed one (`{ ref }`). The
 * fetch goes into `refs/wf-other/`, once per process, so its prune leaves the remote-tracking
 * refs of the sync as they are. Offline, the tips of the last fetch are read.
 */
export function otherProjectSource(project, slug, home = recordsHome()) {
  if (!existsSync(join(home, '.git'))) return null;
  if (sha(home, liveRef(project, slug))) return { folder: true };
  const main = mainBranch(home);
  if (hasRemote(home) && !fetchedOther.has(project)) {
    fetchedOther.add(project);
    gitIn(home, ['fetch', '-q', '--prune', 'origin', `+refs/heads/live/${project}/*:refs/wf-other/live/${project}/*`, `+refs/heads/${main}:refs/wf-other/main`], { net: true });
  }
  const key = `${project}/${slug}`;
  for (const ref of [`refs/wf-other/live/${key}`, 'refs/wf-other/main', `refs/remotes/origin/${main}`, `refs/heads/${main}`, remoteLiveRef(project, slug)]) {
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

/**
 * Put one new file on the live branch of a workflow of another project, and push it. The commit
 * builds on the remote tip and adds only that file; a closed workflow gets a live branch from the
 * main branch, which the next sync of its project folds back. No local branch and no file of the
 * working tree change. A rejected push builds again on the new tip. Returns `{ pushed, offline, reason }`.
 */
export function postFileTo(project, slug, { path, text, message }, home = recordsHome()) {
  const key = `${project}/${slug}`;
  const live = liveRef(project, slug);
  const main = mainBranch(home);
  const blob = gitIn(home, ['hash-object', '-w', '--stdin'], { input: text });
  if (blob.status !== 0) return { pushed: false, reason: blob.stderr };
  const index = join(home, '.git', `wf-post-${process.pid}`);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tips = remoteTips(home, [live, `refs/heads/${main}`]);
      if (!tips) return { pushed: false, offline: true, reason: 'the records remote is out of reach' };
      const from = tips.has(live) ? [live, remoteLiveRef(project, slug)] : [`refs/heads/${main}`, `refs/remotes/origin/${main}`];
      if (!tips.has(from[0])) return { pushed: false, reason: `no workflow ${key}` };
      if (gitIn(home, ['fetch', '-q', 'origin', `+${from[0]}:${from[1]}`], { net: true }).status !== 0) return { pushed: false, offline: true, reason: 'the fetch failed' };
      const parent = tips.get(from[0]);
      if (gitIn(home, ['cat-file', '-e', `${parent}:${key}`]).status !== 0) return { pushed: false, reason: `no workflow ${key}` };
      if (gitIn(home, ['read-tree', parent], { index }).status !== 0) return { pushed: false, reason: 'the tree could not be read' };
      gitIn(home, ['update-index', '--add', '--cacheinfo', `100644,${blob.stdout},${key}/${path}`], { index });
      const tree = gitIn(home, ['write-tree'], { index });
      const c = tree.status === 0 ? gitIn(home, ['commit-tree', tree.stdout, '-p', parent, '-m', message]) : tree;
      if (c.status !== 0) return { pushed: false, reason: c.stderr };
      if (gitIn(home, ['push', '-q', 'origin', `${c.stdout}:${live}`], { net: true }).status === 0) return { pushed: true, commit: c.stdout };
    }
    return { pushed: false, reason: 'the push was rejected three times' };
  } finally {
    rmSync(index, { force: true });
  }
}

// ---------------------------------------------------------------- state of the clone

/** The files of a workflow folder in the clone that no commit holds: changed, new or deleted. */
function uncommittedOf(home, project, slug) {
  const key = `${project}/${slug}`;
  const tip = sha(home, liveRef(project, slug)) ?? sha(home, `refs/heads/${mainBranch(home)}`);
  const index = join(home, '.git', `wf-status-${process.pid}`);
  try {
    if ((tip ? gitIn(home, ['read-tree', tip], { index }) : gitIn(home, ['read-tree', '--empty'], { index })).status !== 0) return [];
    const st = spawnSync('git', ['-C', home, 'status', '--porcelain', '-z', '--untracked-files=all', '--', `${key}/`], { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: index }, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    return (st.stdout ?? '').split('\0').filter((row) => row.length > 3 && (row[1] !== ' ' || row.startsWith('??')))
      .map((row) => row.slice(3)).filter((f) => !keptOutOfCommits(f)).map((f) => f.slice(key.length + 1));
  } finally { rmSync(index, { force: true }); }
}

/**
 * The health of one workflow in the clone: the uncommitted files, the commits ahead of and
 * behind the remote live branch, the local files that the adopt kept aside, a conflict of a
 * push, and the last logged failure. `problem` is true when any of these is not empty.
 */
export function workflowHealth(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const key = `${project}/${slug}`;
  const state = readState();
  const ours = sha(home, liveRef(project, slug));
  const theirs = sha(home, remoteLiveRef(project, slug));
  let ahead = 0;
  let behind = 0;
  if (ours && theirs && ours !== theirs) {
    const c = gitIn(home, ['rev-list', '--left-right', '--count', `${ours}...${theirs}`]).stdout.split(/\s+/).map(Number);
    [ahead, behind] = [c[0] || 0, c[1] || 0];
  } else if (ours && !theirs && hasRemote(home)) {
    ahead = Number(gitIn(home, ['rev-list', '--count', ours, '--not', '--remotes=origin']).stdout) || 0;
  }
  // The local copies that an adopt kept aside stay listed until the person deletes them.
  const kept = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), r); else kept.push(r);
    }
  };
  const parked = join(localWorkflowsRoot(root), '.conflicts', slug);
  if (existsSync(parked)) walk(parked, '');
  const h = {
    workflow: key,
    uncommitted: uncommittedOf(home, project, slug),
    ahead, behind,
    adoptConflicts: kept,
    conflict: state.conflicts?.[key]?.reason ?? null,
    lastFailure: state.failures?.[key] ?? null,
    pendingClose: state.pendingClose.includes(key),
  };
  h.problem = Boolean(h.uncommitted.length || h.ahead || h.behind || h.adoptConflicts.length || h.conflict || h.lastFailure);
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
  if (h.lastFailure) parts.push(`the last ${h.lastFailure.step} failed at ${h.lastFailure.at}: ${h.lastFailure.error}`);
  return `records-warning: ${h.workflow}: ${parts.join('; ')}. Run wf.mjs records status <root>.`;
}

/** What the records clone holds for a project on this machine. */
export function recordsStatus(root) {
  const project = linkedProject(root);
  const home = recordsHome();
  const state = readState();
  if (!project) return { linked: false, home, clone: existsSync(join(home, '.git')) };
  const live = gitIn(home, ['for-each-ref', '--format=%(refname:short) %(objectname:short)', `refs/heads/live/${project}/`]).stdout.split('\n').filter(Boolean);
  const slugs = new Set(gitIn(home, ['for-each-ref', '--format=%(refname)', `refs/heads/live/${project}/`]).stdout.split('\n').filter(Boolean).map((r) => r.slice(`refs/heads/live/${project}/`.length)));
  const dir = join(home, project);
  if (existsSync(dir)) for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) slugs.add(e.name);
  const workflows = [...slugs].sort().map((s) => workflowHealth(root, s)).filter((h) => h.problem);
  return {
    linked: true, home, project, machine: machineName(), main: mainBranch(home), remote: hasRemote(home), live,
    pendingClose: state.pendingClose.filter((k) => k.startsWith(`${project}/`)),
    conflicts: Object.entries(state.conflicts).filter(([k]) => k.startsWith(`${project}/`)).map(([k, v]) => ({ workflow: k, ...v })),
    workflows,
    dropped: (state.dropped ?? []).filter((d) => d.ref.startsWith(`refs/heads/live/${project}/`)).slice(-10),
  };
}
