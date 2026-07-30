# Intake-Modes Repair Plan — make eleven modes end as well as they think

Status: **BUILT 2026-07-30 — shipped as v9.149.0 (all waves W0–W6, one release,
both trees; 788 tests / 0 fail).** Deviations from the drafted text, all
verified against the real code during the build: (1) the release number is
v9.149.0, not D6's v9.146.0 — three STE releases (v9.146–148) shipped from
other sessions between draft and build. (2) W4's ladder rung is
`/wf probe <slug> "<question>"`, not the drafted `/wf intake <slug> probe …` —
probe is not an intake mode and the drafted grammar would parse as an
extension; probe's own free-form target argument is the valid form (probe.md
also gained terminal-analysis-slug handling so the rung works on rca/discover
slugs). (3) Escalate/Abort closures use the existing `close.md` reasons
`superseded`/`cancelled` — the drafted `abandoned` is not in the documented
reason set. (4) The audit's claim that verify.md lacks the refactor baseline
comparison was stale — verify.md already carries it; the build only aligned it
with the new `## Baseline Command` section. (5) D5 required moving the rca
sibling sub-shapes into schema `$defs` (branch-compiled validators cannot
reference across siblings) and the variant is hook-selected
(`rca-diagnosis`) from the artifact's `status`, exactly per the decision.
Originally drafted as:
[INTAKE-MODES-AUDIT-2026-07-30.md](INTAKE-MODES-AUDIT-2026-07-30.md) (the
five-reviewer holistic audit of all non-default intake modes; file:line
evidence lives there and in its reviewer outputs). Sequel to the investigate
decision lifecycle shipped as v9.145.0
([INVESTIGATE-DECISION-LIFECYCLE-PLAN.md](INVESTIGATE-DECISION-LIFECYCLE-PLAN.md) — BUILT),
whose machinery this plan generalizes rather than re-invents.
Related: [SINGLE-SOURCE-PLAN.md](SINGLE-SOURCE-PLAN.md) (interaction in §6).

## 1. Goal

The audit's verdict: the modes think well and end badly. Five of eleven have
hard dead-ends on their own documented happy path (adopt, rca, hotfix, fix,
update-deps audit-only), and five systemic classes repeat across the family —
C1 nothing closes, C2 evidence forwarding exists only for investigate,
C3 "ask a human" is the only stall rung, C4 frontmatter drift up to
schema-invalid templates, C5 drifted copies of shared change-mode text.
This plan repairs the dead-ends and generalizes the v9.145.0 decision
lifecycle (closure, provenance, escalation ladder) family-wide.

## 2. Design principles

- **Generalize, do not fork.** One provenance contract, one closure shape, one
  ladder pattern, one shared change-mode tail. Every new mechanism below is an
  existing v9.145.0 or `close.md` mechanism given more consumers.
- **Convention over flags.** Detection by registry and `from <slug>` token,
  never a new flag. No new top-level `/wf` keys, no new artifact types.
- **Callers, not just authors.** Every edit that touches a terminus is traced
  into the successor command's preconditions (the audit's root cause was
  validating modes as authors only). W0 adds a guard test for exactly this.
- **Dialect-neutral prose** in both trees, per the single-source rule.

## 3. Locked design decisions

