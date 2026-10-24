# WF-CAMPAIGN-SLICE-ORDER-PLAN — a shared file is not a wait

Status **BUILT 2026-10-21, not released.** W1–W8 built with their tests (W9 release open; the live run of a sorted wave 4 is open). Q1–Q6 answered by the PO 2026-10-21, each as recommended (section 11). W0 is dropped (Q2). · Date **2026-10-21** · Plugin **v9.195.0** · Owner **jayte**
Follows: [WF-CAMPAIGN-ORDER-PLAN.md](WF-CAMPAIGN-ORDER-PLAN.md) (the campaign owns the dependency graph, v9.188.0), [WF-CAMPAIGN-DRIVER-PLAN.md](WF-CAMPAIGN-DRIVER-PLAN.md) (the wave driver, v9.186.0), and the plan-order fixes of v9.194.0 (`planWaves`, sibling check, plan check). Origin: SoccerManager wave 4, 2026-10-21, and the PO rule R1: "A serial chain of slices is a negative. A shared file alone does not make one slice wait for another."

## 1. Why

Wave 4 of `brainstorm-realism-additions-20260922` started 12:56 UTC with three units: harness (H, 11 slices), player record (P, 7 slices), and team shape (T, 9 slices). The first implement started 15:33 UTC. The person stopped the wave at 16:30 UTC, with one slice built and none cleared.

| # | Problem | Cause | Evidence |
|---|---|---|---|
| F1 | The wave is almost serial: 138 waits, a 14-step critical path. A read of the plans finds about 6 real needs and a 6-step path | The cross-unit reconcile and each plan's `crossUnit` report have two kinds, `order` and `contract`. Every pair that is not `contract` becomes a derived needs entry | `campaign-wave.js:2195`, `:2241`; ledger: P 41 waits, T 97 waits, H 0 |
| F2 | A wait points the wrong way | `directPair` makes the later unit in packet order wait, whatever the data direction | `campaign-wave.js:2133`. P `first-touch-and-recovery` waits for H `league-fixtures-and-tables`, which needs P `generator-world-and-stars` |
| F3 | A removed wait comes back | The live driver holds its waits in memory (`W`). `needs remove` leaves no record, so the next launch's reconcile and `needs add` accept the same pair again | `scripts/campaign.mjs:1171`, `:1182`; `campaign-wave.js:3384` |
| F4 | A plan question opens hours after the plan stopped | A plan stop of the fan-out goes to `u.planStops`. It parks only when the walk reaches that slice, and the walk waits on F1's waits first | `campaign-wave.js:2519`, `:2819`. P's question (13:26) and H's B1 and B2 (14:38) were still unopened at 16:30. The person answered at 14:15 and 14:59 |
| F5 | The walk order disagrees with the plans | A plan reconcile wrote "live-change-split lands before phases-report-bands-and-docs" into the plans. No stage writes it into `03-slice.md`. The walk follows the roster | `w4-3/.../04-plan-phases-report-bands-and-docs.md:251` (A30); `campaign-wave.js:2640` |
| F6 | Wave 5 slices ran in wave 4 | An extension packet's unit takes its target's slug (`lib/campaign.mjs:62`). The brainstorm already ran the extension intake, so its slices sit in the target's roster. The wave 4 walk plans them | Units `open-data-sources` and `realism-team-shape-tactics-phases-ac7-live-timing` are wave 5. Their slices `open-data-real-targets`, `pff-tracking-converter`, and `live-change-split` have wave 4 plans, and P waits on two of them |
| F7 | The real needs that the person confirmed never became waits | P's `03-slice.md` "Cross-Unit Needs" lists three needs, "the person confirmed all three". `deps.units[*].needs` is `[]` for all three units. The slice doc says to record them through the brainstorm, which is the rule from before v9.188.0 | `w4-2/.../03-slice.md:74-80`; `_phases.md` Rolling prepare step 1.3 |
| F8 | A contract answer that adds a wait is lost | The 16:37 answer "two-formations-and-settle waits for four-positions-and-slots" resolved to `replan`. The resolver ran no `needs add`, so the wait is in no ledger and in no driver | `resolve:contract` agent-end `status: replan` (T driver journal line 58); no `by: person` derived need |
| F9 | Shared files inside one unit cost an hour of re-plans | The plan reconcile calls two slices overlapping when they list the same file. Six plans ran again (14:20–15:24) | `campaign-wave.js:1698-1701`; `revisions[].because` of each re-planned plan |

