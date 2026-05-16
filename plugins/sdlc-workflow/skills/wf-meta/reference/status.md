---
description: Read-only dashboard across all workflows. Reads every .ai/workflows/*/00-index.md, parses frontmatter, and renders a grouped status table. No side effects. Optional slug argument for single-workflow detail view.
argument-hint: [slug]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-status`, the **dashboard** for all SDLC workflows.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This command does NOT advance any workflow. It is purely read-only — no files are written, no state is changed.

# CRITICAL — execution discipline
You are a **dashboard renderer**, not a problem solver.
- Do NOT modify any workflow files. Do NOT write any artifacts.
- Do NOT start running stages, fixing issues, or advancing workflows.
- Your job is to **read all workflow indexes and render a status dashboard**.
- Follow the numbered steps below **exactly in order**.
- If you catch yourself about to modify anything, STOP. This command is read-only.

# Step 0 — Discover workflows
1. **Enumerate workflows** (v9.11.0):
   - **If `.ai/workflows/INDEX.md` exists** → read it; each row's first tab-separated column is a slug. The registry is the authoritative list of known workflows (closed entries included; closed are still rendered in Dashboard Mode but classified as Completed in Step 0 sub-step 3 below).
   - **If `INDEX.md` does NOT exist** → fall back to **Glob** for all `.ai/workflows/*/00-index.md` files in the project. Also include this one-line tip in the final chat return: *"Tip: run `/wf-meta sync` once to bootstrap `.ai/workflows/INDEX.md` — enumeration becomes registry-driven and skips deleted dirs cleanly."*
2. If **none found** (registry empty AND glob empty) → tell the user: "No workflows found. Start one with `/wf intake <description>`." STOP.
3. If `$ARGUMENTS` contains a slug → switch to **detail mode** for that single workflow (see Detail Mode below). When in detail mode, the INDEX.md enumeration above is irrelevant — read `00-index.md` directly.
4. If no arguments → **dashboard mode** across all workflows.

# Dashboard Mode (no arguments)

For each slug in the enumeration from Step 0, attempt to read `.ai/workflows/<slug>/00-index.md`. **If the directory is missing on disk** (the row exists in `INDEX.md` but the dir was deleted out-of-band) → omit the slug from the dashboard and append a one-line note at the end of the dashboard: *"Skipped: `<slug>` (registry row present, directory missing — run `/wf-meta sync` to reconcile)."* For every workflow whose `00-index.md` did read successfully, parse YAML frontmatter for:
- `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`
- `selected-slice-or-focus`, `open-questions`
- `recommended-next-command`, `recommended-next-invocation`
- `branch-strategy`, `branch`, `pr-url`, `pr-number`
- `progress` (if present — e.g., `slices-implemented: 2, slices-total: 5`)

**Classify each workflow into one of three groups:**

1. **Active** — `status` is `in-progress`, `planning`, `implementing`, or any non-terminal, non-blocked status
2. **Blocked** — `status` is `awaiting-input`, OR `open-questions` is non-empty, OR any prerequisite stage shows awaiting-input
3. **Completed** — `status` is `complete`, `shipped`, or `abandoned`

**Staleness check:** If `updated-at` is more than 7 days ago, append `(stale)` to the status. Calculate this by running: `date -u +%s` for current time and parsing `updated-at`.

**Render the dashboard:**

```
## Active Workflows ({count})

| Slug | Title | Stage | Status | Slice | Updated | Next |
|------|-------|-------|--------|-------|---------|------|
| <slug> | <title> | <N>·<stage-name> | <status> | <slice or —> | <YYYY-MM-DD> | `<next-invocation>` |

## Blocked ({count})

| Slug | Title | Stage | Blocker | Open Qs | Since |
|------|-------|-------|---------|---------|-------|
| <slug> | <title> | <N>·<stage-name> | <reason> | <count> | <YYYY-MM-DD> |

## Completed ({count})

| Slug | Title | Outcome | Stages | Completed |
|------|-------|---------|--------|-----------|
| <slug> | <title> | <status> | <N>/10 | <YYYY-MM-DD> |
```

**After the tables, add a quick-actions section:**

```
## Quick Actions
- Resume most recent: `<next-invocation of most recently updated active workflow>`
- See routing for <slug>: `/wf-meta next <slug>`
```

If there are workflows with `branch-strategy: dedicated`, add a branch summary:

```
## Branch Summary
| Slug | Branch | Base | PR |
|------|--------|------|----|
| <slug> | <branch> | <base-branch> | <pr-url or "not created"> |
```

# Detail Mode (slug argument provided)

When `/wf-meta status <slug>` is invoked:

1. **Read `00-index.md`** for the specified slug. If not found → "Workflow `<slug>` not found." STOP.
2. **Read the `workflow-files` list** from frontmatter and check which files actually exist on disk.
3. **Read each existing stage file's frontmatter** — parse `status`, `created-at`, `updated-at`, and key metrics from each.
4. **Render the detail view:**

```
# Workflow: <title>
**Slug:** <slug> | **Status:** <status> | **Updated:** <updated-at>

## Stage Progress
| # | Stage | File | Status | Created | Updated |
|---|-------|------|--------|---------|---------|
| 1 | intake | 01-intake.md | ✓ complete | <date> | <date> |
| 2 | shape | 02-shape.md | ✓ complete | <date> | <date> |
| 3 | slice | 03-slice.md | ✓ complete | <date> | <date> |
| 4 | plan | 04-plan.md | → in-progress | <date> | <date> |
| 5 | implement | — | · pending | — | — |
| ... | | | | | |

## Slice Progress (if sliced)
| Slice | Plan | Implement | Verify | Review | Handoff | Ship |
|-------|------|-----------|--------|--------|---------|------|
| <slice-slug> | ✓ | → | · | · | · | · |
| <slice-slug> | ✓ | ✓ | ✓ | → | · | · |

## Key Metrics
- Files changed: <from implement records>
- Lines added/removed: <from implement records>
- Review findings: <from review records>
- Acceptance criteria met: <from verify records>
- Interactive checks passed: <from verify records>

## Open Questions
- <question 1>
- <question 2>
(or "None")

## Branch Info
- Strategy: <branch-strategy>
- Branch: <branch> (base: <base-branch>)
- PR: <pr-url or "not created">
- Current branch: <git branch --show-current> <warning if mismatched>

## Next
- **Default:** `<recommended-next-invocation>`
- **Options:** (read from current stage file's ## Recommended Next Stage)
```

5. For the **slice progress matrix**, glob for all `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`, `07-review-*.md` (per-slice review files — `07-review-<slice-slug>.md` is the master per slice; `07-review-<slice-slug>-<command>.md` are per-command sub-reviews, exclude those from the matrix), `08-handoff.md` files. Mark each cell:
   - `✓` — file exists and status is complete
   - `→` — file exists and status is in-progress or awaiting-input
   - `✗` — file exists and status is failed
   - `·` — file does not exist (pending)

6. For **branch info**, run `git branch --show-current` and compare with the workflow's `branch` field. Warn if mismatched.

# Chat return contract
Return ONLY the rendered dashboard or detail view. No preamble, no explanations beyond the tables. The dashboard IS the output.

If the user is clearly trying to resume work (e.g., returning after a break), end with a suggestion: "Run `/wf-meta next <slug>` for routing details, or the next command directly."
