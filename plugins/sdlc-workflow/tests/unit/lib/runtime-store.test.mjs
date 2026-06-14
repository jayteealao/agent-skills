// tests/unit/lib/runtime-store.test.mjs
//
// The machine-wide immutable runtime store — NATIVE-INTEROP Workstream C. Covers
// materialization (atomic + idempotent), verification, the active-runtime record,
// the plan's resolution order (PID runtimeRoot → active-runtime.json → null), and
// the GC safeguards. SDLC_HOME sandboxes ~/.sdlc so every test is hermetic.

import { test } from 'node:test';
import { equal, ok, deepEqual } from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  materializeRuntime, verifyRuntimeStore, writeActiveRuntime, readActiveRuntime,
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
