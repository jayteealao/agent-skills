// tests/unit/lib/records-readers.test.mjs
//
// A workflow that exists only in the record layout (no Markdown record at all) reads the
// same as one of the old layout: status, the lifecycle verdict, the brief, the plan steps,
// the dispatcher and the deferrals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildBrief } from '../../../lib/brief.mjs';
import { openDeferrals } from '../../../lib/deferrals.mjs';
import { diskFacts } from '../../../lib/dispatch.mjs';
import { lifecycleDone } from '../../../lib/lifecycle-done.mjs';
import { writeDoc } from '../../../lib/records.mjs';
import { planSteps } from '../../../lib/steps.mjs';
import { statusOf } from '../../../scripts/wf.mjs';

const REFERENCE_ROOT = join(import.meta.dirname, '..', '..', '..', 'skills', 'wf', 'reference');

function seed() {
  const root = mkdtempSync(join(tmpdir(), 'records-readers-'));
  const dir = join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const put = (name, frontmatter, body = '') => writeDoc(dir, name, { frontmatter: { schema: 'sdlc/v1', slug: 'demo', ...frontmatter }, body });
  put('00-index.md', {
    type: 'index', title: 'Demo', status: 'active', 'current-stage': 'review', 'selected-slice': 'a',
    'updated-at': '2026-10-25T00:00:00Z', 'next-invocation': '/wf review demo a',
    'runtime-evidence-deferrals': [{ slice: 'a', reason: 'needs a device', 'cleared-by': '' }],
  });
  put('01-intake.md', { type: 'intake', status: 'complete' }, '## Success Criteria\n\n- it works\n');
  put('02-shape.md', { type: 'shape', status: 'complete' }, '## Acceptance Criteria\n\n- AC-1 it works\n');
  put('03-slice.md', { type: 'slice-index', status: 'complete', slices: [{ slug: 'a', status: 'ready' }] });
  put('03-slice-a.md', { type: 'slice', 'slice-slug': 'a', status: 'complete' }, '## Goal\n\nShip a.\n\n## Acceptance Criteria\n\n- AC-1\n');
  put('04-plan-a.md', { type: 'plan', 'slice-slug': 'a', status: 'complete' }, '## Step-by-Step Plan\n\n1. **Add the route** — one file\n2. Test it\n');
  put('05-implement-a.md', { type: 'implement', 'slice-slug': 'a', status: 'complete' });
  put('06-verify-a.md', { type: 'verify', 'slice-slug': 'a', status: 'complete', convergence: 'converged', result: 'pass' });
  return { root, dir };
}

test('every reader reads a workflow of the record layout', async () => {
  const { root, dir } = seed();
  try {
    assert.ok(!readdirSync(dir).some((f) => f.endsWith('.md')), 'no Markdown record');

    const s = await statusOf(root, 'demo', Date.parse('2026-10-25T01:00:00Z'));
    assert.equal(s.workflow.stage, 'review');
    assert.equal(s.stages.find((x) => x.stage === 'intake').status, 'complete');
    assert.deepEqual(s.slices, [{ slice: 'a', plan: 'complete', implement: 'complete', verify: 'complete', review: null }]);
    assert.equal(s.next.invocation, '/wf review demo a');

    const v = lifecycleDone(root, 'demo');
    assert.equal(v.verdict, 'not-met');
    assert.deepEqual(v.next, { stage: 'review', slice: 'a' });

    const b = buildBrief({ projectRoot: root, referenceRoot: REFERENCE_ROOT, slug: 'demo', stage: 'implement', slice: 'a' });
    assert.match(b.parts.slice, /Ship a\./);
    assert.match(b.parts.plan, /Add the route/);

    assert.deepEqual(planSteps(dir, 'a'), [{ n: 1, title: 'Add the route' }, { n: 2, title: 'Test it' }]);

    const disk = diskFacts(root, { git: () => '' });
    assert.equal(disk.hasWorkflow('demo'), true);
    assert.deepEqual(disk.slicesOf('demo'), ['a']);

    assert.equal(openDeferrals(dir).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
