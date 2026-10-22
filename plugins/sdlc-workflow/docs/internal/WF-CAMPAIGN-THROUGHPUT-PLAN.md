# WF-CAMPAIGN-THROUGHPUT-PLAN — waits, delays, and parallelism after the slice-order fix

Status **BUILT, not committed (2026-10-21):** P1 (T4, T5, T7, T10, T12), P2 (T1, the wave slicer with T8 and T11, `schedule`, T3), P3 (T9, T13), and P4 step 1 (T2, ask at wave-ready). T15 keeps planning up front: no change. NOT built: T2 step 2 and T14 (rolling admission, not decided), T6 (lanes, only if needed), and the fresh usage reading of T9. TQ1–TQ7 answered by the PO 2026-10-21 (section 8): each as recommended, except TQ3, where the campaign asks before it starts a wave. · Date **2026-10-21** · Plugin **v9.195.0** · Owner **jayte**
Follows: [WF-CAMPAIGN-SLICE-ORDER-PLAN.md](WF-CAMPAIGN-SLICE-ORDER-PLAN.md) (F1–F9: a shared file is not a wait). That plan removes the false waits between slices. This document finds what still limits a campaign after it, and how the campaign can slice work for parallelism. Origin: the PO, 2026-10-21: "think through all issues that could still cause unnecessary waits, delays", with the example "whether slicing of all units should be a campaign job".

## 1. Where the time goes

All numbers are from the SoccerManager campaign `brainstorm-realism-additions-20260922` (64 build units, 34 waves).

**Stage time.** The figures are from the driver journals of the six wave 3 and wave 4 slugs. These journals also hold their earlier yolo runs:

| Stage | Agents | Total hours | Median minutes | Share |
|---|---|---|---|---|
| implement | 491 | 973 | 76 | 68 % |
| verify | 383 | 326 | 30 | 23 % |
| plan | 414 | 87 | 12 | 6 % |
| review | 33 | 48 | 76 | 3 % |
| all bookkeeping agents | — | under 11 | 0–1 | under 1 % |

Implement and verify are 91 % of the stage time. Both run in a heavy slot.

**Wave time.**

| Wave | Drive | Boundary (merge to wave-ready) | Wave-ready to PR merged | Gap to the next wave start |
|---|---|---|---|---|
| 2 | about 43 h (10-06 14:05 to 10-08 09:19) | 0.5–1.4 h | about 11 h | 15 h |
| 3 | 9.5 h (relaunch 10-19 22:24 to 10-20 06:50) | 7.5 h, with 2 red wave verifies | about 6 h | 17 h |
| 4 | stopped at 3.5 h; 2 h 37 min of plan phase before the first implement | — | — | — |

**The graphs.**
- The unit graph has 158 `depends-on` edges. 146 of them have no code evidence: 97 copy the brainstorm board's order, 39 are the serial default (D5 of WF-CAMPAIGN-ORDER-PLAN), and 10 come from old packets. Only 12 cite code, a packet title, or a target slug.
- The longest unit chain is 34, which equals the number of waves. 17 waves hold one unit.
- In wave 4, the slice graph had 138 waits and a 14-step path, and the real path was about 6 steps (slice-order plan, F1).

**The throughput model.** The time of a campaign is the sum, over its waves, of the drive, the boundary, the PR, and the gap. Inside a wave, the drive is bounded by the larger of two numbers:
- **the critical path:** the longest unit walk plus its waits. Each unit has one worktree, so its slices run one at a time;
- **the slot bound:** the heavy-slot minutes of all slices divided by the width.

For wave 4 with only real needs:
- **critical path:** about 11 slices × (12 + 76 + 30) min ≈ 22 h, set by the harness unit;
- **slot bound:** 27 slices × about 106 min / width 2 ≈ 24 h.

So after the slice-order plan, wave 4 is bound by both. A wider slot only helps when the long unit gets shorter, and a shorter unit only helps when the slots get wider.

## 2. Issues that still cost time

T1–T15 below are the issues that remain after F1–F9 are fixed. The gain is an estimate for the SoccerManager campaign.

