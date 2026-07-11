#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderHubLanding
} from "./chunk-J4SDR4ZU.mjs";
import "./chunk-KZKRD7HT.mjs";
import "./chunk-PDBKNARE.mjs";
import {
  hostAllowed,
  renderCodeBrowserPage,
  resolveRequestPath
} from "./chunk-IOYXLHW6.mjs";
import {
  codeBrowserConfigFromEnv,
  createHealController,
  normalizeCodeBrowserConfig,
  serveCodeBrowser,
  serveCodeBrowserAsset,
  staleRenderConfigFromEnv
} from "./chunk-J2RO6O56.mjs";
import "./chunk-SWU6HFSL.mjs";
import "./chunk-4WRIEOIP.mjs";
import {
  readRenderedIdentity,
  renderIdentityMatches,
  runtimeIdentity
} from "./chunk-5K66NEIW.mjs";
import {
  REGISTRY_FRESH_GRACE_MS,
  REGISTRY_VERSION,
  countPending,
  createRenderQueueDrainer,
  enqueue,
  entryWithinGrace,
  logPrune,
  pruneRegistry,
  readRegistry,
  refreshEntriesLiveness,
  removePidFile,
  validateEntry,
  writePidFile,
  writeRegistry
} from "./chunk-U4OUM73W.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/hub-serve.mjs
import { existsSync, statSync, createReadStream, readFileSync, rmSync, watch } from "node:fs";
import { createServer } from "node:http";
import { basename, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
var RUNTIME = runtimeIdentity();
var PLUGIN_VERSION = RUNTIME.runtimeVersion;
var STARTED_BY_HOST = process.env.SDLC_HUB_STARTED_BY || "claude";
var PLUGIN_ROOT = (() => {
  try {
    return fileURLToPath(new URL("..", import.meta.url));
  } catch {
    return null;
  }
})();
var HUB_RELOAD_JS = "(()=>{if(!('EventSource' in window))return;const e=new EventSource('/__sdlc/events');e.addEventListener('reload',()=>window.location.reload());})();\n";
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};
var CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'";
var DOCS_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; worker-src 'self' blob:; object-src 'none'; base-uri 'self'";
var DOCS_ROOT = (() => {
  try {
    return fileURLToPath(new URL("../docs/site", import.meta.url));
  } catch {
    return null;
  }
})();
var MAX_INJECT_BYTES = 1024 * 1024;
var MAX_UPSERT_BYTES = 512 * 1024;
var RELOAD_DEBOUNCE_MS = 500;
function parseHubArgs(argv) {
  const args = {
    host: "127.0.0.1",
    port: 4173,
    pidFile: null,
    configHash: "",
    liveReload: true,
    maxSseClients: 200,
    maxWatchedRepos: 50,
    allowAllHosts: false,
    allowedHosts: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--host") args.host = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--pid-file") args.pidFile = argv[++i];
    else if (a === "--config-hash") args.configHash = argv[++i];
    else if (a === "--max-sse-clients") args.maxSseClients = Number(argv[++i]);
    else if (a === "--max-watched-repos") args.maxWatchedRepos = Number(argv[++i]);
    else if (a === "--no-live-reload") args.liveReload = false;
    else if (a === "--live-reload") args.liveReload = true;
    else if (a === "--allow-all-hosts") args.allowAllHosts = true;
    else if (a === "--allowed-hosts") args.allowedHosts = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}
