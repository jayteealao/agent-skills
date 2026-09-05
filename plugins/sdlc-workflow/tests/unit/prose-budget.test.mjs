// The W1 prose budget ratchet (WIDE-VIEW-REPAIR-PLAN §4.2, §6.2, §3.4).
//
// (1) Unit-check the class rules and the ratchet semantics on a synthetic tree.
// (2) Run the real gate on the working tree, so `npm test` fails when a prose
//     file grows, gains an emphasis token, or a key's load grows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGET_PATH, checkBudget, classOf, readBudget, updateBudget } from '../../scripts/verify-prose-budget.mjs';
import { compareInventories } from '../../scripts/verify-capabilities.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEYS = ['intake', 'plan', 'verify', 'review'];

test('classOf follows the §4.1 table', () => {
  const c = (rel) => classOf(rel, KEYS);
  assert.equal(c('skills/wf/SKILL.md'), 'dispatcher');
  assert.equal(c('skills/consult/SKILL.md'), 'dispatcher');
  assert.equal(c('skills/wf/reference/plan.md'), 'stage-body');
  assert.equal(c('skills/wf/reference/review/_stage.md'), 'stage-body');
  assert.equal(c('skills/wf/reference/intake/fix.md'), 'stage-body');
  assert.equal(c('skills/wf/reference/_gate-question.md'), 'shared-contract');
  assert.equal(c('skills/wf/reference/_ste-procedural.md'), 'rule-set');
  assert.equal(c('skills/wf/reference/_story-arc.md'), 'rule-set');
  assert.equal(c('skills/wf/reference/review/security.md'), 'rubric');
  assert.equal(c('skills/wf/reference/design/contract.md'), 'sub-procedure');
  assert.equal(c('skills/wf/reference/ship-plan/build.md'), 'sub-procedure');
  assert.equal(c('skills/wf/reference/ship-plan/ship-plan-templates/npm.md'), 'template');
  assert.equal(c('skills/wf/reference/runtime-adapters.md'), 'adapter');
  assert.equal(c('skills/wf/reference/runtime-adapters/node.md'), 'adapter');
  assert.equal(c('skills/diataxis/references/how-to.md'), 'sub-procedure');
});

function syntheticTree() {
  const root = mkdtempSync(path.join(tmpdir(), 'prose-budget-'));
  const ref = path.join(root, 'skills', 'wf', 'reference');
  mkdirSync(path.join(ref, 'review'), { recursive: true });
  const lines = (n, text = 'line') => Array.from({ length: n }, (_, i) => `${text} ${i}`).join('\n') + '\n';
  writeFileSync(path.join(root, 'skills', 'wf', 'SKILL.md'), '# wf\n\nLoad [reference/plan.md](reference/plan.md).\n' + lines(5));
  writeFileSync(path.join(ref, 'plan.md'), '# plan\n\nA MANDATORY step. STOP here.\n' + lines(300));
  writeFileSync(path.join(ref, 'verify.md'), '# verify\n' + lines(10));
  writeFileSync(path.join(ref, 'review', 'security.md'), '# security\n\n```yaml\na: 1\n```\n\n```js\nx\n```\n' + lines(3));
  return root;
}

const BUDGET = {
  classes: { dispatcher: 120, 'stage-body': 250, 'shared-contract': 80, 'rule-set': 120, rubric: 100, 'sub-procedure': 300, template: 150, adapter: 120 },
  hardCapLines: 1200,
  tokens: {
    MANDATORY: { pattern: '\\bMANDATORY\\b', allowedFiles: {} },
    STOP: { pattern: '\\bSTOP\\b', allowedFiles: {} },
  },
  exceptions: {},
  rubricFenceExceptions: {},
  load: {},
};

