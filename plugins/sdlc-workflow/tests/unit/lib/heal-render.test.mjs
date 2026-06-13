// tests/unit/lib/heal-render.test.mjs
//
// Unit coverage for the stale-render heal controller (STALE-RENDER-HEAL-PLAN
// §5/§11). The spawn + clock are injected, so these tests fork nothing and need
// no real renderer — they exercise drift detection, the bounds (concurrency
// cap, cooldown, attempt ceiling), and the spawn shape in isolation.

import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';

import {
  createHealController,
  normalizeStaleRenderConfig,
  staleRenderConfigFromEnv,
  readRenderedVersion,
  STALE_RENDER_DEFAULTS,
} from '../../../lib/heal-render.mjs';

/* ───────────────────────── helpers ───────────────────────── */

// A real `.ai/_view` dir with a controllable `.last-render`. `version === undefined`
// writes no marker at all (→ readRenderedVersion null); `null`/'' writes a marker
// with no usable version field; a string writes that version.
function mkView(version) {
  const repoRoot = mkdtempSync(join(tmpdir(), 'heal-repo-'));
  const viewDir = join(repoRoot, '.ai', '_view');
  mkdirSync(viewDir, { recursive: true });
  if (version !== undefined) {
    const body = version === '__torn__'
      ? 'not json {'
      : JSON.stringify({ renderedAt: '2026-01-01T00:00:00.000Z', version });
    writeFileSync(join(viewDir, '.last-render'), body);
  }
  return { repoRoot, viewDir };
}

function entry(id, version) {
  const { repoRoot, viewDir } = mkView(version);
  return { id, repoRoot, viewDir };
}

// Inert spawn seam: records every call and hands back a manually-driveable fake
// child (an EventEmitter). Tests emit 'exit'/'error' to settle a heal.
function fakeSpawner() {
  const calls = [];
  const children = [];
  const spawnRender = (script, args, opts) => {
    const child = new EventEmitter();
    calls.push({ script, args, opts });
    children.push(child);
    return child;
  };
  return { spawnRender, calls, children };
}

function makeController(overrides = {}) {
  const reloads = [];
  const logs = [];
  const spawner = fakeSpawner();
  const clock = { t: 1_000_000 };
  const ctrl = createHealController({
    pluginRoot: '/plugin',
    pluginVersion: 'V2',
    healCfg: { heal: true, maxConcurrent: 1, cooldownMs: 60_000, maxAttempts: 3, ...overrides },
    log: (l) => logs.push(l),
    emitReload: (id) => reloads.push(id),
    spawnRender: spawner.spawnRender,
    now: () => clock.t,
  });
  return { ctrl, spawner, reloads, logs, clock };
}

/* ───────────────────────── config normalisation ───────────────────────── */

test('heal: normalizeStaleRenderConfig fills defaults + coerces, treats heal as opt-out', () => {
  deepEqual(normalizeStaleRenderConfig(undefined), { ...STALE_RENDER_DEFAULTS });
  deepEqual(normalizeStaleRenderConfig({}), { ...STALE_RENDER_DEFAULTS });
  equal(normalizeStaleRenderConfig({ heal: false }).heal, false, 'explicit false disables');
  equal(normalizeStaleRenderConfig({ heal: 'yes' }).heal, true, 'anything but false enables');
  // out-of-range numbers fall back to defaults; in-range are floored
  equal(normalizeStaleRenderConfig({ maxConcurrent: 0 }).maxConcurrent, STALE_RENDER_DEFAULTS.maxConcurrent);
  equal(normalizeStaleRenderConfig({ maxConcurrent: -3 }).maxConcurrent, STALE_RENDER_DEFAULTS.maxConcurrent);
  equal(normalizeStaleRenderConfig({ maxConcurrent: 4.9 }).maxConcurrent, 4);
  equal(normalizeStaleRenderConfig({ cooldownMs: 0 }).cooldownMs, 0, 'zero cooldown is valid');
  equal(normalizeStaleRenderConfig({ cooldownMs: -1 }).cooldownMs, STALE_RENDER_DEFAULTS.cooldownMs);
  equal(normalizeStaleRenderConfig({ maxAttempts: 0 }).maxAttempts, STALE_RENDER_DEFAULTS.maxAttempts);
});

test('heal: staleRenderConfigFromEnv parses SDLC_STALE_RENDER, defaults on bad/absent', () => {
  deepEqual(staleRenderConfigFromEnv({}), { ...STALE_RENDER_DEFAULTS }, 'absent → defaults');
  deepEqual(staleRenderConfigFromEnv({ SDLC_STALE_RENDER: 'not json' }), { ...STALE_RENDER_DEFAULTS }, 'malformed → defaults');
  equal(staleRenderConfigFromEnv({ SDLC_STALE_RENDER: JSON.stringify({ heal: false }) }).heal, false);
  equal(staleRenderConfigFromEnv({ SDLC_STALE_RENDER: JSON.stringify({ maxAttempts: 5 }) }).maxAttempts, 5);
});

