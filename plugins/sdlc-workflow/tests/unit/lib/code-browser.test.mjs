// tests/unit/lib/code-browser.test.mjs
//
// Code browser coverage (CODEBASE-BROWSER-PLAN §7): the containment kernel,
// the deny matcher (the primary content gate — there is no git allowlist),
// the working-tree walk with ignored-badging, blob caps/kinds, and HTTP
// integration through BOTH daemons (hub `/r/<id>/__code/*`, standalone
// `/__code/*` incl. its new Host gate). Mirrors the multi-repo-hub pattern:
// hermetic SDLC_HOME temp homes + real-git fixtures + ephemeral ports.
//
// Symlink fixtures need Developer Mode/admin on Windows — those tests probe
// symlinkSync once and skip cleanly when the OS refuses (EPERM).

import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, doesNotMatch, notEqual, ok, throws } from 'node:assert/strict';

import {
  CODE_BROWSER_DEFAULTS,
  ContainmentError,
  codeBrowserConfigFromEnv,
  compileDeny,
  denyGlobsDefault,
  gitIgnoredSet,
  languageFor,
  normalizeCodeBrowserConfig,
  readBlob,
  repoHeadBranch,
  resolveRepoPath,
  walkDir,
} from '../../../lib/code-browser.mjs';
import { hostAllowed, hostnameOf } from '../../../lib/host-allowlist.mjs';
import { renderCodeBrowserPage } from '../../../renderers/_code-browser-page.mjs';
import { createHubServer } from '../../../scripts/hub-serve.mjs';
import { createSdlcStaticServer } from '../../../scripts/render-sunflower-serve.mjs';
import { readRegistry, upsertRegistryEntry } from '../../../lib/registry.mjs';
import { HUB_CONFIG_DEFAULTS } from '../../../lib/hub-config.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/* ───────────────────────── fixtures ───────────────────────── */

function tmp(prefix) { return mkdtempSync(join(tmpdir(), prefix)); }

function setHome() {
  const home = tmp('sdlc-home-');
  process.env.SDLC_HOME = home;
  return home;
}

function gitQuiet(cwd, args) {
  execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'] });
}

function initRepo(dir, branch = 'master') {
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-b', branch, dir], { stdio: ['ignore', 'ignore', 'ignore'] });
  gitQuiet(dir, ['config', 'user.email', 'test@example.com']);
  gitQuiet(dir, ['config', 'user.name', 'Test']);
  gitQuiet(dir, ['config', 'commit.gpgsign', 'false']);
}

