# Review stage body (slug mode — loaded by `review.md` Step 00)

This file is the **workflow-stage** half of `/wf review`. `review.md` resolved the first token to an existing slug and instructed you to read this file — follow it exactly. Ad-hoc review (dimension / sweep, no slug) never loads this file.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·ship → 9·retro

| | Detail |
|---|---|
| Requires | See [review.md ## Requires](../review.md#requires). |
| Produces (slug-wide mode, the default) | `07-review.md`, one review file for the work packet, written whole on every run from the findings ledger `findings.yaml` ([_findings-ledger.md](../_findings-ledger.md)). The ledger keeps the history: a re-run merges into the ledger, never into the file. |
| Produces (per-slice mode) | `07-review-<slice-slug>.md`, written whole from the entries of that slice in `findings.yaml`. A run on one slice never changes the entries of another slice. |
| Next | `/wf ship <slug>` (when no BLOCKER finding is `could-not-fix` and all slices are complete). When a BLOCKER is `could-not-fix`: re-invoke `/wf review <slug> [<slice>]` after the person removes the cause, or escalate to `/wf implement <slug> [<slice>] reviews` as a manual escape. Also: `/wf plan <slug> <next-slice>` (if more slices remain). A finding never becomes a new slice. |

# Role
You are a **review dispatch orchestrator that owns the findings ledger of the work packet and its own triage→fix loop**.
- Do not run reviews yourself — **select review commands and dispatch scouts**. Each scout runs one command independently and returns its findings. A refuter tries to refute every finding before it enters the ledger. `wf.mjs findings add` merges the survivors and the refuted findings into `findings.yaml` by the merge law of [_findings-ledger.md](../_findings-ledger.md); the law is in code, so never apply it by hand and never restate it.
- The review asks the person nothing about a finding, and a finding never becomes a new slice or a route back to plan or implement. At Step 4b, every finding is fixed or dismissed. At Step 4c, YOU fix the findings, one after another, in your own session: one fix step and one commit for each finding. Dispatch no fix sub-agent. Do not fix code while the scouts or the refuters run. Do not ship — that is a later stage.
- Your job: **orient → gather change stats → select commands → dispatch scouts → refute every finding → merge into the ledger → triage → fix each finding as one step → stop → write the review file whole**. Order matters only where the ledger does: refute before the merge, merge before triage, triage before the fix steps, outcomes recorded before the review file. Reading and dispatch may interleave freely.

# Triage mode

When the second argument is `triage` (for example `/wf review my-feature triage`), read [_triage.md](_triage.md) and follow it instead of this file.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug given, infer from `.ai/workflows/INDEX.md`. If ambiguous, ask. Resolve the second argument, if present, in this order:
   - a slice of the roster → the **slice selector** (per-slice mode only; ignored in slug-wide mode);
   - a rubric or alias key from [_ad-hoc.md](_ad-hoc.md) → the **user focus override** of Step 2, in either review scope.
2. **Read `00-index.md`** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` ([_records.md](../_records.md)). Parse its frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`** from `00-index.md`. Default: `slug-wide`, one review per work packet.
   - `slug-wide` → **skip slice resolution entirely**; no `<slice-slug>` this run; the review file is `07-review.md`. The diff is the cumulative branch diff (`git diff <base-branch>...HEAD`). Findings reflect the code of the work packet on the branch; the verdict is "ship this branch", not "ship this slice".
   - `per-slice` (only when `00-index.md` sets it) → continue with slice resolution below; the review file is `07-review-<slice-slug>.md`, and the ledger commands get `--slice <slice-slug>`.
4. **Resolve the slice-slug** (per-slice mode only; skip if `review-scope: slug-wide`): Use the passed slug; else `selected-slice` from the index; else ask.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`, and apply its row of [_source-modes.md](../_source-modes.md): the lead record, the acceptance source, the record names and the review action. When the action is STOP, give its message and stop.

   In all modes, an implement record (slice or master) must exist. Run `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>` for the names of the records. If missing → STOP: "Run `/wf implement <slug>` first."

   **Per-slice mode** (`review-scope: per-slice`):
   - `06-verify-<slice-slug>.md` (or `06-verify.md`) is recommended but not required.
   - If verify shows `Status: Awaiting input` → STOP.

   **Slug-wide mode** (`review-scope: slug-wide`):
   - At least one `05-implement-<slice-slug>.md` must exist. If `03-slice.md` lists slices with `status: complete` but only some have implement records, WARN: "Slug-wide review covers the entire branch diff. Slices without implement records: <list>. Their code may appear in the diff; their ACs will not be checked."
   - Any `06-verify-*.md` records that `record list` names are read for context but never block.
   - **Adoption-matrix reconciliation (mechanical pass over shape).** If `02-shape.md` carries an adoption matrix (the table of dependencies/libraries with a `USE`/`AVOID`/etc. decision per row), reconcile every `USE` row against the branch diff: each must cite at least one production usage site — a real import/call in shipped code. A `USE` row with zero usage (installed, never wired in) becomes a finding, severity **MED**, titled "committed and abandoned" (installed, zero usage) and routed through the normal ledger. This is a mechanical check, not a judgment call: no production import/call for a `USE` dependency ⇒ finding.
   - **Success-Criteria re-basing (mandatory, slug-wide milestone check).** The slug-wide review must answer the intake's **Success Criteria exactly** — quote each criterion from `01-intake.md`, state its current truth against the branch diff with concrete evidence (`file:line`, a passing test, or an observed run), and **never paraphrase** the criterion. This is the milestone the per-slice reviews structurally cannot judge: a branch can pass every per-slice gate and still miss the intake's headline outcome. Route each unmet or only-partially-met criterion through the normal ledger (via the `intent-fidelity` dimension). Additive: when `03-slice.md` marks a slice as a **visible milestone**, the same exact Success-Criteria check also runs once at that slice's per-slice review.
   - Prior per-slice `07-review-<slice>.md` files are left untouched.
6. **Read the context.** Read every Requires row for the current `review-scope`. Read each record with `record get`.
7. **Apply the augmentation and verify inputs** per *Augmentation and verify inputs* below. Verify values can auto-promote to BLOCKER or HIGH findings.
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm you are on the correct branch. Use `git diff <base-branch>...<branch>` for the full change set.
10. **Find the selection mode.** The run prompt can pass findings that a driver scan already verified. Then a driver agent selected the rubrics: skip Steps 2 and 3, and use those findings at Step 4. Otherwise, you run in mode `select`: do Steps 2 and 3, and list `select` in `modes:` of the stage artifact.

# Augmentation and verify inputs

**Augmentation inputs.** Read the `augmentations:` list in `00-index.md` if present, plus the artifacts each entry references. Read an artifact that is a record with `record get`. Per-type guidance:

| Type | What review must do |
|---|---|
| `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md`. The documented design changes are intentional — do not flag them as unexpected. Validate them: did they achieve their stated goal? |
| `design-audit` | Read `07-design-audit.md`. Treat as already-known findings; merge with new findings during dispatch. |
| `design-critique` | Read `07-design-critique.md`. Same as above. |
| `instrument` | Read `04b-instrument.md`. Review the instrumentation as a first-class deliverable: are signals appropriate, is PII handled, is the framework usage correct? |
| `experiment` | Read `04c-experiment.md`. Review the experiment infrastructure: is the cohort logic correct, are metrics appropriate, is the rollback path safe? |
| `benchmark` | Read `05c-benchmark.md`. Cross-reference with `06-verify` compare-mode results. If verify flagged regressions, surface them as review findings. |

Use `02b-design.md` and `02c-craft.md` for the design mode of each surface, anti-goals and visual contract. Check that the change honors the `02c-craft.md` anti-goals. When the change touches UI, the Verify and Refuse lists of `design/_craft-floor.md` are the checklist of the design-audit and design-critique dimensions. When `02c-craft.md` names `boards:`, compare each board PNG with its capture in the verify `## Design Comparison` (`design/_boards.md`). When the build goes against a confirmed board, fix the build to match the board at Step 4c; do not redraw the board and do not ask.

**Verify inputs.** Use these values from each `06-verify-*.md` record in scope (`record list` names them):
- `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
- `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
- `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
- `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
- `design-comparison` (frontmatter) — `no-screens` (or `no-boards` on an older record) means no visual check exists; do not count the visual contract as verified.
- Web vitals (frontmatter) — a `web-vitals-inp-ms` value above 200 is a HIGH performance finding. A `web-vitals-lcp-ms` value above 2500, or a `web-vitals-cls` value above 0.1, is a MED performance finding. Verify grades INP HIGH and LCP and CLS WARN (`verify/_artifact.md`, `## Performance Gate`); review has no WARN, so a WARN is MED here.
- `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.

# Workflow rules
Apply [_workflow-rules.md](../_workflow-rules.md). Review-specific: `findings.yaml` is the ledger and only `wf.mjs findings` writes it; the review file is written whole from it.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md). Lead with the narrative per that file (section *The narrative*), then give this receipt:
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `findings: <O open / R resolved-this-run / F fixed-this-run>` — the merged-ledger snapshot, plus a one-line "what the merge did" note: how many net-new findings were added, how many prior findings were re-confirmed, how many a re-run cleared (`resolved`), and how many the fix steps fixed (e.g., "merged 2 new, re-confirmed 3, resolved 1 cleared; fixed 2 of 2 in 2 commits; 0 open").
- `options:` (list all viable next options — see Adaptive routing below)
- ≤3 short blocker bullets if needed (remaining OPEN BLOCKERs only — anything fixed/dismissed/resolved is no longer a blocker)

# Progress tracking

Where the host offers a progress surface ([_host-invocation.md](../_host-invocation.md)), track these items:

- one item per selected review command (independent — they run as parallel sub-agents);
- the five bookkeeping items, in ledger order: refute; merge into the ledger; triage; fix steps (Step 4c; dropped when no finding is to be fixed); write the review file;
- inside Step 4c, one item per fix step (`Fix [{ID}] {SEV}: {title}`).

Mark each item done as its outcome is recorded. A `could-not-fix` item carries `COULD NOT FIX: <reason>`. Tracking never changes the ordering above.

# Step 1: Gather Change Statistics

From the relevant implement record(s), extract files changed and nature of changes. **Diff scope depends on `review-scope`:** per-slice mode diffs the working tree (`git diff --name-only HEAD`, `git diff --stat HEAD`, `git diff HEAD`); slug-wide mode diffs the entire branch since divergence (`git diff --name-only <base-branch>...HEAD`, `git diff --stat <base-branch>...HEAD`, `git diff <base-branch>...HEAD`). Substitute `<base-branch>` from `00-index.md` frontmatter (typically `main` or `master`).

**The work packet files.** List every changed file, and each file that calls, imports or tests code that the diff changes (find them with `git grep` on the changed exports and names). Give each path relative to the project root. The scouts look for issues only in these files, and Step 4 drops a finding in any other file. So the review makes no finding about debt that the change did not cause.

Extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff (SQL queries, auth checks, migrations, React components, Terraform, etc.)

# Step 2: Select Review Commands

**Selection philosophy:** Use shape, slice, and implementation artifacts — not just raw diff patterns — to reason about what the change *is*. A feature that adds async data fetching needs `correctness` (focus backend-concurrency) even if the diff contains no "mutex". Lean toward inclusion: a missed review is worse than a redundant one. The max prevents sprawl, not thorough coverage.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases; its sections also cover testing, data integrity, concurrency, and reliability
- `security` — vulnerabilities, insecure defaults; its sections also cover infrastructure security, supply chain, and privacy
- `architecture` — boundaries, maintainability, overengineering, missed reuse, style consistency, refactor safety
- `performance` — queries, loops over variable-size data, caches, render cost; its sections also cover scalability and cost
- `intent-fidelity` — **always-on for lifecycle slugs** (`workflow-type: feature`, or unset), at BOTH per-slice and slug-wide scope: does the diff advance the intake's product, or a simplified imitation of it? Joins `correctness` in the always-kept set and is **never suppressed by the user-focus override**. Ad-hoc reviews reach it by name (`/wf review intent-fidelity`). (Compressed/change-mode slugs may skip it; it is a lifecycle-slug gate.)
- `correctness` (focus metric-gaming) — **always-on for optimize slugs** (`workflow-type: optimize`): does the kept diff improve the code, or only the number? It is never suppressed by the user-focus override.

### Signal-driven rubrics
Load [_select.md](_select.md) and apply its rules: the backend and frontend always-include sets, the design-work rule (`design-audit` / `design-critique` map to `design/audit.md` / `design/critique.md`), and the signal → rubric table for motion, concurrency, refactors, architecture, data, migrations, privacy, API surface, scale, dependencies, infra, CI, release, logging, observability, cost, docs, style, and developer tooling. Dispatch one reviewer per rubric: a core rubric reads every section; a rubric that only a trigger selected receives `focus:` naming the triggered sections.

### Selection Constraints
- **Minimum**: 4 (`correctness` + `security` + `performance` + `architecture`); for lifecycle slugs (`workflow-type: feature`, or unset) `intent-fidelity` is also always-on (per-slice AND slug-wide), so the floor is 5. Add every other rubric whose signal the change shows.
- **Maximum**: 11 — one reviewer per rubric; a rubric never dispatches twice in one run
- **User focus override**: include the named rubrics (an alias becomes its rubric with `focus: <alias>`) + `correctness` (+ `intent-fidelity` for lifecycle slugs — never suppressed by the focus filter); suppress unrelated rubrics
- **Config/docs-only**: drop `correctness`/`architecture`/`performance`; keep `security`, `docs`, and `infra` (focus ci, release) where relevant
- **Test-only**: keep `correctness` (focus testing) and `architecture`; drop most others; keep `performance` only when the suite time changes
- **When in doubt, include**: a false positive costs one sub-agent; a missed issue costs a production incident

Before dispatching, print the `## Review Scope` + `## Commands Selected` block from [_select.md](_select.md) to chat.

# Step 3: Dispatch Parallel Sub-Agents

For EACH selected command, dispatch ONE sub-agent at **low** effort per [_subagents.md](../_subagents.md). The `architecture` and `security` rubrics use **medium** effort. Set the tier explicitly — a reviewer must not inherit the parent configuration (per [_subagents.md](../_subagents.md), "Effort tiering"). All agents run in parallel, in waves of ≤6 when more dimensions are selected. Synthesis (Step 4 — aggregation, dedup, triage) stays with the coordinator.

**Each scout receives this prompt** (substitute the per-slice or slug-wide variant based on the current `review-scope`; resolve every `<skill-dir>` to an absolute path per [_host-invocation.md](../_host-invocation.md) before dispatch — a child has no citing file to resolve a relative path against): load [_dispatch.md](_dispatch.md) and send its Step 3 prompt unchanged. The prompt carries the pre-existing determination, the acceptance-check rule and the JSON reply. A scout writes no file.

Wait for ALL scouts to complete before proceeding.

# Step 3b: Refute every finding

Every finding gets a refuter before it enters the ledger. Group the findings of all scouts, up to 4 to a group, and dispatch one refuter per group at **low** effort with the Step 3b prompt of [_dispatch.md](_dispatch.md). All refuters run in parallel. A refuted finding keeps the refuter's reason as `refuted`. A refuter that returns no verdict for a finding leaves the finding standing. When the run prompt passes findings that a driver already refuted, skip this step.

# Step 4: Merge into the ledger

1. **Write `found.json`** to `.ai/workflows/<slug>/.draft/found.json`: every finding of every scout, with the refuter's reason on each refuted finding, `dimensions` = every command of this run, also the clean ones, and `affectedFiles` = the work packet files of Step 1.
2. **Merge.** Run `node "<skill-dir>/scripts/wf.mjs" findings add "<root>" <slug> .ai/workflows/<slug>/.draft/found.json --source review --run <now>`, with `--slice <slice-slug>` in per-slice mode. The command applies the merge law of [_findings-ledger.md](../_findings-ledger.md) and prints the counts and the verdict.
3. **Read the ledger.** Run `wf.mjs findings table` and `wf.mjs findings metrics` with the same scope. Their output is the verdict, the table and the frontmatter metrics of Step 5. Never count findings by hand.

Get `now` from the real UTC timestamp per [_timestamp.md](../_timestamp.md) (one stamp for the whole run).

# Step 4b: Triage — fix or dismiss

The review asks the person nothing. Every open finding gets one of two outcomes, at every severity from BLOCKER to NIT: fix or dismiss. A refuted finding needs no triage.

1. Run `wf.mjs decide list "<root>" <slug>` and read the live decisions of the person: each `answer`, `steer` and `approval` entry.
2. Run `wf.mjs findings list "<root>" <slug> --open` for the open findings.
3. Triage each open finding by the first rule that applies:
   - **The fix goes against a decision of the person.** Dismiss the finding with `wf.mjs findings set "<root>" <slug> <id> dismissed --decision <D-id>`. The command refuses an entry that is not a live answer, steer or approval of the person.
   - **The build goes against a decision of the person or a confirmed board.** Fix the build to match the decision or the board.
   - **A reading cannot settle the finding, and it needs runtime evidence that this run cannot get** (`needs-runtime-evidence`, a recorded wall). Keep it as a deferral with `wf.mjs findings set <id> deferred --reason "<the wall>"`. Code cannot fix it.
   - **In all other cases, fix the finding.**
4. A deferral keeps its reason only when you check the reason in the code at HEAD. A reason that names a later fix is not a reason: fix the finding now.

Findings already `deferred` or `dismissed` keep that status. Re-triage them with `/wf review <slug> triage`.

If all commands returned clean, skip Steps 4b and 4c.

# Step 4c: Fix each finding as one step

Runs only if Step 4b gave at least one finding to fix. YOU fix the findings, one after another, in your own session. Dispatch no fix sub-agent. There is no size gate and no route back to plan or implement: a large fix is several steps of this review.

1. **Write the fix steps.** Take the findings in severity order, BLOCKER first. Write one step for each finding into the step ledger with `wf.mjs step` ([implement/_steps.md](../implement/_steps.md)). Split a large fix into several steps.
2. **Confirm the failure.** For each step, first confirm the failure in the code at HEAD. When you cannot confirm it, run `wf.mjs findings set <id> dismissed --reason "<why, with file:line>"`, make no change, and go to the next step.
3. **Apply the patch.** When the fix changes an acceptance check, an approved screen or a `02c-craft.md` line, rewrite the check and the plan step in the same step, per rule 5 of [_decisions.md](../_decisions.md). Record an `implementation-detail` decision with `--rewrote` for the rewritten records.
4. **Run the tests of the step.** Run the tests that cover the files of the step, and the `affected` suite of the test profile for the slices that the step touches.
5. **Commit the step.** Use a conventional commit about the product, per [implement/_steps.md](../implement/_steps.md): `<type>: <what the fix does>`. Name no slug and no finding id ([_output-boundary.md](../_output-boundary.md)).
6. **Record the outcome.** Run `wf.mjs findings set <id> fixed --commit <sha>`.
7. **A step that fails.** When the tests of a step fail, try the step once more. When they fail again, revert the step with `git revert` or `git checkout -- <files>`, run `wf.mjs findings set <id> could-not-fix --reason "<the failure>"`, and continue with the next step.

## One review round

The review runs one round: scan, fix, and stop. After the last fix step, go to Step 5. Do not scan the commits of your fix steps again, and do not start a second round. The person runs `/wf review <slug>` again to review further.

## What the review returns

The review returns the count of BLOCKER findings that are `could-not-fix`. Only such a BLOCKER stops the run.

The review file lists each fix step: the finding, the commit and the check that passed. The person can revert a single fix, because each fix is its own commit.

# Step 5: Write the review file whole

Write the review record. Its name depends on `review-scope`: **slug-wide** → `07-review.md`; **per-slice** → `07-review-<slice-slug>.md`. Run `wf.mjs findings table` and `wf.mjs findings metrics` again after the fix steps. Load [_artifact.md](_artifact.md) and write the draft `.ai/workflows/<slug>/.draft/<name>` from its template: the `type: review` frontmatter (the metrics output, `refs:` per scope), then the body sections `## Verdict` through `## Recommendations`. When `00-index.md` records `origin-packet` and the scope is slug-wide, also write `## Decision Fidelity` after `## Verdict`, per [intent-fidelity.md](intent-fidelity.md) "Decision Fidelity table".

Write the whole draft on every run, also when the record exists. Keep only `created-at` from the old record (`record get`). Do not merge into the old body: the ledger holds the history. Then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

# Step 6: Update Index and Return

1. Record the end of the stage with `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> review [<slice-slug>]`: with no slice for a slug-wide review, with the slice for a per-slice review. It writes `current-stage=review`, `progress.review=complete` (also on every accumulating re-run), `next-command` and `next-invocation`, and adds the review record and `findings.yaml` to `workflow-files` once. The default route is the plan of the next open slice, else `/wf ship <slug>`. When the verdict asks for another route (Option B or C below), add `--next "<invocation>"`. Then set `status=active` with `record set "<root>" <slug> index status=active`.
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by the `could-not-fix` findings**. The review fixes or dismisses every finding itself; `/wf implement <slug> [<slice>] reviews` survives only as a manual escape. After the fix steps, present the user with ALL viable options; write ALL viable options into the `recommended-routes` frontmatter.

- **Option A: Ship** → `/wf ship <slug>`. Use when no BLOCKER finding is `could-not-fix` AND all intended slices are complete. Its PR phase aggregates all complete slices automatically. If more slices remain, use Option D first, then run `/wf ship <slug>` once for the full PR.
- **Option B: Re-invoke review (accumulating re-run)** → `/wf review <slug> [<slice>]`. Use when a BLOCKER is `could-not-fix` and the person removes its cause. Re-invocation re-checks the fixed code, merges fresh findings, and resolve-sweeps what the fixes cleared (no round counter, no `convergence` state). State the `could-not-fix` findings and their failures before recommending.
- **Option C: Escalate to manual implement** → `/wf implement <slug> [<slice>] reviews`. Use when a `could-not-fix` finding needs a design rethink that the person must make. Also when the user prefers stage 5's per-finding fix UI.
- **Option D: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`. Use when this slice is approved AND more slices remain. Check `03-slice.md`.

A finding never becomes a new slice, and the review never routes a finding to `/wf intake <slug> from-review`. New scope that the person names is a new work packet or an extension that the person asks for.