function createHubServer({
  host = "127.0.0.1",
  port = 4173,
  token = "",
  configHash = "",
  liveReload = true,
  maxSseClients = 200,
  maxWatchedRepos = 50,
  allowAllHosts = false,
  allowedHosts = [],
  codeBrowser = null,
  heartbeatMs = 25e3,
  reconcileMs = 1e4,
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
  spawnRender = void 0
} = {}) {
  const startedAt = Date.now();
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));
  const cbCfg = normalizeCodeBrowserConfig(codeBrowser);
  const clients = /* @__PURE__ */ new Set();
  const metrics = { requests: 0, perRepoLastServed: {} };
  const watchers = /* @__PURE__ */ new Map();
  const lastReloadAt = /* @__PURE__ */ new Map();
  const lastRenderMtime = /* @__PURE__ */ new Map();
  let entries = [];
  let landingCache = { html: null, at: 0 };
  const invalidateLanding = () => {
    landingCache.html = null;
  };
  const heal = createHealController({
    pluginRoot,
    pluginVersion: RUNTIME.runtimeVersion,
    buildId: RUNTIME.buildId,
    healCfg: staleRender ?? { heal: false },
    log: logHub,
    emitReload: (id) => emitReload(id),
    spawnRender
  });
  const renderQueue = createRenderQueueDrainer({
    submit: (entry, spec) => heal.submit(entry, spec),
    isBusy: (id) => heal.isBusy(id),
    pluginRoot,
    log: logHub,
    maxAttempts: heal.config.maxAttempts
  });
  function ensureBootstrapQueued(entry) {
    try {
      if (!entry?.id || !entry.viewDir || !entry.repoRoot) return;
      if (!existsSync(entry.viewDir)) return;
      if (existsSync(`${entry.viewDir}/.last-render`)) return;
      if (countPending(entry.viewDir) > 0) return;
      const r = enqueue(entry.viewDir, {
        repoRoot: entry.repoRoot,
        kind: "bootstrap",
        bucket: "__bootstrap__",
        enqueuedBy: { host: STARTED_BY_HOST, pid: process.pid }
      });
      if (r.ok) logHub(`bootstrap render queued for never-rendered ${entry.id}`);
    } catch {
    }
  }
  function reload() {
    try {
      pruneRegistry();
    } catch {
    }
    try {
      entries = readRegistry().entries;
    } catch {
      entries = [];
    }
    try {
      refreshEntriesLiveness(entries);
    } catch {
    }
    for (const e of entries) ensureBootstrapQueued(e);
    rewatchAll();
    invalidateLanding();
  }
  function rewatchAll() {
    if (!liveReload) return;
    for (const [id, w] of watchers) {
      if (!entries.find((e) => e.id === id)) {
        try {
          w.close();
        } catch {
        }
        watchers.delete(id);
      }
    }
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
      const w = watch(entry.viewDir, (event, filename) => {
        if (filename && String(filename) !== ".last-render") return;
        let renderedAt = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const parsed = JSON.parse(readFileSync(`${entry.viewDir}/.last-render`, "utf-8"));
          if (parsed.renderedAt) renderedAt = parsed.renderedAt;
        } catch {
        }
        emitReload(entry.id, renderedAt);
      });
      w.on("error", () => {
        try {
          w.close();
        } catch {
        }
        watchers.delete(entry.id);
      });
      watchers.set(entry.id, w);
    } catch {
    }
  }
  function emit(event, payload) {
    for (const res of clients) {
      try {
        res.write(`event: ${event}
`);
        res.write(`data: ${JSON.stringify(payload)}

`);
      } catch {
      }
    }
  }
  function emitReload(id, renderedAt) {
    if (!liveReload || !id) return;
    const now = Date.now();
    if (now - (lastReloadAt.get(id) ?? 0) < RELOAD_DEBOUNCE_MS) return;
    lastReloadAt.set(id, now);
    emit("reload", { id, renderedAt });
  }
  function reconcile() {
    let changed = false;
    const live = [];
    for (const e of entries) {
      const backing = existsSync(e.repoRoot) && existsSync(e.viewDir);
      const present = backing && (existsSync(`${e.viewDir}/.last-render`) || countPending(e.viewDir) > 0 || entryWithinGrace(e, registrationGraceMs));
      if (present) {
        live.push(e);
        continue;
      }
      changed = true;
      const w = watchers.get(e.id);
      if (w) {
        try {
          w.close();
        } catch {
        }
        watchers.delete(e.id);
      }
      lastReloadAt.delete(e.id);
      lastRenderMtime.delete(e.id);
      const reason = backing ? "no .last-render + empty queue past registration grace" : "backing files gone";
      logHub(`reconcile: pruned ${e.id} (${reason})`);
      logPrune(`reconcile-prune ${e.id} (${e.repoRoot ?? "?"}): ${reason}`);
    }
    if (changed) {
      entries = live;
      try {
        writeRegistry(entries);
      } catch {
      }
      rewatchAll();
      invalidateLanding();
    }
    for (const e of entries) {
      if (watchers.has(e.id)) continue;
      const marker = `${e.viewDir}/.last-render`;
      let mtime;
      try {
        mtime = statSync(marker).mtimeMs;
      } catch {
        lastRenderMtime.delete(e.id);
        continue;
      }
      const prev = lastRenderMtime.get(e.id);
      lastRenderMtime.set(e.id, mtime);
      if (prev !== void 0 && mtime !== prev) {
        let renderedAt = (/* @__PURE__ */ new Date()).toISOString();
        try {
          const parsed = JSON.parse(readFileSync(marker, "utf-8"));
          if (parsed.renderedAt) renderedAt = parsed.renderedAt;
        } catch {
        }
        emitReload(e.id, renderedAt);
      }
    }
    for (const e of entries) heal.consider(e);
    for (const e of entries) renderQueue.drainEntry(e);
  }
  function tokenOk(req) {
    return Boolean(token) && req.headers["x-sdlc-token"] === token;
  }
  function healthPayload() {
    return {
      ok: true,
      status: "ok",
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
        buildId: RUNTIME.buildId
      },
      startedBy: { host: STARTED_BY_HOST },
      // Legacy compatibility alias — the shared runtimeVersion (was the plugin
      // package version pre-9.75). A pre-9.75 supervisor still reads this.
      version: PLUGIN_VERSION,
      uptimeMs: Date.now() - startedAt,
      configHash,
      entries: entries.map((e) => {
        const rendered = readRenderedIdentity(`${e.viewDir}/.last-render`);
        return {
          id: e.id,
          repoRoot: e.repoRoot,
          headBranch: e.headBranch ?? e.branch ?? null,
          lastRenderedAt: e.lastRenderedAt,
          slugs: e.slugs,
          renderedVersion: rendered.version,
          renderedBuildId: rendered.buildId,
          stale: !renderIdentityMatches(rendered, RUNTIME)
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
        rssBytes: process.memoryUsage().rss
      }
    };
  }
  function dropEntry(id, reason) {
    entries = entries.filter((e) => e.id !== id);
    const w = watchers.get(id);
    if (w) {
      try {
        w.close();
      } catch {
      }
      watchers.delete(id);
    }
    lastReloadAt.delete(id);
    lastRenderMtime.delete(id);
    try {
      writeRegistry(entries);
    } catch {
    }
    invalidateLanding();
    logHub(`dropped entry ${id}: ${reason}`);
  }
  function mergeEntry(entry) {
    const i = entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) {
      const prevReg = entries[i].registeredAt;
      if (prevReg && (!entry.registeredAt || String(prevReg) < String(entry.registeredAt))) {
        entry.registeredAt = prevReg;
      }
      entries[i] = entry;
    } else {
      entries.push(entry);
    }
  }
  function serveRepoFile({ req, res, id, rest }) {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      res.writeHead(404).end("unknown repo");
      return;
    }
    const v = validateEntry(entry);
    if (!v.ok) {
      dropEntry(id, v.reason);
      res.writeHead(410).end("repo entry no longer valid");
      return;
    }
    const resolved = resolveRequestPath(entry.viewDir, rest);
    if (!resolved.ok) {
      res.writeHead(resolved.status).end(resolved.message);
      return;
    }
    if (!existsSync(resolved.path)) {
      res.writeHead(404).end("not found");
      return;
    }
    let stats;
    try {
      stats = statSync(resolved.path);
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    if (!stats.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    metrics.perRepoLastServed[id] = (/* @__PURE__ */ new Date()).toISOString();
    serveFile({ req, res, filePath: resolved.path, stats, entryId: id });
  }
  function serveRepoCode({ req, res, url, idRaw }) {
    const id = decodeURIComponent(idRaw);
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      res.writeHead(404).end("unknown repo");
      return;
    }
    const v = validateEntry(entry);
    if (!v.ok) {
      dropEntry(id, v.reason);
      res.writeHead(410).end("repo entry no longer valid");
      return;
    }
    metrics.perRepoLastServed[id] = (/* @__PURE__ */ new Date()).toISOString();
    serveCodeBrowser({
      req,
      res,
      url,
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
      publicExposure: allowAllHosts || extraHosts.size > 0
    });
  }
  function serveDocsFile({ req, res, rest }) {
    if (!DOCS_ROOT || !existsSync(DOCS_ROOT)) {
      res.writeHead(404).end("docs not available");
      return;
    }
    const resolved = resolveRequestPath(DOCS_ROOT, rest, { indexFile: "index.html" });
    if (!resolved.ok) {
      res.writeHead(resolved.status).end(resolved.message);
      return;
    }
    if (!existsSync(resolved.path)) {
      res.writeHead(404).end("not found");
      return;
    }
    let stats;
    try {
      stats = statSync(resolved.path);
    } catch {
      res.writeHead(404).end("not found");
      return;
    }
    if (!stats.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const type = MIME[extname(resolved.path).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "content-length": stats.size,
      "cache-control": "no-cache",
      "content-security-policy": DOCS_CSP
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(resolved.path).pipe(res);
  }
  function serveFile({ req, res, filePath, stats, entryId }) {
    const type = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    const isHtml = extname(filePath).toLowerCase() === ".html";
    if (isHtml && stats.size <= MAX_INJECT_BYTES) {
      let html;
      try {
        html = readFileSync(filePath, "utf-8");
      } catch {
        html = null;
      }
      if (html != null) {
        const body = Buffer.from(transformServedHtml(html, entryId), "utf-8");
        res.writeHead(200, {
          "content-type": type,
          "content-length": body.length,
          "cache-control": "no-cache",
          "content-security-policy": CSP
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        res.end(body);
        return;
      }
    }
    res.writeHead(200, {
      "content-type": type,
      "content-length": stats.size,
      "cache-control": "no-cache",
      "content-security-policy": CSP
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(filePath).pipe(res);
  }
  function transformServedHtml(html, entryId) {
    let out = html;
    if (entryId && !/name=["']sdlc-repo-id["']/.test(out)) {
      const tag = `<meta name="sdlc-repo-id" content="${escapeAttr(entryId)}">`;
      out = out.includes("</head>") ? out.replace("</head>", `  ${tag}
</head>`) : `${tag}
${out}`;
    }
    if (liveReload && !/\/livereload\.js/.test(out)) {
      const cssMatch = out.match(/href="([^"]*?)\/sdlc\.css(?:\?[^"]*)?"/);
      const assetBase = cssMatch ? cssMatch[1] : "_assets";
      const script = `<script src="${escapeAttr(assetBase)}/livereload.js" defer></script>`;
      out = out.includes("</body>") ? out.replace("</body>", `  ${script}
</body>`) : `${out}
${script}`;
    }
    out = rewriteBrandToHubRoot(out, entryId);
    if (cbCfg.enabled && entryId && !/class="code-link"/.test(out)) {
      out = out.replace(
        /(<div class="actions[^"]*">)/g,
        `$1<a class="code-link" href="/r/${encodeURIComponent(entryId)}/__code/">code \u2197</a><span aria-hidden="true"> \xB7 </span>`
      );
    }
    return out;
  }
  function rewriteBrandToHubRoot(html, entryId) {
    if (!entryId) return html;
    return html.replace(
      /<a class="brand" href="[^"]*">[^<]*<\/a>/g,
      '<a class="brand" href="/">sdlc hub</a>'
    );
  }
  function serveLanding(req, res) {
    const now = Date.now();
    if (!landingCache.html || now - landingCache.at > 2e3) {
      landingCache = {
        html: renderHubLanding(entries, {
          pluginVersion: PLUGIN_VERSION,
          uptimeMs: now - startedAt,
          now,
          codeBrowserEnabled: cbCfg.enabled
        }),
        at: now
      };
    }
    const body = landingCache.html;
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-cache",
      "content-security-policy": CSP
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
  }
  function handleEvents(req, res) {
    if (!liveReload) {
      res.writeHead(404).end("live reload disabled");
      return;
    }
    if (clients.size >= maxSseClients) {
      res.writeHead(503).end("too many live-reload clients");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    clients.add(res);
    res.write("retry: 1000\n\n");
    try {
      res.write(`event: hello
data: ${JSON.stringify({ ok: true })}

`);
    } catch {
    }
    req.on("close", () => clients.delete(res));
  }
  function handleUpsert(req, res) {
    let body = "";
    let tooBig = false;
    req.on("data", (chunk) => {
      if (body.length + chunk.length > MAX_UPSERT_BYTES) {
        tooBig = true;
        return;
      }
      body += chunk;
    });
    req.on("error", () => {
      try {
        res.writeHead(400).end("read error");
      } catch {
      }
    });
    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413).end("entry too large");
        return;
      }
      let entry;
      try {
        entry = JSON.parse(body);
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      const v = validateEntry(entry);
      if (!v.ok) {
        res.writeHead(422).end(`invalid entry: ${v.reason}`);
        return;
      }
      mergeEntry(entry);
      try {
        writeRegistry(entries);
      } catch {
      }
      watchEntry(entry);
      invalidateLanding();
      ensureBootstrapQueued(entry);
      renderQueue.drainEntry(entry);
      emitReload(entry.id, entry.lastRenderedAt);
      sendJson(res, { ok: true, id: entry.id });
    });
  }
  const server = createServer((req, res) => {
    metrics.requests++;
    if (!hostAllowed(req, allowAllHosts, extraHosts)) {
      res.writeHead(403).end("forbidden host");
      return;
    }
    let url;
    try {
      url = new URL(req.url ?? "/", "http://sdlc.hub");
    } catch {
      res.writeHead(400).end("bad request");
      return;
    }
    const p = url.pathname;
    if (p === "/__sdlc/health") {
      sendJson(res, healthPayload());
      return;
    }
    if (p === "/__sdlc/hub-reload.js") {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "content-length": Buffer.byteLength(HUB_RELOAD_JS),
        "cache-control": "no-cache",
        "content-security-policy": CSP
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(HUB_RELOAD_JS);
      return;
    }
    if (p === "/__sdlc/events") {
      handleEvents(req, res);
      return;
    }
    if (p === "/__sdlc/code-browser.js" || p === "/__sdlc/code-browser.css") {
      if (!cbCfg.enabled) {
        res.writeHead(404).end("not found");
        return;
      }
      serveCodeBrowserAsset({ req, res, name: p.slice("/__sdlc/".length) });
      return;
    }
    if (p === "/__sdlc/registry") {
      sendJson(res, { version: REGISTRY_VERSION, entries });
      return;
    }
    if (p === "/__sdlc/registry/refresh") {
      if (!tokenOk(req)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      reload();
      sendJson(res, { ok: true, entries: entries.length });
      return;
    }
    if (p === "/__sdlc/registry/upsert") {
      if (req.method !== "POST") {
        res.writeHead(405).end("method not allowed");
        return;
      }
      if (!tokenOk(req)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      handleUpsert(req, res);
      return;
    }
    const dm = p.match(/^\/docs(\/.*)?$/);
    if (dm) {
      if (dm[1] === void 0) {
        res.writeHead(301, { location: "/docs/" }).end();
        return;
      }
      serveDocsFile({ req, res, rest: dm[1] });
      return;
    }
    const m = p.match(/^\/r\/([^/]+)(\/.*)?$/);
    if (m) {
      if (m[2] === void 0) {
        res.writeHead(301, { location: `/r/${m[1]}/` }).end();
        return;
      }
      if (m[2] === "/__code" || m[2].startsWith("/__code/")) {
        serveRepoCode({ req, res, url, idRaw: m[1] });
        return;
      }
      serveRepoFile({ req, res, id: decodeURIComponent(m[1]), rest: m[2] });
      return;
    }
    if (p === "/") {
      serveLanding(req, res);
      return;
    }
    res.writeHead(404).end("not found");
  });
  server.requestTimeout = 3e4;
  server.headersTimeout = 15e3;
  const heartbeat = liveReload ? setInterval(() => {
    for (const res of clients) {
      try {
        res.write(": ping\n\n");
      } catch {
      }
    }
  }, heartbeatMs) : null;
  if (heartbeat && typeof heartbeat.unref === "function") heartbeat.unref();
  const reconcileTimer = setInterval(() => {
    try {
      reconcile();
    } catch (err) {
      logHub(`reconcile error: ${err?.message ?? err}`);
    }
  }, reconcileMs);
  if (typeof reconcileTimer.unref === "function") reconcileTimer.unref();
  const close = server.close.bind(server);
  server.close = (callback) => {
    if (heartbeat) clearInterval(heartbeat);
    clearInterval(reconcileTimer);
    for (const [, w] of watchers) {
      try {
        w.close();
      } catch {
      }
    }
    watchers.clear();
    for (const c of clients) {
      try {
        c.end();
      } catch {
      }
    }
    clients.clear();
    return close(callback);
  };
  reload();
  try {
    renderQueue.catchUp(entries);
  } catch (err) {
    logHub(`render-queue catch-up error: ${err?.message ?? err}`);
  }
  return server;
}
function sendJson(res, payload) {
  const body = `${JSON.stringify(payload)}
`;
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-cache"
  });
  res.end(body);
}
function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function escapeAttr(s) {
  return escapeHtml(s);
}
function logHub(line) {
  console.log(`[hub] ${line}`);
}
async function main() {
  const args = parseHubArgs(process.argv.slice(2));
  if (args.host === "0.0.0.0" && !args.allowAllHosts) {
    console.error("[hub] refusing 0.0.0.0 without --allow-all-hosts");
    process.exit(2);
  }
  const token = process.env.SDLC_HUB_TOKEN ?? "";
  const server = createHubServer({
    ...args,
    token,
    codeBrowser: codeBrowserConfigFromEnv(),
    staleRender: staleRenderConfigFromEnv()
  });
  server.listen(args.port, args.host, async () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : args.port;
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid,
        host: args.host,
        port: boundPort,
        token,
        configHash: args.configHash,
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
        runtimeRoot: PLUGIN_ROOT ? PLUGIN_ROOT.replace(/[\\/]+$/, "") : PLUGIN_ROOT,
        startedByHost: STARTED_BY_HOST
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
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("exit", () => {
    if (args.pidFile) {
      try {
        rmSync(args.pidFile, { force: true });
      } catch {
      }
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[hub] fatal:", err.stack ?? err.message);
    process.exit(1);
  });
}
export {
  createHubServer,
  parseHubArgs
};
