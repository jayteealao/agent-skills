// Drift guards for the INTAKE-SHAPE-HARDENING plan (W1-W4, v9.136.0).
// W1 renumbered shape.md into one contiguous step sequence and moved the PO tooling
// question out of a sub-agent prompt; W2 made every downstream gate's input
// unconditional (none-declared, backfill, appetite, charter ratification, extension
// delta); W3 made the 20-question floor accountable (Ambiguity Inventory + coverage
// gate) and moved review-scope to slice; W4 added intake consult triggers, the blind
// pre-mortem, and the fidelity chat line. These tests pin the load-bearing phrases so
// a future edit can't silently delete a gate. Reference prose is mirrored to the codex
// tree, so those guards iterate BOTH trees (schema + hook guards are main-tree only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const ref = (root, rel) => readFileSync(path.join(root, 'skills', 'wf', 'reference', rel), 'utf8');

// ── W1 — shape.md renumber + tooling-question relay ─────────────────────────
test('W1.1 — shape.md is one contiguous step sequence (no phantom steps, no 8·pre)', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'shape.md');
    assert.match(src, /# Step 1 — Launch research agents/, `${name}: shape lost Step 1 (research launch)`);
    assert.match(src, /# Step 2 — Discovery interview/, `${name}: shape lost Step 2 (interview)`);
    assert.match(src, /# Step 9a — Adjudicate the intent-risk/, `${name}: shape lost Step 9a (RIM adjudication)`);
    assert.match(src, /# Step 10 — Write the artifacts/, `${name}: shape lost Step 10 (write)`);
    assert.ok(!src.includes('8·pre'), `${name}: stale 8·pre step label survived the renumber`);
    // The sub-agent-2 skip criteria exist in exactly ONE place (Step 1) — the old
    // file stated "Always launch ... sub-agent 2" AND separate skip criteria.
    const hits = src.match(/Zero new external dependencies/g) ?? [];
    assert.equal(hits.length, 1, `${name}: sub-agent-2 skip criteria stated ${hits.length}x (must be single-sourced in Step 1)`);
  }
});

test('W1.2 — the PO tooling question belongs to the orchestrator, not sub-agent 1', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'shape.md');
    const sub1 = src.slice(src.indexOf('### Explore sub-agent 1'), src.indexOf('### Explore sub-agent 2'));
    assert.ok(sub1.length > 0, `${name}: sub-agent section markers missing`);
    // The OLD defect was the literal instruction "Surface a tooling question for the PO"
    // inside the sub-agent prompt. (Prose *explaining* the sub-agent must NOT ask the PO
    // is fine — only the instruction forms are banned.)
    assert.ok(!/AskUserQuestion|Surface a tooling question/i.test(sub1),
      `${name}: sub-agent 1's prompt still embeds a PO question (sub-agents cannot reach the PO)`);
    assert.match(sub1, /REPORTING ONLY/i, `${name}: sub-agent 1 tooling block lost the reporting-only framing`);
    assert.match(src, /[Rr]elay the tooling question/, `${name}: shape lost the Step 3 orchestrator relay`);
  }
});

// ── W2 — input integrity ─────────────────────────────────────────────────────
test('W2.1 — intake carries the misreading pass + none-declared floor; shape backfills', () => {
  for (const { name, root } of trees) {
    const intake = ref(root, 'intake/default.md');
    assert.match(intake, /Misreading pass/i, `${name}: intake lost the Step 6a misreading pass`);
    assert.match(intake, /none-declared/, `${name}: intake lost the none-declared escape`);
    assert.match(intake, /Silence is illegal/i, `${name}: intake lost the silent-absence ban`);
    assert.ok(!/shape\.md Step 8a/.test(intake), `${name}: intake still cites the pre-renumber Step 8a`);
    const shape = ref(root, 'shape.md');
    assert.match(shape, /Missing-ledger branch/i, `${name}: shape lost the 9a missing-ledger branch`);
    assert.match(shape, /backfill/i, `${name}: shape lost the RIM backfill (a standard slug without a ledger may not be waved through)`);
  }
});

