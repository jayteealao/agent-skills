# Campaign phases: orient, setup, prepare, and reopen pick-up

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

## Phase 0 — Orient

1. Run `<cmd> orient`. The script reads `work/index.md` and every packet, and then:
   - refuses a work set with a dependency cycle, an `expects` line with no matching `provides` line, an unknown dependency, or a packet with more than 40 carried decisions;
   - refuses a repo that does not track `.ai/` (`artifactTracking: ignored`, or a gitignored `.ai/workflows`), because each wave carries the workflow artifacts on its branch;
   - computes the waves: a wave is every build packet whose dependencies are in earlier waves, and two packets that touch the same slug never share a wave;
   - reads the version contract from `.ai/ship-plan.md` (`version-scheme`, `version-source-of-truth`, `version-bump-cmd`, `release-trigger`, `rollout-stages`);
   - writes `ledger.json`, `ledger.md`, and `forecast.md`.
2. When the result has `single: true`, the work set has one build packet. Stop, and give the person the packet's start command (`start`).
3. When the result has `errors`, stop and show each error. The person fixes the work set in the brainstorm session (`/wf brainstorm <brainstorm-slug>`), not here.
4. Show the waves, the packets that wait (`waiting`), the packets that need the person (`outside`), the forecast, and each tool gap.

The forecast estimates the run time from the driver journals of earlier yolo runs in this repo, and the tokens from their `cost.jsonl`. A slug with no history is "unknown". The forecast is an estimate, and `forecast.md` says so.

## Phase 1 — Setup

Ask the setup questions in one batch, per [../_gate-question.md](../_gate-question.md). Record each answer with `<cmd> answer <key> <json>`.

| Key | Question | Answer |
|---|---|---|
| `forecast` | The forecast and the wave plan: continue at this size, or cut the work set first? | `"continue"`, or `"cut"`. A cut happens in the brainstorm session; then run `replan`. |
| `target-version` | The version the campaign builds toward, for example `0.3.0` (V1). | A string. The script sets `"none"` when the project has no ship plan or `version-scheme: none`. |
| `release-each-wave` | Push each wave tag as a pre-release, or merge each wave only? | `true` or `false`. It holds for the whole campaign. |
| `output` | How to build the output, and how a person uses it. | `{"build-cmd", "artifacts", "try"}` |
| `budget` | The usage budget: above 75% of the 5-hour window, no new slug starts while another runs; at 90%, the campaign pauses until the reset; the last 15% of the 7-day window is kept for the person. Keep these, or change a line? | `"default"`, or `{"fiveHourSlow", "fiveHourPause", "sevenDayReserve"}` |

For `output`, take the recipe from the first source that has one:

1. `campaign.output` in `.ai/sdlc-config.json`.
2. The ship plan's `release-jobs`, when they can run locally.
3. The person. Write the answer to `campaign.output` in `.ai/sdlc-config.json`, so the next campaign has it.

CAUTION: the release question is about permanent tags. A pushed tag cannot be re-used: a fixed release takes a new version. Say this when you ask.

For each tool gap from Phase 0, ask the person to fix it. The campaign does not change the person's tools. A `gh-stack` gap turns stacked wave PRs off (`<cmd> stack disable`) until the person upgrades it. A `ship-plan` gap needs `/wf ship-plan init` with the person before wave 1 reaches handoff: handoff and ship stop without a plan.

**Width.** Slugs of one wave run at once only under an isolation contract, `campaign.isolation` in `.ai/sdlc-config.json`. When the project has none, ask the person for one, in the same batch, and write the answer there:

```json
{ "campaign": { "width": 3, "isolation": { "parallel": true, "port-env": { "PORT": 3000 }, "build-dirs": ["target"], "heavy-suites": ["npx playwright test"], "min-free-gb": 20 } } }
```

- `port-env`: each port variable with its base value. The drive with index i gets base + 100 × i.
- `build-dirs`: the build folders each worktree keeps for itself.
- `heavy-suites`: the test commands that only one worktree may run at a time.
- `parallel: false`: keep width 1 for this project. Without a contract the width is 1, in the main checkout.

## Rolling prepare

Prepare runs one wave ahead, not all at once. The person decides every question.

