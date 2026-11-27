# Step commits, the steps table, and the test receipt

`implement.md` loads this file when `branch-strategy` is `dedicated` or `shared`. One implement agent runs the whole slice. An implement that hard-stops loses no committed work: the next run continues after the last committed step. A step commit means that the tree compiles, not that the slice works: the tests run once, for the slice. Verify reuses a green test run.

## Step commits

The step record is `<wf-dir>/steps.jsonl`. Only `wf.mjs step` writes it. Use it in place of a host task list. `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

1. Before the first step, run `<wf> step where "<projectRoot>" <slug> <slice-slug>`. It names the done steps, the step that ran last, and the next open step. Start at the next open step that it names. Do not do a done step again.
   - A step is done while its commit is in the history of the slice branch. The answer is the same in the main checkout and in a worktree.
   - A step whose commit a rebase replaced is `moved`, and stays done. A step whose commit left the branch is `dropped`, and is open again.
   - When `step where` says that the plan changed since the last complete run, the run starts at the next step that it names.
   - When `step where` says that the plan has no steps that the step record can read, stop. The plan must number its steps from 1, as numbered lines or as `### Step <n>` headings.
2. Before each step, run `<wf> step start "<projectRoot>" <slug> <slice-slug> <n> --title "<the step title of the plan>"`.
3. After each plan step, run only the quick checks of the project on the files of that step: format, lint and type check (`cargo fmt --check`, `cargo clippy` or `cargo check`, `tsc --noEmit`, a compile task of the build). Run no test, no guard set, no measured run, no device or emulator check and no full build: they are slice checks. A steer, a project rule or a plan line that asks for one of them after each step moves it to the slice checks, where it runs once over every file the steps changed; it is never dropped. A step that the plan marks `(probe)` runs the one check that the plan names for it, and nothing else. A project with no static check runs nothing. Then commit the step. Stage by path, per the commit rule of [../_workflow-rules.md](../_workflow-rules.md). The message is a conventional commit about the product, made from the plan step: `<type>: <what the step does>`, for example `feat: show the stall alert setting`. Pick the type that fits the step: `feat`, `fix`, `test`, `refactor` or `docs`. Name no slug, no slice, no step number and no finding id ([../_output-boundary.md](../_output-boundary.md)): `step done --sha` maps the commit to its step. Then run `<wf> step done "<projectRoot>" <slug> <slice-slug> <n> --sha HEAD`.
   - The commit must move HEAD. When the commit fails, for example in a commit hook, `step done` refuses, because HEAD is still the commit before the step. Fix the cause and commit again.
   - For a step that changed no file, run `<wf> step done "<projectRoot>" <slug> <slice-slug> <n> --no-change`.
4. When you stop before the slice is done, run `<wf> step stop "<projectRoot>" <slug> <slice-slug> --kind <kind> --reason "<one line>"`. The kind is:
   - `fail`: the work failed, for example a check of the slice is still red after the last fix round. This is the default. A stop that waits on the person is stored as `question`, whatever kind you give.
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

## The slice checks

A step runs no test. After the commit of the last step, and before the receipt, run the slice checks, each once:

1. The tests that the slice wrote or changed, and the tests that cover the files of the slice.
2. Each check under `## Slice Checks` of the plan: a guard set, a measured run, a device check.

Keep the output of each run in a file, per [../_workflow-rules.md](../_workflow-rules.md). A long run is not a slice check: it stays a packet check ([../_long-runs.md](../_long-runs.md) L5).

### Record each check

Run each slice check through wf, on committed code, so that wf sees its exit code. wf records the result and the commit:

```
node "<skill-dir>/scripts/wf.mjs" step check "<root>" <slug> <slice-slug> --name "<the check, as the plan names it>" --run "<its command>"
```

- A check over 8 minutes is a job ([../_talk.md](../_talk.md)): start it with `talk job`, wait for its end, then give `--job <the id>` in place of `--run`.
- You cannot record `met` by your word. Record by hand only a check that did not pass (`--result not-met --sha HEAD`) or did not run (`--result not-run`).

| Result | Meaning | Effect |
|---|---|---|
| `met` | The check ran and passed. | None. |
| `not-met` | The check ran and did not pass, and the fix loop did not make it pass. | The stage can end. Verify must rule on the check. A delegate decision never waives it. |
| `not-run` | The check did not run. | `record stage-done implement` refuses, unless the plan marks the check as optional and you give `--optional`. |

- A check must run on the last code of the slice. A check that ran before a later code commit is stale, and counts as `not-run`. A commit that changes only prose or the records does not make a check stale.
- A measured run is a check. Take it again after the last commit that changes behaviour, or record it as `not-met` with its figures in `--note`.
- A red that an earlier slice caused is `not-met` with `--carried-from <the base commit of the slice> --base-job <id>`. The job ran the same check in a scratch worktree at the base commit and failed there. With no such job, the red belongs to this slice.
- The plan lists the checks. Each one needs its own record: `record stage-done implement` refuses while fewer checks are recorded than the plan lists.
- Run `step check "<root>" <slug> <slice-slug>` with no `--name` to see what still blocks the end of the stage.

## The fix loop

When a slice check or the receipt is red:

1. Read every failure of the run. Fix all of them in one round. You choose how many commits the round makes. Each is a `fix:` commit about the product; it is not a plan step and gets no `step done`.
2. Run again only the checks that failed. When they pass, run all the slice checks and the receipt once more.

One round is steps 1 and 2. The limit is 3 rounds for the slice, counted over all its reds together: a red does not get 3 rounds of its own. When a check is still red after round 3, run `<wf> step stop "<projectRoot>" <slug> <slice-slug> --kind fail --reason "<the checks that are still red>"` and stop. Do not run a check again when no code changed since it passed.

## The test receipt

After the slice checks pass, run `wf_job { "op": "receipt", "slug": "<slug>", "slice": "<slice-slug>" }` (CLI: `node "<skill-dir>/scripts/wf.mjs" receipt "<root>" <slug> <slice-slug>`). It runs the implement suites of the test profile at HEAD, and writes `.test-receipt-<slice-slug>.json` only when every suite passed:

```json
{ "sha": "<the final commit sha>", "commands": ["<each suite command that ran green on that tree>"], "result": "pass", "at": "<ISO time>", "dirty": [{ "path": "<a tracked file outside .ai that HEAD lacks>", "hash": "<its blob hash, or null when deleted>" }] }
```

A tracked change outside `.ai` that is not yours, such as a stray `.gitignore` edit, does not stop the receipt: the receipt names it in `dirty`. When the test profile has no suite for implement, the command prints `receipt: none (no suite in the profile)` and exits 0: go on, and do not ask the person for a suite, because setup asks once for the project. When it exits 1, a suite failed: fix it in the fix loop, within its 3 rounds. Do not write the receipt file by hand. Verify reuses it while no code changed in a commit after `sha` and each `dirty` file keeps its hash; any other change makes it stale ([../verify/_sub-agents.md](../verify/_sub-agents.md), "Test receipt").
