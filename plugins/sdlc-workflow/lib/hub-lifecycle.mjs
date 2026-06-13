// lib/hub-lifecycle.mjs
//
// Start / supervise / stop the single machine-wide hub daemon. Mirrors
// lib/serve-lifecycle.mjs, including the stale-PID recovery path. Reads
// host/port/limits from the machine-wide hub-config.json (readHubConfig) and
// mints a fresh write token into ~/.sdlc/hub.pid on each (re)start (invariant
// #6). See MULTI-REPO-REGISTRY-PLAN §4.5.

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { spawnDetachedNode } from './detach.mjs';
import { resolveEntrypoint } from './entrypoint.mjs';
import { isPidAlive, pidFileStatus, removePidFile, writePidFile } from './pid-file.mjs';
import { hubPidPath, sdlcHomeDir } from './registry.mjs';
import { readHubConfig, hubConfigHash } from './hub-config.mjs';
import { maybeConfigureTailscale, tailscaleDnsName } from './tailscale.mjs';

// Version of the SUPERVISING code (this installed plugin). A running hub reports
// its own version in /__sdlc/health; a mismatch means a stale hub from a prior
// install is still up, so we reap it and start the current one — making a new
// install deterministically pick up new server code.
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version ?? ''; }
  catch { return ''; }
})();

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

  // Probe whatever is actually answering on the hub port — version- and
  // identity-aware — independent of the pid file. One check resolves four cases:
  //   • current hub, tracked   → adopt (already-running)
  //   • stale version          → reap + respawn  (deterministic new-install pickup)
  //   • current hub, untracked → reap + respawn  (heal an orphaned pid file)
  //   • non-hub squatter       → reap + respawn  (evict a per-repo daemon on 4173)
  const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
  if (id) {
    const tracked = status.alive && status.record?.pid === id.pid;
    if (id.isHub && id.version === PLUGIN_VERSION && tracked) {
      log(`[hub] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
      return { action: 'already-running', pid: id.pid };
    }
    const why = !id.isHub ? 'non-hub process on hub port'
      : id.version !== PLUGIN_VERSION ? `stale hub v${id.version || '?'} → v${PLUGIN_VERSION}`
      : 'untracked hub (orphaned pid file)';
    if (id.pid) stopPid(id.pid, log);
    await removePidFile(pidPath);
    // Wait for the port to actually free so the respawn doesn't hit EADDRINUSE.
    await waitForGone({ host, port, timeoutMs: 2000 });
    log(`[hub] reaped ${why} (pid ${id.pid ?? '?'})`);
  } else if (status.record) {
    // Nothing answering — clear a stale/dead pid file before respawn.
    await removePidFile(pidPath);
    log(`[hub] removed stale pid file for pid ${status.record?.pid}`);
  }

  const token = randomBytes(24).toString('hex');
  const cfgHash = hubConfigHash(cfg);
  const script = resolveEntrypoint(pluginRoot, 'hub-serve');
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
    // Token via env (not argv) so it isn't visible in process listings; the
    // codeBrowser block rides env too because JSON cannot survive the Windows
    // launch-hidden.vbs argv rebuild. configHash covers it, so editing the
    // block in hub-config.json still restarts the hub.
    env: {
      ...process.env,
      SDLC_HUB_TOKEN: token,
      SDLC_CODE_BROWSER: JSON.stringify(cfg.codeBrowser ?? {}),
      // Stale-render heal config (STALE-RENDER-HEAL-PLAN §3). Via env for the
      // same reason as codeBrowser; configHash covers it so editing the block in
      // hub-config.json restarts the hub. heal defaults ON.
      SDLC_STALE_RENDER: JSON.stringify(cfg.staleRender ?? {}),
    },
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

// Like probeHealth but parses the body for identity: { pid, version, isHub }.
// `isHub` (presence of the entries[] array) distinguishes the hub from a
// per-repo daemon that grabbed the port. Returns null when nothing healthy
// answers or the body can't be parsed.
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
          resolve({
            pid: Number.isInteger(body.pid) ? body.pid : null,
            version: typeof body.version === 'string' ? body.version : '',
            isHub: Array.isArray(body.entries),
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
