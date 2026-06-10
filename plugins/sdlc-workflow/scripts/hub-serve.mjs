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
import { basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { writePidFile, removePidFile } from '../lib/pid-file.mjs';
import { resolveRequestPath } from '../lib/resolve-request-path.mjs';
import { hostAllowed } from '../lib/host-allowlist.mjs';
import {
  readRegistry, writeRegistry, pruneRegistry, validateEntry, REGISTRY_VERSION,
} from '../lib/registry.mjs';
import { refreshEntriesLiveness } from '../lib/branch-liveness.mjs';
import {
  codeBrowserConfigFromEnv, normalizeCodeBrowserConfig,
  serveCodeBrowser, serveCodeBrowserAsset,
} from '../lib/code-browser.mjs';
import { renderHubLanding } from '../renderers/hub-dashboard.mjs';
import { renderCodeBrowserPage } from '../renderers/_code-browser-page.mjs';

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

// The plugin's own documentation site (docs/site) is FIRST-PARTY content we
// author — unlike a repo's `.html.fragment` output, which is semi-trusted and
// gets the strict `script-src 'self'` CSP above. The docs pages use an inline
// module script (the mobile-nav drawer) and import Mermaid from the jsDelivr
// CDN, both of which the strict CSP would block. This relaxed policy — scoped to
// the `/docs/` route ONLY — admits inline scripts and jsDelivr while still
// pinning everything else to same-origin. Repo views and the landing page keep
// CSP unchanged.
const DOCS_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";

// Absolute path to the committed docs site. Resolved off this module's own URL
// so it works identically from source (scripts/hub-serve.mjs) and the bundle
// (dist/hub-serve.mjs) — both sit exactly one level under the plugin root (the
// build's depth-1 invariant), so `../docs/site` lands on the real tree either
// way. Resolved once; null only if the URL can't be converted (never in practice).
const DOCS_ROOT = (() => {
  try { return fileURLToPath(new URL('../docs/site', import.meta.url)); }
  catch { return null; }
})();

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
// Extracted to lib/host-allowlist.mjs so the per-repo daemon's `__code` routes
// share the exact same audited gate. Semantics unchanged: relaxed only under
// the explicit public (Tailscale-acknowledged) mode, where the write token
// remains the protection; extraHosts holds targeted additions (the tailnet
// MagicDNS name) so `tailscale serve` works without surrendering the allowlist.

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
  codeBrowser = null,
} = {}) {
  const startedAt = Date.now();
  // Targeted Host-allowlist additions (e.g. the tailnet MagicDNS name), normalised
  // to lowercase. Consulted by hostAllowed ON TOP OF the localhost allowlist.
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));
  // Code-browser config (CODEBASE-BROWSER-PLAN §5): machine-wide block from
  // hub-config.json, delivered via env by the supervisor (JSON can't ride argv
  // through the Windows launch-hidden.vbs shim). enabled:false 404s every
  // `__code` route and drops the serve-time topbar link.
  const cbCfg = normalizeCodeBrowserConfig(codeBrowser);
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
    // Opportunistic liveness refresh (§4.3): a branch deleted AFTER the last
    // render flips to `gone` here without needing a re-render. Local-git only
    // (checkPr:false) so the reload never blocks on the network; best-effort.
    try { refreshEntriesLiveness(entries); } catch { /* best-effort */ }
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
        id: e.id, repoRoot: e.repoRoot, headBranch: e.headBranch ?? e.branch ?? null,
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

  // The code browser (CODEBASE-BROWSER-PLAN): `/r/<id>/__code/*` serves the
  // repo's SOURCE working tree (read-only), not its view. Same entry guard as
  // serveRepoFile — the entry is validated, never trusted — then the shared
  // adapter (lib/code-browser.mjs) owns containment/deny/caps. `idRaw` is the
  // UNdecoded id segment so basePath matches url.pathname verbatim.
  function serveRepoCode({ req, res, url, idRaw }) {
    const id = decodeURIComponent(idRaw);
    const entry = entries.find((e) => e.id === id);
    if (!entry) { res.writeHead(404).end('unknown repo'); return; }
    const v = validateEntry(entry);
    if (!v.ok) { dropEntry(id, v.reason); res.writeHead(410).end('repo entry no longer valid'); return; }

    metrics.perRepoLastServed[id] = new Date().toISOString();
    serveCodeBrowser({
      req, res, url,
      basePath: `/r/${idRaw}/__code`,
      repoRoot: entry.repoRoot,
      repoId: entry.id,
      repoLabel: basename(entry.repoRoot),
      headBranch: entry.headBranch ?? entry.branch ?? null,
      config: cbCfg,
      pluginVersion: PLUGIN_VERSION,
      csp: CSP,
      renderPage: renderCodeBrowserPage,
      // Reachable beyond loopback → the adapter ignores serveSecrets:true.
      publicExposure: allowAllHosts || extraHosts.size > 0,
    });
  }

  // Serve the plugin's own docs site (docs/site) under /docs/. Reuses the same
  // containment kernel as the repo routes — rooted at DOCS_ROOT with the
  // lowercase index basename — so a traversal can never escape the docs tree.
  // No meta/brand/livereload injection (these are static authored pages, not
  // rendered artifacts); the relaxed DOCS_CSP lets their inline nav script and
  // Mermaid CDN import run.
  function serveDocsFile({ req, res, rest }) {
    if (!DOCS_ROOT || !existsSync(DOCS_ROOT)) { res.writeHead(404).end('docs not available'); return; }
    const resolved = resolveRequestPath(DOCS_ROOT, rest, { indexFile: 'index.html' });
    if (!resolved.ok) { res.writeHead(resolved.status).end(resolved.message); return; }
    if (!existsSync(resolved.path)) { res.writeHead(404).end('not found'); return; }
    let stats;
    try { stats = statSync(resolved.path); } catch { res.writeHead(404).end('not found'); return; }
    if (!stats.isFile()) { res.writeHead(404).end('not found'); return; }

    const type = MIME[extname(resolved.path).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': stats.size,
      'cache-control': 'no-cache',
      'content-security-policy': DOCS_CSP,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(resolved.path).pipe(res);
  }

  function serveFile({ req, res, filePath, stats, entryId }) {
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';

    // ANY html response gets the serve-time transforms (id meta tag for per-repo
    // SSE filtering §4.4, live-reload injection, and the brand→hub rewrite). This
    // is keyed on the `.html` extension, NOT just INDEX.html, so project-context
    // pages (project/PRODUCT.html, project/ship-plan.html) — which are real
    // `.html` files, not INDEX.html — get the same hub brand + live reload as
    // every slug/stage page, instead of being served untransformed with a brand
    // still pointing at the repo root. Registration stays flag-free; size-guarded;
    // non-html (css/svg/json/yaml) streams untouched.
    const isHtml = extname(filePath).toLowerCase() === '.html';
    if (isHtml && stats.size <= MAX_INJECT_BYTES) {
      let html;
      try { html = readFileSync(filePath, 'utf-8'); } catch { html = null; }
      if (html != null) {
        const body = Buffer.from(transformServedHtml(html, entryId), 'utf-8');
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

  // Serve-time transforms for any served html page (registration stays flag-free):
  //   1. inject <meta name=sdlc-repo-id> so one SSE stream can be filtered per
  //      repo (§4.4);
  //   2. inject the livereload client when the hub runs with live reload and the
  //      page wasn't rendered with its own (the common hub case — a repo
  //      rendered without view.serve.enabled);
  //   3. (Phase 5) rewrite the brand href + label to the hub root.
  function transformServedHtml(html, entryId) {
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
    // 4. code-browser entry point (CODEBASE-BROWSER-PLAN §0.2-7): injected at
    //    SERVE time, not render time — `__code/` is a server-only route, so a
    //    baked-in link would dead-end under file:// browsing and couldn't track
    //    the machine-wide enabled state. Prepended inside the topbar actions
    //    cell; idempotent via the class probe.
    if (cbCfg.enabled && entryId && !/class="code-link"/.test(out)) {
      // Global, and tolerant of extra class tokens: the shell renders TWO
      // actions cells — the desktop topbar's `class="actions"` and the mobile
      // menu sheet's `class="actions m-sheet-links"` — and both carry the
      // affordance (the topbar is display:none on phones).
      out = out.replace(
        /(<div class="actions[^"]*">)/g,
        `$1<a class="code-link" href="/r/${encodeURIComponent(entryId)}/__code/">code ↗</a><span aria-hidden="true"> · </span>`,
      );
    }
    return out;
  }

  function rewriteBrandToHubRoot(html, entryId) {
    if (!entryId) return html;
    // The shell renders the per-repo brand as
    //   <a class="brand" href="…/..">.ai/workflows</a>
    // pointing at the repo's own dashboard. Under the hub the brand is the
    // top-of-server "home" affordance, so repoint it at the hub root AND relabel
    // it — clicking ".ai/workflows" and landing on the multi-repo hub was a
    // label/destination mismatch. The breadcrumb's first "sdlc" crumb stays the
    // repo-local home (/r/<id>/), giving a clean two-tier trail: hub → repo →
    // slug → stage. Global: the shell renders the brand anchor twice — desktop
    // topbar + mobile menu sheet — and both must repoint, or phones (where the
    // topbar is display:none) get no path to the hub at all.
    return html.replace(
      /<a class="brand" href="[^"]*">[^<]*<\/a>/g,
      '<a class="brand" href="/">sdlc hub</a>',
    );
  }

  function serveLanding(req, res) {
    const now = Date.now();
    // 2-second micro-cache: rapid hits don't re-render; mutations invalidate it.
    if (!landingCache.html || now - landingCache.at > 2000) {
      landingCache = {
        html: renderHubLanding(entries, {
          pluginVersion: PLUGIN_VERSION, uptimeMs: now - startedAt, now,
          codeBrowserEnabled: cbCfg.enabled,
        }),
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
    // Committed browser-bundle assets (shared by every repo's code page).
    // Gated on the kill switch so enabled:false really does 404 everything.
    if (p === '/__sdlc/code-browser.js' || p === '/__sdlc/code-browser.css') {
      if (!cbCfg.enabled) { res.writeHead(404).end('not found'); return; }
      serveCodeBrowserAsset({ req, res, name: p.slice('/__sdlc/'.length) });
      return;
    }
    if (p === '/__sdlc/registry') { sendJson(res, { version: REGISTRY_VERSION, entries }); return; }
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

    // Plugin docs site (first-party static pages). `/docs` (no trailing slash)
    // redirects to `/docs/` so the docs' relative links resolve against the docs
    // root, not the hub root.
    const dm = p.match(/^\/docs(\/.*)?$/);
    if (dm) {
      if (dm[1] === undefined) { res.writeHead(301, { location: '/docs/' }).end(); return; }
      serveDocsFile({ req, res, rest: dm[1] });
      return;
    }

    const m = p.match(/^\/r\/([^/]+)(\/.*)?$/);
    if (m) {
      if (m[2] === undefined) { res.writeHead(301, { location: `/r/${m[1]}/` }).end(); return; }
      // `__code` is a server route family, not a view file — intercept before
      // the view resolver so it can never shadow (or be shadowed by) a slug.
      if (m[2] === '/__code' || m[2].startsWith('/__code/')) {
        serveRepoCode({ req, res, url, idRaw: m[1] });
        return;
      }
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
  // codeBrowser config arrives via env (JSON can't ride argv through the
  // Windows launch-hidden.vbs shim) — same channel as the write token.
  const server = createHubServer({ ...args, token, codeBrowser: codeBrowserConfigFromEnv() });

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
