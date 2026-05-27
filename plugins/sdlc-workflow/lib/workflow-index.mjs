import { existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { safeLoadFrontmatterFile } from './frontmatter.mjs';
import { latestMtimeMs } from './render-state.mjs';

// Wider than the schema's `status` enum (active/complete/closed) on purpose —
// tolerates legacy or hand-edited 00-index.md files using `completed`,
// `abandoned`, or `cancelled` as terminal markers.
export const TERMINAL_WORKFLOW_STATUSES = new Set([
  'complete',
  'completed',
  'closed',
  'abandoned',
  'cancelled',
]);

export function workflowsRootFor(projectRoot) {
  return join(projectRoot, '.ai', 'workflows');
}

export async function discoverWorkflowIndexFiles({
  projectRoot = process.cwd(),
  workflowsRoot = workflowsRootFor(projectRoot),
} = {}) {
  if (!existsSync(workflowsRoot)) return [];
  let entries;
  try {
    entries = await readdir(workflowsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(workflowsRoot, entry.name, '00-index.md'))
    .filter((path) => existsSync(path))
    .sort();
}

export async function listWorkflowArtifactFiles(workflowDir) {
  if (!existsSync(workflowDir)) return [];
  return (await walkWorkflowFiles(workflowDir)).sort();
}

async function mtimeMs(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

export function classifyWorkflowIndex({ frontmatter, parseError, indexMtime, latestArtifactMtime }) {
  if (
    parseError ||
    !frontmatter ||
    typeof frontmatter !== 'object' ||
    !frontmatter.slug ||
    !frontmatter.status
  ) {
    return {
      classification: 'invalid',
      status: null,
      isActive: false,
      isTerminal: false,
      isStale: false,
    };
  }

  const status = String(frontmatter.status ?? '').trim();
  const isTerminal = TERMINAL_WORKFLOW_STATUSES.has(status);
  const isStale = latestArtifactMtime !== null && indexMtime !== null && latestArtifactMtime > indexMtime;
  const classification = isTerminal ? 'complete' : (isStale ? 'stale' : 'active');

  return {
    classification,
    status,
    isActive: !isTerminal,
    isTerminal,
    isStale,
  };
}

export async function loadWorkflowIndex(indexPath, {
  projectRoot = process.cwd(),
  workflowsRoot = workflowsRootFor(projectRoot),
} = {}) {
  const workflowDir = await realpath(join(indexPath, '..')).catch(() => join(indexPath, '..'));
  const slug = basename(workflowDir);
  const loaded = await safeLoadFrontmatterFile(indexPath);
  const artifactFiles = await listWorkflowArtifactFiles(workflowDir);
  const latestArtifactMtime = await latestMtimeMs(artifactFiles);
  const indexMtime = await mtimeMs(indexPath);
  const classification = classifyWorkflowIndex({
    frontmatter: loaded.data,
    parseError: loaded.parseError,
    indexMtime,
    latestArtifactMtime,
  });

  return {
    slug: loaded.data?.slug ?? slug,
    directorySlug: slug,
    workflowDir,
    indexPath,
    storageRel: relative(workflowsRoot, indexPath).replace(/\\/g, '/'),
    frontmatter: loaded.data,
    parseError: loaded.parseError,
    artifactFiles,
    latestArtifactMtime,
    indexMtime,
    currentStage: loaded.data?.['current-stage'] ?? null,
    title: loaded.data?.title ?? null,
    ...classification,
  };
}

export async function scanWorkflowIndexes(opts = {}) {
  const indexFiles = await discoverWorkflowIndexFiles(opts);
  const workflows = [];
  for (const indexPath of indexFiles) {
    workflows.push(await loadWorkflowIndex(indexPath, opts));
  }
  return workflows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}

export function activeWorkflowIndexes(workflows) {
  return workflows.filter((workflow) => workflow.isActive && workflow.classification !== 'invalid');
}

async function walkWorkflowFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        stack.push(abs);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.md') || entry.name.endsWith('.yaml') || entry.name.endsWith('.html.fragment'))
      ) {
        out.push(abs);
      }
    }
  }
  return out;
}
