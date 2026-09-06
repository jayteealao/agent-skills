# Review stage body (slug mode — loaded by `review.md` Step 00)

This file is the **workflow-stage** half of `/wf review`. `review.md` resolved the first token to an existing slug and instructed you to read this file — follow it exactly. Ad-hoc review (dimension / sweep, no slug) never loads this file.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice mode) | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (recommended) |
| Requires (slug-wide mode) | `02-shape.md`, `03-slice.md`, and at least one `05-implement-<slice>.md`. Reads every present per-slice implement/verify file for context. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `07-design-audit.md`, `07-design-critique.md`, `augmentations:` list in `00-index.md` — every artifact that exists must be checked by the relevant review (e.g., 02c-craft.md anti-goals must be honored; 04b-instrument.md signals must be present; 05c-benchmark.md baseline must not regress; every augmentation must get a type-specific re-check). |
| Produces (per-slice mode) | `07-review-<slice-slug>.md` + `07-review-<slice-slug>-<command>.md` per selected command. These are an **accumulating ledger** — a re-run on the same slice MERGES new findings into the existing files (dedupe + resolve-sweep), never overwrites. Running review on a different slice never touches a sibling slice's files. |
| Produces (slug-wide mode) | `07-review.md` + `07-review-<command>.md` per selected command (single set per workflow). Re-running review **merges into the existing files** (accumulating ledger — new findings deduped + appended in place, cleared findings marked `resolved`; nothing overwritten or deleted). Sibling per-slice review files (if any from prior runs) are left untouched. |
| Next | `/wf handoff <slug>` (when `verdict: ship`/`ship-with-caveats` and no OPEN blocker findings remain + all slices complete). If OPEN blockers remain: re-invoke `/wf review <slug> [<slice>]` (a normal accumulating re-run that re-checks the fixed code and merges fresh findings), or escalate to `/wf implement <slug> [<slice>] reviews` as a manual escape. Also: `/wf plan <slug> <next-slice>` (if more slices remain), or `/wf intake <slug> from-review` (if the review surfaced new scope — adds net-new slices via extension; a wrong spec becomes a new slice too, since there is no in-place amend). |

> **Auto second opinion (verdict-gated).** After findings are merged and the verdict is derived, **auto-invoke** `/consult codex review <scope>` (pinning `codex`/`claude` keeps it free) whenever `verdict: ship-with-caveats` — the caveat verdict *is* the trigger, so fire it rather than listing it in next-steps. Also fire when a blocker finding was fixed in-loop this run and the re-check verdict flipped to ship. Skip only a clean `ship` with no fixed-in-loop findings, or an obvious block. The user may invoke it with any provider.

# Role
You are a **review dispatch orchestrator that owns an accumulating findings ledger and its own triage→fix loop**.
- Do not run reviews yourself — **select review commands and dispatch sub-agents**. Each sub-agent runs one command independently and reports findings. The review artifacts **accumulate across invocations**. Before writing, READ the existing `07-review[-<slice>].md` + per-command files (if present) and **MERGE** this run's findings. The merge law — stable IDs, `surfaced-at` preservation, resolve-sweep, `runs:` append — is single-sourced in [_findings-ledger.md](../_findings-ledger.md); apply it, never restate it. Never overwrite or delete a prior finding.
- Do not auto-loop **within this invocation**: dispatch fix sub-agents once, record outcomes, stop. A further pass is a fresh `/wf review` that merges into the same ledger. **No round counter and no `convergence` state.** Verify-after-fixes requires the user to re-invoke `/wf verify`. Do not improvise fixes while sub-agents are running; the fix loop runs only at Step 4c, AFTER aggregation and AFTER user triage at Step 4b. At Step 4c: every finding marked `Fix` at Step 4b spawns a fix sub-agent that applies the minimal patch. After all fix sub-agents return, record each outcome **onto its finding** (`status: fixed` / `could-not-fix` + `fixed-at`) and refresh `## Fix Status`. Do not handoff or ship — those are later stages.
- Your job: **orient → read existing ledger → gather change stats → select commands → dispatch review sub-agents → merge + dedupe + resolve-sweep → triage → dispatch fix sub-agents → record outcomes → write merged verdict + Fix Status**. Order matters only where the ledger does: merge before triage, triage before the fix loop, outcomes recorded before the verdict. Reading and dispatch may interleave freely.
- If you catch yourself reviewing code directly, STOP — spawn a sub-agent. If you catch yourself fixing code outside Step 4c, STOP — the fix loop only runs at Step 4c.

