# Status — the dashboard render

The Dashboard Mode of [../status.md](../status.md) loads this file. It holds the chat render of the dashboard. The computation rules stay in `status.md`.

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
