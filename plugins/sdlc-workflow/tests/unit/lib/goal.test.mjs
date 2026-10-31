// lib/goal.mjs: the contract, the GOAL: line, the condition text, and
// the verdict of each kind. Nothing here asks a model: the verdict is deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONDITION_LIMIT, armPlan, conditionText, contractErrors, fromLifecycle, fromOptimize, fromProofs, goalLine, lastGoalLine, precheck,
} from '../../../lib/goal.mjs';

const contract = (over = {}) => ({ objective: 'x', kind: 'lifecycle', 'max-checks': 3, state: 'armed', ...over });

test('a contract needs an objective, a kind, a cap, and proofs for kind proofs', () => {
  assert.deepEqual(contractErrors(contract()), []);
  assert.ok(contractErrors(contract({ kind: 'proofs' })).some((e) => /proof/.test(e)));
  assert.ok(contractErrors(contract({ 'max-checks': 0 })).some((e) => /max-checks/.test(e)));
});

test('the GOAL: line is the last line, and parses back', () => {
  assert.equal(goalLine('MET'), 'GOAL: MET');
  assert.equal(goalLine('BLOCKED', 'gate design\nnow'), 'GOAL: BLOCKED gate design now');
  assert.deepEqual(lastGoalLine('a\nGOAL: NOT-MET next: verify a\n'), { verdict: 'NOT-MET', reason: 'next: verify a' });
  assert.equal(lastGoalLine('no line'), null);
});

test('the condition names the check command, maps BLOCKED to impossible, and states the cap', () => {
  const c = conditionText({ script: 'C:\\p\\skills\\wf\\scripts\\goal.mjs', root: 'C:\\repo', slug: 's', maxChecks: 30 });
  assert.match(c, /node "C:\/p\/skills\/wf\/scripts\/goal\.mjs" check "C:\/repo" s/);
  assert.match(c, /GOAL: BLOCKED`, the goal is impossible/);
  assert.match(c, /Stop after 30 checks/);
  assert.ok(c.length < CONDITION_LIMIT);
  assert.equal(armPlan('claude-code', c).command, `/goal ${c}`);
  assert.equal(armPlan('codex', c).how, 'create_goal');
  assert.equal(armPlan('pi', c).how, 'in-session');
});

test('a parked gate and a used cap block before the rule runs', () => {
  assert.equal(precheck(contract({ parked: { gate: 'design' } }), 0).reason, 'gate design');
  assert.match(precheck(contract(), 3).reason, /^budget/);
  assert.equal(precheck(contract(), 2), null);
  assert.equal(precheck(contract({ state: 'cleared' }), 0).verdict, 'BLOCKED');
  assert.equal(precheck(null, 0).verdict, 'BLOCKED');
});

test('each kind maps to a goal verdict', () => {
  assert.equal(fromLifecycle({ verdict: 'met' }).verdict, 'MET');
  assert.match(fromLifecycle({ verdict: 'not-met', reason: 'r', next: { stage: 'verify', slice: 'a' } }).reason, /^next: verify a/);
  assert.equal(fromLifecycle({ verdict: 'blocked', reason: 'gate' }).verdict, 'BLOCKED');
  assert.equal(fromOptimize({ ok: true, state: 'complete' }).verdict, 'MET');
  assert.equal(fromOptimize({ ok: true, state: 'stopped', reason: 'plateau' }).verdict, 'BLOCKED');
  assert.equal(fromOptimize({ ok: true, state: 'running', next: { action: 'trial', on: 'optimize/s' } }).verdict, 'NOT-MET');
  assert.equal(fromProofs([{ command: 'a', code: 0 }]).verdict, 'MET');
  assert.equal(fromProofs([{ command: 'a', code: 0 }, { command: 'b', code: 1 }]).reason, '1 of 2 proof(s) fail: b');
});
