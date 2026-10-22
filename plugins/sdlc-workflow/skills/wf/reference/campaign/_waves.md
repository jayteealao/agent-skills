# Campaign waves: launch, run, record, and pause

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. `<watch>` stands for `node "<pluginRoot>/scripts/yolo-watch.mjs"`. Handoff, ship, and the end are in [_ship.md](_ship.md). Local records are in [_records.md](_records.md).

Each wave is one PR, and one run of the wave driver drives every unit of the wave. Each unit runs in its own worktree, so the wave needs an isolation contract ([_phases.md](_phases.md), "Width"). With stacked PRs (`ledger.stack.enabled`), the next wave can start when the wave below is ready: `wave <n> record` of a merged wave returns `nextWave`, and the session asks the person at once (step 8). The next wave then starts on the wave branch below while that wave waits in handoff or ship ([_gh-stack.md](_gh-stack.md)). Without stacked PRs, the next wave starts after the previous wave merged.

## Run a wave

1. **Check.** Run `<cmd> status`. When `next.action` is `paused`, `ask`, or `driving`, do not start the wave.
2. **Drift.** For wave 2 and later, read `drift/wave-<n>.md` (written at the end of the previous wave). For each unit in its stop list, run `<cmd> unit <key> stopped --route "drift: <the contract lines>"`. Then ask the person to choose: amend that slug's shape, or add a fix packet before it through the brainstorm. The independent units continue.
3. **Start.** Run `<cmd> wave <n> start`. It starts the wave with its prepared units and moves the others. Create the wave branch without a checkout: `git -C "<projectRoot>" branch <branch> <base>`, with `branch` and `base` from the result. `base` is the trunk, or with stacked PRs the wave branch below.
   - A unit with `waits` in the result needs another unit of this wave (its `needs` in the ledger graph). The script writes each wait into the ledger and into section 7 of the unit's context file. Do not write a wait into `steer.md`. Tell the person the waits in one line per unit.
4. **Launch.** Run `<cmd> wave <n> launch`. The command checks every unit before it changes a file. Then it adds each worktree, writes each context file, sets `branch` and `base-branch` in each slug's `00-index.md`, and sets each unit `running`. The result has `args`, `stage`, `outcomePath`, `width`, and `widthMax`. When the result has `ok: false`:
   - `error: isolation-required`: the project has no isolation contract. Ask the person for one ([_phases.md](_phases.md), "Width"), then launch again.
   - `blocked`: one or more units cannot get a worktree, and the command added no worktree. Show each `key`, `cause`, and `detail` to the person. For `disk`, the person frees disk space. For `path`, ask the person for a short absolute `campaign.isolation.worktree-root` (for example `C:/cw`), and write it to `.ai/sdlc-config.json`. Then launch again.
   - `paused`: the budget width is 0. Run `<cmd> pause <until> <reason>` with the result's `until` and `reason`, and start nothing.
   - `error: run-live`: a run of this wave is live (`run`, `newestAt`). Do not launch again, because a second run drives the same worktrees. Follow the `driving` row of [../campaign.md](../campaign.md).
   - `next: sort-waits`: sort the waits with the person ([_order.md](_order.md), "Sort waits").
   - `visibleToGit`: git can stage a copied record in a worktree. Ask the person ([_records.md](_records.md)).

   When `width` is less than `widthMax`, tell the person in one line that the budget narrows the wave, and give the budget's reason.
5. **Run.** Stage the wave driver with the `stage` command of the result:

   ```
   node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver campaign-wave
   ```

   The command prints one JSON line with `scriptPath`. Launch that script with the `args` of the launch result, as they are, the same way as [../yolo.md](../yolo.md) Step 1 launches its driver. The run goes on in the background.
6. **Watch.** Start the watch over the wave's slugs and the campaign journal ([_watch.md](_watch.md), K1). The wave driver starts no watch of its own.
   - At the first wave start of this session, send one push notification: `campaign <brainstorm-slug>: wave <n> started`. When the result says that the push was not sent because Remote Control is inactive, tell the person in one line: "Phone notifications need Remote Control. Run /rc to turn it on." Do not check again in this session.
