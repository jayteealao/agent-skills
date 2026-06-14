// lib/runtime-store.mjs
//
// The machine-wide immutable shared-runtime store — NATIVE-INTEROP-REWRITE-PLAN
// "Machine-Wide Shared Runtime Store" / Workstream C. A long-lived hub must NOT
// depend on whichever host plugin's marketplace cache happened to start it:
// uninstalling/upgrading that plugin would remove files the running hub still
// needs (render-sunflower for stale-heal, docs/browser assets, the hub
// entrypoint). So each plugin MATERIALIZES its bundled runtime into an immutable,
// buildId-keyed directory under ~/.sdlc/runtime/<buildId>/ and the hub is started
// from THERE.
//
//   ~/.sdlc/runtime/<buildId>/   immutable materialized build (dist/, assets/, …)
//   ~/.sdlc/active-runtime.json  pointer to the runtime backing the live/last hub
//
// Materialization is atomic (copy to a temp dir, then rename into place — never a
// partial overwrite of an existing build) and idempotent (an already-present,
// verified build is reused). Resolution order for "the active runtime" matches
// the plan: live hub PID record's runtimeRoot → active-runtime.json → null
// (caller falls back to its own bundled payload).

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { atomicWriteJson } from './cross-host-lock.mjs';
import { readRuntimeManifest } from './runtime-manifest.mjs';
import { sdlcHomeDir, hubPidPath } from './registry.mjs';

// The shared runtime payload copied into the store. Mirrors what a hub/renderer
// actually executes + serves: the bundled dist/ (entrypoints + chunks +
// renderers + flat lib assets), the render assets (assets/, components/), the
// served docs site, and the schemas/frontmatter the validators read via `../`.
const PAYLOAD_DIRS = ['dist', 'assets', 'components', 'schemas', join('docs', 'site')];
const PAYLOAD_FILES = ['runtime-manifest.json', join('tests', 'frontmatter.schema.json')];
// A store is "verified" only if these survived materialization (the hub can't run
// without them) and its manifest buildId matches.
const REQUIRED = ['runtime-manifest.json', 'dist', 'schemas'];

export function runtimeStoreDir() { return join(sdlcHomeDir(), 'runtime'); }
export function runtimeRootFor(buildId) { return join(runtimeStoreDir(), buildId); }
export function activeRuntimePath() { return join(sdlcHomeDir(), 'active-runtime.json'); }

/**
 * Ensure the caller's bundled runtime is materialized in the store and return
 * `{ buildId, runtimeRoot, materialized }`. Idempotent: an existing, verified
 * build is reused (materialized:false). With no buildId (a pre-build source
 * tree) the store can't be keyed, so the caller's own pluginRoot is returned.
 */
