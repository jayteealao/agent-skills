// The design server: one local server for this computer. It serves the canvas of every repo in
// `~/.sdlc/design-repos.json` and the brainstorm pages of those repos. The phone reaches it over
// the tailnet.
//
// The server reads the files of each request. It keeps one thing in memory: the canvas state of
// each repo, which a worker thread builds and which stays until a file that it reads changes
// (`stateStamp`). While a canvas is open, it watches those files and pushes each change to the
// canvas over an event stream (`/r/<repo>/events`). It keeps no version state, no render queue and no reap. It writes in three cases only: a comment on a screen that exists, the
// saved positions of the canvas layout, and the restore of a version as a new round. It starts one process: the read-only design audit
// agent of the Audit button (design-audit.mjs), one run per repo at a time. Each write names a
// listed repo, and every other path is refused. It listens on 127.0.0.1 and on the addresses of
// Tailscale only; the tailnet is its first protection. A request whose Host is not one of those
// addresses with the port is refused before any route, so a page that rebinds its DNS name to this
// computer reaches nothing.
//
// A write needs three things: JSON from a page of this server (the Origin or the Referer names
// it, and one of them must be there), a page that is not a design page, and the write token of
// this run in the `x-wf-canvas` header. The server makes the token at its start and gives it to
// the canvas in the `hello` event and in `state.json` (`writeToken`).
//
// A design page (a screen, a page at a commit, a page of a version) is an agent file. It is
// served with a content security policy: it loads only files of this server and inline code, it
// opens no connection (no fetch, no socket, no form), and it frames nothing. The page still runs
// its inline script in the origin of the server, so inside the canvas it can reach the canvas
// window; the policy stops what it can load and send by itself.
import { createServer } from 'node:http';
import { Worker } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, watch } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './atomic-write.mjs';
import { Refusal, agentFix, personFix, refuse } from './fix.mjs';
import { appendLogLine, errorsLogPath, readMachineConfig, sdlcHomeDir } from './home.mjs';
import { pidAlive } from './proc.mjs';
import { CANVAS_DIR, screenFailures, stateFiles, stateStamp } from './design-state.mjs';
import { addComment, approvalPicture, capturePicture, designRecordsLinked, readComments } from './design-records.mjs';
import { readAudit, startAudit } from './design-audit.mjs';
import { isWorkflowSlug, restoreVersion, versionDir, versionName } from './design-versions.mjs';
import { COMPONENTS_FILE, KEY_RE, LAYOUT_FILE, LAYOUT_SHEET, MANIFEST_FILE, SURFACE_REL, TOKENS_FILE, TOKENS_JSON, manifestFault, readDesignRepos, readManifest, surfaceDir, withDesignLock } from './design-surface.mjs';
import { checkReferences } from './design-references.mjs';
import { PAGE_REL } from './brainstorm-page.mjs';
import { recordsHome, workflowsRoot } from './records-root.mjs';

export const DEFAULT_PORT = 4711;
export const TASK_NAME = 'sdlc-design-server';
export const serverInfoPath = () => join(sdlcHomeDir(), 'design-server.json');
const MAX_BODY = 64 * 1024;
const MAX_STREAMS = 64;
const SHA_RE = /^[0-9a-f]{7,40}$/;
const CANVAS_FILES = new Set(['index.html', 'canvas.css', 'canvas.js']);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
// A brainstorm page and a reference are agent or outside files: they run with no origin, so
// their scripts cannot call the write routes.
const SANDBOX = { 'content-security-policy': 'sandbox allow-scripts' };
// A brainstorm page is one self-contained file: it also fetches nothing.
const PAGE_SANDBOX = { 'content-security-policy': "sandbox allow-scripts; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:" };
// A design page loads the files of this server and its inline code, and nothing from the network.
// It opens no connection, sends no form and frames nothing.
export const SCREEN_CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'";
const SCREEN_PAGE = { 'content-security-policy': SCREEN_CSP };

/** The header of a write that carries the write token of this run. */
export const WRITE_HEADER = 'x-wf-canvas';
// The token of this run. A write without it is refused, so a page that only knows the address
// of the server cannot write.
const WRITE_TOKEN = randomBytes(24).toString('base64url');
/** The write token of this run, for the canvas (`hello`, `state.json`) and for a test. */
export const writeToken = () => WRITE_TOKEN;

/** The port of the server: machine config `design.port`, else 4711. */
export function serverPort(config = readMachineConfig()) {
  const p = Number(config?.design?.port);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : DEFAULT_PORT;
}

const inTailnetRange = (address) => {
  const [x, y] = String(address).split('.').map(Number);
  return x === 100 && y >= 64 && y <= 127;
};

/** The IPv4 addresses of this computer, and those of an interface whose name starts with "Tailscale". */
function localAddresses(ifaces) {
  const local = new Set();
  const named = new Set();
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      local.add(a.address);
      if (/^tailscale/i.test(name) && inTailnetRange(a.address)) named.add(a.address);
    }
  }
  return { local, named };
}
const fromBinary = (stdout, local) => [...new Set(String(stdout ?? '').split(/\s+/).filter((h) => inTailnetRange(h) && local.has(h)))];

