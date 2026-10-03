# Campaign waves: drive, boundary, handoff, ship, and the end

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. `<watch>` stands for `node "<pluginRoot>/scripts/yolo-watch.mjs"`.

This is Stage C: one slug at a time, in the main checkout, and one PR per wave against the trunk. The next wave starts after the previous wave merged.

## Run a wave

1. **Check.** Run `<cmd> status`. When `next.action` is `paused` or `ask`, do not start the wave.
2. **Drift.** For wave 2 and later, read `drift/wave-<n>.md` (written at the end of the previous wave). For each unit in its stop list, run `<cmd> unit <key> stopped --route "drift: <the contract lines>"`, then ask the person to choose: amend that slug's shape, or add a fix packet before it through the brainstorm. The independent units continue.
3. **Start.** Run `<cmd> wave <n> start`. It starts the wave with its prepared units and moves the others. Create the wave branch from the trunk without a checkout: `git -C "<projectRoot>" branch <branch> <base>`, with `branch` and `base` from the result.
4. **Watch.** Start the watch over the wave's slugs and the campaign journal ([../yolo/_commentary.md](../yolo/_commentary.md), "In a campaign").
5. **Drive each unit, in packet order:**
   1. Run `<cmd> context <key>`.
   2. In the slug's `00-index.md`, set `branch: campaign/<brainstorm-slug>/wave-<n>--<slug>` and `base-branch: <wave branch>`. Re-read the file immediately before the edit.
   3. Run `<cmd> unit <key> running`.
   4. Launch yolo per [../yolo.md](../yolo.md) Steps 0 and 1, with two more args: `contextPath` (the absolute path of `context/<slug>.md`) and `campaignControlPath` (the absolute path of `work/campaign/.control.json`). Every stage agent then reads both fresh.
   5. When the run reaches its endpoint, run `<cmd> unit <key> finished --digest '<outcome.decisionDigest as JSON>'`. When the run stopped, run `<cmd> unit <key> stopped --route "<outcome.route>"` and continue with the next unit (12.1). A unit that depends on a stopped unit stays in the wave list but is not driven: mark it `stopped` with `--route "waits for <key>"`.
   6. Build the slug output: launch the boundary driver (below) with `mode: "slug-output"` and this one unit. When the output does not build, the slug failed its verify: mark it `stopped` with the failure as its route.
   7. Run `<watch> end "<projectRoot>" <slug>` with `--stopped-at` when the run stopped.
6. **Boundary.** Run `<cmd> wave <n> set boundary`. Launch the boundary driver with `mode: "wave"` and the finished units. Then record its outcome:
   - each `merged` unit: `<cmd> unit <key> merged --merge <sha>`;
   - each `needsFix` unit: `<cmd> unit <key> needs-fix --route "<reason>"`;
   - each `notMerged` unit: `<cmd> unit <key> stopped --route "<reason>"`;
   - when the outcome is `stopped`, run `<cmd> wave <n> set stopped`, then `<cmd> ask` with the reason, and stop here.
7. **Handoff and ship** (below).
8. **Pick up changes.** When `status` returns `work-changed`, follow [_phases.md](_phases.md), "Reopen pick-up".
9. **Drift for the next wave.** Launch the boundary driver with `mode: "drift"` and `wave: <n+1>`. Its agent classifies each changed contract line and runs `<cmd> drift <n+1>`.
10. **Forecast.** Run `<cmd> forecast --wave <n> --minutes <m> --tokens <t>`, with the wave's real run time from the journals and its tokens from the slugs' `cost.jsonl`.
11. **Clean up.** Delete each merged slug branch with `git -C "<projectRoot>" branch -d <slug branch>`. CAUTION: do not use `-D`. A branch that `-d` refuses holds commits that are not merged, so ask the person.
12. **F3.** When the boundary outcome has `stopBeforeNextWave`, record the question with `<cmd> ask` and do not start the next wave. The wave itself still ships.

### The boundary driver

Stage it the same way as the yolo driver, then launch it the same way (yolo.md Step 1):

```
node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --driver campaign-boundary
```

Args: `projectRoot`, `referenceRoot`, `brainstorm`, `mode`, `wave`, `waveBranch`, `runId` (the ledger's `run-id`), `output` (the setup answer), `moved` (the wave's moved units), and `units`: one `{ key, slug, branch, digest, output }` per unit. Its agents follow [_boundary.md](_boundary.md). It never edits the ledger: the campaign session records its outcome.

## Failure paths

