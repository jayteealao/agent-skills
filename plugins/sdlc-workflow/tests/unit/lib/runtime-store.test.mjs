// tests/unit/lib/runtime-store.test.mjs
//
// The machine-wide immutable runtime store — NATIVE-INTEROP Workstream C. Covers
// materialization (atomic + idempotent), verification, the active-runtime record,
// the plan's resolution order (PID runtimeRoot → active-runtime.json → null), and
// the GC safeguards. SDLC_HOME sandboxes ~/.sdlc so every test is hermetic.

import { test } from 'node:test';
import { equal, ok, deepEqual } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  materializeRuntime, refreshStoredManifest, verifyRuntimeStore, writeActiveRuntime, readActiveRuntime,
  resolveActiveRuntimeRoot, resolveActiveRuntimeRootSync, gcRuntimes,
  runtimeRootFor, runtimeStoreDir,
} from '../../../lib/runtime-store.mjs';
import { hubPidPath } from '../../../lib/registry.mjs';

function withHome(fn) {
  const home = mkdtempSync(join(tmpdir(), 'sdlc-home-'));
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  return Promise.resolve(fn(home)).finally(() => {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  });
}

// A minimal "plugin root" carrying just enough payload to satisfy the store's
// REQUIRED set (runtime-manifest.json, dist/, schemas/).
function fakePluginRoot({ buildId, runtimeVersion = '9.75.0' }) {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-plugin-'));
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist', 'hub-serve.mjs'), '// fake hub entrypoint');
  mkdirSync(join(dir, 'schemas'), { recursive: true });
  writeFileSync(join(dir, 'schemas', 'frontmatter.json'), '{}');
  writeFileSync(join(dir, 'runtime-manifest.json'), JSON.stringify({
    family: 'sdlc-workflow', hubName: 'sdlc-workflow-hub', runtimeVersion,
    hubProtocolVersion: 1, artifactSchema: 'sdlc/v1', registryVersion: 2,
    hubConfigVersion: 1, buildId,
  }));
  return dir;
}

/* ───────────────────────── materialization ───────────────────────── */

test('runtime-store: materializeRuntime copies the payload and is idempotent', async () => {
  await withHome(async () => {
    const plugin = fakePluginRoot({ buildId: 'build-aaa' });
    try {
      const m = { buildId: 'build-aaa', runtimeVersion: '9.75.0' };
      const first = await materializeRuntime(plugin, { manifest: m });
      equal(first.buildId, 'build-aaa');
      equal(first.runtimeRoot, runtimeRootFor('build-aaa'));
      equal(first.materialized, true, 'first call materializes');
      ok(existsSync(join(first.runtimeRoot, 'dist', 'hub-serve.mjs')), 'dist copied into the store');
      ok(existsSync(join(first.runtimeRoot, 'runtime-manifest.json')), 'manifest copied');

      const second = await materializeRuntime(plugin, { manifest: m });
      equal(second.materialized, false, 'an already-materialized build is reused, not recopied');
      equal(second.runtimeRoot, first.runtimeRoot);
    } finally {
      rmSync(plugin, { recursive: true, force: true });
    }
  });
});

test('runtime-store: a same-buildId version bump refreshes the stored manifest (no reap loop)', async () => {
  // A prose-only release keeps the buildId, so the store dir already exists and
  // its manifest names the OLD runtimeVersion — the hub then reports the old
  // version and the new supervisor reaps it at every session start (9.154.0 →
  // 9.154.1, 271 restarts). Reuse must carry the newer runtimeVersion into the
  // stored manifest; the payload is identical by construction.
  await withHome(async () => {
    const older = fakePluginRoot({ buildId: 'build-same', runtimeVersion: '9.154.0' });
    const newer = fakePluginRoot({ buildId: 'build-same', runtimeVersion: '9.154.1' });
    try {
      const first = await materializeRuntime(older, { manifest: { buildId: 'build-same', runtimeVersion: '9.154.0' } });
      equal(first.materialized, true);
      const manifestPath = join(first.runtimeRoot, 'runtime-manifest.json');
      equal(JSON.parse(readFileSync(manifestPath, 'utf-8')).runtimeVersion, '9.154.0');

      const second = await materializeRuntime(newer, { manifest: { buildId: 'build-same', runtimeVersion: '9.154.1', rendererBuildId: 'r-2' } });
      equal(second.materialized, false, 'same buildId → the payload is reused, not recopied');
      equal(second.runtimeRoot, first.runtimeRoot);
      const stored = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      equal(stored.runtimeVersion, '9.154.1', 'the stored manifest now names the newer runtimeVersion');
      equal(stored.buildId, 'build-same', 'buildId unchanged');
      equal(stored.rendererBuildId, 'r-2', 'the other bundled manifest fields ride along');
      ok(await verifyRuntimeStore(first.runtimeRoot, 'build-same'), 'the store still verifies');
    } finally {
      rmSync(older, { recursive: true, force: true });
      rmSync(newer, { recursive: true, force: true });
    }
  });
});

