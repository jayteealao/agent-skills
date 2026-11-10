# Status — the dashboard render

The Dashboard Mode of [../status.md](../status.md) loads this file. It holds the chat render of the dashboard. The computation rules stay in `status.md`.

The Runtime column shows `runtime-evidence-status`: `clean` → `—`; `deferrals: <N>`; `probe-findings: <N>`; both separated by `+` when both apply.

The inbox comes first. Give one line to each entry of `wf.mjs inbox` that has no `later`, in its order. Give one line to each item of `laterGroups`: its `line`. Do not list the later entries one by one.

```
## Waiting on you ({now})

1. <slug> — <ask> Since <YYYY-MM-DD>. Type `<answer>`.

Later ({later}):
- <line of laterGroups, for example "3 questions wait for the plan stage of household-computer.">

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
- Drive it to done: `/wf yolo <slug>`
- See detail + exact next command for <slug>: `/wf status <slug>`
- Catch up on what a workflow did: `/wf status recap <slug>`
```

If any workflow has `branch-strategy: dedicated`, add a branch summary:

```
## Branch Summary
| Slug | Branch | Base | PR |
|------|--------|------|----|
```

For each slug, run `node "<skill-dir>/scripts/wf.mjs" cost "<root>" <slug> --json`. If any slug has cost rows, add the cost table (one row per slug with rows; copy every integer from the command):

```
## Cost (exact tokens)
| Slug | Turns | Sub-agents | Input | Output | Cache read | Cache write | External in / out |
|------|-------|------------|-------|--------|------------|-------------|-------------------|
| **total** | | | | | | | |
```