# TRIAGE MODE

If the second argument is `triage` (e.g., `/wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `review-scope` and `selected-slice`.
   - `review-scope: slug-wide` → target is `07-review.md`; ignore any third-argument slice selector.
   - `review-scope: per-slice` → use the third argument as slice slug if present, else `selected-slice`; if neither, ask. Target is `07-review-<slice-slug>.md`.
2. **Read the target review file** — parse `## Triage Decisions`. Collect findings with `status: deferred` or `open`. Findings already `resolved`/`fixed`/`dismissed` are not re-presented unless the user names them.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf review <slug> [<slice>]` for a full review." and STOP.
4. **Present for triage as a gate question per [_gate-question.md](../_gate-question.md)** — same protocol as Step 4b, but show only `deferred` and `open` findings. A `Fix` decision here may also run the Step 4c fix loop.
5. **Edit the target review file in place** — update `## Triage Decisions` rows for re-triaged findings only; set each finding's `status` in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`; update `## Recommendations` counts. Preserve every other section unchanged. Do not overwrite the file.
6. **Print summary** — show fix/defer/dismiss counts and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector** (per-slice mode only; ignored in slug-wide mode). If no slug given, infer from `.ai/workflows/*/00-index.md`. If ambiguous, ask.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`** from `00-index.md`. Default: `per-slice`.
   - `per-slice` → continue with slice-resolution below; all artifact paths use `-<slice-slug>` suffix.
   - `slug-wide` → **skip slice resolution entirely**; no `<slice-slug>` this run; paths drop the slice suffix (`07-review.md`, `07-review-<command>.md`). Re-runs **merge** into the prior `07-review.md` (dedupe, resolve-sweep re-run dimensions, append a `runs:` entry; never overwritten). The diff is the cumulative branch diff (`git diff <base-branch>...HEAD`). Findings reflect all code on the branch; verdict is "ship this branch" not "ship this slice".
4. **Resolve the slice-slug** (per-slice mode only; skip if `review-scope: slug-wide`): Use the passed slug; else `selected-slice-or-focus` from the index; else ask.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`. Recognize these modes:
   - **Compressed mode** (`workflow-type: quick`): the implement record is `05-implement.md` (no slice slug). Acceptance criteria source is `01-quick.md`. No per-slice plan/slice files exist.
   - **Forwarded mode** (`workflow-type: rca`): rich context lives in `01-rca.md`; `02-shape.md` is synthesized; `04-plan.md` exists if planning ran.
   - **Terminal analysis** (`workflow-type: investigate`): produces option sketches and **no `02-shape.md`** — it is not built or reviewed in place. A chosen option is re-intaked via `/wf intake <option>` as a NEW workflow; a bare `investigate` slug has no implement record to review.
   - **Change-mode** (`workflow-type: fix` / `hotfix` / `refactor`): the compressed-lifecycle's **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`, optional `06-verify.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly one slice; `selected-slice` is its slug. Review as standard mode with the un-suffixed names. (`review-scope: slug-wide` — one `07-review.md`.) Default rubric by mode: **hotfix** → `security`, **refactor** → `refactor-safety` (`/wf review <slug> <rubric>`); widen only if the change warrants it.
   - **update-deps** (`workflow-type: update-deps`): update-deps self-authors `05-implement.md` / `06-verify.md` (tier-ordered) in its own flow and **routes here** for review. The implement/verify records are the un-suffixed `05-implement.md` / `06-verify.md`; the plan is `04-plan.md`. Review against `01-update-deps.md` (the scan/research brief) + `03-slice.md` (the P0/P1/P2 tiers). `review-scope: slug-wide`.
   - **Task** (`workflow-type: task`): a task self-authors `05-implement.md`/`06-verify.md` in `/wf task`'s own flow and is not normally reviewed — there is no `03-slice.md`/`04-plan.md` and never will be. STOP cleanly: "This is a task workflow — resume it with `/wf task <slug>`. If the task left a reviewable diff, run ad-hoc `/wf review <dimension>` against it." Never fall through to standard mode.
   - **Audit** (`workflow-type: audit`): the `07-review*` files here ARE the audit's own accumulating findings ledger, not a change review — the workflow has no implement record and never will. STOP cleanly: "This is an audit workflow — its ledger belongs to `/wf intake audit <slug>`; re-invoking that merges new findings into it." Never fall through to standard mode.
   - **Standard mode**: per-slice files (`03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`).

   In all modes, an implement record (slice or master) must exist. If missing → STOP: "Run `/wf implement <slug>` first."

   **Per-slice mode** (`review-scope: per-slice`):
   - `06-verify-<slice-slug>.md` (or `06-verify.md`) is recommended but not required.
   - If verify shows `Status: Awaiting input` → STOP.
   - If `07-review-<slice-slug>.md` already exists → this run **merges** into it. Read it now (with its sibling `.yaml`) for dedupe + resolve-sweep at Step 4; nothing is overwritten. Sibling slices' review files are never touched.

   **Slug-wide mode** (`review-scope: slug-wide`):
   - At least one `05-implement-<slice-slug>.md` must exist. If `03-slice.md` lists slices with `status: complete` but only some have implement records, WARN: "Slug-wide review covers the entire branch diff. Slices without implement records: <list>. Their code may appear in the diff; their ACs will not be checked."
   - Any `06-verify-*.md` files are read for context but never block.
   - **Adoption-matrix reconciliation (mechanical pass over shape).** If `02-shape.md` carries an adoption matrix (the table of dependencies/libraries with a `USE`/`AVOID`/etc. decision per row), reconcile every `USE` row against the branch diff: each must cite at least one production usage site — a real import/call in shipped code. A `USE` row with zero usage (installed, never wired in) becomes a finding, severity **MED**, titled "committed and abandoned" (installed, zero usage) and routed through the normal ledger. This is a mechanical check, not a judgment call: no production import/call for a `USE` dependency ⇒ finding.
   - **Success-Criteria re-basing (mandatory, slug-wide milestone check).** The slug-wide review must answer the intake's **Success Criteria exactly** — quote each criterion from `01-intake.md`, state its current truth against the branch diff with concrete evidence (`file:line`, a passing test, or an observed run), and **never paraphrase** the criterion. This is the milestone the per-slice reviews structurally cannot judge: a branch can pass every per-slice gate and still miss the intake's headline outcome. Route each unmet or only-partially-met criterion through the normal ledger (via the `intent-fidelity` dimension). Additive: when `03-slice.md` marks a slice as a **visible milestone**, the same exact Success-Criteria check also runs once at that slice's per-slice review.
   - If `07-review.md` already exists → this run **merges** into it. Read it now (with its sibling `.yaml`) for dedupe + resolve-sweep at Step 4; nothing is overwritten. Prior per-slice `07-review-<slice>.md` files are left untouched.
6. **Read the full context** — load [_context.md](_context.md) item 6 and read every artifact it lists for the current `review-scope` (slice definition, plan, implement, verify, `02-shape.md`, `03-slice.md`, `po-answers.md`).
7. **Read augmentation context** — load [_context.md](_context.md) item 7: the `augmentations:` list in `00-index.md` with its per-type reads (`07-design-audit.md`, `07-design-critique.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`), `02b-design.md` and `02c-craft.md` (mandatory when present), and the verify cross-reads that auto-promote to BLOCKER / HIGH / WARN findings.
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm you are on the correct branch. Use `git diff <base-branch>...<branch>` for the full change set.

# Workflow rules
Apply [_workflow-rules.md](../_workflow-rules.md). Review-specific: the review files are an accumulating ledger — merge in place, never overwrite; and every conditional input in the table above is mandatory when present.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead in the artifact's `## The Review` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `findings: <O open / R resolved-this-run / F fixed-this-run>` — the merged-ledger snapshot, plus a one-line "what the merge did" note: how many net-new findings were added, how many prior findings were re-confirmed, how many a re-run cleared (`resolved`), and how many the fix loop patched (e.g., "merged 2 new, re-confirmed 3, resolved 1 cleared; fix loop patched 2 of 2; 4 open").
- `options:` (list all viable next options — see Adaptive routing below)
- ≤3 short blocker bullets if needed (remaining OPEN BLOCKERs only — anything fixed/dismissed/resolved is no longer a blocker)

# Progress tracking

Where the host offers a progress surface ([_host-invocation.md](../_host-invocation.md)), track these items:

- one item per selected review command (independent — they run as parallel sub-agents);
- the four bookkeeping items, in ledger order: merge + dedupe + resolve-sweep; triage; fix loop (Step 4c; dropped when Step 4b yields zero `Fix` decisions); write the merged verdict + Fix Status;
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

**Selection philosophy:** Use shape, slice, and implementation artifacts — not just raw diff patterns — to reason about what the change *is*. A feature that adds async data fetching needs `backend-concurrency` even if the diff contains no "mutex". Lean toward inclusion: a missed review is worse than a redundant one. The max prevents sprawl, not thorough coverage.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases
- `security` — vulnerabilities, insecure defaults
- `code-simplification` — missed reuse, unnecessary complexity, inefficiencies
- `intent-fidelity` — **always-on for lifecycle slugs** (`workflow-type: feature`, or unset), at BOTH per-slice and slug-wide scope: does the diff advance the intake's product, or a simplified imitation of it? Joins `correctness` in the always-kept set and is **never suppressed by the user-focus override**. Ad-hoc reviews reach it by name (`/wf review intent-fidelity`). (Compressed/change-mode slugs may skip it; it is a lifecycle-slug gate.)

### Signal-driven dimensions
Load [_select.md](_select.md) and apply its rules: the backend and frontend always-include sets, the design-work rule (`design-audit` / `design-critique` map to `design/audit.md` / `design/critique.md`), and the signal → dimension table for motion, concurrency, refactors, architecture, data, migrations, privacy, API surface, scale, dependencies, infra, CI, release, logging, observability, cost, docs, style, and developer tooling.

### Selection Constraints
- **Minimum**: 3 (`correctness` + `security` + `code-simplification`); for lifecycle slugs (`workflow-type: feature`, or unset) `intent-fidelity` is also always-on (per-slice AND slug-wide), so the floor is 4.
- **Maximum**: 15 — raise only if the change genuinely spans many domains; do not artificially cap thorough coverage
- **User focus override**: include named dimensions + `correctness` (+ `intent-fidelity` for lifecycle slugs — never suppressed by the focus filter); suppress unrelated commands
- **Config/docs-only**: drop `correctness`/`backend-concurrency`/`testing`/`code-simplification`; keep `security`, `docs`, relevant infra/release
- **Test-only**: keep `testing`, `correctness`, `code-simplification`; drop most others
- **When in doubt, include**: a false positive costs one sub-agent; a missed issue costs a production incident

Before dispatching, print the `## Review Scope` + `## Commands Selected` block from [_select.md](_select.md) to chat.

# Step 3: Dispatch Parallel Sub-Agents

For EACH selected command, dispatch ONE sub-agent at **medium** effort per [_subagents.md](../_subagents.md). Set the tier explicitly — a reviewer must not inherit the parent configuration (per [_fix-loop.md](../_fix-loop.md) rule 3). All agents run in parallel, in waves of ≤6 when more dimensions are selected. Synthesis (Step 4 — aggregation, dedup, triage) stays with the coordinator.

**Each sub-agent receives this prompt** (substitute the per-slice or slug-wide variant based on the current `review-scope`; resolve every `<skill-dir>` to an absolute path per [_host-invocation.md](../_host-invocation.md) before dispatch — a child has no citing file to resolve a relative path against): load [_dispatch.md](_dispatch.md) and send its fenced prompt unchanged. The prompt carries the pre-existing determination, the accumulate-never-overwrite merge law, the target path (`07-review-{slice-slug}-{command-name}.md` per-slice, `07-review-{command-name}.md` slug-wide), the `type: review-command` output contract, and the sibling `.yaml` + `.html.fragment` duty.

Wait for ALL sub-agents to complete before proceeding.

# Step 4: Merge into the existing ledger (dedupe + resolve-sweep)

After all sub-agents finish, **MERGE** this run's findings into the existing master ledger — edit `07-review[-<slice>].md` + `.yaml` **in place**, never overwriting.

1. **Read the existing master** `07-review[-<slice-slug>].md` + sibling `.yaml` (if present). Capture every prior finding: `id`, `surfaced-at`, `status`, `dimension`, triage decision. If no prior master, every finding below is net-new.
2. **Read every `07-review-<slice-slug>-<command>.md`** the sub-agents wrote this run; collect every row with ID, severity, file:line, description. (Sub-agents already merged within their dimension; you reconcile across dimensions and against the master.)
3. **Merge per the ledger law.** Apply [_findings-ledger.md](../_findings-ledger.md) rules 1–5 across this run's findings and against the master: within-run cross-dimension dedupe, the cross-run reconcile (re-surfaced vs net-new), and the resolve-sweep for re-run dimensions.
4. **Sort by severity:** BLOCKER → HIGH → MED → LOW → NIT, then alphabetically by file path within each level. Resolved findings sort last, clearly marked.
5. **Determine verdict** from OPEN, non-pre-existing findings only (status ∈ open / deferred / could-not-fix AND `pre-existing: false`):
   - Any OPEN BLOCKER → **Don't Ship**
   - OPEN HIGH only → **Ship with caveats** (if addressable as follow-ups)
   - OPEN MED/LOW/NIT only, or no open findings → **Ship**
   Fixed / dismissed / resolved findings never count against the verdict. **Neither do `pre-existing: true` findings — including pre-existing BLOCKERs**: the verdict is about *this change*. Pre-existing findings surface in `## Pre-existing Debt` and route to `/wf intake fix|refactor`.

Get `now` from the real UTC timestamp per [_timestamp.md](../_timestamp.md) (one stamp for the whole run).

# Step 4b: Triage findings needing a decision

After the merge, present findings that **need a decision** as a gate question per [_gate-question.md](../_gate-question.md): net-new findings, re-surfaced findings that were previously `resolved`, and prior `open` (untriaged) findings. **Skip `pre-existing: true` findings** — they land in `## Pre-existing Debt` with `/wf intake` routing (a user may still request an in-run fix, but the default flow never prompts for it). Findings already triaged `deferred` or `dismissed` **keep that decision** — re-triage via `/wf review <slug> triage`. **`Fix` decisions execute in Step 4c.**

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
1. Dispatch ONE sub-agent at **medium** effort with write isolation, per [_subagents.md](../_subagents.md) (REQUIRED — both; the tier pin follows [_fix-loop.md](../_fix-loop.md) rule 3). This is the same fix prompt shape used by `/wf implement reviews` mode — kept identical so behavior matches when the user routes through either path. Send the fix prompt from [_dispatch.md](_dispatch.md) (Step 4c section); the child returns `Method: as-prescribed | deviated` first, then its self-check exit status.
2. As each sub-agent completes, take its patch through step 3 before accepting it. Under a worktree host, accept by merging the child's branch result; under a partition host (no worktree flag, per [_subagents.md](../_subagents.md)) the edit is already in the working tree, so step 3 reviews the diff first and `git checkout -- <files>` discards a rejected one. **On a patch-overlap conflict** (two fixes touch the same lines), merge one, then re-dispatch the other against the merged state — serial for the conflicting pair only.
3. Read the changed file(s) and sanity-check the patch against **both** the finding and the suggested fix's method ([_fix-loop.md](../_fix-loop.md) rule 5) — `Method: deviated` is never accepted on the subagent's own word; re-read it against what was suggested, and discard a deviation that crosses an explicit prohibition.
4. **Record the outcome ON the finding** — set `status` and `fixed-at = now` in `## All Findings`, `## Findings (Detailed)`, `## Fix Status`, and the sibling `.yaml`: fixed → `status: fixed` (drops out of OPEN counts and verdict); could not fix → `status: could-not-fix` (stays OPEN; still counts against verdict) + record the reason (`COULD NOT FIX: <reason>`).

## After the fix dispatch (no re-review this invocation)

Do **not** re-dispatch reviews this invocation — re-checking the fixed code is a fresh `/wf review` run. `fixed` findings drop out of OPEN counts → verdict recomputes from remaining open. `could-not-fix` findings stay OPEN and surface under `## Recommendations → Must Fix (remaining)` with the sub-agent's reason.

## Commit (only when fixes landed)

If at least one `Fix` sub-agent successfully modified files: follow the shared commit discipline ([_fix-loop.md](../_fix-loop.md) rule 7) with message `fix(<slug>): review-time fixes for <slice-slug>` (per-slice mode) or `fix(<slug>): review-time fixes` (slug-wide mode), and record the commit SHA in the review artifact's `## Fix Status` section AND in this run's `runs:` frontmatter entry (`fix-commit`). The fix sub-agents and commit replace the manual `/wf implement <slug> [<slice>] reviews` round-trip for the common case. That mode remains as a manual escape (e.g., `could-not-fix` findings remain, or the user prefers the per-finding fix UI).

# Step 5: Write the merged master ledger

Write (merge into) the master artifact. Filename depends on `review-scope`: **per-slice** → `07-review-<slice-slug>.md`; **slug-wide** → `07-review.md`. Load [_artifact.md](_artifact.md) and write the file from its Step 5 template: the `type: review` frontmatter (verdict, cumulative `commands-run`, OPEN metric counts, `runs:` audit trail, `refs:` per scope), then the body sections `## The Review` through `## Recommended Next Stage`.

When the file already exists, **edit in place** — preserve sections not changing (especially `## Triage Decisions` rows not re-triaged), update finding rows by ID, append net-new findings in severity-sorted position, mark resolved findings, and **append one entry to `runs:`**. Never overwrite the file wholesale.

# Step 5b: Write the rich fragment (do not skip)

For each review `.md` written, write the sibling `<stem>.yaml` (`siblingYamlSchemas.review`; `findings:` and `counts:` = OPEN findings only; bump `rev:` each run) and `<stem>.html.fragment` (`fragment-review`, body-only, deterministic from the `.yaml`) per [_artifact.md](_artifact.md) Step 5b. Managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) **BLOCKS the `.md` write when the sibling `.yaml` is missing** — author the `.yaml` first (or in the same turn) while findings are in context.

