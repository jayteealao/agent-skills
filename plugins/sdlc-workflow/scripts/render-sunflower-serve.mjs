#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  watch,
} from 'node:fs';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writePidFile, removePidFile } from '../lib/pid-file.mjs';
import { resolveRequestPath as resolveInView } from '../lib/resolve-request-path.mjs';
import { resolveProjectRoot } from '../lib/project-root.mjs';
import { hostAllowed } from '../lib/host-allowlist.mjs';
import {
  codeBrowserConfigFromEnv, normalizeCodeBrowserConfig, repoHeadBranch,
  serveCodeBrowser, serveCodeBrowserAsset,
} from '../lib/code-browser.mjs';
import {
  createHealController, staleRenderConfigFromEnv, readRenderedVersion,
} from '../lib/heal-render.mjs';
import { createRenderQueueDrainer } from '../lib/render-queue.mjs';
import { renderCodeBrowserPage } from '../renderers/_code-browser-page.mjs';

const __filename = fileURLToPath(import.meta.url);

// Plugin root, resolved off this module's own URL (depth-1 from both scripts/
// and dist/) so the heal controller can resolve the render-sunflower entrypoint.
const PLUGIN_ROOT = (() => {
  try { return fileURLToPath(new URL('..', import.meta.url)); }
  catch { return null; }
})();

// Plugin version of THIS running daemon, surfaced in /__sdlc/health so the
// supervisor (ensureServeLifecycle) can reap a stale daemon and let a new
// install take over deterministically.
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version ?? ''; }
  catch { return ''; }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const MAX_SSE_CLIENTS = 50;   // cap live-reload connections to avoid fd exhaustion

// Blocks injected inline scripts (raw .html.fragment / markdown HTML passthrough)
// while allowing our external css/js and inline SVG styles. The live-reload
// script is served from _assets/livereload.js so it satisfies script-src 'self'.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'";

