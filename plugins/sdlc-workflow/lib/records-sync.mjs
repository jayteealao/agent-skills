// The records repo on this machine: link a project, commit and push its records, pull the work
// of other machines, and squash a workflow's history when it closes.
//
// Each open workflow has its own branch, `live/<project>/<slug>`. A commit goes to that branch
// at each step and stage boundary, built with plumbing (a temporary index), so the working tree
// and the main branch stay as they are. When the workflow closes, one commit puts its folder on
// the main branch and the live branch is deleted: the main branch keeps one commit per workflow.
//
// A push that the remote rejects is merged with `git merge-tree`: two machines that wrote other
// files (a message in `inbox/`, say) merge cleanly. A real conflict stops and is reported.
// Offline work stays in the local refs, and the next sync pushes it.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { DRAFT_DIR } from './records.mjs';
import { PROJECT_NAME_RE, isLocalOnly, linkedProject, localWorkflowsRoot, recordsHome } from './records-root.mjs';

const NET_TIMEOUT_MS = 20_000;
const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

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

/** The main branch of the records clone: the branch that HEAD names. */
export function mainBranch(home) {
  const r = gitIn(home, ['symbolic-ref', '--short', 'HEAD']);
  return r.status === 0 && r.stdout ? r.stdout : 'main';
}
export const liveRef = (project, slug) => `refs/heads/live/${project}/${slug}`;
const hasRemote = (home) => gitIn(home, ['remote', 'get-url', 'origin']).status === 0;

// ---------------------------------------------------------------- local state

const statePath = () => join(sdlcHomeDir(), 'records-state.json');
function readState() {
  try { return { pendingClose: [], conflicts: {}, ...JSON.parse(readFileSync(statePath(), 'utf8')) }; } catch { return { pendingClose: [], conflicts: {} }; }
}
function writeState(s) {
  mkdirSync(sdlcHomeDir(), { recursive: true });
  const tmp = `${statePath()}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(s, null, 2)}\n`);
  renameSync(tmp, statePath());
}

// ---------------------------------------------------------------- plumbing commit

/**
 * Commit `paths` of the working tree onto `ref`, whose parent is the tip of `ref`, else the tip
 * of `base`. Nothing else of the tree changes. Returns the new commit, the old one when nothing
 * changed, or null when the commit failed.
 */
