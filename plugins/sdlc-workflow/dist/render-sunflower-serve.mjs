#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  resolveProjectRoot
} from "./chunk-UTP6CBAZ.mjs";
import {
  hostAllowed,
  renderCodeBrowserPage,
  resolveRequestPath
} from "./chunk-IOYXLHW6.mjs";
import "./chunk-4WRIEOIP.mjs";
import {
  codeBrowserConfigFromEnv,
  createHealController,
  normalizeCodeBrowserConfig,
  repoHeadBranch,
  serveCodeBrowser,
  serveCodeBrowserAsset,
  staleRenderConfigFromEnv
} from "./chunk-DJMV6FQQ.mjs";
import {
  readRenderedIdentity,
  renderIdentityMatches,
  runtimeIdentity
} from "./chunk-4TBLJ5B7.mjs";
import {
  createRenderQueueDrainer,
  removePidFile,
  writePidFile
} from "./chunk-JH5USZ6A.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/render-sunflower-serve.mjs
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  watch
} from "node:fs";
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
var __filename = fileURLToPath(import.meta.url);
var PLUGIN_ROOT = (() => {
  try {
    return fileURLToPath(new URL("..", import.meta.url));
  } catch {
    return null;
  }
})();
var RUNTIME = runtimeIdentity();
var PLUGIN_VERSION = RUNTIME.runtimeVersion;
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
var MAX_SSE_CLIENTS = 50;
var CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'";
function parseServeArgs(argv) {
  const args = {
    view: ".ai/_view",
    host: "127.0.0.1",
    port: 4173,
    pidFile: null,
    // null = no explicit --project-root; main() climbs from cwd to the project
    // root so a daemon launched from a repo subfolder can't mint a stray
    // `.ai/_view` there (createSdlcStaticServer mkdirs viewRoot).
    projectRoot: null,
    configHash: "",
    liveReload: true,
    allowAllHosts: false,
    allowedHosts: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--view") args.view = argv[++i];
    else if (a === "--host") args.host = argv[++i];
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a === "--pid-file") args.pidFile = argv[++i];
    else if (a === "--project-root") args.projectRoot = argv[++i];
    else if (a === "--config-hash") args.configHash = argv[++i];
    else if (a === "--live-reload") args.liveReload = true;
    else if (a === "--no-live-reload") args.liveReload = false;
    else if (a === "--allow-all-hosts") args.allowAllHosts = true;
    else if (a === "--allowed-hosts") args.allowedHosts = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}
