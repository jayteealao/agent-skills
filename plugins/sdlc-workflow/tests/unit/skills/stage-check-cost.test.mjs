// The slice stages pay less fixed cost: a step runs a static check and no test, the tests and
// the suites run once for the slice, a slow check runs once at the review, and verify reuses runtime evidence whose
// input files did not change. These rules live in the stage references, so the references
// must agree on them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');

test('a step runs a static check and no test; the slice runs its checks once, with one fix loop', () => {
  const card = ref('implement.md');
  const steps = ref('implement', '_steps.md');
  assert.match(card, /After a step, run only the cheapest static check of the project on the files of that step/);
  assert.match(card, /A step runs no test, no guard set, no measured run, no device check and no full build/);
  assert.match(card, /After the last step, run the slice checks once, then the fast and affected suites of the test profile with `wf\.mjs receipt`/);
  assert.doesNotMatch(card, /Red before green/);
  assert.match(steps, /After each plan step, run only the cheapest static check of the project on the files of that step/);
  assert.match(steps, /## The slice checks/);
  assert.match(steps, /The limit is 3 rounds for the slice, counted over all its reds together/);
  assert.match(ref('plan.md'), /A slice has 20 steps or fewer/);
  assert.match(ref('plan.md'), /It is never a test run/);
});

test('plan, implement and verify run no slow check; the review runs each packet check once', () => {
  for (const name of ['plan.md', 'implement.md', 'verify.md']) {
    const text = ref(name);
    assert.match(text, /`full` or `heavy` command/, `${name} names the slow suites`);
    assert.match(text, /## Packet Checks/, `${name} records a slow check as a packet check`);
  }
  assert.match(ref('review.md'), /each check that a plan, implement or verify record names under `## Packet Checks`/);
  assert.match(ref('review.md'), /When you fix code after a packet suite passed, run again only the suites that read the files of the fix/);
});

test('verify reuses runtime evidence unless a file that the check depends on changed', () => {
  const evidence = ref('verify', '_runtime-evidence.md');
  assert.match(evidence, /This rule applies to every runtime/);
  assert.match(evidence, /git diff --name-only <its evidence-commit> HEAD -- <its depends-on files>/);
  assert.match(evidence, /set `source: evidence <commit>`, and do not drive the runtime for this check/);
  assert.match(evidence, /evidence-commit, depends-on: \[<file>, \.\.\.\], source/);
  assert.match(ref('verify.md'), /An entry reused with `source: evidence <commit>`.*counts as matched/);
});
