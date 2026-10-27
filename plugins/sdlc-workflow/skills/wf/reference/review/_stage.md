# Review stage body (slug mode — loaded by `review.md` Step 00)

This file is the **workflow-stage** half of `/wf review`. `review.md` resolved the first token to an existing slug and instructed you to read this file — follow it exactly. Ad-hoc review (dimension / sweep, no slug) never loads this file.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·ship → 9·retro

| | Detail |
|---|---|
| Requires | See [review.md ## Requires](../review.md#requires). |
| Produces (slug-wide mode, the default) | `07-review.md`, one review file for the work packet, written whole on every run from the findings ledger `findings.yaml` ([_findings-ledger.md](../_findings-ledger.md)). The ledger keeps the history: a re-run merges into the ledger, never into the file. |
| Produces (per-slice mode) | `07-review-<slice-slug>.md`, written whole from the entries of that slice in `findings.yaml`. A run on one slice never changes the entries of another slice. |
| Next | `/wf ship <slug>` (when `verdict: ship`/`ship-with-caveats` and no OPEN blocker findings remain + all slices complete). If OPEN blockers remain: re-invoke `/wf review <slug> [<slice>]` (a normal accumulating re-run that re-checks the fixed code and merges fresh findings), or escalate to `/wf implement <slug> [<slice>] reviews` as a manual escape. Also: `/wf plan <slug> <next-slice>` (if more slices remain), or `/wf intake <slug> from-review` (if the review surfaced new scope — adds net-new slices via extension; a wrong spec becomes a new slice too, since there is no in-place amend). |

# Role
You are a **review dispatch orchestrator that owns the findings ledger of the work packet and its own triage→fix loop**.
- Do not run reviews yourself — **select review commands and dispatch scouts**. Each scout runs one command independently and returns its findings. A refuter tries to refute every finding before it enters the ledger. `wf.mjs findings add` merges the survivors and the refuted findings into `findings.yaml` by the merge law of [_findings-ledger.md](../_findings-ledger.md); the law is in code, so never apply it by hand and never restate it.
- Do not auto-loop **within this invocation**: dispatch fix sub-agents once, record outcomes, stop. A further pass is a fresh `/wf review` that merges into the same ledger. **No round counter and no `convergence` state.** Verify-after-fixes requires the user to re-invoke `/wf verify`. Do not improvise fixes while sub-agents are running; the fix loop runs only at Step 4c, AFTER the merge and AFTER triage at Step 4b. At Step 4c: every finding marked `Fix` at Step 4b spawns a fix sub-agent that applies the minimal patch. Record each outcome with `wf.mjs findings set`. Do not ship — that is a later stage.
- Your job: **orient → gather change stats → select commands → dispatch scouts → refute every finding → merge into the ledger → triage → dispatch fix sub-agents → record outcomes → write the review file whole**. Order matters only where the ledger does: refute before the merge, merge before triage, triage before the fix loop, outcomes recorded before the review file. Reading and dispatch may interleave freely.

# Triage mode

When the second argument is `triage` (for example `/wf review my-feature triage`), read [_triage.md](_triage.md) and follow it instead of this file.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug given, infer from `.ai/workflows/INDEX.md`. If ambiguous, ask. Resolve the second argument, if present, in this order:
   - a slice of the roster → the **slice selector** (per-slice mode only; ignored in slug-wide mode);
   - a rubric or alias key from [_ad-hoc.md](_ad-hoc.md) → the **user focus override** of Step 2, in either review scope.
2. **Read `00-index.md`** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` ([_records.md](../_records.md)). Parse its frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`** from `00-index.md`. Default: `slug-wide`, one review per work packet.
   - `slug-wide` → **skip slice resolution entirely**; no `<slice-slug>` this run; the review file is `07-review.md`. The diff is the cumulative branch diff (`git diff <base-branch>...HEAD`). Findings reflect all code on the branch; the verdict is "ship this branch", not "ship this slice".
   - `per-slice` (only when `00-index.md` sets it) → continue with slice resolution below; the review file is `07-review-<slice-slug>.md`, and the ledger commands get `--slice <slice-slug>`.
4. **Resolve the slice-slug** (per-slice mode only; skip if `review-scope: slug-wide`): Use the passed slug; else `selected-slice` from the index; else ask.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`. Recognize these modes:
   - **Compressed mode** (`workflow-type: quick`): the implement record is `05-implement.md` (no slice slug). Acceptance criteria source is `01-quick.md`. No per-slice plan/slice files exist.
   - **Forwarded mode** (`workflow-type: rca`): rich context lives in `01-rca.md`; `02-shape.md` is synthesized; `04-plan.md` exists if planning ran.
   - **Terminal analysis** (`workflow-type: investigate`): produces option sketches and **no `02-shape.md`** — it is not built or reviewed in place. A chosen option is re-intaked via `/wf intake <option>` as a NEW workflow; a bare `investigate` slug has no implement record to review.
   - **Change-mode** (`workflow-type: fix` / `hotfix` / `refactor`): the compressed-lifecycle's **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`, optional `06-verify.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly one slice; `selected-slice` is its slug. Review as standard mode with the un-suffixed names. (`review-scope: slug-wide` — one `07-review.md`.) Default rubric by mode: **hotfix** → `security`, **refactor** → `refactor-safety` (`/wf review <slug> <rubric>`); widen only if the change warrants it.
   - **update-deps** (`workflow-type: update-deps`): update-deps self-authors `05-implement.md` / `06-verify.md` (tier-ordered) in its own flow and **routes here** for review. The implement/verify records are the un-suffixed `05-implement.md` / `06-verify.md`; the plan is `04-plan.md`. Review against `01-update-deps.md` (the scan/research brief) + `03-slice.md` (the P0/P1/P2 tiers). `review-scope: slug-wide`.
   - **Small path** (`workflow-type: small`): one slice named `<slug>`, and `01-small.md` is its plan, implement and verify record. The changed code is the commits in its `commit-sha`. Acceptance checks come from its `## Acceptance Checks`. `review-scope: slug-wide` — one `07-review.md`. A review runs only when `progress.review` is `not-started` or later; `skipped` means the person did not want a PR, so STOP: "This small-path workflow has no PR. Run `/wf review <dimension>` for an ad-hoc review of the commit."
   - **Task** (`workflow-type: task`): a task self-authors `05-implement.md`/`06-verify.md` in `/wf intake task`'s own flow and is not normally reviewed — there is no `03-slice.md`/`04-plan.md` and never will be. STOP cleanly: "This is a task workflow — resume it with `/wf intake task <slug>`. If the task left a reviewable diff, run ad-hoc `/wf review <dimension>` against it." Never fall through to standard mode.
   - **Audit** (`workflow-type: audit`): the ledger here holds the audit's own findings (`--source audit`), not a change review — the workflow has no implement record and never will. STOP cleanly: "This is an audit workflow — its ledger belongs to `/wf intake audit <slug>`; re-invoking that merges new findings into it." Never fall through to standard mode.
   - **Optimize** (`workflow-type: optimize`): the loop's finish wrote one suffixed slice, `optimize`: `03-slice-optimize.md` (the acceptance criteria), `05-implement-optimize.md` (the squash and the table of kept trials), and verify wrote `06-verify-optimize.md`. There is no plan file: the confirmed `02-optimize-spec.md` replaces shape and plan, so review against it. Always add `correctness` with `focus: metric-gaming` (see the core set below).
   - **Standard mode**: per-slice files (`03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`).

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

Use `02b-design.md` and `02c-craft.md` for the design mode of each surface, anti-goals and visual contract. Check that the change honors the `02c-craft.md` anti-goals. When the change touches UI, the Verify and Refuse lists of `design/_craft-floor.md` are the checklist of the design-audit and design-critique dimensions. When `02c-craft.md` names `boards:`, compare each board PNG with its capture in the verify `## Design Comparison` (`design/_boards.md`). Route a finding against a confirmed board to `/wf design <slug> amend` as a question; do not redraw the board.

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
- `findings: <O open / R resolved-this-run / F fixed-this-run>` — the merged-ledger snapshot, plus a one-line "what the merge did" note: how many net-new findings were added, how many prior findings were re-confirmed, how many a re-run cleared (`resolved`), and how many the fix loop patched (e.g., "merged 2 new, re-confirmed 3, resolved 1 cleared; fix loop patched 2 of 2; 4 open").
- `options:` (list all viable next options — see Adaptive routing below)
- ≤3 short blocker bullets if needed (remaining OPEN BLOCKERs only — anything fixed/dismissed/resolved is no longer a blocker)

# Progress tracking

Where the host offers a progress surface ([_host-invocation.md](../_host-invocation.md)), track these items:

- one item per selected review command (independent — they run as parallel sub-agents);
- the five bookkeeping items, in ledger order: refute; merge into the ledger; triage; fix loop (Step 4c; dropped when Step 4b yields zero `Fix` decisions); write the review file;
- inside Step 4c, one item per `Fix` decision (`Fix [{ID}] {SEV}: {title}`).

Mark each item done as its outcome is recorded. A `could-not-fix` item carries `COULD NOT FIX: <reason>`. Tracking never changes the ordering above.

# Step 1: Gather Change Statistics

From the relevant implement record(s), extract files changed and nature of changes. **Diff scope depends on `review-scope`:** per-slice mode diffs the working tree (`git diff --name-only HEAD`, `git diff --stat HEAD`, `git diff HEAD`); slug-wide mode diffs the entire branch since divergence (`git diff --name-only <base-branch>...HEAD`, `git diff --stat <base-branch>...HEAD`, `git diff <base-branch>...HEAD`). Substitute `<base-branch>` from `00-index.md` frontmatter (typically `main` or `master`).

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

1. **Write `found.json`** to `.ai/workflows/<slug>/.draft/found.json`: every finding of every scout, with the refuter's reason on each refuted finding, and `dimensions` = every command of this run, also the clean ones.
2. **Merge.** Run `node "<skill-dir>/scripts/wf.mjs" findings add "<root>" <slug> .ai/workflows/<slug>/.draft/found.json --source review --run <now>`, with `--slice <slice-slug>` in per-slice mode. The command applies the merge law of [_findings-ledger.md](../_findings-ledger.md) and prints the counts and the verdict.
3. **Read the ledger.** Run `wf.mjs findings table` and `wf.mjs findings metrics` with the same scope. Their output is the verdict, the table and the frontmatter metrics of Step 5. Never count findings by hand.

Get `now` from the real UTC timestamp per [_timestamp.md](../_timestamp.md) (one stamp for the whole run).

# Step 4b: Triage findings needing a decision

First run `wf.mjs findings questions "<root>" <slug>`. Each question is an open finding whose fix changes an acceptance check, an approved screen or a craft line. Do not fix such a finding at Step 4c before the person answers. Before you ask, run `wf.mjs decide answered "<root>" <slug> --key finding:<id>`: a live answer settles the question. Otherwise ask the question as a gate question per [_gate-question.md](../_gate-question.md), with the recommended option first. Record the answer with `wf.mjs decide add --kind answer --key finding:<id>` per [_decisions.md](../_decisions.md). Then record the outcome on the finding with `wf.mjs findings set`.

When the answer asks for a change, decide the size of the change. The change is **small** when all five criteria hold:

1. It changes only files that the slug's diff already changes, plus their tests.
2. It adds no schema change, no migration, no new dependency and no new module.
3. It changes no public contract: no API, no rules file, no stored format and no event that another slice reads.
4. It changes the acceptance checks of one slice only.
5. One fix round can make it and check it.

Record the size as an `implementation-detail` decision. When the change is not small, name the criterion that fails.

- **A small change is fixed in this review.** Rewrite the acceptance check and the plan step that the answer changes, per rule 5 of [_decisions.md](../_decisions.md), and name the rewritten records with `--rewrote`. Fix the finding at Step 4c. Run the checks of the rewritten acceptance check. When a check fails, the change is not small. When the checks pass, set the finding to `fixed`.
- **A change that is not small routes back.** When the plan already describes the work, the next step is `/wf implement <slug> <slice>`. When the answer adds plan steps, files or design, the next step is `/wf plan <slug> <slice>`. Record the route in the review frontmatter as `route-back`.

Then present the other findings that **need a decision** as a gate question per [_gate-question.md](../_gate-question.md): net-new findings, findings that opened again, and `open` (untriaged) findings. A refuted finding needs no decision. **Skip pre-existing findings** — they land in `## Pre-existing Debt` with `/wf intake` routing (a user may still request an in-run fix, but the default flow never prompts for it). Findings already triaged `deferred` or `dismissed` **keep that decision** — re-triage via `/wf review <slug> triage`. Record each `Defer` and `Dismiss` with `wf.mjs findings set <id> deferred|dismissed --reason "<the reason>"`. **`Fix` decisions execute in Step 4c.**

**For BLOCKER and HIGH findings** — present each individually:

Ask one gate question per finding ([_gate-question.md](../_gate-question.md)), batching up to 4 findings per round:
- **header**: the finding ID (e.g., "CR-1", "CS-2", "SEC-3")
- **question**: `"{Source command}: {one-line issue description} at {file}:{line}"`
- Options:
  - `Fix` / label: "Fix now", description: "Spawn a sub-agent to apply the minimal patch in this run (Step 4c)."
  - `Defer` / label: "Defer", description: "Record but do not fix — revisit later via `/wf review <slug> triage`."
  - `Dismiss` / label: "Not an issue", description: "False positive or intentional — record the reason."

**For MED findings** — present as a batch:

Ask a gate question per [_gate-question.md](../_gate-question.md) with `multiSelect: true`:
- **header**: "MED findings"
- **question**: "Select which MED findings to fix now (Step 4c will spawn fix sub-agents for selected ones)"
- Options: one per MED finding, label `{ID}: {title}`, description `{file}:{line} — {one-line description}`

Unselected MED findings default to `Defer`.

**For LOW and NIT findings** — list in the report; do NOT prompt and do NOT fix in this run.

If all commands returned clean, skip Steps 4b and 4c.

# Step 4c: Review-owned fix loop

Runs only if Step 4b produced at least one `Fix` decision. Dispatch fix sub-agents **once** this invocation, record each outcome onto its finding, then stop. **No round counter and no `convergence` state** — a further pass is a fresh `/wf review`. The dispatch conforms to [_fix-loop.md](../_fix-loop.md); everything below is review-specific parameterization. Before dispatching, note the count of findings triaged `Fix` at Step 4b (transient — not persisted to frontmatter). If 0, skip to Step 5.

## Fix dispatch (parallel, write-isolated)

Dispatch a fix sub-agent for **every** finding triaged `Fix` **in parallel** (one wave) with write isolation, per [_subagents.md](../_subagents.md) — concurrent patches cannot collide (fixes that must touch the same file run serially, in severity order); the step-3 sanity check is the merge gate. For each finding:
1. Dispatch ONE sub-agent at **medium** effort with write isolation, per [_subagents.md](../_subagents.md) (REQUIRED — both; the tier pin follows [_fix-loop.md](../_fix-loop.md) rule 3). Send the fix prompt in [_fix-prompt.md](_fix-prompt.md) unchanged. `/wf implement reviews` sends the same prompt. The child returns `Method: as-prescribed | deviated` first, then its self-check exit status.
2. As each sub-agent completes, take its patch through step 3 before accepting it. Under a worktree host, accept by merging the child's branch result; under a partition host (no worktree flag, per [_subagents.md](../_subagents.md)) the edit is already in the working tree, so step 3 reviews the diff first and `git checkout -- <files>` discards a rejected one. **On a patch-overlap conflict** (two fixes touch the same lines), merge one, then re-dispatch the other against the merged state — serial for the conflicting pair only.
3. Read the changed file(s) and sanity-check the patch against **both** the finding and the suggested fix's method ([_fix-loop.md](../_fix-loop.md) rule 5) — `Method: deviated` is never accepted on the subagent's own word; re-read it against what was suggested, and discard a deviation that crosses an explicit prohibition.
4. **Record the outcome ON the finding** with `wf.mjs findings set`: fixed → `findings set <id> fixed` (drops out of OPEN counts and verdict); could not fix → `findings set <id> could-not-fix --reason "<reason>"` (stays OPEN; still counts against verdict).

## After the fix dispatch (no re-review this invocation)

Do **not** re-dispatch reviews this invocation — re-checking the fixed code is a fresh `/wf review` run. `fixed` findings drop out of OPEN counts → verdict recomputes from remaining open. `could-not-fix` findings stay OPEN and surface under `## Recommendations → Must Fix (remaining)` with the sub-agent's reason.

## Commit (only when fixes landed)

If at least one `Fix` sub-agent successfully modified files: follow the shared commit discipline ([_fix-loop.md](../_fix-loop.md) rule 7) with message `fix(<slug>): review-time fixes for <slice-slug>` (per-slice mode) or `fix(<slug>): review-time fixes` (slug-wide mode), and record the commit SHA in the review file's `## Fix Status` section AND as `fix-commit` in its frontmatter. The fix sub-agents and commit replace the manual `/wf implement <slug> [<slice>] reviews` round-trip for the common case. That mode remains as a manual escape (e.g., `could-not-fix` findings remain, or the user prefers the per-finding fix UI).

# Step 5: Write the review file whole

Write the review record. Its name depends on `review-scope`: **slug-wide** → `07-review.md`; **per-slice** → `07-review-<slice-slug>.md`. Run `wf.mjs findings table` and `wf.mjs findings metrics` again after the fix loop. Load [_artifact.md](_artifact.md) and write the draft `.ai/workflows/<slug>/.draft/<name>` from its template: the `type: review` frontmatter (the metrics output, `refs:` per scope), then the body sections `## Verdict` through `## Recommendations`. When `00-index.md` records `origin-packet` and the scope is slug-wide, also write `## Decision Fidelity` after `## Verdict`, per [intent-fidelity.md](intent-fidelity.md) "Decision Fidelity table".

Write the whole draft on every run, also when the record exists. Keep only `created-at` from the old record (`record get`). Do not merge into the old body: the ledger holds the history. Then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

# Step 6: Update Index and Return

1. Record the end of the stage with `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> review [<slice-slug>]`: with no slice for a slug-wide review, with the slice for a per-slice review. It writes `current-stage=review`, `progress.review=complete` (also on every accumulating re-run), `next-command` and `next-invocation`, and adds the review record and `findings.yaml` to `workflow-files` once. The default route is the plan of the next open slice, else `/wf ship <slug>`. When the verdict asks for another route (Option B, C, E or F below), add `--next "<invocation>"`. Then set `status=active` with `record set "<root>" <slug> index status=active`.
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by OPEN findings** plus `verdict:`. The fix loop is owned by this stage; `/wf implement <slug> [<slice>] reviews` survives only as a manual escape. After completing the fix loop, evaluate the (open-findings) verdict and present the user with ALL viable options; write ALL viable options into the `recommended-routes` frontmatter.

- **Option A: Ship** → `/wf ship <slug>`. Use when `verdict: ship` (or ship-with-caveats where caveats are not blockers) AND no OPEN blockers remain AND all intended slices are complete. Its PR phase aggregates all complete slices automatically. If more slices remain, use Option D first, then run `/wf ship <slug>` once for the full PR.
- **Option B: Re-invoke review (accumulating re-run)** → `/wf review <slug> [<slice>]`. Use when OPEN blocker or `could-not-fix` findings remain. Re-invocation re-checks the fixed code, merges fresh findings, and resolve-sweeps what the fixes cleared (no round counter, no `convergence` state). State unresolved findings clearly before recommending. Compact recommended before re-invoking — fix sub-agent chatter and triage UI is noise for the next pass; tell the user that workflow state lives in the artifact files on disk, so nothing is lost by compacting.
- **Option C: Escalate to manual implement** → `/wf implement <slug> [<slice>] reviews`. Use when remaining findings need design rethink, cross-cutting refactor, or input the review agent cannot supply — that is, re-invoking review would surface the same unfixable findings again. Also when the user prefers stage 5's per-finding fix UI.
- **Option D: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`. Use when this slice is approved AND more slices remain. Check `03-slice.md`. Compact recommended — prior slice lifecycle is noise for the next slice.
- **Option E: Extend scope** → `/wf intake <slug> from-review`. Use when findings reveal **missing capability** rather than broken implementation (never built, not wrong). Signal: "X should also do Y" / "no handler for Z" rather than "X does Y incorrectly".
- **Option F: Correct an unbuilt slice** → `/wf plan <slug> <slice> <correction>` (built work → new slice via E). Use when findings reveal the **slice definition or ACs were wrong** — the implementation did what it was told, but what it was told was incorrect. Signal: multiple findings stem from the same incorrect spec assumption, or the approach is fundamentally wrong rather than buggy.
