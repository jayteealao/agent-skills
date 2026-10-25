// The one resolver of the record paths of a project.
//
// Every script and hook gets the folder of the workflow records, and the folder of one
// workflow, from here. The records live in <project root>/.ai/workflows/<slug>/.
//
// A write into a nested `.ai/` folder is refused: an agent that runs in a subfolder, or in a
// workflow folder, must not start a second record store. An `.ai/` folder is allowed only at
// the project root, at the root of a git checkout (a worktree has its own), or where a record
// store already exists (a sub-project of a monorepo).
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const AI_DIR = '.ai';
export const WORKFLOWS_DIR = 'workflows';
/** The records folder, relative to the project root, with forward slashes. */
export const WORKFLOWS_REL = `${AI_DIR}/${WORKFLOWS_DIR}`;

/** The folder of all workflow records of a project. */
export const workflowsRoot = (projectRoot) => join(projectRoot, AI_DIR, WORKFLOWS_DIR);

/** The folder of one workflow. */
export const workflowDir = (projectRoot, slug) => join(workflowsRoot(projectRoot), slug);

/** The folder of one workflow, relative to the project root, with forward slashes. */
export const workflowRel = (slug) => `${WORKFLOWS_REL}/${slug}`;

/** True when a directory holds a record store. */
export const ownsRecords = (dir) => existsSync(workflowsRoot(dir));

/** `<...>/.ai/workflows/<slug>/<rest>` → { root, slug, storageRel, filename }, or null. */
export function parseWorkflowPath(filePath) {
  const n = String(filePath ?? '').replace(/\\/g, '/');
  const m = /^(.*?)(?:^|\/)\.ai\/workflows\/([^/]+)\/(.+)$/.exec(n);
  if (!m) return null;
  return {
    root: m[1] ? `${m[1]}/${WORKFLOWS_REL}` : WORKFLOWS_REL,
    slug: m[2],
    storageRel: m[3],
    filename: m[3].split('/').at(-1),
  };
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
