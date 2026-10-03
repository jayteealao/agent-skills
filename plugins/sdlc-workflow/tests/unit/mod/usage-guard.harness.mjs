// The pure parts of the usage guard (hooks/mod/usage.ts), WF-CAMPAIGN-PLAN
// section 17, run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/usage-guard-mod.test.mjs spawns this file; run-all.mjs never runs it
// directly (no `.test.mjs` suffix).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GUARD_TAG, budgetOfConfig, clearedControlOf, crossToastOf, historyLineOf, levelOf, pauseControlOf, pauseTargetsOf,
  readingOf, resumeDue, resumePromptOf, usageFileOf, usageHistoryFileOf, usageStatusOf,
} from '../../../hooks/mod/usage.ts';

const LIMITS = (five, seven) => [
  { kind: 'five_hour', percentUsed: five, resetsAt: '2026-10-03T13:00:00Z' },
  { kind: 'seven_day', percentUsed: seven, resetsAt: '2026-10-08T00:00:00Z' },
];
const BUDGET = { fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 };

test('a reading goes to one file per session under ~/.claude/sdlc/usage (17.1 step 2)', () => {
  assert.equal(usageFileOf('C:/Users/j', 'abc'), 'C:/Users/j/.claude/sdlc/usage/abc.json');
  assert.equal(usageHistoryFileOf('/home/j', 'abc'), '/home/j/.claude/sdlc/usage/abc.history.jsonl');
  const r = readingOf({ sessionId: 'abc', at: Date.parse('2026-10-03T10:00:00Z'), rateLimits: LIMITS(42, 18), source: 'measure' });
  assert.deepEqual(r, { sessionId: 'abc', at: '2026-10-03T10:00:00.000Z', source: 'measure', rateLimits: LIMITS(42, 18) });
  assert.equal(historyLineOf(r), '{"at":"2026-10-03T10:00:00.000Z","source":"measure","five_hour":42,"seven_day":18}');
});

test('the status shows both windows; no reading shows nothing (17.1 step 3)', () => {
  assert.equal(usageStatusOf(LIMITS(42, 18)), 'usage 5h 42% · 7d 18%');
  assert.equal(usageStatusOf([{ kind: 'five_hour', percentUsed: 7 }]), 'usage 5h 7%');
  assert.equal(usageStatusOf([]), null);
});

test('levels: ok, slow, pause, and the 7-day reserve; a rise gives one toast (17.2)', () => {
  assert.equal(levelOf(LIMITS(40, 20), BUDGET).level, 'ok');
  assert.equal(levelOf(LIMITS(80, 20), BUDGET).level, 'slow');
  const p = levelOf(LIMITS(90, 20), BUDGET);
  assert.equal(p.level, 'pause');
  assert.equal(p.until, '2026-10-03T13:00:00Z');
  const r = levelOf(LIMITS(10, 85), BUDGET);
  assert.equal(r.level, 'pause');
  assert.equal(r.until, '2026-10-08T00:00:00Z');
  assert.match(crossToastOf('ok', levelOf(LIMITS(80, 20), BUDGET)), /5-hour window at 80%/);
  assert.equal(crossToastOf('slow', levelOf(LIMITS(81, 20), BUDGET)), null);
  assert.equal(crossToastOf('pause', levelOf(LIMITS(40, 20), BUDGET)), null, 'a fall gives no toast');
  assert.deepEqual(budgetOfConfig({ yolo: { usageBudget: { fiveHourPause: 85 } } }), { ...BUDGET, fiveHourPause: 85 });
  assert.deepEqual(budgetOfConfig({}), BUDGET);
});

test('pause targets: a live campaign and a live yolo run outside it; a paused or ended run is no target (17.1 step 4)', () => {
  const live = { waves: [{ n: 1, state: 'running', units: ['A'] }], units: { A: { slug: 'engine' } }, pause: null, answers: { budget: { ...BUDGET, fiveHourPause: 80 } } };
  const targets = pauseTargetsOf({
    campaigns: [
      { brainstorm: 'realism', ledger: live },
      { brainstorm: 'old', ledger: { ...live, waves: [{ n: 1, state: 'shipped', units: [] }] } },
      { brainstorm: 'held', ledger: { ...live, pause: { until: 'x' } } },
    ],
    watches: [
      { slug: 'engine', state: { ended: false } },
      { slug: 'solo', state: { ended: false } },
      { slug: 'done', state: { ended: true } },
    ],
    budget: BUDGET,
  });
  assert.deepEqual(targets.map((t) => [t.kind, t.name, t.file, t.budget.fiveHourPause]), [
    ['campaign', 'realism', '.ai/workflows/realism/work/campaign/.control.json', 80],
    ['yolo', 'solo', '.ai/workflows/solo/.control.json', 90],
  ]);
  assert.equal(resumePromptOf(targets[0]), 'The usage window reset. Resume the run with /wf campaign realism.');
  assert.equal(resumePromptOf(targets[1]), 'The usage window reset. Resume the run with /wf yolo solo.');
});

test('the pause the guard writes, its clearing, and when it is due (17.4, 17.6)', () => {
  const t = { kind: 'campaign', name: 'realism', file: 'f' };
  const c = JSON.parse(pauseControlOf(t, { until: '2026-10-03T13:00:00Z', reason: '5-hour window at 91%', now: 0 }));
  assert.deepEqual(c, { action: 'pause', scope: 'campaign', until: '2026-10-03T13:00:00Z', reason: '5-hour window at 91%', requestedAt: '1970-01-01T00:00:00.000Z', by: GUARD_TAG });
  assert.equal(JSON.parse(pauseControlOf({ kind: 'yolo', name: 's', file: 'f' }, { until: 'u', reason: 'r', now: 0 })).scope, undefined);
  assert.deepEqual(JSON.parse(clearedControlOf(0)), { action: 'none', clearedBy: GUARD_TAG, at: '1970-01-01T00:00:00.000Z' });
  const pauses = [{ file: 'a', until: '2026-10-03T13:00:00Z' }, { file: 'b', until: '2026-10-03T15:00:00Z' }, { file: 'c', until: null }];
  assert.deepEqual(resumeDue(pauses, Date.parse('2026-10-03T14:00:00Z')).map((p) => p.file), ['a']);
});
