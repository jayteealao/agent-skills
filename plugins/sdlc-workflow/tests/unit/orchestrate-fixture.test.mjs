// The fixture with planted faults (tests/fixtures/orchestrate-planted): the measure judge fails
// the outcome with the measured fault, passes the control, and the manifest of the faults
// agrees with the contract. The behaviour fault needs a live validator and is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../../scripts/orchestrate.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/orchestrate-planted/', import.meta.url));
const S = 'tally';

test('the manifest names a fault or a control for each outcome of the fixture contract', () => {
  const contract = JSON.parse(readFileSync(path.join(FIXTURE, 'contract.json'), 'utf8'));
  const { faults, control } = JSON.parse(readFileSync(path.join(FIXTURE, 'faults.json'), 'utf8'));
  const named = [...faults, ...control].map((x) => x.outcome).sort();
  assert.deepEqual(named, contract.outcomes.map((o) => o.id).sort());
  const source = readFileSync(path.join(FIXTURE, 'app', 'tally.mjs'), 'utf8');
  for (const f of faults) assert.ok(source.includes(`PLANTED (${f.key})`), `${f.key} is marked in the source`);
});

test('the measure judge fails the planted fault and passes the control', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orch-fixture-'));
  try {
    cpSync(FIXTURE, root, { recursive: true });
    const git = (...a) => execFileSync('git', ['-C', root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...a], { stdio: 'ignore' });
    git('init', '-q');
    git('add', '--', 'app');
    git('commit', '-q', '-m', 'the fixture');
    mkdirSync(path.join(root, '.ai', 'workflows', S), { recursive: true });
    process.env.SDLC_HOME = path.join(root, '.home');

    assert.equal(run(['contract', 'put', root, S, path.join(root, 'contract.json')]).ok, true);
    const approved = run(['contract', 'approve', root, S, '--words', 'yes']);
    assert.equal(approved.path, 'full', JSON.stringify(approved));

    const m = run(['measure', root, S]);
    assert.equal(m.ok, true, JSON.stringify(m));
    const state = Object.fromEntries(m.outcomes.map((x) => [x.id, x]));
    assert.equal(state['OUT-TALLY-001'].state, 'open', 'the planted fault fails its outcome');
    assert.equal(state['OUT-TALLY-001'].rounds, 1, 'the failure is confirmed by a second run');
    assert.equal(state['OUT-TALLY-003'].state, 'passed', 'the control passes');
    assert.equal(state['OUT-STAND-TESTS'].state, 'passed');
    const view = run(['state', root, S]);
    assert.equal(view.finished, false);
    assert.ok(view.open.includes('OUT-TALLY-002'), 'the behaviour outcome waits for a validator');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
