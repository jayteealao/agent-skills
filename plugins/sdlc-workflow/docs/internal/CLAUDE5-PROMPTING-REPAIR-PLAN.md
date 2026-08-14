# Claude 5 Prompting Repair Plan — trust the model, keep the contracts

Status: **BUILT & SHIPPED v9.152.0 (2026-08-14) — all waves W0–W6 in ONE release plus W7's consult-timing item.** Build-time
deviations from the plan as drafted: (a) the PO asked for one release, so the
§12 ≥2-release split and the W4 pilot-rubric recall experiment did not run —
the rubric strip shipped in the same release as everything else, guarded by
`tests/unit/skills/claude5-prompting-repair.test.mjs` instead; (b) W7's
lesson-memory store was DEFERRED per its own "defer if it smells like a new
artifact type without a reader" rule, and the compact-advice trims were left
as-is; (c) two trims collided with standing guard tests
(handoff's T4-blocked-by-T3.8 line, yolo's "may not quietly patch product
code" sentence) and were restored as declared contracts — the tests were
right, the trim was over-eager. Original draft status: DRAFTED 2026-08-03.

Source audit:
five parallel reviewer passes over all 144 files of `skills/wf/` (2026-07-30),
run against Anthropic's official guide
[Prompting Claude Fable 5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5).
File:line evidence lives in the reviewer outputs summarized in §4–§10 below.
Related: [SINGLE-SOURCE-PLAN.md](SINGLE-SOURCE-PLAN.md) (not built — every
edit here must stay dialect-neutral and must sync to the codex tree, §12);
[INTAKE-MODES-REPAIR-PLAN.md](INTAKE-MODES-REPAIR-PLAN.md) (BUILT v9.149.0 —
this plan does not touch the closure/provenance machinery it installed).

## 1. Goal

The guide's headline warning is: "Skills developed for prior models are often
too prescriptive for Claude Fable 5 and can degrade output quality." The audit
confirms the corpus is clean where the risk is worst — **zero reasoning-echo
instructions in 144 files, zero context-budget leakage** — and the
evidence-integrity spine (probe receipts, skip-never-pass, liveness rules) is
already the pattern the guide asks for. The repairs fall into six classes:

1. The grounded-progress clause is missing exactly where fabricated status
   costs the most: the yolo `runStage` wrapper, the auto driver, and
   `implement.md` (whose record `verify.md` explicitly refuses to trust).
2. Four loops run serially over work that is independent and already
   worktree-isolated.
3. The review rubrics carry ~two-thirds deletable bulk: legacy step machines,
   duplicated scan procedures, hardcoded grep recipes, and fictional
   worked-example reports that bias reviewers toward the example's defects.
4. Reversible actions are gated on permission questions the guide says to
   remove.
5. No file carries an early-stop guard, and no interview flow carries an
   "act when you have enough information" release valve.
6. Three safety bugs found in passing (wrong-condition stash guard,
   unqualified `git add`, ungated base-branch push) plus one contract
   contradiction (19 rubrics carry a dead output path).

## 2. Design principles

- **Subtract before rewriting.** Where a brief instruction steers a behavior
  class, delete the enumeration and keep one sentence. Do not replace a
  30-line list with a 20-line list.
- **Contracts stay; process scripts go.** Artifact schemas, frontmatter,
  gate conditions, file formats, defect-class checklists, STE rules
  (`_ste-procedural.md`, `_story-arc.md` — deliberate PO choice), and safety
  rules are exempt. The target is prescription of the model's cognitive
  process only.
- **One copy per rule.** New shared text lands in ONE `_*.md` fragment that
  consumers reference; never paste it per-file (the design ban-list drift in
  §7 is the cautionary tale).
- **Copy the blind pre-mortem.** `shape.md` Step 4's fresh-context,
  inputs-only verifier is the house pattern for every self-critique this plan
  replaces.
- **Dialect-neutral prose, both trees**, per the single-source rule.

## 3. Do-not-touch list (audit-verified strengths)

- `verify.md` probe receipts, `mock-provenance`, "attempt before declare",
  "a defer-reason with no recorded probe is INVALID".
- `ship.md` "a check that did not actually run records `skip`, never `pass`"
  and the batched pre-answerable-questions gate design.
- `status.md` / `_chat-return.md` liveness rules ("never infer running from
  the file existing").
- `shape.md` blind pre-mortem; `investigate.md` two-wave structure;
  `_surface-defects.md` observed-not-inferred rule.
- Review dispatch parallelism in `review.md` / `_stage.md` (already
  single-message parallel, model-pinned).
- yolo `charterCheckpoint` ("judge against the CODE"), `classifyDecisions`,
  `driveWallProbe` (all fresh-context verifiers).
- `_output-boundary.md` (already classifies reasoning traces non-emittable).
- All Ambiguity Inventory / coverage-gate machinery in shape (the 20-floor is
  a locked PO directive — only the fixed 5×4 round choreography is in scope,
  §9).

## 4. W0 — Shared autonomy fragments (new single-source text)

Create two small shared fragments; all later waves consume them by reference.

- **`reference/_grounded-progress.md`** — the guide's clause, adapted:
  "Before reporting progress, audit each claim against a tool result from
  this session. Only report work you can point to evidence for; if something
  is not yet verified, say so explicitly. If tests fail, say so with the
  output; if a step was skipped, say that." Consumers wired in W1.
- **`reference/_autonomy-guards.md`** — two blocks:
  - *Early-stop guard*: "Before ending your turn, check your last paragraph.
    If it is a plan, an analysis, a question, or a promise about work you
    have not done, do that work now. End your turn only when the stage
    contract is complete or you are blocked on input only the user can
    provide (`awaiting-input` is such a block; a described-but-unrun next
    step is not)."
  - *Release valve*: "Pause for the user only when the work genuinely
    requires them: a destructive or irreversible action, a real scope
    change, or an answer only they hold. When the prompt, existing
    artifacts, or the codebase already answer a question, do not ask it —
    record the answer and its source and continue."

Acceptance: fragments exist, are STE-compliant, and are referenced (not
pasted) by every consumer wave below.

## 5. W1 — Grounded progress at the gaps (highest payoff, smallest diff)

- `workflows/yolo.js` `runStage` wrapper (~line 803): append the
  grounded-progress clause. This is the one prompt every stage inherits; it
  closes plan/implement/review/update-deps in a single edit. Keep verify's
  stronger probe-receipt law as-is on top.
- `reference/auto.md`: add the clause to the stage-dispatch step and require
  the Step-3 hand-back's counts/claims to be readable from artifacts the
  driver actually opened this run.
- `reference/implement.md`: require `## Verification Seams Built` and
  `## Visual Contract Honored` entries to cite a file:line the stage
  re-opened after editing, not memory of its own edits. Leave verify's
  distrust rule in place as the backstop.
- `reference/retro.md`: every reported count (checks run/passed, commits,
  findings) names the tool result it came from.
- `reference/review/logging.md` and `reference/review/observability.md`: add
  the `# NON-NEGOTIABLES` evidence section the other 33 rubrics already have
  (finding ⇒ file:line).

Acceptance: grep shows the clause (by fragment reference) in
runStage/auto/implement/retro; the two rubrics require file:line evidence;
existing yolo tests pass unchanged.

## 6. W2 — Unblock the serial loops

- `reference/implement.md` Step ~299 and `reference/verify.md` Step ~603:
  findings triaged Fix dispatch **in parallel**. Verify's fix subagents
  already run `isolation: worktree`; implement's gain the same isolation.
  Keep the post-fix sanity check as the merge gate; on patch-overlap
  conflict, fall back to serial for the conflicting pair only.
- `reference/review/_stage.md` fix dispatch (~502): same change, same
  worktree rule.
- `reference/docs.md` Step 4 (~214): generate independent doc actions in
  parallel; the confirm-before-delete gate stays.
- `workflows/yolo.js`: flip `reviewFanout` default to `true` (parallel
  dimension scouts + adversarial refuters become the default review shape;
  the single-agent path remains as the opt-out). Enable plan fan-out by
  default after fixing its known `00-index.md` write race: subagents write
  per-slice files only; the driver assembles the index single-writer.
- `reference/handoff.md` per-slug packaging (~168): dispatch `package` slugs
  in parallel; the branch-layer side effects stay serialized where they are
  already quarantined.

Acceptance: no "one at a time / sequentially" instruction remains over a set
the same file declares independent; yolo fan-out defaults verified by test;
plan fan-out race covered by a test that asserts single-writer index
assembly.

## 7. W3 — Safety bugs (fix regardless of the guide)

- **Stash cycles** (`verify.md` ~127 and ~230): replace both
  `git stash … git stash pop` cycles with a temporary worktree at the base
  branch (the fix loop already uses worktrees). Delete the
  `git stash list` guard — it tests the wrong condition. No stash command
  remains in verify.
- **Unqualified staging** (`implement.md` ~251 and ~336): replace "stage ALL
  changed files" with explicit-path staging classified the way `ship.md`
  ~170 already does (slice code, workflow artifacts, unknown → fail closed
  and ask). `git add -A` and pathless `git add .` are forbidden by name.
- **Ungated base push** (`ship.md` step 10.3): the post-release version-bump
  push to the base branch gets the same confirm gate as step 6; batch its
  question into the pre-sequence question set so it costs no extra stop.
- **Rubric output-path contradiction**: delete the legacy
  `.claude/<SESSION_SLUG>/` Step-0/write-path text from the 19 affected
  rubrics (subsumed by W4's bulk strip, listed here because it is a
  correctness bug, not bulk).
- **Design ban-list drift**: `_design-context.md` declares itself the single
  source; make it true. Delete the restated ban blocks from `brand.md`,
  `product.md`, `colorize.md` and the partial copies in `layout.md`,
  `typeset.md`, `polish.md`, `animate.md`; each keeps one pointer line.
  Reconcile the drifted items (colorize's additions either promote into the
  single source or die).

Acceptance: grep finds no `git stash` in verify, no unqualified stage in
implement, no second copy of the ban list; ship 10.3 is gated; a test guards
the ban-list single-source (one file matches the ban-block marker).

## 8. W4 — Review-rubric bulk strip (largest deletion)

For the 31 rubrics carrying a `# WORKFLOW` machine, and the orchestrator:

- Delete the Step-0→Step-12 `# WORKFLOW` machines. Replace with 2–4
  sentences: read the intake/plan artifacts for intent, scope per
  `_stage.md`, then hunt using the checklist above.
- Delete the per-category `### … Scan` sub-procedures (they restate the
  checklist as search choreography).
- Delete hardcoded `grep`/`rg` recipe blocks (stale stack assumptions,
  false-negative generators). Where a recipe encodes a non-obvious defect
  *signature* (not a search strategy), fold the signature into the checklist
  line.
- Replace each fictional worked-example `# OUTPUT FORMAT` report (60–73% of
  ten files) with a pointer to `_stage.md`'s authoritative output contract
  plus at most one 10-line skeleton. This also kills the invented composite
  scores (`## DX Score` and kin) unless a rubric can compute one from
  measured values.
- Delete the "False Positives & Disagreements Welcome" self-critique section
  (14 files); the existing `_stage.md` auto-`/consult` verifier is the
  replacement and already exists.
- `_stage.md` ~28: soften "exactly in order, do not skip, reorder, or
  combine" to the one steering sentence it needs (ledger mutations stay
  ordered; reading does not).

Acceptance: rubric corpus shrinks by ≥50% total lines; every rubric still
carries intent-first framing, its defect checklist, severity definitions, and
the evidence non-negotiable; `_stage.md` remains the only output contract;
review integration tests pass.

## 9. W5 — Reversible-action gates and interviews

- **Overwrite warnings ×4** (`shape.md` 56, `plan.md` 80, `implement.md` 77,
  `verify.md` 72): delete the "Proceed?" question. `_additive-write.md`
  already snapshots to `history/` and appends a `revisions:` ledger; the
  re-run notice becomes informational.
- **Verify triage** (`verify.md` ~591): keep human triage for scope-changing
  and behavior-changing findings; lint/format/marker-syntax classes become
  auto-fix (report what was fixed, with diffs, in the round summary).
  `_fix-loop.md` 16–17 gains the same carve-out: reversible, in-worktree,
  mechanical classes dispatch without a human decision.
- **auto.md**: proceed on the reversible `git switch` (record it in the
  hand-back); run the read-only `/wf discover` without asking.
- **Design interviews** (`setup.md`, `teach.md`, `shape.md`, `contract.md`):
  include the W0 release valve. Concretely: pre-fill every question already
  answered by the prompt, PRODUCT.md, DESIGN.md, or codebase inspection;
  ask only the residue, in ONE batched round; `shape.md` drops the
  "at least one user-answer round" floor when the residue is empty;
  `contract.md` 23 stops disqualifying pre-supplied context — a
  user-confirmed PRODUCT.md/teach answer satisfies the direction gate. The
  image-mutation lock stays.
- **`intake/extend.md`**: collapse the interview + Confirm/Revise/Cancel
  double gate to one confirmation (the flow is additive-only by contract).
- `_intake-context.md`'s "MAY run end-to-end without pausing" sentence is
  the model; reference it rather than restating.
- Shape's fixed "20 questions across 5 rounds of 4" choreography: the
  20-question floor and coverage gate are locked PO directives and STAY; the
  fixed 5×4 round-shape language relaxes to "batch into as few rounds as the
  dependency structure allows" (matching `intake/default.md`'s
  "need-driven, never pad" rule).