| # | Issue | Cause and evidence | Proposal | Gain | Cost |
|---|---|---|---|---|---|
| T1 | **The unit graph is a serial chain** | 146 of 158 unit edges have no code evidence (section 1). The deps scout copies the board's `depends-on` and its why-here notes. With no evidence, D5 makes the serial chain. The chain sets the wave count: 34 | Apply rule R1 to units. The deps scout classifies each unit edge as `need` (a code, data, or contract use, with evidence) or `sequence` (a preference of the person, such as "less urgent", or a why-here note with no named use). Only a `need` orders waves. A `sequence` edge sets the priority when the slots are full. The person confirms the reclassification once | Largest. The wave count falls to the length of the real need chain. That length is unknown until a re-scout | Medium |
| T2 | **A wave is a barrier** | Stacked wave PRs exist (Stage D2): with `stack.enabled`, wave n+1 may start on wave n's branch while wave n waits in handoff or ship, up to `max-unshipped` (`scripts/campaign.mjs:1585-1589`). SoccerManager has them on (`max-unshipped` 2). Two waits remain. (a) A wave cannot start while the wave below is `running` or in its `boundary` (`:1584`), so wave n+1 waits for wave n's slowest unit. (b) Nothing starts wave n+1 when wave n becomes ready: the person must come back. Waves 3 and 4: wave 3 shipped 10-20 20:09, and wave 4 started 10-21 12:54, when the session ran again | Step 1, ask at `wave-ready` (TQ3): at `wave-ready` of wave n, when every unit of wave n+1 is prepared, the campaign session asks the person at once, with a push notification, "Start wave n+1 on wave n's branch now?". On yes, it starts the wave in the same session. It never starts a wave without that yes. Step 2, rolling admission (not decided): a unit starts when every unit that it `need`s is merged into the integration branch. The wave becomes a release batch, not a scheduling unit | Step 1: the gap between sessions (15–17 h in waves 2–4). Step 2: also removes the wait for the slowest sibling | Step 1 small, step 2 large |
| T3 | **Prepare is the person's queue** | Rolling prepare runs one wave ahead, and each unit needs the person for intake, shape, slice, and design. A unit that is not prepared moves to a later wave. Gaps of 15–17 h between waves | Prepare as far ahead as admission needs: every unit whose needs are in the running or the next batch. Draft intake, shape, and slice for all of them in one pass, and ask the person in one sitting, grouped by unit | The gap between waves | Medium |
| T4 | **The plan phase is a barrier** | No implement starts until every unit planned every slice and the cross-unit reconcile ran. Wave 4: 2 h 37 min with the heavy slots idle | A unit starts its walk when its own fan-out and plan reconcile finish. The cross-unit reconcile runs once for each unit as its plans finish, against the plans that exist then. A later plan reports a shared file through `crossUnit` (the walk-time path exists). After F1, most pairs are `merge`, so an early start is safe. A late `need` takes the `late` path of `needs add` | 1–2 h per wave | Small |
| T5 | **A contract park stops the whole unit** | A contract pair parks the later unit before its first slice (`startParks`), even when the contract is about its last slice. Wave 4: the park at 15:33 was about `phases-report-bands-and-docs`, the last T slice, and it held all of T | Park before the slice that the contract names. The earlier slices walk. The same applies to a `needs-cycle` park | The person's answer time, on that unit | Small |
| T6 | **A long unit sets the tail** | One worktree per unit, so one slice at a time. H has 11 slices, P 7, T 9. At the tail, one slot is idle | First, balance at slicing (section 3). Later, if needed, lanes: two independent, file-disjoint slices of one unit run in two worktrees of the same slug | Up to the difference between the longest and the next unit | Slicing: in section 3. Lanes: large |
| T7 | **A wait waits for the whole slice** | A need waits until the needed slice clears: plan, implement, verify, review, and `slice-done`. The consumer needs the verified code, not the review. Review median: 76 min | A need waits for `verify` by default. A review finding that changes a provided interface after the merge-in arms the wait again, and the consumer merges the fix in | About 1 h for each need on the critical path | Small |
| T8 | **Slicing does not see other units** | Each unit is sliced alone in rolling prepare. Cross-unit needs are found by hand after slicing (and lost, F7). Shared files are found after planning | A wave slicing pass (section 3) | See section 3 | Medium |
| T9 | **One slot class for two kinds of load** | Implement uses tokens, and verify uses the machine: tests, builds, and SoccerManager's heavy-suite lock (one `calibrate` run took 90 min). The driver does not see the project's lock. The usage reading was from 4 October, so the budget guard could not set the width | Two slot classes: `token` (implement, review, merge) and `machine` (verify, wave verify), each with its own width. The project declares its locks in the campaign setup, and the driver queues a verify behind a held lock instead of starting it. The width follows a fresh usage reading | 10–30 % when both kinds of load are high | Medium |
| T10 | **Three reviews** | Per-slice review, then the wave review on the merged diff. A slug-wide review adds a third for some units | In a campaign, the default review scope is `slug-wide`: one review for each unit, then the wave review. Wave 3's team-shape unit already ran this way | About 1 h of heavy time for each slice | Small |
| T11 | **Questions are found late** | Wave 4's plan fan-out stopped on 4 intent-bearing decisions. The person can answer only when a question exists | A question sweep at prepare: the wave slicing pass also lists the intent-bearing choices that the plans will meet, and asks them before the wave starts. Early question opening and skip-ahead (slice-order plan, 4.5) cover the rest | Hours for each question on the critical path | Part of section 3 |
| T12 | **Hotspot files cost merge time** | Generated files (golden, fast-model, band ledgers), version numbers, CHANGELOG, and the band registry change in many slices. They tempt false waits, and they make the boundary merge long | Campaign conventions, set at the campaign setup and quoted in the plan and implement prompts: a generated file is regenerated only at the boundary; a version number moves only at the boundary; a CHANGELOG entry goes into a fragment file; a registry gets one row for each slice | Fewer conflicts after F1 makes more pairs `merge` | Small |
| T13 | **The boundary is serial and finds faults late** | Merge, wave verify (red twice in wave 3, 6 h), revert search, wave review, then as-built notes and a refuter for each unit, one at a time | A trial merge during the drive: when a unit finishes, merge it with the finished units into a scratch branch and run the wave verify there, while the other units walk. Run the as-built notes and the refuters of all units at once | 2–6 h for each wave | Medium |
| T14 | **A finished unit waits** | A unit that finishes early holds its code until the wave ends | Stacked waves and rolling admission (T2) | In T2 | In T2 |
| T15 | **Plans go stale** | All slices plan up front, so later plans need refresh, sibling checks, and plan checks (6 re-plans in wave 4) | Keep planning up front: plans are 6 % of stage time, and the cross-unit view needs them. F9 removes most refreshes. Do not move to just-in-time planning | — | — |

