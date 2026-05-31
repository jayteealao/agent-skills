#!/usr/bin/env node
/**
 * scripts/hub-serve.mjs — the multi-repo hub daemon.
 *
 * One long-lived Node process that reads the machine-wide registry
 * (`~/.sdlc/registry.json`) and routes `/r/<id>/...` requests to each repo's
 * `.ai/_view` directory using the shared resolveRequestPath containment kernel.
 * No per-repo sub-processes, no reverse proxy, no port-per-repo. See
 * MULTI-REPO-REGISTRY-PLAN §4.
 *
 * Security posture (larger than the read-only per-repo daemon because the hub
 * has a write endpoint and serves directories it didn't create):
 *   • Host-header allowlist on EVERY request (defeats DNS-rebinding — inv. #6).
 *   • `__sdlc/*` write/refresh routes additionally require the hub.pid token.
 *   • Containment is per `entry.viewDir` — a traversal escaping one repo's view
 *     cannot reach another's files (each request is rooted at its own viewDir).
 *   • `viewDir` is validated, not trusted, on every read (validateEntry — inv. #5).
 */

import { existsSync, statSync, createReadStream, readFileSync, rmSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { writePidFile, removePidFile } from '../lib/pid-file.mjs';
import { resolveRequestPath } from '../lib/resolve-request-path.mjs';
import {
  readRegistry, writeRegistry, pruneRegistry, validateEntry,
} from '../lib/registry.mjs';
import { renderHubLanding } from '../renderers/hub-dashboard.mjs';

// Read once at module load (avoids drift vs a hardcoded constant).
const PLUGIN_VERSION = (() => {
  try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version ?? ''; }
  catch { return ''; }
})();

// Aggregate live-reload for the landing page (reloads on ANY repo's render — no
// id filter). Served same-origin at /__sdlc/hub-reload.js so it satisfies the
// strict `script-src 'self'` CSP without a hub /_assets/ route.
const HUB_RELOAD_JS = "(()=>{if(!('EventSource' in window))return;const e=new EventSource('/__sdlc/events');e.addEventListener('reload',()=>window.location.reload());})();\n";

// Mirrors the per-repo daemon (scripts/render-sunflower-serve.mjs); kept in sync.
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

const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'";

const MAX_INJECT_BYTES = 1024 * 1024;   // skip meta-injection above 1 MB (§4.4 size guard)
const MAX_UPSERT_BYTES = 512 * 1024;    // registry entries are a few KB; cap the body

export function parseHubArgs(argv) {
  const args = {
    host: '127.0.0.1',
    port: 4173,
    pidFile: null,
    configHash: '',
    liveReload: true,
    maxSseClients: 200,
    maxWatchedRepos: 50,
    allowAllHosts: false,
    allowedHosts: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--host') args.host = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--pid-file') args.pidFile = argv[++i];
    else if (a === '--config-hash') args.configHash = argv[++i];
    else if (a === '--max-sse-clients') args.maxSseClients = Number(argv[++i]);
    else if (a === '--max-watched-repos') args.maxWatchedRepos = Number(argv[++i]);
    else if (a === '--no-live-reload') args.liveReload = false;
    else if (a === '--live-reload') args.liveReload = true;
    else if (a === '--allow-all-hosts') args.allowAllHosts = true;
    // Comma-separated extra Host names to admit (e.g. the tailnet MagicDNS name)
    // ON TOP OF the localhost allowlist — a targeted relaxation, not allow-all.
    else if (a === '--allowed-hosts') args.allowedHosts = String(argv[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

/* ───────────────────────── Host allowlist (invariant #6) ───────────────────────── */

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '');
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1).toLowerCase();   // [::1]:port
  return h.split(':')[0].toLowerCase();
}

function hostAllowed(req, allowAllHosts, extraHosts) {
  // When bound for public (Tailscale) access the user has explicitly
  // acknowledged exposure (machine-wide acknowledgedPublic), and legitimate
  // traffic arrives with a non-localhost Host — so the allowlist is relaxed and
  // the write token remains the protection. In the default localhost mode the
  // allowlist is the DNS-rebinding defence.
  if (allowAllHosts) return true;
  const h = hostnameOf(req.headers.host);
  // extraHosts holds targeted additions (e.g. the tailnet MagicDNS name) so
  // `tailscale serve` works without surrendering the allowlist for everything.
  return ALLOWED_HOSTNAMES.has(h) || (extraHosts != null && extraHosts.has(h));
}

/* ───────────────────────── server ───────────────────────── */

export function createHubServer({
  host = '127.0.0.1',
  port = 4173,
  token = '',
  configHash = '',
  liveReload = true,
  maxSseClients = 200,
  maxWatchedRepos = 50,
  allowAllHosts = false,
  allowedHosts = [],
} = {}) {
  const startedAt = Date.now();
  // Targeted Host-allowlist additions (e.g. the tailnet MagicDNS name), normalised
  // to lowercase. Consulted by hostAllowed ON TOP OF the localhost allowlist.
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));
  const clients = new Set();
  const metrics = { requests: 0, perRepoLastServed: {} };
  const watchers = new Map();   // id → fs watcher (Phase 3)
  let entries = [];
  let landingCache = { html: null, at: 0 };   // 2-second micro-cache (§5)
  const invalidateLanding = () => { landingCache.html = null; };

  // Fold shards in + drop dead/poisoned entries at startup, then load the
  // validated set. The hub is the sole writer of registry.json from here on.
  function reload() {
    try { pruneRegistry(); } catch { /* best-effort */ }
    try { entries = readRegistry().entries; } catch { entries = []; }
    rewatchAll();
    invalidateLanding();
  }

  /* ── live reload (Phase 3): watch each viewDir, filter on .last-render ── */
  function rewatchAll() {
    if (!liveReload) return;
    // Tear down watchers for entries that vanished.
    for (const [id, w] of watchers) {
      if (!entries.find((e) => e.id === id)) { try { w.close(); } catch { /* ignore */ } watchers.delete(id); }
    }
    // Beyond maxWatchedRepos, skip fs.watch (a future poll fallback covers it).
    let watched = watchers.size;
    for (const entry of entries) {
      if (watchers.has(entry.id)) continue;
      if (watched >= maxWatchedRepos) break;
      watchEntry(entry);
      watched++;
    }
  }

  function watchEntry(entry) {
    if (!liveReload || watchers.has(entry.id)) return;
    try {
      // Critique must-fix #3: watch the DIRECTORY and filter on filename, never
      // the .last-render path — watching a not-yet-existent file throws ENOENT
      // on Windows (a valid state for a registered-but-unrendered repo).
      const w = watch(entry.viewDir, (event, filename) => {
        if (filename && String(filename) !== '.last-render') return;
        // Re-read lastRenderedAt for the payload; tolerate races.
        let renderedAt = new Date().toISOString();
        try {
          const parsed = JSON.parse(readFileSync(`${entry.viewDir}/.last-render`, 'utf-8'));
          if (parsed.renderedAt) renderedAt = parsed.renderedAt;
        } catch { /* keep wall-clock */ }
        emit('reload', { id: entry.id, renderedAt });
      });
      watchers.set(entry.id, w);
    } catch { /* unwatchable viewDir — skip, served pages still work */ }
  }

  function emit(event, payload) {
    for (const res of clients) {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* a broken client is cleaned up on its own close */ }
    }
  }

  /* ── helpers ── */
  function tokenOk(req) {
    return Boolean(token) && req.headers['x-sdlc-token'] === token;
  }

  function healthPayload() {
    return {
      ok: true,
      status: 'ok',
      pid: process.pid,
      // Plugin version of THIS running hub. The supervisor compares it to its own
      // PLUGIN_VERSION and reaps a stale hub so a new install deterministically
      // takes over (the `entries` array below is the hub-vs-per-repo marker).
      version: PLUGIN_VERSION,
      uptimeMs: Date.now() - startedAt,
      configHash,
      entries: entries.map((e) => ({
        id: e.id, repoRoot: e.repoRoot, branch: e.branch,
        lastRenderedAt: e.lastRenderedAt, slugs: e.slugs,
      })),
      metrics: {
        requests: metrics.requests,
        sseClients: clients.size,
        perRepoLastServed: metrics.perRepoLastServed,
        rssBytes: process.memoryUsage().rss,
      },
    };
  }

  function dropEntry(id, reason) {
    entries = entries.filter((e) => e.id !== id);
    const w = watchers.get(id);
    if (w) { try { w.close(); } catch { /* ignore */ } watchers.delete(id); }
    try { writeRegistry(entries); } catch { /* ignore */ }
    invalidateLanding();
    logHub(`dropped entry ${id}: ${reason}`);
  }

  function mergeEntry(entry) {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) {
      const prevReg = entries[i].registeredAt;
      if (prevReg && (!entry.registeredAt || String(prevReg) < String(entry.registeredAt))) {
        entry.registeredAt = prevReg;   // keep the earliest registration time
      }
      entries[i] = entry;
    } else {
      entries.push(entry);
    }
  }

  function serveRepoFile({ req, res, id, rest }) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) { res.writeHead(404).end('unknown repo'); return; }
    // viewDir is validated, not trusted (§3.6, invariant #5).
    const v = validateEntry(entry);
    if (!v.ok) { dropEntry(id, v.reason); res.writeHead(410).end('repo entry no longer valid'); return; }

    const resolved = resolveRequestPath(entry.viewDir, rest);
    if (!resolved.ok) { res.writeHead(resolved.status).end(resolved.message); return; }
    if (!existsSync(resolved.path)) { res.writeHead(404).end('not found'); return; }
    let stats;
    try { stats = statSync(resolved.path); } catch { res.writeHead(404).end('not found'); return; }
    if (!stats.isFile()) { res.writeHead(404).end('not found'); return; }

    metrics.perRepoLastServed[id] = new Date().toISOString();
    serveFile({ req, res, filePath: resolved.path, stats, entryId: id });
  }

  function serveFile({ req, res, filePath, stats, entryId }) {
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';

    // INDEX.html responses get a per-repo id meta tag injected at serve time so
    // one SSE stream can serve every repo without cross-repo spurious reloads
    // (§4.4). Injection (and the Phase-5 brand/breadcrumb rewrite) happen here,
    // at serve time — registration stays flag-free. Size-guarded; everything
    // else streams untouched.
    const isIndexHtml = filePath.toLowerCase().endsWith('index.html');
    if (isIndexHtml && stats.size <= MAX_INJECT_BYTES) {
      let html;
      try { html = readFileSync(filePath, 'utf-8'); } catch { html = null; }
      if (html != null) {
        const body = Buffer.from(transformIndexHtml(html, entryId), 'utf-8');
        res.writeHead(200, {
          'content-type': type,
          'content-length': body.length,
          'cache-control': 'no-cache',
          'content-security-policy': CSP,
        });
        if (req.method === 'HEAD') { res.end(); return; }
        res.end(body);
        return;
      }
    }

    res.writeHead(200, {
      'content-type': type,
      'content-length': stats.size,
      'cache-control': 'no-cache',
      'content-security-policy': CSP,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(filePath).pipe(res);
  }

  // Serve-time transforms for INDEX.html (registration stays flag-free):
  //   1. inject <meta name=sdlc-repo-id> so one SSE stream can be filtered per
  //      repo (§4.4);
  //   2. inject the livereload client when the hub runs with live reload and the
  //      page wasn't rendered with its own (the common hub case — a repo
  //      rendered without view.serve.enabled);
  //   3. (Phase 5) rewrite the brand href to the hub root.
  function transformIndexHtml(html, entryId) {
    let out = html;
    // 1. id meta tag — injected always (cheap; identifies the repo for any
    //    client JS), even when live reload is off.
    if (entryId && !/name=["']sdlc-repo-id["']/.test(out)) {
      const tag = `<meta name="sdlc-repo-id" content="${escapeAttr(entryId)}">`;
      out = out.includes('</head>') ? out.replace('</head>', `  ${tag}\n</head>`) : `${tag}\n${out}`;
    }
    // 2. livereload client — reuse the renderer's asset base for a correct
    //    depth-relative src so live reload works through the hub even for pages
    //    rendered without serve.enabled.
    if (liveReload && !/\/livereload\.js/.test(out)) {
      const cssMatch = out.match(/href="([^"]*?)\/sdlc\.css(?:\?[^"]*)?"/);
      const assetBase = cssMatch ? cssMatch[1] : '_assets';
      const script = `<script src="${escapeAttr(assetBase)}/livereload.js" defer></script>`;
      out = out.includes('</body>') ? out.replace('</body>', `  ${script}\n</body>`) : `${out}\n${script}`;
    }
    // 3. rewrite the per-repo "brand" link (which points at the per-repo
    //    dashboard) to the hub root so the topnav brand resolves to `/`.
    out = rewriteBrandToHubRoot(out, entryId);
    return out;
  }

  function rewriteBrandToHubRoot(html, entryId) {
    if (!entryId) return html;
    // The shell renders: <a class="brand" href="…/..">.ai/workflows</a> and a
    // breadcrumb whose first crumb is <a href="…">sdlc</a>. Repoint the brand to
    // the hub root. Conservative: only rewrites the explicit brand anchor.
    return html.replace(
      /(<a class="brand" href=")[^"]*(")/,
      `$1/$2`,
    );
  }

  function serveLanding(req, res) {
    const now = Date.now();
    // 2-second micro-cache: rapid hits don't re-render; mutations invalidate it.
    if (!landingCache.html || now - landingCache.at > 2000) {
      landingCache = {
        html: renderHubLanding(entries, { pluginVersion: PLUGIN_VERSION, uptimeMs: now - startedAt, now }),
        at: now,
      };
    }
    const body = landingCache.html;
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-cache',
      'content-security-policy': CSP,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    res.end(body);
  }

  function handleEvents(req, res) {
    if (!liveReload) { res.writeHead(404).end('live reload disabled'); return; }
    if (clients.size >= maxSseClients) { res.writeHead(503).end('too many live-reload clients'); return; }
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    clients.add(res);
    res.write('retry: 1000\n\n');
    try { res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`); } catch { /* ignore */ }
    req.on('close', () => clients.delete(res));
  }

  function handleUpsert(req, res) {
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (body.length + chunk.length > MAX_UPSERT_BYTES) { tooBig = true; return; }
      body += chunk;
    });
    req.on('error', () => { try { res.writeHead(400).end('read error'); } catch { /* ignore */ } });
    req.on('end', () => {
      if (tooBig) { res.writeHead(413).end('entry too large'); return; }
      let entry;
      try { entry = JSON.parse(body); } catch { res.writeHead(400).end('bad json'); return; }
      const v = validateEntry(entry);
      if (!v.ok) { res.writeHead(422).end(`invalid entry: ${v.reason}`); return; }
      mergeEntry(entry);
      try { writeRegistry(entries); } catch { /* ignore */ }
      watchEntry(entry);
      invalidateLanding();
      sendJson(res, { ok: true, id: entry.id });
    });
  }

  const server = createServer((req, res) => {
    metrics.requests++;

    // Global gate (all routes): defeat DNS-rebinding (invariant #6).
    if (!hostAllowed(req, allowAllHosts, extraHosts)) { res.writeHead(403).end('forbidden host'); return; }

    let url;
    try { url = new URL(req.url ?? '/', 'http://sdlc.hub'); }
    catch { res.writeHead(400).end('bad request'); return; }
    const p = url.pathname;

    if (p === '/__sdlc/health') { sendJson(res, healthPayload()); return; }
    if (p === '/__sdlc/hub-reload.js') {
      res.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'content-length': Buffer.byteLength(HUB_RELOAD_JS),
        'cache-control': 'no-cache',
        'content-security-policy': CSP,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(HUB_RELOAD_JS);
      return;
    }
    if (p === '/__sdlc/events') { handleEvents(req, res); return; }
    if (p === '/__sdlc/registry') { sendJson(res, { version: 1, entries }); return; }
    if (p === '/__sdlc/registry/refresh') {
      if (!tokenOk(req)) { res.writeHead(403).end('forbidden'); return; }
      reload();
      sendJson(res, { ok: true, entries: entries.length });
      return;
    }
    if (p === '/__sdlc/registry/upsert') {
      if (req.method !== 'POST') { res.writeHead(405).end('method not allowed'); return; }
      if (!tokenOk(req)) { res.writeHead(403).end('forbidden'); return; }
      handleUpsert(req, res);
      return;
    }

    const m = p.match(/^\/r\/([^/]+)(\/.*)?$/);
    if (m) {
      if (m[2] === undefined) { res.writeHead(301, { location: `/r/${m[1]}/` }).end(); return; }
      serveRepoFile({ req, res, id: decodeURIComponent(m[1]), rest: m[2] });
      return;
    }

    if (p === '/') { serveLanding(req, res); return; }

    res.writeHead(404).end('not found');
  });

  // Per-request read timeouts (slow-loris hardening). These bound how long a
  // client has to SEND its request; the timer clears once the request is fully
  // received, so an established long-lived SSE response is NOT affected.
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;

  const close = server.close.bind(server);
  server.close = (callback) => {
    for (const [, w] of watchers) { try { w.close(); } catch { /* ignore */ } }
    watchers.clear();
    for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
    clients.clear();
    return close(callback);
  };

  reload();
  return server;
}

/* ───────────────────────── small utils ───────────────────────── */

function sendJson(res, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache',
  });
  res.end(body);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function escapeAttr(s) { return escapeHtml(s); }

function logHub(line) {
  console.log(`[hub] ${line}`);
}

/* ───────────────────────── entrypoint ───────────────────────── */

async function main() {
  const args = parseHubArgs(process.argv.slice(2));
  if (args.host === '0.0.0.0' && !args.allowAllHosts) {
    console.error('[hub] refusing 0.0.0.0 without --allow-all-hosts');
    process.exit(2);
  }
  const token = process.env.SDLC_HUB_TOKEN ?? '';
  const server = createHubServer({ ...args, token });

  server.listen(args.port, args.host, async () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : args.port;
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid, host: args.host, port: boundPort, token, configHash: args.configHash,
      });
    }
    console.log(`[hub] listening on http://${args.host}:${boundPort}`);
  });

  let cleaning = false;
  const shutdown = async () => {
    if (cleaning) return;
    cleaning = true;
    server.close(async () => {
      if (args.pidFile) await removePidFile(args.pidFile);
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  // Windows has no catchable SIGTERM — a kill abruptly terminates the process,
  // so SIGTERM/SIGINT handlers may never run. Remove the pid file on any normal
  // exit (synchronously — async fs is unsafe in an 'exit' handler). Abrupt
  // TerminateProcess is covered by stopHub + the stale-PID recovery on next start.
  process.on('exit', () => {
    if (args.pidFile) { try { rmSync(args.pidFile, { force: true }); } catch { /* ignore */ } }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[hub] fatal:', err.stack ?? err.message);
    process.exit(1);
  });
}
