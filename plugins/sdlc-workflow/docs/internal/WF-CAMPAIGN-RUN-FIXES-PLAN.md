# WF-CAMPAIGN-RUN-FIXES-PLAN — ten fixes from the SoccerManager campaign run

Status **BUILT 2026-10-10, not released: W1–W6 (C1–C9). W7, the live run, is open** · Date **2026-10-10** · Plugin **v9.183.0** · Owner **jayte**
Follows: [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md) (the campaign) and [WF-WATCH-MONITOR-PLAN.md](WF-WATCH-MONITOR-PLAN.md) (the watch). Evidence: SoccerManager session `29b05b7e-f1a2-5b7f-88f9-afd5170f1f0c`, `/wf campaign brainstorm-realism-additions-20260922`, waves 2 and 3, 2026-10-06 → 2026-10-10.

## 1. Why

The campaign shipped wave 2 and runs wave 3. In wave 3, three units run at the same time. The run works, but the coordinator did much of the work by hand. Most of the friction comes from four gaps:

- The campaign treats the units of one wave as independent.
- Steering is a file that the coordinator edits by hand.
- The campaign has no mode for "the person is away".
- Windows paths and one shared machine limit how far the drives can run in parallel.

| Problem | Evidence |
|---|---|
| Units of one wave depend on each other, and the campaign does not know | Wave 3 units 1, 2 and 3 each `depends-on` only wave 2 units, with `provides: []` and `expects: []`. Unit 3's slice docs read unit 2's person values and unit 1's `measures` sink. The coordinator found this only when the person asked "are the 3 units fully independent". It then wrote four merge gates as prose in unit 3's `steer.md` (2026-10-10 09:45Z). |
| Steering edits are hand work | The coordinator wrote three throwaway scripts (`.scratch/campaign-prepare/steer-{cleanup,output-place,merge-gates}.js`) to edit five `steer.md` copies (main and worktree). Every timestamp that it wrote is wrong. One timestamp is in the future: `10:20:00Z`, written at 09:44Z. |
| The person leaves overnight three times | "I'm going to bed. Pick best recommendations…" (10-06, 10-07, 10-09), then "Recap the nights work" or "I'm back, report" each morning. The decisions that the coordinator took for the person exist only in chat. |
| One machine, several drives | Wave 2: verify deferred the 10-minute timed criterion, because the other drive used 65–100% of the CPU and the run took 15.3 minutes. |
| Build output outside the worktree is never removed | Stale folders in `C:/t` (`w2d`, `w2r`, `w2v`, `sens-base-target`, …). On 2026-10-10 08:30Z, 28.5 GB was free against `min-free-gb` 100, and `worktree add` refused units 2 and 3. The person added disk space and asked for a clean-up steer. |
| The Windows path limit | The 9.181.0 worktree path is about 120 characters. In that worktree, these tasks failed: `bisect`, the `--base` old-engine build, the `compile_fail` tests and the coverage pass (`LNK1104`). The drives built at `C:/t/...` to work around the limit. |
| A merge conflict can be resolved twice | The units 1 and 2 both change `ROWS_FORMAT`. The merge plan resolves them inside unit 3's branch at the gates, and the boundary merges units 1, 2 and 3 again. |
| An old plugin for four days | The session ran 9.181.0 from 10-06 to 10-10. During that time, 9.182.0 and 9.183.0 fixed the stale alarms, the usage loop, the watch's `EPERM` and the worktree path. The session raised 34 `stale` events, and the coordinator used the workaround `SDLC_USAGE_DIR=usage-empty`. |
| Rules live only in chat summaries | 11 compactions. Each summary restates "Do not push, open a PR or merge without the user", the away policy and the question style. |
| Watch noise | 305 Monitor calls, most of them restarts after the 30-minute limit. |

### The fixes

