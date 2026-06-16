// lib/hub-lifecycle.mjs
//
// Start / supervise / stop the single machine-wide hub daemon. Mirrors
// lib/serve-lifecycle.mjs, including the stale-PID recovery path. Reads
// host/port/limits from the machine-wide hub-config.json (readHubConfig) and
// mints a fresh write token into ~/.sdlc/hub.pid on each (re)start (invariant
// #6). See MULTI-REPO-REGISTRY-PLAN §4.5.

import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { spawnDetachedNode } from './detach.mjs';
import { resolveEntrypoint } from './entrypoint.mjs';
import { isPidAlive, pidFileStatus, removePidFile, writePidFile } from './pid-file.mjs';
import { hubPidPath, sdlcHomeDir } from './registry.mjs';
import { readHubConfig, hubConfigHash } from './hub-config.mjs';
import { maybeConfigureTailscale, tailscaleDnsName } from './tailscale.mjs';
import { runtimeIdentity } from './runtime-manifest.mjs';
import { withLock, LockTimeoutError, atomicWriteJson } from './cross-host-lock.mjs';
import { gcRuntimes, materializeRuntime, readRuntimeIdentityAt, verifyRuntimeStore, writeActiveRuntime } from './runtime-store.mjs';

// Shared runtime identity (NATIVE-INTEROP Workstream B): the host-NEUTRAL
// { runtimeVersion, buildId, hubName, hubProtocolVersion } both plugins carry
// identically. Adoption keys on runtimeVersion + protocol, NOT the plugin package
// version — so two native packages of the same release adopt each other's hub
// instead of reaping it (Settled Decision 24). A genuine runtimeVersion mismatch
// still reaps + respawns, which preserves single-host upgrade pickup (today
// runtimeVersion === the package version).
const RUNTIME = runtimeIdentity();

// Which host runs this supervisor — diagnostic provenance carried on the hub's
// PID record + health. Host-neutral via env so the byte-identical shared lib
// reports 'codex' when the Codex package spawns it. Defaults to 'claude'.
const STARTED_BY_HOST = process.env.SDLC_HOST || 'claude';

// Re-export so callers have one import for the hub's pid-file location (the plan
// lists hubPidPath as part of this module's API; the path itself is defined in
// registry.mjs alongside the other ~/.sdlc/ paths).
export { hubPidPath };

// The one cross-host startup/recovery lock (NATIVE-INTEROP Workstream C). Both
// host adapters funnel hub materialize/start/reap through it so two distinct host
// processes (Claude + Codex) racing SessionStart produce exactly one hub.
export function hubLockPath() { return join(sdlcHomeDir(), 'hub.lock'); }

// A SECOND lock, distinct from hub.lock, for the explicit controlled upgrade
// (NATIVE-INTEROP "Controlled Runtime Upgrade"). It serializes upgrades against
// each other and lets the slow materialize/verify phase run WITHOUT blocking
// normal SessionStart adoption of the still-live old hub; only the brief swap
// window takes hub.lock. The previous active runtime is recorded durably so a
// crash mid-swap is recoverable by the next SessionStart.
export function hubUpgradePath() { return join(sdlcHomeDir(), 'hub-upgrade.lock'); }
function upgradeRecordPath() { return join(sdlcHomeDir(), 'hub-upgrade.previous.json'); }

/**
 * Decide what to do about whatever is answering on the hub port. PURE +
 * synchronous so the adoption logic is unit-testable without spawning a hub.
 *
 * @param {object|null} id      probeHubIdentity result (null = nothing healthy answering)
 * @param {object} runtime      the active shared runtime identity (RUNTIME)
 * @param {object} status       pidFileStatus result ({ record, alive })
 * @returns {{action:'adopt'|'protocol-incompatible'|'reap'|'recover'|'start', reason?:string}}
 */
