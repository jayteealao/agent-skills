// lib/code-browser.mjs
//
// Read-only source serving for the code browser (CODEBASE-BROWSER-PLAN): a
// file tree + blob/raw endpoints over a repo's WORKING TREE, consumed by both
// the multi-repo hub (scripts/hub-serve.mjs, under `/r/<id>/__code/`) and the
// standalone per-repo daemon (scripts/render-sunflower-serve.mjs, under
// `/__code/`). Pure node built-ins — this module rides the dep-free runtime.
//
// Security model (plan §6 — load-bearing, read before editing):
// Serving source is a strictly larger perimeter than the `.ai/_view` routes,
// and BY REQUIREMENT gitignored files are displayed — so there is no git
// allowlist. Containment rests on layered checks in `resolveRepoPath`:
//   1. string-level rejects (NUL, absolute, drive/UNC, `.`/`..` segments)
//      before any fs access;
//   2. lexical prefix containment under repoRoot;
//   3. realpath containment (statSync/createReadStream follow symlinks, so a
//      link inside the tree pointing outside it must be refused — including
//      links buried inside gitignored dirs like node_modules);
//   4. the deny matcher — `.git/**` always, plus a secret denylist unless
//      `serveSecrets:true` — applied to BOTH the requested path and the
//      post-realpath location (a symlink may point at a denied file that is
//      itself inside the root). With no git allowlist this matcher is the
//      primary content gate: it matches case-insensitively, on both `/` and
//      `\`, against every path segment.
// Caps (maxBlobBytes / maxTreeEntries / lazy listing) bound response size and
// walk cost; binary bytes are never JSON-dumped; the `raw` route never serves
// repo bytes as text/html (a repo page rendered same-origin would be stored
// XSS — §0.2-5), forces `X-Content-Type-Options: nosniff`, and attaches the
// caller's strict CSP.
//
// Deliberately NOT lib/resolve-request-path.mjs: that kernel maps request URLs
// to view files (index-file defaulting, `/sdlc` strip) and is rooted at a
// viewDir the plugin created. This one takes repo-relative `?path=` values
// against a repoRoot the plugin does NOT own, with the deny gate baked in —
// different contract, separately auditable (plan §1).

import { execFileSync } from 'node:child_process';
import {
  closeSync, createReadStream, existsSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, statSync,
} from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';

/* ───────────────────────── configuration ───────────────────────── */

// Machine-wide defaults; the user-facing copy lives in hub-config.json under
// `codeBrowser` (lib/hub-config.mjs spreads this object into its defaults).
export const CODE_BROWSER_DEFAULTS = Object.freeze({
  enabled: true,            // machine-wide kill switch (mirrors perRepoServe)
  maxBlobBytes: 512 * 1024, // text cap per blob response
  maxTreeEntries: 5000,     // per-listing truncation guard
  lazyTree: true,           // list one folder per request (node_modules is shown, so never eager-walk by default)
  showIgnoredBadge: true,   // badge gitignored nodes (presentation only — costs one cached git spawn)
  serveSecrets: false,      // ⚠ true drops the secret denylist (.env/keys become servable)
  denyGlobs: [],            // appended to denyGlobsDefault(); see compileDeny grammar
});

