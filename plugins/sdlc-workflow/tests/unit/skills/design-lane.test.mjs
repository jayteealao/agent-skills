// DESIGN-LANE-PLAN guard tests: the design lane's human rule — a person confirms
// the design at the human-only `design` stage before any stage a driver runs.
// Covers the pure predicates (lib/design-lane.mjs), the pre-write hook that
// refuses a plan write while a needed design is unsettled, and the prose that
// carries the same rule to the stages and the drivers.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import {
  designGateRefusal,
  designNeeded,
  designSettled,
  imageGateResolved,
  isPlanArtifact,
  planSliceOf,
} from '../../../lib/design-lane.mjs';
import { defaultFrontmatterSchemaPath, validateFrontmatter } from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const REF = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs');
const read = (rel) => readFileSync(join(PLUGIN_ROOT, rel), 'utf8');

const CONFIRMED = { 'image-gate': 'pass', 'direction-confirmed-by': 'in-session' };

test('designNeeded: ux-impact decides; an absent value falls back to the brief', () => {
  equal(designNeeded({ 'ux-impact': 'none' }, true), false);
  equal(designNeeded({ 'ux-impact': 'visual' }, false), true);
  equal(designNeeded({ 'ux-impact': 'flow' }, false), true);
  equal(designNeeded({ 'ux-impact': 'new-surface' }, false), true);
  equal(designNeeded({}, false), false);
  equal(designNeeded({}, true), true);
});

test('designSettled: a confirmed contract, or a skip with a reason', () => {
  const idx = { 'ux-impact': 'visual' };
  equal(designSettled(idx, null), false);
  equal(designSettled(idx, { 'image-gate': 'pass' }), false, 'no person-backed confirmation');
  equal(designSettled(idx, { 'direction-confirmed-by': 'in-session' }), false, 'unresolved image gate');
  equal(designSettled(idx, CONFIRMED), true);
  equal(designSettled(idx, { 'image-gate': 'skipped: flow-only change, no new visual surface', 'direction-confirmed-by': 'in-session' }), true);
  equal(designSettled({ progress: { design: 'skipped' } }, null), false, 'a skip needs a reason');
  equal(designSettled({ progress: { design: 'skipped' }, 'design-skip-reason': 'backend only' }, null), true);
  equal(designSettled({ ...idx, progress: { design: 'in-progress' } }, CONFIRMED), false, 'a reopened design is not settled');
  equal(designSettled({ ...idx, progress: { design: 'complete' } }, CONFIRMED), true);
});

test('imageGateResolved and isPlanArtifact', () => {
  equal(imageGateResolved('pass'), true);
  equal(imageGateResolved('skipped:'), false);
  equal(imageGateResolved('skipped: no canvas and no image provider'), true);
  equal(imageGateResolved(undefined), false);
  equal(isPlanArtifact('04-plan.md'), true);
  equal(isPlanArtifact('04-plan-checkout.md'), true);
  equal(isPlanArtifact('history/04-plan-checkout-1.md'), false);
  equal(isPlanArtifact('04b-instrument.md'), false);
});

test('designGateRefusal names the route to the design stage', () => {
  const msg = designGateRefusal({ index: { 'ux-impact': 'new-surface' }, hasBrief: true, contract: null, slug: 'demo' });
  match(msg, /\/wf design demo/);
  match(msg, /02c-craft\.md is missing/);
  equal(designGateRefusal({ index: { 'ux-impact': 'new-surface' }, hasBrief: true, contract: CONFIRMED, slug: 'demo' }), null);
  equal(designGateRefusal({ index: null, hasBrief: false, contract: null, slug: 'demo' }), null);
  const reopened = designGateRefusal({ index: { 'ux-impact': 'visual', progress: { design: 'in-progress' } }, hasBrief: true, contract: CONFIRMED, slug: 'demo' });
  match(reopened, /\/wf design demo amend/);
  match(reopened, /reopened/);
});

// ── the pre-write hook ────────────────────────────────────────────────────────

function fm(obj) {
  const y = Object.entries(obj).map(([k, v]) =>
    typeof v === 'object' ? `${k}:\n${Object.entries(v).map(([a, b]) => `  ${a}: ${b}`).join('\n')}` : `${k}: ${v}`).join('\n');
  return `---\n${y}\n---\nbody\n`;
}

