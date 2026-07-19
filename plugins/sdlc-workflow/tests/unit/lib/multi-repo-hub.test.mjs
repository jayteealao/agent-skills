// tests/unit/lib/multi-repo-hub.test.mjs
//
// Multi-repo registry + hub coverage (MULTI-REPO-REGISTRY-PLAN). Every test
// relocates the machine-wide state dir to a fresh temp dir via SDLC_HOME so the
// real ~/.sdlc/ is never touched.

import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  sdlcHomeDir,
  registryPath,
  pruneLogPath,
  SHARD_SOFT_CAP,
} from '../../../lib/registry.mjs';
import { createHubServer, parseHubArgs } from '../../../scripts/hub-serve.mjs';
import { enqueue as enqueueRender, countPending } from '../../../lib/render-queue.mjs';
import { renderHubLanding, inboxItems } from '../../../renderers/hub-dashboard.mjs';
import { resolveRequestPath } from '../../../lib/resolve-request-path.mjs';
import { computeBranchState, refreshEntriesLiveness } from '../../../lib/branch-liveness.mjs';
import { readHubConfig, hubConfigPath, HUB_CONFIG_DEFAULTS } from '../../../lib/hub-config.mjs';
import { ensureHubLifecycle } from '../../../lib/hub-lifecycle.mjs';
import { ensureServeLifecycle, servePidPath } from '../../../lib/serve-lifecycle.mjs';
import { maybeConfigureTailscale } from '../../../lib/tailscale.mjs';
import { validateConfig } from '../../../lib/config.mjs';

// The running plugin version, read the SAME way the daemons do (package.json) so
// stale-render heal tests stamp the matching "fresh" version.
const PLUGIN_VERSION = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8'),
).version;

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