export function decideHubAction(id, runtime, status) {
  if (!id) {
    // Nothing answering: recover a stale pid file, else a clean cold start.
    return status?.record ? { action: 'recover' } : { action: 'start' };
  }
  const tracked = Boolean(status?.alive && status.record?.pid === id.pid);
  if (!id.isHub) return { action: 'reap', reason: 'non-hub process on hub port' };

  const protocolOk = id.hubProtocolVersion === runtime.hubProtocolVersion;
  const sameRuntime = id.runtimeVersion === runtime.runtimeVersion;
  // Adoption-first (Settled Decision 24): a healthy, protocol-compatible,
  // same-runtimeVersion hub is adopted no matter who started it — never reaped. A
  // differing buildId under the same runtimeVersion is adopted too (drift is
  // visible in health; replacing it is an explicit upgrade) since the reap keys
  // on runtimeVersion, not buildId.
  if (protocolOk && sameRuntime && tracked) return { action: 'adopt' };
  // A healthy hub on an INCOMPATIBLE protocol is never silently replaced at
  // SessionStart — surface a diagnostic and leave it (explicit upgrade only).
  if (!protocolOk) return { action: 'protocol-incompatible' };
  // Reap: a genuine runtime upgrade/downgrade (cross-host packages of one release
  // share a runtimeVersion and never hit this), or a same-runtime hub whose PID
  // record was lost/mismatched (recovery to restore the write token).
  return {
    action: 'reap',
    reason: !sameRuntime
      ? `runtime v${id.runtimeVersion || '?'} → v${runtime.runtimeVersion}`
      : 'untracked hub (orphaned pid file)',
  };
}

/**
 * Ensure the hub is running, adopting / starting / recovering it from the
 * machine-wide runtime store. Adoption-first: a healthy compatible hub is adopted
 * on a LOCK-FREE fast path (zero contention cost). Only start/reap/recover enter
 * the cross-host critical section, where a double-checked re-probe means a hub
 * another host started while we waited is adopted rather than reaped — so
 * simultaneous Claude+Codex activation yields exactly one hub.
 */
export async function ensureHubLifecycle({ pluginRoot, log = () => {} } = {}) {
  const cfg = readHubConfig();   // reads/creates ~/.sdlc/hub-config.json
  const host = cfg.host ?? '127.0.0.1';
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();

  if (host === '0.0.0.0' && !(cfg.tailscale?.enabled === true && cfg.tailscale?.acknowledgedPublic === true)) {
    log('[hub] refused host 0.0.0.0 without tailscale.enabled + acknowledgedPublic');
    return { action: 'refused-host' };
  }

  // FAST PATH (lock-free): adopt a healthy compatible hub without paying any lock
  // cost — the overwhelmingly common case once a hub is up.
  {
    const status = await pidFileStatus(pidPath);
    const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
    const decision = decideHubAction(id, RUNTIME, status);
    if (decision.action === 'adopt') {
      log(`[hub] adopted ${id.startedByHost ? `${id.startedByHost}-started ` : ''}hub at http://${displayHost(host)}:${port} (runtime ${RUNTIME.runtimeVersion})`);
      maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
      return { action: 'already-running', pid: id.pid, adopted: true };
    }
    if (decision.action === 'protocol-incompatible') {
      log(`[hub] protocol-incompatible hub running (proto ${id.hubProtocolVersion ?? '?'} vs ${RUNTIME.hubProtocolVersion}); leaving it — explicit upgrade required`);
      return { action: 'protocol-incompatible', pid: id.pid, hubProtocolVersion: id.hubProtocolVersion ?? null };
    }
    // start / reap / recover → enter the cross-host critical section below.
  }

  // CRITICAL SECTION (cross-host startup/recovery lock). Bounded; on a timeout we
  // re-probe and adopt if another host won the race, else report.
  try {
    return await withLock(hubLockPath(), { ownerHost: STARTED_BY_HOST, ttlMs: 30000, timeoutMs: 15000, log }, async () => {
      // Double-checked: a peer host may have started/healed the hub while we
      // waited for the lock — adopt it rather than reap-and-respawn.
      const status = await pidFileStatus(pidPath);
      const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
      const decision = decideHubAction(id, RUNTIME, status);

      if (decision.action === 'adopt') {
        log(`[hub] adopted ${id.startedByHost ? `${id.startedByHost}-started ` : ''}hub after lock wait (runtime ${RUNTIME.runtimeVersion})`);
        maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
        return { action: 'already-running', pid: id.pid, adopted: true };
      }
      if (decision.action === 'protocol-incompatible') {
        log(`[hub] protocol-incompatible hub running (proto ${id.hubProtocolVersion ?? '?'} vs ${RUNTIME.hubProtocolVersion}); leaving it — explicit upgrade required`);
        return { action: 'protocol-incompatible', pid: id.pid, hubProtocolVersion: id.hubProtocolVersion ?? null };
      }

      if (decision.action === 'reap') {
        if (id?.pid) stopPid(id.pid, log);
        await removePidFile(pidPath);
        await waitForGone({ host, port, timeoutMs: 2000 });   // free the port before respawn
        log(`[hub] reaped ${decision.reason} (pid ${id?.pid ?? '?'})`);
      } else if (decision.action === 'recover') {
        await removePidFile(pidPath);
        log(`[hub] removed stale pid file for pid ${status.record?.pid}`);
      }

      return startHubFromStore({ cfg, host, port, pidPath, pluginRoot, log });
    });
  } catch (err) {
    if (err instanceof LockTimeoutError) {
      // Another host held the startup lock the whole time — it is presumably
      // bringing the hub up. Re-probe once: adopt if it is now healthy, else report.
      log(`[hub] ${err.message}; re-probing for a peer-started hub`);
      const status = await pidFileStatus(pidPath);
      const id = await probeHubIdentity({ host, port, timeoutMs: 700 });
      if (decideHubAction(id, RUNTIME, status).action === 'adopt') {
        maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
        return { action: 'already-running', pid: id.pid, adopted: true };
      }
      return { action: 'lock-timeout' };
    }
    throw err;
  }
}