export function normalizeCodeBrowserConfig(raw) {
  const cfg = { ...CODE_BROWSER_DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  cfg.enabled = cfg.enabled !== false;
  cfg.maxBlobBytes = boundedInt(cfg.maxBlobBytes, 1024, 16 * 1024 * 1024, CODE_BROWSER_DEFAULTS.maxBlobBytes);
  cfg.maxTreeEntries = boundedInt(cfg.maxTreeEntries, 10, 100000, CODE_BROWSER_DEFAULTS.maxTreeEntries);
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

// The daemons are spawned through launch-hidden.vbs on Windows (a shell-ish
// command-line rebuild), so JSON cannot ride argv safely — the supervisors
// pass the codeBrowser block via env instead, mirroring SDLC_HUB_TOKEN.
export const CODE_BROWSER_ENV = 'SDLC_CODE_BROWSER';

export function codeBrowserConfigFromEnv(env = process.env) {
  const raw = env?.[CODE_BROWSER_ENV];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/* ───────────────────────── deny matcher (primary content gate) ───────────────────────── */

const SECRET_GLOBS = Object.freeze([
  '.env', '.env.*', '*.pem', '*.key', 'id_rsa*', '*.p12', '*.keystore',
]);

/** `.git/**` always; the secret set unless serveSecrets. */
export function denyGlobsDefault({ serveSecrets = false } = {}) {
  return serveSecrets ? ['.git/**'] : ['.git/**', ...SECRET_GLOBS];
}

/**
 * Compile deny globs to a matcher. Deliberately SMALL grammar — this is the
 * primary content gate (plan §6.4), so auditability beats glob generality:
 *   • no `/` in the glob → a SEGMENT pattern (`*`/`?` supported), denied when
 *     ANY path segment matches: `.env.*` denies `a/b/.env.local`.
 *   • `/` in the glob → a literal path PREFIX from the repo root (trailing
 *     `/**` accepted and equivalent): `.git/**` denies `.git` and everything
 *     under it. Wildcards inside pathy globs are NOT supported.
 * Matching is case-insensitive and separator-insensitive (`\` ≡ `/`).
 *
 * @returns {(relPath: string) => boolean}
 */
export function compileDeny(globs) {
  const prefixes = [];
  const segRes = [];
  for (const raw of globs ?? []) {
    let g = String(raw).trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
    if (!g) continue;
    if (g.endsWith('/**')) g = g.slice(0, -3);
    if (g.includes('/')) prefixes.push(g);
    else segRes.push(segmentRegex(g));
  }
  return (relPath) => {
    const p = String(relPath ?? '').replace(/\\/g, '/').toLowerCase();
    if (!p) return false;
    for (const pre of prefixes) {
      if (p === pre || p.startsWith(`${pre}/`)) return true;
    }
    if (segRes.length) {
      for (const s of p.split('/')) {
        for (const re of segRes) if (re.test(s)) return true;
      }
    }
    return false;
  };
}

function segmentRegex(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

/* ───────────────────────── containment kernel ───────────────────────── */

export class ContainmentError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.name = 'ContainmentError';
    this.status = status;
  }
}

/**
 * Resolve a repo-relative request path to a real file/dir inside repoRoot,
 * or throw ContainmentError (status 403 for escapes/denies, 404 for paths
 * that do not exist). The security core — every check in plan §3.2, in order.
 *
 * @returns {{ abs: string, real: string, rel: string }} `rel` is the
 *   normalised forward-slash repo-relative path ('' for the root itself).
 */
export function resolveRepoPath(repoRoot, relPath, { deny = null } = {}) {
  // 1. string-level rejects, before any fs access
  if (typeof relPath !== 'string') throw new ContainmentError('bad path');
  if (relPath.includes('\0')) throw new ContainmentError('bad path');
  const fwd = relPath.replace(/\\/g, '/');
  if (fwd.startsWith('/') || /^[a-zA-Z]:/.test(fwd)) throw new ContainmentError('absolute path');
  const segs = fwd.split('/').filter((s) => s !== '');
  for (const s of segs) {
    if (s === '.' || s === '..') throw new ContainmentError('dot segment');
  }
  const rel = segs.join('/');
  if (deny && rel && deny(rel)) throw new ContainmentError('denied');

  // 2. lexical prefix containment
  const rootAbs = resolve(repoRoot);
  const abs = rel ? resolve(rootAbs, rel) : rootAbs;
  const lexRel = relative(rootAbs, abs);
  if (lexRel.startsWith('..') || /^[a-zA-Z]:/.test(lexRel) || lexRel.startsWith(sep)) {
    throw new ContainmentError('escapes root');
  }

  // 3. realpath containment (stops symlink escapes — including from inside
  //    gitignored dirs, which the walk now descends into)
  let realRoot;
  try { realRoot = realpathSync.native(rootAbs); }
  catch { throw new ContainmentError('not found', 404); }
  if (!existsSync(abs)) throw new ContainmentError('not found', 404);
  let real;
  try { real = realpathSync.native(abs); }
  catch { throw new ContainmentError('not found', 404); }
  const rootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
  if (real !== realRoot && !real.startsWith(rootWithSep)) {
    throw new ContainmentError('escapes root');
  }

  // 4. deny re-check on the REAL location: a symlink inside the root may point
  //    at a denied file inside the root (e.g. link → .env); the request path
  //    passed the deny gate, the target must too.
  if (deny && real !== realRoot) {
    const realRel = relative(realRoot, real).replace(/\\/g, '/');
    if (deny(realRel)) throw new ContainmentError('denied');
  }

  return { abs, real, rel };
}

/* ───────────────────────── gitignored badging (presentation only) ───────────────────────── */

const IGNORED_TTL_MS = 5000;
const ignoredCache = new Map();   // realRoot → { at, matcher }
const EMPTY_MATCHER = Object.freeze({ has: () => false, size: 0 });

/**
 * The set of working-tree paths git would ignore, as a prefix-aware matcher —
 * used ONLY to badge nodes `ignored:true` in the tree, never to filter (plan
 * §3.3). `--directory` collapses an ignored dir (node_modules/) to ONE entry,
 * so the spawn stays cheap even with huge ignored trees; descendants match by
 * prefix. TTL-cached per realpathed root; a non-git repoRoot yields an empty
 * matcher (nothing badged) rather than failing.
 */
export function gitIgnoredSet(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  let key;
  try { key = realpathSync.native(repoRoot); } catch { key = resolve(repoRoot); }
  const hit = ignoredCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.matcher;
  const matcher = buildIgnoredMatcher(key);
  ignoredCache.set(key, { at: now, matcher });
  return matcher;
}

function buildIgnoredMatcher(root) {
  let out = '';
  try {
    out = execFileSync(
      'git',
      ['-C', root, 'ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'],
      {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 4000,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch {
    return EMPTY_MATCHER;
  }
  const files = new Set();
  const dirSet = new Set();
  for (const entry of out.split('\0')) {
    if (!entry) continue;
    const p = entry.replace(/\\/g, '/');
    if (p.endsWith('/')) dirSet.add(p.slice(0, -1));
    else files.add(p);
  }
  if (!files.size && !dirSet.size) return EMPTY_MATCHER;
  return {
    has(relPath) {
      const p = String(relPath ?? '').replace(/\\/g, '/');
      if (!p) return false;
      if (files.has(p) || dirSet.has(p)) return true;
      let idx = -1;
      while ((idx = p.indexOf('/', idx + 1)) !== -1) {
        if (dirSet.has(p.slice(0, idx))) return true;
      }
      return false;
    },
    size: files.size + dirSet.size,
  };
}

/* ───────────────────────── HEAD branch (standalone-daemon label) ───────────────────────── */

const headCache = new Map();   // resolved root → { at, branch }

/**
 * The checkout's current HEAD branch, TTL-cached. The hub passes the registry
 * entry's `headBranch`; the standalone daemon has no entry, so it reads git
 * directly. Best-effort: null when not a git repo.
 */
export function repoHeadBranch(repoRoot, { ttlMs = IGNORED_TTL_MS, now = Date.now() } = {}) {
  const key = resolve(repoRoot);
  const hit = headCache.get(key);
  if (hit && now - hit.at < ttlMs) return hit.branch;
  let branch = null;
  try {
    const out = execFileSync('git', ['-C', key, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8', windowsHide: true, timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    branch = out && out !== 'HEAD' ? out : null;
  } catch { branch = null; }
  headCache.set(key, { at: now, branch });
  return branch;
}

/* ───────────────────────── discovery: working-tree walk ───────────────────────── */

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);

// Extension → Shiki lang id. Honest mapping (toml/rust/go included even though
// the default bundle ships 10 langs) — the frontend falls back to plaintext for
// any lang its highlighter didn't load, so the API stays stable if langs grow.
const LANG_BY_EXT = Object.freeze({
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', jsonc: 'json', md: 'markdown', markdown: 'markdown',
  css: 'css', html: 'html', htm: 'html',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', yml: 'yaml', yaml: 'yaml',
  toml: 'toml', rs: 'rust', go: 'go',
});

export function languageFor(name) {
  const base = String(name ?? '').toLowerCase();
  const dot = base.lastIndexOf('.');
  const ext = dot > 0 ? base.slice(dot + 1) : '';
  return LANG_BY_EXT[ext] ?? 'plaintext';
}

/**
 * List the working tree under repoRoot/subPath — INCLUDING gitignored entries
 * (badged via `ignored`, never filtered), excluding only deny-matched paths.
 * `lazy:true` lists one level (dirs carry `hasChildren`); `lazy:false` recurses
 * with a cycle guard (a contained symlink can loop back into an ancestor).
 * `maxEntries` caps TOTAL nodes per call → `truncated:true` when hit.
 */
export function walkDir(repoRoot, {
  subPath = '', lazy = true, maxEntries = 5000, deny = null, ignored = null,
} = {}) {
  const { real: dirReal, rel: baseRel } = resolveRepoPath(repoRoot, subPath, { deny });
  let st;
  try { st = statSync(dirReal); } catch { throw new ContainmentError('not found', 404); }
  if (!st.isDirectory()) throw new ContainmentError('not a directory', 404);
  let realRoot;
  try { realRoot = realpathSync.native(repoRoot); }
  catch { throw new ContainmentError('not found', 404); }

  const ctx = {
    lazy, maxEntries, deny, ignored, realRoot,
    count: 0, truncated: false,
    visited: new Set([dirReal]),   // eager-mode symlink-cycle guard
  };
  const nodes = listLevel(dirReal, baseRel, ctx);
  return { nodes, truncated: ctx.truncated };
}

function listLevel(dirAbs, dirRel, ctx) {
  let entries;
  try { entries = readdirSync(dirAbs, { withFileTypes: true }); }
  catch { return []; }

  // Dirs before files; codepoint order within each — deterministic everywhere.
  entries.sort((a, b) => {
    const ad = a.isDirectory() || a.isSymbolicLink() ? 0 : 1;   // approximate; refined per-node below
    const bd = b.isDirectory() || b.isSymbolicLink() ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const out = [];
  for (const ent of entries) {
    if (ctx.count >= ctx.maxEntries) { ctx.truncated = true; break; }
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
      try { real = realpathSync.native(abs); } catch { real = null; }
      const inRoot = real != null
        && (real === ctx.realRoot || real.startsWith(`${ctx.realRoot}${sep}`));
      if (inRoot) {
        let ts = null;
        try { ts = statSync(abs); } catch { ts = null; }
        if (ts?.isDirectory()) { type = 'dir'; recursable = true; }
        else if (ts?.isFile()) type = 'file';
        else type = 'file';
      } else {
        // Out-of-root or broken target: shown as an opaque leaf — the node is
        // real, but blob/raw for it will refuse (realpath containment).
        type = 'file';
      }
    } else if (ent.isDirectory()) {
      type = 'dir';
      recursable = true;
    } else if (ent.isFile()) {
      type = 'file';
    } else {
      continue;   // sockets, fifos, devices
    }

    ctx.count++;
    const node = { name, path: rel, type };
    if (symlink) node.symlink = true;
    if (ctx.ignored) node.ignored = ctx.ignored.has(rel);
    if (type === 'file') {
      node.lang = languageFor(name);
    } else if (ctx.lazy) {
      node.hasChildren = dirHasEntries(abs);
    } else if (recursable) {
      const realDir = real ?? safeRealpath(abs);
      if (realDir && !ctx.visited.has(realDir)) {
        ctx.visited.add(realDir);
        node.children = listLevel(abs, rel, ctx);
      } else {
        node.children = [];   // cycle (or unresolvable): keep the node, stop descent
      }
    } else {
      node.children = [];
    }
    out.push(node);
  }

  // Final ordering pass: the pre-sort classified symlinked files as dirs;
  // re-sort on the RESOLVED type so the contract (dirs first) actually holds.
  out.sort((a, b) => {
    const ad = a.type === 'dir' ? 0 : 1;
    const bd = b.type === 'dir' ? 0 : 1;
    if (ad !== bd) return ad - bd;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return out;
}

function dirHasEntries(abs) {
  try { return readdirSync(abs).length > 0; } catch { return false; }
}

function safeRealpath(p) {
  try { return realpathSync.native(p); } catch { return null; }
}

/* ───────────────────────── blob reading ───────────────────────── */

/**
 * Read one file with caps and kind detection (plan §3.4):
 *   image (by extension) / binary (NUL in first 8 KB) → metadata only, no
 *   content (the caller adds rawUrl); text → utf-8 content up to maxBlobBytes
 *   with `truncated:true` beyond.
 */
export function readBlob(repoRoot, relPath, { maxBlobBytes = CODE_BROWSER_DEFAULTS.maxBlobBytes, deny = null } = {}) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try { st = statSync(real); } catch { throw new ContainmentError('not found', 404); }
  if (!st.isFile()) throw new ContainmentError('not a file', 404);
  const name = basename(rel) || basename(real);
  const size = st.size;
  const ext = extOf(name);

  if (IMAGE_EXTS.has(ext)) return { path: rel, name, size, kind: 'image' };

  const head = readHead(real, Math.min(size, 8192));
  if (head.includes(0)) return { path: rel, name, size, kind: 'binary' };

  const truncated = size > maxBlobBytes;
  const content = truncated
    ? readHead(real, maxBlobBytes).toString('utf-8')
    : readFileSync(real, 'utf-8');
  return { path: rel, name, size, kind: 'text', language: languageFor(name), truncated, content };
}

function extOf(name) {
  const base = String(name ?? '').toLowerCase();
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

function readHead(file, bytes) {
  if (bytes <= 0) return Buffer.alloc(0);
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally {
    closeSync(fd);
  }
}

/* ───────────────────────── bundle assets (dist/code-browser.*) ───────────────────────── */

// Resolved off this module's own URL: from source lib/ AND from a bundled
// dist/ chunk, `../dist/<file>` lands on the plugin's dist/ (both sit depth-1
// under the plugin root — the build's invariant; same trick as DOCS_ROOT).
const BUNDLE_ASSETS = Object.freeze({
  'code-browser.js': 'text/javascript; charset=utf-8',
  'code-browser.css': 'text/css; charset=utf-8',
});
const bundleCache = new Map();   // name → { body: Buffer }

/**
 * Serve a committed browser-bundle asset from dist/, memory-cached on first
 * hit (misses are NOT cached so a dev build appearing later is picked up).
 * Long immutable cache-control — the shell page version-busts via `?v=`.
 */
export function serveCodeBrowserAsset({ req, res, name }) {
  const type = BUNDLE_ASSETS[name];
  if (!type) { res.writeHead(404).end('not found'); return; }
  let hit = bundleCache.get(name);
  if (!hit) {
    let body = null;
    try { body = readFileSync(new URL(`../dist/${name}`, import.meta.url)); } catch { body = null; }
    if (body == null) { res.writeHead(404).end('code browser bundle not built'); return; }
    hit = { body };
    bundleCache.set(name, hit);
  }
  res.writeHead(200, {
    'content-type': type,
    'content-length': hit.body.length,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  res.end(hit.body);
}

/* ───────────────────────── the shared route adapter ───────────────────────── */

const RAW_IMAGE_MIME = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
  bmp: 'image/bmp', avif: 'image/avif',
});

/**
 * Handle one `__code` request. Mounted by BOTH daemons:
 *   hub:        basePath '/r/<idRaw>/__code'   (raw, undecoded id segment)
 *   standalone: basePath '/__code'
 * Routes (relative to basePath): `/` HTML shell · `/tree[?path=]` JSON ·
 * `/blob?path=` JSON · `/raw?path=` bytes. `config.enabled:false` → 404 all.
 *
 * @param {object} p
 * @param {string} p.basePath — must prefix url.pathname verbatim.
 * @param {string} p.repoRoot — containment root (the hub validates the
 *   registry entry FIRST; this function trusts the caller's repoRoot).
 * @param {string|null} [p.repoId] — registry id (hub) or null (standalone).
 * @param {(opts: object) => string} [p.renderPage] — HTML-shell renderer
 *   (renderers/_code-browser-page.mjs); omitted → shell 404s (Slice-1
 *   JSON-only mode, plan §9).
 * @param {string} [p.csp] — the serving daemon's strict CSP, attached to every
 *   response that has a body.
 * @param {boolean} [p.publicExposure] — true when the daemon is reachable
 *   beyond loopback (allow-all-hosts mode, or a tailnet Host allowlisted).
 *   `serveSecrets:true` is then IGNORED: the secret denylist stays active, so
 *   a config written for a strictly-local hub can never leak .env/keys to a
 *   tailnet by flipping the binding alone (plan §5/§6.6 made literal).
 */
export function serveCodeBrowser({
  req, res, url, basePath, repoRoot,
  repoId = null, repoLabel = '', headBranch = null,
  config = null, pluginVersion = '', csp = '', renderPage = null,
  publicExposure = false,
}) {
  let cfg = normalizeCodeBrowserConfig(config);
  if (!cfg.enabled) { res.writeHead(404).end('not found'); return; }
  if (cfg.serveSecrets && publicExposure) cfg = { ...cfg, serveSecrets: false };

  const pathname = url.pathname;
  if (!pathname.startsWith(basePath)) { res.writeHead(404).end('not found'); return; }
  const rest = pathname.slice(basePath.length);
  if (rest === '') { res.writeHead(301, { location: `${basePath}/` }).end(); return; }

  const deny = compileDeny([
    ...denyGlobsDefault({ serveSecrets: cfg.serveSecrets }),
    ...cfg.denyGlobs,
  ]);
  const branch = typeof headBranch === 'function' ? safeBranch(headBranch) : headBranch ?? null;

  try {
    if (rest === '/') {
      if (!renderPage) { res.writeHead(404).end('not found'); return; }
      const html = renderPage({
        repoId, repoLabel, headBranch: branch, base: basePath, pluginVersion,
      });
      const body = Buffer.from(html, 'utf-8');
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': body.length,
        'cache-control': 'no-cache',
        'x-content-type-options': 'nosniff',
        ...(csp ? { 'content-security-policy': csp } : {}),
      });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(body);
      return;
    }

    if (rest === '/tree') {
      const sub = url.searchParams.get('path') ?? '';
      const ignored = cfg.showIgnoredBadge ? gitIgnoredSet(repoRoot) : null;
      const { nodes, truncated } = walkDir(repoRoot, {
        subPath: sub,
        lazy: cfg.lazyTree,
        maxEntries: cfg.maxTreeEntries,
        deny,
        ignored,
      });
      sendJson(res, req, csp, {
        id: repoId,
        headBranch: branch,
        path: sub.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''),
        lazy: cfg.lazyTree,
        generatedAt: new Date().toISOString(),
        truncated,
        nodes,
      });
      return;
    }

    if (rest === '/blob') {
      const p = url.searchParams.get('path');
      if (!p) { res.writeHead(400).end('missing path'); return; }
      const blob = readBlob(repoRoot, p, { maxBlobBytes: cfg.maxBlobBytes, deny });
      sendJson(res, req, csp, {
        ...blob,
        rawUrl: `${basePath}/raw?path=${encodeURIComponent(blob.path)}`,
      });
      return;
    }

    if (rest === '/raw') {
      const p = url.searchParams.get('path');
      if (!p) { res.writeHead(400).end('missing path'); return; }
      serveRaw({ req, res, repoRoot, relPath: p, deny, csp });
      return;
    }

    res.writeHead(404).end('not found');
  } catch (err) {
    if (err instanceof ContainmentError) {
      res.writeHead(err.status).end(err.status === 404 ? 'not found' : 'forbidden');
      return;
    }
    res.writeHead(500).end('error');
  }
}

// Raw bytes with hardened response types (§0.2-5): NEVER text/html — text
// streams as text/plain, images inline by extension, everything else
// octet-stream as an attachment. nosniff + the daemon's CSP on every variant.
function serveRaw({ req, res, repoRoot, relPath, deny, csp }) {
  const { real, rel } = resolveRepoPath(repoRoot, relPath, { deny });
  let st;
  try { st = statSync(real); } catch { throw new ContainmentError('not found', 404); }
  if (!st.isFile()) throw new ContainmentError('not a file', 404);
  const name = basename(rel) || basename(real);
  const ext = extOf(name);

  let type;
  let disposition;
  if (RAW_IMAGE_MIME[ext]) {
    type = RAW_IMAGE_MIME[ext];
    disposition = 'inline';
  } else if (readHead(real, Math.min(st.size, 8192)).includes(0)) {
    type = 'application/octet-stream';
    disposition = `attachment; filename="${sanitizeFilename(name)}"`;
  } else {
    type = 'text/plain; charset=utf-8';
    disposition = 'inline';
  }

  res.writeHead(200, {
    'content-type': type,
    'content-length': st.size,
    'content-disposition': disposition,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    ...(csp ? { 'content-security-policy': csp } : {}),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  createReadStream(real).pipe(res);
}

function sanitizeFilename(name) {
  return String(name).replace(/[^\w.@-]+/g, '_');
}

function sendJson(res, req, csp, payload) {
  const body = `${JSON.stringify(payload)}\n`;
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    ...(csp ? { 'content-security-policy': csp } : {}),
  });
  if (req.method === 'HEAD') { res.end(); return; }
  res.end(body);
}

function safeBranch(fn) {
  try { return fn() ?? null; } catch { return null; }
}
