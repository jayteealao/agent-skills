// A repo with no ship plan can still get a PR through /wf ship: ship Step 0.4 runs only the
// scripted gaps, with no no-plan gap, so the missing-plan gate of the PR phase is reachable and
// can answer that shipping is external. The plan gates run once per ship run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');
const stepOf = (card, re) => card.split('\n').find((l) => re.test(l)) ?? '';

test('ship Step 0.4 runs the scripted gaps with the allowNoPlan path, and no plan gate', () => {
  const ship = ref('ship.md');
  const step4 = stepOf(ship, /^4\. \*\*/);
  assert.match(step4, /ship ready "<root>" <slug> --allow-no-plan/);
  assert.match(step4, /`allowNoPlan` option of `readyGaps`/);
  assert.match(step4, /A missing plan is not a gap here/);
  assert.doesNotMatch(step4, /a missing plan[^.]*STOP/i);
  assert.match(ship, /\| `\/\.ai\/ship-plan\.md` \| artifact \| if-present \| \|/);
});

test('ship uses the readiness stamp of this run, and stops after the PR on not-applicable', () => {
  const ship = ref('ship.md');
  assert.match(ship, /readiness stamp of this run: use it, and do not run the plan gates a second time/);
  assert.match(ship, /\*\*`not-applicable`: STOP after the PR is ready\.\*\*/);
  assert.match(ship, /a stamp `not-applicable` stands while `\.ai\/ship-plan\.md` is still missing/);
});

test('the readiness procedure and the PR phase leave the missing plan to the gate of the readiness procedure', () => {
  const ready = ref('_ship-plan-readiness.md');
  assert.match(stepOf(ready, /^- \*\*At ship\*\*/), /--allow-no-plan/);
  assert.match(stepOf(ready, /^- \*\*`\/wf ship`\*\*/), /Step 0\.4 runs Step R0 only, with `--allow-no-plan`/);
  const step67 = stepOf(ref('handoff.md'), /^6\.7\. /);
  assert.match(step67, /one plan gate of a ship run/);
  assert.match(step67, /\*Shipping is external\*/);
  assert.match(step67, /--allow-no-plan/);
});

test('ship-plan build maps each plan block to its audits in one table', () => {
  const audits = ref('ship-plan', 'build', '_audits.md');
  for (const row of [
    /\| K, security \| `plan\.security` \| P \|/,
    /\| A, environment protection \| `plan\.ship-environments\[\]\.protection` \| Q \|/,
    /\| C, CI ergonomics \| `plan\.ci-pipeline\.ci-ergonomics` \| S \|/,
  ]) assert.match(audits, row);
  assert.doesNotMatch(audits, /`plan\.release-workflow-file`/);
  assert.match(audits, /## Audit P[^\n]*\nSkip if the plan has no `security` block\./);
  const build = ref('ship-plan', 'build.md');
  assert.match(build, /the block table in \[build\/_audits\.md\]\(build\/_audits\.md\)/);
  assert.doesNotMatch(build, /→ K, L|→ K\/L|\(security\) → P/);
});