/**
 * Materialize the bundled runtime into ~/.sdlc/runtime/<buildId> and spawn the
 * hub FROM the machine store (not the plugin cache) so the running hub survives
 * the starter plugin being uninstalled. Records the active runtime and stamps
 * runtimeRoot onto the PID record. Falls back to the plugin cache if
 * materialization fails — a degraded but working hub beats no hub. Caller holds
 * the cross-host lock.
 */
async function startHubFromStore({ cfg, host, port, pidPath, pluginRoot, log }) {
  let runtimeRoot = pluginRoot;
  let identity = RUNTIME;
  try {
    const mat = await materializeRuntime(pluginRoot);
    runtimeRoot = mat.runtimeRoot;
    if (mat.materialized) log(`[hub] materialized runtime ${mat.buildId ? mat.buildId.slice(0, 12) : '?'} into the machine store`);
    await writeActiveRuntime({ buildId: mat.buildId, runtimeRoot, runtimeVersion: RUNTIME.runtimeVersion });
    identity = { ...RUNTIME, buildId: mat.buildId ?? RUNTIME.buildId };
  } catch (err) {
    log(`[hub] runtime materialization failed (${err?.message ?? err}); starting from plugin cache`);
    runtimeRoot = pluginRoot;
    identity = RUNTIME;
  }

  return startHubFromRuntimeRoot({ runtimeRoot, identity, cfg, host, port, pidPath, log });
}

/**
 * Spawn the hub from a SPECIFIC materialized runtime root with a SPECIFIC shared
 * identity (so the controlled upgrade can start either the requested new runtime
 * or the previous one on rollback — neither of which is necessarily this lib's
 * bundled RUNTIME). Pre-writes hub.pid with the given identity, waits for health.
 * Caller holds hub.lock. Returns { action: 'started' | 'started-unconfirmed', pid }.
 */
