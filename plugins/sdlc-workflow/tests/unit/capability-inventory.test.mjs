// The W0 regression shield (WIDE-VIEW-REPAIR-PLAN §3): the capability
// inventory extractor, the verify gate, and the load metric.
//
// Two jobs. (1) Unit-check the extraction rules and the comparison semantics on
// synthetic input, so a rule change is a visible test change. (2) Run the real
// gate against the working tree, so `npm test` fails when a prose edit dropped
// a baseline capability without a moved.json / retired.json entry (§3.2 step 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BASELINE_PATH,
  CATEGORIES,
  PER_FILE_CATEGORIES,
  TREE_WIDE_CATEGORIES,
  extractFile,
  extractInventory,
} from '../../scripts/extract-capabilities.mjs';
import { compareInventories, runGate } from '../../scripts/verify-capabilities.mjs';
import { LOAD_BASELINE_PATH, listKeys, measureLoad } from '../../scripts/measure-load.mjs';
import { capabilitiesOf, hasCapability } from '../helpers/capabilities.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SAMPLE = `# Plan

Write \`04-plan-<slice-slug>.md\` and update \`00-index.md\`. Record \`stack-source:\`
and \`review-scope-confirmed:\` in frontmatter.

If \`02-shape.md\` is missing → STOP. Tell the user which command to run first.

Ask ONE question per [_gate-question.md](_gate-question.md) before writing.

### research sub-agent 1 — Codebase grounding

Dispatch one fresh-context review sub-agent for the diff.

Run \`/wf plan <slug>\`, then \`/wf intake fix the list command\`, or \`/wf auto myfeat slice-a slice-b\`.
Bare /wf status works too. Consult with /consult when unsure. Set \`hooks.verifyResultGate\`
and \`SDLC_GATE_NAME\`. See [contract](design/contract.md) and [gone](nowhere/missing.md).
`;

test('extractFile: every category follows its stated rule', () => {
  const { perFile, treeWide } = extractFile('skills/wf/reference/plan.md', SAMPLE, pluginRoot);

  assert.deepEqual(perFile.artifacts, ['00-index.md', '02-shape.md', '04-plan-<X>.md']);
  assert.deepEqual(treeWide.fields, ['review-scope-confirmed:', 'stack-source:']);
  assert.deepEqual(perFile.stops, ['if 02-shape.md is missing stop.']);
  assert.deepEqual(perFile.gates, ['ask one question per _gate-question.md before writing.']);
  assert.ok(perFile.dispatches.includes('heading: research sub-agent 1 codebase grounding'));
  assert.ok(perFile.dispatches.includes('dispatch one fresh-context review sub-agent for the diff.'));
  assert.deepEqual(treeWide.invocations, ['/consult', '/wf auto myfeat', '/wf intake fix', '/wf plan <X>', '/wf status']);
  assert.deepEqual(treeWide.config, ['SDLC_GATE_NAME', 'hooks.verifyResultGate']);
  assert.deepEqual(treeWide.citations, [
    'skills/wf/reference/_gate-question.md',
    'skills/wf/reference/design/contract.md',
    'unresolved:skills/wf/reference/nowhere/missing.md',
  ]);
  assert.deepEqual(perFile['rubric-checks'], [], 'rubric checks are extracted only under reference/review/');
});

test('extractFile: rubric checks come from PRIMARY QUESTIONS and NON-NEGOTIABLES only', () => {
  const rubric = `# ROLE\n- not a check\n\n# PRIMARY QUESTIONS\n1. Does every input get validated at the boundary?\n- Are secrets read from the environment only?\n\n# WORKFLOW\n- not a check either\n\n## NON-NEGOTIABLES\n* **Evidence-first**: every finding has file:line\n`;
  const { perFile } = extractFile('skills/wf/reference/review/security.md', rubric, pluginRoot);
  assert.deepEqual(perFile['rubric-checks'], [
    'are secrets read from the environment',
    'does every input get validated at',
    'evidence-first : every finding has file:line',
  ]);
});

