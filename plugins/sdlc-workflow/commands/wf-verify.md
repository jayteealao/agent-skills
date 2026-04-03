---
name: wf-verify
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-verify`, **stage 6 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md` |
| Produces | `06-verify-<slice-slug>.md` + updates `06-verify.md` master |
| Next | `/wf-review <slug> <selected-slice>` (if passing) or `/wf-implement <slug> <selected-slice>` (if fixes needed) |
| Skip-to | `/wf-handoff <slug> <slice>` if review is unnecessary (solo project, trivial change, already peer-reviewed externally) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix issues you find — only report them. Fixes belong in `/wf-implement`.
- Do NOT review, handoff, or ship — those are later stages.
- Your job is to **run checks and compare results against acceptance criteria**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - `05-implement-<slice-slug>.md` must exist. If missing → STOP. Tell the user: "Run `/wf-implement <slug> <slice-slug>` first."
   - If it shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` already exists → WARN: "This slice has already been verified. Running again will overwrite. Proceed?"
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — acceptance criteria to verify against
   - `04-plan-<slice-slug>.md` — what was planned (to check deviations)
   - `05-implement-<slice-slug>.md` — what was actually implemented
   - `02-shape.md` — overall spec context
   - `po-answers.md`
6. **Carry forward** `open-questions` from the index.
7. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch (`git branch --show-current`). If not, switch to it. Verification must run against the implementation branch, not the base branch.

# Parallel verification (use sub-agents when supported)
When verification spans multiple concerns, launch parallel sub-agents:
- **Sub-agent 1:** Run lint, typecheck, and build checks.
- **Sub-agent 2:** Run unit and integration tests.
- **Sub-agent 3:** If the change touches UI/frontend, run accessibility or visual checks.
- **Sub-agent 4:** If external dependency freshness could affect test results, run a freshness check.
- Merge all results. Do not spin up sub-agents when a single test command covers everything.

# Purpose
Verify that the selected slice meets acceptance criteria and is ready for review.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. **Create task list.** Read acceptance criteria from `03-slice-<slice-slug>.md`. Use TaskCreate for each check and criterion:
   - Check tasks: `subject: "Run lint + typecheck"`, `activeForm: "Running lint and typecheck"`, `metadata: { slug, stage: "verify", slice: "<slice-slug>" }`. Similarly for unit tests, integration tests, build, etc.
   - AC tasks: `subject: "AC: <criterion text>"`, `activeForm: "Verifying: <criterion>"`.
   - Dependency: integration tests `addBlockedBy` unit tests. All other checks are independent.
   - Final task: "Write 06-verify-<slice-slug>.md" — `addBlockedBy: [all check and AC tasks]`.
4. **Run checks.** For each check task:
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. Run or evaluate the check (using parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks.
   c. `TaskUpdate(taskId, status: "completed")`. If the check failed, update description first: `TaskUpdate(taskId, description: "FAILED: <output summary>")` then mark completed. Do NOT fix — fixes belong in `/wf-implement`.
5. **Verify acceptance criteria.** For each AC task:
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. Compare results with the criterion from `03-slice-<slice-slug>.md` and `02-shape.md`.
   c. `TaskUpdate(taskId, status: "completed")`. If not met, update description: `TaskUpdate(taskId, description: "NOT MET: <reason>")`.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Mark "Write 06-verify" task `in_progress`. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next
After completing verification, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `/wf-review <slug> <selected-slice>`
Use when: All checks pass. Acceptance criteria are met. Ready for a code review.
**Compact recommended if verify was lengthy** — test output and debugging context is noise for review dispatch.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Tests fail, lint errors, type errors, or acceptance criteria are not met. Clearly describe what needs fixing.

**Option C: Skip review, go to Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: This is a solo project with no reviewer, OR the change was already externally reviewed (e.g., pair-programmed), OR it's a trivial fix where formal review adds no value. Only suggest this when there is a clear reason.

**Option D: Revisit Plan** → `/wf-plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental flaw in the approach, not just a bug — the plan itself needs rethinking.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `06-verify.md` (master index):

```yaml
---
schema: sdlc/v1
type: verify-index
slug: <slug>
status: in-progress
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
slices-verified: <N>
slices-total: <N>
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
next-command: wf-review
next-invocation: "/wf-review <slug> <slice-slug>"
---
```

# Verify Index

## Recommended Next Stage

---

Write `06-verify-<slice-slug>.md` (per-slice verify):

```yaml
---
schema: sdlc/v1
type: verify
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
result: <pass|fail|partial>
metric-checks-run: <N>
metric-checks-passed: <N>
metric-acceptance-met: <N>
metric-acceptance-total: <N>
metric-issues-found: <N>
tags: []
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  review: 07-review.md
next-command: wf-review
next-invocation: "/wf-review <slug> <slice-slug>"
---
```

# Verify: <slice-name>

## Verification Summary

## Checks Run
- command/check: result

## Acceptance Criteria Status
- criterion: met / partially met / not met / unverified

## Issues Found
- severity: issue

## Gaps / Unverified Areas
- ...

## Freshness Research

## Recommendation

## Recommended Next Stage
- **Option A:** `/wf-review <slug> <slice-slug>` — [reason]
- **Option B:** `/wf-implement <slug> <slice-slug>` — fix issues [reason, if applicable]
- **Option C:** `/wf-handoff <slug> <slice-slug>` — skip review [reason, if applicable]
