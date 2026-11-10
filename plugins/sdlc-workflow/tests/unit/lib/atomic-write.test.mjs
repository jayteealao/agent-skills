// lib/atomic-write.mjs: a whole-file write through a temp name of its own and a rename.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempNameOf, writeFileAtomic } from '../../../lib/atomic-write.mjs';

const MOD = pathToFileURL(join(import.meta.dirname, '..', '..', '..', 'lib', 'atomic-write.mjs')).href;

test('writeFileAtomic writes the file, makes its folder and leaves no temp file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
  const file = join(dir, 'a', 'b.json');
  writeFileAtomic(file, '{"x":1}\n');
  writeFileAtomic(file, '{"x":2}\n');
  assert.equal(readFileSync(file, 'utf8'), '{"x":2}\n');
  assert.deepEqual(readdirSync(join(dir, 'a')), ['b.json']);
  rmSync(dir, { recursive: true, force: true });
});

test('each write has a temp name of its own, with the pid of the process', () => {
  const a = tempNameOf('/x/f.json');
  const b = tempNameOf('/x/f.json');
  assert.notEqual(a, b);
  assert.match(a, new RegExp(`^/x/f\\.json\\.${process.pid}\\.[0-9a-f]{8}\\.tmp$`));
});

test('a write that fails removes its temp file and throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
  const target = join(dir, 'taken');
  mkdirSync(join(target, 'inside'), { recursive: true }); // a folder that is not empty: no file can replace it
  assert.throws(() => writeFileAtomic(target, 'x'));
  assert.deepEqual(readdirSync(dir), ['taken']);
  rmSync(dir, { recursive: true, force: true });
});

test('four processes that write one file at the same time all succeed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atomic-'));
  const file = join(dir, 'shared.json');
  const code = `const { writeFileAtomic } = await import(${JSON.stringify(MOD)}); for (let i = 0; i < 60; i++) writeFileAtomic(${JSON.stringify(file)}, JSON.stringify({ pid: process.pid, i }));`;
  const codes = await Promise.all([0, 1, 2, 3].map(() => new Promise((res) => {
    const c = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'inherit'] });
    c.on('exit', res);
  })));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).i, 59);
  assert.deepEqual(readdirSync(dir), ['shared.json']);
  rmSync(dir, { recursive: true, force: true });
});
