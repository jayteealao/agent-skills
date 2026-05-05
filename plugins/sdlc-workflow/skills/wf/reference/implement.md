---
description: Implement one selected planned slice. Writes per-slice implementation record with cross-links to slice definition and plan.
argument-hint: <slug> [slice-slug|reviews]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-implement`, **stage 5 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | One of: (a) standard mode — `02-shape.md` + `04-plan-<slice-slug>.md` (or `04-plan.md` for single-scope); (b) compressed mode (`workflow-type: quick`) — `01-quick.md`; (c) forwarded mode (`workflow-type: rca` / `investigate`) — `02-shape.md` (synthesized) + optional `04-plan.md`. Other workflow-types (`hotfix`, `rf`, `dep-update`, `docs`) use their own implement commands. |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief — register, color strategy, anti-goals MUST be honored), `02c-craft.md` (visual contract — mock fidelity inventory items MUST be honored as acceptance criteria), `04b-instrument.md` (instrumentation signals MUST be added to the code), `04c-experiment.md` (feature flag/cohort wiring MUST be added), `05c-benchmark.md` (baseline — implementation MUST NOT regress), `augmentations:` list in `00-index.md` (every entry MUST be consumed per type — see Step 0.7) |
| Produces | `05-implement-<slice-slug>.md` + updates `05-implement.md` master |
| Next | `/wf verify <slug> <slice-slug>` (default) |
| Skip-to | `/wf review <slug> <slice-slug>` if verification is trivial |
| Special | `/wf implement <slug> reviews` — fix review findings one by one |

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
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`workflow-type`**.
3. **Check for reviews mode:** If the second argument is literally `reviews` → this is a **review-fix** invocation. See "Reviews Mode" section below. Skip the rest of Step 0 and go directly to that section.
4. **Determine workflow source mode** from `workflow-type`:
   - `workflow-type: quick` → **compressed mode**. Source artifact is `01-quick.md` (contains brief, shape, design, slice, and plan in a single document). No `02-shape.md` / `03-slice-*.md` / `04-plan-*.md` files exist; do not require them.
   - `workflow-type: rca` or `workflow-type: investigate` → **forwarded mode**. The source artifacts (`01-rca.md` / `01-investigate.md`) hold the rich context. A synthesized `02-shape.md` exists; planning may have been added later via `/wf plan` (full mode) or this may be a quick-style continuation.
   - `workflow-type: rf` (refactor) / `workflow-type: hotfix` / `workflow-type: dep-update` / `workflow-type: docs` → **alternate workflows**. These have their own implement stages and should NOT be using `/wf implement`. STOP and direct the user to the workflow's own implement command (e.g., `/wf-quick quick refactor`, `/wf-quick quick hotfix`).
   - `workflow-type: feature` (default for `wf-intake`) or unset → **standard mode**. Use the canonical pipeline files.
5. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. In compressed mode, slice-slug may be empty — `01-quick.md` covers a single intentional change.
6. **Check prerequisites by mode:**
   - **Compressed mode**: `01-quick.md` must exist. If missing → STOP. "Run `/wf-quick quick <slug>` first or use a different workflow type."
   - **Standard / forwarded mode**: A plan must exist for this slice: either `04-plan-<slice-slug>.md` or `04-plan.md`. If missing → STOP. Tell the user: "Run `/wf plan <slug> <slice-slug>` first."
   - If the source plan/quick artifact shows `Status: Awaiting input` → STOP.
   - Check if `05-implement-<slice-slug>.md` (or `05-implement.md` in compressed mode) already exists → WARN: "This has already been implemented. Running again will overwrite. Proceed?"
7. **Read the source context by mode:**
   - **Compressed mode**:
     - `01-quick.md` — single source for brief, shape, slice, and plan. Read end-to-end.
   - **Forwarded mode**:
     - `01-rca.md` or `01-investigate.md` — the rich source artifact (read for context beyond the synthesized shape).
     - `02-shape.md` — synthesized shape forwarding contract.
     - `04-plan.md` (if `/wf plan` was run after the forward) — full plan.
   - **Standard mode**:
     - `03-slice-<slice-slug>.md` — slice definition with acceptance criteria
     - `04-plan-<slice-slug>.md` — implementation plan
     - `02-shape.md` — shaped spec for overall context
   - All modes also read `po-answers.md` if it exists.
8. **Read augmentation context (optional — workflow may have any combination):**
   Read the `augmentations:` list in `00-index.md` if present. For each entry, read the referenced artifact and apply the type-specific behavior:

   | Type | Artifact | What `wf-implement` must do |
   |---|---|---|
   | `design-<sub>` (e.g., `design-harden`, `design-colorize`) | `design-notes/<sub>-<timestamp>.md` | Note that design code was already applied during a prior implement pass. Do NOT undo the documented changes. |
   | `design-audit` | `07-design-audit.md` | Note the audit findings — implementation should resolve any "critical" or "high" findings flagged. |
   | `design-critique` | `07-design-critique.md` | Note the critique recommendations — apply where they conflict with default choices. |
   | `instrument` | `04b-instrument.md` | **Implement the instrumentation signals defined in the plan.** Each dark-path entry has a designed signal — add the log/metric/trace call to the code being implemented. Use the framework named in the artifact. |
   | `experiment` | `04c-experiment.md` | **Wire up the experiment.** Add the feature flag, cohort split logic, and metric instrumentation defined in the artifact. The implementation must include both the variant and control paths. |
   | `benchmark` (status: baseline) | `05c-benchmark.md` | Note the baseline numbers — implementation must not regress. After implement completes, `/wf benchmark <slug>` should be re-run in compare mode (handled by wf-verify). |

   **Read design planning artifacts** (separate from augmentations):
   - `02b-design.md` — design brief if present. Carry forward register (brand/product), color strategy, and anti-goals.
   - **Recommended references** (only if `02b-design.md` is present): parse the `recommended-references:` array in its YAML frontmatter (e.g., `[colorize, typeset, harden]`). For each entry, read `skills/design/reference/<name>.md` from this plugin. These files are the canonical design rationale behind the brief — `colorize.md` explains what the chosen color strategy means in code, `typeset.md` defines typographic hierarchy rules, `harden.md` defines required accessibility checks, etc. Treat the loaded references as **read-only context for implementation judgment** — they help disambiguate the visual contract when a token choice or motion spec is open to interpretation. They do NOT expand scope: do not implement features described in the references that are not in the contract, and do not re-do design work. If an entry doesn't resolve to an existing file under `skills/design/reference/`, log a one-line warning to chat naming the missing reference and continue. If `02b-design.md` has no `recommended-references:` field, skip this step silently.
   - `02c-craft.md` — **visual contract** if present. The `## Mock fidelity inventory` items are **additional acceptance criteria** for this implementation — every inventory item must be honored in code. The `## Implementation contract` section names specific token choices, component decisions, and motion specs to follow.
