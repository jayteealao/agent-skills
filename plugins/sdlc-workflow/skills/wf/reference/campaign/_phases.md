# Campaign phases: orient, deps, setup, prepare, and reopen pick-up

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

## Phase 0 — Orient

1. Run `<cmd> orient`. The script reads `work/index.md` and every packet, and then:
   - refuses a work set in which two packets open the same slug, or a packet carries more than 40 carried decisions;
   - seeds the dependency graph in the ledger, under `deps`: the old packet fields when a packet has them (`by: seed`), otherwise the serial chain of the brainstorm sequence (`by: serial`);
   - turns on local records for a repo that does not track `.ai/` (`artifactTracking: ignored`, or a gitignored `.ai/workflows`): the result has `records: local` and a warning ([_waves.md](_waves.md), "Local records");
   - reads the version contract from `.ai/ship-plan.md` (`version-scheme`, `version-source-of-truth`, `version-bump-cmd`, `release-trigger`, `rollout-stages`);
   - writes `ledger.json`, `ledger.md`, and `forecast.md`. It plans no wave yet, and returns `next: deps`.
2. When the result has `single: true`, the work set has one build packet. Stop, and give the person the packet's start command (`start`).
3. When the result has `errors`, stop and show each error. The person fixes the work set in the brainstorm session (`/wf intake brainstorm <brainstorm-slug>`), not here.
4. Show the packets that need the person (`outside`), the forecast, and each tool gap. Then continue at Phase 0b.

The forecast estimates the run time from the driver journals of earlier runs in this repo, and the tokens from their `cost.jsonl`. A slug with no history is "unknown". The forecast is an estimate, and `forecast.md` says so.

## Phase 0b — Deps

The campaign owns the dependency graph. The person confirms it before setup, and before a new unit joins a wave. There is no way to skip the confirmation. `status` returns `next: deps` while a unit outside a started wave has no confirmed entry.

1. Run the deps scout, and record its proposal ([_deps.md](_deps.md)). The scout gives each unit edge a kind: `need` (a code, data, or contract use, with evidence) or `sequence` (an order that the person prefers, with no named use). Only a `need` orders the waves. A `sequence` edge orders the units inside a wave.
2. Run `<cmd> deps plan`. It runs the graph check and the wave planner over the proposal, and changes no state. It returns:
   - `errors`: a cycle through `depends-on` or `needs`, an unknown dependency, an `expects` line with no matching `provides` line on a unit that it depends on, and each `needs` entry on the unit itself, on a packet that is not a build packet, or on a packet that touches the same slug;
   - `waves`: the waves of the proposal. A wave is every build unit whose dependencies are in earlier waves. A `needs` entry lets a unit share the wave of the unit that it needs. Two units that touch the same slug never share a wave;
   - `serial`: the waves of the serial chain;
   - `shared`: each path that two units of one wave cite (see "Shared paths");
   - `dropped`: each edge that was removed, with its evidence;
   - `unclassified`: each edge with no kind yet, from a ledger that is older than the edge kinds. Classify each one with the scout's rules ([_deps.md](_deps.md), "What the scout does", step 4), and record it with `<cmd> deps <key> depends-on kind <from> --kind need|sequence --why "<why>" --by scout`.
3. Ask the person in one batch, per [../_gate-question.md](../_gate-question.md). Show the serial waves and the proposed waves side by side, each dropped edge with its evidence, each edge that became a `sequence`, each shared path, and each error. The options are:
   - confirm the proposal;
   - change some lines (free text). A person who wants the serial chain says so here, and each dropped edge goes back.
4. Record each change with the `deps` commands, `--by person` ([../campaign.md](../campaign.md), "Commands"). Fix each error here, in the campaign session. Go back to the brainstorm only to change the pieces themselves: their split, their decisions, their slugs, or their sequence.
5. Run `<cmd> deps confirm`. It refuses while the graph has an error. On success, it writes the waves, confirms each unit that waited, and appends `deps-confirm` to the campaign journal. Show the waves, the units that wait (`waiting`), and each shared path.

The graph and the waves do not use `campaign.width`. A wave holds every unit whose dependencies are met, with no size limit, and `deps plan` gives no warning for a wide wave.

### Shared paths

`deps plan` and `deps confirm` compare the `paths` of each pair of units that one wave holds. A path is an estimate before the plans exist, so a shared path is a warning, never a refusal. For each shared path, the person chooses one answer:

- Add a `depends-on` edge from the later unit in the sequence to the earlier one. The later unit moves to a later wave.
- Keep the two units in one wave. `deps confirm` writes the pair into the wave's `expected-shared` list. The cross-unit reconcile of the wave driver reads that list first ([_drive.md](_drive.md), "Cross-unit reconcile").