// A source repo with the shapes the browser must handle: tracked source,
// a .gitignore'd node_modules + log, a denied secret, and a binary.
function sourceRepo({ commit = true } = {}) {
  const dir = tmp('sdlc-code-');
  initRepo(dir);
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n*.log\n');
  writeFileSync(join(dir, 'README.md'), '# readme\n');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app.ts'), 'export const x: number = 1;\n');
  writeFileSync(join(dir, 'src', 'page.html'), '<script>alert(1)</script>\n');
  writeFileSync(join(dir, '.env'), 'SECRET=hunter2\n');
  writeFileSync(join(dir, 'debug.log'), 'ignored line\n');
  mkdirSync(join(dir, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  writeFileSync(join(dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
  if (commit) {
    gitQuiet(dir, ['add', '.']);
    gitQuiet(dir, ['commit', '-m', 'init']);
  }
  return dir;
}

// Minimal valid view so the repo can hold a registry entry (validateEntry
// requires a realpath-able `.ai/_view` under repoRoot + `.last-render`).
// INDEX.html carries a topbar actions cell so the serve-time code-link
// injection has its anchor.
function renderView(repoDir) {
  const view = join(repoDir, '.ai', '_view');
  mkdirSync(view, { recursive: true });
  writeFileSync(join(view, '.last-render'), JSON.stringify({
    renderedAt: new Date().toISOString(), configHash: 'cfg0',
  }));
  writeFileSync(join(view, 'INDEX.html'),
    '<!DOCTYPE html><html><head>\n  <link rel="stylesheet" href="_assets/sdlc.css">\n</head>'
    + '<body class="artifact"><div class="b-topbar"><a class="brand" href="_assets/..">.ai/workflows</a>'
    + '<div class="crumb"><b>sdlc</b></div><div class="actions"><span class="kbd">⌘K</span></div></div>ROOT</body></html>');
  mkdirSync(join(view, '_assets'), { recursive: true });
  writeFileSync(join(view, '_assets', 'sdlc.css'), 'body{color:#000}');
  return view;
}

// Symlink capability probe (Windows needs Developer Mode/admin). Returns true
// when this environment can create file symlinks.
const canSymlink = (() => {
  try {
    const d = tmp('sdlc-ln-');
    writeFileSync(join(d, 'target.txt'), 'x');
    symlinkSync(join(d, 'target.txt'), join(d, 'link.txt'), 'file');
    return true;
  } catch {
    return false;
  }
})();

/* ── HTTP helpers (multi-repo-hub pattern) ── */

function listen(server) {
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
}
function closeServer(server) {
  return new Promise((res) => server.close(res));
}
function httpReq(port, path, { method = 'GET', host } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (host) headers.host = host;
    const r = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

const DENY = compileDeny(denyGlobsDefault());

/* ───────────────────────── deny matcher (the primary content gate) ───────────────────────── */

test('code-browser: deny matcher — segment globs hit every depth, case- and separator-insensitively', () => {
  ok(DENY('.env'), '.env at root');
  ok(DENY('a/b/.env'), '.env nested');
  ok(DENY('.ENV'), 'case-insensitive');
  ok(DENY('a\\b\\.env'), 'backslash separators');
  ok(DENY('conf/.env.local'), '.env.* wildcard');
  ok(DENY('certs/server.pem'), '*.pem at depth');
  ok(DENY('keys/id_rsa'), 'id_rsa*');
  ok(DENY('keys/id_rsa.pub'), 'id_rsa* with suffix');
  ok(DENY('store.p12') && DENY('app.keystore') && DENY('tls.key'), 'remaining secret globs');
  ok(!DENY('src/app.ts'), 'plain source passes');
  ok(!DENY('environment.md'), 'no substring over-match');
  ok(!DENY('a/env'), 'env ≠ .env');
});

test('code-browser: deny matcher — `.git/**` denies the dir itself and everything under it, not lookalikes', () => {
  ok(DENY('.git'), 'bare .git');
  ok(DENY('.git/HEAD'), 'direct child');
  ok(DENY('.git/objects/ab/cdef'), 'deep child');
  ok(DENY('.GIT/config'), 'case-insensitive');
  ok(!DENY('.github/workflows/ci.yml'), '.github is NOT .git');
  ok(!DENY('src/.gitignore'), '.gitignore files pass');
});

test('code-browser: deny matcher — serveSecrets drops the secret set but never .git; user globs append', () => {
  const open = compileDeny(denyGlobsDefault({ serveSecrets: true }));
  ok(!open('.env'), 'serveSecrets:true serves .env');
  ok(open('.git/HEAD'), '.git stays denied regardless');
  const user = compileDeny([...denyGlobsDefault(), 'private/**', '*.sqlite']);
  ok(user('private/notes.md'), 'user path prefix');
  ok(user('data/app.sqlite'), 'user segment glob');
});

/* ───────────────────────── containment kernel ───────────────────────── */

test('code-browser: kernel rejects hostile paths at the string level', () => {
  const root = sourceRepo({ commit: false });
  const cases = [
    '../outside', 'a/../../outside', '..\\outside', 'src/..',
    '/etc/passwd', 'C:/Windows/system32', 'C:\\x', '//server/share', '\\\\server\\share',
    'a/./b', '.',
  ];
  for (const p of cases) {
    throws(() => resolveRepoPath(root, p, { deny: DENY }), ContainmentError, `rejects ${JSON.stringify(p)}`);
  }
  throws(() => resolveRepoPath(root, 'src/\0app.ts', { deny: DENY }), ContainmentError, 'rejects NUL');
  throws(() => resolveRepoPath(root, 42, { deny: DENY }), ContainmentError, 'rejects non-string');
});

test('code-browser: kernel resolves clean paths, 404s missing ones, 403s denied ones', () => {
  const root = sourceRepo({ commit: false });
  const { rel } = resolveRepoPath(root, 'src/app.ts', { deny: DENY });
  equal(rel, 'src/app.ts');
  equal(resolveRepoPath(root, 'src\\app.ts', { deny: DENY }).rel, 'src/app.ts', 'backslash input normalised');
  equal(resolveRepoPath(root, '', { deny: DENY }).rel, '', 'root itself resolves');

  try {
    resolveRepoPath(root, 'no/such/file.txt', { deny: DENY });
    ok(false, 'should have thrown');
  } catch (err) {
    equal(err.status, 404, 'missing → 404, not 403');
  }
  for (const denied of ['.env', '.git/HEAD']) {
    try {
      resolveRepoPath(root, denied, { deny: DENY });
      ok(false, 'should have thrown');
    } catch (err) {
      equal(err.status, 403, `${denied} → 403`);
    }
  }
});

test('code-browser: kernel refuses symlink escapes — including from inside ignored dirs', { skip: !canSymlink && 'symlinks unavailable (Windows non-admin)' }, () => {
  const root = sourceRepo({ commit: false });
  const outside = tmp('sdlc-outside-');
  writeFileSync(join(outside, 'loot.txt'), 'outside\n');
  // The walk descends into gitignored dirs, so plant the escape there (§6.3).
  symlinkSync(join(outside, 'loot.txt'), join(root, 'node_modules', 'loot.txt'), 'file');
  throws(() => resolveRepoPath(root, 'node_modules/loot.txt', { deny: DENY }), /escapes|forbidden/i);

  // A link whose TARGET is a denied file inside the root must also refuse
  // (deny re-check on the realpath).
  symlinkSync(join(root, '.env'), join(root, 'src', 'env-link'), 'file');
  try {
    resolveRepoPath(root, 'src/env-link', { deny: DENY });
    ok(false, 'should have thrown');
  } catch (err) {
    equal(err.status, 403, 'link → denied target refuses');
  }
});

/* ───────────────────────── working-tree walk + badging ───────────────────────── */

test('code-browser: walk shows gitignored entries BADGED, hides denied ones, dirs first', () => {
  const root = sourceRepo();
  const ignored = gitIgnoredSet(root);
  const { nodes, truncated } = walkDir(root, { lazy: true, deny: DENY, ignored });
  equal(truncated, false);
  const names = nodes.map((n) => n.name);
  ok(names.includes('node_modules'), 'gitignored dir IS shown');
  ok(names.includes('debug.log'), 'gitignored file IS shown');
  ok(names.includes('src') && names.includes('README.md'), 'tracked entries shown');
  ok(!names.includes('.git'), '.git denied');
  ok(!names.includes('.env'), 'secrets denied');

  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
  equal(byName['node_modules'].ignored, true, 'ignored dir badged');
  equal(byName['debug.log'].ignored, true, 'ignored file badged');
  equal(byName['src'].ignored, false, 'tracked dir not badged');
  equal(byName['node_modules'].hasChildren, true, 'lazy dirs carry hasChildren');
  equal(byName['node_modules'].children, undefined, 'lazy dirs carry no children');

  const dirCount = nodes.filter((n) => n.type === 'dir').length;
  deepEqual(nodes.slice(0, dirCount).map((n) => n.type), Array(dirCount).fill('dir'), 'dirs sort first');
});

test('code-browser: ignored badge propagates into ignored dirs by prefix (--directory collapse)', () => {
  const root = sourceRepo();
  const ignored = gitIgnoredSet(root);
  ok(ignored.has('node_modules'), 'the dir itself');
  ok(ignored.has('node_modules/pkg/index.js'), 'descendants by prefix');
  ok(!ignored.has('src/app.ts'), 'tracked path not ignored');
  const { nodes } = walkDir(root, { subPath: 'node_modules/pkg', lazy: true, deny: DENY, ignored });
  equal(nodes[0].name, 'index.js');
  equal(nodes[0].ignored, true, 'file inside ignored dir badged via prefix');
});

test('code-browser: eager walk nests children; maxEntries truncates with the flag set', () => {
  const root = sourceRepo();
  const { nodes } = walkDir(root, { lazy: false, deny: DENY, maxEntries: 1000 });
  const src = nodes.find((n) => n.name === 'src');
  ok(Array.isArray(src.children), 'eager mode nests children');
  ok(src.children.some((c) => c.name === 'app.ts' && c.lang === 'typescript'), 'child files carry lang');

  const { nodes: capped, truncated } = walkDir(root, { lazy: false, deny: DENY, maxEntries: 2 });
  equal(truncated, true, 'cap hit → truncated');
  ok(capped.length <= 2, 'node count bounded');
});

test('code-browser: walk of a non-git directory works with nothing badged', () => {
  const dir = tmp('sdlc-nogit-');
  writeFileSync(join(dir, 'a.txt'), 'x');
  const ignored = gitIgnoredSet(dir);
  equal(ignored.size, 0, 'non-git → empty matcher');
  const { nodes } = walkDir(dir, { lazy: true, deny: DENY, ignored });
  equal(nodes[0].name, 'a.txt');
  equal(nodes[0].ignored, false);
});

test('code-browser: eager walk survives a symlink cycle', { skip: !canSymlink && 'symlinks unavailable (Windows non-admin)' }, () => {
  const dir = tmp('sdlc-cycle-');
  mkdirSync(join(dir, 'a'));
  writeFileSync(join(dir, 'a', 'f.txt'), 'x');
  symlinkSync(dir, join(dir, 'a', 'up'), 'junction');   // junction works without admin on Windows
  const { nodes } = walkDir(dir, { lazy: false, deny: DENY, maxEntries: 50 });
  ok(nodes.length >= 1, 'walk terminated');   // no infinite recursion = the assertion
});

/* ───────────────────────── blob + language ───────────────────────── */

test('code-browser: languageFor maps extensions honestly, plaintext otherwise', () => {
  equal(languageFor('app.ts'), 'typescript');
  equal(languageFor('App.TSX'), 'tsx');
  equal(languageFor('x.mjs'), 'javascript');
  equal(languageFor('data.json'), 'json');
  equal(languageFor('README.md'), 'markdown');
  equal(languageFor('run.sh'), 'bash');
  equal(languageFor('conf.yml'), 'yaml');
  equal(languageFor('main.py'), 'python');
  equal(languageFor('Cargo.toml'), 'toml');
  equal(languageFor('LICENSE'), 'plaintext');
  equal(languageFor('.env'), 'plaintext', 'leading-dot name is not an extension');
});

test('code-browser: readBlob — text content, truncation cap, binary/image never inline bytes', () => {
  const root = sourceRepo({ commit: false });
  const text = readBlob(root, 'src/app.ts', { deny: DENY });
  equal(text.kind, 'text');
  equal(text.language, 'typescript');
  equal(text.truncated, false);
  match(text.content, /export const x/);

  const capped = readBlob(root, 'README.md', { deny: DENY, maxBlobBytes: 4 });
  equal(capped.truncated, true);
  equal(capped.content.length, 4, 'content capped at maxBlobBytes');
  ok(capped.size > 4, 'true size still reported');

  const bin = readBlob(root, 'blob.bin', { deny: DENY });
  equal(bin.kind, 'binary');
  equal(bin.content, undefined, 'binary bytes never JSON-dumped');

  const img = readBlob(root, 'logo.png', { deny: DENY });
  equal(img.kind, 'image');
  equal(img.content, undefined);

  throws(() => readBlob(root, 'src', { deny: DENY }), /not a file/, 'dirs are not blobs');
});

/* ───────────────────────── config plumbing ───────────────────────── */

test('code-browser: config normalisation — defaults, clamps, env transport, hub-config exposure', () => {
  const d = normalizeCodeBrowserConfig(null);
  deepEqual(d, { ...CODE_BROWSER_DEFAULTS }, 'null → defaults');
  equal(normalizeCodeBrowserConfig({ enabled: false }).enabled, false);
  equal(normalizeCodeBrowserConfig({ maxBlobBytes: -5 }).maxBlobBytes, 1024, 'clamped to floor');
  deepEqual(normalizeCodeBrowserConfig({ denyGlobs: 'nope' }).denyGlobs, [], 'non-array denyGlobs dropped');

  equal(codeBrowserConfigFromEnv({}), null, 'no env → null');
  equal(codeBrowserConfigFromEnv({ SDLC_CODE_BROWSER: '{nope' }), null, 'bad JSON → null');
  deepEqual(codeBrowserConfigFromEnv({ SDLC_CODE_BROWSER: '{"enabled":false}' }), { enabled: false });

  deepEqual(HUB_CONFIG_DEFAULTS.codeBrowser, { ...CODE_BROWSER_DEFAULTS },
    'hub-config carries the codeBrowser block');
});

test('code-browser: host allowlist — localhost passes, foreign Hosts refuse, extras are targeted', () => {
  const req = (host) => ({ headers: { host } });
  ok(hostAllowed(req('127.0.0.1:4173'), false, null));
  ok(hostAllowed(req('localhost:4173'), false, null));
  ok(hostAllowed(req('[::1]:4173'), false, null));
  ok(!hostAllowed(req('evil.example:4173'), false, null), 'DNS-rebinding Host refused');
  ok(hostAllowed(req('evil.example:4173'), true, null), 'allow-all mode admits');
  ok(hostAllowed(req('me.tail.ts.net:4173'), false, new Set(['me.tail.ts.net'])), 'targeted extra admits');
  equal(hostnameOf('[::1]:9'), '[::1]');
});

/* ───────────────────────── shell page renderer ───────────────────────── */

test('code-browser: shell page carries id meta, data-base, and version-busted bundle refs', () => {
  const html = renderCodeBrowserPage({
    repoId: 'ab12cd34ef56', repoLabel: 'my-repo', headBranch: 'main',
    base: '/r/ab12cd34ef56/__code', pluginVersion: '9.51.0',
  });
  match(html, /<meta name="sdlc-repo-id" content="ab12cd34ef56">/);
  match(html, /data-base="\/r\/ab12cd34ef56\/__code"/);
  match(html, /\/__sdlc\/code-browser\.css\?v=9\.51\.0/);
  match(html, /\/__sdlc\/code-browser\.js\?v=9\.51\.0/);
  match(html, /href="\/r\/ab12cd34ef56\/"/, 'brand links up to the repo view');
  match(html, /⎇ main/);

  const standalone = renderCodeBrowserPage({ base: '/__code' });
  doesNotMatch(standalone, /sdlc-repo-id/, 'no id meta without an entry');
  match(standalone, /data-base="\/__code"/);
});

/* ───────────────────────── integration: the hub ───────────────────────── */

async function hubFixture({ codeBrowser } = {}) {
  setHome();
  const repo = sourceRepo();
  renderView(repo);
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const { entries } = readRegistry();
  equal(entries.length, 1, 'fixture registered');
  const server = createHubServer({ liveReload: false, codeBrowser });
  const port = await listen(server);
  return { repo, id: entries[0].id, server, port };
}

test('hub code browser: tree/blob/raw round-trip with badges, denies, and hardened raw types', async () => {
  const { id, server, port } = await hubFixture();
  try {
    const redirect = await httpReq(port, `/r/${id}/__code`);
    equal(redirect.status, 301, 'bare __code redirects');
    equal(redirect.headers.location, `/r/${id}/__code/`);

    const shell = await httpReq(port, `/r/${id}/__code/`);
    equal(shell.status, 200);
    match(shell.body, new RegExp(`data-base="/r/${id}/__code"`));
    match(shell.body, /sdlc-repo-id/);

    const tree = await httpReq(port, `/r/${id}/__code/tree`);
    equal(tree.status, 200);
    equal(tree.headers['x-content-type-options'], 'nosniff');
    const t = JSON.parse(tree.body);
    equal(t.id, id);
    equal(t.headBranch, 'master');
    equal(t.lazy, true);
    const names = t.nodes.map((n) => n.name);
    ok(names.includes('node_modules') && names.includes('src'), 'ignored + tracked listed');
    ok(!names.includes('.git') && !names.includes('.env'), 'denied entries absent');
    equal(t.nodes.find((n) => n.name === 'node_modules').ignored, true, 'badge present');

    const sub = JSON.parse((await httpReq(port, `/r/${id}/__code/tree?path=src`)).body);
    ok(sub.nodes.some((n) => n.name === 'app.ts' && n.lang === 'typescript'));

    const blob = await httpReq(port, `/r/${id}/__code/blob?path=src%2Fapp.ts`);
    equal(blob.status, 200);
    const b = JSON.parse(blob.body);
    equal(b.kind, 'text');
    match(b.content, /export const x/);
    equal(b.rawUrl, `/r/${id}/__code/raw?path=src%2Fapp.ts`);

    const raw = await httpReq(port, `/r/${id}/__code/raw?path=src%2Fapp.ts`);
    equal(raw.status, 200);
    match(raw.headers['content-type'], /^text\/plain/);
    equal(raw.headers['x-content-type-options'], 'nosniff');

    // §0.2-5: repo HTML must NOT come back as text/html (same-origin XSS).
    const rawHtml = await httpReq(port, `/r/${id}/__code/raw?path=src%2Fpage.html`);
    match(rawHtml.headers['content-type'], /^text\/plain/, 'html source served as text/plain');

    const rawBin = await httpReq(port, `/r/${id}/__code/raw?path=blob.bin`);
    match(rawBin.headers['content-type'], /octet-stream/);
    match(rawBin.headers['content-disposition'], /^attachment/);

    const rawImg = await httpReq(port, `/r/${id}/__code/raw?path=logo.png`);
    equal(rawImg.headers['content-type'], 'image/png');

    // Containment + deny over HTTP.
    equal((await httpReq(port, `/r/${id}/__code/blob?path=..%2F..%2Fsecrets`)).status, 403);
    equal((await httpReq(port, `/r/${id}/__code/blob?path=.env`)).status, 403);
    equal((await httpReq(port, `/r/${id}/__code/raw?path=.git%2FHEAD`)).status, 403);
    equal((await httpReq(port, `/r/${id}/__code/blob?path=no%2Fsuch.txt`)).status, 404);
    equal((await httpReq(port, `/r/${id}/__code/blob`)).status, 400, 'missing path → 400');
    equal((await httpReq(port, `/r/${id}/__code/nope`)).status, 404);
    equal((await httpReq(port, '/r/unknown-id/__code/tree')).status, 404, 'unknown repo');

    // The global Host gate wraps the new routes too.
    equal((await httpReq(port, `/r/${id}/__code/tree`, { host: 'evil.example:1' })).status, 403);
  } finally {
    await closeServer(server);
  }
});

test('hub code browser: serve-time code link is injected into served pages and the landing card', async () => {
  const { id, server, port } = await hubFixture();
  try {
    const page = await httpReq(port, `/r/${id}/INDEX.html`);
    equal(page.status, 200);
    match(page.body, new RegExp(`class="code-link" href="/r/${id}/__code/"`), 'topbar link injected at serve time');

    const landing = await httpReq(port, '/');
    match(landing.body, new RegExp(`class="open-code" href="/r/${id}/__code/"`), 'landing card affordance');
  } finally {
    await closeServer(server);
  }
});

test('hub code browser: enabled:false 404s every route and removes both links', async () => {
  const { id, server, port } = await hubFixture({ codeBrowser: { enabled: false } });
  try {
    equal((await httpReq(port, `/r/${id}/__code/`)).status, 404);
    equal((await httpReq(port, `/r/${id}/__code/tree`)).status, 404);
    equal((await httpReq(port, '/__sdlc/code-browser.js')).status, 404);
    doesNotMatch((await httpReq(port, `/r/${id}/INDEX.html`)).body, /class="code-link"/);
    // anchor markup, not /open-code/ bare — the landing CSS always carries the
    // .open-code rule; only the <a> is conditional.
    doesNotMatch((await httpReq(port, '/')).body, /class="open-code"/);

    // The view keeps serving — only the code perimeter is closed.
    equal((await httpReq(port, `/r/${id}/`)).status, 200);
  } finally {
    await closeServer(server);
  }
});

test('hub code browser: bundle asset route serves the committed bundle once built', async () => {
  const { server, port } = await hubFixture();
  try {
    const res = await httpReq(port, '/__sdlc/code-browser.js');
    if (existsSync(join(PLUGIN_ROOT, 'dist', 'code-browser.js'))) {
      equal(res.status, 200);
      match(res.headers['content-type'], /^text\/javascript/);
      match(res.headers['cache-control'], /immutable/);
    } else {
      equal(res.status, 404, 'not built yet → explicit 404');
    }
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── integration: the standalone daemon ───────────────────────── */

test('standalone code browser: served at /__code with the NEW Host gate; view routes unchanged', async () => {
  const repo = sourceRepo();
  const view = renderView(repo);
  const server = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false,
  });
  const port = await listen(server);
  try {
    const tree = await httpReq(port, '/__code/tree');
    equal(tree.status, 200);
    const t = JSON.parse(tree.body);
    equal(t.id, null, 'standalone has no registry id');
    equal(t.headBranch, 'master', 'branch read from git directly');
    ok(t.nodes.some((n) => n.name === 'src'));

    const shell = await httpReq(port, '/__code/');
    equal(shell.status, 200);
    match(shell.body, /data-base="\/__code"/);
    doesNotMatch(shell.body, /sdlc-repo-id/);

    // §0.2-4: source routes are Host-gated…
    equal((await httpReq(port, '/__code/tree', { host: 'evil.example:1' })).status, 403);
    equal((await httpReq(port, '/__sdlc/code-browser.js', { host: 'evil.example:1' })).status, 403);
    // …while the historical view routes keep their pre-existing behaviour.
    equal((await httpReq(port, '/INDEX.html', { host: 'evil.example:1' })).status, 200);

    equal((await httpReq(port, '/__code/blob?path=.env')).status, 403, 'deny gate active');
  } finally {
    await closeServer(server);
  }
});

test('standalone code browser: allowedHosts admits a tailnet Host; allowAllHosts admits any; enabled:false closes', async () => {
  const repo = sourceRepo();
  const view = renderView(repo);

  const gated = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false,
    allowedHosts: ['me.tail.ts.net'],
  });
  const p1 = await listen(gated);
  try {
    equal((await httpReq(p1, '/__code/tree', { host: 'me.tail.ts.net:443' })).status, 200, 'targeted extra admitted');
    equal((await httpReq(p1, '/__code/tree', { host: 'other.example' })).status, 403);
  } finally {
    await closeServer(gated);
  }

  const open = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false, allowAllHosts: true,
  });
  const p2 = await listen(open);
  try {
    equal((await httpReq(p2, '/__code/tree', { host: 'whatever.example' })).status, 200, 'allow-all admits');
  } finally {
    await closeServer(open);
  }

  const off = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false, codeBrowser: { enabled: false },
  });
  const p3 = await listen(off);
  try {
    equal((await httpReq(p3, '/__code/tree')).status, 404, 'kill switch closes the perimeter');
    equal((await httpReq(p3, '/INDEX.html')).status, 200, 'view unaffected');
  } finally {
    await closeServer(off);
  }
});