/**
 * The addresses of this computer on the tailnet, besides 127.0.0.1. A carrier-grade NAT address of
 * another interface (mobile broadband, tethering) is in the same range, so the range alone is not
 * enough:
 *   - machine config `design.hosts` names the addresses, when it is set;
 *   - else `tailscale ip -4` names them, when the binary answers;
 *   - else an address of the range on an interface whose name starts with "Tailscale" (Windows,
 *     Linux). On macOS Tailscale uses a `utun` interface, which other tunnels use too: there,
 *     with no binary, set `design.hosts`.
 * Each address must be on an interface of this computer.
 */
export function tailnetAddresses(ifaces = networkInterfaces(), { run = spawnSync, config = readMachineConfig() } = {}) {
  const { local, named } = localAddresses(ifaces);
  const given = config?.design?.hosts;
  if (Array.isArray(given)) return [...new Set(given.map(String).filter((h) => local.has(h)))];
  let r = null;
  try { r = run('tailscale', ['ip', '-4'], { encoding: 'utf8', windowsHide: true, timeout: 3000 }); } catch { r = null; }
  if (r && r.status === 0 && !r.error) return fromBinary(r.stdout, local);
  return [...named];
}

/** The same addresses, found without a wait of the server: the binary runs beside it. */
export function tailnetAddressesAsync(ifaces = networkInterfaces(), { config = readMachineConfig() } = {}) {
  const { local, named } = localAddresses(ifaces);
  const given = config?.design?.hosts;
  if (Array.isArray(given)) return Promise.resolve([...new Set(given.map(String).filter((h) => local.has(h)))]);
  return new Promise((ok) => {
    try {
      execFile('tailscale', ['ip', '-4'], { encoding: 'utf8', windowsHide: true, timeout: 3000 }, (err, stdout) => ok(err ? [...named] : fromBinary(stdout, local)));
    } catch { ok([...named]); }
  });
}

const leaves = (r) => !r || r.startsWith('..') || isAbsolute(r);

/** `rel` inside `base`, or null when it leaves `base`. */
function inside(base, rel) {
  if (!rel || rel.includes('\0')) return null;
  const abs = resolve(base, rel);
  return leaves(relative(resolve(base), abs)) ? null : abs;
}

/**
 * `rel` inside `base` as a file that exists, or null. The real path decides: a link or a
 * junction that leads out of `within` (the repo, or the records of the project) is refused.
 */