F1, F2, F7, and F8 together mean the wave waited on 138 pairs that it did not need, and it did not wait on the 3 pairs that it did need.

## 2. Review of the proposed hot-patch

The SoccerManager session wrote `.ai/patches/2026-10-21-addNeeds.md` (status "proposed, not applied"). The patch adds a filter at the top of `addNeeds`: with `OPT.realNeedsOnly`, an entry stays a wait only when `OPT.realNeeds` lists it, and every other entry goes to `focus`. The ledger steps remove the 138 entries and add 6 entries with `--by person`.

**Verdict: do not apply it as written.** The place is right: `addNeeds` is the one function that both the reconcile and a walk-time `crossUnit` report go through. The defects are below, most severe first.

| # | Defect | Effect in wave 4 |
|---|---|---|
| R1 | The match ignores `through`. `listed` compares `key`, `from`, and `before` only | Every `through` slice of the listed unit stays a wait. T `phases-report-bands-and-docs`, `block-from-the-ball`, and `transitions-and-keeper` keep 9 H waits each (27). T `two-formations-and-settle` keeps 4 P waits (`ability-and-weights`, `first-touch-and-recovery`, `key-moments`, `shot-models`), and none of them is the real one. The relaunch reconcile writes these entries back. A large part of the chain stays |
| R2 | The merge pairs go to `focus`, and nothing merges by `focus` | `focus` lives in driver memory and only the wave review reads it (`campaign-wave.js:3150`), under the label "pairs that a late needs entry named". The boundary merge reads only `merged-in` (`merge-order`, `scripts/campaign.mjs:857`). The patch record says that the boundary merge reads it, and it does not. The merge gets no notice of 25 bands to convert from version 5 to version 6, of the generated golden and fast-model files, or of `Team::anchor` |
| R3 | The relaunch still walks in the wrong order | `phases-report-bands-and-docs` reaches implement before `live-change-split` (F5). Its step 1 gate then stops it, and the unit parks |
| R4 | The extension slices stay in wave 4 | F6 is not addressed. Whether wave 4 builds `open-data-real-targets`, `pff-tracking-converter`, and `live-change-split` is a decision for the person, not a side effect |
| R5 | The plan questions still open late | F4 is not addressed. With fewer waits they open sooner, but they still open only when the walk reaches each slice |
| R6 | The patch lives on by hand | `realNeeds` is edited into the launch args by hand, and the next `stage-yolo-driver` overwrites the staged copy (it did, at 16:28). Rule R1 is in the ledger, but no driver prompt reads `rules` |

The patch record's list of six real needs is correct. It also recovers F7 and F8: it adds `two-formations-and-settle` after `four-positions-and-slots`, which no ledger holds today.

**If the person still wants an interim patch (Q2),** fix R1 and R4 before a relaunch:

1. Match on all four fields: `n.key === e.key && n.from === e.from && n.through === e.through && (n.before ?? null) === (e.before ?? null)`.
2. List each real need with its `through` slice, not only its unit.
3. Add `live-change-split` to the `depends-on` of `phases-report-bands-and-docs` in T's `03-slice.md`, in the worktree `w4-3`, and commit it on the unit branch.
4. Decide the extension slices (Q3) before the launch.
5. Record the open answers when their questions open: P Q1 "A+C", H B1, and H B2. The `pff-tracking-converter` plan question is not asked yet.
6. Clear the campaign stop request.

## 3. Decisions