- **12.1 A slug stops.** The wave ships with the slugs that finished. The stopped slug keeps its branch. Its dependents move to a later wave at the next `replan`. The wave PR and the try-it note list it as moved. When the person answers the stop, set it back to `prepared`; it joins the earliest wave its dependencies allow.
- **12.2 A merged slug breaks the wave verify.** The boundary runs up to 2 fix rounds, then reverts the merges one at a time, newest first, and runs the verify after each revert. The first green verify names the breaker. The slugs reverted before it are merged again, so the other slugs stay merged. The breaker becomes `needs-fix`, and its branch stays. When the verify stays red with every slug reverted, the fault is in the wave branch base: the wave stops and the campaign asks the person. The wave branch is not pushed before its verify passes, so a revert changes nothing that another person can see.
- **12.3 A merge conflict.** The merge agent follows [_boundary.md](_boundary.md), "Merge". A conflict it may not resolve stops that slug's merge only.

## Versions and outputs

- **V1.** The target version is the setup answer `target-version`.
- **V2.** A wave gets its version when it is next to ship: `<cmd> version wave` gives the next pre-release of the target after the newest released tag, for example `0.3.0-beta.1`, then `0.3.0-beta.2`.
- **V3.** A hotfix gets `<cmd> version hotfix`. The person confirms the number.
- **V4.** Before a wave ships, its outputs carry a build label, not a version: `<cmd> label <n> [<slug>]` gives `wave-<n>+<sha>` or `wave-<n>.<slug>+<sha>`.
- **V5.** When the wave is next to ship and the person chose "release each wave", run the ship plan's `version-bump-cmd` on the wave branch with the V2 version, commit, and push. CI runs again on that commit.
- **V6.** With `target-version: none`, there is no bump and no tag. The outputs and the try-it notes still exist, with build labels.

WARNING: do not push a wave tag, and do not publish a release, unless the setup answer `release-each-wave` is `true`. A pushed tag is permanent: a fixed release takes a new version, never a re-used one.

## Handoff and ship per wave

Each wave is one PR against the trunk.

1. Run `<cmd> wave <n> set handoff`. In each merged slug's `00-index.md`, set `branch:` to the wave branch and `base-branch:` to the trunk.
2. Run `/wf handoff <wave branch>`. Batch mode builds the roster of the slugs on that branch and opens one PR with one package. The ship-plan readiness check and the RIM block run as usual. Record the PR with `<cmd> wave <n> set handoff --pr <url>` and `<cmd> journal pr-opened '{"wave":<n>,"pr":"<url>"}'`.
3. Handoff watches CI to its end state. Record the result with `<cmd> journal ci-result '{"wave":<n>,"result":"<green|red>"}'`.
4. Ship the waves in order: wave n ships only after wave n−1 shipped. Run `<cmd> wave <n> set shipping`, then:
   - **Release each wave:** apply V5, then run `/wf ship <wave branch>`. Ship merges the PR, creates the tag, runs the release, and runs the post-publish checks, by the ship plan. Record `<cmd> journal released '{"wave":<n>,"version":"<v>"}'`.
   - **Merge each wave only:** run `/wf ship <wave branch>` for its gates and its merge. At the version step and the tag step, the setup answer is "merge only": bump nothing, tag nothing, publish nothing. When ship has no way to skip one of those steps, ask the person.
5. After the merge, run `<cmd> journal merged '{"wave":<n>}'` and `<cmd> wave <n> set shipped [--version <v>]`. When the wave shipped with a version, build the wave output again from the tagged commit, and put the version in the try-it note.

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

In Stage C, the campaign pauses on a usage-limit error and on the person's word only.

1. **A usage-limit error.** When an agent of a drive or of the boundary fails on a usage limit, run `<cmd> pause <reset time> <window>` with the reset time that the error states. When the error states none, ask the person for it. The pause writes `work/campaign/.control.json`, so the next agent of every running drive stops at its stage boundary.
2. **The person's word.** "Pause the campaign" runs the same command with the time the person gives. "Stop after this wave" writes `{"action":"stop","scope":"wave"}` to the control file: the running wave finishes, and the next wave does not start. "Stop <slug>" writes `{"action":"stop","scope":"slug","slug":"<slug>","after":"current"}`. Use `<watch> control "<projectRoot>" <slug> stop <after> --campaign <brainstorm-slug> --scope <slug|wave|campaign>`.
3. During a pause, give no notes: each note uses the same limits.
4. **Resume** when the reset time passed, through a one-shot scheduled task in this session, or on the person's word: run `<cmd> resume`, then relaunch the drive that stopped (yolo.md, "Resuming"). Resume is free: orient skips the stages that are done.

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