test('checkBudget: over-budget files, tokens, and rubric fences fail without a ratchet entry; --update records them; growth fails', () => {
  const root = syntheticTree();
  try {
    const first = checkBudget(BUDGET, root);
    const msgs = first.failures.join('\n');
    assert.match(msgs, /plan\.md: 303 lines over the stage-body budget of 250 and not in exceptions/);
    assert.match(msgs, /plan\.md: MANDATORY appears 1 times/);
    assert.match(msgs, /plan\.md: STOP appears 1 times/);
    assert.match(msgs, /security\.md: 1 code fence\(s\) other than one `yaml` fence/);
    assert.doesNotMatch(msgs, /verify\.md/);

    const ratcheted = updateBudget(BUDGET, root);
    assert.equal(ratcheted.exceptions['skills/wf/reference/plan.md'], 303);
    assert.equal(ratcheted.tokens.MANDATORY.files['skills/wf/reference/plan.md'], 1);
    assert.equal(ratcheted.rubricFenceExceptions['skills/wf/reference/review/security.md'], 1);
    const second = checkBudget(ratcheted, root);
    const loadOnly = second.failures.filter((f) => !/^load /.test(f));
    assert.deepEqual(loadOnly, []);

    // Growth of a ratcheted file fails; a new token in a clean file fails.
    writeFileSync(path.join(root, 'skills/wf/reference/plan.md'), readFileSync(path.join(root, 'skills/wf/reference/plan.md'), 'utf8') + 'more\n');
    writeFileSync(path.join(root, 'skills/wf/reference/verify.md'), '# verify\nDo it. STOP.\n');
    const third = checkBudget(ratcheted, root).failures.join('\n');
    assert.match(third, /plan\.md: grew from 303 to 304 lines/);
    assert.match(third, /verify\.md: STOP appears 1 times \(recorded 0, allowed 0\)/);

    // A shrink below the recorded count asks for --update; meeting the budget asks to drop the entry.
    writeFileSync(path.join(root, 'skills/wf/reference/plan.md'), '# plan\nshort\n');
    const fourth = checkBudget(ratcheted, root).failures.join('\n');
    assert.match(fourth, /plan\.md: meets its stage-body budget \(2 ≤ 250\); remove its exceptions entry/);
    assert.match(fourth, /plan\.md: MANDATORY is within its allowance/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compareInventories: a reworded sentence survives when reworded.json names its new first words in the same file', () => {
  const baseline = { files: { 'a.md': { artifacts: [], gates: [], stops: ['if the branch is behind base stop.'], dispatches: [], 'rubric-checks': [] } }, treeWide: { fields: [], invocations: [], config: [], citations: [] } };
  const current = { files: { 'a.md': { artifacts: [], gates: [], stops: ['when the branch is behind base, stop.'], dispatches: [], 'rubric-checks': [] } }, treeWide: { fields: [], invocations: [], config: [], citations: [] } };
  assert.equal(compareInventories(baseline, current).missing.length, 1);
  const ok = compareInventories(baseline, current, {
    reworded: [{ file: 'a.md', category: 'stops', from: 'if the branch is behind base stop.', to: 'when the branch is behind base, stop.' }],
  });
  assert.deepEqual(ok.missing, []);
  assert.equal(ok.reworded, 1);
  const wrongTarget = compareInventories(baseline, current, {
    reworded: [{ file: 'a.md', category: 'stops', from: 'if the branch is behind base stop.', to: 'some words that are not there.' }],
  });
  assert.equal(wrongTarget.missing.length, 1, 'a reworded entry whose `to` is absent explains nothing');
  const malformed = compareInventories(baseline, current, { reworded: [{ file: 'a.md' }] });
  assert.equal(malformed.errors.length, 1);
});

test('the committed prose budget exists and the gate is green on the working tree', () => {
  assert.ok(existsSync(BUDGET_PATH), 'docs/internal/capability-inventory/prose-budget.json is committed');
  const report = checkBudget(readBudget(BUDGET_PATH), pluginRoot);
  assert.deepEqual(
    report.failures,
    [],
    'verify:prose failed. Shrink the file, or run `node scripts/verify-prose-budget.mjs --update` after an intentional shrink.',
  );
});
