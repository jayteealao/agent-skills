---
name: wf-skip
description: Advance a workflow past a stage without running it. Writes a skip record and a minimal stub artifact for the skipped stage (so downstream commands don't error on missing prerequisites), then updates 00-index.md to the next stage. Requires a reason. Warns loudly on high-risk skips (verify, review). Cannot skip intake, implement, or ship.
argument-hint: <slug> <stage> [reason]
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-skip`, the **stage-skip utility** for the SDLC lifecycle.

# What this command does
Advances a workflow past a named stage without running it. Writes:
1. `skip-<stage>.md` — the skip record (who, when, why, what was bypassed)
2. A **minimal stub** for the skipped stage's expected artifact — so downstream commands that check for `02-shape.md`, `03-slice.md`, etc. do not error on a missing prerequisite
3. Updated `00-index.md` — `current-stage`, `progress`, `next-command`, `next-invocation`

# Skippable stages

| Stage | Normal artifact | Stub written on skip | Next stage after skip |
|-------|-----------------|---------------------|----------------------|
| `shape` | `02-shape.md` | `02-shape.md` (stub) | `slice` |
| `slice` | `03-slice.md` | `03-slice.md` (stub) | `plan` |
| `plan` | `04-plan.md` | `04-plan.md` (stub) | `implement` |
| `design` | `02b-design.md` | `02b-design.md` (stub) | `slice` |
| `verify` | `06-verify.md` | `06-verify.md` (stub) | `review` |
| `review` | `07-review-<slice-slug>.md` | `07-review-<slice-slug>.md` (stub — written for the resolved slice; sibling slices are unaffected) | `handoff` |
| `handoff` | `08-handoff.md` | `08-handoff.md` (stub) | `ship` |
| `retro` | `10-retro.md` | `10-retro.md` (stub) | complete |

# Unskippable stages

| Stage | Reason |
|-------|--------|
| `intake` | Intake is the workflow — there is nothing to skip from. Use `/wf-close` if you want to abandon the workflow before starting. |
| `implement` | You cannot skip the actual work. If the work was done outside the workflow, use `/wf-close <slug> completed-externally`. |
| `ship` | Shipping is the purpose. If the work should not ship, use `/wf-close <slug> cancelled`. |

# High-risk skips (require explicit confirmation)
Skipping `verify` or `review` bypasses the quality gates. These are **warn-and-require-confirmation** — do NOT skip silently:
- If skipping `verify`: WARN: "Skipping verification means no test results, no acceptance criteria confirmation, and no observable signal that the implementation worked. Are you sure? (yes to proceed)"
- If skipping `review`: WARN: "Skipping code review removes the safety check before handoff. Are you sure? (yes to proceed)"

Use AskUserQuestion if available. If the user confirms, proceed. If not, STOP.

# CRITICAL — scope discipline
- Do NOT run the stage being skipped. Do NOT do any of the stage's work.
- Do NOT modify any application code.
- Your only output is the skip record, the stub artifact, and the updated index.
- Follow the steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Parse `$ARGUMENTS`:**
   - First argument: slug
   - Second argument: stage name (must match a skippable stage — case-insensitive, accept aliases: `shape`=`2`, `slice`=`3`, `plan`=`4`, `verify`=`6`, `review`=`7`, `handoff`=`8`, `retro`=`10`)
   - Remaining arguments: reason (optional — if not provided, ask in Step 1)
2. **Validate the slug:**
   - If `.ai/workflows/<slug>/00-index.md` does not exist → STOP: "No workflow `<slug>` found."
3. **Validate the stage:**
   - If stage is `intake`, `implement`, or `ship` → STOP with the unskippable reason from the table above.
   - If stage is not in the skippable list → STOP: "Unknown stage `<stage>`. Skippable stages: shape, slice, plan, design, verify, review, handoff, retro."
4. **Check if stage is already skipped or complete:**
   - Read `00-index.md` `progress` field. If `<stage>: skipped` or `<stage>: complete` already → WARN: "Stage `<stage>` is already marked `<status>` in this workflow. Skipping again will overwrite the skip record. Proceed? (yes to continue)"
5. **Check stage ordering:**
   - Read `current-stage` from `00-index.md`.
   - If the requested skip stage is MORE THAN ONE stage ahead of `current-stage` → WARN: "You are at `<current-stage>` but skipping `<stage>` which is `<N>` stages ahead. Stages between them will also be effectively skipped — they will remain incomplete. Run `/wf-skip <slug> <intermediate-stage>` for each intermediate stage, or confirm you want to jump `<N>` stages. (yes to proceed)"
6. **Read full workflow context:**
   - Read `00-index.md` frontmatter: `current-stage`, `status`, `branch-strategy`, `branch`, `base-branch`, `progress`, `next-command`, `next-invocation`, `open-questions`.

# Step 1 — Collect reason

If a reason was not provided in `$ARGUMENTS`, ask in chat (one question):

> Why is `<stage>` being skipped? (e.g., "not needed for this change", "design done separately", "trivial change — test run manually", "already done in prior session")

Record the answer. Do NOT write artifacts until you have a reason.

If reason was provided in `$ARGUMENTS`, proceed directly.

# Step 2 — High-risk confirmation (if applicable)

If the stage is `verify` or `review`, issue the warning from the "High-risk skips" section above and wait for confirmation before proceeding.

# Step 3 — Write skip record `skip-<stage>.md`

```yaml
---
schema: sdlc/v1
type: skip-record
slug: <slug>
skipped-stage: <stage>
skipped-stage-artifact: <artifact-that-would-have-been-written>
reason: <reason from Step 1>
skipped-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"`>
high-risk: <true if verify or review, false otherwise>
---
```

Body:
```markdown
# Skip: <stage>

**Reason:** <reason>

**What was bypassed:** <one paragraph describing what the skipped stage would have done — e.g., "The shape stage would have run a structured interview to define scope, acceptance criteria, and known unknowns. These were not captured because the change was trivial and the scope was clear from the intake.">

**Downstream impact:** <one paragraph — what downstream stages may be missing as a result. e.g., "wf-implement and wf-verify will not have a formal scope definition to check against. The implementer should manually verify scope is still bounded to the intake description.">

**Stub artifact written:** `<artifact-path>` — downstream commands will find this file but it contains no real content.
```

# Step 4 — Write stub artifact

Write a minimal stub for the stage's expected artifact. The stub signals to downstream commands that the stage was intentionally skipped, not accidentally omitted.

**For `review` skip:** The stub filename is `07-review-<slice-slug>.md`. Resolve the slice from `selected-slice-or-focus` in `00-index.md` (or a third argument, if the user passed one). If no slice is resolvable, STOP and ask the user which slice the skip applies to — there is no longer a single workflow-wide review file to skip. Add `slice-slug: <slice-slug>` to the stub frontmatter.

**Stub frontmatter (same for all stages, adapt `type` field):**
```yaml
---
schema: sdlc/v1
type: <shape|slice|plan|design|verify|review|handoff|retro>
slug: <slug>
status: skipped
skipped: true
skip-record: skip-<stage>.md
skip-reason: <reason>
created-at: <timestamp>
---
```

**Stub body (same for all stages):**
```markdown
# <Stage name> — Skipped

This stage was skipped. See `skip-<stage>.md` for the reason and downstream impact assessment.

Downstream commands that read this file should treat its absence of content as intentional. Do not error or block on missing sections — proceed with the context available from prior stage artifacts.
```

# Step 5 — Update `00-index.md`

Read `00-index.md`, then update the following fields:

1. `current-stage` → next stage after the skip (from the skippable stages table in Step 0)
2. `progress` → add `<stage>: skipped` to the progress list
3. `next-command` → the command for the new `current-stage`
4. `next-invocation` → `/wf-<next> <slug>`
5. `updated-at` → current timestamp

**Next-stage routing table:**

| Stage skipped | New current-stage | New next-command |
|---------------|-------------------|-----------------|
| `shape` | `slice` | `/wf-slice` |
| `slice` | `plan` | `/wf-plan` |
| `plan` | `implement` | `/wf-implement` |
| `design` | `slice` | `/wf-slice` |
| `verify` | `review` | `/wf-review` |
| `review` | `handoff` | `/wf-handoff` |
| `handoff` | `ship` | `/wf-ship` |
| `retro` | complete | — |

If `retro` is skipped: set `status: complete` and `current-stage: complete` in `00-index.md`.

# Step 6 — Hand off to user

Emit a compact chat summary, no more than 8 lines:

```
wf-skip complete: <slug>
Skipped: <stage> (<artifact-that-would-have-been-written>)
Reason: <reason>
Stub written: .ai/workflows/<slug>/<artifact>
Skip record: .ai/workflows/<slug>/skip-<stage>.md
Next: <next-invocation>
```

If a high-risk stage was skipped, prefix with:

> ⚠ <stage> skipped. Quality gate bypassed — proceed with caution.

If multiple intermediate stages would be effectively incomplete due to a jump, add:

> ⚠ Stages between `<current>` and `<skipped>` remain incomplete. Run `/wf-skip <slug> <stage>` for each or accept the gap.

# What this command is NOT

- **Not an undo** — skipping a stage that is already complete does not reverse the completed work. It only overwrites the skip record.
- **Not a way to skip implement or ship** — use `/wf-close` to abandon work, not `/wf-skip`.
- **Not silent** — every skip must have a reason and a record. A workflow with unexplained skips is harder to audit later.
