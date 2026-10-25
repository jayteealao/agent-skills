// The scratch worktrees of a workflow: detached checkouts of another commit, where a stage runs a
// check on other code (the base commit before a slice, a release tag, a commit to bisect). They
// have one place, `.scratch/worktrees/<slug>/<name>/` in the project, so the stage and the yolo
// run end can find them and remove them.
//
// CAUTION: `git worktree remove --force` deletes through a junction or a symbolic link, into the
// files that the link names. The remove refuses a worktree that holds a link.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, lstatSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const SCRATCH_WORKTREES = '.scratch/worktrees';
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_DIRS = 50_000;

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, timeout: 600_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: !r.error && r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? r.error?.message ?? '').trim() };
}
const slash = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');
const fold = (p) => (process.platform === 'win32' ? slash(p).toLowerCase() : slash(p));
const within = (p, dir) => fold(p) === fold(dir) || fold(p).startsWith(`${fold(dir)}/`);

function checkName(kind, v) {
  if (!NAME_RE.test(String(v ?? ''))) throw new Error(`worktree: the ${kind} ${v} must match ${NAME_RE}`);
}

/** The folder of the scratch worktrees of a workflow, or of one of them. */
export function scratchWorktreeDir(root, slug, name = null) {
  checkName('slug', slug);
  if (name !== null) checkName('name', name);
  const dir = join(resolve(root), SCRATCH_WORKTREES, slug);
  return name === null ? dir : join(dir, name);
}

/** The worktrees of the repo: [{ path, head }]. */
export function worktrees(root) {
  const r = git(root, ['worktree', 'list', '--porcelain']);
  if (!r.ok) return [];
  return r.out.split(/\n\n+/).map((block) => {
    const w = {};
    for (const line of block.split('\n')) {
      const [k, ...v] = line.split(' ');
      if (k === 'worktree') w.path = resolve(v.join(' '));
      else if (k === 'HEAD') w.head = v[0];
    }
    return w;
  }).filter((w) => w.path);
}

/**
 * The links under a folder. A folder with a CACHEDIR.TAG (a build cache, such as a Cargo target
 * folder) is not read. Returns { links, complete }: `complete` is false when the scan stopped.
 */
export function linksUnder(dir) {
  const links = [];
  const stack = [dir];
  let seen = 0;
  while (stack.length) {
    if (seen++ >= MAX_DIRS) return { links, complete: false };
    const d = stack.pop();
    let entries = [];
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { continue; }
    if (d !== dir && entries.some((e) => e.name === 'CACHEDIR.TAG')) continue;
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (st.isSymbolicLink()) links.push(slash(relative(dir, p)));
      else if (st.isDirectory()) stack.push(p);
    }
  }
  return { links, complete: true };
}

/** Keep the scratch folder out of git: add `.scratch/` to .git/info/exclude when git does not ignore it. */
function ignoreScratch(root) {
  if (git(root, ['check-ignore', '-q', `${SCRATCH_WORKTREES}/x`]).ok) return;
  const gitDir = git(root, ['rev-parse', '--git-common-dir']);
  if (!gitDir.ok) return;
  const exclude = resolve(root, gitDir.out, 'info', 'exclude');
  mkdirSync(dirname(exclude), { recursive: true });
  appendFileSync(exclude, '\n.scratch/\n');
}

/**
 * Make the scratch worktree `name` of a workflow at `commit`, detached. One that is already there
 * at the same commit is kept. Returns { ok, path, commit, reused } or { ok: false, error }.
 */
export function addScratchWorktree(root, slug, name, commit) {
  const dir = scratchWorktreeDir(root, slug, name);
  const sha = git(root, ['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]);
  if (!sha.ok || !sha.out) return { ok: false, error: `worktree: no commit ${commit}` };
  const have = worktrees(root).find((w) => fold(w.path) === fold(dir));
  if (have) {
    if (have.head === sha.out) return { ok: true, path: dir, commit: sha.out, reused: true };
    return { ok: false, path: dir, error: `worktree: ${dir} is at ${String(have.head).slice(0, 12)}, not ${sha.out.slice(0, 12)}. Remove it first.` };
  }
  if (existsSync(dir)) return { ok: false, path: dir, error: `worktree: ${dir} exists but is not a worktree. Look at it, then delete it.` };
  ignoreScratch(root);
  const r = git(root, ['worktree', 'add', '--detach', dir, sha.out]);
  if (!r.ok) return { ok: false, path: dir, error: `worktree: git worktree add failed: ${r.err.split('\n')[0]}` };
  return { ok: true, path: dir, commit: sha.out, reused: false };
}

/** Delete the empty folders from `dir` up to, not including, `stop`. */
function pruneEmpty(dir, stop) {
  let d = dir;
  while (within(d, stop) && fold(d) !== fold(stop)) {
    try { if (readdirSync(d).length) return; rmdirSync(d); } catch { return; }
    d = dirname(d);
  }
}

/**
 * Remove the scratch worktrees of a workflow, or one of them. A worktree that holds a link, or
 * whose link scan did not finish, is kept and reported. Returns { removed, refused, failed }.
 */
export function removeScratchWorktrees(root, slug, name = null) {
  const scope = scratchWorktreeDir(root, slug, name);
  const out = { removed: [], refused: [], failed: [] };
  for (const w of worktrees(root)) {
    if (!within(w.path, scope)) continue;
    const scan = linksUnder(w.path);
    if (scan.links.length || !scan.complete) {
      out.refused.push({ path: w.path, reason: scan.links.length ? `it holds links: ${scan.links.slice(0, 3).join(', ')}` : 'the link scan did not finish' });
      continue;
    }
    const r = git(root, ['worktree', 'remove', '--force', w.path]);
    if (r.ok) out.removed.push(w.path);
    else out.failed.push({ path: w.path, reason: r.err.split('\n')[0] || 'git worktree remove failed' });
  }
  git(root, ['worktree', 'prune']);
  pruneEmpty(scope, join(resolve(root), '.scratch'));
  return out;
}
