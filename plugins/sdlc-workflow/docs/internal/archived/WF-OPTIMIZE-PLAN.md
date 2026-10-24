# WF-OPTIMIZE-PLAN — a metric loop with its own slug lifecycle

Status **SHIPPED v9.189.0** (2026-10-18: W1–W5 and W7 docs built; W0 probe and W6 live run not run) · Date **2026-10-17** · Plugin **v9.187.0** · Owner **jayte**
Pairs with: [WF-GOAL-PLAN.md](WF-GOAL-PLAN.md) (the goal contract, which carries this loop on hosts with no driver). Supersedes: row #20 and finding 340 of [CE-COMPARISON-AND-ADOPTION.md](../CE-COMPARISON-AND-ADOPTION.md) (`/wf optimize` as an off-pipeline command). Origin: the PO's review of goals and autoresearch, 2026-10-17.
Amended 2026-10-17 (plugin v9.188.0): branch rounds, the two proposer digests, and the plateau as a branch-round trigger (D12–D14, 4.4, 4.5). Source: Cai, Ziakas et al., "Fork-and-Flush: Escaping Idea Basins in Autoresearch Agents", [arXiv 2610.07447](https://arxiv.org/abs/2610.07447), Microsoft Research, 2026-10-05.

## 1. Why

Some work has a number as its goal: test time, bundle size, p95 latency, a coverage percent, an eval score. The way to reach such a number is an experiment loop: change one thing, measure, keep the change if the number is better, revert it if not, and repeat. Karpathy's `autoresearch` (March 2026) made this loop popular. Skills such as `uditgoenka/autoresearch` and `leo-lilinxiao/codex-autoresearch` apply the loop to any metric.

`/wf` has no such loop.

| Surface | What it does | Why it is not the loop |
|---|---|---|
| `augment/benchmark.md` | One baseline, one compare, median of 10 or more runs, ±10% | One comparison only. No iteration. "Not a CI gate" |
| `augment/experiment.md` | Designs an A/B rollout in `04c-experiment.md` | Writes no code. Runs nothing |
| verify fix loop | At most 2 fix rounds | Pass or fail, never "better" |
| campaign revert search (`campaign/_boundary.md`) | Reverts merges newest first until verify is green | Judge is pass or fail, not a metric |

The public skills share four failure modes, and arXiv 2610.07447 measures a fifth. This plan answers each one.

| Failure mode | Source | Answer in this plan |
|---|---|---|
| The agent chases noise: a gain smaller than run-to-run variance is kept | Karpathy's keep rule has no repeat runs | D6: a measured noise floor and a confirm run |
| The metric improves on the evaluated set and falls on unseen data | bespokelabs autoresearch exam, 24-hour runs | D7: an optional holdout command that the loop never sees |
| The agent games the metric: hard-coded constants, special cases for the evaluator | arXiv 2607.18064 | D5 off-limits paths, and D10: the normal review stage reads the kept diff |
| The model owns the git state and loses it | codex-autoresearch moves commits and reverts into a script | D4: `scripts/optimize.mjs` owns git, measurement, and the ledger |
| The run settles in one approach early and spends the rest of its budget tuning it. Independent runs of one agent on one task stop at very different scores. A summary of the history (compaction) does not free the run | arXiv 2610.07447: 13 tasks, runs up to 107 hours | D12–D14: branch rounds on a fixed schedule, a flushed digest for each branch, and a plateau that opens a branch round |

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | Optimize is its own slug lifecycle: intake, spec, loop, verify, review, handoff, ship, retro. It is not an off-pipeline command and not an augmentation. | PO 2026-10-17 |
| D2 | One new key, `optimize`. `/wf optimize <slug>` runs or resumes the loop of an existing optimize slug. `/wf optimize <description>` starts a new one through `/wf intake optimize <description>`. The first token decides, by the registry (convention over flags). | recommendation |
| D3 | The person confirms the metric spec before the first trial. The choice of metric is the largest risk, so it is a human gate, like `design`. | recommendation |
| D4 | `scripts/optimize.mjs` owns every git write, every measurement, every keep or revert, and the ledger. The model proposes and edits only. The model never runs `git reset` or `git revert` for the loop. | recommendation |
| D5 | The spec names `allowed-paths`. A trial whose diff touches a path outside `allowed-paths`, or touches the metric command, the guard, the holdout, or their fixtures, is rejected before measurement. | recommendation |
| D6 | The baseline runs the metric `repeat` times (default 5). The noise floor is the spread of those runs. A trial is kept only when its gain is larger than `max(min-gain, 2 × noise)`, and a confirm run of `repeat` measurements agrees. | recommendation |
| D7 | The spec may name a `holdout` command. The loop never shows its output to the proposer. `optimize.mjs` runs it at the baseline, at each checkpoint, and at the end. A holdout regression past its tolerance stops the loop. | recommendation |
| D8 | Trials run in one worktree. The trunk is the branch `optimize/<slug>`. A branch round adds the branches `optimize/<slug>--r<n>b<k>` in the same worktree (4.4). The person's working tree is never reset. Measurement is serial, because two measured runs on one machine share CPU and memory and corrupt each other's numbers. | recommendation |
| D9 | Claude Code runs the loop with a Workflow driver, `skills/wf/workflows/optimize.js`. Codex and pi run the same loop in session, carried by the goal contract of [WF-GOAL-PLAN.md](WF-GOAL-PLAN.md). | recommendation (see section 5) |
| D10 | When the loop stops, `optimize.mjs` squashes the kept trials into one slice. That slice goes through verify and review like any slice. Review reads the diff for metric gaming. | recommendation |
| D11 | Retro writes what worked and what failed into `.ai/solutions/`, so the next optimize spec can read the old hypotheses. | recommendation |
| D12 | The loop runs branch rounds on a fixed schedule. A branch round forks `branches` branches from the trunk's `best` commit. Each branch runs `branch-trials` trials. When the round closes, the best branch becomes the trunk and the other branches are deleted. The schedule is a share of `budget.trials` used, not a stall detector. The defaults (4 branches, rounds at 0%, 33% and 66%, 6% of the budget per branch) are the settings of arXiv 2610.07447. | PO 2026-10-17. Defaults from arXiv 2610.07447 |
| D13 | Each branch reads a flushed digest: the spec prose, `best`, and the code, but no trial history and no hypotheses from the trunk. The trunk keeps the full digest. The branch prompt carries no "try a different approach" directive. | PO 2026-10-17 (review of the digest). Evidence in 4.5 |
| D14 | A plateau opens a branch round. It does not stop the loop. The loop stops with `plateau` only when a branch round that a plateau opened closes with no branch better than the trunk. | PO 2026-10-17 |

## 3. The lifecycle

| Stage | Command | Writes | Gate |
|---|---|---|---|
| intake | `/wf intake optimize <description>` | `01-intake.md`, `workflow-type: optimize` | none |
| spec | inside intake, Step "spec" | `02-optimize-spec.md` | the person confirms the spec (D3) |
| baseline | first run of `/wf optimize <slug>` | `optimize/state.json`, first lines of `optimize/results.jsonl` | the guard must pass at the baseline. If it fails, stop |
| loop | `/wf optimize <slug>` | trial commits on the trunk and on the branches of each branch round, `optimize/results.jsonl` | the stop conditions of 4.6 |
| slice | the end of the loop | `03-slice-optimize.md`, `05-implement-optimize.md` (the squash) | none |
| verify | `/wf verify <slug> optimize` | `06-verify-optimize.md` | re-runs the metric, the guard, and the holdout |
| review | `/wf review <slug>` | `07-review*.md` | the review ledger, as today |
| handoff, ship, retro | as today | as today | as today |

`shape` and `plan` are replaced by the spec. `slice` and `implement` are written by `optimize.mjs` from the loop result. `auto` and `yolo` treat an optimize slug as a compressed lifecycle (`_compressed-lifecycle` rules), and they start at verify when the loop is finished.

## 4. Design

### 4.1 The spec

`02-optimize-spec.md` has YAML frontmatter that `optimize.mjs` reads, and prose that the proposer reads.

```yaml
objective: "Cut the cold test-suite time"
metric:
  command: "node scripts/time-tests.mjs"   # last stdout line: one number, or JSON with `key`
  key: null
  direction: lower                          # lower | higher
  unit: s
  target: 40                                # optional. The loop is complete when the kept value reaches it
  repeat: 5
  min-gain: 2%                              # absolute or percent
guard:
  command: "npm test"                       # must exit 0 after every trial
holdout:
  command: null                             # optional, never shown to the proposer
  tolerance: 1%
allowed-paths: ["src/**", "test/setup/**"]
off-limits: ["scripts/time-tests.mjs"]     # the metric, guard and holdout files are added by optimize.mjs
budget:
  trials: 60                                # trunk trials and branch trials together
  plateau: 8                                # 8 trunk trials in a row with no keep open a branch round (D14)
  wall-clock: 6h
  tokens: null
  trial-timeout: 10m
branch-rounds:                              # D12. `at: []` turns branch rounds off
  at: [0%, 33%, 66%]                        # share of budget.trials used. 0% opens a round from the baseline
  branches: 4
  branch-trials: 3                          # default: 6% of budget.trials, rounded down, at least 3
  max-extra: 2                              # most branch rounds a plateau can add after the scheduled ones
width: 1                                    # proposals per batch on the trunk. Measurement stays serial (D8)
```

The default `budget.trials` is 60, not 40. With 4 branches of 3 trials, the three scheduled rounds use 36 trials and leave 24 trials for the trunk. With 40 trials, the rounds leave the trunk 4 trials. In arXiv 2610.07447 the branches used about 72% of the budget (3 rounds × 4 branches × 6%).

The intake spec step does these things:

1. Ask the person for the objective, the metric command, and the direction. Use `_gate-question.md`.
2. Run the metric command once. The last stdout line must parse as one number, or as JSON with `metric.key`. If the line does not parse, show the output and ask again.
3. Run the guard once. The guard must exit 0. If the guard fails, stop and report. A loop cannot start from a red guard.
4. Propose `allowed-paths` from the code that the metric exercises, and propose the budget and `branch-rounds`. The person confirms or edits them.
5. Ask whether a holdout exists. Recommend one when the metric is a score over a fixed data set.
6. Write `02-optimize-spec.md`. Record the person's confirmation in `00-index.md`.

### 4.2 `scripts/optimize.mjs`

One script, with subcommands in the style of `scripts/campaign.mjs`. Each subcommand prints one JSON line.

| Subcommand | Does |
|---|---|
| `baseline <root> <slug>` | Creates the worktree and the branch. Runs the guard, then the metric `repeat` times, then the holdout. Writes `state.json` with `best`, `noise`, `baseline`. |
| `propose-context <root> <slug>` | Prints the digest that the next proposer reads. On the trunk, that is the trunk digest. In a branch round, it is the flushed digest of the branch whose turn it is (4.5). |
| `trial <root> <slug> <hypothesis-id>` | Runs on the trunk or on the branch that `status` names. Checks the worktree diff against `allowed-paths` and `off-limits`. Commits the diff. Runs the guard, then the metric `repeat` times, then a confirm run if the first run wins. Decides `kept`, `reverted`, `rejected`, `crashed`, or `timeout`. Moves the `best` of that trunk or branch on keep. Resets the worktree to that `best` on every other result. Appends one line to `results.jsonl`. |
| `round-open <root> <slug> <reason>` | Opens a branch round. `reason` is `schedule` or `plateau`. Creates the branches from the trunk's `best` commit. Records the round in `state.json`. Refuses when the trials left in `budget.trials` cannot cover `branches × branch-trials`. |
| `round-close <root> <slug>` | Picks the winner (4.4). Fast-forwards the trunk to the winner's `best`. Runs `checkpoint` on the new trunk. Deletes the other branches. Prints the winner, or `trunk` when no branch has a keep. |
| `checkpoint <root> <slug>` | Runs the holdout. Compares it to the baseline holdout. Prints `ok` or `holdout-regression`. |
| `status <root> <slug>` | Prints `running`, `complete` (target reached), or `stopped` with the reason, and the next action. The next action names the trunk or the branch that runs the next trial, or `round-open` or `round-close`. The goal contract reads this line (WF-GOAL-PLAN 4.2). |
| `finish <root> <slug>` | Squashes the kept trials onto the slug branch as one commit. Writes the slice and implement artifacts with the metric table. |

`results.jsonl` is append-only. Each line holds `trial`, `round`, `branch`, `hypothesis`, `commit`, `values`, `median`, `delta`, `noise`, `verdict`, `guard`, `at`. On the trunk, `round` and `branch` are `null`. `round-open` and `round-close` also append one line each. `state.json` holds the trunk `best`, the open round with the `best` of each branch, and the counters. A deleted branch leaves its commits and hypotheses in `results.jsonl`, so retro (D11) can read them. If `state.json` and `results.jsonl` disagree, `optimize.mjs` stops with an error. It does not guess.

WARNING: `optimize.mjs` runs `git reset --hard` inside the optimize worktree. It must refuse to run when its cwd is not that worktree. A reset in the person's own tree destroys uncommitted work.

CAUTION: `round-close` deletes branches. It must delete only the branches that `state.json` lists for the open round, by their exact names. A delete by pattern can remove the person's own branches.

CAUTION: remove the optimize worktree with `git worktree remove` only after you check for a `node_modules` junction. `--force` deletes through the junction into the main checkout (see the worktree junction trap in memory).

### 4.3 The trial loop

One trial is these steps:

1. Read `optimize.mjs status`. If the next action is `round-open` or `round-close`, run that subcommand first (4.4).
2. The proposer reads `propose-context` and writes one hypothesis: what to change, why, and the expected gain.
3. The editor makes the change in the worktree, on the trunk or branch that `status` names. The editor changes nothing outside `allowed-paths`.
4. `optimize.mjs trial` judges the change. The model does not judge.
5. Every `checkpoint-every` trunk trials (default 5), `optimize.mjs checkpoint` runs.
6. Before the next trial, read `.control.json`. A stop request or a usage pause ends the loop at this boundary.

With `width` above 1, several trunk proposers write hypotheses at the same time. Their edits wait in a queue, and `trial` measures them one at a time (D8).

### 4.4 Branch rounds

A long run of one agent settles in one approach. arXiv 2610.07447 calls such a region of the solution space an "idea basin". In that study, eight runs of one agent on one task (p171) stopped between 68.3 and 100.0. More compute did not close the gap, and compaction did not free a run from its basin. The study's answer is fork-and-flush. Under the same budget, it raised the normalized mean score over 13 tasks from 0.47 (one run) and 0.54 (best of 4) to 0.78. The ablation shows that both parts are necessary: fork only gave 0.57, flush only gave 0.55, and both together gave 0.71 (11 tasks).

A branch round is the fork-and-flush round of that study, in this loop's terms:

1. `round-open` creates `branches` branches, `optimize/<slug>--r<n>b<k>`, from the trunk's `best` commit. The `--` separator is necessary, because git cannot hold the ref `optimize/<slug>` and a ref below `optimize/<slug>/` at the same time.
2. The branches take trials in turn: b1, b2, b3, b4, b1, and so on. Before each trial, `optimize.mjs` checks out that branch in the one worktree. Measurement stays serial (D8), and the worktree needs no second install.
3. Each branch keeps or reverts against its own `best`, with the keep rule of D6. The `best` of each branch starts at the trunk's `best`.
4. Each branch proposer reads the flushed digest of its own branch (4.5).
5. When every branch has run `branch-trials` trials, `round-close` picks the winner. The winner is the branch with the best kept value. A branch with no keep cannot win. When values are equal, the branch that reached its value first wins. When no branch has a keep, the trunk stays where it is.
6. `round-close` fast-forwards the trunk to the winner's `best` and runs the holdout `checkpoint` on it. The pick among branches is a selection on the metric, so the holdout checks the pick.
7. After a round closes with a winner, the trunk digest starts again from the winner's trials. The trunk's history from before the fork is flushed, as in the study, where the run continued from the winning branch.

A scheduled round opens at the first trial boundary where the share of `budget.trials` used reaches the next value in `at`. The `0%` round opens from the baseline, so all branches of the first round start from the same code with no history. This matches the study's opening round.

The study used a fixed schedule because stall triggers failed. In 15 of 25 runs with a stall trigger, the budget ran out before the trigger fired. Small gains reset the stall clock, and a run that creeps upward inside one basin is the exact case to fix. This loop has a smaller form of that problem, because the keep rule of D6 ignores gains below the noise floor. So the plateau stays, but only as a second trigger (D14 and 4.6).

When a stop request, a usage pause, or a budget ends the loop while a round is open, `state.json` keeps the round. On resume, the round continues at the next branch in turn. When `budget.trials` runs out during a round, `round-close` runs on the trials that exist, and then the loop stops.

The defaults follow the study: 4 branches, scheduled rounds at 0%, 33% and 66%, and about 6% of the budget for each branch. The study did not test short, noisy metrics. Its graders were deterministic, and its runs lasted hours to days. W6 measures whether the gain holds for this loop (open question 4).

### 4.5 The proposer digest

The digest is what a proposer reads before it writes a hypothesis. The first version of this plan gave every proposer one digest: the spec prose, `best`, the last 20 trials, the tried and failed hypotheses, and the `.ai/solutions/` entries that match.

That digest is a summary of the run's history. arXiv 2610.07447 found that a summary of the history (compaction) does not free a run from its basin. The history tells the proposer what the run is doing now, and the proposer continues it. In the study, a fresh branch had to work out the intent again from the files, and that is what let it reach a new basin. The study also gave two of the four branches in each round an instruction to "pick a different approach". Such a branch won 81 of 178 mid-run rounds (46%, against 50% by chance, p = 0.26), so the instruction had no effect. D13 adds no such instruction.

The trunk exploits and the branches explore, so they read different digests:

| Item | Trunk digest | Flushed digest (branch) | Why |
|---|---|---|---|
| Spec prose, `allowed-paths`, `off-limits` | yes | yes | The task, not the history |
| The code at the current `best` | yes | yes | The study's "workspace". A branch keeps all accumulated work |
| `best` value and baseline value | yes | yes | The number to beat. The study gave branches the inherited score |
| The last 20 trials and their hypotheses | yes | the trials of this branch only | The trunk's history carries the trunk's intent |
| Tried and failed hypotheses | yes | the failures of this branch only | Same reason. A branch can try an old idea again, which is the cost of the flush |
| `.ai/solutions/` entries | yes | no | Memory from other runs. The study carried no memory across tasks |
| An instruction to try a different approach | no | no | No measured effect (see above) |

The proposer is a fresh agent for every trial, on every path that uses the driver (section 5). So the flush is a property of the digest, not of the agent.

### 4.6 Stop conditions

| Condition | `status` reason | Next |
|---|---|---|
| The kept value reaches `target` | `complete` | `finish`, then verify |
| `budget.trials` used | `budget` | the person chooses `finish` or a new budget |
| `budget.plateau` trunk trials in a row with no keep | none. The loop does not stop | `round-open plateau`. If a scheduled round is still to come, the plateau opens it early. If all scheduled rounds are used, the plateau adds a round, up to `max-extra` |
| A round that a plateau opened closes with no branch better than the trunk | `plateau` | the person chooses `finish`, a new spec, or a new budget |
| A plateau occurs, and `max-extra` is used or the trials left cannot cover a round | `plateau` | as above |
| `wall-clock` or `tokens` used | `budget` | as for `budget.trials` |
| The holdout regresses past `tolerance` | `holdout-regression` | stop. Show the trial range since the last good checkpoint |
| `.control.json` stop request | `stop-request` | resume with `/wf optimize <slug>` |
| Usage guard pause | `usage-pause` | the usage guard resumes it, as for yolo |
| `state.json` and `results.jsonl` disagree, or HEAD of the branch moved outside the loop | `state-error` | stop. Report. Do not repair |

With no `target`, the loop ends only at a budget, a plateau, or a stop. That is the bounded form of Karpathy's "never stop". A plateau stop now means that the trunk found no gain in `plateau` trials and that the fresh branches of a round also found none.

### 4.7 Verify and review

The slice from `finish` carries three acceptance criteria. Each criterion is a command, so verify can run it:

1. The metric command, `repeat` runs, reaches the kept value within the noise floor.
2. The guard exits 0.
3. When a holdout exists, the holdout is within `tolerance` of the baseline.

Review runs as today, with one addition: a metric-gaming check. The check reads the squashed diff for constants that match the evaluator's inputs, for branches on test or benchmark names, and for removed work that the metric does not see. The check is a section of an existing dimension or a new dimension; W4 decides.

## 5. Driver or goal

The PO asked whether optimize benefits from a driver. It does, on Claude Code.

| Concern | Workflow driver (`optimize.js`) | Host goal (`/goal`, Codex goals) |
|---|---|---|
| Context | Each proposer and editor is a fresh agent. Trial 80 reads the digest, not 79 trials of transcript | One session. The transcript grows with every trial and compacts many times |
| Branch rounds (4.4) | Fork and flush. Each branch proposer is a fresh agent that reads only the flushed digest | Fork only. `optimize.mjs` still runs the branches, but the session's transcript carries the trunk's intent into every branch, and the session cannot flush it. In arXiv 2610.07447, fork only gave 0.57 against 0.71 for fork and flush |
| Judge cost | No LLM judge. `optimize.mjs status` decides | The host judge reads the whole conversation after every turn |
| Budgets | Enforced in code | Written into the condition text. Claude Code `/goal` has no built-in cap |
| Stop and resume | `.control.json` and the usage guard, as yolo and campaign | The host's own pause and resume |
| Hosts | Claude Code only | Claude Code and Codex. pi has neither |

So the Claude Code path is the driver. The goal contract is the carrier on Codex, and it is the fallback on Claude Code when the person wants to stay in the foreground. In every path, `optimize.mjs` owns the decisions, so the three paths give the same ledger.

`optimize.js` follows the shape of `campaign-wave.js`:

- Bookkeeping agents run `optimize.mjs` commands and change nothing else.
- The proposer runs on Opus. The editor runs on Sonnet, per the A/B result of 2026-10-16.
- The driver writes heartbeats to `.driver-journal.jsonl` and obeys `.control.json`, through the yolo helpers.
- An agent ceiling stops a runaway run: 3 agents per trial × `budget.trials`, plus 2 per branch round (`round-open` and `round-close`), plus 10. Branch trials count against `budget.trials`, so the trial term covers them.

## 6. Work

| W | Work | Files |
|---|---|---|
| W0 | Probe: does the Workflow tool let a bookkeeping agent run a 10-minute measurement, and does the heartbeat stay fresh while that agent waits? | `CAMPAIGN-PROBES.md` style note |
| W1 | `lib/optimize.mjs` (spec parse, noise floor, keep rule, path check, ledger, branch-round schedule, winner pick, the two digests), `scripts/optimize.mjs`, tests. The tests cover a resume in the middle of a round and a budget that runs out during a round | `lib/`, `scripts/`, `tests/` |
| W2 | `intake/optimize.md` (mode and spec step), `reference/optimize.md` (the key), the key row in `SKILL.md` (24 → 25 keys), `workflow-type: optimize` in orientation | `skills/wf/` |
| W3 | `workflows/optimize.js` and its stage helper, after `stage-yolo-driver.mjs` | `skills/wf/workflows/`, `scripts/` |
| W4 | Verify reads the three ACs. Review gets the metric-gaming check | `reference/verify.md`, the review dimension |
| W5 | The Codex and pi path through the goal contract (WF-GOAL-PLAN W3) | `_host-invocation.md` |
| W6 | Live run on this repository: cut the cold time of `npm test`. Record the trial count, kept gain, noise floor, and cost. For each branch round, record the winner (a branch or the trunk) and whether the winner changed the approach or only tuned it | the run notes |
| W7 | Docs page, changelog, release | `docs/site/`, `CHANGELOG.md` |

`benchmark.md` keeps its job. W1 reuses its median rule for `repeat`, but `benchmark` stays a one-shot augmentation.

## 7. Open questions

1. Does the review get a new dimension for metric gaming, or a section in an existing one? (W4)
2. Is `width` above 1 worth its complexity in the first release, given serial measurement? Branch rounds now give the loop the breadth that `width` was for. The recommendation is to ship `width: 1` only, and to remove `width` if W6 shows no need for it.
3. When the metric is an LLM eval score, the metric itself is noisy and costs tokens. Does the spec need an eval tier, as CE row 14 suggests, or is the holdout enough?
4. Does the gain of arXiv 2610.07447 hold for short, noisy metrics such as test time? The study used deterministic graders and runs of hours to days. A control run with `branch-rounds.at: []` and the same budget answers the question, but it doubles the cost of W6. Does W6 include the control run?
5. On Codex and pi, the goal path gets fork without flush (section 5). Can the in-session loop start each branch trial in a fresh sub-agent, so that the branch reads only the flushed digest? W5 decides.
