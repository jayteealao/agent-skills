---
description: Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates ALL complete slices of a slug by default; a `pr#N` or branch-name first argument aggregates EVERY slug that shares that branch (batch mode) and reports which slugs are handoff-ready. Pass a slice-slug only when each slice has its own separate PR.
argument-hint: <slug|pr#N|branch> [slice-slug]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf handoff`, **stage 8 of 10**: 1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·handoff` → 9·ship → 10·retro.

| | Detail |
|---|---|
| Requires (per-slice review mode) | `05-implement-<slice-slug>.md` AND `07-review-<slice-slug>.md` for every slice in scope. |
| Requires (slug-wide review mode) | `05-implement-<slice-slug>.md` for every slice in scope AND a single `07-review.md`. Per-slice review files are not checked when `review-scope: slug-wide`. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `augmentations:` list — each contributes reviewer-visible context, translated to product language per the output boundary. The handoff is incomplete if any present artifact is omitted. |
| Produces | `08-handoff.md` per slug, covering all complete slices (or one slice if explicitly scoped). In batch mode: one per slug on the branch, plus a single shared PR and the branch-level readiness block on the lead slug. |
| Next | `/wf ship <slug>` (default), or `/wf ship pr#N` to ship every ready slug on the branch together |
| Skip-to | `/wf retro <slug>` if shipping is handled externally or not applicable |
| Ship-plan gate (step 6.7) | Runs the shared [_ship-plan-readiness.md](_ship-plan-readiness.md) pre-check; a missing or drifted `.ai/ship-plan.md` STOPs at `awaiting-input`, routing to `/wf ship-plan init` / `edit`. |
| Config | The optional `00-index.md` keys (`public-surface`, `docs-mirror`, `review-bots`, `ci-watch`, `review-settle`, `pre-push-checks`) are documented in [_handoff-config.md](_handoff-config.md). |

**Auto second opinion.** Before writing the final readiness verdict, auto-invoke `/consult codex <review this PR diff and open findings for design drift, architectural smell, or security blind spots>` whenever the PR carries any open review finding, touches a security-sensitive or externally-observable surface, or any `intent-risk` (RIM) is still `carried`. Skip only a clean, low-surface PR with no open findings.

# Role
You are a workflow orchestrator, not a problem solver.
- Do not make code changes, fix issues, or modify the implementation yourself. When CI fails or a review thread needs a code change, dispatch a diagnosis or fix sub-agent (`## Fix-subagent contract` in [_pr-ci-handoff.md](_pr-ci-handoff.md)) and, for CI-red, get user approval first. Only the sub-agent's compact result returns to your context.
- You DO wait. CI reaches a terminal state and bot reviews get their settle window before you decide readiness. Snapshotting "pending" and stopping is a contract violation (T5.0/T5.3).
- Summarise the completed work into a reviewer-friendly handoff package, push the branch, and create a pull request. Do not ship, merge, or deploy.
- If you catch yourself about to start editing code or merging, STOP and return to the next unfinished workflow step.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md).

# Step 0 — Orient (do this before all other steps)
1. **Resolve the first argument**; it is polymorphic. Resolve in this exact order (first match wins):
   - **Exact slug**: `.ai/workflows/<arg>/00-index.md` exists → **single-slug handoff**, `handoff-scope: slug`.
   - **PR reference** `pr#N` / `#N` / a bare integer: resolve the branch via `gh pr view <N> --json headRefName -q .headRefName`, then follow the branch path. `handoff-scope: branch`.
   - **Branch name**: matches a `branch:` recorded in some `00-index.md` (or an existing git branch) → **batch handoff**, `handoff-scope: branch`.
   - **Absent**: infer the most recent active workflow from `.ai/workflows/*/00-index.md` → single-slug. If ambiguous, ask the user.

   **Footgun guard.** If the resolved single slug's `branch` is shared by other slugs' `00-index.md`, WARN that a single-slug verdict on a shared branch goes stale when a sibling moves the branch. Recommend `/wf handoff pr#N` (or the branch name). Proceed only if the user confirms.
2. **Build the roster.** Single-slug: roster = `[<slug>]`. Batch: the roster is every slug whose `00-index.md` `branch:` equals the resolved branch. If none → STOP: "No workflows are on branch `<branch>`." Record the roster as `branch-slugs:`.
3. **Read each roster slug's `00-index.md`**: `current-stage`, `status`, `selected-slice-or-focus`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, `review-scope` (default `per-slice`), and any existing `handoff-lead:`.

   **Re-validate `branch-strategy: none` against what is actually being packaged.** `none` means the handoff document is the deliverable — no push, no PR — and holds only while the packaged range touches nothing but docs and `.ai/` bookkeeping. If the implemented slices touched repo code, ask ONE gate question per [_gate-question.md](_gate-question.md): "the index says `branch-strategy: none`, but this handoff packages repo code (<n> non-doc files) — deliver doc-only as recorded, or switch to `dedicated` (push + PR)?" Record the answer to `00-index.md` (update `branch-strategy` if switched) so the same range never re-asks.

