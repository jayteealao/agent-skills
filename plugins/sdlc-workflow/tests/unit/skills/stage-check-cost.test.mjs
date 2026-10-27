// The slice stages pay less fixed cost: a step runs only its own tests, the suites run once at
// the receipt, a slow check runs once at the review, and verify reuses runtime evidence whose
// input files did not change. These rules live in the stage references, so the references
// must agree on them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');

test('a step runs only its own tests, and the suites run once at the receipt', () => {
  assert.match(ref('implement.md'), /After each step, run only the tests that cover the files of that step\. Run the fast and affected suites of the test profile once, at the end, with `wf\.mjs receipt`/);
  assert.match(ref('implement', '_steps.md'), /After each plan step, run only the tests that cover the files of that step\. Do not run the suites of the profile after each step: the test receipt runs them once, at the end\./);
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
