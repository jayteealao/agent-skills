# Campaign waves: drive, boundary, handoff, ship, and the end

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. `<watch>` stands for `node "<pluginRoot>/scripts/yolo-watch.mjs"`.

Each wave is one PR. With an isolation contract, up to `campaign.width` slugs of a wave run at once, each in its own worktree; without one, one slug runs at a time in the main checkout. With stacked PRs (`ledger.stack.enabled`), the next wave starts on the wave branch below while that wave waits in handoff or ship ([_gh-stack.md](_gh-stack.md)); without them, the next wave starts after the previous wave merged.

## Run a wave

1. **Check.** Run `<cmd> status`. When `next.action` is `paused` or `ask`, do not start the wave.
2. **Drift.** For wave 2 and later, read `drift/wave-<n>.md` (written at the end of the previous wave). For each unit in its stop list, run `<cmd> unit <key> stopped --route "drift: <the contract lines>"`, then ask the person to choose: amend that slug's shape, or add a fix packet before it through the brainstorm. The independent units continue.
3. **Start.** Run `<cmd> wave <n> start`. It starts the wave with its prepared units and moves the others. Create the wave branch without a checkout: `git -C "<projectRoot>" branch <branch> <base>`, with `branch` and `base` from the result. `base` is the trunk, or with stacked PRs the wave branch below.
4. **Watch.** Start the watch over the wave's slugs and the campaign journal ([../yolo/_commentary.md](../yolo/_commentary.md), "In a campaign"). A drive in a worktree also starts its own watch on that worktree (yolo.md Step 1).
5. **Drive the units.** Before each drive starts, run `<cmd> budget`:
   - `width` 0: the budget asks for a pause. Run `<cmd> pause <until> <reason>` with the result's `until` and `reason`, and start nothing.
   - `width` 1: drive one unit at a time, in packet order: in its worktree with an isolation contract, in the main checkout without one. A budget without a reading (`unknown`, for example with the mod off) keeps the set width; only `slow` narrows to 1.
   - `width` above 1: start drives until `width` run at once, in packet order. Launch the Workflows of one batch in the same message, so they run at the same time.

   For each unit:
   1. With an isolation contract, run `<cmd> worktree <key> add`. The result gives the worktree `path`, its slug `branch`, and its `ports`; the prepared workflow folder is copied in. When the result has `wait: true`, the disk is too full: drive this unit after a merged slug's worktree is removed. Without a contract, skip this step.
   2. Run `<cmd> context <key>`.
   3. In the slug's `00-index.md` (inside the worktree when there is one), set `branch: campaign/<brainstorm-slug>/wave-<n>--<slug>` and `base-branch: <wave branch>`. Re-read the file immediately before the edit.
   4. Run `<cmd> unit <key> running`.
   5. Launch yolo per [../yolo.md](../yolo.md) Steps 0 and 1, with `projectRoot` set to the worktree path when there is one, and two more args: `contextPath` (the absolute path of `context/<slug>.md`) and `campaignControlPath` (the absolute path of `work/campaign/.control.json`), both in the main checkout. Every stage agent then reads both fresh.
   6. When the run reaches its endpoint, run `<cmd> unit <key> finished --digest '<outcome.decisionDigest as JSON>'`. When the run stopped, run `<cmd> unit <key> stopped --route "<outcome.route>"` and continue with the next unit (12.1). A unit that depends on a stopped unit stays in the wave list but is not driven: mark it `stopped` with `--route "waits for <key>"`.
   7. When the run stopped on an agent that returned nothing, or the session saw a usage-limit error (kind `rate_limit`, status 429, or "You've reached your … limit"), run `<cmd> budget`. When its state is `pause`, or the newest reading is 95% or more, this is a usage pause and not a failure: run `<cmd> pause` with the reset time, and resume the drive later. A 529 Overloaded is not a usage limit.
   8. Run `<watch> end "<projectRoot>" <slug>` with `--stopped-at` when the run stopped. With a worktree, `<projectRoot>` is the worktree path. Then append the hand-back narrative to the slug's `commentary.md` (`--event run-end`).
   9. After the run-end note, commit the slug's records on the slug branch (in the worktree when there is one). The drive leaves its verify and review records uncommitted, and the wave merge carries only commits. Stage `.ai/workflows/<slug>/` by path, unstage its `.watch-state.json`, and commit with `chore(<slug>): record the drive`. With local records, do not commit: when the unit has a worktree, run `<cmd> worktree <key> sync` instead (see "Local records").
   10. Build the slug output: launch the boundary driver (below) with `mode: "slug-output"` and this one unit, with its `worktree` path when there is one. When the output does not build, the slug failed its verify: mark it `stopped` with the failure as its route.