| # | Problem | What this plan builds | Design | Wave | State |
|---|---|---|---|---|---|
| C1 | Units of one wave depend on each other | A `needs` packet field, waits that the script owns, a `wait` stop, a `merge-in` command | 3.1 | W2 | Built 2026-10-10, not released |
| C2 | Steering edits are hand work | `<cmd> steer`, plus one campaign-level steer file | 3.2 | W1 | Built 2026-10-10, not released |
| C3 | Overnight decisions exist only in chat | `<cmd> away`, `<cmd> back`, `<cmd> decided`, `<cmd> recap` | 3.3 | W1 | Built 2026-10-10, not released |
| C4 | Timed checks on a busy machine | A quiet-window deferral that the boundary runs, and a quiet lease | 3.4 | W5 | Built 2026-10-10, not released |
| C5 | Build output outside the worktree stays on disk | One outside folder per unit that the campaign owns, and a disk estimate | 3.5 | W4 | Built 2026-10-10, not released |
| C6 | The Windows path limit | A configurable worktree root and a path check at `worktree add` | 3.6 | W4 | Built 2026-10-10 on top of v9.182.0 (`d50891fa`): worktrees are at `.scratch/cw/<stamp>/w<n>-<i>`, and git runs with `core.longpaths` |
| C7 | A conflict resolved twice | Merge order from branch contents, and `rerere` from `merge-in` to the boundary | 3.7 | W3 | Built 2026-10-10, not released |
| C8 | An old plugin during the campaign | `status` reports a newer installed plugin, and the boundary offers the switch | 3.8 | W6 | Built 2026-10-10, not released |
| C9 | Rules live only in chat summaries | `<cmd> rule`, with the rules in the ledger and in every `status` result | 3.9 | W1 | Built 2026-10-10, not released |
| C10 | Watch noise | No new code. Measure on the live run | 3.10 | W7 | **Mostly built in v9.183.0**: one campaign watch follows the worktrees (F2), locks remove duplicate watches (F5), and transcript-based staleness (F6) |

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | A wait between units uses the stop-request path of the drive ([yolo.js:272](../../skills/wf/workflows/yolo.js)), not the steering-conflict path. A wait is a control signal: it says when a drive stops, not how a stage works. | recommendation |
| D2 | The script writes every timestamp in steering, rules and decisions, from its own clock in UTC. The model never writes a timestamp. | recommendation |
| D3 | Away mode never pushes, opens a PR, merges, tags, releases or deletes. Away mode never answers a question of the classes `shared-env`, `external-party` or `irreversible`. These questions wait for the person. | recommendation |
| D4 | Away mode may answer an intent-bearing stop of a drive, but only when the person's away words cover escalations. The coordinator records each such answer with `decided`, and the recap lists these answers first. D3 still holds. | PO 2026-10-10 (Q1) |
| D5 | The merge into a waiting unit runs only while that unit's drive is stopped. | recommendation |

## 3. Design

`<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs" <command> "<projectRoot>" <brainstorm-slug>`, as in [_waves.md](../../skills/wf/reference/campaign/_waves.md).

### 3.1 C1 — partial dependencies inside a wave

**N1. The packet field.** A packet can name a `needs` list:

```yaml
needs:
  - from: realism-player-record-player-as-a-person   # a packet key
    through: record-and-catalogue                     # a slice of `from`, or `finished`
    before: pace-selector                             # a slice of this unit
    why: determination and professionalism
```

- `from` must be a build packet of the work set. `before` must be a slice of this unit, once the unit is sliced.
- A `needs` does not move the unit to a later wave. `planWaves` ([campaign.mjs:163](../../lib/campaign.mjs)) puts the unit in the same wave as `from` or in a later wave, never in an earlier wave.
- `checkCampaignSet` includes `needs` in the cycle check. A unit and its `from` that touch the same slug is an error.

**N2. Where `needs` comes from.**

- The brainstorm writes `needs` when it knows of a dependency.
- Prepare finds the dependencies that the brainstorm did not record. In SoccerManager, unit 3's slice docs named unit 2's values and unit 1's sink. When a slice doc of a unit names another unit of the same wave, prepare proposes a `needs` entry. The person confirms each proposed entry before the wave starts. The confirmed entries go to the packet through the brainstorm's normal write path ([_phases.md](../../skills/wf/reference/campaign/_phases.md), "Reopen pick-up").

**N3. Waits that the script owns.**

- At `wave <n> start`, the script writes a wait for each `needs` entry into `ledger.units[key].waits`: `{ from, through, before, state: "open" }`.
- `ledger.units[key]['merged-in']` lists each merge: `{ from, through, sha, at }`.
- `renderContext` ([campaign.mjs:486](../../lib/campaign.mjs)) gets a section 7, "Waits". It lists each open wait and the line "Merged into this branch". Every stage agent already reads the context file again at each stage, so no prose in `steer.md` is necessary.

**N4. The wait stop.** `stopCheckClause` ([yolo.js:285](../../skills/wf/workflows/yolo.js)) gets condition (d). When the context file has an open wait whose `before` is the slice of this stage, and the stage is `plan`, the agent stops. It does no stage work and returns `status: 'stopped'`, `stopKind: 'wait'`, and `waitsFor: "<from>: <through>"`. The driver ends with `stoppedAt: 'waits'` and the route `waits for <from>: <through>`.

