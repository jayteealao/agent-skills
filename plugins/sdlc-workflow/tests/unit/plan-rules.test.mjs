// The slice rules of a plan: the step limit, and no test run in the done check of a step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { STEP_LIMIT, planRuleProblems } from '../../lib/steps.mjs';
import { draftProblems } from '../../lib/record-put.mjs';

const plan = (lines) => `---\ntype: plan\n---\n# Plan: api\n\n## Step-by-Step Plan\n\n${lines.join('\n')}\n\n## Slice Checks\n\n- \`npm test\`\n`;
const kinds = (body) => planRuleProblems(body).map((p) => p.kind);

test('a step with a static done check is not a problem', () => {
  assert.deepEqual(kinds(plan([
    '1. **Route** — files: `a.js`. Done when: `tsc --noEmit` passes.',
    '2. **Store** — files: `b.rs`. Done when: `cargo check -p store --tests` passes.',
    '3. **Docs** — files: `README.md`. Done when: the file names the route.',
    '4. **No check** — files: `c.js`.',
  ])), []);
});

test('a done check that runs a test is a problem, in each form', () => {
  for (const cmd of ['`npm test` passes', '`cargo nextest run -p engine` passes', '`./gradlew :app:testDebugUnitTest` passes', '`pytest tests/unit` passes', '`npm run test:unit` passes', 'the tests pass', '`maestro test flows/a.yaml` passes']) {
    assert.deepEqual(kinds(plan([`1. **Route** — files: \`a.js\`. Done when: ${cmd}.`])), ['step-test'], cmd);
  }
});

test('a probe step may run its one check', () => {
  assert.deepEqual(kinds(plan(['1. **Measure the parse** (probe) — files: `a.js`. Done when: `npm test -- parse` passes.'])), []);
});

test('the done check of a heading step is read from its body', () => {
  const body = '## Step-by-Step Plan\n\n### Step 1: Route\n\nfiles: `a.js`\n\nDone when: `cargo test -p api` passes.\n\n### Step 2: Store\n\nDone when: `cargo check` passes.\n';
  const out = planRuleProblems(body);
  assert.equal(out.length, 1);
  assert.match(out[0].text, /^step 1 \("Route"\)/);
});

test('more steps than the limit is a problem', () => {
  const steps = Array.from({ length: STEP_LIMIT + 1 }, (_, i) => `${i + 1}. **S${i + 1}** — files: \`a.js\`.`);
  assert.deepEqual(kinds(plan(steps)), ['limit']);
  assert.deepEqual(kinds(plan(steps.slice(0, STEP_LIMIT))), []);
});

test('a put refuses a new problem and keeps a problem that the stored plan already has', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'wf-plan-rules-'));
  try {
    const drafts = path.join(dir, '.draft');
    mkdirSync(drafts);
    const draft = path.join(drafts, '04-plan-api.md');
    const long = Array.from({ length: STEP_LIMIT + 5 }, (_, i) => `${i + 1}. **S${i + 1}** — files: \`a.js\`.`);
    writeFileSync(draft, plan(long));
    assert.match(draftProblems(draft, dir).join(' '), /20 steps or fewer/);
    // The stored plan is already over the limit: a new write of it is not refused for the limit.
    writeFileSync(path.join(dir, '04-plan-api.md'), plan(long));
    assert.deepEqual(draftProblems(draft, dir), []);
    // A test run in a step is a new kind of problem, so it is refused.
    writeFileSync(draft, plan([...long.slice(0, 3), '4. **T** — files: `a.js`. Done when: `npm test` passes.']));
    assert.match(draftProblems(draft, dir).join(' '), /done check runs a test/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
