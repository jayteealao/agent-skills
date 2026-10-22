# Campaign waves: launch, run, record, handoff, ship, and the end

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. `<watch>` stands for `node "<pluginRoot>/scripts/yolo-watch.mjs"`.

Each wave is one PR, and one run of the wave driver drives every unit of the wave. Each unit runs in its own worktree, so the wave needs an isolation contract ([_phases.md](_phases.md), "Width"). With stacked PRs (`ledger.stack.enabled`), the next wave starts on the wave branch below while that wave waits in handoff or ship ([_gh-stack.md](_gh-stack.md)). Without them, the next wave starts after the previous wave merged.

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
   - `visibleToGit`: git can stage a copied record in a worktree. Ask the person (see "Local records").

   When `width` is less than `widthMax`, tell the person in one line that the budget narrows the wave, and give the budget's reason.
5. **Run.** Stage the wave driver with the `stage` command of the result:

   ```
   node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver campaign-wave
   ```

   The command prints one JSON line with `scriptPath`. Launch that script with the `args` of the launch result, as they are, the same way as [../yolo.md](../yolo.md) Step 1 launches its driver. The run goes on in the background.
6. **Watch.** Start the watch over the wave's slugs and the campaign journal ([../yolo/_commentary.md](../yolo/_commentary.md), "In a campaign"). The wave driver starts no watch of its own. The watch reads each unit's journal and commits in its worktree (K1).
   - At the first wave start of this session, send one push notification: `campaign <brainstorm-slug>: wave <n> started`. When the result says that the push was not sent because Remote Control is inactive, tell the person in one line: "Phone notifications need Remote Control. Run /rc to turn it on." Do not check again in this session.
7. **While the run goes.** Answer each question of the run (see "Questions while the run goes"). Prepare the units of `next.prepare` with the person ([_phases.md](_phases.md), "Rolling prepare"). Do not run `launch`, `merge-in`, or `unit <key> <state>` for a unit of the wave. The wave driver owns these steps.
8. **Record.** When the run returns, write its outcome as JSON to the `outcomePath` of the launch result. Then run `<cmd> wave <n> record --outcome <outcomePath>`. Run `record` for every outcome, also for an outcome with `held: true`. For a held outcome, `record` writes only the unit states, the cleared slices, and the questions, and the wave stays `running`. Then:
   - `stoppedAt: usage-pause`: run `<cmd> pause <until> <reason>` with the outcome's `until` and `reason`. After the reset, run `<cmd> resume`, then launch the wave again (step 4).
   - `stoppedAt: agent-ceiling` or `unit-fault`: launch the wave again (step 4). The launch keeps the state of each unit. When every unit is finished, the new run runs only the boundary.
   - `stoppedAt: stop-request`: the person stopped the campaign. Launch the wave again only when the person asks.
   - The record result has `stopped`: the boundary stopped, and the wave is `stopped`. Run `<cmd> ask` with the reason, and stop here.
   - The record result has `nextWave`: the wave is ready, and wave `nextWave.wave` may start on its branch. Ask the person at once, and send one push notification: "Start wave <m> on wave <n>'s branch now?". Name each unit of `unprepared`: `wave <m> start` moves it to a later wave. In the same message, show `nextWave.defaults` as one digest; the person confirms, or changes one with `<cmd> answer defaults '<json>'`. On yes, run this procedure for wave m from step 1, in this session, and continue with steps 9 to 16 for wave n. Without a yes, do not start wave m.
   - When the run ended on an agent that returned nothing, or the session saw a usage-limit error (kind `rate_limit`, status 429, or "You've reached your … limit"), run `<cmd> budget`. When its state is `pause`, or the newest reading is 95% or more, this is a usage pause and not a failure. Run `<cmd> pause` with the reset time, and launch the wave again after the reset. A 529 Overloaded is not a usage limit.
