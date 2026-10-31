// One rule, one owner card. Each test pins the owner once, a citation in each card that
// uses the rule, and the absence of the old full copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CITATION_MARKER_RE } from '../../../lib/limitation-lexicon.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REF = path.join(pluginRoot, 'skills', 'wf', 'reference');
const ref = (...p) => readFileSync(path.join(REF, ...p), 'utf8');
const skill = () => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'SKILL.md'), 'utf8');
const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

function cards(dir = REF) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...cards(abs));
    else if (name.endsWith('.md')) out.push(path.relative(REF, abs).split(path.sep).join('/'));
  }
  return out;
}

const RUBRICS = ['accessibility', 'api-contracts', 'architecture', 'correctness', 'docs', 'infra', 'intent-fidelity', 'interface-craft', 'observability', 'performance', 'security'];

test('the fix sub-agent prompt has one owner, with lines marked for each path', () => {
  assert.ok(existsSync(path.join(REF, '_fix-prompt.md')));
  assert.ok(!existsSync(path.join(REF, 'review', '_fix-prompt.md')), 'the old review copy is gone');
  const owner = ref('_fix-prompt.md');
  for (const mark of ['[verify]', '[handoff]', '[code bug]']) assert.ok(owner.includes(`\n${mark} `), `the prompt marks ${mark} lines`);
  assert.match(owner, /Method: as-prescribed \| deviated/);
  assert.match(ref('verify.md'), /Send the prompt of \[_fix-prompt\.md\]\(_fix-prompt\.md\) with its `\[verify\]` lines/);
  assert.match(ref('handoff', '_pr-ci-handoff.md'), /the prompt of \[_fix-prompt\.md\]\(\.\.\/_fix-prompt\.md\), with its `\[handoff\]` lines/);
  assert.match(ref('implement', '_reviews-mode.md'), /the prompt of \[\.\.\/_fix-prompt\.md\]\(\.\.\/_fix-prompt\.md\)/);
  for (const rel of cards()) {
    const text = ref(rel);
    assert.doesNotMatch(text, /review\/_fix-prompt\.md/, `${rel} names the old path`);
    if (rel === '_fix-prompt.md') continue;
    assert.doesNotMatch(text, /Fix the following (verify-stage issue|review finding)|Apply the following fix in this repository/, `${rel} holds a copy of the prompt`);
  }
});

test('no card describes the review as a dispatcher of fix sub-agents', () => {
  const loop = ref('_fix-loop.md');
  assert.match(loop, /^Two surfaces dispatch fix sub-agents/m);
  assert.doesNotMatch(loop, /review\/_stage\.md|review\s+pins \*\*medium\*\*/);
  assert.doesNotMatch(ref('review.md'), /_fix-prompt/);
  assert.doesNotMatch(ref('implement', '_reviews-mode.md'), /Review Step 4c sends the same prompt/);
  assert.doesNotMatch(ref('_subagents.md'), /the review dimensions write their own/);
  assert.doesNotMatch(ref('review', '_triage.md'), /same protocol as Step 4b/);
  assert.match(ref('review', '_triage.md'), /The options are `Fix`, `Defer` and `Dismiss`\. Offer `Defer` only for a finding that needs runtime evidence/);
});

