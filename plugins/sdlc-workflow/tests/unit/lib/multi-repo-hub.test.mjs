// tests/unit/lib/multi-repo-hub.test.mjs
//
// Multi-repo registry + hub coverage (MULTI-REPO-REGISTRY-PLAN). Every test
// relocates the machine-wide state dir to a fresh temp dir via SDLC_HOME so the
// real ~/.sdlc/ is never touched.

import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { deepEqual, equal, match, notEqual, ok } from 'node:assert/strict';

import {
  computeEntryId,
  validateEntry,
  readRegistry,
  pruneRegistry,
  upsertRegistryEntry,
  buildEntry,
  writeRegistry,
  shardDir,
  gitIdentity,
  mergeShardsIntoRegistry,
  SHARD_SOFT_CAP,
} from '../../../lib/registry.mjs';
import { createHubServer, parseHubArgs } from '../../../scripts/hub-serve.mjs';
import { renderHubLanding, inboxItems } from '../../../renderers/hub-dashboard.mjs';
import { readHubConfig, hubConfigPath, HUB_CONFIG_DEFAULTS } from '../../../lib/hub-config.mjs';
import { ensureHubLifecycle } from '../../../lib/hub-lifecycle.mjs';
import { ensureServeLifecycle, servePidPath } from '../../../lib/serve-lifecycle.mjs';
import { maybeConfigureTailscale } from '../../../lib/tailscale.mjs';
import { validateConfig } from '../../../lib/config.mjs';

/* ───────────────────────── helpers ───────────────────────── */

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
  writeFileSync(join(dir, 'README.md'), 'x\n');
  gitQuiet(dir, ['add', '.']);
  gitQuiet(dir, ['commit', '-m', 'init']);
}

function renderView(repoDir, { slug = 'demo', stage = 'implement', status = 'active', blocked = false } = {}) {
  const view = join(repoDir, '.ai', '_view');
  mkdirSync(view, { recursive: true });
  writeFileSync(join(view, '.last-render'), JSON.stringify({
    renderedAt: new Date().toISOString(), configHash: 'cfg0',
  }));
  // Emit real view files so HTTP serving (incl. meta-injection + assets) can be
  // exercised: a root INDEX.html, a nested slug page, and a copied asset.
  writeFileSync(join(view, 'INDEX.html'),
    '<!DOCTYPE html><html><head>\n  <link rel="stylesheet" href="_assets/sdlc.css">\n</head>'
    + '<body class="artifact"><div class="b-topbar"><a class="brand" href="_assets/..">.ai/workflows</a></div>ROOT</body></html>');
  mkdirSync(join(view, slug), { recursive: true });
  writeFileSync(join(view, slug, 'INDEX.html'),
    '<!DOCTYPE html><html><head></head><body>SLUG PAGE</body></html>');
  mkdirSync(join(view, '_assets'), { recursive: true });
  writeFileSync(join(view, '_assets', 'sdlc.css'), 'body{color:#000}');
  const wf = join(repoDir, '.ai', 'workflows', slug);
  mkdirSync(wf, { recursive: true });
  const fm = [
    'schema: sdlc/v1', 'type: index', `slug: ${slug}`,
    `status: ${status}`, `current-stage: ${stage}`,
    blocked ? 'blocked: true' : null,
  ].filter(Boolean).join('\n');
  writeFileSync(join(wf, '00-index.md'), `---\n${fm}\n---\nbody\n`);
  return view;
}

/* ── hub HTTP helpers ── */

function listen(server) {
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res(server.address().port)));
}
function closeServer(server) {
  return new Promise((res) => server.close(res));
}
function httpReq(port, path, { method = 'GET', host, token, body } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (host) headers.host = host;
    if (token) headers['x-sdlc-token'] = token;
    if (body != null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(body); }
    const r = httpRequest({ hostname: '127.0.0.1', port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    if (body != null) r.write(body);
    r.end();
  });
}
// Open an SSE connection and collect parsed frames for a window, then close.
function sseCollect(port, ms) {
  return new Promise((resolve) => {
    const events = [];
    const r = httpRequest({ hostname: '127.0.0.1', port, path: '/__sdlc/events', method: 'GET' }, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const ev = frame.match(/event: (\w+)/);
          const data = frame.match(/data: (.+)/);
          if (ev) events.push({ event: ev[1], data: data ? data[1] : null });
        }
      });
    });
    r.on('error', () => {});
    r.end();
    setTimeout(() => { try { r.destroy(); } catch { /* ignore */ } resolve(events); }, ms);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── id computation (§3.3) ───────────────────────── */

