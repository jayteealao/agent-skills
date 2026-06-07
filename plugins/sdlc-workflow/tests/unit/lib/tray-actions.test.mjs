// tests/unit/lib/tray-actions.test.mjs
//
// Verb coverage for lib/tray-actions.mjs against a mock hub. Relocates the
// machine-wide state dir via SDLC_HOME (like multi-repo-hub.test.mjs) so the real
// ~/.sdlc/ is never touched. Asserts endpoint resolution from hub.pid, the token
// header on refresh, the perRepoServe config flip, and the pure command/path
// builders — without launching a browser.

import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, before, after } from 'node:test';
import { equal, deepEqual, ok } from 'node:assert/strict';

import {
  getHealth, refreshRegistry, readToken, togglePerRepoServe, perRepoServeEnabled,
  openerCommand, openDashboard, resolveLogTarget,
} from '../../../lib/tray-actions.mjs';
import { writePidFile } from '../../../lib/pid-file.mjs';
import { hubPidPath } from '../../../lib/registry.mjs';

let server;
let port;
let home;
let lastRefreshToken;

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'sdlc-tray-'));
  process.env.SDLC_HOME = home;

  server = createServer((req, res) => {
    if (req.url === '/__sdlc/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ok: true, status: 'ok', pid: 4242, version: '9.45.0', uptimeMs: 1000,
        configHash: 'deadbeef', entries: [{ id: 'a1', branch: 'master', slugs: ['x'], lastRenderedAt: new Date().toISOString() }],
        metrics: { requests: 5, sseClients: 0, perRepoLastServed: {}, rssBytes: 1024 },
      }));
      return;
    }
    if (req.url === '/__sdlc/registry/refresh') {
      lastRefreshToken = req.headers['x-sdlc-token'] ?? null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, entries: 1 }));
      return;
    }
    res.writeHead(404); res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  await writePidFile(hubPidPath(), { pid: process.pid, host: '127.0.0.1', port, token: 'tok123', configHash: 'deadbeef' });
});

after(() => {
  try { server.close(); } catch { /* ignore */ }
  try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('getHealth resolves the endpoint from hub.pid and parses the payload', async () => {
  const h = await getHealth();
  equal(h.reachable, true);
  equal(h.endpoint.port, port);
  equal(h.payload.version, '9.45.0');
  ok(Array.isArray(h.payload.entries));
});

test('readToken returns the hub.pid token', async () => {
  equal(await readToken(), 'tok123');
});

test('refreshRegistry sends the x-sdlc-token header', async () => {
  const res = await refreshRegistry();
  equal(res.ok, true);
  equal(lastRefreshToken, 'tok123');
});

test('togglePerRepoServe flips and persists the config bit', () => {
  equal(perRepoServeEnabled(), true);          // HUB_CONFIG_DEFAULTS.perRepoServe
  equal(togglePerRepoServe(), false);
  equal(perRepoServeEnabled(), false);
  equal(togglePerRepoServe(), true);
  equal(perRepoServeEnabled(), true);
});

test('openerCommand is correct per platform', () => {
  deepEqual(openerCommand('win32', 'http://x/'), { command: 'cmd', args: ['/c', 'start', '', 'http://x/'] });
  deepEqual(openerCommand('darwin', 'http://x/'), { command: 'open', args: ['http://x/'] });
  deepEqual(openerCommand('linux', 'http://x/'), { command: 'xdg-open', args: ['http://x/'] });
});

test('openDashboard builds the URL with the resolved port (no launch)', async () => {
  let captured = null;
  await openDashboard({ platform: 'win32', opener: (command, args) => { captured = { command, args }; } });
  equal(captured.command, 'cmd');
  ok(captured.args.join(' ').includes(`http://127.0.0.1:${port}/`));
});

test('resolveLogTarget falls back cwd-log → prune-log → home dir', () => {
  const homeDir = join(tmpdir(), 'fake-sdlc-home');
  const cwdLog = join('/proj', '.ai', '_view', '.bootstrap.log');
  const pruneLog = join(homeDir, 'registry.prune.log');

  equal(resolveLogTarget({ cwd: '/proj', homeDir, exists: (p) => p === cwdLog }), cwdLog);
  equal(resolveLogTarget({ cwd: '/proj', homeDir, exists: (p) => p === pruneLog }), pruneLog);
  equal(resolveLogTarget({ cwd: '/proj', homeDir, exists: () => false }), homeDir);
});
