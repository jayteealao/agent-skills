// The stable entry point ~/.sdlc/bin/wf.mjs: a session start writes it, and it runs the wf.mjs
// that bin/wf-current.json names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('the seed-memory hook writes the shim, and the shim runs wf.mjs of the plugin', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'sdlc-shim-'));
  try {
    const env = { ...process.env, SDLC_HOME: home, SDLC_DISABLE_MEMORY_SEED: '1' };
    const h = spawnSync(process.execPath, [path.join(pluginRoot, 'hooks', 'seed-memory.mjs')], { input: '{}', encoding: 'utf8', env });
    assert.equal(h.status, 0, h.stderr);
    const shim = path.join(home, 'bin', 'wf.mjs');
    assert.ok(existsSync(shim));
    const r = spawnSync(process.execPath, [shim, 'help', 'slice'], { encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /slice {4}drop <root> <slug> <slice> --reason r/);
    rmSync(path.join(home, 'bin', 'wf-current.json'));
    const none = spawnSync(process.execPath, [shim, 'help'], { encoding: 'utf8', env });
    assert.equal(none.status, 2);
    assert.match(none.stderr, /wf-current\.json is missing/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('plugin versions sort with each release after its prereleases', async () => {
  const { compareVersions } = await import('../../lib/wf-shim.mjs');
  const order = ['9.191.1', '10.0.0-next.2', '10.0.0-next.14', '10.0.0-next.18', '10.0.0', '10.0.1'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(compareVersions(order[i - 1], order[i]) < 0, `${order[i - 1]} < ${order[i]}`);
    assert.ok(compareVersions(order[i], order[i - 1]) > 0, `${order[i]} > ${order[i - 1]}`);
  }
  assert.equal(compareVersions('10.0.0-next.18', '10.0.0-next.18'), 0);
  assert.ok(compareVersions(null, '9.0.0') < 0);
});

test('the shim pointer only moves forward while the wf.mjs it names exists', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'sdlc-shim-fwd-'));
  const prev = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    const { writeShim, readShimCurrent } = await import('../../lib/wf-shim.mjs');
    const plugin = (v) => {
      const dir = path.join(home, 'cache', v);
      mkdirSync(path.join(dir, 'scripts'), { recursive: true });
      writeFileSync(path.join(dir, 'scripts', 'wf.mjs'), '');
      return dir;
    };
    const newer = plugin('10.0.0-next.18');
    const older = plugin('10.0.0-next.14');
    writeShim(newer, { version: '10.0.0-next.18', host: 'claude' });
    const kept = writeShim(older, { version: '10.0.0-next.14', host: 'claude' });
    assert.equal(kept.kept, '10.0.0-next.18');
    assert.equal(readShimCurrent().version, '10.0.0-next.18');
    // When the newer folder is gone, an older session points the shim at a wf.mjs that exists.
    rmSync(newer, { recursive: true, force: true });
    writeShim(older, { version: '10.0.0-next.14', host: 'claude' });
    assert.equal(readShimCurrent().version, '10.0.0-next.14');
    // A newer session always moves it forward.
    writeShim(plugin('10.0.0-next.19'), { version: '10.0.0-next.19', host: 'claude' });
    assert.equal(readShimCurrent().version, '10.0.0-next.19');
  } finally {
    if (prev === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = prev;
    rmSync(home, { recursive: true, force: true });
  }
});