test('extractInventory is deterministic and covers every category', () => {
  const a = extractInventory(pluginRoot);
  const b = extractInventory(pluginRoot);
  assert.deepEqual(a, b);
  for (const c of CATEGORIES) assert.equal(typeof a.counts[c], 'number');
  assert.ok(a.counts.files > 100, `expected the skills tree, saw ${a.counts.files} files`);
  for (const f of Object.values(a.files)) {
    for (const c of PER_FILE_CATEGORIES) assert.deepEqual(f[c], [...new Set(f[c])].sort(), `${c} sorted and unique`);
  }
  for (const c of TREE_WIDE_CATEGORIES) assert.deepEqual(a.treeWide[c], [...new Set(a.treeWide[c])].sort());
});

test('compareInventories: missing, moved, retired, grouped, malformed', () => {
  const baseline = {
    files: {
      'a.md': { artifacts: ['01-x.md'], gates: [], stops: ['if missing stop.'], dispatches: [], 'rubric-checks': [] },
      'skills/wf/reference/review/testing.md': { artifacts: [], gates: [], stops: [], dispatches: [], 'rubric-checks': ['are the tests deterministic and isolated?'] },
    },
    treeWide: { fields: ['slug:'], invocations: ['/wf plan <X>'], config: [], citations: [] },
  };
  const current = {
    files: {
      'a.md': { artifacts: [], gates: [], stops: [], dispatches: [], 'rubric-checks': [] },
      'b.md': { artifacts: ['01-x.md'], gates: [], stops: [], dispatches: [], 'rubric-checks': [] },
      'skills/wf/reference/review/correctness.md': { artifacts: [], gates: [], stops: [], dispatches: [], 'rubric-checks': ['are the tests deterministic and isolated?'] },
    },
    treeWide: { fields: [], invocations: ['/wf plan <X>'], config: [], citations: [] },
  };

  const bare = compareInventories(baseline, current);
  assert.deepEqual(
    bare.missing.map((m) => `${m.file}|${m.category}|${m.entry}`).sort(),
    [
      '*|fields|slug:',
      'a.md|artifacts|01-x.md',
      'a.md|stops|if missing stop.',
      'skills/wf/reference/review/testing.md|rubric-checks|are the tests deterministic and isolated?',
    ],
  );

  const explained = compareInventories(baseline, current, {
    moved: [{ from: 'a.md', to: 'b.md', entry: '01-x.md' }],
    retired: [
      { entry: 'if missing stop.', file: 'a.md', reason: 'duplicate of _fix-loop.md', release: '9.154.0' },
      { entry: 'slug:', category: 'fields', reason: 'renamed to workflow-slug:', release: '9.154.0' },
    ],
    groups: { 'skills/wf/reference/review/testing.md': 'correctness', 'skills/wf/reference/review/correctness.md': 'correctness' },
  });
  assert.deepEqual(explained.missing, []);
  assert.deepEqual(explained.errors, []);
  assert.equal(explained.moved, 1);
  assert.equal(explained.retired, 2);

  const malformed = compareInventories(baseline, current, { retired: [{ entry: 'x' }], moved: [{ entry: 'y' }] });
  assert.equal(malformed.errors.length, 2);
});

test('the committed baseline exists and the gate is green on the working tree', () => {
  assert.ok(existsSync(BASELINE_PATH), 'docs/internal/capability-inventory/baseline.json is committed');
  const report = runGate();
  const detail = [...report.errors, ...report.missing.map((m) => `${m.file} :: ${m.category} :: ${m.entry}`)].join('\n');
  assert.ok(
    report.ok,
    `verify:capabilities failed. Restore the sentence, or explain it in moved.json / retired.json:\n${detail}`,
  );
});