export async function materializeRuntime(pluginRoot, { manifest = readRuntimeManifest() } = {}) {
  const buildId = manifest.buildId;
  if (!buildId) {
    return { buildId: null, runtimeRoot: pluginRoot, materialized: false };
  }
  const target = runtimeRootFor(buildId);
  if (existsSync(target) && await verifyRuntimeStore(target, buildId)) {
    return { buildId, runtimeRoot: target, materialized: false };
  }

  await mkdir(runtimeStoreDir(), { recursive: true });
  const tmp = join(runtimeStoreDir(), `.${buildId}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  await rm(tmp, { recursive: true, force: true });
  await copyPayload(pluginRoot, tmp);

  try {
    // Atomic publish: rename the fully-built temp dir into its final name. We only
    // get here when `target` did not exist + verify above; if a concurrent
    // materializer beat us, the rename throws and we adopt their verified build.
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { recursive: true, force: true });
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

async function copyPayload(src, dst) {
  await mkdir(dst, { recursive: true });
  for (const d of PAYLOAD_DIRS) {
    const from = join(src, d);
    if (existsSync(from)) await cp(from, join(dst, d), { recursive: true });
  }
  for (const f of PAYLOAD_FILES) {
    const from = join(src, f);
    if (existsSync(from)) {
      await mkdir(dirname(join(dst, f)), { recursive: true });
      await cp(from, join(dst, f));
    }
  }
}

/**
 * A store dir is usable iff every REQUIRED entry is present and (when an
 * expectedBuildId is given) the stored manifest's buildId matches. Never throws.
 */
export async function verifyRuntimeStore(runtimeRoot, expectedBuildId = null) {
  try {
    for (const r of REQUIRED) if (!existsSync(join(runtimeRoot, r))) return false;
    const m = JSON.parse(await readFile(join(runtimeRoot, 'runtime-manifest.json'), 'utf-8'));
    if (expectedBuildId && m.buildId !== expectedBuildId) return false;
    return true;
  } catch { return false; }
}

export async function writeActiveRuntime({ buildId, runtimeRoot, runtimeVersion }) {
  await atomicWriteJson(activeRuntimePath(), {
    buildId, runtimeRoot, runtimeVersion, updatedAt: new Date().toISOString(),
  });
}

export async function readActiveRuntime() {
  try { return JSON.parse(await readFile(activeRuntimePath(), 'utf-8')); }
  catch { return null; }
}

/**
 * Resolve the active runtime root in the plan's order:
 *   1. the live hub PID record's runtimeRoot (the runtime the running hub uses)
 *   2. the verified active-runtime.json pointer
 *   3. null — caller falls back to its own bundled pluginRoot
 * Async (for the lifecycle). Never throws.
 */
export async function resolveActiveRuntimeRoot() {
  const fromPid = pidRuntimeRoot();
  if (fromPid && await verifyRuntimeStore(fromPid)) return fromPid;
  const act = await readActiveRuntime();
  if (act?.runtimeRoot && existsSync(act.runtimeRoot) && await verifyRuntimeStore(act.runtimeRoot)) {
    return act.runtimeRoot;
  }
  return null;
}

/**
 * Synchronous variant for the render seam (resolveRenderEntrypoint runs inside
 * the heal controller's synchronous spawnOne). Same precedence; uses a cheap
 * existence check rather than the full async verify so it never blocks a render.
 */
export function resolveActiveRuntimeRootSync() {
  const fromPid = pidRuntimeRoot();
  if (fromPid && verifyRuntimeStoreSync(fromPid)) return fromPid;
  try {
    const act = JSON.parse(readFileSync(activeRuntimePath(), 'utf-8'));
    if (act?.runtimeRoot && verifyRuntimeStoreSync(act.runtimeRoot)) return act.runtimeRoot;
  } catch { /* none */ }
  return null;
}

function verifyRuntimeStoreSync(runtimeRoot) {
  try {
    for (const r of REQUIRED) if (!existsSync(join(runtimeRoot, r))) return false;
    return true;
  } catch { return false; }
}

function pidRuntimeRoot() {
  try {
    const rec = JSON.parse(readFileSync(hubPidPath(), 'utf-8'));
    return typeof rec?.runtimeRoot === 'string' && rec.runtimeRoot ? rec.runtimeRoot : null;
  } catch { return null; }
}

/**
 * Garbage-collect materialized builds. NEVER removes (plan GC safeguards):
 *   • the active runtime (active-runtime.json)
 *   • the runtime used by the live hub PID
 *   • the caller's own bundled build
 *   • any build whose runtimeVersion matches a protected build (same version ⇒
 *     never reaped, even if its buildId differs)
 *   • any buildId in `keepBuildIds` (e.g. the previous known-good for rollback)
 * Conservative + best-effort: anything it can't classify is kept. Returns the
 * removed buildIds.
 */
export function gcRuntimes({ keepBuildIds = [] } = {}) {
  const dir = runtimeStoreDir();
  if (!existsSync(dir)) return { removed: [] };

  const keep = new Set(keepBuildIds.filter(Boolean));
  const bundled = safeManifest()?.buildId;
  if (bundled) keep.add(bundled);
  const active = safeReadJson(activeRuntimePath());
  if (active?.buildId) keep.add(active.buildId);
  const pid = safeReadJson(hubPidPath());
  if (pid?.buildId) keep.add(pid.buildId);

  // Same-runtimeVersion protection: collect the versions of the protected builds,
  // then keep any build carrying one of those versions.
  const protectedVersions = new Set(
    [active?.runtimeVersion, pid?.runtimeVersion, safeManifest()?.runtimeVersion].filter(Boolean),
  );

  const removed = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;             // in-flight temp materializations
    if (keep.has(name)) continue;
    const m = safeReadJson(join(dir, name, 'runtime-manifest.json'));
    if (m?.runtimeVersion && protectedVersions.has(m.runtimeVersion)) continue;
    try { rmSync(join(dir, name), { recursive: true, force: true }); removed.push(name); }
    catch { /* best-effort */ }
  }
  return { removed };
}

function safeReadJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return null; }
}
function safeManifest() {
  try { return readRuntimeManifest(); } catch { return null; }
}