test('the review severity scale and output have one owner; the rubrics keep only their own checks', () => {
  const owner = ref('review', '_severity.md');
  assert.match(owner, /BLOCKER blocks the merge on its own/);
  assert.match(owner, /A reviewer writes no file/);
  for (const name of RUBRICS) {
    const text = ref('review', `${name}.md`);
    assert.doesNotMatch(text, /^# (Severity calibration|Output shape)$/m, `${name} holds a copy of the severity or output section`);
    assert.doesNotMatch(text, /BLOCKER blocks the merge on its own/, name);
    assert.match(text, /Always read \[_severity\.md\]\(_severity\.md\)/, `${name} cites the owner`);
  }
  const a11y = ref('review', 'accessibility.md');
  assert.ok(a11y.indexOf('These are BLOCKER under WCAG 2.1 AA') > a11y.indexOf('# What to look for'), 'the accessibility BLOCKER line is in its checks');
  assert.match(ref('review', '_dispatch.md'), /<skill-dir>\/reference\/review\/_severity\.md/);
  assert.match(ref('review', '_ad-hoc.md'), /\[_severity\.md\]\(_severity\.md\)/);
  assert.match(yolo, /\$\{referenceRoot\}\/review\/_severity\.md/);
  for (const text of [yolo, ref('review', '_dispatch.md'), ref('review', '_ad-hoc.md'), ref('review', '_select.md')]) {
    assert.doesNotMatch(text, /Severity calibration|severity calibration/);
  }
});

test('the source modes have one owner table, and each stage cites it', () => {
  const owner = ref('_source-modes.md');
  for (const type of ['`feature`', '`fix`, `hotfix`, `refactor`', '`rca`', '`quick`', '`update-deps`', '`optimize`', '`small`', '`task`', '`audit`', '`investigate`, `discover`, `ideate`, `brainstorm`']) {
    assert.match(owner, new RegExp(`^\\| ${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm'), `a row for ${type}`);
  }
  for (const [name, text] of [['implement.md', ref('implement.md')], ['verify.md', ref('verify.md')], ['review/_stage.md', ref('review', '_stage.md')], ['probe.md', ref('probe.md')], ['yolo.md', ref('yolo.md')]]) {
    assert.match(text, /\[_source-modes\.md\]\((\.\.\/)?_source-modes\.md\)/, `${name} cites the owner`);
    assert.doesNotMatch(text, /Determine (the )?workflow source mode|Recognize these modes:/, `${name} holds a copy of the table`);
  }
  assert.doesNotMatch(ref('review', '_stage.md'), /\*\*Task\*\* \(`workflow-type: task`\)/);
  assert.doesNotMatch(ref('verify.md'), /re-run the literal `## Baseline Command`/);
});

test('the source-study rules have one owner; each stage card keeps one citation line', () => {
  const owner = ref('_source-study.md');
  assert.match(owner, /## Read the real source/);
  assert.match(owner, /## A limitation claim carries its evidence/);
  // Each marker that the card names discharges a claim in the lint.
  const markers = ['source:', 'node_modules/', 'repro:', 'issue: #1', 'https://x', 'study-sources', 'a.d.ts'];
  for (const m of markers) assert.match(m, CITATION_MARKER_RE, `${m} is a marker of the lint`);
  for (const m of ['`source:`', '`node_modules/`', '`repro:`', '`issue: #<n>`', 'a URL', '`study-sources`', '`.d.ts`']) assert.ok(owner.includes(m), `the card names ${m}`);
  for (const name of ['plan.md', 'implement.md', 'verify.md', 'review.md']) {
    assert.equal(ref(name).split('[_source-study.md](_source-study.md)').length, 2, `${name} cites the owner once`);
  }
  assert.match(skill(), /\[reference\/_source-study\.md\]\(reference\/_source-study\.md\)/);
  for (const rel of cards()) {
    if (rel === '_source-study.md') continue;
    assert.doesNotMatch(ref(rel), /limitationClaimLint/, `${rel} holds a copy of the limitation rule`);
  }
  for (const name of ['plan.md', 'implement.md', 'verify.md', 'review.md']) {
    assert.doesNotMatch(ref(name), /Android SDK `sources\/`/, `${name} holds a copy of the study rule`);
  }
});

test('a stage card states each rule in its Card; the Role is one line', () => {
  const roleOf = (text) => {
    const m = /^# Role\n([\s\S]*?)(?=\n# )/m.exec(text);
    return m ? m[1].trim() : null;
  };
  for (const name of ['implement.md', 'plan.md', 'verify.md']) {
    const role = roleOf(ref(name));
    assert.ok(role, `${name} has a Role`);
    assert.equal(role.split('\n').length, 1, `${name}: the Role is one line`);
  }
  const card = /## Card\n([\s\S]*?)\n## /.exec(ref('verify.md'))[1];
  assert.match(card, /Ask a gate question for each other failure, per \[_gate-question\.md\]\(_gate-question\.md\): `Fix`, `Skip` or `Escalate`/);
  assert.match(card, /Run one fix round only\. When an issue still fails after it, write `convergence: escalated`/);
});
