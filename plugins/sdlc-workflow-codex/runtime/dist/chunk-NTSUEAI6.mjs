import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  safeLoadFrontmatterFile
} from "./chunk-5U76735W.mjs";

// lib/render-state.mjs
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
async function pathMtimeMs(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
async function latestMtimeMs(paths) {
  let latest = null;
  for (const path of paths) {
    const mtime = await pathMtimeMs(path);
    if (mtime !== null && (latest === null || mtime > latest)) latest = mtime;
  }
  return latest;
}
async function latestTreeMtimeMs(root, {
  ignore = ["node_modules"]
} = {}) {
  if (!root || !existsSync(root)) return null;
  const files = await walkFiles(root, { ignoreDirs: new Set(ignore.map((item) => item.replace(/\*\*\//g, "").replace(/\/\*\*$/g, ""))) });
  return latestMtimeMs(files);
}
async function viewMtimeForSlug(viewRoot, slug) {
  return latestTreeMtimeMs(join(viewRoot, slug));
}
function classifyRenderState({
  latestArtifactMtime,
  viewMtime,
  renderMissing = true,
  renderStale = true
} = {}) {
  if (viewMtime === null || viewMtime === void 0) {
    return {
      action: renderMissing ? "render" : "skip",
      reason: "missing",
      stale: Boolean(renderMissing)
    };
  }
  if (latestArtifactMtime !== null && latestArtifactMtime !== void 0 && latestArtifactMtime >= viewMtime) {
    return {
      action: renderStale ? "render" : "skip",
      reason: "stale",
      stale: Boolean(renderStale)
    };
  }
  return {
    action: "skip",
    reason: "fresh",
    stale: false
  };
}
async function walkFiles(root, { ignoreDirs = /* @__PURE__ */ new Set() } = {}) {
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
        if (ignoreDirs.has(entry.name)) continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}

// lib/workflow-index.mjs
import { existsSync as existsSync2 } from "node:fs";
import { readdir as readdir2, realpath, stat as stat2 } from "node:fs/promises";
import { basename, join as join2, relative } from "node:path";
var TERMINAL_WORKFLOW_STATUSES = /* @__PURE__ */ new Set([
  "complete",
  "completed",
  "closed",
  "abandoned",
  "cancelled"
]);
function workflowsRootFor(projectRoot) {
  return join2(projectRoot, ".ai", "workflows");
}
function blankToNull(v) {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" ? null : s;
}
function prNumberOrNull(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}
async function discoverWorkflowIndexFiles({
  projectRoot = process.cwd(),
  workflowsRoot = workflowsRootFor(projectRoot)
} = {}) {
  if (!existsSync2(workflowsRoot)) return [];
  let entries;
  try {
    entries = await readdir2(workflowsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join2(workflowsRoot, entry.name, "00-index.md")).filter((path) => existsSync2(path)).sort();
}
async function listWorkflowArtifactFiles(workflowDir) {
  if (!existsSync2(workflowDir)) return [];
  return (await walkWorkflowFiles(workflowDir)).sort();
}
async function mtimeMs(path) {
  try {
    return (await stat2(path)).mtimeMs;
  } catch {
    return null;
  }
}
function classifyWorkflowIndex({ frontmatter, parseError, indexMtime, latestArtifactMtime }) {
  if (parseError || !frontmatter || typeof frontmatter !== "object" || !String(frontmatter.slug ?? "").trim() || !String(frontmatter.status ?? "").trim()) {
    let invalidReason;
    if (parseError) {
      invalidReason = `parse error: ${parseError}`;
    } else if (!frontmatter || typeof frontmatter !== "object") {
      invalidReason = "no frontmatter found";
    } else if (!String(frontmatter.slug ?? "").trim()) {
      invalidReason = "missing required field: slug";
    } else {
      invalidReason = "missing required field: status";
    }
    return {
      classification: "invalid",
      invalidReason,
      status: null,
      isActive: false,
      isTerminal: false,
      isStale: false
    };
  }
  const status = String(frontmatter.status ?? "").trim();
  const isTerminal = TERMINAL_WORKFLOW_STATUSES.has(status);
  const isStale = latestArtifactMtime !== null && indexMtime !== null && latestArtifactMtime > indexMtime;
  const classification = isTerminal ? "complete" : isStale ? "stale" : "active";
  return {
    classification,
    status,
    isActive: !isTerminal,
    isTerminal,
    isStale
  };
}
async function loadWorkflowIndex(indexPath, {
  projectRoot = process.cwd(),
  workflowsRoot = workflowsRootFor(projectRoot)
} = {}) {
  const workflowDir = await realpath(join2(indexPath, "..")).catch(() => join2(indexPath, ".."));
  const slug = basename(workflowDir);
  const loaded = await safeLoadFrontmatterFile(indexPath);
  const artifactFiles = await listWorkflowArtifactFiles(workflowDir);
  const latestArtifactMtime = await latestMtimeMs(artifactFiles);
  const indexMtime = await mtimeMs(indexPath);
  const classification = classifyWorkflowIndex({
    frontmatter: loaded.data,
    parseError: loaded.parseError,
    indexMtime,
    latestArtifactMtime
  });
  return {
    slug: loaded.data?.slug ?? slug,
    directorySlug: slug,
    workflowDir,
    indexPath,
    storageRel: relative(workflowsRoot, indexPath).replace(/\\/g, "/"),
    frontmatter: loaded.data,
    parseError: loaded.parseError,
    artifactFiles,
    latestArtifactMtime,
    indexMtime,
    currentStage: loaded.data?.["current-stage"] ?? null,
    title: loaded.data?.title ?? null,
    // Branch is a per-slug fact authored in frontmatter (the slug's own branch),
    // distinct from the checkout's volatile HEAD. Surfaced here so the registry
    // can key identity off the repo and carry branch as slug metadata instead.
    // See SLUG-BRANCH-IDENTITY-PLAN §4.1.
    branch: blankToNull(loaded.data?.branch),
    branchStrategy: blankToNull(loaded.data?.["branch-strategy"]),
    baseBranch: blankToNull(loaded.data?.["base-branch"]),
    prNumber: prNumberOrNull(loaded.data?.["pr-number"]),
    prUrl: blankToNull(loaded.data?.["pr-url"]),
    ...classification
  };
}
async function scanWorkflowIndexes(opts = {}) {
  const indexFiles = await discoverWorkflowIndexFiles(opts);
  const workflows = [];
  for (const indexPath of indexFiles) {
    workflows.push(await loadWorkflowIndex(indexPath, opts));
  }
  return workflows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));
}
function activeWorkflowIndexes(workflows) {
  return workflows.filter((workflow) => workflow.isActive && workflow.classification !== "invalid");
}
async function walkWorkflowFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir2(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join2(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        stack.push(abs);
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".html.fragment"))) {
        out.push(abs);
      }
    }
  }
  return out;
}

export {
  latestMtimeMs,
  latestTreeMtimeMs,
  viewMtimeForSlug,
  classifyRenderState,
  scanWorkflowIndexes,
  activeWorkflowIndexes
};
