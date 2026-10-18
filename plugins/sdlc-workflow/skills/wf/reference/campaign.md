---
description: Drive the many workflow slugs that one brainstorm ended in, in dependency waves. Setup and the rolling prepare run with the person on every host. One wave driver run drives every slug of a wave in its own worktree, then merges, verifies and reviews the wave. Handoff and ship open one PR per wave. The ledger in the brainstorm's work/campaign/ folder holds the state, so one command resumes at any point.
argument-hint: <slug>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf campaign <brainstorm-slug>`. A brainstorm that ends in many slugs (`reference/intake/brainstorm/_work.md`) leaves one work packet per slug in `.ai/workflows/<brainstorm-slug>/work/`. The campaign drives those packets in dependency waves, so the person does not keep the order in their head.

> **Hosts.** Setup and the rolling prepare run on every host. The waves run the wave driver (`workflows/campaign-wave.js`), and the wave driver is Claude Code only. Under another host, the campaign stops before a wave starts and says so ([_host-invocation.md](_host-invocation.md)).

## What the campaign is, and is not

- **The person decides every intake and shape question.** The campaign prepares each slug with the person (intake, shape, slice, and the design lane when the packet needs one). It never makes an intake or shape decision.
- **The waves are autonomous.** One run of the wave driver drives every unit of a wave, then runs the boundary steps. The yolo rules all stay: an intent-bearing decision stops the unit, a steering veto outranks every auto-resolve, and the charter checkpoint runs every 3 slices. A unit that stops parks with one question, and the other units continue.
- **The campaign asks the person** at each handoff or ship issue and each ambiguity. It never guesses past one.
- **The brainstorm owns the board and the packets.** The campaign only reads them. The campaign owns `work/campaign/`, the dependency graph ([campaign/_deps.md](campaign/_deps.md)), and, while it is live, the main checkout's `INDEX.md` ([_control-file-ownership.md](_control-file-ownership.md)).
- **One session runs the campaign.** It announces in chat that it is the campaign session. The person reopens the brainstorm in another session. When the person opens the brainstorm here, say once that it belongs in another session, and continue.

Each wave is one PR. Every unit of a wave runs in its own worktree, so the wave driver needs an isolation contract ([campaign/_phases.md](campaign/_phases.md), "Width"). With stacked PRs, the next wave starts on the wave branch below before that wave merged ([campaign/_gh-stack.md](campaign/_gh-stack.md)). A usage budget narrows or pauses the campaign before a limit stops it.

## Step 0 — Resolve

1. The slug is the workflow whose `work/index.md` lists the packets. When it is empty, list the workflows that have one and ask which.
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`) and `pluginRoot` as yolo.md Step 0 does.
3. Every ledger change goes through the campaign script, which prints one JSON object and regenerates `ledger.md`:

   ```
   node "<pluginRoot>/skills/wf/scripts/campaign.mjs" <command> "<projectRoot>" <brainstorm-slug> ...
   ```

   The commands are listed under [Commands](#commands). Never edit `ledger.json` by hand.
4. Run `status`. Run it again after each compaction. Follow every entry of its `rules` (see [Standing rules](#standing-rules)). When it has `presence.state: away`, follow [Away mode](#away-mode). Its `next.action` says what this invocation does:

| `next.action` | Do |
|---|---|
| `orient` | Phase 0, then Phase 0b and Phase 1 ([campaign/_phases.md](campaign/_phases.md)). |
| `deps` | Phase 0b for `next.units` (`_phases.md`), before anything else. |
| `setup` | Continue Phase 1 at `next.question`. |
| `work-changed` | The brainstorm changed its work set. Pick it up (`_phases.md`, "Reopen pick-up"). |
| `ask` | Show each open question again, with its context. Record the answer with `reply`, then continue the step that asked. With `next.driving`, use only `reply` or `decided`: the wave driver continues the unit ([campaign/_waves.md](campaign/_waves.md), "Questions while the run goes"). |
| `paused` | Show the reason and the reset time. Resume when the person asks, or when the reset time passed (`_waves.md`, "Pause and resume"). |
| `prepare` | Prepare `next.units` with the person (`_phases.md`, "Rolling prepare"). |
| `start-wave` | Show the forecast and the wave plan. Ask the person to start, then run the wave (`_waves.md`). |
| `driving` | A run of wave `next.wave` is live. Show where the wave stands, and prepare `next.prepare`. Run Phase 0b first for `next.deps`. Do not run `launch`, `merge-in`, or `unit <key> <state>` for a unit of the wave: the driver owns them. |
| `running` | No run of the wave is live. When its units are `merged`, continue at `_waves.md`, "Run a wave", step 10. Otherwise, launch the wave again (step 4). Prepare `next.prepare`. |
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
| `work/campaign/.campaign-journal.jsonl` | the script and the wave driver's agents | Heartbeats and campaign events; the watch reads it |
| `work/campaign/.control.json` | the campaign session | Stop and pause requests; every agent reads it |
| `work/campaign/context/<slug>.md` | the campaign script | The context file that each stage agent of the unit reads fresh; section 7 lists the unit's waits |
| `work/campaign/steer.md` | the campaign script (`steer all`) | Steering for every slug of the campaign; each unit reads it beside its own `steer.md` |
| `work/campaign/decided-for-you.md` | the campaign script (`decided`) | Each decision taken for the person while away |
| `work/campaign/as-built/<slug>.md`, `.json` | the boundary | What the slug actually built, after its merge |
| `work/campaign/refute/<slug>.md` | the boundary refuter | The refuter's verdicts |
| `work/campaign/review/wave-<n>.md`, `.yaml` | the wave review writer | The review of the merged wave diff: the defects where units meet |
| `work/campaign/drift/wave-<n>.md` | the campaign script | The drift check before wave n |
| `work/campaign/fidelity/wave-<n>.md` | the boundary | The fidelity checkpoint after wave n |
| `work/campaign/waves/wave-<n>.md` | the boundary | The try-it note, for a person |
| `work/campaign/commentary.md` | the watch, and its `note` command | The campaign commentary: one line per stage start and commit, and a note per other event |
| `work/campaign/report.md` | the campaign session | The campaign report |

Built outputs are not artifacts. They go to `<projectRoot>/.scratch/campaign/<run-id>/` (`wave-<n>/` and `slugs/<slug>/`). The outcome of a wave run goes to the `outcomePath` that `wave <n> launch` gives.

## Unit states

A build packet (form `intake`, `extension`, `fix`, `hotfix`) is a unit. A `task`, `investigate`, or `discover` packet never enters a wave: the person runs it in this session, and its dependents wait for it.

| State | Meaning |
|---|---|
| `planned` | In a wave, not prepared yet |
| `prepared` | Intake, shape, and slice are done with the person |
| `running` | The wave driver walks its slices |
| `waiting` | The wave driver merges the cleared slice of another unit of the wave into it |
| `finished` | Its review is clean and its slug output is built; not merged yet |
| `stopped` | It parked with a question, or it moved out of the wave; `route` says why |
| `merged` | Merged into its wave branch; the wave verify passed |
| `needs-fix` | Its merge broke the wave verify, or the wave review reverted it |
| `shipped` | Its wave shipped |

## Commands

| Command | Does |
|---|---|
| `orient` | Phase 0: check the work set, seed the graph, write the ledger and the forecast |
| `deps show\|plan\|confirm` | Show, plan, or confirm the graph |
| `deps <key> <field> ...` | Change the graph ([campaign/_deps.md](campaign/_deps.md), "The deps commands") |
| `status` | The next action and the ledger summary |
| `replan` | Re-read the packets; re-plan the waves that did not start |
| `answer <key> <json>` | Record a setup answer: `forecast`, `target-version`, `release-each-wave`, `output`, `budget` |
| `unit <key> <state> [--route r] [--merge sha] [--digest json] [--on "<from>: <through>"]` | Set a unit's state, its route, its merge commit, or its decision digest |
| `outside <key> closed\|needs-you` | Close a task, investigate, or discover packet; its dependents re-plan |
| `wave <n> start` | Start a wave with its prepared units; the unprepared ones move on |
| `wave <n> launch [--mode drift]` | Add each worktree and context file, and print the wave driver's args; `--mode drift` gives the drift check's args only |
| `wave <n> record --outcome <path>` | Record the outcome of a wave run; it ends the live run |
| `wave <n> set <state> [--pr url] [--version v] [--label l]` | Record a wave state: `boundary`, `handoff`, `shipping`, `shipped`, `stopped` |
| `ask <id> [--wave n] [--unit k --kind k --stage s --slice s] <text>` / `reply <id> [--by person] [--move] <answer>` | Record a question for the person, and the answer |
| `pause <until> <reason>` / `resume` | Pause the campaign and write the control file; resume |
| `context <key>` | Write `context/<slug>.md` |
| `drift <n>` | Write `drift/wave-<n>.md` from the as-built notes |
| `version wave\|hotfix` | The version at ship time |
| `label <n> [<slug>]` | The build label of a wave or slug branch tip |
| `journal <event> [<json>]` | Append a campaign event for the watch |
| `forecast [--wave n --minutes m --tokens t]` | Update the forecast with the real numbers of a wave |
| `budget` | The usage state (`ok`, `slow`, `pause`, `unknown`) from the newest reading, and the width it allows |
| `worktree <key>\|wave-<n> add\|refresh\|sync\|remove` | Make or remove a unit's worktree, slug branch, and ports, or the wave worktree. With local records, `add` and `refresh` copy the main `.ai/` in, and `sync` copies the worktree changes back. `remove` syncs, refuses while a file would be lost, and never forces |
| `lock [quiet] acquire\|release <slug>` | The heavy-suite lock across sessions: one holder at a time. The quiet lock (for `quiet-suites`) also keeps every heavy suite out while it is held |
| `stack enable\|disable\|set <n>` | Stacked wave PRs on or off, and the stack number on GitHub |
| `merge-in <key> <from> [--at <sha>]`, `merge-order <n>`, `slice-done`, `needs`, `contract`, `await`, `question` | The commands of the wave driver's agents ([campaign/_drive.md](campaign/_drive.md)) |
| `owner <slug>` | The live wave run that drives a slug, for `/wf yolo` |
| `steer <key\|wave-<n>\|all> add\|replace\|remove\|list [--text t] [--match m] [--by who]` | Change steering. A key writes the unit's `steer.md` in the main checkout and in its worktree; `all` writes the campaign `steer.md`. The script writes the time |
| `rule add\|list\|remove [--text t] [<id>]` | The standing rules; every `status` result has them |
| `away --words "<the person's words>" [--until t]` / `back` | The person leaves, or comes back; `back` returns the recap and the steps that waited |
| `decided <id> --question q --answer a --why w [--options json] [--intent-bearing true] [--unit key]` | Record a decision taken for the person; it also answers the open question `<id>` |
| `recap [--since t]` | The facts since the person left: decisions, stages, commits, open questions, time against the forecast |

## Standing rules

A rule that the person gives for the whole campaign goes into the ledger, not only into chat. A compaction summary can drop a chat rule. The ledger keeps it.

1. When the person states a rule for the campaign, run `<cmd> rule add --text "<the rule, in the person's words>"`. For example: "Do not push, open a PR or merge without me", or "When I am present, ask with full context in each question".
2. At each start of this command, and after each compaction, run `status` and follow every entry of `rules`.
3. When the person withdraws a rule, run `<cmd> rule remove <id>`.

## Steering

Change steering only through the script. The script writes the time, and it writes every copy of a file at once.

- One slug: `<cmd> steer <key> add --text "<entry>"`. The command writes the slug's `steer.md` in the main checkout and in the unit's worktree.
- Every slug of a wave: `<cmd> steer wave-<n> add --text "<entry>"`.
- Every slug of the campaign: `<cmd> steer all add --text "<entry>"`. The command writes `work/campaign/steer.md`. Each unit reads it beside its own `steer.md`, at every stage agent. On a conflict, the slug's own entry wins.
- Change or remove one entry with `replace --match "<text>" --text "<entry>"` or `remove --match "<text>"`. When the match finds zero entries, or more than one entry, in any copy, nothing is written.
- Use `--by coordinator` for an entry that the person did not dictate. The default is "the person".
- `list` shows each copy, and `differs` names each copy that differs from the main copy.

CAUTION: do not edit a `steer.md` copy by hand or with a script of your own. The two copies then differ, and a hand-written time can be wrong.

Do not write a wait between units as steering. A wait comes from the unit's `needs` in the ledger ([campaign/_waves.md](campaign/_waves.md), "Merge in").

## Stop one slug

A stop request for one slug needs `--then move` (the unit moves out of the wave) or `--then hold` (it parks until the person says "continue"). When the person does not say which, ask first ([campaign/_waves.md](campaign/_waves.md), "Pause and resume").

## Away mode

The person can leave the campaign running, for example overnight.

1. When the person says that they leave, run `<cmd> away --words "<the person's words, quoted>"`. Add `--until <ISO time>` when the person names a return time. The result has `limits`.
2. While away, answer each question by the away answer of its kind ([campaign/_waves.md](campaign/_waves.md), "Questions while the run goes"). Record each answer with `<cmd> decided <id> --question "<text>" --options '<json>' --answer "<text>" --why "away: <the rule>"`, with `--unit <key>` for a unit's question. The unit continues in the same run.
3. Answer an intent-bearing question only when the person's away words cover escalated decisions. Record it with `--intent-bearing true`. Do not launch the wave again.
4. For each question that holds, send one push notification with the question id, the unit, and the question. The boundary waits for the answer.
5. When the run returns, run `wave <n> record`. Do not run the cleanup or handoff. Start the next wave only when the away words name it.
6. When the person comes back ("I am back", "recap the night"), run `<cmd> back`. Write the recap from the result's `recap`, in this order: the intent-bearing decisions, the other decisions, the driver's own decisions (`driver`), each unit's stages and commits, the questions that hold, and the time against the forecast. Then list each step of `waited`, and continue them with the person.
7. `<cmd> recap [--since <time>]` gives the same facts at any time.

WARNING: while the person is away, do not push, open a PR, merge into the trunk, tag, release, or delete anything. These acts cannot be undone, and they need the person.

CAUTION: while the person is away, do not answer a question of the classes `shared-env`, `external-party` or `irreversible`. Such a question holds for the person. When the session itself has such a question, record it with `ask`.

## Where the rest is

- Phase 0, Phase 0b, Phase 1, the rolling prepare, the packet forms, and the reopen pick-up: [campaign/_phases.md](campaign/_phases.md).
- The waves, the questions of a run, the failure paths, versions and outputs, handoff and ship per wave, pause and resume, and the end: [campaign/_waves.md](campaign/_waves.md).
- The stacked wave PRs and every `gh stack` command: [campaign/_gh-stack.md](campaign/_gh-stack.md).
- The wave driver's own agents and the parks: [campaign/_drive.md](campaign/_drive.md).
- The boundary agents' procedure: [campaign/_boundary.md](campaign/_boundary.md).
- The watch and the commentary: [yolo/_commentary.md](yolo/_commentary.md), section "In a campaign".
