// The one resolver of the record paths of a project.
//
// Every script and hook gets the folder of the workflow records, and the folder of one
// workflow, from here. The records live in <project root>/.ai/workflows/<slug>/, until the
// project is linked to the records repo of this machine (`wf.mjs records link`). Then they live
// in <records home>/<project>/<slug>/, and the local .ai/workflows/ folder keeps only the drafts
// of the agents and the machine-local files of a run.
//
// A write into a nested `.ai/` folder is refused: an agent that runs in a subfolder, or in a
// workflow folder, must not start a second record store. An `.ai/` folder is allowed only at
// the project root, at the root of a git checkout (a worktree has its own), or where a record
// store already exists (a sub-project of a monorepo).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';

export const AI_DIR = '.ai';
export const WORKFLOWS_DIR = 'workflows';
/** The records folder, relative to the project root, with forward slashes. */
export const WORKFLOWS_REL = `${AI_DIR}/${WORKFLOWS_DIR}`;

/** The name of a project in the records repo. */
export const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

/** The clone of the records repo on this machine: `records.home` of ~/.sdlc/config.json, else ~/.sdlc/records. */
export function recordsHome() {
  const h = readMachineConfig().records?.home;
  return h && String(h).trim() ? resolve(String(h).trim().replace(/^~(?=$|[\\/])/, homedir())) : join(sdlcHomeDir(), 'records');
}

const linkCache = new Map();

/**
 * The project name when the project is linked: `records.project` in .ai/sdlc-config.json, a
 * records clone, and the project folder in it. Else null, and the records stay local.
 */
export function linkedProject(projectRoot) {
  const file = join(projectRoot, AI_DIR, 'sdlc-config.json');
  let mtime;
  try { mtime = statSync(file).mtimeMs; } catch { return null; }
  const key = resolve(projectRoot);
  let hit = linkCache.get(key);
  if (!hit || hit.mtime !== mtime) {
    let project = null;
    try {
      const p = JSON.parse(readFileSync(file, 'utf8')).records?.project;
      project = typeof p === 'string' && PROJECT_NAME_RE.test(p) ? p : null;
    } catch { project = null; }
    hit = { mtime, project };
    linkCache.set(key, hit);
  }
  if (!hit.project) return null;
  const home = recordsHome();
  return existsSync(join(home, '.git')) && existsSync(join(home, hit.project)) ? hit.project : null;
}

/** The local records folder of a project: the drafts, and every record of an unlinked project. */
export const localWorkflowsRoot = (projectRoot) => join(projectRoot, AI_DIR, WORKFLOWS_DIR);

/** The folder of all workflow records of a project. */
export function workflowsRoot(projectRoot) {
  const project = linkedProject(projectRoot);
  return project ? join(recordsHome(), project) : localWorkflowsRoot(projectRoot);
}

/** The folder of one workflow. */
export const workflowDir = (projectRoot, slug) => join(workflowsRoot(projectRoot), slug);

/** The folder of one workflow, relative to the project root, with forward slashes. */
export const workflowRel = (slug) => `${WORKFLOWS_REL}/${slug}`;

/** True when a directory holds a record store. */
export const ownsRecords = (dir) => existsSync(localWorkflowsRoot(dir));

const slash = (p) => String(p ?? '').replace(/\\/g, '/');
const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/**
 * The entries of a workflow folder that stay on this machine when the project is linked, each
 * with its reason. Every other file of a workflow folder syncs: the records, the step record
 * (`steps.jsonl`, the old `.implement-progress.jsonl`), the test receipts, the handover notes and
 * the driver journal (`.driver-journal.jsonl`), which goes into the clone with the next commit.
 */
export const LOCAL_ONLY_ENTRIES = Object.freeze({
  '.draft': 'the drafts of the agents of this session',
  'answers.jsonl': 'the answer events that the question hook of this machine wrote',
  '.control.json': 'the stop request of a run on this machine',
  '.watch-state.json': 'the read offsets of the watch on this machine',
  '.driver-outcome.json': 'the outcome of the last driver run on this machine',
  '.api-log.jsonl': 'the operations of the wf scripts that ran on this machine',
  '.ai': 'the render output of an old writer that took the records folder as a project root',
});

/**
 * True for a path, relative to the local workflows folder, that stays on this machine when the
 * project is linked: an entry of LOCAL_ONLY_ENTRIES at any depth of a workflow folder, a
 * top-level dot entry (`.conflicts/` among them), the answer log, and a top-level `_` entry
 * other than the design records (`_design`).
 */