| # | Decision | By |
|---|---|---|
| D1 | A cross-unit pair has one of three kinds. `need`: one slice uses a result of the other (code, data, a schema, a file format, a version, or a behaviour that the other slice makes or changes). `merge`: the two slices change the same file in places that do not depend on each other. `contract`: the change would change a `provides` or `expects` line. Only `need` makes a wait. The kind `order` is removed | PO rule R1 2026-10-21; Q1: an unsure pair is `merge` |
| D2 | A `need` names its direction: which slice builds on which. The direction comes from the evidence, never from packet order. `directPair` is deleted | recommendation |
| D3 | Each `need` carries one piece of evidence: a plan line or a `.yaml` edge, quoted with its path and line. A pair with no evidence is `merge` | recommendation |
| D4 | A `merge` pair goes into the ledger as a merge note of the wave (`waves[n].merge-notes`). The boundary merge and the wave review read the merge notes. `focus` keeps its one meaning: a late need | recommendation (W1: one term per concept) |
| D5 | A wait that the person or a resolver drops leaves a drop record. A later `needs add --by driver` of the same entry returns `dropped: true` and makes no wait. Only `--by person` brings it back | recommendation |
| D6 | The walk of a unit follows `depends-on`, in topological order, with roster order as the tie-break. Each order that a plan or a plan reconcile decides goes into `depends-on` in `03-slice.md`. Plan text alone never orders a walk | recommendation |
| D7 | A plan stop of the fan-out opens its question when the plan phase ends, not when the walk reaches the slice | recommendation |
| D8 | Each slice of a campaign roster names the unit that owns it. A walk runs only the slices of its own unit | recommendation; Q3: SoccerManager's two extension units are absorbed into wave 4 |
| D9 | A resolver records every wait that an answer gives, also when its action is `replan` | recommendation |
| D10 | The ledger `rules` reach the driver. The launch args carry them, and the reconcile, the classifier, and the plan prompts quote them | recommendation |
| D11 | Inside one unit, a shared file alone is not an overlap for the plan reconcile. An edge to the other slice, one migration sequence, one shared fixture, or one public API still is | recommendation; both drivers |

## 4. Design

### 4.1 Pair kinds and direction (F1, F2)

1. The cross-unit reconcile returns `pairs: [{ a, aSlice, b, bSlice, files, kind, needs, evidence }]`.
   - `kind` is `need`, `merge`, or `contract`.
   - For `need`, `needs` is `a` or `b`: the side that builds on the other.
   - For `need`, `evidence` is a quote of 25 words or fewer, with `path:line`, from a plan or `.yaml` of the side that builds on the other.
2. A plan agent's `crossUnit` item gets the same fields: `{ key, slice, files, kind, needs: 'this' | 'other', evidence }`.
3. The driver turns each `need` into a derived needs entry: the side named by `needs` waits, before its slice, for the other side through its slice. A `need` with no `evidence` becomes a `merge` pair, and the driver logs why.
4. A `contract` pair parks as today. The later unit is the side named by `needs`, or the later unit in packet order when `needs` is absent.
5. `needs add` refuses a cycle as today. A cycle among `need` pairs is a real conflict, and the `needs-cycle` park asks the person.

The prompt states rule R1 and the test for `need` in one sentence: "Would this slice's implement fail, or build the wrong thing, if the other slice's change were absent?" Each example of `merge` comes from wave 4: a new CLI subcommand, a CHANGELOG line, a docs row, a dependency line, a band row, a separate function in one source file, and a version number that the merge renumbers.

### 4.2 Merge notes (F1 follow-on, R2)

1. `needs add` takes `--kind merge`. It writes `{ a, aSlice, b, bSlice, files, why, at }` to `waves[n].merge-notes`, de-duplicated by `(a, aSlice, b, bSlice)`, and makes no wait.
2. `wave <n> launch` passes `mergeNotes` into the args. The boundary merge prompt lists them as "expected conflicts" with three rules:
   1. Regenerate a generated file once, after both sides merge. Do not merge its text.
   2. Renumber a version or a ledger file to the next free number.
   3. Convert a row or a record to the newer format of the other side.
3. The wave review reads the merge notes next to `focus`.
4. `renderLedgerMd` shows a count of merge notes for each wave.

### 4.3 Drop records (F3)

1. `needs <key> remove` writes `{ from, through, before, by, at, why }` to `units[key]['dropped-needs']`. It still removes the derived entry and its wait as today.
2. `needs <key> add` with `--by driver` (or no `--by`) returns `{ ok: true, dropped: true }` when a drop record matches by `sameNeed`. It makes no wait.
3. `needs <key> add --by person` removes the matching drop record and adds the wait.
4. The live driver learns of a change between launches through the waiter. `await` returns `needsChanged: [{ key, from, through, before, action }]` from the `derived-need` journal events after its start mark. The driver settles a removed wait as dropped and arms an added one. A person can then drop a wait while the run is live, with no stop.

### 4.4 Walk order (F5)

