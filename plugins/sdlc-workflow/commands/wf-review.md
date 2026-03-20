---
name: wf-review
description: Review the diff like a senior engineer and decide whether the work is ready for handoff.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-review`, **stage 7 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `05-implement.md`, `06-verify.md` |
| Produces | `07-review.md` |
| Next | `/wf-handoff <slug> <selected-slice>` (if approved) or `/wf-implement <slug> <selected-slice>` (if changes needed) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix issues you find — only report and prioritise them. Fixes belong in `/wf-implement`.
- Do NOT handoff or ship — those are later stages.
- Your job is to **review the diff and produce a verdict with prioritised findings**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Check prerequisites:**
   - `05-implement.md` and `06-verify.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `06-verify.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve it first.
   - If `current-stage` in the index is already past review → WARN: "Stage 7 (review) has already been completed. Running it again will overwrite `07-review.md`. Proceed?"
4. **Read** `02-shape.md`, `05-implement.md`, `06-verify.md`, and `po-answers.md`.
5. **Resolve the slice**: If a slice was passed as the second argument, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
6. **Carry forward** `open-questions` from the index.

# Parallel review (use sub-agents when supported)
When the diff spans multiple concerns, launch parallel review sub-agents:
- **Explore sub-agent 1:** Scan for correctness issues — logic flaws, edge cases, regressions, data integrity.
- **Explore sub-agent 2:** Scan for quality issues — maintainability, naming, duplication, unnecessary complexity.
- **Sub-agent 3:** If the change touches security-sensitive areas (auth, crypto, PII, SQL, file I/O), run a focused security scan.
- **Sub-agent 4:** If external API contracts or dependency behavior matter, run a freshness pass.
- Merge findings, deduplicate, and prioritise. Do not spin up sub-agents for small, single-concern diffs.

# Purpose
Review the diff like a senior engineer and decide whether the work is ready for handoff.

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
1. Inspect the current diff or the files changed (using parallel sub-agents if multi-concern).
2. Review for correctness, missed edge cases, regressions, maintainability, security, performance, data integrity, and observability.
3. If external dependency behavior or current best practices matter to the review, run a small freshness pass and record it.
4. Produce a prioritized review verdict.
5. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
6. Update `00-index.md` accordingly.
7. Write `.ai/workflows/<slug>/07-review.md`.

# Adaptive routing — evaluate what's actually next
After completing the review, evaluate the findings and present the user with ALL viable options:

**Option A: Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: No blocking issues. The implementation is approved (possibly with minor nice-to-have notes).

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: There are blocking issues that must be fixed. Clearly list what needs changing.

**Option C: Skip handoff, go to Ship** → `/wf-ship <slug> <selected-slice>`
Use when: The handoff stage adds no value — e.g., the user IS the reviewer and deployer, there's no team to hand off to, and the PR description is not needed.

**Option D: Next slice** → `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>`
Use when: This slice is approved AND there are more slices to implement. Check `03-slice.md` for the next unfinished slice. If the next slice already has a plan, suggest implement; otherwise suggest plan.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `07-review.md` with this structure:

# Review

## Metadata
- Slug:
- Status:
- Updated:
- Selected Slice:

## Review Verdict

## Blocking Issues
- ...

## Should-Fix Issues
- ...

## Nice-to-Have Improvements
- ...

## What Looks Good
- ...

## Open Questions
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A:** `/wf-handoff <slug> <slice>` — approved [reason]
- **Option B:** `/wf-implement <slug> <slice>` — fix blocking issues [reason, if applicable]
- **Option C:** `/wf-ship <slug> <slice>` — skip handoff [reason, if applicable]
- **Option D:** `/wf-plan <slug> <next-slice>` — next slice [reason, if applicable]
