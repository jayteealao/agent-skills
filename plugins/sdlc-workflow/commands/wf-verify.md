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
| Requires | `02-shape.md`, `04-plan.md`, `05-implement.md` |
| Produces | `06-verify.md` |
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
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `05-implement.md` must exist. If missing → STOP. Tell the user: "Run `/wf-implement <slug> <slice>` first."
   - If `05-implement.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past verify → WARN: "Stage 6 (verify) has already been completed. Running it again will overwrite `06-verify.md`. Proceed?"
4. **Read** `02-shape.md`, `04-plan.md` (or `04-plan-<slice>.md`), `05-implement.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

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
- If the stage cannot finish, write the stage file with `Status: Awaiting input` and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Prefer AskUserQuestion for PO interaction; fall back to numbered chat questions. Append every answer to `po-answers.md` with timestamp and stage.
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
3. Run or evaluate the most relevant checks (using parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks.
4. Compare the results with the acceptance criteria from `02-shape.md`.
5. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
6. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` accordingly.
8. Write `.ai/workflows/<slug>/06-verify.md`.

# Adaptive routing — evaluate what's actually next
After completing verification, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `/wf-review <slug> <selected-slice>`
Use when: All checks pass. Acceptance criteria are met. Ready for a code review.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Tests fail, lint errors, type errors, or acceptance criteria are not met. Clearly describe what needs fixing.

**Option C: Skip review, go to Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: This is a solo project with no reviewer, OR the change was already externally reviewed (e.g., pair-programmed), OR it's a trivial fix where formal review adds no value. Only suggest this when there is a clear reason.

**Option D: Revisit Plan** → `/wf-plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental flaw in the approach, not just a bug — the plan itself needs rethinking.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `06-verify.md` with this structure:

# Verify

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

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
- Source:
  Why it matters:
  Takeaway:

## Recommendation

## Recommended Next Stage
- **Option A:** `/wf-review <slug> <slice>` — [reason]
- **Option B:** `/wf-implement <slug> <slice>` — fix issues [reason, if applicable]
- **Option C:** `/wf-handoff <slug> <slice>` — skip review [reason, if applicable]