6. **Boundary.** Run `<cmd> wave <n> set boundary`. Run `<cmd> worktree wave-<n> add`; the boundary merges in that wave worktree. Launch the boundary driver with `mode: "wave"` and the finished units. Then record its outcome:
   - each `merged` unit: `<cmd> unit <key> merged --merge <sha>`;
   - each `needsFix` unit: `<cmd> unit <key> needs-fix --route "<reason>"`;
   - each `notMerged` unit: `<cmd> unit <key> stopped --route "<reason>"`;
   - when the outcome is `stopped`, run `<cmd> wave <n> set stopped`, then `<cmd> ask` with the reason, and stop here.
   - CAUTION: do not use `git branch -D` on a slug branch. A slug branch that `-d` refuses holds commits that are not merged, so ask the person.
   - then run `<cmd> worktree <key> remove` for each merged unit with a worktree. Git does not delete a branch that a worktree has checked out.
   - then, in the wave worktree, delete each merged slug branch with `git -C "<wave worktree>" branch -d <slug branch>`. The wave branch holds the slug's merge now. After a squash merge of the wave PR, and after a stack rebase, `-d` refuses every slug branch, because the trunk and the rebased wave branch hold other commits.
   - The main checkout stays on the trunk. The rolling prepare writes the board and the packets there.
7. **Handoff and ship** (below).
8. **Pick up changes.** When `status` returns `work-changed`, follow [_phases.md](_phases.md), "Reopen pick-up".
9. **Drift for the next wave.** Launch the boundary driver with `mode: "drift"` and `wave: <n+1>`. Its agent classifies each changed contract line and runs `<cmd> drift <n+1>`.
10. **Forecast.** Run `<cmd> forecast --wave <n> --minutes <m> --tokens <t>`, with the wave's real run time from the journals and its tokens from the slugs' `cost.jsonl`.
11. **Clean up.** After the wave shipped, run `<cmd> worktree wave-<n> remove`.
    - CAUTION: do not run `git worktree remove` yourself, and do not run it with `--force`. Git deletes the ignored files of a worktree without asking, and `--force` also deletes through a linked folder (a `node_modules` junction) into the files it points to. When `<cmd> worktree … remove` refuses, show the person its `pending` and `ignored` lists and ask.
12. **F3.** When the boundary outcome has `stopBeforeNextWave`, record the question with `<cmd> ask` and do not start the next wave. The wave itself still ships.

### The boundary driver

Stage it the same way as the yolo driver, then launch it the same way (yolo.md Step 1):

```
node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver campaign-boundary
```

Args: `projectRoot`, `referenceRoot`, `brainstorm`, `mode`, `wave`, `waveBranch`, `runId` (the ledger's `run-id`), `output` (the setup answer), `moved` (the wave's moved units), and `units`: one `{ key, slug, branch, worktree, digest, output }` per unit (`worktree` is the path, or absent). Its agents follow [_boundary.md](_boundary.md). It never edits the ledger: the campaign session records its outcome.

## Failure paths

- **12.1 A slug stops.** The wave ships with the slugs that finished. The stopped slug keeps its branch. Its dependents move to a later wave at the next `replan`. The wave PR and the try-it note list it as moved. When the person answers the stop, set it back to `prepared`; it joins the earliest wave its dependencies allow.
- **12.2 A merged slug breaks the wave verify.** The boundary runs up to 2 fix rounds, then reverts the merges one at a time, newest first, and runs the verify after each revert. The first green verify names the breaker. The slugs reverted before it are merged again, so the other slugs stay merged. The breaker becomes `needs-fix`, and its branch stays. When the verify stays red with every slug reverted, the fault is in the wave branch base: the wave stops and the campaign asks the person. The wave branch is not pushed before its verify passes, so a revert changes nothing that another person can see.
- **12.3 A merge conflict.** The merge agent follows [_boundary.md](_boundary.md), "Merge". A conflict it may not resolve stops that slug's merge only.
- **12.4 A change lands on a lower wave.** With stacked PRs, move the higher waves at the next wave boundary, never while their slugs run ([_gh-stack.md](_gh-stack.md)).
- **12.5 Stack height.** At most `max-unshipped` waves (default 2) wait unshipped above the trunk. At the limit, `wave <n> start` refuses: continue the rolling prepare and ask the person about the waves that wait in handoff or ship.

