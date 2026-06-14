// tests/unit/lib/runtime-buildid.test.mjs
//
// The buildId algorithm (lib/runtime-buildid.mjs) is the cross-host parity
// primitive: two packages that COPY the same payload must compute the same
// buildId. These tests pin the two properties that guarantee that —
// (1) determinism over identical bytes, and (2) relpath taken relative to the
// passed root (NOT an absolute path), so the same payload at two different roots
// hashes identically — plus the safety property that a single changed byte flips
// the digest.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { RUNTIME_BUILD_DIRS, computeBuildId } from '../../../lib/runtime-buildid.mjs';

/** Lay down a minimal runtime payload under `root` and return it. */
function seedPayload(root, { variant = 'a' } = {}) {
  for (const d of RUNTIME_BUILD_DIRS) mkdirSync(join(root, d), { recursive: true });
  mkdirSync(join(root, 'dist', 'renderers'), { recursive: true });
  writeFileSync(join(root, 'dist', 'hub-serve.mjs'), `// hub ${variant}\n`);
  writeFileSync(join(root, 'dist', 'renderers', 'plan.mjs'), `// plan ${variant}\n`);
  writeFileSync(join(root, 'assets', 'app.css'), `body{}/* ${variant} */\n`);
  writeFileSync(join(root, 'components', 'card.html'), `<div>${variant}</div>\n`);
  writeFileSync(join(root, 'schemas', 'sdlc.schema.json'), `{"v":"${variant}"}\n`);
  // A non-buildId dir must NOT affect the hash.
  mkdirSync(join(root, 'docs', 'site'), { recursive: true });
  writeFileSync(join(root, 'docs', 'site', 'index.html'), `<html>${variant}</html>\n`);
  return root;
}

test('buildId is deterministic for identical bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'bid-det-'));
  try {
    seedPayload(root);
    assert.equal(computeBuildId(root), computeBuildId(root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('identical payload at two different roots produces the same buildId (the copy-parity property)', () => {
  const a = mkdtempSync(join(tmpdir(), 'bid-a-'));
  const b = mkdtempSync(join(tmpdir(), 'bid-b-'));
  try {
    seedPayload(a);
    seedPayload(b);
    // Same bytes, different absolute roots, even nested differently on disk.
    assert.equal(computeBuildId(a), computeBuildId(b));
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('a single changed byte in a hashed dir flips the buildId', () => {
  const a = mkdtempSync(join(tmpdir(), 'bid-x-'));
  const b = mkdtempSync(join(tmpdir(), 'bid-y-'));
  try {
    seedPayload(a, { variant: 'a' });
    seedPayload(b, { variant: 'b' });
    assert.notEqual(computeBuildId(a), computeBuildId(b));
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('content outside the buildId dirs (docs/site) does not change the buildId', () => {
  const root = mkdtempSync(join(tmpdir(), 'bid-docs-'));
  try {
    seedPayload(root);
    const before = computeBuildId(root);
    // Mutate a non-hashed payload file.
    writeFileSync(join(root, 'docs', 'site', 'index.html'), '<html>totally different</html>\n');
    assert.equal(computeBuildId(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('RUNTIME_BUILD_DIRS is the documented buildId input set', () => {
  assert.deepEqual(RUNTIME_BUILD_DIRS, ['dist', 'assets', 'components', 'schemas']);
});
