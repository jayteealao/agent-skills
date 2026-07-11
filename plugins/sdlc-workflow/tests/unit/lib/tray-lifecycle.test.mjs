// tests/unit/lib/tray-lifecycle.test.mjs
//
// Live-tray reconcile (lib/tray-lifecycle.mjs): the running-process complement
// to the autostart launcher self-heal. Asserts the pure parsing/path helpers and
// the full reconcile decision table over injected seams — never touching real
// processes (platform is forced to 'win32'; list/kill/respawn are fakes).

import { test } from 'node:test';
import { equal, deepEqual, ok } from 'node:assert/strict';

import {
  bundlePathFromCommandLine, normalizeBundlePath, sameBundle,
  parseTrayProcessList, listRunningTrays, reconcileRunningTray,
  isHubHealthyEnough, MIN_HUB_UPTIME_MS,
} from '../../../lib/tray-lifecycle.mjs';

const CUR = 'C:\\Users\\me\\.claude\\plugins\\cache\\m\\sdlc-workflow\\9.81.0\\dist\\tray.mjs';
const OLD = 'C:\\Users\\me\\.claude\\plugins\\cache\\m\\sdlc-workflow\\9.74.0\\dist\\tray.mjs';
const NODE = 'C:\\Users\\me\\AppData\\Roaming\\fnm\\aliases\\default\\node.exe';

const NOW = 1_000_000;

// A reconcile harness that records kill()/respawn() calls and feeds a fixed
// process list, with platform pinned to win32 so the table runs cross-OS. The
// heartbeat is injected (default: none) and `now` pinned so heartbeat staleness
// is deterministic and nothing reads the real ~/.sdlc/ file.
function harness(trays, { heartbeat = null, now = NOW, hub = { reachable: false, uptimeMs: 0 }, pidAlive = () => false } = {}) {
  const calls = { killed: [], respawned: [], probes: 0 };
  return {
    calls,
    opts: {
      platform: 'win32',
      currentBundle: CUR,
      nodePath: NODE,
      list: () => trays,
      kill: (pid) => calls.killed.push(pid),
      respawn: (a) => calls.respawned.push(a),
      readHeartbeat: () => heartbeat,
      pidAlive,
      probeHub: async () => { calls.probes++; return hub; },
      now,
    },
  };
}

test('bundlePathFromCommandLine: quoted, unquoted, none', () => {
  equal(bundlePathFromCommandLine(`"${NODE}"  "${OLD}"`), OLD);
  equal(bundlePathFromCommandLine(`${NODE} ${OLD}`), OLD);
  equal(bundlePathFromCommandLine('node --inspect server.mjs'), null);
});

test('bundlePathFromCommandLine: only dist|scripts tray bundles match — unrelated tray-ish processes are never candidates', () => {
  // Another project's tray script must NOT read as an SDLC tray (the heal would
  // terminate it as "stale"): the path segment before tray.mjs is the guard.
  equal(bundlePathFromCommandLine('"C:\\node.exe" "C:\\other-app\\tray.mjs"'), null);
  equal(bundlePathFromCommandLine('"C:\\node.exe" "C:\\other-app\\src\\mytray.mjs"'), null);
  equal(bundlePathFromCommandLine('"C:\\node.exe" "C:\\other-app\\electron-tray.cjs"'), null);
  // …while a source-run SDLC tray (scripts/tray.mjs) still matches.
  const SRC = 'C:\\dev\\agent-skills\\plugins\\sdlc-workflow\\scripts\\tray.mjs';
  equal(bundlePathFromCommandLine(`"${NODE}" "${SRC}"`), SRC);
});

test('normalizeBundlePath + sameBundle: win32 case/sep-insensitive, posix strict', () => {
  equal(normalizeBundlePath('C:/A/Tray.mjs', 'win32'), 'c:\\a\\tray.mjs');
  ok(sameBundle('C:\\A\\tray.mjs', 'c:/a/tray.mjs', 'win32'));
  ok(!sameBundle('/a/tray.mjs', '/A/tray.mjs', 'linux'));  // posix is case-sensitive
  ok(!sameBundle(CUR, OLD, 'win32'));
  ok(!sameBundle('', CUR, 'win32'));                       // empty never matches
});

