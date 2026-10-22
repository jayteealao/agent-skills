# Step commits, step groups, and the test receipt

`implement.md` loads this file when `branch-strategy` is `dedicated` or `shared` (WF-SYSTEM-REVIEW C2, C3, C4). An implement that hard-stops loses no committed work, a long plan runs in fresh agents, and verify reuses a green test run.

## Step commits (C2)

1. After each plan step, commit the step. Stage by path, as `implement.md` step 12 says. The message is `wip(<slug>): <slice-slug> step <n>`.
2. Record the step in `.ai/workflows/<slug>/.implement-progress.jsonl`: one JSON line `{"slice", "event": "step", "step": <n>, "sha"}`. Under a driver, use the command that the driver gives.
3. Before the first step, read the progress file. Take the rows of this slice after its last `complete` row. Continue after the last `step` row whose sha is an ancestor of HEAD (`git merge-base --is-ancestor <sha> HEAD`). Do not do that step again.
4. When you hard-stop, record `{"slice", "event": "hard-stop"}` with the reason. A driver counts these rows: after 2 hard-stops of one slice, it asks the person to split the slice instead of a third run. A `retry` row clears the count.
5. After the final commit of the slice (step 12), record `{"slice", "event": "complete", "sha"}`.

## Step groups (C3)

A driver can name a group of plan steps ("steps 7 to 12 of 14"). Then:

1. Read the hand-over note `.ai/workflows/<slug>/.implement-handover-<slice-slug>.md` when it exists. Only the first group runs the research of `implement.md` "Parallel research". A later group does not load `implement/_research.md` again.
2. Implement only the steps of the group, with a step commit for each.
3. When the group is not the last one, overwrite the hand-over note: what is done, what is next, and the traps you found. Do not write the implementation record, the roster status, the final commit, or the test receipt. Return with `stepsDone`.
4. The last group finishes the stage: steps 8 to 12 of `implement.md`.

## The test receipt (C4)

After the final commit, write `.ai/workflows/<slug>/.test-receipt-<slice-slug>.json`:

```json
{ "sha": "<the final commit sha>", "commands": ["<each test, lint, and type command you ran green on that tree>"], "result": "pass", "at": "<ISO time>" }
```

Write it only when every command passed on the committed tree. Verify reuses it when no code changed after `sha` ([../verify/_sub-agents.md](../verify/_sub-agents.md), "Test receipt").
