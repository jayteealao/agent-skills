import { spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { join } from 'node:path';
import { spawnDetachedNode } from './detach.mjs';
import { isPidAlive, pidFileStatus, removePidFile } from './pid-file.mjs';

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

  if (serve.enabled === false) {
    if (status.alive) {
      stopPid(status.record.pid, log);
      log(`[serve] stopped disabled daemon pid ${status.record.pid}`);
    }
    if (status.record) await removePidFile(pidPath);
    return { action: 'disabled' };
  }

  const host = serve.host ?? '127.0.0.1';
  const port = Number(serve.port ?? 4173);
  if (host === '0.0.0.0' && serve.tailscale?.enabled !== true) {
    log('[serve] refused host 0.0.0.0 without view.serve.tailscale.enabled');
    return { action: 'refused-host' };
  }

  if (status.alive) {
    const healthy = await waitForHealth({ host, port, timeoutMs: 600 });
    if (healthy) {
      log(`[serve] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ serve, port, log });
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

  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[serve] started pid ${child.pid}, health check not ready yet`);
    return { action: 'started-unconfirmed', pid: child.pid };
  }

  log(`[serve] started pid ${child.pid} at http://${displayHost(host)}:${port}`);
  maybeConfigureTailscale({ serve, port, log });
  return { action: 'started', pid: child.pid };
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

function maybeConfigureTailscale({ serve, port, log }) {
  const tailscale = serve.tailscale ?? {};
  if (tailscale.enabled !== true) return;

  const target = `http://127.0.0.1:${port}`;
  const mode = tailscale.mode === 'funnel' ? 'funnel' : 'serve';
  if (mode === 'funnel' && tailscale.acknowledgedPublic !== true) {
    log('[tailscale] refused funnel without acknowledgedPublic:true');
    return;
  }

  const args = [mode, '--bg'];
  if (mode === 'serve') {
    if (tailscale.https === false) args.push('--http=80');
    const path = tailscale.path || '/';
    if (path !== '/') args.push(`--set-path=${path}`);
  }
  args.push(target);

  const result = spawnSync('tailscale', args, {
    encoding: 'utf-8',
    windowsHide: true,
    timeout: 10000,
  });
  if (result.error) {
    log(`[tailscale] ${mode} unavailable: ${result.error.message}`);
  } else if (result.status !== 0) {
    log(`[tailscale] ${mode} failed: ${(result.stderr || result.stdout || '').trim()}`);
  } else {
    log(`[tailscale] ${mode} configured for ${target}`);
  }
}

function displayHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host;
}
