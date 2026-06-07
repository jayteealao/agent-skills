import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { spawnDetachedNode } from './detach.mjs';
import { resolveEntrypoint } from './entrypoint.mjs';
import { isPidAlive, pidFileStatus, readPidFile, removePidFile, writePidFile } from './pid-file.mjs';
import { maybeConfigureTailscale } from './tailscale.mjs';
import { hubPidPath } from './registry.mjs';
import { readHubConfig } from './hub-config.mjs';

// Version of the supervising code; a running per-repo daemon reporting a
// different version in /__sdlc/health is stale, so we reap it and respawn — a
// new install deterministically replaces the old daemon's code.
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version ?? ''; }
  catch { return ''; }
})();

export function servePidPath(projectRoot) {
  return join(projectRoot, '.ai', '_view', '.serve.pid');
}

export async function ensureServeLifecycle({
  projectRoot = process.cwd(),
  pluginRoot,
  viewRoot = join(projectRoot, '.ai', '_view'),
  configHash = '',
  log = () => {},
} = {}) {
  // Serve settings are MACHINE-WIDE only (~/.sdlc/hub-config.json), never
  // per-repo. A repo's sole serve-related control is `view.hub.enabled`
  // (participation); HOW the daemon binds — host, port, tailscale, live-reload,
  // and whether it may run at all (perRepoServe) — comes from the machine config.
  // `view.serve` is rejected by the per-repo schema. (`config` is intentionally
  // not read here anymore.)
  const hubCfg = readHubConfig({ create: false });
  const host = hubCfg.host ?? '127.0.0.1';
  const port = Number(hubCfg.port ?? 4173);
  const tailscale = hubCfg.tailscale ?? {};
  const liveReload = hubCfg.liveReload !== false;
  const pidPath = servePidPath(projectRoot);
  const status = await pidFileStatus(pidPath);

  // Machine-wide kill switch: perRepoServe:false disables per-repo daemons for
  // the whole machine — reap any running one and decline to spawn. The hub
  // serves this repo at /r/<id>/.
  if (hubCfg.perRepoServe === false) {
    if (status.alive) {
      stopPid(status.record.pid, log);
      log(`[serve] per-repo daemons disabled machine-wide (hub-config.perRepoServe:false) — reaped pid ${status.record.pid}`);
    } else {
      log('[serve] per-repo daemons disabled machine-wide (hub-config.perRepoServe:false) — the hub serves this repo at /r/<id>/');
    }
    if (status.record) await removePidFile(pidPath);
    return { action: 'per-repo-disabled' };
  }

  // Hub guard: when a machine-wide hub is alive it serves THIS repo at /r/<id>/,
  // so a per-repo daemon would be redundant (and could squat the hub port). The
  // per-repo daemon now exists ONLY as the standalone fallback for a repo that
  // opted out of the hub (view.hub.enabled:false → no hub started) — there is no
  // per-repo force/dual-run knob anymore (serve config is machine-only). The
  // probe is PID-file-gated (no HTTP cost), so a cold start pays zero latency.
  {
    const hub = await liveHub();
    if (hub) {
      if (status.alive) stopPid(status.record.pid, log);
      if (status.record) await removePidFile(pidPath);
      log(`[serve] hub active at http://${displayHost(hub.host ?? '127.0.0.1')}:${hub.port} — this repo is served there under /r/<id>/`);
      return { action: 'hub-active', hub: { host: hub.host ?? '127.0.0.1', port: hub.port, pid: hub.pid } };
    }
  }

  // No live hub → run the standalone fallback daemon, bound per the MACHINE
  // serve settings (host/port/tailscale read from hub-config above). With no hub
  // holding the port there is no collision, so no 4174 step-aside is needed.
  if (host === '0.0.0.0' && !(tailscale.enabled === true && tailscale.acknowledgedPublic === true)) {
    log('[serve] refused host 0.0.0.0 without hub-config.tailscale.enabled + acknowledgedPublic');
    return { action: 'refused-host' };
  }

  if (status.alive) {
    const id = await probeServeIdentity({ host, port, timeoutMs: 600 });
    if (id && id.version === PLUGIN_VERSION) {
      log(`[serve] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale, port, log });
      return { action: 'already-running', pid: status.record.pid };
    }
    // Stale version (reap to pick up new install) or unhealthy (gone) → respawn.
    stopPid(status.record.pid, log);
    await removePidFile(pidPath);
    log(id
      ? `[serve] reaped stale daemon v${id.version || '?'} → v${PLUGIN_VERSION} (pid ${status.record.pid})`
      : `[serve] stopped unhealthy daemon pid ${status.record.pid}`);
  } else if (status.stale) {
    await removePidFile(pidPath);
    log(`[serve] removed stale pid file for pid ${status.record?.pid}`);
  }

  const script = resolveEntrypoint(pluginRoot, 'render-sunflower-serve');
  const child = spawnDetachedNode(script, [
    '--view', viewRoot,
    '--host', host,
    '--port', String(port),
    '--pid-file', pidPath,
    '--project-root', projectRoot,
    '--config-hash', configHash,
    liveReload ? '--live-reload' : '--no-live-reload',
    host === '0.0.0.0' && tailscale.enabled === true ? '--allow-all-hosts' : '',
  ].filter(Boolean), {
    cwd: projectRoot,
    env: process.env,
  });

  // Write the pid file immediately (the daemon also writes it once it binds,
  // but doing it here first closes the window where a concurrent bootstrap sees
  // no pid file and spawns a duplicate server that fails with EADDRINUSE).
  if (child.pid) {
    await writePidFile(pidPath, { pid: child.pid, host, port, configHash });
  }

  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[serve] started pid ${child.pid}, health check not ready yet`);
    return { action: 'started-unconfirmed', pid: child.pid };
  }

  log(`[serve] started pid ${child.pid} at http://${displayHost(host)}:${port}`);
  maybeConfigureTailscale({ tailscale, port, log });
  return { action: 'started', pid: child.pid };
}

// PID-file-gated hub probe (no HTTP cost): read ~/.sdlc/hub.pid and confirm the
// pid is alive. Returns the record { pid, host, port, token, ... } or null.
async function liveHub() {
  const record = await readPidFile(hubPidPath());
  if (!record || !record.pid || !isPidAlive(record.pid)) return null;
  return record;
}

function stopPid(pid, log) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    log(`[serve] could not stop pid ${pid}: ${err.message}`);
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
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// Like probeHealth but parses the daemon's reported version (for stale-version
// reaping). Returns { pid, version } or null when nothing healthy answers.
function probeServeIdentity({ host, port, timeoutMs }) {
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
          });
        } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function displayHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