9. **Read sibling implementations:** Check for any existing `05-implement-<other-slice>.md` files. Note what has already been implemented so you don't duplicate work or create conflicts.
10. **Carry forward** `open-questions` from the index.
11. **Branch check (MANDATORY if `branch-strategy: dedicated`):**
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

# Parallel research
Before implementing, launch parallel sub-agents to verify the plan is still accurate. Do not spin up sub-agents for trivial single-file changes.

### Explore sub-agent 1 — Pre-Implementation Codebase Verification

Prompt the agent with ALL of the following. It must report findings for each section:

**Plan drift detection:**
- For each file listed in `04-plan-<slice-slug>.md` → `## Likely Files / Areas to Touch`, read the current version and compare against the plan's assumptions
- Check `git log --oneline --since="<plan-created-at>"` on each affected file — has it been modified since the plan was written?
- If sibling slices were implemented between plan and now, read their `05-implement-<other>.md` to understand what changed
- Flag any file that has moved, been renamed, deleted, or significantly refactored since planning

**Current state of the implementation target:**
- Read each file that will be modified. Report: current line count, key functions/classes, any TODO/FIXME/HACK comments in the affected area
- Check for merge conflicts or uncommitted changes in the affected files (`git status`, `git diff` on those paths)
- Verify that imports, types, and interfaces the plan depends on still exist and have the same signatures

**Convention verification:**
- Read 2–3 recently modified files in the same module/directory to confirm the coding conventions the plan assumed (naming, error handling, logging patterns) haven't changed
- Check for new linting rules, config changes, or dependency updates that affect the implementation approach

### Explore sub-agent 2 — Dependency & API Freshness (only if external dependencies are involved)

Launch ONLY if the plan involves external APIs, third-party libraries, or cross-service communication. Prompt with:

**Dependency state:**
- Check if any dependency versions in the manifest changed since planning
- Web search for breaking changes, deprecations, or security advisories published since the plan was written
- Verify that API endpoints, SDK methods, or library functions the plan references still exist and have the same signatures in the project's version

**Cross-service state:**
- If the slice communicates with another service (API, queue, database), check that service's current schema/contract hasn't changed
- Check for new environment variables, config keys, or feature flags that affect the integration

Merge findings. If the codebase has diverged significantly, note specific deviations in the implementation record and adapt the plan steps before implementing.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices. Write a per-slice implementation record with cross-links.

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
- **Conditional inputs are mandatory when present.** If any file listed in the *Conditional inputs* row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut.

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