## Phase 1 — Setup

Ask the setup questions in one batch, per [../_gate-question.md](../_gate-question.md). Record each answer with `<cmd> answer <key> <json>`. The command refuses while the dependency graph is not confirmed: finish Phase 0b first.

| Key | Question | Answer |
|---|---|---|
| `forecast` | The forecast and the wave plan: continue at this size, or cut the work set first? | `"continue"`, or `"cut"`. A cut happens in the brainstorm session; then run `replan`. |
| `target-version` | The version the campaign builds toward, for example `0.3.0` (V1). | A string. The script sets `"none"` when the project has no ship plan or `version-scheme: none`. |
| `release-each-wave` | Push each wave tag as a pre-release, or merge each wave only? | `true` or `false`. It holds for the whole campaign. |
| `output` | How to build the output, and how a person uses it. | `{"build-cmd", "artifacts", "try"}` |
| `budget` | The usage budget: above 75% of the 5-hour window, no new slug starts while another runs; at 90%, the campaign pauses until the reset; the last 15% of the 7-day window is kept for the person. Keep these, or change a line? | `"default"`, or `{"fiveHourSlow", "fiveHourPause", "sevenDayReserve"}` |
| `conventions` | The campaign conventions for hotspot files (on by default): a generated file is regenerated, and a version number moves, only at the wave boundary; a CHANGELOG entry goes into a fragment file, or is one new line; a registry gets one new row for each slice. Keep them on? | `on` or `off`. The plan and implement prompts quote them, and the boundary merge regenerates each generated file once ([_boundary.md](_boundary.md), "Merge"). |

For `output`, take the recipe from the first source that has one:

1. `campaign.output` in `.ai/sdlc-config.json`.
2. The ship plan's `release-jobs`, when they can run locally.
3. The person. Write the answer to `campaign.output` in `.ai/sdlc-config.json`, so the next campaign has it.

CAUTION: the release question is about permanent tags. A pushed tag cannot be re-used: a fixed release takes a new version. Say this when you ask.

For each tool gap from Phase 0, ask the person to fix it. The campaign does not change the person's tools. A `gh-stack` gap turns stacked wave PRs off (`<cmd> stack disable`) until the person upgrades it. A `ship-plan` gap needs `/wf project ship-plan init` with the person before wave 1 reaches handoff: handoff and ship stop without a plan. An `isolation` gap needs the isolation contract of "Width" before wave 1: `wave <n> launch` refuses with `isolation-required` without one.

**Width.** The wave driver runs every unit of a wave in its own worktree, so every campaign needs an isolation contract, `campaign.isolation` in `.ai/sdlc-config.json`. The driver never works in the main checkout. When the project has none, ask the person for one before wave 1, in the same batch, and write the answer there:

```json
{ "campaign": { "width": 3, "isolation": { "parallel": true, "port-env": { "PORT": 3000 }, "build-dirs": ["target"], "heavy-suites": ["npx playwright test"], "min-free-gb": 20 } } }
```

- `port-env`: each port variable with its base value. The unit with index i gets base + 100 × i.
- `build-dirs`: the build folders each worktree keeps for itself.
- `heavy-suites`: the test commands that only one worktree may run at a time, also across sessions. Ask the person to list every long local run here, for example a calibration or a benchmark, and not only the test suites.
- `quiet-suites`: the timed checks that need an idle machine. A unit takes the quiet lock for them, and no heavy suite runs while it holds the lock.
- `min-free-gb`: the free disk space to keep. The default is 20.
- `outside-root` and `worktree-root`: short absolute paths outside the repo, for example `C:/co` and `C:/cw`. `outside-root` holds each unit's folders that cannot be in its worktree: a second build folder, or a checkout of another commit. The worktrees are in `~/.sdlc/cw/<repo tag>` by default; `worktree-root` moves them to a shorter path. On Windows, always ask the person for `outside-root`, and ask for `worktree-root` when `worktree add` reports a path that is too long: a folder at the drive root is the person's choice. Without them, a deep build path can pass the Windows limit of 260 characters.
- `build-depth`: the length of the deepest build path inside a worktree, for the path check at `worktree add`. The default is 140, for a Rust `target/` folder.
- `parallel: false`: keep width 1 for this project. The wave driver then drives one heavy step at a time, still with each unit in its own worktree.
- `machine-width`: the most machine steps that run at once (verify, wave verify, builds). The default is `campaign.width`.
- `locks`: the project's own lock files, each `{ "name", "path", "stale-minutes" }`, for example a calibration lock. A machine step waits until no lock is held. A lock file older than `stale-minutes` (default 120) does not hold. Ask the person for each lock that a long local run takes.

