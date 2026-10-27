# Step commits, the steps table, and the test receipt

`implement.md` loads this file when `branch-strategy` is `dedicated` or `shared`. One implement agent runs the whole slice. An implement that hard-stops loses no committed work: the next run continues after the last committed step. Verify reuses a green test run.

## Step commits

The step record is `.ai/workflows/<slug>/steps.jsonl`. Only `wf.mjs step` writes it. Use it in place of a host task list. `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

1. Before the first step, run `<wf> step where "<projectRoot>" <slug> <slice-slug>`. It names the done steps, the step that ran last, and the next open step. Start at the next open step that it names. Do not do a done step again.
   - A step is done while its commit is in the history of the slice branch. The answer is the same in the main checkout and in a worktree.
   - A step whose commit a rebase replaced is `moved`, and stays done. A step whose commit left the branch is `dropped`, and is open again.
   - When `step where` says that the plan changed since the last complete run, the run starts at the next step that it names.
   - When `step where` says that the plan has no steps that the step record can read, stop. The plan must number its steps from 1, as numbered lines or as `### Step <n>` headings.
2. Before each step, run `<wf> step start "<projectRoot>" <slug> <slice-slug> <n> --title "<the step title of the plan>"`.
3. After each plan step, commit the step. Stage by path, as `implement.md` step 12 says. The message is `wip(<slug>): <slice-slug> step <n>`. Then run `<wf> step done "<projectRoot>" <slug> <slice-slug> <n> --sha HEAD`.
   - The commit must move HEAD. When the commit fails, for example in a commit hook, `step done` refuses, because HEAD is still the commit before the step. Fix the cause and commit again.
   - For a step that changed no file, run `<wf> step done "<projectRoot>" <slug> <slice-slug> <n> --no-change`.
4. When you stop before the slice is done, run `<wf> step stop "<projectRoot>" <slug> <slice-slug> --kind <kind> --reason "<one line>"`. The kind is:
   - `fail`: the step failed, for example its tests do not pass. This is the default.
   - `gate`: a gate of the plan stops the run, as the plan says.
   - `question`: the step needs an answer of the person.

   Only `fail` stops count. After 2 `fail` stops of one slice, `step where` says to ask the person to split the slice instead of a third run. `step retry` clears the count.
5. After the final commit of the slice (step 12), run `<wf> step complete "<projectRoot>" <slug> <slice-slug> --sha HEAD`. It refuses while a plan step is open. When a step must stay undone, name it: `--skip <n>,<n> --reason "<why>"`. The steps table shows it as `skipped`.

A slice that is complete starts again at step 1 when a later stage sends it back with the same plan. A slice whose plan changed starts at the next step that `step where` names.

## The steps table

The implementation record `05-implement-<slice-slug>.md` ends with a `## Steps` table: one row per step of the plan's `## Step-by-Step Plan`, in plan order.

| Step | Title | Result | Commit |
|---|---|---|---|
| `<n>` | `<the step title of the plan>` | `done`, `deviated` or `skipped` | `<the short sha of its step commit>` |

- Take each sha from `<wf> step where "<projectRoot>" <slug> <slice-slug> --json`: its `done` list, or its `lastRun` after `complete`. A step that an earlier run committed keeps the sha of that run. A `moved` step takes its new sha.
- `deviated` means the step was done in a different way than the plan says. Give the reason in `## Deviations from Plan`.
- `skipped` is a step that `complete --skip` named. Give its reason in `## Deviations from Plan`.
- A step with no commit gets `—` in Commit.

## The test receipt

After the final commit, run `node "<skill-dir>/scripts/wf.mjs" receipt "<root>" <slug> <slice-slug>`. It runs the implement suites of the test profile at HEAD, and writes `.test-receipt-<slice-slug>.json` only when every suite passed:

```json
{ "sha": "<the final commit sha>", "commands": ["<each suite command that ran green on that tree>"], "result": "pass", "at": "<ISO time>", "dirty": [{ "path": "<a tracked file outside .ai that HEAD lacks>", "hash": "<its blob hash, or null when deleted>" }] }
```

A tracked change outside `.ai` that is not yours, such as a stray `.gitignore` edit, does not stop the receipt: the receipt names it in `dirty`. When it exits 1, a suite failed: fix it in a new step, then run `receipt` again. Do not write the receipt file by hand. Verify reuses it while no code changed in a commit after `sha` and each `dirty` file keeps its hash; any other change makes it stale ([../verify/_sub-agents.md](../verify/_sub-agents.md), "Test receipt").
