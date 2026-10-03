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

This is Stage C of the campaign plan: one slug at a time, in the main checkout, one PR per wave against the trunk. A wave starts after the previous wave merged.

## Step 0 — Resolve

1. The slug is the brainstorm's slug. When it is empty, list the brainstorm workflows that have `work/index.md` and ask which one.
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`) and `pluginRoot` as yolo.md Step 0 does.
3. Every ledger change goes through the campaign script, which prints one JSON object and regenerates `ledger.md`:

   ```
   node "<pluginRoot>/skills/wf/scripts/campaign.mjs" <command> "<projectRoot>" <brainstorm-slug> ...
   ```

   The commands are listed under [Commands](#commands). Never edit `ledger.json` by hand.
4. Run `status`. Its `next.action` says what this invocation does:

| `next.action` | Do |
|---|---|
| `orient` | Phase 0, then Phase 1 ([campaign/_phases.md](campaign/_phases.md)). |
| `setup` | Continue Phase 1 at `next.question`. |
| `work-changed` | The brainstorm changed its work set. Pick it up (`_phases.md`, "Reopen pick-up"). |
| `ask` | Show each open question again, with its context. Record the answer with `reply`, then continue the step that asked. |
| `paused` | Show the reason and the reset time. Resume when the person asks, or when the reset time passed ([campaign/_waves.md](campaign/_waves.md), "Pause and resume"). |
| `prepare` | Prepare `next.units` with the person (`_phases.md`, "Rolling prepare"). |
| `start-wave` | Show the forecast and the wave plan. Ask the person to start, then run the wave (`_waves.md`). |
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
| `work/campaign/context/<slug>.md` | the campaign script | The context file each yolo run reads fresh |
| `work/campaign/as-built/<slug>.md`, `.json` | the boundary | What the slug actually built, after its merge |
| `work/campaign/refute/<slug>.md` | the boundary refuter | The refuter's verdicts |
| `work/campaign/drift/wave-<n>.md` | the campaign script | The drift check before wave n |
| `work/campaign/fidelity/wave-<n>.md` | the boundary | The fidelity checkpoint after wave n |
| `work/campaign/waves/wave-<n>.md` | the boundary | The try-it note, for a person |
| `work/campaign/commentary.md` | the watch's `note` command | The campaign commentary |
| `work/campaign/report.md` | the campaign session | The campaign report |

Built outputs are not artifacts. They go to `<projectRoot>/.scratch/campaign/<run-id>/` (`wave-<n>/` and `slugs/<slug>/`).

## Unit states

A build packet (form `intake`, `extension`, `fix`, `hotfix`) is a unit. A `task`, `investigate`, or `discover` packet never enters a wave: the person runs it in this session, and its dependents wait for it.

| State | Meaning |
|---|---|
| `planned` | In a wave, not prepared yet |
| `prepared` | Intake, shape, and slice are done with the person |
| `running` | Its yolo drive runs |
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
| `answer <key> <json>` | Record a setup answer: `forecast`, `target-version`, `release-each-wave`, `output` |
| `unit <key> <state> [--route r] [--merge sha] [--digest json]` | Set a unit's state, its route, its merge commit, or its yolo decision digest |
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

## Where the rest is

- Phase 0, Phase 1, the rolling prepare, the packet forms, and the reopen pick-up: [campaign/_phases.md](campaign/_phases.md).
- The waves, the failure paths, versions and outputs, handoff and ship per wave, pause and resume, and the end: [campaign/_waves.md](campaign/_waves.md).
- The boundary agents' procedure: [campaign/_boundary.md](campaign/_boundary.md).
- The watch and the commentary: [yolo/_commentary.md](yolo/_commentary.md), section "In a campaign".
