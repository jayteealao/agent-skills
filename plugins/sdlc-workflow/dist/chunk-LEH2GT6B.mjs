import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  hubConfigHash,
  readHubConfig
} from "./chunk-VXRDWVSQ.mjs";
import {
  logLifecycle
} from "./chunk-RYUCL5SR.mjs";
import {
  LockTimeoutError,
  atomicWriteJson,
  gcRuntimes,
  materializeRuntime,
  readRuntimeIdentityAt,
  verifyRuntimeStore,
  withLock,
  writeActiveRuntime
} from "./chunk-KZAGDADS.mjs";
import {
  runtimeIdentity
} from "./chunk-EQC6XDOG.mjs";
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";
import {
  hubPidPath,
  isPidAlive,
  pidFileStatus,
  removePidFile,
  sdlcHomeDir,
  writePidFile
} from "./chunk-BIK57RP4.mjs";

// lib/hub-lifecycle.mjs
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";

// lib/tailscale.mjs
import { spawnSync } from "node:child_process";
function maybeConfigureTailscale({ tailscale = {}, port, log = () => {
} } = {}) {
  if (tailscale.enabled !== true) return;
  const target = `http://127.0.0.1:${port}`;
  const mode = tailscale.mode === "funnel" ? "funnel" : "serve";
  if (mode === "funnel" && tailscale.acknowledgedPublic !== true) {
    log("[tailscale] refused funnel without acknowledgedPublic:true");
    return;
  }
  const args = [mode, "--bg"];
  if (mode === "serve") {
    if (tailscale.https === false) args.push("--http=80");
    const path = tailscale.path || "/";
    if (path !== "/") args.push(`--set-path=${path}`);
  }
  args.push(target);
  const result = spawnSync("tailscale", args, {
    encoding: "utf-8",
    windowsHide: true,
    timeout: 1e4
  });
  if (result.error) {
    log(`[tailscale] ${mode} unavailable: ${result.error.message}`);
  } else if (result.status !== 0) {
    log(`[tailscale] ${mode} failed: ${(result.stderr || result.stdout || "").trim()}`);
  } else {
    log(`[tailscale] ${mode} configured for ${target}`);
  }
}
function tailscaleDnsName({ log = () => {
} } = {}) {
  try {
    const result = spawnSync("tailscale", ["status", "--json"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 1e4
    });
    if (result.status !== 0 || !result.stdout) {
      log(`[tailscale] could not read status for DNS name: ${(result.stderr || "").trim()}`);
      return null;
    }
    const dns = JSON.parse(result.stdout)?.Self?.DNSName;
    if (!dns) return null;
    return String(dns).replace(/\.$/, "").toLowerCase() || null;
  } catch (err) {
    log(`[tailscale] DNS name lookup failed: ${err.message}`);
    return null;
  }
}

// lib/hub-lifecycle.mjs
var RUNTIME = runtimeIdentity();
var STARTED_BY_HOST = process.env.SDLC_HOST || "claude";
function hubLockPath() {
  return join(sdlcHomeDir(), "hub.lock");
}
function hubUpgradePath() {
  return join(sdlcHomeDir(), "hub-upgrade.lock");
}
function upgradeRecordPath() {
  return join(sdlcHomeDir(), "hub-upgrade.previous.json");
}
function decideHubAction(id, runtime, status) {
  if (!id) {
    return status?.record ? { action: "recover" } : { action: "start" };
  }
  const tracked = Boolean(status?.alive && status.record?.pid === id.pid);
  if (!id.isHub) return { action: "reap", reason: "non-hub process on hub port" };
  const protocolOk = id.hubProtocolVersion === runtime.hubProtocolVersion;
  const sameRuntime = id.runtimeVersion === runtime.runtimeVersion;
  if (protocolOk && sameRuntime && tracked) return { action: "adopt" };
  if (protocolOk && tracked && typeof id.runtimeVersion === "string" && compareVersions(id.runtimeVersion, runtime.runtimeVersion) > 0) {
    return { action: "adopt", reason: `newer hub (runtime v${id.runtimeVersion} > v${runtime.runtimeVersion})` };
  }
  if (!protocolOk) return { action: "protocol-incompatible" };
  return {
    action: "reap",
    reason: !sameRuntime ? `runtime v${id.runtimeVersion || "?"} \u2192 v${runtime.runtimeVersion}` : "untracked hub (orphaned pid file)"
  };
}
function lifecycle(event, extra = {}) {
  try {
    logLifecycle({ event, host: STARTED_BY_HOST, version: RUNTIME.runtimeVersion, buildId: RUNTIME.buildId, ...extra });
  } catch {
  }
}
async function ensureHubLifecycle({ pluginRoot, log = () => {
} } = {}) {
  const cfg = readHubConfig();
  const host = cfg.host ?? "127.0.0.1";
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();
  if (host === "0.0.0.0" && !(cfg.tailscale?.enabled === true && cfg.tailscale?.acknowledgedPublic === true)) {
    log("[hub] refused host 0.0.0.0 without tailscale.enabled + acknowledgedPublic");
    lifecycle("refused-host", { reason: "0.0.0.0 without tailscale.enabled + acknowledgedPublic" });
    return { action: "refused-host" };
  }
  {
    const status = await pidFileStatus(pidPath);
    const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
    const decision = decideHubAction(id, RUNTIME, status);
    if (decision.action === "adopt") {
      log(`[hub] adopted ${id.startedByHost ? `${id.startedByHost}-started ` : ""}hub at http://${displayHost(host)}:${port} (runtime ${RUNTIME.runtimeVersion}${decision.reason ? `; ${decision.reason}` : ""})`);
      lifecycle("adopt", { pid: id.pid, reason: decision.reason ?? null, peerVersion: id.runtimeVersion ?? null, peerBuildId: id.buildId ?? null, peerHost: id.startedByHost ?? null });
      maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
      return { action: "already-running", pid: id.pid, adopted: true };
    }
    if (decision.action === "protocol-incompatible") {
      log(`[hub] protocol-incompatible hub running (proto ${id.hubProtocolVersion ?? "?"} vs ${RUNTIME.hubProtocolVersion}); leaving it \u2014 explicit upgrade required`);
      lifecycle("protocol-incompatible", { pid: id.pid, reason: `proto ${id.hubProtocolVersion ?? "?"} vs ${RUNTIME.hubProtocolVersion}` });
      return { action: "protocol-incompatible", pid: id.pid, hubProtocolVersion: id.hubProtocolVersion ?? null };
    }
  }
  try {
    return await withLock(hubLockPath(), { ownerHost: STARTED_BY_HOST, ttlMs: 3e4, timeoutMs: 15e3, log }, async () => {
      const status = await pidFileStatus(pidPath);
      const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
      const decision = decideHubAction(id, RUNTIME, status);
      if (decision.action === "adopt") {
        log(`[hub] adopted ${id.startedByHost ? `${id.startedByHost}-started ` : ""}hub after lock wait (runtime ${RUNTIME.runtimeVersion}${decision.reason ? `; ${decision.reason}` : ""})`);
        lifecycle("adopt", { pid: id.pid, reason: `after lock wait${decision.reason ? `; ${decision.reason}` : ""}`, peerVersion: id.runtimeVersion ?? null, peerBuildId: id.buildId ?? null, peerHost: id.startedByHost ?? null });
        maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
        return { action: "already-running", pid: id.pid, adopted: true };
      }
      if (decision.action === "protocol-incompatible") {
        log(`[hub] protocol-incompatible hub running (proto ${id.hubProtocolVersion ?? "?"} vs ${RUNTIME.hubProtocolVersion}); leaving it \u2014 explicit upgrade required`);
        lifecycle("protocol-incompatible", { pid: id.pid, reason: `proto ${id.hubProtocolVersion ?? "?"} vs ${RUNTIME.hubProtocolVersion}` });
        return { action: "protocol-incompatible", pid: id.pid, hubProtocolVersion: id.hubProtocolVersion ?? null };
      }
      let startReason = "fresh";
      if (decision.action === "reap") {
        if (id?.pid) stopPid(id.pid, log);
        await removePidFile(pidPath);
        await waitForGone({ host, port, timeoutMs: 2e3 });
        log(`[hub] reaped ${decision.reason} (pid ${id?.pid ?? "?"})`);
        lifecycle("reap", { pid: id?.pid ?? null, reason: decision.reason ?? null, peerVersion: id?.runtimeVersion ?? null, peerBuildId: id?.buildId ?? null });
        startReason = `reap: ${decision.reason ?? "unknown"}`;
      } else if (decision.action === "recover") {
        await removePidFile(pidPath);
        log(`[hub] removed stale pid file for pid ${status.record?.pid}`);
        lifecycle("recover", { pid: status.record?.pid ?? null, reason: "stale pid file" });
        startReason = "recover: stale pid file";
      }
      return startHubFromStore({ cfg, host, port, pidPath, pluginRoot, log, startReason });
    });
  } catch (err) {
    if (err instanceof LockTimeoutError) {
      log(`[hub] ${err.message}; re-probing for a peer-started hub`);
      lifecycle("lock-timeout", { reason: err.message });
      const status = await pidFileStatus(pidPath);
      const id = await probeHubIdentity({ host, port, timeoutMs: 700 });
      if (decideHubAction(id, RUNTIME, status).action === "adopt") {
        maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
        return { action: "already-running", pid: id.pid, adopted: true };
      }
      return { action: "lock-timeout" };
    }
    throw err;
  }
}
async function startHubFromStore({ cfg, host, port, pidPath, pluginRoot, log, startReason = "fresh" }) {
  let runtimeRoot = pluginRoot;
  let identity = RUNTIME;
  try {
    const mat = await materializeRuntime(pluginRoot);
    runtimeRoot = mat.runtimeRoot;
    if (mat.materialized) log(`[hub] materialized runtime ${mat.buildId ? mat.buildId.slice(0, 12) : "?"} into the machine store`);
    await writeActiveRuntime({ buildId: mat.buildId, runtimeRoot, runtimeVersion: RUNTIME.runtimeVersion });
    identity = { ...RUNTIME, buildId: mat.buildId ?? RUNTIME.buildId };
  } catch (err) {
    log(`[hub] runtime materialization failed (${err?.message ?? err}); starting from plugin cache`);
    runtimeRoot = pluginRoot;
    identity = RUNTIME;
  }
  return startHubFromRuntimeRoot({ runtimeRoot, identity, cfg, host, port, pidPath, log, startReason });
}
async function startHubFromRuntimeRoot({ runtimeRoot, identity, cfg, host, port, pidPath, log, startReason = "upgrade" }) {
  const buildId = identity.buildId;
  const token = randomBytes(24).toString("hex");
  const cfgHash = hubConfigHash(cfg);
  const script = resolveEntrypoint(runtimeRoot, "hub-serve");
  const childArgs = [
    "--host",
    host,
    "--port",
    String(port),
    "--pid-file",
    pidPath,
    "--config-hash",
    cfgHash,
    "--max-sse-clients",
    String(cfg.maxSseClients ?? 200),
    "--max-watched-repos",
    String(cfg.maxWatchedRepos ?? 50)
  ];
  if (host === "0.0.0.0" && cfg.tailscale?.enabled === true) childArgs.push("--allow-all-hosts");
  if (host !== "0.0.0.0" && cfg.tailscale?.enabled === true) {
    const dns = tailscaleDnsName({ log });
    if (dns) {
      childArgs.push("--allowed-hosts", dns);
      log(`[hub] allowlisting tailnet host ${dns}`);
    }
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
      // Why this hub starts (fresh, reap: …, recover: …, upgrade); the hub
      // records it in ~/.sdlc/hub-history.jsonl (W11.2).
      SDLC_HUB_START_REASON: startReason,
      SDLC_CODE_BROWSER: JSON.stringify(cfg.codeBrowser ?? {}),
      // Stale-render heal config (STALE-RENDER-HEAL-PLAN §3). Via env for the
      // same reason as codeBrowser; configHash covers it so editing the block in
      // hub-config.json restarts the hub. heal defaults ON.
      SDLC_STALE_RENDER: JSON.stringify(cfg.staleRender ?? {})
    }
  });
  if (child.pid) {
    await writePidFile(pidPath, {
      pid: child.pid,
      host,
      port,
      token,
      configHash: cfgHash,
      hubName: identity.hubName,
      hubProtocolVersion: identity.hubProtocolVersion,
      runtimeVersion: identity.runtimeVersion,
      buildId,
      runtimeRoot,
      startedByHost: STARTED_BY_HOST
    });
  }
  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[hub] started pid ${child.pid}, health check not ready yet`);
    lifecycle("unconfirmed", { pid: child.pid ?? null, reason: startReason, version: identity.runtimeVersion, buildId });
    return { action: "started-unconfirmed", pid: child.pid };
  }
  log(`[hub] started pid ${child.pid} at http://${displayHost(host)}:${port} (runtime ${identity.runtimeVersion}${buildId ? ` ${buildId.slice(0, 12)}` : ""})`);
  lifecycle("start", { pid: child.pid ?? null, reason: startReason, version: identity.runtimeVersion, buildId });
  maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
  return { action: "started", pid: child.pid };
}
async function stopHub({ log = () => {
} } = {}) {
  const pidPath = hubPidPath();
  const status = await pidFileStatus(pidPath);
  if (status.alive) stopPid(status.record.pid, log);
  if (status.record) await removePidFile(pidPath);
  return { stopped: Boolean(status.alive) };
}
function upgradeDecision({ requested, prev, aliveSameBuild, allowDowngrade, confirm }) {
  if (aliveSameBuild) return "already-current";
  if (prev?.runtimeVersion && requested?.runtimeVersion && compareVersions(requested.runtimeVersion, prev.runtimeVersion) < 0 && !(allowDowngrade && confirm)) {
    return "downgrade-refused";
  }
  return "proceed";
}
async function controlledUpgrade({ pluginRoot, allowDowngrade = false, confirm = false, log = () => {
} } = {}) {
  const cfg = readHubConfig();
  const host = cfg.host ?? "127.0.0.1";
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();
  const requested = readRuntimeIdentityAt(pluginRoot) ?? RUNTIME;
  if (!requested.buildId) {
    return { action: "upgrade-aborted", reason: "requested runtime has no buildId (unbuilt source tree?)" };
  }
  const status = await pidFileStatus(pidPath);
  const rec = status.record;
  const prev = rec?.runtimeRoot ? {
    runtimeVersion: rec.runtimeVersion ?? null,
    buildId: rec.buildId ?? null,
    hubName: rec.hubName ?? RUNTIME.hubName,
    hubProtocolVersion: rec.hubProtocolVersion ?? RUNTIME.hubProtocolVersion,
    runtimeRoot: rec.runtimeRoot
  } : null;
  const decision = upgradeDecision({
    requested,
    prev,
    aliveSameBuild: Boolean(status.alive && prev && prev.buildId === requested.buildId),
    allowDowngrade,
    confirm
  });
  if (decision === "already-current") return { action: "already-current", buildId: requested.buildId };
  if (decision === "downgrade-refused") {
    return {
      action: "downgrade-refused",
      from: prev?.runtimeVersion ?? null,
      to: requested.runtimeVersion,
      reason: "requested runtime is older than the active one; pass allowDowngrade + confirm to force"
    };
  }
  try {
    return await withLock(hubUpgradePath(), { ownerHost: STARTED_BY_HOST, ttlMs: 12e4, timeoutMs: 2e4, log }, async () => {
      let newRoot;
      try {
        const mat = await materializeRuntime(pluginRoot, { manifest: { buildId: requested.buildId } });
        newRoot = mat.runtimeRoot;
      } catch (err) {
        return { action: "upgrade-aborted", reason: `materialization failed: ${err?.message ?? err}` };
      }
      if (!await verifyRuntimeStore(newRoot, requested.buildId)) {
        return { action: "upgrade-aborted", reason: "requested runtime failed verification after materialization" };
      }
      return await withLock(hubLockPath(), { ownerHost: STARTED_BY_HOST, ttlMs: 3e4, timeoutMs: 15e3, log }, async () => {
        if (prev) await atomicWriteJson(upgradeRecordPath(), { ...prev, host, port, at: (/* @__PURE__ */ new Date()).toISOString() });
        if (status.alive && rec?.pid) stopPid(rec.pid, log);
        await removePidFile(pidPath);
        await waitForGone({ host, port, timeoutMs: 3e3 });
        await writeActiveRuntime({ buildId: requested.buildId, runtimeRoot: newRoot, runtimeVersion: requested.runtimeVersion });
        const started = await startHubFromRuntimeRoot({ runtimeRoot: newRoot, identity: requested, cfg, host, port, pidPath, log });
        const ok = started.action === "started" && await confirmHub({ host, port, expectBuildId: requested.buildId });
        if (!ok) {
          log(`[hub] upgrade to ${requested.runtimeVersion} (${requested.buildId.slice(0, 12)}) failed confirmation \u2014 rolling back`);
          const recovered = prev ? await rollback({ prev, cfg, host, port, pidPath, log }) : false;
          clearUpgradeRecord();
          if (recovered) return { action: "rolled-back", from: requested.runtimeVersion, to: prev.runtimeVersion };
          return {
            action: prev ? "upgrade-failed-unrecovered" : "upgrade-aborted",
            reason: prev ? "new runtime failed AND rollback failed \u2014 run SessionStart recovery" : "requested runtime failed to start; no prior hub to roll back to",
            to: requested.runtimeVersion
          };
        }
        clearUpgradeRecord();
        if (prev?.buildId && prev.buildId !== requested.buildId) {
          try {
            gcRuntimes({ keepBuildIds: [prev.buildId, requested.buildId] });
          } catch {
          }
        }
        log(`[hub] upgraded ${prev?.runtimeVersion ?? "(none)"} \u2192 ${requested.runtimeVersion} (${requested.buildId.slice(0, 12)}), pid ${started.pid}`);
        return { action: "upgraded", from: prev?.runtimeVersion ?? null, to: requested.runtimeVersion, buildId: requested.buildId, pid: started.pid };
      });
    });
  } catch (err) {
    if (err instanceof LockTimeoutError) return { action: "upgrade-aborted", reason: err.message };
    throw err;
  }
}
async function confirmHub({ host, port, expectBuildId }) {
  const id = await probeHubIdentity({ host, port, timeoutMs: 3e3 });
  return Boolean(id && id.isHub && (!expectBuildId || id.buildId === expectBuildId));
}
async function rollback({ prev, cfg, host, port, pidPath, log }) {
  if (!prev?.runtimeRoot) return false;
  const st = await pidFileStatus(pidPath);
  if (st.alive && st.record?.pid) stopPid(st.record.pid, log);
  await removePidFile(pidPath);
  await waitForGone({ host, port, timeoutMs: 3e3 });
  if (!await verifyRuntimeStore(prev.runtimeRoot, prev.buildId)) {
    log("[hub] rollback target runtime is missing/corrupt in the store");
    return false;
  }
  await writeActiveRuntime({ buildId: prev.buildId, runtimeRoot: prev.runtimeRoot, runtimeVersion: prev.runtimeVersion });
  const started = await startHubFromRuntimeRoot({ runtimeRoot: prev.runtimeRoot, identity: prev, cfg, host, port, pidPath, log });
  return started.action === "started" && await confirmHub({ host, port, expectBuildId: prev.buildId });
}
function clearUpgradeRecord() {
  try {
    rmSync(upgradeRecordPath(), { force: true });
  } catch {
  }
}
function compareVersions(a, b) {
  const pa = String(a ?? "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b ?? "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
function stopPid(pid, log) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    log(`[hub] could not stop pid ${pid}: ${err.message}`);
  }
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
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}
function probeHubIdentity({ host, port, timeoutMs }) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 65536) buf += c;
      });
      res.on("end", () => {
        try {
          const body = JSON.parse(buf);
          const hub = body.hub && typeof body.hub === "object" ? body.hub : null;
          resolve({
            pid: Number.isInteger(body.pid) ? body.pid : null,
            isHub: Array.isArray(body.entries),
            runtimeVersion: hub && typeof hub.runtimeVersion === "string" ? hub.runtimeVersion : typeof body.version === "string" ? body.version : "",
            hubProtocolVersion: hub && Number.isInteger(hub.protocolVersion) ? hub.protocolVersion : 1,
            buildId: hub && typeof hub.buildId === "string" ? hub.buildId : null,
            hubName: hub && typeof hub.name === "string" ? hub.name : RUNTIME.hubName,
            startedByHost: body.startedBy && typeof body.startedBy.host === "string" ? body.startedBy.host : null
          });
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}
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
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

export {
  maybeConfigureTailscale,
  tailscaleDnsName,
  ensureHubLifecycle,
  stopHub,
  controlledUpgrade
};