test('W2.2 — Charter Scenario is keyed to the work, not the formatting', () => {
  for (const { name, root } of trees) {
    const shape = ref(root, 'shape.md');
    assert.match(shape, /derivable from its prose|derived from its prose/i,
      `${name}: shape's Charter Scenario trigger reverted to numbered-only`);
    assert.match(shape, /charter-scenario/, `${name}: shape lost the charter-scenario frontmatter key`);
    assert.match(shape, /Skipping is a declaration, never a silence/i, `${name}: shape lost the explicit-skip rule`);
    const intake = ref(root, 'intake/default.md');
    assert.match(intake, /NUMBERED STEPS/i, `${name}: intake's Restated Request lost the number-the-loop instruction`);
  }
});

test('W2.3/W3.2 — appetite + provisional review-scope land in the index template', () => {
  for (const { name, root } of trees) {
    const intake = ref(root, 'intake/default.md');
    assert.match(intake, /appetite: <small\|medium\|large>/, `${name}: index template lost the appetite key`);
    assert.match(intake, /review-scope-confirmed: false/, `${name}: index template lost review-scope-confirmed`);
    assert.ok(!/How should the review stage be scoped\?/.test(intake),
      `${name}: the review-scope question crept back into intake Batch A (it moved to slice)`);
    assert.match(intake, /substance first/i, `${name}: intake lost the Batch B-before-A ordering`);
  }
});

test('W2.4 — intake ratifies the charter with the PO at birth', () => {
  for (const { name, root } of trees) {
    const intake = ref(root, 'intake/default.md');
    assert.match(intake, /Ratify the charter/i, `${name}: intake lost the Step 6b charter ratification`);
    assert.match(intake, /promises I heard/i, `${name}: intake lost the ratification question wording`);
  }
});

test('W2.5 — extension mode authors an intent-risk & charter delta for new scope', () => {
  for (const { name, root } of trees) {
    const extend = ref(root, 'intake/extend.md');
    assert.match(extend, /Intent-risk & charter delta/i, `${name}: extend lost the Step 3b fidelity delta`);
    assert.match(extend, /adjudicated in place/i, `${name}: extend lost the adjudicate-in-interview rule (open RIMs with no shape run would wedge handoff)`);
    assert.match(extend, /Zero-delta escape/i, `${name}: extend lost the explicit zero-delta declaration`);
  }
});

