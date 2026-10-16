// The pure parts of the campaign live view (hooks/mod/live/model/campaign.ts),
// run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/mod/live-campaign-mod.test.mjs spawns this file; run-all.mjs never
// runs it directly (no `.test.mjs` suffix).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { driveJournalPathsOf } from '../../../hooks/mod/live/model/campaign.ts';

test('W0a: a unit journal is read at its ledger worktree path first, then in the main checkout', () => {
  assert.deepEqual(driveJournalPathsOf('C:/repo', 'engine', 'C:\\cw\\mlx2a\\w1-1\\'), [
    'C:\\cw\\mlx2a\\w1-1/.ai/workflows/engine/.driver-journal.jsonl',
    'C:/repo/.ai/workflows/engine/.driver-journal.jsonl',
  ]);
  assert.deepEqual(driveJournalPathsOf('/repo/', 'engine', null), ['/repo/.ai/workflows/engine/.driver-journal.jsonl']);
});
