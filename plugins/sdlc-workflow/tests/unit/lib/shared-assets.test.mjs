// W11.11 — share the assets, bound the logs (WIDE-VIEW-REPAIR-PLAN §14.2.11).
//
// (1) hubAssetBase names the hub route /__sdlc/assets/<buildId>
// (2) a render writes no _assets copy; every page references the hub route
// (3) the hub serves the bundle at that route (immutable cache, basenames only)
// (4) LIVE: a rendered view served by the hub loads with 0 failed asset requests
// (5) a clean render drops a pre-9.154 _assets copy
// (6) logPrune rotates registry.prune.log at 1 MB
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { HUB_ASSET_ROUTE, hubAssetBase } from '../../../renderers/_paths.mjs';
import { createHubServer } from '../../../scripts/hub-serve.mjs';
import { logPrune, pruneLogPath, readRegistry, upsertRegistryEntry } from '../../../lib/registry.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'runtime-manifest.json'), 'utf-8'));
const RENDER = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');
const tmp = (p) => mkdtempSync(join(tmpdir(), p));

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}
const close = (server) => new Promise((r) => server.close(() => r()));
function httpReq(port, path) {
  return new Promise((resolveP, reject) => {
    const r = httpRequest({ hostname: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolveP({ status: res.statusCode, headers: res.headers, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

// A git repo holding the sunflower fixture slugs, rendered by the real renderer.
function renderedFixtureRepo(env, extraArgs = []) {
  const fix = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'tests', 'sunflower-fixtures.json'), 'utf-8'));
  const repo = tmp('sdlc-shared-assets-repo-');
  execFileSync('git', ['init', '-b', 'master', repo], { stdio: ['ignore', 'ignore', 'ignore'] });
  const storageRoot = join(repo, '.ai', 'workflows');
  for (const [slug, slugData] of Object.entries(fix.slugs)) {
    mkdirSync(join(storageRoot, slug), { recursive: true });
    for (const [fname, file] of Object.entries(slugData.files)) {
      writeFileSync(join(storageRoot, slug, fname), `---\n${yaml.dump(file.frontmatter, { lineWidth: 100 })}---\n${file.body}`, 'utf-8');
    }
  }
  const slug = Object.keys(fix.slugs)[0];
  const child = spawnSync(process.execPath, [RENDER, '--plugin-root', PLUGIN_ROOT, ...extraArgs], { cwd: repo, encoding: 'utf-8', env, windowsHide: true });
  equal(child.status, 0, `renderer exited ${child.status}: ${child.stderr}`);
  return { repo, viewDir: join(repo, '.ai', '_view'), slug };
}

test('hubAssetBase names the hub route', () => {
  equal(HUB_ASSET_ROUTE, '/__sdlc/assets');
  equal(hubAssetBase('abc123'), '/__sdlc/assets/abc123');
  equal(hubAssetBase(''), '/__sdlc/assets/dev');
});

test('a render writes no _assets copy and every page references the hub route', () => {
  const home = tmp('sdlc-shared-assets-home-');
  const env = { ...process.env, SDLC_HOME: home, SDLC_DISABLE_HUB_ENSURE: '1' };
  const { repo, viewDir, slug } = renderedFixtureRepo(env);
  try {
    equal(existsSync(join(viewDir, '_assets')), false, 'no _assets copy in the view');
    const base = hubAssetBase(MANIFEST.buildId);
    for (const page of [join(viewDir, 'INDEX.html'), join(viewDir, slug, 'INDEX.html')]) {
      const html = readFileSync(page, 'utf-8');
      ok(html.includes(`href="${base}/sdlc.css`), `${page} references ${base}/sdlc.css`);
      equal(/href="(\.\.\/)*_assets\//.test(html), false, `${page} carries no relative _assets href`);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('the hub serves the bundle at /__sdlc/assets/<buildId>/<name>, basenames only', async () => {
  const home = tmp('sdlc-shared-assets-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const server = createHubServer({ liveReload: false });
  const port = await listen(server);
  try {
    const css = await httpReq(port, `/__sdlc/assets/${MANIFEST.buildId}/sdlc.css`);
    equal(css.status, 200);
    match(css.headers['content-type'], /text\/css/);
    match(css.headers['cache-control'], /immutable/);
    equal(css.body, readFileSync(join(PLUGIN_ROOT, 'assets', 'sdlc.css'), 'utf-8'));
    equal((await httpReq(port, '/__sdlc/assets/any-segment/livereload.js')).status, 200, 'the segment is a cache key only');
    equal((await httpReq(port, '/__sdlc/assets/x/nope.css')).status, 404);
    equal((await httpReq(port, '/__sdlc/assets/x/..%2Fpackage.json')).status, 404, 'no traversal');
    equal((await httpReq(port, '/__sdlc/assets/x/')).status, 404);
  } finally {
    await close(server);
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('live: a rendered view served by the hub loads with 0 failed asset requests', async () => {
  const home = tmp('sdlc-shared-assets-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const env = { ...process.env, SDLC_HOME: home, SDLC_DISABLE_HUB_ENSURE: '1' };
  const { repo, viewDir, slug } = renderedFixtureRepo(env);
  let server = null;
  try {
    await upsertRegistryEntry({ projectRoot: repo, viewDir });
    const entry = readRegistry().entries[0];
    ok(entry, 'fixture registered');
    server = createHubServer({ liveReload: true, reconcileMs: 3_600_000 });
    const port = await listen(server);
    const failed = [];
    let checked = 0;
    for (const path of [`/r/${entry.id}/INDEX.html`, `/r/${entry.id}/${slug}/INDEX.html`]) {
      const page = await httpReq(port, path);
      equal(page.status, 200, path);
      const refs = [...page.body.matchAll(/(?:href|src)="([^"]+\.(?:css|js|svg|ico|png)(?:\?[^"]*)?)"/g)].map((m) => m[1]);
      ok(refs.length > 0, `${path} references assets`);
      for (const ref of refs) {
        const target = ref.startsWith('/') ? ref : `${dirname(path)}/${ref}`;
        const r = await httpReq(port, target);
        checked++;
        if (r.status !== 200) failed.push(`${target} → ${r.status}`);
      }
    }
    ok(checked >= 4, `checked ${checked} asset requests`);
    equal(failed.length, 0, `failed asset requests: ${failed.join(', ')}`);
  } finally {
    if (server) await close(server);
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('a clean render drops a pre-9.154 _assets copy', () => {
  const home = tmp('sdlc-shared-assets-home-');
  const env = { ...process.env, SDLC_HOME: home, SDLC_DISABLE_HUB_ENSURE: '1' };
  const { repo, viewDir } = renderedFixtureRepo(env);
  try {
    mkdirSync(join(viewDir, '_assets'), { recursive: true });
    writeFileSync(join(viewDir, '_assets', 'sdlc.css'), 'body{}', 'utf-8');
    const child = spawnSync(process.execPath, [RENDER, '--plugin-root', PLUGIN_ROOT, '--clean'], { cwd: repo, encoding: 'utf-8', env, windowsHide: true });
    equal(child.status, 0, child.stderr);
    equal(existsSync(join(viewDir, '_assets')), false, 'the copy is gone after --clean');
    ok(existsSync(join(viewDir, 'INDEX.html')));
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('logPrune rotates registry.prune.log at 1 MB, keeping two generations', () => {
  const home = tmp('sdlc-shared-assets-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    const path = pruneLogPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'x'.repeat(1024 * 1024 + 1), 'utf-8');
    logPrune('after rotation');
    ok(existsSync(`${path}.1`), 'the full file became .1');
    ok(statSync(path).size < 1024, 'the live file restarted');
    match(readFileSync(path, 'utf-8'), /after rotation/);
  } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});