function insideReal(base, rel, within = base) {
  const abs = inside(base, rel);
  if (!abs) return null;
  try { return leaves(relative(realpathSync(within), realpathSync(abs))) ? null : abs; } catch { return null; }
}
/** A file of the records that a route built from checked names: null when a link leads out of the records. */
function recordsFile(root, abs) {
  try { return leaves(relative(realpathSync(workflowsRoot(root)), realpathSync(abs))) ? null : abs; } catch { return null; }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The brainstorm pages of one repo: `[{ slug, file }]`. */
export function brainstormPages(root) {
  const dir = workflowsRoot(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((slug) => !slug.startsWith('.') && !slug.startsWith('_') && existsSync(join(dir, slug, PAGE_REL)))
    .sort().map((slug) => ({ slug, file: join(dir, slug, PAGE_REL) }));
}

function indexPage(repos) {
  const rows = repos.map((r) => {
    const pages = existsSync(r.root) ? brainstormPages(r.root) : [];
    const screens = existsSync(r.root) ? Object.keys(readManifest(r.root).screens).length : 0;
    return `<li><a href="/r/${encodeURIComponent(r.name)}/">${escapeHtml(r.name)}</a> <small>${screens} screen(s)${existsSync(r.root) ? '' : ' · the folder is gone'}</small>${
      pages.length ? `<ul>${pages.map((p) => `<li><a href="/b/${encodeURIComponent(r.name)}/${encodeURIComponent(p.slug)}/">${escapeHtml(p.slug)}</a> <small>brainstorm</small></li>`).join('')}</ul>` : ''}</li>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design</title><style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;max-width:720px}li{margin:6px 0}a{display:inline-block;min-height:24px}small{color:GrayText}</style></head>
<body><h1>Design</h1>${repos.length ? `<ul>${rows}</ul>` : '<p>No repo yet. Run <code>wf.mjs design init &lt;root&gt;</code> in a product repo.</p>'}</body></html>`;
}

// Text compresses about ten times; a picture or a font is compressed already.
const COMPRESS = /^(text\/|application\/json|image\/svg)/;
/** True while an answer can still start: no head was sent and the connection is open. */
const open = (res) => !res.headersSent && !res.writableEnded && !res.destroyed;
function send(res, status, body, headers = {}) {
  if (!open(res)) return;
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const out = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers };
  if (buf.length > 1024 && COMPRESS.test(String(out['content-type'] ?? '')) && /\bgzip\b/.test(String(res.req?.headers['accept-encoding'] ?? ''))) {
    buf = headers.gzipped ?? gzipSync(buf);
    out['content-encoding'] = 'gzip';
    out.vary = 'accept-encoding';
  }
  delete out.gzipped;
  res.writeHead(status, { ...out, 'content-length': buf.length });
  res.end(buf);
}
/** A 304 when the browser holds this version already: it asked with the same ETag. */
function fresh(res, etag, headers = {}) {
  if (res.req?.headers['if-none-match'] !== etag) return false;
  res.writeHead(304, { etag, 'cache-control': 'no-cache', ...headers });
  res.end();
  return true;
}
const json = (res, status, value) => send(res, status, value, { 'content-type': TYPES['.json'] });
/** A failed answer. It never throws: an answer that has started is left as it is. */
const fail = (res, status, reason, fix = null) => { try { json(res, status, { ok: false, reason, ...(fix ? { fix } : {}) }); } catch { /* the connection is gone */ } };

/** Write an error of the server to its error log and to stderr. A client never reads it. */
function logError(where, e) {
  const line = JSON.stringify({ at: new Date().toISOString(), label: `design-server:${where}`, message: e?.message ?? String(e), stack: e?.stack ?? null });
  try { appendLogLine(errorsLogPath(), line); } catch { /* stderr still has it */ }
  try { process.stderr.write(`design server: ${where}: ${e?.stack ?? e}\n`); } catch { /* no stderr */ }
}
/** The text of a failure for a client: no folder of this computer is in it. */
function publicText(text, root = null) {
  let t = String(text ?? '');
  for (const p of [root, recordsHome(), sdlcHomeDir(), homedir()].filter(Boolean)) {
    for (const form of [p, p.split(sep).join('/'), p.split(sep).join('\\\\')]) t = t.split(form).join('…');
  }
  return t;
}
const SERVER_FAILED = 'the design server failed on this request; the error is in its log';

/**
 * A file, with an ETag of its size and time. The browser keeps it and asks again each time
 * (`no-cache`), so a changed page shows at once and an unchanged one costs a 304.
 */
function file(res, abs, headers = {}) {
  let st = null;
  try { st = abs ? statSync(abs) : null; } catch { st = null; }
  if (!st?.isFile()) return fail(res, 404, 'not found');
  const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
  if (fresh(res, etag, headers)) return undefined;
  return send(res, 200, readFileSync(abs), { 'content-type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache', etag, ...headers });
}

/* ───────────────────────── the records commits ───────────────────────── */

// A comment and a restore write files of the records. The commit of those files waits for the
// records lock and runs git, so it runs on a worker thread after the answer, one commit at a
// time. A commit that failed is kept for each repo and goes into the state, so the canvas can
// say that the records of this computer are ahead of the records repo.
const commits = new Map();
const commitOf = (root) => { if (!commits.has(root)) commits.set(root, { seq: 0, pending: 0, failed: null }); return commits.get(root); };
const COMMIT_WORKER = new URL('./design-commit-worker.mjs', import.meta.url);
let commitChain = Promise.resolve();
function runCommit(root, message) {
  return new Promise((ok) => {
    let w = null;
    try { w = new Worker(COMMIT_WORKER, { workerData: { root, message } }); } catch { ok(false); return; }
    w.once('message', (m) => ok(Boolean(m?.ok)));
    w.once('error', () => ok(false));
    w.once('exit', () => ok(false));
  });
}
/** Commit the design records of a repo in the background. Resolves when that commit ended. */
export function queueCommit(root, message) {
  if (!designRecordsLinked(root)) return Promise.resolve(true);
  const c = commitOf(root);
  c.pending += 1;
  c.seq += 1;
  commitChain = commitChain.then(() => runCommit(root, message)).then((ok) => {
    c.pending -= 1;
    c.failed = ok ? null : { at: new Date().toISOString(), reason: 'the commit of the design records failed: the change is saved on this computer, and the records log says why' };
    c.seq += 1;
    announce(root).catch(() => {});
    return ok;
  });
  return commitChain;
}

/* ───────────────────────── the canvas state ───────────────────────── */

// The canvas state of each repo root: the JSON of one stamp, the answer made from it, and the build that runs.
const built = new Map();
const states = new Map();
const building = new Map();
// The ETag of a state carries the start of this server too: a new server can build a state of a
// new shape from the same files, and a browser must not keep the state of the old code.
const BOOT = Date.now().toString(36);
const WORKER = new URL('./design-state-worker.mjs', import.meta.url);
function buildState(root, repo) {
  return new Promise((ok, no) => {
    const w = new Worker(WORKER, { workerData: { root, repo } });
    w.once('message', (m) => (m.ok ? ok(m.json) : no(new Error(m.error))));
    w.once('error', no);
    w.once('exit', (code) => { if (code) no(new Error(`the state build stopped with code ${code}`)); });
  });
}
function jsonOf(root, repo, stamp) {
  const held = built.get(root);
  if (held?.stamp === stamp) return Promise.resolve(held.json);
  const run = building.get(root);
  if (run?.stamp === stamp) return run.promise;
  const promise = buildState(root, repo).then((text) => {
    built.set(root, { stamp, json: text });
    return text;
  }).finally(() => { if (building.get(root)?.promise === promise) building.delete(root); });
  building.set(root, { stamp, promise });
  return promise;
}
/**
 * The canvas state of a repo. It is built again only when a file that it reads changed; requests
 * that come during a build wait for that one build. The server adds what only it knows: the write
 * token of this run (`writeToken`) and the state of the background commits (`recordsCommit`:
 * `{ pending, failed }`, where `failed` is null or `{ at, reason }`), and why the manifest does
 * not read (`manifestFault`: null, or the reason; the state then shows no screen).
 */
export async function stateOf(root, repo, files = undefined) {
  const stamp = stateStamp(root, files);
  const key = `${stamp}-${commitOf(root).seq}`;
  const held = states.get(root);
  if (held?.key === key) return held;
  const text = await jsonOf(root, repo, stamp);
  const c = commitOf(root);
  const now = `${stamp}-${c.seq}`;
  const extra = JSON.stringify({ writeToken: WRITE_TOKEN, recordsCommit: { pending: c.pending, failed: c.failed }, manifestFault: manifestFault(root) });
  const body = Buffer.from(text === '{}' ? extra : `${extra.slice(0, -1)},${text.slice(1)}`);
  const s = { stamp, key: now, body, gzipped: gzipSync(body), etag: `"${now}-${BOOT}"` };
  states.set(root, s);
  return s;
}

/** Build the state of every listed repo, one at a time, so the first canvas of each opens at once. */
export async function warmStates(repos = readDesignRepos()) {
  for (const r of repos) {
    if (!existsSync(join(surfaceDir(r.root), MANIFEST_FILE))) continue;
    try { await stateOf(r.root, r.name); } catch { /* the canvas builds it on its first request */ }
  }
}

/* ───────────────────────── live updates ───────────────────────── */

// A canvas holds one event stream for its repo. While a repo has a stream, the server watches the
// folders that its state reads, and checks the files again every few seconds for a change that a
// watch misses, such as a commit. On a change it builds the new state first, then tells each
// canvas which pages changed, so the canvas reloads only those pages.
const feeds = new Map();
const SETTLE_MS = 250;
const POLL_MS = 5000;
const PING_MS = 25000;
let streams = 0;

/** The pages and the parts of the surface that the changed files touch. */
export function changeOf(root, paths) {
  const surface = surfaceDir(root);
  const pages = new Set();
  const parts = new Set();
  let all = false;
  for (const p of paths) {
    const rel = relative(surface, p).split(sep).join('/');
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) continue;
    const page = /^screens\/([a-z0-9-]+)(?:\.html$|\/)/.exec(rel);
    if (page) pages.add(page[1]);
    // A page links the token sheet, the layout sheet, the component sheet and the shared sources:
    // each page shows them. The token model goes with the token sheet.
    else if ([TOKENS_FILE, TOKENS_JSON, LAYOUT_SHEET, COMPONENTS_FILE].includes(rel) || rel.startsWith('source/')) all = true;
    else if (/^(explore|components)\//.test(rel)) parts.add(rel);
  }
  return { pages: [...pages].sort(), parts: [...parts].sort(), all };
}

const tell = (f, message) => { for (const c of f.clients) { try { c.write(message); } catch { /* the stream closed */ } } };

async function check(root) {
  const f = feeds.get(root);
  if (!f) return;
  if (f.busy) { f.again = true; return; }
  f.busy = true;
  let stamp = null;
  try {
    const files = stateFiles(root);
    const changed = [...new Set([...files.keys(), ...f.files.keys()])].filter((p) => files.get(p) !== f.files.get(p));
    if (!changed.length) { f.files = files; return; }
    stamp = stateStamp(root, files);
    // The same files failed to build a moment ago: they will fail again. The next change is tried.
    if (f.failed === stamp) return;
    const state = await stateOf(root, f.repo, files);
    tell(f, `event: change\ndata: ${JSON.stringify({ etag: state.etag, ...changeOf(root, changed) })}\n\n`);
    // Only a change that reached the canvases is done: after a failed build the next check sends it.
    f.files = files;
    f.failed = null;
  } catch { f.failed = stamp; } finally {
    f.busy = false;
    if (f.again) { f.again = false; check(root); }
  }
}

/** Tell the canvases of a repo that its state changed with no file of a page: a background commit ended. */
async function announce(root) {
  const f = feeds.get(root);
  if (!f) return;
  const state = await stateOf(root, f.repo);
  tell(f, `event: change\ndata: ${JSON.stringify({ etag: state.etag, pages: [], parts: [], all: false })}\n\n`);
}

function stopFeed(root) {
  const f = feeds.get(root);
  if (!f) return;
  for (const w of f.watchers) w.close();
  clearInterval(f.poll);
  clearInterval(f.ping);
  clearTimeout(f.timer);
  feeds.delete(root);
}

/** Add an event stream of a canvas to the feed of its repo, and start the feed when it is the first. */
function subscribe(root, repo, res) {
  let f = feeds.get(root);
  if (!f) {
    f = { repo, clients: new Set(), files: stateFiles(root), watchers: [], timer: null, busy: false, again: false, failed: null };
    const nudge = () => { clearTimeout(f.timer); f.timer = setTimeout(() => check(root), SETTLE_MS); };
    for (const dir of [surfaceDir(root), workflowsRoot(root)]) {
      if (!existsSync(dir)) continue;
      try { f.watchers.push(watch(dir, { recursive: true }, nudge).on('error', () => {})); } catch { /* the poll covers it */ }
    }
    f.poll = setInterval(() => check(root), POLL_MS);
    f.ping = setInterval(() => tell(f, ': ping\n\n'), PING_MS);
    feeds.set(root, f);
  }
  f.clients.add(res);
  streams += 1;
  res.on('close', () => { streams -= 1; f.clients.delete(res); if (!f.clients.size) stopFeed(root); });
}

function readBody(req) {
  return new Promise((ok, no) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { no(new Error('the body is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      let value = null;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { no(new Error('the body is not JSON')); return; }
      if (!value || typeof value !== 'object' || Array.isArray(value)) no(new Error('the body is not a JSON object'));
      else ok(value);
    });
    req.on('error', () => no(new Error('the request stopped')));
  });
}

/**
 * True when the Host of the request names this server: 127.0.0.1, localhost or [::1], or the
 * address that the connection came in on, with the port of that connection. A page that rebinds
 * its own DNS name to this computer sends its own name as the Host.
 */
export function hostAllowed(req) {
  const port = req.socket?.localPort;
  const host = String(req.headers.host ?? '').toLowerCase();
  if (!port || !host) return false;
  const addr = String(req.socket?.localAddress ?? '').replace(/^::ffff:/, '');
  const names = ['127.0.0.1', 'localhost', '[::1]', ...(addr ? [addr.includes(':') ? `[${addr}]` : addr] : [])];
  return names.some((n) => host === `${n}:${port}`);
}

// The routes that serve design pages and references. A write never comes from one of them.
const PAGE_ROUTE = /^\/(?:r\/[^/]+\/(?:s|at|versions|ref)\/|b\/)/;

/**
 * Why a write is refused, or null. A write is JSON from the canvas of this server: its Origin or
 * its Referer names this server (one of them must be there), its Referer is no design page, and
 * it carries the write token of this run.
 */
function writeAllowed(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return 'a write must be application/json';
  const host = String(req.headers.host ?? '').toLowerCase();
  const { origin, referer } = req.headers;
  if (!origin && !referer) return 'a write must come from the canvas of this server: it names no origin';
  if (origin) {
    try { if (new URL(origin).host !== host) return 'a write must come from a page of this server'; } catch { return 'the origin is not a URL'; }
  }
  if (referer) {
    let from = null;
    try { from = new URL(referer); } catch { return 'the referer is not a URL'; }
    if (from.host !== host) return 'a write must come from a page of this server';
    if (PAGE_ROUTE.test(from.pathname)) return 'a write must come from the canvas, not from a design page';
  }
  const given = Buffer.from(String(req.headers[WRITE_HEADER] ?? ''));
  const want = Buffer.from(WRITE_TOKEN);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return `a write must carry the write token of this server in ${WRITE_HEADER}: load the canvas again`;
  return null;
}

/**
 * Validate and save the canvas positions: only keys of existing screens, only finite numbers.
 * A key with `null` loses its position, so the canvas lays that screen out again. Returns
 * `{ saved, removed }`.
 */
export function saveLayout(root, positions) {
  const again = agentFix('Send positions as { "<screen key>": { "x": <number>, "y": <number> } }, or null to remove one.');
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) throw refuse('positions must be an object', again);
  const screens = readManifest(root).screens;
  const clean = {};
  const gone = [];
  for (const [key, p] of Object.entries(positions)) {
    if (!KEY_RE.test(key)) throw refuse('a position names no screen key', again);
    if (p === null) { gone.push(key); continue; }
    if (!screens[key]) throw refuse(`there is no screen ${key}`, again);
    const x = Number(p?.x); const y = Number(p?.y);
    if (typeof p !== 'object' || p.x === null || p.y === null || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) throw refuse(`the position of ${key} is not two numbers`, again);
    clean[key] = { x: Math.round(x), y: Math.round(y) };
  }
  const path = join(surfaceDir(root), LAYOUT_FILE);
  return withDesignLock(path, () => {
    let layout = {};
    try { layout = JSON.parse(readFileSync(path, 'utf8')); } catch { layout = {}; }
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) layout = {};
    const was = layout.positions && typeof layout.positions === 'object' && !Array.isArray(layout.positions) ? layout.positions : {};
    const next = { ...was, ...clean };
    const removed = gone.filter((k) => Object.hasOwn(next, k));
    for (const k of gone) delete next[k];
    layout.positions = next;
    writeFileAtomic(path, `${JSON.stringify(layout, null, 2)}\n`);
    return { saved: Object.keys(clean).length, removed: removed.length };
  });
}

/** A file of the surface as of one commit, from git. It runs beside the server, which waits for no git call. */
function atCommit(root, sha, rel) {
  // `./` resolves the path from the root, which may be a folder inside its git repo.
  return new Promise((ok) => {
    try {
      execFile('git', ['-C', root, 'show', `${sha}:./${SURFACE_REL}/${rel}`], { windowsHide: true, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => ok(err ? null : stdout));
    } catch { ok(null); }
  });
}

/**
 * The request handler. `repos` is read for each request, so a new repo needs no restart.
 * `audit` starts and reads the design audit; a test passes its own.
 */
export function designHandler({ repos = readDesignRepos, audit = { start: startAudit, read: readAudit } } = {}) {
  return async (req, res) => {
    let root = null;
    try {
      if (!hostAllowed(req)) return fail(res, 403, 'the Host of the request is not this server');
      const url = new URL(req.url, 'http://localhost');
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p)); } catch { return fail(res, 400, 'a bad path'); }
      if (parts.some((p) => p === '..' || p === '.' || p.includes('/') || p.includes('\\') || p.includes('\0'))) return fail(res, 400, 'a bad path');
      const method = req.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return fail(res, 405, 'method not allowed');
      if (parts.length === 0) return send(res, 200, indexPage(repos()), { 'content-type': TYPES['.html'] });
      // The pid tells a caller that this server, and no other program on the port, answered.
      if (parts[0] === 'health') return json(res, 200, { ok: true, repos: repos().length, pid: process.pid });
      if (parts[0] === 'canvas' && parts.length === 2 && CANVAS_FILES.has(parts[1])) return file(res, join(CANVAS_DIR, parts[1]));
      if (parts[0] !== 'r' && parts[0] !== 'b') return fail(res, 404, 'not found');
      const repo = repos().find((r) => r.name === parts[1]);
      if (!repo || !existsSync(repo.root)) return fail(res, 404, 'no such repo on the list');
      root = repo.root;
      if (parts[0] === 'b') {
        const slug = parts[2];
        if (!slug || !KEY_RE.test(slug)) return fail(res, 404, 'not found');
        const pageDir = join(workflowsRoot(root), slug, 'page');
        if (parts.length === 3 && !url.pathname.endsWith('/')) return send(res, 301, '', { location: `${url.pathname}/` });
        return file(res, insideReal(pageDir, parts.length === 3 ? 'index.html' : parts.slice(3).join('/'), workflowsRoot(root)), PAGE_SANDBOX);
      }
      const [, , kind, ...rest] = parts;
      if (method === 'POST') {
        const refused = writeAllowed(req);
        if (refused) return fail(res, 403, refused);
        let body;
        try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
        try {
          if (kind === 'comments' && rest.length === 1) {
            // The records commit follows in the background: the answer does not wait for git.
            const r = addComment(root, rest[0], { thread: body.thread ?? null, text: String(body.text ?? ''), author: String(body.author ?? 'someone').slice(0, 60), anchor: body.anchor ?? null, resolve: body.resolve === true, reopen: body.reopen === true, commit: false });
            if (r.ok === false) return fail(res, 400, r.reason, r.fix);
            queueCommit(root, `design: a comment on ${rest[0]}`);
            // The answer carries the threads of the screen, so the canvas redraws that screen only.
            return json(res, 200, { ...r, ok: true, threads: readComments(root, rest[0]).threads });
          }
          if (kind === 'versions' && rest.length === 2 && rest[1] === 'restore') {
            const r = restoreVersion(root, rest[0], String(body.id ?? ''), { commit: false });
            if (!r.ok) return fail(res, 400, publicText(r.reason, root), r.fix);
            if (r.saved) queueCommit(root, `design: restore ${versionName(r.restored)} of ${rest[0]}`);
            return json(res, 200, r);
          }
          if (kind === 'layout' && rest.length === 0) return json(res, 200, { ok: true, ...saveLayout(root, body.positions) });
          if (kind === 'audit' && rest.length === 0) {
            const workflow = body.workflow ? String(body.workflow) : null;
            if (workflow !== null && !KEY_RE.test(workflow)) return fail(res, 400, 'a bad workflow');
            const r = audit.start(root, { workflow, repo: repo.name });
            return r.started ? json(res, 202, { ok: true, ...r.report }) : fail(res, 409, r.reason);
          }
        } catch (e) {
          // A refusal says what the sender got wrong. Any other error is the server's: it is logged, not sent.
          if (e instanceof Refusal) return fail(res, 400, publicText(e.message, root), e.fix);
          logError(`POST ${kind}`, e);
          return fail(res, 500, SERVER_FAILED, personFix('Read the error log of the design server, then try again.'));
        }
        return fail(res, 404, 'no such write route');
      }
      if (!kind) {
        if (!url.pathname.endsWith('/')) return send(res, 301, '', { location: `${url.pathname}/${url.search}` });
        return file(res, join(CANVAS_DIR, 'index.html'));
      }
      if (kind === 'events' && rest.length === 0) {
        if (streams >= MAX_STREAMS) return fail(res, 503, 'too many open canvases: close one, then load this one again');
        // The feed starts before the head: a feed that cannot start is a failed answer, not a broken stream.
        subscribe(root, repo.name, res);
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
        res.write(`retry: 3000\n\nevent: hello\ndata: ${JSON.stringify({ boot: BOOT, writeToken: WRITE_TOKEN })}\n\n`);
        return undefined;
      }
      if (kind === 'state.json' && rest.length === 0) {
        const s = await stateOf(root, repo.name);
        if (fresh(res, s.etag)) return undefined;
        return send(res, 200, s.body, { 'content-type': TYPES['.json'], 'cache-control': 'no-cache', etag: s.etag, gzipped: s.gzipped });
      }
      if (kind === 'failures' && rest.length === 1 && /^[a-z0-9-]+\.json$/.test(rest[0])) return json(res, 200, screenFailures(root, rest[0].slice(0, -5)));
      if (kind === 'audit.json' && rest.length === 0) return json(res, 200, audit.read(root));
      if (kind === 's') return file(res, insideReal(surfaceDir(root), rest.join('/'), root), SCREEN_PAGE);
      if (kind === 'at' && rest.length >= 2) {
        if (!SHA_RE.test(rest[0])) return fail(res, 400, 'a bad commit');
        const rel = rest.slice(1).join('/');
        if (!inside(surfaceDir(root), rel)) return fail(res, 400, 'a bad path');
        const buf = await atCommit(root, rest[0], rel);
        // A file at a commit never changes.
        return buf ? send(res, 200, buf, { 'content-type': TYPES[extname(rel).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'max-age=31536000, immutable', ...SCREEN_PAGE }) : fail(res, 404, 'not in that commit');
      }
      if (kind === 'versions' && rest.length >= 3) {
        const dir = versionDir(root, rest[0], rest[1]);
        if (!dir) return fail(res, 400, 'a bad version');
        const rel = rest.slice(2).join('/');
        if (!inside(dir, rel)) return fail(res, 400, 'a bad path');
        const own = insideReal(dir, rel, workflowsRoot(root));
        if (own) return file(res, own, SCREEN_PAGE);
        // A version keeps the pages and the sheets. A page that it lacks is missing: the page of
        // today is another design, and it never stands in for the page of a version.
        if (/^screens\/[^/]+\.html$/.test(rel) || !existsSync(join(dir, 'version.json'))) return fail(res, 404, `${versionName(rest[1])} of ${rest[0]} holds no such page`);
        // Any other file of a page, such as the picture of a legacy frame, comes from the surface.
        return file(res, insideReal(surfaceDir(root), rel, root), SCREEN_PAGE);
      }
      if (kind === 'approvals' && rest.length === 2 && SHA_RE.test(rest[0]) && /^[a-z0-9-]+\.png$/.test(rest[1])) return file(res, recordsFile(root, approvalPicture(root, rest[0], rest[1].slice(0, -4))), { 'cache-control': 'max-age=31536000, immutable' });
      if (kind === 'captures' && rest.length === 3 && rest.slice(0, 2).every((p) => /^[a-z0-9._-]+$/i.test(p)) && /^[a-z0-9-]+\.png$/.test(rest[2])) {
        return file(res, recordsFile(root, capturePicture(root, rest[0], rest[1], rest[2].slice(0, -4))));
      }
      if (kind === 'ref' && rest.length === 1) {
        const ref = checkReferences(root).references.find((r) => r.key === rest[0]);
        if (!ref?.readable) return fail(res, 404, ref ? 'this reference cannot be read: wf.mjs design refs check says why' : 'no such reference');
        return file(res, insideReal(root, relative(root, resolve(root, ref.file))), SANDBOX);
      }
      return fail(res, 404, 'not found');
    } catch (e) {
      logError(`${req.method} ${String(req.url).split('?')[0]}`, e);
      return fail(res, 500, SERVER_FAILED);
    }
  };
}