function runPlanWrite(files, config) {
  const tmp = mkdtempSync(join(tmpdir(), 'sdlc-design-lane-'));
  try {
    const dir = join(tmp, '.ai', 'workflows', 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(tmp, '.ai', 'workflows', 'INDEX.md'), 'demo\tactive\n');
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    if (config) writeFileSync(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify(config));
    return spawnSync(process.execPath, [HOOK], {
      cwd: tmp,
      encoding: 'utf-8',
      input: JSON.stringify({
        cwd: tmp,
        tool_input: { file_path: '.ai/workflows/demo/04-plan-checkout.md', content: fm({ schema: 'sdlc/v1', type: 'plan', slug: 'demo' }) },
      }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const INDEX = (extra = {}) => fm({ schema: 'sdlc/v1', type: 'index', slug: 'demo', ...extra });

test('hook: refuses a plan while a needed design is unsettled', () => {
  const r = runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'visual' }) });
  equal(r.status, 2, r.stderr);
  match(r.stderr, /\/wf design demo/);
});

test('hook: refuses a plan for a legacy workflow with a brief and no contract', () => {
  const r = runPlanWrite({ '00-index.md': INDEX(), '02b-design.md': fm({ schema: 'sdlc/v1', type: 'design', slug: 'demo' }) });
  equal(r.status, 2, r.stderr);
});

test('hook: allows a plan once the person confirmed the design', () => {
  const r = runPlanWrite({
    '00-index.md': INDEX({ 'ux-impact': 'visual' }),
    '02c-craft.md': fm({ schema: 'sdlc/v1', type: 'design-contract', slug: 'demo', 'image-gate': 'pass', 'direction-confirmed-by': 'in-session' }),
  });
  equal(r.status, 0, r.stderr);
});

test('hook: refuses a plan while a confirmed design is reopened', () => {
  const r = runPlanWrite({
    '00-index.md': INDEX({ 'ux-impact': 'visual', progress: { design: 'in-progress' } }),
    '02c-craft.md': fm({ schema: 'sdlc/v1', type: 'design-contract', slug: 'demo', 'image-gate': 'pass', 'direction-confirmed-by': 'in-session' }),
  });
  equal(r.status, 2, r.stderr);
  match(r.stderr, /\/wf design demo amend/);
});

// A slice that changes nothing a person sees is planned without the design stage.
// The plan file in runPlanWrite is 04-plan-checkout.md, so the slice is `checkout`.
const SLICE = (extra = {}) => fm({ schema: 'sdlc/v1', type: 'slice', slug: 'demo', 'slice-slug': 'checkout', ...extra });

test('hook: allows a slice plan when the slice carries ux-impact none', () => {
  const r = runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'visual' }), '03-slice-checkout.md': SLICE({ 'ux-impact': 'none' }) });
  equal(r.status, 0, r.stderr);
});

test('hook: refuses a slice plan when the slice touches the UI or has no ux-impact', () => {
  const ui = runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'visual' }), '03-slice-checkout.md': SLICE({ 'ux-impact': 'visual' }) });
  equal(ui.status, 2, ui.stderr);
  const legacy = runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'visual' }), '03-slice-checkout.md': SLICE() });
  equal(legacy.status, 2, legacy.stderr);
  match(legacy.stderr, /ux-impact: none` in 03-slice-checkout\.md/);
});

test('designGateRefusal: a slice with ux-impact none passes; the slug-wide plan keeps the slug rule', () => {
  const index = { 'ux-impact': 'visual' };
  equal(designGateRefusal({ index, hasBrief: true, contract: null, slug: 'demo', slice: { 'ux-impact': 'none' }, sliceSlug: 'engine' }), null);
  ok(designGateRefusal({ index, hasBrief: true, contract: null, slug: 'demo', slice: { 'ux-impact': 'flow' }, sliceSlug: 'engine' }));
  ok(designGateRefusal({ index, hasBrief: true, contract: null, slug: 'demo', slice: null, sliceSlug: null }));
  equal(planSliceOf('04-plan-lone-forward.md'), 'lone-forward');
  equal(planSliceOf('04-plan.md'), null);
});

test('hook: allows a plan when ux-impact is none, and when the gate is off', () => {
  equal(runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'none' }) }).status, 0);
  equal(runPlanWrite({ '00-index.md': INDEX({ 'ux-impact': 'visual' }) }, { hooks: { designDirectionGate: false } }).status, 0);
});

// ── schema ────────────────────────────────────────────────────────────────────

test('schema: the contract carries the confirmation fields and no pen-doc', () => {
  const schema = JSON.parse(read('tests/frontmatter.schema.json'));
  const contract = schema.$defs?.designContractFrontmatter ?? schema.definitions?.designContractFrontmatter;
  ok(contract, 'designContractFrontmatter branch');
  for (const k of ['canvas', 'direction-confirmed-by', 'confirmed-at', 'surfaces']) ok(contract.properties[k], k);
  equal(contract.properties['pen-doc'], undefined);
  const base = {
    schema: 'sdlc/v1', type: 'index', slug: 'demo', title: 't', status: 'active', 'current-stage': 'design',
    'stage-number': 2, 'created-at': '2026-09-24T00:00:00Z', 'updated-at': '2026-09-24T00:00:00Z', 'selected-slice': '',
    'branch-strategy': 'none', branch: '', 'base-branch': 'main', 'review-scope': 'slug-wide', 'pr-url': '', 'pr-number': 0,
    'open-questions': [], tags: [], 'next-command': 'wf-design', 'next-invocation': '/wf design demo',
    'workflow-files': ['00-index.md'], progress: { design: 'in-progress' },
  };
  const opts = { schemaPath: defaultFrontmatterSchemaPath() };
  equal(validateFrontmatter({ ...base, 'ux-impact': 'flow' }, opts).valid, true);
  equal(validateFrontmatter({ ...base, 'ux-impact': 'huge' }, opts).valid, false);
});

// ── prose carries the rule ────────────────────────────────────────────────────

test('prose: the lane, the stage, and the drivers state the human rule', () => {
  const lane = read('skills/wf/reference/design/_lane.md');
  match(lane, /Neither `\/wf auto` nor `\/wf yolo` runs it/);
  match(lane, /hooks\.designDirectionGate/);
  match(read('skills/wf/reference/design/stage.md'), /A driver never resolves a design direction/);
  match(read('skills/wf/reference/auto.md'), /`auto` never runs the design stage/);
  match(read('skills/wf/reference/yolo.md'), /never `intake`, `shape`, or `design`/);
  match(read('skills/wf/workflows/yolo.js'), /DESIGN GATE/);
});

test('prose: plan consumes the contract and never authors it', () => {
  const plan = read('skills/wf/reference/plan.md');
  match(plan, /Plan never authors `02c-craft\.md`/);
  ok(!/plan is the design producer/.test(plan));
  ok(!/design\/contract\.md\]\(design\/contract\.md\) — land the visual direction/.test(plan));
});

test('prose: the design canvas is the first choice; imagery and uiproto are the fallback', () => {
  const host = read('skills/wf/reference/_host-invocation.md');
  match(host, /\| Design canvas \(design stage\) \|/);
  match(host, /\| Design system sync/);
  const contract = read('skills/wf/reference/design/contract.md');
  match(contract, /First choice — the design canvas/);
  match(contract, /Fallback — generated comps/);
  match(read('skills/uiproto/SKILL.md'), /fallback for hosts without a design canvas/);
  match(read('skills/imagery/SKILL.md'), /fallback for hosts without a design canvas/);
});

test('prose: the brief procedure cites the right shape step', () => {
  const brief = read('skills/wf/reference/design/shape.md');
  ok(!/Step 5b/.test(brief), 'the brief is shape Step 5a');
  match(read('skills/wf/reference/shape.md'), /# Step 5a — Author the design brief/);
});

test('prose: every intake route into slice or plan passes the design lane', () => {
  const intake = (f) => read(`skills/wf/reference/intake/${f}`);
  const oldNote = /`plan` authors the visual contract|no separate design command/;
  ok(!oldNote.test(intake('default.md')), 'default intake no longer describes plan as the design author');
  match(intake('default.md'), /the human-only design stage \(`\/wf design <slug>`\)/);
  const rca = intake('rca.md');
  match(rca, /ux-impact: <none\|visual\|flow\|new-surface>/);
  match(rca, /next-invocation: "\/wf design <slug>"/);
  const extend = intake('extend.md');
  match(extend, /# Step 3c — Design delta/);
  match(extend, /progress\.design: in-progress/);
  match(extend, /\/wf design <slug> amend/);
  match(intake('update-deps.md'), /Write `ux-impact: none`/);
  match(read('skills/wf/reference/review/_select.md'), /`update-deps` run that upgrades a major version of a UI/);
});

test('prose: the reopened design is part of the rule in the lane, the stage, and yolo', () => {
  match(read('skills/wf/reference/design/_lane.md'), /The design is \*\*reopened\*\*/);
  match(read('skills/wf/reference/design/stage.md'), /When `progress\.design: in-progress`, the design is reopened/);
  match(read('skills/wf/workflows/yolo.js'), /progress\.design: in-progress \(reopened/);
  ok(!/stack\.ui ≠ ∅/.test(read('skills/wf/reference/implement.md')), 'implement triggers on the slice building UI');
});
