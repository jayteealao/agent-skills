// Drift guards for the HANDOFF-SHIP-STREAMLINE plan (W0.1, W1–W7).
//
// The audit behind this plan found something unusual: every gate fired CORRECTLY.
// What cost 29 hours on one PR with zero product regressions was that the gates
// were fed correct inputs LATE — handoff pushed before running anything locally,
// so a formatter miss and a lint violation were discovered by CI at ~7 hours a
// round. So these waves remove round trips rather than adding gates, and the
// phrases below are the load-bearing ones: a future edit that deletes them
// silently restores the round trip.
//
// Reference prose is mirrored to the codex tree, so the prose guards iterate BOTH
// trees. The release-guard script and the consult dispatcher are main-tree only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const ref = (root, rel) => readFileSync(path.join(root, 'skills', 'wf', 'reference', rel), 'utf8');

// ── W1 — local pre-push gate ────────────────────────────────────────────────

test('W1.1 — handoff carries a pre-push-checks config key with a per-command bound', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /^pre-push-checks:/m, `${name}: the pre-push-checks config key is gone`);
    assert.match(src, /timeout-minutes:/, `${name}: pre-push-checks lost its per-command bound`);
    assert.match(src, /on-fail: diagnose/, `${name}: pre-push-checks lost its on-fail routing`);
  }
});

test('W1.2 — an absent key auto-detects, discloses what it skipped, and asks once', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    // Conservative detection is the whole safety story: a detected list that
    // silently drops the secrets-dependent jobs reads as coverage it lacks.
    assert.match(src, /secrets\./, `${name}: detection lost its secrets-dependent skip rule`);
    assert.match(src, /Record what detection skipped and why/i,
      `${name}: detection may no longer truncate silently — the disclosure rule is gone`);
    assert.match(src, /Run them and remember/, `${name}: the persist-the-answer option is gone`);
  }
});

test('W1.3 — the gate runs BEFORE the push and reuses the existing fix path', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    const gate = src.indexOf('5e. **T3.8');
    const push = src.indexOf('**Push and create-or-update PR');
    assert.ok(gate > 0, `${name}: step 5e (T3.8, the local pre-push gate) is gone`);
    assert.ok(push > gate, `${name}: the pre-push gate no longer precedes the push — it gates nothing`);
    // Ordering alone is not enough in the main tree, where the sequence is a real
    // task graph: T4 must be BLOCKED by T3.8, or the push can jump the gate. The
    // codex tree has no Task tool — its sequence is a plain ordered list, so
    // position is the only ordering it has.
    if (name === 'main') {
      assert.match(src, /T4: `subject: "Push branch to remote"`[^\n]*addBlockedBy: \["T3\.8"\]/,
        `${name}: T4 no longer waits on the pre-push gate`);
    }
    assert.match(src, /Local fix rounds do \*{0,2}NOT\*{0,2} consume/i,
      `${name}: local rounds started consuming the CI fix-round budget again`);
  }
});

test('W1.4 — changed workflow files get a static setup-* pin check', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /actions\/setup-\*/, `${name}: the setup-* pin validation is gone`);
    assert.match(src, /Adoptium/, `${name}: the setup-java manifest check is gone`);
    assert.match(src, /^workflow-validation:/m, `${name}: workflow-validation is no longer recorded`);
  }
});

// ── W2 — fix-loop method fidelity ───────────────────────────────────────────

test('W2.1 — every fix sub-agent LEADS its return with Method, never a trailing note', () => {
  const surfaces = [
    ['_pr-ci-handoff.md', /Method: as-prescribed \| deviated/],
    ['verify.md', /Method: as-prescribed \| deviated/],
    ['review/_stage.md', /Method: as-prescribed \| deviated/],
  ];
  for (const { name, root } of trees) {
    for (const [rel, re] of surfaces) {
      assert.match(ref(root, rel), re, `${name}/${rel}: the Method-first return contract is gone`);
    }
  }
});

test('W2.2 — rule 5 checks the METHOD, and a prohibition-crossing deviation hard-stops', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_fix-loop.md');
    assert.match(src, /Orchestrator sanity check — issue AND method/,
      `${name}: rule 5 lost its method clause`);
    assert.match(src, /never[\s*]+auto-accepted/,
      `${name}: a deviated method may be auto-accepted again`);
    assert.match(src, /hard stop/i,
      `${name}: crossing an explicit prohibition is no longer a hard stop`);
  }
});

test('W2.3 — the self-check is a command with an exit status, not a promise', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_fix-loop.md'), /self-checked by command/i,
      `${name}: rule 4 went back to unenforceable prose`);
    assert.match(ref(root, '_pr-ci-handoff.md'), /Self-check:.*exit/s,
      `${name}: the fix prompt no longer requires a reported exit status`);
  }
});

// ── W3 — class the red before counting it ───────────────────────────────────

test('W3.1 — the diagnosis must answer whether repeating the fix converges', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /`converges`.*`yes`.*`no`.*`unknown`/,
      `${name}: converges is no longer a required diagnosis field`);
    // The Roborazzi loop was flaky-or-infra AND non-convergent and those needed
    // opposite answers — the distinction is the point of the field.
    assert.match(src, /not a harder version of `flaky-or-infra`/,
      `${name}: converges collapsed back into the class field`);
    assert.match(src, /converges: no[`*\s]+— do [`*\s]*not[`*\s]* offer another patch round/,
      `${name}: a non-convergent red can be offered a patch round again`);
  }
});

test('W3.2 — only product-bug rounds consume max-fix-rounds', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /bounds \*\*`product-bug` rounds only\*\*/,
      `${name}: the fix-round budget went back to counting every class alike`);
    assert.match(src, /^ci-fix-rounds-by-class:/m,
      `${name}: the per-class round accounting is gone`);
  }
});

test('W3.3 — exceeding the bound names the remaining classes and the structural fix', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'handoff.md'), /name what it cost/i,
      `${name}: a bound-exceed can go back to asking for "another round"`);
  }
});

// ── W4 — drift gate amends inline ───────────────────────────────────────────

test('W4.1 — the drift gate can amend inline, scoped to the drifted blocks', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Amend now and continue/, `${name}: the inline-amend option is gone`);
    assert.match(src, /only\*\* the block letters named by the findings/,
      `${name}: the inline amendment lost its scope restriction`);
    assert.match(src, /Re-check, don't assume/,
      `${name}: the inline amendment no longer re-verifies before continuing`);
  }
});

test('W4.2 — STOP remains the fallback; an unverified amendment never continues', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Still dirty → fall back to STOP/,
      `${name}: a still-dirty re-check can continue the run`);
    assert.match(src, /never continues on an amendment it has not re-verified/,
      `${name}: the boundary statement lost its re-verification guarantee`);
  }
});

test('W4.3 — a STOP preserves the orientation work it already did', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /resume-orientation:/, `${name}: resume-orientation state is gone`);
    // Trusting stale re-entry state is worse than none — the head-SHA check is
    // what makes keeping it safe.
    assert.match(src, /HEAD` still matches the recorded range's head/,
      `${name}: resume-orientation lost its staleness check`);
  }
});

test('W4.4 — both callers accept amended-inline as a continuing verdict', () => {
  for (const { name, root } of trees) {
    for (const rel of ['handoff.md', 'ship.md']) {
      assert.match(ref(root, rel), /amended-inline/,
        `${name}/${rel}: amended-inline is not a recognized readiness verdict`);
    }
    assert.match(ref(root, 'ship-plan/edit.md'), /Scoped invocation/,
      `${name}: ship-plan edit lost its scoped sub-step contract`);
  }
});

// ── W5 — slice-roster status write-back (the audit's one outright bug) ──────

test('W5.1/W5.2 — implement and verify write the slice status back to the roster', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'implement.md'), /write the slice's status back to the roster/i,
      `${name}: implement stopped writing back to 03-slice.md`);
    assert.match(ref(root, 'verify.md'), /promote the slice's roster status/i,
      `${name}: verify stopped promoting the roster entry`);
    // A deferral-only partial still owes runtime evidence — it is not complete.
    assert.match(ref(root, 'verify.md'), /deferral-only `partial` is \*\*not\*\* complete/,
      `${name}: a deferral-only partial can be marked complete again`);
  }
});

