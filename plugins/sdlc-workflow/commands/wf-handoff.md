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
| Requires | `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md`, `07-review.md` |
| Produces | `08-handoff.md` |
| Next | `/wf-ship <slug> <selected-slice>` (default) |
| Skip-to | `/wf-retro <slug>` if shipping is handled externally or not applicable |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT make code changes, fix issues, or modify the implementation.
- Do NOT ship, merge, or deploy — that is a later stage.
- Your job is to **summarise the completed work into a reviewer-friendly handoff package, push the branch, and create a pull request**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start editing code or merging, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - `05-implement-<slice-slug>.md` and `07-review.md` must exist. `06-verify-<slice-slug>.md` is recommended. If missing → STOP. Tell the user which command to run first.
   - If `07-review.md` shows `Status: Awaiting input` or contains blocking issues → STOP. Tell the user to resolve review findings via `/wf-implement` first.
   - If `current-stage` in the index is already past handoff → WARN before overwriting.
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — slice definition
   - `04-plan-<slice-slug>.md` — what was planned
   - `05-implement-<slice-slug>.md` — what was built
   - `06-verify-<slice-slug>.md` (if exists) — verification results
   - `07-review.md` — review verdict and findings
   - `po-answers.md`
6. **Carry forward** `open-questions` from the index.

# Purpose
Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context.

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
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Read branch strategy** from `00-index.md` frontmatter: `branch-strategy`, `branch`, `base-branch`.
2. **Create task list.** Use TaskCreate for the handoff sequence. All metadata: `{ slug, stage: "handoff", slice: "<slice-slug>" }`.
   - T1: `subject: "Read prior artifacts"`, `activeForm: "Reading workflow artifacts"`.
   - T2: `subject: "Write handoff summary"`, `activeForm: "Writing handoff summary"`, `addBlockedBy: ["T1"]`.
   - T3: `subject: "Generate Diátaxis docs"`, `activeForm: "Generating documentation"`, `addBlockedBy: ["T2"]`. If `docs-needed: false`, this task will be deleted in step 5.
   - T4: `subject: "Push branch to remote"`, `activeForm: "Pushing branch"`, `addBlockedBy: ["T3"]`. If `branch-strategy` is not `dedicated`, will be deleted.
   - T5: `subject: "Create pull request"`, `activeForm: "Creating PR"`, `addBlockedBy: ["T4"]`. If `branch-strategy` is not `dedicated`, will be deleted.
   - T6: `subject: "Write 08-handoff.md"`, `activeForm: "Writing handoff artifact"`, `addBlockedBy: ["T5"]`.
3. Mark T1 `in_progress`. Read all prior artifacts needed for the summary. Mark T1 `completed`.
4. Mark T2 `in_progress`. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language. Mark T2 `completed`.
5. Mark T3 `in_progress`. **Documentation generation (Diátaxis):**
   a. Read `02-shape.md` and check the `## Documentation Plan` section and `docs-needed` / `docs-types` frontmatter.
   b. If `docs-needed: true`, generate or update documentation for each identified doc type:
      - **reference**: Write neutral, structured, scannable technical reference for new API surface, CLI commands, config keys, or schemas. Structure around the thing being documented. Use consistent patterns per item type. Examples illustrate, not teach.
      - **how-to**: Write goal-oriented guides for competent users. Start with the outcome, use imperative steps, include verification. No teaching, no filler.
      - **tutorial**: Write learning-oriented step-by-step lessons. Concrete destination, visible results early, minimal explanation, no choices. Only for major new capabilities aimed at new users.
      - **explanation**: Write understanding-oriented content about why, trade-offs, and architecture. Discuss the subject, make connections, compare alternatives. No procedures.
      - **readme**: Update the README as a landing page — value proposition, quickstart, documentation map. Do not let it become a dumping ground.
   c. For each doc, respect Diátaxis boundaries — do NOT mix types. If a doc would need to cover both "how to" and "reference", split into two files.
   d. Write generated docs to the appropriate location in the repo (as identified in the shape's docs plan). If no location was specified, write to `docs/` or update the existing file.
   e. Include the doc paths in `## Documentation Changes` in the handoff file.
   f. If `docs-needed: false` or no docs plan exists, `TaskUpdate(T3, status: "deleted")`. Note "No documentation changes" in the handoff.
   g. Mark T3 `completed` (if not deleted).
6. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. Mark T4 `in_progress`. **Push and create PR (if `branch-strategy` is `dedicated`):**
   a. Confirm you are on the workflow branch (`branch` field). If not, `git checkout <branch>`.
   b. Push the branch to remote: `git push -u origin <branch>`.
   c. Mark T4 `completed`. Mark T5 `in_progress`.
   d. Create a pull request using `gh pr create`:
      - Title: use the best PR title from the handoff summary
      - Body: use the full handoff summary (Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work, Reviewer Focus Areas) formatted as the PR description
      - Base: `<base-branch>` from the index
      - Do NOT merge. The PR is for review.
   e. Record the PR URL and number.
   f. Update `00-index.md` with `pr-url` and `pr-number`. Mark T5 `completed`.
   - If `branch-strategy` is `shared`: Push the branch but do NOT create a PR automatically — note in the handoff that the user should create the PR manually or use the handoff content. `TaskUpdate(T5, status: "deleted")`. Mark T4 `completed`.
   - If `branch-strategy` is `none`: Skip push/PR entirely. `TaskUpdate(T4, status: "deleted")`. `TaskUpdate(T5, status: "deleted")`. The handoff document is the deliverable.
8. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
9. Update `00-index.md` accordingly.
10. Mark T6 `in_progress`. Write `.ai/workflows/<slug>/08-handoff.md`. Mark T6 `completed`.

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

```yaml
---
schema: sdlc/v1
type: handoff
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 8
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
pr-title: "<suggested PR title>"
pr-url: "<url or empty if branch-strategy is not dedicated>"
pr-number: <N or 0>
branch: "<branch name>"
base-branch: "<target branch>"
has-migration: <true|false>
has-config-change: <true|false>
has-docs-changes: <true|false>
docs-generated: [<list of doc paths written or updated>]
tags: []
refs:
  index: 00-index.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
  review: 07-review.md
next-command: wf-ship
next-invocation: "/wf-ship <slug> <slice-slug>"
---
```

# Handoff

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

## Documentation Changes
List all docs written or updated by this handoff (from the Diátaxis docs plan in shape):
- **Type**: reference / how-to / tutorial / explanation / readme
- **Path**: where it was written
- **What it covers**: ...

If no docs changes: "None — [reason from shape docs plan]"

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
