// tests/unit/stage-yolo-driver.test.mjs
//
// The Workflow tool refuses a `scriptPath` outside the working directory, so
// yolo.md Step 0 stages skills/wf/workflows/yolo.js into
// <projectRoot>/.scratch/wf/yolo.js at every launch. These tests prove the
// staged copy is byte-identical, the directory ignores itself, a hot-patched
// copy is overwritten with a CAUTION, and a wrong root is refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { stageYoloDriver, DRIVER_SOURCE } from '../../scripts/stage-yolo-driver.mjs';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'stage-yolo-driver.mjs');

function scratchRepo() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-stage-yolo-'));
  mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
  return root;
}

test('stages a byte-identical copy under .scratch/wf with a self-ignoring directory and a sidecar', () => {
  const root = scratchRepo();
  try {
    const lines = [];
    const r = stageYoloDriver(root, { log: (l) => lines.push(l) });
    assert.equal(r.scriptPath, join(root, '.scratch', 'wf', 'yolo.js'));
    assert.ok(isAbsolute(r.scriptPath));
    assert.equal(readFileSync(r.scriptPath, 'utf8'), readFileSync(DRIVER_SOURCE, 'utf8'));
    assert.equal(r.overwroteHotPatch, false);
    assert.equal(lines.length, 0);
    assert.equal(readFileSync(join(root, '.scratch', '.gitignore'), 'utf8'), '*\n');
    const sidecar = JSON.parse(readFileSync(`${r.scriptPath}.source.json`, 'utf8'));
    assert.equal(sidecar.sha256, r.sha256);
    assert.equal(sidecar.source, DRIVER_SOURCE);
    assert.match(String(r.version), /^\d+\.\d+\.\d+/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('overwrites a hot-patched staged copy and says so; an identical copy is silent', () => {
  const root = scratchRepo();
  try {
    const first = stageYoloDriver(root, { log: () => {} });
    writeFileSync(first.scriptPath, `${readFileSync(first.scriptPath, 'utf8')}\n// hot-patch\n`);
    const lines = [];
    const second = stageYoloDriver(root, { log: (l) => lines.push(l) });
    assert.equal(second.overwroteHotPatch, true);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^CAUTION: .*overwritten/);
    assert.match(lines[0], /\.ai\/patches\//);
    assert.equal(readFileSync(second.scriptPath, 'utf8'), readFileSync(DRIVER_SOURCE, 'utf8'));
    const third = stageYoloDriver(root, { log: (l) => lines.push(l) });
    assert.equal(third.overwroteHotPatch, false);
    assert.equal(lines.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('leaves an existing .scratch/.gitignore untouched', () => {
  const root = scratchRepo();
  try {
    mkdirSync(join(root, '.scratch'), { recursive: true });
    writeFileSync(join(root, '.scratch', '.gitignore'), 'sources/\n');
    stageYoloDriver(root, { log: () => {} });
    assert.equal(readFileSync(join(root, '.scratch', '.gitignore'), 'utf8'), 'sources/\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('refuses a relative root and a root without .ai/workflows', () => {
  assert.throws(() => stageYoloDriver('relative/path'), /absolute path/);
  const root = mkdtempSync(join(tmpdir(), 'sdlc-stage-yolo-bare-'));
  try {
    assert.throws(() => stageYoloDriver(root), /no \.ai\/workflows/);
    assert.equal(existsSync(join(root, '.scratch')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI prints one JSON line with the staged path and exits 0', () => {
  const root = scratchRepo();
  try {
    const r = spawnSync(process.execPath, [SCRIPT, root], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout.trim().split('\n');
    assert.equal(out.length, 1);
    const parsed = JSON.parse(out[0]);
    assert.equal(parsed.scriptPath, join(root, '.scratch', 'wf', 'yolo.js'));
    assert.equal(parsed.overwroteHotPatch, false);
    assert.ok(existsSync(parsed.scriptPath));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI exits 2 without an argument and 1 on a bad root', () => {
  const none = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(none.status, 2);
  const bare = mkdtempSync(join(tmpdir(), 'sdlc-stage-yolo-cli-bad-'));
  try {
    const bad = spawnSync(process.execPath, [SCRIPT, bare], { encoding: 'utf8' });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /no \.ai\/workflows/);
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});