1. A new shared helper `walkOrder(slices)` returns the roster in topological order of `dependsOn`, with roster order as the tie-break. A cycle or a name outside the roster keeps roster order for the slices that are left. It sits in both drivers and in the parity list of `driver-parity.test.mjs`.
2. `walkUnitInner` and yolo's `driveRoster` walk `walkOrder(primary)`. The sweep keeps its own order.
3. A plan agent and a plan reconcile return `orderEdges: [{ slice, after, why }]` for each order they decide inside the unit. The fan-out clause and the reconcile clause say: "An order that you decide is an `orderEdges` entry. Text in the plan does not order the walk."
4. A new command `slice-order <slug> add --slice s --after t --why w` writes `t` into the `depends-on` of `s`, in the roster frontmatter of `03-slice.md` and in `03-slice-<s>.md`. It refuses a cycle, and it appends a line to `index-history.jsonl`. In a campaign it runs in the unit's worktree. The slice stage keeps its ownership of the roster. This command only adds an edge, as `extend` only adds slices.
5. The plan fan-out bookkeeping and the plan reconcile bookkeeping run the command for each `orderEdges` entry. Then the orient runs again, so `u.idx.slices` holds the new `dependsOn`.
6. `implementation-order` in the master `04-plan.md` becomes a copy of `walkOrder`, written by the same bookkeeping. No driver reads it.

### 4.5 Plan questions open early (F4)

1. After `planPhase` and the cross-unit reconcile, for each `u.planStops[slice]` with status `hard-stop`, the driver opens the question at once:
   - one bookkeeping agent runs `ask` with `stage: plan` and `slice`, and writes the journal `asked` event;
   - the unit stays `running`, and `unit stopped` is not run;
   - the question goes into `Q`, and the waiter starts.
2. When the walk reaches the slice, it awaits that question's promise. An answer that came earlier is ready at once.
3. While a plan question of slice S is open, the walk skips S and each slice that depends on S, and walks the next slice in `walkOrder`. It comes back to S when the answer arrives (Q4).

### 4.6 Extension slices (F6)

1. A roster entry gets `unit: <campaign key>` when an intake from a packet writes it. `intake/extend` writes the packet's key. The slice stage of a campaign unit writes its own key.
2. The orient returns `unit` for each slice. `walkUnitInner` drops each slice whose `unit` is set and is not `u.key`. The log names each dropped slice and its unit.
3. `unitProgress`, `throughCovers`, `clearedCover`, and `sliceCycle` use the slices of the unit only. `slice-done --final` marks the unit finished when all of its own slices clear.
4. The plan fan-out and the cross-unit reconcile read only the plans of the unit's own slices.
5. `wave <n> start` refuses an extension unit whose target is in a later wave or in no wave. It names the fix: run `replan`, so that the extension follows its target.

### 4.7 Needs from the slice stage (F7)

1. `wave <n> start` reads each unit's `03-slice.md` for a section whose heading starts with "Cross-Unit Needs". For each item that names a unit of the wave and has no matching `deps` need, it refuses the start and lists the items. The fix is `deps <key> needs add --by prepare` (Rolling prepare step 1.3), then `replan`.
2. The slice stage's text for a campaign unit names `deps <key> needs add`, not the brainstorm.

### 4.8 Resolver waits (F8)

1. The resolve prompt says: "Record every wait that the answer gives with `needs add --by person`, also when your action is `replan`."
2. `applyResolve` adds a wait only from a `needs add` result, so the driver and the ledger hold the same waits.
3. `_drive.md` "Resume actions", part `contract`: the answer "keep the contract and wait" is `continue` plus a `needs add`, not `replan`.

### 4.9 Shared files inside one unit (F9)

The plan reconcile of both drivers drops "when they list the same file" from its overlap test. It keeps: an edge of one names the other slice or a file that the other slice creates, one migration sequence, one shared fixture, and one public API. A shared file with none of these is no overlap. `overlappingSlices` does not change, so the parity list does not change.

### 4.10 Prose budget

`_drive.md` is at its 300-line cap. Move the sections "Derived needs", "Cross-unit reconcile", and "Wait agent" into a new sub-procedure, `campaign/_order.md` (its own 300-line cap), and leave one line in `_drive.md` that points to it. `campaign-wave-docs.test.mjs` and `campaign-deps-docs.test.mjs` then check the headings in `_order.md`. yolo.md does not grow: the yolo change is code (`walkOrder`) and one sentence in a shared reference.

