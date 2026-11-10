// The cost of `/wf status` and `wf.mjs cost`: rows of the old hook book the same sub-agent usage
// again in every row, so their sum is false. Such a workflow shows no total, only one plain line
// that names the repair; rows with no repeat sum as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendCostRow } from '../../lib/cost-ledger.mjs';
import { costSummary } from '../../lib/wf-status.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const usage = (o, c) => ({ input_tokens: 2, output_tokens: o, cache_read_input_tokens: c, cache_creation_input_tokens: 0 });

test('a workflow whose cost rows book a sub-agent again has no total, and the line names cost-rebuild.mjs', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'status-cost-'));
  try {
    const dir = path.join(root, '.ai', 'workflows', 'demo');
    mkdirSync(dir, { recursive: true });
    const a = { agent_id: 'a1', model: 'm', ...usage(1946, 41052828) };
    // The shape of the old hook: the same entry in every row.
    for (let i = 0; i < 3; i += 1) appendCostRow(dir, { slug: 'demo', ts: `2026-10-0${i + 1}T00:00:00Z`, key: 'implement', turn: i, main: usage(10, 100), subagents: [a] });
    const c = costSummary(dir);
    assert.equal(c.total, null);
    assert.equal(c.rebooked, 2);
    assert.match(c.note, /^No cost total: 2 sub-agent entries .* must be repaired: scripts\/cost-rebuild\.mjs/);
    const cli = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'cost', root, 'demo'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(cli.stdout.trim(), c.note);

    // A workflow whose rows book each message once sums as before.
    const clean = path.join(root, '.ai', 'workflows', 'clean');
    appendCostRow(clean, { slug: 'clean', ts: '2026-10-01T00:00:00Z', key: 'implement', turn: 1, main: usage(10, 100), subagents: [{ agent_id: 'a1', model: 'm', ...usage(5, 50) }] });
    appendCostRow(clean, { slug: 'clean', ts: '2026-10-02T00:00:00Z', key: 'implement', turn: 2, main: usage(10, 100), subagents: [{ agent_id: 'a1', model: 'm', ...usage(7, 70) }] });
    const sum = costSummary(clean);
    assert.equal(sum.note, undefined);
    assert.equal(sum.total.output, 32);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
