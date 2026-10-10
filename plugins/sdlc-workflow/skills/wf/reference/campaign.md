---
description: Drive the many workflow slugs that one brainstorm ended in, in dependency waves. Setup and the rolling prepare run with the person on every host; the waves run yolo drives one slug at a time, merge each wave into one branch, verify it, record what was built, and hand off and ship one PR per wave. The ledger in the brainstorm's work/campaign/ folder holds the state, so one command resumes at any point.
argument-hint: <brainstorm-slug>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf campaign <brainstorm-slug>`. A brainstorm that ends in many slugs (`reference/intake/brainstorm/_work.md`) leaves one work packet per slug in `.ai/workflows/<brainstorm-slug>/work/`. The campaign drives those packets in dependency waves, so the person does not keep the order in their head.

> **Hosts.** Setup and the rolling prepare run on every host. The waves run yolo drives, and yolo is Claude Code only. Under another host, the campaign stops before a wave starts and says so ([_host-invocation.md](_host-invocation.md)).

## What the campaign is, and is not

- **The person decides every intake and shape question.** The campaign prepares each slug with the person (intake, shape, slice, and the design lane when the packet needs one). It never makes an intake or shape decision.
- **The waves are autonomous.** Each wave runs yolo on its slugs, then the boundary steps. The yolo rules all stay: an intent-bearing decision stops the run, a steering veto outranks every auto-resolve, and the charter checkpoint runs every 3 slices.
- **The campaign asks the person** at each handoff or ship issue and each ambiguity. It never guesses past one.
- **The brainstorm owns the board and the packets.** The campaign only reads them. The campaign owns `work/campaign/` and, while it is live, the main checkout's `INDEX.md` ([_control-file-ownership.md](_control-file-ownership.md)).
- **One session runs the campaign.** It announces in chat that it is the campaign session. The person reopens the brainstorm in another session. When the person opens the brainstorm here, say once that it belongs in another session, and continue.

Each wave is one PR. With an isolation contract, the slugs of a wave run at once, each in its own worktree. With stacked PRs, the next wave starts on the wave branch below before that wave merged ([campaign/_gh-stack.md](campaign/_gh-stack.md)). A usage budget narrows or pauses the campaign before a limit stops it.

## Step 0 — Resolve

1. The slug is the brainstorm's slug. When it is empty, list the brainstorm workflows that have `work/index.md` and ask which one.
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`) and `pluginRoot` as yolo.md Step 0 does.
3. Every ledger change goes through the campaign script, which prints one JSON object and regenerates `ledger.md`:

   ```
   node "<pluginRoot>/skills/wf/scripts/campaign.mjs" <command> "<projectRoot>" <brainstorm-slug> ...
   ```

   The commands are listed under [Commands](#commands). Never edit `ledger.json` by hand.
4. Run `status`. Run it again after each compaction. Follow every entry of its `rules` (see [Standing rules](#standing-rules)). When it has `presence.state: away`, follow [Away mode](#away-mode). Its `next.action` says what this invocation does:

| `next.action` | Do |
|---|---|
| `orient` | Phase 0, then Phase 1 ([campaign/_phases.md](campaign/_phases.md)). |
| `setup` | Continue Phase 1 at `next.question`. |
| `work-changed` | The brainstorm changed its work set. Pick it up (`_phases.md`, "Reopen pick-up"). |
| `ask` | Show each open question again, with its context. Record the answer with `reply`, then continue the step that asked. |
| `paused` | Show the reason and the reset time. Resume when the person asks, or when the reset time passed ([campaign/_waves.md](campaign/_waves.md), "Pause and resume"). |
| `prepare` | Prepare `next.units` with the person (`_phases.md`, "Rolling prepare"). |
| `start-wave` | Show the forecast and the wave plan. Ask the person to start, then run the wave (`_waves.md`). |
| `merge-in` | A waiting unit can continue: merge in each entry of `next.merges` (`_waves.md`, "Merge in"). |
| `running` | Show where the wave stands. Continue the wave from the ledger. Prepare `next.prepare` while the wave runs. |
| `stopped` | Show why the wave stopped and what waits on which answer. When the person answered, resume the wave. |
| `blocked` | No wave can start. List what waits on which packet, and the packets that need the person. |
| `end` | Phase 3 (`_waves.md`, "End"). |
| `done` | Show `report.md`. |

## The files

The campaign keeps its state inside the brainstorm, beside the packets.

| File | Writer | What |
|---|---|---|
| `work/campaign/ledger.json` | the campaign script | The truth: setup answers, waves, unit states, questions, pause, revisions |
| `work/campaign/ledger.md` | the campaign script | The view of the ledger for the person |
| `work/campaign/forecast.md` | the campaign script | Time and usage estimate, updated after each wave |
| `work/campaign/.campaign-journal.jsonl` | the script and the boundary agents | Heartbeats and campaign events; the watch reads it |
| `work/campaign/.control.json` | the campaign session | Stop and pause requests; every agent reads it |
| `work/campaign/context/<slug>.md` | the campaign script | The context file each yolo run reads fresh; section 7 lists the unit's waits |
| `work/campaign/steer.md` | the campaign script (`steer all`) | Steering for every slug of the campaign; each drive reads it beside its own `steer.md` |
| `work/campaign/decided-for-you.md` | the campaign script (`decided`) | Each decision taken for the person while away |
| `work/campaign/as-built/<slug>.md`, `.json` | the boundary | What the slug actually built, after its merge |
| `work/campaign/refute/<slug>.md` | the boundary refuter | The refuter's verdicts |
| `work/campaign/drift/wave-<n>.md` | the campaign script | The drift check before wave n |
| `work/campaign/fidelity/wave-<n>.md` | the boundary | The fidelity checkpoint after wave n |
| `work/campaign/waves/wave-<n>.md` | the boundary | The try-it note, for a person |
| `work/campaign/commentary.md` | the watch, and its `note` command | The campaign commentary: one line per stage start and commit, and a note per other event |
| `work/campaign/report.md` | the campaign session | The campaign report |

Built outputs are not artifacts. They go to `<projectRoot>/.scratch/campaign/<run-id>/` (`wave-<n>/` and `slugs/<slug>/`).

## Unit states

A build packet (form `intake`, `extension`, `fix`, `hotfix`) is a unit. A `task`, `investigate`, or `discover` packet never enters a wave: the person runs it in this session, and its dependents wait for it.

| State | Meaning |
|---|---|
| `planned` | In a wave, not prepared yet |
| `prepared` | Intake, shape, and slice are done with the person |
| `running` | Its yolo drive runs |
| `waiting` | Its yolo drive stopped before a slice that needs another unit of the wave; `merge-in` continues it |
| `finished` | Its yolo drive reached the endpoint; not merged yet |
| `stopped` | Its yolo drive stopped; `route` says what it waits for |
| `merged` | Merged into its wave branch; the wave verify passed |
| `needs-fix` | Its merge broke the wave verify and was reverted |
| `shipped` | Its wave shipped |

## Commands

| Command | Does |
|---|---|
| `orient` | Phase 0: check the work set, compute the waves, write the ledger and the forecast |
| `status` | The next action and the ledger summary |
| `replan` | Re-read the packets; re-plan the waves that did not start |
| `answer <key> <json>` | Record a setup answer: `forecast`, `target-version`, `release-each-wave`, `output`, `budget` |
| `unit <key> <state> [--route r] [--merge sha] [--digest json] [--on "<from>: <through>"]` | Set a unit's state, its route, its merge commit, or its yolo decision digest. `waiting --on` records what the drive waits for |
| `outside <key> closed\|needs-you` | Close a task, investigate, or discover packet; its dependents re-plan |
| `wave <n> start` | Start a wave with its prepared units; the unprepared ones move on |
| `wave <n> set <state> [--pr url] [--version v] [--label l]` | Record a wave state: `boundary`, `handoff`, `shipping`, `shipped`, `stopped` |
| `ask <id> [--wave n] <text>` / `reply <id> <answer>` | Record a question for the person, and the answer |
| `pause <until> <reason>` / `resume` | Pause the campaign and write the control file; resume |
| `context <key>` | Write `context/<slug>.md` |
| `drift <n>` | Write `drift/wave-<n>.md` from the as-built notes |
| `version wave\|hotfix` | The version at ship time |
| `label <n> [<slug>]` | The build label of a wave or slug branch tip |
| `journal <event> [<json>]` | Append a campaign event for the watch |
| `forecast [--wave n --minutes m --tokens t]` | Update the forecast with the real numbers of a wave |
| `budget` | The usage state (`ok`, `slow`, `pause`, `unknown`) from the newest reading, and the width it allows |
| `worktree <key>\|wave-<n> add\|refresh\|sync\|remove` | Make or remove a unit's worktree, slug branch, and ports, or the wave worktree. With local records, `add` and `refresh` copy the main `.ai/` in, and `sync` copies the worktree changes back. `remove` syncs, refuses while a file would be lost, and never forces |
| `lock [quiet] acquire\|release <slug>` | The heavy-suite lock: one holder at a time. The quiet lock (for `quiet-suites`) also keeps every heavy suite out while it is held |
| `stack enable\|disable\|set <n>` | Stacked wave PRs on or off, and the stack number on GitHub |
| `merge-in <key> <from>` | Merge the branch of `from` into a waiting unit, close the waits it satisfies, and write the context again |
| `merge-order <n>` | The boundary merge order of wave n, the carried units, and the quiet-window checks |
| `steer <key\|wave-<n>\|all> add\|replace\|remove\|list [--text t] [--match m] [--by who]` | Change steering. A key writes the unit's `steer.md` in the main checkout and in its worktree; `all` writes the campaign `steer.md`. The script writes the time |
| `rule add\|list\|remove [--text t] [<id>]` | The standing rules; every `status` result has them |
| `away --words "<the person's words>" [--until t]` / `back` | The person leaves, or comes back; `back` returns the recap |
| `decided <id> --question q --answer a --why w [--options json] [--intent-bearing true] [--unit key]` | Record a decision taken for the person |
| `recap [--since t]` | The facts since the person left: stages, commits, decisions, open questions, time against the forecast |

## Standing rules

A rule that the person gives for the whole campaign goes into the ledger, not only into chat. A compaction summary can drop a chat rule. The ledger keeps it.

1. When the person states a rule for the campaign, run `<cmd> rule add --text "<the rule, in the person's words>"`. For example: "Do not push, open a PR or merge without me", or "When I am present, ask with full context in each question".
2. At each start of this command, and after each compaction, run `status` and follow every entry of `rules`.
3. When the person withdraws a rule, run `<cmd> rule remove <id>`.

## Steering

Change steering only through the script. The script writes the time, and it writes every copy of a file at once.

- One slug: `<cmd> steer <key> add --text "<entry>"`. The command writes the slug's `steer.md` in the main checkout and in the unit's worktree.
- Every slug of a wave: `<cmd> steer wave-<n> add --text "<entry>"`.
- Every slug of the campaign: `<cmd> steer all add --text "<entry>"`. The command writes `work/campaign/steer.md`. Each drive reads it beside its own `steer.md`, at every stage. On a conflict, the slug's own entry wins.
- Change or remove one entry with `replace --match "<text>" --text "<entry>"` or `remove --match "<text>"`. When the match finds zero entries, or more than one entry, in any copy, nothing is written.
- Use `--by coordinator` for an entry that the person did not dictate. The default is "the person".
- `list` shows each copy, and `differs` names each copy that differs from the main copy.

CAUTION: do not edit a `steer.md` copy by hand or with a script of your own. The two copies then differ, and a hand-written time can be wrong.

Do not write a wait between units as steering. A wait comes from the packet's `needs` ([campaign/_waves.md](campaign/_waves.md), "Merge in").

## Away mode

The person can leave the campaign running, for example overnight.

1. When the person says that they leave, run `<cmd> away --words "<the person's words, quoted>"`. Add `--until <ISO time>` when the person names a return time. The result has `limits`.
2. While away, answer each question of the campaign and of the drives with the recommended option. Record each answer with `<cmd> decided <id> --question "<text>" --options '<json>' --answer "<text>" --why "<text>"`. Add `--unit <key>` when the question is a unit's.
3. Answer an intent-bearing stop of a drive only when the person's away words cover escalated decisions. Record it with `--intent-bearing true`, then relaunch the drive.
4. When the person comes back ("I am back", "recap the night"), run `<cmd> back`. Write the recap for the person from the result's `recap`: the intent-bearing decisions first, then the other decisions, each unit's stages and commits, the open questions, and the time against the forecast.
5. `<cmd> recap [--since <time>]` gives the same facts at any time.

WARNING: while the person is away, do not push, open a PR, merge into the trunk, tag, release, or delete anything. These acts cannot be undone, and they need the person.

CAUTION: while the person is away, do not answer a question of the classes `shared-env`, `external-party` or `irreversible`. Record each such question with `ask`. These questions wait for the person.

## Where the rest is

- Phase 0, Phase 1, the rolling prepare, the packet forms, and the reopen pick-up: [campaign/_phases.md](campaign/_phases.md).
- The waves, the failure paths, versions and outputs, handoff and ship per wave, pause and resume, and the end: [campaign/_waves.md](campaign/_waves.md).
- The stacked wave PRs and every `gh stack` command: [campaign/_gh-stack.md](campaign/_gh-stack.md).
- The boundary agents' procedure: [campaign/_boundary.md](campaign/_boundary.md).
- The watch and the commentary: [yolo/_commentary.md](yolo/_commentary.md), section "In a campaign".