test('registry: computeEntryId is forward-slash-stable and branch-sensitive', () => {
  equal(
    computeEntryId('C:/Users/x/repo', 'master'),
    computeEntryId('C:\\Users\\x\\repo', 'master'),
    'native vs forward-slash repoRoot must hash identically',
  );
  notEqual(
    computeEntryId('C:/Users/x/repo', 'master'),
    computeEntryId('C:/Users/x/repo', 'feature'),
    'branch is part of identity',
  );
  equal(computeEntryId('/a/b', 'main').length, 12, '12 hex chars (48 bits)');
});

/* ───────────────────────── identity + 3-entry shape (§3.1) ───────────────────────── */

test('registry: two repos + a worktree register as three distinct entries', async () => {
  setHome();
  const root = tmp('sdlc-repos-');

  const repoA = join(root, 'repoA');
  initRepo(repoA, 'master');
  renderView(repoA, { slug: 'alpha' });

  // Linked worktree of repoA on a different branch.
  const wt = join(root, 'repoA-wt');
  gitQuiet(repoA, ['worktree', 'add', '-b', 'feature', wt]);
  renderView(wt, { slug: 'beta' });

  const repoB = join(root, 'repoB');
  initRepo(repoB, 'master');
  renderView(repoB, { slug: 'gamma' });

  await upsertRegistryEntry({ projectRoot: repoA, viewDir: join(repoA, '.ai', '_view') });
  await upsertRegistryEntry({ projectRoot: wt, viewDir: join(wt, '.ai', '_view') });
  await upsertRegistryEntry({ projectRoot: repoB, viewDir: join(repoB, '.ai', '_view') });

  const { entries } = readRegistry();
  equal(entries.length, 3, 'three distinct entries');
  equal(new Set(entries.map((e) => e.id)).size, 3, 'distinct ids');
  equal(new Set(entries.map((e) => e.viewDir)).size, 3, 'distinct viewDirs');

  const wtEntry = entries.find((e) => e.branch === 'feature');
  ok(wtEntry, 'worktree entry present on its own branch');
  ok(wtEntry.worktreeLabel, 'worktree entry carries a worktreeLabel');
  equal(wtEntry.worktreeLabel, 'repoA-wt');

  const mainEntry = entries.find((e) => e.branch === 'master' && e.repoRoot.endsWith('repoA'));
  ok(mainEntry, 'main repoA entry present');
  equal(mainEntry.worktreeLabel, null, 'main checkout has no worktreeLabel');

  // slugMeta populated from scanWorkflowIndexes (§3.2).
  equal(mainEntry.slugMeta[0].slug, 'alpha');
  equal(mainEntry.slugMeta[0].currentStage, 'implement');
});

/* ───────────────────────── viewDir validation (§3.6) ───────────────────────── */

test('registry: validateEntry rejects a poisoned viewDir, accepts a real one', () => {
  setHome();
  const root = tmp('sdlc-validate-');
  const repo = join(root, 'repo');
  initRepo(repo);
  const view = renderView(repo);

  ok(validateEntry({
    id: 'x', repoRoot: repo, branch: 'master', viewDir: view,
  }).ok, 'a real .ai/_view under a git repo validates');

  // A poisoned entry "contained" to the whole drive — viewDir is not .ai/_view.
  equal(validateEntry({
    id: 'x', repoRoot: repo, branch: 'master', viewDir: root,
  }).ok, false, 'a non-.ai/_view viewDir is rejected');

  // viewDir escaping repoRoot.
  const otherRepo = join(root, 'other');
  initRepo(otherRepo);
  const otherView = renderView(otherRepo);
  equal(validateEntry({
    id: 'x', repoRoot: repo, branch: 'master', viewDir: otherView,
  }).ok, false, 'a viewDir under a different repoRoot is rejected');

  // repoRoot not a git repo.
  const plain = join(root, 'plain');
  mkdirSync(join(plain, '.ai', '_view'), { recursive: true });
  equal(validateEntry({
    id: 'x', repoRoot: plain, branch: 'master', viewDir: join(plain, '.ai', '_view'),
  }).ok, false, 'a non-git repoRoot is rejected');
});

