// The clear of a stop request after a run ends keeps a request that the person made later.

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearStopRequest, lastRunEndAt, madeAfterLastRun } from '../../../lib/stop-request.mjs';

function folder() {
  const dir = mkdtempSync(join(tmpdir(), 'stop-request-'));
  const control = join(dir, '.control.json');
  const journal = join(dir, '.driver-journal.jsonl');
  writeFileSync(journal, [
    { at: '2026-10-26T09:00:00Z', run: 'r1', event: 'agent-start', agent: 'verify:s1' },
    { at: '2026-10-26T10:00:00Z', run: 'r1', event: 'run-end', agent: 'main-session', stoppedAt: 'stop-request' },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  return { dir, control, journal };
}

test('the last run end is read from the journal; a broken line is skipped', () => {
  const { dir, journal } = folder();
  try {
    writeFileSync(journal, '{"event":"run-end" broken\n', { flag: 'a' });
    assert.equal(lastRunEndAt(journal), Date.parse('2026-10-26T10:00:00Z'));
    assert.equal(lastRunEndAt(join(dir, 'none.jsonl')), null);
    assert.equal(madeAfterLastRun({ requestedAt: '2026-10-26T11:00:00Z' }, null), false, 'no run end: not newer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a stop request made after a stop survives the relaunch; the request that stopped the run is cleared', () => {
  const { dir, control, journal } = folder();
  try {
    writeFileSync(control, JSON.stringify({ action: 'stop', after: 'current', requestedAt: '2026-10-26T09:30:00Z' }));
    assert.deepEqual(clearStopRequest(control, journal), { cleared: true });
    assert.equal(existsSync(control), false);

    const later = { action: 'stop', after: 'verify', requestedAt: '2026-10-26T10:05:00Z' };
    writeFileSync(control, JSON.stringify(later));
    assert.deepEqual(clearStopRequest(control, journal), { cleared: false, kept: later });
    assert.equal(existsSync(control), true, 'the request made after the stop waits for the next run');

    assert.deepEqual(clearStopRequest(control, journal, { force: true }), { cleared: true });
    assert.equal(existsSync(control), false, 'the person can still withdraw it');
    assert.deepEqual(clearStopRequest(control, journal), { cleared: false });

    writeFileSync(control, '{ not json');
    assert.deepEqual(clearStopRequest(control, journal), { cleared: true }, 'a broken request is cleared');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
