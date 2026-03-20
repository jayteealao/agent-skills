---
name: wf-verify
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

You are running `wf-verify`, **stage 6 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md` |
| Produces | `06-verify-<slice-slug>.md` + updates `06-verify.md` master |
| Next | `/wf-review <slug> <selected-slice>` (if passing) or `/wf-implement <slug> <selected-slice>` (if fixes needed) |
| Skip-to | `/wf-handoff <slug> <slice>` if review is unnecessary (solo project, trivial change, already peer-reviewed externally) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix issues you find — only report them. Fixes belong in `/wf-implement`.
- Do NOT review, handoff, or ship — those are later stages.
- Your job is to **run checks and compare results against acceptance criteria**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `stage-status`, `selected-slice-or-focus`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - `05-implement-<slice-slug>.md` must exist. If missing → STOP. Tell the user: "Run `/wf-implement <slug> <slice-slug>` first."
   - If it shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` already exists → WARN: "This slice has already been verified. Running again will overwrite. Proceed?"
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — acceptance criteria to verify against
   - `04-plan-<slice-slug>.md` — what was planned (to check deviations)
   - `05-implement-<slice-slug>.md` — what was actually implemented
   - `02-shape.md` — overall spec context
   - `po-answers.md`
6. **Carry forward** `open-questions` from the index.

# Parallel verification (use sub-agents when supported)
When verification spans multiple concerns, launch parallel sub-agents:
- **Sub-agent 1:** Run lint, typecheck, and build checks.
- **Sub-agent 2:** Run unit and integration tests.
- **Sub-agent 3:** If the change touches UI/frontend, run accessibility or visual checks.
- **Sub-agent 4:** If external dependency freshness could affect test results, run a freshness check.
- Merge all results. Do not spin up sub-agents when a single test command covers everything.

# Purpose
Verify that the selected slice meets acceptance criteria and is ready for review.

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
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. Run or evaluate the most relevant checks (using parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks.
4. Compare the results with the acceptance criteria from `03-slice-<slice-slug>.md` and `02-shape.md`.
5. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
6. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below).
8. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
9. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next
After completing verification, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `/wf-review <slug> <selected-slice>`
Use when: All checks pass. Acceptance criteria are met. Ready for a code review.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Tests fail, lint errors, type errors, or acceptance criteria are not met. Clearly describe what needs fixing.

**Option C: Skip review, go to Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: This is a solo project with no reviewer, OR the change was already externally reviewed (e.g., pair-programmed), OR it's a trivial fix where formal review adds no value. Only suggest this when there is a clear reason.

**Option D: Revisit Plan** → `/wf-plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental flaw in the approach, not just a bug — the plan itself needs rethinking.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `06-verify.md` (master index):

# Verify Index

## Metadata
- Slug:
- Status:
- Updated:
- Slices Verified: {N} of {total}

## Verify Files
| Slice | Verify File | Result | Implement | Plan |
|-------|-------------|--------|-----------|------|
| `<slice-slug>` | [06-verify-<slice-slug>.md](./06-verify-<slice-slug>.md) | Pass/Fail | [05-implement-<slice-slug>.md](./05-implement-<slice-slug>.md) | [04-plan-<slice-slug>.md](./04-plan-<slice-slug>.md) |

## Recommended Next Stage
- **Option A:** `/wf-review <slug> <slice-slug>` — [reason]

---

Write `06-verify-<slice-slug>.md` (per-slice verify):

# Verify: <slice-name>

## Metadata
- Slug: <workflow-slug>
- Slice: `<slice-slug>`
- Status: Complete
- Updated:

## Cross-Links
- **Master verify index:** [06-verify.md](./06-verify.md)
- **Slice definition:** [03-slice-<slice-slug>.md](./03-slice-<slice-slug>.md)
- **Plan:** [04-plan-<slice-slug>.md](./04-plan-<slice-slug>.md)
- **Implementation:** [05-implement-<slice-slug>.md](./05-implement-<slice-slug>.md)
- **Review (when created):** [07-review.md](./07-review.md)

## Verification Summary

## Checks Run
- command/check: result

## Acceptance Criteria Status
- criterion (from slice definition): met / partially met / not met / unverified

## Issues Found
- severity: issue

## Gaps / Unverified Areas
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommendation

## Recommended Next Stage
- **Option A:** `/wf-review <slug> <slice-slug>` — [reason]
- **Option B:** `/wf-implement <slug> <slice-slug>` — fix issues [reason, if applicable]
- **Option C:** `/wf-handoff <slug> <slice-slug>` — skip review [reason, if applicable]