3a. **Elect the lead slug** (batch only; a single slug is its own lead). If any roster slug carries `handoff-lead:`, reuse it unchanged; changing it would strand the CI-watch/triage resume state. Otherwise elect the first roster slug alphabetically and stamp `handoff-lead: <lead>` into every roster slug's `00-index.md`. The lead owns the single shared PR and the branch-level readiness block (T3.5–T5.3). Followers carry `readiness-via: <lead>/08-handoff.md`.
4. **Resolve per-slug handoff scope.** Explicit slice mode: a slice-slug as the second argument (single-slug only) scopes to that slice. Aggregate mode (default): read the slug's `03-slice.md` and collect every slice with `status: complete` or `status: in-progress`.

   **Reconcile a stale roster before concluding "none" (do not blame the operator).** A roster entry still at `status: defined` is not proof the slice was never built. Before reporting a slug as having no implemented slices, check each `defined` entry against disk: if `05-implement-<slice>.md` exists **and** `06-verify-<slice>.md` exists with `result: pass`, **reconcile the roster** (set `complete`, or `in-progress` when implement exists but verify does not yet pass), include the slice in scope, and **emit a warning naming the stage that should have written it** ("slice `<x>`'s roster status was `defined` despite a passing verify — reconciled here; `/wf verify` should have promoted it"). Never silently skip the slug, and never silently fix it.

   If a slug genuinely has none after reconciliation → it is **not handoff-ready**; record it in the roster report as "no implemented slices" and skip packaging it (do not STOP the whole batch).
5. **Check prerequisites for each roster slug.** A slug that fails any check is **not-ready** with the reason and excluded from packaging. In single-slug mode a not-ready result STOPs with the reason. In batch mode not-ready slugs are reported in the roster and skipped while ready siblings proceed.
   - **Implement gate (all modes)**: `05-implement-<slice-slug>.md` exists for every slice in scope. Missing → not-ready: "Run `/wf implement <slug> <slice>` for missing slices."
   - **Intent-risk gate (all modes)**: parse `intent-risks` (the RIM ledger) from `00-index.md` (absent → empty). Any entry with `status: open` → not-ready: "An unadjudicated intent-risk means shape never resolved a load-bearing ambiguity — run `/wf shape <slug>` to adjudicate it (`adjudicated` or `carried`)." Handoff never adjudicates. `carried` RIMs are legal and are surfaced in the PR body and in `## Reviewer Focus Areas`.
   - **Per-slice review mode** (`review-scope: per-slice` or absent): `07-review-<slice-slug>.md` exists for every slice in scope (missing → not-ready: "Run `/wf review <slug> <slice>` for each slice."). Parse `verdict:` and `metric-findings-blocker:` (OPEN blockers only); `verdict: dont-ship` or `metric-findings-blocker > 0` → not-ready, naming the slice(s); fix via `/wf implement <slug> <slice> reviews`.
   - **Slug-wide review mode** (`review-scope: slug-wide`): a single `07-review.md` exists (missing → not-ready: "Run `/wf review <slug>` first."). Parse `verdict:` and `metric-findings-blocker:`; `dont-ship` or `> 0` → not-ready.
   - In all modes: if a slug's `current-stage` is already past handoff → WARN before overwriting that slug's package.