9. **Derived needs entries.** The wave driver adds a needs entry to the ledger when two units change the same file and no `needs` entry of the graph orders them. A derived needs entry stays in the ledger. Show each entry of `derivedNeeds` in the record result to the person in one line. Do not send it through the brainstorm.
10. **Clean up.** For each entry of `cleanup` in the record result:
    1. Run `<cmd> worktree <key> remove`. Git does not delete a branch that a worktree has checked out. The command measures the unit's build folders and `outside` folder for the disk estimate, then deletes the `outside` folder. When the result has `outsideKept`, the folder holds a link: show the person its `links` and ask. Do not delete the folder yourself.
    2. Delete the slug branch in the wave worktree: `git -C "<wave worktree>" branch -d <slug branch>`. `<cmd> worktree wave-<n> add` gives the `path` of the wave worktree, and it reuses the worktree that exists. The wave branch holds the slug's merge now. After a squash merge of the wave PR, and after a stack rebase, `-d` refuses every slug branch, because the trunk and the rebased wave branch hold other commits.

    CAUTION: do not use `git branch -D` on a slug branch. A slug branch that `-d` refuses holds commits that are not merged, so ask the person.

    When `status` has `pluginUpdate`, tell the person in one line: the campaign runs `running`, and `installed` is newer. A new session loads the new version, and the resume command is `/wf campaign <brainstorm-slug>`. The person decides. The main checkout stays on the trunk. The rolling prepare writes the board and the packets there.
11. **Handoff and ship** (below).
12. **Pick up changes.** When `status` returns `work-changed`, follow [_phases.md](_phases.md), "Reopen pick-up".
13. **Drift for the next wave.** Run `<cmd> wave <n+1> launch --mode drift`. The result gives the args of the drift check only, and the command adds no worktree. Stage and launch the driver as in step 5, with these args. Its agent classifies each changed contract line and runs `<cmd> drift <n+1>`.
14. **Forecast.** `wave <n> record` wrote the wave's real run time and W (weighted tokens) from the journals and the slugs' `cost.jsonl`, and updated `forecast.md`. Show the person the forecast against the real numbers in one line.
15. **Remove the wave worktree.** After the wave shipped, run `<cmd> worktree wave-<n> remove`.
    - CAUTION: do not run `git worktree remove` yourself, and do not run it with `--force`. Git deletes the ignored files of a worktree without asking, and `--force` also deletes through a linked folder (a `node_modules` junction) into the files it points to. When `<cmd> worktree … remove` refuses, show the person its `pending` and `ignored` lists and ask.
16. **F3.** When the record result has `stopBeforeNextWave`, record the question with `<cmd> ask` and do not start the next wave. The wave itself still ships. A narrowing that the standing default accepted is in `boundary.fidelity.carried`: list it in the wave digest.

While the person is away, do not run steps 10, 11, and 15, because a deletion and a push need the person. `<cmd> back` lists these steps for the person (`waited`).

### The wave driver

The wave driver (`workflows/campaign-wave.js`) is one Workflow run for one wave, with each unit in its own worktree:

1. One orient for each unit, then the plan of every slice of the unit. The plans of a unit run in waves of the `depends-on` lists of `03-slice.md`: a slice plans after the slices it depends on, and reads their plans. A slice whose dependency did not plan cleanly plans in its own walk.
2. When the plans of a unit finish, its cross-unit reconcile compares them with the plans of the units that planned before it. A shared file becomes a derived needs entry or a merge note. A shared `provides` or `expects` line parks the unit with kind `contract`, before the slice that changes the line. Then the unit's walk starts: no unit waits for the plans of the other units. A need on a slice that passed its implement already takes the late path ([_order.md](_order.md), "Derived needs").
3. Each unit walks its slices: implement, verify, and its review. Before the implement of a slice with a wait, the driver merges the verified commit of the other unit in (see "Merge in"). When a unit finishes while other units walk, the trial merge merges it with the finished units in a scratch worktree, and runs the wave verify there ([_boundary.md](_boundary.md), "Trial merge"). Two read-only `sonnet` agents keep the plans current. After a plan runs again in a walk, the sibling check (`sibling-check:<slice>`) finds the later sibling plans that no longer agree with it. Before an implement whose plan is older than an implement or a merge-in of this run, the plan check (`plan-check:<slice>`) compares the plan with the code at `HEAD`. A stale plan runs again in refresh mode (review-and-fix) before its implement.
4. When every unit finished, or the person moved it out, the boundary runs: merge, wave verify, revert search, the wave review, the as-built notes of all units at once, the fidelity checkpoint, and the wave output.

