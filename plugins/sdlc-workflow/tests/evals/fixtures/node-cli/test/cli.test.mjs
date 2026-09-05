import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { count, list } from '../src/cli.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'list-cli-'));
  mkdirSync(path.join(dir, 'sub'));
  writeFileSync(path.join(dir, 'b.txt'), 'b');
  writeFileSync(path.join(dir, 'a.txt'), 'a');
  return dir;
}

test('list prints directories first, then files by name', () => {
  assert.deepEqual(list(fixture()), ['sub/', 'a.txt', 'b.txt']);
});

test('count returns the number of entries', () => {
  assert.equal(count(fixture()), 3);
});
