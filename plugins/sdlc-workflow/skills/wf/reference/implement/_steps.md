# Step commits, the steps table, and the test receipt

`implement.md` loads this file when `branch-strategy` is `dedicated` or `shared`. One implement agent runs the whole slice. An implement that hard-stops loses no committed work: the next run continues after the last committed step. Verify reuses a green test run.

## Step commits

1. After each plan step, commit the step. Stage by path, as `implement.md` step 12 says. The message is `wip(<slug>): <slice-slug> step <n>`.
2. Record the step in `.ai/workflows/<slug>/.implement-progress.jsonl`: one JSON line `{"slice", "event": "step", "step": <n>, "sha"}`. Under a driver, use the command that the driver gives.
3. Before the first step, read the progress file. Take the rows of this slice after its last `complete` row. Continue after the last `step` row whose sha is an ancestor of HEAD (`git merge-base --is-ancestor <sha> HEAD`). Do not do that step again.
4. When you hard-stop, record `{"slice", "event": "hard-stop"}` with the reason. A driver counts these rows: after 2 hard-stops of one slice, it asks the person to split the slice instead of a third run. A `retry` row clears the count.
5. After the final commit of the slice (step 12), record `{"slice", "event": "complete", "sha"}`.

## The steps table

The implementation record `05-implement-<slice-slug>.md` ends with a `## Steps` table: one row per step of the plan's `## Step-by-Step Plan`, in plan order.

| Step | Title | Result | Commit |
|---|---|---|---|
| `<n>` | `<the step title of the plan>` | `done` or `deviated` | `<the short sha of its step commit>` |

- Take each sha from the `step` rows of `.implement-progress.jsonl` for this slice, after its last `complete` row. A step that an earlier run committed keeps the sha of that run.
- `deviated` means the step was done in a different way than the plan says. Give the reason in `## Deviations from Plan`.
- A step with no commit, for example a step that changed no file, gets `—` in Commit.

## The test receipt

After the final commit, write `.ai/workflows/<slug>/.test-receipt-<slice-slug>.json`:

```json
{ "sha": "<the final commit sha>", "commands": ["<each test, lint, and type command you ran green on that tree>"], "result": "pass", "at": "<ISO time>" }
```

Write it only when every command passed on the committed tree. Verify reuses it when no code changed after `sha` ([../verify/_sub-agents.md](../verify/_sub-agents.md), "Test receipt").