**N5. A new unit state.** `UNIT_STATES` gets `waiting`. In [_waves.md](../../skills/wf/reference/campaign/_waves.md) step 5.6, a run that stops with `stoppedAt: 'waits'` is recorded with `<cmd> unit <key> waiting --on <from>:<through>`, not `stopped`.

**N6. `<cmd> merge-in <key> <from>`.**

1. The command refuses while the state of `key` is `running`.
2. The command checks that the verify of `from` passed for the slice `through`. For `finished`, it checks that the state of `from` is `finished`. It reads the verify artifact of that slice in the worktree of `from`.
3. In the worktree of `key`, the command runs `git -c rerere.enabled=true merge --no-ff <branch of from>`.
4. On a conflict, the command runs `git merge --abort` and returns `{ ok: false, conflict: [files] }`. The coordinator then asks the person, or launches the boundary driver's merge agent on that one merge, with the table of [_boundary.md](../../skills/wf/reference/campaign/_boundary.md) "Merge".
5. On success, the command adds an entry to `merged-in`, closes each wait that the merge satisfies, renders the context file again, and appends a `merge-in` line to the campaign journal.

**N7. `status` names the next merge-in.** `campaignAction` returns `{ action: 'merge-in', key, from }` when a unit is `waiting` and its `from` has passed the slice that the wait needs. The watch already reports each `stage-end` of verify, so the coordinator runs `status` at that event.

### 3.2 C2 — the `steer` command

- `<cmd> steer <key|wave-<n>|all> add --text "<entry>"` appends `- <entry> (the person, <UTC now>)` to the `steer.md` of each named unit. The command writes the copy in the main checkout and the copy in the unit's worktree, when the unit has a worktree.
- `steer <target> replace --match "<text>" --text "<entry>"` and `steer <target> remove --match "<text>"` change one entry. A `--match` that finds zero entries, or more than one entry, is an error.
- `steer <target> list` prints the entries of each copy and reports each copy that differs from the main copy.
- With local records, the command writes both copies and then sets the records base of `steer.md` to the new hash. The next `sync` then sees no conflict.
- `steer all` writes `work/campaign/steer.md`, the campaign-level steer file. `campaignClause` names this file next to the unit's own `steer.md`. Every agent that reads steering also reads this file. The unit's own file outranks the campaign file.
- `--by <who>` changes the attribution. The default is "the person". The coordinator uses `--by coordinator` for an entry that the person did not dictate.

### 3.3 C3 — away mode and the recap

- `<cmd> away --words "<the person's words>" [--until <time>]` writes `ledger.presence = { state: "away", since, words, until }`. The command prints the rules of D3.
- `<cmd> back` sets `presence.state` to `present` and returns the recap (below) since `presence.since`.
- While the person is away, the coordinator answers the questions of the campaign and of the drives with the recommended option, inside the limits of D3 and D4. For each answer, it runs `<cmd> decided <id> --question "<text>" --options '<json>' --answer "<text>" --why "<text>"`. The command appends the decision to `work/campaign/decided-for-you.md` and to `ledger.decided`.
- `<cmd> recap [--since <time>]` returns these facts as JSON:
  - for each unit: the stages that ended, the commits and the current stage, from the journals;
  - the decisions taken for the person;
  - the open questions;
  - the elapsed time against the forecast.

  The coordinator writes the prose of the recap from these facts. The default `--since` is the last `away`.
- While the person is present, questions go through AskUserQuestion with full context in each question. This is the person's rule from this run, and C9 stores it.

### 3.4 C4 — timed checks on a busy machine

**Q-a. The quiet-window deferral (build first).**

- Verify may defer a timed acceptance criterion with `deferral: quiet-window`, when the machine load during the timed run was above the criterion's own limit.
- The boundary driver runs every `quiet-window` deferral of the wave after all drives of the wave end and before the merges. It runs them one at a time, with no other drive running.
- A timed criterion that fails there makes its unit `needs-fix`, as a failed verify does.

**Q-b. The quiet lease.**

- `campaign.isolation['quiet-suites']` lists the commands that need an idle machine.
- `<cmd> lock quiet acquire <slug>` waits until no other unit holds the heavy lock. While a unit holds the quiet lease, `lock acquire` refuses every other unit, with `quiet: <slug>` in the result.
- The lease does not stop builds that are not in `heavy-suites`. In SoccerManager, the calibration runs that loaded the machine were not in `heavy-suites`. At orient, the campaign asks the person to list the long local runs as heavy suites.

