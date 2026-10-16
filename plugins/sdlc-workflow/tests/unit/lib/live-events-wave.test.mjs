// WF-CAMPAIGN-DRIVER-PLAN W5 — the live events of a wave driver unit. The wave driver
// labels a unit agent `<stage>:<slice>@<slug>`, writes `"driver":"campaign-wave"` and
// `"campaign":"<brainstorm>"` on each heartbeat line, and appends a `waiting` line when it
// parks a unit (section 5.3 items 5, 6 and 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyLines, freshRunState, judgeSilence, resumeCommand, stageOf } from '../../../lib/live-events.mjs';

const RUN = '20261016T100000Z-alpha';
const line = (seq, event, agent, extra = {}) => ({
  at: `2026-10-16T10:${String(seq).padStart(2, '0')}:00Z`, run: RUN, seq, event, agent,
  driver: 'campaign-wave', campaign: 'brain', campaignRun: '20261016T100000Z-brain-w1', ...extra,
});

test('stageOf: a label with @<slug> gives the stage and the slice without the slug', () => {
  assert.deepEqual(stageOf({ agent: 'implement:s1@alpha' }), { stage: 'implement', slice: 's1' });
  assert.deepEqual(stageOf({ agent: 'verify:s1@alpha', stage: 'verify', slice: '' }), { stage: 'verify', slice: 's1' });
  assert.deepEqual(stageOf({ agent: 'review@alpha' }), { stage: 'review', slice: null });
  assert.deepEqual(stageOf({ agent: 'scout:correctness:s1@alpha' }), { stage: null, slice: null }, 'a scout is not a stage');
  assert.deepEqual(stageOf({ agent: 'implement:s1' }), { stage: 'implement', slice: 's1' }, 'a yolo label is unchanged');
});

test('applyLines: a stop of a wave driver unit resumes through its campaign; a yolo stop through the slug', () => {
  const st = freshRunState();
  const events = applyLines('alpha', st, [
    line(1, 'agent-start', 'implement:s1@alpha', { stage: 'implement', slice: 's1' }),
    line(2, 'agent-end', 'implement:s1@alpha', { stage: 'implement', slice: 's1', status: 'hard-stop' }),
  ]);
  const stop = events.find((e) => e.event === 'stop');
  assert.equal(stop.resume, '/wf campaign brain');
  assert.equal(stop.slice, 's1');
  assert.deepEqual(events.filter((e) => e.event === 'stage-start').map((e) => [e.stage, e.slice]), [['implement', 's1']]);
  assert.equal(resumeCommand('alpha', freshRunState(), {}), '/wf yolo alpha');
  assert.equal(resumeCommand('alpha', freshRunState(), { driver: 'yolo', campaign: 'brain' }), '/wf yolo alpha', 'a yolo drive of a campaign resumes as before');
});

test('judgeSilence: a newest waiting line gives no inferred run-end and no stale event after 20 minutes', () => {
  const st = freshRunState();
  applyLines('alpha', st, [
    line(1, 'agent-start', 'park:stage@alpha'),
    line(2, 'agent-end', 'park:stage@alpha', { status: 'complete' }),
    { at: '2026-10-16T10:03:00Z', run: RUN, event: 'waiting', question: 'w1-A-1' },
  ]);
  const now = Date.parse('2026-10-16T11:30:00Z');
  assert.deepEqual(judgeSilence('alpha', st, now, Date.parse('2026-10-16T10:00:00Z')), []);
  assert.equal(st.ended, false);
  // The same silence after an agent-end, with no waiting line, is an inferred run-end.
  const other = freshRunState();
  applyLines('alpha', other, [line(1, 'agent-start', 'park:stage@alpha'), line(2, 'agent-end', 'park:stage@alpha', { status: 'complete' })]);
  assert.equal(judgeSilence('alpha', other, now, Date.parse('2026-10-16T10:00:00Z'))[0].event, 'run-end');
});
