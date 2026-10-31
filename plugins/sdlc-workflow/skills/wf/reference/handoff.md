---
description: The PR phase of ship. Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates ALL complete slices of a slug by default; a `pr#N` or branch-name first argument aggregates EVERY slug that shares that branch (batch mode) and reports which slugs are handoff-ready. Pass a slice-slug only when each slice has its own separate PR.
argument-hint: <slug|pr#N|branch> [slice-slug]
---

You are running the **PR phase of `/wf ship`**, the first part of stage 8 of 9: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship (`PR` → gate → release) → 9·retro.

Ship runs this phase first ([ship.md](ship.md) Step 0). When this phase ends with `pr-readiness-verdict: ready`, ship continues to its go/no-go gate in the same run. `/wf handoff <slug>` is an alias of `/wf ship <slug>` that stays for this release only.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `08-handoff.md` per slug, covering all complete slices (or one slice if explicitly scoped). In batch mode: one per slug on the branch, plus a single shared PR and the branch-level readiness keys on the lead slug. |
| Config | The optional `00-index.md` keys (`public-surface`, `docs-mirror`, `review-bots`, `ci-watch`, `review-settle`, `pre-push-checks`) are documented in [_handoff-config.md](handoff/_handoff-config.md). |

## Card

- Write the handoff package for a reviewer, push the branch and open the pull request. This phase does not merge or deploy: ship does that after its go/no-go gate.
- Wait until CI reaches a terminal state and the bot reviews get their settle window. Then decide readiness. Do not stop on a `pending` snapshot. Do not give CI to Auto-fix.
- Do not change code. When CI fails or a review thread needs a code change, send it to a diagnosis or fix sub-agent, per the fix sub-agent contract of [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md). A fix for red CI needs the approval of the person. Only the compact result of the sub-agent comes back to you.
- Write every external text in product language, per [_output-boundary.md](_output-boundary.md).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | Problem Statement; Documentation Plan |
| `03-slice.md` | artifact | always | |
| `05-implement-*.md` | artifact | always | Summary of Changes; Files Changed; Deviations from Plan; Known Risks / Caveats |
| `06-verify-*.md` | artifact | if-present | Acceptance Criteria Status; Adversarial Tests; Cross-Browser Delta; Friction Notes; Free Exploration Notes |
| `findings.yaml` | artifact | always | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | Mock fidelity inventory |
| `04b-instrument.md` | artifact | if-present | |
| `04c-experiment.md` | artifact | if-present | |
| `05c-benchmark.md` | artifact | if-present | |
| `handoff/_handoff-config.md` | procedure | always | |
| `_ship-plan-readiness.md` | procedure | always | |
| `handoff/_pr-ci-handoff.md` | procedure | mode:pr | |
| `handoff/_pr-triage.md` | procedure | mode:pr | |
| `_host-surfaces.md` | procedure | mode:pr | PR monitor |
| `handoff/_batch.md` | procedure | mode:batch | |
| `handoff/_small.md` | procedure | mode:small | |
| `handoff/_repo-hooks.md` | procedure | mode:repo-hooks | |
| `08-handoff.md` | writes | | |

The modes of this table: `batch` when Step 0 resolves `scope: branch`; `small` when the index has `workflow-type: small`; `repo-hooks` when the repo root has a commitlint config (`.commitlintrc*`, `commitlint.config.{js,cjs}`), or the index has `public-surface:` or `docs-mirror:`.

# Role
You run the PR phase of ship: package, push, open the PR. Apply [_workflow-rules.md](_workflow-rules.md).

# Step 0 — Orient (do this before all other steps)
1. **Resolve the first argument** (a slug, `pr#N`, a branch name, or absent) with `node "<skill-dir>/scripts/wf.mjs" target "<root>" <arg> --json`. A slug wins over a branch:
   - **`scope: slug`** → **single-slug handoff**, `handoff-scope: slug`.
   - **`scope: branch`** → **batch handoff**, `handoff-scope: branch`.
   - **`ambiguous: true`** → ask the user which of its `slugs`. **An `error`** → STOP and show it.
   **Footgun guard.** If the output of a single slug lists `siblings` (other slugs on its branch), WARN that a single-slug verdict on a shared branch goes stale when a sibling moves the branch. Recommend `/wf ship pr#N` (or the branch name). Proceed only if the user confirms.