test('parseTrayProcessList: array, single object, empty/garbage', () => {
  const arr = JSON.stringify([
    { ProcessId: 11, CommandLine: `"${NODE}" "${OLD}"` },
    { ProcessId: 22, CommandLine: `"${NODE}" "${CUR}"` },
  ]);
  deepEqual(parseTrayProcessList(arr).map((t) => t.pid), [11, 22]);

  const one = JSON.stringify({ ProcessId: 33, CommandLine: `"${NODE}" "${CUR}"` });
  const parsed = parseTrayProcessList(one);
  equal(parsed.length, 1);
  equal(parsed[0].bundlePath, CUR);

  equal(parseTrayProcessList('').length, 0);
  equal(parseTrayProcessList('not json').length, 0);
  // a node process that is NOT a tray is dropped (no bundle path)
  equal(parseTrayProcessList(JSON.stringify({ ProcessId: 9, CommandLine: 'node x.mjs' })).length, 0);
});

test('listRunningTrays: non-win32 returns [] without probing', () => {
  let probed = false;
  const out = listRunningTrays({ platform: 'linux', probe: () => { probed = true; return '[]'; } });
  deepEqual(out, []);
  equal(probed, false);
});

test('reconcile: a STALE tray is killed and the current bundle respawned', async () => {
  const h = harness([{ pid: 13724, bundlePath: OLD, commandLine: 'x' }]);
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'respawned');
  deepEqual(r.killed, [13724]);
  deepEqual(h.calls.killed, [13724]);
  equal(h.calls.respawned.length, 1);
  equal(h.calls.respawned[0].trayBundle, CUR);   // respawns the CURRENT bundle…
  equal(h.calls.respawned[0].nodePath, NODE);    // …via the durable node
});

test('reconcile: a CURRENT-version tray is left alone (no kill, no respawn)', async () => {
  const h = harness([{ pid: 41060, bundlePath: CUR, commandLine: 'x' }]);
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'unchanged');
  deepEqual(h.calls.killed, []);
  equal(h.calls.respawned.length, 0);
});