test('registry: a poisoned entry is rejected at write (never lands on disk)', async () => {
  setHome();
  const root = tmp('sdlc-poison-');
  // A directory that is a git repo but whose .ai/_view we will point elsewhere.
  const repo = join(root, 'repo');
  initRepo(repo);
  // No render → no .ai/_view. upsert builds an entry whose viewDir won't resolve
  // to a .ai/_view path, so validateEntry rejects it on write.
  mkdirSync(join(repo, '.ai'), { recursive: true });
  const res = await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai') });
  equal(res.action, 'rejected', 'non-.ai/_view viewDir rejected on write');
  equal(readRegistry().entries.length, 0, 'nothing persisted');
  equal(existsSync(shardDir()) ? readdirSync(shardDir()).filter((n) => n.endsWith('.json')).length : 0, 0, 'no shard written');
});

/* ───────────────────────── concurrency (§3.4 must-fix #4) ───────────────────────── */

test('registry: concurrent renders never lose an entry (shard model)', async () => {
  setHome();
  const root = tmp('sdlc-concurrent-');
  const repos = [];
  for (let i = 0; i < 6; i++) {
    const dir = join(root, `repo${i}`);
    initRepo(dir);
    renderView(dir, { slug: `slug${i}` });
    repos.push(dir);
  }
  // Fire every upsert at once — the naive read-merge-rewrite would lose entries.
  await Promise.all(repos.map((dir) => upsertRegistryEntry({
    projectRoot: dir, viewDir: join(dir, '.ai', '_view'),
  })));
  const { entries } = readRegistry();
  equal(entries.length, 6, 'all six entries survive a concurrent burst');
});

/* ───────────────────────── writer-as-janitor (§3.4) ───────────────────────── */

test('registry: writer-as-janitor merges + clears shards past SHARD_SOFT_CAP', async () => {
  setHome();
  const root = tmp('sdlc-janitor-');
  // Flood the shard dir with > cap dummy shards (invalid → dropped on merge).
  mkdirSync(shardDir(), { recursive: true });
  for (let i = 0; i <= SHARD_SOFT_CAP; i++) {
    writeFileSync(join(shardDir(), `dummy${i}.json`), JSON.stringify({
      id: `dummy${i}`, repoRoot: join(root, 'gone'), branch: 'x', viewDir: join(root, 'gone', '.ai', '_view'),
      updatedAt: '2020-01-01T00:00:00.000Z',
    }));
  }
  // One real render pushes the count over cap → the writer becomes the janitor.
  const repo = join(root, 'real');
  initRepo(repo);
  renderView(repo, { slug: 'real' });
  const res = await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  equal(res.action, 'sharded');

  const remaining = readdirSync(shardDir()).filter((n) => n.endsWith('.json')).length;
  equal(remaining, 0, 'janitor cleared all shards');
  const { entries } = readRegistry();
  equal(entries.length, 1, 'only the valid entry merged into registry.json');
  equal(entries[0].slugs[0], 'real');
});

/* ───────────────────────── pruning (§3.5) ───────────────────────── */

test('registry: pruneRegistry drops entries whose viewDir disappeared', async () => {
  setHome();
  const root = tmp('sdlc-prune-');
  const keep = join(root, 'keep');
  const drop = join(root, 'drop');
  initRepo(keep); renderView(keep, { slug: 'keep' });
  initRepo(drop); renderView(drop, { slug: 'drop' });
  await upsertRegistryEntry({ projectRoot: keep, viewDir: join(keep, '.ai', '_view') });
  await upsertRegistryEntry({ projectRoot: drop, viewDir: join(drop, '.ai', '_view') });
  // Fold shards into registry.json first so prune operates on the file.
  mergeShardsIntoRegistry();
  equal(readRegistry().entries.length, 2);

  rmSync(drop, { recursive: true, force: true });
  const { kept, pruned } = pruneRegistry();
  equal(pruned, 1, 'the vanished checkout is pruned');
  equal(kept, 1, 'the live checkout is kept');
  const { entries } = readRegistry();
  equal(entries.length, 1);
  ok(entries[0].repoRoot.endsWith(`${sep}keep`));
});