/** Listen on 127.0.0.1 and on each tailnet address. Returns `{ servers, addresses, port }`. */
export async function listenDesignServer({ port = serverPort(), hosts = ['127.0.0.1', ...tailnetAddresses()], handler = designHandler(), log = (t) => process.stderr.write(t) } = {}) {
  const servers = [];
  const addresses = [];
  for (const host of hosts) {
    const server = createServer(handler);
    try {
      // Port 0 picks a free port on the first address; the other addresses use the same port.
      const at = servers.length ? servers[0].address().port : port;
      await new Promise((ok, no) => { server.once('error', no); server.listen(at, host, ok); });
      servers.push(server);
      addresses.push(`http://${host}:${server.address().port}/`);
    } catch (e) {
      if (host === '127.0.0.1') { for (const s of servers) s.close(); throw e; }
      log(`design server: not listening on ${host}: ${e.message}\n`);
    }
  }
  return { servers, addresses, port: servers[0].address().port };
}

/**
 * Listen on the tailnet addresses that came up since the start, and close the listeners of the
 * addresses that went away. `live` is the result of listenDesignServer; it is changed in place.
 * Returns true when the addresses changed.
 */
export async function rebindTailnet(live, { hosts = null, handler = designHandler(), log = (t) => process.stderr.write(t) } = {}) {
  hosts ??= await tailnetAddressesAsync();
  const port = live.port;
  const want = new Set(['127.0.0.1', ...hosts]);
  let changed = false;
  for (let i = live.servers.length - 1; i >= 0; i -= 1) {
    const host = live.servers[i].address()?.address;
    if (host && !want.has(host)) {
      live.servers[i].close();
      live.servers.splice(i, 1);
      live.addresses.splice(i, 1);
      changed = true;
    }
  }
  const bound = new Set(live.servers.map((x) => x.address()?.address));
  for (const host of hosts) {
    if (bound.has(host)) continue;
    const server = createServer(handler);
    try {
      await new Promise((ok, no) => { server.once('error', no); server.listen(port, host, ok); });
      live.servers.push(server);
      live.addresses.push(`http://${host}:${port}/`);
      changed = true;
    } catch (e) { log(`design server: not listening on ${host}: ${e.message}\n`); }
  }
  return changed;
}