1. **Before wave 1,** prepare the units of wave 1. For each unit, in packet order:
   1. Run `/wf intake <packet path>` ([../intake/_packet.md](../intake/_packet.md)). Intake shows the carried decisions in groups of up to 8, each with its session and date, and the person keeps or changes each group. Do not skip this step.
   2. Run `/wf shape <slug>`. After shape, compare the shape with the packet's `provides` and `expects` lines. The person confirms each change. Write a confirmed change into the packet only through the brainstorm (`/wf brainstorm <brainstorm-slug> add`), because the brainstorm owns the packets.
   3. Run `/wf slice <slug>`.
   4. When the packet's `ux-impact` is not `none`, run the design lane per [../design/_lane.md](../design/_lane.md).
   5. Set `branch-strategy: dedicated` in the slug's `00-index.md`. The wave start sets `branch` and `base-branch`.
   6. Run `<cmd> unit <key> prepared`.
2. **While wave n runs,** prepare the units of wave n+1 (`next.prepare` in `status`). When the as-built notes of wave n exist, show the ones that a unit of wave n+1 depends on before its intake.
3. **A wave starts with its prepared units.** `wave <n> start` moves each unprepared unit, and each unit of the wave that depends on it, to a later wave. Tell the person which units moved.
4. The person can stop at any time. The ledger holds the progress.

While the person prepares, the commentary gives one line per event and holds the full notes until the batch ends ([../yolo/_commentary.md](../yolo/_commentary.md), "In a campaign").

## Packets outside the waves

yolo drives only the build forms. The other forms never enter a wave.

| Form | Who runs it | When | Then |
|---|---|---|---|
| `task` | the person, through `/wf task <slug>` in this session | between waves, never inside one | `<cmd> outside <key> closed` when the task is closed |
| `investigate` | the person, through `/wf intake <packet path>` | before the packets that depend on it are prepared | The pick goes back to the brainstorm (`/wf brainstorm <brainstorm-slug> add`), which writes the next packet. Then `outside <key> closed`. |
| `discover` | the person, in prepare | before the packets that depend on it | A verdict that changes a carried decision goes back to the brainstorm, and the drift check runs. Then `outside <key> closed`. |
| `write-now` | the brainstorm session, at `done` | never reaches the campaign | Its `work/changes.md` entry starts the drift check. |

A packet outside the waves blocks only its dependents, not the wave. At each wave boundary, list it as "needs you", with a push notification. The campaign never turns a result into a packet itself: only the brainstorm writes packets.

## Reopen pick-up

The person can reopen the brainstorm in the brainstorm session while the campaign runs. The watch emits `work-changed` when `work-revision` in `work/index.md` changes, and `status` returns `work-changed`.

1. Read `work/changes.md` for the revisions after the ledger's `work-revision`.
2. Run `<cmd> replan`. Waves that started are never re-planned. The waves that did not start are computed again. When `work/index.md` does not parse, the brainstorm is writing it: try again at the next boundary.
3. Act on each change:

| Change | Action |
|---|---|
| New `intake` packet | It joins the rolling prepare, and enters the earliest wave its dependencies allow. |
| New `task`, `investigate`, or `discover` packet | It runs with the person outside the waves. Its dependents wait. |
| New `write-now` entry in `work/changes.md` | Run the drift check over each unit that carries or expects a changed document. |
| `extension` of a merged slug | A new unit on that slug, in a later wave. |
| `extension` of a slug in the running wave | It waits until the slug merges, then runs in a later wave. |
| `extension` of a slug that is prepared but not started | The person prepares the slug again (shape and slice) with the new scope. |
| `fix` | Prepare is the compressed fix intake, with the person. It enters the next wave. When it changes a `provides` line, run the drift check over the waiting units. |
| `hotfix` with `urgency: urgent` | It runs before the next planned wave ([_waves.md](_waves.md), "Hotfix"). |
| Changed `provides` or `expects` lines | Run the drift check over every waiting unit. |
| `pending-cut` of a started packet | Stop the units that depend on it. Ask the person: keep the work, or revert it (the revert of [_waves.md](_waves.md), "Revert search"). |
| New `depends-on` that makes a prepared unit wait | `replan` moves it to a later wave. Say so in the commentary. |
| A carried decision changed in prepare | Run the drift check over the units that carry or expect that decision. |

The ledger records each revision that it re-planned from, and the report lists what each revision added.