/* ───────────────────────── hub-config (§6.1) ───────────────────────── */

test('hub-config: created with defaults on first read; never shares per-repo fields', () => {
  setHome();
  const cfg = readHubConfig();
  equal(cfg.port, 4173, 'default canonical port');
  equal(cfg.maxSseClients, 200);
  equal(cfg.tailscale.acknowledgedPublic, false, 'public exposure off by default');
  ok(existsSync(hubConfigPath()), 'file created on first read');
  // The machine config carries singleton settings only — never `enabled`
  // (that is the per-repo participation toggle).
  equal('enabled' in cfg, false, 'no per-repo enabled field leaks into machine config');
  equal(HUB_CONFIG_DEFAULTS.host, '127.0.0.1');
});

test('hub-config: perRepoServe defaults true (per-repo daemons allowed unless opted out)', () => {
  setHome();
  equal(HUB_CONFIG_DEFAULTS.perRepoServe, true, 'default preserves prior behaviour');
  equal(readHubConfig().perRepoServe, true, 'sparse/first-read config inherits the default');
});

test('serve-lifecycle: perRepoServe:false (machine-wide) disables per-repo daemons', async () => {
  setHome();
  // Machine-wide kill switch on. Serve config is machine-only now — there is no
  // per-repo override to test against; the machine config is the sole authority.
  writeFileSync(hubConfigPath(), JSON.stringify({ ...HUB_CONFIG_DEFAULTS, perRepoServe: false }, null, 2));
  const projectRoot = tmp('sdlc-norepo-');

  const result = await ensureServeLifecycle({
    projectRoot,
    pluginRoot: '/nonexistent',   // never used — the switch returns before any spawn
    log: () => {},
  });

  equal(result.action, 'per-repo-disabled', 'machine kill switch disables per-repo daemons');
  ok(!existsSync(servePidPath(projectRoot)), 'no per-repo daemon pid file was written (nothing spawned)');
});

/* ───────────────────────── hub serving (§4.1, §4.2) ───────────────────────── */

test('hub: serves a registered repo at /r/<id>/ with CSP, assets, and id meta tag', async () => {
  setHome();
  const root = tmp('sdlc-hub-serve-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'demo' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const id = readRegistry().entries[0].id;

  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    const rootPage = await httpReq(port, `/r/${id}/`);
    equal(rootPage.status, 200);
    match(rootPage.body, /ROOT/);
    ok(rootPage.headers['content-security-policy'], 'CSP header present');
    // Phase 3 meta-injection (built alongside Phase 2): the id tag is inserted.
    match(rootPage.body, new RegExp(`<meta name="sdlc-repo-id" content="${id}">`));

    const asset = await httpReq(port, `/r/${id}/_assets/sdlc.css`);
    equal(asset.status, 200);
    match(String(asset.headers['content-type']), /text\/css/);

    const nested = await httpReq(port, `/r/${id}/demo/`);
    equal(nested.status, 200);
    match(nested.body, /SLUG PAGE/);

    // No trailing slash → 301 to the canonical /r/<id>/.
    const redir = await httpReq(port, `/r/${id}`);
    equal(redir.status, 301);
    equal(redir.headers.location, `/r/${id}/`);

    // Encoded traversal stays contained (resolves inside viewDir → 404, never escapes).
    const trav = await httpReq(port, `/r/${id}/%2e%2e/%2e%2e/README.md`);
    ok(trav.status === 404 || trav.status === 403, `contained, not served (got ${trav.status})`);

    // Unknown id → 404.
    equal((await httpReq(port, '/r/deadbeef/')).status, 404);
  } finally {
    await closeServer(server);
  }
});

test('hub: Host-header allowlist rejects cross-origin / DNS-rebinding (invariant #6)', async () => {
  setHome();
  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    equal((await httpReq(port, '/__sdlc/health', { host: 'evil.example.com' })).status, 403, 'foreign Host rejected');
    equal((await httpReq(port, '/__sdlc/health')).status, 200, 'localhost Host allowed');
    equal((await httpReq(port, '/__sdlc/health', { host: '127.0.0.1:1234' })).status, 200, '127.0.0.1:port allowed');
  } finally {
    await closeServer(server);
  }
});