// ── W3 — interview coverage & grounding ─────────────────────────────────────
test('W3.1 — the Ambiguity Inventory + coverage gate keep the 20-floor accountable', () => {
  for (const { name, root } of trees) {
    const shape = ref(root, 'shape.md');
    assert.match(shape, /## Ambiguity Inventory/, `${name}: shape lost the Ambiguity Inventory section`);
    assert.match(shape, /AMB-1/, `${name}: shape lost the AMB-n id convention`);
    assert.match(shape, /20 is a floor, not a ceiling/, `${name}: the 20-question floor was weakened (PO directive: it stays)`);
    assert.match(shape, /Coverage gate/i, `${name}: shape lost the Step 2.5 coverage gate`);
    assert.match(shape, /extension-targeted/, `${name}: shape lost the coverage-gate tri-state`);
    assert.match(shape, /closes or confirms no inventory item/, `${name}: shape lost the padding redefinition`);
  }
});

test('W3.2 — review-scope is asked at slice (plan on the skip-to-plan path), exactly once', () => {
  for (const { name, root } of trees) {
    const slice = ref(root, 'slice.md');
    assert.match(slice, /Confirm review scope/i, `${name}: slice lost the review-scope confirmation step`);
    assert.match(slice, /review-scope-confirmed: true/, `${name}: slice lost the confirmed-flag flip`);
    const plan = ref(root, 'plan.md');
    assert.match(plan, /Review-scope fallback/i, `${name}: plan lost the skip-to-plan review-scope fallback`);
  }
});

test('W3.3 — Round 3b budgets the visual-direction questions', () => {
  for (const { name, root } of trees) {
    const shape = ref(root, 'shape.md');
    assert.match(shape, /Round 3b/, `${name}: shape lost Round 3b`);
    assert.match(shape, /ride ON TOP of the 20-question\s+floor/i, `${name}: Round 3b stopped riding on top of the floor`);
  }
});

test('W3.4/W3.5 — intake grounds its questions; shape verifies-and-deepens instead of re-deriving', () => {
  for (const { name, root } of trees) {
    const intake = ref(root, 'intake/default.md');
    assert.match(intake, /Bounded Explore pass/i, `${name}: intake lost the Step 0.7 Explore pass`);
    assert.match(intake, /## Affected Areas \(preliminary\)/, `${name}: intake lost the preliminary-areas section`);
    const shape = ref(root, 'shape.md');
    assert.match(shape, /do not re-derive/i, `${name}: shape sub-agent 1 lost the intake-map handoff clause`);
    assert.match(shape, /verify they still hold and\s+extend/i, `${name}: shape sub-agent 2 lost the freshness handoff clause`);
  }
});

// ── W4 — independence & surfacing ────────────────────────────────────────────
test('W4.1 — intake default/ideate/investigate carry objective consult triggers', () => {
  for (const { name, root } of trees) {
    for (const file of ['intake/default.md', 'intake/ideate.md', 'intake/investigate.md']) {
      const src = ref(root, file);
      assert.match(src, /Auto second opinion \(objective triggers\)/,
        `${name}/${file}: lost the objective consult trigger block`);
      assert.match(src, /auto-invoke/i, `${name}/${file}: consult reverted to offer-only`);
    }
  }
});

test('W4.2 — the pre-mortem generator is blind; the stale externalDispatch gate is gone', () => {
  for (const { name, root } of trees) {
    const shape = ref(root, 'shape.md');
    assert.ok(!shape.includes('externalDispatch'),
      `${name}: shape still gates consult on externalDispatch (consult has been ungated since 2026-07)`);
    assert.match(shape, /po-answers\.md` ONLY/, `${name}: shape lost the blind-generator input restriction`);
    assert.match(shape, /cannot rationalize\s+decisions it never saw/i, `${name}: shape lost the independence rationale`);
    assert.match(shape, /pre-mortem/i, `${name}: shape lost the pre-mortem entirely`);
  }
});

test('W4.3 — the fidelity line reaches chat; dropping a directive needs a this-stage ratification', () => {
  for (const { name, root } of trees) {
    const shape = ref(root, 'shape.md');
    assert.match(shape, /`fidelity:`/, `${name}: shape's chat return lost the fidelity line`);
    assert.match(shape, /all directives honored; all RIMs adjudicated/, `${name}: shape lost the fidelity all-clear form`);
    // Codex has no AskUserQuestion tool — its mirror phrases the same gate as a chat
    // question — so pin the tree-neutral core: a dropped directive needs a THIS-STAGE
    // ratification.
    assert.match(shape, /this-stage `?(AskUserQuestion|PO question|chat question)`? ratification/,
      `${name}: shape lost the dropped-row ratification requirement`);
  }
});

// ── Schema round-trips (main tree owns the schema) ───────────────────────────
test('schema — appetite / review-scope-confirmed / none-declared / charter-scenario validate', () => {
  const require = createRequire(import.meta.url);
  let Ajv;
  try { Ajv = require('ajv'); } catch { return; } // ajv is a maintainer dep; skip if absent
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'tests', 'frontmatter.schema.json'), 'utf8'));
  const defs = schema.$defs ?? schema.definitions;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const idx = defs.indexFrontmatter.properties;

  const appetite = ajv.compile(idx.appetite);
  assert.ok(appetite('small') && appetite('medium') && appetite('large'));
  assert.equal(appetite('xl'), false);

  const rsc = ajv.compile(idx['review-scope-confirmed']);
  assert.ok(rsc(true) && rsc(false));
  assert.equal(rsc('yes'), false);

  // Both ledgers accept the explicit none-declared string AND the entry arrays.
  for (const key of ['intent-risks', 'charter']) {
    const v = ajv.compile(idx[key]);
    assert.ok(v('none-declared'), `${key} must accept none-declared`);
    assert.equal(v('nope'), false, `${key} must reject arbitrary strings`);
  }
  assert.ok(ajv.compile(idx.charter)([{ id: 'C1', commitment: 'x', status: 'honored', 'po-ratified': true }]),
    'charter entries must accept po-ratified');

  const cs = ajv.compile(defs.shapeFrontmatter.properties['charter-scenario']);
  assert.ok(cs('authored') && cs('none — pure library change, no user-facing flow'));
});

