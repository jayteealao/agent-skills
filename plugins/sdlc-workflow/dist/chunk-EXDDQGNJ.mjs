import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  safeLoadFrontmatterFile
} from "./chunk-R35WUHOB.mjs";
import {
  isEntry,
  runStandalone
} from "./chunk-BZC7UJKK.mjs";
import {
  EVIDENCE_DIRS,
  SOURCE_DIRS,
  WORK_DIR,
  collectToolInputPaths,
  gitAdd,
  isInsideWorkflowArtifacts,
  loadConfig,
  projectRootFromInput
} from "./chunk-P7Y6FJOM.mjs";

// hooks/post-write-auto-stage.mjs
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";

// lib/workflow-index.mjs
import { existsSync } from "node:fs";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";
var TERMINAL_WORKFLOW_STATUSES = /* @__PURE__ */ new Set([
  "complete",
  "completed",
  "closed",
  "abandoned",
  "cancelled"
]);
function workflowsRootFor(projectRoot) {
  return join(projectRoot, ".ai", "workflows");
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
  if (!existsSync(workflowsRoot)) return [];
  let entries;
  try {
    entries = await readdir(workflowsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(workflowsRoot, entry.name, "00-index.md")).filter((path) => existsSync(path)).sort();
}
async function listWorkflowArtifactFiles(workflowDir) {
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
  const workflowDir = await realpath(join(indexPath, "..")).catch(() => join(indexPath, ".."));
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
var STALE_EXEMPT_DIRS = /* @__PURE__ */ new Set([...EVIDENCE_DIRS, ...SOURCE_DIRS, WORK_DIR]);
var STALE_EXEMPT_FILES = /* @__PURE__ */ new Set(["commentary.md"]);
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
        if (entry.name === "node_modules") continue;
        if (dir === root && STALE_EXEMPT_DIRS.has(entry.name)) continue;
        stack.push(abs);
      } else if (dir === root && STALE_EXEMPT_FILES.has(entry.name)) {
        continue;
      } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yaml") || entry.name.endsWith(".html.fragment"))) {
        out.push(abs);
      }
    }
  }
  return out;
}

// hooks/post-write-auto-stage.mjs
async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.autoStage === false) return;
  if (existsSync2(join2(projectRoot, ".ai", ".no-auto-stage"))) return;
  if (!existsSync2(join2(projectRoot, ".ai", "workflows"))) return;
  const filePaths = collectToolInputPaths(input).filter((p) => !isInsideWorkflowArtifacts(p));
  if (!filePaths.length) return;
  const workflows = await scanWorkflowIndexes({ projectRoot });
  const hasImplementWorkflow = workflows.some((workflow) => {
    const strategy = workflow.frontmatter?.["branch-strategy"];
    return workflow.isActive && workflow.currentStage === "implement" && (strategy === "dedicated" || strategy === "shared");
  });
  if (!hasImplementWorkflow) return;
  for (const filePath of filePaths) await gitAdd(projectRoot, filePath);
}
if (isEntry("post-write-auto-stage")) runStandalone("post-write-auto-stage", run);

export {
  run
};