## 5. Migration

### 5.1 The ledgers on this machine (survey of 2026-10-21)

| Ledger | Waves | Waits | Extensions | Effect of the release |
|---|---|---|---|---|
| Lantern `brainstorm-android-claude-monitor-widget-20261018` | 1 shipped, 2–5 planned | none | none | New keys only. The next launch uses the new kinds |
| Secbot `brainstorm-own-dots-pi-durable-celld-20261002` | 1–2 shipped, 3–6 planned (wave 3 prepared) | none | none | Same |
| Trails `ideate-sources-20261018` | 1 shipped, 2–7 planned | none | none | Same |
| SoccerManager `brainstorm-realism-additions-20260922` | 1–3 shipped, 4 running (stopped by request), 5–34 planned | 138 derived, all `cross-unit`, all `open`, on wave 4 | 2, both wave 5, targets in wave 4 | Section 5.3 |

All four ledgers have `version: 1`. No ledger has `focus`. Nothing reads `version` today.

### 5.2 The ledger upgrade

1. `LEDGER_VERSION` becomes 2. `loadLedger` runs `migrateOrder` on a ledger below version 2, then sets `version: 2`. `migrateOrder` is idempotent:
   - Each derived needs entry and wait with `source` `cross-unit` or `plan:<slice>` and no `kind` gets `kind: 'legacy'`. It stays a wait.
   - `dropped-needs` and `merge-notes` start absent. Each reader treats an absent key as empty.
   - Each roster slice gets no `unit` from the ledger. Section 5.4 sets it.
2. A wave whose units hold `legacy` waits that are not `met` gets `legacy-order: true`.
3. The new keys are optional in `tests/frontmatter.schema.json`. A ledger of version 1 and a ledger of version 2 both pass.

### 5.3 A started wave with legacy waits

The release must not drop a wait without the person. A legacy wait can hide a real need.

1. On `wave <n> launch` of a wave with `legacy-order: true`, the launch prints `next: sort-waits` and no args.
2. The session runs the classifier of 4.1 over the legacy entries as one read-only agent. It returns each entry as `need` with evidence, or as `merge`. It also returns each "Cross-Unit Needs" item of the unit slice docs that no entry or graph need covers (F7), and each order statement in a plan that `depends-on` does not hold (F5).
3. The session asks the person one question with the result: the waits it keeps, the waits it drops, the needs it adds, and the order edges it adds. The person confirms or changes the list.
4. The session applies the answer:
   - `needs <key> remove --by person` for each dropped wait (drop records);
   - `needs <key> add --kind merge` for each dropped pair (merge notes);
   - `needs <key> add --by person` for each added need;
   - `slice-order <slug> add` for each order edge, in the unit's worktree.
5. `wave <n> sorted` clears `legacy-order`. The launch then prints the args.

A wave of version 1 that is running under the old driver while the release lands keeps its staged driver. The new driver applies at the next launch, because `stage-yolo-driver` copies it then. `wave <n> record` accepts an outcome with no `mergeNotes` field.

### 5.4 Extension slices in a started wave

1. `migrateOrder` finds each unit with `form: extension` whose target unit is in an earlier wave that is running or stopped.
2. In the target's roster, the candidate slices are the entries with `source: extension`. When one extension unit targets the slug, every such entry with no `unit` belongs to it. When two or more do, the `extension-round` order matches the extension units in packet order. When the counts differ, the launch asks the person.
3. The launch of the target's wave then asks one question for each such extension unit (Q3):
   - **absorb:** the extension unit joins the target's wave. Its slices run there, and the wave entry of its own wave goes. `unit <ext> absorb --into <target>` records it;
   - **defer:** its slices get `unit: <ext key>`, the target's walk skips them, and their wave 4 plans stay on disk for the later wave.

### 5.5 SoccerManager wave 4, step by step

1. Release the change (waves W1–W9 of section 7).
2. Run `/wf campaign brainstorm-realism-additions-20260922`. `status` reports `next: sort-waits` for wave 4.
3. Sort the 138 waits (5.3). The expected result is the six real needs of the patch record, with their `through` slices, plus `live-change-split` before `phases-report-bands-and-docs`.
4. Answer the two extension questions (5.4) with "absorb" (Q3).
5. Clear the stop request, and launch. The plan questions P Q1, H B1, H B2, and the `pff-tracking-converter` question open when the plan phase ends (4.5). The session records the answers that the person already gave.
6. Mark `.ai/patches/2026-10-21-addNeeds.md` superseded by this release.

