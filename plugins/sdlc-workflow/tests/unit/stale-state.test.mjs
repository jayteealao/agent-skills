// State of an older run does not act on a newer run, and one entry does not hide another:
// a stop request for a run that died, a finding at the place of another finding, a wait that a
// note would end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { clearStopRequest, madeForGoneRun } from '../../lib/stop-request.mjs';
import { mergeRun, setStatus, verdictOf } from '../../lib/findings.mjs';
import { addDecision } from '../../lib/decisions.mjs';
import { waitForAnswers } from '../../lib/decide-wait.mjs';
import { holdQuestion } from '../../lib/wf-ops.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-stale-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\n---\n');
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}
const line = (at, run, event) => JSON.stringify({ at, run, event, agent: 'implement:api' });

test('a stop request for a run whose host died does not stop the run that came after it', () => {
  const f = fixture();
  try {
    const journal = path.join(f.dir, '.driver-journal.jsonl');
    const control = path.join(f.dir, '.control.json');
    const asked = { action: 'stop', after: 'current', requestedAt: '2026-11-24T15:00:00Z' };
    // Run r1 worked when the person asked, and wrote no end. Run r2 started the next day.
    writeFileSync(journal, [line('2026-11-24T14:50:00Z', 'r1', 'agent-start'), line('2026-11-25T09:00:00Z', 'r2', 'agent-start')].join('\n'));
    assert.equal(madeForGoneRun(asked, journal), true);
    writeFileSync(control, JSON.stringify(asked));
    assert.deepEqual(clearStopRequest(control, journal), { cleared: true });
    // The same request with r1 still the newest run is for r1: it stands.
    writeFileSync(journal, line('2026-11-24T14:50:00Z', 'r1', 'agent-start'));
    assert.equal(madeForGoneRun(asked, journal), false);
    // A request made between two runs is for the next run.
    writeFileSync(journal, [line('2026-11-24T14:50:00Z', 'r1', 'agent-start'), line('2026-11-24T14:55:00Z', 'r1', 'run-end'), line('2026-11-25T09:00:00Z', 'r2', 'agent-start')].join('\n'));
    assert.equal(madeForGoneRun(asked, journal), false);
    writeFileSync(control, JSON.stringify(asked));
    assert.equal(clearStopRequest(control, journal).cleared, false, 'the person asked after the last run ended: the next run stops on it');
    assert.equal(madeForGoneRun({ action: 'stop' }, journal), false, 'a request with no time is not judged');
  } finally { f.done(); }
});

test('a finding of another dimension at the same place is a new finding, and a set-aside finding that comes back graver opens again', () => {
  const T1 = '2026-11-25T10:00:00Z';
  const T2 = '2026-11-25T11:00:00Z';
  const style = { dimension: 'style', severity: 'LOW', file: 'src/a.js', line: '10', issue: 'A long line.' };
  let ledger = mergeRun({ findings: [], runs: [] }, [style], { now: T1 }).ledger;
  setStatus(ledger, 'STY-1', 'dismissed', 'the person keeps the long line', { now: T1 });
  const sql = { dimension: 'security', severity: 'BLOCKER', file: 'src/a.js', line: '12', issue: 'SQL injection.' };
  const r = mergeRun(ledger, [style, sql], { now: T2 });
  assert.deepEqual(r.added, ['SEC-1'], 'the security finding takes no id and no dismissal of the style finding');
  assert.equal(r.ledger.findings.find((x) => x.id === 'STY-1').status, 'dismissed');
  assert.equal(verdictOf(r.ledger), 'dont-ship');
  // The same finding comes back as a graver one: its dismissal was for the lesser one.
  ledger = mergeRun({ findings: [], runs: [] }, [style], { now: T1 }).ledger;
  setStatus(ledger, 'STY-1', 'dismissed', 'small', { now: T1 });
  const back = mergeRun(ledger, [{ ...style, severity: 'HIGH' }], { now: T2 }).ledger.findings[0];
  assert.deepEqual([back.status, back.severity, back['set-aside-before'][0].status], ['open', 'HIGH', 'dismissed']);
});

test('an accepted item of one slice is not closed by the accept of the next slice', () => {
  const a = { dimension: 'residual', severity: 'HIGH', file: null, line: null, key: 'AC3 of slice a', issue: 'AC3 misses by 2 percent.' };
  const b = { dimension: 'residual', severity: 'HIGH', file: null, line: null, key: 'AC1 of slice b', issue: 'AC1 fails on a cold start.' };
  let r = mergeRun({ findings: [], runs: [] }, [a], { now: '2026-11-25T10:00:00Z', dimensions: ['residual'] });
  r = mergeRun(r.ledger, [b], { now: '2026-11-25T11:00:00Z', dimensions: ['residual'] });
  assert.deepEqual(r.resolved, []);
  assert.deepEqual(r.ledger.findings.map((x) => x.status), ['open', 'open']);
});

test('a question is held by its key and its slice, and a note does not end a wait for the person', () => {
  const f = fixture();
  try {
    holdQuestion(f.dir, { key: 'api-shape', question: 'REST or RPC?', stage: 'verify', slice: 'a' });
    const second = holdQuestion(f.dir, { key: 'api-shape', question: 'One endpoint or two?', stage: 'plan', slice: 'b' });
    assert.equal(second.replaced, false, 'the question of slice a stays in the index');
    addDecision(f.dir, { kind: 'note', key: 'api-shape', answer: 'the plan of b assumes RPC', scope: { slice: 'a' }, stage: 'plan' });
    let t = 0;
    const r = waitForAnswers(f.dir, { keys: ['api-shape'], scope: { slice: 'a' }, callMs: 3000, pollMs: 1000, now: () => t, sleep: (ms) => { t += ms; } });
    assert.equal(r.state, 'waiting', 'a note with the same key is not the answer');
    addDecision(f.dir, { kind: 'answer', key: 'api-shape', question: 'REST or RPC?', answer: 'REST', scope: { slice: 'a' } });
    assert.equal(waitForAnswers(f.dir, { keys: ['api-shape'], scope: { slice: 'a' } }).state, 'answered');
  } finally { f.done(); }
});
