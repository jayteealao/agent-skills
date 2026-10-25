// The stable entry point ~/.sdlc/bin/wf.mjs: a session start writes it, and it runs the wf.mjs
// that bin/wf-current.json names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
