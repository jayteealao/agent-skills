import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  hubPidPath,
  isPidAlive,
  sdlcHomeDir
} from "./chunk-JH5USZ6A.mjs";

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

// lib/cross-host-lock.mjs
import { randomBytes } from "node:crypto";
import { hostname as osHostname } from "node:os";
import { open, readFile, rename, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
var DEFAULT_LOCK_TTL_MS = 3e4;
var DEFAULT_ACQUIRE_TIMEOUT_MS = 15e3;
var DEFAULT_RETRY_MS = 100;
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function atomicWriteJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, `${JSON.stringify(obj, null, 2)}
`, "utf-8");
  await rename(tmp, path);
}
async function readLock(lockPath) {
  try {
    const text = (await readFile(lockPath, "utf-8")).trim();
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
      await rm(lockPath, { force: true });
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
  await mkdir(dirname(lockPath), { recursive: true });
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
      await takeOverStaleLock(lockPath, { nullGraceMs, retryMs, now });
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
async function takeOverStaleLock(lockPath, { nullGraceMs, retryMs, now }) {
  const markerPath = `${lockPath}.takeover`;
  const markerGraceMs = Math.max(5e3, 20 * retryMs);
  let fh;
  try {
    fh = await open(markerPath, "wx");
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
    if (await nullLockTakeable(markerPath, markerGraceMs, now)) {
      try {
        await rm(markerPath, { force: true });
      } catch {
      }
    }
    await sleep(retryMs);
    return;
  }
  try {
    await fh.close();
    fh = null;
    const cur = await readLock(lockPath);
    const stillStale = cur ? isLockStale(cur, now()) : await nullLockTakeable(lockPath, nullGraceMs, now);
    if (stillStale) {
      try {
        await rm(lockPath, { force: true });
      } catch {
      }
    }
  } finally {
    if (fh) {
      try {
        await fh.close();
      } catch {
      }
    }
    try {
      await rm(markerPath, { force: true });
    } catch {
    }
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
import { existsSync, readFileSync as readFileSync2, readdirSync, rmSync } from "node:fs";
import { cp, mkdir as mkdir2, readFile as readFile2, rename as rename2, rm as rm2 } from "node:fs/promises";
import { dirname as dirname2, join } from "node:path";
var PAYLOAD_DIRS = ["dist", "assets", "components", "schemas", join("docs", "site")];
var PAYLOAD_FILES = ["runtime-manifest.json", join("tests", "frontmatter.schema.json")];
var REQUIRED = ["runtime-manifest.json", "dist", "schemas"];
function runtimeStoreDir() {
  return join(sdlcHomeDir(), "runtime");
}
function runtimeRootFor(buildId) {
  return join(runtimeStoreDir(), buildId);
}
function activeRuntimePath() {
  return join(sdlcHomeDir(), "active-runtime.json");
}
async function materializeRuntime(pluginRoot, { manifest = readRuntimeManifest() } = {}) {
  const buildId = manifest.buildId;
  if (!buildId) {
    return { buildId: null, runtimeRoot: pluginRoot, materialized: false };
  }
  const target = runtimeRootFor(buildId);
  if (existsSync(target) && await verifyRuntimeStore(target, buildId)) {
    return { buildId, runtimeRoot: target, materialized: false };
  }
  await mkdir2(runtimeStoreDir(), { recursive: true });
  const tmp = join(runtimeStoreDir(), `.${buildId}.${process.pid}.${randomBytes2(4).toString("hex")}.tmp`);
  await rm2(tmp, { recursive: true, force: true });
  await copyRuntimePayload(pluginRoot, tmp);
  try {
    await rename2(tmp, target);
  } catch (err) {
    await rm2(tmp, { recursive: true, force: true });
    if (existsSync(target) && await verifyRuntimeStore(target, buildId)) {
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
  await mkdir2(dst, { recursive: true });
  for (const d of PAYLOAD_DIRS) {
    const from = join(src, d);
    if (existsSync(from)) await cp(from, join(dst, d), { recursive: true });
  }
  for (const f of PAYLOAD_FILES) {
    const from = join(src, f);
    if (existsSync(from)) {
      await mkdir2(dirname2(join(dst, f)), { recursive: true });
      await cp(from, join(dst, f));
    }
  }
}
async function verifyRuntimeStore(runtimeRoot, expectedBuildId = null) {
  try {
    for (const r of REQUIRED) if (!existsSync(join(runtimeRoot, r))) return false;
    const m = JSON.parse(await readFile2(join(runtimeRoot, "runtime-manifest.json"), "utf-8"));
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
    const m = JSON.parse(readFileSync2(join(runtimeRoot, "runtime-manifest.json"), "utf-8"));
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
    const act = JSON.parse(readFileSync2(activeRuntimePath(), "utf-8"));
    if (act?.runtimeRoot && verifyRuntimeStoreSync(act.runtimeRoot)) return act.runtimeRoot;
  } catch {
  }
  return null;
}
function verifyRuntimeStoreSync(runtimeRoot) {
  try {
    for (const r of REQUIRED) if (!existsSync(join(runtimeRoot, r))) return false;
    return true;
  } catch {
    return false;
  }
}
function pidRuntimeRoot() {
  try {
    const rec = JSON.parse(readFileSync2(hubPidPath(), "utf-8"));
    return typeof rec?.runtimeRoot === "string" && rec.runtimeRoot ? rec.runtimeRoot : null;
  } catch {
    return null;
  }
}
function gcRuntimes({ keepBuildIds = [] } = {}) {
  const dir = runtimeStoreDir();
  if (!existsSync(dir)) return { removed: [] };
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
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    if (keep.has(name)) continue;
    const m = safeReadJson(join(dir, name, "runtime-manifest.json"));
    if (m?.runtimeVersion && protectedVersions.has(m.runtimeVersion)) continue;
    try {
      rmSync(join(dir, name), { recursive: true, force: true });
      removed.push(name);
    } catch {
    }
  }
  return { removed };
}
function safeReadJson(path) {
  try {
    return JSON.parse(readFileSync2(path, "utf-8"));
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
  atomicWriteJson,
  withLock,
  LockTimeoutError,
  runtimeIdentity,
  readRenderedIdentity,
  renderIdentityMatches,
  materializeRuntime,
  verifyRuntimeStore,
  writeActiveRuntime,
  readRuntimeIdentityAt,
  resolveActiveRuntimeRootSync,
  gcRuntimes
};
