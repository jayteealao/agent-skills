---
description: Run or resume the metric loop of an optimize slug. Each trial proposes one change, makes it in a separate worktree, and measures it; a script keeps the change or reverts it by a noise-aware rule. Branch rounds fork the best code into fresh branches that read only their own history, on a fixed schedule and on a plateau. When the loop ends, each kept change becomes one commit on the slug branch, and together they are one slice for verify and review. A description starts a new optimize slug through intake.
argument-hint: <slug> | <description>
---

You are running `/wf loop optimize <slug>`. An optimize slug has its own lifecycle: intake and the metric spec (`/wf intake optimize`), then the loop, then verify, review, ship and retro as for any slug. This sub-key runs the loop. The loop changes code toward one number: the metric of `02-optimize-spec.md`.

> **Hosts.** The script and the ledger are the same on every host. The driver (`workflows/optimize.js`) is Claude Code only. On a host with no driver, the goal contract carries the loop in the session, one action for each turn ([goal.md](goal.md)). `status` prints the exact command of each action in `next.command`.

## What the loop is, and is not

- **The script decides.** `optimize.mjs` makes every git write, every measurement, and every keep or revert. It writes the ledger. You propose and edit only. Do not run `git reset`, `git revert` or `git checkout` for the loop.
- **The person owns the spec.** The person confirmed the metric, the guard, `allowed-paths` and the budget at intake. The loop does not edit the spec, the metric command, the guard, the holdout, or their files. A trial that touches one of them is rejected before it is measured.
- **The trials run in separate worktrees.** The trunk is the branch `optimize/<slug>`, in the worktree `<root>.optimize/<slug>`. Each branch of a round gets its own worktree beside it, `<slug>--r<n>b<k>`. The person's own working tree is not reset.
- **Only the measurement is serial.** Two measured runs on one machine corrupt each other's numbers, so a lock lets one guard and one measurement run at a time. In a round, the driver proposes and edits on every ready branch at the same time, and measures the edited branches one after the other. The trunk stays serial, because each trunk proposer reads the verdict of the trial before it. An editor never builds, tests or formats. A proposer builds, profiles and runs benchmarks only with `probe`: in a probe worktree of its lane (`probe-open`), with its own build folder, under the measure lock. A trial waits for a probe. A proposer has `budget.propose-time` for its research. At twice that time, `probe-open` and `probe` refuse it, so it returns its best hypothesis.
- **The spec can share one build folder.** `shared-build: <VARIABLE>` (for example `CARGO_TARGET_DIR`) sets that variable to `<root>.optimize/<slug>.build` for every command of the loop, so a new branch worktree does not start with a cold build.
- **The loop removes its worktrees when it is done.** `round-close` removes the worktrees of the round. `finish` removes the trunk worktree, the trunk branch and the build folder. A worktree that holds a link, or that git refuses to remove, stays, and the result names it. The worktrees stay while the loop is stopped, because a resume needs them.
- **The repo hooks run on every trial commit.** A hook that refuses the commit rejects the trial, and the loop continues. The loop never skips the hooks, because the commits of finish must pass them too. The spec's `format` command formats each change before its commit.
- **The proposers share a profile.** When the spec has `profile`, a profile of the trunk best runs before the first trial and before each round. `profile: <command>` runs a command that prints one JSON line for each part of the work (`name`, `share`, and optionally `calls` and `where`). `profile: agent` runs a profiler agent that adds counters in the probe worktree of the trunk, runs them with `probe`, and records them with `profile-record`; its counters are kept as a patch for the next profile. Every digest holds the 15 largest entries, with `maxGain` (the gain if that cost went to zero) and `alone: false` for an entry that cannot pass the threshold by itself.
- **The lanes share an ideas ledger.** `optimize/ideas.json` holds one record for each idea of every lane: its target, status (`open`, `failed`, `marginal`, `kept`, `bundled`), trials and pooled gain. A lane holds one claim, and takes it with `idea-claim` just before each trial: a proposer claims the hypothesis that runs now before it returns, and the loop claims each queued trunk hypothesis just before its trial, after the trial before it settled its idea. A claim that is refused drops that queued hypothesis and keeps the claim the lane holds. A claim of another lane on the same target is refused, and a target that was tried is refused unless `--again` gives a new reason. A branch sees the ideas of every lane, but never the hypothesis text of another lane. A kept trial, and a reverted trial with a positive gain, keep their diff in `optimize/patches/`.
- **The keep rule counts noise.** The baseline runs the metric `repeat` times. A trial is kept only when its gain is larger than `max(min-gain, 2 × noise)`, and a confirm run agrees.
- **`metric.paired: true` compares each trial with its reference in turns.** The baseline makes a reference worktree, `<slug>--ref`, with its own build folder, and runs an A/A block of the reference against the trunk: half the range of those pair gains is the paired noise. A trial then runs a block of `repeat` pairs, the best of its lane against the trial, in the order A B, B A, …, after one warm-up run on each side. The trial is kept when the median pair gain is above `max(min-gain, 2 × paired noise)`, at least all but one of the pairs gain, and a second block agrees. Drift on the machine then adds to both sides, so a gain of about 2% can pass.
- **Branch rounds explore.** A round forks the trunk's best code into `branches` branches, `optimize/<slug>--r<n>b<k>`. Each branch proposer reads only the trials of its own branch, and no hypothesis of the trunk. The best branch becomes the trunk. Rounds open on a fixed share of `budget.trials`, and a plateau opens a round early. A plateau stops the loop only when the round that it opened finds no gain.
- **The schedule follows the budget that ends the run first.** `status` projects the trials that `budget.wall-clock` allows: the trials used, plus the time left over the median time between the last 6 trials. The schedule points use the smaller of `budget.trials` and that projection, and `why` shows it. A round opens only when its `branches × branch-trials` measurements fit in the time left, at the mean time of the guard and the measurement of the last 5 trials (`ms` on each trial line). A round that does not fit is skipped: the trunk continues, and the next trunk trial line records `skippedRound`.
- **The end of the clock is kept for the harvest.** With a pace, `status` keeps back the time of 2 measurements, and one more for each keep when the ablation runs. A round closes early when the time left falls under that reserve, and a round opens only when its measurements and the reserve fit. When the time left is under one trial plus the reserve, the trunk takes no new proposed trial: a possible bundle of marginal ideas runs at once, and otherwise the loop stops for the budget, with the reserve left for the merge step, the ablation and finish.
- **Finish checks each kept change.** Before the commits of finish, `ablate` reverts each kept change of the trunk alone in the reference worktree, on top of the final code, and runs a paired block of the code without the change against the final code. A change whose removal costs no more than the keep threshold is `weak`; a revert that conflicts is `not checked`. `05-implement-optimize.md` lists each change with its verdict. Nothing is removed: the person decides at verify. The ablation does not count against `budget.trials`. `finish` runs it when it did not run, and `ablate: off` in the spec, or `finish --no-ablate`, turns it off.
- **Finish checks the holdout.** When the spec has a holdout and a change was kept after the last checkpoint, `finish` runs the holdout first and writes its value into `05-implement-optimize.md`. A regression stops the finish; `finish --no-holdout` commits the changes anyway.
- **A round considers a merge of the other branches.** After `round-close`, each other branch whose kept gain passes the keep threshold is a candidate, unless its test merge onto the new trunk conflicts. One consider step decides `try` or `skip` for each candidate and puts the tries in order (`merge-consider`). Each try is merged into the trunk and judged as a trial against the trunk best (`merge-trial`): it counts against `budget.trials` and does not change the plateau streak. Then the step deletes the branches and runs the checkpoint. `branch-rounds.merge: off` keeps only the winner.
- **A kept change of a branch can come back alone.** When a branch cannot be merged whole, because its merge conflicts or its branch did not win, each kept trial of that branch whose diff applies to the new trunk is a port candidate (`t<n>`). The consider step decides `try` or `skip` for a port as for a branch. A port trial runs on the trunk with no proposer: `trial --apply` applies the kept diff, and only when the diff does not apply does the editor make the same change by hand. Its ledger line holds `port` and `additive`, the measured gain against the gain of the trial alone.
- **The near misses of the winner come back together.** At `round-close`, the reverted trials of the winning branch with a gain above 0 form one candidate of kind `bundle`, `n<round>`: the largest gain first, each on files that no other member touches, while their diffs apply together on the new trunk. It needs 2 or more trials. They were measured on the code that the trunk now holds, and near the noise floor one result says little, so the consider step tries the bundle first unless two of its changes remove the same cost. A kept bundle marks its ideas `bundled`.
- **The consider step sees the ideas ledger.** Each port and bundle names its targets and the ideas of the ledger on those targets, with the lane of each trial and its status. A port whose target already has a `kept` or `marginal` idea on the winner or the trunk repeats a change, and is skipped unless its mechanism differs.
- **Marginal ideas are tried together.** When the trunk streak reaches half of `budget.plateau`, and two to four `marginal` ideas with a gain above 0, different targets and diffs that apply together on the trunk exist, the next trunk trial is a bundle of those ideas, with no proposer. Their gains need not add up past the threshold: the combined trial is the test. A kept bundle marks its ideas `bundled`. The same set of ideas is not tried twice.
- **A round starts from seeds, and prunes a branch that trails.** With a profile, `round-open` gives each branch a seed: one of the largest entries that can pass alone, and never the target of a `failed` idea. A branch with 2 or more trials, no keep and trials left, whose best trails the leader of the round by more than the keep threshold, is pruned: `prune` removes its worktree and gives its other trials to a new branch forked from the leader's best, with the next free seed. `branch-rounds.prune: off` turns this off.

