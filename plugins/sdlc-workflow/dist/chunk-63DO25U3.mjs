import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  scanWorkflowIndexes
} from "./chunk-UFTZEN4P.mjs";
import {
  isPidAlive
} from "./chunk-FIVVBFWT.mjs";

// lib/registry.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
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
import { basename, dirname, join, sep } from "node:path";
var REGISTRY_VERSION = 1;
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
    return execFileSync("git", ["-C", cwd, ...args], {
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
  let branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch || branch === "HEAD") branch = basename(repoRoot);
  const gitDir = git(cwd, ["rev-parse", "--absolute-git-dir"]);
  const commonDirRaw = git(cwd, ["rev-parse", "--git-common-dir"]);
  let isWorktree = false;
  if (gitDir && commonDirRaw) {
    const commonAbs = commonDirRaw.match(/^([a-zA-Z]:[\\/]|\/)/) ? commonDirRaw : join(repoRoot, commonDirRaw);
    isWorktree = canon(gitDir) !== canon(commonAbs);
  }
  return {
    repoRoot,
    branch,
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
function computeEntryId(repoRoot, branch) {
  const fwd = String(repoRoot).replace(/\\/g, "/");
  return createHash("sha256").update(`${fwd}
${branch}`).digest("hex").slice(0, 12);
}
function resolveEntryId(repoRoot, branch, existing) {
  const base = computeEntryId(repoRoot, branch);
  const clash = existing.find(
    (e) => e.id === base && (e.repoRoot !== repoRoot || e.branch !== branch)
  );
  if (!clash) return base;
  const suffix = createHash("sha256").update(String(repoRoot)).digest("hex").slice(0, 4);
  return `${base}-${suffix}`;
}
function validateEntry(entry) {
  if (!entry || typeof entry !== "object") return { ok: false, reason: "not an object" };
  const { id, repoRoot, branch, viewDir } = entry;
  if (!id || !repoRoot || !branch || !viewDir) {
    return { ok: false, reason: "missing id/repoRoot/branch/viewDir" };
  }
  let realView;
  try {
    realView = realpathSync.native(viewDir);
  } catch {
    return { ok: false, reason: `viewDir does not resolve: ${viewDir}` };
  }
  if (basename(realView) !== "_view" || basename(dirname(realView)) !== ".ai") {
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
  if (!existsSync(marker)) return { renderedAt: null, configHash: null };
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf-8"));
    return { renderedAt: parsed.renderedAt ?? null, configHash: parsed.configHash ?? null };
  } catch {
    return { renderedAt: null, configHash: null };
  }
}
async function collectSlugMeta({ projectRoot, workflowsRoot }) {
  try {
    const workflows = await scanWorkflowIndexes({ projectRoot, workflowsRoot });
    return workflows.filter((w) => w.classification !== "invalid").map((w) => ({
      slug: w.slug,
      title: w.title ?? null,
      currentStage: w.currentStage ?? null,
      status: w.status ?? null,
      classification: w.classification,
      blocked: w.status === "blocked" || w.frontmatter?.blocked === true
    }));
  } catch {
    return [];
  }
}
async function buildEntry({ projectRoot, viewDir, configHash = null, existing = [], nowIso }) {
  const identity = gitIdentity(projectRoot);
  if (!identity) return null;
  const { repoRoot, branch, worktreeLabel } = identity;
  const resolvedViewDir = (() => {
    try {
      return realpathSync.native(viewDir);
    } catch {
      return viewDir;
    }
  })();
  const id = resolveEntryId(repoRoot, branch, existing);
  const last = readLastRender(resolvedViewDir);
  const workflowsRoot = join(repoRoot, ".ai", "workflows");
  const slugMeta = await collectSlugMeta({ projectRoot: repoRoot, workflowsRoot });
  const stamp = nowIso ?? (/* @__PURE__ */ new Date()).toISOString();
  const prior = existing.find((e) => e.id === id);
  return {
    id,
    repoRoot,
    branch,
    worktreeLabel,
    viewDir: resolvedViewDir,
    lastRenderedAt: last.renderedAt ?? stamp,
    slugs: slugMeta.map((s) => s.slug),
    slugMeta,
    configHash: configHash ?? last.configHash ?? null,
    registeredAt: prior?.registeredAt ?? stamp,
    updatedAt: stamp
  };
}
function migrateRegistry(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.entries)) {
    return { version: REGISTRY_VERSION, entries: [] };
  }
  return { version: REGISTRY_VERSION, entries: raw.entries };
}
function readRegistryFile() {
  const path = registryPath();
  if (!existsSync(path)) return { version: REGISTRY_VERSION, entries: [] };
  try {
    return migrateRegistry(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return { version: REGISTRY_VERSION, entries: [] };
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
      const entry = JSON.parse(readFileSync(join(dir, name), "utf-8"));
      if (entry && typeof entry === "object" && entry.id) out.push({ entry, file: join(dir, name) });
    } catch {
    }
  }
  return out;
}
function mergeEntries(base, overlay) {
  const byId = /* @__PURE__ */ new Map();
  for (const e of base) byId.set(e.id, e);
  for (const e of overlay) {
    const prev = byId.get(e.id);
    if (!prev || String(e.updatedAt ?? "") >= String(prev.updatedAt ?? "")) byId.set(e.id, e);
  }
  return [...byId.values()].sort(
    (a, b) => String(a.registeredAt ?? "").localeCompare(String(b.registeredAt ?? ""))
  );
}
function readRegistry({ validate = true, logInvalid = true } = {}) {
  const file = readRegistryFile();
  const shards = readShards().map((s) => s.entry);
  let entries = mergeEntries(file.entries, shards);
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
  mkdirSync(dirname(path), { recursive: true });
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
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: sorted });
}
function mergeShardsIntoRegistry() {
  const file = readRegistryFile();
  const shards = readShards();
  const merged = mergeEntries(file.entries, shards.map((s) => s.entry)).filter((e) => validateEntry(e).ok);
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: merged });
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
    const present = valid && existsSync(e.repoRoot) && existsSync(e.viewDir) && existsSync(join(e.viewDir, ".last-render"));
    if (present) {
      kept.push(e);
    } else {
      pruned++;
      logPrune(`prune ${e.id ?? "?"} (${e.repoRoot ?? "?"} @ ${e.branch ?? "?"}): ${valid ? "missing repoRoot/viewDir/.last-render" : "failed validation"}`);
    }
  }
  writeRegistryAtomic({ version: REGISTRY_VERSION, entries: kept });
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
    const text = readFileSync(hubPidPath(), "utf-8").trim();
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

export {
  sdlcHomeDir,
  hubPidPath,
  validateEntry,
  readRegistry,
  writeRegistry,
  pruneRegistry,
  upsertRegistryEntry
};