## 6. Files

| File | Change |
|---|---|
| `lib/campaign.mjs` | `LEDGER_VERSION` 2, `migrateOrder`, drop records in `sameNeed` lookups, unit-scoped `sliceCycle` and `clearedCover`, `merge-notes` in `renderLedgerMd`, the extension wave check in `checkCampaignSet` |
| `scripts/campaign.mjs` | `needs add --kind`, drop records, `dropped: true`; `slice-order`; `await` returns `needsChanged`; `launch` passes `mergeNotes` and `rules`, prints `next: sort-waits`; `wave <n> sorted`; `unit <ext> absorb`; `wave start` checks "Cross-Unit Needs"; unit-scoped `unitProgress` |
| `skills/wf/workflows/campaign-wave.js` | Pair kinds, `needs`, evidence; `directPair` deleted; `walkOrder`; `orderEdges` bookkeeping; early plan questions; unit filter of the roster; `needsChanged`; resolver waits; merge notes to the boundary merge |
| `skills/wf/workflows/yolo.js` | `walkOrder`, `orderEdges` bookkeeping, the reconcile overlap test |
| `skills/wf/reference/campaign/_order.md` | New: derived needs, pair kinds, the cross-unit reconcile, the wait agent, merge notes, sort-waits |
| `skills/wf/reference/campaign/_drive.md` | The three sections move to `_order.md`; "Resume actions" `contract` |
| `skills/wf/reference/campaign/_boundary.md` | "Merge" reads the merge notes |
| `skills/wf/reference/campaign/_phases.md`, `campaign.md` | `sort-waits`, `absorb`, the "Cross-Unit Needs" check |
| `skills/wf/reference/plan.md` | `orderEdges`; `crossUnit` kinds and evidence |
| `skills/wf/reference/slice.md`, `intake/extend.md`, `intake/extend/_artifacts.md` | `unit` on a roster entry; the needs rule for a campaign unit |
| `tests/frontmatter.schema.json` | Ledger version 2 keys; roster `unit` |
| `dist/` | Rebuild in the same commit |
| `docs/site/guides/autonomous-drivers.html`, `docs/site/reference/commands.html` | Pair kinds, `slice-order`, `sort-waits` |

## 7. Waves of work

| Wave | Content | Gate |
|---|---|---|
| W0 | Dropped (Q2): no interim patch. SoccerManager wave 4 stays stopped until the release | — |
| W1 | Ledger version 2 and `migrateOrder`; `needs add --kind merge`, drop records, `dropped: true`. No driver change | Existing campaign tests pass; migration tests on copies of the four surveyed ledgers |
| W2 | Pair kinds, direction, evidence, and rules in the driver; merge notes to the boundary merge and the wave review; `_order.md` | `campaign-wave.test.mjs`: a `merge` pair makes no wait, a `need` makes one in the evidence direction |
| W3 | `sort-waits` for a started wave with legacy waits | CLI test on a copy of the SoccerManager ledger |
| W4 | `walkOrder` in both drivers; `orderEdges`; `slice-order` | Parity test; a walk follows an added edge |
| W5 | Early plan questions; the skip-ahead walk (Q4) | A plan stop opens its question before the first implement |
| W6 | Extension slice ownership, `absorb`, the extension wave check | A target walk skips a deferred extension slice |
| W7 | Resolver waits; the "Cross-Unit Needs" check at `wave start` | A `replan` answer that names a wait writes it |
| W8 | The reconcile overlap test inside one unit, both drivers | Prompt text test |
| W9 | Doc site, CHANGELOG, one release | All gates |
| W10 | Live run: SoccerManager wave 4 by section 5.5 | Not a gate |

W1 lands before W2: the driver of W2 writes keys that W1 defines. W3 needs W1 and W2. W4–W8 are independent of each other after W2.

## 8. Tests

- `tests/unit/lib/campaign.test.mjs`:
  - `migrateOrder` on a ledger with no waits changes only `version`;
  - `migrateOrder` marks each cross-unit wait `legacy` and sets `legacy-order` on its wave;
  - `migrateOrder` runs twice with the same result;
  - `sliceCycle` with unit-scoped rosters finds no false cycle through an extension slice.