# Step 5c: Write per-dimension rich fragments (do not skip)

Each per-dimension file (`07-review-<command>.md` slug-wide, `07-review-<slice-slug>-<command>.md` per-slice) needs its own `<stem>.yaml` (`siblingYamlSchemas.review-dimension`) and `<stem>.html.fragment` (`fragment-review-dimension`). The Step-3 review sub-agent authors them; confirm every per-dimension `.md` has its `.yaml` (or `fragment: none` for a clean dimension) and author any the sub-agent missed, per [_artifact.md](_artifact.md) Step 5c.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Step 6: Update Index and Return

1. Update `00-index.md` frontmatter:
   - `current-stage: review`, `status: active`, `progress.review: complete` (stays `complete` on every accumulating re-run)
   - Add review artifacts to `workflow-files` (idempotent — do not duplicate entries a prior run already added):
     - **Per-slice**: add `07-review-<slice-slug>.md` and every `07-review-<slice-slug>-<command>.md` (do NOT remove sibling slices' review files).
     - **Slug-wide**: add `07-review.md` and every `07-review-<command>.md`. Leave any prior per-slice review files in `workflow-files`.
   - Set `next-command` and `next-invocation` based on verdict.
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by OPEN findings** plus `verdict:`. The fix loop is owned by this stage; `/wf implement <slug> [<slice>] reviews` survives only as a manual escape. After completing the fix loop, evaluate the (open-findings) verdict and present the user with ALL viable options; write ALL viable options into `## Recommended Next Stage`.

- **Option A: Handoff** → `/wf handoff <slug>`. Use when `verdict: ship` (or ship-with-caveats where caveats are not blockers) AND no OPEN blockers remain AND all intended slices are complete. Handoff aggregates all complete slices automatically. If more slices remain, use Option D first, then run `/wf handoff <slug>` once for the full PR.
- **Option B: Re-invoke review (accumulating re-run)** → `/wf review <slug> [<slice>]`. Use when OPEN blocker or `could-not-fix` findings remain. Re-invocation re-checks the fixed code, merges fresh findings, and resolve-sweeps what the fixes cleared (no round counter, no `convergence` state). State unresolved findings clearly before recommending. Compact recommended before re-invoking — fix sub-agent chatter and triage UI is noise for the next pass; tell the user that workflow state lives in the artifact files on disk, so nothing is lost by compacting.
- **Option C: Escalate to manual implement** → `/wf implement <slug> [<slice>] reviews`. Use when remaining findings need design rethink, cross-cutting refactor, or input the review agent cannot supply — that is, re-invoking review would surface the same unfixable findings again. Also when the user prefers stage 5's per-finding fix UI.
- **Option D: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`. Use when this slice is approved AND more slices remain. Check `03-slice.md`. Compact recommended — prior slice lifecycle is noise for the next slice.
- **Option E: Skip handoff, go to Ship** → `/wf ship <slug>`. Use when no team to hand off to, no PR description needed, CI/CD handles the rest.
- **Option F: Extend scope** → `/wf intake <slug> from-review`. Use when findings reveal **missing capability** rather than broken implementation (never built, not wrong). Signal: "X should also do Y" / "no handler for Z" rather than "X does Y incorrectly".
- **Option G: Correct an unbuilt slice** → `/wf plan <slug> <slice> <correction>` (built work → new slice via F). Use when findings reveal the **slice definition or ACs were wrong** — the implementation did what it was told, but what it was told was incorrect. Signal: multiple findings stem from the same incorrect spec assumption, or the approach is fundamentally wrong rather than buggy.
