---
name: wf-implement
description: Implement one selected planned slice. Writes per-slice implementation record with cross-links to slice definition and plan.
argument-hint: <slug> [slice-slug|reviews]
disable-model-invocation: true
---

You are running `wf-implement`, **stage 5 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `04-plan-<slice-slug>.md` (or `04-plan.md` for single-scope) |
| Produces | `05-implement-<slice-slug>.md` + updates `05-implement.md` master |
| Next | `/wf-verify <slug> <slice-slug>` (default) |
| Skip-to | `/wf-review <slug> <slice-slug>` if verification is trivial |
| Special | `/wf-implement <slug> reviews` — fix review findings one by one |

# CRITICAL — execution discipline
You are a **workflow orchestrator** running the implementation stage.
- Do NOT skip reading the prior workflow artifacts (index, shape, slice, plan). Read them FIRST.
- Do NOT verify, review, or ship — those are later stages.
- Implement **only** the selected slice as described in the plan. Do not broaden scope.
- Follow the numbered steps below **exactly in order**.
- Your only output is the code changes, the workflow artifacts, and the compact chat summary defined below.
- If you catch yourself about to skip ahead to verification or review, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice-slug**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check for reviews mode:** If the second argument is literally `reviews` → this is a **review-fix** invocation. See "Reviews Mode" section below. Skip the rest of Step 0 and go directly to that section.
4. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
5. **Check prerequisites:**
   - A plan must exist for this slice: either `04-plan-<slice-slug>.md` or `04-plan.md`. If missing → STOP. Tell the user: "Run `/wf-plan <slug> <slice-slug>` first."
   - If the plan shows `Status: Awaiting input` → STOP.
   - Check if `05-implement-<slice-slug>.md` already exists → WARN: "This slice has already been implemented. Running again will overwrite. Proceed?"
6. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — the slice definition with acceptance criteria
   - `04-plan-<slice-slug>.md` — the implementation plan
   - `02-shape.md` — the shaped spec for overall context
   - `po-answers.md`
7. **Read sibling implementations:** Check for any existing `05-implement-<other-slice>.md` files. Note what has already been implemented so you don't duplicate work or create conflicts.
8. **Carry forward** `open-questions` from the index.
9. **Branch check (MANDATORY if `branch-strategy: dedicated`):**
   - Read `branch-strategy`, `branch`, and `base-branch` from `00-index.md` frontmatter.
   - If `branch-strategy` is `dedicated`:
     a. Check current git branch with `git branch --show-current`.
     b. If the current branch is NOT the workflow branch (`branch` field):
        - Check if the branch already exists: `git branch --list <branch>`.
        - If it does NOT exist → **create it**: `git checkout -b <branch>` from `<base-branch>`.
        - If it DOES exist → **switch to it**: `git checkout <branch>`.
     c. Confirm you are now on the correct branch before proceeding.
   - If `branch-strategy` is `shared` → note that commits go to the current branch (do not create or switch branches).
   - If `branch-strategy` is `none` → skip all branch management.

# Parallel research (use sub-agents when supported)
Before implementing, if the plan touches multiple distinct areas:
- **Explore sub-agent 1:** Re-check the current state of the files listed in the plan. Confirm they haven't changed since planning (especially if sibling slices were implemented between plan and now).
- **Explore sub-agent 2:** If external APIs or dependencies are involved, run a quick freshness check.
- Merge findings. If the codebase has diverged (e.g., a sibling slice changed shared files), note this and adapt.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices. Write a per-slice implementation record with cross-links.

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
- `wrote: <paths>` (per-slice file + master update)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Ensure correct branch** (see Step 0.9 — branch check must have been completed by now).
2. **Create task list from plan.** Read `04-plan-<slice-slug>.md` → `## Step-by-Step Plan`. For each plan step plus bookkeeping steps, use TaskCreate:
   - One task per plan step: `subject: "Step N: <description>"`, `activeForm: "Implementing <description>"`, `metadata: { slug, stage: "implement", slice: "<slice-slug>" }`.
   - Add `addBlockedBy` between tasks only where a genuine dependency exists (step 2 reads output of step 1). Independent steps get no blockedBy.
   - Final bookkeeping tasks (always add these):
     - "Write 05-implement-<slice-slug>.md" — `addBlockedBy: [all implementation tasks]`
     - "Atomic commit" — `addBlockedBy: [write task]`