### 3.5 C5 — folders outside the worktree

- `campaign.isolation['outside-root']` is an absolute short path, for example `C:/cw`. At setup on Windows, when the config has no outside root, the campaign asks for one.
- `worktree <key> add` creates `<outside-root>/<stamp>/w<n>-<i>/` and returns it as `outside`. The isolation section of the context file says:
  - A second cargo target folder and a checkout of another commit go in `outside`.
  - Run output, copied binaries, logs and temporary files go in the worktree's `.scratch/`.
- `worktree <key> remove` deletes the `outside` folder after git removed the worktree. Before the delete, the command lists every link (junction or symbolic link) in the folder. When it finds a link, it refuses and asks the person, because a recursive delete can follow a link into the folder that the link points to.
- **The disk estimate.** At each `remove`, the command measures the build folders and the `outside` folder of the unit, with a 60-second limit, and appends the size to `ledger['disk-history']`. At `add`, the needed space is the largest size in the history multiplied by the units still to start, plus `min-free-gb`. The default `min-free-gb` becomes 20. With no history, the flat rule stays.
- With C5, the clean-up steer of 2026-10-10 becomes script text in the context file, and the coordinator no longer writes it.

### 3.6 C6 — the worktree root

Built in v9.182.0: the root is `.scratch/cw/<stamp>/w<n>-<i>`, with `core.longpaths`. In SoccerManager, the path is about 76 characters, against about 120 characters in 9.181.0. Not built:

- `campaign.isolation['worktree-root']` is an absolute path outside the repo. When it is set, `worktreeRoot` ([scripts/campaign.mjs:283](../../scripts/campaign.mjs)) uses it in place of `.scratch/cw`.
- **The path check.** On Windows, `worktree add` adds three lengths: the worktree path, the longest tracked path, and `campaign.isolation['build-depth']`. The default build depth is 140, for a Rust `target/<profile>/build/<crate>-<hash>/out/...` path. When the sum reaches 260 or more, the command refuses and names the fix: set `worktree-root`. The linker and some build scripts ignore `core.longpaths`, so the check counts the real limit.
- The stamp shortens from 16 characters to a 6-character base-36 form of the run time.
- The wave 3 worktrees of SoccerManager use the 9.181.0 path, so this item does not help them.

### 3.7 C7 — merge order at the boundary

- Before the merges, the boundary driver reads `merged-in` for each finished unit. A unit X contains a unit Y when X's `merged-in` has Y at a sha that is the tip of Y's branch.
- When X contains Y, the boundary merges X only and records Y as `merged through X`.
- When Y has commits after the merge-in, the boundary merges Y first and X second. Both merges run with `rerere.enabled=true`. The rerere cache is in the common git folder, which all worktrees share, so the boundary replays the resolution of `merge-in` (N6 step 3), and the conflict is not resolved a second time.
- [_boundary.md](../../skills/wf/reference/campaign/_boundary.md) "Merge" step 2 gets the order rule. The boundary driver gets `mergedIn` in each unit of its `units` argument.

### 3.8 C8 — the plugin version during a campaign

- `status` compares two versions: the version in the path of the running script (`.../sdlc-workflow/<version>/...`), and the newest version that `~/.claude/plugins/installed_plugins.json` records for `sdlc-workflow`. When the installed version is newer, the result has `pluginUpdate: { running, installed }`.
- The coordinator tells the person at the next wave boundary, not during a drive. A drive that runs keeps its staged driver. The person decides when to start a new session on the new version.
- `ledger.waves[n]['plugin-version']` records the version that ran each wave, for the retro.

### 3.9 C9 — standing rules in the ledger

- `<cmd> rule add --text "<rule>"` appends `{ id, text, by, at }` to `ledger.rules`. `rule list` and `rule remove <id>` work on the same list.
- Every `status` result has `rules`, and `ledger.md` renders them first.
- [campaign.md](../../skills/wf/reference/campaign.md) tells the coordinator to run `status` after each compaction and to follow `rules`.
- In this run, the rules would be:
  - do not push, open a PR or merge without the person;
  - when away, pick the recommended options and record them (C3);
  - when present, ask with AskUserQuestion, with full context in each question;
  - similar features go behind a cargo feature.

### 3.10 C10 — watch noise