2. **Build the roster.** The roster is the `slugs` of the `target` output: `[<slug>]` for a single slug; for a batch, every slug whose `branch` equals the resolved branch. Record the roster as `branch-slugs:`.
3. **Read the index of each roster slug** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`: `current-stage`, `status`, `selected-slice`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, and any existing `handoff-lead:`. The review scope follows `reviewScopeOf` in `lib/lifecycle-done.mjs`: the key wins; with no key, the scope is `per-slice` only when `07-review-<slice>.md` records exist and `07-review.md` does not, else `slug-wide`.

   **Re-validate `branch-strategy: none` against what is actually being packaged.** `none` means the handoff document is the deliverable — no push, no PR — and holds only while the packaged range touches nothing but docs and `.ai/` bookkeeping. If the implemented slices touched repo code, ask ONE gate question per [_gate-question.md](_gate-question.md): "the index says `branch-strategy: none`, but this handoff packages repo code (<n> non-doc files) — deliver doc-only as recorded, or switch to `dedicated` (push + PR)?" Record the answer in the index with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index branch-strategy=<value>` per [_records.md](_records.md), so the same range never re-asks.
3a. **Batch only: elect the lead slug** per [handoff/_batch.md](handoff/_batch.md). A single slug is its own lead.
3b. **A small-path slug** (`workflow-type: small`): run the steps of [handoff/_small.md](handoff/_small.md) before the scope.
4. **Resolve per-slug handoff scope.** Explicit slice mode: a slice-slug as the second argument (single-slug only) scopes to that slice. Aggregate mode (default): read the slug's `03-slice.md` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 03-slice.md` and collect every slice with `status: complete` or `status: in-progress`.
   **Reconcile a stale roster before concluding "none" (do not blame the operator).** A roster entry still at `status: defined` is not proof the slice was never built. Before reporting a slug as having no implemented slices, check each `defined` entry with `record get`: if `05-implement-<slice>.md` exists **and** `06-verify-<slice>.md` exists with `result: pass`, **reconcile the roster** (set `complete`, or `in-progress` when implement exists but verify does not yet pass: get `03-slice.md`, change the entry, write the draft of `03-slice.md` and put it), include the slice in scope, and **emit a warning naming the stage that should have written it** ("slice `<x>`'s roster status was `defined` despite a passing verify — reconciled here; `/wf verify` should have promoted it"). Never silently skip the slug, and never silently fix it.
   If a slug genuinely has none after reconciliation → it is **not handoff-ready**; record it in the roster report as "no implemented slices" and skip packaging it (do not STOP the whole batch).
5. **Check prerequisites for each roster slug.** A slug that fails any check is **not-ready** with the reason and excluded from packaging. In single-slug mode a not-ready result STOPs with the reason. In batch mode not-ready slugs are reported in the roster and skipped while ready siblings proceed. Run `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>` to see which records exist, and read the frontmatter of a record with `record get`.
   - **Implement gate (all modes)**: `05-implement-<slice-slug>.md` exists for every slice in scope. Missing → not-ready: "Run `/wf implement <slug> <slice>` for missing slices."
   - **Intent-risk gate (all modes)**: parse `intent-risks` (the RIM ledger) from the index (absent → empty). Any entry with `status: open` → not-ready: "An unadjudicated intent-risk means shape never resolved a load-bearing ambiguity — run `/wf intake <slug>` to adjudicate it (`adjudicated` or `carried`)." Handoff never adjudicates. `carried` RIMs are legal and are surfaced in the PR body and in `## Reviewer Focus Areas`.
   - **Per-slice review mode** (the review scope of step 3 is `per-slice`): `07-review-<slice-slug>.md` exists for every slice in scope (missing → not-ready: "Run `/wf review <slug> <slice>` for each slice."). Parse `verdict:` and `metric-findings-blocker:` (OPEN blockers only) from its frontmatter; `verdict: dont-ship` or `metric-findings-blocker > 0` → not-ready, naming the slice(s); fix via `/wf implement <slug> <slice> reviews`.
   - **Slug-wide review mode** (the review scope of step 3 is `slug-wide`): a single `07-review.md` exists (missing → not-ready: "Run `/wf review <slug>` first."). Parse `verdict:` and `metric-findings-blocker:`; `dont-ship` or `> 0` → not-ready.
   - In all modes: if a slug already has a ship run (`09-ship-run-*.md`) → WARN before overwriting that slug's package.
