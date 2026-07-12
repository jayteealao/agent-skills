// Drift guards for the INTENT-FIDELITY hardening plan (R1 spine: W1/W2/W7/W9.4/W10.1).
// Each wave converts an ambient reframing into a written, gated decision; these tests
// pin the load-bearing prompt phrases so a future edit can't silently delete the gate.
// Reference content is mirrored to the codex tree, so the reference-prose guards iterate
// BOTH trees (the schema + renderer guards are main-tree only — codex has neither).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const ref = (root, rel) => readFileSync(path.join(root, 'skills', 'wf', 'reference', rel), 'utf8');

// ── W1 — Intent-Risk (RIM) ledger ──────────────────────────────────────────
test('W1.1 — intake authors the RIM ledger into intent-risks', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'intake/default.md');
    assert.match(src, /RIM-1/, `${name}: intake lost the RIM id convention`);
    assert.match(src, /intent-risks/, `${name}: intake lost the intent-risks ledger authoring`);
  }
});

test('W1.2 — shape MUST adjudicate every open RIM (the core gate)', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'shape.md');
    assert.match(src, /Adjudicate the intent-risk/i, `${name}: shape lost the RIM adjudication step`);
    assert.match(src, /status: adjudicated/, `${name}: shape lost the adjudicated disposition`);
    assert.match(src, /status: carried/, `${name}: shape lost the carried disposition`);
    // The ban phrase — a shape leaving any RIM open may not complete.
    assert.match(src, /may NOT write `?status: complete`?/i, `${name}: shape lost the open-RIM completion ban`);
    assert.match(src, /ILLEGAL/, `${name}: shape lost the restate-without-decision ban`);
  }
});

// ── W2 — PO-answer scope-of-authority + Intake Fidelity ─────────────────────
test('W2.1 — _question-craft carries the scope-of-authority clause', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_question-craft.md');
    assert.match(src, /[Ss]cope of authority/, `${name}: question-craft lost scope-of-authority`);
    assert.match(src, /decides only the question it was asked/i, `${name}: question-craft lost the answer-scope rule`);
    assert.match(src, /scope:/, `${name}: question-craft lost the scope: recording line`);
  }
});

test('W2.2 — shape carries the Intake Fidelity table', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'shape.md');
    assert.match(src, /## Intake Fidelity/, `${name}: shape lost the Intake Fidelity section`);
    assert.match(src, /honored \/ narrowed \/ dropped|honored.*narrowed.*dropped/i, `${name}: shape lost the disposition vocabulary`);
  }
});

// ── W7 — named-mechanism rule (shape + slice) ───────────────────────────────
test('W7 — named-mechanism rule in shape and slice', () => {
  for (const { name, root } of trees) {
    for (const file of ['shape.md', 'slice.md']) {
      const src = ref(root, file);
      assert.match(src, /state machine|scheduler|queue|cache|pipeline|orchestrator|regex/i,
        `${name}/${file}: lost the mechanism vocabulary`);
      assert.match(src, /named decision in (this|the) (slice's |)?(artifact's |)?body|named decision in the artifact body/i,
        `${name}/${file}: lost the named-mechanism-in-body requirement`);
    }
  }
});

// ── W9.4 — adoption-matrix reconciliation ───────────────────────────────────
test('W9.4 — slug-wide review reconciles the adoption matrix', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'review/_stage.md');
    assert.match(src, /adoption[- ]matrix/i, `${name}: review lost the adoption-matrix reconciliation`);
    assert.match(src, /USE row|`USE`/i, `${name}: review lost the USE-row usage check`);
  }
});

// ── W10.1 — chat-return Deltas line ─────────────────────────────────────────
test('W10.1 — _chat-return leads the receipt with a Deltas line', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_chat-return.md');
    assert.match(src, /Deltas/, `${name}: chat-return lost the Deltas line`);
    assert.match(src, /narrowed/, `${name}: chat-return lost the narrowed-directives delta`);
  }
});

// ── Schema round-trip for intent-risks (main tree owns the schema) ──────────
test('intent-risks validates against the 00-index frontmatter schema', () => {
  const require = createRequire(import.meta.url);
  let Ajv;
  try { Ajv = require('ajv'); } catch { return; } // ajv is a maintainer dep; skip if absent
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'tests', 'frontmatter.schema.json'), 'utf8'));
  const idx = schema.$defs?.indexFrontmatter ?? schema.definitions?.indexFrontmatter;
  assert.ok(idx?.properties?.['intent-risks'], 'indexFrontmatter schema is missing intent-risks');
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(idx.properties['intent-risks']);
  // A well-formed ledger validates…
  assert.ok(validate([
    { id: 'RIM-1', risk: 'spirit vs runtime', severity: 'high', status: 'open', 'po-ratified': null },
    { id: 'RIM-2', risk: 'x', severity: 'low', status: 'adjudicated', 'adjudicated-by': '02-shape.md#x', decision: 'chose Y', 'po-ratified': 'not-required' },
    { id: 'RIM-3', risk: 'y', severity: 'medium', status: 'carried', 'po-ratified': true },
  ]), JSON.stringify(validate.errors));
  // …a bad severity does not.
  assert.equal(validate([{ id: 'RIM-9', risk: 'z', severity: 'critical', status: 'open' }]), false);
  // …a bad status does not.
  assert.equal(validate([{ id: 'RIM-9', risk: 'z', severity: 'low', status: 'maybe' }]), false);
});

// ── W1.3 renderer chip (main tree renderer) ─────────────────────────────────
test('W1.3 — index renderer emits an intent-risks chip, byte-stable when absent', async () => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'renderers', 'index.mjs')).href);
  const base = { frontmatter: { slug: 's', title: 'S', 'current-stage': 'shape', status: 'active' }, body: '', history: null };
  const ctx = { allArtifacts: {} };
  const withoutRisks = mod.render(base, ctx).headerHtml;
  assert.ok(!withoutRisks.includes('intent-risk'), 'chip leaked when ledger absent (breaks byte-stability of old pages)');

  const open = mod.render({ ...base, frontmatter: { ...base.frontmatter, 'intent-risks': [{ id: 'RIM-1', severity: 'high', status: 'open' }] } }, ctx).headerHtml;
  assert.match(open, /intent-risk.*open/i, 'open RIM did not surface a warning chip');

  const clean = mod.render({ ...base, frontmatter: { ...base.frontmatter, 'intent-risks': [{ id: 'RIM-1', status: 'adjudicated' }, { id: 'RIM-2', status: 'carried' }] } }, ctx).headerHtml;
  assert.match(clean, /adjudicated/, 'adjudicated/carried counts not surfaced');
  assert.ok(!/\bopen\b/i.test(clean.replace(/intent-risk/gi, '')), 'clean ledger falsely reported open');
});
