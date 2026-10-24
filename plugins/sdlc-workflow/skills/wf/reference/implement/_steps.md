# Step commits, the steps table, and the test receipt

`implement.md` loads this file when `branch-strategy` is `dedicated` or `shared`. One implement agent runs the whole slice. An implement that hard-stops loses no committed work: the next run continues after the last committed step. Verify reuses a green test run.

## Step commits

The step record is `.ai/workflows/<slug>/steps.jsonl`. Only `wf.mjs step` writes it. Use it in place of a host task list. `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

1. Before the first step, run `<wf> step where "<projectRoot>" <slug> <slice-slug>`. It names the done steps, the step that ran last, and the next open step. A step is done only when its commit is in the history of HEAD. Start at the next open step. Do not do a done step again.
2. Before each step, run `<wf> step start "<projectRoot>" <slug> <slice-slug> <n> --title "<the step title of the plan>"`.
3. After each plan step, commit the step. Stage by path, as `implement.md` step 12 says. The message is `wip(<slug>): <slice-slug> step <n>`. Then run `<wf> step done "<projectRoot>" <slug> <slice-slug> <n> --sha HEAD`. For a step that changed no file, omit `--sha`.
4. When you hard-stop, run `<wf> step stop "<projectRoot>" <slug> <slice-slug> --reason "<one line>"`. After 2 hard-stops of one slice, `step where` says to ask the person to split the slice instead of a third run. `step retry` clears the count.
5. After the final commit of the slice (step 12), run `<wf> step complete "<projectRoot>" <slug> <slice-slug> --sha HEAD`.

## The steps table

The implementation record `05-implement-<slice-slug>.md` ends with a `## Steps` table: one row per step of the plan's `## Step-by-Step Plan`, in plan order.

| Step | Title | Result | Commit |
|---|---|---|---|
| `<n>` | `<the step title of the plan>` | `done` or `deviated` | `<the short sha of its step commit>` |

- Take each sha from `<wf> step where "<projectRoot>" <slug> <slice-slug> --json` (its `done` list). A step that an earlier run committed keeps the sha of that run.
- `deviated` means the step was done in a different way than the plan says. Give the reason in `## Deviations from Plan`.
- A step with no commit, for example a step that changed no file, gets `—` in Commit.

## The test receipt

After the final commit, write `.ai/workflows/<slug>/.test-receipt-<slice-slug>.json`:

```json
{ "sha": "<the final commit sha>", "commands": ["<each test, lint, and type command you ran green on that tree>"], "result": "pass", "at": "<ISO time>" }
```

Write it only when every command passed on the committed tree. Verify reuses it when no code changed after `sha` ([../verify/_sub-agents.md](../verify/_sub-agents.md), "Test receipt").
