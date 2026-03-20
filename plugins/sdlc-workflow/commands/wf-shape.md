---
name: wf-shape
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
disable-model-invocation: true
---

You are running `wf-shape`, **stage 2 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` |
| Next | `/wf-slice <slug>` |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start designing, architecting, implementing, or coding the solution.
- Do NOT jump ahead to slicing, planning, or implementation.
- Your job is to produce a **mini-spec with acceptance criteria** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` must exist. If missing → STOP. Tell the user: "Run `/wf-intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open intake questions first.
   - If `current-stage` in the index is already past shape → WARN: "Stage 2 (shape) has already been completed. Running it again will overwrite `02-shape.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat.
4. **Read** `01-intake.md` and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Purpose
Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.

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

**Mandatory-question stage** when acceptance, user behavior, or non-goals are still ambiguous.

Do this in order:
1. Reuse any settled decisions from intake rather than re-asking them.
2. Ask product-owner questions only for unresolved behavior, acceptance, non-goals, or sequencing that materially changes the spec.
3. Run freshness research for external dependencies, patterns, APIs, standards, and known issues that could change the spec.
4. Produce a small behavior-focused mini-spec.
5. Update `00-index.md` so the recommended next command is `/wf-slice <slug>` unless shaping is blocked waiting for answers.
6. Write `.ai/workflows/<slug>/02-shape.md`.

Write `02-shape.md` with this structure:

# Shape

## Metadata
- Slug:
- Status:
- Updated:
- Focus Area:

## Problem Statement

## Primary Actor / User

## Desired Behavior

## Acceptance Criteria
- Given ... When ... Then ...

## Non-Functional Requirements
- ...

## Edge Cases / Failure Modes
- ...

## Affected Areas
- ...

## Dependencies / Sequencing Notes
- ...

## Questions Asked This Stage
- ...

## Answers Captured This Stage
- ...

## Out of Scope
- ...

## Definition of Done
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
