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
} from '../../../lib/tray-lifecycle.mjs';

const CUR = 'C:\\Users\\me\\.claude\\plugins\\cache\\m\\sdlc-workflow\\9.81.0\\dist\\tray.mjs';
const OLD = 'C:\\Users\\me\\.claude\\plugins\\cache\\m\\sdlc-workflow\\9.74.0\\dist\\tray.mjs';
const NODE = 'C:\\Users\\me\\AppData\\Roaming\\fnm\\aliases\\default\\node.exe';

// A reconcile harness that records kill()/respawn() calls and feeds a fixed
// process list, with platform pinned to win32 so the table runs cross-OS.
function harness(trays) {
  const calls = { killed: [], respawned: [] };
  return {
    calls,
    opts: {
      platform: 'win32',
      currentBundle: CUR,
      nodePath: NODE,
      list: () => trays,
      kill: (pid) => calls.killed.push(pid),
      respawn: (a) => calls.respawned.push(a),
    },
  };
}

test('bundlePathFromCommandLine: quoted, unquoted, none', () => {
  equal(bundlePathFromCommandLine(`"${NODE}"  "${OLD}"`), OLD);
  equal(bundlePathFromCommandLine(`${NODE} ${OLD}`), OLD);
  equal(bundlePathFromCommandLine('node --inspect server.mjs'), null);
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

test('reconcile: no tray running → none (tolerated)', async () => {
  const h = harness([]);
  const r = await reconcileRunningTray(h.opts);
  equal(r.action, 'none');
  deepEqual(h.calls.killed, []);
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
