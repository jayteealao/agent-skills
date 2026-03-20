---
name: wf-implement
description: Implement one selected planned slice. Writes per-slice implementation record with cross-links to slice definition and plan.
argument-hint: <slug> [slice-slug]
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
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - A plan must exist for this slice: either `04-plan-<slice-slug>.md` or `04-plan.md`. If missing → STOP. Tell the user: "Run `/wf-plan <slug> <slice-slug>` first."
   - If the plan shows `Status: Awaiting input` → STOP.
   - Check if `05-implement-<slice-slug>.md` already exists → WARN: "This slice has already been implemented. Running again will overwrite. Proceed?"
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — the slice definition with acceptance criteria
   - `04-plan-<slice-slug>.md` — the implementation plan
   - `02-shape.md` — the shaped spec for overall context
   - `po-answers.md`
6. **Read sibling implementations:** Check for any existing `05-implement-<other-slice>.md` files. Note what has already been implemented so you don't duplicate work or create conflicts.
7. **Carry forward** `open-questions` from the index.

# Parallel research (use sub-agents when supported)
Before implementing, if the plan touches multiple distinct areas:
- **Explore sub-agent 1:** Re-check the current state of the files listed in the plan. Confirm they haven't changed since planning (especially if sibling slices were implemented between plan and now).
- **Explore sub-agent 2:** If external APIs or dependencies are involved, run a quick freshness check.
- Merge findings. If the codebase has diverged (e.g., a sibling slice changed shared files), note this and adapt.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices. Write a per-slice implementation record with cross-links.

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
- `wrote: <paths>` (per-slice file + master update)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Re-check the current code before editing (using Explore sub-agents if needed). Pay special attention to files that sibling slice implementations may have changed.
2. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass immediately before editing.
3. Implement only the selected slice.
4. Update tests, docs, types, configs, or migrations only where required for this slice.
5. Summarize the exact change set.
6. **Write `05-implement-<slice-slug>.md`** (per-slice file, see template below).
7. **Write/update `05-implement.md`** (master index, see template below).
8. **Update cross-links** in the slice definition (`03-slice-<slice-slug>.md`) and plan (`04-plan-<slice-slug>.md`) to point to the new implementation file.
9. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next
After completing, evaluate and present ALL viable options:

**Option A (default): Verify** → `/wf-verify <slug> <slice-slug>`
Use when: The implementation touches testable behavior.

**Option B: Skip to Review** → `/wf-review <slug> <slice-slug>`
Use when: Purely declarative change with no testable behavior.

**Option C: Revisit Plan** → `/wf-plan <slug> <slice-slug>`
Use when: The plan was wrong — missed files, wrong assumptions.

**Option D: Blocked** → explain what's blocking.

---

Write `05-implement.md` (master index):

# Implement Index

## Metadata
- Slug:
- Status:
- Updated:
- Slices Implemented: {N} of {total}

## Implementation Files
| Slice | Implement File | Status | Slice Def | Plan |
|-------|----------------|--------|-----------|------|
| `<slice-slug>` | [05-implement-<slice-slug>.md](./05-implement-<slice-slug>.md) | Complete | [03-slice-<slice-slug>.md](./03-slice-<slice-slug>.md) | [04-plan-<slice-slug>.md](./04-plan-<slice-slug>.md) |
...

## Cross-Slice Integration Notes
- files shared between slice implementations
- any conflicts resolved during implementation

## Cumulative Change Summary
- total files changed across all slices
- total lines added/removed

## Recommended Next Stage
- **Option A (default):** `/wf-verify <slug> <slice-slug>` — [reason]

---

Write `05-implement-<slice-slug>.md` (per-slice implementation record):

# Implement: <slice-name>

## Metadata
- Slug: <workflow-slug>
- Slice: `<slice-slug>`
- Status: Complete
- Updated:

## Cross-Links
- **Master implement index:** [05-implement.md](./05-implement.md)
- **Slice definition:** [03-slice-<slice-slug>.md](./03-slice-<slice-slug>.md)
- **Plan:** [04-plan-<slice-slug>.md](./04-plan-<slice-slug>.md)
- **Sibling implementations:** [05-implement-<other-1>.md](./05-implement-<other-1>.md), ...
- **Verify (when created):** [06-verify-<slice-slug>.md](./06-verify-<slice-slug>.md)

## Summary of Changes
- ...

## Files Changed
- path: what changed and why

## Shared Files (also touched by sibling slices)
- path: what this slice changed, what sibling `<other-slice>` also changed, any conflict resolution notes

## Notes on Design Choices
- ...

## Deviations from Plan
- what changed vs. what the plan specified, and why

## Anything Deferred
- ...

## Known Risks / Caveats
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-verify <slug> <slice-slug>` — [reason]
- **Option B:** `/wf-review <slug> <slice-slug>` — skip verify [reason, if applicable]
