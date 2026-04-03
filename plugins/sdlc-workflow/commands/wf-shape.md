---
name: wf-shape
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
disable-model-invocation: true
---

You are running `wf-shape`, **stage 2 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` |
| Next | `/wf-slice <slug>` (default) |
| Skip-to | `/wf-plan <slug>` if the shaped spec is a single coherent unit that does not benefit from slicing |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start designing, architecting, implementing, or coding the solution.
- Do NOT jump ahead to slicing, planning, or implementation.
- Your job is to produce a **mini-spec with acceptance criteria** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` must exist. If missing → STOP. Tell the user: "Run `/wf-intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open intake questions first.
   - If `current-stage` in the index is already past shape → WARN: "Stage 2 (shape) has already been completed. Running it again will overwrite `02-shape.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat.
4. **Read** `01-intake.md` and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Parallel research (use sub-agents when supported)
When the shaped spec touches multiple domains, launch parallel sub-agents:
- **Explore agent 1:** Scan the existing codebase for affected modules, existing patterns, conventions, and test structure relevant to the shaped work.
- **Explore agent 2:** Web search for freshness on external dependencies, APIs, frameworks, or standards mentioned in the intake.
- Merge findings into the stage file. Do not spin up sub-agents for trivial or single-domain work.

# Purpose
Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (risk tolerance, appetite, structured decisions). Use freeform chat for open-ended questions (behavior, acceptance criteria, non-goals). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research when supported. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**Mandatory-question stage** when acceptance, user behavior, or non-goals are still ambiguous.

Do this in order:
1. Reuse any settled decisions from intake rather than re-asking them.
2. Ask product-owner questions only for unresolved behavior, acceptance, non-goals, or sequencing that materially changes the spec. Use AskUserQuestion for structured choices where applicable:
   ```
   Question (if risk tolerance is unclear):
     question: "What is the risk tolerance for this change?"
     header: "Risk"
     options:
       - label: "Conservative"
         description: "Minimize blast radius. Feature flags, extra validation, gradual rollout."
       - label: "Balanced (Recommended)"
         description: "Standard testing and review. Ship when verified."
       - label: "Move fast"
         description: "Minimal ceremony. Accept higher risk for speed."
     multiSelect: false
   ```
   Use freeform chat questions for behavior, acceptance criteria, non-goals, and sequencing — these are too context-dependent for structured options.
3. Run freshness research (using parallel sub-agents if multi-domain) for external dependencies, patterns, APIs, standards, and known issues that could change the spec.
4. Produce a small behavior-focused mini-spec.
5. **Documentation plan (Diátaxis):** Using the shaped spec, classify what documentation this feature needs. Apply the Diátaxis model:
   - Does this introduce new API surface or config? → needs **reference** docs
   - Does this add user-facing behavior? → needs a **how-to guide**
   - Is this a major new capability for new users? → needs a **tutorial**
   - Does this involve architectural decisions or trade-offs? → needs an **explanation** page
   - Does this significantly change the project's capabilities? → needs a **README update**
   - Write the classification into `## Documentation Plan` in the shape file. For each identified doc, note: type, target audience, what it must cover, what it must NOT cover (boundary discipline).
   - If no user-facing docs are needed (pure internal refactor, test-only change), write "None required" with reasoning.
6. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` with the recommended default option.
8. Write `.ai/workflows/<slug>/02-shape.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `/wf-slice`. Evaluate the shaped spec and present the user with ALL viable options:

**Option A (default): Slice** → `/wf-slice <slug>`
Use when: The spec covers multiple distinct areas, has more than one acceptance criterion cluster, or would benefit from incremental delivery.

**Option B: Skip to Plan** → `/wf-plan <slug>`
Use when: The shaped spec is a single coherent unit — one clear scope, one acceptance path, no meaningful way to split it further. Criteria: single concern, ≤5 files likely touched, one delivery unit.

**Option C: Revisit Intake** → `/wf-intake <slug>`
Use when: Shaping revealed that the intake brief is wrong, missing key constraints, or fundamentally misunderstands the problem.

**Option D: Blocked — re-run shape** → `/wf-shape <slug>`
Use when: Required PO answers are still missing.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `02-shape.md` with this structure:

```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: <true|false>
docs-types: [<reference|how-to|tutorial|explanation|readme>]
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf-slice <slug>"
---
```

# Shape

## Problem Statement

## Primary Actor / User

## Desired Behavior

## Acceptance Criteria
- Given ... When ... Then ...

## Non-Functional Requirements
- ...

## Edge Cases / Failure Modes
- ...

## Affected Areas
- ...

## Dependencies / Sequencing Notes
- ...

## Questions Asked This Stage
- ...

## Answers Captured This Stage
- ...

## Out of Scope
- ...

## Definition of Done
- ...

## Documentation Plan
Classify using Diátaxis. For each doc needed, specify:
- **Type**: tutorial / how-to / reference / explanation / readme-update
- **Audience**: beginner / competent user / maintainer
- **Must cover**: ...
- **Must NOT cover** (boundary): ...
- **Target location**: where in the repo this doc should live

If no docs needed: "None required — [reason]"

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-slice <slug>` — [reason]
- **Option B:** `/wf-plan <slug>` — [reason, if single-scope]
- **Option C:** `/wf-intake <slug>` — revisit intake [reason, if applicable]
