---
name: wf-implement
description: Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-implement`, **stage 5 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md`, `04-plan.md` |
| Produces | `05-implement.md` |
| Next | `/wf-verify <slug> <selected-slice>` |

# CRITICAL — execution discipline
You are a **workflow orchestrator** running the implementation stage.
- Do NOT skip reading the prior workflow artifacts (index, shape, slice, plan). Read them FIRST.
- Do NOT verify, review, or ship — those are later stages.
- Implement **only** the selected slice as described in the plan. Do not broaden scope.
- Follow the numbered steps below **exactly in order**.
- Your only output is the code changes, the workflow artifacts, and the compact chat summary defined below.
- If you catch yourself about to skip ahead to verification or review, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `04-plan.md` must exist. If missing → STOP. Tell the user: "Run `/wf-plan <slug> <slice>` first."
   - If `04-plan.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past implement → WARN: "Stage 5 (implement) has already been completed. Running it again will overwrite `05-implement.md`. Proceed?"
4. **Read** `02-shape.md`, `03-slice.md`, `04-plan.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices.

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
1. Re-check the current code before editing.
2. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass immediately before editing.
3. Implement only the selected slice.
4. Update tests, docs, types, configs, or migrations only where required for this slice.
5. Summarize the exact change set.
6. Update `00-index.md` so the recommended next command is `/wf-verify <slug> <selected-slice>`.
7. Write `.ai/workflows/<slug>/05-implement.md`.

Write `05-implement.md` with this structure:

# Implement

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## Summary of Changes
- ...

## Files Changed
- path: what changed and why

## Notes on Design Choices
- ...

## Anything Deferred
- ...

## Known Risks / Caveats
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