## 3. Should slicing be a campaign job?

**What happens today.** `/wf slice <slug>` runs for each unit in rolling prepare (`_phases.md` step 1.3), with the person. Each slice stage sees only its own unit. After slicing, the session asks for cross-unit needs by hand. Shared files appear only after the plans. The order of slices in a roster follows the logic of that unit, not the needs of the other units.

In wave 4, three slice orders cost time:
- P sliced `four-positions-and-slots` first. That was luck: T needs it.
- H sliced `world-database` sixth, but P's generator needs it.
- H has 11 slices, and the next-longest unit has 9. Two of H's slices (`open-data-real-targets`, `pff-tracking-converter`) need only H slices 1, 2, and 8, so they could run in a second lane or a second unit.

**The options.**

| Option | What it does | Verdict |
|---|---|---|
| A. Slice the whole campaign up front | One pass slices all 64 units before wave 1 | Rejected. A later unit's code does not exist yet, its shape is not written, the slices go stale, and the person must review all 64 rosters at once |
| B. Slice each wave (or admission batch) together | When a batch is prepared, after each unit's shape, one read-only wave slicer reads all shapes, the deps, the as-built notes, and the code. It proposes the rosters of all units of the batch together. Then `/wf slice <slug>` runs for each unit with that proposal as input, and the person confirms each roster as today | Recommended |
| C. Lanes not bound to slugs | The campaign cuts slices across slugs and gives them to worktree lanes | Rejected for now. The workflow artifacts, the review, and the as-built notes are per slug |

**What the wave slicer does (option B).**

1. **Provider first.** A slice that another unit needs comes early in its roster, and stays small.
2. **Shared foundations.** A change that slices of two or more units need (for example the version 6 band format) becomes one early slice of one unit, with an explicit `need` from each consumer.
3. **Hotspots.** It names the hotspot files and applies the campaign conventions of T12 to them.
4. **Balance.** No unit's roster is much longer than the others. A unit on the critical path is split, either into two units or by moving independent slices to a second lane (T6).
5. **Needs with evidence.** It writes each cross-unit need with its evidence, recorded with `deps <key> needs add` before the wave starts. This is the path that F7 lost.
6. **Predicted files.** It lists the files of each slice, so the cross-unit reconcile checks a prediction instead of finding pairs from nothing.
7. **Question sweep.** It lists the intent-bearing choices that the plans will meet (T11).
8. **Schedule simulation.** Before `wave start`, `campaign.mjs schedule <n>` prints the critical path, the slot bound at the chosen width, and the idle slot-hours. It uses the stage medians of section 1 and the slice sizes, with no agent. The person then sees whether a wider slot or a split unit helps.

