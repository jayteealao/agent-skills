# Status — dashboard and detail renders

Load this file from `status.md` Dashboard Mode and Detail Mode. It holds the chat render blocks; the computation rules stay in `status.md`.

## Dashboard render

The Runtime column shows `runtime-evidence-status`: `clean` → `—`; `deferrals: <N>`; `probe-findings: <N>`; both separated by `+` when both apply.

```
## Active Workflows ({count})

| Slug | Title | Stage | Status | Slice | Runtime | Updated | Next |
|------|-------|-------|--------|-------|---------|---------|------|
| <slug> | <title> | <N>·<stage-name> | <status> | <slice or —> | <runtime> | <YYYY-MM-DD> | `<next-invocation>` |

## Blocked ({count})

| Slug | Title | Stage | Blocker | Open Qs | Runtime | Since |
|------|-------|-------|---------|---------|---------|-------|

## Completed ({count})

| Slug | Title | Outcome | Stages | Runtime | Completed |
|------|-------|---------|--------|---------|-----------|
```

The Runtime column appears in every table because the deferral mechanism is orthogonal to lifecycle
stage — a `Completed` workflow can still carry `deferrals: <N>`, a `Blocked` one `probe-findings: <N>`.

**After the tables, a quick-actions section:**

```
## Quick Actions
- Continue most recent: `<next-invocation of the most recently updated active workflow>`
- Drive it to done: `/wf auto <slug>`  (or `/wf yolo <slug>` for autonomous, where the host offers it)
- See detail + exact next command for <slug>: `/wf status <slug>`
- Catch up on what a workflow did: `/wf recap <slug>`
```

If any workflow has `branch-strategy: dedicated`, add a branch summary:

```
## Branch Summary
| Slug | Branch | Base | PR |
|------|--------|------|----|
```

If any slug has a `cost.jsonl`, add the cost table (one row per slug with a ledger; every integer copied from the ledger):

```
## Cost (exact tokens)
| Slug | Turns | Sub-agents | Input | Output | Cache read | Cache write | External in / out |
|------|-------|------------|-------|--------|------------|-------------|-------------------|
| **total** | | | | | | | |
```

## Detail view render

```
# Workflow: <title>
**Slug:** <slug> | **Status:** <status> | **Updated:** <updated-at>

## Stage Progress
| # | Stage | File | Status | Created | Updated |
|---|-------|------|--------|---------|---------|
| 1 | intake | 01-intake.md | ✓ complete | <date> | <date> |
| ... | | | | | |

## Slice Progress (if sliced)
| Slice | Plan | Implement | Verify | Review | Handoff | Ship |
|-------|------|-----------|--------|--------|---------|------|

## Key Metrics
- Files changed / lines ± (from implement records)
- Review findings (from review records)
- Acceptance criteria met / interactive checks passed (from verify records)

## Open Questions
- <question> (or "None")

## Branch Info
- Strategy: <branch-strategy> | Branch: <branch> (base <base-branch>) | PR: <pr-url or "not created">
- Current branch: <git branch --show-current> <warning if mismatched>

## Driver
- <omit the whole section when no .driver-journal.jsonl exists>
- Driver: running — last seen at <stage>/<slice>, <n> min ago (cadence: <longest gap> min)
        | **presumed dead** at <stage>/<slice> since <timestamp> — its partial writes are suspect
        | completed at <timestamp>

## Open Deferrals (when any are open)
- <slice>/<ac> — <reason> · clearing event: <clearing-event>
- ⚠ **clearing event appears SATISFIED** for <slice>/<ac> — run `/wf probe <slug>` to capture the evidence

## Cost (exact tokens · from cost.jsonl; omit when the file is absent)
| Key | Turns | Sub-agents | Input | Output | Cache read | Cache write | External in / out |
|-----|-------|------------|-------|--------|------------|-------------|-------------------|
| plan | 7 | 2 | 12 | 3,104 | 210,980 | 88,120 | 18,176 / 142 |
| **total** | | | | | | | |

## Next
- **Default:** `<recommended-next-invocation>` — <one-line reason>
- **Options:** (every option from the current stage file's `## Recommended Next Stage` — present ALL, do not pick silently)
- If `Status: Awaiting input`: resolve the listed open questions first.
- If the workflow is complete/closed: say so, and offer `/wf recap <slug>` or `/wf intake <slug> <new scope>` (extend).
- If on the wrong branch: ⚠ You are on `<current>` — switch to `<branch>` before the next command.
```
