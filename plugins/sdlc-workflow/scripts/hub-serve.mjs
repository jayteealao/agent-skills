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
  logPrune, entryWithinGrace, REGISTRY_FRESH_GRACE_MS,
} from '../lib/registry.mjs';
import { refreshEntriesLiveness } from '../lib/branch-liveness.mjs';
import {
  codeBrowserConfigFromEnv, normalizeCodeBrowserConfig,
  serveCodeBrowser, serveCodeBrowserAsset,
} from '../lib/code-browser.mjs';
import {
  createHealController, staleRenderConfigFromEnv,
} from '../lib/heal-render.mjs';
import {
  runtimeIdentity, readRenderedIdentity, renderIdentityMatches,
} from '../lib/runtime-manifest.mjs';
import { createRenderQueueDrainer, countPending, enqueue as enqueueRenderJob } from '../lib/render-queue.mjs';
import { renderHubLanding } from '../renderers/hub-dashboard.mjs';
import { renderCodeBrowserPage } from '../renderers/_code-browser-page.mjs';

// Shared runtime identity (NATIVE-INTEROP Workstream B): the host-neutral
// { runtimeVersion, buildId, hubName, hubProtocolVersion } both plugins carry
// identically. Hub adoption keys on runtimeVersion; render freshness on buildId.
// Read once at module load.
const RUNTIME = runtimeIdentity();
// Legacy display alias — the shared runtimeVersion (was the plugin package
// version pre-9.75). Kept for the landing page / code-browser footer / health
// `version` field during migration.
const PLUGIN_VERSION = RUNTIME.runtimeVersion;
// Diagnostic only: which host started this hub. Supervisors pass it via env; it
// never controls adoption or behaviour (NATIVE-INTEROP "startedBy is diagnostic").
const STARTED_BY_HOST = process.env.SDLC_HUB_STARTED_BY || 'claude';

