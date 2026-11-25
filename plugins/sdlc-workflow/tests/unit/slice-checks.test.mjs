// The results of the slice checks of an implement, and the fixes of the run that go with the talk:
// the answer of the person to the run-decisions question, an ended rule, the start of a watch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { addCheck, checkLine, checkState, checksOf, checksSection, countChecks, isProse, unmetLines } from '../../lib/slice-checks.mjs';
import { delegatesDecisions } from '../../lib/decisions.mjs';
import { addRule, endRule, readRules } from '../../lib/project-rules.mjs';
import { judgeSilence } from '../../lib/live-events.mjs';
import { REPO_STALE_MS, keptWatchFrom, resumedState } from '../../scripts/yolo-watch.mjs';
import { driveArgs } from '../../lib/drive.mjs';
import { markSeen, ping, post, readTalk, unreadFor, watchEventsOf } from '../../lib/talk.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-checks-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}
const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const names = { HEAD: B, base: A };
const git = { resolve: (n) => names[n] ?? (/^[0-9a-f]{40}$/.test(n) ? n : null), isAncestor: (base, tip) => base === A && tip === B };

test('a check is met only by an exit code that wf saw, and a carried red needs a failed run at the base commit', () => {
  const f = fixture();
  try {
    const ok = { by: 'run', exit: 0, log: '/logs/x.log', command: 'npm run guards' };
    assert.throws(() => addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'green' }, git), /--result must be one of met, not-met, not-run/);
    assert.throws(() => addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'met', sha: 'HEAD' }, git), /a check is met by its exit code, not by your word/);
    assert.throws(() => addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'met', sha: 'HEAD', proof: { by: 'run', exit: 1 } }, git), /not by your word/);
    assert.throws(() => addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'not-met' }, git), /--sha <the commit that the check ran on> is required/);
    assert.throws(() => addCheck(f.dir, { slice: 'api', result: 'not-met', sha: 'HEAD' }, git), /--name is required/);
    const row = addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'met', sha: 'HEAD', proof: ok }, git);
    assert.equal(row.sha, B);
    assert.equal(row.required, true);
    assert.deepEqual(row.proof, ok);
    assert.match(checkLine(row), /guard set: met at bbbbbbbb \(run by wf, exit 0\)/);
    assert.equal(addCheck(f.dir, { slice: 'api', name: 'device', result: 'not-run', required: false }, git).sha, undefined);
    // A red of an earlier slice: a job ran the same check on the base commit and failed there.
    const red = { slice: 'api', name: 'old red', result: 'not-met', sha: 'HEAD', carriedFrom: 'base' };
    assert.throws(() => addCheck(f.dir, red, git), /needs --base-job, a job that ran the same check at the base commit and failed there/);
    assert.throws(() => addCheck(f.dir, { ...red, base: { id: 'J-1', head: A, exit: 0 } }, git), /needs --base-job/, 'the check passed at the base: the red is of this slice');
    assert.throws(() => addCheck(f.dir, { ...red, base: { id: 'J-1', head: B, exit: 1 } }, git), /needs --base-job/, 'the job ran on another commit');
    assert.throws(() => addCheck(f.dir, { ...red, result: 'met', proof: ok, base: { id: 'J-1', head: A, exit: 1 } }, git), /--carried-from is for a check that is not met/);
    assert.throws(() => addCheck(f.dir, { ...red, carriedFrom: 'HEAD', base: { id: 'J-1', head: B, exit: 1 } }, git), /is not a commit before/);
    const carried = addCheck(f.dir, { ...red, base: { id: 'J-1', head: A, exit: 1, log: '/logs/base.log' } }, git);
    assert.deepEqual(carried.carried, { base: A, job: 'J-1', log: '/logs/base.log' });
    // The newest row of a check stands.
    addCheck(f.dir, { slice: 'api', name: 'guard set', result: 'not-met', sha: 'HEAD', note: '2 of 40 red' }, git);
    assert.deepEqual(checksOf(f.dir, 'api').map((c) => [c.name, c.result]), [['guard set', 'not-met'], ['device', 'not-run'], ['old red', 'not-met']]);
    assert.equal(checksOf(f.dir, 'web').length, 0);
    assert.equal(unmetLines(f.dir, 'api').length, 2);
    assert.match(unmetLines(f.dir, 'api')[0], /guard set: not-met at bbbbbbbb — 2 of 40 red/);
  } finally { f.done(); }
});