6. **Fingerprint no-op guard + roster report.** For each ready slug, compute `handoff-fingerprint`: a stable digest of the commit range packaged (`git merge-base HEAD origin/<base-branch>`..`HEAD` restricted to the slug's slices where determinable), the in-scope slice slugs and their statuses, and each in-scope review's `verdict`. Compare to the value in the slug's existing `08-handoff.md` (`record get "<root>" <slug> 08-handoff.md`). Match → skip the slug entirely (no snapshot, no ledger entry, no rewrite, per [_additive-write.md](_additive-write.md)) and mark it "unchanged". Differ or absent → (re)package this run. Then print the roster report before any packaging:

   | Slug | Stage | Review verdict | Open blockers | Fingerprint | Action |
   |---|---|---|---|---|---|
   | `<slug>` | implement/review/handoff | ship / dont-ship | N | fresh / changed / new | package / skip-unchanged / **not-ready: <reason>** |

   Packaging proceeds only for rows whose action is `package`.
6.7. **Ship-plan readiness pre-check (gate).** Load [_ship-plan-readiness.md](_ship-plan-readiness.md) and follow it in full (caller = `handoff`, commit range = `git merge-base HEAD origin/<base-branch>`..`HEAD`). This is the one plan gate of a ship run: ship Step 0.4 runs only Step R0, with no no-plan gap, so a repo with no plan reaches the missing-plan gate here and can answer *Shipping is external*. Run Step R0 with `--allow-no-plan`; skip it when ship Step 0.4 ran it in this run. A missing plan or unacknowledged drift STOPs the run before packaging and routes to `/wf project ship-plan init` / `/wf project ship-plan edit` via the slug's `00-index.md` `recommended-next-*`; no partial `08-handoff.md` is written, but `resume-orientation` is (the pre-check's Step R3.5). `ok`, `acknowledged`, `amended-inline`, and `not-applicable` proceed to packaging and the PR; with `not-applicable`, ship stops after the PR is ready (ship Step 0.6). The amend options appear only for findings an amendment can clear (`clears-on: amend`). Stamp the returned `ship-plan-readiness` into `08-handoff.md` frontmatter (in batch mode the lead owns the single check). Skip only when a prior run this session resolved it to `ok`/`not-applicable` and nothing in Group 2's change surface moved since.
7. **Use the verify inputs** for each slug being packaged. From each `06-verify-<slice-slug>.md`, surface in `## Reviewer Focus Areas`: `stability-check-flaky-count > 0` ("N criteria showed intermittent behaviour during verification — may indicate race conditions"); `adversarial-tests-failed > 0` (list the failures from `## Adversarial Tests`); `cross-browser-delta: findings` (list from `## Cross-Browser Delta`); `web-vitals-inp-ms > 200` ("interaction responsiveness measured above threshold"); non-empty `## Friction Notes` / `## Free Exploration Notes` under a "Soft Observations" subsection.
8. **Use the augmentation inputs.** Use `02b-design.md` and `02c-craft.md` for design modes, anti-goals and visual contract; `02c-craft.md`'s mock fidelity inventory items are user-visible changes the PR description shows. Read the `augmentations:` list in the index; every entry appears in `## Augmentations Applied` and/or `## Reviewer Focus Areas`, translated per type: `design-harden` → "Accessibility improvements applied — N components updated, axe-core scan clean"; `design-optimize` → "Performance improvements — measured Xms reduction in [metric]"; `design-adapt` → "Improved mobile/tablet/dark-mode behavior"; other `design-*` → "Visual refresh of [surface area]" or "Design quality review pass — N findings addressed"; `instrument` → "Added observability — N signals for previously unobserved code paths"; `experiment` → "Wrapped behind feature flag with cohort split for measured rollout"; `benchmark` → "Performance baseline taken; verify-stage comparison: <within tripwires / regression>". Do not cite workflow artifact paths or sub-command names in external-facing fields. Exception: when git tracks `design/`, the PR body may show each board and capture pair as images (`design/_boards.md`).
9. **Carry forward** `open-questions` from the index (union across roster slugs in batch mode).

