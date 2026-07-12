// Drift guards for the INTENT-FIDELITY hardening plan (R1 spine: W1/W2/W7/W9.4/W10.1).
// Each wave converts an ambient reframing into a written, gated decision; these tests
// pin the load-bearing prompt phrases so a future edit can't silently delete the gate.
// Reference content is mirrored to the codex tree, so the reference-prose guards iterate
// BOTH trees (the schema + renderer guards are main-tree only — codex has neither).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
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

// ── R2 reference prose (both trees) ─────────────────────────────────────────
test('R2 — verify.md carries the evidence-rung / mock / skip / first-light gate rules', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'verify.md');
    assert.match(src, /evidence-rung/, `${name}: verify lost evidence-rung`);
    assert.match(src, /uncited-mock/, `${name}: verify lost the cited/uncited-mock split`);
    assert.match(src, /mock-provenance/, `${name}: verify lost mock-provenance`);
    assert.match(src, /fixture-fidelity/, `${name}: verify lost the fixture-fidelity spot-check`);
    assert.match(src, /skipped-gating-specs/, `${name}: verify lost the per-AC skip rule`);
    assert.match(src, /first-light/, `${name}: verify lost first-light tracking`);
    assert.match(src, /absorbed-by/, `${name}: verify lost the deferral-stacking stop`);
    assert.match(src, /metric-acceptance-mock-rung/, `${name}: verify lost the mock-rung gate hook reference`);
  }
});

test('R2 — plan/implement carry the limitation-citation + suppression-debt rules', () => {
  for (const { name, root } of trees) {
    const plan = ref(root, 'plan.md');
    const impl = ref(root, 'implement.md');
    assert.match(plan + impl, /hypothes/i, `${name}: lost the "comments are hypotheses" rule`);
    assert.match(impl, /sdlc-debt/, `${name}: implement lost the suppression → sdlc-debt rule`);
  }
});

// ── R3 taxonomy + review dimension + question framing (both trees) ──────────
test('R3 — _decision-classes.md exists in every tree with both classes + the example table', () => {
  for (const { name, root } of trees) {
    const p = path.join(root, 'skills', 'wf', 'reference', '_decision-classes.md');
    assert.ok(existsSync(p), `${name}: missing _decision-classes.md`);
    const src = readFileSync(p, 'utf8');
    assert.match(src, /intent-bearing/i, `${name}: decision-classes lost the intent-bearing class`);
    assert.match(src, /implementation-detail/i, `${name}: decision-classes lost the implementation-detail class`);
    assert.match(src, /control authority/i, `${name}: decision-classes lost the control-authority criterion`);
    assert.match(src, /class: implementation-detail/, `${name}: decision-classes lost the autonomous stamp rule`);
  }
});

test('R3 — the intent-fidelity review dimension exists in every tree (the 34th)', () => {
  for (const { name, root } of trees) {
    const p = path.join(root, 'skills', 'wf', 'reference', 'review', 'intent-fidelity.md');
    assert.ok(existsSync(p), `${name}: missing review/intent-fidelity.md`);
    const src = readFileSync(p, 'utf8');
    assert.match(src, /transitive/i, `${name}: intent-fidelity lost the transitive-fidelity framing`);
    assert.match(src, /control authority/i, `${name}: intent-fidelity lost the control-authority question`);
  }
});

test('R3 — review/_stage.md keeps intent-fidelity always-on; plan/implement + yolo cite the taxonomy', () => {
  for (const { name, root } of trees) {
    const stage = ref(root, 'review/_stage.md');
    assert.match(stage, /intent-fidelity/, `${name}: review selection lost intent-fidelity`);
    const plan = ref(root, 'plan.md');
    const impl = ref(root, 'implement.md');
    assert.match(plan + impl, /_decision-classes/, `${name}: plan/implement lost the taxonomy citation`);
  }
  // yolo is Claude-only — its policy row lives in the main tree only.
  const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'yolo.md'), 'utf8');
  assert.match(yolo, /_decision-classes|intent-bearing/, 'yolo lost the intent-bearing STOP row');
});

test('R3 — question-craft consequence framing + shape pre-mortem (both trees)', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_question-craft.md'), /runtime consequence/i, `${name}: question-craft lost consequence framing`);
    assert.match(ref(root, 'shape.md'), /pre-mortem/i, `${name}: shape lost the pre-mortem`);
  }
});

test('R3 — the review dimension roster is 34 in every tree', () => {
  for (const { name, root } of trees) {
    const dir = path.join(root, 'skills', 'wf', 'reference', 'review');
    const dims = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    assert.ok(dims.includes('intent-fidelity.md'), `${name}: intent-fidelity.md not in the roster`);
    assert.ok(dims.length >= 34, `${name}: expected >=34 review dimensions, got ${dims.length}`);
  }
});

