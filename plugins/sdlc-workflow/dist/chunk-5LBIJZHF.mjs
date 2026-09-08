import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";

// lib/pid-file.mjs
import { readFileSync, rmSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}
async function readPidFile(pidPath) {
  try {
    const text = (await readFile(pidPath, "utf-8")).trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return { pid: Number(text) };
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    return null;
  }
}
async function writePidFile(pidPath, record) {
  await mkdir(dirname(pidPath), { recursive: true });
  const payload = {
    ...record,
    pid: Number(record.pid),
    writtenAt: record.writtenAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  const tmpPath = `${pidPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}
`, "utf-8");
  await rename(tmpPath, pidPath);
  return payload;
}
async function removePidFile(pidPath) {
  await rm(pidPath, { force: true });
}
async function removeOwnPidFile(pidPath, pid = process.pid) {
  const record = await readPidFile(pidPath);
  if (record && record.pid !== pid) return false;
  await rm(pidPath, { force: true });
  return true;
}
function removeOwnPidFileSync(pidPath, pid = process.pid) {
  let record = null;
  try {
    const text = readFileSync(pidPath, "utf-8").trim();
    record = /^\d+$/.test(text) ? { pid: Number(text) } : text ? JSON.parse(text) : null;
  } catch {
    record = null;
  }
  if (record && typeof record === "object" && record.pid !== pid) return false;
  try {
    rmSync(pidPath, { force: true });
  } catch {
  }
  return true;
}
async function pidFileStatus(pidPath) {
  const record = await readPidFile(pidPath);
  const alive = record?.pid ? isPidAlive(record.pid) : false;
  return { record, alive, stale: Boolean(record && !alive) };
}

// lib/frontmatter.mjs
import { readFile as readFile2 } from "node:fs/promises";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseFrontmatter(text, { filePath = "<memory>" } = {}) {
  const match = String(text ?? "").replace(/^﻿/, "").match(FRONTMATTER_RE);
  if (!match) {
    return {
      data: {},
      content: String(text ?? ""),
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: null
    };
  }
  try {
    const data = jsYaml.load(match[1]) ?? {};
    return {
      data,
      content: match[2] ?? "",
      raw: match[1] ?? "",
      excerpt: null,
      isEmpty: !String(match[1] ?? "").trim(),
      parseError: null
    };
  } catch (err) {
    err.message = `${filePath}: ${err.message}`;
    throw err;
  }
}
function safeParseFrontmatter(text, opts = {}) {
  try {
    return parseFrontmatter(text, opts);
  } catch (err) {
    return {
      data: null,
      content: text,
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: err.message
    };
  }
}
async function loadFrontmatterFile(filePath) {
  const text = await readFile2(filePath, "utf-8");
  return {
    path: filePath,
    text,
    ...parseFrontmatter(text, { filePath })
  };
}
async function safeLoadFrontmatterFile(filePath) {
  try {
    return await loadFrontmatterFile(filePath);
  } catch (err) {
    return {
      path: filePath,
      text: null,
      data: null,
      content: "",
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: err.message
    };
  }
}

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

