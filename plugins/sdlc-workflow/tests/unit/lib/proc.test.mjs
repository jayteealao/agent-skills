// lib/proc.mjs: the liveness test and the tree kill that the lib and the scripts share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { killTree, pidAlive } from '../../../lib/proc.mjs';

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
