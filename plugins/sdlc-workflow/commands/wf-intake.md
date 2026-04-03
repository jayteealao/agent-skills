---
name: wf-intake
description: Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.
argument-hint: <task description>
disable-model-invocation: true
---

You are running `wf-intake`, **stage 1 of 10** in the SDLC lifecycle.

# Pipeline
`1·intake` → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | *(nothing — this is the first stage)* |
| Produces | `01-intake.md` |
| Next | `/wf-shape <slug>` (default) |
| Skip-to | `/wf-plan <slug>` if the task is trivially scoped and needs no shaping or slicing |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT attempt to diagnose, debug, fix, implement, design, or otherwise work on the user's task.
- Do NOT jump ahead to later lifecycle stages (shaping, planning, implementation, etc.).
- Treat `$ARGUMENTS` as **raw input to be captured and processed through this stage's workflow** — not as a request to act on.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Derive the slug** from `$ARGUMENTS`. Use the task description to create a lowercase kebab-case slug. If `$ARGUMENTS` looks like an existing slug, use it.
2. **Check if the workflow already exists** at `.ai/workflows/<slug>/00-index.md`.
   - If it exists and `stage-status` is `Awaiting input` on this stage → this is a **resume**. Read the existing `01-intake.md` and `po-answers.md`. Pick up from where the previous run left off instead of starting fresh.
   - If it exists and `current-stage` is past intake → WARN: "Intake has already been completed. Running it again will overwrite `01-intake.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat. Only proceed if confirmed.
   - If it does not exist → this is a fresh start. Proceed normally.
3. **Carry forward** any `open-questions` from the index if resuming.

# Purpose
Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` frontmatter must always have: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `open-questions`, `tags`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and (if slices exist) `slices`.
- **Use AskUserQuestion** for multiple-choice PO questions (branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance). Use freeform chat for open-ended questions (requirements, constraints, acceptance criteria). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research when supported. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Inputs: `$ARGUMENTS` (full raw request), `$0` (first token if supplied).

Do this in order:
1. Parse the request and derive the workflow slug.
2. Create `.ai/workflows/<slug>/` directory. Write `00-index.md` using the index template below. Create `po-answers.md` if missing.
3. Ask focused product-owner questions in two batches:
   **Batch A — Structured questions (use AskUserQuestion):**
   Call AskUserQuestion with these questions (adjust based on what's already known from `$ARGUMENTS`):
   ```
   Question 1:
     question: "What branch strategy should this workflow use?"
     header: "Branch"
     options:
       - label: "Dedicated (Recommended)"
         description: "New feature branch, PR at handoff, rebase+merge at ship. Best for tracked, reviewable work."
       - label: "Shared"
         description: "Commits on current branch, no PR created. Good for quick fixes on an existing branch."
       - label: "None"
         description: "No git management. Workflow artifacts only, you handle commits yourself."
     multiSelect: false

   Question 2:
     question: "What is the appetite for this work?"
     header: "Appetite"
     options:
       - label: "Small"
         description: "A few hours. Single file or minor change. No slicing needed."
       - label: "Medium"
         description: "A day or two. Multiple files, may benefit from slicing."
       - label: "Large"
         description: "Multiple days. Definitely needs slicing and incremental delivery."
     multiSelect: false
   ```
   If the user chose "Dedicated" for branch strategy, follow up (in chat or a second AskUserQuestion) for:
   - Preferred branch name (default: `feat/<slug>`)
   - Base branch (default: `main` or `master`, whichever exists)

   **Batch B — Freeform questions (in chat):**
   Ask 2-5 additional questions covering:
   - desired outcome and who benefits
   - concrete success criteria
   - explicit non-goals
   - timeline, compliance, operational, or platform constraints
   - already-decided technical constraints or vendor choices
4. Capture ALL answers (structured + freeform) in `po-answers.md`.
5. Run freshness research for any external technology, dependency, platform, API, or standard that is mentioned or obviously implicated.
6. Write the intake brief without designing the implementation.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
9. Write `.ai/workflows/<slug>/01-intake.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `/wf-shape`. Evaluate the intake and present the user with ALL viable options:

**Option A (default): Shape** → `/wf-shape <slug>`
Use when: The task has ambiguity in behavior, acceptance criteria, or scope. Most tasks should go here.

**Option B: Skip to Plan** → `/wf-plan <slug>`
Use when: The task is a well-understood, single-scope fix (e.g., "bump version X", "rename variable Y", "fix typo in Z"). No behavior ambiguity, no slicing needed. Criteria: ≤3 files likely touched, single acceptance criterion, no edge cases worth capturing.

**Option C: Blocked — re-run intake** → `/wf-intake <slug>`
Use when: Required PO answers are still missing. Mark `Status: Awaiting input`.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `00-index.md` with this structure:

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<human-readable title>"
status: active
current-stage: intake
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: ""
branch-strategy: <dedicated|shared|none>
branch: "<feat/slug or empty>"
base-branch: "<main|master|develop>"
pr-url: ""
pr-number: 0
open-questions: []
tags: []
next-command: wf-shape
next-invocation: "/wf-shape <slug>"
workflow-files:
  - 00-index.md
  - 01-intake.md
  - po-answers.md
progress:
  intake: in-progress
  shape: not-started
  slice: not-started
  plan: not-started
  implement: not-started
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```

(No markdown body needed in the index — frontmatter IS the content.)

---

Write `01-intake.md` with this structure:

```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf-shape <slug>"
---
```

# Intake

## Restated Request

## Intended Outcome

## Primary User / Actor

## Known Constraints
- ...

## Assumptions
- ...

## Product Owner Questions Asked
- ...

## Product Owner Answers
- ...

## Unknowns / Open Questions
- ...

## Dependencies / External Factors
- ...

## Risks if Misunderstood
- ...

## Success Criteria
- ...

## Out of Scope for Now
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf-shape <slug>` — [reason]
- **Option B:** `/wf-<other> <slug>` — [reason, if applicable]
- **Option C:** Blocked — [what's missing]

If required answers are still missing, set frontmatter `status: awaiting-input` and set `next-invocation` to rerun `/wf-intake <same-slug>` after answers arrive.