// ── R2 evidence-schema fields validate against the frontmatter schema ───────
test('R2 — verify + index evidence fields validate (EVIDENCE-SCHEMA-CONTRACT)', () => {
  const require = createRequire(import.meta.url);
  let Ajv;
  try { Ajv = require('ajv'); } catch { return; }
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'tests', 'frontmatter.schema.json'), 'utf8'));
  const defs = schema.$defs ?? schema.definitions;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const compile = (s) => ajv.compile(s);

  // verify: metric-acceptance-mock-rung + skipped-gating-specs
  const verifyProps = defs.verifyFrontmatter.properties;
  assert.ok(verifyProps['metric-acceptance-mock-rung'], 'verify schema missing metric-acceptance-mock-rung');
  assert.ok(compile(verifyProps['metric-acceptance-mock-rung'])(2));
  assert.equal(compile(verifyProps['metric-acceptance-mock-rung'])(-1), false);
  const skip = compile(verifyProps['skipped-gating-specs']);
  assert.ok(skip([{ spec: 'auth.e2e.ts', ac: 'AC-7', precondition: 'set BETTER_AUTH_SECRET' }]), JSON.stringify(skip.errors));
  assert.equal(skip([{ spec: 'x' }]), false); // ac required

  // index: evidence-quality + unproven-integrations
  const idxProps = defs.indexFrontmatter.properties;
  assert.ok(compile(idxProps['evidence-quality'])({ live: 2, 'cited-mock': 3 }));
  const unproven = compile(idxProps['unproven-integrations']);
  assert.ok(unproven([{ name: 'openrouter', 'introduced-by': 'platform-proofs', 'first-light': null }]), JSON.stringify(unproven.errors));

  // deferral items: absorbed-by, needed-by, probe (W5.3/W9.2/YOLO F2)
  const deferral = idxProps['runtime-evidence-deferrals'].items.properties;
  assert.ok(deferral['absorbed-by'] && deferral['needed-by'] && deferral['probe'],
    'deferral item schema missing absorbed-by / needed-by / probe');
});

// ── R4 charter (schema + prose + chip) ──────────────────────────────────────
test('R4 — charter validates against the index schema', () => {
  const require = createRequire(import.meta.url);
  let Ajv;
  try { Ajv = require('ajv'); } catch { return; }
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'tests', 'frontmatter.schema.json'), 'utf8'));
  const defs = schema.$defs ?? schema.definitions;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(defs.indexFrontmatter.properties['charter']);
  assert.ok(validate([{ id: 'C1', commitment: 'the model owns probing', source: '01-intake.md#restated', status: 'honored' }]), JSON.stringify(validate.errors));
  assert.equal(validate([{ id: 'C1', commitment: 'x', status: 'maybe' }]), false); // bad status
  assert.equal(validate([{ commitment: 'x', status: 'honored' }]), false);          // id required
});

test('R4 — charter authoring/scenario/precedence prose lands (both trees)', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'intake/default.md'), /charter/i, `${name}: intake lost charter authoring`);
    assert.match(ref(root, 'shape.md'), /Charter Scenario/i, `${name}: shape lost the charter scenario`);
    assert.match(ref(root, 'shape.md'), /yields-to|outranks/i, `${name}: shape lost constraint precedence`);
  }
});

test('R4 — yolo.md documents the charter checkpoint + decision digest (Claude-only)', () => {
  const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'yolo.md'), 'utf8');
  assert.match(yolo, /charter/i, 'yolo lost the charter checkpoint');
  assert.match(yolo, /decision digest|decisionDigest/i, 'yolo lost the decision digest');
});

// ── R5 meta-loop (config plumbing + retro/plan prose) ───────────────────────
test('R5 — solutions.globalDir round-trips through config (default null, validates a path)', async () => {
  const cfg = await import(pathToFileURL(path.join(pluginRoot, 'lib', 'config.mjs')).href);
  assert.equal(cfg.DEFAULT_SDLC_CONFIG.solutions.globalDir, null, 'default globalDir should be null');
  const merged = cfg.deepMerge(cfg.DEFAULT_SDLC_CONFIG, { solutions: { globalDir: '/home/u/.sdlc/solutions' } });
  assert.equal(merged.solutions.globalDir, '/home/u/.sdlc/solutions', 'user globalDir did not merge through');
  const good = await cfg.validateConfig({ solutions: { globalDir: '/x' } });
  assert.equal(good.valid, true, JSON.stringify(good.errors));
  const bad = await cfg.validateConfig({ solutions: { nope: 1 } });
  assert.equal(bad.valid, false, 'unknown solutions key should be rejected (additionalProperties:false)');
});

test('R5 — retro carries the global-corpus + plugin-feedback + deep-retro prose', () => {
  for (const { name, root } of trees) {
    const retro = ref(root, 'retro.md');
    assert.match(retro, /globalDir|global (corpus|solutions)/i, `${name}: retro lost the global-corpus promotion`);
    assert.match(retro, /plugin-feedback|about-the-workflow/i, `${name}: retro lost the plugin-feedback channel`);
  }
  // deep-retro transcript mining is Claude-only (codex has no transcript dir).
  const mainRetro = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'retro.md'), 'utf8');
  assert.match(mainRetro, /\bdeep\b/, 'main retro lost the deep token');
  assert.match(mainRetro, /transcript/i, 'main retro lost transcript mining');
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

test('W8.1 — index renderer emits a charter chip, byte-stable when absent', async () => {
  const mod = await import(pathToFileURL(path.join(pluginRoot, 'renderers', 'index.mjs')).href);
  const base = { frontmatter: { slug: 's', title: 'S', 'current-stage': 'shape', status: 'active' }, body: '', history: null };
  const ctx = { allArtifacts: {} };
  assert.ok(!mod.render(base, ctx).headerHtml.includes('charter'), 'charter chip leaked when absent');

  const broken = mod.render({ ...base, frontmatter: { ...base.frontmatter, charter: [{ id: 'C1', commitment: 'x', status: 'broken' }] } }, ctx).headerHtml;
  assert.match(broken, /charter broken/i, 'broken commitment did not surface a warning chip');

  const ok = mod.render({ ...base, frontmatter: { ...base.frontmatter, charter: [{ id: 'C1', status: 'honored' }, { id: 'C2', status: 'honored' }] } }, ctx).headerHtml;
  assert.match(ok, /charter · 2/, 'honored charter count not surfaced');
});