CAUTION: do not delete an optimize worktree with a recursive delete. A `node_modules` junction in the worktree points into the main checkout, and the delete follows it. `round-close`, `finish` and `cleanup` remove a worktree only when it holds no link.

## Step 0 — Resolve

1. Read the first token:
   - When `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token> index` exits 0 and shows `workflow-type: optimize`, the token is the slug. Continue.
   - When that index exists with another `workflow-type`, end the run: *"`<token>` is a `<type>` workflow. Start an optimize slug with `/wf intake optimize <description>`."*
   - Otherwise the arguments are a description. Load [intake/optimize.md](intake/optimize.md) and follow it with the whole description. Then end the run.
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`), `<skill-dir>`, `pluginRoot` and `referenceRoot` as [yolo.md](yolo.md) Step 0 does: `pluginRoot` is `$CLAUDE_PLUGIN_ROOT` when set, else the folder three levels above this reference file, never the reference folder itself.
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
| `complete` · `ablate` or `finish` | Step 3. |
| `stopped` · `person` | Show `reason`, `detail` and `next.why`. The person chooses. A raised `budget` or `branch-rounds.max-extra` in the spec continues the loop when `status` then shows `running`. A `plateau` or `holdout-regression` stop stays until `resume` clears it: run `resume` after the person changes the spec or chooses to go on, and `resume --revert` to put the trunk back at the last good checkpoint first. Otherwise the choice is `finish` (Step 3) or a new optimize slug. For `state-error`, report and do not repair. |
| `finished` · `verify` | The loop is done. The next step is `/wf verify <slug> optimize`. |

## Step 1 — Baseline

1. Run `baseline`. The script makes the worktree and the trunk, runs the guard, runs the metric `repeat` times, and runs the holdout.
2. On `ok: false`, follow the failure rule of [_host-invocation.md](_host-invocation.md), and end the run. A red guard ends the loop before it starts: the guard is fixed first.
3. Show the baseline median, the noise floor, and the worktree path. Continue at Step 2.

## Step 2 — Run the loop

When your host has the driver (Claude Code only):

1. Stage the driver: `node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver optimize`. The JSON line holds `scriptPath`.
2. Launch the driver the same way as [yolo.md](yolo.md) Step 1 launches its driver, with the staged `scriptPath` and the args `{ projectRoot, referenceRoot, slug }`.
3. Start the watch and the running commentary per [yolo/_commentary.md](yolo/_commentary.md). The driver journal is `<wf-dir>/.driver-journal.jsonl`.
4. When the driver returns, end the watch and go to Step 4.

To resume, run `/wf loop optimize <slug>` again. The script continues from `state.json`, inside an open round too.

### Without the driver

On a host with no driver, the goal contract carries the loop. Load [goal.md](goal.md) and arm the goal of the slug: it arms `kind: optimize`. Each worker turn runs one action. `status` prints that action in `next`, with three fields:

- `command`: the exact command line. `then` lists the commands that follow it in the same turn. A `<…>` in a command is a value that you supply.
- `needs`: what you supply, and what you read first. `needs.fill` describes each `<…>`.
- `after`: what you do next. When a goal carries the loop, it names the `check` of the goal as the last command of the turn.

Do these steps in each turn:

1. Run `status`.
2. Do what `next.needs` says. Then run `next.command`, and each command of `next.then` in order. For `baseline`, `ablate` and `finish`, Step 1 and Step 3 say what to show and when to end the run.
3. When the result matches `next.fallback.when`, do what `next.fallback.needs` says, and run `next.fallback.command`.
4. Do what `next.after` says.

When `next.command` is null, the next step is the person's: show `reason`, `detail` and `next.why`, as Step 0 says.

Judge these parts yourself:

- **What you may read for a trial.** The digest of `propose-context` is all that you may know about the run, with the code in its worktree. Do not read `optimize/` or the history of other branches.
- **A good hypothesis.** It says what to change, why, and the expected gain. It targets a large entry of the profile that can pass alone. It does not repeat a target that failed, or that another lane claims. It never special-cases the inputs that the metric measures. Prefer a simpler change at equal gain.
- **The claim comes before the edit.** Run the `idea-claim` command of `next.then` first, then make the change, then run the `trial` command.
- **When to skip a merge candidate.** Read each diff that `next.needs.candidates` names, and the winner's change in the trunk worktree. Skip a candidate whose change removes the same cost as the winner's change. Skip a port or a bundle that `repeats` an idea of the winner or the trunk, unless its mechanism differs. Do not try a branch and a port of the same branch. Try a bundle of near misses first, then the largest expected added gain.

## Step 3 — Finish

1. When `status` shows `finishBlocked`, show it and end the run: the person acts first. A goal of the slug then prints `BLOCKED` with that reason, and it is met only when `status` shows `finished`. Confirm that the main checkout is on the slug branch. When it has uncommitted changes to tracked files, run `finish` with `--stash`: the script copies those files to `optimize/finish-stash/`, stashes them for the commits of finish, and restores them byte for byte. It refuses a file that those commits also change; ask the person to commit that file.
2. Run `finish --message "<one-line commit message in product language>"`. The script runs the ablation when it did not run, and the holdout when a change was kept after the last checkpoint. Then it puts each kept change on the slug branch as its own commit, in the order the trunk kept it. A reverted trial is not on the trunk, so it gets no commit. A round winner gives one commit for each of its keeps, and a port or a bundle gives one commit. A merged branch gives one commit, because the loop measured the merge as one change. The subject of each commit comes from its hypothesis, and the body gives the measured gain, the metric before and after, and the trial.
3. The script builds the commits on a temporary branch in the trunk worktree, with the same hooks as the trials, and moves the slug branch only when the result has the tree of the trunk. Before that move, it runs the commit hooks again in the trunk worktree as the slug branch sees them: a hook that decides by branch name sees the slug branch. That `pre-commit` sees every change of finish staged at once, and `commit-msg` sees each message. A commit that a hook refuses undoes the whole finish, and the slug branch stays as it was. A finish that stopped midway (a crash or a kill) leaves its temporary branch; the next `finish` puts it away by itself and says so in `recovered`, and when the slug branch already holds the commits, it only writes their records. `status` names such a finish in `recover`. It stops instead when the trunk branch moved, or when the stashed files of a `--stash` finish are still in the stash. When a change does not apply on its own (for example, the slug branch changed the same lines since the baseline), the script makes one commit with every change instead. `--message` is the subject of that one commit; with one commit for each change, it is not used. The result then says `history: 'one-commit'` and the reason.
4. The script writes `03-slice.md`, `03-slice-optimize.md` with the acceptance criteria, and `05-implement-optimize.md` with each kept change, its commit and its ablation verdict. The step ledger records each commit as a done step of the slice. Then the script removes the worktrees, the trunk branch and the shared build folder.
5. When `weak` in the result of `finish` is more than 0, name the weak changes in the hand-back. Verify decides whether they stay. Each weak change has its own commit, so verify can revert it alone.
6. When the result of `finish` names a worktree in `cleanup.kept`, show its reason. After the person removes the link, run `cleanup` again. `cleanup` also removes what a finish that stopped left: its worktree and its temporary branch.

## Step 4 — Hand back

End with the dispatcher's summary block (SKILL.md Step 2). The narrative says the baseline and the kept value with the noise floor, the trials and the keeps, each branch round and its winner (a branch or the trunk), why the loop stopped, and the next step: `/wf verify <slug> optimize` after a finish, or the person's choice after a stop. In one line, name the search mechanisms that produced no kept gain in this run: `mechanisms.idle` of the result of `finish`, or `idle` of `report` after a stop.

## The mechanism report

`report` measures which search mechanisms of the loop produce kept gain. It reads only the ledger and changes nothing:

```
node "<skill-dir>/scripts/optimize.mjs" report "<projectRoot>" <slug>
node "<skill-dir>/scripts/optimize.mjs" report "<projectRoot>" --all
```

- For each mechanism, it counts the trials, the keeps, the kept gain (in the metric's unit, and as a share of the total kept gain), the measurement time (`ms`), the gain per hour of measurement, and the keeps that the ablation called `weak`.
- The mechanisms are `trunk` (proposed trunk trials), `round` and `seed` (the keeps of a round winner, from a branch with no seed or with a seed), `prune` (the keeps of a branch that a prune forked), `merge`, `port`, `near-misses` and `marginal-bundle`.
- A kept change counts for one mechanism. A keep of a round winner counts for its branch. When a prune forked the winner, the keeps of the leader before the fork count for the leader. A keep of a branch that did not win adds nothing, unless a merge or a port brought it in; then it counts for that merge or port. A keep that `resume --revert` took off the trunk adds nothing.
- `rounds` gives each round's trials against the gain of its winner over the trunk best at round-open. `prunes` gives the trials that each replacement branch got, used and turned into keeps.
- `finish` writes the same table into `05-implement-optimize.md`.
- `--all` sums the runs of every optimize slug of the project, with `runs` and `paid` for each mechanism. `never` lists the mechanisms that ran in some run and never paid. A gain adds up only across runs of one unit.

## The files

| File | Writer | What |
|---|---|---|
| `02-optimize-spec.md` | intake, with the person | The objective, metric, guard, holdout, `allowed-paths`, budget, `branch-rounds`, and `confirmed-by` |
| `optimize/state.json` | the optimize script | The trunk best, the open round and the best of each branch, the counters, the stop |
| `optimize/results.jsonl` | the optimize script | One line for each trial, probe, profile, prune, round-open, round-close, checkpoint, ablate, resume and finish. Append-only |
| `optimize/ideas.json` | the optimize script | The ideas ledger of every lane |
| `optimize/profile.json`, `optimize/profile.patch` | the optimize script | The last profile, and the counters of the profiler agent |
| `optimize/patches/<trial>.patch` | the optimize script | The diff of each kept trial, and of each reverted trial with a positive gain |
| `03-slice-optimize.md`, `05-implement-optimize.md` | the optimize script at finish | The one slice of the loop, for verify and review. The implement record lists each kept change with its commit and its ablation verdict, and the mechanism report |
| `steps.jsonl` | the optimize script at finish | One done step for each commit of finish, and the complete row of the slice |
