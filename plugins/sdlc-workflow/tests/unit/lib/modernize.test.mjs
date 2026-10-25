// Modernize: the old stages shape and handoff become intake and ship; the files move.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergedProgress, modernizeWorkflow, stageRenames } from '../../../lib/modernize.mjs';
import { frontmatterOfDoc } from '../../../lib/records.mjs';

test('a merged progress value is the state of the two old stages together', () => {
  const intake = (keep, old) => mergedProgress(keep, old, { newStage: 'intake' });
  assert.equal(intake('complete', 'complete'), 'complete');
  assert.equal(intake('complete', 'not-started'), 'in-progress', 'the shape phase of intake is still to run');
  assert.equal(intake('not-started', 'not-started'), 'not-started');
  assert.equal(intake('skipped', 'skipped'), 'skipped');
  assert.equal(intake('complete', undefined), 'complete');
  const ship = (keep, old) => mergedProgress(keep, old, { newStage: 'ship' });
  assert.equal(ship('not-started', 'complete'), 'in-progress', 'the PR package exists: ship has started');
  assert.equal(ship('complete', 'complete'), 'complete');
  assert.equal(ship('not-started', 'skipped'), 'not-started');
});

test('the renames touch the stage, the progress and the next commands only', () => {
  const index = { 'current-stage': 'shape', 'next-invocation': '/wf shape a', 'next-command': 'wf-shape', progress: { intake: 'complete', shape: 'in-progress', review: 'complete' } };
  assert.deepEqual(stageRenames(index), { 'current-stage': 'intake', 'progress.intake': 'in-progress', 'progress.shape': null, 'next-invocation': '/wf intake a' });
  assert.deepEqual(stageRenames({ 'current-stage': 'plan', progress: { intake: 'complete' } }), {});
});

test('modernize moves the files and renames the stages; --check writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'modernize-'));
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: a\nstatus: active\ncurrent-stage: handoff\nprogress:\n  handoff: complete\n  ship: not-started\n---\n');
    const c = modernizeWorkflow(dir, { check: true });
    assert.deepEqual(c.moved.map((m) => m.from), ['00-index.md']);
    assert.equal(frontmatterOfDoc(dir, '00-index.md')['current-stage'], 'handoff');
    const r = modernizeWorkflow(dir);
    assert.equal(r.ok, true);
    const fm = frontmatterOfDoc(dir, '00-index.md');
    assert.deepEqual([fm['current-stage'], fm.progress], ['ship', { ship: 'in-progress' }]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
