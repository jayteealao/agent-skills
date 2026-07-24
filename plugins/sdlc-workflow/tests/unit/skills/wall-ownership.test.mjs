// Drift guards for the WALL-OWNERSHIP hardening (R1-R4, v9.140.0).
//
// Origin: a slug stacked five slices of deferred live evidence behind "host port
// 8080 is held by another process" while its own debug build hard-coded
// `const FIRESTORE_PORT = 8080`. Every existing mechanism fired correctly and
// still produced the wrong outcome, because each classified the wall by SYMPTOM
// (which probe failed) when the decision hinges on OWNERSHIP (who can dissolve
// it). R1 forces the ownership verdict; R2 forbids passive clearing events; R3
// forces the retire-vs-carry cost line; R4 names the env-remediation rung with
// an authority-bounded allow/deny list.
//
// These tests pin the load-bearing phrases so a future edit cannot silently drop
// a gate. Reference prose is mirrored to the codex tree (with `$wf` in place of
// `/wf`), so shared-file guards iterate BOTH trees; yolo.md is Claude-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const ref = (root, rel) => readFileSync(path.join(root, 'skills', 'wf', 'reference', rel), 'utf8');
const mainRef = (rel) => ref(pluginRoot, rel);

// ── R1 — wall-ownership triage ───────────────────────────────────────────────
test('R1.1 — the ladder classifies wall ownership BEFORE climbing', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    assert.match(src, /Classify the wall before you climb it/,
      `${name}: runtime-adapters lost the wall-ownership triage block`);
    assert.match(src, /would a change to code in\s+THIS repo dissolve this wall\?/i,
      `${name}: the triage question (does OUR code pin this?) is gone`);
    for (const verdict of ['code-owned', 'environment-negotiable', 'external']) {
      assert.ok(src.includes(`\`${verdict}\``), `${name}: ladder lost the \`${verdict}\` verdict`);
    }
    // Ordering is the whole point: triage must precede attempt-before-declare.
    assert.ok(src.indexOf('Classify the wall before you climb it') <
      src.indexOf('Declare incapability only over a probe'),
      `${name}: triage must come BEFORE the probe rule — it decides which playbook runs`);
  }
});

test('R1.2 — a code-owned wall cannot be deferred without a surfaced decision', () => {
  for (const { name, root } of trees) {
    const ladder = ref(root, 'runtime-adapters.md');
    assert.match(ladder, /`code-owned` wall may NOT be deferred/,
      `${name}: ladder lost the code-owned deferral prohibition`);

    const verify = ref(root, 'verify.md');
    assert.match(verify, /Classify the wall before deferring it/,
      `${name}: verify's escape hatch lost the wall-ownership gate`);
    assert.match(verify, /deferral hatch is \*\*unavailable\*\*/,
      `${name}: verify no longer withholds the hatch from code-owned walls`);
    assert.match(verify, /interactive-verification-wall-ownership/,
      `${name}: the deferral frontmatter lost wall-ownership`);
    assert.match(verify, /wall-ownership: code-owned \| environment-negotiable \| external/,
      `${name}: 00-index deferral schema lost the wall-ownership field`);
  }
});

test('R1.3 — plan re-classifies rather than inheriting a prior verdict', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'plan.md');
    assert.match(src, /Re-classify the wall first — never inherit the prior entry's verdict/,
      `${name}: plan's tripwire lost the re-classification step`);
    assert.match(src, /not\*\* eligible for `harness-declined` on grounds of environment/,
      `${name}: plan lets a code-owned wall be declined as environmental`);
    assert.match(src, /wall-ownership: code-owned \| environment-negotiable \| external/,
      `${name}: constraint-resolution lines lost the ownership stamp`);
  }
  // The stacking STOP must re-triage too — a 3-deep stack is the loudest
  // available signal that the first classification was wrong.
  for (const { name, root } of trees) {
    assert.match(ref(root, 'verify.md'), /Re-run the ownership triage at the STOP/,
      `${name}: deferral-stacking STOP inherits the original (possibly wrong) verdict`);
  }
});

// ── R2 — clearing events name an actor ───────────────────────────────────────
test('R2.1 — verify rejects passive clearing events', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'verify.md');
    assert.match(src, /A clearing event names an actor, not a hope/,
      `${name}: verify lost the provisionable-clearing-event rule`);
    // The literal Playster wording is the canonical counter-example.
    assert.ok(src.includes('once host port 8080 frees'),
      `${name}: the passive-clearing-event counter-example is gone`);
    assert.match(src, /indefinite\s+by construction/,
      `${name}: verify no longer explains WHY a passive event is illegitimate`);
    assert.match(src, /`code-owned` wall can never have a passive\s*\n?clearing event/,
      `${name}: the code-owned/passive-event interlock is missing`);
    assert.match(src, /clearing-event: "<the provisionable act/,
      `${name}: deferral schema lost the clearing-event field`);
  }
});

