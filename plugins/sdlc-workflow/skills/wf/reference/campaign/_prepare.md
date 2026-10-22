# Campaign prepare: the rolling prepare, the packets outside the waves, and reopen pick-up

This file belongs to [../campaign.md](../campaign.md). It holds the steps that recur while the campaign runs. Setup is in [_phases.md](_phases.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

## Rolling prepare

Prepare runs one wave ahead, not all at once. The person decides every question.

1. **Before wave 1,** prepare the units of wave 1. For each unit, in packet order:
   1. Have the person type `/wf intake <packet path>` ([../intake/_packet.md](../intake/_packet.md)). Intake shows the carried decisions in groups of up to 8, each with its session and date, and the person keeps or changes each group. Do not skip this step.
   2. Have the person type `/wf shape <slug>`. After shape, compare the shape with the unit's `provides` and `expects` lines in `<cmd> deps show`. The person confirms each change. Record a confirmed change with `<cmd> deps <key> provides set` or `<cmd> deps <key> expects set`, `--by prepare`, then run `<cmd> replan`.
   3. When the packet's `ux-impact` is not `none`, have the person type `/wf design <slug>` in the main checkout ([../design/_lane.md](../design/_lane.md)). The design lane runs before slice, so that each slice can name its boards. The design stage builds the boards, and `freeze` writes `design/r1/` (`design/_boards.md`).
   4. Have the person type `/wf slice <slug>`. Give the wave slicer's proposal for the unit as input (see "Wave slicer"). The boards of step 3 are input too. `/wf slice` asks no review-scope question for a campaign unit: the standing default `review-scope` (`defaults` in `status`) answers it. Then look for a need on another unit of the same wave. When a slice doc of this unit names a value, a type, a file or a sink that another unit of this wave builds, propose a `needs` entry: `{ from: <that packet key>, through: <the slice of that unit that builds it, or finished>, before: <the first slice of this unit that uses it>, why: <the thing, in a few words> }`. Propose only a need that passes the test of [_order.md](_order.md), "Pair kinds": a file that both units change is no need. The person confirms each proposed entry. Record a confirmed entry with `<cmd> deps <key> needs add --by prepare`, then run `<cmd> replan`. Do this before the wave starts: `wave <n> start` turns each `needs` entry into a wait. `wave <n> start` refuses while an item of a "Cross-Unit Needs" section of a `03-slice.md` names another unit of the wave, and no graph need between the two units covers it. Record the need, or take the item out of the section.
   5. Set `branch-strategy: dedicated` in the slug's `00-index.md`. `wave <n> launch` sets `branch` and `base-branch` in the unit's worktree.
   6. Run `<cmd> unit <key> prepared`. The command records `prepared-at-revision` and the unit's carried decisions (D6). For a unit whose design is needed, the command refuses until the design is settled ([../design/_lane.md](../design/_lane.md), "The human rule"). The result names the cause: finish the design with the person, then run the command again. `node "<pluginRoot>/skills/wf/scripts/design-boards.mjs" check "<projectRoot>" <slug>` lists the missing boards.
2. **While wave n runs,** prepare the units of wave n+1 (`next.prepare` in `status`), and the units of later waves in `next.ahead`: each one needs only units that are done, started, or in wave n+1. `next.ahead` names at most one slot cycle of units (the slot width), so a prepared unit does not wait days to start (D6). Draft the intake, shape, and slice of all of them in one pass. Then ask the person in one sitting, grouped by unit. When the as-built notes of wave n exist, show the ones that a unit depends on before its intake.
3. **A wave starts with its prepared units.** `wave <n> start` moves each unprepared unit, and each unit of the wave that depends on it, to a later wave. Tell the person which units moved.
4. The person can stop at any time. The ledger holds the progress.

While the person prepares, the commentary gives one line per event and holds the full notes until the batch ends ([_watch.md](_watch.md), K6).

### Wave slicer

When the units of a batch have their shapes, and before the first `/wf slice` of the batch, launch one read-only subagent. It reads every shape of the batch, `<cmd> deps show`, the as-built notes of the merged units, and the code. It writes nothing. It proposes the roster of each unit of the batch, by these rules:

1. **Provider first.** A slice that another unit needs comes early in its roster, and stays small.
2. **Shared foundations.** A change that slices of two or more units need becomes one early slice of one unit, with a `need` from each consumer.
3. **Hotspots.** It names the hotspot files, and applies the campaign conventions to them ([_phases.md](_phases.md), Phase 1, `conventions`).
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

1. Have the person type `/wf design <slug> amend` in the main checkout. The amend freezes `design/r<N+1>/`.
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
| New packet of any form | It gets a serial edge to the piece before it in the sequence (`by: serial`). `status` returns `next: deps` until the person confirms its entry ([_phases.md](_phases.md), Phase 0b). It joins no wave before that. |
| New `intake` packet | After Phase 0b, it joins the rolling prepare, and enters the earliest wave its dependencies allow. |
| New `task`, `investigate`, or `discover` packet | It runs with the person outside the waves. Its dependents wait. |
| New `write-now` entry in `work/changes.md` | Run the drift check over each unit that carries or expects a changed document. |
| `extension` of a merged slug | A new unit on that slug, in a later wave. |
| `extension` of a slug in the running wave | It waits until the slug merges, then runs in a later wave. |
| `extension` of a slug that is prepared but not started | The person prepares the slug again (shape and slice) with the new scope. |
| `fix` | Prepare is the compressed fix intake, with the person. It enters the next wave. When it changes a `provides` line, run the drift check over the waiting units. |
| `hotfix` with `urgency: urgent` | It runs before the next planned wave ([_ship.md](_ship.md), "Hotfix"). |
| A changed sequence | The serial edges of each unit whose graph is not confirmed follow the new sequence. Confirmed edges do not change. Say so in the commentary. |
| `pending-cut` of a started packet | Stop the units that depend on it. Ask the person: keep the work, or revert it (the revert of [_boundary.md](_boundary.md), "Revert search"). |
| A carried decision changed in prepare | Run the drift check over the units that carry or expect that decision. |
| A carried decision of a prepared unit changed (`reask` in `status`) | `replan` moves the unit back to `planned`. Ask the person again about the decisions in `reask` only, not the whole intake. Then run `<cmd> unit <key> prepared` (D6). |

The ledger records each revision that it re-planned from, and the report lists what each revision added.
