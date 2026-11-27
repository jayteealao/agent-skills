// The decision of one tick of the records committer (lib/records-committer.mjs): when it syncs.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TIMES, due, parkedText } from '../../lib/records-committer.mjs';

const T = 10_000_000;
const state = (more = {}) => ({ syncStarted: T - 100_000, ...more });

test('a plain change waits for the quiet time; an urgent one goes at once, 10 s after the last push', () => {
  const wake = { at: T - 1_000, first: T - 1_000 };
  assert.equal(due({ t: T, wake, state: state(), watches: 0 }), false, 'a fresh plain change waits');
  assert.equal(due({ t: T + TIMES.quietMs, wake, state: state(), watches: 0 }), true, 'then it goes');
  assert.equal(due({ t: T + TIMES.quietMs, wake, state: state(), watches: 0, jitter: 5_000 }), false, 'the jitter moves it');
  const urgent = { ...wake, urgent: true };
  assert.equal(due({ t: T, wake: urgent, state: state(), watches: 0, lastPushAt: T - 20_000 }), true);
  assert.equal(due({ t: T, wake: urgent, state: state(), watches: 0, lastPushAt: T - 5_000 }), false, 'at least 10 s between pushes');
});

test('nothing unsent and no watch: no sync; a watch fetches each minute; a limit backs off', () => {
  const sent = { at: T - 200_000, first: T - 200_000 };
  assert.equal(due({ t: T, wake: sent, state: state(), watches: 0 }), false, 'the wake is older than the last sync');
  assert.equal(due({ t: T, wake: sent, state: state(), watches: 1 }), true, 'a wait keeps the fetch going');
  assert.equal(due({ t: T, wake: sent, state: state({ syncStarted: T - 1_000 }), watches: 1 }), false);
  const wake = { at: T - 100_000, first: T - 100_000, urgent: true };
  assert.equal(due({ t: T, wake, state: state({ syncStarted: T - 200_000, backoffUntil: new Date(T + 60_000).toISOString() }), watches: 1 }), false, 'a limit of GitHub stops every sync');
  assert.equal(due({ t: T, wake: sent, state: state({ pending: true, syncStarted: T - TIMES.quietMs }), watches: 0 }), true, 'a unit that a run held back goes again');
});

test('a parked unit with no owner is named as a race, not as owned by another computer; an old writer is named', () => {
  const owned = parkedText({ branch: 'conflict/dragon-1', units: ['p/a'], unowned: [] });
  assert.match(owned, /p\/a parked on conflict\/dragon-1: another computer owns it/);
  const raced = parkedText({ branch: 'conflict/dragon-1', units: ['p/a', 'p/b'], unowned: ['p/b'] }, { commits: 2, last: { subject: 'b: record put', at: '2026-11-27T22:31:48Z' } });
  assert.match(raced, /p\/a parked .*another computer owns it/);
  assert.match(raced, /p\/b parked .*the remote changed it after this computer's last sync/);
  assert.doesNotMatch(raced.split(';')[1], /another computer owns/);
  assert.match(raced, /a session on a wf from before the compose sync .*"b: record put".*restart it/);
});
