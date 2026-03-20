---
name: wf-handoff
description: Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-handoff`, **stage 8 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·handoff` → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `05-implement.md`, `06-verify.md`, `07-review.md` |
| Produces | `08-handoff.md` |
| Next | `/wf-ship <slug> <selected-slice>` (default) |
| Skip-to | `/wf-retro <slug>` if shipping is handled externally or not applicable |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT make code changes, fix issues, or modify the implementation.
- Do NOT ship or deploy — that is a later stage.
- Your job is to **summarise the completed work into a reviewer-friendly handoff package**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start editing code or running deployment steps, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `05-implement.md`, `06-verify.md`, and `07-review.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `07-review.md` shows `Status: Awaiting input` or contains blocking issues → STOP. Tell the user to resolve review findings via `/wf-implement` first.
   - If `current-stage` in the index is already past handoff → WARN: "Stage 8 (handoff) has already been completed. Running it again will overwrite `08-handoff.md`. Proceed?"
4. **Read** `05-implement.md`, `06-verify.md`, `07-review.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

# Purpose
Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context.

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
1. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language.
2. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
3. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
4. Update `00-index.md` accordingly.
5. Write `.ai/workflows/<slug>/08-handoff.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the handoff and present the user with ALL viable options:

**Option A (default): Ship** → `/wf-ship <slug> <selected-slice>`
Use when: The work needs deployment planning, rollout strategy, and rollback guidance.

**Option B: Skip to Retro** → `/wf-retro <slug>`
Use when: Shipping is handled entirely outside this workflow (e.g., CI/CD auto-deploys on merge, or shipping is someone else's responsibility). The handoff document IS the final deliverable.

**Option C: Next slice** → `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>`
Use when: This slice is handed off AND there are more slices. Check `03-slice.md` for the next unfinished slice. Ship/retro can wait until all slices are done.

**Option D: Fix** → `/wf-implement <slug> <selected-slice>`
Use when: While writing the handoff, you realized something is wrong or missing.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `08-handoff.md` with this structure:

# Handoff

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## PR Title Options
1. ...

## Summary

## Problem

## Solution

## Affected Areas
- ...

## Verification Evidence
- ...

## Manual Test Notes
- ...

## Migration / Config / Rollout Notes
- ...

## Risks / Caveats
- ...

## Follow-Up Work
- ...

## Reviewer Focus Areas
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-ship <slug> <slice>` — [reason]
- **Option B:** `/wf-retro <slug>` — skip ship [reason, if applicable]
- **Option C:** `/wf-plan <slug> <next-slice>` — next slice [reason, if applicable]
