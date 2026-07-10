import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  readRenderedIdentity,
  renderIdentityMatches,
  resolveActiveRuntimeRootSync
} from "./chunk-Z2L4NLCI.mjs";
import {
  resolveEntrypoint
} from "./chunk-T6TC3LOO.mjs";

// lib/code-browser.mjs
import { execFileSync } from "node:child_process";
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
var CODE_BROWSER_DEFAULTS = Object.freeze({
  enabled: true,
  // machine-wide kill switch (mirrors perRepoServe)
  maxBlobBytes: 512 * 1024,
  // text cap per blob response
  maxTreeEntries: 5e3,
  // per-listing truncation guard
  lazyTree: true,
  // list one folder per request (node_modules is shown, so never eager-walk by default)
  showIgnoredBadge: true,
  // badge gitignored nodes (presentation only — costs one cached git spawn)
  serveSecrets: false,
  // ⚠ true drops the secret denylist (.env/keys become servable)
  denyGlobs: []
  // appended to denyGlobsDefault(); see compileDeny grammar
});
function normalizeCodeBrowserConfig(raw) {
  const cfg = { ...CODE_BROWSER_DEFAULTS, ...raw && typeof raw === "object" ? raw : {} };
  cfg.enabled = cfg.enabled !== false;
  cfg.maxBlobBytes = boundedInt(cfg.maxBlobBytes, 1024, 16 * 1024 * 1024, CODE_BROWSER_DEFAULTS.maxBlobBytes);
  cfg.maxTreeEntries = boundedInt(cfg.maxTreeEntries, 10, 1e5, CODE_BROWSER_DEFAULTS.maxTreeEntries);
  cfg.lazyTree = cfg.lazyTree !== false;
  cfg.showIgnoredBadge = cfg.showIgnoredBadge !== false;
  cfg.serveSecrets = cfg.serveSecrets === true;
  cfg.denyGlobs = Array.isArray(cfg.denyGlobs) ? cfg.denyGlobs.map(String) : [];
  return cfg;
}
function boundedInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
var CODE_BROWSER_ENV = "SDLC_CODE_BROWSER";
function codeBrowserConfigFromEnv(env = process.env) {
  const raw = env?.[CODE_BROWSER_ENV];
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
var SECRET_GLOBS = Object.freeze([
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "id_rsa*",
  "*.p12",
  "*.keystore"
]);
function denyGlobsDefault({ serveSecrets = false } = {}) {
  return serveSecrets ? [".git/**"] : [".git/**", ...SECRET_GLOBS];
}
function compileDeny(globs) {
  const prefixes = [];
  const segRes = [];
  for (const raw of globs ?? []) {
    let g = String(raw).trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
    if (!g) continue;
    if (g.endsWith("/**")) g = g.slice(0, -3);
    if (g.includes("/")) prefixes.push(g);
    else segRes.push(segmentRegex(g));
  }
  return (relPath) => {
    const p = String(relPath ?? "").replace(/\\/g, "/").toLowerCase();
    if (!p) return false;
    for (const pre of prefixes) {
      if (p === pre || p.startsWith(`${pre}/`)) return true;
    }
    if (segRes.length) {
      for (const s of p.split("/")) {
        for (const re of segRes) if (re.test(s)) return true;
      }
    }
    return false;
  };
}
function segmentRegex(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`);
}
var ContainmentError = class extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = "ContainmentError";
    this.status = status;
  }
};
function resolveRepoPath(repoRoot, relPath, { deny = null } = {}) {
  if (typeof relPath !== "string") throw new ContainmentError("bad path");
  if (relPath.includes("\0")) throw new ContainmentError("bad path");
  const fwd = relPath.replace(/\\/g, "/");
  if (fwd.startsWith("/") || /^[a-zA-Z]:/.test(fwd)) throw new ContainmentError("absolute path");
  const segs = fwd.split("/").filter((s) => s !== "");
  for (const s of segs) {
    if (s === "." || s === "..") throw new ContainmentError("dot segment");
  }
  const rel = segs.join("/");
  if (deny && rel && deny(rel)) throw new ContainmentError("denied");
  const rootAbs = resolve(repoRoot);
  const abs = rel ? resolve(rootAbs, rel) : rootAbs;
  const lexRel = relative(rootAbs, abs);
  if (lexRel.startsWith("..") || /^[a-zA-Z]:/.test(lexRel) || lexRel.startsWith(sep)) {
    throw new ContainmentError("escapes root");
  }
  let realRoot;
  try {
    realRoot = realpathSync.native(rootAbs);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!existsSync(abs)) throw new ContainmentError("not found", 404);
  let real;
  try {
    real = realpathSync.native(abs);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  const rootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (real !== realRoot && !real.startsWith(rootWithSep)) {
    throw new ContainmentError("escapes root");
  }
  if (deny && real !== realRoot) {
    const realRel = relative(realRoot, real).replace(/\\/g, "/");
    if (deny(realRel)) throw new ContainmentError("denied");
  }
  return { abs, real, rel };
}
var IGNORED_TTL_MS = 5e3;
var ignoredCache = /* @__PURE__ */ new Map();
var EMPTY_MATCHER = Object.freeze({ has: () => false, size: 0 });
function gitIgnoredSet(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  let key;
  try {
    key = realpathSync.native(repoRoot);
  } catch {
    key = resolve(repoRoot);
  }
  const hit = ignoredCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.matcher;
  const matcher = buildIgnoredMatcher(key);
  ignoredCache.set(key, { at: now, matcher });
  return matcher;
}
function buildIgnoredMatcher(root) {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"],
      {
        encoding: "utf-8",
        windowsHide: true,
        timeout: 4e3,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
  } catch {
    return EMPTY_MATCHER;
  }
  const files = /* @__PURE__ */ new Set();
  const dirSet = /* @__PURE__ */ new Set();
  for (const entry of out.split("\0")) {
    if (!entry) continue;
    const p = entry.replace(/\\/g, "/");
    if (p.endsWith("/")) dirSet.add(p.slice(0, -1));
    else files.add(p);
  }
  if (!files.size && !dirSet.size) return EMPTY_MATCHER;
  return {
    has(relPath) {
      const p = String(relPath ?? "").replace(/\\/g, "/");
      if (!p) return false;
      if (files.has(p) || dirSet.has(p)) return true;
      let idx = -1;
      while ((idx = p.indexOf("/", idx + 1)) !== -1) {
        if (dirSet.has(p.slice(0, idx))) return true;
      }
      return false;
    },
    size: files.size + dirSet.size
  };
}
var headCache = /* @__PURE__ */ new Map();
function repoHeadBranch(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  const key = resolve(repoRoot);
  const hit = headCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.branch;
  let branch = null;
  try {
    const out = execFileSync("git", ["-C", key, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    branch = out && out !== "HEAD" ? out : null;
  } catch {
    branch = null;
  }
  headCache.set(key, { at: now, branch });
  return branch;
}
var IMAGE_EXTS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);
var LANG_BY_EXT = Object.freeze({
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  html: "html",
  htm: "html",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  rs: "rust",
  go: "go"
});
function languageFor(name) {
  const base = String(name ?? "").toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  return LANG_BY_EXT[ext] ?? "plaintext";
}
function walkDir(repoRoot, {
  subPath = "",
  lazy = true,
  maxEntries = 5e3,
  deny = null,
  ignored = null
} = {}) {
  const { real: dirReal, rel: baseRel } = resolveRepoPath(repoRoot, subPath, { deny });
  let st;
  try {
    st = statSync(dirReal);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isDirectory()) throw new ContainmentError("not a directory", 404);
  let realRoot;
  try {
    realRoot = realpathSync.native(repoRoot);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  const ctx = {
    lazy,
    maxEntries,
    deny,
    ignored,
    realRoot,
    count: 0,
    truncated: false,
    visited: /* @__PURE__ */ new Set([dirReal])
    // eager-mode symlink-cycle guard
  };
  const nodes = listLevel(dirReal, baseRel, ctx);
  return { nodes, truncated: ctx.truncated };
}
function listLevel(dirAbs, dirRel, ctx) {
  let entries;
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return [];
  }
  entries.sort((a, b) => {
    const ad = a.isDirectory() || a.isSymbolicLink() ? 0 : 1;
    const bd = b.isDirectory() || b.isSymbolicLink() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  const out = [];
  for (const ent of entries) {
    if (ctx.count >= ctx.maxEntries) {
      ctx.truncated = true;
      break;
    }
    const name = ent.name;
    const rel = dirRel ? `${dirRel}/${name}` : name;
    if (ctx.deny && ctx.deny(rel)) continue;
    const abs = `${dirAbs}${sep}${name}`;
    let type = null;
    let symlink = false;
    let recursable = false;
    let real = null;
    if (ent.isSymbolicLink()) {
      symlink = true;
      try {
        real = realpathSync.native(abs);
      } catch {
        real = null;
      }
      const inRoot = real != null && (real === ctx.realRoot || real.startsWith(`${ctx.realRoot}${sep}`));
      if (inRoot) {
        let ts = null;
        try {
          ts = statSync(abs);
        } catch {
          ts = null;
        }
        if (ts?.isDirectory()) {
          type = "dir";
          recursable = true;
        } else if (ts?.isFile()) type = "file";
        else type = "file";
      } else {
        type = "file";
      }
    } else if (ent.isDirectory()) {
      type = "dir";
      recursable = true;
    } else if (ent.isFile()) {
      type = "file";
    } else {
      continue;
    }
    ctx.count++;
    const node = { name, path: rel, type };
    if (symlink) node.symlink = true;
    if (ctx.ignored) node.ignored = ctx.ignored.has(rel);
    if (type === "file") {
      node.lang = languageFor(name);
    } else if (ctx.lazy) {
      node.hasChildren = dirHasEntries(abs);
    } else if (recursable) {
      const realDir = real ?? safeRealpath(abs);
      if (realDir && !ctx.visited.has(realDir)) {
        ctx.visited.add(realDir);
        node.children = listLevel(abs, rel, ctx);
      } else {
        node.children = [];
      }
    } else {
      node.children = [];
    }
    out.push(node);
  }
  out.sort((a, b) => {
    const ad = a.type === "dir" ? 0 : 1;
    const bd = b.type === "dir" ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return out;
}
function dirHasEntries(abs) {
  try {
    return readdirSync(abs).length > 0;
  } catch {
    return false;
  }
}
function safeRealpath(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}
function readBlob(repoRoot, relPath, { maxBlobBytes = CODE_BROWSER_DEFAULTS.maxBlobBytes, deny = null } = {}) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try {
    st = statSync(real);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isFile()) throw new ContainmentError("not a file", 404);
  const name = basename(rel) || basename(real);
  const size = st.size;
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext)) return { path: rel, name, size, kind: "image" };
  const head = readHead(real, Math.min(size, 8192));
  if (head.includes(0)) return { path: rel, name, size, kind: "binary" };
  const truncated = size > maxBlobBytes;
  const content = truncated ? readHead(real, maxBlobBytes).toString("utf-8") : readFileSync(real, "utf-8");
  return { path: rel, name, size, kind: "text", language: languageFor(name), truncated, content };
}
function extOf(name) {
  const base = String(name ?? "").toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1) : "";
}
function readHead(file, bytes) {
  if (bytes <= 0) return Buffer.alloc(0);
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}
var BUNDLE_ASSETS = Object.freeze({
  "code-browser.js": "text/javascript; charset=utf-8",
  "code-browser.css": "text/css; charset=utf-8"
});
var bundleCache = /* @__PURE__ */ new Map();
function serveCodeBrowserAsset({ req, res, name }) {
  const type = BUNDLE_ASSETS[name];
  if (!type) {
    res.writeHead(404).end("not found");
    return;
  }
  let hit = bundleCache.get(name);
  if (!hit) {
    let body = null;
    try {
      body = readFileSync(new URL(`../dist/${name}`, import.meta.url));
    } catch {
      body = null;
    }
    if (body == null) {
      res.writeHead(404).end("code browser bundle not built");
      return;
    }
    hit = { body };
    bundleCache.set(name, hit);
  }
  res.writeHead(200, {
    "content-type": type,
    "content-length": hit.body.length,
    "cache-control": "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(hit.body);
}
var RAW_IMAGE_MIME = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif"
});
function serveCodeBrowser({
  req,
  res,
  url,
  basePath,
  repoRoot,
  repoId = null,
  repoLabel = "",
  headBranch = null,
  config = null,
  pluginVersion = "",
  csp = "",
  renderPage = null,
  publicExposure = false
}) {
  let cfg = normalizeCodeBrowserConfig(config);
  if (!cfg.enabled) {
    res.writeHead(404).end("not found");
    return;
  }
  if (cfg.serveSecrets && publicExposure) cfg = { ...cfg, serveSecrets: false };
  const pathname = url.pathname;
  if (!pathname.startsWith(basePath)) {
    res.writeHead(404).end("not found");
    return;
  }
  const rest = pathname.slice(basePath.length);
  if (rest === "") {
    res.writeHead(301, { location: `${basePath}/` }).end();
    return;
  }
  const deny = compileDeny([
    ...denyGlobsDefault({ serveSecrets: cfg.serveSecrets }),
    ...cfg.denyGlobs
  ]);
  const branch = typeof headBranch === "function" ? safeBranch(headBranch) : headBranch ?? null;
  try {
    if (rest === "/") {
      if (!renderPage) {
        res.writeHead(404).end("not found");
        return;
      }
      const html = renderPage({
        repoId,
        repoLabel,
        headBranch: branch,
        base: basePath,
        pluginVersion
      });
      const body = Buffer.from(html, "utf-8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-length": body.length,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        ...csp ? { "content-security-policy": csp } : {}
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(body);
      return;
    }
    if (rest === "/tree") {
      const sub = url.searchParams.get("path") ?? "";
      const ignored = cfg.showIgnoredBadge ? gitIgnoredSet(repoRoot) : null;
      const { nodes, truncated } = walkDir(repoRoot, {
        subPath: sub,
        lazy: cfg.lazyTree,
        maxEntries: cfg.maxTreeEntries,
        deny,
        ignored
      });
      sendJson(res, req, csp, {
        id: repoId,
        headBranch: branch,
        path: sub.replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
        lazy: cfg.lazyTree,
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        truncated,
        nodes
      });
      return;
    }
    if (rest === "/blob") {
      const p = url.searchParams.get("path");
      if (!p) {
        res.writeHead(400).end("missing path");
        return;
      }
      const blob = readBlob(repoRoot, p, { maxBlobBytes: cfg.maxBlobBytes, deny });
      sendJson(res, req, csp, {
        ...blob,
        rawUrl: `${basePath}/raw?path=${encodeURIComponent(blob.path)}`
      });
      return;
    }
    if (rest === "/raw") {
      const p = url.searchParams.get("path");
      if (!p) {
        res.writeHead(400).end("missing path");
        return;
      }
      serveRaw({ req, res, repoRoot, relPath: p, deny, csp });
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    if (err instanceof ContainmentError) {
      res.writeHead(err.status).end(err.status === 404 ? "not found" : "forbidden");
      return;
    }
    res.writeHead(500).end("error");
  }
}
function serveRaw({ req, res, repoRoot, relPath, deny, csp }) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try {
    st = statSync(real);
  } catch {
    throw new ContainmentError("not found", 404);
  }
  if (!st.isFile()) throw new ContainmentError("not a file", 404);
  const name = basename(rel) || basename(real);
  const ext = extOf(name);
  let type;
  let disposition;
  if (RAW_IMAGE_MIME[ext]) {
    type = RAW_IMAGE_MIME[ext];
    disposition = "inline";
  } else if (readHead(real, Math.min(st.size, 8192)).includes(0)) {
    type = "application/octet-stream";
    disposition = `attachment; filename="${sanitizeFilename(name)}"`;
  } else {
    type = "text/plain; charset=utf-8";
    disposition = "inline";
  }
  res.writeHead(200, {
    "content-type": type,
    "content-length": st.size,
    "content-disposition": disposition,
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    ...csp ? { "content-security-policy": csp } : {}
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(real).pipe(res);
}
function sanitizeFilename(name) {
  return String(name).replace(/[^\w.@-]+/g, "_");
}
function sendJson(res, req, csp, payload) {
  const body = `${JSON.stringify(payload)}
`;
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-cache",
    "x-content-type-options": "nosniff",
    ...csp ? { "content-security-policy": csp } : {}
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}
function safeBranch(fn) {
  try {
    return fn() ?? null;
  } catch {
    return null;
  }
}

// lib/heal-render.mjs
import { spawn } from "node:child_process";
import { join } from "node:path";
var STALE_RENDER_DEFAULTS = Object.freeze({
  heal: true,
  maxConcurrent: 1,
  // simultaneous heal renders across all repos
  cooldownMs: 6e4,
  // per-repo minimum interval between heal spawns (anti-thrash)
  maxAttempts: 3
  // give up + surface `failed` after this many spawns per drift episode
});
function normalizeStaleRenderConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const posInt = (v, d) => Number.isFinite(v) && v > 0 ? Math.floor(v) : d;
  return {
    heal: c.heal !== false,
    maxConcurrent: posInt(c.maxConcurrent, STALE_RENDER_DEFAULTS.maxConcurrent),
    cooldownMs: Number.isFinite(c.cooldownMs) && c.cooldownMs >= 0 ? Math.floor(c.cooldownMs) : STALE_RENDER_DEFAULTS.cooldownMs,
    maxAttempts: posInt(c.maxAttempts, STALE_RENDER_DEFAULTS.maxAttempts)
  };
}
function staleRenderConfigFromEnv(env = process.env) {
  let raw = {};
  try {
    const text = env?.SDLC_STALE_RENDER;
    if (text) raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  return normalizeStaleRenderConfig(raw);
}
function resolveRenderEntrypoint(pluginRoot) {
  const activeRoot = resolveActiveRuntimeRootSync();
  return resolveEntrypoint(activeRoot ?? pluginRoot, "render-sunflower");
}
function defaultSpawnRender(script, args, opts) {
  return spawn(process.execPath, [script, ...args], {
    stdio: "ignore",
    windowsHide: true,
    ...opts
  });
}
function createHealController({
  pluginRoot,
  pluginVersion,
  buildId = null,
  healCfg = {},
  log = () => {
  },
  emitReload = () => {
  },
  spawnRender = defaultSpawnRender,
  env = process.env,
  now = () => Date.now()
} = {}) {
  const cfg = normalizeStaleRenderConfig(healCfg);
  const queue = [];
  const inFlight = /* @__PURE__ */ new Set();
  const lastHealAt = /* @__PURE__ */ new Map();
  const attempts = /* @__PURE__ */ new Map();
  const failed = /* @__PURE__ */ new Map();
  const markerOf = (entry) => join(entry.viewDir, ".last-render");
  function consider(entry) {
    try {
      if (!cfg.heal) return { action: "disabled" };
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: "invalid" };
      const recorded = readRenderedIdentity(markerOf(entry));
      const renderedVersion = recorded.version;
      if (renderIdentityMatches(recorded, { runtimeVersion: pluginVersion, buildId })) {
        attempts.delete(entry.id);
        failed.delete(entry.id);
        return { action: "fresh", renderedVersion };
      }
      return enqueue(entry, renderedVersion);
    } catch (err) {
      log(`heal: consider error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function enqueue(entry, renderedVersion) {
    const id = entry.id;
    if (inFlight.has(id) || queue.some((q) => q.entry.id === id)) {
      return { action: "pending", renderedVersion };
    }
    if (now() - (lastHealAt.get(id) ?? -Infinity) < cfg.cooldownMs) {
      return { action: "cooldown", renderedVersion };
    }
    if ((attempts.get(id) ?? 0) >= cfg.maxAttempts) {
      if (!failed.has(id)) {
        log(`heal: ${id} FAILED after ${cfg.maxAttempts} attempts \u2014 still ${renderedVersion ?? "unversioned"} (want ${pluginVersion})`);
      }
      failed.set(id, { attempts: cfg.maxAttempts, renderedVersion: renderedVersion ?? null });
      return { action: "failed", renderedVersion };
    }
    queue.push({
      entry,
      renderedVersion,
      isHeal: true,
      args: ["--clean", "--view", entry.viewDir]
    });
    pump();
    return { action: "enqueued", renderedVersion };
  }
  function submit(entry, { args, label, onSettled } = {}) {
    try {
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: "invalid" };
      if (!Array.isArray(args)) return { action: "invalid" };
      if (isBusy(entry.id)) return { action: "pending" };
      queue.push({ entry, args, label, isHeal: false, onSettled });
      pump();
      return { action: "enqueued" };
    } catch (err) {
      log(`render-queue: submit error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function isBusy(id) {
    return inFlight.has(id) || queue.some((q) => q.entry.id === id);
  }
  function pump() {
    while (inFlight.size < cfg.maxConcurrent && queue.length) {
      spawnOne(queue.shift());
    }
  }
  function spawnOne({ entry, renderedVersion, args, label, isHeal, onSettled }) {
    const id = entry.id;
    const tag = isHeal ? "heal" : "render-queue";
    inFlight.add(id);
    if (isHeal) {
      lastHealAt.set(id, now());
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
    }
    const script = resolveRenderEntrypoint(pluginRoot);
    log(label ?? `heal: ${id} rendered ${renderedVersion ?? "unversioned"} \u2260 ${pluginVersion} \u2192 clean re-render (attempt ${attempts.get(id)}/${cfg.maxAttempts})`);
    let child;
    try {
      child = spawnRender(script, args, {
        cwd: entry.repoRoot,
        env
      });
    } catch (err) {
      inFlight.delete(id);
      log(`${tag}: ${id} spawn failed: ${err?.message ?? err}`);
      try {
        onSettled?.(1);
      } catch {
      }
      pump();
      return;
    }
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      inFlight.delete(id);
      if (code === 0) {
        log(`${tag}: ${id} render complete`);
        try {
          emitReload(id);
        } catch {
        }
      } else {
        log(`${tag}: ${id} render exited ${code}`);
      }
      try {
        onSettled?.(code);
      } catch {
      }
      pump();
    };
    if (child && typeof child.on === "function") {
      child.on("exit", (code) => finish(code ?? 0));
      child.on("error", (err) => {
        log(`${tag}: ${id} child error: ${err?.message ?? err}`);
        finish(1);
      });
    } else {
      finish(0);
    }
  }
  function snapshot() {
    return {
      heal: cfg.heal,
      maxConcurrent: cfg.maxConcurrent,
      inFlight: [...inFlight],
      queued: queue.map((q) => q.entry.id),
      failed: [...failed.entries()].map(([id, v]) => ({ id, ...v }))
    };
  }
  return { consider, submit, isBusy, snapshot, config: cfg };
}

export {
  CODE_BROWSER_DEFAULTS,
  normalizeCodeBrowserConfig,
  codeBrowserConfigFromEnv,
  repoHeadBranch,
  serveCodeBrowserAsset,
  serveCodeBrowser,
  STALE_RENDER_DEFAULTS,
  staleRenderConfigFromEnv,
  createHealController
};
