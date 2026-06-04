// tests/unit/snapshots/snapshot-harness.mjs
//
// Minimal golden-file harness built on node:test — no new dependency.
//
//   node --test tests/unit/snapshots/renderers.test.mjs        # compare
//   UPDATE_SNAPSHOTS=1 node --test tests/unit/snapshots/...     # regenerate
//
// On a missing golden the harness WRITES it (bootstrap) and passes, so the very
// first run materialises every golden. In CI the goldens already exist, so any
// divergence fails. Regenerate intentional changes with `npm run test:update`
// and review the golden diff in the PR.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

export function assertSnapshot(t, actual, goldenPath) {
  if (UPDATE || !existsSync(goldenPath)) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, actual, 'utf-8');
    if (UPDATE) t.diagnostic(`[snapshot] updated: ${goldenPath}`);
    return;
  }
  const expected = readFileSync(goldenPath, 'utf-8');
  if (actual !== expected) {
    const aLines = actual.split('\n');
    const eLines = expected.split('\n');
    // First differing line; if one side is a prefix of the other, point at the
    // first line past the shorter side (a trailing-content difference).
    let idx = aLines.findIndex((line, i) => line !== eLines[i]);
    if (idx === -1) idx = Math.min(aLines.length, eLines.length);
    throw new Error(
      `Snapshot mismatch: ${goldenPath}\n` +
      `  (run \`npm run test:update\` to regenerate, then review the diff)\n` +
      `  Line ${idx + 1} expected: ${JSON.stringify(eLines[idx])}\n` +
      `  Line ${idx + 1} actual:   ${JSON.stringify(aLines[idx])}`
    );
  }
}