test('heal: STALE_RENDER_DEFAULTS ship heal ON', () => {
  equal(STALE_RENDER_DEFAULTS.heal, true, 'default-on per the product decision');
});

/* ───────────────────────── readRenderedVersion ───────────────────────── */

test('heal: readRenderedVersion returns the version, null on missing/torn/unversioned', () => {
  equal(readRenderedVersion(join(mkView('9.59.0').viewDir, '.last-render')), '9.59.0');
  equal(readRenderedVersion(join(mkView(undefined).viewDir, '.last-render')), null, 'no marker → null');
  equal(readRenderedVersion(join(mkView(null).viewDir, '.last-render')), null, 'no version field → null');
  equal(readRenderedVersion(join(mkView('').viewDir, '.last-render')), null, 'empty version → null');
  equal(readRenderedVersion(join(mkView('__torn__').viewDir, '.last-render')), null, 'torn json → null');
});

/* ───────────────────────── drift detection ───────────────────────── */

test('heal: heal:false → consider is a no-op (never spawns)', () => {
  const reloads = [];
  const spawner = fakeSpawner();
  const ctrl = createHealController({
    pluginRoot: '/p', pluginVersion: 'V2', healCfg: { heal: false },
    spawnRender: spawner.spawnRender, emitReload: (id) => reloads.push(id),
  });
  equal(ctrl.consider(entry('a', 'V1')).action, 'disabled');
  equal(spawner.calls.length, 0, 'nothing spawned when heal off');
  equal(ctrl.snapshot().heal, false);
});

test('heal: a fresh view (version === plugin) does not spawn', () => {
  const { ctrl, spawner } = makeController();
  equal(ctrl.consider(entry('a', 'V2')).action, 'fresh');
  equal(spawner.calls.length, 0);
});

test('heal: invalid entry shapes are ignored', () => {
  const { ctrl, spawner } = makeController();
  equal(ctrl.consider(null).action, 'invalid');
  equal(ctrl.consider({ id: 'a' }).action, 'invalid', 'missing viewDir/repoRoot');
  equal(spawner.calls.length, 0);
});

test('heal: drift spawns render-sunflower --clean with cwd=repoRoot and --view viewDir', () => {
  const { ctrl, spawner } = makeController();
  const e = entry('a', 'V1');   // older than V2 → drift
  equal(ctrl.consider(e).action, 'enqueued');
  equal(spawner.calls.length, 1, 'exactly one spawn');
  const { args, opts } = spawner.calls[0];
  ok(args.includes('--clean'), 'forces a clean re-render');
  const vi = args.indexOf('--view');
  ok(vi >= 0 && args[vi + 1] === e.viewDir, '--view points at the entry viewDir');
  equal(opts.cwd, e.repoRoot, 'cwd is the repoRoot (render-sunflower has no --project-root)');
  // in flight until the child exits
  deepEqual(ctrl.snapshot().inFlight, ['a']);
});

test('heal: an unversioned (pre-9.60) view is treated as stale and healed', () => {
  const { ctrl, spawner } = makeController();
  equal(ctrl.consider(entry('a', null)).action, 'enqueued', 'no version field → stale → heal');
  equal(spawner.calls.length, 1);
});

test('heal: drift heals in EITHER direction (a newer rendered version also re-renders)', () => {
  const { ctrl, spawner } = makeController();
  // rendered V9 but the daemon is V2 (a plugin downgrade) — content must match the
  // installed daemon, so it still re-renders.
  equal(ctrl.consider(entry('a', 'V9')).action, 'enqueued');
  equal(spawner.calls.length, 1);
});

test('heal: completion clears inFlight and fires emitReload', () => {
  const { ctrl, spawner, reloads } = makeController();
  ctrl.consider(entry('a', 'V1'));
  deepEqual(ctrl.snapshot().inFlight, ['a']);
  spawner.children[0].emit('exit', 0);
  deepEqual(ctrl.snapshot().inFlight, [], 'inFlight cleared on exit');
  deepEqual(reloads, ['a'], 'emitReload fired for the healed repo');
});

test('heal: a non-zero exit does NOT fire emitReload', () => {
  const { ctrl, spawner, reloads } = makeController();
  ctrl.consider(entry('a', 'V1'));
  spawner.children[0].emit('exit', 1);
  deepEqual(ctrl.snapshot().inFlight, []);
  deepEqual(reloads, [], 'a failed render does not signal a reload');
});

/* ───────────────────────── bounds ───────────────────────── */