6. **Fingerprint no-op guard + roster report.** For each ready slug, compute `handoff-fingerprint`: a stable digest of the commit range packaged (`git merge-base HEAD origin/<base-branch>`..`HEAD` restricted to the slug's slices where determinable), the in-scope slice slugs and their statuses, and each in-scope review's `verdict`. Compare to the value in the slug's existing `08-handoff.md`. Match → skip the slug entirely (no snapshot, no ledger entry, no rewrite, per [_additive-write.md](_additive-write.md)) and mark it "unchanged". Differ or absent → (re)package this run. Then print the roster report before any packaging:

   | Slug | Stage | Review verdict | Open blockers | Fingerprint | Action |
   |---|---|---|---|---|---|
   | `<slug>` | implement/review/handoff | ship / dont-ship | N | fresh / changed / new | package / skip-unchanged / **not-ready: <reason>** |

   Packaging proceeds only for rows whose action is `package`.
6.7. **Ship-plan readiness pre-check (gate).** Load [_ship-plan-readiness.md](_ship-plan-readiness.md) and follow it in full (caller = `handoff`, commit range = `git merge-base HEAD origin/<base-branch>`..`HEAD`). A missing plan or unacknowledged drift STOPs the run before packaging and routes to `/wf ship-plan init` / `/wf ship-plan edit` via the slug's `00-index.md` `recommended-next-*`; no partial `08-handoff.md` is written, but `resume-orientation` is (the pre-check's Step R3.5). `ok`, `acknowledged`, `amended-inline`, and `not-applicable` proceed. When the user chooses *Amend now and continue*, the pre-check invokes `ship-plan edit` scoped to the drifted blocks, re-verifies, and continues only when no gating finding survives. The amend options appear only for findings an amendment can clear (`clears-on: amend`). Stamp the returned `ship-plan-readiness` into `08-handoff.md` frontmatter (in batch mode the lead owns the single check). Skip only when a prior run this session resolved it to `ok`/`not-applicable` and nothing in Group 2's change surface moved since.
7. **Read full context** for each slug being packaged: `02-shape.md`, `03-slice.md`, and per slice in scope `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md`, plus `07-review-<slice-slug>.md` (per-slice mode) or the single `07-review.md` (slug-wide); then `po-answers.md`. From each `06-verify-<slice-slug>.md`, surface in `## Reviewer Focus Areas`: `stability-check-flaky-count > 0` ("N criteria showed intermittent behaviour during verification — may indicate race conditions"); `adversarial-tests-failed > 0` (list the failures from `## Adversarial Tests`); `cross-browser-delta: findings` (list from `## Cross-Browser Delta`); `web-vitals-inp-ms > 200` ("interaction responsiveness measured above threshold"); non-empty `## Friction Notes` / `## Free Exploration Notes` under a "Soft Observations" subsection.
8. **Read augmentation context.** Read `02b-design.md` and `02c-craft.md` for register, anti-goals, and visual contract; `02c-craft.md`'s mock fidelity inventory items are user-visible changes the PR description highlights. Read the `augmentations:` list in `00-index.md`; every entry appears in `## Augmentations Applied` and/or `## Reviewer Focus Areas`, translated per type: `design-harden` → "Accessibility improvements applied — N components updated, axe-core scan clean"; `design-optimize` → "Performance improvements — measured Xms reduction in [metric]"; `design-adapt` → "Improved mobile/tablet/dark-mode behavior"; other `design-*` → "Visual refresh of [surface area]" or "Design quality review pass — N findings addressed"; `instrument` → "Added observability — N signals for previously unobserved code paths"; `experiment` → "Wrapped behind feature flag with cohort split for measured rollout"; `benchmark` → "Performance baseline taken; verify-stage comparison: <within tripwires / regression>". Do not cite workflow artifact paths or sub-command names in any external-facing field.
9. **Carry forward** `open-questions` from the index (union across roster slugs in batch mode).

# Chat return contract
Apply the early-stop guard in [_autonomy-guards.md](_autonomy-guards.md) before ending the turn. After writing files, return per [_chat-return.md](_chat-return.md): a narrative lead in the artifact's `## The Handoff` story voice, then this receipt:
- `scope: <slug|branch>` and, in batch mode, the roster report (one row per slug: package / skip-unchanged / not-ready)
- `slug: <slug>` (lead slug in batch mode)
- `wrote: <path>` (one line per slug packaged)
- `pr: <url>` and `pr-readiness-verdict: <ready|awaiting-input|blocked>`
- `options:` (all viable next options, per Adaptive routing)
- ≤3 short blocker bullets if needed

# Batch orchestration
Single-slug scope runs the numbered procedure as written. Branch scope splits it into two layers:
1. **Per-slug packaging** (T1–T3.7) runs once per roster slug whose action is `package`. The artifact work (T1 reads + the T2 summary; each slug touches only its own `.ai/workflows/<slug>/` files) dispatches in parallel, one sub-agent per slug. The steps that write or commit in the shared working tree (T3 docs, T3.5 commitlint, T3.6 public-surface regen, T3.7 doc-mirror regen) run serialized, in roster order, after the parallel wave. Skip slugs marked `skip-unchanged` or `not-ready`.
2. **Branch machinery** (T3.8–T5.3: local pre-push gate, push, the ONE PR, CI watch, triage, rebase, final readiness) runs exactly once, owned by the lead. The PR description is the union of every packaged slug's summary and names any `not-ready` slug on the branch. The branch-level readiness block is written to the lead's `08-handoff.md`; followers set `readiness-via: <lead>/08-handoff.md` and copy `pr-readiness-verdict`.
3. **`pr-readiness-verdict` is the logical AND across the roster.** Ship gates on the AND.

