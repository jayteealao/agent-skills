import { request } from 'node:http';
import { join } from 'node:path';
import { spawnDetachedNode } from './detach.mjs';
import { isPidAlive, pidFileStatus, readPidFile, removePidFile, writePidFile } from './pid-file.mjs';
import { maybeConfigureTailscale } from './tailscale.mjs';
import { hubPidPath } from './registry.mjs';
import { readHubConfig } from './hub-config.mjs';

export function servePidPath(projectRoot) {
  return join(projectRoot, '.ai', '_view', '.serve.pid');
}

export async function ensureServeLifecycle({
  projectRoot = process.cwd(),
  pluginRoot,
  viewRoot = join(projectRoot, '.ai', '_view'),
  config,
  configHash = '',
  log = () => {},
} = {}) {
  const serve = config?.view?.serve ?? {};
  const pidPath = servePidPath(projectRoot);
  const status = await pidFileStatus(pidPath);

  // Machine-wide kill switch (§4.5 hardening): when hub-config sets
  // `perRepoServe:false`, per-repo daemons are disabled for the whole machine.
  // This OVERRIDES a repo's force `view.serve.enabled:true` — the switch is a
  // machine-level authority, not a per-repo preference — because a per-repo
  // daemon is the only thing that can squat the hub's port and hide the
  // multi-repo inbox behind one repo's dashboard. Reap any running daemon and
  // decline to spawn; the hub serves this repo at /r/<id>/. Checked BEFORE the
  // hub guard so it fires even when no hub is currently alive.
  if (readHubConfig({ create: false }).perRepoServe === false) {
    if (status.alive) {
      stopPid(status.record.pid, log);
      log(`[serve] per-repo daemons disabled machine-wide (hub-config.perRepoServe:false) — reaped pid ${status.record.pid}`);
    } else {
      log('[serve] per-repo daemons disabled machine-wide (hub-config.perRepoServe:false) — the hub serves this repo at /r/<id>/');
    }
    if (status.record) await removePidFile(pidPath);
    return { action: 'per-repo-disabled' };
  }

  // Hub guard (§4.5): when a machine-wide hub is alive and the user has NOT
  // explicitly opted into a direct per-repo daemon (view.serve.enabled:true),
  // the hub serves this repo at /r/<id>/ — don't spawn a per-repo daemon. The
  // probe is PID-file-gated (no HTTP cost), so a cold start pays zero latency.
  if (serve.enabled !== true) {
    const hub = await liveHub();
    if (hub) {
      if (status.alive) stopPid(status.record.pid, log);
      if (status.record) await removePidFile(pidPath);
      log(`[serve] hub active at http://${displayHost(hub.host ?? '127.0.0.1')}:${hub.port} — this repo is served there under /r/<id>/`);
      return { action: 'hub-active', hub: { host: hub.host ?? '127.0.0.1', port: hub.port, pid: hub.pid } };
    }
  }

  if (serve.enabled === false) {
    if (status.alive) {
      stopPid(status.record.pid, log);
      log(`[serve] stopped disabled daemon pid ${status.record.pid}`);
    }
    if (status.record) await removePidFile(pidPath);
    return { action: 'disabled' };
  }

  const host = serve.host ?? '127.0.0.1';
  let port = Number(serve.port ?? 4173);
  if (host === '0.0.0.0' && !(serve.tailscale?.enabled === true && serve.tailscale?.acknowledgedPublic === true)) {
    log('[serve] refused host 0.0.0.0 without view.serve.tailscale.enabled + acknowledgedPublic');
    return { action: 'refused-host' };
  }

  // Port collision (§4.5): the hub owns 4173 (the canonical SDLC URL). If the
  // user force-enabled a direct per-repo daemon while a hub holds that same
  // port, bind the per-repo daemon to 4174 instead so `4173/` always means "the
  // SDLC view" and both can run. (No collision when the hub is off — the
  // default — where the per-repo daemon owns 4173 exactly as before.)
  if (serve.enabled === true) {
    const hub = await liveHub();
    if (hub && Number(hub.port) === port) {
      port = 4174;
      log(`[serve] hub holds port ${hub.port}; binding per-repo daemon to ${port} instead`);
    }
  }

  if (status.alive) {
    const healthy = await waitForHealth({ host, port, timeoutMs: 600 });
    if (healthy) {
      log(`[serve] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale: serve.tailscale, port, log });
      return { action: 'already-running', pid: status.record.pid };
    }
    stopPid(status.record.pid, log);
    await removePidFile(pidPath);
    log(`[serve] stopped unhealthy daemon pid ${status.record.pid}`);
  } else if (status.stale) {
    await removePidFile(pidPath);
    log(`[serve] removed stale pid file for pid ${status.record?.pid}`);
  }

  const script = join(pluginRoot, 'scripts', 'render-sunflower-serve.mjs');
  const child = spawnDetachedNode(script, [
    '--view', viewRoot,
    '--host', host,
    '--port', String(port),
    '--pid-file', pidPath,
    '--project-root', projectRoot,
    '--config-hash', configHash,
    serve.liveReload === false ? '--no-live-reload' : '--live-reload',
    host === '0.0.0.0' && serve.tailscale?.enabled === true ? '--allow-all-hosts' : '',
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
  maybeConfigureTailscale({ tailscale: serve.tailscale, port, log });
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

function displayHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
