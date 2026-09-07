// W11.8 — narrow the exposure defaults (WIDE-VIEW-REPAIR-PLAN §14.2.8).
//
// (1) /__sdlc/health and /__sdlc/registry return repository basenames (no
//     viewDir) without the write token; the token unlocks full paths
// (2) effectiveCodeBrowserConfig: tailscale.enabled without
//     codeBrowser.acknowledgedTailnet → disabled with a one-line reason
// (3) LIVE: a hub spawned with that config answers every __code request 404
//     with the reason, and health names it
// (4) verifyTrayHelper: SHA256SUMS match / mismatch / missing entry; the
//     committed bin/tray/SHA256SUMS matches the three vendored helpers
import { test } from 'node:test';
import { deepEqual, equal, match, ok } from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHubServer } from '../../../scripts/hub-serve.mjs';
import { readRegistry, upsertRegistryEntry } from '../../../lib/registry.mjs';
import { effectiveCodeBrowserConfig, normalizeCodeBrowserConfig } from '../../../lib/code-browser.mjs';
import { verifyTrayHelper } from '../../../lib/tray-autostart.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = (p) => mkdtempSync(join(tmpdir(), p));

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}
const close = (server) => new Promise((r) => server.close(() => r()));

function httpReq(port, path, { token } = {}) {
  return new Promise((resolveP, reject) => {
    const headers = token ? { 'x-sdlc-token': token } : {};
    const r = httpRequest({ hostname: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolveP({ status: res.statusCode, body: data }));
    });
    r.on('error', reject);
    r.end();
  });
}

// A registered repo under a private SDLC_HOME. run-all sets SDLC_ALLOW_TEMP_ROOTS=1
// (W11.3) so the temp root registers; a bare `node --test` on this file needs it too.
async function hubFixture(serverOpts) {
  const home = tmp('sdlc-exposure-home-');
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  const repo = tmp('sdlc-exposure-repo-');
  // The hub prunes a root without .git and a view without .last-render on load.
  execFileSync('git', ['init', '-b', 'master', repo], { stdio: ['ignore', 'ignore', 'ignore'] });
  mkdirSync(join(repo, '.ai', '_view'), { recursive: true });
  writeFileSync(join(repo, '.ai', '_view', '.last-render'), JSON.stringify({ renderedAt: new Date().toISOString(), configHash: 'cfg0' }));
  writeFileSync(join(repo, '.ai', '_view', 'INDEX.html'), '<!doctype html><title>x</title>', 'utf-8');
  await upsertRegistryEntry({ projectRoot: repo, viewDir: join(repo, '.ai', '_view') });
  const { entries } = readRegistry();
  equal(entries.length, 1, 'fixture registered');
  const server = createHubServer({ liveReload: false, ...serverOpts });
  const port = await listen(server);
  const cleanup = async () => {
    await close(server);
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  };
  return { repo, entry: entries[0], port, cleanup };
}

test('health + registry: basenames without the token, full paths with it', async () => {
  const { entry, port, cleanup } = await hubFixture({ token: 'tok' });
  try {
    const health = JSON.parse((await httpReq(port, '/__sdlc/health')).body);
    equal(health.entries.length, 1);
    equal(health.entries[0].repoRoot, basename(entry.repoRoot), 'unauthenticated health carries the basename');
    equal(health.entries[0].id, entry.id);
    const healthFull = JSON.parse((await httpReq(port, '/__sdlc/health', { token: 'tok' })).body);
    equal(healthFull.entries[0].repoRoot, entry.repoRoot, 'the token unlocks the full path');

    const reg = JSON.parse((await httpReq(port, '/__sdlc/registry')).body);
    equal(reg.entries.length, 1);
    equal(reg.entries[0].repoRoot, basename(entry.repoRoot));
    equal('viewDir' in reg.entries[0], false, 'unauthenticated registry drops viewDir');
    equal(reg.entries[0].id, entry.id);
    const regFull = JSON.parse((await httpReq(port, '/__sdlc/registry', { token: 'tok' })).body);
    equal(regFull.entries[0].repoRoot, entry.repoRoot);
    equal(regFull.entries[0].viewDir, entry.viewDir);
  } finally { await cleanup(); }
});