- `tests/unit/campaign-wave-cli.test.mjs`:
  - `needs add --kind merge` writes a merge note and no wait;
  - `needs remove` writes a drop record, and a later `needs add --by driver` returns `dropped: true`;
  - `needs add --by person` clears the drop record;
  - `launch` of a `legacy-order` wave prints `next: sort-waits`;
  - `slice-order` writes `depends-on` in both files and refuses a cycle;
  - `wave start` refuses an unrecorded "Cross-Unit Needs" item;
  - `await` returns `needsChanged`.
- `tests/unit/skills/campaign-wave.test.mjs`:
  - a reconcile `merge` pair makes no wait;
  - a `need` pair with `needs: 'a'` makes `a` wait, also when `a` is earlier in packet order;
  - a `need` with no evidence becomes a merge note;
  - a fan-out plan stop opens its question before the walk;
  - the walk follows `walkOrder`;
  - a slice of another unit is not walked;
  - a resolver `replan` with an added wait holds the wait.
- `tests/unit/skills/driver-parity.test.mjs`: `walkOrder` in the shared list.
- Prose budget: `_drive.md` at or under 300 lines; `_order.md` under its cap.
- Fixtures: copies of the Lantern, Secbot, Trails, and SoccerManager ledgers (version 1), each with its rosters reduced to the fields the tests read.

## 9. Risks

| Risk | Answer |
|---|---|
| The classifier calls a real need `merge`, and a slice builds against old code | The plan check before implement (v9.194.0) and the verify stage find the missing interface. A walk-time `crossUnit` report can still add a `need`. The merge note tells the boundary merge where to look |
| More conflicts at the boundary merge | The merge notes name each one and give the rules for generated files, versions, and formats. A conflict that needs a product decision parks as today |
| `slice-order` writes a file that the slice stage owns | It only adds an edge, refuses a cycle, and logs to the index history. The person can undo it with `/wf slice` |
| The early plan question asks about a slice whose dependency is not planned | The fan-out already moves such a slice to its walk (`notClean`). Only a plan that ran and stopped opens early |
| The legacy sort asks one long question | The question lists the kept waits first. The dropped waits are counted by file group, with the full list in the answer file |
| An old staged driver meets a version 2 ledger | `launch` of a version 2 ledger checks the staged driver's version and re-stages it when it is older |

## 10. What this plan does not change

The limits that remain after this plan (the unit graph, the wave barrier, the slots, and slicing as a campaign job) are in [WF-CAMPAIGN-THROUGHPUT-PLAN.md](WF-CAMPAIGN-THROUGHPUT-PLAN.md).


- The deps phase and the graph between units (`deps`), except the check of 4.7.
- The wave plan: which units share a wave.
- The heavy slots and the width.
- `merge-order` at the boundary.

## 11. Questions

All six are answered by the PO, 2026-10-21. Each answer is the recommendation in the third column.

| # | Question | Answer |
|---|---|---|
| Q1 | When the classifier is unsure whether a pair is `need` or `merge`, which kind does it use? | `merge`, per rule R1. The plan check and verify catch a miss, and a serial chain is the larger cost |
| Q2 | Does SoccerManager wave 4 wait for this release, or run first with a corrected interim patch (W0)? | Wait. The wave is stopped with one slice built. The release fixes F4–F8 as well, and wave 4 becomes the live test of the migration (W10) |
| Q3 | The two wave 5 extension units: absorb them into wave 4, or defer their slices to wave 5? | Absorb. Their wave 4 plans exist, the harness plan already orders them, and `live-change-split` changes the AC-7 of a wave 4 slice |
| Q4 | May a walk skip a slice whose plan question is open and walk a later independent slice? | Yes. It removes most of the cost of a slow answer, and `walkOrder` already knows which slices are independent |
| Q5 | May the driver add `depends-on` edges to `03-slice.md` (`slice-order`), or must each edge go to the person? | The driver adds them. Each edge comes from a plan the person can read, and it never removes an edge |
| Q6 | Does the yolo driver get `walkOrder` and the overlap fix in the same release? | Yes. Both drivers walk in roster order and both have the plan reconcile, so both have F5 and F9 |
