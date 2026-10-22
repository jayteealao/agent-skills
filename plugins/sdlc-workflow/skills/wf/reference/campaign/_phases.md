# Campaign setup: orient, deps, and setup

This file belongs to [../campaign.md](../campaign.md). It holds the steps that run once, before wave 1, and again for each new unit (Phase 0b). The rolling prepare and the reopen pick-up are in [_prepare.md](_prepare.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

## Phase 0 — Orient

1. Run `<cmd> orient`. The script reads `work/index.md` and every packet, and then:
   - refuses a work set in which two packets open the same slug, or a packet carries more than 40 carried decisions;
   - seeds the dependency graph in the ledger, under `deps`: the old packet fields when a packet has them (`by: seed`), otherwise the serial chain of the brainstorm sequence (`by: serial`);
   - turns on local records for a repo that does not track `.ai/` (`artifactTracking: ignored`, or a gitignored `.ai/workflows`): the result has `records: local` and a warning ([_records.md](_records.md));
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
- Keep the two units in one wave. `deps confirm` writes the pair into the wave's `expected-shared` list. The cross-unit reconcile of the wave driver reads that list first ([_order.md](_order.md), "Cross-unit reconcile").

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

