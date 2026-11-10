---
description: The PR phase of ship. Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates all complete slices of a slug by default; a `pr#N` or branch-name first argument aggregates every slug that shares that branch (batch mode) and reports which slugs are handoff-ready.
argument-hint: <slug|pr#N|branch>
---

You are running the PR phase of `/wf ship`, the first part of stage 8 of 9: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship (`PR` → gate → release) → 9·retro.

This phase packages the work, opens the PR, watches CI and decides readiness; it writes `08-handoff.md` for each slug. Ship runs it first ([ship.md](ship.md) Step 0), and on `pr-readiness-verdict: ready` goes on to its go/no-go gate in the same run. `/wf handoff <slug>` is an alias of `/wf ship <slug>` that stays for this release only. Apply [_workflow-rules.md](_workflow-rules.md). `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `08-handoff.md` per slug, covering all complete slices. In batch mode: one per slug on the branch, plus a single shared PR and the branch-level readiness keys on the lead slug. |
| Config | The optional `00-index.md` keys (`public-surface`, `docs-mirror`, `review-bots`, `ci-watch`, `review-settle`, `pre-push-checks`) are documented in [_handoff-config.md](handoff/_handoff-config.md). |

## Card

- Write the handoff package for a reviewer, push the branch and open the PR. Do not merge or deploy: ship does that after its go/no-go gate.
- Decide readiness only after CI reaches a terminal state and the bot reviews get their settle window. A `pending` snapshot is not a result. Do not hand CI to the host's PR monitor.
- Do not change code. Send a red CI check or a review thread that needs a code change to a diagnosis or fix sub-agent, per the fix-subagent contract of [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md). A fix for red CI needs the person's approval. Only the compact result of the sub-agent comes back to you.
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
| `_source-modes.md` | procedure | always | |
| `08-handoff.md` | writes | | |

Change-mode and single-scope workflows use the un-suffixed names (`05-implement.md`, `06-verify.md`, `07-review.md`), and their roster is the one slice `<slug>`.

The modes of this table: `batch` when Step 0 resolves `scope: branch`; `small` when the index has `workflow-type: small`; `repo-hooks` when the repo root has a commitlint config (`.commitlintrc*`, `commitlint.config.{js,cjs}`), or the index has `public-surface:` or `docs-mirror:`.

# Step 0 — Orient

Do these before every other step.

1. **Resolve the first argument** (a slug, `pr#N`, a branch name, or none) with `<wf> target "<root>" <arg> --json`. A slug wins over a branch.
   - `scope: slug`: a single-slug handoff, `handoff-scope: slug`.
   - `scope: branch`: a batch handoff, `handoff-scope: branch`.
   - `ambiguous: true`: ask the person which of its `slugs`.
   - `error`: stop and show it.

   When the output for a single slug lists `siblings` (other slugs on its branch), warn the person: a single-slug verdict on a shared branch goes stale when a sibling moves the branch. Recommend `/wf ship pr#N` or the branch name. Go on only when the person confirms.
2. **Build the roster.** The roster is the `slugs` of the `target` output: `[<slug>]` for a single slug, and for a batch every slug whose `branch` is the resolved branch. Record it as `branch-slugs:`.
3. **Read the index of each roster slug** with `<wf> record get "<root>" <slug> index`: `current-stage`, `status`, `selected-slice`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, and any `handoff-lead:`. The review scope follows `reviewScopeOf` in `lib/lifecycle-done.mjs`: the `review-scope` key wins; with no key, the scope is `per-slice` only when `07-review-<slice>.md` records exist and `07-review.md` does not, else `slug-wide`.

   Check `branch-strategy: none` against what this run packages. `none` (the handoff document is the deliverable: no push, no PR) holds only while the range touches nothing but docs and `.ai/` bookkeeping. When the slices touched repo code, ask one gate question per [_gate-question.md](_gate-question.md): "the index says `branch-strategy: none`, but this handoff packages repo code (<n> non-doc files) — deliver doc-only as recorded, or switch to `dedicated` (push + PR)?" Record the answer with `<wf> record set "<root>" <slug> index branch-strategy=<value>` per [_records.md](_records.md), so the same range does not ask again.
3a. **Batch only: elect the lead slug** per [handoff/_batch.md](handoff/_batch.md). A single slug is its own lead.
3b. **A small-path slug** (`workflow-type: small`): run the steps of [handoff/_small.md](handoff/_small.md) before item 4.
4. **Resolve the scope of each slug.** Apply the row of `workflow-type` in [_source-modes.md](_source-modes.md) for the record names. With no `03-slice.md`, the roster is one entry, `selected-slice` (else the slug), and the records are un-suffixed (`05-implement.md`, `06-verify.md`, `07-review.md`). Otherwise read `03-slice.md` with `<wf> record get "<root>" <slug> 03-slice.md`, and collect every slice with `status: complete` or `status: in-progress`.

   Reconcile a stale roster before you conclude that a slug has no implemented slice: a `defined` slice may have been built, and the fault is then a stage's bookkeeping, not the person's. Check each `defined` entry with `record get`:
   - `05-implement-<slice>.md` exists and `06-verify-<slice>.md` has `result: pass`: set the entry to `complete`.
   - `05-implement-<slice>.md` exists and verify does not pass yet: set the entry to `in-progress`.

   To change an entry, get `03-slice.md`, change it, write the draft and put it. Include the slice in scope, and warn, naming the stage that should have set the status: "slice `<x>`'s roster status was `defined` despite a passing verify — reconciled here; `/wf verify` should have promoted it". Do not skip the slug silently, and do not fix it silently.

   A slug with no implemented slice after this is not handoff-ready: record "no implemented slices" in the roster report and do not package it. The batch goes on.
5. **Check the prerequisites of each roster slug.** `<wf> record list "<root>" <slug>` shows which records exist; `record get` reads one. A slug that fails a check is `not-ready`, with the reason, and is not packaged. In single-slug mode that stops the run; in batch mode, report the slug in the roster and go on with the ready slugs.

   | Check | Runs when | The slug is not-ready when | Tell the person |
   |---|---|---|---|
   | Implement | always | the implement record of a slice in scope is missing: `05-implement-<slice-slug>.md`, or `05-implement.md` in an un-suffixed mode | "Run `/wf implement <slug> <slice>` for missing slices." |
   | Intent risk | always | `intent-risks` of the index (absent is empty) has an entry with `status: open` | "An unadjudicated intent-risk means shape never resolved a load-bearing ambiguity — run `/wf intake <slug> shape` to adjudicate it (shape Step 9a: `adjudicated` or `carried`)." |
   | Per-slice review | the review scope is `per-slice` | `07-review-<slice-slug>.md` is missing for a slice in scope, or it has `verdict: dont-ship` or `metric-findings-blocker` (open blockers only) above 0 | Missing: "Run `/wf review <slug> <slice>` for each slice." Failing: name the slices; the fix is `/wf implement <slug> <slice> reviews`. |
   | Slug-wide review | the review scope is `slug-wide` | `07-review.md` is missing, or it has `verdict: dont-ship` or `metric-findings-blocker` above 0 | Missing: "Run `/wf review <slug>` first." |

   This phase never adjudicates an intent risk. A `carried` risk is legal: show it in the PR body and in `## Reviewer Focus Areas`. When a slug already has a ship run (`09-ship-run-*.md`), warn before you overwrite its package.
