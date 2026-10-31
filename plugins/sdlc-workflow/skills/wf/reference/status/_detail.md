# Status — the detail render

The Detail Mode of [../status.md](../status.md) loads this file. It holds the chat render of the detail view. The computation rules stay in `status.md`.

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

Steps of a slice in progress: <slice> — step <n> of <m>
- step 1 ✓ <sha>
- step 2 · open

Take <n>, <m> and each step line from `node "<skill-dir>/scripts/wf.mjs" step where "<projectRoot>" <slug> <slice> --json`: <n> is the length of its `done` list, and <m> is its `total`.

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
        | stopped at <stage>/<slice> (<status>) at <timestamp>

## Open Deferrals (when any are open)
- <slice>/<ac> — <reason> · clearing event: <clearing-event>
- ⚠ **clearing event appears SATISFIED** for <slice>/<ac> — run `/wf probe <slug>` to capture the evidence

## Cost (exact tokens · from `wf.mjs cost`; omit when it has no rows)
| Key | Turns | Sub-agents | Input | Output | Cache read | Cache write | External in / out |
|-----|-------|------------|-------|--------|------------|-------------|-------------------|
| plan | 7 | 2 | 12 | 3,104 | 210,980 | 88,120 | 18,176 / 142 |
| **total** | | | | | | | |

## Next
- **Default:** `<next-invocation>` — <the default route's reason>
- **Options:** (every entry of the current stage file's `recommended-routes`, or of its legacy `## Recommended Next Stage` section — present ALL, do not pick silently)
- If `Status: Awaiting input`: resolve the listed open questions first.
- If the workflow is complete/closed: say so, and offer `/wf status recap <slug>` or `/wf intake <slug> <new scope>` (extend).
- If on the wrong branch: ⚠ You are on `<current>` — switch to `<branch>` before the next command.
```