async function startHubFromRuntimeRoot({ runtimeRoot, identity, cfg, host, port, pidPath, log }) {
  const buildId = identity.buildId;
  const token = randomBytes(24).toString('hex');
  const cfgHash = hubConfigHash(cfg);
  const script = resolveEntrypoint(runtimeRoot, 'hub-serve');
  const childArgs = [
    '--host', host,
    '--port', String(port),
    '--pid-file', pidPath,
    '--config-hash', cfgHash,
    '--max-sse-clients', String(cfg.maxSseClients ?? 200),
    '--max-watched-repos', String(cfg.maxWatchedRepos ?? 50),
  ];
  if (host === '0.0.0.0' && cfg.tailscale?.enabled === true) childArgs.push('--allow-all-hosts');
  // Durable tailnet reachability: `tailscale serve` proxies requests in with the
  // MagicDNS Host, which the localhost-only allowlist would 403. Discover this
  // node's tailnet name at start and allowlist JUST it — so every supervisor
  // (re)start keeps the tailnet URL reachable WITHOUT disabling the Host check.
  if (host !== '0.0.0.0' && cfg.tailscale?.enabled === true) {
    const dns = tailscaleDnsName({ log });
    if (dns) { childArgs.push('--allowed-hosts', dns); log(`[hub] allowlisting tailnet host ${dns}`); }
  }
  const child = spawnDetachedNode(script, childArgs, {
    cwd: sdlcHomeDir(),
    // Token via env (not argv) so it isn't visible in process listings; the
    // codeBrowser block rides env too because JSON cannot survive the Windows
    // launch-hidden.vbs argv rebuild. configHash covers it, so editing the
    // block in hub-config.json still restarts the hub.
    env: {
      ...process.env,
      SDLC_HUB_TOKEN: token,
      // Diagnostic provenance: the host that started this hub, surfaced in
      // health.startedBy + the PID record. Never controls adoption.
      SDLC_HUB_STARTED_BY: STARTED_BY_HOST,
      SDLC_CODE_BROWSER: JSON.stringify(cfg.codeBrowser ?? {}),
      // Stale-render heal config (STALE-RENDER-HEAL-PLAN §3). Via env for the
      // same reason as codeBrowser; configHash covers it so editing the block in
      // hub-config.json restarts the hub. heal defaults ON.
      SDLC_STALE_RENDER: JSON.stringify(cfg.staleRender ?? {}),
    },
  });

  // Pre-write hub.pid WITH the token to close the spawn→bind race: a render that
  // fires in that window reads the token from here to authenticate its POST. The
  // hub re-writes hub.pid (same token + identity) once it binds. Carry the shared
  // runtime identity + the runtimeRoot now so a concurrent adopter / the render
  // seam see them before the hub rebinds.
  if (child.pid) {
    await writePidFile(pidPath, {
      pid: child.pid, host, port, token, configHash: cfgHash,
      hubName: identity.hubName,
      hubProtocolVersion: identity.hubProtocolVersion,
      runtimeVersion: identity.runtimeVersion,
      buildId,
      runtimeRoot,
      startedByHost: STARTED_BY_HOST,
    });
  }

  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[hub] started pid ${child.pid}, health check not ready yet`);
    return { action: 'started-unconfirmed', pid: child.pid };
  }
  log(`[hub] started pid ${child.pid} at http://${displayHost(host)}:${port} (runtime ${identity.runtimeVersion}${buildId ? ` ${buildId.slice(0, 12)}` : ''})`);
  maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
  return { action: 'started', pid: child.pid };
}

export async function stopHub({ log = () => {} } = {}) {
  const pidPath = hubPidPath();
  const status = await pidFileStatus(pidPath);
  if (status.alive) stopPid(status.record.pid, log);
  if (status.record) await removePidFile(pidPath);
  return { stopped: Boolean(status.alive) };
}

/* ─────────────────── controlled runtime upgrade (NATIVE-INTEROP §"Controlled
 *                     Runtime Upgrade" / Workstream C) ─────────────────────────
 *
 * SessionStart stays adoption-first; runtime REPLACEMENT is explicit and atomic.
 * This is the deliberate "swap the live hub to a different runtime build" path,
 * distinct from the SessionStart reap that fires on a runtimeVersion change. It
 * never downgrades implicitly, and it rolls the live hub back to its previous
 * runtime if the new one fails to come up healthy — so the machine is never left
 * without a working hub. */

/**
 * PURE decision: given the requested runtime, the currently-active one, and the
 * downgrade flags, should we proceed? Unit-testable without a live hub.
 * @returns {'already-current'|'downgrade-refused'|'proceed'}
 */
export function upgradeDecision({ requested, prev, aliveSameBuild, allowDowngrade, confirm }) {
  if (aliveSameBuild) return 'already-current';
  if (prev?.runtimeVersion && requested?.runtimeVersion &&
      compareVersions(requested.runtimeVersion, prev.runtimeVersion) < 0 &&
      !(allowDowngrade && confirm)) {
    return 'downgrade-refused';
  }
  return 'proceed';
}

/**
 * Controlled upgrade/restart with rollback. `pluginRoot` carries the runtime to
 * upgrade TO (its runtime-manifest.json names the target build). Steps:
 *   1. resolve requested + previous (live) runtime identities; guard downgrades
 *   2. under hub-upgrade.lock, materialize + verify the requested runtime (old hub
 *      still serving + adoptable during this slow phase)
 *   3. under hub.lock (the brief swap window — blocks SessionStart from racing a
 *      competing start): record previous → stop old → free port → start requested
 *      → confirm health + registry + correct build
 *   4. success → clear record, GC keeping the previous for the next rollback;
 *      failure → roll back to the previous runtime and restart it
 *
 * @returns {{action:'upgraded'|'already-current'|'rolled-back'|'downgrade-refused'
 *   |'upgrade-aborted'|'upgrade-failed-unrecovered', ...}}
 */