test('effectiveCodeBrowserConfig: tailscale.enabled needs codeBrowser.acknowledgedTailnet', () => {
  const plain = effectiveCodeBrowserConfig({ tailscale: { enabled: false }, codeBrowser: {} });
  equal(plain.enabled, true);
  equal(plain.disabledReason ?? null, null);
  equal(normalizeCodeBrowserConfig({}).acknowledgedTailnet, false, 'default: not acknowledged');

  const gated = effectiveCodeBrowserConfig({ tailscale: { enabled: true }, codeBrowser: {} });
  equal(gated.enabled, false);
  match(gated.disabledReason, /acknowledgedTailnet/);

  const acked = effectiveCodeBrowserConfig({ tailscale: { enabled: true }, codeBrowser: { acknowledgedTailnet: true } });
  equal(acked.enabled, true);
  equal(acked.disabledReason ?? null, null);

  const off = effectiveCodeBrowserConfig({ tailscale: { enabled: false }, codeBrowser: { enabled: false } });
  equal(off.enabled, false);
  equal(off.disabledReason ?? null, null, 'a plain kill switch carries no tailnet reason');

  // The reason survives the env round-trip the supervisor uses.
  const roundTrip = normalizeCodeBrowserConfig(JSON.parse(JSON.stringify(gated)));
  equal(roundTrip.enabled, false);
  match(roundTrip.disabledReason, /acknowledgedTailnet/);
});

test('live: a tailnet-gated code browser answers 404 with the reason and health names it', async () => {
  const codeBrowser = effectiveCodeBrowserConfig({ tailscale: { enabled: true }, codeBrowser: {} });
  const { entry, port, cleanup } = await hubFixture({ codeBrowser });
  try {
    const page = await httpReq(port, `/r/${entry.id}/__code/`);
    equal(page.status, 404);
    match(page.body, /code browser disabled: .*acknowledgedTailnet/);
    const asset = await httpReq(port, '/__sdlc/code-browser.js');
    equal(asset.status, 404, 'the bundle is gated too');
    const health = JSON.parse((await httpReq(port, '/__sdlc/health')).body);
    equal(health.codeBrowser.enabled, false);
    match(health.codeBrowser.reason, /acknowledgedTailnet/);
  } finally { await cleanup(); }
});

test('verifyTrayHelper: SHA256SUMS match, mismatch, and missing entry', () => {
  const dir = tmp('sdlc-tray-sums-');
  try {
    writeFileSync(join(dir, 'helper.bin'), 'hello tray\n');
    const digest = createHash('sha256').update('hello tray\n').digest('hex');
    // Both sha256sum line shapes: text ("  name") and binary (" *name").
    writeFileSync(join(dir, 'SHA256SUMS'), `${digest} *helper.bin\n`, 'utf-8');
    const okRes = verifyTrayHelper(join(dir, 'helper.bin'));
    equal(okRes.ok, true, okRes.reason);
    equal(okRes.expected, digest);
    equal(okRes.actual, digest);
    writeFileSync(join(dir, 'SHA256SUMS'), `${digest}  helper.bin\n`, 'utf-8');
    equal(verifyTrayHelper(join(dir, 'helper.bin')).ok, true);
    const first = { actual: digest };

    writeFileSync(join(dir, 'helper.bin'), 'tampered\n');
    const bad = verifyTrayHelper(join(dir, 'helper.bin'));
    equal(bad.ok, false);
    match(bad.reason, /sha256 mismatch/);

    writeFileSync(join(dir, 'SHA256SUMS'), `${first.actual}  other.bin\n`, 'utf-8');
    const missing = verifyTrayHelper(join(dir, 'helper.bin'));
    equal(missing.ok, false);
    match(missing.reason, /no SHA256SUMS entry/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bin/tray/SHA256SUMS covers and matches every vendored helper', () => {
  const dir = join(PLUGIN_ROOT, 'bin', 'tray');
  const helpers = readdirSync(dir).filter((n) => n.startsWith('tray_')).sort();
  deepEqual(helpers, ['tray_darwin_release', 'tray_linux_release', 'tray_windows_release.exe']);
  for (const name of helpers) {
    const v = verifyTrayHelper(join(dir, name));
    ok(v.ok, `${name}: ${v.reason}`);
  }
});