export function parseServeArgs(argv) {
  const args = {
    view: '.ai/_view',
    host: '127.0.0.1',
    port: 4173,
    pidFile: null,
    // null = no explicit --project-root; main() climbs from cwd to the project
    // root so a daemon launched from a repo subfolder can't mint a stray
    // `.ai/_view` there (createSdlcStaticServer mkdirs viewRoot).
    projectRoot: null,
    configHash: '',
    liveReload: true,
    allowAllHosts: false,
    allowedHosts: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--view') args.view = argv[++i];
    else if (a === '--host') args.host = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--pid-file') args.pidFile = argv[++i];
    else if (a === '--project-root') args.projectRoot = argv[++i];
    else if (a === '--config-hash') args.configHash = argv[++i];
    else if (a === '--live-reload') args.liveReload = true;
    else if (a === '--no-live-reload') args.liveReload = false;
    else if (a === '--allow-all-hosts') args.allowAllHosts = true;
    // Extra Host names admitted by the `__code` routes' allowlist (e.g. the
    // tailnet MagicDNS name) — mirrors the hub flag of the same name.
    else if (a === '--allowed-hosts') args.allowedHosts = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

export function createSdlcStaticServer({
  viewRoot,
  projectRoot = null,
  liveReload = true,
  configHash = '',
  codeBrowser = null,
  allowAllHosts = false,
  allowedHosts = [],
  // Stale-render heal config (STALE-RENDER-HEAL-PLAN §8). null → off (safe
  // constructor default); main() supplies the env-derived machine config.
  staleRender = null,
  pluginRoot = PLUGIN_ROOT,
  spawnRender = undefined,   // injectable render-spawn seam (tests)
  reconcileMs = 10000,
} = {}) {
  const root = resolve(viewRoot ?? '.ai/_view');
  mkdirSync(root, { recursive: true });
  // The repo root the code browser serves SOURCE from. Explicit when the
  // supervisor passed --project-root; derived from the view root otherwise
  // (<repo>/.ai/_view → <repo>) so a directly-constructed server still works.
  const repoRoot = resolve(projectRoot ?? resolve(root, '..', '..'));
  const cbCfg = normalizeCodeBrowserConfig(codeBrowser);
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));

  const clients = new Set();
  let watcher = null;
  if (liveReload) {
    try {
      watcher = watch(root, (event, filename) => {
        if (filename && String(filename) !== '.last-render') return;
        emitEvent(clients, 'reload', healthPayload(root, configHash));
      });
    } catch {
      watcher = null;
    }
  }

  // Stale-render heal for this single repo (STALE-RENDER-HEAL-PLAN §8). The
  // standalone fallback has no reconcile loop, so a light unref'd timer asks the
  // controller to consider this view each tick; on version drift it spawns a
  // background clean re-render off the request path, and the .last-render rewrite
  // trips the watcher above → live-reload. emitReload broadcasts to all clients
  // (single repo — no id filtering).
  const selfEntry = { id: 'local', repoRoot, viewDir: root };
  const heal = createHealController({
    pluginRoot,
    pluginVersion: PLUGIN_VERSION,
    healCfg: staleRender ?? { heal: false },
    log: (line) => console.log(`[serve] ${line}`),
    emitReload: () => emitEvent(clients, 'reload', healthPayload(root, configHash)),
    spawnRender,
  });
  let reconcileTimer = null;
  if (heal.config.heal) {
    reconcileTimer = setInterval(() => {
      try { heal.consider(selfEntry); } catch { /* controller swallows its own errors */ }
    }, reconcileMs);
    if (typeof reconcileTimer.unref === 'function') reconcileTimer.unref();
  }

  // Render-queue drainer (RENDER-DISPATCH-PLAN). Shares this repo's bounded
  // engine (heal.submit / heal.isBusy), so a queue render and a heal render
  // never run concurrently for this view. Its timer runs REGARDLESS of the heal
  // toggle (a user may disable heal but still want hook-reported writes to
  // render), and a startup catch-up drains anything queued while no daemon was
  // running.
  const renderQueue = createRenderQueueDrainer({
    submit: (entry, spec) => heal.submit(entry, spec),
    isBusy: (id) => heal.isBusy(id),
    pluginRoot,
    log: (line) => console.log(`[serve] ${line}`),
    maxAttempts: heal.config.maxAttempts,
  });
  try { renderQueue.catchUp([selfEntry]); } catch { /* best-effort startup catch-up */ }
  const queueTimer = setInterval(() => {
    try { renderQueue.drainEntry(selfEntry); } catch { /* drainer swallows its own errors */ }
  }, reconcileMs);
  if (typeof queueTimer.unref === 'function') queueTimer.unref();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://sdlc.local');
    if (url.pathname === '/__sdlc/health') {
      // heal + render-queue snapshots ride only on the health response (not the
      // SSE payloads).
      sendJson(res, {
        ...healthPayload(root, configHash),
        heal: heal.snapshot(),
        renderQueue: renderQueue.snapshot([selfEntry]),
      });
      return;
    }

    // Code-browser routes (CODEBASE-BROWSER-PLAN §3.5): the standalone daemon
    // serves the repo's SOURCE at /__code/* — a strictly larger perimeter than
    // the view, so these routes (unlike the historical view routes) sit behind
    // the same Host allowlist the hub applies globally (§0.2-4: DNS rebinding
    // must not reach source). View-route behaviour is unchanged.
    const p = url.pathname;
    if (p === '/__sdlc/code-browser.js' || p === '/__sdlc/code-browser.css'
      || p === '/__code' || p.startsWith('/__code/')) {
      if (!cbCfg.enabled) { res.writeHead(404).end('not found'); return; }
      if (!hostAllowed(req, allowAllHosts, extraHosts)) { res.writeHead(403).end('forbidden host'); return; }
      if (p.startsWith('/__sdlc/')) {
        serveCodeBrowserAsset({ req, res, name: p.slice('/__sdlc/'.length) });
        return;
      }
      serveCodeBrowser({
        req, res, url,
        basePath: '/__code',
        repoRoot,
        repoId: null,
        repoLabel: basename(repoRoot),
        headBranch: () => repoHeadBranch(repoRoot),
        config: cbCfg,
        pluginVersion: PLUGIN_VERSION,
        csp: CSP,
        renderPage: renderCodeBrowserPage,
        // Reachable beyond loopback → the adapter ignores serveSecrets:true.
        publicExposure: allowAllHosts || extraHosts.size > 0,
      });
      return;
    }

    if (url.pathname === '/__sdlc/events') {
      if (!liveReload) {
        res.writeHead(404).end('live reload disabled');
        return;
      }
      if (clients.size >= MAX_SSE_CLIENTS) {
        res.writeHead(503).end('too many live-reload clients');
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      clients.add(res);
      res.write('retry: 1000\n\n');
      writeSse(res, 'hello', healthPayload(root, configHash));
      req.on('close', () => clients.delete(res));
      return;
    }

    serveStatic({ root, req, res });
  });

  const close = server.close.bind(server);
  server.close = (callback) => {
    if (watcher) watcher.close();
    if (reconcileTimer) clearInterval(reconcileTimer);
    clearInterval(queueTimer);
    for (const client of clients) client.end();
    clients.clear();
    return close(callback);
  };

  return server;
}

