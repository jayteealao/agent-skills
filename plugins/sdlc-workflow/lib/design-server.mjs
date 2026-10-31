// The design server: one local server for this computer. It serves the canvas of every repo in
// `~/.sdlc/design-repos.json` and the brainstorm pages of those repos. The phone reaches it over
// the tailnet.
//
// The server is static: it reads the files of each request, and it keeps no version state, no
// render queue and no reap. It writes in two cases only: a comment on a screen that exists, and
// the saved positions of the canvas layout. It starts one process: the read-only design audit
// agent of the Audit button (design-audit.mjs), one run per repo at a time. Each write names a
// listed repo, and every other path is refused. It listens on 127.0.0.1 and on the tailnet
// address only; the tailnet is its only protection.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readMachineConfig, sdlcHomeDir } from './home.mjs';
import { pidAlive } from './proc.mjs';
import { CANVAS_DIR, canvasState } from './design-state.mjs';
import { addComment, approvalPicture, capturePicture } from './design-records.mjs';
import { readAudit, startAudit } from './design-audit.mjs';
import { KEY_RE, LAYOUT_FILE, SURFACE_REL, readDesignRepos, readManifest, surfaceDir } from './design-surface.mjs';
import { checkReferences } from './design-references.mjs';
import { PAGE_REL } from './brainstorm-page.mjs';
import { workflowsRoot } from './records-root.mjs';

export const DEFAULT_PORT = 4711;
export const TASK_NAME = 'sdlc-design-server';
export const serverInfoPath = () => join(sdlcHomeDir(), 'design-server.json');
const MAX_BODY = 64 * 1024;
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

/** The port of the server: machine config `design.port`, else 4711. */
export function serverPort(config = readMachineConfig()) {
  const p = Number(config?.design?.port);
  return Number.isInteger(p) && p > 0 && p < 65536 ? p : DEFAULT_PORT;
}

/** The IPv4 addresses of this computer on a tailnet (100.64.0.0/10). */
export function tailnetAddresses(ifaces = networkInterfaces()) {
  const out = [];
  for (const list of Object.values(ifaces)) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      const [x, y] = a.address.split('.').map(Number);
      if (x === 100 && y >= 64 && y <= 127) out.push(a.address);
    }
  }
  return [...new Set(out)];
}

/** `rel` inside `base`, or null when it leaves `base`. */
function inside(base, rel) {
  if (!rel || rel.includes('\0')) return null;
  const abs = resolve(base, rel);
  const r = relative(resolve(base), abs);
  return !r || r.startsWith('..') || isAbsolute(r) ? null : abs;
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

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-length': buf.length, ...headers });
  res.end(buf);
}
const json = (res, status, value) => send(res, status, value, { 'content-type': TYPES['.json'] });
const fail = (res, status, reason) => json(res, status, { ok: false, reason });
function file(res, abs, headers = {}) {
  if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return fail(res, 404, 'not found');
  return send(res, 200, readFileSync(abs), { 'content-type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream', ...headers });
}

function readBody(req) {
  return new Promise((ok, no) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { no(new Error('the body is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { no(new Error('the body is not JSON')); } });
    req.on('error', no);
  });
}

/** A write must be JSON from a page of this server: a foreign page cannot send it without a preflight. */
function writeAllowed(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return 'a write must be application/json';
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return 'a write must come from a page of this server'; } catch { return 'the origin is not a URL'; }
  }
  return null;
}

/** Validate and save the canvas positions: only keys of existing screens, only finite numbers. */
export function saveLayout(root, positions) {
  if (!positions || typeof positions !== 'object' || Array.isArray(positions)) throw new Error('positions must be an object');
  const screens = readManifest(root).screens;
  const clean = {};
  for (const [key, p] of Object.entries(positions)) {
    if (!KEY_RE.test(key) || !screens[key]) throw new Error(`there is no screen ${key}`);
    const x = Number(p?.x); const y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) throw new Error(`the position of ${key} is not two numbers`);
    clean[key] = { x: Math.round(x), y: Math.round(y) };
  }
  const path = join(surfaceDir(root), LAYOUT_FILE);
  let layout = {};
  try { layout = JSON.parse(readFileSync(path, 'utf8')); } catch { layout = {}; }
  layout.positions = { ...(layout.positions ?? {}), ...clean };
  writeFileSync(path, `${JSON.stringify(layout, null, 2)}\n`);
  return { saved: Object.keys(clean).length };
}

/** A file of the surface as of one commit, from git. */
function atCommit(root, sha, rel) {
  const r = spawnSync('git', ['-C', root, 'show', `${sha}:${SURFACE_REL}/${rel}`], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

/**
 * The request handler. `repos` is read for each request, so a new repo needs no restart.
 * `audit` starts and reads the design audit; a test passes its own.
 */
export function designHandler({ repos = readDesignRepos, audit = { start: startAudit, read: readAudit } } = {}) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let parts;
      try { parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p)); } catch { return fail(res, 400, 'a bad path'); }
      if (parts.some((p) => p === '..' || p === '.' || p.includes('/') || p.includes('\\') || p.includes('\0'))) return fail(res, 400, 'a bad path');
      const method = req.method ?? 'GET';
      if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return fail(res, 405, 'method not allowed');
      if (parts.length === 0) return send(res, 200, indexPage(repos()), { 'content-type': TYPES['.html'] });
      if (parts[0] === 'health') return json(res, 200, { ok: true, repos: repos().length });
      if (parts[0] === 'canvas' && parts.length === 2 && CANVAS_FILES.has(parts[1])) return file(res, join(CANVAS_DIR, parts[1]));
      if (parts[0] !== 'r' && parts[0] !== 'b') return fail(res, 404, 'not found');
      const repo = repos().find((r) => r.name === parts[1]);
      if (!repo || !existsSync(repo.root)) return fail(res, 404, 'no such repo on the list');
      const root = repo.root;
      if (parts[0] === 'b') {
        const slug = parts[2];
        if (!slug || !KEY_RE.test(slug)) return fail(res, 404, 'not found');
        const pageDir = join(workflowsRoot(root), slug, 'page');
        if (parts.length === 3 && !url.pathname.endsWith('/')) return send(res, 301, '', { location: `${url.pathname}/` });
        return file(res, parts.length === 3 ? join(pageDir, 'index.html') : inside(pageDir, parts.slice(3).join('/')), SANDBOX);
      }
      const [, , kind, ...rest] = parts;
      if (method === 'POST') {
        const refused = writeAllowed(req);
        if (refused) return fail(res, 403, refused);
        let body;
        try { body = await readBody(req); } catch (e) { return fail(res, 400, e.message); }
        try {
          if (kind === 'comments' && rest.length === 1) {
            const r = addComment(root, rest[0], { thread: body.thread ?? null, text: String(body.text ?? ''), author: String(body.author ?? 'someone').slice(0, 60), anchor: body.anchor ?? null, resolve: body.resolve === true, reopen: body.reopen === true });
            return r.ok === false ? fail(res, 400, r.reason) : json(res, 200, { ...r, ok: true });
          }
          if (kind === 'layout' && rest.length === 0) return json(res, 200, { ok: true, ...saveLayout(root, body.positions) });
          if (kind === 'audit' && rest.length === 0) {
            const workflow = body.workflow ? String(body.workflow) : null;
            if (workflow !== null && !KEY_RE.test(workflow)) return fail(res, 400, 'a bad workflow');
            const r = audit.start(root, { workflow, repo: repo.name });
            return r.started ? json(res, 202, { ok: true, ...r.report }) : fail(res, 409, r.reason);
          }
        } catch (e) { return fail(res, 400, e.message); }
        return fail(res, 404, 'no such write route');
      }
      if (!kind) {
        if (!url.pathname.endsWith('/')) return send(res, 301, '', { location: `${url.pathname}/${url.search}` });
        return file(res, join(CANVAS_DIR, 'index.html'));
      }
      if (kind === 'state.json' && rest.length === 0) return json(res, 200, canvasState(root, { repo: repo.name, writable: true }));
      if (kind === 'audit.json' && rest.length === 0) return json(res, 200, audit.read(root));
      if (kind === 's') return file(res, inside(surfaceDir(root), rest.join('/')));
      if (kind === 'at' && rest.length >= 2) {
        if (!SHA_RE.test(rest[0])) return fail(res, 400, 'a bad commit');
        const rel = rest.slice(1).join('/');
        if (!inside(surfaceDir(root), rel)) return fail(res, 400, 'a bad path');
        const buf = atCommit(root, rest[0], rel);
        return buf ? send(res, 200, buf, { 'content-type': TYPES[extname(rel).toLowerCase()] ?? 'application/octet-stream' }) : fail(res, 404, 'not in that commit');
      }
      if (kind === 'approvals' && rest.length === 2 && SHA_RE.test(rest[0]) && /^[a-z0-9-]+\.png$/.test(rest[1])) return file(res, approvalPicture(root, rest[0], rest[1].slice(0, -4)));
      if (kind === 'captures' && rest.length === 3 && rest.slice(0, 2).every((p) => /^[a-z0-9._-]+$/i.test(p)) && /^[a-z0-9-]+\.png$/.test(rest[2])) {
        return file(res, capturePicture(root, rest[0], rest[1], rest[2].slice(0, -4)));
      }
      if (kind === 'ref' && rest.length === 1) {
        const ref = checkReferences(root).references.find((r) => r.key === rest[0]);
        if (!ref?.readable) return fail(res, 404, ref ? ref.problem : 'no such reference');
        return file(res, resolve(root, ref.file), SANDBOX);
      }
      return fail(res, 404, 'not found');
    } catch (e) {
      return fail(res, 500, e.message);
    }
  };
}

/** Listen on 127.0.0.1 and on each tailnet address. Returns `{ servers, addresses, port }`. */
export async function listenDesignServer({ port = serverPort(), hosts = ['127.0.0.1', ...tailnetAddresses()], handler = designHandler() } = {}) {
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
    }
  }
  return { servers, addresses, port: servers[0].address().port };
}

/* ───────────────────────── control ───────────────────────── */

export const SERVER_SCRIPT = fileURLToPath(new URL('../scripts/design-server.mjs', import.meta.url));

/** The running server: `{ running, pid, port, addresses }`, from its info file and a health call. */
export async function serverStatus() {
  let info = null;
  try { info = JSON.parse(readFileSync(serverInfoPath(), 'utf8')); } catch { info = null; }
  if (!info?.pid || !pidAlive(info.pid)) return { running: false, port: serverPort(), addresses: [], stale: Boolean(info) };
  let healthy = false;
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/health`, { signal: AbortSignal.timeout(1500) });
    healthy = r.ok;
  } catch { healthy = false; }
  return { running: healthy, pid: info.pid, port: info.port, addresses: info.addresses ?? [], startedAt: info.startedAt ?? null };
}

/** Start the server in the background, unless it runs. */
export async function startServer({ port = serverPort() } = {}) {
  const now = await serverStatus();
  if (now.running) return { ...now, started: false };
  rmSync(serverInfoPath(), { force: true });
  const child = spawn(process.execPath, [SERVER_SCRIPT, '--port', String(port)], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  for (let i = 0; i < 40; i += 1) {
    await new Promise((ok) => setTimeout(ok, 100));
    const s = await serverStatus();
    if (s.running) return { ...s, started: true };
  }
  return { running: false, started: false, port, addresses: [], reason: `the server did not start: run node ${SERVER_SCRIPT} to see why` };
}

/** Stop the running server. */
export async function stopServer() {
  const now = await serverStatus();
  if (now.pid) { try { process.kill(now.pid); } catch { /* it stopped */ } }
  rmSync(serverInfoPath(), { force: true });
  return { stopped: Boolean(now.pid) };
}

/** The scheduled task: `{ supported, installed, command, targetExists }`. Windows only. */
export function taskStatus({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { supported: false, installed: false };
  const r = run('schtasks', ['/Query', '/TN', TASK_NAME, '/FO', 'LIST', '/V'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return { supported: true, installed: false };
  const command = /^Task To Run:\s*(.+)$/m.exec(r.stdout ?? '')?.[1]?.trim() ?? null;
  const script = /"([^"]+design-server\.mjs)"/.exec(command ?? '')?.[1] ?? null;
  return { supported: true, installed: true, command, targetExists: script ? existsSync(script) : null };
}

/** The arguments of the scheduled task that starts the server at logon. */
export function taskCreateArgs({ node = process.execPath, script = SERVER_SCRIPT } = {}) {
  return ['/Create', '/F', '/TN', TASK_NAME, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TR', `"${node}" "${script}"`];
}

/** Make the scheduled task. It does not heal itself: after a plugin update, run install again. */
export function installTask({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { installed: false, reason: 'the scheduled task is for Windows; start the server with your own service manager' };
  const r = run('schtasks', taskCreateArgs(), { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { installed: true, task: TASK_NAME } : { installed: false, reason: String(r.stderr || r.stdout).trim() };
}

/** Remove the scheduled task. */
export function uninstallTask({ run = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return { removed: false, reason: 'no scheduled task on this platform' };
  const r = run('schtasks', ['/Delete', '/F', '/TN', TASK_NAME], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? { removed: true } : { removed: false, reason: String(r.stderr || r.stdout).trim() };
}
