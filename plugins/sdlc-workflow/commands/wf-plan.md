---
name: wf-plan
description: Create repo-aware implementation plans. Writes per-slice plan files with cross-links. Runs for a single slice or all slices in parallel using sub-agents.
argument-hint: <slug> [slice-slug|all]
disable-model-invocation: true
---

You are running `wf-plan`, **stage 4 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` + `03-slice-<slice-slug>.md` (if slices exist) |
| Produces | `04-plan.md` (master) + `04-plan-<slice-slug>.md` per planned slice |
| Next | `/wf-implement <slug> <slice-slug>` (default) |
| Skip-to | `/wf-implement <slug> <slice-slug>` directly if plan is trivial |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start writing code, editing files, or implementing the plan you produce.
- Your job is to **produce execution-ready plans** by inspecting the repo and prior artifacts — not to execute them.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice-slug** or the keyword `all`. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it and all `03-slice-<slice-slug>.md` files it links to. If it does not exist, this is a single-scope workflow. Proceed with single-plan mode.
   - If any prerequisite shows `Status: Awaiting input` → STOP.
   - If `current-stage` in the index is already past plan → WARN before overwriting.
4. **Read** `02-shape.md`, `03-slice.md` (if exists), the relevant `03-slice-<slice-slug>.md` file(s), and `po-answers.md`.
5. **Determine planning mode:**
   - If second argument is `all` → **parallel plan mode** (plan every slice using sub-agents).
   - If second argument is a slice-slug → **single plan mode** for that slice. Read its `03-slice-<slice-slug>.md`.
   - If no second argument → use `selected-slice-or-focus` from the index. If still missing and slices exist, choose the best first slice from `03-slice.md` or ask the user.
   - If no slices exist → **single plan mode** for the entire shaped spec.
6. **Check for existing sibling plans:** Read any existing `04-plan-<other-slice>.md` files so the current plan can be aware of what's already planned for other slices.
7. **Carry forward** `open-questions` from the index.

# Purpose
Create repo-aware, slice-specific implementation plans after inspecting current code and current external guidance. Write per-slice plan files with cross-links to their slice definition, sibling plans, and future implementation files.

# Parallel research (use sub-agents for ALL planning)
Planning is research-intensive. Use parallel sub-agents to gather information before writing the plan:

**For single-plan mode:**
- **Explore sub-agent 1:** Scan the codebase for files, modules, patterns, conventions, and test structure relevant to the selected slice.
- **Explore sub-agent 2:** If the slice touches a second distinct domain (e.g., frontend + backend), scan that domain separately.
- **Web research sub-agent:** Freshness pass on external dependencies, APIs, migration paths, or standards that affect the plan.
- Merge all sub-agent findings into the plan.

**For parallel plan mode (`all`):**
Launch one sub-agent PER SLICE. Each sub-agent:
1. Receives: the slug, its slice-slug, the `03-slice-<slice-slug>.md` content, `02-shape.md` content, and the output path `.ai/workflows/<slug>/04-plan-<slice-slug>.md`.
2. Also receives: the list of all other slice-slugs so it can note dependencies.
3. Explores the codebase for its slice's relevant files, patterns, and test structure.
4. Runs a freshness pass if its slice depends on external knowledge.
5. **Writes its plan directly to `.ai/workflows/<slug>/04-plan-<slice-slug>.md`** using the per-slice template below.

After ALL slice sub-agents complete:
1. **Read every `04-plan-<slice-slug>.md` file** they wrote.
2. **Cohesion check:** Look for conflicts, duplicated work, shared dependencies, ordering constraints, or integration gaps between slice plans.
3. **Write/update the master `04-plan.md`** with summaries, cross-cutting concerns, and recommended implementation order.
4. **Update cross-links** in each per-slice plan to reference sibling plans.
5. If cohesion issues are severe, flag them and recommend revisiting `/wf-slice` before implementing.

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
2. **Single mode:** Inspect the repository using parallel Explore sub-agents. Run freshness research. Produce a minimal execution-ready plan. Write `04-plan-<slice-slug>.md`. Update master `04-plan.md`.
3. **All mode:** Launch one sub-agent per slice. Wait for all to complete. Read their output files. Run the cohesion check. Write/update master `04-plan.md`. Update cross-links.
4. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
5. Update `00-index.md` accordingly and add all plan files to `workflow-files`.
6. Write plan file(s).

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the plan(s) and present ALL viable options:

**Option A (default): Implement** → `/wf-implement <slug> <slice-slug>`
Use when: The plan is complete and ready for execution.

**Option B: Implement all (sequential)** → start with `/wf-implement <slug> <first-slice-slug>`
Use when: All slices are planned and the user wants to work through them in order.

**Option C: Revisit Slice** → `/wf-slice <slug>`
Use when: Planning revealed that slice boundaries are wrong.

**Option D: Revisit Shape** → `/wf-shape <slug>`
Use when: Planning revealed the spec is incomplete or contradictory.

---

Write `04-plan.md` (master index):

# Plan Index

## Metadata
- Slug:
- Status:
- Updated:
- Planning Mode: single | all
- Slices Planned: {N} of {total}

## Plan Files
| Slice | Plan File | Status | Slice Def | Implement |
|-------|-----------|--------|-----------|-----------|
| `<slice-slug>` | [04-plan-<slice-slug>.md](./04-plan-<slice-slug>.md) | Complete | [03-slice-<slice-slug>.md](./03-slice-<slice-slug>.md) | *pending* |
...

## Slice Plan Summaries
### `<slice-slug>`
- Files to touch: ...
- Strategy: ...
- Key risk: ...
- Dependencies on other slices: ...

## Cross-Cutting Concerns
- concerns that appear in multiple slice plans

## Integration Points Between Slices
- where slice outputs connect

## Recommended Implementation Order
1. `<slice-slug>` — [reason]
2. `<slice-slug>` — [reason]

## Conflicts Found
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <first-slice-slug>` — [reason]
- **Option B:** `/wf-slice <slug>` — revisit slices [reason, if cohesion issues]

---

Write `04-plan-<slice-slug>.md` (per-slice plan):

# Plan: <slice-name>

## Metadata
- Slug: <workflow-slug>
- Slice: `<slice-slug>`
- Status: Complete
- Updated:

## Cross-Links
- **Master plan index:** [04-plan.md](./04-plan.md)
- **Slice definition:** [03-slice-<slice-slug>.md](./03-slice-<slice-slug>.md)
- **Sibling plans:** [04-plan-<other-1>.md](./04-plan-<other-1>.md), [04-plan-<other-2>.md](./04-plan-<other-2>.md), ...
- **Implementation (when created):** [05-implement-<slice-slug>.md](./05-implement-<slice-slug>.md)

## Current State
- what exists in the repo now for this slice's scope

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
- `<other-slice-slug>`: what this plan assumes about it, link to [04-plan-<other>.md](./04-plan-<other>.md)

## Assumptions
- ...

## Blockers
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <slice-slug>` — [reason]