test('W5.3 — handoff reconciles a stale roster instead of reporting "no implemented slices"', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /Reconcile a stale roster before concluding "none"/,
      `${name}: handoff went back to silently skipping a slug with a stale roster`);
    // Neither silently skipping nor silently fixing — the warning is the point.
    assert.match(src, /emit a warning naming the stage that should have written it/,
      `${name}: the reconciliation became silent`);
  }
});

// ── W6 — ship artifact ceremony ─────────────────────────────────────────────

test('W6.1 — Step Z inlines the ship-run sibling schema instead of citing a path', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'ship.md');
    assert.match(src, /\*\*Required top-level keys:\*\* `release`, `run_at`, `stages`, `checks`, `rollback`/,
      `${name}: the ship-run required fields are no longer inlined`);
    assert.match(src, /artifact: ship-run/, `${name}: the minimal valid skeleton is gone`);
  }
});

test('W6.2 — the not-reached conclusion is the empty string, never the word "empty"', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'ship.md');
    // This is the template that CAUSED the confusion: it literally offered `empty`
    // as an enum value while the schema wanted "".
    assert.ok(!/release-workflow-conclusion: <success \| failure \| cancelled \| empty>/.test(src),
      `${name}: the frontmatter template offers the literal word "empty" again`);
    assert.match(src, /never the literal word `empty`/,
      `${name}: the ""-vs-empty warning is gone`);
  }
});

test('W6.3 — every notes cap agrees with the schema (160, not 80)', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'ship.md');
    assert.ok(!/notes: "<≤80 chars>"/.test(src),
      `${name}: a notes cap of 80 disagrees with the schema's 160 and will block the write`);
  }
  // And the schema itself is still the 160 both files claim.
  const schema = JSON.parse(readFileSync(path.join(pluginRoot, 'tests', 'frontmatter.schema.json'), 'utf8'));
  const runs = schema.shipRunsFrontmatter ?? schema;
  assert.ok(JSON.stringify(runs).includes('"maxLength":160'),
    'the notes cap moved off 160 — the reference prose now lies about it');
});

// ── W7 — the remaining round trips ──────────────────────────────────────────

test('W7.1 — a workflow_dispatch recovery hatch is unusable until it lands on the default branch', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'ship-plan/build.md'), /cannot be dispatched from the branch that creates it/i,
      `${name}: ship-plan build no longer discloses the default-branch requirement`);
    assert.match(ref(root, 'handoff.md'), /git show origin\/<base-branch>:\.github\/workflows/,
      `${name}: handoff can dispatch into a 404 again`);
  }
});

test('W7.2 — a review bot that declined is a caveat, not a settled review', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /^bot-review-status:/m, `${name}: bot-review-status is gone`);
    assert.match(src, /Distinguish "slow" from "declined"/,
      `${name}: a bot that skipped the PR counts as settled again`);
  }
});

test('W7.3 — ship asks its answerable questions before the atomic run opens', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'ship.md');
    assert.match(src, /Batch the load-bearing questions/,
      `${name}: ship's pre-sequence question round is gone`);
    assert.match(src, /^prefetched-answers:/m, `${name}: prefetched-answers is no longer recorded`);
    // Genuinely mid-run decisions must NOT be hoisted — asking them early is
    // asking the user to guess.
    assert.match(src, /Go\/No-Go/, `${name}: the do-not-hoist carve-out is gone`);
  }
});

test('W7.5 — the gate documents its own shell portability', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Shell portability/, `${name}: the portability sweep is gone`);
    assert.match(src, /Never let a pipeline mask an exit code/,
      `${name}: the exit-code-masking rule is gone`);
  }
});

// ── W0.1 — the release-delivery guard ───────────────────────────────────────