The driver has two slot classes. The token slots run implement, review, and merge. The run starts with `width` token slots, and they follow the budget during the run: 1 at `slow`, and the set width again at `ok`. `widthMax` is the set width: `campaign.width`, or 1 with `"parallel": false`. A width of 0 stops the run as a usage pause. The machine slots run verify, the wave verify, and the builds: `machineWidth` of them, from `campaign.isolation.machine-width`. A machine step waits until no lock of `campaign.isolation.locks` is held (`<cmd> locks wait`). A heavy suite also takes the heavy-suite lock (`<cmd> lock`), because a slot does not reach another session.

Its agents follow [_drive.md](_drive.md) and [_boundary.md](_boundary.md). The driver changes the ledger only through `<cmd>`. It never pushes, opens a PR, or ships. The session records its outcome with `wave <n> record`.

## Questions while the run goes

A unit that needs the person parks: it asks one question, and the other units continue. The answer reaches the unit in the same run. [_drive.md](_drive.md) lists the kinds of a park and the resume of each kind.

1. At each `asked` event of the watch, and at each `status` with `next.action: ask`, ask the person. Give the full context: the unit, the kind, the stage, the slice, and the question.
2. Record the answer with `<cmd> reply <id> --by person "<answer>"`. When the person moves the unit out of the wave, run `<cmd> reply <id> --by person --move "<answer>"`. The driver reads the ledger every 10 seconds, and the unit continues.
3. When the person answers a `slug-stop` question with "continue", clear the stop request first: `<watch> control "<projectRoot>" <slug> clear --campaign <brainstorm-slug>`. Then run `reply`. Without the clear, the request still applies, and the unit stops again at its next stage agent.
4. When the person is away, answer by the away answer of the question's kind: the ledger's standing policy (`policy` in `status` and `away`; the table gives the default). The person changes a kind with `<cmd> answer policy '<json>'`, for example `{"stage":"hold"}`. The away state stays until `back`; `away` with no `--words` applies the last away words again. Record each answer with `<cmd> decided <id> … --why "away: <the rule of the table>"`. `decided` also answers the open question. A question that holds gets no answer: send one push notification with the question id, the unit, and the question.

| Kind | Cause | Away answer |
|---|---|---|
| `stage` | A stage returned a hard-stop, a stage gate failed, an intent-bearing decision stopped a stage, or a verify did not converge | For a decision with options, the recommended option. An intent-bearing decision gets it only when the away words cover escalated decisions. For a verify that did not converge, one more verify round, with the diagnosis as the answer. For a hard-stop or a failed stage gate, hold. |
| `review` | A `dont-ship` unit review, or an open blocker after the fix loop | One more fix loop, with the open blockers as the answer. Do not accept a finding as it is: an override is the person's decision. |
| `contract` | A plan changes a `provides` or `expects` line | Refuse the change, so that the plan keeps the contract, only when the away words cover escalated decisions. Otherwise hold. Do not approve a contract change. |
| `orient` | The unit's orient failed | Run the orient again. |
| `driver-fault` | The unit's walk failed in the driver | Resume the unit. |
| `merge-conflict`, `needs-cycle`, `deadlock`, `moved-dependency`, `slug-stop`, `wave-review` | A merge-in conflict, a needs cycle, two waits that cannot resolve, a needed unit that moved out, the person's stop request, or a wave review question | Hold. |