/* ───────────────────────── control ───────────────────────── */

export const SERVER_SCRIPT = fileURLToPath(new URL('../scripts/design-server.mjs', import.meta.url));

/** Write the info file of the running server whole. */
export function writeServerInfo(info) {
  writeFileAtomic(serverInfoPath(), `${JSON.stringify(info, null, 2)}\n`);
}

/** The answer of the health route on a port: its JSON, or null when nothing answers as a server. */
async function healthOf(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    return j && j.ok === true ? j : null;
  } catch { return null; }
}

/**
 * The running server: `{ running, pid, port, addresses }`, from its info file and a health call.
 * The health answer names the pid of the server. When it names another pid than the info file,
 * the server of the answer is the running one, and the file is old. A server of an older version
 * names no pid: then the pid of the file must be alive.
 */
export async function serverStatus({ health = healthOf, alive = pidAlive } = {}) {
  let info = null;
  try { info = JSON.parse(readFileSync(serverInfoPath(), 'utf8')); } catch { info = null; }
  if (!info || typeof info !== 'object' || !info.pid) return { running: false, port: serverPort(), addresses: [], stale: Boolean(info) };
  const answer = Number.isInteger(info.port) ? await health(info.port) : null;
  const pid = Number.isInteger(answer?.pid) ? answer.pid : null;
  if (pid !== null) return { running: true, pid, port: info.port, addresses: info.addresses ?? [], startedAt: pid === info.pid ? info.startedAt ?? null : null, ...(pid === info.pid ? {} : { stale: true }) };
  if (!alive(info.pid)) return { running: false, port: serverPort(), addresses: [], stale: true };
  // A live pid: the server of an older version when the health route answers, else a server that
  // hangs or another program that got the pid.
  return { running: Boolean(answer), pid: info.pid, port: info.port, addresses: info.addresses ?? [], startedAt: info.startedAt ?? null };
}