function renderView(repoDir, {
  slug = 'demo', stage = 'implement', status = 'active', blocked = false,
  branch, branchStrategy, baseBranch, prNumber, prUrl,
} = {}) {
  const view = join(repoDir, '.ai', '_view');
  mkdirSync(view, { recursive: true });
  writeFileSync(join(view, '.last-render'), JSON.stringify({
    renderedAt: new Date().toISOString(), configHash: 'cfg0',
  }));
  // Emit real view files so HTTP serving (incl. meta-injection + assets) can be
  // exercised: a root INDEX.html, a nested slug page, and a copied asset.
  // Mirrors the real shell's TWO-anchor chrome (desktop topbar + mobile menu
  // sheet) so the global brand→hub rewrite is exercised against both.
  writeFileSync(join(view, 'INDEX.html'),
    '<!DOCTYPE html><html><head>\n  <link rel="stylesheet" href="_assets/sdlc.css">\n</head>'
    + '<body class="artifact"><div class="b-topbar"><a class="brand" href="_assets/..">.ai/workflows</a></div>ROOT'
    + '<aside class="m-sheet"><a class="brand" href="_assets/..">.ai/workflows</a></aside></body></html>');
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
    // Per-slug branch frontmatter (SLUG-BRANCH-IDENTITY-PLAN §4.1). Quoted to
    // survive `/` in branch names; emitted only when the caller opts in so the
    // existing fixtures stay byte-stable.
    branch != null ? `branch: "${branch}"` : null,
    branchStrategy != null ? `branch-strategy: ${branchStrategy}` : null,
    baseBranch != null ? `base-branch: "${baseBranch}"` : null,
    prNumber != null ? `pr-number: ${prNumber}` : null,
    prUrl != null ? `pr-url: "${prUrl}"` : null,
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
// Collect the RAW SSE byte stream (comments included) for a window, then close.
// Needed for keep-alive assertions: a `: ping` comment frame carries no
// event:/data: line, so sseCollect (which parses those) never surfaces it.
function sseRaw(port, ms) {
  return new Promise((resolve) => {
    let buf = '';
    const r = httpRequest({ hostname: '127.0.0.1', port, path: '/__sdlc/events', method: 'GET' }, (res) => {
      res.on('data', (c) => { buf += c; });
    });
    r.on('error', () => {});
    r.end();
    setTimeout(() => { try { r.destroy(); } catch { /* ignore */ } resolve(buf); }, ms);
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── id computation (§3.3) ───────────────────────── */

test('registry: computeEntryId is forward-slash-stable and branch-INSENSITIVE (§4.2)', () => {
  equal(
    computeEntryId('C:/Users/x/repo'),
    computeEntryId('C:\\Users\\x\\repo'),
    'native vs forward-slash repoRoot must hash identically',
  );
  // Repo-scoped id (D1): branch is no longer part of identity. The optional 2nd
  // arg is accepted-and-ignored, so two branches of one repoRoot share an id.
  equal(
    computeEntryId('C:/Users/x/repo', 'master'),
    computeEntryId('C:/Users/x/repo', 'feature'),
    'branch is NOT part of identity (repo-scoped id)',
  );
  notEqual(
    computeEntryId('C:/Users/x/repo'),
    computeEntryId('C:/Users/y/repo'),
    'a different repoRoot still yields a different id',
  );
  equal(computeEntryId('/a/b').length, 12, '12 hex chars (48 bits)');
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

  const wtEntry = entries.find((e) => e.headBranch === 'feature');
  ok(wtEntry, 'worktree entry present on its own branch (distinct repoRoot)');
  ok(wtEntry.worktreeLabel, 'worktree entry carries a worktreeLabel');
  equal(wtEntry.worktreeLabel, 'repoA-wt');

  const mainEntry = entries.find((e) => e.headBranch === 'master' && e.repoRoot.endsWith('repoA'));
  ok(mainEntry, 'main repoA entry present');
  equal(mainEntry.worktreeLabel, null, 'main checkout has no worktreeLabel');

  // slugMeta populated from scanWorkflowIndexes (§3.2).
  equal(mainEntry.slugMeta[0].slug, 'alpha');
  equal(mainEntry.slugMeta[0].currentStage, 'implement');
});

/* ───────────────────────── Slice 1: per-slug branch metadata (§4.1) ───────────────────────── */

test('registry: slugMeta carries each slug\'s declared branch from frontmatter (§4.1)', async () => {
  setHome();
  const root = tmp('sdlc-branchmeta-');
  const repo = join(root, 'repo');
  initRepo(repo, 'master');   // one checkout (HEAD=master); slugs declare their OWN branches
  renderView(repo, { slug: 'alpha', branch: 'feat/alpha', branchStrategy: 'dedicated', baseBranch: 'main', prNumber: 7, prUrl: 'https://x/pull/7' });
  renderView(repo, { slug: 'beta', branch: 'feat/beta', branchStrategy: 'shared', baseBranch: 'main' });
  // branch-strategy:none → empty-string branch + pr-number:0 in frontmatter (live-repo shape).
  renderView(repo, { slug: 'gamma', branchStrategy: 'none', branch: '', baseBranch: 'main', prNumber: 0, prUrl: '' });

  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const { entries } = readRegistry();
  equal(entries.length, 1, 'one checkout → one entry (branch lives inside slugMeta, not the id)');

  const bySlug = Object.fromEntries(entries[0].slugMeta.map((s) => [s.slug, s]));
  equal(bySlug.alpha.branch, 'feat/alpha');
  equal(bySlug.alpha.branchStrategy, 'dedicated');
  equal(bySlug.alpha.baseBranch, 'main');
  equal(bySlug.alpha.prNumber, 7);
  equal(bySlug.alpha.prUrl, 'https://x/pull/7');
  equal(bySlug.beta.branch, 'feat/beta');
  equal(bySlug.beta.branchStrategy, 'shared');
  notEqual(bySlug.alpha.branch, bySlug.beta.branch, 'distinct declared branches survive into slugMeta from one checkout');
  // Normalisation (Slice 0 findings): "" branch/pr-url → null; pr-number 0 → null.
  equal(bySlug.gamma.branch, null, 'branch-strategy:none empty branch normalised to null');
  equal(bySlug.gamma.branchStrategy, 'none');
  equal(bySlug.gamma.baseBranch, 'main');
  equal(bySlug.gamma.prNumber, null, 'pr-number 0 normalised to null');
  equal(bySlug.gamma.prUrl, null, 'empty pr-url normalised to null');
});

/* ───────────────────────── Slice 2: repo-scoped identity (§4.2) ───────────────────────── */

test('registry: an in-place branch switch yields ONE entry, no phantom duplicate (§4.2/D1)', async () => {
  setHome();
  const root = tmp('sdlc-inplace-');
  const repo = join(root, 'repo');
  initRepo(repo, 'master');
  renderView(repo, { slug: 'on-master' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  // Switch HEAD in place to a new branch and re-render a second slug. The
  // .ai/workflows tree is untracked, so both slugs coexist after the switch.
  gitQuiet(repo, ['checkout', '-b', 'feat/x']);
  renderView(repo, { slug: 'on-featx' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  const { entries } = readRegistry();
  equal(entries.length, 1, 'one repoRoot → one entry regardless of the HEAD switch');
  equal(entries[0].headBranch, 'feat/x', 'headBranch reflects the latest checkout HEAD');
  deepEqual(
    entries[0].slugMeta.map((s) => s.slug).sort(),
    ['on-featx', 'on-master'],
    'both slugs visible — branch no longer forks the entry',
  );
});

test('registry: v1→v2 migration re-keys + merges branch-forked duplicates, unioning slugs (§4.2)', () => {
  setHome();
  const root = tmp('sdlc-migrate-');
  const repo = join(root, 'repo');
  initRepo(repo, 'master');
  const view = renderView(repo, { slug: 'unused' });   // real .ai/_view so entries validate

  // A hand-written v1 registry: TWO entries for the SAME repoRoot + viewDir,
  // keyed the OLD branch-inclusive way (arbitrary distinct ids) — exactly the
  // phantom-duplicate bug. The migration must collapse them to one v2 entry.
  const base = { repoRoot: repo, viewDir: view, configHash: null, lastRenderedAt: '2026-06-01T00:00:00.000Z' };
  const v1 = {
    version: 1,
    entries: [
      { ...base, id: 'oldmaster', branch: 'master', registeredAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
        slugs: ['alpha'], slugMeta: [{ slug: 'alpha', status: 'active', classification: 'active' }] },
      { ...base, id: 'oldfeat', branch: 'feature', registeredAt: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-03T00:00:00.000Z',
        slugs: ['beta'], slugMeta: [{ slug: 'beta', status: 'active', classification: 'active' }] },
    ],
  };
  mkdirSync(sdlcHomeDir(), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify(v1, null, 2));

  const { version, entries } = readRegistry();
  equal(version, 2, 'registry surfaces as v2');
  equal(entries.length, 1, 'two branch-forked v1 entries collapse to one');
  const e = entries[0];
  equal(e.registeredAt, '2026-06-01T00:00:00.000Z', 'earliest registeredAt preserved');
  equal(e.headBranch, 'feature', 'latest updatedAt wins scalar fields (headBranch from the newer entry)');
  equal(e.branch, undefined, 'legacy `branch` field dropped on promotion to headBranch');
  deepEqual(e.slugMeta.map((s) => s.slug).sort(), ['alpha', 'beta'], 'slugMeta unioned by slug across the two branches');
  equal(computeEntryId(repo), e.id, 'collapsed id equals the repoRoot-scoped hash');
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

test('registry: a non-git projectRoot skips registration WITH a prune-log line (skip-not-git)', async () => {
  setHome();
  // A plain directory — .ai/_view exists but there is no git toplevel, so
  // buildEntry returns null. Before v9.112.0 this skip was invisible on disk
  // (the Waypoint failure): assert the trail now names the cure.
  const plain = join(tmp('sdlc-notgit-'), 'plain');
  mkdirSync(join(plain, '.ai', '_view'), { recursive: true });
  const res = await upsertRegistryEntry({ projectRoot: plain, viewDir: join(plain, '.ai', '_view') });
  equal(res.action, 'skipped-not-git', 'non-git dir cannot register');
  equal(readRegistry().entries.length, 0, 'nothing persisted');
  const log = readFileSync(pruneLogPath(), 'utf-8');
  match(log, /skip-not-git .*no git toplevel — run git init to register/, 'the skip leaves a visible prune-log trail');
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

test('registry: pruneRegistry keeps a registered-but-unrendered repo that has queued render work (RENDER-DISPATCH)', async () => {
  setHome();
  const root = tmp('sdlc-prune-queue-');
  const repo = join(root, 'repo');
  initRepo(repo);
  // Registered BEFORE any render: viewDir exists, no .last-render yet, but a
  // render is queued (the new hook order). The old "no .last-render → prune"
  // would kill it before the hub could ever drain the queue.
  const viewDir = join(repo, '.ai', '_view');
  mkdirSync(viewDir, { recursive: true });
  enqueueRender(viewDir, { repoRoot: repo, kind: 'incremental', bucket: 'demo' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir });
  mergeShardsIntoRegistry();
  ok(!existsSync(join(viewDir, '.last-render')), 'precondition: never rendered');
  ok(countPending(viewDir) > 0, 'precondition: has queued work');

  let res = pruneRegistry();
  equal(res.pruned, 0, 'a repo with queued renders survives prune');
  equal(res.kept, 1);

  // Drain it away (render still never produced a .last-render) → prunable, but
  // only past the fresh-registration grace window (F2): the entry was upserted
  // moments ago, so the default grace keeps it. graceMs:0 expires it for the test.
  rmSync(join(viewDir, '.render-queue'), { recursive: true, force: true });
  res = pruneRegistry();
  equal(res.pruned, 0, 'within registration grace → still kept');
  res = pruneRegistry({ graceMs: 0 });
  equal(res.pruned, 1, 'no .last-render, no queued work, grace expired → pruned');
  equal(res.kept, 0);
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

test('hub-config: perRepoServe defaults false (per-repo daemons are opt-in)', () => {
  setHome();
  equal(HUB_CONFIG_DEFAULTS.perRepoServe, false, 'default makes the hub the sole server');
  equal(readHubConfig().perRepoServe, false, 'sparse/first-read config inherits the default');
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

  equal(result.action, 'per-repo-disabled', 'explicit perRepoServe:false disables per-repo daemons');
  ok(!existsSync(servePidPath(projectRoot)), 'no per-repo daemon pid file was written (nothing spawned)');
});

test('serve-lifecycle: perRepoServe absent (default) also disables per-repo daemons', async () => {
  setHome();
  // Opt-in default: a config that never sets perRepoServe must still resolve OFF
  // (deep-merge inherits the default `false`), so no standalone daemon spawns.
  const withoutKey = { ...HUB_CONFIG_DEFAULTS };
  delete withoutKey.perRepoServe;
  writeFileSync(hubConfigPath(), JSON.stringify(withoutKey, null, 2));
  const projectRoot = tmp('sdlc-default-off-');

  const result = await ensureServeLifecycle({
    projectRoot,
    pluginRoot: '/nonexistent',   // never used — the gate returns before any spawn
    log: () => {},
  });

  equal(result.action, 'per-repo-disabled', 'default (no opt-in) disables per-repo daemons');
  ok(!existsSync(servePidPath(projectRoot)), 'no per-repo daemon pid file was written');
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
    // Legacy version alias + the hub-vs-per-repo marker the supervisor reaps on.
    ok(typeof health.version === 'string', 'health carries a legacy version alias');
    ok(Array.isArray(health.entries), 'entries[] present = the isHub marker');
    // Structured shared-runtime identity (NATIVE-INTEROP Workstream B): adoption
    // keys on hub.name + protocolVersion + runtimeVersion, NOT the package version.
    equal(health.hub.name, 'sdlc-workflow-hub', 'hub.name is the host-neutral singleton name');
    ok(Number.isInteger(health.hub.protocolVersion), 'hub.protocolVersion is an integer');
    ok(typeof health.hub.runtimeVersion === 'string', 'hub.runtimeVersion is the shared runtime version');
    equal(health.hub.runtimeVersion, health.version, 'legacy version === hub.runtimeVersion during migration');
    ok('buildId' in health.hub, 'hub.buildId is present (null pre-build, sha256 after)');
    ok(typeof health.startedBy.host === 'string', 'startedBy.host is diagnostic provenance');
    // Per-entry render identity drives the stale flag via buildId-or-version.
    ok('renderedBuildId' in health.entries[0], 'entries carry renderedBuildId for cross-host heal');
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

test('hub: a registration POST drives the reload itself (decoupled from fs.watch)', async () => {
  setHome();
  const root = tmp('sdlc-hub-push-reload-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'pushed' });
  const entry = await buildEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const collected = sseCollect(port, 1000);
    await wait(150);   // let the SSE client connect
    // The render's registration POST — NOT a filesystem change — must reload the
    // browser. Proves live-reload no longer hinges on fs.watch firing, which the
    // 50-repo watcher cap and Windows atomic-rename writes can silently defeat.
    const res = await httpReq(port, '/__sdlc/registry/upsert',
      { method: 'POST', token: 'tok', body: JSON.stringify(entry) });
    equal(res.status, 200, 'upsert accepted');
    const events = await collected;
    const reloads = events.filter((e) => e.event === 'reload').map((e) => JSON.parse(e.data));
    ok(reloads.length >= 1, 'the POST alone emitted a reload — no fs.watch event occurred');
    ok(reloads.every((r) => r.id === entry.id), 'reload scoped to the posted repo');
    ok(reloads.every((r) => typeof r.renderedAt === 'string'), 'reload payload carries renderedAt');
  } finally {
    await closeServer(server);
  }
});

test('hub: two rapid POSTs for one repo coalesce to a single reload (debounce)', async () => {
  setHome();
  const root = tmp('sdlc-hub-coalesce-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'fast' });
  const entry = await buildEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const collected = sseCollect(port, 1000);
    await wait(150);
    // Both POSTs land well inside RELOAD_DEBOUNCE_MS (localhost round-trips are
    // sub-millisecond), so the second reload is coalesced away — one render, one
    // browser reload, even though the push and watch paths can both fire.
    await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', token: 'tok', body: JSON.stringify(entry) });
    await httpReq(port, '/__sdlc/registry/upsert', { method: 'POST', token: 'tok', body: JSON.stringify(entry) });
    const events = await collected;
    const reloads = events.filter((e) => e.event === 'reload');
    equal(reloads.length, 1, 'rapid re-POSTs collapse to one reload');
  } finally {
    await closeServer(server);
  }
});

test('hub: SSE stream sends keep-alive pings to survive idle proxies', async () => {
  setHome();
  // Tiny heartbeat so several pings land inside a short observation window. In
  // production heartbeatMs defaults to 25s, so short-window reload tests above
  // never see a ping (their event parsing would ignore it anyway).
  const server = createHubServer({ token: 'tok', liveReload: true, heartbeatMs: 60 });
  const port = await listen(server);
  try {
    const raw = await sseRaw(port, 400);
    const pings = (raw.match(/\n: ping\n/g) ?? []).length;
    ok(pings >= 2, `expected >= 2 keep-alive pings in 400ms, got ${pings}`);
  } finally {
    await closeServer(server);
  }
});

test('hub: reconcile tick prunes an entry whose viewDir vanished (no serve hit)', async () => {
  setHome();
  const root = tmp('sdlc-hub-reconcile-prune-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'doomed' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });

  // liveReload off + a fast reconcile: the ONLY thing that can drop the entry is
  // the level-triggered reconcile (we never GET /r/<id>/, which would drop it at
  // serve time and mask what we're testing).
  const server = createHubServer({ token: 'tok', liveReload: false, reconcileMs: 60 });
  const port = await listen(server);
  try {
    equal(JSON.parse((await httpReq(port, '/__sdlc/registry')).body).entries.length, 1, 'present at boot');
    rmSync(join(repo, '.ai', '_view'), { recursive: true, force: true });
    await wait(240);   // >= 3 reconcile ticks
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 0, 'reconcile dropped the vanished entry without a serve-time hit');
  } finally {
    await closeServer(server);
  }
});

test('hub: reconcile tick reloads an UNwatched repo via .last-render mtime (cap backstop)', async () => {
  setHome();
  const root = tmp('sdlc-hub-reconcile-mtime-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'capped' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const id = readRegistry().entries[0].id;

  // maxWatchedRepos:0 → the repo is NEVER fs.watched, so any reload can only come
  // from the reconcile mtime backstop (not fs.watch).
  const server = createHubServer({ token: 'tok', liveReload: true, maxWatchedRepos: 0, reconcileMs: 70 });
  const port = await listen(server);
  try {
    const collected = sseCollect(port, 800);
    await wait(200);   // >= 2 ticks seed the mtime baseline (no emit on the seed tick)
    // Re-render: bump .last-render to a new mtime + renderedAt.
    writeFileSync(join(repo, '.ai', '_view', '.last-render'),
      JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'cfg2' }));
    const events = await collected;
    const reloads = events.filter((e) => e.event === 'reload').map((e) => JSON.parse(e.data));
    ok(reloads.length >= 1, 'reconcile emitted a reload for the unwatched repo');
    ok(reloads.every((r) => r.id === id), 'reload scoped to the repo');
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── stale-render heal (STALE-RENDER-HEAL-PLAN) ───────────────────────── */

test('hub: health surfaces renderedVersion + stale per entry (detection works with heal off)', async () => {
  setHome();
  const root = tmp('sdlc-hub-stale-flag-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'x' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const rec = readRegistry().entries[0];
  // Stamp the view as rendered by an OLD version → drift.
  writeFileSync(join(rec.viewDir, '.last-render'),
    JSON.stringify({ renderedAt: new Date().toISOString(), version: '0.0.0-old' }));

  // heal omitted from createHubServer → detection only, no background renders.
  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    const health = JSON.parse((await httpReq(port, '/__sdlc/health')).body);
    const e = health.entries.find((x) => x.id === rec.id);
    equal(e.renderedVersion, '0.0.0-old', 'health reports the rendered version live from .last-render');
    equal(e.stale, true, 'drift flagged stale even with heal off');
    equal(health.heal.heal, false, 'heal off when the constructor gets no staleRender config');
  } finally {
    await closeServer(server);
  }
});

test('hub: reconcile heals a version-stale view via a background re-render (§4)', async () => {
  setHome();
  const root = tmp('sdlc-hub-heal-');
  const repo = join(root, 'repo');
  initRepo(repo);
  renderView(repo, { slug: 'stale' });
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const rec = readRegistry().entries[0];

  // Stamp the view as rendered by an OLD plugin version → drift vs PLUGIN_VERSION.
  writeFileSync(join(rec.viewDir, '.last-render'),
    JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'old', version: '0.0.0-old' }));

  // Injected render-spawn stub: simulate render-sunflower by rewriting
  // .last-render to the CURRENT version, then exiting 0. Forks nothing.
  const calls = [];
  const spawnRender = (script, args, opts) => {
    calls.push({ script, args, opts });
    const child = new EventEmitter();
    setImmediate(() => {
      const vi = args.indexOf('--view');
      const vd = vi >= 0 ? args[vi + 1] : join(opts.cwd, '.ai', '_view');
      try {
        writeFileSync(join(vd, '.last-render'),
          JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'healed', version: PLUGIN_VERSION }));
      } catch { /* ignore */ }
      child.emit('exit', 0);
    });
    return child;
  };

  const server = createHubServer({
    token: 'tok', liveReload: true, reconcileMs: 50,
    staleRender: { heal: true, cooldownMs: 0, maxConcurrent: 1, maxAttempts: 3 },
    spawnRender,
  });
  const port = await listen(server);
  try {
    const collected = sseCollect(port, 800);
    await wait(300);   // several reconcile ticks → heal spawns + the stub completes
    const events = await collected;

    ok(calls.length >= 1, 'a background render was spawned for the stale view');
    ok(calls[0].args.includes('--clean'), 'heal forces a clean re-render');
    equal(calls[0].opts.cwd, rec.repoRoot, 'render spawned with cwd=repoRoot (no --project-root flag exists)');

    // After the stub render, the view is fresh and health reflects it.
    const health = JSON.parse((await httpReq(port, '/__sdlc/health')).body);
    const he = health.entries.find((e) => e.id === rec.id);
    equal(he.renderedVersion, PLUGIN_VERSION, 'health reports the healed version');
    equal(he.stale, false, 'no longer stale after the heal');

    // Completion fired a reload (heal emitReload + the .last-render watch, coalesced).
    const reloads = events.filter((e) => e.event === 'reload').map((e) => JSON.parse(e.data));
    ok(reloads.some((r) => r.id === rec.id), 'a reload event fired for the healed repo');
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
  const idA = readRegistry().entries.find((e) => e.repoRoot.endsWith(`${sep}alpha`) && e.headBranch === 'master').id;

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

/* ───────────────────────── Slice 3: repo → branch → slug grouping (§4.4/D3) ───────────────────────── */

test('hub landing: repo card groups slugs into per-branch sub-lanes by strategy (§4.4/D3)', () => {
  const now = Date.parse('2026-06-08T12:00:00.000Z');
  const fresh = '2026-06-08T11:00:00.000Z';
  const slugMeta = [
    { slug: 'auth', currentStage: 'implement', status: 'active', blocked: false, classification: 'active',
      branch: 'feat/auth', branchStrategy: 'dedicated', baseBranch: 'main', prNumber: null, prUrl: null },
    { slug: 'search', currentStage: 'plan', status: 'active', blocked: false, classification: 'active',
      branch: 'feat/search', branchStrategy: 'dedicated', baseBranch: 'main', prNumber: null, prUrl: null },
    { slug: 'sync', currentStage: 'implement', status: 'active', blocked: false, classification: 'active',
      branch: 'feat/auth', branchStrategy: 'shared', baseBranch: 'main', prNumber: null, prUrl: null },
    { slug: 'cleanup', currentStage: 'verify', status: 'active', blocked: false, classification: 'active',
      branch: null, branchStrategy: 'none', baseBranch: 'main', prNumber: null, prUrl: null },
  ];
  const entries = [entryStub({ id: 'r1', repo: 'web', headBranch: 'master', lastRenderedAt: fresh, slugMeta })];
  const html = renderHubLanding(entries, { now });

  // ≥2 branch sub-lanes, keyed by each slug's DECLARED branch.
  match(html, /lane-branch">⎇ feat\/auth/, 'dedicated/shared branch lane present');
  match(html, /lane-branch">⎇ feat\/search/, 'a second dedicated branch lane present');
  // branch-strategy:none clusters under its base-branch (main), never an empty lane.
  match(html, /lane-branch">⎇ main/, 'none-strategy slug clustered under base-branch');
  ok(!/lane-branch">⎇ <\/span>/.test(html), 'no literal empty lane rendered');
  // Strategy hints: the two-slug feat/auth lane is shared; the base lane is hinted.
  match(html, /lane-strat shared">shared/, 'shared cluster hinted');
  match(html, /lane-strat base">base/, 'base/trunk lane hinted');
  match(html, /2 slugs/, 'the shared lane reports its slug count');
  // Repo header shows the checkout HEAD as informational context (R4 distinction).
  match(html, /head-branch">on <code>master/, 'repo header shows headBranch context');
  match(html, /<svg/, 'swimlane figure rendered per lane');
});

test('hub landing: inbox row surfaces the slug\'s declared branch (§4.4)', () => {
  const now = Date.parse('2026-06-08T12:00:00.000Z');
  const entries = [entryStub({ id: 'r1', repo: 'web', headBranch: 'master', lastRenderedAt: '2026-06-08T11:00:00.000Z', slugMeta: [
    { slug: 'payment-bug', currentStage: 'implement', status: 'blocked', blocked: true, classification: 'active',
      branch: 'fix/payment', branchStrategy: 'dedicated', baseBranch: 'main' },
  ] })];
  const html = renderHubLanding(entries, { now });
  match(html, /ix-branch">⎇ fix\/payment/, 'inbox row shows the declared branch');
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
    // The label is rewritten too, so the home affordance is honest: it points at
    // the hub and now says so (no more ".ai/workflows" → multi-repo-hub mismatch).
    match(page.body, /<a class="brand" href="\/">sdlc hub<\/a>/, 'brand relabelled to the hub');
    ok(!/>\.ai\/workflows<\/a>/.test(page.body), 'the misleading .ai/workflows brand label is gone under the hub');
    // The shell renders the brand anchor TWICE (desktop topbar + mobile menu
    // sheet); the rewrite is global so phones get a hub link too.
    equal((page.body.match(/<a class="brand" href="\/">sdlc hub<\/a>/g) ?? []).length, 2,
      'BOTH brand anchors (topbar + mobile sheet) repointed');
    // The relative asset link is untouched (resolves under /r/<id>/), proving we
    // do not rewrite content hrefs wholesale.
    match(page.body, /href="_assets\/sdlc\.css"/, 'asset href left intact');
  } finally {
    await closeServer(server);
  }
});

test('hub: brand→hub rewrite + live reload apply to non-INDEX project pages too', async () => {
  setHome();
  const root = tmp('sdlc-hub-project-');
  const repo = join(root, 'repo');
  initRepo(repo);
  const view = renderView(repo, { slug: 'demo' });
  // A project-context page (project/PRODUCT.html) is a real `.html` file, NOT an
  // INDEX.html — the previous INDEX-only gate served it untransformed.
  mkdirSync(join(view, 'project'), { recursive: true });
  writeFileSync(join(view, 'project', 'PRODUCT.html'),
    '<!DOCTYPE html><html><head>\n  <link rel="stylesheet" href="../_assets/sdlc.css">\n</head>'
    + '<body class="artifact"><div class="b-topbar"><a class="brand" href="../_assets/..">.ai/workflows</a></div>PRODUCT</body></html>');
  await upsertRegistryEntry({ projectRoot: repo, viewDir: view });
  const id = readRegistry().entries[0].id;

  const server = createHubServer({ token: 'tok', liveReload: true });
  const port = await listen(server);
  try {
    const page = await httpReq(port, `/r/${id}/project/PRODUCT.html`);
    equal(page.status, 200);
    match(page.body, /PRODUCT/);
    match(page.body, /<a class="brand" href="\/">sdlc hub<\/a>/, 'project page brand repointed + relabelled to the hub');
    match(page.body, /\.\.\/_assets\/livereload\.js/, 'live reload injected at the page\'s own asset depth');
  } finally {
    await closeServer(server);
  }
});

/* ───────────────────────── plugin docs site (/docs/) ───────────────────────── */

test('hub: serves the plugin docs site under /docs/ with a docs-scoped CSP', async () => {
  setHome();
  const server = createHubServer({ token: 'tok', liveReload: false });
  const port = await listen(server);
  try {
    // /docs (no trailing slash) → 301 /docs/ so the docs' relative links resolve
    // against the docs root, not the hub root.
    const redir = await httpReq(port, '/docs');
    equal(redir.status, 301);
    equal(redir.headers.location, '/docs/');

    // /docs/ resolves the docs' lowercase index.html via the shared containment
    // kernel (indexFile option) — proof the same audited resolver serves docs.
    const index = await httpReq(port, '/docs/');
    equal(index.status, 200);
    match(index.body, /plugin docs/, 'docs index served at /docs/');
    match(String(index.headers['content-type']), /text\/html/);
    // The docs-scoped CSP admits the inline nav script + the Mermaid CDN that the
    // strict repo CSP (script-src 'self') would block; repo views are unaffected.
    match(String(index.headers['content-security-policy']), /cdn\.jsdelivr\.net/);
    match(String(index.headers['content-security-policy']), /'unsafe-inline'/);

    // A real sub-page resolves (explicit .html under a nested dir).
    const sub = await httpReq(port, '/docs/reference/serve.html');
    equal(sub.status, 200);

    // A static asset streams with the right MIME.
    const css = await httpReq(port, '/docs/style.css');
    equal(css.status, 200);
    match(String(css.headers['content-type']), /text\/css/);

    // Traversal out of the docs tree is contained — never serves plugin sources.
    const trav = await httpReq(port, '/docs/%2e%2e/%2e%2e/package.json');
    ok(trav.status === 403 || trav.status === 404, `contained, not served (got ${trav.status})`);
  } finally {
    await closeServer(server);
  }
});

test('hub landing: header links to the plugin docs site (populated + empty registry)', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const entries = [entryStub({ id: 'r', repo: 'web', lastRenderedAt: '2026-06-09T11:00:00.000Z', slugMeta: [
    { slug: 's', currentStage: 'implement', status: 'active', blocked: false, classification: 'active' },
  ] })];
  match(renderHubLanding(entries, { now }), /class="docs-link" href="\/docs\/"/, 'docs link present when repos exist');
  // Empty registry — the docs link is exactly what a brand-new user needs.
  match(renderHubLanding([], { now }), /class="docs-link" href="\/docs\/"/, 'docs link present in the empty state too');
});

test('resolveRequestPath: indexFile option resolves a lowercase directory index', () => {
  // The default INDEX.html behaviour is exercised by every /r/<id>/ serving test
  // above; here we pin the new option. (We avoid asserting the default against a
  // lowercase fixture because a case-insensitive FS would canonicalise it.)
  const root = tmp('sdlc-indexfile-');
  mkdirSync(join(root, 'sub'), { recursive: true });
  writeFileSync(join(root, 'index.html'), 'ROOT');
  writeFileSync(join(root, 'sub', 'index.html'), 'SUB');

  // indexFile:index.html makes `/` and any directory resolve to index.html — on
  // a case-sensitive FS (CI/Linux) this is the ONLY way the docs root resolves.
  // (Dot-segment containment is delegated to URL normalisation + the realpath
  // symlink check; it's exercised end-to-end by the /docs/ and /r/<id>/ tests.)
  const r1 = resolveRequestPath(root, '/', { indexFile: 'index.html' });
  ok(r1.ok && r1.path.toLowerCase().endsWith('index.html'), 'root → index.html');
  const r2 = resolveRequestPath(root, '/sub/', { indexFile: 'index.html' });
  ok(r2.ok && r2.path.toLowerCase().endsWith(join('sub', 'index.html').toLowerCase()), 'directory → index.html');
  // The resolved path never escapes the root.
  ok(r2.path.startsWith(root), 'resolved index stays inside the served root');
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

/* ───────────────────────── Slice 4: branch liveness (§4.3/D2) ───────────────────────── */

test('branch-liveness: classifies live / merged / gone / unknown, never throws (§4.3)', () => {
  const root = tmp('sdlc-liveness-');
  const repo = join(root, 'repo');
  initRepo(repo, 'main');   // main has one commit

  // live: a branch with its own commit, not merged into main.
  gitQuiet(repo, ['checkout', '-b', 'feat/live']);
  writeFileSync(join(repo, 'a.txt'), 'a'); gitQuiet(repo, ['add', '.']); gitQuiet(repo, ['commit', '-m', 'wip']);
  gitQuiet(repo, ['checkout', 'main']);
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/live', baseBranch: 'main' }), 'live');

  // merged: a branch whose tip is an ancestor of main (points at main's commit).
  gitQuiet(repo, ['branch', 'feat/merged', 'main']);
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/merged', baseBranch: 'main' }), 'merged');

  // gone: a branch ref that does not exist locally.
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/ghost', baseBranch: 'main' }), 'gone');

  // planned: the SAME missing ref reads as planned while the workflow is still
  // at a pre-branch stage (implement cuts the dedicated branch later); at or
  // after implement — or with an unrecognized stage — it stays gone.
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/ghost', baseBranch: 'main', currentStage: 'slice' }), 'planned');
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/ghost', baseBranch: 'main', currentStage: 'routing' }), 'planned');
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/ghost', baseBranch: 'main', currentStage: 'implement' }), 'gone');
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/ghost', baseBranch: 'main', currentStage: 'bogus-stage' }), 'gone');
  // A pre-branch stage never masks a branch that actually exists.
  equal(computeBranchState({ repoRoot: repo, branch: 'feat/live', baseBranch: 'main', currentStage: 'slice' }), 'live');

  // unknown: no branch (branch-strategy:none), a non-git dir, and empty args.
  equal(computeBranchState({ repoRoot: repo, branch: null, baseBranch: 'main' }), 'unknown');
  equal(computeBranchState({ repoRoot: join(root, 'not-a-repo'), branch: 'x' }), 'unknown');
  equal(computeBranchState({}), 'unknown', 'no args → unknown, never throws');
});

test('branch-liveness: refreshEntriesLiveness stamps branchState across entries, never throws', () => {
  const root = tmp('sdlc-liveness-refresh-');
  const repo = join(root, 'repo');
  initRepo(repo, 'main');
  gitQuiet(repo, ['branch', 'feat/merged', 'main']);
  const entries = [{
    id: 'x', repoRoot: repo, headBranch: 'main', viewDir: join(repo, '.ai', '_view'),
    slugMeta: [
      { slug: 's1', branch: 'feat/merged', baseBranch: 'main', prNumber: null },
      { slug: 's2', branch: 'feat/ghost', baseBranch: 'main', prNumber: null },
      { slug: 's3', branch: null, baseBranch: 'main', prNumber: null },
      { slug: 's4', branch: 'feat/ghost', baseBranch: 'main', prNumber: null, currentStage: 'plan' },
    ],
  }];
  refreshEntriesLiveness(entries);
  equal(entries[0].slugMeta[0].branchState, 'merged');
  equal(entries[0].slugMeta[1].branchState, 'gone');
  equal(entries[0].slugMeta[2].branchState, 'unknown');
  equal(entries[0].slugMeta[3].branchState, 'planned', 'pre-branch stage + missing ref → planned on refresh');
  // Garbage input never throws.
  refreshEntriesLiveness(null);
  refreshEntriesLiveness([{ no: 'slugMeta' }]);
});

test('inbox: surfaces merged / branch-gone active slugs as a 4th attention reason (§4.4)', () => {
  const now = Date.parse('2026-06-08T12:00:00.000Z');
  const fresh = '2026-06-08T11:00:00.000Z';
  const entries = [entryStub({ id: 'a', repo: 'web', lastRenderedAt: fresh, slugMeta: [
    { slug: 'merged-feat', currentStage: 'ship', status: 'active', blocked: false, classification: 'active', branch: 'feat/x', branchState: 'merged' },
    { slug: 'gone-feat', currentStage: 'implement', status: 'active', blocked: false, classification: 'active', branch: 'feat/y', branchState: 'gone' },
    { slug: 'live-feat', currentStage: 'implement', status: 'active', blocked: false, classification: 'active', branch: 'feat/z', branchState: 'live' },
    { slug: 'planned-feat', currentStage: 'slice', status: 'active', blocked: false, classification: 'active', branch: 'feat/w', branchState: 'planned' },
  ] })];
  const items = inboxItems(entries, now);
  const bySlug = Object.fromEntries(items.map((i) => [i.sm.slug, i]));
  ok(bySlug['merged-feat']?.reasons.some((r) => r.key === 'merged'), 'merged slug surfaced with merged reason');
  ok(bySlug['gone-feat']?.reasons.some((r) => r.key === 'gone'), 'gone slug surfaced with gone reason');
  ok(!bySlug['live-feat'], 'a live, otherwise-healthy slug is NOT surfaced');
  ok(!bySlug['planned-feat'], 'a planned (not-yet-cut) branch is expected — NOT surfaced');
});

test('hub landing: renders soft merged / branch-gone badges on slug links (§4.3)', () => {
  const now = Date.parse('2026-06-08T12:00:00.000Z');
  const entries = [entryStub({ id: 'r', repo: 'web', headBranch: 'main', lastRenderedAt: '2026-06-08T11:00:00.000Z', slugMeta: [
    { slug: 'done-feat', currentStage: 'ship', status: 'active', blocked: false, classification: 'active', branch: 'feat/done', branchStrategy: 'dedicated', baseBranch: 'main', branchState: 'merged' },
    { slug: 'lost-feat', currentStage: 'implement', status: 'active', blocked: false, classification: 'active', branch: 'feat/lost', branchStrategy: 'dedicated', baseBranch: 'main', branchState: 'gone' },
    { slug: 'future-feat', currentStage: 'slice', status: 'active', blocked: false, classification: 'active', branch: 'feat/future', branchStrategy: 'dedicated', baseBranch: 'main', branchState: 'planned' },
  ] })];
  const html = renderHubLanding(entries, { now });
  match(html, /lq merged">merged/, 'merged badge rendered');
  match(html, /lq gone">branch gone/, 'branch-gone badge rendered');
  match(html, /lq planned">branch planned/, 'branch-planned badge rendered (soft, non-attention)');
});

/* ───────────────────────── cross-repo inbox (§11.3) ───────────────────────── */

function entryStub({ id, repo, headBranch = 'master', lastRenderedAt, slugMeta }) {
  return {
    id, repoRoot: `/work/${repo}`, headBranch, worktreeLabel: null,
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

/* ───────────── fresh-repo registration (FRESH-REPO-REGISTRATION-FIX-PLAN) ───────────── */

// The real plugin root — the E2E cold-start test spawns the actual renderer.
const PLUGIN_ROOT_REAL = fileURLToPath(new URL('../../../', import.meta.url));

// Point the shard-vs-POST switch in upsertRegistryEntry at an in-test hub so a
// registration travels the REAL wire path (liveHub → POST /__sdlc/registry/upsert).
function writeHubPid(port, token = 'tok') {
  writeFileSync(join(sdlcHomeDir(), 'hub.pid'), JSON.stringify({
    pid: process.pid, host: '127.0.0.1', port, token,
  }));
}

test('registry: F1/F13 — a repo with NO .ai tree registers; upsert creates the viewDir + seeds .ai/.gitignore', async () => {
  setHome();
  const repo = join(tmp('sdlc-fresh-'), 'repo');
  initRepo(repo);
  const viewDir = join(repo, '.ai', '_view');
  ok(!existsSync(join(repo, '.ai')), 'precondition: no .ai tree at all');

  const res = await upsertRegistryEntry({ projectRoot: repo, viewDir });
  equal(res.action, 'sharded', 'first-ever registration is accepted (no hub → shard)');
  ok(existsSync(viewDir), 'upsert created the view dir itself (B1 fixed)');
  equal(readRegistry().entries.length, 1, 'the fresh repo is readable from the registry');

  const gi = readFileSync(join(repo, '.ai', '.gitignore'), 'utf-8');
  match(gi, /^_view\/$/m, '.ai/.gitignore ignores the rendered view');
  match(gi, /^workflows\/\*\/\.locks\/$/m, '.ai/.gitignore ignores per-slug locks');

  // Idempotent: a second registration must not duplicate rules.
  await upsertRegistryEntry({ projectRoot: repo, viewDir });
  equal(readFileSync(join(repo, '.ai', '.gitignore'), 'utf-8'), gi,
    'second registration leaves .gitignore byte-identical');
});

test('registry: F13 — gitignore seeding preserves existing user lines and appends only what is missing', async () => {
  setHome();
  const repo = join(tmp('sdlc-fresh-gi-'), 'repo');
  initRepo(repo);
  mkdirSync(join(repo, '.ai'), { recursive: true });
  writeFileSync(join(repo, '.ai', '.gitignore'), 'custom.txt\n_view/\n');

  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const gi = readFileSync(join(repo, '.ai', '.gitignore'), 'utf-8');
  match(gi, /^custom\.txt$/m, 'user line preserved');
  match(gi, /^workflows\/\*\/\.locks\/$/m, 'missing rule appended');
  equal(gi.match(/_view\//g).length, 1, 'already-present rule not duplicated');
});

test('registry: F2/F3 — a fresh never-rendered entry survives prune within grace; past it, the arm is logged', async () => {
  setHome();
  const repo = join(tmp('sdlc-grace-'), 'repo');
  initRepo(repo);
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  mergeShardsIntoRegistry();

  let res = pruneRegistry();
  equal(res.pruned, 0, 'fresh registration survives the default grace window');
  equal(res.kept, 1);

  res = pruneRegistry({ graceMs: 0 });
  equal(res.pruned, 1, 'expired grace + no output + empty queue → pruned');
  const log = readFileSync(pruneLogPath(), 'utf-8');
  match(log, /past registration grace/, 'prune log names the no-output arm');
});

test('hub: F2 — accepting a never-rendered registration queues + drains a bootstrap render at once', async () => {
  setHome();
  const repo = join(tmp('sdlc-hub-boot-'), 'repo');
  initRepo(repo);
  const viewDir = join(repo, '.ai', '_view');

  // Stub renderer: emulate a successful render-sunflower pass (view + marker).
  const spawnRender = () => {
    const child = new EventEmitter();
    setTimeout(() => {
      try {
        mkdirSync(viewDir, { recursive: true });
        writeFileSync(join(viewDir, 'INDEX.html'), '<!DOCTYPE html><html><body>fresh</body></html>');
        writeFileSync(join(viewDir, '.last-render'), JSON.stringify({
          renderedAt: new Date().toISOString(), version: PLUGIN_VERSION,
        }));
      } catch { /* the marker assertion below surfaces it */ }
      child.emit('exit', 0);
    }, 20);
    return child;
  };

  const server = createHubServer({
    token: 'tok', liveReload: false, reconcileMs: 50,
    pluginRoot: PLUGIN_ROOT_REAL, spawnRender,
  });
  const port = await listen(server);
  try {
    writeHubPid(port);
    const res = await upsertRegistryEntry({ projectRoot: repo, viewDir });
    equal(res.action, 'posted-to-hub', 'fresh repo registration accepted over the wire');

    let tries = 0;
    while (!existsSync(join(viewDir, '.last-render')) && tries++ < 100) await wait(30);
    ok(existsSync(join(viewDir, '.last-render')), 'bootstrap render produced .last-render');

    await wait(200);   // ≥3 reconcile ticks — the rendered entry must survive them
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 1, 'entry survives reconcile after its first render');
  } finally {
    await closeServer(server);
  }
});

test('hub: F2 — reconcile keeps a never-rendered entry with NO queue work inside the grace window', async () => {
  setHome();
  const repo = join(tmp('sdlc-hub-grace-'), 'repo');
  initRepo(repo);
  const viewDir = join(repo, '.ai', '_view');

  // A renderer that never settles: the bootstrap job is claimed away (pending
  // count 0) and no .last-render ever lands — survival is grace ALONE.
  const spawnRender = () => new EventEmitter();

  const server = createHubServer({
    token: 'tok', liveReload: false, reconcileMs: 40,
    pluginRoot: PLUGIN_ROOT_REAL, spawnRender,
  });
  const port = await listen(server);
  try {
    writeHubPid(port);
    const res = await upsertRegistryEntry({ projectRoot: repo, viewDir });
    equal(res.action, 'posted-to-hub');
    await wait(250);   // ≥5 reconcile ticks
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 1, 'grace window carried the un-rendered entry through reconcile');
  } finally {
    await closeServer(server);
  }
});

test('hub: F2/F3 — a fresh entry whose bootstrap render keeps failing is pruned past grace, with a prune-log line', async () => {
  setHome();
  const repo = join(tmp('sdlc-hub-fail-'), 'repo');
  initRepo(repo);
  const viewDir = join(repo, '.ai', '_view');

  const spawnRender = () => {
    const child = new EventEmitter();
    setTimeout(() => child.emit('exit', 1), 10);
    return child;
  };

  const server = createHubServer({
    token: 'tok', liveReload: false, reconcileMs: 40, registrationGraceMs: 1,
    pluginRoot: PLUGIN_ROOT_REAL, spawnRender,
  });
  const port = await listen(server);
  try {
    writeHubPid(port);
    const res = await upsertRegistryEntry({ projectRoot: repo, viewDir });
    equal(res.action, 'posted-to-hub');

    // 3 failed attempts move the job to .failed/ (no pending work left); the
    // next reconcile tick prunes since the 1 ms grace is long expired.
    let tries = 0;
    while (tries++ < 150) {
      const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
      if (dump.entries.length === 0) break;
      await wait(40);
    }
    const dump = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(dump.entries.length, 0, 'given-up entry pruned once grace expired');
    const log = readFileSync(pruneLogPath(), 'utf-8');
    match(log, /reconcile-prune .*past registration grace/, 'reconcile prune reached registry.prune.log');
  } finally {
    await closeServer(server);
  }
});

test('e2e: cold start — fresh repo + one workflow: registers, REALLY renders, survives, and serves (acceptance)', async () => {
  setHome();
  const repo = join(tmp('sdlc-e2e-cold-'), 'repo');
  initRepo(repo);
  // A real workflow artifact but NO .ai/_view — the exact state every fresh
  // repo starts in (the hello-test forensics scenario).
  const wf = join(repo, '.ai', 'workflows', 'demo');
  mkdirSync(wf, { recursive: true });
  writeFileSync(join(wf, '00-index.md'),
    '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: implement\n---\nbody\n');
  const viewDir = join(repo, '.ai', '_view');
  ok(!existsSync(viewDir), 'precondition: never rendered, no view dir');

  // Default spawnRender — this spawns the REAL renderer (dist/render-sunflower).
  const server = createHubServer({
    token: 'tok', liveReload: false, reconcileMs: 200, pluginRoot: PLUGIN_ROOT_REAL,
  });
  const port = await listen(server);
  try {
    writeHubPid(port);
    const res = await upsertRegistryEntry({ projectRoot: repo, viewDir });
    equal(res.action, 'posted-to-hub', 'cold-start registration accepted');

    let tries = 0;
    while (!existsSync(join(viewDir, '.last-render')) && tries++ < 200) await wait(150);
    ok(existsSync(join(viewDir, '.last-render')), 'first render landed — a cold start self-heals');
    ok(existsSync(join(viewDir, 'INDEX.html')), 'view INDEX.html rendered');

    const reg = JSON.parse(readFileSync(registryPath(), 'utf-8'));
    equal(reg.entries.length, 1, 'registry.json holds the fresh repo');
    const page = await httpReq(port, `/r/${encodeURIComponent(reg.entries[0].id)}/`);
    equal(page.status, 200, 'hub serves the fresh repo view');
  } finally {
    await closeServer(server);
  }
});
