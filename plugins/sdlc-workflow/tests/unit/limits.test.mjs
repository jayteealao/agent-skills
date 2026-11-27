// The size limits of slices and packets come from one place: the project config, else the defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DEFAULT_LIMITS, estimateSteps, limitsOf, limitsOfConfig, limitsOr } from '../../lib/limits.mjs';
import { draftProblems } from '../../lib/record-put.mjs';
import { placeIssue } from '../../lib/issue-place.mjs';
import { checkList } from '../../lib/packets.mjs';

const projectWith = (cfg) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wf-limits-'));
  mkdirSync(path.join(root, '.ai'), { recursive: true });
  if (cfg !== undefined) writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), typeof cfg === 'string' ? cfg : JSON.stringify(cfg));
  return root;
};

test('the defaults: 20 steps, 14 slices, a budget of 280 steps', () => {
  assert.deepEqual(DEFAULT_LIMITS, { maxSteps: 20, maxSlices: 14, targetSlices: 10, minSlices: 6, budgetSteps: 280 });
  assert.deepEqual(limitsOf(null), DEFAULT_LIMITS);
  assert.deepEqual(limitsOr(undefined), DEFAULT_LIMITS);
});

test('a project sets the step limit, the slice limit and the budget; a bad value reads as the default', () => {
  assert.equal(limitsOfConfig({ slices: { maxSteps: 30 } }).budgetSteps, 420);
  assert.equal(limitsOfConfig({ slices: { maxSteps: 30, maxPerPacket: 8 } }).targetSlices, 8);
  assert.equal(limitsOfConfig({ slices: { maxSteps: 30 }, packets: { maxSteps: 200 } }).budgetSteps, 200);
  assert.equal(limitsOfConfig({ slices: { maxSteps: -1 } }).maxSteps, 20);
  assert.equal(limitsOfConfig({ slices: { maxSteps: '30' } }).maxSteps, 20);
});

test('limitsOf reads the config of the project, with a byte order mark, and survives a broken one', () => {
  const roots = [projectWith(`﻿${JSON.stringify({ slices: { maxSteps: 25 } })}`), projectWith('{ not json'), projectWith()];
  try {
    assert.equal(limitsOf(roots[0]).maxSteps, 25);
    assert.deepEqual(limitsOf(roots[1]), DEFAULT_LIMITS);
    assert.deepEqual(limitsOf(roots[2]), DEFAULT_LIMITS);
  } finally { for (const r of roots) rmSync(r, { recursive: true, force: true }); }
});

test('the step estimate: 4 fixed, 1 a finding, 2 a new behaviour, 1 a steer, and 10%', () => {
  assert.equal(estimateSteps(), 5);
  assert.equal(estimateSteps({ findings: 10, behaviours: 2, steers: 3 }), 24);
  assert.equal(estimateSteps({ findings: 'x' }), 5);
});

test('the plan put refuses past the step limit of the project, not past 20', () => {
  const root = projectWith({ slices: { maxSteps: 30 } });
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wf-limits-dir-'));
  try {
    mkdirSync(path.join(dir, '.draft'));
    const draft = path.join(dir, '.draft', '04-plan-api.md');
    const plan = (n) => `---\nstatus: complete\n---\n## Step-by-Step Plan\n\n${Array.from({ length: n }, (_, i) => `${i + 1}. **S${i + 1}** — files: \`a.js\`.`).join('\n')}\n`;
    writeFileSync(draft, plan(25));
    assert.deepEqual(draftProblems(draft, dir, { root }), []);
    assert.match(draftProblems(draft, dir).join(' '), /20 steps or fewer/);
    writeFileSync(draft, plan(31));
    assert.match(draftProblems(draft, dir, { root }).join(' '), /30 steps or fewer/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

test('the placer judges room against the step limit it is given', () => {
  const inv = {
    cause: { summary: 'x', confidence: 'reproduced' }, scope: { inside: true }, owner: { slice: null },
    coverage: [{ slice: 'b', covers: true }], size: { steps: 25 },
  };
  const slices = [{ slice: 'b', order: 0, done: false, started: false }];
  assert.notEqual(placeIssue(inv, { slices }).target, 'b');
  assert.equal(placeIssue(inv, { slices, maxSteps: 30 }).target, 'b');
});

test('the packet band follows the limits of the project', () => {
  const board = { work: [{ key: 'W1', title: 'w', goal: 'g', 'acceptance-criteria': ['a'], 'ux-impact': 'none', 'ux-impact-confirmed': true, 'estimated-slices': 12, state: 'proposed', form: 'intake' }] };
  const w = (limits) => checkList(board, { limits }).warnings.filter((x) => /slices, above/.test(x));
  assert.equal(w(null).length, 0);
  assert.equal(w(limitsOfConfig({ slices: { maxPerPacket: 10 } })).length, 1);
  assert.equal(w(limitsOfConfig({ packets: { maxSteps: 200 } })).length, 1);
});