- **D1 — `_intake-provenance.md`** (rename + widen of
  `_investigate-provenance.md`; update its three existing consumers). One
  Detect section (explicit `from <slug>` wins; inferred = exact-match within
  30 days, one confirm question), then per-source Consume tables keyed by
  `workflow-type`: `investigate` (chosen option card — unchanged),
  `rca` (root cause, blast radius, contributing factors, §8 verification
  signals), `discover` (verdict, counter-hypotheses, contradictions),
  `ideate` (chosen idea + evidence + culled-sibling rationale),
  `simplify` (finding id, files, rationale, severity → refactor),
  `update-deps` (prior run's Hold/Blocked lists + citations). Link-back is
  uniform: `origin-<mode>` on the successor, `superseded-by` on the source,
  implicit pick/route when the source is still open.
- **D2 — closure generalization**, all via the `close.md` field set:
  rca gains `# Route — decision closure` (`rca <slug> <route>`); ideate gains
  `# Pick — decision closure` (`ideate <slug> <idea-id>`), both mirroring
  investigate's section verbatim in shape. discover closes **at write time**
  (`close-reason: verdict-recorded`) — nothing is left to choose, so no
  re-invocation. fix/refactor/hotfix Escalate and Abort close the slug
  (`close-reason: superseded` / `abandoned`) and set `superseded-by` once the
  successor exists. update-deps audit-only sets
  `next-invocation: "/wf close <slug> deferred"`.
- **D3 — `_change-mode-tail.md`**, the shared tail for
  fix/hotfix/refactor/update-deps: the gate INCLUDING Adjust/re-gate; the full
  collision check; the index template with the complete default.md required
  set (`stack:`, `appetite`, `review-scope-confirmed`); the workflow-rules
  tail; tripwire-breach recording (fix's warn-and-continue mechanism becomes
  the family mechanism — hotfix's unwritable `≤3` plan constraint is replaced
  by it); and `/wf retro` restored to every pipeline line.
- **D4 — stack policy.** All four change-modes and adopt write `stack:`
  (auto-detected, cheap fingerprint). fix and refactor spend one of their
  permitted questions on the one-line confirm (flips `user-confirmed: true`);
  hotfix and adopt ship it unconfirmed and ride verify's existing caveat path
  (verify.md:223) — the STOP (verify.md:74) only fires on absence, which D4
  eliminates. `review-scope-confirmed: false` and `appetite` join every
  template so plan.md's absent-means-asked misread cannot occur.
- **D5 — rca sibling-yaml gets a diagnosis-shaped variant.** The schema's rca
  sibling contract becomes status-dependent: when the artifact is
  `ready-for-fix-routing` (pre-fix), `resolved_at` / `time_to_mitigate` /
  resolution-timeline events / heatmap are OPTIONAL and the required core is
  the diagnosis set (incident, started_at, chain, contributing timeline).
  Post-incident RCAs keep the full requirement. Schema + hook change → dist
  rebuild in the same commit.
- **D6 — release shape.** One release (v9.146.0), all waves, because the same
  files are touched by multiple waves and a partial ship would leave mixed
  contracts. Waves below are build order, not release order.

## 4. Waves

### W0 — Baseline + the caller-contract guard test

Run tests; confirm both trees' current state. Add
`tests/guards/intake-terminus-contracts.test.mjs`: for every intake mode,
parse the `next-command`/`next-invocation`/pipeline terminus it writes and
assert the named successor's precondition set (stack presence, handoff
requirement, artifact existence, valid dispatcher grammar, schema-legal
enums in every fenced yaml template). This is the test class whose absence
let all five dead-ends ship; it must fail BEFORE the fixes land (red first),
then pass.

### W1 — Unbreak (the five dead-ends)

1. **adopt**: add `# Step 0 — Orient` (derive `adopt-<desc>` slug, collision
   check, same-branch active-workflow scan → STOP into extension, apply D1
   provenance, exclude `.ai/**` + `.scratch/**` from the adoptable surface);
   fix the enum (`status: complete`, adoption carried by `provenance: adopted`
   + `progress`); define the adopted-diff union (one command set, untracked
   files enumerated not "notable"); replace the undecidable merged-upstream
   rung with `git fetch` + `git branch --contains` per ahead-SHA; index gains
   the D4 field set; W2d resolutions land in `runtime-evidence-deferrals`;
   `05-implement.md` gains `## Verification Seams Built`.
2. **rca**: index template repairs (`stack:` per D4, `title`, `updated-at`,
   object-form `progress`, drop phantom `selected-slice`); routes rewritten to
   the grammatically valid `from <slug>` forms; sibling-yaml per D5; the
   synthesized shape's `status` becomes a legal enum value; stale `wf-how`
   ref → `recap`/`deep-research`; the rich-yaml step moves before the chat
   handoff.
3. **hotfix**: pipeline and routing gain `/wf handoff` and `/wf retro`;
   `01-hotfix.md` gains `## Acceptance Criteria` (≤2, fix.md's shape
   verbatim); index gains the D4 set; `## Impact` seeds two `intent-risks`
   entries so ship must adjudicate incident severity; prod-branch detection
   gains the offline fallback (`git symbolic-ref refs/remotes/origin/HEAD`).
4. **fix**: D4 stack; the dispatcher-unknown `--design` flag becomes a
   trailing `design` token registered in intake.md's tokenizer note; the
   index template gains the `origin-investigate` key its own Step 0 mandates.
5. **update-deps**: Steps 7/8 self-report to the index (current-stage,
   progress, workflow-files, updated-at + registry touch); audit-only per D2
   with `mode:` mirrored onto the index and Hold entries pushed to
   `open-questions` (`revisit: <condition>`); resume grammar
   (`update-deps <existing-run-slug>` resumes; documented in argument-hint);
   the contradictory `next-command`/`next-invocation` pairs reconciled;
   gate decision recorded on every branch, not just audit-only.

### W2 — Close (C1, per D2)