**Option A (default): Verify** → `/wf verify <slug> <slice-slug>`
Use when: The implementation touches testable behavior.
**Compact recommended before proceeding** — implementation details (debugging, file exploration, error resolution) are noise for verification. Tell the user: "Consider running `/compact` before `/wf verify` — the PreCompact hook will preserve workflow state."

**Option B: Skip to Review** → `/wf review <slug> <slice-slug>`
Use when: Purely declarative change with no testable behavior.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Plan** → `/wf plan <slug> <slice-slug>`
Use when: The plan was wrong — missed files, wrong assumptions.

**Option D: Blocked** → explain what's blocking.

# Reviews Mode — fix review findings one by one
Triggered when: second argument is literally `reviews`.

Example: `/wf implement my-slug reviews`

This mode reads the review findings from `07-review-<slice-slug>.md`, extracts all BLOCKER and HIGH findings (and optionally MED if the user requests), then fixes them **one at a time, sequentially** using sub-agents.

Do this in order for reviews mode:
1. **Resolve the slice-slug.** If a slice-slug was passed as a third argument (e.g., `/wf implement my-slug auth-flow reviews`), use it. Otherwise use `selected-slice-or-focus` from `00-index.md`. If neither is set, ask the user which slice's review findings to fix.
2. **Read `07-review-<slice-slug>.md`** and all `07-review-<slice-slug>-<command>.md` files for that slice. Other slices' review files are out of scope for this fix pass.
3. **Extract the findings list.** Build an ordered list of findings to fix, sorted by severity (BLOCKER first, then HIGH, then MED if requested). Each finding has: ID, severity, file:line, issue description, suggested fix.
4. **Create task list from findings.** For each finding, use TaskCreate:
   - `subject: "Fix [{ID}] {SEVERITY}: {title}"`, `activeForm: "Fixing [{ID}]: {title}"`.
   - `description: "Location: {file}:{line}\nIssue: {description}\nFix: {suggestion}"`.
   - `metadata: { slug, stage: "implement-reviews", slice: "<slice-slug>", findingId: "{ID}", severity: "{SEVERITY}" }`.
   - Findings are independent — no `addBlockedBy` between them.
   - Add bookkeeping tasks at the end:
     - "Update 07-review-<slice-slug>.md fix status" — `addBlockedBy: [all finding tasks]`
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
   a. Mark "Update 07-review-<slice-slug>.md" task `in_progress`. Write/update `05-implement-<slice-slug>.md` with a `## Review Fixes Applied` section listing all findings and their resolution status.
   b. Update `05-implement.md` master index.
   c. **Update `07-review-<slice-slug>.md`:** Add a `## Fix Status` section at the bottom:
      ```
      ## Fix Status
      | ID | Severity | Status | Notes |
      |----|----------|--------|-------|
      | {ID} | {sev} | Fixed / Partially Fixed / Could Not Fix | {notes} |
      ```
   d. Update `00-index.md`. Mark task `completed`.
   e. Mark "Atomic commit" task `in_progress`. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):** Stage all changed files and commit with message: `fix(<slug>): review fixes for <slice-slug>`. Record commit SHA. Do NOT push. Mark `completed`. If `branch-strategy` is `none`, `TaskUpdate(status: "deleted")`.

7. **Evaluate adaptive routing:**

**Option A (default): Re-verify** → `/wf verify <slug> <slice-slug>`
Use when: Fixes were applied. Need to confirm everything still passes.
**Compact recommended** — review fix context (finding details, sub-agent output) is noise for re-verification.

**Option B: Re-review** → `/wf review <slug> <slice-slug>`
Use when: Some findings could not be fixed and need re-assessment.
**Compact recommended** — fresh review needs clean context.

**Option C: Handoff** → `/wf handoff <slug> <slice-slug>`
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
next-invocation: "/wf verify <slug> <slice-slug>"
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
next-invocation: "/wf verify <slug> <slice-slug>"
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

## Visual Contract Honored (only if `02c-craft.md` was present)
For each item in `02c-craft.md` → `## Mock fidelity inventory`, confirm honored or note deviation:
- <inventory item> — honored at <file:line> | deviation: <what differs and why>
- ...

## Deviations from Plan
- ...

## Anything Deferred
- ...

## Known Risks / Caveats
- ...

## Freshness Research

## Recommended Next Stage
- **Option A (default):** `/wf verify <slug> <slice-slug>` — [reason]
- **Option B:** `/wf review <slug> <slice-slug>` — skip verify [reason, if applicable]
