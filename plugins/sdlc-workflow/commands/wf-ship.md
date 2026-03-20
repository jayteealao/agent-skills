---
name: wf-ship
description: Assess release readiness, ask mandatory rollout questions, and define rollout plus rollback.
argument-hint: <slug> [target-or-slice]
disable-model-invocation: true
---

You are running `wf-ship`, **stage 9 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro

| | Detail |
|---|---|
| Requires | `08-handoff.md` |
| Produces | `09-ship.md` |
| Next | `/wf-retro <slug>` (if ready) or `/wf-implement <slug> <slice>` (if blockers need code changes) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT actually deploy, push, merge, or run release commands.
- Do NOT fix code — if blockers require code changes, recommend returning to `/wf-implement`.
- Your job is to **assess release readiness, ask rollout questions, and define rollout/rollback plans**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start deploying or fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **target or slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `08-handoff.md` must exist. If missing → STOP. Tell the user: "Run `/wf-handoff <slug>` first."
   - If `08-handoff.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past ship → WARN: "Stage 9 (ship) has already been completed. Running it again will overwrite `09-ship.md`. Proceed?"
4. **Read** `08-handoff.md` and `po-answers.md`. Skim `05-implement.md` and `07-review.md` for release context.
5. **Resolve the slice/target**: If a second argument was passed, use it. If not, use `selected-slice-or-focus` from the index.
6. **Carry forward** `open-questions` from the index.

# Purpose
Assess release readiness, ask mandatory rollout questions, and define rollout plus rollback.

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

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Do this in order:
1. Ask the product owner or release owner the minimum required rollout questions:
   - target environment and release window
   - rollout preference: immediate, staged, canary, feature flag, maintenance window
   - rollback tolerance and business risk
   - whether there are stakeholder communication or compliance requirements
2. Capture answers in `po-answers.md`.
3. Run freshness research on deployment target, platform changes, vendor advisories, current release notes, migration notes, and known incidents that affect release readiness.
4. Produce a release-readiness assessment with rollout and rollback guidance.
5. Recommend `/wf-retro <slug>` if ready or `/wf-implement <slug> <selected-slice>` if blockers require code changes.
6. Update `00-index.md` accordingly.
7. Write `.ai/workflows/<slug>/09-ship.md`.

Write `09-ship.md` with this structure:

# Ship

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice / Target:

## Questions Asked This Stage
- ...

## Answers Captured This Stage
- ...

## Release Readiness

## Key Release Risks
- ...

## Preconditions
- ...

## Recommended Rollout Strategy
- ...

## Post-Deploy Validation
- ...

## Rollback Triggers
- ...

## Rollback Plan
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Go / No-Go Recommendation

## Recommended Next Stage
- Stage:
- Command:
- Invocation:
