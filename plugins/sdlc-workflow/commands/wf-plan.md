---
name: wf-plan
description: Create repo-aware implementation plans. Runs for a single slice or all slices in parallel using sub-agents.
argument-hint: <slug> [slice|all]
disable-model-invocation: true
---

You are running `wf-plan`, **stage 4 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` (if slices exist) |
| Produces | `04-plan.md` (single slice) or `04-plan.md` + `04-plan-<slice>.md` per slice (all mode) |
| Next | `/wf-implement <slug> <selected-slice>` (default) |
| Skip-to | `/wf-implement <slug> <slice>` directly if plan is trivial (e.g., single-file config change) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start writing code, editing files, or implementing the plan you produce.
- Your job is to **produce execution-ready plans** by inspecting the repo and prior artifacts — not to execute them.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector** or the keyword `all`. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it. If it does not exist, this is a single-scope workflow (no slicing was needed). Proceed with single-plan mode.
   - If `03-slice.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past plan → WARN: "Stage 4 (plan) has already been completed. Running it again will overwrite plan files. Proceed?"
4. **Read** `02-shape.md`, `03-slice.md` (if exists), and `po-answers.md`.
5. **Determine planning mode:**
   - If second argument is `all` → **parallel plan mode** (plan every slice using sub-agents).
   - If second argument is a slice name → **single plan mode** for that slice.
   - If no second argument → use `selected-slice-or-focus` from the index. If still missing and slices exist, choose the best first slice from `03-slice.md` or ask the user.
   - If no slices exist (no `03-slice.md`) → **single plan mode** for the entire shaped spec.
6. **Carry forward** `open-questions` from the index.

# Purpose
Create repo-aware, slice-specific implementation plans after inspecting current code and current external guidance.

# Parallel research (use sub-agents for ALL planning)
Planning is research-intensive. Use parallel sub-agents to gather information before writing the plan:

**For single-plan mode:**
- **Explore sub-agent 1:** Scan the codebase for files, modules, patterns, conventions, and test structure relevant to the selected slice.
- **Explore sub-agent 2:** If the slice touches a second distinct domain (e.g., frontend + backend, app code + infra), scan that domain separately.
- **Web research sub-agent:** Freshness pass on external dependencies, APIs, migration paths, or standards that affect the plan.
- Merge all sub-agent findings into the plan. Do not spin up sub-agents for trivial single-file changes.

**For parallel plan mode (`all`):**
Launch one sub-agent PER SLICE. Each sub-agent:
1. Receives: the slug, its assigned slice definition from `03-slice.md`, the shaped spec from `02-shape.md`, and the path `.ai/workflows/<slug>/04-plan-<slice-name>.md`.
2. Explores the codebase for its slice's relevant files, patterns, and test structure.
3. Runs a freshness pass if its slice depends on external knowledge.
4. **Writes its plan directly to `.ai/workflows/<slug>/04-plan-<slice-name>.md`** — do NOT return the plan in chat. Write to file.

After ALL slice sub-agents complete:
1. **Read every `04-plan-<slice-name>.md` file** they wrote.
2. **Cohesion check:** Look for conflicts, duplicated work, shared dependencies, ordering constraints, or integration gaps between slice plans.
3. **Write the master `04-plan.md`** which contains:
   - A summary of all slice plans
   - Cross-cutting concerns and integration points
   - Recommended implementation order (may differ from slice order if plan reveals dependencies)
   - Any conflicts found and how to resolve them
4. If cohesion issues are severe, flag them and recommend revisiting `/wf-slice` before implementing.

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
- `wrote: <paths>` (list all plan files written)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Determine planning mode (single or all) from Step 0.
2. **Single mode:** Inspect the repository using parallel Explore sub-agents. Run freshness research. Produce a minimal execution-ready plan for the selected slice.
3. **All mode:** Launch one sub-agent per slice (see Parallel research above). Wait for all to complete. Read their output files. Run the cohesion check. Write the master plan.
4. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
5. Update `00-index.md` accordingly.
6. Write plan file(s).

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the plan(s) and present the user with ALL viable options:

**Option A (default): Implement** → `/wf-implement <slug> <selected-slice>`
Use when: The plan is complete and ready for execution.

**Option B: Implement all (sequential)** → start with `/wf-implement <slug> <first-slice>`
Use when: All slices are planned and the user wants to work through them in order. Note: the user still runs implement/verify/review per slice, but has all plans upfront.

**Option C: Revisit Slice** → `/wf-slice <slug>`
Use when: Planning revealed that the slice boundaries are wrong — e.g., two slices have too much overlap, a slice is too large, or a dependency between slices makes the ordering impossible.

**Option D: Revisit Shape** → `/wf-shape <slug>`
Use when: Planning revealed that the spec is incomplete, contradictory, or missing critical acceptance criteria.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `04-plan.md` with this structure (single mode):

# Plan

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:
- Planning Mode: single | all

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
- **Option A (default):** `/wf-implement <slug> <slice>` — [reason]
- **Option B:** [alternative, if applicable]

Write `04-plan.md` with this structure (all mode — master plan):

# Plan (All Slices)

## Metadata
- Slug:
- Status:
- Updated:
- Planning Mode: all
- Slice Plans: [list of `04-plan-<slice>.md` files written]

## Slice Plan Summaries
### <slice-1>
- Files: ...
- Strategy: ...
- Key risk: ...

### <slice-2>
- ...

## Cross-Cutting Concerns
- ...

## Integration Points Between Slices
- ...

## Recommended Implementation Order
1. <slice> — reason

## Conflicts Found
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <first-slice>` — [reason]
- **Option B:** `/wf-slice <slug>` — revisit slices [reason, if cohesion issues]

Write `04-plan-<slice-name>.md` (per-slice plan, written by sub-agent):

# Plan: <slice-name>

## Metadata
- Slug:
- Slice:
- Status:
- Updated:

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

## Dependencies on Other Slices
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:
