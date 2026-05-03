---
name: wf-handoff
description: Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates ALL complete slices by default — pass a slice-slug only when each slice has its own separate PR.
argument-hint: <slug> [slice-slug]
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-handoff`, **stage 8 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·handoff` → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `05-implement-<slice-slug>.md` AND `07-review-<slice-slug>.md` for every slice in scope (handoff aggregates one review per slice — there is no longer a single workflow-wide `07-review.md`) |
| Optional inputs | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `augmentations:` list (every augmentation gets reviewer-visible context in the handoff package — translated to product/user language per External Output Boundary) |
| Produces | `08-handoff.md` — one document covering all complete slices (or one slice if explicitly scoped) |
| Next | `/wf-ship <slug>` (default) |
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
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** — parse `current-stage`, `status`, `selected-slice-or-focus`, `open-questions`, `branch-strategy`, `branch`, `base-branch`.
3. **Resolve handoff scope** — determines which slice artifacts this handoff covers:
   - **Explicit slice mode**: A slice-slug was passed as the second argument → scope to that one slice only. Use this when each slice ships as its own separate PR. Skip to step 4 using that single slice.
   - **Aggregate mode** (default — no second argument): Read `03-slice.md`. Collect every slice entry with `status: complete` or `status: in-progress`. These are the slices on the feature branch being handed off. If no complete/in-progress slices exist → STOP: "No implemented slices found. Run `/wf-implement <slug> <slice>` first."
4. **Check prerequisites for each slice in scope:**
   - `05-implement-<slice-slug>.md` must exist for every slice in scope. List any missing and STOP: "Run `/wf-implement <slug> <slice>` for each missing slice."
   - `07-review-<slice-slug>.md` must exist for every slice in scope. List any missing and STOP: "Run `/wf-review <slug> <slice>` for each missing slice — every slice in the handoff scope must have its own review."
   - For each `07-review-<slice-slug>.md`, parse the `verdict:` and `metric-findings-blocker:` fields in the YAML frontmatter. If ANY slice's verdict is `dont-ship`, or any slice has `metric-findings-blocker > 0` with no resolution recorded in `## Fix Status`, STOP. Print the offending slice slug(s) and tell the user to resolve via `/wf-implement <slug> <slice> reviews` first.
   - If `current-stage` in the index is already past handoff → WARN before overwriting.
5. **Read full context:**
   - `02-shape.md` — overall spec and docs plan
   - `03-slice.md` — master index (slice statuses)
   - For each slice in scope: `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (if exists), `07-review-<slice-slug>.md` (review verdict and all findings for that slice)
   - `po-answers.md`
6. **Read augmentation context (optional — surfaces all augmentation work for the reviewer):**
   Read `02b-design.md` and `02c-craft.md` if present for register, anti-goals, and visual contract. The mock fidelity inventory items are user-visible changes the PR description should highlight (translated to product language).

   Read the `augmentations:` list in `00-index.md`. Every entry must appear in the handoff package's `## Design Changes` and/or `## Reviewer Focus Areas` section. Per-type translation:

   | Type | Reviewer-visible mention (in product language) |
   |---|---|
   | `design-harden` | "Accessibility improvements applied — N components updated, axe-core scan clean" |
   | `design-optimize` | "Performance improvements — measured Xms reduction in [metric]" |
   | `design-adapt` | "Improved mobile/tablet/dark-mode behavior" |
   | `design-colorize` / `design-typeset` / `design-polish` etc. | "Visual refresh of [surface area]" |
   | `design-audit` / `design-critique` | "Design quality review pass — N findings addressed" |
   | `instrument` | "Added observability — N signals (logs/metrics/traces) for previously unobserved code paths" |
   | `experiment` | "Wrapped behind feature flag with cohort split for measured rollout" |
   | `benchmark` | "Performance baseline taken; verify-stage comparison: <within tripwires / regression>" |

   Do NOT cite workflow artifact paths or sub-command names in any external-facing field of the handoff package or PR.
7. **Carry forward** `open-questions` from the index.

# Purpose
Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
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
2. **Create task list.** Use TaskCreate for the handoff sequence. All metadata: `{ slug, stage: "handoff", slices: "<comma-separated list of slice-slugs in scope>", mode: "<aggregate|single-slice>" }`.
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

**Option A (default): Ship** → `/wf-ship <slug>`
Use when: The PR is created, all complete slices are covered, and the work needs deployment planning, rollout strategy, and rollback guidance.

**Option B: Skip to Retro** → `/wf-retro <slug>`
Use when: Shipping is handled entirely outside this workflow (e.g., CI/CD auto-deploys on merge, or shipping is someone else's responsibility). The handoff document IS the final deliverable.

**Option C: Implement remaining slices first** → `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>`
Use when: `03-slice.md` shows slices still in `status: defined` that belong on this branch. Implement them, then re-run `/wf-handoff <slug>` to update the PR description with the full picture. Do NOT ship until all intended slices are complete.

**Option D: Fix** → `/wf-implement <slug> <selected-slice>`
Use when: While writing the handoff, you realised something is wrong or missing in a specific slice's implementation.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `08-handoff.md` with this structure:

```yaml
---
schema: sdlc/v1
type: handoff
slug: <slug>
slice-slugs: [<slug-1>, <slug-2>, ...]   # all slices covered by this handoff
handoff-mode: <aggregate|single-slice>   # aggregate = all complete slices; single-slice = explicit override
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
  slice-index: 03-slice.md
  implements: [05-implement-<slug-1>.md, 05-implement-<slug-2>.md, ...]
  reviews: [07-review-<slug-1>.md, 07-review-<slug-2>.md, ...]
next-command: wf-ship
next-invocation: "/wf-ship <slug>"
---
```

# Handoff

## PR Title Options
1. ...

## Summary

## Problem

## Solution

## Augmentations Applied (only if `augmentations:` list is non-empty)
List every augmentation in user-facing language. Do NOT cite workflow artifact paths or sub-command names — translate per the External Output Boundary. Group by category for readability:

**Design improvements**: <list — accessibility, performance, responsive, visual refresh, etc.>
**Observability**: <list — N new signals for previously unobserved code paths>
**Experimentation**: <list — feature flag wiring, cohort split, metrics>
**Performance**: <list — baseline taken, compare-mode results>

For each: include user-visible effect and the verification evidence path.

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
- **Option A (default):** `/wf-ship <slug>` — [reason]
- **Option B:** `/wf-retro <slug>` — skip ship [reason, if applicable]
- **Option C:** `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>` — implement remaining slices before shipping [reason, if applicable]
- **Option D:** `/wf-implement <slug> <slice>` — fix issue found while writing handoff [reason, if applicable]