// ── Hook — intake ledger lint (main tree only) ───────────────────────────────
const HOOK = path.join(pluginRoot, 'hooks', 'post-write-verify.mjs');

function runHook(input, cwd) {
  return spawnSync(process.execPath, [HOOK], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
  });
}

const INTAKE_MD = `---
schema: sdlc/v1
type: intake
slug: demo
status: complete
stage-number: 1
created-at: "2026-07-14T12:00:00Z"
updated-at: "2026-07-14T12:05:00Z"
tags: []
refs: {}
next-command: wf-shape
next-invocation: "/wf shape demo"
---
# Intake

## Restated Request
Do the thing.
`;

function writeFixture(dir, indexFrontmatter) {
  mkdirSync(path.join(dir, '.ai', 'workflows', 'demo'), { recursive: true });
  writeFileSync(path.join(dir, '.ai', 'workflows', 'demo', '01-intake.md'), INTAKE_MD, 'utf-8');
  if (indexFrontmatter !== null) {
    writeFileSync(
      path.join(dir, '.ai', 'workflows', 'demo', '00-index.md'),
      `---\n${indexFrontmatter}\n---\n`,
      'utf-8',
    );
  }
}

test('hook — a ledger-less default intake WARNS; none-declared and real ledgers stay silent', () => {
  const cases = [
    // Sibling index with neither ledger nor declaration → advisory warning.
    { index: 'slug: demo', warns: true },
    // Explicit escape → silent.
    { index: 'slug: demo\nintent-risks: none-declared\ncharter: none-declared', warns: false },
    // Real ledgers → silent.
    {
      index: 'slug: demo\nintent-risks:\n  - id: RIM-1\n    risk: x\n    severity: high\n    status: open\ncharter:\n  - id: C1\n    commitment: x\n    status: honored',
      warns: false,
    },
    // No sibling index at all (not a default-mode run in flight) → silent.
    { index: null, warns: false },
  ];
  for (const { index, warns } of cases) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'sdlc-ish-'));
    try {
      writeFixture(tmp, index);
      const result = runHook({ cwd: tmp, tool_input: { file_path: '.ai/workflows/demo/01-intake.md' } }, tmp);
      assert.equal(result.status, 0, result.stderr);
      if (warns) {
        assert.match(result.stdout, /intake ledger lint/, `expected the advisory warning for index=${JSON.stringify(index)}`);
        assert.match(result.stdout, /none-declared/, 'warning must name the escape hatch');
      } else {
        assert.ok(!/intake ledger lint/.test(result.stdout),
          `unexpected warning for index=${JSON.stringify(index)}: ${result.stdout}`);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
});

test('hook — the intake ledger lint never fires on compressed-mode intake artifacts (01-fix.md)', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'sdlc-ish-'));
  try {
    mkdirSync(path.join(tmp, '.ai', 'workflows', 'demo'), { recursive: true });
    // Same type: intake, but the compressed-mode filename — exempt by design.
    writeFileSync(path.join(tmp, '.ai', 'workflows', 'demo', '01-fix.md'), INTAKE_MD, 'utf-8');
    writeFileSync(path.join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), '---\nslug: demo\n---\n', 'utf-8');
    const result = runHook({ cwd: tmp, tool_input: { file_path: '.ai/workflows/demo/01-fix.md' } }, tmp);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!/intake ledger lint/.test(result.stdout), `compressed mode must be exempt: ${result.stdout}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