test('hub: --allowed-hosts admits the tailnet MagicDNS Host without surrendering the allowlist', async () => {
  setHome();
  // Case-mixed on purpose — the extra host set is normalised to lowercase.
  const server = createHubServer({ token: 'tok', liveReload: false, allowedHosts: ['Dragon.taild1fa8.ts.net'] });
  const port = await listen(server);
  try {
    equal((await httpReq(port, '/__sdlc/health', { host: 'dragon.taild1fa8.ts.net' })).status, 200, 'allowlisted tailnet Host admitted');
    equal((await httpReq(port, '/__sdlc/health')).status, 200, 'localhost still allowed');
    equal((await httpReq(port, '/__sdlc/health', { host: 'evil.example.com' })).status, 403, 'other foreign Host still rejected — allowlist not surrendered');
  } finally {
    await closeServer(server);
  }
});

test('hub: parseHubArgs parses --allowed-hosts into a trimmed, comma-split list', () => {
  deepEqual(parseHubArgs(['--allowed-hosts', ' a.ts.net , b.ts.net ']).allowedHosts, ['a.ts.net', 'b.ts.net']);
  deepEqual(parseHubArgs([]).allowedHosts, [], 'absent flag → empty list (localhost-only)');
});

test('hub: POST upsert is token-gated and validates the entry (invariants #5/#6)', async () => {
  setHome();
  const root = tmp('sdlc-hub-upsert-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'posted' });
  const entry = await buildEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  const server = createHubServer({ token: 'sekret', liveReload: false });
  const port = await listen(server);
  try {
    const noToken = await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', body: JSON.stringify(entry) });
    equal(noToken.status, 403, 'no token rejected');

    const wrong = await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', token: 'nope', body: JSON.stringify(entry) });
    equal(wrong.status, 403, 'wrong token rejected');

    const okRes = await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', token: 'sekret', body: JSON.stringify(entry) });
    equal(okRes.status, 200, 'valid token + entry accepted');
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 1);
    equal(dump.entries[0].id, entry.id);

    // A poisoned entry (viewDir not .ai/_view) is rejected 422 even with a token.
    const poisoned = { ...entry, viewDir: repo };
    const bad = await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', token: 'sekret', body: JSON.stringify(poisoned) });
    equal(bad.status, 422, 'poisoned entry rejected on write');

    // refresh is token-gated too.
    equal((await httpReq(port, '/__sdlc/registry/refresh')).status, 403);
    equal((await httpReq(port, '/__sdlc/registry/refresh', { token: 'sekret' })).status, 200);
  } finally {
    await closeServer(server);
  }
});

test('hub: an entry that goes invalid after boot is dropped + 410 on read (§3.6)', async () => {
  setHome();
  const root = tmp('sdlc-hub-drop-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'doomed' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const id = readRegistry().entries[0].id;

  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    equal((await httpReq(port, `/r/${id}/`)).status, 200, 'served while valid');
    // The viewDir disappears post-boot → validateEntry fails at serve time.
    rmSync(join(repo, '.ai', '_view'), { recursive: true, force: true });
    equal((await httpReq(port, `/r/${id}/`)).status, 410, 'now-invalid entry → 410');
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 0, 'entry dropped from the registry');
  } finally {
    await closeServer(server);
  }
});

