#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderHubLanding
} from "./chunk-R6WZVGPD.mjs";
import "./chunk-3IBDFP3U.mjs";
import "./chunk-C4BSYM7X.mjs";
import {
  REGISTRY_VERSION,
  pruneRegistry,
  readRegistry,
  refreshEntriesLiveness,
  validateEntry,
  writeRegistry
} from "./chunk-5QUORPHZ.mjs";
import "./chunk-ASUVWO6I.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-FZ2GR6GF.mjs";
import {
  resolveRequestPath
} from "./chunk-G7FUF6WI.mjs";
import {
  removePidFile,
  writePidFile
} from "./chunk-FIVVBFWT.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/hub-serve.mjs
import { existsSync, statSync, createReadStream, readFileSync, rmSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
var PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8")).version ?? "";
  } catch {
    return "";
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
var ALLOWED_HOSTNAMES = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? "");
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1).toLowerCase();
  return h.split(":")[0].toLowerCase();
}
function hostAllowed(req, allowAllHosts, extraHosts) {
  if (allowAllHosts) return true;
  const h = hostnameOf(req.headers.host);
  return ALLOWED_HOSTNAMES.has(h) || extraHosts != null && extraHosts.has(h);
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
  allowedHosts = []
} = {}) {
  const startedAt = Date.now();
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));
  const clients = /* @__PURE__ */ new Set();
  const metrics = { requests: 0, perRepoLastServed: {} };
  const watchers = /* @__PURE__ */ new Map();
  let entries = [];
  let landingCache = { html: null, at: 0 };
  const invalidateLanding = () => {
    landingCache.html = null;
  };
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
        emit("reload", { id: entry.id, renderedAt });
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
  function tokenOk(req) {
    return Boolean(token) && req.headers["x-sdlc-token"] === token;
  }
  function healthPayload() {
    return {
      ok: true,
      status: "ok",
      pid: process.pid,
      // Plugin version of THIS running hub. The supervisor compares it to its own
      // PLUGIN_VERSION and reaps a stale hub so a new install deterministically
      // takes over (the `entries` array below is the hub-vs-per-repo marker).
      version: PLUGIN_VERSION,
      uptimeMs: Date.now() - startedAt,
      configHash,
      entries: entries.map((e) => ({
        id: e.id,
        repoRoot: e.repoRoot,
        headBranch: e.headBranch ?? e.branch ?? null,
        lastRenderedAt: e.lastRenderedAt,
        slugs: e.slugs
      })),
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
    return out;
  }
  function rewriteBrandToHubRoot(html, entryId) {
    if (!entryId) return html;
    return html.replace(
      /<a class="brand" href="[^"]*">[^<]*<\/a>/,
      '<a class="brand" href="/">sdlc hub</a>'
    );
  }
  function serveLanding(req, res) {
    const now = Date.now();
    if (!landingCache.html || now - landingCache.at > 2e3) {
      landingCache = {
        html: renderHubLanding(entries, { pluginVersion: PLUGIN_VERSION, uptimeMs: now - startedAt, now }),
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
  const close = server.close.bind(server);
  server.close = (callback) => {
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
  const server = createHubServer({ ...args, token });
  server.listen(args.port, args.host, async () => {
    const address = server.address();
    const boundPort = typeof address === "object" && address ? address.port : args.port;
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid,
        host: args.host,
        port: boundPort,
        token,
        configHash: args.configHash
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