export function isLocalOnly(rel) {
  const parts = slash(rel).split('/').filter(Boolean);
  if (!parts.length || parts[0].startsWith('.') || parts[0] === 'answers.jsonl') return true;
  if (parts[0].startsWith('_') && parts[0] !== '_design') return true;
  return parts.slice(1).some((p) => Object.hasOwn(LOCAL_ONLY_ENTRIES, p));
}

/** The path of `filePath` relative to the local workflows folder of the project, or null. */
export function localRelOf(projectRoot, filePath) {
  const local = slash(localWorkflowsRoot(resolve(projectRoot))).replace(/\/+$/, '');
  const n = slash(resolve(projectRoot, String(filePath)));
  return fold(n).startsWith(`${fold(local)}/`) ? n.slice(local.length + 1) : null;
}

/**
 * The real place of a file. In a linked project, a path in the local workflows folder names a
 * file of the records home, except a local-only path. Every other path is its own place.
 */
export function recordPathOf(projectRoot, filePath) {
  const rel = localRelOf(projectRoot, filePath);
  if (rel === null || isLocalOnly(rel)) return filePath;
  const project = linkedProject(resolve(projectRoot));
  return project ? join(recordsHome(), project, rel) : filePath;
}

/** recordPathOf for an absolute path: the project root is the folder above its `.ai/workflows/`. */
export function realPathOf(filePath) {
  const n = slash(resolve(String(filePath)));
  const at = fold(n).lastIndexOf(`/${WORKFLOWS_REL}/`);
  return at < 0 ? filePath : recordPathOf(n.slice(0, at), n);
}

/** The path of `filePath` inside the records home, with forward slashes, or null. */
export function recordsRel(filePath) {
  const home = slash(recordsHome()).replace(/\/+$/, '');
  const n = slash(filePath);
  return fold(n).startsWith(`${fold(home)}/`) ? n.slice(home.length + 1) : null;
}

/**
 * `<...>/.ai/workflows/<slug>/<rest>`, or `<records home>/<project>/<slug>/<rest>`, →
 * { root, slug, storageRel, filename }, or null; a path in the records home also has `project`.
 */
export function parseWorkflowPath(filePath) {
  const n = slash(filePath);
  const m = /^(.*?)(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/.exec(n);
  if (m) {
    return {
      root: m[1] ? `${m[1]}/${WORKFLOWS_REL}` : WORKFLOWS_REL,
      slug: m[2],
      storageRel: m[3],
      filename: m[3].split('/').at(-1),
    };
  }
  const rel = recordsRel(n);
  const h = rel ? /^([^/.][^/]*)\/([^/.][^/]*)\/(.+)$/.exec(rel) : null;
  if (!h) return null;
  return { root: n.slice(0, n.length - rel.length) + h[1], slug: h[2], storageRel: h[3], filename: h[3].split('/').at(-1), project: h[1] };
}

/**
 * The folder of the workflow that holds a record path (a draft too), or null. A draft in the
 * local folder of a linked project names the workflow folder in the records home.
 */
export function workflowDirOf(filePath) {
  const info = parseWorkflowPath(filePath);
  if (!info) return null;
  if (!info.project) {
    const projectRoot = info.root === WORKFLOWS_REL ? process.cwd() : info.root.slice(0, -(WORKFLOWS_REL.length + 1));
    if (linkedProject(projectRoot)) return join(workflowsRoot(projectRoot), info.slug);
  }
  return `${info.root}/${info.slug}`;
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

// The entries of `.ai/` that the plugin writes. Another tool may keep its own `.ai/` folder.
const OWNED = /^(workflows|solutions|simplify|profiles|docs|design|_view|sdlc-config\.json|ship-plan(-audit)?\.md|observability.*\.md)$/;

/**
 * The nested `.ai/` folder that a write to `filePath` would use, or null when the write is
 * allowed. A write is nested when its path has an `.ai` folder inside another `.ai` folder,
 * or when it writes a plugin entry of an `.ai` folder outside an allowed place.
 */
export function nestedAiDir(filePath, projectRoot) {
  if (!filePath) return null;
  const abs = resolve(projectRoot ?? process.cwd(), filePath);
  const parts = abs.replace(/\\/g, '/').split('/');
  const ats = parts.flatMap((p, i) => (p === AI_DIR ? [i] : []));
  if (!ats.length) return null;
  if (ats.length > 1) return join(parts.slice(0, ats[1]).join('/'), AI_DIR);
  const at = ats[0];
  if (at < 1 || !OWNED.test(parts[at + 1] ?? '')) return null;
  const parent = parts.slice(0, at).join('/') || '/';
  if (projectRoot && same(resolve(parent), resolve(projectRoot))) return null;
  if (existsSync(join(parent, '.git'))) return null;
  if (ownsRecords(parent)) return null;
  return join(parent, AI_DIR);
}