v9.183.0 builds one campaign watch that follows the worktrees, locks that end duplicate watches, and a transcript signal for `stale`. The 30-minute limit of the Monitor tool stays on the Desktop app (WF-WATCH-MONITOR-PLAN section 9). This plan builds nothing more for C10. W7 measures the watch on the next run. When restarts still cost more than the target in section 6, open a new item in the watch plan.

## 4. Files

| File | Change |
|---|---|
| `lib/campaign.mjs` | `needs` in `unitOf`, `checkCampaignSet` and `planWaves` (N1). `waiting` state (N5). `merge-in` action in `campaignAction` (N7). Context section 7 (N3). Rules in `renderLedgerMd` (C9). Disk estimate (C5). |
| `scripts/campaign.mjs` | Commands `merge-in`, `steer`, `away`, `back`, `decided`, `recap` and `rule`. `worktree` outside folder, path check and `worktree-root` (C5, C6). `lock quiet` (C4). `pluginUpdate` in `status` (C8). |
| `lib/campaign-records.mjs` | A records-base update for a file that both sides wrote the same (C2). |
| `lib/work-packets.mjs` | `needs` in the packet schema (N1). |
| `skills/wf/workflows/yolo.js` | Condition (d) in `stopCheckClause`, `stopKind: 'wait'`, and `stoppedAt: 'waits'` (N4). The campaign steer file in `campaignClause` (C2). |
| `skills/wf/workflows/campaign-boundary.js` | `mergedIn` in units, the merge order, `rerere` (C7). The quiet-window runs (C4). |
| `skills/wf/reference/campaign.md` | `status` after compaction, and `rules` (C9). Away mode (C3). |
| `skills/wf/reference/campaign/_waves.md` | Step 5.6 `waiting`. The merge-in step. The plugin check at the boundary (C8). |
| `skills/wf/reference/campaign/_boundary.md` | Merge order (C7). Quiet-window runs (C4). |
| `skills/wf/reference/campaign/_phases.md` | Prepare proposes `needs` (N2). |
| `skills/wf/reference/verify.md` | The `quiet-window` deferral (C4). |
| `dist/campaign.mjs` | Build again in the same commit as each `lib/` or `scripts/` change. |
| `tests/unit/lib/campaign.test.mjs`, `tests/unit/campaign-cli.test.mjs`, `tests/unit/lib/campaign-records.test.mjs` | The tests of section 5. |

## 5. Waves

Each wave is test-first: write the test, see it fail, then write the code.

| Wave | Content | Tests |
|---|---|---|
| W1 | C9 rules, C2 steer, C3 away and recap. These items are script and reference changes only. | `rule add` survives a reload of the ledger, and `status` prints it. `steer all add` writes the campaign file. `steer <key> add` writes the main copy and the worktree copy, and then `sync` reports no conflict. A `--match` with two hits is an error. Every timestamp comes from the script. `away`, `decided` and `back` give a recap that lists the decision. |
| W2 | C1, N1–N7. | Two units with a `needs` entry plan into one wave. A `needs` that points to a later wave is an error. A cycle through `needs` is an error. `wave start` writes the waits, and the context file shows them. A plan agent with an open wait returns `stopKind: 'wait'`, and the driver ends with `stoppedAt: 'waits'`. `merge-in` refuses while the unit runs, closes the wait on success, and aborts on a conflict. `status` returns `merge-in` after the verify of `from` passes. |
| W3 | C7. | A unit that contains another unit at its tip merges alone. With commits after the merge-in, the merge order is Y then X, and the second conflict replays from rerere. |
| W4 | C5, C6. | `add` creates the outside folder, and `remove` deletes it. A link in the outside folder stops the delete. The disk estimate uses the history. The path check refuses at 260 characters on Windows and passes off Windows. `worktree-root` moves the root. |
| W5 | C4. | A `quiet-window` deferral reaches the boundary, which runs it alone. The quiet lease blocks a heavy acquire by another unit. |
| W6 | C8. | A newer `installed_plugins.json` entry gives `pluginUpdate`. An equal entry gives nothing. |
| W7 | Live run: the next SoccerManager or Secbot wave with two or more units that need each other. | The measures of section 6. |

Release rules: a change to `scripts/` or `lib/` needs `dist/` built again in the same commit. Stage files by path. Do not use `git add -A`, because other sessions edit this tree at the same time.

## 6. Measures

Measure on the W7 run, and compare with SoccerManager waves 2 and 3.

