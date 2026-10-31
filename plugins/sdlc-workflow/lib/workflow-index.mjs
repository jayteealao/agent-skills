import { existsSync } from 'node:fs';
import { readdir, realpath, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { EVIDENCE_DIRS, SOURCE_DIRS, WORK_DIR } from './hook-utils.mjs';
import { DRAFT_DIR, INDEX_NAME, OLD_DIR, STATE_FILE, readDoc } from './records.mjs';
import { workflowsRoot } from './records-root.mjs';

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

export const workflowsRootFor = workflowsRoot;

// 00-index.md frontmatter carries `branch: ""` / `base-branch: ""` when
// `branch-strategy: none` (verified in live repos — Aperture), and `pr-number: 0`
// / `pr-url: ""` when there is no PR. Normalise those "unset" sentinels to null
// at this single plumbing point so downstream grouping + liveness never has to
// re-distinguish "" from absent.
function blankToNull(v) {
  if (v == null) return null;
  const s = typeof v === 'string' ? v.trim() : v;
  return s === '' ? null : s;
}
function prNumberOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
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
    // A workflow of the old layout has 00-index.md; one of the record layout has state.yaml.
    .map((entry) => [INDEX_NAME, STATE_FILE].map((f) => join(workflowsRoot, entry.name, f)).find((path) => existsSync(path)))
    .filter(Boolean)
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

async function latestMtimeMs(paths) {
  let latest = null;
  for (const path of paths) {
    const mtime = await mtimeMs(path);
    if (mtime !== null && (latest === null || mtime > latest)) latest = mtime;
  }
  return latest;
}

export function classifyWorkflowIndex({ frontmatter, parseError, indexMtime, latestArtifactMtime }) {
  if (
    parseError ||
    !frontmatter ||
    typeof frontmatter !== 'object' ||
    !String(frontmatter.slug ?? '').trim() ||
    !String(frontmatter.status ?? '').trim()
  ) {
    let invalidReason;
    if (parseError) {
      invalidReason = `parse error: ${parseError}`;
    } else if (!frontmatter || typeof frontmatter !== 'object') {
      invalidReason = 'no frontmatter found';
    } else if (!String(frontmatter.slug ?? '').trim()) {
      invalidReason = 'missing required field: slug';
    } else {
      invalidReason = 'missing required field: status';
    }
    return {
      classification: 'invalid',
      invalidReason,
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
  const doc = readDoc(workflowDir, INDEX_NAME);
  const loaded = { data: doc?.frontmatter ?? null, parseError: doc?.parseError ?? null };
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
    // Branch is a per-slug fact authored in frontmatter (the slug's own branch),
    // distinct from the checkout's volatile HEAD. Surfaced here so the registry
    // can key identity off the repo and carry branch as slug metadata instead.
    branch: blankToNull(loaded.data?.branch),
    branchStrategy: blankToNull(loaded.data?.['branch-strategy']),
    baseBranch: blankToNull(loaded.data?.['base-branch']),
    prNumber: prNumberOrNull(loaded.data?.['pr-number']),
    prUrl: blankToNull(loaded.data?.['pr-url']),
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

// The stale check counts only artifact files. Evidence folders directly under
// the workflow directory (probe-evidence/, verify-evidence/) are free-form and
// written after the index, so they never mark a workflow stale.
// `.jsonl` files (index-history.jsonl,
// cost.jsonl) are ignored by the extension filter below.
// A brainstorm's research/, references/ and work/ get no page, so they never
// mark a workflow stale either.
// A draft waits for `wf.mjs record put`, and .old/ keeps the files that a migration moved.
const STALE_EXEMPT_DIRS = new Set([...EVIDENCE_DIRS, ...SOURCE_DIRS, WORK_DIR, DRAFT_DIR, OLD_DIR]);
// The yolo commentary is appended after every watch event, long after the index
// was written, so it never marks a workflow stale.
const STALE_EXEMPT_FILES = new Set(['commentary.md']);

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
        if (dir === root && STALE_EXEMPT_DIRS.has(entry.name)) continue;
        stack.push(abs);
      } else if (dir === root && STALE_EXEMPT_FILES.has(entry.name)) {
        continue;
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