3. Re-check the current code before editing (using Explore sub-agents if needed). Pay special attention to files that sibling slice implementations may have changed.
4. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass immediately before editing.
5. **Implement the selected slice.** For each plan step task:
   a. `TaskUpdate(taskId, status: "in_progress")` — only one task in_progress at a time.
   b. Do the work for that step.
   c. `TaskUpdate(taskId, status: "completed")` when done.
   d. If blocked or failed: `TaskUpdate(taskId, description: "BLOCKED: <reason>")` → follow existing error handling.
6. Update tests, docs, types, configs, or migrations only where required for this slice.
7. Summarize the exact change set.
8. Mark "Write 05-implement" task `in_progress`. **Write `05-implement-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `05-implement.md`** (master index, see template below).
10. **Update cross-links** in the slice definition (`03-slice-<slice-slug>.md`) and plan (`04-plan-<slice-slug>.md`) to point to the new implementation file.
11. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
12. Update `00-index.md` accordingly and add files to `workflow-files`.
13. Mark "Atomic commit" task `in_progress`. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):**
    - Stage ALL changed files (code changes + workflow artifacts) with `git add`.
    - Commit with a descriptive message: `feat(<slug>): implement <slice-slug>` — include a brief summary of what the slice does.
    - Do NOT push. Pushing happens at handoff.
    - Record the commit SHA in the per-slice frontmatter (`commit-sha` field).
    - If `branch-strategy` is `none`, skip this step — `TaskUpdate(status: "deleted")`.
    - Mark `completed`.

# Adaptive routing — evaluate what's actually next
After completing, evaluate and present ALL viable options:

**Option A (default): Verify** → `/wf-verify <slug> <slice-slug>`
Use when: The implementation touches testable behavior.
**Compact recommended before proceeding** — implementation details (debugging, file exploration, error resolution) are noise for verification. Tell the user: "Consider running `/compact` before `/wf-verify` — the PreCompact hook will preserve workflow state."

**Option B: Skip to Review** → `/wf-review <slug> <slice-slug>`
Use when: Purely declarative change with no testable behavior.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Plan** → `/wf-plan <slug> <slice-slug>`
Use when: The plan was wrong — missed files, wrong assumptions.

**Option D: Blocked** → explain what's blocking.

# Reviews Mode — fix review findings one by one
Triggered when: second argument is literally `reviews`.

Example: `/wf-implement my-slug reviews`

This mode reads the review findings from `07-review.md`, extracts all BLOCKER and HIGH findings (and optionally MED if the user requests), then fixes them **one at a time, sequentially** using sub-agents.

Do this in order for reviews mode:
1. **Read `07-review.md`** and all `07-review-<command>.md` files.
2. **Extract the findings list.** Build an ordered list of findings to fix, sorted by severity (BLOCKER first, then HIGH, then MED if requested). Each finding has: ID, severity, file:line, issue description, suggested fix.
3. **Resolve the slice-slug** from `selected-slice-or-focus` in the index (since the user didn't pass one explicitly).
4. **Create task list from findings.** For each finding, use TaskCreate:
   - `subject: "Fix [{ID}] {SEVERITY}: {title}"`, `activeForm: "Fixing [{ID}]: {title}"`.
   - `description: "Location: {file}:{line}\nIssue: {description}\nFix: {suggestion}"`.
   - `metadata: { slug, stage: "implement-reviews", slice: "<slice-slug>", findingId: "{ID}", severity: "{SEVERITY}" }`.
   - Findings are independent — no `addBlockedBy` between them.
   - Add bookkeeping tasks at the end:
     - "Update 07-review.md fix status" — `addBlockedBy: [all finding tasks]`
     - "Atomic commit: review fixes" — `addBlockedBy: [update task]`
5. **Present the findings list** to the user before starting:
   ```
   ## Review Findings to Fix ({N} total)
   1. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   2. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   ...
   Starting sequential fixes...
   ```
6. **For each finding, sequentially (one at a time):**
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. **Spawn a single sub-agent (sonnet)** with this prompt:
      ```
      Fix the following review finding in the codebase:

      Finding ID: {ID}
      Severity: {severity}
      Location: {file}:{line-range}
      Issue: {issue description}
      Suggested Fix: {fix suggestion}

      Read the file(s) at the specified location. Understand the issue.
      Apply the minimal fix that resolves the issue without introducing
      new problems. Do NOT change anything beyond what is needed for this
      specific finding.

      After fixing, verify your change is correct:
      - The fix addresses the specific issue described
      - No new lint/type/test failures are introduced
      - The surrounding code still makes sense

      Return a brief summary of what you changed and whether the fix is confirmed correct.
      ```
   c. **Wait for the sub-agent to complete.**
   d. **Verify the fix:** Read the changed file(s). Confirm the fix addresses the finding. Check for obvious regressions.
   e. `TaskUpdate(taskId, status: "completed")`. If the fix failed or was partial, update description first: `TaskUpdate(taskId, description: "COULD NOT FIX: <reason>")` then mark completed.
   f. **Move to the next finding.** Do NOT proceed to the next finding until the current one is verified.

7. **After all findings are processed:**
   a. Mark "Update 07-review.md" task `in_progress`. Write/update `05-implement-<slice-slug>.md` with a `## Review Fixes Applied` section listing all findings and their resolution status.
   b. Update `05-implement.md` master index.
   c. **Update `07-review.md`:** Add a `## Fix Status` section at the bottom:
      ```
      ## Fix Status
      | ID | Severity | Status | Notes |
      |----|----------|--------|-------|
      | {ID} | {sev} | Fixed / Partially Fixed / Could Not Fix | {notes} |
      ```
   d. Update `00-index.md`. Mark task `completed`.
   e. Mark "Atomic commit" task `in_progress`. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):** Stage all changed files and commit with message: `fix(<slug>): review fixes for <slice-slug>`. Record commit SHA. Do NOT push. Mark `completed`. If `branch-strategy` is `none`, `TaskUpdate(status: "deleted")`.