test('runtime-store: refreshStoredManifest never downgrades and never crosses buildIds', async () => {
  await withHome(async () => {
    const plugin = fakePluginRoot({ buildId: 'build-keep', runtimeVersion: '9.154.1' });
    try {
      const { runtimeRoot } = await materializeRuntime(plugin, { manifest: { buildId: 'build-keep', runtimeVersion: '9.154.1' } });
      const manifestPath = join(runtimeRoot, 'runtime-manifest.json');
      // An older host sharing the buildId must not write its version back (ping-pong guard).
      equal(await refreshStoredManifest(runtimeRoot, { buildId: 'build-keep', runtimeVersion: '9.154.0' }), false);
      equal(JSON.parse(readFileSync(manifestPath, 'utf-8')).runtimeVersion, '9.154.1');
      // Same version: nothing to do.
      equal(await refreshStoredManifest(runtimeRoot, { buildId: 'build-keep', runtimeVersion: '9.154.1' }), false);
      // A different buildId is a different store dir; refuse to relabel this one.
      equal(await refreshStoredManifest(runtimeRoot, { buildId: 'build-other', runtimeVersion: '9.155.0' }), false);
      equal(JSON.parse(readFileSync(manifestPath, 'utf-8')).runtimeVersion, '9.154.1');
      // A missing manifest is a false, not a throw.
      equal(await refreshStoredManifest(join(runtimeRoot, 'nope'), { buildId: 'build-keep', runtimeVersion: '9.155.0' }), false);
    } finally {
      rmSync(plugin, { recursive: true, force: true });
    }
  });
});

test('runtime-store: no buildId (pre-build) → runs from the plugin root, no store', async () => {
  await withHome(async () => {
    const plugin = fakePluginRoot({ buildId: null });
    try {
      const r = await materializeRuntime(plugin, { manifest: { buildId: null, runtimeVersion: '9.75.0' } });
      equal(r.buildId, null);
      equal(r.runtimeRoot, plugin, 'falls back to the bundled plugin root');
      equal(r.materialized, false);
      equal(existsSync(runtimeStoreDir()), false, 'nothing materialized');
    } finally {
      rmSync(plugin, { recursive: true, force: true });
    }
  });
});

test('runtime-store: verifyRuntimeStore enforces required files + buildId match', async () => {
  await withHome(async () => {
    const plugin = fakePluginRoot({ buildId: 'build-bbb' });
    try {
      const { runtimeRoot } = await materializeRuntime(plugin, { manifest: { buildId: 'build-bbb', runtimeVersion: '9.75.0' } });
      equal(await verifyRuntimeStore(runtimeRoot, 'build-bbb'), true, 'good store verifies');
      equal(await verifyRuntimeStore(runtimeRoot, 'wrong-build'), false, 'buildId mismatch fails');
      rmSync(join(runtimeRoot, 'dist'), { recursive: true, force: true });
      equal(await verifyRuntimeStore(runtimeRoot, 'build-bbb'), false, 'missing required dir fails');
    } finally {
      rmSync(plugin, { recursive: true, force: true });
    }
  });
});

/* ───────────────────────── active runtime ───────────────────────── */

test('runtime-store: active-runtime.json round-trips', async () => {
  await withHome(async () => {
    equal(await readActiveRuntime(), null, 'absent → null');
    await writeActiveRuntime({ buildId: 'b1', runtimeRoot: '/x/y', runtimeVersion: '9.75.0' });
    const a = await readActiveRuntime();
    equal(a.buildId, 'b1');
    equal(a.runtimeRoot, '/x/y');
    equal(a.runtimeVersion, '9.75.0');
    ok(a.updatedAt, 'stamped a timestamp');
  });
});

test('runtime-store: resolve order = PID runtimeRoot → active-runtime.json → null', async () => {
  await withHome(async () => {
    const plugin = fakePluginRoot({ buildId: 'build-ccc' });
    try {
      const { runtimeRoot } = await materializeRuntime(plugin, { manifest: { buildId: 'build-ccc', runtimeVersion: '9.75.0' } });

      // Nothing recorded yet.
      equal(await resolveActiveRuntimeRoot(), null, 'no pid + no active → null');
      equal(resolveActiveRuntimeRootSync(), null, 'sync: no pid + no active → null');

      // active-runtime.json points at the verified store.
      await writeActiveRuntime({ buildId: 'build-ccc', runtimeRoot, runtimeVersion: '9.75.0' });
      equal(await resolveActiveRuntimeRoot(), runtimeRoot, 'falls back to active-runtime.json');
      equal(resolveActiveRuntimeRootSync(), runtimeRoot, 'sync: active-runtime.json');

      // A live PID record's runtimeRoot takes precedence.
      const other = fakePluginRoot({ buildId: 'build-ddd' });
      const { runtimeRoot: otherRoot } = await materializeRuntime(other, { manifest: { buildId: 'build-ddd', runtimeVersion: '9.75.0' } });
      writeFileSync(hubPidPath(), JSON.stringify({ pid: process.pid, runtimeRoot: otherRoot }));
      equal(await resolveActiveRuntimeRoot(), otherRoot, 'PID runtimeRoot wins over active-runtime.json');
      equal(resolveActiveRuntimeRootSync(), otherRoot, 'sync: PID runtimeRoot wins');
      rmSync(other, { recursive: true, force: true });
    } finally {
      rmSync(plugin, { recursive: true, force: true });
    }
  });
});