test('the plan says how many checks there are and which one is optional', () => {
  const plan = '# Plan\n\n## Slice Checks\n\n- the tests of the slice: `npm test`\n- the guard set: `npm run guards`\n  - a note under it\n- the device check (optional): `npm run device`\n\n## Risks\n\n- none\n';
  assert.equal(checksSection('# Plan\n\n## Steps\n'), null);
  assert.equal(countChecks(checksSection(plan)), 3);
  const at = { planned: true, head: B, changedSince: () => [] };
  const met = (name) => ({ name, result: 'met', required: true, sha: B });
  assert.deepEqual(checkState([met('tests')], { ...at, count: 3 }).blocking, ['the plan lists 3 slice checks, and 1 is recorded']);
  assert.deepEqual(checkState([met('tests'), met('guards'), { name: 'device', result: 'not-run', required: false }], { ...at, count: 3, optionalOk: true }).blocking, []);
  // An agent cannot make a check optional that the plan does not mark.
  assert.deepEqual(checkState([met('tests'), met('guards'), { name: 'device', result: 'not-run', required: false }], { ...at, count: 3, optionalOk: false }).blocking, ['the check "device" did not run']);
});

test('the end of an implement: a required check that did not run on the last code blocks, a check that is not met goes to verify', () => {
  const at = (changed) => ({ planned: true, head: B, changedSince: () => changed });
  const met = { name: 'guard set', result: 'met', required: true, sha: B };
  assert.deepEqual(checkState([met], at([])).blocking, []);
  assert.deepEqual(checkState([], at([])).blocking, ['the plan has slice checks, and no result of a check is recorded']);
  assert.deepEqual(checkState([], { planned: false, head: B, changedSince: () => [] }).blocking, [], 'a plan with no slice checks needs none');
  assert.deepEqual(checkState([{ name: 'end run', result: 'not-run', required: true }], at([])).blocking, ['the check "end run" did not run']);
  assert.deepEqual(checkState([{ name: 'device', result: 'not-run', required: false }], at([])).blocking, []);
  // A check that ran on an older commit: code after it makes it stale, prose does not.
  const old = { ...met, sha: A };
  assert.deepEqual(checkState([old], at(['src/save.rs'])).blocking, ['the check "guard set" ran on aaaaaaaa, and code changed after it']);
  assert.deepEqual(checkState([old], at(['docs/how-to/run.md', '.ai/notes.json', 'README.md'])).blocking, []);
  assert.equal(checkState([old], at(null)).blocking.length, 1, 'when git cannot compare the commits, the check counts as not run');
  // A measured read that is not met does not block: verify rules on it. A stale one does block.
  const read = { name: 'match read', result: 'not-met', required: true, sha: B, note: '0.637 against 0.305' };
  const st = checkState([met, read], at([]));
  assert.deepEqual(st.blocking, []);
  assert.deepEqual(st.unmet.map((c) => c.name), ['match read']);
  assert.equal(checkState([{ ...read, sha: A }], at(['src/save.rs'])).blocking.length, 1);
  assert.equal(isProse('docs/x.png'), true);
  assert.equal(isProse('src/readme.rs'), false);
});

test('the run-decisions answer: a clause about the digest does not turn "take the recommended option" into "stop and ask"', () => {
  assert.equal(delegatesDecisions('take the recommended option, no need to show me'), true);
  assert.equal(delegatesDecisions('Take the recommended option and do not show me each one'), true);
  assert.equal(delegatesDecisions('take the recommended option; no digest'), true);
  assert.equal(delegatesDecisions('Take the recommended option and show me each one at the end'), true);
  // A condition is not a plain yes.
  for (const a of ['Take the recommended option, but show me each one first', 'take the recommended option, and tell me before each one',
    'take the recommended option; report to me before you act on any', 'Take the recommended one unless it changes scope', 'go with the recommended option only for tests']) {
    assert.equal(delegatesDecisions(a), false, a);
  }
  // A later clause that says stop, wait or ask still asks.
  assert.equal(delegatesDecisions('take the recommended option, but stop and ask me about data loss'), false);
  assert.equal(delegatesDecisions('do not take the recommended option, show me each one'), false);
  assert.equal(delegatesDecisions('no'), false);
  assert.equal(delegatesDecisions('Stop and wait for me'), false);
});

test('an ended rule stays in the config with its reason, binds nothing, and its key is free again', () => {
  const f = fixture();
  try {
    addRule(f.root, { key: 'no-deps', text: 'no new runtime deps' });
    const ended = endRule(f.root, 'no-deps', 'the bundler handles it now');
    assert.equal(ended['ended-why'], 'the bundler handles it now');
    assert.ok(ended.ended);
    assert.deepEqual(readRules(f.root), []);
    const cfg = JSON.parse(readFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), 'utf8'));
    assert.equal(cfg.rules.length, 1, 'the rule is kept as history');
    assert.throws(() => endRule(f.root, 'no-deps', 'again'), /no rule no-deps/);
    assert.equal(addRule(f.root, { key: 'no-deps', text: 'no new deps at all' }).replaced, false);
    assert.deepEqual(readRules(f.root).map((r) => r.text), ['no new deps at all']);
  } finally { f.done(); }
});

