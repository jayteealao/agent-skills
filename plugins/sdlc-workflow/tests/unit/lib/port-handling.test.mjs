// W11.4 — honest port handling (WIDE-VIEW-REPAIR-PLAN §14.2.4).
//
// (1) migrateHubConfig: 4173 → 48173 once, marker respected, other ports untouched
// (2) readHubConfig rewrites a fixture file that carries the old default and
//     writes one lifecycle line
// (3) portHeld: true on a bound socket, false on a closed port
// (4) LIVE: a dummy server on the configured port → ensureHubLifecycle returns
//     port-held with no spawn (no hub.pid) and one lifecycle line
// (5) hub-serve on a held port exits 2 and writes the reason to hub.log
// (6) the tray tooltip names the holder
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HUB_CONFIG_DEFAULTS, HUB_DEFAULT_PORT, LEGACY_DEFAULT_PORT, hubConfigPath, migrateHubConfig, readHubConfig,
} from '../../../lib/hub-config.mjs';
import { portHeld } from '../../../lib/port-owner.mjs';
import { ensureHubLifecycle } from '../../../lib/hub-lifecycle.mjs';
import { formatHealth } from '../../../lib/tray-format.mjs';
import { hubLogPath, readLifecycleLog } from '../../../lib/runtime-log.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = (p) => mkdtempSync(path.join(tmpdir(), p));

// A listener that accepts and says nothing — the shape of a foreign process on
// the hub port. It tracks its accepted sockets so close() can destroy them:
// a probe's half-closed socket would otherwise keep server.close() pending
// after the event loop drained (node:test then cancels the test).
function listen(port) {
  return new Promise((resolve, reject) => {
    const sockets = new Set();
    const srv = createServer((s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
    srv.sockets = sockets;
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
const close = (srv) => new Promise((r) => { for (const s of srv.sockets ?? []) s.destroy(); srv.close(() => r()); });

test('migrateHubConfig: the legacy default moves once; a marked 4173 and any other port stay', () => {
  assert.equal(HUB_DEFAULT_PORT, 48173);
  assert.equal(LEGACY_DEFAULT_PORT, 4173);
  assert.equal(HUB_CONFIG_DEFAULTS.port, HUB_DEFAULT_PORT);

  const moved = migrateHubConfig({ version: 1, host: '127.0.0.1', port: 4173 });
  assert.equal(moved.config.port, 48173);
  assert.equal(moved.config.portMigratedFrom, 4173);
  assert.deepEqual(moved.changes, [{ key: 'port', from: 4173, to: 48173 }]);

  const kept = migrateHubConfig({ version: 1, port: 4173, portMigratedFrom: 4173 });
  assert.equal(kept.config.port, 4173, 'an operator who re-chose 4173 after the migration is respected');
  assert.deepEqual(kept.changes, []);

  assert.equal(migrateHubConfig({ version: 1, port: 5000 }).config.port, 5000);
  assert.deepEqual(migrateHubConfig({ version: 1, port: 5000 }).changes, []);
  assert.equal(migrateHubConfig({}).config.port, 48173, 'a sparse config gets the new default');
});

test('readHubConfig rewrites a file that carries 4173 and writes one lifecycle line', () => {
  const home = tmp('sdlc-port-mig-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    writeFileSync(hubConfigPath(), JSON.stringify({ version: 1, host: '127.0.0.1', port: 4173 }), 'utf-8');
    const cfg = readHubConfig();
    assert.equal(cfg.port, 48173);
    const onDisk = JSON.parse(readFileSync(hubConfigPath(), 'utf-8'));
    assert.equal(onDisk.port, 48173, 'the file was rewritten');
    assert.equal(onDisk.portMigratedFrom, 4173);
    const lines = readLifecycleLog(home);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].event, 'port-migrated');
    assert.match(lines[0].reason, /port 4173 → 48173/);
    // A second read changes nothing more.
    readHubConfig();
    assert.equal(readLifecycleLog(home).length, 1, 'the migration runs once');
  } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('portHeld: true on a bound socket, false on a closed port', async () => {
  const srv = await listen(0);
  const { port } = srv.address();
  try {
    assert.equal(await portHeld({ host: '127.0.0.1', port }), true);
  } finally { await close(srv); }
  assert.equal(await portHeld({ host: '127.0.0.1', port, timeoutMs: 300 }), false, 'closed after the listener is gone');
});

test('live: a foreign listener on the hub port → port-held, no spawn, one lifecycle line', async () => {
  const PORT = 41988;
  const home = tmp('sdlc-port-held-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  writeFileSync(path.join(home, 'hub-config.json'), JSON.stringify({ version: 1, host: '127.0.0.1', port: PORT }), 'utf-8');
  const srv = await listen(PORT);
  try {
    const res = await ensureHubLifecycle({ pluginRoot, log: () => {} });
    assert.equal(res.action, 'port-held', JSON.stringify(res));
    assert.equal(res.port, PORT);
    assert.equal(existsSync(path.join(home, 'hub.pid')), false, 'no hub was spawned (no pid record)');
    const rows = readLifecycleLog(home);
    const held = rows.find((r) => r.event === 'port-held');
    assert.ok(held, `port-held line: ${JSON.stringify(rows)}`);
    assert.match(held.reason, /another process holds port 41988/);
    assert.ok(!rows.some((r) => r.event === 'start' || r.event === 'unconfirmed'), 'no start was attempted');
  } finally {
    await close(srv);
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});

test('hub-serve on a held port writes the reason to hub.log and exits 2', async () => {
  const PORT = 41989;
  const home = tmp('sdlc-eaddrinuse-');
  const srv = await listen(PORT);
  try {
    const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'hub-serve.mjs'), '--host', '127.0.0.1', '--port', String(PORT)], {
      encoding: 'utf-8', timeout: 20_000, env: { ...process.env, SDLC_HOME: home }, windowsHide: true,
    });
    assert.equal(r.status, 2, `stdout=${r.stdout}\nstderr=${r.stderr}`);
    const log = readFileSync(hubLogPath(home), 'utf-8');
    assert.match(log, /port 41989 is held by another process \(EADDRINUSE\); exiting 2/);
  } finally {
    await close(srv);
    rmSync(home, { recursive: true, force: true });
  }
});

test('tray: the tooltip names the holder when the port is held', () => {
  const r = formatHealth({ reachable: false, payload: null, pluginVersion: '9.45.0', portHeld: { port: 48173, pid: 4242 } }, Date.now());
  assert.equal(r.iconState, 'down');
  assert.equal(r.tooltip, 'SDLC hub — another process holds port 48173 (pid 4242)');
  assert.equal(r.summary, '● port 48173 held by another process (pid 4242)');
  const noPid = formatHealth({ reachable: false, payload: null, portHeld: { port: 48173, pid: null } }, Date.now());
  assert.equal(noPid.tooltip, 'SDLC hub — another process holds port 48173');
  const plainDown = formatHealth({ reachable: false, payload: null, portHeld: null }, Date.now());
  assert.equal(plainDown.tooltip, 'SDLC hub — down', 'no holder → the plain down state');
});