Do this in order:
1. **Read branch strategy** from `00-index.md`: `branch-strategy`, `branch`, `base-branch`, and the optional config keys in [_handoff-config.md](_handoff-config.md) (silent skip if absent).
2. **Track the handoff sequence.** One progress step per numbered step, with the labels used throughout this reference (T1 read artifacts · T2 summary · T3 Diátaxis docs · T3.5 commitlint · T3.6 public-surface drift · T3.7 doc-mirror regen · T3.8 local pre-push gate · T4 push · T5 PR · T5.0 CI watch · T5.1 comment triage · T5.2 rebase · T5.3 final re-watch · T6 write 08-handoff.md). A step that resolves to nothing to run is recorded as skipped with its reason, never marked done. T4 (push) never runs before T3.8 (the local pre-push gate) passes, and T5.1 (triage) waits on T5.0 (CI watch). The progress surface is a host concern ([_host-invocation.md](_host-invocation.md)).
3. Read all prior artifacts needed for the summary (T1).
4. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language (T2).
5. **Documentation generation (Diátaxis) (T3).** Read `02-shape.md`'s `## Documentation Plan` and `docs-needed` / `docs-types`. If `docs-needed: true`, for each doc type load the matching primitive (`reference` → `docs/reference.md`, `how-to` → `docs/how-to.md`, `tutorial` → `docs/tutorial.md`, `explanation` → `docs/explanation.md`, `readme` or `readme-update` → `docs/readme.md`) and follow it in full; the handoff summary, shape, and verification artifacts are its writing target. Do not mix types. Write docs to the location the shape's docs plan names, else `docs/` or the existing file. List the paths in `## Documentation Changes`. If `docs-needed: false`, drop T3 and note "No documentation changes".
5b. **T3.5 — Commitlint pass.** Detect a commitlint config (`.commitlintrc*`, `commitlint.config.{js,cjs}`) at repo root; none → `commitlint-status: skipped`. Otherwise run `npx commitlint --from $(git merge-base HEAD origin/<base-branch>) --to HEAD` (or the project's package-manager equivalent). All pass → `pass`. A `BREAKING CHANGE` footer or `!:` subject → `warn` (record the commits in `## Reviewer Focus Areas`; do not block). A violation → `commitlint-status: fail`. STOP. Print the violating commits and ask the user to amend; do not auto-fix.
5c. **T3.6 — Public-surface drift.** Read `public-surface:` from `00-index.md`; absent → `public-surface-drift: skipped`. Record whether `public-surface.files` are clean (`git diff --quiet HEAD -- <files>`), run `regen-cmd`, and re-check: no change → `none`; changed and previously clean → commit `chore(api): regenerate <kind> surface mirror` → `regenerated`; changed and previously dirty → `drift-without-regen`. STOP: the regen output disagrees with the staged version; ask the user to reconcile via `/wf implement <slug> <slice>`. Record the regen summary in `## Reviewer Focus Areas` for every kind.
5d. **T3.7 — Doc-mirror regen.** Read `docs-mirror:`; absent → `docs-mirror-status: skipped`. Run `regen-cmd`; no diff under `mirror-paths` → `up-to-date`; a diff → commit `docs: regenerate doc mirrors` → `regenerated`.
5e. **T3.8 — Local pre-push gate.** Skip entirely (`pre-push-checks-status: skipped`) when `branch-strategy` is `none`. This step asks the working tree before it asks CI.

   a. **Resolve the check list.**
      - `pre-push-checks:` **present** → use its `checks:` unchanged. An empty `checks: []` (the recorded decline) → `pre-push-checks-status: not-configured`, continue.
      - `pre-push-checks:` **absent** → auto-detect, then propose once. Read the PR-gate workflow(s) under `.github/workflows/` and extract `run:` steps from jobs that are a required check per the ship plan's Block J or are named `format` / `lint` / `test` / `build`. Detection is conservative: skip any step that references `secrets.`, a service container, an emulator or device, or a matrix `runs-on` this host is not. Then ask ONE gate question per [_gate-question.md](_gate-question.md) presenting the derived list and the skipped steps with their reasons ("Run these <N> checks locally before pushing? They are this repo's own PR gates"), with the options *Run them and remember (Recommended)* (persist the list to `00-index.md` `pre-push-checks`), *Run once, don't persist*, and *Skip the gate* (records `pre-push-checks: { checks: [], declined-reason }` so this never re-asks). **Record what detection skipped and why**, in the question and in `## Reviewer Focus Areas`. Detecting nothing runnable is legitimate: set `not-configured` and continue; do not invent commands.
   b. **Run each check** in list order, bounded by `timeout-minutes` (default 15) per command. Capture the exit status and the failing output tail. A check that exceeds its bound is `timed-out` and non-blocking.
   c. **On a blocking failure**, route into the existing diagnose→ask→fix path (`## Fix-subagent contract` in [_pr-ci-handoff.md](_pr-ci-handoff.md)). Honor `on-fail`: `diagnose` (default) enters that path; `stop` records the failure, sets `readiness-verdict: awaiting-input`, and STOPs before the push. **Local fix rounds do NOT consume `ci-watch.max-fix-rounds`**; count them in `pre-push-fix-rounds`.
   d. **Do not push on an unresolved blocking failure.** Non-blocking (`blocking: false`) failures are recorded in `## Reviewer Focus Areas`, and the push proceeds.
   e. **Workflow-file static validation**, whenever the packaged diff touches `.github/workflows/**`: parse each changed file as YAML (a syntax error is a blocking failure) and check that every `actions/setup-*` version string resolves against its manifest (`setup-java` → the Adoptium manifest; `setup-node` / `setup-python` → theirs). Record `workflow-validation: <ok | findings | skipped>`.
   f. Record `pre-push-checks-status: <pass | fixed | fail | timed-out | skipped | not-configured>` and `pre-push-fix-rounds: <N>`.
6. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. **Push and create-or-update PR (if `branch-strategy` is `dedicated`):**
   a. Confirm you are on the workflow branch (`branch`); if not, `git checkout <branch>`. Push: `git push -u origin <branch>`.
   b. **PR existence check (idempotent):** `gh pr list --head <branch> --json number,url,state --limit 1`.
      - **No PR exists** → `gh pr create` with the best title from the summary (batch: the branch's theme), the summary as body (Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work, Reviewer Focus Areas; in batch mode the UNION across packaged slugs, sectioned per slug, with a "Not yet ready" callout naming any `not-ready` slug), base `<base-branch>`. Do not merge.
      - **PR exists, state=OPEN** → `gh pr edit <pr-number> --body-file <tmp-file>` to refresh the body. Leave the title unless it materially mismatches.
      - **PR exists, state=CLOSED|MERGED** → STOP. Ask the user whether to reopen it (`gh pr reopen <pr-number>`), open a new one (delete `pr-number` from `00-index.md`, then re-run), or treat the workflow as shipped (route to `/wf retro <slug>`).
   c. **PR template checkbox sweep.** If `.github/PULL_REQUEST_TEMPLATE.md` exists, tick the checkboxes the artifacts justify ("Tests pass" when `06-verify-*.md` is green; "Docs updated" when `docs-generated:` is non-empty) and no others. Record `pr-url` and `pr-number` in `00-index.md`.
   - If `branch-strategy` is `shared`: in single-slug scope, push but do not create a PR; drop T5, T5.1, and T5.2 (no force-push on shared branches); T5.0/T5.3 still run if a `pr-number` is recorded. In batch scope, the lead creates/refreshes the single shared PR (T5 runs) with the not-ready slugs disclosed in the body; T5.2 stays dropped; T5.0/T5.1/T5.3 run.
   - If `branch-strategy` is `none`: drop T4 through T5.3. The handoff document is the deliverable.
7a. **T5.0 — Watch CI to green + settle reviews.** Skip when `branch-strategy` is not `dedicated`/`shared` or no `pr-number` is recorded. Otherwise read [_pr-ci-handoff.md](_pr-ci-handoff.md) in full now; it carries the `## CI watch procedure` and the `## Fix-subagent contract` that steps 7a–7d execute; the T5.1 triage loop is in [handoff/_pr-triage.md](handoff/_pr-triage.md). Read the wait config (`ci-watch:`, `review-settle:`; defaults per [_handoff-config.md](_handoff-config.md)). Then run the CI watch procedure against `pr-number`:
   - **green** (all checks `SUCCESS`/`NEUTRAL`/`SKIPPED`) → record `ci-watch-conclusion: green`; settle reviews per `## Settle reviews` in [_ci-red-routing.md](_ci-red-routing.md) (bots only, bounded; record `bot-reviews-landed`, `bot-review-status`, `review-settle-elapsed-seconds`).
   - **bound-exceeded** (checks still `pending` when the wait bound elapsed) → record `ci-watch-conclusion: timed-out`, set `readiness-verdict: awaiting-input`, list the still-pending checks in `live-checks-pending`, and STOP (write the artifact via steps 8–10). Re-run `/wf handoff <slug>` to resume.
   - **red** (one or more checks terminal-failed) → apply [_ci-red-routing.md](_ci-red-routing.md): a diagnose-only sub-agent, routing by class and `converges`, one gate question, then fix / structural fix / re-run / stop. It records `ci-watch-fix-rounds` and `ci-fix-rounds-by-class:`; `ci-watch.max-fix-rounds` bounds product-bug rounds only.
7b. **T5.1 — PR comment triage loop.** Run the loop in [handoff/_pr-triage.md](handoff/_pr-triage.md). Record `triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids`, `has-deferred-comments`. Skip when `branch-strategy` is not `dedicated` or no `pr-number` was recorded.
7c. **T5.2 — Rebase onto base** (only when `branch-strategy: dedicated`). `git fetch origin <base-branch>`. If `git merge-base --is-ancestor origin/<base-branch> HEAD` exits 0 → `rebase-status: fast-forward`, record `rebase-onto-sha: <git rev-parse origin/<base-branch>>`, skip to 7d. Otherwise `git rebase origin/<base-branch>`:
   - **Conflicts** → `rebase-status: conflicts`. Run `git rebase --abort`. STOP. Print the conflicting files, recommend `/wf implement <slug> <slice>`, set `readiness-verdict: blocked`, and proceed to step 9. T5.3 stays pending.
   - **Clean** → `git push --force-with-lease origin <branch>`. If the lease fails (moved during T5.1 triage), re-fetch and retry once. If the second attempt also fails, set `rebase-status: lease-failure` and STOP; recommend re-running handoff. Otherwise `rebase-status: rebased-clean`; record `rebase-onto-sha`.
7d. **T5.3 — Final readiness re-watch** (only when `pr-number` is recorded). Triage fixes (7b) and the rebase force-push (7c) retrigger CI; do not reuse the T5.0 result.
   a. **Re-watch CI** with the shared `## CI watch procedure`.
      - **timed-out** → set `readiness-verdict: awaiting-input`, record the still-pending checks in `live-checks-pending`, STOP (write the artifact via steps 8–10; re-running handoff resumes the watch).
      - **red** → run [_ci-red-routing.md](_ci-red-routing.md) once; if unresolved (user declines or the bound is hit), set `readiness-verdict: blocked` and write the artifact.
      - **green** → continue.
   b. **Capture the review snapshot**: `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus`. Record `live-review-decision` (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null), `live-checks-failing` and `live-checks-pending` (terminal-failed / still-pending `name`s from `.statusCheckRollup[]`), `live-merge-state` (`CLEAN` | `UNSTABLE` | `BLOCKED` | `DIRTY` | `BEHIND` | …) and `live-mergeable` (`MERGEABLE` | `CONFLICTING` | `UNKNOWN`). These are GitHub's own merge gate; the verdict consumes them. When `live-merge-state` is `BLOCKED` and checks/approvals are otherwise green, re-run the T5.1 unresolved-threads query once: resolve via `resolveReviewThread` only threads whose fix landed; genuinely open threads keep the verdict out of `ready`. Never resolve a thread to launder the merge state.
   c. **Compute the per-slug `readiness-verdict`** (a property of the PR; it lives on the lead's artifact and is copied to followers):
      - `ready` — `live-review-decision` ∈ {`APPROVED`, `null` if no reviewers required}, `live-checks-failing` empty, `live-merge-state` ∈ {`CLEAN`, `UNSTABLE`}, `live-mergeable` ≠ `CONFLICTING`, `commitlint-status` ≠ `fail`, `pre-push-checks-status` ≠ `fail`, `public-surface-drift` ≠ `drift-without-regen`, `rebase-status` ∈ {`fast-forward`, `rebased-clean`, `skipped`}, `has-deferred-comments` false. (`UNSTABLE` = only non-required checks failing; record their names in `live-checks-failing-nonrequired` so ship sees them.)
      - `awaiting-input` — pending checks remain, deferred comments exist, a required human reviewer has not responded (`REVIEW_REQUIRED`), or `live-merge-state` is `BLOCKED` after the thread re-check (record the cause). Handoff records the missing approval and returns control.
      - `blocked` — anything that hard-fails the criteria above (failing checks after re-watch, `CHANGES_REQUESTED`, `live-mergeable: CONFLICTING`, drift without regen, rebase conflicts, deferred 🔴 blockers).
   c2. **Compute `pr-readiness-verdict`** (the branch/PR-level verdict ship gates on): the logical AND over the roster. It is `ready` only if the PR-level `readiness-verdict` is `ready` AND every slug on the branch is `package`-ready. If any roster slug is `not-ready`, it is `awaiting-input` (or `blocked` if that slug's review is `dont-ship`). In single-slug scope on an unshared branch, `pr-readiness-verdict` == `readiness-verdict`. Write `pr-readiness-verdict` and `handoff-lead` onto the lead's `08-handoff.md`; each follower sets `readiness-via: <lead>/08-handoff.md` and copies `pr-readiness-verdict`.

8. **Evaluate adaptive routing** (below) and write ALL viable options into `## Recommended Next Stage`.
9. Update `00-index.md` for each roster slug: `current-stage`, next-command/invocation, and (batch) `handoff-lead`. Followers also record `readiness-via`.
10. Write `.ai/workflows/<slug>/08-handoff.md` for each packaged slug (additive-write + ledger + `handoff-fingerprint`). The lead's artifact carries the full readiness block and `pr-readiness-verdict`; followers carry `readiness-via` and the copied `pr-readiness-verdict`. Skip-unchanged and not-ready slugs are not written.

# Adaptive routing — evaluate what is actually next
Present ALL viable options:
- **Option A (default): Ship** → `/wf ship <slug>` (single-slug) or `/wf ship pr#N` (batch; ships every ready slug on the branch as one atomic run). Use when `pr-readiness-verdict: ready`, the PR is created, and the work needs deployment planning, rollout, and rollback guidance.
- **Option B: Skip to Retro** → `/wf retro <slug>`. Shipping is handled entirely outside this workflow; the handoff document IS the final deliverable.
- **Option C: Package remaining slugs/slices first** → re-run `/wf handoff pr#N`, or `/wf plan|implement <slug> <next-slice>`. Use when the roster shows `not-ready` slugs, or `03-slice.md` shows slices still `status: defined` **that have no implement/verify artifacts on disk** (a `defined` entry with a passing verify is a bookkeeping fault step 4 already reconciled). Do not ship until `pr-readiness-verdict: ready`.
- **Option D: Fix** → `/wf implement <slug> <selected-slice>`. While writing the handoff, you realised something is wrong or missing in a specific slice.

# Artifacts
Write `08-handoff.md` with this frontmatter:

```yaml
---
schema: sdlc/v1
type: handoff
slug: <slug>
slice-slugs: [<slug-1>, <slug-2>, ...]   # all slices covered by this handoff
handoff-mode: <aggregate|single-slice>   # aggregate = all complete slices; single-slice = explicit override
handoff-scope: <slug|branch>             # branch = batch handoff over every slug on the branch
status: complete
stage-number: 8
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
revisions: []                            # reason-centric ledger (see _additive-write.md)
handoff-fingerprint: "<digest of packaging inputs>"   # no-op guard for re-runs
handoff-lead: "<lead-slug>"              # owns the branch-level readiness block + shared PR; == slug on the lead
branch-slugs: [<slug-1>, <slug-2>, ...]  # the roster: every slug on this branch in scope
readiness-via: "<lead-slug>/08-handoff.md"   # followers only — pointer to the lead's readiness block
pr-readiness-verdict: <ready | blocked | awaiting-input>   # AND across the roster; ship gates on this
pr-title: "<suggested PR title>"
pr-url: "<url or empty if branch-strategy is not dedicated>"
pr-number: <N or 0>
branch: "<branch name>"
base-branch: "<target branch>"
has-migration: <true|false>
has-config-change: <true|false>
has-docs-changes: <true|false>
docs-generated: [<list of doc paths written or updated>]
ship-plan-readiness: <ok | acknowledged | amended-inline | not-applicable>   # ship-plan pre-check (step 6.7); missing/drift STOP at awaiting-input
ship-plan-amended-blocks: [<letter>, ...]   # amended-inline only — which blocks the scoped inline edit touched
ship-plan-version-before-after: "<N>→<M>"   # amended-inline only
commitlint-status: <pass | warn | fail | skipped>
public-surface-drift: <none | regenerated | drift-without-regen | skipped>
docs-mirror-status: <up-to-date | regenerated | skipped>
pre-push-checks-status: <pass | fixed | fail | timed-out | skipped | not-configured>   # T3.8 local gate
pre-push-fix-rounds: <N>            # local fix rounds; does NOT consume ci-watch.max-fix-rounds
workflow-validation: <ok | findings | skipped>   # setup-* pin + YAML parse check on changed .github/workflows/**
triage-iterations: <N>
triage-fixes-applied: <N>
triage-fixes-skipped: <N>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true | false>
rebase-status: <fast-forward | rebased-clean | conflicts | lease-failure | skipped>
rebase-onto-sha: "<sha of origin/<base-branch> at rebase time>"
ci-watch-conclusion: <green | red | timed-out | skipped>   # terminal state of the final CI watch
ci-watch-rounds: <N>                # total poll iterations across all watches this run
ci-watch-fix-rounds: <N>            # apply-fix → push → re-watch loops run on CI red (all classes)
ci-fix-rounds-by-class:             # where the rounds went; only product-bug consumes max-fix-rounds
  product-bug: <N>
  flaky-or-infra: <N>
  non-convergent: <N>               # diagnosis returned converges: no — never spend a patch round here
  preexisting-unrelated: <N>
bot-reviews-landed: [<login>, ...]  # review-bots that posted within the settle window
bot-review-status:                  # per configured bot — a declined bot is a caveat, never a settled review
  <login>: <landed | declined: <reason> | absent>
review-settle-elapsed-seconds: <N>  # seconds spent in the bot-review settle window
live-review-decision: <APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null>
live-checks-failing: [<check-name>, ...]
live-checks-pending: [<check-name>, ...]
readiness-verdict: <ready | blocked | awaiting-input>

tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  implements: [05-implement-<slug-1>.md, 05-implement-<slug-2>.md, ...]
  reviews: [07-review-<slug-1>.md, 07-review-<slug-2>.md, ...]   # per-slice mode: one per slice; slug-wide mode: [07-review.md]
next-command: wf-ship
next-invocation: "/wf ship <slug>"
---
```

Body sections, in order. `## The Handoff` comes first: three beats per `_story-arc.md`, language per `_ste-procedural.md` sections 1 and 3, 1–3 short paragraphs.
- `## PR Title Options` (numbered), `## Summary`, `## Problem`, `## Solution`.
- `## Augmentations Applied` (only if `augmentations:` is non-empty): every augmentation in user-facing language, grouped as **Design improvements**, **Observability**, **Experimentation**, **Performance**, each with the user-visible effect and the verification evidence path. Do not cite workflow artifact paths or sub-command names.
- `## Affected Areas`, `## Verification Evidence`, `## Manual Test Notes`, `## Migration / Config / Rollout Notes`, `## Risks / Caveats`, `## Documentation Changes` (per doc: **Type** reference / how-to / tutorial / explanation / readme, **Path**, **What it covers**; or "None — [reason from shape docs plan]"), `## Follow-Up Work`, `## Reviewer Focus Areas`.
- `## PR Readiness Block`: the T3.5–T5.3 outcomes, one bullet each with a one-line note — **Commitlint**, **Public-surface drift**, **Doc-mirror**, **Local pre-push gate** (checks run, local rounds, what auto-detect skipped and why), **Workflow validation** (name any unresolvable `actions/setup-*` pin), **Rebase onto base** (cite `rebase-onto-sha` if rebased), **CI watch** (rounds polled, fix loops), **Bot reviews landed** (settled in N s of the M min window), **Bot reviews declined** (with reasons), **Live review decision**, **Live checks failing**, **Live checks pending**, **Readiness verdict** with reason.
- `## Reviewer Comments Triaged` (populated by T5.1; empty when `branch-strategy: none` or no PR exists): a table `| Source | File:Line | Severity | Summary | Action |` where `Action` is `fixed (sha=<short-sha>)`, `applied (sha=<short-sha>)`, `deferred`, `declined`, or `noted`. Cite commit SHAs only.
- `## Freshness Research` (Source / Why it matters / Takeaway per entry), `## Recommended Next Stage` (every viable option with its reason).

Author free narrative fragments for any beat the structured page cannot tell, per [_fragment-authoring.md](_fragment-authoring.md) Step F2 (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Additive-write contract
`08-handoff.md` is revisable. On re-invocation, follow [_additive-write.md](_additive-write.md):
- **No-op guard (fingerprint).** Recompute `handoff-fingerprint` (step 6). If it matches the stored value, skip the slug entirely: no snapshot, no ledger entry, no rewrite.
- **Snapshot** the pre-run file to `.ai/workflows/<slug>/history/08-handoff-<rev>.md`, then **rewrite the body to current truth**; do not stack `## Revision N` sections. PR-comment tooling can quote `<slug>/handoff/history/<rev>/INDEX.html`.
- **Ledger entry** (`revisions:`): `trigger` is `review-feedback`, `ci-fix`, `new-slug-joined`, `scope-change`, or `resume`; `because:` and `changed:` name the prompt and the effect. Update `handoff-fingerprint`.
- The body is the current document, so re-posting the PR description via `gh pr edit` is a straight copy; in batch mode the PR body is the union across packaged slugs, regenerated whole each run. The readiness block is overwritten wholesale on every re-run, never revisioned, and in batch mode present only on the lead.