function serveStatic({ root, req, res }) {
  const resolved = resolveRequestPath(root, req.url ?? '/');
  if (!resolved.ok) {
    res.writeHead(resolved.status).end(resolved.message);
    return;
  }

  if (!existsSync(resolved.path)) {
    res.writeHead(404).end('not found');
    return;
  }

  const stats = statSync(resolved.path);
  if (!stats.isFile()) {
    res.writeHead(404).end('not found');
    return;
  }

  const type = MIME[extname(resolved.path).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': stats.size,
    'cache-control': 'no-cache',
    'content-security-policy': CSP,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(resolved.path).pipe(res);
}

// Thin wrapper over the shared containment kernel (lib/resolve-request-path.mjs).
// The per-repo daemon historically served itself under an optional `/sdlc` URL
// prefix (a path-prefix deployment), so it opts the strip back in here; the
// shared kernel omits the strip so the hub can serve a slug named `sdlc`.
function resolveRequestPath(root, rawUrl) {
  return resolveInView(root, rawUrl, { stripPrefix: '/sdlc' });
}

function healthPayload(root, configHash) {
  // Rendered version read LIVE from .last-render (source of truth) so `stale`
  // reflects current on-disk state (STALE-RENDER-HEAL-PLAN §9). null when
  // unversioned (pre-9.60) — which counts as stale against any real version.
  const renderedVersion = readRenderedVersion(join(root, '.last-render'));
  return {
    status: 'ok',
    ok: true,
    pid: process.pid,
    version: PLUGIN_VERSION,
    configHash,
    renderedAt: lastRenderAt(root),
    renderedVersion,
    stale: renderedVersion !== PLUGIN_VERSION,
    slugs: renderedSlugs(root),
  };
}

function renderedSlugs(root) {
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => !['_assets', 'project', 'simplify', 'profiles'].includes(entry.name))
      .filter((entry) => existsSync(join(root, entry.name, 'INDEX.html')))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function lastRenderAt(root) {
  const marker = join(root, '.last-render');
  if (!existsSync(marker)) return null;
  try {
    const parsed = JSON.parse(readFileSync(marker, 'utf-8'));
    return parsed.renderedAt ?? null;
  } catch {
    try {
      return statSync(marker).mtime.toISOString();
    } catch {
      return null;
    }
  }
}

function sendJson(res, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache',
  });
  res.end(body);
}

function emitEvent(clients, event, payload) {
  for (const client of clients) writeSse(client, event, payload);
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function main() {
  const args = parseServeArgs(process.argv.slice(2));
  if (args.host === '0.0.0.0' && !args.allowAllHosts) {
    console.error('[serve] refusing 0.0.0.0 without --allow-all-hosts');
    process.exit(2);
  }

  const projectRoot = args.projectRoot ?? resolveProjectRoot();
  const viewRoot = resolve(projectRoot, args.view);
  const server = createSdlcStaticServer({
    viewRoot,
    projectRoot,
    liveReload: args.liveReload,
    configHash: args.configHash,
    // codeBrowser + staleRender configs arrive via env (JSON can't ride argv
    // through the Windows launch-hidden.vbs shim) — mirrors the hub.
    codeBrowser: codeBrowserConfigFromEnv(),
    staleRender: staleRenderConfigFromEnv(),
    allowAllHosts: args.allowAllHosts,
    allowedHosts: args.allowedHosts,
  });

  server.listen(args.port, args.host, async () => {
    const address = server.address();
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid,
        host: args.host,
        port: typeof address === 'object' && address ? address.port : args.port,
        configHash: args.configHash,
      });
    }
    console.log(`[serve] listening on http://${args.host}:${typeof address === 'object' && address ? address.port : args.port}`);
  });

  const shutdown = async () => {
    server.close(async () => {
      if (args.pidFile) await removePidFile(args.pidFile);
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[serve] fatal:', err.stack ?? err.message);
    process.exit(1);
  });
}
