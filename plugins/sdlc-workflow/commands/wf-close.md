---
name: wf-close
description: Close or archive a workflow without completing the full lifecycle. Marks the workflow as closed in 00-index.md, writes a 99-close.md record with the reason and context, warns about open branches and PRs, and optionally cleans up the branch. Does NOT delete workflow artifacts. Use for: cancelled work, work superseded by another approach, indefinitely deferred work, or work completed entirely outside the workflow.
argument-hint: <slug> [cancelled|superseded|deferred|completed-externally|merged-into]
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or published anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-close`, the **workflow closure utility** for the SDLC lifecycle.

# What this command does
Marks a workflow as closed at whatever stage it reached. Writes:
1. `99-close.md` — the closure record (reason, context, what was completed, what was not)
2. Updated `00-index.md` — `status: closed`, `close-reason`, `closed-at`

Does NOT delete any workflow artifacts. Files remain for future reference, audit, or revival.

# Close reasons

| Reason | When to use |
|--------|-------------|
| `cancelled` | Work is no longer wanted. Decision to not build / not fix. |
| `superseded` | Another approach, PR, or workflow replaced this one. |
| `deferred` | Work is valid but not now. May be reopened later. |
| `completed-externally` | The change was made outside this workflow (hotfix, manual edit, another PR). |
| `merged-into` | This workflow's scope was absorbed into a larger workflow or PR. |

# CRITICAL — scope discipline
- Do NOT delete any workflow files. Do NOT run any stage. Do NOT edit application code.
- Branch cleanup is OPTIONAL and requires explicit user confirmation — never delete a branch silently.
- Do NOT close a PR automatically — surface the PR URL and tell the user to close it manually.
- Follow the steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Parse `$ARGUMENTS`:**
   - First argument: slug
   - Second argument (optional): close reason (one of the five valid reasons above — case-insensitive)
   - Remaining arguments: short note (optional)
2. **Validate the slug:**
   - If `.ai/workflows/<slug>/00-index.md` does not exist → STOP: "No workflow `<slug>` found."
3. **Check if already closed:**
   - Read `00-index.md` `status` field. If `status: closed` → WARN: "Workflow `<slug>` is already closed (closed-at: `<closed-at>`). Running again will overwrite the close record. Proceed? (yes to continue)"
4. **Read full workflow context:**
   - Read `00-index.md` frontmatter in full: `title`, `slug`, `status`, `current-stage`, `stage-number`, `progress`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `open-questions`, `workflow-type`.
   - Note what stages were completed (from `progress` field).

# Step 1 — Collect close reason and note

If close reason was not provided in `$ARGUMENTS`, ask in chat (one question, present the five options):

> Why is this workflow being closed?
> - `cancelled` — work is no longer wanted
> - `superseded` — replaced by another approach or PR
> - `deferred` — valid but not now, may resume later
> - `completed-externally` — done outside this workflow
> - `merged-into` — absorbed into a larger workflow or PR

Record the answer. If `superseded` or `merged-into`, also ask: "What superseded/absorbed it? (PR URL, workflow slug, or description)"

Do NOT write artifacts until you have a reason.

# Step 2 — Branch and PR state check

1. **Check current branch:**
   - Run `git branch --show-current`.
   - If `branch-strategy: dedicated` AND `branch` field is non-empty:
     - Note whether the workflow branch still exists: `git branch --list <branch>`.
     - Note whether it has unmerged commits: `git log <base-branch>..<branch> --oneline` (if branch exists).
2. **Check PR state (if `pr-url` is non-empty):**
   - Note the PR URL — the user must close it manually.

These checks are **informational** — surface them in the close record and handoff, but do NOT take action automatically.

# Step 3 — Write `99-close.md`

**`99-close.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: close-record
slug: <slug>
workflow-type: <workflow-type from 00-index.md>
close-reason: <cancelled|superseded|deferred|completed-externally|merged-into>
superseded-by: <PR URL, slug, or description — if reason is superseded or merged-into, else "n/a">
last-stage-reached: <current-stage from 00-index.md>
stages-completed: [<list from progress field>]
stages-incomplete: [<remaining stages that were never reached>]
had-open-branch: <true|false>
branch: <branch name or "none">
had-open-pr: <true|false>
pr-url: <url or "none">
unmerged-commits: <N or 0>
closed-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"`>
---
```

**Body sections:**

## 1. Closure summary

One paragraph: what this workflow was for, how far it got, and why it is being closed now. ≤5 sentences. Written for someone discovering this record months later — give them enough context to understand the decision without reading every stage artifact.

## 2. Work completed

What stages ran and what was produced. One bullet per completed stage:
- `intake: complete` — brief captured as `01-intake.md`
- `shape: complete` — scope defined as `02-shape.md`
- (etc.)
- `shape: skipped` — if applicable

If nothing was completed beyond the index: write "No stages completed — workflow closed before work began."

## 3. Work not completed

What was planned or in-progress but not finished. One bullet per incomplete stage. Be specific about the last known state (e.g., "implement: in-progress — step 3 of 5 completed, PR not opened").

## 4. Reason & context

The close reason, expanded. If `superseded`, name what superseded it. If `deferred`, note any known conditions that would trigger revival (e.g., "defer until Q3 budget approval"). If `merged-into`, name the absorbing workflow or PR.

## 5. Branch & PR status

List what exists and what the user should do:

| Resource | State | Action needed |
|----------|-------|---------------|
| Branch `<branch>` | exists / deleted / "n/a" | Delete if unneeded: `git branch -d <branch>` |
| PR `<url>` | open / merged / "n/a" | Close manually at `<url>` if still open |
| Unmerged commits | `<N>` on `<branch>` | Cherry-pick if needed, then delete branch |

If no branch and no PR: write "No branch or PR to clean up."

## 6. Revival instructions

Only if `close-reason: deferred` or `close-reason: superseded`. Write what someone would need to do to restart this work:

> To resume: run `/wf-quick quick intake <description>` with the same description, or restore `status: in-progress` in `00-index.md` and run `/wf-resume <slug>` to pick up where this left off. All prior artifacts are intact at `.ai/workflows/<slug>/`.

Otherwise write: "Not applicable — workflow is closed permanently."

# Step 4 — Update `00-index.md`

Read `00-index.md`, then update:

```yaml
status: closed
close-reason: <reason>
superseded-by: <value or "n/a">
closed-at: <timestamp>
next-command: none
next-invocation: none
updated-at: <timestamp>
```

Do NOT change `current-stage` — it should reflect the last stage the workflow reached, not "closed".

# Step 5 — Hand off to user

Emit a compact chat summary, no more than 12 lines:

```
wf-close complete: <slug>
Reason: <close-reason>
Last stage: <current-stage>
Stages completed: <comma-separated list or "none">
Close record: .ai/workflows/<slug>/99-close.md
Artifacts preserved: .ai/workflows/<slug>/ (not deleted)
```

Then surface any required manual actions as a checklist:

```
Manual actions needed:
[ ] Close PR at <pr-url>          (if open PR exists)
[ ] Delete branch: git branch -d <branch>    (if unneeded branch exists)
[ ] Cherry-pick <N> unmerged commits if needed  (if unmerged commits exist)
```

If `deferred`, suffix with:

> Workflow deferred. To resume: `/wf-resume <slug>` or `/wf-quick quick intake <description>`.

If `completed-externally`, suffix with:

> Work was completed outside the workflow. No further action needed in this workflow.

# What this command is NOT

- **Not a delete** — `/wf-close` archives in place. All artifacts remain under `.ai/workflows/<slug>/`. To truly remove them, delete the directory manually after closing.
- **Not a skip** — use `/wf-skip <slug> <stage>` to bypass a specific stage while continuing the workflow. `/wf-close` ends the workflow entirely.
- **Not a retro** — `/wf-retro` runs after a successful ship and extracts lessons. `/wf-close` is for early or unplanned termination. If you want to run a retro on a cancelled effort, run `/wf-retro <slug>` separately before closing — or close first and reference the close record in the retro.
- **Not automatic** — it does not close PRs, delete branches, or notify teammates. These are explicit human actions, surfaced as a checklist.