7. **While the run goes.** Answer each question of the run (see "Questions while the run goes"). Prepare the units of `next.prepare` with the person ([_prepare.md](_prepare.md), "Rolling prepare"). Do not run `launch`, `merge-in`, or `unit <key> <state>` for a unit of the wave. The wave driver owns these steps.
8. **Record.** When the run returns, write its outcome as JSON to the `outcomePath` of the launch result. Then run `<cmd> wave <n> record --outcome <outcomePath>`. Run `record` for every outcome, also for an outcome with `held: true`. For a held outcome, `record` writes only the unit states, the cleared slices, and the questions, and the wave stays `running`. Then:
   - `stoppedAt: usage-pause`: run `<cmd> pause <until> <reason>` with the outcome's `until` and `reason`. After the reset, run `<cmd> resume`, then launch the wave again (step 4).
   - `stoppedAt: agent-ceiling` or `unit-fault`: launch the wave again (step 4). The launch keeps the state of each unit. When every unit is finished, the new run runs only the boundary.
   - `stoppedAt: waiter-failed` (three waiter agents in a row returned nothing) or `waiter-cancelled` (a cancel marker that the run did not write): the open questions stay in the ledger. Show them to the person (`next.action: ask`). Launch the wave again (step 4) when they are answered, or at once when no question is open.
   - `stoppedAt: stop-request`: the person stopped the campaign. Launch the wave again only when the person asks.
   - The record result has `stopped`: the boundary stopped, and the wave is `stopped`. Run `<cmd> ask` with the reason, and stop here.
   - The record result has `nextWave`: the wave is ready, and wave `nextWave.wave` may start on its branch. Ask the person at once, and send one push notification: "Start wave <m> on wave <n>'s branch now?". Name each unit of `unprepared`: `wave <m> start` moves it to a later wave. In the same message, show `nextWave.defaults` as one digest; the person confirms, or changes one with `<cmd> answer defaults '<json>'`. On yes, run this procedure for wave m from step 1, in this session, and continue with steps 9 to 16 for wave n. Without a yes, do not start wave m.
   - When the run ended on an agent that returned nothing, or the session saw a usage-limit error (kind `rate_limit`, status 429, or "You've reached your … limit"), run `<cmd> budget`. When its state is `pause`, or the newest reading is 95% or more, this is a usage pause and not a failure. Run `<cmd> pause` with the reset time, and launch the wave again after the reset. A 529 Overloaded is not a usage limit.
9. **Derived needs entries.** The wave driver adds a needs entry to the ledger when one slice of the wave uses a result of a slice of another unit, and no `needs` entry of the graph orders them ([_order.md](_order.md), "Derived needs"). A derived needs entry stays in the ledger. Show each entry of `derivedNeeds` in the record result to the person in one line. Do not send it through the brainstorm.
10. **Clean up.** For each entry of `cleanup` in the record result:
    1. Run `<cmd> worktree <key> remove`. Git does not delete a branch that a worktree has checked out. The command measures the unit's build folders and `outside` folder for the disk estimate, then deletes the `outside` folder. When the result has `outsideKept`, the folder holds a link: show the person its `links` and ask. Do not delete the folder yourself.
    2. Delete the slug branch in the wave worktree: `git -C "<wave worktree>" branch -d <slug branch>`. `<cmd> worktree wave-<n> add` gives the `path` of the wave worktree, and it reuses the worktree that exists. The wave branch holds the slug's merge now. After a squash merge of the wave PR, and after a stack rebase, `-d` refuses every slug branch, because the trunk and the rebased wave branch hold other commits.

    CAUTION: do not use `git branch -D` on a slug branch. A slug branch that `-d` refuses holds commits that are not merged, so ask the person.

    When `status` has `pluginUpdate`, tell the person in one line: the campaign runs `running`, and `installed` is newer. A new session loads the new version, and the resume command is `/wf campaign <brainstorm-slug>`. The person decides. The main checkout stays on the trunk. The rolling prepare writes the board and the packets there.