Acceptance: a clean dry-run of design setup/teach/shape/contract against a
repo with a filled PRODUCT.md reaches the artifact with ≤1 user stop; verify
auto-fixes a seeded lint finding without a question; no overwrite "Proceed?"
remains.

## 10. W6 — Over-prescription trims (core + drivers + aux)

- **"Exactly in order" boilerplate** (slice, retro, probe, simplify, recap,
  docs, observability/init, + any further grep hits): replace with one
  sentence naming only the genuinely ordered dependencies (artifact writes,
  gates). One grep must find zero instances of the old wording afterwards.
- **"Prompt the agent with ALL of the following" blocks**:
  - `shape.md` 72–164 and `plan.md` 138–293: collapse each sub-agent prompt
    to a 3–6 sentence charter (goal, inputs, required output shape,
    evidence rule). The build-avoidance ladder and reuse-scan contract stay
    verbatim.
  - `retro.md` three lists → one-to-two-sentence charters each.
  - `intake/ideate.md` lens greps → per-lens goal statements with the
    evidence rule; drop the framework-specific grep enumerations.
  - `intake/discover.md`: keep the FOR/AGAINST/counter-hypothesis split;
    trim each prompt to the role.
- **`verify.md` Gap-patch consolidation** (214–265): rewrite the interactive
  sub-agent prompt as one coherent instruction set; delete the "(Gap N
  fix)" archaeology labels; derive the five fixed micro-tests from the
  surface under test ("probe the failure modes this surface invites —
  empty, extreme, repeated, interrupted, degraded — where applicable")
  instead of mandating all five always.
- **Task-tracker choreography** (`implement.md` 226–256, `verify.md`
  374–386, `handoff.md` 188–202): replace per-step
  TaskCreate/TaskUpdate scripts with "track the stage's units in the task
  tracker; keep statuses truthful". Delete handoff's pre-declared 13-node
  `addBlockedBy` DAG; the gates themselves stay.
- **yolo deferral law, one copy**: `yolo.md`'s policy-table row becomes the
  single normative statement; the ~700-word prose restatement and the
  `yolo.js` POLICY duplicate each shrink to a pointer plus the fields the
  agent must emit. Trim the ONE-WRITER-PER-FACT incident narrative to the
  rule.
- **Self-critique → verifier pointers**: `implement.md` 193–203 six-point
  critique pass and the six `docs/*.md` "Final self-check" blocks are
  replaced by the existing fresh-context verifier
  (`docs.md` 249; for implement, a small inputs-only check agent per the
  blind pre-mortem pattern). `plan.md` single-slice auto-review adopts the
  multi-slice sibling's subagent policy.
- **simplify/recap/slice minor trims** per audit (enumerated 7-item lists,
  storyteller do-NOT list, fixed interview counts → need-driven).
- **Wire W0 guards**: `_autonomy-guards.md` early-stop guard referenced from
  `verify.md`, `handoff.md`, `auto.md`, `yolo.md`, and the `yolo.js` entry
  prompts (which already carry the autonomy half).

Acceptance: the collapsed prompts still name every *contractual* output
(artifact sections, frontmatter, evidence rules) — verified by the existing
schema/template tests; total line delta for the wave is negative.

## 11. W7 — Optional, decide at build time

- `auto.md` / `yolo.md` **lesson memory**: the guide recommends a
  lesson-per-file store for long runs. yolo has `.ai/patches/` (driver
  hot-patches only) and a heartbeat journal (explicitly not a lesson store).
  Proposal: a `.ai/lessons/` directory with the guide's shape (one lesson
  per file, one-line summary first, update-don't-duplicate, delete wrong
  ones), written at HARD-STOP and close. Defer if it smells like a new
  artifact type without a reader.