test('reconcile: a CURRENT tray with a FRESH heartbeat is left alone', async () => {
  const h = harness(
    [{ pid: 42, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 42, lastPollAt: NOW - 3000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'unchanged');
  deepEqual(h.calls.killed, []);
  equal(h.calls.respawned.length, 0);
});

test('reconcile: a CURRENT tray with a STALE heartbeat (wedged poll) is reaped + respawned', async () => {
  const h = harness(
    [{ pid: 42, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 42, lastPollAt: NOW - 120_000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'respawned');
  deepEqual(r.killed, [42]);
  deepEqual(h.calls.killed, [42]);
  equal(h.calls.respawned.length, 1);
  equal(h.calls.respawned[0].trayBundle, CUR);   // respawns the CURRENT bundle…
  equal(h.calls.respawned[0].nodePath, NODE);    // …via the durable node
});

test('reconcile: only the heartbeat-proven-wedged current tray is reaped; an unprovable peer is kept, NO dup spawn', async () => {
  // The heartbeat names pid 44 with a stale stamp → 44 is proven wedged and
  // reaped. pid 43 (current, no matching stamp) cannot be proven dead, so it is
  // treated as live and kept — which also suppresses a respawn (thrash guard).
  const h = harness(
    [
      { pid: 43, bundlePath: CUR, commandLine: 'x' },
      { pid: 44, bundlePath: CUR, commandLine: 'x' },
    ],
    { heartbeat: { pid: 44, lastPollAt: NOW - 120_000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'killed-stale');
  deepEqual(h.calls.killed, [44]);
  equal(h.calls.respawned.length, 0);
});

test('isHubHealthyEnough: reachable + uptime past the floor → true; short uptime / unreachable → false', () => {
  ok(isHubHealthyEnough({ reachable: true, uptimeMs: MIN_HUB_UPTIME_MS + 1 }));
  ok(!isHubHealthyEnough({ reachable: true, uptimeMs: MIN_HUB_UPTIME_MS - 1 }));
  ok(!isHubHealthyEnough({ reachable: false, uptimeMs: 999_999 }));
  ok(!isHubHealthyEnough(null));
});

test('reconcile: a live current tray stamping DOWN while the hub is up+settled is reaped + respawned (display wedge)', async () => {
  const h = harness(
    [{ pid: 55, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 55, lastPollAt: NOW - 3000, iconState: 'down' }, hub: { reachable: true, uptimeMs: 120_000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'respawned');
  deepEqual(r.killed, [55]);
  equal(h.calls.respawned.length, 1);
  equal(h.calls.respawned[0].trayBundle, CUR);
  equal(h.calls.probes, 1);   // hub probed exactly once — a down candidate existed
});

test('reconcile: a DOWN-stamped tray is left ALONE while the hub is still coming up (uptime below floor)', async () => {
  const h = harness(
    [{ pid: 55, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 55, lastPollAt: NOW - 3000, iconState: 'down' }, hub: { reachable: true, uptimeMs: 5_000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'unchanged');   // legit hub-coming-up window, not a wedge
  deepEqual(h.calls.killed, []);
  equal(h.calls.probes, 1);       // probed to check, but the gate held
});

test('reconcile: a DOWN-stamped tray is left alone when the hub is genuinely unreachable (really down)', async () => {
  const h = harness(
    [{ pid: 55, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 55, lastPollAt: NOW - 3000, iconState: 'down' }, hub: { reachable: false, uptimeMs: 0 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'unchanged');
  deepEqual(h.calls.killed, []);
});

test('reconcile: an UP-stamped current tray never triggers a hub probe (no candidate, healthy machine pays nothing)', async () => {
  const h = harness(
    [{ pid: 55, bundlePath: CUR, commandLine: 'x' }],
    { heartbeat: { pid: 55, lastPollAt: NOW - 3000, iconState: 'up' }, hub: { reachable: true, uptimeMs: 120_000 } },
  );
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'unchanged');
  equal(h.calls.probes, 0);   // never probed — no down candidate
});

test('reconcile: no tray running and no heartbeat → none (never ran, or a clean Quit)', async () => {
  const h = harness([]);
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'none');
  deepEqual(h.calls.killed, []);
  equal(h.calls.respawned.length, 0);
});

test('reconcile: no tray but a heartbeat whose pid is DEAD → revived (crash detected)', async () => {
  // A crashed/reaped driver cannot clear its heartbeat; only menu-Quit does.
  const h = harness([], { heartbeat: { pid: 77, lastPollAt: NOW - 3000 }, pidAlive: () => false });
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'revived');
  deepEqual(h.calls.killed, []);
  equal(h.calls.respawned.length, 1);
  equal(h.calls.respawned[0].trayBundle, CUR);
  equal(h.calls.respawned[0].nodePath, NODE);
});

test('reconcile: no tray, heartbeat pid still ALIVE (pid reuse) → none (cannot prove a crash)', async () => {
  const h = harness([], { heartbeat: { pid: 77, lastPollAt: NOW - 3000 }, pidAlive: () => true });
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'none');
  equal(h.calls.respawned.length, 0);
});

test('reconcile: no tray, heartbeat without a usable pid → none (conservative)', async () => {
  const h = harness([], { heartbeat: { lastPollAt: NOW - 3000 }, pidAlive: () => false });
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'none');
  equal(h.calls.respawned.length, 0);
});

test('reconcile: stale + current both up → kill stale, keep current, NO duplicate spawn', async () => {
  const h = harness([
    { pid: 1, bundlePath: OLD, commandLine: 'x' },
    { pid: 2, bundlePath: CUR, commandLine: 'x' },
  ]);
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'killed-stale');
  deepEqual(h.calls.killed, [1]);
  equal(h.calls.respawned.length, 0);
});

test('reconcile: non-win32 is a clean no-op (never lists)', async () => {
  let listed = false;
  const r = await reconcileRunningTray({
    platform: 'linux', currentBundle: CUR, list: () => { listed = true; return []; },
  });
  equal(r.action, 'unsupported');
  equal(listed, false);
});

test('reconcile: missing currentBundle is a guarded no-op', async () => {
  const r = await reconcileRunningTray({ platform: 'win32', list: () => [{ pid: 1, bundlePath: OLD }] });
  equal(r.action, 'no-current-bundle');
});