export function commitPaths(home, { ref, base = null, paths, message }) {
  const parent = sha(home, ref) ?? (base ? sha(home, base) : null);
  const index = join(home, '.git', `wf-index-${process.pid}`);
  try {
    const read = parent ? gitIn(home, ['read-tree', parent], { index }) : gitIn(home, ['read-tree', '--empty'], { index });
    if (read.status !== 0) return null;
    for (const p of paths) {
      gitIn(home, ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', p], { index });
      if (existsSync(join(home, p))) gitIn(home, ['add', '-A', '-f', '--', p], { index });
    }
    const tree = gitIn(home, ['write-tree'], { index });
    if (tree.status !== 0) return null;
    if (parent && gitIn(home, ['rev-parse', `${parent}^{tree}`]).stdout === tree.stdout) return parent;
    const c = gitIn(home, ['commit-tree', tree.stdout, ...(parent ? ['-p', parent] : []), '-m', message]);
    if (c.status !== 0) return null;
    const u = gitIn(home, ['update-ref', ref, c.stdout, ...(parent && sha(home, ref) ? [parent] : [])]);
    return u.status === 0 ? c.stdout : null;
  } finally {
    rmSync(index, { force: true });
  }
}

/** Write the files under `path` of commit `ref` into the working tree, in place of what is there. */
function writeFolder(home, ref, path) {
  rmSync(join(home, path), { recursive: true, force: true });
  const ls = gitIn(home, ['ls-tree', '-r', '-z', '--full-tree', ref, '--', path]);
  if (ls.status !== 0 || !ls.stdout) return;
  for (const row of ls.stdout.split('\0').filter(Boolean)) {
    const [meta, file] = row.split('\t');
    const blob = meta.split(' ')[2];
    const out = spawnSync('git', ['-C', home, 'cat-file', 'blob', blob], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const target = join(home, file);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, out.stdout);
  }
}

// ---------------------------------------------------------------- link

/**
 * Link a project to the records repo: `records.project` in .ai/sdlc-config.json, and the local
 * records moved into <home>/<project>/. The drafts and the local files of a run stay.
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
  const target = join(home, project);
  mkdirSync(target, { recursive: true });
  const local = localWorkflowsRoot(root);
  const moved = [];
  if (existsSync(local)) {
    for (const e of readdirSync(local, { withFileTypes: true })) {
      // The project's design records (`_design`) move too; another `_` or `.` folder stays.
      if (!e.isDirectory() || e.name.startsWith('.') || (e.name.startsWith('_') && e.name !== '_design')) continue;
      const from = join(local, e.name);
      const to = join(target, e.name);
      if (existsSync(to)) continue;
      cpSync(from, to, { recursive: true, filter: (src) => !src.replace(/\\/g, '/').split('/').includes(DRAFT_DIR) });
      // The drafts stay where the agents write them; everything else moved.
      for (const f of readdirSync(from)) if (f !== DRAFT_DIR) rmSync(join(from, f), { recursive: true, force: true });
      moved.push(e.name);
    }
  }
  mkdirSync(local, { recursive: true });
  config.records = { ...(config.records ?? {}), project };
  mkdirSync(join(root, '.ai'), { recursive: true });
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
  // The global registry (INDEX.md) moves too: the scripts read it in the records home.
  adoptLocal(root, null);
  for (const slug of moved) {
    if (slug === '_design') {
      const c = commitPaths(home, { ref: `refs/heads/${mainBranch(home)}`, paths: [`${project}/_design`], message: `${project}: move the design records into the records repo` });
      if (c) gitIn(home, ['read-tree', c]);
    } else commitWorkflow(root, slug, `${project}/${slug}: move the records into the records repo`);
  }
  writeMachineFacts(root);
  return { ok: true, home, project, moved };
}

// ---------------------------------------------------------------- adopt local files

const sameBytes = (a, b) => {
  const x = readFileSync(a);
  const y = readFileSync(b);
  return x.length === y.length && x.equals(y);
};

/**
 * Move the files that a writer put in the local folder of a linked workflow into the records
 * home: an agent that writes by the local path, a test runner, a shell redirect. The drafts
 * stay. A file of the same bytes is only deleted. When both places hold the file with other
 * bytes, the newer one wins, and an older local file stays where it is and is reported.
 * `slug` null adopts the top-level files of the local workflows folder (INDEX.md).
 * Returns `{ moved, conflicts }`, or null when the project is not linked.
 */
export function adoptLocal(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const out = { moved: [], conflicts: [] };
  const localRoot = localWorkflowsRoot(root);
  const from = slug ? join(localRoot, slug) : localRoot;
  const to = slug ? join(recordsHome(), project, slug) : join(recordsHome(), project);
  if (!existsSync(from)) return out;
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
      if (existsSync(dst)) {
        if (sameBytes(src, dst)) { rmSync(src, { force: true }); continue; }
        if (statSync(src).mtimeMs <= statSync(dst).mtimeMs) { out.conflicts.push(r); continue; }
      }
      mkdirSync(join(dst, '..'), { recursive: true });
      try { renameSync(src, dst); } catch { cpSync(src, dst); rmSync(src, { force: true }); }
      out.moved.push(r);
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

/** Commit one workflow's folder to its live branch. Returns `{ commit, project }`, or null when unlinked. */
export function commitWorkflow(root, slug, message) {
  const project = linkedProject(root);
  if (!project) return null;
  adoptLocal(root, slug);
  const home = recordsHome();
  const commit = commitPaths(home, { ref: liveRef(project, slug), base: `refs/heads/${mainBranch(home)}`, paths: [`${project}/${slug}`], message });
  return { commit, project, home };
}

/**
 * Push a ref. A rejected push fetches the remote tip, merges the two trees, writes the merged
 * folder and pushes again. Returns `{ pushed, offline, conflict }`.
 */
export function pushRef(home, ref, { folder = null } = {}) {
  if (!hasRemote(home)) return { pushed: false, offline: true, reason: 'the records clone has no remote' };
  const local = sha(home, ref);
  if (!local) return { pushed: false, reason: `no ref ${ref}` };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const p = gitIn(home, ['push', '-q', 'origin', `${ref}:${ref}`], { net: true });
    if (p.status === 0) return { pushed: true };
    const f = gitIn(home, ['fetch', '-q', 'origin', `+${ref}:refs/wf-remote/${ref.slice(5)}`], { net: true });
    if (f.status !== 0) return { pushed: false, offline: true, reason: (p.stderr || f.stderr).split('\n')[0] };
    const theirs = sha(home, `refs/wf-remote/${ref.slice(5)}`);
    const ours = sha(home, ref);
    if (!theirs || isAncestor(home, theirs, ours)) continue;
    if (isAncestor(home, ours, theirs)) {
      gitIn(home, ['update-ref', ref, theirs, ours]);
      if (folder) writeFolder(home, theirs, folder);
      return { pushed: true, fastForward: true };
    }
    const m = gitIn(home, ['merge-tree', '--write-tree', '--allow-unrelated-histories', ours, theirs]);
    if (m.status !== 0) return { pushed: false, conflict: true, reason: m.stdout.split('\n').slice(1).join('; ') || 'the trees conflict' };
    const tree = m.stdout.split('\n')[0];
    const c = gitIn(home, ['commit-tree', tree, '-p', ours, '-p', theirs, '-m', `merge ${ref.slice(11)} from another machine`]);
    if (c.status !== 0) return { pushed: false, reason: c.stderr };
    gitIn(home, ['update-ref', ref, c.stdout, ours]);
    if (folder) writeFolder(home, c.stdout, folder);
  }
  return { pushed: false, reason: 'the push was rejected three times' };
}

/** Push the live branch of one workflow. */
export function pushWorkflow(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const r = pushRef(home, liveRef(project, slug), { folder: `${project}/${slug}` });
  const state = readState();
  const key = `${project}/${slug}`;
  if (r.conflict) state.conflicts[key] = { at: nowIso(), reason: r.reason };
  else if (r.pushed) delete state.conflicts[key];
  writeState(state);
  return r;
}

// ---------------------------------------------------------------- close

/**
 * Squash a closed workflow onto the main branch: one commit that puts its folder there, then
 * the live branch is deleted. Offline, the close waits in the local state for the next sync.
 */
export function squashWorkflow(root, slug) {
  const project = linkedProject(root);
  if (!project) return null;
  const home = recordsHome();
  const key = `${project}/${slug}`;
  commitWorkflow(root, slug, `${key}: close`);
  const main = mainBranch(home);
  // A remote with no main branch yet is online too.
  const heads = hasRemote(home) ? gitIn(home, ['ls-remote', '--heads', 'origin', main], { net: true }) : { status: 1 };
  const online = heads.status === 0
    && (!heads.stdout || gitIn(home, ['fetch', '-q', 'origin', `+refs/heads/${main}:refs/remotes/origin/${main}`], { net: true }).status === 0);
  const remoteMain = online ? sha(home, `refs/remotes/origin/${main}`) : null;
  const localMain = sha(home, `refs/heads/${main}`);
  // The squash goes on the newest main this machine knows.
  const base = remoteMain && (!localMain || isAncestor(home, localMain, remoteMain)) ? remoteMain : localMain;
  if (base && base !== localMain) gitIn(home, ['update-ref', `refs/heads/${main}`, base]);
  const live = sha(home, liveRef(project, slug));
  if (live) writeFolder(home, live, key);
  const commit = commitPaths(home, { ref: `refs/heads/${main}`, paths: [key], message: `${key}: the records of the closed workflow` });
  if (!commit) return { ok: false, reason: 'the squash commit failed' };
  // HEAD names the main branch: the index follows the new tip, the working tree keeps its files.
  gitIn(home, ['read-tree', commit]);
  const state = readState();
  const pushed = online ? pushRef(home, `refs/heads/${main}`) : { pushed: false, offline: true };
  if (pushed.pushed) {
    gitIn(home, ['push', '-q', 'origin', `:${liveRef(project, slug)}`], { net: true });
    gitIn(home, ['update-ref', '-d', liveRef(project, slug)]);
    state.pendingClose = state.pendingClose.filter((k) => k !== key);
  } else if (!state.pendingClose.includes(key)) state.pendingClose.push(key);
  writeState(state);
  return { ok: true, commit, pushed: Boolean(pushed.pushed), pending: !pushed.pushed, ...(pushed.reason ? { reason: pushed.reason } : {}) };
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
 * Pull the work of other machines. The main branch and every live branch of the project that
 * this machine does not hold move to the remote tip, and their folders are written. A live
 * branch that this machine holds is pushed instead. Returns what moved.
 */
export function syncRecords(root, { holds = () => false } = {}) {
  const project = linkedProject(root);
  if (!project) return null;
  // The files that writers put in the local folder go home first, so the push carries them.
  adoptLocal(root, null);
  for (const slug of localStrays(root)) commitWorkflow(root, slug, `${slug}: adopt the local files`);
  const home = recordsHome();
  const out = { project, pulled: [], pushed: [], conflicts: [], offline: false };
  if (!hasRemote(home)) { out.offline = true; return out; }
  const f = gitIn(home, ['fetch', '-q', '--prune', 'origin', '+refs/heads/*:refs/remotes/origin/*', '+refs/leases/*:refs/leases/*'], { net: true });
  if (f.status !== 0) { out.offline = true; return out; }
  const main = mainBranch(home);
  const state = readState();
  // A close that waited for the network goes out first.
  for (const key of [...state.pendingClose]) {
    if (key.startsWith(`${project}/`)) squashWorkflow(root, key.slice(project.length + 1));
  }
  const remoteMain = sha(home, `refs/remotes/origin/${main}`);
  const localMain = sha(home, `refs/heads/${main}`);
  if (remoteMain !== localMain) {
    if (remoteMain && (!localMain || isAncestor(home, localMain, remoteMain))) {
      gitIn(home, ['update-ref', `refs/heads/${main}`, remoteMain]);
    } else {
      // This machine has main commits that the remote lacks: a squash or machine facts.
      const r = pushRef(home, `refs/heads/${main}`);
      if (!r.pushed) out.conflicts.push(`${main}: ${r.reason}`);
    }
    const tip = sha(home, `refs/heads/${main}`);
    if (tip && tip !== localMain) {
      gitIn(home, ['read-tree', tip]);
      // The folders of the closed workflows that came from other machines.
      const ls = gitIn(home, ['ls-tree', '--name-only', tip, '--', `${project}/`]);
      for (const p of ls.stdout.split('\n').filter(Boolean)) {
        const slug = p.slice(project.length + 1);
        if (sha(home, liveRef(project, slug))) continue;
        writeFolder(home, tip, p);
        out.pulled.push(slug);
      }
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
      const r = pushWorkflow(root, slug);
      if (r?.pushed) out.pushed.push(slug); else if (r?.conflict) out.conflicts.push(`${slug}: ${r.reason}`);
      continue;
    }
    if (!ours || isAncestor(home, ours, theirs)) {
      gitIn(home, ['update-ref', liveRef(project, slug), theirs]);
      writeFolder(home, theirs, `${project}/${slug}`);
      out.pulled.push(slug);
    } else {
      const r = pushWorkflow(root, slug);
      if (r?.pushed) out.pulled.push(slug); else out.conflicts.push(`${slug}: ${r?.reason ?? 'the branches diverged'}`);
    }
  }
  // A live branch that only this machine has goes out, unless another machine closed it.
  const tip = sha(home, `refs/heads/${main}`);
  const locals = gitIn(home, ['for-each-ref', '--format=%(refname)', `refs/heads/live/${project}/`]);
  for (const ref of locals.stdout.split('\n').filter(Boolean)) {
    const slug = ref.slice(`refs/heads/live/${project}/`.length);
    if (seen.has(slug)) continue;
    if (tip && gitIn(home, ['cat-file', '-e', `${tip}:${project}/${slug}`]).status === 0 && !state.pendingClose.includes(`${project}/${slug}`)) {
      gitIn(home, ['update-ref', '-d', ref]);
      writeFolder(home, tip, `${project}/${slug}`);
      out.pulled.push(slug);
      continue;
    }
    const r = pushWorkflow(root, slug);
    if (r?.pushed) out.pushed.push(slug);
  }
  writeMachineFacts(root);
  return out;
}

/** What the records clone holds for a project on this machine. */
export function recordsStatus(root) {
  const project = linkedProject(root);
  const home = recordsHome();
  const state = readState();
  if (!project) return { linked: false, home, clone: existsSync(join(home, '.git')) };
  const live = gitIn(home, ['for-each-ref', '--format=%(refname:short) %(objectname:short)', `refs/heads/live/${project}/`]).stdout.split('\n').filter(Boolean);
  return {
    linked: true, home, project, machine: machineName(), main: mainBranch(home), remote: hasRemote(home), live,
    pendingClose: state.pendingClose.filter((k) => k.startsWith(`${project}/`)),
    conflicts: Object.entries(state.conflicts).filter(([k]) => k.startsWith(`${project}/`)).map(([k, v]) => ({ workflow: k, ...v })),
  };
}