**The cost.** One read-only agent for each batch, and one schedule command. The person still confirms each roster, and it arrives as a proposal instead of a blank page.

## 4. What stays as it is

- The deps phase still owns the unit graph. T1 changes how it classifies an edge, not who owns it.
- The person confirms every graph change, every roster, and every reclassification.
- Plans run up front (T15).
- The wave review still reviews the merged diff.

## 5. Order of work

| Phase | Content | Depends on |
|---|---|---|
| P0 | WF-CAMPAIGN-SLICE-ORDER-PLAN W1–W9 | — |
| P1 (small) | T5 (park before the named slice), T7 (wait for verify), T10 (slug-wide review in a campaign), T4 (walk before the cross-unit reconcile), T12 (conventions in the setup) | P0 W2 |
| P2 (medium) | T1 (unit need or sequence, re-scout of the planned waves), section 3 (the wave slicer and `schedule`), T3 (deeper prepare) | P0 |
| P3 (medium) | T13 (trial merge during the drive), T9 (two slot classes and project locks) | P1 |
| P4 | T2 step 1 (ask at `wave-ready`, small). T2 step 2 (rolling admission, large) only after the PO decides it | Step 1: P0. Step 2: P2 |
| P5 (large, only if P2 balance is not enough) | T6 lanes | P4 |

For SoccerManager, P2's re-scout touches only the waves that have not started (5–34). Wave 4 runs by the slice-order plan section 5.5.

## 6. Migration

- **T1:** a ledger keeps each unit edge, and `migrateOrder` (slice-order plan 5.2) marks an edge with no evidence `kind: 'legacy'`. The next deps phase proposes the reclassification for the units of waves that have not started, and the person confirms it. A started wave keeps its edges.
- **T2:** step 1 uses the stack of Stage D2 as it is. A ledger with `stack.enabled: false` keeps today's order: the next wave starts after the previous wave merged.
- **T9:** with no lock declared, the `machine` class gets the old width, so a project with no setup change sees no change.
- **T10:** the review scope applies to units prepared after the release. A prepared unit keeps its `review-scope`.
- Lantern, Secbot, and Trails have no started wave with waits. They get T1's reclassification at their next deps phase.

## 7. Risks

| Risk | Answer |
|---|---|
| T1 drops a unit edge that was a real need the code does not show | The person confirms each drop. The cross-unit reconcile and the walk-time `crossUnit` reports still find a slice-level need |
| An auto-started wave runs on a lower wave that your PR review then changes | `_gh-stack.md` "A change on a lower wave" applies: the upper wave takes the change at its next boundary. `max-unshipped` still caps the waves that wait above `main` |
| The wave slicer's proposal anchors the person on a bad cut | It gives its reason for each cut and the schedule numbers. The person edits the roster as today |
| Waiting for verify instead of review lets a reviewed change reach a consumer late | The wait arms again on a provided-interface change (T7) |
| Two slot classes run more agents at once | Each class has its own width, and the budget guard still applies to the token class |

## 8. Questions

The PO answered all seven on 2026-10-21. TQ1, TQ2, and TQ4–TQ7 take the recommendation in the third column. TQ3's answer is in its row.

| # | Question | Recommendation |
|---|---|---|
| TQ1 | Does rule R1 apply to units: a `sequence` edge orders priority, not waves? | Yes. It is the largest gain, and the person confirms each reclassification |
| TQ2 | Is slicing a campaign job, as the wave slicer of option B (one batch at a time, the person confirms each roster)? | Yes, option B |
| TQ3 | Stacked wave PRs exist. Does the campaign start the next wave by itself at `wave-ready` when its units are prepared (step 1), and is rolling admission (step 2) built later, or now? | **PO answer 2026-10-21: "ask before starting".** At `wave-ready`, the campaign asks the person at once whether to start the next wave, and starts it only on a yes. Rolling admission is not decided |
| TQ4 | Does a need wait for the needed slice's verify, not its review? | Yes |
| TQ5 | In a campaign, is the default review scope `slug-wide`? | Yes. The wave review still reviews the merged diff |
| TQ6 | Do the campaign conventions of T12 (generated files and versions only at the boundary) become a setup question? | Yes, with the default "on" |
| TQ7 | Does P1 ship in the same release as the slice-order plan? | Yes. Each P1 item is small and touches the same functions |