## Local records

A repo that does not track `.ai/` keeps the records in the main checkout. Orient records `records: local` in the ledger. Branches carry only code, so no wave PR carries a workflow file.

- `<cmd> worktree <key|wave-<n>> add` copies the main `.ai/` tree into the worktree. The campaign folder stays in the main checkout, because the drives read it there by absolute path. The evidence folders (`*-evidence/`) of a workflow that the worktree does not drive also stay in the main checkout. A tracked `.ai/` file (for example `ship-plan.md`) keeps its committed version in the worktree, and the result names it in `records.tracked`. An uncommitted main edit to that file does not reach the drive, so that no worktree commit can publish it. The worktree gets its own `.ai/.gitignore` with `*`, so no `git add` in the worktree can stage a record. The main `.gitignore` can be untracked, and then a worktree does not have it. When git can still see a copied record, `add` and `refresh` return `ok: false` with `visibleToGit`: do not drive, hand off or ship in that worktree, and ask the person.
- `refresh` copies the main changes in. A file that the worktree changed or deleted stays as the worktree has it.
- `sync` copies every file that the worktree created or changed back to the main checkout. It never deletes a file in the main checkout, and it never overwrites a main change.
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

**Ask the person** (record each question with `<cmd> ask <id> --wave <n> <text>`; the watch sends a push notification) when:

- CI is red. Diagnose only, then ask, as handoff does.
- The readiness gate finds drift: the person chooses amend or acknowledge.
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

1. **The usage guard.** The sdlc mod reads the 5-hour and 7-day windows of each session and writes them to `~/.claude/sdlc/usage/`. When a window crosses the budget's pause line, the guard writes the pause into `work/campaign/.control.json` itself, so the next agent of every running drive stops at its stage boundary. The drive then ends with `stoppedAt: usage-pause`: record it with `<cmd> pause <until> <reason>` from the control file. When the reset time passes, the guard clears its pause and submits "Resume the run with /wf campaign <brainstorm-slug>" as a prompt; it also shows the same text as a toast.
2. **A usage-limit error.** When an agent of a drive or of the boundary fails on a usage limit (step 5.7 of "Run a wave"), run `<cmd> pause <reset time> <window>`. Take the reset time from `<cmd> budget` (`until`). When neither the reading nor the error gives one, ask the person.
3. **The person's word.** "Pause the campaign" runs the same command with the time the person gives. "Stop after this wave" writes `{"action":"stop","scope":"wave"}` to the control file: the running wave finishes, and the next wave does not start. "Stop <slug>" writes `{"action":"stop","scope":"slug","slug":"<slug>","after":"current"}`. Use `<watch> control "<projectRoot>" <slug> stop <after> --campaign <brainstorm-slug> --scope <slug|wave|campaign>`.
4. During a pause, give no notes: each note uses the same limits.
5. **Resume** when the guard submits the resume prompt, when the reset time passed (through a one-shot scheduled task in this session), or on the person's word: run `<cmd> resume`, then relaunch the drive that stopped (yolo.md, "Resuming"). Resume is free: orient skips the stages that are done.

## End

When the last wave shipped (`next.action` is `end`):

1. When the waves merged without tags, or shipped as pre-releases, ask the person whether to release the target version as a final release, by the ship plan's rollout stages. A final release is the person's decision.
2. Write `work/campaign/report.md`:
   - each wave: its slugs, its PR, its version or label, the slugs that moved, and its try-it note;
   - every carried decision of the campaign: honoured, narrowed (with the person's answer), dropped (with the ratification), changed at prepare, or not built yet (with its slug);
   - each work revision that the campaign re-planned from, and what it added;
   - the forecast against the real numbers.
3. Run `<cmd> journal campaign-end`.
4. Route to `/wf retro <slug>` for each slug. The person runs each retro.