11. **Handoff and ship** ([_ship.md](_ship.md), "Handoff and ship per wave").
12. **Pick up changes.** When `status` returns `work-changed`, follow [_prepare.md](_prepare.md), "Reopen pick-up".
13. **Drift for the next wave.** Run `<cmd> wave <n+1> launch --mode drift`. The result gives the args of the drift check only, and the command adds no worktree. Stage and launch the driver as in step 5, with these args. Its agent classifies each changed contract line and runs `<cmd> drift <n+1>`.
14. **Forecast.** `wave <n> record` wrote the wave's real run time and W (weighted tokens) from the journals and the slugs' `cost.jsonl`, and updated `forecast.md`. Show the person the forecast against the real numbers in one line.
15. **Remove the wave worktree.** After the wave shipped, run `<cmd> worktree wave-<n> remove`.
    - CAUTION: do not run `git worktree remove` yourself, and do not run it with `--force`. Git deletes the ignored files of a worktree without asking, and `--force` also deletes through a linked folder (a `node_modules` junction) into the files it points to. When `<cmd> worktree … remove` refuses, show the person its `pending` and `ignored` lists and ask.
16. **F3.** When the record result has `stopBeforeNextWave`, record the question with `<cmd> ask` and do not start the next wave. The wave itself still ships. A narrowing that the standing default accepted is in `boundary.fidelity.carried`: list it in the wave digest.

While the person is away, do not run steps 10, 11, and 15, because a deletion and a push need the person. `<cmd> back` lists these steps for the person (`waited`).

### The wave driver

The wave driver (`workflows/campaign-wave.js`) is one Workflow run for one wave, with each unit in its own worktree. Its prompts are the specification of its agents. In short:

1. Each unit orients, then plans its slices. When the plans of a unit finish, its cross-unit reconcile compares them with the plans of the units that planned before it ([_order.md](_order.md)), and its walk starts. No unit waits for the plans of the other units.
2. Each unit walks its slices: implement, verify, and its review. Before the implement of a slice that needs a slice of another unit, the driver merges the verified commit of that slice in (`merge-in`). When a unit finishes while other units walk, the trial merge runs the wave verify over the finished units ([_boundary.md](_boundary.md), "Trial merge").
3. When every unit finished, or the person moved it out, the boundary runs ([_boundary.md](_boundary.md)): merge, wave verify, revert search, the wave review, the as-built notes, the fidelity checkpoint, and the wave output.

The driver has two slot classes. The token slots run implement, review, and merge. The run starts with `width` token slots, and they follow the budget during the run: 1 at `slow`, and the set width again at `ok`. `widthMax` is the set width: `campaign.width`, or 1 with `"parallel": false`. A width of 0 stops the run as a usage pause. The machine slots run verify, the wave verify, and the builds: `machineWidth` of them, from `campaign.isolation.machine-width`. A machine step waits until no lock of `campaign.isolation.locks` is held (`<cmd> locks wait`). A heavy suite also takes the heavy-suite lock (`<cmd> lock`), because a slot does not reach another session.

The driver changes the ledger only through `<cmd>`. It never pushes, opens a PR, or ships. The session records its outcome with `wave <n> record`.

## Questions while the run goes

A unit that needs the person parks: it asks one question, and the other units continue. A unit that waits on a parked unit keeps waiting. The answer reaches the unit in the same run.

1. At each `asked` event of the watch, and at each `status` with `next.action: ask`, ask the person. Give the full context: the unit, the kind, the stage, the slice, and the question.
2. Record the answer with `<cmd> reply <id> --by person "<answer>"`. When the person moves the unit out of the wave, run `<cmd> reply <id> --by person --move "<answer>"`. The driver reads the ledger every 10 seconds, and the unit continues.
3. When the person answers a `slug-stop` question with "continue", clear the stop request first: `<watch> control "<projectRoot>" <slug> clear --campaign <brainstorm-slug>`. Then run `reply`. Without the clear, the request still applies, and the unit stops again at its next stage agent.
4. When the person is away, answer by the away answer of the question's kind: the ledger's standing policy (`policy` in `status` and `away`; the table gives the default). The person changes a kind with `<cmd> answer policy '<json>'`, for example `{"stage":"hold"}`. The away state stays until `back`; `away` with no `--words` applies the last away words again. Record each answer with `<cmd> decided <id> … --why "away: <the rule of the table>"`. `decided` also answers the open question. A question that holds gets no answer: send one push notification with the question id, the unit, and the question.

