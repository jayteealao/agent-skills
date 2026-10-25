// tests/unit/lib/evidence.test.mjs
//
// The evidence cap: the oldest runs go first, and the newest run is never deleted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { evidenceRuns, pruneEvidence } from '../../../lib/evidence.mjs';

function run(dir, rel, bytes, at) {
  const path = join(dir, rel);
  mkdirSync(path, { recursive: true });
  const file = join(path, 'shot.bin');
  writeFileSync(file, Buffer.alloc(bytes));
  const t = new Date(at);
  utimesSync(file, t, t);
  utimesSync(path, t, t);
}

test('the oldest runs are pruned to the cap, and the newest run stays', () => {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-'));
  try {
    run(dir, 'verify-evidence/a', 400, '2026-10-01T00:00:00Z');
    run(dir, 'probe-evidence/r1', 300, '2026-10-02T00:00:00Z');
    run(dir, 'verify-evidence/b', 200, '2026-10-03T00:00:00Z');
    assert.deepEqual(evidenceRuns(dir).map((r) => r.rel), ['verify-evidence/a', 'probe-evidence/r1', 'verify-evidence/b']);

    assert.deepEqual(pruneEvidence(dir, { cap: 600, dryRun: true }).pruned, ['verify-evidence/a']);
    assert.ok(existsSync(join(dir, 'verify-evidence', 'a')), 'a dry run deletes nothing');

    const r = pruneEvidence(dir, { cap: 600 });
    assert.deepEqual(r.pruned, ['verify-evidence/a']);
    assert.equal(r.bytes, 500);
    assert.ok(!existsSync(join(dir, 'verify-evidence', 'a')));

    const last = pruneEvidence(dir, { cap: 10 });
    assert.deepEqual(last.pruned, ['probe-evidence/r1']);
    assert.ok(existsSync(join(dir, 'verify-evidence', 'b')), 'the newest run stays over the cap');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