test('retired.json entries name a reason and a release', () => {
  const retired = JSON.parse(readFileSync(path.join(pluginRoot, 'docs/internal/capability-inventory/retired.json'), 'utf8'));
  assert.ok(Array.isArray(retired));
  for (const r of retired) {
    assert.equal(typeof r.entry, 'string');
    assert.ok(r.reason && r.reason.length > 8, `retired entry "${r.entry}" needs a reason`);
    assert.match(String(r.release), /^\d+\.\d+\.\d+$/);
  }
});

test('measure-load: 22 keys, core ⊆ instructed ⊆ referenced, targets derive from §4.1, baseline covers every key', () => {
  const keys = listKeys(pluginRoot);
  assert.equal(keys.length, 22, `keys: ${keys.join(', ')}`);
  const load = measureLoad(pluginRoot);
  for (const k of keys) {
    const { core, instructed, referenced, target } = load.keys[k];
    assert.deepEqual(core.fileList, ['skills/wf/SKILL.md', `skills/wf/reference/${k}.md`], `${k}: core is SKILL.md + body`);
    for (const f of core.fileList) assert.ok(instructed.fileList.includes(f), `${k}: instructed ⊇ core (${f})`);
    for (const f of instructed.fileList) assert.ok(referenced.fileList.includes(f), `${k}: referenced ⊇ instructed (${f})`);
    assert.ok(referenced.files < 60, `${k}: referenced ${referenced.files} files — the citation graph became fully connected`);
    // §16: a body that cannot meet 4,050 without deleting a capability carries a raised
    // per-file word budget with a reason; the target then follows that budget.
    const skillShare = load.wordBudgets['skills/wf/SKILL.md']?.words ?? 120 * 11;
    const classCore = Math.ceil((skillShare + 250 * 11) / 50) * 50;
    const bodyBudget = load.wordBudgets[`skills/wf/reference/${k}.md`];
    if (bodyBudget) {
      assert.ok(bodyBudget.reason?.trim(), `${k}: a raised word budget needs a reason`);
      assert.ok(target.core > classCore, `${k}: a raised body budget must lift the core target above the class target`);
      assert.ok(target.raised.includes(`skills/wf/reference/${k}.md`), `${k}: target.raised names the body`);
    } else {
      assert.equal(target.core, classCore, `${k}: core target = dispatcher share + stage body at 11 words/line`);
    }
    assert.ok(target.instructed >= target.core, `${k}: instructed target ≥ core target`);
    for (const b of instructed.branches) assert.ok(b.alternatives > 1 && instructed.fileList.includes(b.chosen));
  }
  // A "per X" reference is not an order; a "Load `X`" is.
  assert.ok(!load.keys.shape.instructed.fileList.includes('skills/wf/reference/_chat-return.md'), 'shape cites _chat-return.md as "per", not as a load');
  assert.ok(load.keys.intake.instructed.fileList.includes('skills/wf/reference/intake/default.md'), 'intake orders its default mode');
  assert.ok(load.keys.review.instructed.fileList.includes('skills/wf/reference/review/_stage.md'), 'review orders _stage.md in full');
  assert.ok(existsSync(LOAD_BASELINE_PATH), 'load-baseline.json is committed');
  const baseline = JSON.parse(readFileSync(LOAD_BASELINE_PATH, 'utf8'));
  assert.deepEqual(Object.keys(baseline.keys).sort(), keys);
});

test('tests/helpers/capabilities.mjs answers per-file and tree-wide lookups', () => {
  assert.ok(hasCapability('*', 'invocations', '/wf intake fix'));
  assert.ok(hasCapability('*', 'fields', 'args:'));
  const stops = capabilitiesOf('skills/wf/reference/plan.md', 'stops');
  assert.ok(stops.length > 0);
  assert.ok(hasCapability('skills/wf/reference/plan.md', 'stops', stops[0]));
  assert.equal(hasCapability('skills/wf/reference/plan.md', 'stops', 'no such stop'), false);
  assert.throws(() => hasCapability('x', 'wording', 'y'), /unknown capability category/);
});
