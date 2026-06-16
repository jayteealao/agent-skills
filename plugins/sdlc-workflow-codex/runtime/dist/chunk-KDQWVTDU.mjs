import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  countPending
} from "./chunk-HLR2BZLC.mjs";
import {
  scanWorkflowIndexes
} from "./chunk-NTSUEAI6.mjs";

// lib/pid-file.mjs
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
async function pidFileStatus(pidPath) {
  const record = await readPidFile(pidPath);
  const alive = record?.pid ? isPidAlive(record.pid) : false;
  return { record, alive, stale: Boolean(record && !alive) };
}

// lib/runtime-manifest.mjs
import { readFileSync } from "node:fs";
var HUB_NAME = "sdlc-workflow-hub";
var HUB_PROTOCOL_VERSION = 1;
var ARTIFACT_SCHEMA = "sdlc/v1";
var REGISTRY_VERSION = 2;
var HUB_CONFIG_VERSION = 1;
var RUNTIME_FAMILY = "sdlc-workflow";
var MANIFEST_URL = new URL("../runtime-manifest.json", import.meta.url);
var PACKAGE_URL = new URL("../package.json", import.meta.url);
var cached = null;
function readRuntimeManifest() {
  if (cached) return cached;
  cached = loadManifest();
  return cached;
}
function loadManifest() {
  try {
    const m = JSON.parse(readFileSync(MANIFEST_URL, "utf-8"));
    return normalizeManifest(m);
  } catch {
    return fallbackManifest();
  }
}
function normalizeManifest(m) {
  const o = m && typeof m === "object" ? m : {};
  return Object.freeze({
    family: typeof o.family === "string" && o.family ? o.family : RUNTIME_FAMILY,
    hubName: typeof o.hubName === "string" && o.hubName ? o.hubName : HUB_NAME,
    runtimeVersion: typeof o.runtimeVersion === "string" && o.runtimeVersion ? o.runtimeVersion : readPackageVersion(),
    hubProtocolVersion: Number.isInteger(o.hubProtocolVersion) ? o.hubProtocolVersion : HUB_PROTOCOL_VERSION,
    artifactSchema: typeof o.artifactSchema === "string" && o.artifactSchema ? o.artifactSchema : ARTIFACT_SCHEMA,
    registryVersion: Number.isInteger(o.registryVersion) ? o.registryVersion : REGISTRY_VERSION,
    hubConfigVersion: Number.isInteger(o.hubConfigVersion) ? o.hubConfigVersion : HUB_CONFIG_VERSION,
    buildId: typeof o.buildId === "string" && o.buildId ? o.buildId : null
  });
}
function fallbackManifest() {
  return Object.freeze({
    family: RUNTIME_FAMILY,
    hubName: HUB_NAME,
    runtimeVersion: readPackageVersion(),
    hubProtocolVersion: HUB_PROTOCOL_VERSION,
    artifactSchema: ARTIFACT_SCHEMA,
    registryVersion: REGISTRY_VERSION,
    hubConfigVersion: HUB_CONFIG_VERSION,
    buildId: null
  });
}
function readPackageVersion() {
  try {
    return JSON.parse(readFileSync(PACKAGE_URL, "utf-8")).version ?? "";
  } catch {
    return "";
  }
}
function runtimeIdentity() {
  const m = readRuntimeManifest();
  return {
    runtimeVersion: m.runtimeVersion,
    buildId: m.buildId,
    hubName: m.hubName,
    hubProtocolVersion: m.hubProtocolVersion
  };
}
function readRenderedIdentity(markerPath) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf-8"));
    return {
      version: typeof parsed.version === "string" && parsed.version ? parsed.version : null,
      buildId: typeof parsed.buildId === "string" && parsed.buildId ? parsed.buildId : null
    };
  } catch {
    return { version: null, buildId: null };
  }
}
function renderIdentityMatches(recorded, active) {
  const r = recorded ?? {};
  const a = active ?? {};
  if (r.buildId && a.buildId) return r.buildId === a.buildId;
  return Boolean(r.version) && r.version === a.runtimeVersion;
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
function computeBranchState({ repoRoot, branch, baseBranch, prNumber, checkPr = true } = {}) {
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
    return "gone";
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

// lib/registry.mjs
import { createHash } from "node:crypto";
import { execFileSync as execFileSync2 } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync as readFileSync2,
  readdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  realpathSync,
  statSync,
  appendFileSync
} from "node:fs";
import { request } from "node:http";
import { homedir } from "node:os";
import { basename, dirname as dirname2, join, sep } from "node:path";
var REGISTRY_VERSION2 = 2;
var SHARD_SOFT_CAP = 100;
function sdlcHomeDir() {
  const override = process.env.SDLC_HOME;
  return override && override.trim() ? override : join(homedir(), ".sdlc");
}
function registryPath() {
  return join(sdlcHomeDir(), "registry.json");
}
function shardDir() {
  return join(sdlcHomeDir(), "registry.d");
}
function pruneLogPath() {
  return join(sdlcHomeDir(), "registry.prune.log");
}
function hubPidPath() {
  return join(sdlcHomeDir(), "hub.pid");
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
  if (!headBranch || headBranch === "HEAD") headBranch = basename(repoRoot);
  const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
  const commonDirRaw = git(cwd, ["rev-parse", "--git-common-dir"]);
  let isWorktree = false;
  if (gitDir && commonDirRaw) {
    const commonAbs = commonDirRaw.match(/^([a-zA-Z]:[\\/]|\/)/) ? commonDirRaw : join(repoRoot, commonDirRaw);
    isWorktree = canon(gitDir) !== canon(commonAbs);
  }
  return {
    repoRoot,
    headBranch,
    // A linked worktree has its OWN repoRoot, so repo-scoped ids keep worktrees
    // distinct for free; the label is kept for display.
    worktreeLabel: isWorktree ? basename(repoRoot) : null
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
function validateEntry(entry) {
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
  if (basename(realView) !== "_view" || basename(dirname2(realView)) !== ".ai") {
    return { ok: false, reason: `viewDir is not a .ai/_view path: ${realView}` };
  }
  let realRepo;
  try {
    realRepo = realpathSync.native(repoRoot);
  } catch {
    return { ok: false, reason: `repoRoot does not resolve: ${repoRoot}` };
  }
  const repoWithSep = realRepo.endsWith(sep) ? realRepo : `${realRepo}${sep}`;
  if (realView !== realRepo && !realView.startsWith(repoWithSep)) {
    return { ok: false, reason: `viewDir escapes repoRoot: ${realView} \u2284 ${realRepo}` };
  }
  if (!existsSync(join(realRepo, ".git"))) {
    return { ok: false, reason: `repoRoot is not a git repo: ${realRepo}` };
  }
  return { ok: true };
}
function readLastRender(viewDir) {
  const marker = join(viewDir, ".last-render");
  if (!existsSync(marker)) return { renderedAt: null, configHash: null, version: null, buildId: null };
  try {
    const parsed = JSON.parse(readFileSync2(marker, "utf-8"));
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
        branchState: computeBranchState({ repoRoot: projectRoot, branch, baseBranch, prNumber, checkPr: false })
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
  const workflowsRoot = join(repoRoot, ".ai", "workflows");
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
    return { version: REGISTRY_VERSION2, entries: [] };
  }
  if (raw.version === REGISTRY_VERSION2) {
    return { version: REGISTRY_VERSION2, entries: raw.entries };
  }
  return { version: REGISTRY_VERSION2, entries: repoScopeEntries(raw.entries) };
}
function readRegistryFile() {
  const path = registryPath();
  if (!existsSync(path)) return { version: REGISTRY_VERSION2, entries: [] };
  try {
    return migrateRegistry(JSON.parse(readFileSync2(path, "utf-8")));
  } catch {
    return { version: REGISTRY_VERSION2, entries: [] };
  }
}
function readShards() {
  const dir = shardDir();
  if (!existsSync(dir)) return [];
  const out = [];
  let names;
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  for (const name of names) {
    try {
      const entry = JSON.parse(readFileSync2(join(dir, name), "utf-8"));
      if (entry && typeof entry === "object" && entry.id) out.push({ entry, file: join(dir, name) });
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
  return { version: REGISTRY_VERSION2, entries };
}
function writeRegistryAtomic(registry) {
  const path = registryPath();
  mkdirSync(dirname2(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(registry, null, 2)}
`, "utf-8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function writeRegistry(entries) {
  const sorted = [...entries].sort(
    (a, b) => String(a.registeredAt ?? "").localeCompare(String(b.registeredAt ?? ""))
  );
  writeRegistryAtomic({ version: REGISTRY_VERSION2, entries: sorted });
}
function mergeShardsIntoRegistry() {
  const file = readRegistryFile();
  const shards = readShards();
  const merged = repoScopeEntries([...file.entries, ...shards.map((s) => s.entry)]).filter((e) => validateEntry(e).ok);
  writeRegistryAtomic({ version: REGISTRY_VERSION2, entries: merged });
  for (const { file: shardFile } of shards) {
    try {
      rmSync(shardFile, { force: true });
    } catch {
    }
  }
  return { entries: merged, mergedShards: shards.length };
}
function pruneRegistry() {
  const { entries } = readRegistry({ validate: false, logInvalid: false });
  const kept = [];
  let pruned = 0;
  for (const e of entries) {
    const valid = validateEntry(e).ok;
    const present = valid && existsSync(e.repoRoot) && existsSync(e.viewDir) && (existsSync(join(e.viewDir, ".last-render")) || countPending(e.viewDir) > 0);
    if (present) {
      kept.push(e);
    } else {
      pruned++;
      logPrune(`prune ${e.id ?? "?"} (${e.repoRoot ?? "?"} @ ${e.headBranch ?? e.branch ?? "?"}): ${valid ? "missing repoRoot/viewDir, no .last-render + no queued renders" : "failed validation"}`);
    }
  }
  writeRegistryAtomic({ version: REGISTRY_VERSION2, entries: kept });
  for (const { file } of readShards()) {
    try {
      rmSync(file, { force: true });
    } catch {
    }
  }
  return { kept: kept.length, pruned };
}
function logPrune(line) {
  try {
    mkdirSync(sdlcHomeDir(), { recursive: true });
    appendFileSync(pruneLogPath(), `[${(/* @__PURE__ */ new Date()).toISOString()}] ${line}
`, "utf-8");
  } catch {
  }
}
function writeShard(entry) {
  const dir = shardDir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${entry.id}.json`);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}
`, "utf-8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function shardCount() {
  const dir = shardDir();
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((n) => n.endsWith(".json")).length;
  } catch {
    return 0;
  }
}
function liveHub() {
  let record = null;
  try {
    const text = readFileSync2(hubPidPath(), "utf-8").trim();
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
async function upsertRegistryEntry({ projectRoot = process.cwd(), viewDir, configHash = null } = {}) {
  try {
    const resolvedView = viewDir ?? join(projectRoot, ".ai", "_view");
    const existing = readRegistry({ logInvalid: false }).entries;
    const entry = await buildEntry({ projectRoot, viewDir: resolvedView, configHash, existing });
    if (!entry) return { action: "skipped-not-git" };
    const v = validateEntry(entry);
    if (!v.ok) {
      logPrune(`reject-on-write ${entry.id}: ${v.reason}`);
      return { action: "rejected", id: entry.id };
    }
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

// lib/cross-host-lock.mjs
import { randomBytes } from "node:crypto";
import { hostname as osHostname } from "node:os";
import { open, readFile as readFile2, rename as rename2, rm as rm2, stat, writeFile as writeFile2, mkdir as mkdir2 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";
var DEFAULT_LOCK_TTL_MS = 3e4;
var DEFAULT_ACQUIRE_TIMEOUT_MS = 15e3;
var DEFAULT_RETRY_MS = 100;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function atomicWriteJson(path, obj) {
  await mkdir2(dirname3(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile2(tmp, `${JSON.stringify(obj, null, 2)}
`, "utf-8");
  await rename2(tmp, path);
}
async function readLock(lockPath) {
  try {
    const text = (await readFile2(lockPath, "utf-8")).trim();
    if (!text) return null;
    const rec = JSON.parse(text);
    return rec && typeof rec === "object" ? rec : null;
  } catch {
    return null;
  }
}
function isLockStale(record, now = Date.now()) {
  if (!record || !Number.isInteger(record.pid)) return true;
  if (!isPidAlive(record.pid)) return true;
  if (Number.isFinite(record.expiry) && now > record.expiry) return true;
  return false;
}
function makeRecord({ ownerHost, hostname, ttlMs, now }) {
  return {
    pid: process.pid,
    host: ownerHost,
    hostname,
    token: randomBytes(16).toString("hex"),
    acquiredAt: now,
    renewedAt: now,
    expiry: now + ttlMs,
    ttlMs
  };
}
function makeHandle(lockPath, record, ttlMs, nowFn) {
  return {
    ok: true,
    token: record.token,
    record,
    /**
     * Heartbeat: extend the expiry, but ONLY if we still own the lock (fencing).
     * Returns false if we've been displaced — a well-behaved holder treats false
     * as "I lost the critical section" and aborts its mutation.
     */
    async renew() {
      const cur = await readLock(lockPath);
      if (!cur || cur.token !== record.token) return false;
      const now = nowFn();
      const next = { ...cur, renewedAt: now, expiry: now + ttlMs };
      await atomicWriteJson(lockPath, next);
      record.renewedAt = next.renewedAt;
      record.expiry = next.expiry;
      return true;
    },
    /** Release: delete the lock ONLY if we still own it (fencing). */
    async release() {
      const cur = await readLock(lockPath);
      if (cur && cur.token !== record.token) return false;
      await rm2(lockPath, { force: true });
      return true;
    }
  };
}
async function tryAcquireLock(lockPath, {
  ownerHost = "unknown",
  ttlMs = DEFAULT_LOCK_TTL_MS,
  hostname = osHostname(),
  now = () => Date.now()
} = {}) {
  await mkdir2(dirname3(lockPath), { recursive: true });
  let fh;
  try {
    fh = await open(lockPath, "wx");
  } catch (err) {
    if (err?.code === "EEXIST") return { ok: false, heldBy: await readLock(lockPath) };
    throw err;
  }
  try {
    const record = makeRecord({ ownerHost, hostname, ttlMs, now: now() });
    await fh.writeFile(`${JSON.stringify(record, null, 2)}
`, "utf-8");
    await fh.close();
    fh = null;
    return makeHandle(lockPath, record, ttlMs, now);
  } finally {
    if (fh) {
      try {
        await fh.close();
      } catch {
      }
    }
  }
}
async function acquireLock(lockPath, {
  ownerHost = "unknown",
  ttlMs = DEFAULT_LOCK_TTL_MS,
  timeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
  retryMs = DEFAULT_RETRY_MS,
  hostname = osHostname(),
  now = () => Date.now(),
  log = () => {
  }
} = {}) {
  const deadline = now() + timeoutMs;
  const nullGraceMs = Math.max(2 * retryMs, 1e3);
  for (; ; ) {
    const got = await tryAcquireLock(lockPath, { ownerHost, ttlMs, hostname, now });
    if (got.ok) return got;
    const held = got.heldBy;
    const takeable = held ? isLockStale(held, now()) : await nullLockTakeable(lockPath, nullGraceMs, now);
    if (takeable) {
      log(`[lock] taking over stale lock at ${lockPath} (held by pid ${held?.pid ?? "?"}/${held?.host ?? "?"})`);
      try {
        await rm2(lockPath, { force: true });
      } catch {
      }
      continue;
    }
    if (now() >= deadline) {
      return { ok: false, heldBy: held };
    }
    await sleep(retryMs);
  }
}
async function nullLockTakeable(lockPath, graceMs, now) {
  try {
    const st = await stat(lockPath);
    return now() - st.mtimeMs > graceMs;
  } catch {
    return false;
  }
}
async function withLock(lockPath, opts, fn) {
  const handle = await acquireLock(lockPath, opts);
  if (!handle.ok) {
    throw new LockTimeoutError(lockPath, handle.heldBy);
  }
  try {
    return await fn(handle);
  } finally {
    try {
      await handle.release();
    } catch {
    }
  }
}
var LockTimeoutError = class extends Error {
  constructor(lockPath, heldBy) {
    super(`timed out acquiring cross-host lock ${lockPath} (held by pid ${heldBy?.pid ?? "?"}/${heldBy?.host ?? "?"})`);
    this.name = "LockTimeoutError";
    this.lockPath = lockPath;
    this.heldBy = heldBy ?? null;
  }
};

// lib/runtime-store.mjs
import { randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync2, readFileSync as readFileSync3, readdirSync as readdirSync2, rmSync as rmSync2 } from "node:fs";
import { cp, mkdir as mkdir3, readFile as readFile3, rename as rename3, rm as rm3 } from "node:fs/promises";
import { dirname as dirname4, join as join2 } from "node:path";
var PAYLOAD_DIRS = ["dist", "assets", "components", "schemas", join2("docs", "site")];
var PAYLOAD_FILES = ["runtime-manifest.json", join2("tests", "frontmatter.schema.json")];
var REQUIRED = ["runtime-manifest.json", "dist", "schemas"];
function runtimeStoreDir() {
  return join2(sdlcHomeDir(), "runtime");
}
function runtimeRootFor(buildId) {
  return join2(runtimeStoreDir(), buildId);
}
function activeRuntimePath() {
  return join2(sdlcHomeDir(), "active-runtime.json");
}
async function materializeRuntime(pluginRoot, { manifest = readRuntimeManifest() } = {}) {
  const buildId = manifest.buildId;
  if (!buildId) {
    return { buildId: null, runtimeRoot: pluginRoot, materialized: false };
  }
  const target = runtimeRootFor(buildId);
  if (existsSync2(target) && await verifyRuntimeStore(target, buildId)) {
    return { buildId, runtimeRoot: target, materialized: false };
  }
  await mkdir3(runtimeStoreDir(), { recursive: true });
  const tmp = join2(runtimeStoreDir(), `.${buildId}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`);
  await rm3(tmp, { recursive: true, force: true });
  await copyRuntimePayload(pluginRoot, tmp);
  try {
    await rename3(tmp, target);
  } catch (err) {
    await rm3(tmp, { recursive: true, force: true });
    if (existsSync2(target) && await verifyRuntimeStore(target, buildId)) {
      return { buildId, runtimeRoot: target, materialized: false };
    }
    throw err;
  }
  if (!await verifyRuntimeStore(target, buildId)) {
    throw new Error(`materialized runtime at ${target} failed verification`);
  }
  return { buildId, runtimeRoot: target, materialized: true };
}
async function copyRuntimePayload(src, dst) {
  await mkdir3(dst, { recursive: true });
  for (const d of PAYLOAD_DIRS) {
    const from = join2(src, d);
    if (existsSync2(from)) await cp(from, join2(dst, d), { recursive: true });
  }
  for (const f of PAYLOAD_FILES) {
    const from = join2(src, f);
    if (existsSync2(from)) {
      await mkdir3(dirname4(join2(dst, f)), { recursive: true });
      await cp(from, join2(dst, f));
    }
  }
}
async function verifyRuntimeStore(runtimeRoot, expectedBuildId = null) {
  try {
    for (const r of REQUIRED) if (!existsSync2(join2(runtimeRoot, r))) return false;
    const m = JSON.parse(await readFile3(join2(runtimeRoot, "runtime-manifest.json"), "utf-8"));
    if (expectedBuildId && m.buildId !== expectedBuildId) return false;
    return true;
  } catch {
    return false;
  }
}
async function writeActiveRuntime({ buildId, runtimeRoot, runtimeVersion }) {
  await atomicWriteJson(activeRuntimePath(), {
    buildId,
    runtimeRoot,
    runtimeVersion,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
function readRuntimeIdentityAt(runtimeRoot) {
  try {
    const m = JSON.parse(readFileSync3(join2(runtimeRoot, "runtime-manifest.json"), "utf-8"));
    return {
      runtimeVersion: typeof m.runtimeVersion === "string" && m.runtimeVersion ? m.runtimeVersion : null,
      buildId: typeof m.buildId === "string" && m.buildId ? m.buildId : null,
      hubName: typeof m.hubName === "string" && m.hubName ? m.hubName : HUB_NAME,
      hubProtocolVersion: Number.isInteger(m.hubProtocolVersion) ? m.hubProtocolVersion : HUB_PROTOCOL_VERSION
    };
  } catch {
    return null;
  }
}
function resolveActiveRuntimeRootSync() {
  const fromPid = pidRuntimeRoot();
  if (fromPid && verifyRuntimeStoreSync(fromPid)) return fromPid;
  try {
    const act = JSON.parse(readFileSync3(activeRuntimePath(), "utf-8"));
    if (act?.runtimeRoot && verifyRuntimeStoreSync(act.runtimeRoot)) return act.runtimeRoot;
  } catch {
  }
  return null;
}
function verifyRuntimeStoreSync(runtimeRoot) {
  try {
    for (const r of REQUIRED) if (!existsSync2(join2(runtimeRoot, r))) return false;
    return true;
  } catch {
    return false;
  }
}
function pidRuntimeRoot() {
  try {
    const rec = JSON.parse(readFileSync3(hubPidPath(), "utf-8"));
    return typeof rec?.runtimeRoot === "string" && rec.runtimeRoot ? rec.runtimeRoot : null;
  } catch {
    return null;
  }
}
function gcRuntimes({ keepBuildIds = [] } = {}) {
  const dir = runtimeStoreDir();
  if (!existsSync2(dir)) return { removed: [] };
  const keep = new Set(keepBuildIds.filter(Boolean));
  const bundled = safeManifest()?.buildId;
  if (bundled) keep.add(bundled);
  const active = safeReadJson(activeRuntimePath());
  if (active?.buildId) keep.add(active.buildId);
  const pid = safeReadJson(hubPidPath());
  if (pid?.buildId) keep.add(pid.buildId);
  const protectedVersions = new Set(
    [active?.runtimeVersion, pid?.runtimeVersion, safeManifest()?.runtimeVersion].filter(Boolean)
  );
  const removed = [];
  for (const name of readdirSync2(dir)) {
    if (name.startsWith(".")) continue;
    if (keep.has(name)) continue;
    const m = safeReadJson(join2(dir, name, "runtime-manifest.json"));
    if (m?.runtimeVersion && protectedVersions.has(m.runtimeVersion)) continue;
    try {
      rmSync2(join2(dir, name), { recursive: true, force: true });
      removed.push(name);
    } catch {
    }
  }
  return { removed };
}
function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync3(path, "utf-8"));
  } catch {
    return null;
  }
}
function safeManifest() {
  try {
    return readRuntimeManifest();
  } catch {
    return null;
  }
}

export {
  isPidAlive,
  readPidFile,
  writePidFile,
  removePidFile,
  pidFileStatus,
  atomicWriteJson,
  withLock,
  LockTimeoutError,
  runtimeIdentity,
  readRenderedIdentity,
  renderIdentityMatches,
  refreshEntriesLiveness,
  REGISTRY_VERSION2 as REGISTRY_VERSION,
  sdlcHomeDir,
  hubPidPath,
  validateEntry,
  readRegistry,
  writeRegistry,
  pruneRegistry,
  upsertRegistryEntry,
  materializeRuntime,
  verifyRuntimeStore,
  writeActiveRuntime,
  readRuntimeIdentityAt,
  resolveActiveRuntimeRootSync,
  gcRuntimes
};