/** Start the server in the background, unless it runs. */
export async function startServer({ port = serverPort(), status = serverStatus, tries = 3 } = {}) {
  let now = await status();
  if (now.running) return { ...now, started: false };
  // A live pid that does not answer: ask again before anything else, and never start a second server.
  for (let i = 1; i < tries && now.pid && !now.running; i += 1) {
    await new Promise((ok) => setTimeout(ok, 500));
    now = await status();
    if (now.running) return { ...now, started: false };
  }
  if (now.pid) {
    return { running: false, started: false, pid: now.pid, port: now.port, addresses: [], reason: `a process (${now.pid}) holds the server pid but does not answer: stop it, or wait and try again`,
      fix: personFix(`Check the process ${now.pid}. When it is the design server and it hangs, end it. Then run "wf.mjs design server stop" and "wf.mjs design server start".`) };
  }
  rmSync(serverInfoPath(), { force: true });
  const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', String(port)], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 40; i += 1) {
    await new Promise((ok) => setTimeout(ok, 100));
    const s = await serverStatus();
    if (s.running) return { ...s, started: true };
  }
  return { running: false, started: false, port, addresses: [], reason: `the server did not start: run node ${SERVER_SCRIPT} to see why`,
    fix: agentFix('Run the server in the foreground to read its error. When the port is in use, set design.port in the machine config or end the program on the port.', `node "${SERVER_SCRIPT}" --port ${port}`) };
}