6. **Fingerprint guard and roster report.** For each ready slug, compute `handoff-fingerprint`: a stable digest of the packaged commit range (`git merge-base HEAD origin/<base-branch>`..`HEAD`, limited to the slug's slices where you can tell), the slices in scope with their statuses, and the `verdict` of each review in scope. Compare it with the value in the slug's `08-handoff.md` (`<wf> record get "<root>" <slug> 08-handoff.md`). The guard skips only the packaging:

   | Fingerprint | Stored `readiness-verdict` | Action |
   |---|---|---|
   | matches | `ready` or `not-applicable` | `skip-unchanged`: no snapshot, no ledger entry, no rewrite, per [_additive-write.md](_additive-write.md). |
   | matches | any other (the run stopped on a CI timeout, red CI or a pending review) | `re-check`: skip the packaging (T1–T5: no new summary, docs, push or PR body). Run T5.0–T5.3 (steps 7a–7d) again, and rewrite the readiness keys (step 10). |
   | differs, or none is stored | | `package`: package this slug in this run. |

   Then print the roster report, before any packaging:

   | Slug | Stage | Review verdict | Open blockers | Fingerprint | Action |
   |---|---|---|---|---|---|
   | `<slug>` | implement/review/handoff | ship / dont-ship | N | fresh / changed / new | package / re-check / skip-unchanged / not-ready: <reason> |

   Only a `package` row is packaged. A `re-check` row runs only steps 7a–7d and 8–10.
6.7. **Ship-plan readiness (gate).** Load [_ship-plan-readiness.md](_ship-plan-readiness.md) and follow it in full, with caller `handoff` and the commit range `git merge-base HEAD origin/<base-branch>`..`HEAD`. This is the one plan gate of a ship run: ship Step 0.4 runs only Step R0, with no no-plan gap, so a repo with no plan reaches the missing-plan gate here, where the person can answer *Shipping is external*. Run Step R0 with `--allow-no-plan`, and skip R0 when ship Step 0.4 ran it in this run.
   - A missing plan, or drift that the person did not acknowledge, stops the run before packaging and routes to `/wf project ship-plan init` or `/wf project ship-plan edit` through `recommended-next-*` of the index. Write no partial `08-handoff.md`, but do write `resume-orientation` (Step R3.5 of the pre-check).
   - `ok`, `acknowledged`, `amended-inline` and `not-applicable` go on to packaging and the PR. With `not-applicable`, ship stops after the PR is ready (ship Step 0.6).
   - Stamp the returned `ship-plan-readiness` into the frontmatter of `08-handoff.md`. In batch mode the lead owns the one check.
   - Skip this item only when an earlier run in this session resolved it to `ok` or `not-applicable` and nothing in the change surface of Group 2 moved since.
7. **Use the verify inputs** of each packaged slug. From each `06-verify-<slice-slug>.md`, put these in `## Reviewer Focus Areas`:

   | Field | Write |
   |---|---|
   | `stability-check-flaky-count` above 0 | "N criteria showed intermittent behaviour during verification — may indicate race conditions" |
   | `adversarial-tests-failed` above 0 | the failures listed in `## Adversarial Tests` |
   | `cross-browser-delta: findings` | the list in `## Cross-Browser Delta` |
   | `web-vitals-inp-ms` above 200 | "interaction responsiveness measured above threshold" |
   | a non-empty `## Friction Notes` or `## Free Exploration Notes` | the notes, under a "Soft Observations" subsection |
8. **Use the augmentation inputs.** Use `02b-design.md` and `02c-craft.md` for the design modes, the anti-goals and the visual contract; each item of the mock fidelity inventory of `02c-craft.md` is a user-visible change that the PR description shows. Each entry of `augmentations:` in the index appears in `## Augmentations Applied`, `## Reviewer Focus Areas`, or both, in these words:

   | Type | Words |
   |---|---|
   | `design-harden` | "Accessibility improvements applied — N components updated, axe-core scan clean" |
   | `design-optimize` | "Performance improvements — measured Xms reduction in [metric]" |
   | `design-adapt` | "Improved mobile/tablet/dark-mode behavior" |
   | another `design-*` | "Visual refresh of [surface area]" or "Design quality review pass — N findings addressed" |
   | `instrument` | "Added observability — N signals for previously unobserved code paths" |
   | `experiment` | "Wrapped behind feature flag with cohort split for measured rollout" |
   | `benchmark` | "Performance baseline taken; verify-stage comparison: <within tripwires / regression>" |

   Do not cite workflow artifact paths or sub-command names in an external field. One exception: when git tracks `.ai/design/`, the PR body may show each board and capture pair as images ([design/_surface.md](design/_surface.md)).
9. **Carry forward** `open-questions` from the index (in batch mode, the union across the roster).

# Chat return contract

When ship continues past this phase, this receipt opens ship's chat return: do not end the turn here. Apply the early-stop guard of [_autonomy-guards.md](_autonomy-guards.md) before you end the turn. After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (section *The narrative* of that file), then give this receipt:
- `scope: <slug|branch>`, `slug: <slug>` (the lead in batch mode) and, in batch mode, the roster report (one row per slug: package / skip-unchanged / not-ready)
- `wrote: <path>` (one line per packaged slug)
- `pr: <url>` and `pr-readiness-verdict: <ready|awaiting-input|blocked>`
- `options:` (every viable next option, per Adaptive routing)
- up to 3 short blocker bullets, when there are blockers

# Procedure

A single-slug scope runs these steps as written. A branch scope splits them into two layers, per [handoff/_batch.md](handoff/_batch.md). Run the steps in order.

1. **Read the branch strategy** from the index: `branch-strategy`, `branch`, `base-branch`, and the optional keys of [_handoff-config.md](handoff/_handoff-config.md). An absent key skips its step silently.
2. **Track the handoff sequence**, one progress step per label. Record a step with nothing to run as skipped, with its reason, not as done. The progress surface is a host concern ([_host-invocation.md](_host-invocation.md)).

   | Label | T1 | T2 | T3 | T3.5–T3.7 | T3.8 | T4, T5 | T5.0 | T5.1 | T5.2 | T5.3 | T6 |
   |---|---|---|---|---|---|---|---|---|---|---|---|
   | Step | 3 | 4 | 5 | 5b | 5e | 7 | 7a | 7b | 7c | 7d | 10 |

   T4 (the push) runs only after T3.8 (the local pre-push gate) passes. T5.1 (the triage) waits for T5.0 (the CI watch).
3. **Read the Requires inputs** (T1).
4. **Summarize** the problem, solution, affected areas, verification evidence, risks and follow-ups for a reviewer (T2).
5. **Write the Diátaxis docs (T3).** Read `## Documentation Plan` of `02-shape.md`, and its `docs-needed` and `docs-types`.
   - `docs-needed: true`: for each doc type, load the diataxis primitive and follow it in full: `reference` → [reference.md](../../diataxis/references/reference.md), `how-to` → [how-to.md](../../diataxis/references/how-to.md), `tutorial` → [tutorial.md](../../diataxis/references/tutorial.md), `explanation` → [explanation.md](../../diataxis/references/explanation.md), `readme` or `readme-update` → [readme.md](../../diataxis/references/readme.md). Write from the handoff summary, the shape and the verification artifacts. Do not mix types. Write each doc where the docs plan says, else under `docs/` or into the existing file. List the paths in `## Documentation Changes`.
   - `docs-needed: false`: skip T3, and write "No documentation changes".
5b. **T3.5–T3.7: the repo hooks.** In the mode `repo-hooks`, run the steps of [handoff/_repo-hooks.md](handoff/_repo-hooks.md): commitlint, public-surface drift and doc-mirror regen. Otherwise record `commitlint-status: skipped`, `public-surface-drift: skipped` and `docs-mirror-status: skipped`.
5e. **T3.8: the local pre-push gate.** When `branch-strategy` is `none`, skip this step and record `pre-push-checks-status: skipped`.

   a. **Resolve the check list.**
      - `pre-push-checks:` is present: use its `checks:` unchanged. An empty `checks: []` is a recorded decline: record `pre-push-checks-status: not-configured` and go on.
      - `pre-push-checks:` is absent: detect the checks, then propose them once. From the PR-gate workflows under `.github/workflows/`, take the `run:` steps of the jobs that are a required check per Block J of the ship plan, or are named `format`, `lint`, `test` or `build`. Leave out a step that references `secrets.`, a service container, an emulator or a device, or a matrix `runs-on` that this host is not. Ask one gate question per [_gate-question.md](_gate-question.md) that shows the derived list and each step left out with its reason ("Run these <N> checks locally before pushing? They are this repo's own PR gates"). The options: *Run them and remember (Recommended)*, which saves the list to `pre-push-checks` of `00-index.md`; *Run once, don't persist*; and *Skip the gate*, which records `pre-push-checks: { checks: [], declined-reason }` so the question is not asked again. To save the list or the decline, get the index, change `pre-push-checks`, write the draft and put it. Record each step left out, with the reason, in the question and in `pre-push-checks-skipped`. Detecting nothing runnable is valid: record `not-configured` and go on. Do not invent commands.
   b. **Run each check** in list order, each bounded by `timeout-minutes` (default 15). Capture the exit status and the tail of a failing output. A check past its bound is `timed-out` and does not block.
   c. **On a blocking failure**, take the diagnose, ask and fix path of `## Fix-subagent contract` in [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md). Follow `on-fail`: `diagnose` (the default) takes that path; `stop` records the failure, sets `readiness-verdict: awaiting-input`, and stops before the push. A local fix round does not use up `ci-watch.max-fix-rounds`; count it in `pre-push-fix-rounds`.
   d. **Do not push while a blocking failure is unresolved.** Record a failure of a check with `blocking: false` in `## Reviewer Focus Areas`, and push.
   e. **Validate the workflow files** when the packaged diff touches `.github/workflows/**`. Parse each changed file as YAML; a syntax error is a blocking failure. Check that each `actions/setup-*` version resolves against its manifest (`setup-java`: the Adoptium manifest; `setup-node`, `setup-python`: theirs). Record `workflow-validation: <ok | findings | skipped>`.
   f. Record `pre-push-checks-status: <pass | fixed | fail | timed-out | skipped | not-configured>` and `pre-push-fix-rounds: <N>`.
6. **Freshness pass.** When the release depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. **Push, and create or update the PR.** Run this step when `branch-strategy` is `dedicated`.
   - **T4, push.** Check that you are on the workflow branch (`branch`); if not, run `git checkout <branch>`. Push with `git push -u origin <branch>`.
   - **T5, the PR.** Check whether a PR exists, so the step is safe to run again: `gh pr list --head <branch> --json number,url,state --limit 1`.

     | Found | Do |
     |---|---|
     | No PR | `gh pr create`, with the best title from the summary, the summary as the body, and the base `<base-branch>`. The body has the sections Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work and Reviewer Focus Areas. A batch makes the body per [handoff/_batch.md](handoff/_batch.md). Do not merge. |
     | An open PR | Refresh the body with `gh pr edit <pr-number> --body-file <tmp-file>`, and keep the title unless it no longer fits the work. Then read `gh pr view <pr-number> --json isDraft`: a campaign opens the PR of its list as a draft with a placeholder title and body, and a draft cannot merge. When `isDraft` is `true`, write the real title too (`gh pr edit <pr-number> --title "<the best title from the summary>" --body-file <tmp-file>`), then run `gh pr ready <pr-number>`, before the CI watch of step 7a. |
     | A closed or merged PR (`state` is `CLOSED` or `MERGED`) | Stop. Ask the person whether to reopen it (`gh pr reopen <pr-number>`), to open a new one (run `<wf> record set "<root>" <slug> index pr-number=null`, then run this phase again), or to treat the workflow as shipped (route to `/wf retro <slug>`). |

   - **The PR template.** When `.github/PULL_REQUEST_TEMPLATE.md` exists, tick only the checkboxes that the artifacts justify: "Tests pass" when `06-verify-*.md` is green, "Docs updated" when `docs-generated:` is not empty. Record the PR with `<wf> record set "<root>" <slug> index pr-url=<url> pr-number=<N>`.

   The other branch strategies:

   | `branch-strategy` | Do |
   |---|---|
   | `shared` | In single-slug scope, push but do not create a PR. Skip T5, T5.1 and T5.2, because a shared branch takes no force-push. T5.0 and T5.3 still run when a `pr-number` is recorded. A batch scope on a shared branch follows [handoff/_batch.md](handoff/_batch.md). |
   | `none` | Skip T4 through T5.3. The handoff document is the deliverable. |
7a. **T5.0: watch CI to green, then settle the reviews.** Skip this step when `branch-strategy` is neither `dedicated` nor `shared`, or no `pr-number` is recorded. Otherwise read [_pr-ci-handoff.md](handoff/_pr-ci-handoff.md) in full now: it holds the `## CI watch procedure` and the `## Fix-subagent contract` that steps 7a–7d run. Read the wait settings (`ci-watch:`, `review-settle:`; the defaults are in [_handoff-config.md](handoff/_handoff-config.md)). Then run the CI watch procedure on `pr-number`:

   | Outcome | Do |
   |---|---|
   | green (every check `SUCCESS`, `NEUTRAL` or `SKIPPED`) | Record `ci-watch-conclusion: green`. Settle the reviews per `## Settle reviews` in [_ci-red-routing.md](handoff/_ci-red-routing.md): bots only, bounded. Record `bot-reviews-landed`, `bot-review-status` and `review-settle-elapsed-seconds`. |
   | timed-out (checks still pending when the wait bound ran out) | Record `ci-watch-conclusion: timed-out`, set `readiness-verdict: awaiting-input`, list the pending checks in `live-checks-pending`, and stop: write the artifact through steps 8–10. `/wf ship <slug>` resumes: with the range unchanged, the fingerprint guard marks the slug `re-check`, and the watch runs again. |
   | red (one or more checks failed for good) | Apply [_ci-red-routing.md](handoff/_ci-red-routing.md): a diagnose-only sub-agent, routing by class and `converges`, one gate question, then a fix, a structural fix, a re-run or a stop. It records `ci-watch-fix-rounds` and `ci-fix-rounds-by-class:`. `ci-watch.max-fix-rounds` bounds the product-bug rounds only. |
7b. **T5.1: the PR comment triage loop.** Run the loop of [handoff/_pr-triage.md](handoff/_pr-triage.md). Record `triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids` and `has-deferred-comments`. Skip this step when step 7 skips T5.1, or no `pr-number` is recorded.
7c. **T5.2: rebase onto the base.** Run this step only when `branch-strategy` is `dedicated`. Run `git fetch origin <base-branch>`. When `git merge-base --is-ancestor origin/<base-branch> HEAD` exits 0, record `rebase-status: fast-forward` and `rebase-onto-sha: <git rev-parse origin/<base-branch>>`, and go to step 7d. Otherwise run `git rebase origin/<base-branch>`:
   - **Conflicts:** record `rebase-status: conflicts` and run `git rebase --abort`. Stop: print the conflicting files, recommend `/wf implement <slug> <slice>`, set `readiness-verdict: blocked`, and go to step 9. T5.3 stays pending.
   - **Clean:** run `git push --force-with-lease origin <branch>`. When the lease fails (the branch moved during the T5.1 triage), fetch again and retry once. When the second push also fails, record `rebase-status: lease-failure`, stop, and recommend running this phase again. Otherwise record `rebase-status: rebased-clean` and `rebase-onto-sha`.
7d. **T5.3: the final readiness re-watch.** Run this step only when a `pr-number` is recorded. The triage fixes (step 7b) and the force-push of the rebase (step 7c) start CI again, so do not reuse the T5.0 result.
   a. **Watch CI again** with the `## CI watch procedure`.
      - timed-out: set `readiness-verdict: awaiting-input`, record the pending checks in `live-checks-pending`, and stop: write the artifact through steps 8–10. Running this phase again resumes the watch.
      - red: run [_ci-red-routing.md](handoff/_ci-red-routing.md) once. When the failure stays (the person declines, or the bound is reached), set `readiness-verdict: blocked` and write the artifact.
      - green: go on.
   b. **Capture the review snapshot** with `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus`: GitHub's own merge gate, which the verdict reads. Record `live-review-decision`, `live-checks-failing` and `live-checks-pending` (the `name` of each failed and each pending check of `.statusCheckRollup[]`), `live-merge-state` and `live-mergeable`; the template under Artifacts lists their values. Then run the unresolved-threads query of T5.1 once more. Reply to and resolve each thread of `triage-fixed-threads` that is still open (step 7 of [handoff/_pr-triage.md](handoff/_pr-triage.md)). A thread that is still open in fact keeps the verdict out of `ready`. Do not resolve a thread only to clear the merge state.
   c. **Compute the `readiness-verdict` of each slug.** It is a property of the PR: it lives on the lead's artifact, and each follower copies it.

      | Verdict | When |
      |---|---|
      | `ready` | `live-review-decision` is `APPROVED`, or null when no reviewer is required; `live-checks-failing` is empty; `live-merge-state` is `CLEAN` or `UNSTABLE`; `live-mergeable` is not `CONFLICTING`; `commitlint-status` is not `fail`; `pre-push-checks-status` is not `fail`; `public-surface-drift` is not `drift-without-regen`; `rebase-status` is `fast-forward`, `rebased-clean` or `skipped`; `has-deferred-comments` is false. `UNSTABLE` means that only checks that are not required fail: record their names in `live-checks-failing-nonrequired`, so ship sees them. |
      | `awaiting-input` | Checks are still pending, deferred comments exist, a required human reviewer has not answered (`REVIEW_REQUIRED`), or `live-merge-state` is `BLOCKED` after the thread re-check. Record the cause in `readiness-reason`. This phase records the missing approval and returns control. |
      | `blocked` | A hard failure of the `ready` criteria: checks still fail after the re-watch, `CHANGES_REQUESTED`, `live-mergeable: CONFLICTING`, drift without regen, rebase conflicts, or deferred 🔴 blockers. |
   c2. **Compute `pr-readiness-verdict`**, the verdict of the branch that ship gates on: the logical AND over the roster, `ready` only when the PR's `readiness-verdict` is `ready` and every slug on the branch is ready to package. When a roster slug is `not-ready`, it is `awaiting-input`, or `blocked` when that slug's review is `dont-ship`. In single-slug scope on a branch that no other slug shares, `pr-readiness-verdict` equals `readiness-verdict`. Write `pr-readiness-verdict` and `handoff-lead` onto the lead's `08-handoff.md`. Each follower sets `readiness-via: <lead>/08-handoff.md` and copies `pr-readiness-verdict`.
7e. **No PR.** With no `pr-number` (`branch-strategy: none`, or `shared` with no PR), steps 7a–7d do not run. Write `readiness-verdict: not-applicable`, `pr-readiness-verdict: not-applicable` and `readiness-reason: "no PR; the handoff document is the deliverable"`.
8. **Evaluate the adaptive routing** (below), and write every viable option into the `recommended-routes` frontmatter.
9. **Update the index of each roster slug** in one call: `<wf> record set "<root>" <slug> index current-stage=ship progress.ship=in-progress next-command=<command> next-invocation=<invocation>`, plus `handoff-lead=<lead>` in batch mode. A follower also sets `readiness-via=<lead>/08-handoff.md`. An older index can still hold a `progress.handoff` key: set `progress.handoff=complete` when the verdict is `ready`. Do not add the key to an index that has none.
10. **Write `08-handoff.md` (T6)** for each packaged slug: write the draft `<wf-dir>/.draft/08-handoff.md` (additive write, ledger entry and `handoff-fingerprint`), then run `<wf> record put "<root>" <slug>`. The lead's artifact carries the readiness keys and `pr-readiness-verdict`; a follower's carries `readiness-via` and the copied `pr-readiness-verdict`. Do not write a `skip-unchanged` or a `not-ready` slug. A `re-check` slug rewrites only its readiness keys and the T5.0–T5.3 keys, with `<wf> record set "<root>" <slug> 08-handoff.md <key>=<value> ...`: no snapshot and no ledger entry.

# Adaptive routing

Offer every option that applies:
- **Option A (default): continue to the gate in this run.** When `pr-readiness-verdict` is `ready` and the PR is open, return to [ship.md](ship.md) Step 0 and go on to the go/no-go gate. A later `/wf ship <slug>` (or `/wf ship pr#N` for a batch) resumes at that gate.
- **Option B: skip to retro**, `/wf retro <slug>`, when the work ships entirely outside this workflow and the handoff document is the final deliverable.
- **Option C: package the remaining slugs or slices first.** Run `/wf ship pr#N` again, or `/wf plan|implement <slug> <next-slice>`. Use it when the roster shows `not-ready` slugs, or when `03-slice.md` shows slices still at `status: defined` that have no implement or verify record on disk. A `defined` entry with a passing verify is a bookkeeping fault that Step 0 item 4 already reconciled. Do not ship until `pr-readiness-verdict` is `ready`.
- **Option D: fix**, `/wf implement <slug> <selected-slice>`. Use it when writing the handoff showed that a slice is wrong or incomplete.

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
pr-readiness-verdict: <ready | blocked | awaiting-input | not-applicable>
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
readiness-verdict: <ready | blocked | awaiting-input | not-applicable>
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

The outcomes of T3.5–T5.3 live only in the frontmatter keys. The body sections, in order:
- `## PR Title Options` (numbered), `## Summary`, `## Problem`, `## Solution`.
- `## Augmentations Applied`, only when `augmentations:` is not empty: every augmentation in the user's words, grouped as Design improvements, Observability, Experimentation and Performance, each with the effect that a user sees and the path of its verification evidence. Do not cite workflow artifact paths or sub-command names.
- `## Affected Areas`, `## Verification Evidence`, `## Manual Test Notes`, `## Migration / Config / Rollout Notes`, `## Risks / Caveats`, `## Documentation Changes` (for each doc: its Type, one of reference, how-to, tutorial, explanation or readme; its Path; and What it covers; or "None — [reason from shape docs plan]"), `## Follow-Up Work`, `## Reviewer Focus Areas` (name here any `actions/setup-*` pin that does not resolve).
- `## Reviewer Comments Triaged`, which T5.1 fills; it is empty when `branch-strategy` is `none` or no PR exists. A table `| Source | File:Line | Severity | Summary | Action |`, where `Action` is `fixed (sha=<short-sha>)`, `applied (sha=<short-sha>)`, `deferred`, `declined` or `noted`. Cite commit SHAs only.
- `## Freshness Research`: Source, Why it matters and Takeaway for each entry.

# Additive-write contract

`08-handoff.md` can be revised. When this phase runs again, follow [_additive-write.md](_additive-write.md):
- **The fingerprint guard.** Recompute `handoff-fingerprint`, and apply the guard of Step 0 item 6.
- **Snapshot** the `record get` output of the `08-handoff.md` from before this run to `<wf-dir>/history/08-handoff-<rev>.md`, then rewrite the body to the current truth.
- **Ledger entry** (`revisions:`): `trigger` is `review-feedback`, `ci-fix`, `new-slug-joined`, `scope-change` or `resume`; `because:` and `changed:` name the prompt and the effect. Update `handoff-fingerprint`.
- The body is the current document, so posting the PR description again with `gh pr edit` is a straight copy.
- The readiness keys are overwritten on every run and never revised in the ledger.