test('hub: /__sdlc/health reports entries + metrics', async () => {
  setHome();
  const root = tmp('sdlc-hub-health-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'h' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  const server = createHubServer({ token: 'tok', configHash: 'cfgX', liveReload: false });
  const port = await listen(server);
  try {
    const health = JSON.parse((await httpReq(port, '/__sdlc/health')).body);
    equal(health.ok, true);
    equal(health.configHash, 'cfgX');
    equal(health.entries.length, 1);
    ok(typeof health.metrics.rssBytes === 'number');
    ok(typeof health.uptimeMs === 'number');
    // Version stamp + the hub-vs-per-repo marker the supervisor reaps on.
    ok(typeof health.version === 'string', 'health carries a version string');
    ok(Array.isArray(health.entries), 'entries[] present = the isHub marker');
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── live reload (§4.4) ───────────────────────── */

test('hub: INDEX.html gets the livereload client injected when live reload is on', async () => {
  setHome();
  const root = tmp('sdlc-hub-inject-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'demo' });   // rendered WITHOUT a livereload script
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const id = readRegistry().entries[0].id;

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const page = await httpReq(port, `/r/${id}/`);
    match(page.body, /<meta name="sdlc-repo-id"/, 'id meta tag injected');
    match(page.body, /_assets\/livereload\.js/, 'livereload client injected at serve time');
  } finally {
    await closeServer(server);
  }
});

test('hub: a re-render emits a repo-scoped reload event (only the rendered repo)', async () => {
  setHome();
  const root = tmp('sdlc-hub-reload-');
  const repoA = join(root, 'A'); initRepo(repoA); renderView(repoA, { slug: 'a' });
  const repoB = join(root, 'B'); initRepo(repoB); renderView(repoB, { slug: 'b' });
  await upsertRegistryEntry({ projectRoot: repoA, viewDir: join(repoA, '.ai', '_view') });
  await upsertRegistryEntry({ projectRoot: repoB, viewDir: join(repoB, '.ai', '_view') });
  const idA = readRegistry().entries.find((e) => e.repoRoot.endsWith(`${sep}A`)).id;

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const collected = sseCollect(port, 1200);
    await wait(200);   // let the SSE connection + watchers settle
    // Re-render repo A only: bump its .last-render.
    writeFileSync(join(repoA, '.ai', '_view', '.last-render'),
      JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'cfg1' }));
    const events = await collected;
    const reloads = events.filter((e) => e.event === 'reload').map((e) => JSON.parse(e.data));
    ok(reloads.length >= 1, 'at least one reload event fired');
    ok(reloads.every((r) => r.id === idA), 'every reload event is scoped to repo A');
    ok(reloads.every((r) => typeof r.renderedAt === 'string'), 'reload payload carries renderedAt');
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── landing page (§5) ───────────────────────── */

test('hub: GET / renders the aggregate landing page with swimlanes + slug links', async () => {
  setHome();
  const root = tmp('sdlc-hub-land-');
  const repoA = join(root, 'alpha'); initRepo(repoA); renderView(repoA, { slug: 'login-flow', stage: 'implement' });
  const wt = join(root, 'alpha-wt'); gitQuiet(repoA, ['worktree', 'add', '-b', 'feature', wt]); renderView(wt, { slug: 'search' });
  const repoB = join(root, 'beta'); initRepo(repoB); renderView(repoB, { slug: 'billing', status: 'complete' });
  for (const dir of [repoA, wt, repoB]) {
    await upsertRegistryEntry({ projectRoot: dir, viewDir: join(dir, '.ai', '_view') });
  }
  const idA = readRegistry().entries.find((e) => e.repoRoot.endsWith(`${sep}alpha`) && e.branch === 'master').id;

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const page = await httpReq(port, '/');
    equal(page.status, 200);
    match(page.body, /SDLC Hub/);
    // alpha (master) + alpha-wt (feature, linked worktree → own repoRoot) + beta = 3 groups.
    match(page.body, /<b>3<\/b> repo/, 'three repoRoot groups summarised');
    match(page.body, /alpha/);
    match(page.body, /beta/);
    match(page.body, /feature/, 'worktree branch shown');
    match(page.body, /<svg/, 'swimlane figure rendered');
    // Slug links point into the per-repo view under the hub.
    match(page.body, new RegExp(`/r/${idA}/login-flow/`));
    match(page.body, /\/__sdlc\/hub-reload\.js/, 'aggregate live-reload script referenced');

    const js = await httpReq(port, '/__sdlc/hub-reload.js');
    equal(js.status, 200);
    match(String(js.headers['content-type']), /javascript/);
    match(js.body, /EventSource/);
  } finally {
    await closeServer(server);
  }
});

test('hub: GET / on an empty registry shows the empty-state hint', async () => {
  setHome();
  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    const page = await httpReq(port, '/');
    equal(page.status, 200);
    match(page.body, /No repos have rendered yet/);
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── serve-time brand → hub root (§5, Phase 5) ───────────────────────── */

test('hub: rewrites the per-repo brand link to the hub root at serve time (no render flags)', async () => {
  setHome();
  const root = tmp('sdlc-hub-brand-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'demo' });   // root INDEX.html carries <a class="brand" href="_assets/..">
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const id = readRegistry().entries[0].id;

  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    const page = await httpReq(port, `/r/${id}/`);
    equal(page.status, 200);
    match(page.body, /<a class="brand" href="\/">/, 'brand repointed to the hub root');
    // The relative asset link is untouched (resolves under /r/<id>/), proving we
    // do not rewrite content hrefs wholesale.
    match(page.body, /href="_assets\/sdlc\.css"/, 'asset href left intact');
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── Tailscale + exposure gates (Phase 6, §4.6) ───────────────────────── */

test('config: a per-repo config can never carry exposure settings (only view.hub.enabled)', async () => {
  // The security-decisive property: a public binding exposes EVERY registered
  // repo, so no exposure knob may live in a committable per-repo file.
  const okCfg = await validateConfig({ view: { hub: { enabled: true } } });
  equal(okCfg.valid, true, 'enabled is allowed');

  for (const smuggled of [
    { view: { hub: { acknowledgedPublic: true } } },
    { view: { hub: { host: '0.0.0.0' } } },
    { view: { hub: { port: 4173 } } },
    { view: { hub: { tailscale: { enabled: true } } } },
  ]) {
    const res = await validateConfig(smuggled);
    equal(res.valid, false, `per-repo hub rejects ${JSON.stringify(smuggled.view.hub)}`);
  }
});

test('hub-lifecycle: refuses 0.0.0.0 without machine-wide tailscale acknowledgement (no spawn)', async () => {
  setHome();
  // Machine config asks to bind publicly but has NOT acknowledged exposure.
  writeFileSync(hubConfigPath(), JSON.stringify({
    version: 1, host: '0.0.0.0', port: 4173, maxSseClients: 200, maxWatchedRepos: 50,
    tailscale: { enabled: false, mode: 'serve', path: '/', https: true, acknowledgedPublic: false },
  }));
  const res = await ensureHubLifecycle({ pluginRoot: process.cwd(), log: () => {} });
  equal(res.action, 'refused-host', 'public bind refused before any spawn');
});

test('tailscale: funnel is refused without acknowledgedPublic (gate fires before spawn)', () => {
  const logs = [];
  maybeConfigureTailscale({ tailscale: { enabled: true, mode: 'funnel', acknowledgedPublic: false }, port: 4173, log: (l) => logs.push(l) });
  ok(logs.some((l) => /refused funnel without acknowledgedPublic/.test(l)), 'funnel refusal logged');
  ok(!logs.some((l) => /configured/.test(l)), 'tailscale never configured');
  // Disabled tailscale is a silent no-op.
  const logs2 = [];
  maybeConfigureTailscale({ tailscale: { enabled: false }, port: 4173, log: (l) => logs2.push(l) });
  equal(logs2.length, 0, 'disabled tailscale does nothing');
});

/* ───────────────────────── cross-repo inbox (§11.3) ───────────────────────── */

function entryStub({ id, repo, branch = 'master', lastRenderedAt, slugMeta }) {
  return {
    id, repoRoot: `/work/${repo}`, branch, worktreeLabel: null,
    viewDir: `/work/${repo}/.ai/_view`, lastRenderedAt,
    slugs: slugMeta.map((s) => s.slug), slugMeta,
    configHash: null, registeredAt: lastRenderedAt, updatedAt: lastRenderedAt,
  };
}

test('inbox: surfaces blocked / in-review / stale active slugs and skips healthy ones', () => {
  const now = Date.parse('2026-05-30T12:00:00.000Z');
  const fresh = '2026-05-30T11:00:00.000Z';
  const old = '2026-05-01T00:00:00.000Z';   // > 7 days → stale
  const entries = [
    entryStub({ id: 'a', repo: 'pay', lastRenderedAt: fresh, slugMeta: [
      { slug: 'payment-bug', currentStage: 'implement', status: 'blocked', blocked: true, classification: 'active' },
    ] }),
    entryStub({ id: 'b', repo: 'web', lastRenderedAt: fresh, slugMeta: [
      { slug: 'login-flow', currentStage: 'review', status: 'active', blocked: false, classification: 'active' },
      { slug: 'healthy', currentStage: 'implement', status: 'active', blocked: false, classification: 'active' },
    ] }),
    entryStub({ id: 'c', repo: 'old', lastRenderedAt: old, slugMeta: [
      { slug: 'forgotten', currentStage: 'plan', status: 'active', blocked: false, classification: 'active' },
      { slug: 'shipped-thing', currentStage: 'retro', status: 'complete', blocked: false, classification: 'complete' },
    ] }),
  ];
  const items = inboxItems(entries, now);
  const slugs = items.map((i) => i.sm.slug);
  ok(slugs.includes('payment-bug'), 'blocked slug surfaced');
  ok(slugs.includes('login-flow'), 'in-review slug surfaced');
  ok(slugs.includes('forgotten'), 'stale repo active slug surfaced');
  ok(!slugs.includes('healthy'), 'healthy active slug not surfaced');
  ok(!slugs.includes('shipped-thing'), 'completed slug never surfaced');
  // Priority: blocked first, then review, then stale-only.
  equal(items[0].sm.slug, 'payment-bug', 'blocked sorts first');
  equal(items[1].sm.slug, 'login-flow', 'review sorts before stale-only');
  equal(items[2].sm.slug, 'forgotten', 'stale-only last');
});

test('inbox: is the landing page default tab; swimlane grid is the secondary tab', () => {
  const now = Date.parse('2026-05-30T12:00:00.000Z');
  const entries = [entryStub({ id: 'a', repo: 'pay', lastRenderedAt: '2026-05-30T11:00:00.000Z', slugMeta: [
    { slug: 'payment-bug', currentStage: 'implement', status: 'blocked', blocked: true, classification: 'active' },
  ] })];
  const html = renderHubLanding(entries, { pluginVersion: '9.33.0', now });
  // Inbox radio is checked (default tab); both tabs present.
  match(html, /id="tab-inbox" class="tabin" checked/);
  match(html, /<label for="tab-inbox">Inbox/);
  match(html, /<label for="tab-repos">All repos/);
  // Inbox panel carries the attention item; repos panel still carries the swimlane.
  match(html, /class="panel panel-inbox">[\s\S]*payment-bug[\s\S]*<span class="reason bad">blocked/);
  match(html, /class="panel panel-repos">[\s\S]*<svg/);
});

test('inbox: empty state when nothing needs attention', () => {
  const now = Date.parse('2026-05-30T12:00:00.000Z');
  const entries = [entryStub({ id: 'a', repo: 'calm', lastRenderedAt: '2026-05-30T11:00:00.000Z', slugMeta: [
    { slug: 'cruising', currentStage: 'implement', status: 'active', blocked: false, classification: 'active' },
  ] })];
  const html = renderHubLanding(entries, { now });
  match(html, /Nothing needs attention across 1 repo\./);
  match(html, /<b>0<\/b> needing attention/);
});

test('hub: GET / serves the inbox as the default tab end to end', async () => {
  setHome();
  const root = tmp('sdlc-hub-inbox-');
  const blockedRepo = join(root, 'pay'); initRepo(blockedRepo); renderView(blockedRepo, { slug: 'payment-bug', status: 'blocked', blocked: true });
  const reviewRepo = join(root, 'web'); initRepo(reviewRepo); renderView(reviewRepo, { slug: 'login-flow', stage: 'review' });
  const healthyRepo = join(root, 'docs'); initRepo(healthyRepo); renderView(healthyRepo, { slug: 'docs-pass', stage: 'implement' });
  for (const dir of [blockedRepo, reviewRepo, healthyRepo]) {
    await upsertRegistryEntry({ projectRoot: dir, viewDir: join(dir, '.ai', '_view') });
  }
  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    const page = await httpReq(port, '/');
    equal(page.status, 200);
    match(page.body, /id="tab-inbox" class="tabin" checked/, 'inbox is the default tab');
    match(page.body, /payment-bug[\s\S]*reason bad">blocked/, 'blocked item with badge');
    match(page.body, /login-flow[\s\S]*reason cur">in review/, 'review item with badge');
    ok(!/inbox-item[\s\S]*docs-pass/.test(page.body.split('panel-repos')[0]), 'healthy slug absent from inbox panel');
  } finally {
    await closeServer(server);
  }
});