test('W0.1 — verify:release is wired and only fails a STALE undelivered release', async () => {
  const pkg = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['verify:release'], 'node scripts/verify-release-pushed.mjs',
    'the release-delivery guard is not wired to an npm script');

  // pathToFileURL, not a raw path — a Windows drive letter reads as a URL scheme.
  const { evaluateDelivery } = await import(
    pathToFileURL(path.join(pluginRoot, 'scripts', 'verify-release-pushed.mjs')).href
  );
  const now = Date.UTC(2026, 6, 26, 12, 0, 0);
  const hoursAgo = (h) => now - h * 3_600_000;

  // Nothing to deliver.
  assert.equal(evaluateDelivery([{ sha: 'a', subject: 'fix(x): thing', committedAtMs: hoursAgo(99) }], now, 12).ok, true);
  // Just committed, about to push — not a bug.
  assert.equal(evaluateDelivery([{ sha: 'b', subject: 'release(sdlc-workflow): v9.1.0', committedAtMs: hoursAgo(1) }], now, 12).ok, true);
  // Ten days undelivered — the exact failure this exists for.
  const stale = evaluateDelivery([{ sha: 'c', subject: 'release(sdlc-workflow): v9.140.0', committedAtMs: hoursAgo(240) }], now, 12);
  assert.equal(stale.ok, false, 'a release undelivered for ten days must fail the guard');
  assert.equal(stale.undelivered.length, 1);
  // Age is measured from the OLDEST undelivered release, not the newest.
  const mixed = evaluateDelivery([
    { sha: 'd', subject: 'release(sdlc-workflow): v9.140.0', committedAtMs: hoursAgo(1) },
    { sha: 'e', subject: 'release(sdlc-workflow): v9.137.0', committedAtMs: hoursAgo(240) },
  ], now, 12);
  assert.equal(mixed.ok, false, 'a newer release must not mask an older undelivered one');
});

// ── W7.4 / yolo-W8.1 — consult must name the real failure ───────────────────

test('W7.4 — a CLI failure is classified from stdout, not guessed from stderr', async () => {
  const { extractCliFailure, meaningfulStderr } = await import(
    pathToFileURL(path.join(pluginRoot, 'skills', 'consult', 'scripts', 'dispatch.mjs')).href
  );

  // claude reports in-band on stdout and writes NOTHING to stderr. Reading only
  // stderr produced "claude exited 1", which two audits wrote up as a
  // workspace-trust dialog. It was a login.
  const claude = extractCliFailure('claude',
    JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }), '', 1);
  assert.equal(claude.kind, 'auth');
  assert.match(claude.reason, /Not logged in/);
  assert.match(claude.remedy, /\/login/);

  // codex LEADS stderr with a non-fatal "proceeding" warning about the temp dir.
  // That line is not the reason the run failed and must never be reported as one.
  const codexStderr =
    'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "C:\\Temp"\n' +
    'Reading prompt from stdin...';
  const codexStdout = [
    '{"type":"turn.started"}',
    '{"type":"turn.failed","error":{"message":"Your access token could not be refreshed because your refresh token was already used."}}',
  ].join('\n');
  const codex = extractCliFailure('codex', codexStdout, codexStderr, 1);
  assert.equal(codex.kind, 'auth', 'an expired codex session must classify as auth, not sandbox');
  assert.match(codex.reason, /refresh token/);
  assert.ok(!/temporary dir/.test(codex.reason),
    'the non-fatal temp-dir warning is being reported as the failure cause again');
  assert.match(codex.remedy, /codex login/);

  // The benign lines are filtered, and a genuinely empty stderr stays null.
  assert.equal(meaningfulStderr(codexStderr), null);
  assert.equal(meaningfulStderr(''), null);
  assert.match(meaningfulStderr('WARNING: proceeding, blah\nreal failure here'), /real failure here/);
});

test('W8.1 — consult must announce a degraded panel', () => {
  const skill = readFileSync(path.join(pluginRoot, 'skills', 'consult', 'SKILL.md'), 'utf8');
  assert.match(skill, /Panel of 1/, 'the degraded-panel disclosure is gone');
  assert.match(skill, /panel-size:/, 'panel-size is no longer reported, so degradation is unauditable');
  assert.match(skill, /it is a login/, 'an auth failure can be described as an environmental wall again');
});
