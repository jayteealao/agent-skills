// Drift guards for the ship-plan drift-gate remedy fix (v9.143.0).
//
// The bug this pins was reported from a real branch, twice in twelve minutes.
// The gate found `release-surface-touched` + `plan-stale`, offered "Amend the
// plan", the user amended block C exactly as asked, `plan-version` went 4 -> 5,
// and the next `/wf handoff` asked the identical question. Nothing malfunctioned:
//
//   1. `release-surface-touched` is a statement about the packaged diff. No edit
//      to the plan can falsify it while the branch is open. Amending was offered
//      as a remedy for drift no amendment could clear.
//   2. The `plan-version` bump wiped the WHOLE acknowledgement ledger — including
//      the branch-scoped entries that exist precisely to keep this question from
//      repeating. The remedy destroyed the suppression it had just earned.
//
// So the fix is two invariants, and these tests pin both: findings carry a
// `clears-on` tag that decides which remedies the gate may offer, and ledger
// invalidation is scoped so branch-scoped entries survive a plan amendment.
// Deleting any phrase below silently restores the loop.
//
// Reference prose is mirrored to the codex tree, so every guard iterates BOTH.
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

// ── D1 — findings are tagged with what actually clears them ─────────────────

test('D1.1 — the finding shape carries clears-on, and the taxonomy is stated', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /\{ signal, detail, suggested-block, clears-on \}/,
      `${name}: drift-findings[] lost its clears-on field`);
    assert.match(src, /A remedy that cannot clear a finding is not a remedy/,
      `${name}: the clears-on rationale is gone`);
    for (const tag of ['amend', 'repo', 'merge']) {
      assert.match(src, new RegExp('`clears-on: ' + tag + '`|\\| `' + tag + '` \\|'),
        `${name}: the ${tag} class disappeared from the clears-on taxonomy`);
    }
  }
});

test('D1.2 — the two merge-class signals are named as unclearable-by-amendment', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    // The table row for `merge` must carry BOTH structural Group-2 signals —
    // these are the ones a plan edit can never falsify.
    const mergeRow = src.split('\n').find((l) => /^\| `merge` \|/.test(l));
    assert.ok(mergeRow, `${name}: the clears-on table lost its merge row`);
    assert.match(mergeRow, /release-surface-touched/,
      `${name}: release-surface-touched is no longer classed as merge-clearing`);
    assert.match(mergeRow, /dependencies-changed/,
      `${name}: dependencies-changed is no longer classed as merge-clearing`);
  }
});

test('D1.3 — clears-on and fingerprint scope are kept as separate axes', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_ship-plan-readiness.md'), /separate axes/,
      `${name}: clears-on and fingerprint scope have been conflated — ` +
      'migration-without-rollback fingerprints on the branch but clears on an amendment');
  }
});

// ── D2 — the remedy menu is built from clears-on ────────────────────────────

test('D2.1 — an amendment is offered only when something can be amended', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /When `amendable` is empty — never offer an amendment/,
      `${name}: the gate can again offer an amendment for drift no amendment clears`);
    assert.match(src, /Let `amendable` = the gating findings whose `clears-on` is `amend`/,
      `${name}: the remedy menu no longer derives its options from clears-on`);
  }
});

test('D2.2 — a merge-class finding never widens the amendment scope', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_ship-plan-readiness.md'),
      /only the blocks the amendable findings point at/i,
      `${name}: a merge-class finding can again drag its block into the amendment`);
  }
});

test('D2.3 — advisories are reported but never counted into the ask', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /counts \*\*gating findings only\*\*/,
      `${name}: advisory findings can again inflate the <N> in the drift question`);
    assert.match(src, /Advisory findings \(`secret-orphaned`, `compliance-stale`\) are never gating/,
      `${name}: the R3 verdict no longer excludes advisories from gating`);
  }
});

// ── D3 — ledger invalidation is scoped, not wholesale ──────────────────────

test('D3.1 — branch-scoped entries survive a plan-version bump', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Invalidation is scoped, not wholesale/,
      `${name}: the ledger is wholesale-invalidated again — a bump wipes branch-scoped acks`);
    assert.match(src, /`fingerprint-scope: branch`\*\* entries \*\*survive\*\* a `plan-version` bump/,
      `${name}: branch-scoped entries no longer survive an amendment`);
    assert.match(src, /`fingerprint-scope: plan`\*\* entries are invalidated by a `plan-version` bump/,
      `${name}: plan-scoped entries no longer re-earn their verdict after an amendment`);
  }
});

test('D3.2 — the ledger entry records how it was earned', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /fingerprint-scope, branch, plan-version, stage, at, via, reason/,
      `${name}: the ledger entry shape lost fingerprint-scope/branch/via`);
    assert.match(src, /`via: amendment`/,
      `${name}: an amendment no longer records itself in the ledger`);
  }
});

test('D3.3 — the ship-plan editor may not clear the ledger itself', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'ship-plan/edit.md'), /Do not touch `\.ai\/ship-plan-acks\.yaml`/,
      `${name}: ship-plan edit can again wipe the acknowledgement ledger wholesale`);
  }
});

// ── D4 — the amendment-landed guard (the reported loop) ─────────────────────

test('D4.1 — a landed amendment does not re-ask what it could never clear', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Guard 2 — the amendment landed/,
      `${name}: the amendment-landed guard is gone — an executed amend re-gates`);
    assert.match(src, /has since \*\*risen\*\*/,
      `${name}: Guard 2 no longer distinguishes a landed amendment from a pending one`);
    assert.match(src, /and still present — \*\*do not gate\.\*\*/,
      `${name}: a merge-class finding can again gate a run after the user amended`);
  }
});

test('D4.2 — Guard 1 still covers the answered-but-unexecuted case', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_ship-plan-readiness.md');
    assert.match(src, /Guard 1 — answered but unexecuted/,
      `${name}: the original re-fire guard was lost while adding the second one`);
    assert.match(src, /pending-amend: \{ signals, plan-version, at \}/,
      `${name}: pending-amend no longer stamps the plan-version the guards compare against`);
  }
});

test('D4.3 — an amendment banks the acks for the findings it cannot clear', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_ship-plan-readiness.md'), /Bank what the amendment bought/,
      `${name}: an inline amendment no longer records the merge-class findings, so its own ` +
      're-check re-raises them inside the same run');
  }
});

test('D4.4 — a STOP tells the user what the amendment will NOT clear', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_ship-plan-readiness.md'),
      /Say explicitly which findings the amendment will \*not\* clear/,
      `${name}: the STOP message can again send a user off to amend and return to the same gate`);
  }
});

// ── D5 — both callers describe the clears-on-keyed menu ────────────────────

test('D5.1 — handoff and ship both disclose that amend is offered selectively', () => {
  for (const { name, root } of trees) {
    for (const rel of ['handoff.md', 'ship.md']) {
      assert.match(ref(root, rel), /`clears-on: amend`/,
        `${name}/${rel}: the caller no longer discloses that amend options are conditional`);
    }
  }
});
