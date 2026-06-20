// tests/unit/lib/hub-upgrade.test.mjs
//
// The controlled runtime upgrade / rollback op (NATIVE-INTEROP "Controlled Runtime
// Upgrade" / Workstream C). Two layers:
//   • pure: compareVersions + the upgradeDecision matrix (downgrade guard).
//   • live: real detached hubs in an SDLC_HOME sandbox prove the state machine —
//     an upgrade swaps the live hub to a new runtime build and retains ~/.sdlc
//     state (plan test 9); a failed upgrade rolls the hub back to its previous
//     runtime (plan test 10).

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { compareVersions, controlledUpgrade, stopHub, upgradeDecision } from '../../../lib/hub-lifecycle.mjs';
import { copyRuntimePayload } from '../../../lib/runtime-store.mjs';

const CLAUDE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FAKE_B1 = '1'.repeat(64);

// ── pure ──────────────────────────────────────────────────────────────────────

test('compareVersions orders semver numerically', () => {
  assert.ok(compareVersions('9.79.0', '9.80.0') < 0);
  assert.ok(compareVersions('9.80.0', '9.79.0') > 0);
  assert.equal(compareVersions('9.80.0', '9.80.0'), 0);
  assert.ok(compareVersions('9.9.0', '9.80.0') < 0, 'numeric, not lexical');
  assert.ok(compareVersions('10.0.0', '9.99.0') > 0);
});

test('upgradeDecision: already-current / downgrade-refused / proceed', () => {
  const requested = { runtimeVersion: '9.80.0', buildId: 'bbb' };
  const prevSame = { runtimeVersion: '9.80.0', buildId: 'bbb' };
  const prevOld = { runtimeVersion: '9.79.0', buildId: 'aaa' };
  const prevNew = { runtimeVersion: '9.81.0', buildId: 'ccc' };

  assert.equal(upgradeDecision({ requested, prev: prevSame, aliveSameBuild: true }), 'already-current');
  assert.equal(upgradeDecision({ requested, prev: prevOld, aliveSameBuild: false }), 'proceed');
  // requested older than active → refused unless allowDowngrade + confirm
  assert.equal(upgradeDecision({ requested, prev: prevNew, aliveSameBuild: false }), 'downgrade-refused');
  assert.equal(upgradeDecision({ requested, prev: prevNew, aliveSameBuild: false, allowDowngrade: true }), 'downgrade-refused');
  assert.equal(upgradeDecision({ requested, prev: prevNew, aliveSameBuild: false, allowDowngrade: true, confirm: true }), 'proceed');
});

// ── live helpers ────────────────────────────────────────────────────────────────

function sandbox(port) {
  const home = mkdtempSync(join(tmpdir(), 'hub-upgrade-'));
  process.env.SDLC_HOME = home;
  writeFileSync(join(home, 'hub-config.json'), JSON.stringify({ host: '127.0.0.1', port }), 'utf-8');
  return home;
}

async function probe(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__sdlc/health`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probeUntil(port, pred, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const h = await probe(port);
    if (pred(h)) return h;
    await sleep(150);
  }
  return null;
}

/** Build a runtime root carrying the full real payload but a rewritten identity. */
async function makeRuntimeRoot({ version, buildId, breakHub = false }) {
  const root = mkdtempSync(join(tmpdir(), 'rt-'));
  await copyRuntimePayload(CLAUDE_ROOT, root);
  const manifest = JSON.parse(readFileSync(join(root, 'runtime-manifest.json'), 'utf-8'));
  manifest.runtimeVersion = version;
  manifest.buildId = buildId;
  writeFileSync(join(root, 'runtime-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  if (breakHub) {
    // A hub-serve that exits immediately never binds the port → health never goes
    // green → the upgrade must roll back. verifyRuntimeStore still passes (the
    // required entries exist + the manifest buildId matches).
    writeFileSync(join(root, 'dist', 'hub-serve.mjs'), 'process.exit(0);\n', 'utf-8');
  }
  return root;
}

async function cleanup(home, roots) {
  try { await stopHub({ log: () => {} }); } catch { /* ignore */ }
  await sleep(200);
  delete process.env.SDLC_HOME;
  for (const r of [home, ...roots]) { try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ } }
}

// ── live: upgrade succeeds + retains ~/.sdlc state (plan test 9) ──────────────────

test('controlled upgrade swaps the live hub to a new build and retains state', async () => {
  const PORT = 41986;
  const home = sandbox(PORT);
  const roots = [];
  try {
    // Bring up the current hub from the real bundled runtime (prev=null → starts it).
    const up0 = await controlledUpgrade({ pluginRoot: CLAUDE_ROOT, log: () => {} });
    assert.equal(up0.action, 'upgraded', `initial start: ${JSON.stringify(up0)}`);
    const h0 = await probeUntil(PORT, (h) => h?.hub?.buildId);
    assert.ok(h0, 'V0 hub healthy');
    const b0 = h0.hub.buildId;

    // A sentinel in ~/.sdlc proves the upgrade does not wipe machine state.
    const sentinel = join(home, 'state-sentinel.json');
    writeFileSync(sentinel, '{"keep":true}', 'utf-8');

    // Upgrade to a distinct (real-payload, rewritten-identity) build.
    const v1 = await makeRuntimeRoot({ version: '99.0.0', buildId: FAKE_B1 });
    roots.push(v1);
    const up1 = await controlledUpgrade({ pluginRoot: v1, log: () => {} });
    assert.equal(up1.action, 'upgraded', `upgrade: ${JSON.stringify(up1)}`);
    assert.equal(up1.to, '99.0.0');

    const h1 = await probeUntil(PORT, (h) => h?.hub?.buildId === FAKE_B1);
    assert.ok(h1, 'new hub serves the upgraded build');
    assert.notEqual(h1.hub.buildId, b0, 'buildId changed');
    assert.ok(Array.isArray(h1.entries), 'new hub still serves the registry (isHub)');
    assert.equal(readFileSync(sentinel, 'utf-8'), '{"keep":true}', '~/.sdlc state retained');
  } finally {
    await cleanup(home, roots);
  }
});

// ── live: failed upgrade rolls back (plan test 10) ───────────────────────────────

test('a failed upgrade rolls the hub back to the previous runtime', async () => {
  const PORT = 41987;
  const home = sandbox(PORT);
  const roots = [];
  try {
    const up0 = await controlledUpgrade({ pluginRoot: CLAUDE_ROOT, log: () => {} });
    assert.equal(up0.action, 'upgraded', `initial start: ${JSON.stringify(up0)}`);
    const h0 = await probeUntil(PORT, (h) => h?.hub?.buildId);
    assert.ok(h0, 'V0 hub healthy');
    const b0 = h0.hub.buildId;

    // Upgrade to a build whose hub never binds → must roll back to V0.
    const broken = await makeRuntimeRoot({ version: '99.0.0', buildId: FAKE_B1, breakHub: true });
    roots.push(broken);
    const up1 = await controlledUpgrade({ pluginRoot: broken, log: () => {} });
    assert.equal(up1.action, 'rolled-back', `expected rollback: ${JSON.stringify(up1)}`);

    const h1 = await probeUntil(PORT, (h) => h?.hub?.buildId === b0);
    assert.ok(h1, 'hub is back on the previous build after rollback');
    assert.equal(h1.hub.buildId, b0);
  } finally {
    await cleanup(home, roots);
  }
});