test('standalone code browser: serveSecrets:true serves .env (the literal show-everything mode)', async () => {
  const repo = sourceRepo();
  const view = renderView(repo);
  const server = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false,
    codeBrowser: { serveSecrets: true },
  });
  const port = await listen(server);
  try {
    const blob = await httpReq(port, '/__code/blob?path=.env');
    equal(blob.status, 200);
    match(JSON.parse(blob.body).content, /SECRET=hunter2/);
    equal((await httpReq(port, '/__code/blob?path=.git%2FHEAD')).status, 403, '.git stays denied');
  } finally {
    await closeServer(server);
  }
});

test('standalone code browser: serveSecrets is IGNORED once the daemon is reachable beyond loopback', async () => {
  const repo = sourceRepo();
  const view = renderView(repo);
  // serveSecrets:true PLUS a tailnet Host allowlisted → public exposure, so
  // the secret denylist must stay active (plan §5: secrets only for a
  // strictly-local binding; the adapter enforces the sentence).
  const server = createSdlcStaticServer({
    viewRoot: view, projectRoot: repo, liveReload: false,
    codeBrowser: { serveSecrets: true },
    allowedHosts: ['me.tail.ts.net'],
  });
  const port = await listen(server);
  try {
    equal((await httpReq(port, '/__code/blob?path=.env')).status, 403,
      'secrets stay denied under public exposure');
    equal((await httpReq(port, '/__code/blob?path=.env', { host: 'me.tail.ts.net:443' })).status, 403,
      'denied for the tailnet caller too');
    const tree = await httpReq(port, '/__code/tree');
    equal(tree.status, 200, 'non-secret routes unaffected');
  } finally {
    await closeServer(server);
  }
});

test('code-browser: repoHeadBranch reads HEAD and tolerates non-git dirs', () => {
  const repo = sourceRepo();
  equal(repoHeadBranch(repo, { now: Date.now() }), 'master');
  equal(repoHeadBranch(tmp('sdlc-nogit-'), { now: Date.now() }), null);
});