- **Compact-advice trims** (`plan.md`, `implement.md`, `verify.md` ×7
  occurrences): the advice is user-facing and the state model is sound;
  optionally drop the "if verify was lengthy" self-assessment only.
- `contract.md` consult timing: fire the auto-consult concurrently with the
  mock-fidelity inventory instead of between steps.

## 12. Sequencing, release, and interactions

- **Ship as (at least) two releases.** Release A = W0+W1+W2+W3 (small
  diffs, behavioral payoff, safety). Release B = W4 (huge deletion, its own
  review). W5+W6 = Release C, or fold into B if review capacity allows.
  Per RELEASE-DISCIPLINE.md, a release is not done until `origin/master`
  carries it.
- **Both trees, every wave**: regen docs/site before `sync:codex`; version
  bump sweeps all documented locations in BOTH trees; stage explicitly by
  path (this repo has concurrent sessions and standing untracked files that
  must never be swept in).
- **dist rule**: any `scripts/hooks/lib` change (yolo.js edits, new test
  helpers) rebuilds `dist/` in the same commit.
- **Single-source plan interaction**: if SINGLE-SOURCE-PLAN.md builds first,
  W-edits land once in the merged tree instead of twice; nothing here blocks
  on it, but every new fragment must obey its 5-file host-text budget
  (all new text here is host-neutral, so budget impact is zero).
- **Tests**: each wave adds or updates guard tests named in its acceptance
  line; the W3 ban-list single-source test and the W2 index single-writer
  test are new. Full suite green (currently 788/0) before each release tag.

## 13. Risks

- **W4 deletes rubric content that a reviewer silently relied on.** Mitigate:
  strip one pilot rubric (correctness.md) first, run a seeded-defect review
  against a fixture branch, compare recall before sweeping the other 30.
- **Parallel fix dispatch introduces merge races the serial loop was quietly
  absorbing.** Mitigate: worktree isolation + single merge gate + the
  conflicting-pair serial fallback; a test seeds two overlapping findings.
- **Relaxed gates over-fire.** The W5 carve-outs are class-scoped (lint,
  format, marker syntax); anything unclassified still asks. The release
  valve requires recording the answer *and its source*, which keeps the
  audit trail the interviews existed to create.
- **Charter-collapse loses a load-bearing bullet.** The audit flagged the
  enumerations as process, not contract, but W6's acceptance line pins every
  contractual output to schema/template tests before deletion.