| Measure | Today | Target |
|---|---|---|
| Steer edits made with throwaway scripts | 3 scripts, 5 copies | 0 |
| Wrong timestamps in `steer.md` | 3 of 3 | 0 |
| Unit dependencies found only when the person asks | 3 (wave 3) | 0: prepare proposes them |
| Merge gates written as prose | 4 | 0 |
| Overnight decisions recorded outside chat | 0 | every decision |
| Folders left outside a removed worktree | 6 or more in `C:/t` | 0 |
| Timed criteria deferred because of load, and never run again | 1 (wave 2, 15.3 min) | 0: the boundary runs them |
| Restarts of the watch | about 300 Monitor calls | the target of WF-WATCH-MONITOR-PLAN section 8 |
| Rules restated in compaction summaries | in 11 of 11 | 0: `status` prints them |

## 6a. As built (2026-10-10)

| Item | Where | Difference from the design |
|---|---|---|
| C1 | `lib/campaign.mjs` (`needsOf`, `planWaves`, `waveWaits`, `mergeInsReady`, `closeWaits`, `waitsText`), `scripts/campaign.mjs` (`merge-in`, `unit … waiting --on`), `yolo.js` (condition (d), `stopKind: 'wait'`, `stoppedAt: 'waits'`), `lib/work-packets.mjs` and `tests/frontmatter.schema.json` (`needs`) | The wait stop covers plan and implement, not plan only. `campaignAction` returns `{ action: 'merge-in', wave, merges: [{ key, from, through, waitingFor }] }`, one entry per ready merge. Without a worktree, `merge-in` needs the main checkout on the unit's branch. |
| C2 | `scripts/campaign.mjs` `steer`, `yolo.js` `steeringClause` | The campaign steer file goes through `steeringClause`, not `campaignClause`. `lib/campaign-records.mjs` needs no change: the two copies are identical, so `sync` sees no conflict. |
| C3 | `scripts/campaign.mjs` `away`, `back`, `decided`, `recap`; `lib/campaign.mjs` `buildRecap` | `AWAY_LIMITS` holds D3 and D4. |
| C4 | `scripts/campaign.mjs` `lock quiet`, `quietDeferrals`; `campaign-boundary.js` `quietRun`; `_boundary.md` "Quiet-window checks"; `verify/_deferrals.md` | The checks reach the boundary through `merge-order` (`units[].quiet`). |
| C5 | `scripts/campaign.mjs` `worktreeStep`; `lib/campaign.mjs` `diskNeedGb`, `isolationText` | The `min-free-gb` default was 20 already. |
| C6 | `lib/campaign.mjs` `pathBudget`, `shortStamp`; `scripts/campaign.mjs` `worktreeRoot` | The check runs on Windows, or with `SDLC_CAMPAIGN_PATH_CHECK=1` for the tests. |
| C7 | `lib/campaign.mjs` `boundaryMergeOrder`; `scripts/campaign.mjs` `merge-order`; `campaign-boundary.js` | The coordinator gets the order from `merge-order <n>` and passes its `units` to the boundary driver. |
| C8 | `lib/campaign.mjs` `pluginUpdate`; `scripts/campaign.mjs` `status`, `wave start` | The running version comes from the plugin's own `plugin.json`, not from the path. `SDLC_INSTALLED_PLUGINS` overrides the install record for the tests. Q5 stays open. |
| C9 | `scripts/campaign.mjs` `rule`; `renderLedgerMd` | — |

Tests: `tests/unit/lib/campaign-run-fixes.test.mjs` and `tests/unit/campaign-run-fixes-cli.test.mjs` (new), and changes to `campaign-cli`, `yolo-campaign`, `yolo-stop-request` and `work-packets` tests.

## 7. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | May away mode answer an intent-bearing stop of a drive? The person said "pick best recommendations for all escalated decisions" three times, and the coordinator did. The yolo rule says that an intent-bearing decision stops the run. | **Closed 2026-10-10: yes (D4).** The drive still stops. The coordinator answers and starts the drive again. |
| Q2 | Should `needs` also allow `after: verify` of a slice, or only `through` a slice? | Only `through`. The merge needs code that passed verify. |
| Q3 | Should `steer all` also write into each unit's own `steer.md`, for a drive that started before the campaign steer file existed? | No. Drives read the campaign file through the context clause, which every stage reads again. |
| Q4 | Is `C:/cw` an acceptable default for `outside-root` and `worktree-root` on Windows, or should setup always ask? | Always ask. A folder at the drive root is the person's choice. |
| Q5 | How does a running session load a newer plugin version? | Probe in W6. Until the probe answers, the coordinator says "start a new session" and gives the resume command. |