`campaign.width` is the most token steps that run at once: implement, review, and merge. A machine step takes a machine slot instead. Plans, review scouts, and bookkeeping agents take no slot. During a run, the token width follows the budget ([_waves.md](_waves.md), "The wave driver"). `campaign.trial-merge: false` turns off the trial merge of the finished units ([_boundary.md](_boundary.md), "Trial merge").

## Rolling prepare

Prepare runs one wave ahead, not all at once. The person decides every question.

1. **Before wave 1,** prepare the units of wave 1. For each unit, in packet order:
   1. Run `/wf intake <packet path>` ([../intake/_packet.md](../intake/_packet.md)). Intake shows the carried decisions in groups of up to 8, each with its session and date, and the person keeps or changes each group. Do not skip this step.
   2. Run `/wf shape <slug>`. After shape, compare the shape with the unit's `provides` and `expects` lines in `<cmd> deps show`. The person confirms each change. Record a confirmed change with `<cmd> deps <key> provides set` or `<cmd> deps <key> expects set`, `--by prepare`, then run `<cmd> replan`.
   3. Run `/wf slice <slug>`, with the wave slicer's proposal for the unit as input (see "Wave slicer"). When `/wf slice` asks for the review scope, recommend `slug-wide`: the wave review reads the merged diff after it, so a review of each slice is a third review. Then look for a need on another unit of the same wave. When a slice doc of this unit names a value, a type, a file or a sink that another unit of this wave builds, propose a `needs` entry: `{ from: <that packet key>, through: <the slice of that unit that builds it, or finished>, before: <the first slice of this unit that uses it>, why: <the thing, in a few words> }`. Propose only a need that passes the test of [_order.md](_order.md), "Pair kinds": a file that both units change is no need. The person confirms each proposed entry. Record a confirmed entry with `<cmd> deps <key> needs add --by prepare`, then run `<cmd> replan`. Do this before the wave starts: `wave <n> start` turns each `needs` entry into a wait. `wave <n> start` refuses while an item of a "Cross-Unit Needs" section of a `03-slice.md` names another unit of the wave, and no graph need between the two units covers it. Record the need, or take the item out of the section.
   4. When the packet's `ux-impact` is not `none`, run the design lane per [../design/_lane.md](../design/_lane.md), with the person, in the main checkout. The design stage builds the boards, and `freeze` writes `design/r1/` (`design/_boards.md`).
   5. Set `branch-strategy: dedicated` in the slug's `00-index.md`. `wave <n> launch` sets `branch` and `base-branch` in the unit's worktree.
   6. Run `<cmd> unit <key> prepared`. For a unit whose design is needed, the command refuses until the design is settled. For `visual` and `new-surface`, it also refuses until `02c-craft.md` names its frozen boards and every board exists. The result names the cause: finish the design with the person, then run the command again. `node "<pluginRoot>/skills/wf/scripts/design-boards.mjs" check "<projectRoot>" <slug>` lists the missing boards.
2. **While wave n runs,** prepare the units of wave n+1 (`next.prepare` in `status`), and the units of later waves in `next.ahead`: each one needs only units that are done, started, or in wave n+1. Draft the intake, shape, and slice of all of them in one pass. Then ask the person in one sitting, grouped by unit. When the as-built notes of wave n exist, show the ones that a unit depends on before its intake.
3. **A wave starts with its prepared units.** `wave <n> start` moves each unprepared unit, and each unit of the wave that depends on it, to a later wave. Tell the person which units moved.
4. The person can stop at any time. The ledger holds the progress.

While the person prepares, the commentary gives one line per event and holds the full notes until the batch ends ([../yolo/_commentary.md](../yolo/_commentary.md), "In a campaign").

### Wave slicer

When the units of a batch have their shapes, and before the first `/wf slice` of the batch, launch one read-only subagent. It reads every shape of the batch, `<cmd> deps show`, the as-built notes of the merged units, and the code. It writes nothing. It proposes the roster of each unit of the batch, by these rules:

1. **Provider first.** A slice that another unit needs comes early in its roster, and stays small.
2. **Shared foundations.** A change that slices of two or more units need becomes one early slice of one unit, with a `need` from each consumer.
3. **Hotspots.** It names the hotspot files, and applies the campaign conventions to them (Phase 1, `conventions`).
4. **Balance.** No roster is much longer than the others. It names a unit on the critical path that must split into two units.
5. **Needs with evidence.** It writes each cross-unit need as `{ from, through, before, why, evidence }`.
6. **Predicted files.** It lists the files of each slice.
7. **Question sweep.** It lists the intent-bearing choices that the plans will meet.

