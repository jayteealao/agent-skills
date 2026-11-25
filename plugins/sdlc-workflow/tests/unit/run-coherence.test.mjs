// The run data across the readers: an entry of a stage never takes the place of an answer of the
// person, a stop request that held is a stop for every reader, and the config guards its rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { addDecision, answeredBy, liveDecisions, readDecisions } from '../../lib/decisions.mjs';
import { addRule, readRules, ruleCandidates, rulesChanged } from '../../lib/project-rules.mjs';
import { checkDismissDecision } from '../../lib/wf-ops.mjs';
import { livenessOf } from '../../lib/live-events.mjs';
import { endDecision } from '../../lib/decisions.mjs';

function fixture(slugs = ['demo']) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-coherence-'));
  const dirs = Object.fromEntries(slugs.map((s) => {
    const dir = path.join(root, '.ai', 'workflows', s);
    mkdirSync(dir, { recursive: true });
    return [s, dir];
  }));
  return { root, dir: dirs[slugs[0]], dirs, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a settled entry or a note of a stage does not supersede an answer of the person with the same key', () => {
  const f = fixture();
  try {
    const answer = addDecision(f.dir, { kind: 'answer', key: 'retry-policy', question: 'How often?', answer: 'twice', by: 'person' }).entry;
    const settled = addDecision(f.dir, { kind: 'settled', class: 'implementation-detail', key: 'retry-policy', question: 'How often?', answer: 'twice, with a pause', stage: 'implement', scope: { slice: 'api' } });
    assert.deepEqual(settled.superseded, []);
    const same = addDecision(f.dir, { kind: 'settled', class: 'implementation-detail', key: 'retry-policy', question: 'How often?', answer: 'twice', stage: 'implement' });
    assert.deepEqual(same.superseded, [], 'the same key and the same scope, and the answer of the person still stands');
    const list = readDecisions(f.dir);
    assert.equal(list.find((e) => e.id === answer.id)['superseded-by'] ?? null, null);
    assert.equal(answeredBy(list, 'retry-policy')?.id, answer.id, 'the question is still answered');
    assert.equal(liveDecisions(list).some((e) => e.id === answer.id), true);
    // A later settled entry with the key takes the place of the earlier settled entry only.
    const again = addDecision(f.dir, { kind: 'settled', class: 'implementation-detail', key: 'retry-policy', question: 'How often?', answer: 'three times', stage: 'verify' });
    assert.deepEqual(again.superseded, [same.entry.id]);
    // A run-decisions steer of the person survives a stage entry with its key.
    addDecision(f.dir, { kind: 'steer', key: 'run-decisions', answer: 'Take the recommended option and show me each one at the end' });
    addDecision(f.dir, { kind: 'settled', class: 'implementation-detail', key: 'run-decisions', question: 'q', answer: 'a', stage: 'plan' });
    assert.equal(readDecisions(f.dir).find((e) => e.kind === 'steer' && e.key === 'run-decisions')['superseded-by'] ?? null, null);
  } finally { f.done(); }
});

test('a decision that was ended is named as ended, not as superseded by an id', () => {
  const f = fixture();
  try {
    const s = addDecision(f.dir, { kind: 'steer', answer: 'no modal on the web page' }).entry;
    endDecision(f.dir, s.id, 'the page is gone');
    assert.throws(() => checkDismissDecision(f.dir, s.id), /was ended: the page is gone/);
  } finally { f.done(); }
});

test('a stop request that held ends the silence of a run as an end, not as a hung agent', () => {
  const st = (event) => ({ lastLineAt: 0, longestGapMs: 0, ended: false, newest: { event } });
  const late = 10 * 60 * 60 * 1000;
  assert.equal(livenessOf(st('stop-honoured'), late).state, 'ended');
  assert.equal(livenessOf(st('agent-end'), late).state, 'ended');
  assert.equal(livenessOf(st('agent-start'), late).state, 'stale');
});

test('the rules of the project: a write of the config that changes them is seen, an ended rule is not live, and a left-to-build steer is no candidate', () => {
  const f = fixture(['one', 'two', 'three']);
  try {
    const cfg = (rules) => JSON.stringify({ artifactTracking: 'tracked', rules });
    assert.equal(rulesChanged(cfg([{ key: 'a', text: 'x' }]), cfg([{ key: 'a', text: 'x' }])), false);
    assert.equal(rulesChanged(cfg([{ key: 'a', text: 'x' }]), cfg([{ key: 'a', text: 'y' }])), true);
    assert.equal(rulesChanged(null, cfg([{ key: 'a', text: 'x' }])), true, 'a new config with a rule');
    assert.equal(rulesChanged(null, JSON.stringify({ artifactTracking: 'tracked' })), false);
    assert.equal(rulesChanged('{ not json', cfg([])), false, 'a config that does not parse is judged by its own check');
    addRule(f.root, { key: 'no-deps', text: 'no new runtime deps' });
    assert.deepEqual(readRules(f.root).map((r) => r.key), ['no-deps']);
    const left = 'The person left this to the build. Choose the option that best fits the acceptance criteria, and record the choice as an assumption.';
    for (const s of ['one', 'two', 'three']) addDecision(f.dirs[s], { kind: 'steer', key: `q-${s}`, question: 'Which?', answer: left, stage: 'brainstorm' });
    assert.deepEqual(ruleCandidates(f.root), [], 'three packets that each left a question to the build share no rule');
  } finally { f.done(); }
});
