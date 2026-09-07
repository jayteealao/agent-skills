// W11.10 item 1 — bounded start-up catch-up (WIDE-VIEW-REPAIR-PLAN §14.2.10).
//
// On hub start a view renders only when it fails the version gate or carries
// queued work. A fixture of 3 fresh repos renders 0; 1 stale + 1 queued repo
// render exactly once each, before the first reconcile tick; one hub.log line
// reports the counts.
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHubServer } from '../../../scripts/hub-serve.mjs';
import { readRegistry, upsertRegistryEntry } from '../../../lib/registry.mjs';
import { enqueue } from '../../../lib/render-queue.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'runtime-manifest.json'), 'utf-8'));
const tmp = (p) => mkdtempSync(join(tmpdir(), p));

function findFile(dir, name) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (n === name) return p;
    if (statSync(p).isDirectory()) { const hit = findFile(p, name); if (hit) return hit; }
  }
  return null;
}

// A registered repo with a rendered view; `identity` is what .last-render records.
async function mkRepo(identity) {
  const repo = tmp('sdlc-catchup-repo-');
  execFileSync('git', ['init', '-b', 'master', repo], { stdio: ['ignore', 'ignore', 'ignore'] });
  const viewDir = join(repo, '.ai', '_view');
  mkdirSync(viewDir, { recursive: true });
  writeFileSync(join(viewDir, '.last-render'), JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'cfg0', ...identity }));
  writeFileSync(join(viewDir, 'INDEX.html'), '<!doctype html><title>x</title>', 'utf-8');
  await upsertRegistryEntry({ projectRoot: repo, viewDir });
  return { repo, viewDir };
}

test('hub start renders only the stale view and the queued view; fresh views are skipped', async () => {
  const home = tmp('sdlc-catchup-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const repos = [];
  let server = null;
  try {
    const fresh = { version: MANIFEST.runtimeVersion, buildId: MANIFEST.buildId, rendererBuildId: MANIFEST.rendererBuildId };
    for (let i = 0; i < 3; i++) repos.push(await mkRepo(fresh));
    const stale = await mkRepo({ version: '0.0.1' });
    repos.push(stale);
    const queued = await mkRepo(fresh);
    repos.push(queued);
    enqueue(queued.viewDir, { repoRoot: queued.repo, kind: 'bootstrap', bucket: '__bootstrap__' });
    equal(readRegistry().entries.length, 5, 'fixture registered');

    const calls = [];
    server = createHubServer({
      liveReload: false,
      reconcileMs: 3_600_000,          // no tick inside the test: the start alone decides
      staleRender: { heal: true, maxConcurrent: 2 },   // both renders spawn now; the engine default runs one at a time
      spawnRender: (script, args, opts) => { calls.push({ script, args, opts }); return new EventEmitter(); },
    });

    equal(calls.length, 2, `renders at start: ${JSON.stringify(calls.map((c) => c.opts.cwd))}`);
    const staleCall = calls.find((c) => c.opts.cwd === stale.repo);
    ok(staleCall, 'the stale view re-renders at start');
    ok(staleCall.args.includes('--clean'), 'a version-gate render is a clean render');
    ok(calls.find((c) => c.opts.cwd === queued.repo), 'the queued view drains at start');
    for (const r of repos.slice(0, 3)) equal(calls.some((c) => c.opts.cwd === r.repo), false, 'a fresh view is skipped');

    const hubLog = findFile(home, 'hub.log');
    ok(hubLog, 'hub.log exists');
    match(readFileSync(hubLog, 'utf-8'), /catch-up: 5 registered, 1 stale re-rendered, 1 queues drained, 3 fresh skipped/);
  } finally {
    if (server) await new Promise((r) => server.close(() => r()));
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
    for (const r of repos) rmSync(r.repo, { recursive: true, force: true });
  }
});
