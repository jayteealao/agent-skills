// lib/proc.mjs: the liveness test and the tree kill that the lib and the scripts share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMainModule, killTree, pidAlive, runShell } from '../../../lib/proc.mjs';

test('pidAlive is true for this process and false for a pid that is not a positive integer', () => {
  assert.equal(pidAlive(process.pid), true);
  for (const bad of [0, -1, 1.5, '123', null, undefined, NaN]) assert.equal(pidAlive(bad), false, String(bad));
});

test('pidAlive is false for a process that ended', async () => {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((r) => child.on('exit', r));
  assert.equal(pidAlive(child.pid), false);
});

test('killTree ends a running child, and a pid that is gone or invalid is no error', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true, detached: process.platform !== 'win32' });
  const exited = new Promise((r) => child.on('exit', r));
  assert.equal(pidAlive(child.pid), true);
  killTree(child.pid);
  await exited;
  assert.equal(pidAlive(child.pid), false);
  assert.doesNotThrow(() => killTree(child.pid));
  assert.doesNotThrow(() => killTree(0));
  assert.doesNotThrow(() => killTree(undefined));
});

test('killTree ends the children of a child too', async () => {
  // The parent starts a grandchild, prints its pid, and waits.
  const code = "const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); console.log(c.pid); setInterval(() => {}, 1000);";
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, detached: process.platform !== 'win32' });
  const grandchild = await new Promise((r) => child.stdout.once('data', (d) => r(Number(String(d).trim()))));
  const exited = new Promise((r) => child.on('exit', r));
  assert.equal(pidAlive(grandchild), true);
  killTree(child.pid);
  await exited;
  const until = Date.now() + 5000;
  while (pidAlive(grandchild) && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  assert.equal(pidAlive(grandchild), false);
});

test('isMainModule matches the started script through a junction or symlink and under a path with a space', () => {
  const top = mkdtempSync(join(tmpdir(), 'is main '));
  try {
    const real = join(top, 'real dir');
    mkdirSync(real);
    const script = join(real, 't.mjs');
    const helper = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'lib', 'proc.mjs')).href;
    writeFileSync(script, `import { isMainModule } from ${JSON.stringify(helper)};\nprocess.stdout.write(String(isMainModule(import.meta.url)));\n`);
    const link = join(top, 'link');
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    for (const started of [script, join(link, 't.mjs')]) {
      const r = spawnSync(process.execPath, [started], { encoding: 'utf8' });
      assert.equal(r.stdout, 'true', `${started}: ${r.stderr}`);
    }
    // Imported by another script, the module is not the main one.
    const other = join(top, 'other.mjs');
    writeFileSync(other, `import ${JSON.stringify(pathToFileURL(script).href)};\n`);
    assert.equal(spawnSync(process.execPath, [other], { encoding: 'utf8' }).stdout, 'false');
    assert.equal(isMainModule(pathToFileURL(script).href, join(link, 't.mjs')), true);
    assert.equal(isMainModule(pathToFileURL(script).href, undefined), false);
    assert.equal(isMainModule(pathToFileURL(script).href, join(top, 'missing.mjs')), false);
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('runShell returns the status and the output of a shell command, and passes its input', () => {
  const r = runShell('node -e "process.stdin.pipe(process.stdout); process.exitCode = 3"', { input: 'abc' });
  assert.deepEqual([r.status, r.stdout, r.timedOut], [3, 'abc', false]);
});

test('runShell ends the whole tree of a command that runs past its timeout, and returns soon after it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-shell-'));
  try {
    const pidFile = join(dir, 'grandchild.pid');
    // The command starts a grandchild that shares its pipes and would run for a minute.
    const script = `const c = require('child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'inherit' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(c.pid)); setTimeout(() => {}, 60000);`;
    writeFileSync(join(dir, 'tree.js'), script);
    const t0 = Date.now();
    const r = runShell(`node "${join(dir, 'tree.js')}"`, { timeoutMs: 1500 });
    assert.deepEqual([r.timedOut, r.status, r.error?.code], [true, null, 'ETIMEDOUT']);
    assert.ok(Date.now() - t0 < 20_000, `returned after ${Date.now() - t0} ms`);
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    const until = Date.now() + 5000;
    while (pidAlive(grandchild) && Date.now() < until) await new Promise((res) => setTimeout(res, 50));
    assert.equal(pidAlive(grandchild), false, 'the grandchild was ended too');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