test('R2.2 — plan forbids parking a code-owned wall behind proxy+deferral', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'plan.md');
    assert.match(src, /clearing event must be provisionable/,
      `${name}: force-scope option 2 lost the provisionable requirement`);
    assert.match(src, /Option 2 is unavailable to a `code-owned` wall/,
      `${name}: a code-owned wall can still be parked behind a deferral`);
  }
});

// ── R3 — cost the wall before choosing ───────────────────────────────────────
test('R3.1 — the repeat-deferral tripwire demands a retire-vs-carry cost line', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'plan.md');
    assert.match(src, /Cost the wall before choosing/,
      `${name}: plan's tripwire lost the cost-accounting step`);
    assert.match(src, /wall-cost: retire ≈ .* \| carry = /,
      `${name}: the wall-cost line template is gone`);
    assert.match(src, /`harness-declined:` is lawful only \*after\* this line is written/,
      `${name}: declining a wall no longer requires costing it first`);
  }
});

// ── R4 — env-remediation rung ────────────────────────────────────────────────
test('R4.1 — the ladder names the env-remediation rung, bounded by authority', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    assert.match(src, /Negotiate the environment before declaring it \(the env-remediation rung\)/,
      `${name}: ladder lost the env-remediation rung`);
    assert.match(src, /\*\*authority, not effort\*\*/,
      `${name}: the rung lost its authority-not-effort boundary`);
    // Allowlist: the port rebind is the case that started all this.
    assert.match(src, /Rebind a harness-owned service to a different port/,
      `${name}: the port-rebind allowance is gone`);
    assert.match(src, /Never defer\s*\n?\s*over a port the run itself binds/,
      `${name}: lost the "never defer over a port you bind" rule`);
    // Denylist: the three things a run must never do unprompted.
    assert.match(src, /Killing, stopping, or restarting a process the run did not start/,
      `${name}: the foreign-process prohibition is gone`);
    assert.match(src, /Mutating host or system configuration/,
      `${name}: the host-config prohibition is gone`);
    assert.match(src, /Editing product code to make evidence collectible/,
      `${name}: the product-code prohibition is gone`);
    assert.ok(src.indexOf('Negotiate the environment before declaring it') < src.indexOf('### Web UI'),
      `${name}: the remediation rung must precede the per-adapter ladders`);
  }
});

test('R4.2 — yolo climbs remediation before deferring, and stops on a code-owned wall', () => {
  const src = mainRef('yolo.md');
  assert.match(src, /env-remediation rung/,
    'yolo: the driver no longer climbs the remediation rung before deferring');
  assert.match(src, /never defer over a port the run itself binds/i,
    'yolo: lost the port-rebind auto-resolve');
  assert.match(src, /`code-owned` wall .*is \*\*not\*\* auto-deferrable/,
    'yolo: a code-owned wall can be auto-deferred again');
  assert.match(src, /`code-owned` wall with no scoped resolution/,
    'yolo: the HARD-STOP column lost the code-owned wall');
  assert.match(src, /Negotiating the environment, precisely:/,
    'yolo: lost the narrative "precisely" paragraph for the remediation rung');
  // The driver must neither patch product code nor defer around its own constant.
  assert.match(src, /may \*\*not\*\* quietly patch product code/,
    'yolo: the driver may now improvise product-code edits to unblock itself');
});

test('R4.3 — probe remediates and re-triages before re-recording a wall', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /Climb the env-remediation rung before leaving one uncleared/,
      `${name}: probe re-records walls without attempting remediation`);
    assert.match(src, /Re-run the ownership triage on every wall that survives/,
      `${name}: probe inherits stale ownership verdicts`);
    assert.match(src, /a claim, not a fact/,
      `${name}: probe treats an inherited deferral as established fact`);
  }
});

// ── Cross-cutting — the trees agree on the new contract ──────────────────────
test('R1-R4 — codex mirror carries every new rule with $wf substitution', () => {
  if (trees.length < 2) return; // codex tree absent in this checkout
  const phrases = [
    ['runtime-adapters.md', 'Classify the wall before you climb it'],
    ['runtime-adapters.md', 'Negotiate the environment before declaring it'],
    ['verify.md', 'Classify the wall before deferring it'],
    ['verify.md', 'A clearing event names an actor'],
    ['plan.md', 'Cost the wall before choosing'],
    ['plan.md', 'Option 2 is unavailable to a `code-owned` wall'],
    ['probe.md', 'Climb the env-remediation rung'],
  ];
  for (const [file, phrase] of phrases) {
    assert.ok(ref(codexRoot, file).includes(phrase), `codex ${file} missing: ${phrase}`);
  }
  // Codex prose addresses `$wf`, never `/wf` — a leaked slash form is a bad mirror.
  for (const file of ['verify.md', 'plan.md', 'probe.md', 'runtime-adapters.md']) {
    const codexSrc = ref(codexRoot, file);
    for (const block of ['A clearing event names an actor', 'clearing event must be provisionable']) {
      const at = codexSrc.indexOf(block);
      if (at < 0) continue;
      const window = codexSrc.slice(at, at + 1200);
      assert.ok(!window.includes('/wf probe'), `codex ${file}: leaked "/wf probe" into ${block}`);
    }
  }
});
