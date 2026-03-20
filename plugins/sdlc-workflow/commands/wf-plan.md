---
name: wf-plan
description: Create a repo-aware, slice-specific implementation plan after inspecting current code and current external guidance.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-plan`, **stage 4 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` |
| Produces | `04-plan.md` |
| Next | `/wf-implement <slug> <selected-slice>` |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start writing code, editing files, or implementing the plan you produce.
- Your job is to **produce an execution-ready plan** by inspecting the repo and prior artifacts — not to execute it.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` and `03-slice.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past plan → WARN: "Stage 4 (plan) has already been completed. Running it again will overwrite `04-plan.md`. Proceed?"
4. **Read** `02-shape.md`, `03-slice.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, choose the best first slice from `03-slice.md` or ask the user.
6. **Carry forward** `open-questions` from the index.

# Purpose
Create a repo-aware, slice-specific implementation plan after inspecting current code and current external guidance.

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
1. Inspect the repository to understand the current implementation, conventions, files, tests, and architecture relevant to the selected slice.
2. Run freshness research for the exact dependencies, APIs, frameworks, standards, or migration paths that affect the plan.
3. When the work spans multiple domains, use parallel Explore/subagent research where supported.
4. Produce a minimal execution-ready plan for this slice only.
5. Update `00-index.md` so the recommended next command is `/wf-implement <slug> <selected-slice>`.
6. Write `.ai/workflows/<slug>/04-plan.md`.

Write `04-plan.md` with this structure:

# Plan

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## Current State

## Likely Files / Areas to Touch
- path/or/module: why

## Proposed Change Strategy

## Step-by-Step Plan
1. ...

## Test / Verification Plan
- ...

## Risks / Watchouts
- ...

## Assumptions
- ...

## Blockers
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