function createSdlcStaticServer({
  viewRoot,
  projectRoot = null,
  liveReload = true,
  configHash = "",
  codeBrowser = null,
  allowAllHosts = false,
  allowedHosts = [],
  // Stale-render heal config (STALE-RENDER-HEAL-PLAN §8). null → off (safe
  // constructor default); main() supplies the env-derived machine config.
  staleRender = null,
  pluginRoot = PLUGIN_ROOT,
  spawnRender = void 0,
  // injectable render-spawn seam (tests)
  reconcileMs = 1e4
} = {}) {
  const root = resolve(viewRoot ?? ".ai/_view");
  mkdirSync(root, { recursive: true });
  const repoRoot = resolve(projectRoot ?? resolve(root, "..", ".."));
  const cbCfg = normalizeCodeBrowserConfig(codeBrowser);
  const extraHosts = new Set((allowedHosts || []).map((h) => String(h).toLowerCase()).filter(Boolean));
  const clients = /* @__PURE__ */ new Set();
  let watcher = null;
  if (liveReload) {
    try {
      watcher = watch(root, (event, filename) => {
        if (filename && String(filename) !== ".last-render") return;
        emitEvent(clients, "reload", healthPayload(root, configHash));
      });
    } catch {
      watcher = null;
    }
  }
  const selfEntry = { id: "local", repoRoot, viewDir: root };
  const heal = createHealController({
    pluginRoot,
    pluginVersion: RUNTIME.runtimeVersion,
    buildId: RUNTIME.buildId,
    healCfg: staleRender ?? { heal: false },
    log: (line) => console.log(`[serve] ${line}`),
    emitReload: () => emitEvent(clients, "reload", healthPayload(root, configHash)),
    spawnRender
  });
  const renderQueue = createRenderQueueDrainer({
    submit: (entry, spec) => heal.submit(entry, spec),
    isBusy: (id) => heal.isBusy(id),
    pluginRoot,
    log: (line) => console.log(`[serve] ${line}`),
    maxAttempts: heal.config.maxAttempts
  });
  try {
    renderQueue.catchUp([selfEntry]);
  } catch {
  }
  const reconcileTimer = setInterval(() => {
    try {
      if (heal.config.heal) heal.consider(selfEntry);
    } catch {
    }
    try {
      renderQueue.drainEntry(selfEntry);
    } catch {
    }
  }, reconcileMs);
  if (typeof reconcileTimer.unref === "function") reconcileTimer.unref();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://sdlc.local");
    if (url.pathname === "/__sdlc/health") {
      sendJson(res, {
        ...healthPayload(root, configHash),
        heal: heal.snapshot(),
        renderQueue: renderQueue.snapshot([selfEntry])
      });
      return;
    }
    const p = url.pathname;
    if (p === "/__sdlc/code-browser.js" || p === "/__sdlc/code-browser.css" || p === "/__code" || p.startsWith("/__code/")) {
      if (!cbCfg.enabled) {
        res.writeHead(404).end("not found");
        return;
      }
      if (!hostAllowed(req, allowAllHosts, extraHosts)) {
        res.writeHead(403).end("forbidden host");
        return;
      }
      if (p.startsWith("/__sdlc/")) {
        serveCodeBrowserAsset({ req, res, name: p.slice("/__sdlc/".length) });
        return;
      }
      serveCodeBrowser({
        req,
        res,
        url,
        basePath: "/__code",
        repoRoot,
        repoId: null,
        repoLabel: basename(repoRoot),
        headBranch: () => repoHeadBranch(repoRoot),
        config: cbCfg,
        pluginVersion: PLUGIN_VERSION,
        csp: CSP,
        renderPage: renderCodeBrowserPage,
        // Reachable beyond loopback → the adapter ignores serveSecrets:true.
        publicExposure: allowAllHosts || extraHosts.size > 0
      });
      return;
    }
    if (url.pathname === "/__sdlc/events") {
      if (!liveReload) {
        res.writeHead(404).end("live reload disabled");
        return;
      }
      if (clients.size >= MAX_SSE_CLIENTS) {
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
      writeSse(res, "hello", healthPayload(root, configHash));
      req.on("close", () => clients.delete(res));
      return;
    }
    serveStatic({ root, req, res });
  });
  const close = server.close.bind(server);
  server.close = (callback) => {
    if (watcher) watcher.close();
    clearInterval(reconcileTimer);
    for (const client of clients) client.end();
    clients.clear();
    return close(callback);
  };
  return server;
}
function serveStatic({ root, req, res }) {
  const resolved = resolveRequestPath2(root, req.url ?? "/");
  if (!resolved.ok) {
    res.writeHead(resolved.status).end(resolved.message);
    return;
  }
  if (!existsSync(resolved.path)) {
    res.writeHead(404).end("not found");
    return;
  }
  const stats = statSync(resolved.path);
  if (!stats.isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  const type = MIME[extname(resolved.path).toLowerCase()] ?? "application/octet-stream";
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
  createReadStream(resolved.path).pipe(res);
}
function resolveRequestPath2(root, rawUrl) {
  return resolveRequestPath(root, rawUrl, { stripPrefix: "/sdlc" });
}
function healthPayload(root, configHash) {
  const rendered = readRenderedIdentity(join(root, ".last-render"));
  return {
    status: "ok",
    ok: true,
    pid: process.pid,
    // Structured shared-runtime identity (NATIVE-INTEROP Workstream B), mirroring
    // the hub. `version` stays as a legacy alias for a pre-9.75 supervisor.
    hub: {
      name: RUNTIME.hubName,
      protocolVersion: RUNTIME.hubProtocolVersion,
      runtimeVersion: RUNTIME.runtimeVersion,
      buildId: RUNTIME.buildId
    },
    version: PLUGIN_VERSION,
    configHash,
    renderedAt: lastRenderAt(root),
    renderedVersion: rendered.version,
    renderedBuildId: rendered.buildId,
    stale: !renderIdentityMatches(rendered, RUNTIME),
    slugs: renderedSlugs(root)
  };
}
function renderedSlugs(root) {
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).filter((entry) => !["_assets", "project", "simplify", "profiles"].includes(entry.name)).filter((entry) => existsSync(join(root, entry.name, "INDEX.html"))).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
function lastRenderAt(root) {
  const marker = join(root, ".last-render");
  if (!existsSync(marker)) return null;
  try {
    const parsed = JSON.parse(readFileSync(marker, "utf-8"));
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
  const body = `${JSON.stringify(payload)}
`;
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-cache"
  });
  res.end(body);
}
function emitEvent(clients, event, payload) {
  for (const client of clients) writeSse(client, event, payload);
}
function writeSse(res, event, payload) {
  res.write(`event: ${event}
`);
  res.write(`data: ${JSON.stringify(payload)}

`);
}
async function main() {
  const args = parseServeArgs(process.argv.slice(2));
  if (args.host === "0.0.0.0" && !args.allowAllHosts) {
    console.error("[serve] refusing 0.0.0.0 without --allow-all-hosts");
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
    allowedHosts: args.allowedHosts
  });
  server.listen(args.port, args.host, async () => {
    const address = server.address();
    if (args.pidFile) {
      await writePidFile(args.pidFile, {
        pid: process.pid,
        host: args.host,
        port: typeof address === "object" && address ? address.port : args.port,
        configHash: args.configHash
      });
    }
    console.log(`[serve] listening on http://${args.host}:${typeof address === "object" && address ? address.port : args.port}`);
  });
  const shutdown = async () => {
    server.close(async () => {
      if (args.pidFile) await removePidFile(args.pidFile);
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("[serve] fatal:", err.stack ?? err.message);
    process.exit(1);
  });
}
export {
  createSdlcStaticServer,
  parseServeArgs
};