export async function controlledUpgrade({ pluginRoot, allowDowngrade = false, confirm = false, log = () => {} } = {}) {
  const cfg = readHubConfig();
  const host = cfg.host ?? '127.0.0.1';
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();

  const requested = readRuntimeIdentityAt(pluginRoot) ?? RUNTIME;
  if (!requested.buildId) {
    return { action: 'upgrade-aborted', reason: 'requested runtime has no buildId (unbuilt source tree?)' };
  }

  // The currently-active runtime = the live hub's PID record (the rollback target).
  const status = await pidFileStatus(pidPath);
  const rec = status.record;
  const prev = rec?.runtimeRoot ? {
    runtimeVersion: rec.runtimeVersion ?? null,
    buildId: rec.buildId ?? null,
    hubName: rec.hubName ?? RUNTIME.hubName,
    hubProtocolVersion: rec.hubProtocolVersion ?? RUNTIME.hubProtocolVersion,
    runtimeRoot: rec.runtimeRoot,
  } : null;

  const decision = upgradeDecision({
    requested, prev,
    aliveSameBuild: Boolean(status.alive && prev && prev.buildId === requested.buildId),
    allowDowngrade, confirm,
  });
  if (decision === 'already-current') return { action: 'already-current', buildId: requested.buildId };
  if (decision === 'downgrade-refused') {
    return {
      action: 'downgrade-refused', from: prev?.runtimeVersion ?? null, to: requested.runtimeVersion,
      reason: 'requested runtime is older than the active one; pass allowDowngrade + confirm to force',
    };
  }

  try {
    return await withLock(hubUpgradePath(), { ownerHost: STARTED_BY_HOST, ttlMs: 120000, timeoutMs: 20000, log }, async () => {
      // Phase 1 — slow, old hub untouched: materialize + verify the requested build.
      let newRoot;
      try {
        const mat = await materializeRuntime(pluginRoot, { manifest: { buildId: requested.buildId } });
        newRoot = mat.runtimeRoot;
      } catch (err) {
        return { action: 'upgrade-aborted', reason: `materialization failed: ${err?.message ?? err}` };
      }
      if (!await verifyRuntimeStore(newRoot, requested.buildId)) {
        return { action: 'upgrade-aborted', reason: 'requested runtime failed verification after materialization' };
      }

      // Phase 2 — the swap, under hub.lock so a concurrent SessionStart blocks then
      // re-probes + adopts the new hub instead of starting a competitor.
      return await withLock(hubLockPath(), { ownerHost: STARTED_BY_HOST, ttlMs: 30000, timeoutMs: 15000, log }, async () => {
        // Durable rollback record FIRST (survives a crash mid-swap).
        if (prev) await atomicWriteJson(upgradeRecordPath(), { ...prev, host, port, at: new Date().toISOString() });

        if (status.alive && rec?.pid) stopPid(rec.pid, log);
        await removePidFile(pidPath);
        await waitForGone({ host, port, timeoutMs: 3000 });

        await writeActiveRuntime({ buildId: requested.buildId, runtimeRoot: newRoot, runtimeVersion: requested.runtimeVersion });
        const started = await startHubFromRuntimeRoot({ runtimeRoot: newRoot, identity: requested, cfg, host, port, pidPath, log });
        const ok = started.action === 'started' && await confirmHub({ host, port, expectBuildId: requested.buildId });

        if (!ok) {
          log(`[hub] upgrade to ${requested.runtimeVersion} (${requested.buildId.slice(0, 12)}) failed confirmation — rolling back`);
          const recovered = prev ? await rollback({ prev, cfg, host, port, pidPath, log }) : false;
          clearUpgradeRecord();
          if (recovered) return { action: 'rolled-back', from: requested.runtimeVersion, to: prev.runtimeVersion };
          return {
            action: prev ? 'upgrade-failed-unrecovered' : 'upgrade-aborted',
            reason: prev ? 'new runtime failed AND rollback failed — run SessionStart recovery' : 'requested runtime failed to start; no prior hub to roll back to',
            to: requested.runtimeVersion,
          };
        }

        clearUpgradeRecord();
        if (prev?.buildId && prev.buildId !== requested.buildId) {
          // Keep the previous build for the next rollback window; GC reaps older ones.
          try { gcRuntimes({ keepBuildIds: [prev.buildId, requested.buildId] }); } catch { /* best-effort */ }
        }
        log(`[hub] upgraded ${prev?.runtimeVersion ?? '(none)'} → ${requested.runtimeVersion} (${requested.buildId.slice(0, 12)}), pid ${started.pid}`);
        return { action: 'upgraded', from: prev?.runtimeVersion ?? null, to: requested.runtimeVersion, buildId: requested.buildId, pid: started.pid };
      });
    });
  } catch (err) {
    if (err instanceof LockTimeoutError) return { action: 'upgrade-aborted', reason: err.message };
    throw err;
  }
}

