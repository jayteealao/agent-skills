---
name: wf-review
description: Review the diff like a senior engineer and decide whether the work is ready for handoff.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-review`, **stage 7 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `05-implement.md`, `06-verify.md` |
| Produces | `07-review.md` |
| Next | `/wf-handoff <slug> <selected-slice>` (if approved) or `/wf-implement <slug> <selected-slice>` (if changes needed) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix issues you find — only report and prioritise them. Fixes belong in `/wf-implement`.
- Do NOT handoff or ship — those are later stages.
- Your job is to **review the diff and produce a verdict with prioritised findings**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `05-implement.md` and `06-verify.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `06-verify.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past review → WARN: "Stage 7 (review) has already been completed. Running it again will overwrite `07-review.md`. Proceed?"
4. **Read** `02-shape.md`, `05-implement.md`, `06-verify.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

# Purpose
Review the diff like a senior engineer and decide whether the work is ready for handoff.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- If the stage cannot finish, write the stage file with `Status: Awaiting input` and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Prefer AskUserQuestion for PO interaction; fall back to numbered chat questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research when supported. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `next: <exact slash command with slug>`
- ≤3 short blocker bullets if needed

Do this in order:
1. Inspect the current diff or the files changed.
2. Review for correctness, missed edge cases, regressions, maintainability, security, performance, data integrity, and observability.
3. If external dependency behavior or current best practices matter to the review, run a small freshness pass and record it.
4. Produce a prioritized review verdict.
5. Recommend `/wf-handoff <slug> <selected-slice>` if approved, otherwise `/wf-implement <slug> <selected-slice>`.
6. Update `00-index.md` accordingly.
7. Write `.ai/workflows/<slug>/07-review.md`.

Write `07-review.md` with this structure:

# Review

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## Review Verdict

## Blocking Issues
- ...

## Should-Fix Issues
- ...

## Nice-to-Have Improvements
- ...

## What Looks Good
- ...

## Open Questions
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
