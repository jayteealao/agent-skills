---
name: wf-slice
description: Break a shaped work item into thin, independently verifiable vertical slices.
argument-hint: <slug> [focus area]
disable-model-invocation: true
---

You are running `wf-slice`, **stage 3 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → `3·slice` → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md`, `02-shape.md` |
| Produces | `03-slice.md` |
| Next | `/wf-plan <slug> <best-first-slice>` (default) |
| Alt | `/wf-plan <slug> all` to plan all slices in parallel |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start planning implementation details, writing code, or designing architecture.
- Your job is to **decompose the shaped spec into thin vertical slices** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` and `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first (e.g., "Run `/wf-shape <slug>` first.").
   - If `02-shape.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open shape questions first.
   - If `current-stage` in the index is already past slice → WARN: "Stage 3 (slice) has already been completed. Running it again will overwrite `03-slice.md`. Proceed?"
4. **Read** `01-intake.md`, `02-shape.md`, and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Purpose
Break a shaped work item into thin, independently verifiable vertical slices.

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
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. If slice boundaries depend on a business decision or rollout preference, ask the product owner a small set of questions before finalizing.
2. Run freshness research only where external constraints affect slicing or order.
3. Break the work into small vertical slices that can be implemented and verified independently.
4. Put risk-reduction and uncertainty-reduction early.
5. Identify the best first slice.
6. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` with the recommended default option.
8. Write `.ai/workflows/<slug>/03-slice.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the slices and present the user with ALL viable options:

**Option A (default): Plan best-first slice** → `/wf-plan <slug> <best-first-slice>`
Use when: Standard flow. Work through slices one at a time, starting with the highest-risk or highest-value slice.

**Option B: Plan all slices in parallel** → `/wf-plan <slug> all`
Use when: Slices are independent enough that planning them all upfront is efficient. Useful for: well-understood domains, clearly separated concerns, time-boxed sprints where you want the full picture.

**Option C: Revisit Shape** → `/wf-shape <slug>`
Use when: Slicing revealed that the spec is too vague, contradictory, or missing key information to decompose properly.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `03-slice.md` with this structure:

# Slice

## Metadata
- Slug:
- Status:
- Updated:
- Focus Area:

## Slice Strategy

## Recommended Order
1. ...

## Slices
### Slice: <name>
- Goal:
- Why this slice exists:
- Scope:
- Acceptance check:
- Dependencies:
- Risks:

## Best First Slice

## Deferred / Optional Slices
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-plan <slug> <best-first-slice>` — [reason]
- **Option B:** `/wf-plan <slug> all` — plan all slices in parallel [reason, if applicable]
- **Option C:** `/wf-shape <slug>` — revisit shape [reason, if applicable]