An away answer runs once for each unit and kind. When the unit parks again with the same kind, the question holds. A question of the classes `shared-env`, `external-party`, or `irreversible` always holds. A question that holds waits for the person, and the boundary waits with it.

## Merge in

A unit can need a slice of another unit of the same wave: its `needs` in the ledger graph, or a derived needs entry. The wave driver merges the code in, inside the run.

1. A wait is ready when the needed slice passed verify. The driver then records the verified commit of the slice (`slice-done <key> <slice> --verified`). The slice clears later, when its per-slice review (when the unit has one) is clean (`slice-done`).
2. Before the implement of the slice that needs the code, the driver runs `merge-in <key> <from> --at <sha>`. The command merges the verified commit, not the branch tip, with rerere on.
3. When the review changes the slice after the merge-in, the `slice-done` of the slice returns `refresh`. The consumer merges the fix before its next implement (`merge-in <key> <from> --at <sha> --refresh`). A consumer that finished gets a focus pair of the wave review instead.
4. A conflict that the merge agent cannot resolve parks the unit with kind `merge-conflict`. A needed unit that moves out of the wave parks each unit that waits on it with kind `moved-dependency`. Each park asks one question (see "Questions while the run goes").

Do not run `merge-in` yourself while the wave run is live.

## Failure paths

- **12.1 A unit parks.** The unit asks one question, and the other units continue. The boundary waits until the person answers or moves the unit out of the wave. A unit that moved out keeps its branch. Its dependents move to a later wave at the next `replan`. The wave PR and the try-it note list it as moved. When the person answers the stop later, set it back to `prepared`. It joins the earliest wave that its dependencies allow.
- **12.2 A merged slug breaks the wave verify.** The boundary runs up to 2 fix rounds, then reverts the merges one at a time, newest first, and runs the verify after each revert. The first green verify names the breaker. The slugs reverted before it are merged again, so the other slugs stay merged. The breaker becomes `needs-fix`, and its branch stays. When the verify stays red with every slug reverted, the fault is in the wave branch base: the wave stops and the campaign asks the person. The wave branch is not pushed before its verify passes, so a revert changes nothing that another person can see. A `dont-ship` wave review whose blockers name one unit reverts that unit the same way.
- **12.3 A merge conflict.** The merge agent follows [_boundary.md](_boundary.md), "Merge". A conflict it may not resolve stops that slug's merge only. A conflict that `merge-in` resolved earlier replays from the rerere cache.
- **12.4 A change lands on a lower wave.** With stacked PRs, move the higher waves at the next wave boundary, never while their slugs run ([_gh-stack.md](_gh-stack.md)).
- **12.5 Stack height.** At most `max-unshipped` waves (default 2) wait unshipped above the trunk. At the limit, `wave <n> start` refuses: continue the rolling prepare and ask the person about the waves that wait in handoff or ship.

## Local records

A repo that does not track `.ai/` keeps the records in the main checkout. Orient records `records: local` in the ledger. Branches carry only code, so no wave PR carries a workflow file.

- `<cmd> worktree <key|wave-<n>> add` copies the main `.ai/` tree into the worktree. The campaign folder stays in the main checkout, because the wave driver's agents read it there by absolute path. The evidence folders (`*-evidence/`) and the design boards (`design/`) of a workflow that the worktree does not drive also stay in the main checkout. A unit reads the frozen boards of its own slug and writes only `design/captures/`; `sync` brings the captures back. A tracked `.ai/` file (for example `ship-plan.md`) keeps its committed version in the worktree, and the result names it in `records.tracked`. An uncommitted main edit to that file does not reach the unit, so that no worktree commit can publish it. The worktree gets its own `.ai/.gitignore` with `*`, so no `git add` in the worktree can stage a record. The main `.gitignore` can be untracked, and then a worktree does not have it. When git can still see a copied record, `add`, `refresh` and `wave <n> launch` return `ok: false` with `visibleToGit`: do not run, hand off or ship in that worktree, and ask the person.
- `refresh` copies the main changes in. A file that the worktree changed or deleted stays as the worktree has it.
- `sync` copies every file that the worktree created or changed back to the main checkout. It never deletes a file in the main checkout, and it never overwrites a main change. With local records, the slice write-back of the wave driver runs this sync at the end of each slice.
- `remove` runs `sync` first. The worktree stays when a file exists only in the worktree (`pending`), or when git would delete an ignored file outside `.ai/` that is not in `campaign.isolation.build-dirs` or `node_modules` (`ignored`).

