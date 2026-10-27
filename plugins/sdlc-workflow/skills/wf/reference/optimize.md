---
description: Run or resume the metric loop of an optimize slug. Each trial proposes one change, makes it in a separate worktree, and measures it; a script keeps the change or reverts it by a noise-aware rule. Branch rounds fork the best code into fresh branches that read only their own history, on a fixed schedule and on a plateau. When the loop ends, the kept trials become one slice for verify and review. A description starts a new optimize slug through intake.
argument-hint: <slug> | <description>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf loop optimize <slug>`. An optimize slug has its own lifecycle: intake and the metric spec (`/wf intake optimize`), then the loop, then verify, review, ship and retro as for any slug. This sub-key runs the loop. The loop changes code toward one number: the metric of `02-optimize-spec.md`.

> **Hosts.** The script and the ledger are the same on every host. The driver (`workflows/optimize.js`) is Claude Code only. On a host with no driver, the goal contract carries the loop in the session, one trial for each turn ([goal.md](goal.md)).

## What the loop is, and is not

- **The script decides.** `optimize.mjs` makes every git write, every measurement, and every keep or revert. It writes the ledger. You propose and edit only. Do not run `git reset`, `git revert` or `git checkout` for the loop.
- **The person owns the spec.** The person confirmed the metric, the guard, `allowed-paths` and the budget at intake. The loop does not edit the spec, the metric command, the guard, the holdout, or their files. A trial that touches one of them is rejected before it is measured.
- **The trials run in separate worktrees.** The trunk is the branch `optimize/<slug>`, in the worktree `<root>.optimize/<slug>`. Each branch of a round gets its own worktree beside it, `<slug>--r<n>b<k>`. The person's own working tree is not reset.
- **Only the measurement is serial.** Two measured runs on one machine corrupt each other's numbers, so a lock lets one guard and one measurement run at a time. In a round, the driver proposes and edits on every ready branch at the same time, and measures the edited branches one after the other. The trunk stays serial, because each trunk proposer reads the verdict of the trial before it. An editor never builds, tests or formats.
- **The spec can share one build folder.** `shared-build: <VARIABLE>` (for example `CARGO_TARGET_DIR`) sets that variable to `<root>.optimize/<slug>.build` for every command of the loop, so a new branch worktree does not start with a cold build.
- **The loop removes its worktrees when it is done.** `round-close` removes the worktrees of the round. `finish` removes the trunk worktree, the trunk branch and the build folder. A worktree that holds a link, or that git refuses to remove, stays, and the result names it. The worktrees stay while the loop is stopped, because a resume needs them.
- **The repo hooks run on every trial commit.** A hook that refuses the commit rejects the trial, and the loop continues. The loop never skips the hooks, because the squash at finish must pass them too. The spec's `format` command formats each change before its commit.
- **The keep rule counts noise.** The baseline runs the metric `repeat` times. A trial is kept only when its gain is larger than `max(min-gain, 2 × noise)`, and a confirm run agrees.
- **Branch rounds explore.** A round forks the trunk's best code into `branches` branches, `optimize/<slug>--r<n>b<k>`. Each branch proposer reads only the trials of its own branch, and no hypothesis of the trunk. The best branch becomes the trunk. Rounds open on a fixed share of `budget.trials`, and a plateau opens a round early. A plateau stops the loop only when the round that it opened finds no gain.

CAUTION: do not delete an optimize worktree with a recursive delete. A `node_modules` junction in the worktree points into the main checkout, and the delete follows it. `round-close`, `finish` and `cleanup` remove a worktree only when it holds no link.

## Step 0 — Resolve

1. Read the first token:
   - When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token> index` exits 0 and shows `workflow-type: optimize`, the token is the slug. Continue.
   - When that index exists with another `workflow-type`, end the run: *"`<token>` is a `<type>` workflow. Start an optimize slug with `/wf intake optimize <description>`."*
   - Otherwise the arguments are a description. Load [intake/optimize.md](intake/optimize.md) and follow it with the whole description. Then end the run.
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`), `<skill-dir>`, `pluginRoot` and `referenceRoot` as [yolo.md](yolo.md) Step 0 does.
3. Every loop action goes through the optimize script. Each command prints one JSON object:

   ```
   node "<skill-dir>/scripts/optimize.mjs" <command> "<projectRoot>" <slug> ...
   ```

   Do not edit `optimize/state.json` or `optimize/results.jsonl` by hand.
4. When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 02-optimize-spec.md` shows no `confirmed-by`, end the run: the person confirms the spec with `/wf intake optimize <slug>`.
5. Run `status`. Its `state` and `next.action` say what this invocation does:

| `state` · `next.action` | Do |
|---|---|
| `stopped` · `baseline` | Step 1. |
| `running` · any action | Step 2. |
| `complete` · `finish` | Step 3. |
| `stopped` · `person` | Show `reason`, `detail` and `next.why`. The person chooses. A raised `budget` or `branch-rounds.max-extra` in the spec continues the loop when `status` then shows `running`. Otherwise the choice is `finish` (Step 3) or a new optimize slug. For `state-error`, report and do not repair. |
| `finished` · `verify` | The loop is done. The next step is `/wf verify <slug> optimize`. |

## Step 1 — Baseline

1. Run `baseline`. The script makes the worktree and the trunk, runs the guard, runs the metric `repeat` times, and runs the holdout.
2. On `ok: false`, show the error and end the run. A red guard ends the loop before it starts: the guard is fixed first.
3. Show the baseline median, the noise floor, and the worktree path. Continue at Step 2.

## Step 2 — Run the loop

When your host has the driver (Claude Code only):

1. Stage the driver: `node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver optimize`. The JSON line holds `scriptPath`.
2. Launch the driver the same way as [yolo.md](yolo.md) Step 1 launches its driver, with the staged `scriptPath` and the args `{ projectRoot, referenceRoot, slug }`.
3. Start the watch and the running commentary per [yolo/_commentary.md](yolo/_commentary.md). The driver journal is `.ai/workflows/<slug>/.driver-journal.jsonl`.
4. When the driver returns, end the watch and go to Step 4.

To resume, run `/wf loop optimize <slug>` again. The script continues from `state.json`, inside an open round too.

### Without the driver

On a host with no driver, the goal contract carries the loop: `/wf loop goal <slug>` arms `kind: optimize` ([goal.md](goal.md)). Each worker turn runs one action:

1. Run `status`. When `next.action` is `round-open`, `round-close` or `checkpoint`, run that command, then run `check` of the goal and end the turn.
2. For a `trial`, run `propose-context`. Its `digest` is all that you may know about the run. Do not read `optimize/` or other branches' history.
3. Write one hypothesis: what to change, why, and the expected gain.
4. Make the change in the worktree that the digest names, on the branch that it names. Change nothing outside `allowed-paths`.
5. Run `trial h<n> --hypothesis "<text>" --expected "<gain>"`. The script judges the change.
6. Run `check` of the goal, and end the turn.

## Step 3 — Finish

1. Confirm that the main checkout is on the slug branch and that it has no uncommitted changes to tracked files. Otherwise ask the person to commit or stash them.
2. Run `finish --message "<one-line commit message in product language>"`. The script squashes the kept trials of the trunk and the round winners onto the slug branch as one commit. It writes `03-slice.md`, `03-slice-optimize.md` with the acceptance criteria, and `05-implement-optimize.md` with the table of kept trials. Then it removes the worktrees, the trunk branch and the shared build folder.
3. When the result of `finish` names a worktree in `cleanup.kept`, show its reason. After the person removes the link, run `cleanup` again.

## Step 4 — Hand back

End with the dispatcher's summary block (SKILL.md Step 2). The narrative says the baseline and the kept value with the noise floor, the trials and the keeps, each branch round and its winner (a branch or the trunk), why the loop stopped, and the next step: `/wf verify <slug> optimize` after a finish, or the person's choice after a stop.

## The files

| File | Writer | What |
|---|---|---|
| `02-optimize-spec.md` | intake, with the person | The objective, metric, guard, holdout, `allowed-paths`, budget, `branch-rounds`, and `confirmed-by` |
| `optimize/state.json` | the optimize script | The trunk best, the open round and the best of each branch, the counters, the stop |
| `optimize/results.jsonl` | the optimize script | One line for each trial, round-open, round-close, checkpoint and finish. Append-only |
| `03-slice-optimize.md`, `05-implement-optimize.md` | the optimize script at finish | The one slice of the loop, for verify and review |