/* ───────────────────────── GC safeguards ───────────────────────── */

test('runtime-store: gcRuntimes removes unprotected builds but spares protected ones', async () => {
  await withHome(async () => {
    const mk = async (buildId, version) => {
      const p = fakePluginRoot({ buildId, runtimeVersion: version });
      await materializeRuntime(p, { manifest: { buildId, runtimeVersion: version } });
      rmSync(p, { recursive: true, force: true });
    };
    await mk('keep-active', '9.75.0');
    await mk('keep-listed', '9.74.0');
    await mk('keep-sameversion', '9.75.0');   // shares the active's runtimeVersion
    await mk('drop-old', '9.70.0');
    // An in-flight temp materialization must be skipped (never reaped).
    mkdirSync(join(runtimeStoreDir(), '.build-tmp.123.tmp'), { recursive: true });

    await writeActiveRuntime({ buildId: 'keep-active', runtimeRoot: runtimeRootFor('keep-active'), runtimeVersion: '9.75.0' });

    const { removed } = gcRuntimes({ keepBuildIds: ['keep-listed'] });
    deepEqual(removed.sort(), ['drop-old'], 'only the unprotected, different-version build is removed');
    ok(existsSync(runtimeRootFor('keep-active')), 'active build kept');
    ok(existsSync(runtimeRootFor('keep-listed')), 'explicitly-listed build kept');
    ok(existsSync(runtimeRootFor('keep-sameversion')), 'same-runtimeVersion build kept');
    ok(existsSync(join(runtimeStoreDir(), '.build-tmp.123.tmp')), 'in-flight temp dir untouched');
  });
});

/* ───────────────────────── W11.5: GC on every start keeps active + previous + bundled ───────────────────────── */

test('runtime-store: writeActiveRuntime tracks the build it replaced (previousBuildId)', async () => {
  await withHome(async () => {
    await writeActiveRuntime({ buildId: 'b1', runtimeRoot: runtimeRootFor('b1'), runtimeVersion: '1.0.0' });
    equal((await readActiveRuntime()).previousBuildId, null, 'the first record replaced nothing');
    await writeActiveRuntime({ buildId: 'b2', runtimeRoot: runtimeRootFor('b2'), runtimeVersion: '1.0.1' });
    equal((await readActiveRuntime()).previousBuildId, 'b1');
    await writeActiveRuntime({ buildId: 'b2', runtimeRoot: runtimeRootFor('b2'), runtimeVersion: '1.0.1' });
    equal((await readActiveRuntime()).previousBuildId, 'b1', 'a same-build rewrite keeps the previous');
    await writeActiveRuntime({ buildId: 'b3', runtimeRoot: runtimeRootFor('b3'), runtimeVersion: '1.0.2' });
    equal((await readActiveRuntime()).previousBuildId, 'b2');
  });
});

test('runtime-store: gcRuntimes leaves 3 of 6 — active, previous, bundled (WIDE-VIEW §14.2.5 gate)', async () => {
  await withHome(async () => {
    const { readRuntimeManifest } = await import('../../../lib/runtime-manifest.mjs');
    const bundled = readRuntimeManifest().buildId;
    const mk = async (buildId, version) => {
      const p = fakePluginRoot({ buildId, runtimeVersion: version });
      await materializeRuntime(p, { manifest: { buildId, runtimeVersion: version } });
      rmSync(p, { recursive: true, force: true });
    };
    // Six builds on six versions: none shares a protected runtimeVersion, so only
    // the three named protections decide.
    await mk('gc-active', '1.0.5');
    await mk('gc-previous', '1.0.4');
    await mk(bundled, '1.0.9');
    await mk('gc-old-a', '1.0.1');
    await mk('gc-old-b', '1.0.2');
    await mk('gc-old-c', '1.0.3');
    await writeActiveRuntime({ buildId: 'gc-previous', runtimeRoot: runtimeRootFor('gc-previous'), runtimeVersion: '1.0.4' });
    await writeActiveRuntime({ buildId: 'gc-active', runtimeRoot: runtimeRootFor('gc-active'), runtimeVersion: '1.0.5' });

    const { removed } = gcRuntimes({ keepBuildIds: [bundled] });
    deepEqual(removed.sort(), ['gc-old-a', 'gc-old-b', 'gc-old-c']);
    const left = readdirSync(runtimeStoreDir()).filter((n) => !n.startsWith('.')).sort();
    deepEqual(left, [bundled, 'gc-active', 'gc-previous'].sort(), '3 directories remain from a fixture of 6');
  });
});