rca route closure; ideate pick closure (plus: persist the multiSelect answer,
`status: ready` + `next-command: user-picks` at write time instead of
`complete`); discover verdict-at-write closure plus `## 0. What this decides`
(Q3's answer, currently discarded) and `recommended-routes:` on the index;
fix/refactor/hotfix Escalate-closes via D3's shared tail; gate decisions
recorded unconditionally per `_intake-context.md`'s existing sentence.

### W3 — Forward (C2, per D1)

Author `_intake-provenance.md`; consumers: fix/hotfix/default Step 0 (rca +
investigate + ideate sources), refactor Step 0 (simplify source + its own
Escalate emits `from <slug>`), update-deps Step 0 (prior-run source), rca's
§10 and discover's fails/inconclusive routes print `from <slug>` forms.
ideate's `ideas:` roster gains `evidence:` and `selected:` keys so the
forwarded card has machine-readable content. extend gains `from-probe` /
`from-simplify` seeds stamping the existing `source`/`source-ref` fields.

### W4 — Ladder (C3)

Stamp investigate's escalation-ladder shape into: rca (low confidence →
`/wf intake <slug> probe "<runtime question>"` first, human-triage last;
add rca to probe's source-mode list if absent), hotfix (confidence floor —
low after the third agent → probe or human-triage, never a guessed
`## Root Cause`), discover (valid probe slug-form + `study-sources` rung +
sonnet pin when Q3 says a large decision rides on the verdict; add discover
to probe.md's source-mode list), refactor ("Add tests first" names its
mechanism; the fix-loop stall offers probe/consult), ideate (Challenge-1
speculative candidates route to a cheap check instead of a silent cull).
Human stays the last rung everywhere, never the only one.

### W5 — Dedup (C5, per D3)

Extract `_change-mode-tail.md`; fix/hotfix/refactor/update-deps cite it and
delete their drifted copies. Expected net shrinkage across the four files.
This wave lands LAST among the mode edits so it consolidates final text, and
it reduces the single-source merge surface (§6).

### W6 — Small modes + mirror + docs + release

1. **extend**: Step-0 shape pre-flight (no `03-slice.md` roster → route to
   `/wf slice` or new-intake per the yolo rule); Step 6 becomes the single
   authoritative index writer (absorbs Step 3b's writes; refreshes
   `best-first-slice`, `next-command`/`next-invocation`, registry row);
   from-review all-bugs falls back to the interview instead of STOP;
   `po-answers.md` gets create-if-absent.
2. **amend**: the ledger becomes real (schema + `renderers/index.mjs` render)
   — or is dropped to `99-`/chat if the render proves heavy; amending
   `review-scope` sets `review-scope-confirmed: true`; closed-workflow
   WARN-and-confirm; trailing `dry-run` token accepted; both branch-0 modes
   gain the output-boundary header.
3. **modernize**: era table gains the v9.136 row
   (`review-scope-confirmed`/`appetite`/`stack`), the registry-row write it
   already promises, deferral fields (`needed-by`/`absorbed-by`/`repeat-of`),
   and a **report-only** decision-lifecycle row naming the pick/route command
   (respects the cardinal rule); `schema-modernized-at:` +
   `schema-absent-fields:` stamp with W7.2 nag suppression in intake.md;
   the cardinal rule reworded to permit absent-`slices[].status` backfill
   with the artifact-state → enum mapping stated.
4. Dispatcher contract table rows updated for every changed terminus;
   doc-site sweep (investigation guide, intake-modes reference, quick-lanes,
   choose-your-entry — grep-driven); STE pass on edited surfaces.
5. Codex mirror by hand (dialect + CRLF preservation per file); schema/hook/
   renderer changes → dist rebuild + `sync:codex` in the release commit;
   version bump per the standing locations; CHANGELOG; catalog bump; push.

## 5. Effort

The audit's structure makes this mostly mechanical: ~60% of the edits are
"apply an existing pattern to a named file at a named line". Rough split:
W0 2h (the guard test is the real work) · W1 6h (five modes, adopt largest) ·
W2 3h · W3 4h (the provenance generalization + six consumers) · W4 2h ·
W5 3h (extraction + four rewires) · W6 6h (three small modes + mirror + docs
+ release mechanics). One release; schema and hook changes make the dist
rebuild mandatory.

## 6. Risks

- **Breadth.** ~15 skill files per tree plus schema, hook, renderer, tests,
  docs. Mitigations: the W0 guard test is written first and red; waves build
  in order; every fenced yaml template is validated against
  `tests/frontmatter.schema.json` before commit.
- **Schema loosening (D5)** could let a lazy post-incident RCA skip the
  retrospective set. Mitigation: the variant is keyed on the artifact's
  `status`, not author discretion.
- **Single-source interaction.** This plan edits many files that plan will
  merge. W5 helps (three drifted copies → one shared file); everything else
  follows the dialect-neutral rule. Sequence this release BEFORE the
  single-source cutover.
- **Concurrent sessions** — standing risk; stage by path, re-read before
  editing, never touch the other sessions' untracked plan docs.
- **Behavioral surprise:** discover/ideate/rca workflows will now CLOSE.
  `/wf status` output changes shape (Active shrinks). Called out in the
  CHANGELOG narrative so the change reads as intent, not loss.

## 7. Out of scope

The `/wf intake audit` mode plan (another session's draft), the single-source
merge itself, and any new top-level keys. probe/simplify themselves are
untouched except probe's source-mode list additions.
