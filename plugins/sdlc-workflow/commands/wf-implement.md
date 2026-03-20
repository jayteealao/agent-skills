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
| Requires | `02-shape.md`, `04-plan.md` (or `04-plan-<slice>.md`) |
| Produces | `05-implement.md` |
| Next | `/wf-verify <slug> <selected-slice>` (default) |
| Skip-to | `/wf-review <slug> <slice>` if verification is trivial (e.g., docs-only, config-only, no testable behavior) |

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
   - A plan must exist: either `04-plan.md` or `04-plan-<slice>.md`. If missing → STOP. Tell the user: "Run `/wf-plan <slug> <slice>` first."
   - If the plan shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past implement → WARN: "Stage 5 (implement) has already been completed. Running it again will overwrite `05-implement.md`. Proceed?"
4. **Read** `02-shape.md`, the relevant plan file(s), and `po-answers.md`. If `03-slice.md` exists, read it.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

# Parallel research (use sub-agents when supported)
Before implementing, if the plan touches multiple distinct areas:
- **Explore sub-agent 1:** Re-check the current state of the files listed in the plan. Confirm they haven't changed since planning.
- **Explore sub-agent 2:** If external APIs or dependencies are involved, run a quick freshness check to confirm the plan's assumptions still hold.
- Merge findings. If the codebase has diverged significantly from what the plan assumed, note this and adapt.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices.

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
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Re-check the current code before editing (using Explore sub-agents if multi-domain).
2. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass immediately before editing.
3. Implement only the selected slice.
4. Update tests, docs, types, configs, or migrations only where required for this slice.
5. Summarize the exact change set.
6. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` accordingly.
8. Write `.ai/workflows/<slug>/05-implement.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the implementation and present the user with ALL viable options:

**Option A (default): Verify** → `/wf-verify <slug> <selected-slice>`
Use when: The implementation touches testable behavior — code, logic, UI, APIs, data flows.

**Option B: Skip to Review** → `/wf-review <slug> <selected-slice>`
Use when: The change is purely declarative with no testable behavior — docs-only, config-only, comment-only, renaming. Verification would produce no meaningful signal.

**Option C: Revisit Plan** → `/wf-plan <slug> <selected-slice>`
Use when: During implementation you discovered the plan is wrong — missed files, wrong assumptions, or the approach doesn't work. Document what you found before going back.

**Option D: Blocked** → explain what's blocking
Use when: Implementation cannot proceed due to external blockers (missing credentials, unreleased dependency, pending infrastructure).

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

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
- **Option A (default):** `/wf-verify <slug> <slice>` — [reason]
- **Option B:** `/wf-review <slug> <slice>` — skip verify [reason, if applicable]
- **Option C:** `/wf-plan <slug> <slice>` — revisit plan [reason, if applicable]
