---
name: wf-plan
description: Create or review-and-fix implementation plans. First invocation creates plans. Re-invocation auto-reviews against current codebase and artifacts, fixes issues found. Supports single slice, all slices (parallel), or explicit feedback.
argument-hint: <slug> [slice-slug|all] [review/fix instructions]
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
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it and all `03-slice-<slice-slug>.md` files it links to. If it does not exist, this is a single-scope workflow. Proceed with single-plan mode.
   - If any prerequisite shows `Status: Awaiting input` → STOP.
   - If `current-stage` in the index is already past plan → WARN before overwriting.
4. **Read** `02-shape.md`, `03-slice.md` (if exists), the relevant `03-slice-<slice-slug>.md` file(s), and `po-answers.md`.
5. **Determine planning mode** (order matters — check top to bottom):

   **a) `all` with existing plans → review-all mode:**
   If second argument is `all` AND `04-plan.md` already exists with linked per-slice plans → **review-all mode**. Review every existing plan (using parallel sub-agents), fix issues found, update all plan files. See "Review-and-Fix Mode" below.

   **b) `all` without existing plans → parallel plan mode:**
   If second argument is `all` AND no plans exist yet → **parallel plan mode** (plan every slice using sub-agents).

   **c) Slice-slug with supplemental text → directed fix mode:**
   If second argument is a slice-slug AND there is supplemental text (third+ arguments) AND `04-plan-<slice-slug>.md` exists → **directed fix mode**. Apply the explicit feedback to the existing plan. See "Review-and-Fix Mode" below.

   **d) Slice-slug with existing plan, no supplemental text → auto-review mode:**
   If second argument is a slice-slug AND `04-plan-<slice-slug>.md` already exists AND no supplemental text → **auto-review mode**. Self-review the plan against current codebase state and artifacts, find issues, fix them. See "Review-and-Fix Mode" below.

   **e) Slice-slug without existing plan → single plan mode:**
   If second argument is a slice-slug AND `04-plan-<slice-slug>.md` does NOT exist → **single plan mode**. Create the plan from scratch.

   **f) No second argument → infer:**
   Use `selected-slice-or-focus` from the index. If still missing and slices exist, choose the best first slice from `03-slice.md` or ask the user. Then apply rules (d) or (e) based on whether the plan exists.

   **g) No slices exist → single plan mode** for the entire shaped spec. If `04-plan.md` exists, treat as auto-review (d).

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
- `wrote: <paths>` (list all plan files written)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Determine planning mode from Step 0.
2. **Single plan mode (new):** Inspect the repository using parallel Explore sub-agents. Run freshness research. Produce a minimal execution-ready plan. Write `04-plan-<slice-slug>.md`. Update master `04-plan.md`.
3. **Parallel plan mode (new, all):** Launch one sub-agent per slice. Wait for all to complete. Read their output files. Run the cohesion check. Write/update master `04-plan.md`. Update cross-links.
4. **Review-and-fix mode (any sub-mode):** See "Review-and-Fix Mode" section below.
5. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
6. Update `00-index.md` accordingly and add all plan files to `workflow-files`.
7. Write plan file(s).

# Review-and-Fix Mode
Triggered when an existing plan is re-invoked. Three sub-modes:

## Sub-mode: Directed Fix (explicit feedback)
**Trigger:** `/wf-plan <slug> <slice-slug> <feedback text>`
**Example:**
- `/wf-plan my-slug auth-flow use OAuth2 PKCE instead of basic auth`
- `/wf-plan my-slug data-model migration must run before API endpoint`

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Parse the feedback** from the supplemental text.
3. **Re-inspect the codebase** if the feedback changes which files or patterns are relevant (use Explore sub-agents).
4. **Apply the feedback surgically** — edit only the sections that need changing. Preserve everything that is still correct. Do NOT start from scratch unless the feedback is a complete rejection.
5. **Append to `## Revision History`** (create the section if it doesn't exist):
   - Revision timestamp
   - Mode: Directed Fix
   - Feedback: the exact text the user provided
   - What was changed and why
6. **Re-check cohesion** with sibling plans if the changes affect cross-slice dependencies.
7. **Update the master `04-plan.md`** summary for this slice if the strategy or key risks changed.
8. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Auto-Review (self-review, single slice)
**Trigger:** `/wf-plan <slug> <slice-slug>` (no supplemental text, plan already exists)
**Example:**
- `/wf-plan my-slug auth-flow` ← plan exists, no feedback = auto-review

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Re-inspect the codebase** using Explore sub-agents. Compare current codebase state to what the plan assumed — look for:
   - Files that moved, were renamed, or were deleted since the plan was written
   - New code that appeared (e.g., a sibling slice was implemented) that affects this plan
   - Dependency version changes, new deprecations, or API drift
3. **Read the slice definition** (`03-slice-<slice-slug>.md`) and shaped spec (`02-shape.md`). Check for:
   - Plan steps that don't align with acceptance criteria
   - Missing steps that the acceptance criteria require
   - Ordering issues (dependencies that should come earlier)
   - Overengineering (steps that go beyond what the spec requires)
   - Missing test/verification coverage for acceptance criteria
4. **Read sibling plans** (`04-plan-<other>.md`). Check for:
   - New conflicts (e.g., sibling plan now touches the same files)
   - Integration gaps that weren't visible before
   - Duplicated work between plans
5. **Produce a review summary** listing issues found (if any) with severity.
6. **Fix the issues** found — edit the plan sections that need changing.
7. **Append to `## Revision History`**:
   - Revision timestamp
   - Mode: Auto-Review
   - Issues found: {count} — {list of what was wrong}
   - What was changed
8. If NO issues were found, append: "Auto-review: no issues found. Plan is current." and leave the plan unchanged.
9. **Update the master `04-plan.md`** if anything changed.
10. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Review-All (self-review, all slices)
**Trigger:** `/wf-plan <slug> all` (plans already exist for all slices)
**Example:**
- `/wf-plan my-slug all` ← plans exist = review-all

Steps:
1. **Read `04-plan.md`** (master index) and every `04-plan-<slice-slug>.md`.
2. **Launch one review sub-agent PER SLICE** in parallel. Each sub-agent:
   a. Reads its `04-plan-<slice-slug>.md`, the corresponding `03-slice-<slice-slug>.md`, and `02-shape.md`.
   b. Re-inspects the codebase for its slice's scope.
   c. Checks the plan against acceptance criteria, current codebase state, and feasibility.
   d. Returns a list of issues found (or "no issues").
3. **Wait for all sub-agents to complete.** Collect their findings.
4. **Cross-plan cohesion check:** With all findings in hand, check for cross-slice issues:
   - Conflicting assumptions between slice plans
   - Integration gaps
   - Ordering problems
   - Duplicated work
5. **Fix all issues found** — update each affected `04-plan-<slice-slug>.md`.
6. **Append to `## Revision History`** in each modified plan file.
7. **Update the master `04-plan.md`** — update summaries, cross-cutting concerns, conflicts.
8. Write all updated files.
9. **Report:** In the chat return, list which plans were updated and which were clean.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the plan(s) and present ALL viable options:

**Option A (default): Implement** → `/wf-implement <slug> <slice-slug>`
Use when: The plan is complete and ready for execution.
**Compact recommended before proceeding** — planning research (alternatives, web searches, codebase exploration) is noise for implementation. Tell the user: "Consider running `/compact` before `/wf-implement` — the PreCompact hook will preserve workflow state."

**Option B: Implement all (sequential)** → start with `/wf-implement <slug> <first-slice-slug>`
Use when: All slices are planned and the user wants to work through them in order.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Slice** → `/wf-slice <slug>`
Use when: Planning revealed that slice boundaries are wrong.

**Option D: Revisit Shape** → `/wf-shape <slug>`
Use when: Planning revealed the spec is incomplete or contradictory.

---

Write `04-plan.md` (master index):

```yaml
---
schema: sdlc/v1
type: plan-index
slug: <slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
planning-mode: <single|all>
slices-planned: <N>
slices-total: <N>
implementation-order: [<slice-slug>, <slice-slug>, ...]
conflicts-found: <N>
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
next-command: wf-implement
next-invocation: "/wf-implement <slug> <first-slice-slug>"
---
```

# Plan Index

## Slice Plan Summaries
### `<slice-slug>`
- Files to touch: ...
- Strategy: ...
- Key risk: ...

## Cross-Cutting Concerns
- ...

## Integration Points Between Slices
- ...

## Recommended Implementation Order
1. `<slice-slug>` — [reason]

## Conflicts Found
- ...

## Freshness Research

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <first-slice-slug>` — [reason]
- **Option B:** `/wf-slice <slug>` — revisit slices [reason, if cohesion issues]

---

Write `04-plan-<slice-slug>.md` (per-slice plan):

```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <N>
metric-step-count: <N>
has-blockers: false
revision-count: 0
tags: []
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-<slice-slug>.md
  siblings: [04-plan-<other>.md, ...]
  implement: 05-implement-<slice-slug>.md
next-command: wf-implement
next-invocation: "/wf-implement <slug> <slice-slug>"
---
```

# Plan: <slice-name>

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

## Assumptions
- ...

## Blockers
- ...

## Freshness Research

## Revision History
*(appended by review-and-fix mode)*

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <slice-slug>` — [reason]