test('heal: while in flight, re-consider is pending (no duplicate spawn)', () => {
  const { ctrl, spawner } = makeController();
  ctrl.consider(entry('a', 'V1'));
  // same id, still stale, still rendering
  const e2 = { id: 'a', ...mkView('V1') };
  equal(ctrl.consider(e2).action, 'pending');
  equal(spawner.calls.length, 1, 'no second spawn while one is in flight');
});

test('heal: cooldown blocks a re-spawn until it elapses', () => {
  const { ctrl, spawner, clock } = makeController({ cooldownMs: 60_000 });
  const e = entry('a', 'V1');
  ctrl.consider(e);                       // spawn #1 at t0
  spawner.children[0].emit('exit', 0);    // completes but marker still V1 (stale)
  equal(ctrl.consider(e).action, 'cooldown', 'within cooldown → blocked');
  equal(spawner.calls.length, 1);
  clock.t += 60_000;                       // cooldown elapses
  equal(ctrl.consider(e).action, 'enqueued', 'after cooldown → re-spawn');
  equal(spawner.calls.length, 2);
});

test('heal: maxConcurrent caps simultaneous spawns; the rest queue then drain', () => {
  const { ctrl, spawner } = makeController({ maxConcurrent: 1, cooldownMs: 0 });
  const a = entry('a', 'V1');
  const b = entry('b', 'V1');
  ctrl.consider(a);                  // a spawns
  equal(ctrl.consider(b).action, 'enqueued');
  equal(spawner.calls.length, 1, 'only one in flight under the cap');
  deepEqual(ctrl.snapshot().queued, ['b'], 'b is queued behind a');
  spawner.children[0].emit('exit', 0);  // a done → pump drains b
  equal(spawner.calls.length, 2, 'b spawns once a frees the slot');
  deepEqual(ctrl.snapshot().queued, []);
});

test('heal: gives up after maxAttempts and surfaces a failed state (no infinite respawn)', () => {
  const { ctrl, spawner, clock, logs } = makeController({ maxAttempts: 3, cooldownMs: 1000 });
  const e = entry('a', 'V1');   // render never updates the marker → stays stale
  for (let i = 1; i <= 3; i++) {
    equal(ctrl.consider(e).action, 'enqueued', `attempt ${i} spawns`);
    spawner.children[i - 1].emit('exit', 0);   // "completed" but marker still V1
    clock.t += 1000;                            // step past cooldown for the next try
  }
  equal(spawner.calls.length, 3, 'exactly maxAttempts spawns');
  equal(ctrl.consider(e).action, 'failed', 'further drift gives up');
  equal(spawner.calls.length, 3, 'no spawn past the cap');
  const snap = ctrl.snapshot();
  equal(snap.failed.length, 1);
  equal(snap.failed[0].id, 'a');
  ok(logs.some((l) => /FAILED after 3 attempts/.test(l)), 'the give-up is logged');
});

test('heal: going fresh resets attempts so a LATER drift can heal again', () => {
  const { ctrl, spawner, clock } = makeController({ maxAttempts: 1, cooldownMs: 0 });
  const a = entry('a', 'V1');
  ctrl.consider(a);                     // attempt 1
  spawner.children[0].emit('exit', 0);
  equal(ctrl.consider(a).action, 'failed', 'cap hit (maxAttempts:1)');
  // The view goes fresh (e.g. a manual render), which clears the failed/attempt state.
  writeFileSync(join(a.viewDir, '.last-render'), JSON.stringify({ version: 'V2' }));
  equal(ctrl.consider(a).action, 'fresh');
  // Now it drifts AGAIN — should heal, not stay stuck at failed.
  writeFileSync(join(a.viewDir, '.last-render'), JSON.stringify({ version: 'V1' }));
  clock.t += 1;
  equal(ctrl.consider(a).action, 'enqueued', 'a fresh interlude re-arms healing');
});

test('heal: a spawn that throws clears inFlight (never wedges the slot)', () => {
  const reloads = [];
  const ctrl = createHealController({
    pluginRoot: '/p', pluginVersion: 'V2', healCfg: { heal: true, maxConcurrent: 1 },
    emitReload: (id) => reloads.push(id),
    spawnRender: () => { throw new Error('boom'); },
  });
  ctrl.consider(entry('a', 'V1'));
  deepEqual(ctrl.snapshot().inFlight, [], 'a throwing spawn does not leave the id wedged in flight');
});

test('heal: snapshot reports config + live state', () => {
  const { ctrl } = makeController({ maxConcurrent: 2 });
  const snap = ctrl.snapshot();
  equal(snap.heal, true);
  equal(snap.maxConcurrent, 2);
  ok(Array.isArray(snap.inFlight) && Array.isArray(snap.queued) && Array.isArray(snap.failed));
});