This table is the one list of the park kinds. The id of a unit question is `w<n>-<key>-<k>`; the id of a wave question is `w<n>-wave-<k>`.

| Kind | Cause | What the answer does | Away answer |
|---|---|---|---|
| `stage` | A stage returned a hard-stop, a stage gate failed, an intent-bearing decision stopped a stage, a verify did not converge, or a charter checkpoint found a broken commitment or a crossed veto. Also: an implement that hard-stopped twice (the question asks to split the slice), an implement that stopped three times for a wait that the driver does not hold, a plan of the fan-out that stopped (asked when the plan phase ends; the unit stays `running`), and a slug output that did not build | The stopped stage runs again with the answer. An answer that changes the design, the acceptance criteria, or the plan routes the slice back to plan. An answer that accepts a failing verify passes the slice. After a charter checkpoint, the walk continues with the next slice | For a decision with options, the recommended option. An intent-bearing decision gets it only when the away words cover escalated decisions. For a verify that did not converge, one more verify round, with the diagnosis as the answer. For a hard-stop or a failed stage gate, hold. |
| `review` | A `dont-ship` unit review, or a blocker that stayed open after the fix loop | The review writer runs again with the answer. A finding that the answer accepts is recorded as the person's override | One more fix loop, with the open blockers as the answer. Do not accept a finding as it is: an override is the person's decision. |
| `design-amend` | The review fix loop left findings against a confirmed board or the `02c-craft.md` contract open (`needs-amend`). The driver never fixes or dismisses them | Amend: the unit moves out with the route "Type `/wf design <slug> amend`" ([_prepare.md](_prepare.md), "Design amend"). Keep: each finding closes as `kept-by-person`, with the answer as the reason. Defer: each finding closes as `deferred`, `by: person`. Then the review gate runs. Any other answer stops the unit as amend does | Hold. Amend, keep, and defer are the person's decision. |
| `contract` | The cross-unit reconcile, or a plan, found a shared change to a `provides` or `expects` line | Approve the change with the new line, refuse it (the plan runs again), let the slice wait for the other unit, or move the unit out ([_drive.md](_drive.md)) | Refuse the change, so that the plan keeps the contract, only when the away words cover escalated decisions. Otherwise hold. Do not approve a contract change. |
| `orient` | The unit orient did not pass | "Continue" runs the orient again when the cause is fixed | Run the orient again. |
| `driver-fault` | The walk of the unit threw | The walk starts again from the disk state. At the third fault, the unit ends as `faulted` | Resume the unit. |
| `merge-conflict` | The merge agent aborted a merge-in, or `merge-in` failed for another reason | The merge agent runs again with the answer as the person's rule | Hold. |
| `needs-cycle` | A needs entry closes a cycle | Name the slice that comes first, or move a unit out ([_drive.md](_drive.md)) | Hold. |
| `deadlock` | Every walk that is not finished waits, and no wait can become ready | Drop a derived wait, or move a unit out ([_drive.md](_drive.md)) | Hold. |
| `moved-dependency` | A unit that this unit waits on moved out of the wave | Drop the wait and continue, or move this unit out too ([_drive.md](_drive.md)) | Hold. |
| `slug-stop` | A stop request with `--scope slug --then hold` names the unit | An answer that starts with "continue", "yes", "resume", "go on", or "go" runs the stopped stage again. Any other answer moves the unit out | Hold. |
| `wave-review` | The wave review says `dont-ship`, and its findings do not name one unit that can be reverted alone. Or the wave verify stays red after the fixes of the wave review. The question belongs to no unit | The wave review writer runs again with the answer. It reverts each unit that the answer names | Hold. |