Give each unit's proposal to its `/wf slice` run. The person confirms each roster, as before. Record each confirmed need with `<cmd> deps <key> needs add --by prepare`, then run `<cmd> replan`.

Before `wave <n> start`, run `<cmd> schedule <n>`. It simulates the wave with no agent: each unit's plans, then its walk, with implement and review on the token slots and verify on the machine slots. It returns the simulated minutes, the critical path, the slot bound, the idle slot-hours, and the longest unit. The stage minutes are the medians of the unit driver journals; `--medians plan` uses the plan's defaults, and `--width <w>` tries another width. Show the result. When the critical path is longer than the slot bound, a split of the longest unit helps more than a wider slot.

## Packets outside the waves

The wave driver drives only the build forms. The other forms never enter a wave.

| Form | Who runs it | When | Then |
|---|---|---|---|
| `task` | the person, through `/wf intake task <slug>` in this session | between waves, never inside one | `<cmd> outside <key> closed` when the task is closed |
| `investigate` | the person, through `/wf intake <packet path>` | before the packets that depend on it are prepared | The pick goes back to the brainstorm (`/wf intake brainstorm <brainstorm-slug> add`), which writes the next packet. Then `outside <key> closed`. |
| `discover` | the person, in prepare | before the packets that depend on it | A verdict that changes a carried decision goes back to the brainstorm, and the drift check runs. Then `outside <key> closed`. |
| `write-now` | the brainstorm session, at `done` | never reaches the campaign | Its `work/changes.md` entry starts the drift check. |

A packet outside the waves blocks only its dependents, not the wave. At each wave boundary, list it as "needs you", with a push notification. The campaign never turns a result into a packet itself: only the brainstorm writes packets.

## Design amend

When the design of a unit reopens, list the unit as "needs you", with a push notification. When a run of the unit's wave is live, stop the unit with `--scope slug --then hold` ([_waves.md](_waves.md), "Pause and resume"). Otherwise, run `<cmd> unit <key> stopped --route "design amend"`.

1. The person runs `/wf design <slug> amend` in the main checkout. The amend freezes `design/r<N+1>/`.
2. When the unit has a worktree, run `<cmd> worktree <key> refresh`. The refresh copies the new revision in.
3. Continue the unit:
   - While a run of its wave is live, clear the stop request, then answer the `slug-stop` question with "continue" ([_waves.md](_waves.md), "Questions while the run goes").
   - When its wave started and no run is live, launch the wave driver again ([_waves.md](_waves.md), "Run a wave", step 4).
   - When its wave did not start, run step 6 of the rolling prepare again.

## Reopen pick-up

The person can reopen the brainstorm in the brainstorm session while the campaign runs. The watch emits `work-changed` when `work-revision` in `work/index.md` changes, and `status` returns `work-changed`.

1. Read `work/changes.md` for the revisions after the ledger's `work-revision`.
2. Run `<cmd> replan`. Waves that started are never re-planned. The waves that did not start are computed again. When `work/index.md` does not parse, the brainstorm is writing it: try again at the next boundary.
3. Act on each change:

| Change | Action |
|---|---|
| New packet of any form | It gets a serial edge to the piece before it in the sequence (`by: serial`). `status` returns `next: deps` until the person confirms its entry (Phase 0b). It joins no wave before that. |
| New `intake` packet | After Phase 0b, it joins the rolling prepare, and enters the earliest wave its dependencies allow. |
| New `task`, `investigate`, or `discover` packet | It runs with the person outside the waves. Its dependents wait. |
| New `write-now` entry in `work/changes.md` | Run the drift check over each unit that carries or expects a changed document. |
| `extension` of a merged slug | A new unit on that slug, in a later wave. |
| `extension` of a slug in the running wave | It waits until the slug merges, then runs in a later wave. |
| `extension` of a slug that is prepared but not started | The person prepares the slug again (shape and slice) with the new scope. |
| `fix` | Prepare is the compressed fix intake, with the person. It enters the next wave. When it changes a `provides` line, run the drift check over the waiting units. |
| `hotfix` with `urgency: urgent` | It runs before the next planned wave ([_waves.md](_waves.md), "Hotfix"). |
| A changed sequence | The serial edges of each unit whose graph is not confirmed follow the new sequence. Confirmed edges do not change. Say so in the commentary. |
| `pending-cut` of a started packet | Stop the units that depend on it. Ask the person: keep the work, or revert it (the revert of [_waves.md](_waves.md), "Revert search"). |
| A carried decision changed in prepare | Run the drift check over the units that carry or expect that decision. |

The ledger records each revision that it re-planned from, and the report lists what each revision added.