test('a watch that starts hours after the last one does not call the old run stale', () => {
  const now = Date.parse('2026-11-25T12:53:00Z');
  const yesterday = Date.parse('2026-11-24T15:12:00Z');
  const saved = { watchFrom: yesterday - 60_000, lastLineAt: yesterday, newest: { event: 'agent-start', agent: 'implement:api' } };
  assert.equal(keptWatchFrom({ ...saved, polledAt: yesterday + 60_000 }, now), now, 'no watch polled for hours: a new launch');
  assert.equal(keptWatchFrom(saved, now), now, 'a state with no poll time is a new launch');
  // A re-arm minutes after the last poll watches the same run: its silence counts from its last line.
  assert.equal(keptWatchFrom({ ...saved, polledAt: now - 60_000 }, now), saved.watchFrom);
  assert.ok(REPO_STALE_MS >= 60 * 60 * 1000);
  // The run of the old state is history: its newest line and its open stages raise no alert in the new watch.
  const old = resumedState({ ...saved, polledAt: yesterday + 60_000, run: 'r1', offset: 420, openStages: { 'implement:api': 1 }, talkSeen: 'T-9' }, now);
  assert.deepEqual([old.newest, old.lastLineAt, old.run, old.endedRun, old.offset, old.talkSeen, old.watchFrom], [null, null, null, 'r1', 420, 'T-9', now]);
  assert.deepEqual(old.openStages, {});
  const rearm = resumedState({ ...saved, polledAt: now - 60_000, run: 'r1' }, now);
  assert.deepEqual([rearm.run, rearm.lastLineAt, rearm.watchFrom], ['r1', yesterday, saved.watchFrom]);
  // The transcript of the old agent does not make the run stale before the watch started.
  const st = { ended: false, lastLineAt: yesterday, newest: { event: 'agent-start', agent: 'implement:api' }, longestGapMs: 0, staleFor: null, run: 'r1' };
  assert.deepEqual(judgeSilence('demo', { ...st }, now + 60_000, now, yesterday + 5000), []);
  assert.equal(judgeSilence('demo', { ...st }, now + 6 * 60 * 60 * 1000, now, yesterday + 5000)[0]?.event, 'stale', 'silence after the watch started still counts');
});

test('the Codex launch passes the overlap settings of the walk', () => {
  const base = { projectRoot: '/r', referenceRoot: '/ref', slug: 'demo', run: 'r1', staged: { models: {}, recordsRoot: '/rec' } };
  const d = driveArgs(base);
  assert.equal('planAhead' in d || 'verifyBehind' in d || 'pairSlices' in d, false, 'the defaults of the driver stand');
  const o = driveArgs({ ...base, planAhead: false, verifyBehind: false, pairSlices: true });
  assert.deepEqual([o.planAhead, o.verifyBehind, o.pairSlices], [false, false, true]);
});

test('the watch: a post for the session, a ping and a fallback are news; another post is routine', () => {
  const f = fixture();
  try {
    const T0 = Date.parse('2026-11-25T12:00:00Z');
    post(f.dir, { by: 'verify:core', to: 'api', kind: 'handover', text: 'fix in abc123' }, { now: T0 });
    post(f.dir, { by: 'implement:api', to: 'session', text: 'the plan names a file that is gone' }, { now: T0 + 1000 });
    post(f.dir, { by: 'implement:api', to: 'verify:core', text: 'more fixes?', wantsReply: true, fallback: 'go on' }, { now: T0 + 2000 });
    ping(f.dir, 'talk', 'T-3', { now: T0 + 3000 });
    const evs = watchEventsOf('demo', readTalk(f.dir), 0);
    assert.deepEqual(evs.map((e) => [e.event, Boolean(e.routine)]), [['talk', true], ['talk', false], ['talk', true], ['talk-ping', false]]);
    assert.equal(evs[3].auto, true);
    assert.equal(evs[3].from, 'implement:api');
    assert.deepEqual(watchEventsOf('demo', readTalk(f.dir), 'T-3').map((e) => e.event), ['talk-ping']);
    // A ping is news to its receiver once: after it saw it, the same ping is not news again.
    assert.equal(unreadFor(readTalk(f.dir), 'verify:core').pings.length, 1);
    markSeen(f.dir, 'verify:core', { now: T0 + 4000 });
    assert.equal(unreadFor(readTalk(f.dir), 'verify:core').pings.length, 0);
    assert.equal(unreadFor(readTalk(f.dir), 'verify:core').messages.length, 1, 'the message itself is still not read');
  } finally { f.done(); }
});