# Chat return contract
When ship continues past this phase, this receipt opens ship's chat return: do not end the turn here. Apply the early-stop guard in [_autonomy-guards.md](_autonomy-guards.md) before ending the turn. After writing files, return per [_chat-return.md](_chat-return.md). Lead with the narrative per that file (section *The narrative*), then give this receipt:
- `scope: <slug|branch>`, `slug: <slug>` (the lead in batch mode) and, in batch mode, the roster report (one row per slug: package / skip-unchanged / not-ready)
- `wrote: <path>` (one line per slug packaged)
- `pr: <url>` and `pr-readiness-verdict: <ready|awaiting-input|blocked>`
- `options:` (all viable next options, per Adaptive routing)
- ≤3 short blocker bullets if needed

# Procedure
Single-slug scope runs the numbered procedure as written. Branch scope splits it into two layers per [handoff/_batch.md](handoff/_batch.md).

Do this in order:
1. **Read branch strategy** from the index: `branch-strategy`, `branch`, `base-branch`, and the optional config keys in [_handoff-config.md](handoff/_handoff-config.md) (silent skip if absent).
2. **Track the handoff sequence.** One progress step per numbered step, with the labels used throughout this reference (T1 read artifacts · T2 summary · T3 Diátaxis docs · T3.5 commitlint · T3.6 public-surface drift · T3.7 doc-mirror regen · T3.8 local pre-push gate · T4 push · T5 PR · T5.0 CI watch · T5.1 comment triage · T5.2 rebase · T5.3 final re-watch · T6 write 08-handoff.md). A step that resolves to nothing to run is recorded as skipped with its reason, never marked done. T4 (push) never runs before T3.8 (the local pre-push gate) passes, and T5.1 (triage) waits on T5.0 (CI watch). The progress surface is a host concern ([_host-invocation.md](_host-invocation.md)).
3. Read the Requires inputs (T1).
4. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language (T2).
5. **Documentation generation (Diátaxis) (T3).** Read `02-shape.md`'s `## Documentation Plan` and `docs-needed` / `docs-types`. If `docs-needed: true`, for each doc type load the matching primitive of the diataxis skill (`reference` → [reference.md](../../diataxis/references/reference.md), `how-to` → [how-to.md](../../diataxis/references/how-to.md), `tutorial` → [tutorial.md](../../diataxis/references/tutorial.md), `explanation` → [explanation.md](../../diataxis/references/explanation.md), `readme` or `readme-update` → [readme.md](../../diataxis/references/readme.md)) and follow it in full; the handoff summary, shape, and verification artifacts are its writing target. Do not mix types. Write docs to the location the shape's docs plan names, else `docs/` or the existing file. List the paths in `## Documentation Changes`. If `docs-needed: false`, drop T3 and note "No documentation changes".
5b. **T3.5–T3.7 — Repo hooks.** In the mode `repo-hooks`, run the steps of [handoff/_repo-hooks.md](handoff/_repo-hooks.md): commitlint, public-surface drift and doc-mirror regen. Otherwise record `commitlint-status: skipped`, `public-surface-drift: skipped` and `docs-mirror-status: skipped`.
5e. **T3.8 — Local pre-push gate.** Skip entirely (`pre-push-checks-status: skipped`) when `branch-strategy` is `none`.

   a. **Resolve the check list.**
      - `pre-push-checks:` **present** → use its `checks:` unchanged. An empty `checks: []` (the recorded decline) → `pre-push-checks-status: not-configured`, continue.
      - `pre-push-checks:` **absent** → auto-detect, then propose once. Read the PR-gate workflow(s) under `.github/workflows/` and extract `run:` steps from jobs that are a required check per the ship plan's Block J or are named `format` / `lint` / `test` / `build`. Detection is conservative: skip any step that references `secrets.`, a service container, an emulator or device, or a matrix `runs-on` this host is not. Then ask ONE gate question per [_gate-question.md](_gate-question.md) presenting the derived list and the skipped steps with their reasons ("Run these <N> checks locally before pushing? They are this repo's own PR gates"), with the options *Run them and remember (Recommended)* (persist the list to `00-index.md` `pre-push-checks`), *Run once, don't persist*, and *Skip the gate* (records `pre-push-checks: { checks: [], declined-reason }` so this never re-asks). To persist or decline, get the index, change `pre-push-checks`, write the draft of `00-index.md` and put it. **Record what detection skipped and why**, in the question and in `pre-push-checks-skipped`. Detecting nothing runnable is legitimate: set `not-configured` and continue; do not invent commands.
   b. **Run each check** in list order, bounded by `timeout-minutes` (default 15) per command. Capture the exit status and the failing output tail. A check that exceeds its bound is `timed-out` and non-blocking.
   c. **On a blocking failure**, route into the existing diagnose→ask→fix path (`## Fix-subagent contract` in [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md)). Honor `on-fail`: `diagnose` (default) enters that path; `stop` records the failure, sets `readiness-verdict: awaiting-input`, and STOPs before the push. **Local fix rounds do NOT consume `ci-watch.max-fix-rounds`**; count them in `pre-push-fix-rounds`.
   d. **Do not push on an unresolved blocking failure.** Non-blocking (`blocking: false`) failures are recorded in `## Reviewer Focus Areas`, and the push proceeds.
   e. **Workflow-file static validation**, whenever the packaged diff touches `.github/workflows/**`: parse each changed file as YAML (a syntax error is a blocking failure) and check that every `actions/setup-*` version string resolves against its manifest (`setup-java` → the Adoptium manifest; `setup-node` / `setup-python` → theirs). Record `workflow-validation: <ok | findings | skipped>`.
   f. Record `pre-push-checks-status: <pass | fixed | fail | timed-out | skipped | not-configured>` and `pre-push-fix-rounds: <N>`.
6. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. **Push and create-or-update PR (if `branch-strategy` is `dedicated`):**
   a. Confirm you are on the workflow branch (`branch`); if not, `git checkout <branch>`. Push: `git push -u origin <branch>`.
   b. **PR existence check (idempotent):** `gh pr list --head <branch> --json number,url,state --limit 1`.
      - **No PR exists** → `gh pr create` with the best title from the summary, the summary as body, base `<base-branch>`. The body has the sections Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work and Reviewer Focus Areas. A batch body is made per [handoff/_batch.md](handoff/_batch.md). Do not merge.
      - **PR exists, state=OPEN** → `gh pr edit <pr-number> --body-file <tmp-file>` to refresh the body. Leave the title unless it materially mismatches.
      - **PR exists, state=CLOSED|MERGED** → STOP. Ask the user whether to reopen it (`gh pr reopen <pr-number>`), open a new one (run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index pr-number=null`, then re-run), or treat the workflow as shipped (route to `/wf retro <slug>`).
   c. **PR template checkbox sweep.** If `.github/PULL_REQUEST_TEMPLATE.md` exists, tick the checkboxes the artifacts justify ("Tests pass" when `06-verify-*.md` is green; "Docs updated" when `docs-generated:` is non-empty) and no others. Record `pr-url` and `pr-number` with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index pr-url=<url> pr-number=<N>`.
   - If `branch-strategy` is `shared`: in single-slug scope, push but do not create a PR; drop T5, T5.1, and T5.2 (no force-push on shared branches); T5.0/T5.3 still run if a `pr-number` is recorded. Batch scope on a shared branch follows [handoff/_batch.md](handoff/_batch.md).
   - If `branch-strategy` is `none`: drop T4 through T5.3. The handoff document is the deliverable.
7a. **T5.0 — Watch CI to green + settle reviews.** Skip when `branch-strategy` is not `dedicated`/`shared` or no `pr-number` is recorded. Otherwise read [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md) in full now; it carries the `## CI watch procedure` and the `## Fix-subagent contract` that steps 7a–7d execute. Read the wait config (`ci-watch:`, `review-settle:`; defaults per [_handoff-config.md](handoff/_handoff-config.md)). Then run the CI watch procedure against `pr-number`:
   - **green** (all checks `SUCCESS`/`NEUTRAL`/`SKIPPED`) → record `ci-watch-conclusion: green`; settle reviews per `## Settle reviews` in [_ci-red-routing.md](handoff/_ci-red-routing.md) (bots only, bounded; record `bot-reviews-landed`, `bot-review-status`, `review-settle-elapsed-seconds`).
   - **bound-exceeded** (checks still `pending` when the wait bound elapsed) → record `ci-watch-conclusion: timed-out`, set `readiness-verdict: awaiting-input`, list the still-pending checks in `live-checks-pending`, and STOP (write the artifact via steps 8–10). Re-run `/wf ship <slug>` to resume.
   - **red** (one or more checks terminal-failed) → apply [_ci-red-routing.md](handoff/_ci-red-routing.md): a diagnose-only sub-agent, routing by class and `converges`, one gate question, then fix / structural fix / re-run / stop. It records `ci-watch-fix-rounds` and `ci-fix-rounds-by-class:`; `ci-watch.max-fix-rounds` bounds product-bug rounds only.
7b. **T5.1 — PR comment triage loop.** Run the loop in [handoff/_pr-triage.md](handoff/_pr-triage.md). Record `triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids`, `has-deferred-comments`. Skip when step 7 drops T5.1 or no `pr-number` was recorded.
7c. **T5.2 — Rebase onto base** (only when `branch-strategy: dedicated`). `git fetch origin <base-branch>`. If `git merge-base --is-ancestor origin/<base-branch> HEAD` exits 0 → `rebase-status: fast-forward`, record `rebase-onto-sha: <git rev-parse origin/<base-branch>>`, skip to 7d. Otherwise `git rebase origin/<base-branch>`:
   - **Conflicts** → `rebase-status: conflicts`. Run `git rebase --abort`. STOP. Print the conflicting files, recommend `/wf implement <slug> <slice>`, set `readiness-verdict: blocked`, and proceed to step 9. T5.3 stays pending.
   - **Clean** → `git push --force-with-lease origin <branch>`. If the lease fails (moved during T5.1 triage), re-fetch and retry once. If the second attempt also fails, set `rebase-status: lease-failure` and STOP; recommend re-running handoff. Otherwise `rebase-status: rebased-clean`; record `rebase-onto-sha`.
7d. **T5.3 — Final readiness re-watch** (only when `pr-number` is recorded). Triage fixes (7b) and the rebase force-push (7c) retrigger CI; do not reuse the T5.0 result.
   a. **Re-watch CI** with the shared `## CI watch procedure`.
      - **timed-out** → set `readiness-verdict: awaiting-input`, record the still-pending checks in `live-checks-pending`, STOP (write the artifact via steps 8–10; re-running handoff resumes the watch).
      - **red** → run [_ci-red-routing.md](handoff/_ci-red-routing.md) once; if unresolved (user declines or the bound is hit), set `readiness-verdict: blocked` and write the artifact.
      - **green** → continue.
   b. **Capture the review snapshot**: `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus`. Record `live-review-decision` (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null), `live-checks-failing` and `live-checks-pending` (terminal-failed / still-pending `name`s from `.statusCheckRollup[]`), `live-merge-state` (`CLEAN` | `UNSTABLE` | `BLOCKED` | `DIRTY` | `BEHIND` | …) and `live-mergeable` (`MERGEABLE` | `CONFLICTING` | `UNKNOWN`). These are GitHub's own merge gate; the verdict consumes them. Then re-run the T5.1 unresolved-threads query once, and reply to and resolve each still-open thread of `triage-fixed-threads` (step 7 of [handoff/_pr-triage.md](handoff/_pr-triage.md)); genuinely open threads keep the verdict out of `ready`. Never resolve a thread to launder the merge state.
   c. **Compute the per-slug `readiness-verdict`** (a property of the PR; it lives on the lead's artifact and is copied to followers):
      - `ready` — `live-review-decision` ∈ {`APPROVED`, `null` if no reviewers required}, `live-checks-failing` empty, `live-merge-state` ∈ {`CLEAN`, `UNSTABLE`}, `live-mergeable` ≠ `CONFLICTING`, `commitlint-status` ≠ `fail`, `pre-push-checks-status` ≠ `fail`, `public-surface-drift` ≠ `drift-without-regen`, `rebase-status` ∈ {`fast-forward`, `rebased-clean`, `skipped`}, `has-deferred-comments` false. (`UNSTABLE` = only non-required checks failing; record their names in `live-checks-failing-nonrequired` so ship sees them.)
      - `awaiting-input` — pending checks remain, deferred comments exist, a required human reviewer has not responded (`REVIEW_REQUIRED`), or `live-merge-state` is `BLOCKED` after the thread re-check (record the cause in `readiness-reason`). Handoff records the missing approval and returns control.
      - `blocked` — anything that hard-fails the criteria above (failing checks after re-watch, `CHANGES_REQUESTED`, `live-mergeable: CONFLICTING`, drift without regen, rebase conflicts, deferred 🔴 blockers).
   c2. **Compute `pr-readiness-verdict`** (the branch/PR-level verdict ship gates on): the logical AND over the roster. It is `ready` only if the PR-level `readiness-verdict` is `ready` AND every slug on the branch is `package`-ready. If any roster slug is `not-ready`, it is `awaiting-input` (or `blocked` if that slug's review is `dont-ship`). In single-slug scope on an unshared branch, `pr-readiness-verdict` == `readiness-verdict`. Write `pr-readiness-verdict` and `handoff-lead` onto the lead's `08-handoff.md`; each follower sets `readiness-via: <lead>/08-handoff.md` and copies `pr-readiness-verdict`.

8. **Evaluate adaptive routing** (below) and write ALL viable options into the `recommended-routes` frontmatter.
9. Update the index of each roster slug in one call: `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index current-stage=ship progress.ship=in-progress next-command=<command> next-invocation=<invocation>`, and (batch) `handoff-lead=<lead>`. An older index can still hold a `progress.handoff` key: set `progress.handoff=complete` when the verdict is `ready`, and add none. Followers also set `readiness-via=<lead>/08-handoff.md`.
10. Write the draft `<wf-dir>/.draft/08-handoff.md` for each packaged slug (additive-write + ledger + `handoff-fingerprint`), then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. The lead's artifact carries the readiness keys and `pr-readiness-verdict`; followers carry `readiness-via` and the copied `pr-readiness-verdict`. Skip-unchanged and not-ready slugs are not written.

# Adaptive routing — evaluate what is actually next
Present ALL viable options:
- **Option A (default): Continue to the gate, in this run.** When `pr-readiness-verdict: ready` and the PR is open, return to [ship.md](ship.md) Step 0 and continue to the go/no-go gate. A later `/wf ship <slug>` (or `/wf ship pr#N` for a batch) resumes at that gate.
- **Option B: Skip to Retro** → `/wf retro <slug>`. Shipping is handled entirely outside this workflow; the handoff document IS the final deliverable.
- **Option C: Package remaining slugs/slices first** → re-run `/wf ship pr#N`, or `/wf plan|implement <slug> <next-slice>`. Use when the roster shows `not-ready` slugs, or `03-slice.md` shows slices still `status: defined` **that have no implement/verify artifacts on disk** (a `defined` entry with a passing verify is a bookkeeping fault step 4 already reconciled). Do not ship until `pr-readiness-verdict: ready`.
- **Option D: Fix** → `/wf implement <slug> <selected-slice>`. While writing the handoff, you realised something is wrong or missing in a specific slice.

# Artifacts
Write the draft of `08-handoff.md` with this frontmatter, and put it. `node "<skill-dir>/scripts/wf.mjs" stamp handoff --slug <slug>` prints its required fields, each with its allowed values; the template adds the optional fields.

```yaml
---
schema: sdlc/v1
type: handoff
slug: <slug>
slice-slugs: [<slug-1>, <slug-2>, ...]
handoff-mode: <aggregate|single-slice>
handoff-scope: <slug|branch>
status: complete
stage-number: 8
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
revisions: []
handoff-fingerprint: "<digest of packaging inputs>"
handoff-lead: "<lead-slug>"
branch-slugs: [<slug-1>, <slug-2>, ...]
readiness-via: "<lead-slug>/08-handoff.md"
pr-readiness-verdict: <ready | blocked | awaiting-input>
pr-title: "<suggested PR title>"
pr-url: "<url or empty if branch-strategy is not dedicated>"
pr-number: <N or 0>
branch: "<branch name>"
base-branch: "<target branch>"
has-migration: <true|false>
has-config-change: <true|false>
has-docs-changes: <true|false>
docs-generated: [<list of doc paths written or updated>]
ship-plan-readiness: <ok | acknowledged | amended-inline | not-applicable>
ship-plan-amended-blocks: [<letter>, ...]
ship-plan-version-before-after: "<N>→<M>"
commitlint-status: <pass | warn | fail | skipped>
public-surface-drift: <none | regenerated | drift-without-regen | skipped>
docs-mirror-status: <up-to-date | regenerated | skipped>
pre-push-checks-status: <pass | fixed | fail | timed-out | skipped | not-configured>
pre-push-fix-rounds: <N>
workflow-validation: <ok | findings | skipped>
triage-iterations: <N>
triage-fixes-applied: <N>
triage-fixes-skipped: <N>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true | false>
rebase-status: <fast-forward | rebased-clean | conflicts | lease-failure | skipped>
rebase-onto-sha: "<sha of origin/<base-branch> at rebase time>"
ci-watch-conclusion: <green | red | timed-out | skipped>
ci-watch-rounds: <N>
ci-watch-fix-rounds: <N>
ci-fix-rounds-by-class: { product-bug: <N>, flaky-or-infra: <N>, non-convergent: <N>, preexisting-unrelated: <N> }
bot-reviews-landed: [<login>, ...]
bot-review-status: { <login>: <landed | declined: <reason> | absent> }
review-settle-elapsed-seconds: <N>
live-review-decision: <APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null>
live-checks-failing: [<check-name>, ...]
live-checks-pending: [<check-name>, ...]
live-checks-failing-nonrequired: [<check-name>, ...]
live-merge-state: <CLEAN | UNSTABLE | BLOCKED | DIRTY | BEHIND | ...>
live-mergeable: <MERGEABLE | CONFLICTING | UNKNOWN>
pre-push-checks-skipped: [{ step: "<run step>", reason: "<why auto-detect skipped it>" }]
readiness-verdict: <ready | blocked | awaiting-input>
readiness-reason: "<one line: the cause of readiness-verdict>"
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  implements: [05-implement-<slug-1>.md, 05-implement-<slug-2>.md, ...]
  reviews: [07-review-<slug-1>.md, ...]
next-command: ship
next-invocation: "/wf ship <slug>"
recommended-routes:
  - invocation: "/wf ship <slug>"
    reason: "<one phrase>"
    default: true
---
```

The T3.5–T5.3 outcomes live only in the frontmatter keys. Body sections, in order:
- `## PR Title Options` (numbered), `## Summary`, `## Problem`, `## Solution`.
- `## Augmentations Applied` (only if `augmentations:` is non-empty): every augmentation in user-facing language, grouped as **Design improvements**, **Observability**, **Experimentation**, **Performance**, each with the user-visible effect and the verification evidence path. Do not cite workflow artifact paths or sub-command names.
- `## Affected Areas`, `## Verification Evidence`, `## Manual Test Notes`, `## Migration / Config / Rollout Notes`, `## Risks / Caveats`, `## Documentation Changes` (per doc: **Type** reference / how-to / tutorial / explanation / readme, **Path**, **What it covers**; or "None — [reason from shape docs plan]"), `## Follow-Up Work`, `## Reviewer Focus Areas` (name any unresolvable `actions/setup-*` pin here).
- `## Reviewer Comments Triaged` (populated by T5.1; empty when `branch-strategy: none` or no PR exists): a table `| Source | File:Line | Severity | Summary | Action |` where `Action` is `fixed (sha=<short-sha>)`, `applied (sha=<short-sha>)`, `deferred`, `declined`, or `noted`. Cite commit SHAs only.
- `## Freshness Research` (Source / Why it matters / Takeaway per entry).

# Additive-write contract
`08-handoff.md` is revisable. On re-invocation, follow [_additive-write.md](_additive-write.md):
- **No-op guard (fingerprint).** Recompute `handoff-fingerprint` (step 6). If it matches the stored value, skip the slug entirely: no snapshot, no ledger entry, no rewrite.
- **Snapshot** the `record get` output of the pre-run `08-handoff.md` to `<wf-dir>/history/08-handoff-<rev>.md`, then **rewrite the body to current truth**.
- **Ledger entry** (`revisions:`): `trigger` is `review-feedback`, `ci-fix`, `new-slug-joined`, `scope-change`, or `resume`; `because:` and `changed:` name the prompt and the effect. Update `handoff-fingerprint`. The body is the current document, so re-posting the PR description via `gh pr edit` is a straight copy; in batch mode the PR body is the union across packaged slugs, regenerated whole each run. The readiness keys are overwritten on every re-run, never revisioned, and in batch mode present only on the lead.
