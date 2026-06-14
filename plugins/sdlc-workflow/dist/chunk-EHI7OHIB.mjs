import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  scanWorkflowIndexes
} from "./chunk-NTSUEAI6.mjs";
import {
  countPending,
  resolveEntrypoint
} from "./chunk-HLR2BZLC.mjs";

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
  return new Promise((resolve2) => {
    let body;
    try {
      body = JSON.stringify(entry);
    } catch {
      return resolve2(false);
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
      resolve2(res.statusCode === 200 || res.statusCode === 201);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve2(false);
    });
    req.on("error", () => resolve2(false));
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

// lib/code-browser.mjs
import { execFileSync as execFileSync3 } from "node:child_process";
import {
  closeSync,
  createReadStream,
  existsSync as existsSync2,
  openSync,
  readFileSync as readFileSync3,
  readSync,
  readdirSync as readdirSync2,
  realpathSync as realpathSync2,
  statSync as statSync2
} from "node:fs";
import { basename as basename2, relative, resolve, sep as sep2 } from "node:path";
var CODE_BROWSER_DEFAULTS = Object.freeze({
  enabled: true,
  // machine-wide kill switch (mirrors perRepoServe)
  maxBlobBytes: 512 * 1024,
  // text cap per blob response
  maxTreeEntries: 5e3,
  // per-listing truncation guard
  lazyTree: true,
  // list one folder per request (node_modules is shown, so never eager-walk by default)
  showIgnoredBadge: true,
  // badge gitignored nodes (presentation only — costs one cached git spawn)
  serveSecrets: false,
  // ⚠ true drops the secret denylist (.env/keys become servable)
  denyGlobs: []
  // appended to denyGlobsDefault(); see compileDeny grammar
});
function normalizeCodeBrowserConfig(raw) {
  const cfg = { ...CODE_BROWSER_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
  cfg.enabled = cfg.enabled !== false;
  cfg.maxBlobBytes = boundedInt(cfg.maxBlobBytes, 1024, 16 * 1024 * 1024, CODE_BROWSER_DEFAULTS.maxBlobBytes);
  cfg.maxTreeEntries = boundedInt(cfg.maxTreeEntries, 10, 1e5, CODE_BROWSER_DEFAULTS.maxTreeEntries);
  cfg.lazyTree = cfg.lazyTree !== false;
  cfg.showIgnoredBadge = cfg.showIgnoredBadge !== false;
  cfg.serveSecrets = cfg.serveSecrets === true;
  cfg.denyGlobs = Array.isArray(cfg.denyGlobs) ? cfg.denyGlobs.map(String) : [];
  return cfg;
}
function boundedInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
var CODE_BROWSER_ENV = "SDLC_CODE_BROWSER";
function codeBrowserConfigFromEnv(env = process.env) {
  const raw = env?.[CODE_BROWSER_ENV];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
var SECRET_GLOBS = Object.freeze([
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "id_rsa*",
  "*.p12",
  "*.keystore"
]);
function denyGlobsDefault({ serveSecrets = false } = {}) {
  return serveSecrets ? [".git/**"] : [".git/**", ...SECRET_GLOBS];
}
function compileDeny(globs) {
  const prefixes = [];
  const segRes = [];
  for (const raw of globs ?? []) {
    let g = String(raw).trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
    if (!g) continue;
    if (g.endsWith("/**")) g = g.slice(0, -3);
    if (g.includes("/")) prefixes.push(g);
    else segRes.push(segmentRegex(g));
  }
  return (relPath) => {
    const p = String(relPath ?? "").replace(/\\/g, "/").toLowerCase();
    if (!p) return false;
    for (const pre of prefixes) {
      if (p === pre || p.startsWith(`${pre}/`)) return true;
    }
    if (segRes.length) {
      for (const s of p.split("/")) {
        for (const re of segRes) if (re.test(s)) return true;
      }
    }
    return false;
  };
}
function segmentRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}
var ContainmentError = class extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "ContainmentError";
    this.status = status;
  }
};
function resolveRepoPath(repoRoot, relPath, { deny = null } = {}) {
  if (typeof relPath !== "string") throw new ContainmentError("bad path");
  if (relPath.includes("\0")) throw new ContainmentError("bad path");
  const fwd = relPath.replace(/\\/g, "/");
  if (fwd.startsWith("/") || /^[a-zA-Z]:/.test(fwd)) throw new ContainmentError("absolute path");
  const segs = fwd.split("/").filter((s) => s !== "");
  for (const s of segs) {
    if (s === "." || s === "..") throw new ContainmentError("dot segment");
  }
  const rel = segs.join("/");
  if (deny && rel && deny(rel)) throw new ContainmentError("denied");
  const rootAbs = resolve(repoRoot);
  const abs = rel ? resolve(rootAbs, rel) : rootAbs;
  const lexRel = relative(rootAbs, abs);
  if (lexRel.startsWith("..") || /^[a-zA-Z]:/.test(lexRel) || lexRel.startsWith(sep2)) {
    throw new ContainmentError("escapes root");
  }
  let realRoot;
  try {
    realRoot = realpathSync2.native(rootAbs);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!existsSync2(abs)) throw new ContainmentError("not found", 404);
  let real;
  try {
    real = realpathSync2.native(abs);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  const rootWithSep = realRoot.endsWith(sep2) ? realRoot : `${realRoot}${sep2}`;
  if (real !== realRoot && !real.startsWith(rootWithSep)) {
    throw new ContainmentError("escapes root");
  }
  if (deny && real !== realRoot) {
    const realRel = relative(realRoot, real).replace(/\\/g, "/");
    if (deny(realRel)) throw new ContainmentError("denied");
  }
  return { abs, real, rel };
}
var IGNORED_TTL_MS = 5e3;
var ignoredCache = /* @__PURE__ */ new Map();
var EMPTY_MATCHER = Object.freeze({ has: () => false, size: 0 });
function gitIgnoredSet(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  let key;
  try {
    key = realpathSync2.native(repoRoot);
  } catch {
    key = resolve(repoRoot);
  }
  const hit = ignoredCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.matcher;
  const matcher = buildIgnoredMatcher(key);
  ignoredCache.set(key, { at: now, matcher });
  return matcher;
}
function buildIgnoredMatcher(root) {
  let out = "";
  try {
    out = execFileSync3(
      "git",
      ["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"],
      {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 4e3,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
  } catch {
    return EMPTY_MATCHER;
  }
  const files = /* @__PURE__ */ new Set();
  const dirSet = /* @__PURE__ */ new Set();
  for (const entry of out.split("\0")) {
    if (!entry) continue;
    const p = entry.replace(/\\/g, "/");
    if (p.endsWith("/")) dirSet.add(p.slice(0, -1));
    else files.add(p);
  }
  if (!files.size && !dirSet.size) return EMPTY_MATCHER;
  return {
    has(relPath) {
      const p = String(relPath ?? "").replace(/\\/g, "/");
      if (!p) return false;
      if (files.has(p) || dirSet.has(p)) return true;
      let idx = -1;
      while ((idx = p.indexOf("/", idx + 1)) !== -1) {
        if (dirSet.has(p.slice(0, idx))) return true;
      }
      return false;
    },
    size: files.size + dirSet.size
  };
}
var headCache = /* @__PURE__ */ new Map();
function repoHeadBranch(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  const key = resolve(repoRoot);
  const hit = headCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.branch;
  let branch = null;
  try {
    const out = execFileSync3("git", ["-C", key, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    branch = out && out !== "HEAD" ? out : null;
  } catch {
    branch = null;
  }
  headCache.set(key, { at: now, branch });
  return branch;
}
var IMAGE_EXTS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);
var LANG_BY_EXT = Object.freeze({
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "html",
  htm: "html",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  rs: "rust",
  go: "go"
});
function languageFor(name) {
  const base = String(name ?? "").toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  return LANG_BY_EXT[ext] ?? "plaintext";
}
function walkDir(repoRoot, {
  subPath = "",
  lazy = true,
  maxEntries = 5e3,
  deny = null,
  ignored = null
} = {}) {
  const { real: dirReal, rel: baseRel } = resolveRepoPath(repoRoot, subPath, { deny });
  let st;
  try {
    st = statSync2(dirReal);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isDirectory()) throw new ContainmentError("not a directory", 404);
  let realRoot;
  try {
    realRoot = realpathSync2.native(repoRoot);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  const ctx = {
    lazy,
    maxEntries,
    deny,
    ignored,
    realRoot,
    count: 0,
    truncated: false,
    visited: /* @__PURE__ */ new Set([dirReal])
    // eager-mode symlink-cycle guard
  };
  const nodes = listLevel(dirReal, baseRel, ctx);
  return { nodes, truncated: ctx.truncated };
}
function listLevel(dirAbs, dirRel, ctx) {
  let entries;
  try {
    entries = readdirSync2(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    const ad = a.isDirectory() || a.isSymbolicLink() ? 0 : 1;
    const bd = b.isDirectory() || b.isSymbolicLink() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const out = [];
  for (const ent of entries) {
    if (ctx.count >= ctx.maxEntries) {
      ctx.truncated = true;
      break;
    }
    const name = ent.name;
    const rel = dirRel ? `${dirRel}/${name}` : name;
    if (ctx.deny && ctx.deny(rel)) continue;
    const abs = `${dirAbs}${sep2}${name}`;
    let type = null;
    let symlink = false;
    let recursable = false;
    let real = null;
    if (ent.isSymbolicLink()) {
      symlink = true;
      try {
        real = realpathSync2.native(abs);
      } catch {
        real = null;
      }
      const inRoot = real != null && (real === ctx.realRoot || real.startsWith(`${ctx.realRoot}${sep2}`));
      if (inRoot) {
        let ts = null;
        try {
          ts = statSync2(abs);
        } catch {
          ts = null;
        }
        if (ts?.isDirectory()) {
          type = "dir";
          recursable = true;
        } else if (ts?.isFile()) type = "file";
        else type = "file";
      } else {
        type = "file";
      }
    } else if (ent.isDirectory()) {
      type = "dir";
      recursable = true;
    } else if (ent.isFile()) {
      type = "file";
    } else {
      continue;
    }
    ctx.count++;
    const node = { name, path: rel, type };
    if (symlink) node.symlink = true;
    if (ctx.ignored) node.ignored = ctx.ignored.has(rel);
    if (type === "file") {
      node.lang = languageFor(name);
    } else if (ctx.lazy) {
      node.hasChildren = dirHasEntries(abs);
    } else if (recursable) {
      const realDir = real ?? safeRealpath(abs);
      if (realDir && !ctx.visited.has(realDir)) {
        ctx.visited.add(realDir);
        node.children = listLevel(abs, rel, ctx);
      } else {
        node.children = [];
      }
    } else {
      node.children = [];
    }
    out.push(node);
  }
  out.sort((a, b) => {
    const ad = a.type === "dir" ? 0 : 1;
    const bd = b.type === "dir" ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return out;
}
function dirHasEntries(abs) {
  try {
    return readdirSync2(abs).length > 0;
  } catch {
    return false;
  }
}
function safeRealpath(p) {
  try {
    return realpathSync2.native(p);
  } catch {
    return null;
  }
}
function readBlob(repoRoot, relPath, { maxBlobBytes = CODE_BROWSER_DEFAULTS.maxBlobBytes, deny = null } = {}) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try {
    st = statSync2(real);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isFile()) throw new ContainmentError("not a file", 404);
  const name = basename2(rel) || basename2(real);
  const size = st.size;
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext)) return { path: rel, name, size, kind: "image" };
  const head = readHead(real, Math.min(size, 8192));
  if (head.includes(0)) return { path: rel, name, size, kind: "binary" };
  const truncated = size > maxBlobBytes;
  const content = truncated ? readHead(real, maxBlobBytes).toString("utf-8") : readFileSync3(real, "utf-8");
  return { path: rel, name, size, kind: "text", language: languageFor(name), truncated, content };
}
function extOf(name) {
  const base = String(name ?? "").toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}
function readHead(file, bytes) {
  if (bytes <= 0) return Buffer.alloc(0);
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}
var BUNDLE_ASSETS = Object.freeze({
  "code-browser.js": "text/javascript; charset=utf-8",
  "code-browser.css": "text/css; charset=utf-8"
});
var bundleCache = /* @__PURE__ */ new Map();
function serveCodeBrowserAsset({ req, res, name }) {
  const type = BUNDLE_ASSETS[name];
  if (!type) {
    res.writeHead(404).end("not found");
    return;
  }
  let hit = bundleCache.get(name);
  if (!hit) {
    let body = null;
    try {
      body = readFileSync3(new URL(`../dist/${name}`, import.meta.url));
    } catch {
      body = null;
    }
    if (body == null) {
      res.writeHead(404).end("code browser bundle not built");
      return;
    }
    hit = { body };
    bundleCache.set(name, hit);
  }
  res.writeHead(200, {
    "content-type": type,
    "content-length": hit.body.length,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(hit.body);
}
var RAW_IMAGE_MIME = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif"
});
function serveCodeBrowser({
  req,
  res,
  url,
  basePath,
  repoRoot,
  repoId = null,
  repoLabel = "",
  headBranch = null,
  config = null,
  pluginVersion = "",
  csp = "",
  renderPage = null,
  publicExposure = false
}) {
  let cfg = normalizeCodeBrowserConfig(config);
  if (!cfg.enabled) {
    res.writeHead(404).end("not found");
    return;
  }
  if (cfg.serveSecrets && publicExposure) cfg = { ...cfg, serveSecrets: false };
  const pathname = url.pathname;
  if (!pathname.startsWith(basePath)) {
    res.writeHead(404).end("not found");
    return;
  }
  const rest = pathname.slice(basePath.length);
  if (rest === "") {
    res.writeHead(301, { location: `${basePath}/` }).end();
    return;
  }
  const deny = compileDeny([
    ...denyGlobsDefault({ serveSecrets: cfg.serveSecrets }),
    ...cfg.denyGlobs
  ]);
  const branch = typeof headBranch === "function" ? safeBranch(headBranch) : headBranch ?? null;
  try {
    if (rest === "/") {
      if (!renderPage) {
        res.writeHead(404).end("not found");
        return;
      }
      const html = renderPage({
        repoId,
        repoLabel,
        headBranch: branch,
        base: basePath,
        pluginVersion
      });
      const body = Buffer.from(html, "utf-8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": body.length,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        ...csp ? { "content-security-policy": csp } : {}
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(body);
      return;
    }
    if (rest === "/tree") {
      const sub = url.searchParams.get("path") ?? "";
      const ignored = cfg.showIgnoredBadge ? gitIgnoredSet(repoRoot) : null;
      const { nodes, truncated } = walkDir(repoRoot, {
        subPath: sub,
        lazy: cfg.lazyTree,
        maxEntries: cfg.maxTreeEntries,
        deny,
        ignored
      });
      sendJson(res, req, csp, {
        id: repoId,
        headBranch: branch,
        path: sub.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
        lazy: cfg.lazyTree,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        truncated,
        nodes
      });
      return;
    }
    if (rest === "/blob") {
      const p = url.searchParams.get("path");
      if (!p) {
        res.writeHead(400).end("missing path");
        return;
      }
      const blob = readBlob(repoRoot, p, { maxBlobBytes: cfg.maxBlobBytes, deny });
      sendJson(res, req, csp, {
        ...blob,
        rawUrl: `${basePath}/raw?path=${encodeURIComponent(blob.path)}`
      });
      return;
    }
    if (rest === "/raw") {
      const p = url.searchParams.get("path");
      if (!p) {
        res.writeHead(400).end("missing path");
        return;
      }
      serveRaw({ req, res, repoRoot, relPath: p, deny, csp });
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    if (err instanceof ContainmentError) {
      res.writeHead(err.status).end(err.status === 404 ? "not found" : "forbidden");
      return;
    }
    res.writeHead(500).end("error");
  }
}
function serveRaw({ req, res, repoRoot, relPath, deny, csp }) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try {
    st = statSync2(real);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isFile()) throw new ContainmentError("not a file", 404);
  const name = basename2(rel) || basename2(real);
  const ext = extOf(name);
  let type;
  let disposition;
  if (RAW_IMAGE_MIME[ext]) {
    type = RAW_IMAGE_MIME[ext];
    disposition = "inline";
  } else if (readHead(real, Math.min(st.size, 8192)).includes(0)) {
    type = "application/octet-stream";
    disposition = `attachment; filename="${sanitizeFilename(name)}"`;
  } else {
    type = "text/plain; charset=utf-8";
    disposition = "inline";
  }
  res.writeHead(200, {
    "content-type": type,
    "content-length": st.size,
    "content-disposition": disposition,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    ...csp ? { "content-security-policy": csp } : {}
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(real).pipe(res);
}
function sanitizeFilename(name) {
  return String(name).replace(/[^\w.@-]+/g, "_");
}
function sendJson(res, req, csp, payload) {
  const body = `${JSON.stringify(payload)}
`;
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    ...csp ? { "content-security-policy": csp } : {}
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}
function safeBranch(fn) {
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
}

// lib/heal-render.mjs
import { spawn } from "node:child_process";
import { join as join3 } from "node:path";

// lib/runtime-store.mjs
import { randomBytes as randomBytes2 } from "node:crypto";
import { existsSync as existsSync3, readFileSync as readFileSync4, readdirSync as readdirSync3, rmSync as rmSync2 } from "node:fs";
import { cp, mkdir as mkdir3, readFile as readFile3, rename as rename3, rm as rm3 } from "node:fs/promises";
import { dirname as dirname4, join as join2 } from "node:path";

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
  if (existsSync3(target) && await verifyRuntimeStore(target, buildId)) {
    return { buildId, runtimeRoot: target, materialized: false };
  }
  await mkdir3(runtimeStoreDir(), { recursive: true });
  const tmp = join2(runtimeStoreDir(), `.${buildId}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`);
  await rm3(tmp, { recursive: true, force: true });
  await copyPayload(pluginRoot, tmp);
  try {
    await rename3(tmp, target);
  } catch (err) {
    await rm3(tmp, { recursive: true, force: true });
    if (existsSync3(target) && await verifyRuntimeStore(target, buildId)) {
      return { buildId, runtimeRoot: target, materialized: false };
    }
    throw err;
  }
  if (!await verifyRuntimeStore(target, buildId)) {
    throw new Error(`materialized runtime at ${target} failed verification`);
  }
  return { buildId, runtimeRoot: target, materialized: true };
}
async function copyPayload(src, dst) {
  await mkdir3(dst, { recursive: true });
  for (const d of PAYLOAD_DIRS) {
    const from = join2(src, d);
    if (existsSync3(from)) await cp(from, join2(dst, d), { recursive: true });
  }
  for (const f of PAYLOAD_FILES) {
    const from = join2(src, f);
    if (existsSync3(from)) {
      await mkdir3(dirname4(join2(dst, f)), { recursive: true });
      await cp(from, join2(dst, f));
    }
  }
}
async function verifyRuntimeStore(runtimeRoot, expectedBuildId = null) {
  try {
    for (const r of REQUIRED) if (!existsSync3(join2(runtimeRoot, r))) return false;
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
function resolveActiveRuntimeRootSync() {
  const fromPid = pidRuntimeRoot();
  if (fromPid && verifyRuntimeStoreSync(fromPid)) return fromPid;
  try {
    const act = JSON.parse(readFileSync4(activeRuntimePath(), "utf-8"));
    if (act?.runtimeRoot && verifyRuntimeStoreSync(act.runtimeRoot)) return act.runtimeRoot;
  } catch {
  }
  return null;
}
function verifyRuntimeStoreSync(runtimeRoot) {
  try {
    for (const r of REQUIRED) if (!existsSync3(join2(runtimeRoot, r))) return false;
    return true;
  } catch {
    return false;
  }
}
function pidRuntimeRoot() {
  try {
    const rec = JSON.parse(readFileSync4(hubPidPath(), "utf-8"));
    return typeof rec?.runtimeRoot === "string" && rec.runtimeRoot ? rec.runtimeRoot : null;
  } catch {
    return null;
  }
}

// lib/heal-render.mjs
var STALE_RENDER_DEFAULTS = Object.freeze({
  heal: true,
  maxConcurrent: 1,
  // simultaneous heal renders across all repos
  cooldownMs: 6e4,
  // per-repo minimum interval between heal spawns (anti-thrash)
  maxAttempts: 3
  // give up + surface `failed` after this many spawns per drift episode
});
function normalizeStaleRenderConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const posInt = (v, d) => Number.isFinite(v) && v > 0 ? Math.floor(v) : d;
  return {
    heal: c.heal !== false,
    maxConcurrent: posInt(c.maxConcurrent, STALE_RENDER_DEFAULTS.maxConcurrent),
    cooldownMs: Number.isFinite(c.cooldownMs) && c.cooldownMs >= 0 ? Math.floor(c.cooldownMs) : STALE_RENDER_DEFAULTS.cooldownMs,
    maxAttempts: posInt(c.maxAttempts, STALE_RENDER_DEFAULTS.maxAttempts)
  };
}
function staleRenderConfigFromEnv(env = process.env) {
  let raw = {};
  try {
    const text = env?.SDLC_STALE_RENDER;
    if (text) raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  return normalizeStaleRenderConfig(raw);
}
function resolveRenderEntrypoint(pluginRoot) {
  const activeRoot = resolveActiveRuntimeRootSync();
  return resolveEntrypoint(activeRoot ?? pluginRoot, "render-sunflower");
}
function defaultSpawnRender(script, args, opts) {
  return spawn(process.execPath, [script, ...args], {
    stdio: "ignore",
    windowsHide: true,
    ...opts
  });
}
function createHealController({
  pluginRoot,
  pluginVersion,
  buildId = null,
  healCfg = {},
  log = () => {
  },
  emitReload = () => {
  },
  spawnRender = defaultSpawnRender,
  env = process.env,
  now = () => Date.now()
} = {}) {
  const cfg = normalizeStaleRenderConfig(healCfg);
  const queue = [];
  const inFlight = /* @__PURE__ */ new Set();
  const lastHealAt = /* @__PURE__ */ new Map();
  const attempts = /* @__PURE__ */ new Map();
  const failed = /* @__PURE__ */ new Map();
  const markerOf = (entry) => join3(entry.viewDir, ".last-render");
  function consider(entry) {
    try {
      if (!cfg.heal) return { action: "disabled" };
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: "invalid" };
      const recorded = readRenderedIdentity(markerOf(entry));
      const renderedVersion = recorded.version;
      if (renderIdentityMatches(recorded, { runtimeVersion: pluginVersion, buildId })) {
        attempts.delete(entry.id);
        failed.delete(entry.id);
        return { action: "fresh", renderedVersion };
      }
      return enqueue(entry, renderedVersion);
    } catch (err) {
      log(`heal: consider error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function enqueue(entry, renderedVersion) {
    const id = entry.id;
    if (inFlight.has(id) || queue.some((q) => q.entry.id === id)) {
      return { action: "pending", renderedVersion };
    }
    if (now() - (lastHealAt.get(id) ?? -Infinity) < cfg.cooldownMs) {
      return { action: "cooldown", renderedVersion };
    }
    if ((attempts.get(id) ?? 0) >= cfg.maxAttempts) {
      if (!failed.has(id)) {
        log(`heal: ${id} FAILED after ${cfg.maxAttempts} attempts \u2014 still ${renderedVersion ?? "unversioned"} (want ${pluginVersion})`);
      }
      failed.set(id, { attempts: cfg.maxAttempts, renderedVersion: renderedVersion ?? null });
      return { action: "failed", renderedVersion };
    }
    queue.push({
      entry,
      renderedVersion,
      isHeal: true,
      args: ["--clean", "--view", entry.viewDir]
    });
    pump();
    return { action: "enqueued", renderedVersion };
  }
  function submit(entry, { args, label, onSettled } = {}) {
    try {
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: "invalid" };
      if (!Array.isArray(args)) return { action: "invalid" };
      if (isBusy(entry.id)) return { action: "pending" };
      queue.push({ entry, args, label, isHeal: false, onSettled });
      pump();
      return { action: "enqueued" };
    } catch (err) {
      log(`render-queue: submit error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function isBusy(id) {
    return inFlight.has(id) || queue.some((q) => q.entry.id === id);
  }
  function pump() {
    while (inFlight.size < cfg.maxConcurrent && queue.length) {
      spawnOne(queue.shift());
    }
  }
  function spawnOne({ entry, renderedVersion, args, label, isHeal, onSettled }) {
    const id = entry.id;
    const tag = isHeal ? "heal" : "render-queue";
    inFlight.add(id);
    if (isHeal) {
      lastHealAt.set(id, now());
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
    }
    const script = resolveRenderEntrypoint(pluginRoot);
    log(label ?? `heal: ${id} rendered ${renderedVersion ?? "unversioned"} \u2260 ${pluginVersion} \u2192 clean re-render (attempt ${attempts.get(id)}/${cfg.maxAttempts})`);
    let child;
    try {
      child = spawnRender(script, args, {
        cwd: entry.repoRoot,
        env
      });
    } catch (err) {
      inFlight.delete(id);
      log(`${tag}: ${id} spawn failed: ${err?.message ?? err}`);
      try {
        onSettled?.(1);
      } catch {
      }
      pump();
      return;
    }
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      inFlight.delete(id);
      if (code === 0) {
        log(`${tag}: ${id} render complete`);
        try {
          emitReload(id);
        } catch {
        }
      } else {
        log(`${tag}: ${id} render exited ${code}`);
      }
      try {
        onSettled?.(code);
      } catch {
      }
      pump();
    };
    if (child && typeof child.on === "function") {
      child.on("exit", (code) => finish(code ?? 0));
      child.on("error", (err) => {
        log(`${tag}: ${id} child error: ${err?.message ?? err}`);
        finish(1);
      });
    } else {
      finish(0);
    }
  }
  function snapshot() {
    return {
      heal: cfg.heal,
      maxConcurrent: cfg.maxConcurrent,
      inFlight: [...inFlight],
      queued: queue.map((q) => q.entry.id),
      failed: [...failed.entries()].map(([id, v]) => ({ id, ...v }))
    };
  }
  return { consider, submit, isBusy, snapshot, config: cfg };
}

export {
  runtimeIdentity,
  readRenderedIdentity,
  renderIdentityMatches,
  isPidAlive,
  readPidFile,
  writePidFile,
  removePidFile,
  pidFileStatus,
  refreshEntriesLiveness,
  REGISTRY_VERSION2 as REGISTRY_VERSION,
  sdlcHomeDir,
  hubPidPath,
  validateEntry,
  readRegistry,
  writeRegistry,
  pruneRegistry,
  upsertRegistryEntry,
  CODE_BROWSER_DEFAULTS,
  normalizeCodeBrowserConfig,
  codeBrowserConfigFromEnv,
  repoHeadBranch,
  serveCodeBrowserAsset,
  serveCodeBrowser,
  withLock,
  LockTimeoutError,
  materializeRuntime,
  writeActiveRuntime,
  STALE_RENDER_DEFAULTS,
  staleRenderConfigFromEnv,
  createHealController
};