The sync compares content hashes with the base, the version that both sides last agreed on. The base of each file is in `work/campaign/records/<key>.json`. Each copy goes to a temp file, the hash is checked, and a rename puts it in place. Watch cursors (`.watch-state.json`) and render caches (`_view/`) never travel.

When both sides changed a file, the main version stays, and `sync` keeps the worktree version in `work/campaign/records/conflicts/<key>/<time>/`. The result lists it under `conflicts`. For `.ai/workflows/INDEX.md`, the sync also merges the rows into the main copy, and the newer row of each slug wins. For every other conflict, show the person both versions and ask which version to keep. A file that the worktree deleted stays in the main checkout, and the result lists it under `deletedInWorktree`.

WARNING: local records keep the brainstorm and the packets out of git, but not out of the wave PRs. Handoff writes each PR description from the slug's records, and a pushed PR is public in a public repo. Before handoff pushes a wave, read its PR text for private details.

## Versions and outputs

- **V1.** The target version is the setup answer `target-version`.
- **V2.** A wave gets its version when it is next to ship: `<cmd> version wave` gives the next pre-release of the target after the newest released tag, for example `0.3.0-beta.1`, then `0.3.0-beta.2`.
- **V3.** A hotfix gets `<cmd> version hotfix`. The person confirms the number.
- **V4.** Before a wave ships, its outputs carry a build label, not a version: `<cmd> label <n> [<slug>]` gives `wave-<n>+<sha>` or `wave-<n>.<slug>+<sha>`.
- **V5.** When the wave is next to ship and the person chose "release each wave", run the ship plan's `version-bump-cmd` on the wave branch with the V2 version, commit, and push. CI runs again on that commit.
- **V6.** With `target-version: none`, there is no bump and no tag. The outputs and the try-it notes still exist, with build labels.

WARNING: do not push a wave tag, and do not publish a release, unless the setup answer `release-each-wave` is `true`. A pushed tag is permanent: a fixed release takes a new version, never a re-used one.

## Handoff and ship per wave

Each wave is one PR. Its base is the wave's `base`: the trunk, or the wave branch below when the PRs are stacked.

With local records, handoff and ship run in the wave worktree, because only that checkout has the wave branch. Edit every `00-index.md` in the main checkout. Then, around each `/wf handoff` and each `/wf ship`:

1. Run `<cmd> worktree wave-<n> refresh`. It copies the main edits in.
2. Run the command with the wave worktree as the project root.
3. Run `<cmd> worktree wave-<n> sync`. It copies the handoff and ship records back.

The steps:

1. Run `<cmd> wave <n> set handoff`. In each merged slug's `00-index.md`, set `branch:` to the wave branch and `base-branch:` to the wave's `base` (the trunk, or the wave branch below).
2. Run `/wf handoff <wave branch>`. Batch mode builds the roster of the slugs on that branch and opens one PR with one package. The ship-plan readiness check and the RIM block run as usual. Record the PR with `<cmd> wave <n> set handoff --pr <url>` and `<cmd> journal pr-opened '{"wave":<n>,"pr":"<url>"}'`.
3. With stacked PRs, link the PR into the stack ([_gh-stack.md](_gh-stack.md), "Link").
4. Handoff watches CI to its end state. Record the result with `<cmd> journal ci-result '{"wave":<n>,"result":"<green|red>"}'`.
5. Ship the waves in order: wave n ships only after wave n−1 shipped. Before ship, set `base-branch:` in each merged slug's `00-index.md` to the trunk: GitHub moved the PR onto the trunk when the wave below merged, and ship reads `base-branch` for the tag, the release run, and the push. Run `<cmd> wave <n> set shipping`, then:
   - **Release each wave:** apply V5, then run `/wf ship <wave branch>`. Ship merges the PR, creates the tag, runs the release, and runs the post-publish checks, by the ship plan. Record `<cmd> journal released '{"wave":<n>,"version":"<v>"}'`.
   - **Merge each wave only:** run `/wf ship <wave branch>` for its gates and its merge. At the version step and the tag step, the setup answer is "merge only": bump nothing, tag nothing, publish nothing. When ship has no way to skip one of those steps, ask the person.
6. After the merge, run `<cmd> journal merged '{"wave":<n>}'` and `<cmd> wave <n> set shipped [--version <v>]`. When the wave shipped with a version, build the wave output again from the tagged commit, and put the version in the try-it note. With stacked PRs, run `gh stack sync` at the next wave boundary ([_gh-stack.md](_gh-stack.md), "Sync").

**Standing defaults.** With `defaults.ship` `recommended` (`status` gives `defaults`), each ship-family question of handoff and ship takes its recommended option with no question: plan drift, the window, the pre-push check, the merge method, the announcement, and the dry-run. Record each with `<cmd> decided <id> … --why "standing default: ship"`, and list them in the wave digest.

**Ask the person** (record each question with `<cmd> ask <id> --wave <n> <text>`; the watch sends a push notification) when:

- CI is red. Diagnose only, then ask, as handoff does.
- The readiness gate finds drift and `defaults.ship` is `ask`: the person chooses amend or acknowledge.
- The branch needs a human approval. The campaign never approves its own PR.
- The merge command refuses, or a merge queue rejects the wave.
- The version is already released, or does not match.
- A post-publish check fails.
- A recovery step would delete a tag, a release, or a remote branch.
- A conflict needs a resolution that changes behaviour.
- An open RIM or an intent-bearing decision appears.
- Anything the ship plan does not cover, or covers in two ways.

WARNING: do not run a ship-plan recovery step that deletes a tag, a release, or a remote branch without the person's yes. These deletions cannot be undone.

CAUTION: do not turn on auto-merge for a wave PR. An auto-merged PR breaks the wave order.

## Hotfix

A packet with `form: hotfix` and `urgency: urgent` runs before the next planned wave. Prepare it with the person (hotfix intake). Its branch starts from the newest released tag on the trunk, and its PR targets the trunk directly. It ships first, with `<cmd> version hotfix` confirmed by the person. The next wave branches from the trunk after the hotfix merged.

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

## End

When the last wave shipped (`next.action` is `end`):

1. When the waves merged without tags, or shipped as pre-releases, ask the person whether to release the target version as a final release, by the ship plan's rollout stages. A final release is the person's decision.
2. Write `work/campaign/report.md`:
   - each wave: its slugs, its PR, its version or label, the slugs that moved, its wave review verdict, and its try-it note;
   - every carried decision of the campaign: honoured, narrowed (with the person's answer), dropped (with the ratification), changed at prepare, or not built yet (with its slug);
   - each work revision that the campaign re-planned from, and what it added;
   - the forecast against the real numbers;
   - with local records: the design files that git tracks but that no wave PR carried. Run `git status --porcelain -- .ai/design .ai/workflows` in the main checkout and list each `.ai/design/` file and `design/r<N>/` folder it shows. The person commits them; the campaign does not.
3. Run `<cmd> journal campaign-end`.
4. Route to `/wf retro <slug>` for each slug. The person runs each retro.