A stop request with `--then move` parks nothing: the unit moves out with no question. An answer with `--move` also moves the unit out. A unit that moved out stays `stopped`, and each unit that waits on it parks with kind `moved-dependency`.

An away answer runs once for each unit and kind. When the unit parks again with the same kind, the question holds. A question of the classes `shared-env`, `external-party`, or `irreversible` always holds. A question that holds waits for the person, and the boundary waits with it.

## Failure paths

- **12.1 A unit parks.** The unit asks one question, and the other units continue. The boundary waits until the person answers or moves the unit out of the wave. A unit that moved out keeps its branch. Its dependents move to a later wave at the next `replan`. The wave PR and the try-it note list it as moved. When the person answers the stop later, set it back to `prepared`. It joins the earliest wave that its dependencies allow.
- **12.2 A merged slug breaks the wave verify.** The boundary finds the breaker by the revert search and reverts it ([_boundary.md](_boundary.md), "Revert search"). The breaker becomes `needs-fix`, and its branch stays. The other slugs stay merged. When the verify stays red with every slug reverted, the fault is in the wave branch base: the wave stops, and the campaign asks the person.
- **12.3 A merge conflict.** The merge agent follows [_boundary.md](_boundary.md), "Merge". A conflict it may not resolve stops that slug's merge only.
- **12.4 A change lands on a lower wave.** With stacked PRs, move the higher waves at the next wave boundary, never while their slugs run ([_gh-stack.md](_gh-stack.md), "A change on a lower wave (12.4)").
- **12.5 Stack height.** At most `max-unshipped` waves (default 2) wait unshipped above the trunk. At the limit, `wave <n> start` refuses: continue the rolling prepare and ask the person about the waves that wait in handoff or ship.

## Pause and resume

The campaign pauses on the usage guard, on a usage-limit error, and on the person's word.

1. **The usage guard.** The sdlc mod reads the 5-hour and 7-day windows of each session and writes them to `~/.claude/sdlc/usage/`. When a window crosses the budget's pause line, the guard writes the pause into `work/campaign/.control.json` itself. The next stage agent of the wave run then stops, and the run returns `stoppedAt: usage-pause`. Record it with `wave <n> record`, then `<cmd> pause <until> <reason>` ("Run a wave", step 8). When the reset time passes, the guard clears its pause and submits "Resume the run with /wf campaign <brainstorm-slug>" as a prompt; it also shows the same text as a toast.
2. **A usage-limit error.** When an agent of the wave run fails on a usage limit ("Run a wave", step 8), run `<cmd> pause <reset time> <window>`. Take the reset time from `<cmd> budget` (`until`). When neither the reading nor the error gives one, ask the person.
3. **The person's word.** "Pause the campaign" runs the same command with the time the person gives. Write each stop request with `<watch> control "<projectRoot>" <slug> stop <after> --campaign <brainstorm-slug> --scope <slug|wave|campaign>`. For the wave and campaign scopes, write `-` for `<slug>`.
   - "Stop after this wave" (`--scope wave`): the run finishes the wave, and the next wave does not start.
   - "Stop the campaign" (`--scope campaign`): the run stops with `held: true`, and the questions stay in the ledger.
   - "Stop <slug>" (`--scope slug`) also needs `--then move` or `--then hold`. With `move`, the unit moves out of the wave with no question. With `hold`, the unit parks with kind `slug-stop` until the person says "continue". When the person does not say which, ask "Move it out of the wave, or hold it until you say continue?" before you write the request.
4. During a pause, give no notes: each note uses the same limits.
5. **Resume** when the guard submits the resume prompt, when the reset time passed (through a one-shot scheduled task in this session), or on the person's word. Run `<cmd> resume`, then launch the wave again ("Run a wave", step 4). Resume is free: the launch keeps each unit's state, and each unit orient skips the stages that are done.