/** Confirm a hub is up, serving its registry (isHub), and running the expected build. */
async function confirmHub({ host, port, expectBuildId }) {
  const id = await probeHubIdentity({ host, port, timeoutMs: 3000 });
  return Boolean(id && id.isHub && (!expectBuildId || id.buildId === expectBuildId));
}

/** Roll the live hub back to the previous runtime. Returns true iff it comes up healthy. */
async function rollback({ prev, cfg, host, port, pidPath, log }) {
  if (!prev?.runtimeRoot) return false;
  const st = await pidFileStatus(pidPath);
  if (st.alive && st.record?.pid) stopPid(st.record.pid, log);
  await removePidFile(pidPath);
  await waitForGone({ host, port, timeoutMs: 3000 });
  if (!await verifyRuntimeStore(prev.runtimeRoot, prev.buildId)) {
    log('[hub] rollback target runtime is missing/corrupt in the store');
    return false;
  }
  await writeActiveRuntime({ buildId: prev.buildId, runtimeRoot: prev.runtimeRoot, runtimeVersion: prev.runtimeVersion });
  const started = await startHubFromRuntimeRoot({ runtimeRoot: prev.runtimeRoot, identity: prev, cfg, host, port, pidPath, log });
  return started.action === 'started' && await confirmHub({ host, port, expectBuildId: prev.buildId });
}

function clearUpgradeRecord() {
  try { rmSync(upgradeRecordPath(), { force: true }); } catch { /* best-effort */ }
}

/** Numeric major.minor.patch compare: <0 if a<b, >0 if a>b, 0 if equal. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/* ───────────────────────── helpers (mirror serve-lifecycle) ───────────────────────── */

function stopPid(pid, log) {
  if (!isPidAlive(pid)) return;
  try { process.kill(pid, 'SIGTERM'); }
  catch (err) { log(`[hub] could not stop pid ${pid}: ${err.message}`); }
}

function waitForHealth({ host, port, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      probeHealth({ host, port, timeoutMs: 250 }).then((ok) => {
        if (ok) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}

function probeHealth({ host, port, timeoutMs }) {
  const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: '/__sdlc/health',
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Like probeHealth but parses the body for shared-runtime identity:
// { pid, isHub, runtimeVersion, hubProtocolVersion, buildId, hubName,
// startedByHost }. `isHub` (presence of the entries[] array) distinguishes the
// hub from a per-repo daemon that grabbed the port. Reads the structured `hub`
// block (9.75+) and falls back to the legacy top-level `version` field so a
// pre-9.75 hub still parses (runtimeVersion = version, protocol = 1, buildId =
// null). Returns null when nothing healthy answers or the body can't be parsed.
function probeHubIdentity({ host, port, timeoutMs }) {
  const probeHost = host === '0.0.0.0' ? '127.0.0.1' : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: '/__sdlc/health',
      method: 'GET',
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let buf = '';
      res.setEncoding('utf-8');
      res.on('data', (c) => { if (buf.length < 65536) buf += c; });
      res.on('end', () => {
        try {
          const body = JSON.parse(buf);
          const hub = body.hub && typeof body.hub === 'object' ? body.hub : null;
          resolve({
            pid: Number.isInteger(body.pid) ? body.pid : null,
            isHub: Array.isArray(body.entries),
            runtimeVersion: hub && typeof hub.runtimeVersion === 'string' ? hub.runtimeVersion
              : (typeof body.version === 'string' ? body.version : ''),
            hubProtocolVersion: hub && Number.isInteger(hub.protocolVersion) ? hub.protocolVersion : 1,
            buildId: hub && typeof hub.buildId === 'string' ? hub.buildId : null,
            hubName: hub && typeof hub.name === 'string' ? hub.name : RUNTIME.hubName,
            startedByHost: body.startedBy && typeof body.startedBy.host === 'string' ? body.startedBy.host : null,
          });
        } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

// Poll until nothing answers on the port (a reaped process released it) or the
// timeout elapses — so the respawn doesn't race the dying process for the port.
function waitForGone({ host, port, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      probeHealth({ host, port, timeoutMs: 200 }).then((up) => {
        if (!up) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}

function displayHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