7. **Evaluate adaptive routing:**

**Option A (default): Re-verify** → `/wf-verify <slug> <slice-slug>`
Use when: Fixes were applied. Need to confirm everything still passes.
**Compact recommended** — review fix context (finding details, sub-agent output) is noise for re-verification.

**Option B: Re-review** → `/wf-review <slug> <slice-slug>`
Use when: Some findings could not be fixed and need re-assessment.
**Compact recommended** — fresh review needs clean context.

**Option C: Handoff** → `/wf-handoff <slug> <slice-slug>`
Use when: All findings were fixed and the change was already verified.

---

Write `05-implement.md` (master index):

```yaml
---
schema: sdlc/v1
type: implement-index
slug: <slug>
status: in-progress
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
slices-implemented: <N>
slices-total: <N>
metric-total-files-changed: <N>
metric-total-lines-added: <N>
metric-total-lines-removed: <N>
tags: []
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "/wf-verify <slug> <slice-slug>"
---
```

# Implement Index

## Cross-Slice Integration Notes
- ...

## Recommended Next Stage

---

Write `05-implement-<slice-slug>.md` (per-slice implementation record):

```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <N>
metric-lines-added: <N>
metric-lines-removed: <N>
metric-deviations-from-plan: <N>
metric-review-fixes-applied: 0
commit-sha: "<sha or empty if branch-strategy is none>"
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  siblings: [05-implement-<other>.md, ...]
  verify: 06-verify-<slice-slug>.md
next-command: wf-verify
next-invocation: "/wf-verify <slug> <slice-slug>"
---
```

# Implement: <slice-name>

## Summary of Changes
- ...

## Files Changed
- path: what changed and why

## Shared Files (also touched by sibling slices)
- ...

## Notes on Design Choices
- ...

## Deviations from Plan
- ...

## Anything Deferred
- ...

## Known Risks / Caveats
- ...

## Freshness Research

## Recommended Next Stage
- **Option A (default):** `/wf-verify <slug> <slice-slug>` — [reason]
- **Option B:** `/wf-review <slug> <slice-slug>` — skip verify [reason, if applicable]
