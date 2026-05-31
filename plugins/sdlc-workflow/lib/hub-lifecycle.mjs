// lib/hub-lifecycle.mjs
//
// Start / supervise / stop the single machine-wide hub daemon. Mirrors
// lib/serve-lifecycle.mjs, including the stale-PID recovery path. Reads
// host/port/limits from the machine-wide hub-config.json (readHubConfig) and
// mints a fresh write token into ~/.sdlc/hub.pid on each (re)start (invariant
// #6). See MULTI-REPO-REGISTRY-PLAN §4.5.

import { randomBytes } from 'node:crypto';
import { request } from 'node:http';
import { join } from 'node:path';

import { spawnDetachedNode } from './detach.mjs';
import { isPidAlive, pidFileStatus, removePidFile, writePidFile } from './pid-file.mjs';
import { hubPidPath, sdlcHomeDir } from './registry.mjs';
import { readHubConfig, hubConfigHash } from './hub-config.mjs';
import { maybeConfigureTailscale, tailscaleDnsName } from './tailscale.mjs';

// Re-export so callers have one import for the hub's pid-file location (the plan
// lists hubPidPath as part of this module's API; the path itself is defined in
// registry.mjs alongside the other ~/.sdlc/ paths).
export { hubPidPath };

/**
 * Ensure the hub is running, starting (or recovering) it from the machine-wide
 * config. PID-file-gated: a cold start with no hub pays zero HTTP latency.
 */
export async function ensureHubLifecycle({ pluginRoot, log = () => {} } = {}) {
  const cfg = readHubConfig();   // reads/creates ~/.sdlc/hub-config.json
  const host = cfg.host ?? '127.0.0.1';
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();
  const status = await pidFileStatus(pidPath);

  if (host === '0.0.0.0' && !(cfg.tailscale?.enabled === true && cfg.tailscale?.acknowledgedPublic === true)) {
    log('[hub] refused host 0.0.0.0 without tailscale.enabled + acknowledgedPublic');
    return { action: 'refused-host' };
  }

  if (status.alive) {
    const healthy = await waitForHealth({ host, port, timeoutMs: 600 });
    if (healthy) {
      log(`[hub] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
      return { action: 'already-running', pid: status.record.pid };
    }
    // isPidAlive can be true for a reused PID on Windows (EPERM-as-alive); a
    // failed health probe means the real hub is gone → kill, remove, respawn.
    stopPid(status.record.pid, log);
    await removePidFile(pidPath);
    log(`[hub] stopped unhealthy hub pid ${status.record.pid}`);
  } else if (status.stale) {
    await removePidFile(pidPath);
    log(`[hub] removed stale pid file for pid ${status.record?.pid}`);
  }

  const token = randomBytes(24).toString('hex');
  const cfgHash = hubConfigHash(cfg);
  const script = join(pluginRoot, 'scripts', 'hub-serve.mjs');
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
  // Skipped for the 0.0.0.0/allow-all path (already permissive) and when the
  // name can't be read (Tailscale down → localhost-only, as before).
  if (host !== '0.0.0.0' && cfg.tailscale?.enabled === true) {
    const dns = tailscaleDnsName({ log });
    if (dns) { childArgs.push('--allowed-hosts', dns); log(`[hub] allowlisting tailnet host ${dns}`); }
  }
  const child = spawnDetachedNode(script, childArgs, {
    cwd: sdlcHomeDir(),
    // Token via env (not argv) so it isn't visible in process listings.
    env: { ...process.env, SDLC_HUB_TOKEN: token },
  });

  // Pre-write hub.pid WITH the token to close the spawn→bind race: a render that
  // fires in that window reads the token from here to authenticate its POST. The
  // hub re-writes hub.pid (same token) once it binds.
  if (child.pid) {
    await writePidFile(pidPath, { pid: child.pid, host, port, token, configHash: cfgHash });
  }

  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[hub] started pid ${child.pid}, health check not ready yet`);
    return { action: 'started-unconfirmed', pid: child.pid };
  }
  log(`[hub] started pid ${child.pid} at http://${displayHost(host)}:${port}`);
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

function displayHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