// lib/branch-liveness.mjs
import { execFileSync } from "node:child_process";
function gitExit(repoRoot, args) {
  try {
    execFileSync("git", ["-C", repoRoot, ...args], {
      windowsHide: true,
      timeout: 2e3,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}
function gitAvailable(repoRoot) {
  return gitExit(repoRoot, ["rev-parse", "--git-dir"]);
}
function prMerged(repoRoot, prNumber) {
  if (!(Number.isInteger(prNumber) && prNumber > 0)) return false;
  try {
    const state = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "state", "-q", ".state"],
      { cwd: repoRoot, encoding: "utf-8", windowsHide: true, timeout: 3e3, stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return state === "MERGED";
  } catch {
    return false;
  }
}
var PRE_BRANCH_STAGES = /* @__PURE__ */ new Set(["intake", "shape", "slice", "plan", "design", "routing"]);
function computeBranchState({ repoRoot, branch, baseBranch, prNumber, currentStage, checkPr = true } = {}) {
  try {
    const b = String(branch ?? "").trim();
    if (!repoRoot || !b) return "unknown";
    if (!gitAvailable(repoRoot)) return "unknown";
    const refExists = gitExit(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${b}`]);
    if (refExists) {
      const base = String(baseBranch ?? "").trim();
      if (base && base !== b && gitExit(repoRoot, ["merge-base", "--is-ancestor", b, base])) return "merged";
      if (checkPr && prMerged(repoRoot, prNumber)) return "merged";
      return "live";
    }
    return PRE_BRANCH_STAGES.has(String(currentStage ?? "").trim().toLowerCase()) ? "planned" : "gone";
  } catch {
    return "unknown";
  }
}
function refreshEntriesLiveness(entries = [], { checkPr = false } = {}) {
  try {
    for (const e of entries ?? []) {
      if (!e || !Array.isArray(e.slugMeta)) continue;
      for (const sm of e.slugMeta) {
        try {
          sm.branchState = computeBranchState({
            repoRoot: e.repoRoot,
            branch: sm.branch,
            baseBranch: sm.baseBranch,
            prNumber: sm.prNumber,
            currentStage: sm.currentStage,
            checkPr
          });
        } catch {
          sm.branchState = sm.branchState ?? "unknown";
        }
      }
    }
  } catch {
  }
  return entries;
}

// lib/render-queue.mjs
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync as existsSync3,
  mkdirSync,
  readdirSync,
  readFileSync as readFileSync2,
  renameSync,
  rmSync as rmSync2,
  statSync,
  writeFileSync
} from "node:fs";
import { join as join3 } from "node:path";
var QUEUE_VERSION = 1;
var QUEUE_DIRNAME = ".render-queue";
var PROCESSING = ".processing";
var FAILED = ".failed";
var STATUS_FILE = ".status.json";
var ERROR_LOG = ".render-errors.log";
var RENDER_QUEUE_DEFAULTS = Object.freeze({
  maxPending: 500,
  // hard backstop; coalescing bounds the queue by buckets first
  maxAttempts: 3,
  // give up + move to .failed/ after this many render failures
  orphanTtlMs: 12e4
  // reclaim a .processing/ file abandoned by a dead drain
});
function queueDir(viewDir) {
  return join3(viewDir, QUEUE_DIRNAME);
}
function processingDir(viewDir) {
  return join3(queueDir(viewDir), PROCESSING);
}
function failedDir(viewDir) {
  return join3(queueDir(viewDir), FAILED);
}
function statusPath(viewDir) {
  return join3(queueDir(viewDir), STATUS_FILE);
}
function errorLogPath(viewDir) {
  return join3(viewDir, ERROR_LOG);
}
function writeFileAtomic(path, text) {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, text, "utf-8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      rmSync2(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function listRecordFiles(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".json") && n !== STATUS_FILE);
}
function appendError(viewDir, message) {
  try {
    mkdirSync(viewDir, { recursive: true });
    appendFileSync(errorLogPath(viewDir), `[${(/* @__PURE__ */ new Date()).toISOString()}] render-queue: ${message}
`, "utf-8");
  } catch {
  }
}
function enqueue(viewDir, item = {}, {
  now = () => Date.now(),
  maxPending = RENDER_QUEUE_DEFAULTS.maxPending
} = {}) {
  try {
    if (!viewDir) return { ok: false, reason: "no viewDir" };
    const dir = queueDir(viewDir);
    mkdirSync(dir, { recursive: true });
    const existing = listRecordFiles(dir);
    if (existing.length >= maxPending) {
      const overflow = existing.sort().slice(0, existing.length - maxPending + 1);
      for (const name2 of overflow) {
        try {
          rmSync2(join3(dir, name2), { force: true });
        } catch {
        }
      }
      appendError(viewDir, `queue at cap (${existing.length} \u2265 ${maxPending}); evicted ${overflow.length} oldest request(s)`);
    }
    const ts = now();
    const record = {
      v: QUEUE_VERSION,
      repoRoot: item.repoRoot ?? null,
      viewDir,
      kind: item.kind ?? "incremental",
      // incremental | offpipeline | bootstrap
      bucket: item.bucket ?? null,
      // slug | project | docs | off-pipeline bucket | __bootstrap__
      paths: Array.isArray(item.paths) ? item.paths : [],
      attempts: 0,
      enqueuedAt: new Date(ts).toISOString(),
      enqueuedBy: {
        host: item.enqueuedBy?.host ?? "claude",
        pid: item.enqueuedBy?.pid ?? process.pid
      }
    };
    const name = `${String(ts).padStart(15, "0")}-${randomBytes(4).toString("hex")}.json`;
    writeFileAtomic(join3(dir, name), `${JSON.stringify(record, null, 2)}
`);
    return { ok: true, file: name };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}
function readPending(viewDir) {
  const dir = queueDir(viewDir);
  const out = [];
  for (const name of listRecordFiles(dir)) {
    const abs = join3(dir, name);
    try {
      out.push({ name, file: abs, record: JSON.parse(readFileSync2(abs, "utf-8")) });
    } catch {
    }
  }
  out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return out;
}
function coalesce(records) {
  if (!records || !records.length) return null;
  if (records.some((r) => r?.kind === "bootstrap")) {
    return { kind: "bootstrap", bucket: "__bootstrap__" };
  }
  const buckets = [...new Set(records.map((r) => r?.bucket).filter(Boolean))];
  if (buckets.length === 1) {
    const r = records.find((rr) => rr?.bucket === buckets[0]);
    return { kind: r?.kind ?? "incremental", bucket: buckets[0] };
  }
  return { kind: "bootstrap", bucket: "__bootstrap__" };
}
function renderArgsForPlan(plan, { viewDir, pluginRoot } = {}) {
  const tail = ["--view", viewDir];
  if (pluginRoot) tail.push("--plugin-root", pluginRoot);
  if (!plan || plan.kind === "bootstrap") return ["--bootstrap", ...tail];
  return ["--only", `${plan.bucket}/**`, ...tail];
}
function claim(viewDir, names) {
  const dir = queueDir(viewDir);
  const proc = processingDir(viewDir);
  try {
    mkdirSync(proc, { recursive: true });
  } catch {
  }
  const claimed = [];
  for (const name of names) {
    const from = join3(dir, name);
    let record = null;
    try {
      record = JSON.parse(readFileSync2(from, "utf-8"));
    } catch {
    }
    try {
      renameSync(from, join3(proc, name));
      claimed.push({ name, file: join3(proc, name), record });
    } catch {
    }
  }
  return claimed;
}
function ack(viewDir, claimed) {
  for (const c of claimed ?? []) {
    try {
      rmSync2(c.file, { force: true });
    } catch {
    }
  }
}
function unclaim(viewDir, claimed) {
  const dir = queueDir(viewDir);
  for (const c of claimed ?? []) {
    try {
      renameSync(c.file, join3(dir, c.name));
    } catch {
    }
  }
}
function fail(viewDir, claimed, {
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  now = () => Date.now(),
  error = "render failed"
} = {}) {
  const dir = queueDir(viewDir);
  const failedD = failedDir(viewDir);
  for (const c of claimed ?? []) {
    const attempts = (c.record?.attempts ?? 0) + 1;
    const rec = { ...c.record ?? {}, attempts, lastError: String(error), lastFailedAt: new Date(now()).toISOString() };
    const text = `${JSON.stringify(rec, null, 2)}
`;
    const dest = attempts >= maxAttempts ? failedD : dir;
    if (dest === failedD) {
      try {
        mkdirSync(failedD, { recursive: true });
      } catch {
      }
    }
    try {
      writeFileAtomic(join3(dest, c.name), text);
    } catch {
    }
    try {
      rmSync2(c.file, { force: true });
    } catch {
    }
  }
  appendError(viewDir, error);
}
function reclaimOrphans(viewDir, {
  ttlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs,
  now = () => Date.now()
} = {}) {
  const proc = processingDir(viewDir);
  const dir = queueDir(viewDir);
  let names;
  try {
    names = readdirSync(proc).filter((n) => n.endsWith(".json"));
  } catch {
    return 0;
  }
  let reclaimed = 0;
  for (const name of names) {
    const from = join3(proc, name);
    let mtime;
    try {
      mtime = statSync(from).mtimeMs;
    } catch {
      continue;
    }
    if (now() - mtime < ttlMs) continue;
    try {
      renameSync(from, join3(dir, name));
      reclaimed++;
    } catch {
    }
  }
  return reclaimed;
}
function writeStatus(viewDir, status = {}, { now = () => Date.now() } = {}) {
  try {
    mkdirSync(queueDir(viewDir), { recursive: true });
    writeFileAtomic(statusPath(viewDir), `${JSON.stringify({ ...status, updatedAt: new Date(now()).toISOString() }, null, 2)}
`);
  } catch {
  }
}
function countPending(viewDir) {
  return listRecordFiles(queueDir(viewDir)).length;
}
function listFailed(viewDir) {
  try {
    return readdirSync(failedDir(viewDir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
}
function createRenderQueueDrainer({
  submit,
  isBusy,
  pluginRoot,
  log = () => {
  },
  now = () => Date.now(),
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  orphanTtlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs
} = {}) {
  function drainEntry(entry) {
    try {
      if (!entry || !entry.id || !entry.viewDir) return { action: "invalid" };
      const { id, viewDir } = entry;
      if (isBusy(id)) return { action: "busy" };
      const pending = readPending(viewDir);
      if (!pending.length) return { action: "empty" };
      const plan = coalesce(pending.map((p) => p.record));
      const claimed = claim(viewDir, pending.map((p) => p.name));
      if (!claimed.length) return { action: "nothing-claimed" };
      const args = renderArgsForPlan(plan, { viewDir, pluginRoot });
      const r = submit(entry, {
        args,
        label: `render-queue: ${id} ${plan.kind} ${plan.bucket} (${claimed.length} req)`,
        onSettled: (code) => {
          try {
            if (code === 0) {
              ack(viewDir, claimed);
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: null }, { now });
            } else {
              fail(viewDir, claimed, { maxAttempts, now, error: `render exited ${code}` });
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: `render exited ${code}` }, { now });
            }
          } catch (err) {
            log(`render-queue: settle error for ${id}: ${err?.message ?? err}`);
          }
        }
      });
      if (r?.action !== "enqueued") {
        unclaim(viewDir, claimed);
        return { action: r?.action ?? "rejected" };
      }
      return { action: "submitted", plan, claimed: claimed.length };
    } catch (err) {
      log(`render-queue: drain error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function catchUp(entries) {
    for (const e of entries ?? []) {
      try {
        reclaimOrphans(e.viewDir, { ttlMs: orphanTtlMs, now });
      } catch {
      }
    }
    return (entries ?? []).map((e) => drainEntry(e));
  }
  function snapshot(entries) {
    const pending = {};
    const failed = [];
    for (const e of entries ?? []) {
      const n = countPending(e.viewDir);
      if (n > 0) pending[e.id] = n;
      for (const name of listFailed(e.viewDir)) failed.push({ id: e.id, file: name });
    }
    return { pending, failed, lastDrainAt: new Date(now()).toISOString() };
  }
  return { drainEntry, catchUp, snapshot };
}

// lib/registry.mjs
import { createHash } from "node:crypto";
import { execFileSync as execFileSync2 } from "node:child_process";

// lib/runtime-log.mjs
import { appendFileSync as appendFileSync2, existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync3, renameSync as renameSync2, rmSync as rmSync3, statSync as statSync2 } from "node:fs";
import { dirname as dirname2, join as join4 } from "node:path";
var MAX_LOG_BYTES = 1024 * 1024;
var KEEP_GENERATIONS = 2;
var hubLogPath = (home = sdlcHomeDir()) => join4(home, "hub.log");
var lifecycleLogPath = (home = sdlcHomeDir()) => join4(home, "lifecycle.log");
var errorsLogPath = (home = sdlcHomeDir()) => join4(home, "errors.log");
var hubHistoryPath = (home = sdlcHomeDir()) => join4(home, "hub-history.jsonl");
function rotateIfLarge(path, { maxBytes = MAX_LOG_BYTES, keep = KEEP_GENERATIONS } = {}) {
  let size;
  try {
    size = statSync2(path).size;
  } catch {
    return false;
  }
  if (size <= maxBytes) return false;
  try {
    rmSync3(`${path}.${keep}`, { force: true });
  } catch {
  }
  for (let i = keep - 1; i >= 1; i--) {
    try {
      if (existsSync4(`${path}.${i}`)) renameSync2(`${path}.${i}`, `${path}.${i + 1}`);
    } catch {
    }
  }
  try {
    renameSync2(path, `${path}.1`);
  } catch {
    return false;
  }
  return true;
}
function appendLogLine(path, line, opts = {}) {
  try {
    mkdirSync2(dirname2(path), { recursive: true });
    rotateIfLarge(path, opts);
    appendFileSync2(path, line.endsWith("\n") ? line : `${line}
`, "utf-8");
    return true;
  } catch (e) {
    try {
      process.stderr.write(`[runtime-log] could not write ${path}: ${e?.message ?? e}
`);
    } catch {
    }
    return false;
  }
}
function parseJsonLines(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
    }
  }
  return out;
}
function readJsonLines(path) {
  try {
    return parseJsonLines(readFileSync3(path, "utf-8"));
  } catch {
    return [];
  }
}
function hubLogLine(line, { home, now = () => /* @__PURE__ */ new Date() } = {}) {
  const written = `${now().toISOString()} ${line}`;
  appendLogLine(hubLogPath(home), written);
  return written;
}
var LIFECYCLE_EVENTS = Object.freeze([
  "adopt",
  "reap",
  "recover",
  "start",
  "unconfirmed",
  "refused-host",
  "protocol-incompatible",
  "lock-timeout",
  "port-held",
  "port-migrated",
  "gc",
  "deprecated-config"
]);
function formatLifecycleLine(record, now = /* @__PURE__ */ new Date()) {
  const { event, host = null, version = null, buildId = null, pid = null, reason = null, ...extra } = record ?? {};
  return JSON.stringify({
    at: now.toISOString(),
    event: String(event ?? "unknown"),
    host,
    version,
    buildId,
    pid: Number.isInteger(pid) ? pid : null,
    reason: reason == null ? null : String(reason),
    ...extra
  });
}
function logLifecycle(record, { home, now = /* @__PURE__ */ new Date() } = {}) {
  const line = formatLifecycleLine(record, now);
  appendLogLine(lifecycleLogPath(home), line);
  return line;
}
function recordHubStart({ pid, version = null, buildId = null, startedBy = null, reason = "unknown", port = null } = {}, { home, now = /* @__PURE__ */ new Date() } = {}) {
  const record = { at: now.toISOString(), event: "start", pid: Number.isInteger(pid) ? pid : null, version, buildId, startedBy, reason: String(reason), port };
  appendLogLine(hubHistoryPath(home), JSON.stringify(record));
  return record;
}
function readHubHistory(home) {
  const records = readJsonLines(hubHistoryPath(home)).filter((r) => r && r.event === "start");
  const last = records.at(-1) ?? null;
  return {
    starts: records.length,
    restarts: Math.max(0, records.length - 1),
    lastReason: last?.reason ?? null,
    lastAt: last?.at ?? null,
    lastPid: last?.pid ?? null
  };
}

// lib/registry.mjs
import {
  existsSync as existsSync5,
  mkdirSync as mkdirSync3,
  readFileSync as readFileSync4,
  readdirSync as readdirSync2,
  writeFileSync as writeFileSync2,
  renameSync as renameSync3,
  rmSync as rmSync4,
  realpathSync,
  statSync as statSync3
} from "node:fs";
import { request } from "node:http";
import { homedir, tmpdir } from "node:os";
import { basename as basename2, dirname as dirname3, join as join5, sep } from "node:path";
var REGISTRY_VERSION = 2;
var SHARD_SOFT_CAP = 100;
var REGISTRY_FRESH_GRACE_MS = 10 * 60 * 1e3;
function sdlcHomeDir() {
  const override = process.env.SDLC_HOME;
  return override && override.trim() ? override : join5(homedir(), ".sdlc");
}
function registryPath() {
  return join5(sdlcHomeDir(), "registry.json");
}
function shardDir() {
  return join5(sdlcHomeDir(), "registry.d");
}
function pruneLogPath() {
  return join5(sdlcHomeDir(), "registry.prune.log");
}
function hubPidPath() {
  return join5(sdlcHomeDir(), "hub.pid");
}
function git(cwd, args) {
  try {
    return execFileSync2("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function gitIdentity(cwd) {
  const topLevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  if (!topLevel) return null;
  let repoRoot;
  try {
    repoRoot = realpathSync.native(topLevel);
  } catch {
    repoRoot = topLevel.replace(/\//g, sep);
  }
  let headBranch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!headBranch || headBranch === "HEAD") headBranch = basename2(repoRoot);
  const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
  const commonDirRaw = git(cwd, ["rev-parse", "--git-common-dir"]);
  let isWorktree = false;
  if (gitDir && commonDirRaw) {
    const commonAbs = commonDirRaw.match(/^([a-zA-Z]:[\\/]|\/)/) ? commonDirRaw : join5(repoRoot, commonDirRaw);
    isWorktree = canon(gitDir) !== canon(commonAbs);
  }
  return {
    repoRoot,
    headBranch,
    // A linked worktree has its OWN repoRoot, so repo-scoped ids keep worktrees
    // distinct for free; the label is kept for display.
    worktreeLabel: isWorktree ? basename2(repoRoot) : null
  };
}
function canon(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}
function computeEntryId(repoRoot, _ignoredBranch) {
  const fwd = String(repoRoot).replace(/\\/g, "/");
  return createHash("sha256").update(fwd).digest("hex").slice(0, 12);
}
function resolveEntryId(repoRoot, existing) {
  const base = computeEntryId(repoRoot);
  const clash = existing.find((e) => e.id === base && e.repoRoot !== repoRoot);
  if (!clash) return base;
  const suffix = createHash("sha256").update(String(repoRoot)).digest("hex").slice(0, 4);
  return `${base}-${suffix}`;
}
var normPath = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
function ephemeralRootReason(repoRoot, { tmpDir = tmpdir() } = {}) {
  const r = normPath(repoRoot);
  if (!r) return null;
  const temps = /* @__PURE__ */ new Set([normPath(tmpDir)]);
  try {
    temps.add(normPath(realpathSync.native(tmpDir)));
  } catch {
  }
  for (const t of temps) if (t && (r === t || r.startsWith(`${t}/`))) return "temp";
  if (/\/\.claude\/worktrees(\/|$)/.test(r)) return "worktree";
  if (/\/claude\/[^/]+\/[^/]+\/scratchpad(\/|$)/.test(r)) return "scratchpad";
  return null;
}
function validateEntry(entry, { allowEphemeral = process.env.SDLC_ALLOW_TEMP_ROOTS === "1", tmpDir } = {}) {
  if (!entry || typeof entry !== "object") return { ok: false, reason: "not an object" };
  const { id, repoRoot, viewDir } = entry;
  const headBranch = entry.headBranch ?? entry.branch;
  if (!id || !repoRoot || !headBranch || !viewDir) {
    return { ok: false, reason: "missing id/repoRoot/headBranch/viewDir" };
  }
  let realView;
  try {
    realView = realpathSync.native(viewDir);
  } catch {
    return { ok: false, reason: `viewDir does not resolve: ${viewDir}` };
  }
  if (basename2(realView) !== "_view" || basename2(dirname3(realView)) !== ".ai") {
    return { ok: false, reason: `viewDir is not a .ai/_view path: ${realView}` };
  }
  let realRepo;
  try {
    realRepo = realpathSync.native(repoRoot);
  } catch {
    return { ok: false, reason: `repoRoot does not resolve: ${repoRoot}` };
  }
  if (!allowEphemeral) {
    const eph = ephemeralRootReason(realRepo, { tmpDir });
    if (eph) return { ok: false, reason: `repoRoot is ephemeral (${eph}): ${realRepo}` };
  }
  const repoWithSep = realRepo.endsWith(sep) ? realRepo : `${realRepo}${sep}`;
  if (realView !== realRepo && !realView.startsWith(repoWithSep)) {
    return { ok: false, reason: `viewDir escapes repoRoot: ${realView} \u2284 ${realRepo}` };
  }
  if (!existsSync5(join5(realRepo, ".git"))) {
    return { ok: false, reason: `repoRoot is not a git repo: ${realRepo}` };
  }
  return { ok: true };
}
function readLastRender(viewDir) {
  const marker = join5(viewDir, ".last-render");
  if (!existsSync5(marker)) return { renderedAt: null, configHash: null, version: null, buildId: null };
  try {
    const parsed = JSON.parse(readFileSync4(marker, "utf-8"));
    return {
      renderedAt: parsed.renderedAt ?? null,
      configHash: parsed.configHash ?? null,
      // The shared runtimeVersion the view was rendered under (STALE-RENDER-HEAL
      // §2). null for a pre-9.60 marker that predates the stamp.
      version: typeof parsed.version === "string" && parsed.version ? parsed.version : null,
      // The shared-runtime buildId the view was rendered under (NATIVE-INTEROP
      // Workstream B — the cross-host-safe drift signal). null for a pre-9.75
      // marker that predates the buildId stamp.
      buildId: typeof parsed.buildId === "string" && parsed.buildId ? parsed.buildId : null
    };
  } catch {
    return { renderedAt: null, configHash: null, version: null, buildId: null };
  }
}
async function collectSlugMeta({ projectRoot, workflowsRoot }) {
  try {
    const workflows = await scanWorkflowIndexes({ projectRoot, workflowsRoot });
    return workflows.filter((w) => w.classification !== "invalid").map((w) => {
      const branch = w.branch ?? null;
      const baseBranch = w.baseBranch ?? null;
      const prNumber = w.prNumber ?? null;
      return {
        slug: w.slug,
        title: w.title ?? null,
        currentStage: w.currentStage ?? null,
        status: w.status ?? null,
        classification: w.classification,
        blocked: w.status === "blocked" || w.frontmatter?.blocked === true,
        branch,
        branchStrategy: w.branchStrategy ?? null,
        baseBranch,
        prNumber,
        prUrl: w.prUrl ?? null,
        // Liveness stamped at render time — buildEntry already has repoRoot and
        // runs git (§4.3). Best-effort: 'unknown' when there's no branch / no
        // git. Local-git only (checkPr:false) so the hot artifact-write render
        // path never makes a `gh` network call (R2); local ref + base-ancestry
        // already yield gone/merged. The hub refresh is likewise local-only.
        branchState: computeBranchState({ repoRoot: projectRoot, branch, baseBranch, prNumber, currentStage: w.currentStage ?? null, checkPr: false })
      };
    });
  } catch {
    return [];
  }
}
async function buildEntry({ projectRoot, viewDir, configHash = null, existing = [], nowIso }) {
  const identity = gitIdentity(projectRoot);
  if (!identity) return null;
  const { repoRoot, headBranch, worktreeLabel } = identity;
  const resolvedViewDir = (() => {
    try {
      return realpathSync.native(viewDir);
    } catch {
      return viewDir;
    }
  })();
  const id = resolveEntryId(repoRoot, existing);
  const last = readLastRender(resolvedViewDir);
  const workflowsRoot = join5(repoRoot, ".ai", "workflows");
  const slugMeta = await collectSlugMeta({ projectRoot: repoRoot, workflowsRoot });
  const stamp = nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const prior = existing.find((e) => e.id === id);
  return {
    id,
    repoRoot,
    // Informational only — the checkout's current HEAD, NOT identity (§4.2).
    // Per-slug branches (the authored truth) live on each slugMeta row.
    headBranch,
    worktreeLabel,
    viewDir: resolvedViewDir,
    lastRenderedAt: last.renderedAt ?? stamp,
    // Shared runtimeVersion + buildId the view was last rendered under — the
    // stale-render heal's drift signal (STALE-RENDER-HEAL §2, NATIVE-INTEROP
    // Workstream B). Daemons read them live from `.last-render`, but carrying
    // them on the entry surfaces them in the hub inbox.
    renderedVersion: last.version ?? null,
    renderedBuildId: last.buildId ?? null,
    slugs: slugMeta.map((s) => s.slug),
    slugMeta,
    configHash: configHash ?? last.configHash ?? null,
    registeredAt: prior?.registeredAt ?? stamp,
    updatedAt: stamp
  };
}
function repoScopeEntries(entries) {
  const byId = /* @__PURE__ */ new Map();
  for (const raw of entries ?? []) {
    if (!raw || typeof raw !== "object" || !raw.repoRoot) continue;
    const id = computeEntryId(raw.repoRoot);
    const headBranch = raw.headBranch ?? raw.branch ?? null;
    const e = { ...raw, id, headBranch };
    delete e.branch;
    const prev = byId.get(id);
    byId.set(id, prev ? mergeCollapsedEntries(prev, e) : e);
  }
  return [...byId.values()].sort(
    (a, b) => String(a.registeredAt ?? "").localeCompare(String(b.registeredAt ?? ""))
  );
}
function mergeCollapsedEntries(a, b) {
  const newer = String(b.updatedAt ?? "") >= String(a.updatedAt ?? "") ? b : a;
  const older = newer === b ? a : b;
  const slugMap = /* @__PURE__ */ new Map();
  for (const sm of older.slugMeta ?? []) slugMap.set(sm.slug, sm);
  for (const sm of newer.slugMeta ?? []) slugMap.set(sm.slug, sm);
  const slugMeta = [...slugMap.values()];
  const registered = [a.registeredAt, b.registeredAt].filter(Boolean).sort();
  return {
    ...newer,
    slugMeta,
    slugs: slugMeta.map((s) => s.slug),
    registeredAt: registered[0] ?? newer.registeredAt ?? null
  };
}
function migrateRegistry(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries)) {
    return { version: REGISTRY_VERSION, entries: [] };
  }
  if (raw.version === REGISTRY_VERSION) {
    return { version: REGISTRY_VERSION, entries: raw.entries };
  }
  return { version: REGISTRY_VERSION, entries: repoScopeEntries(raw.entries) };
}
function readRegistryFile() {
  const path = registryPath();
  if (!existsSync5(path)) return { version: REGISTRY_VERSION, entries: [] };
  try {
    return migrateRegistry(JSON.parse(readFileSync4(path, "utf-8")));
  } catch {
    return { version: REGISTRY_VERSION, entries: [] };
  }
}
function readShards() {
  const dir = shardDir();
  if (!existsSync5(dir)) return [];
  const out = [];
  let names;
  try {
    names = readdirSync2(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  for (const name of names) {
    try {
      const entry = JSON.parse(readFileSync4(join5(dir, name), "utf-8"));
      if (entry && typeof entry === "object" && entry.id) out.push({ entry, file: join5(dir, name) });
    } catch {
    }
  }
  return out;
}
function readRegistry({ validate = true, logInvalid = true } = {}) {
  const file = readRegistryFile();
  const shards = readShards().map((s) => s.entry);
  let entries = repoScopeEntries([...file.entries, ...shards]);
  if (validate) {
    entries = entries.filter((e) => {
      const v = validateEntry(e);
      if (!v.ok && logInvalid) logPrune(`drop-on-read ${e.id ?? "?"}: ${v.reason}`);
      return v.ok;
    });
  }
  return { version: REGISTRY_VERSION, entries };
}
function writeRegistryAtomic(registry) {
  const path = registryPath();
  mkdirSync3(dirname3(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync2(tmp, `${JSON.stringify(registry, null, 2)}
`, "utf-8");
  try {
    renameSync3(tmp, path);
  } catch (err) {
    try {
      rmSync4(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function writeRegistry(entries) {
  const sorted = [...entries].sort(
    (a, b) => String(a.registeredAt ?? "").localeCompare(String(b.registeredAt ?? ""))
  );
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: sorted });
}
function mergeShardsIntoRegistry() {
  const file = readRegistryFile();
  const shards = readShards();
  const merged = repoScopeEntries([...file.entries, ...shards.map((s) => s.entry)]).filter((e) => validateEntry(e).ok);
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: merged });
  for (const { file: shardFile } of shards) {
    try {
      rmSync4(shardFile, { force: true });
    } catch {
    }
  }
  return { entries: merged, mergedShards: shards.length };
}
function entryWithinGrace(entry, graceMs = REGISTRY_FRESH_GRACE_MS, now = Date.now()) {
  const t = Date.parse(entry?.updatedAt ?? "");
  return Number.isFinite(t) && now - t < graceMs;
}
function pruneRegistry({ graceMs = REGISTRY_FRESH_GRACE_MS, now = Date.now() } = {}) {
  const { entries } = readRegistry({ validate: false, logInvalid: false });
  const kept = [];
  let pruned = 0;
  for (const e of entries) {
    const valid = validateEntry(e).ok;
    const backing = valid && existsSync5(e.repoRoot) && existsSync5(e.viewDir);
    const hasWork = backing && (existsSync5(join5(e.viewDir, ".last-render")) || countPending(e.viewDir) > 0);
    if (backing && (hasWork || entryWithinGrace(e, graceMs, now))) {
      kept.push(e);
    } else {
      pruned++;
      const reason = !valid ? "failed validation" : !backing ? "missing repoRoot/viewDir" : "no .last-render + no queued renders past registration grace";
      logPrune(`prune ${e.id ?? "?"} (${e.repoRoot ?? "?"} @ ${e.headBranch ?? e.branch ?? "?"}): ${reason}`);
    }
  }
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: kept });
  for (const { file } of readShards()) {
    try {
      rmSync4(file, { force: true });
    } catch {
    }
  }
  return { kept: kept.length, pruned };
}
function logPrune(line) {
  try {
    appendLogLine(pruneLogPath(), `[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}`);
  } catch {
  }
}
function writeShard(entry) {
  const dir = shardDir();
  mkdirSync3(dir, { recursive: true });
  const path = join5(dir, `${entry.id}.json`);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync2(tmp, `${JSON.stringify(entry, null, 2)}
`, "utf-8");
  try {
    renameSync3(tmp, path);
  } catch (err) {
    try {
      rmSync4(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function shardCount() {
  const dir = shardDir();
  if (!existsSync5(dir)) return 0;
  try {
    return readdirSync2(dir).filter((n) => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}
function liveHub() {
  let record = null;
  try {
    const text = readFileSync4(hubPidPath(), "utf-8").trim();
    record = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
  if (!record || !record.pid || !isPidAlive(record.pid)) return null;
  return record;
}
function postEntryToHub(hub, entry) {
  return new Promise((resolve) => {
    let body;
    try {
      body = JSON.stringify(entry);
    } catch {
      return resolve(false);
    }
    const host = hub.host === "0.0.0.0" ? "127.0.0.1" : hub.host ?? "127.0.0.1";
    const req = request({
      hostname: host,
      port: hub.port,
      path: "/__sdlc/registry/upsert",
      method: "POST",
      timeout: 1500,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-sdlc-token": hub.token ?? ""
      }
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 || res.statusCode === 201);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end(body);
  });
}
var AI_GITIGNORE_RULES = ["_view/", "workflows/*/.locks/"];
function seedAiGitignore(viewDir) {
  try {
    const path = join5(dirname3(viewDir), ".gitignore");
    let text = "";
    try {
      text = readFileSync4(path, "utf-8");
    } catch {
    }
    const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
    const missing = AI_GITIGNORE_RULES.filter((r) => !have.has(r));
    if (!missing.length) return;
    const head = text ? text.replace(/\r?\n?$/, "\n") : "# managed by sdlc-workflow \u2014 render output and locks stay out of git\n";
    writeFileSync2(path, `${head}${missing.join("\n")}
`, "utf-8");
  } catch {
  }
}
async function upsertRegistryEntry({ projectRoot = process.cwd(), viewDir, configHash = null } = {}) {
  try {
    const resolvedView = viewDir ?? join5(projectRoot, ".ai", "_view");
    const existing = readRegistry({ logInvalid: false }).entries;
    const entry = await buildEntry({ projectRoot, viewDir: resolvedView, configHash, existing });
    if (!entry) {
      logPrune(`skip-not-git ${projectRoot}: no git toplevel \u2014 run git init to register`);
      return { action: "skipped-not-git" };
    }
    try {
      mkdirSync3(resolvedView, { recursive: true });
      entry.viewDir = realpathSync.native(resolvedView);
    } catch {
    }
    const v = validateEntry(entry);
    if (!v.ok) {
      logPrune(`reject-on-write ${entry.id}: ${v.reason}`);
      return { action: "rejected", id: entry.id };
    }
    seedAiGitignore(entry.viewDir);
    const hub = liveHub();
    if (hub) {
      const ok = await postEntryToHub(hub, entry);
      if (ok) return { action: "posted-to-hub", id: entry.id };
    }
    writeShard(entry);
    if (!hub && shardCount() > SHARD_SOFT_CAP) {
      try {
        const { mergedShards } = mergeShardsIntoRegistry();
        logPrune(`janitor: merged ${mergedShards} shards past cap ${SHARD_SOFT_CAP}`);
      } catch {
      }
    }
    return { action: "sharded", id: entry.id };
  } catch (err) {
    try {
      logPrune(`upsert error: ${err?.message ?? err}`);
    } catch {
    }
    return { action: "error" };
  }
}

export {
  isPidAlive,
  readPidFile,
  writePidFile,
  removePidFile,
  removeOwnPidFile,
  removeOwnPidFileSync,
  pidFileStatus,
  safeParseFrontmatter,
  safeLoadFrontmatterFile,
  latestMtimeMs,
  latestTreeMtimeMs,
  viewMtimeForSlug,
  classifyRenderState,
  scanWorkflowIndexes,
  activeWorkflowIndexes,
  refreshEntriesLiveness,
  queueDir,
  appendError,
  enqueue,
  writeStatus,
  countPending,
  createRenderQueueDrainer,
  REGISTRY_VERSION,
  REGISTRY_FRESH_GRACE_MS,
  sdlcHomeDir,
  hubPidPath,
  ephemeralRootReason,
  validateEntry,
  readRegistry,
  writeRegistry,
  entryWithinGrace,
  pruneRegistry,
  logPrune,
  upsertRegistryEntry,
  errorsLogPath,
  appendLogLine,
  hubLogLine,
  logLifecycle,
  recordHubStart,
  readHubHistory
};