/**
 * Stop the running server. Only a server that answered its health call is killed: a pid of a stale
 * info file can belong to another process now.
 */
export async function stopServer({ status = serverStatus, kill = (pid) => process.kill(pid) } = {}) {
  const now = await status();
  if (now.running && now.pid) { try { kill(now.pid); } catch { /* it stopped */ } }
  rmSync(serverInfoPath(), { force: true });
  return { stopped: Boolean(now.running && now.pid), ...(now.pid && !now.running ? { reason: `the pid ${now.pid} did not answer as the server: it was left running, and its info file was removed` } : {}) };
}

/** The scheduled task: `{ supported, installed, command, targetExists }`. Windows only. */
export function taskStatus({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { supported: false, installed: false };
  const r = run('schtasks', ['/Query', '/TN', TASK_NAME, '/FO', 'LIST', '/V'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return { supported: true, installed: false };
  // The label of the line is in the language of Windows: the line is found by the script that it names.
  const command = /^[^\r\n:]*:\s*(.*design-server\.mjs.*)$/m.exec(r.stdout ?? '')?.[1]?.trim() ?? /^Task To Run:\s*(.+)$/m.exec(r.stdout ?? '')?.[1]?.trim() ?? null;
  const script = /"([^"]+design-server\.mjs)"/.exec(command ?? '')?.[1] ?? null;
  return { supported: true, installed: true, command, targetExists: script ? existsSync(script) : null };
}

/** The arguments of the scheduled task that starts the server at logon. */
export function taskCreateArgs({ node = process.execPath, script = SERVER_SCRIPT } = {}) {
  return ['/Create', '/F', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TR', `"${node}" "${script}"`];
}

/** Make the scheduled task. It does not heal itself: after a plugin update, run install again. */
export function installTask({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { installed: false, reason: 'the scheduled task is for Windows; start the server with your own service manager', fix: personFix('Start the design server at logon with the service manager of this system.') };
  const r = run('schtasks', taskCreateArgs(), { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { installed: true, task: TASK_NAME } : { installed: false, reason: String(r.stderr || r.stdout).trim(), fix: personFix('Make the scheduled task from a terminal that may create tasks (Windows can ask for an administrator), or start the server by hand with "wf.mjs design server start".') };
}

/** Remove the scheduled task. */
export function uninstallTask({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { removed: false, reason: 'no scheduled task on this platform', fix: personFix('Remove the design server from the service manager of this system.') };
  const r = run('schtasks', ['/Delete', '/F', '/TN', TASK_NAME], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { removed: true } : { removed: false, reason: String(r.stderr || r.stdout).trim(), fix: personFix('Remove the task "sdlc-design-server" in the Task Scheduler of Windows.') };
}