// Plugin root, resolved off this module's own URL so it works identically from
// source (scripts/hub-serve.mjs) and the bundle (dist/hub-serve.mjs) — both sit
// one level under the plugin root (the build's depth-1 invariant). Used to
// resolve the render-sunflower entrypoint for stale-render heals.
const PLUGIN_ROOT = (() => {
  try { return fileURLToPath(new URL('..', import.meta.url)); }
  catch { return null; }
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

// Coalesce reloads per repo. A render both POSTs (handleUpsert) and trips the
// fs.watch backstop, and atomic-rename writes can double-fire the watcher; the
// first emit for an id inside this window wins, the rest collapse — so one
// render reloads the browser exactly once.
const RELOAD_DEBOUNCE_MS = 500;

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
  heartbeatMs = 25000,
  reconcileMs = 10000,
  // Fresh-registration survival window (F2) — how long a never-rendered,
  // empty-queue entry survives the reconcile prune. Injectable for tests.
  registrationGraceMs = REGISTRY_FRESH_GRACE_MS,
  pluginRoot = PLUGIN_ROOT,
  // Stale-render heal config (STALE-RENDER-HEAL-PLAN §3). null → off; main()
  // supplies the env-derived machine config (heal defaults ON there). Mirrors
  // the `codeBrowser = null` → disabled constructor default, so existing callers
  // (tests) are unaffected unless they opt in.
  staleRender = null,
  // Injectable render-spawn seam (tests pass a stub); default is the real
  // tracked node spawn inside the heal controller.
  spawnRender = undefined,
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
  const lastReloadAt = new Map();   // id → ms of last emitted reload (coalesce)
  const lastRenderMtime = new Map();   // id → last seen .last-render mtimeMs (reconcile backstop)
  let entries = [];
  let landingCache = { html: null, at: 0 };   // 2-second micro-cache (§5)
  const invalidateLanding = () => { landingCache.html = null; };

  // Stale-render heal controller (STALE-RENDER-HEAL-PLAN §4-§5). reconcile()
  // calls heal.consider(entry) per entry each tick; on version drift it spawns a
  // background `render-sunflower --clean` for that repo, off the request path.
  // emitReload is belt-and-braces — the render's `.last-render` rewrite already
  // trips the fs.watch — but it covers repos beyond the maxWatchedRepos cap whose
  // watcher isn't installed. `staleRender ?? { heal: false }`: an omitted config
  // means heal off (safe constructor default), matching codeBrowser.
  const heal = createHealController({
    pluginRoot,
    pluginVersion: RUNTIME.runtimeVersion,
    buildId: RUNTIME.buildId,
    healCfg: staleRender ?? { heal: false },
    log: logHub,
    emitReload: (id) => emitReload(id),
    spawnRender,
  });

  // Render-queue drainer (RENDER-DISPATCH-PLAN). Funnels queued, hook-reported
  // writes through the SAME bounded engine as heal (heal.submit / heal.isBusy),
  // so a queue render and a heal render for one repo never run concurrently.
  // Runs regardless of the heal toggle — heal.submit is unconditional (only
  // drift detection is gated by heal:false), so queue dispatch works even when a
  // user has heal off. maxAttempts mirrors the heal cap (same "give up after N").
  const renderQueue = createRenderQueueDrainer({
    submit: (entry, spec) => heal.submit(entry, spec),
    isBusy: (id) => heal.isBusy(id),
    pluginRoot,
    log: logHub,
    maxAttempts: heal.config.maxAttempts,
  });

  // F2 (FRESH-REPO-REGISTRATION-FIX-PLAN): a repo that registered but has never
  // rendered has no `.last-render` — historically the prune paths reaped it
  // within one tick, so a brand-new repo could never become visible. Queue ONE
  // whole-repo bootstrap render for such an entry: the pending job both carries
  // it through the prune predicates and produces its first view. Idempotence is
  // the two gates — an already-rendered repo or one with queued work is left
  // alone, so re-registration never re-renders anything.
  function ensureBootstrapQueued(entry) {
    try {
      if (!entry?.id || !entry.viewDir || !entry.repoRoot) return;
      if (!existsSync(entry.viewDir)) return;
      if (existsSync(`${entry.viewDir}/.last-render`)) return;
      if (countPending(entry.viewDir) > 0) return;
      const r = enqueueRenderJob(entry.viewDir, {
        repoRoot: entry.repoRoot,
        kind: 'bootstrap',
        bucket: '__bootstrap__',
        enqueuedBy: { host: STARTED_BY_HOST, pid: process.pid },
      });
      if (r.ok) logHub(`bootstrap render queued for never-rendered ${entry.id}`);
    } catch { /* best-effort — the registration grace still covers the entry */ }
  }

  // Fold shards in + drop dead/poisoned entries at startup, then load the
  // validated set. The hub is the sole writer of registry.json from here on.
  function reload() {
    try { pruneRegistry(); } catch { /* best-effort */ }
    try { entries = readRegistry().entries; } catch { entries = []; }
    // Opportunistic liveness refresh (§4.3): a branch deleted AFTER the last
    // render flips to `gone` here without needing a re-render. Local-git only
    // (checkPr:false) so the reload never blocks on the network; best-effort.
    try { refreshEntriesLiveness(entries); } catch { /* best-effort */ }
    // F2: entries that arrived via shard while the hub was down get their
    // bootstrap render queued here (the POST path queues at accept time).
    for (const e of entries) ensureBootstrapQueued(e);
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
    // Beyond maxWatchedRepos, skip the fs.watch backstop. Live-reload still
    // reaches these repos: the render's registration POST drives reloads
    // directly (handleUpsert → emitReload), uncapped — the watcher only backs
    // up renders that didn't POST.
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
        emitReload(entry.id, renderedAt);
      });
      // An FSWatcher is an EventEmitter: a runtime 'error' (e.g. EPERM on Windows
      // when the watched .ai/_view is removed + recreated by `git clean`) with NO
      // listener THROWS on the event loop and crashes the daemon. Tear the dead
      // watcher down so rewatchAll() can re-establish it later; reloads keep
      // flowing via the push path in the meantime.
      w.on('error', () => {
        try { w.close(); } catch { /* ignore */ }
        watchers.delete(entry.id);
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

  // Coalesced per-repo reload. BOTH the push path (handleUpsert — the primary,
  // uncapped trigger: every live-hub render POSTs) and the fs.watch backstop call
  // this; the first to fire for an id within RELOAD_DEBOUNCE_MS wins so a render
  // that POSTs *and* trips the watcher reloads the browser exactly once.
  function emitReload(id, renderedAt) {
    if (!liveReload || !id) return;
    const now = Date.now();
    if (now - (lastReloadAt.get(id) ?? 0) < RELOAD_DEBOUNCE_MS) return;
    lastReloadAt.set(id, now);
    emit('reload', { id, renderedAt });
  }

  // Level-triggered reconcile, run on a timer (reconcileMs) — the backstop the
  // otherwise purely edge-triggered hub lacks. Two cheap jobs (deliberately NO
  // git/liveness work, so it stays light on a short interval):
  //   1. PRUNE — drop entries whose repoRoot/viewDir/.last-render vanished so a
  //      deleted checkout falls off the landing page WITHOUT waiting for a serve-
  //      time 410 or a hub restart. Persisted only when something changed (no 10s
  //      registry.json rewrite-storm).
  //   2. mtime BACKSTOP — for an entry with no live watcher (beyond the
  //      maxWatchedRepos cap, or whose watcher errored out), compare .last-render's
  //      mtime to the last seen value and emit a coalesced reload on change. This
  //      is the live-reload path for repos fs.watch cannot cover.
  function reconcile() {
    // 1. prune vanished entries
    let changed = false;
    const live = [];
    for (const e of entries) {
      // Keep a repo with rendered output OR pending queue work — a freshly
      // registered repo whose first render is still queued has no .last-render yet
      // (RENDER-DISPATCH-PLAN) — OR a registration younger than the grace window
      // (F2 — its bootstrap render may not even be queued yet). Missing backing
      // dirs prune immediately regardless of grace: that arm is the real GC.
      const backing = existsSync(e.repoRoot) && existsSync(e.viewDir);
      const present = backing
        && (existsSync(`${e.viewDir}/.last-render`) || countPending(e.viewDir) > 0
          || entryWithinGrace(e, registrationGraceMs));
      if (present) { live.push(e); continue; }
      changed = true;
      const w = watchers.get(e.id);
      if (w) { try { w.close(); } catch { /* ignore */ } watchers.delete(e.id); }
      lastReloadAt.delete(e.id);
      lastRenderMtime.delete(e.id);
      // F3: mirror every reconcile prune into registry.prune.log — a daemon's
      // stdout is gone once its console closes, and a reaped repo used to leave
      // zero on-disk trace. The reason string distinguishes the two arms.
      const reason = backing
        ? 'no .last-render + empty queue past registration grace'
        : 'backing files gone';
      logHub(`reconcile: pruned ${e.id} (${reason})`);
      logPrune(`reconcile-prune ${e.id} (${e.repoRoot ?? '?'}): ${reason}`);
    }
    if (changed) {
      entries = live;
      try { writeRegistry(entries); } catch { /* ignore */ }
      rewatchAll();          // a freed slot may now admit a previously-capped repo
      invalidateLanding();
    }

    // 2. mtime backstop for repos fs.watch does not cover
    for (const e of entries) {
      if (watchers.has(e.id)) continue;   // watched repos reload via fs.watch
      const marker = `${e.viewDir}/.last-render`;
      let mtime;
      try { mtime = statSync(marker).mtimeMs; } catch { lastRenderMtime.delete(e.id); continue; }
      const prev = lastRenderMtime.get(e.id);
      lastRenderMtime.set(e.id, mtime);
      if (prev !== undefined && mtime !== prev) {
        let renderedAt = new Date().toISOString();
        try {
          const parsed = JSON.parse(readFileSync(marker, 'utf-8'));
          if (parsed.renderedAt) renderedAt = parsed.renderedAt;
        } catch { /* keep wall-clock */ }
        emitReload(e.id, renderedAt);
      }
    }

    // 3. version-drift heal (STALE-RENDER-HEAL-PLAN §4). Level-triggered, like
    // prune and the mtime backstop: ask the heal controller to consider every
    // entry. It no-ops when heal is off or the rendered version matches; on drift
    // it spawns a bounded background `render-sunflower --clean`. Runs for ALL
    // entries (watched or not) — drift is independent of fs.watch coverage. The
    // controller swallows its own errors, so this never escalates to reconcile.
    for (const e of entries) heal.consider(e);

    // 4. render-queue drain (RENDER-DISPATCH-PLAN). Same level-triggered shape:
    // claim each repo's queued, hook-reported writes, coalesce them to one render
    // and hand it to the bounded engine. The drainer swallows its own errors.
    for (const e of entries) renderQueue.drainEntry(e);
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
      // Structured shared-runtime identity (NATIVE-INTEROP Workstream B). The
      // supervisor adopts a hub whose hubName + protocol are compatible and whose
      // runtimeVersion matches — it never reaps merely because the caller's PLUGIN
      // package version differs. `entries` (below) is still the hub-vs-per-repo
      // marker. `startedBy` is diagnostic only and does not control adoption.
      hub: {
        name: RUNTIME.hubName,
        protocolVersion: RUNTIME.hubProtocolVersion,
        runtimeVersion: RUNTIME.runtimeVersion,
        buildId: RUNTIME.buildId,
      },
      startedBy: { host: STARTED_BY_HOST },
      // Legacy compatibility alias — the shared runtimeVersion (was the plugin
      // package version pre-9.75). A pre-9.75 supervisor still reads this.
      version: PLUGIN_VERSION,
      uptimeMs: Date.now() - startedAt,
      configHash,
      entries: entries.map((e) => {
        // Read the rendered identity LIVE from .last-render (source of truth) so
        // `stale` reflects the current on-disk state, not the entry snapshot
        // (STALE-RENDER-HEAL-PLAN §9). Keys on buildId when present, else version;
        // an unversioned/unbuilt marker = stale.
        const rendered = readRenderedIdentity(`${e.viewDir}/.last-render`);
        return {
          id: e.id, repoRoot: e.repoRoot, headBranch: e.headBranch ?? e.branch ?? null,
          lastRenderedAt: e.lastRenderedAt, slugs: e.slugs,
          renderedVersion: rendered.version,
          renderedBuildId: rendered.buildId,
          stale: !renderIdentityMatches(rendered, RUNTIME),
        };
      }),
      // Stale-render heal state: { heal, maxConcurrent, inFlight, queued, failed }.
      heal: heal.snapshot(),
      // Render-queue state (RENDER-DISPATCH-PLAN): { pending:{id:n}, failed[], lastDrainAt }.
      renderQueue: renderQueue.snapshot(entries),
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
    lastReloadAt.delete(id);
    lastRenderMtime.delete(id);
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
      // F2: a first-time registration has no rendered view — queue its bootstrap
      // render and drain immediately rather than waiting for the next reconcile
      // tick. Both calls are cheap no-ops for the common re-render POST.
      ensureBootstrapQueued(entry);
      renderQueue.drainEntry(entry);
      // Drive the browser reload from the push itself — the primary, uncapped
      // trigger. fs.watch is only a backstop now: it can miss events on Windows
      // atomic-rename writes and is capped at maxWatchedRepos.
      emitReload(entry.id, entry.lastRenderedAt);
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

  // SSE keep-alive: an idle event-stream (especially through `tailscale serve` in
  // the public-exposure mode) can be reaped by proxy/idle timeouts, silently
  // killing live-reload. A periodic comment line (`: ping`) is ignored by
  // EventSource but resets those timers and lets a half-dead socket surface as a
  // write error (the client is then cleaned up on its own 'close'). unref so the
  // timer never holds the process open.
  const heartbeat = liveReload
    ? setInterval(() => {
        for (const res of clients) {
          try { res.write(': ping\n\n'); } catch { /* broken client cleaned up on its own close */ }
        }
      }, heartbeatMs)
    : null;
  if (heartbeat && typeof heartbeat.unref === 'function') heartbeat.unref();

  // Level-triggered reconcile loop (prune vanished repos + mtime reload backstop
  // for un-fs.watched repos). Runs regardless of liveReload — the prune keeps the
  // landing page honest even with reloads off, and emitReload no-ops when
  // liveReload is false. unref so it never holds the process open; wrapped so a
  // transient error never escalates to an uncaughtException on the interval.
  const reconcileTimer = setInterval(() => {
    try { reconcile(); } catch (err) { logHub(`reconcile error: ${err?.message ?? err}`); }
  }, reconcileMs);
  if (typeof reconcileTimer.unref === 'function') reconcileTimer.unref();

  const close = server.close.bind(server);
  server.close = (callback) => {
    if (heartbeat) clearInterval(heartbeat);
    clearInterval(reconcileTimer);
    for (const [, w] of watchers) { try { w.close(); } catch { /* ignore */ } }
    watchers.clear();
    for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
    clients.clear();
    return close(callback);
  };

  reload();

  // Startup catch-up (RENDER-DISPATCH-PLAN "Catch-up on start"): immediately
  // reclaim any orphaned in-flight claims and drain everything queued while the
  // hub was down, before the 10s reconcile cadence begins. reload() has already
  // populated `entries` (folding in any registry.d/ shards a hook dropped while
  // the hub was down). Best-effort — never block startup.
  try { renderQueue.catchUp(entries); } catch (err) { logHub(`render-queue catch-up error: ${err?.message ?? err}`); }

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
  // codeBrowser + staleRender configs arrive via env (JSON can't ride argv
  // through the Windows launch-hidden.vbs shim) — same channel as the write
  // token. staleRender carries the heal settings (heal defaults ON machine-wide).
  const server = createHubServer({
    ...args,
    token,
    codeBrowser: codeBrowserConfigFromEnv(),
    staleRender: staleRenderConfigFromEnv(),
  });

  server.listen(args.port, args.host, async () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : args.port;
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid, host: args.host, port: boundPort, token, configHash: args.configHash,
        // Shared-runtime identity on the PID record (NATIVE-INTEROP "PID Record")
        // so a supervisor can adopt/diagnose without an HTTP probe. runtimeRoot is
        // THIS hub's own plugin root — which, when started from the machine store,
        // IS the store dir; the render seam + supervisor read it back from here.
        // (The hub rewrites hub.pid on bind, so it must carry runtimeRoot too or it
        // would clobber the supervisor's pre-write.)
        hubName: RUNTIME.hubName,
        hubProtocolVersion: RUNTIME.hubProtocolVersion,
        runtimeVersion: RUNTIME.runtimeVersion,
        buildId: RUNTIME.buildId,
        // Strip the trailing separator so this matches the supervisor's canonical
        // join()-form runtimeRoot byte-for-byte (PLUGIN_ROOT is derived from a
        // `new URL('..', …)` that leaves a trailing slash).
        runtimeRoot: PLUGIN_ROOT ? PLUGIN_ROOT.replace(/[\\/]+$/, '') : PLUGIN_ROOT,
        startedByHost: STARTED_BY_HOST,
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
