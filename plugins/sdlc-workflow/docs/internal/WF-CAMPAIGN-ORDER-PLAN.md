# WF-CAMPAIGN-ORDER-PLAN — the campaign owns the dependency graph

Status **SHIPPED v9.188.0 (`f667337f`, 2026-10-17): W1–W6 built. W7 live run open.** Q1–Q4 answered 2026-10-17 (section 9). · Date **2026-10-17** · Plugin **v9.187.0** · Owner **jayte**
Follows: [WF-CAMPAIGN-DRIVER-PLAN.md](WF-CAMPAIGN-DRIVER-PLAN.md) (the wave driver, v9.186.0), [WF-CAMPAIGN-RUN-FIXES-PLAN.md](WF-CAMPAIGN-RUN-FIXES-PLAN.md) (N1 `needs`), [BRAINSTORM-WORK-PACKETS-PLAN.md](BRAINSTORM-WORK-PACKETS-PLAN.md) (the packets), [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md) (the campaign). Origin: the PO's review of who sets the order, 2026-10-17.

## 1. Why

A brainstorm is for thinking. Today it also agrees a dependency graph for the campaign: `depends-on`, `needs`, `provides`, and `expects` for each piece of work (`intake/brainstorm/_work.md`, "What 3.3 agrees for each piece"). The person does not always run a campaign. For a work set of several slugs, the person can run a default intake for each packet, one after the other. The graph is then not used, except for one "start anyway?" question in `intake/_packet.md` Step 1.3.

| Problem | Cause | Evidence |
|---|---|---|
| The brainstorm and the campaign plan different waves | Two planners. `computeWaves` in `lib/work-packets.mjs` does not read `needs`, and it lets two pieces that touch one slug share a wave. `planWaves` in `lib/campaign.mjs` applies both rules | `lib/work-packets.mjs:157`, `lib/campaign.mjs:181` |
| Some errors appear only after the person leaves the brainstorm | Two checkers. A cycle through `needs`, a need on a packet that touches the same slug, and a need on a packet that is not a build packet fail only at `orient`. `_phases.md` then sends the person back to `/wf brainstorm <slug>` | `checkWorkSet` against `checkCampaignSet` (`lib/campaign.mjs:131`) |
| The graph is set before anyone reads the code | The brainstorm agrees the graph from the talk. The campaign finds the files that two units share only after their plans exist (the cross-unit reconcile) | `campaign/_drive.md`, "Cross-unit reconcile" |
| Each change to the graph goes back through the brainstorm | The brainstorm owns the packets. A contract change found in shape, a `needs` entry found in slice, and a derived needs entry of a wave outcome each go through `/wf brainstorm <slug> add`, then `replan` | `campaign/_phases.md`, "Rolling prepare" steps 2 and 3, and "Reopen pick-up", last row |
| `order` has no clear meaning | The person agrees an `order`, and each packet says "Order: N". Packets in one wave run in parallel, so `order` only breaks ties. No check stops an `order` that puts a piece before a piece it depends on | `lib/campaign.mjs:84`, `byOrder` |

This plan moves the dependency graph into the campaign. The brainstorm keeps one strict sequence of its pieces. The campaign reads the packets and the code, proposes the graph, and the person confirms it. The graph lives in the campaign ledger.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | The brainstorm thinks and writes packets. It agrees one strict sequence of its pieces (`order` 1, 2, 3, and so on) and a `why-here` note for each piece after the first (Q3). It no longer agrees `depends-on`, `needs`, `provides`, or `expects`. | PO 2026-10-17 |
| D2 | The sequence is the safe serial order: piece N may use anything that pieces 1 to N−1 built. The serial path (one default intake after another) follows it with no campaign. | PO 2026-10-17 |
| D3 | The campaign owns the dependency graph: `depends-on`, `needs`, `provides`, and `expects` of each unit. The graph lives in the ledger, under `deps`. The campaign never writes the graph into a packet. | PO 2026-10-17 |
| D4 | One checker and one planner: `checkCampaignSet` and `planWaves` in `lib/campaign.mjs`. `computeWaves` and the graph checks of `checkWorkSet` are deleted. | PO 2026-10-17 (suggestion 1) |
| D5 | With no evidence, the graph is the serial chain: each unit depends on the piece before it in the sequence. The deps scout drops a serial edge only with evidence that the two units are independent, and the person confirms each dropped edge. When two units of one wave cite one path, the person gets a warning and decides: add an edge, or keep the two units in one wave (4.5). | PO 2026-10-17 (suggestion 2) |
| D6 | Before the waves are planned, a read-only deps scout reads the packets and the code. It proposes the graph, the contract lines, and the paths that each unit likely touches. Two units of one wave that cite one path get a warning, not a refusal. | PO 2026-10-17 (suggestion 3) |
| D7 | A graph change found in prepare or in a run goes into the ledger through `campaign.mjs`. No graph change goes through the brainstorm. | recommendation |
| D8 | A work set with packet fields of the old form still runs. `orient` reads the old fields as the seed of the graph. A ledger of the old form gets its `deps` on first load, from the packets. | recommendation |
| D9 | "Order" means the brainstorm sequence. "Dependency graph" means the campaign's `deps`. The cross-unit pair kind `order` of `_drive.md` keeps its name, because it is a derived needs entry and not the sequence. | recommendation (one term per concept) |
| D10 | The graph and the waves do not use `campaign.width`. A wave holds every unit whose dependencies are met, with no size limit. The width limits only the heavy slots at run time. `deps plan` gives no warning for a wide wave. | PO 2026-10-17 |

## 3. What moves where

| Item | Today | After |
|---|---|---|
| `order` | Brainstorm, a free integer, a tie-break | Brainstorm, a strict sequence 1..n over every piece, checked |
| `why-here` | — | Brainstorm, free text, required on each piece after order 1 |
| `depends-on`, `needs`, `provides`, `expects` | Brainstorm board and packet frontmatter | Campaign ledger `deps`, proposed by the deps scout, confirmed by the person |
| The wave plan | Two: `work/index.md` `waves:` and the ledger | One: the ledger |
| The graph check | Two: `checkWorkSet` and `checkCampaignSet` | One: `checkCampaignSet`, over the ledger graph |
| "Start anyway?" on the serial path | Each `depends-on` key | Each piece earlier in the sequence |
| A contract change found in shape | Through the brainstorm, then `replan` | `deps <key> provides` or `deps <key> expects`, then `replan` |
| A `needs` entry found in slice | Through the brainstorm, then `replan` | `deps <key> needs add`, then `replan` |
| A derived needs entry of a wave outcome | Written into its packet through the brainstorm | Stays in the ledger |

## 4. Design

### 4.1 The brainstorm

1. In 3.3 ("Shape the work"), agree how the kept items group into pieces, the slug and the form of each piece, and the sequence. Give your view of the sequence with its reason: what comes first is the smallest piece that shows the thinking is right.
2. Record `order` on every piece, write-now pieces included. The orders are the integers 1 to n, each used once.
3. Record `why-here` on each piece after order 1: why the piece comes after the pieces before it, in the person's words, for example "billing waits until the limits ship". When the position has no reason other than value, the note says so, for example "less urgent than the pieces before it". Propose the note, and the person confirms it. The campaign reads it as evidence (4.4).
4. Do not ask for `depends-on`, `needs`, `provides`, or `expects`. Remove their rows from the table of `_work.md`.
5. Run the write-now pieces in sequence order. Remove the rule "a piece that another write-now piece depends on runs first".

`checkWorkSet` keeps the checks of coverage, slugs, `target-slug`, size, and sources. It drops the checks of `depends-on`, `needs`, and the contract lines. It adds two checks:

- each piece has an `order`, and the orders are 1 to n with no gap and no repeat;
- each piece with an `order` above 1 has a `why-here` that is not empty.

`work/index.md` changes:

- The frontmatter loses `waves:`. It keeps `work-revision`, `slugs`, and `written`.
- The sections "Contracts" and "Waves" are deleted.
- The packet table has the columns `Order`, `Packet`, `Form`, `Size`, `State`, and `Why here`.
- "Start commands" says: "In order. Start a packet after every packet above it is done. To build them in parallel waves, run `/wf campaign <slug>`."
- The `Next` of two or more packets gives the start command of order 1 and the campaign command.

The packet loses the fields `depends-on`, `needs`, `provides`, and `expects`, and the line "Start after". It gets the line "Comes after: <the piece with order N−1>, because <why-here>." The packet with order 1 gets no such line.

### 4.2 The serial path

`intake/_packet.md` Step 1.3 becomes:

1. When `.ai/workflows/<brainstorm-slug>/campaign/ledger.json` exists and lists this packet as a unit, skip this step. The campaign owns the order of its units, and its prepare runs one wave ahead.
2. Otherwise, check each piece with a lower `order`:
   - a packet is done when the `00-index.md` of its `routed-to` workflow has `status: complete` or `status: closed`;
   - a write-now piece is done when its state on the board is `written`.
3. When a piece is not done, name it in plain words and ask the person whether to start anyway, per `_gate-question.md`. The person decides.

### 4.3 The graph in the ledger

```json
"deps": {
  "state": "proposed",
  "revision": 3,
  "confirmed-at": null,
  "units": {
    "spending-limit": {
      "depends-on": [{ "key": "cost-rows", "why": "reads the cost rows", "by": "scout" }],
      "needs": [],
      "provides": [{ "key": "project-limit", "text": "Each project has a spending limit that warns.", "by": "scout" }],
      "expects": [{ "from": "cost-rows", "key": "row-per-run", "text": "One cost row per run.", "by": "person" }],
      "paths": ["src/billing/limits.ts", "src/billing/rows.ts"]
    }
  }
}
```

- Each unit entry gets `confirmed-at` when the person confirms it. `state` is `confirmed` when every unit outside a started wave has `confirmed-at`; otherwise it is `proposed`.
- Setup refuses while `state` is `proposed`. `unit <key> prepared` and `wave <n> start` refuse a unit with no `confirmed-at`. There is no way to skip the confirmation (Q2).
- `by` is `seed`, `serial`, `scout`, `person`, `prepare`, or `driver`.
- `paths` are the repo paths that the scout expects the unit to change. They are an estimate.
- Each `outside` packet (`task`, `investigate`, `discover`) has an entry too. Its dependents wait for it, as today.

`unitsOf(ws)` in `scripts/campaign.mjs` is the single seam. Every reader of the graph calls it: `orient`, `replan`, `needs`, `contract`, `drift`, the context files, and `status`. It takes the frontmatter of each packet and overlays `ledger.deps.units[key]`. After this plan, `unitOf` reads the four fields only from the overlay. The packet fields are read only as the seed at `orient` (D8).

### 4.4 The deps phase

A new phase between "Phase 0 — Orient" and "Phase 1 — Setup" in `campaign/_phases.md`.

1. `orient` writes the ledger with `deps.state: proposed`. For each unit, the seed is the old packet fields when they exist (`by: seed`), or the serial chain (`by: serial`). `orient` plans no waves yet. It returns `next: deps`.
2. Launch one read-only deps scout subagent (Q1). It always runs, also when the seed comes from old packet fields. Its prompt gives every packet, `work/index.md`, and the seed. The scout reads:
   - the carried decisions and the `why-here` note of each packet;
   - the `references` that are repo paths, and the research notes;
   - the code, by search, for the names, the files, and the symbols that each packet will create, change, or use.
3. The scout returns, for each unit:
   - each `depends-on` edge to keep or to drop, with its evidence;
   - the `provides` and `expects` lines, with the decision or the symbol that each line comes from;
   - the `paths` that the unit likely changes.

   The scout drops a serial edge only with evidence that the two units are independent. "No evidence of a dependency" is not evidence of independence.
4. Write the proposal with the `deps` commands (4.6), `--by scout`.
5. Run `<cmd> deps plan`. It runs `checkCampaignSet` and `planWaves` over the proposal and returns the waves, the errors, and the shared-path warnings (4.5). It changes no state.
6. Ask the person in one batch, per `_gate-question.md`. Show the serial waves and the proposed waves side by side, each edge that the scout dropped with its evidence, and each shared-path warning. The options are: confirm the proposal, or change some lines (free text). A person who wants the serial chain says so in the free text, and each dropped edge goes back.
7. Record each change with the `deps` commands, `--by person`. Then run `<cmd> deps confirm`. It refuses on an error of `checkCampaignSet`. On success, it writes the waves, sets `confirmed-at` on each unit that the question showed, and appends `deps-confirm` to the campaign journal.

The person fixes a graph error here, in the campaign session. The person goes back to the brainstorm only to change the pieces themselves: their split, their decisions, their slugs, or their sequence.

### 4.5 Shared paths

`deps plan` and `deps confirm` compare the `paths` of each pair of units that one wave holds. For each path that two units cite, they return a warning: `{ a, b, path }`. The person chooses one of two answers:

- Add a `depends-on` edge. The later unit in sequence order moves to a later wave.
- Keep the two units in one wave. The pair goes into the wave's `expected-shared` list. The cross-unit reconcile of the wave driver reads that list first, and a match becomes a derived needs entry, as today.

A path is an estimate before the plans exist, so the warning never refuses a plan.

### 4.6 Commands

All in `scripts/campaign.mjs`. Each command changes the ledger only, writes the unit's context file again, and appends a journal event.

| Command | What it does |
|---|---|
| `deps show` | Print the graph, the source (`by`) of each line, and the waves that it gives |
| `deps <key> depends-on add <from> --why <text> --by <who>` | Add an edge |
| `deps <key> depends-on remove <from> --why <text> --by <who>` | Remove an edge. The removal and its reason stay in the journal |
| `deps <key> needs add --from <key> --through <slice> --before <slice> --why <text> --by <who>` | Add a partial need. The same rules as the packet `needs` of N1 |
| `deps <key> provides set --line <key> --text <text> --by <who>` | Add or change a provides line |
| `deps <key> expects set --from <key> --line <key> --text <text> --by <who>` | Add or change an expects line |
| `deps <key> paths --set <p1,p2>` | Set the estimated paths |
| `deps plan` | Check the graph and plan the waves. No state change |
| `deps confirm` | Check, plan, write the waves, and set `confirmed` |

After `confirm`, a change to a unit whose wave did not start needs `replan`. A change to a unit of a started wave is refused, except through the run-time commands: `needs <key> add` for a derived needs entry and `contract <key> amend` for a contract line. Those commands stay as they are.

### 4.7 Prepare and run without the brainstorm

`campaign/_phases.md`, "Rolling prepare":

- Step 2 (shape): compare the shape with the unit's `provides` and `expects` lines from `deps show`. The person confirms each change. Record it with `deps <key> provides set` or `deps <key> expects set`, `--by prepare`, then run `replan`.
- Step 3 (slice): propose each `needs` entry as today. Record a confirmed entry with `deps <key> needs add --by prepare`, then run `replan`.

`campaign/_phases.md`, "Reopen pick-up":

- Delete the row "A derived needs entry of a wave outcome". A derived needs entry stays in the ledger.
- Replace the rows "Changed `provides` or `expects` lines" and "New `depends-on`" with one row: "A changed sequence: the serial edges of each unit whose deps are not confirmed follow the new sequence. Confirmed edges do not change. Say so in the commentary."
- A new packet gets a serial edge to the piece before it, with `by: serial`. `status` returns `next: deps` until the person confirms its entry. It joins no wave before that.

`campaign.md` line 149 ("A wait comes from the packet's `needs`") becomes "A wait comes from the unit's `needs` in the ledger".

### 4.8 Migration

1. A work set with packets of the old form and no ledger: `orient` reads the four packet fields as the seed (`by: seed`). The deps phase runs as in 4.4.
2. A ledger with no `deps` key: the first `loadLedger` copies the four fields of every packet into `deps`, with `by: seed`. Each unit of a started wave gets `confirmed-at`, so a running wave continues with the graph that it had. Each other unit gets no `confirmed-at`: `status` returns `next: deps`, and the deps phase (4.4) runs over those units before the next wave is prepared.
3. A board of the old form: the board schema keeps the four fields as optional and marks them deprecated. `work-packets.mjs write` no longer writes them into a packet. A brainstorm that rewrites its packets before step 2 runs drops the seed. Then the scout proposes the graph again.
4. A board with an `order` that is not 1 to n, or with a piece after order 1 that has no `why-here`: the next `check` fails, and the brainstorm asks the person for the sequence and the notes.

## 5. Files

| File | Change |
|---|---|
| `skills/wf/reference/intake/brainstorm.md` | 3.3 and 3.4: the sequence and `why-here`; no graph |
| `skills/wf/reference/intake/brainstorm/_work.md` | The table, the write-now order, the check list, "Next" |
| `skills/wf/reference/intake/brainstorm/_artifact.md` | The piece of work example and the field list |
| `skills/wf/reference/intake/_packet.md` | Step 1.3 (4.2) |
| `lib/work-packets.mjs` | Delete `computeWaves` and the graph checks; add the sequence check; the packet and `work/index.md` text |
| `tests/frontmatter.schema.json` | Board: `why-here`; the four fields deprecated. Packet: the four fields removed, `why-here` added. Ledger: `deps` |
| `lib/campaign.mjs` | `unitOf` overlay; `deps` seed and serial chain; the shared-path compare; `newLedger` without waves until `confirm` |
| `scripts/campaign.mjs` | `unitsOf` overlay; the `deps` command; `orient` returns `next: deps`; the ledger migration in `loadLedger`; `campaignAction` gives `deps` |
| `skills/wf/reference/campaign.md` | The deps phase in the phase list; the `deps` command in "Commands"; line 149 |
| `skills/wf/reference/campaign/_phases.md` | The deps phase (4.4, 4.5); "Rolling prepare" steps 2 and 3; "Reopen pick-up" |
| `skills/wf/reference/campaign/_deps.md` | New: the deps scout procedure and its return shape |
| `skills/wf/reference/campaign/_drive.md` | "Cross-unit reconcile" reads `expected-shared` first |
| `skills/wf/workflows/campaign-wave.js` | The reconcile prompt names the `expected-shared` pairs. No other change: the driver reads the context files |
| `dist/campaign.mjs` | Rebuild in the same commit |
| `docs/site/reference/intake-modes.html`, `docs/site/guides/autonomous-drivers.html`, `docs/site/reference/commands.html` | The brainstorm fields, the deps phase, the `deps` command |
| Tests | Section 7 |

## 6. Waves of work

| Wave | Content | Gate |
|---|---|---|
| W1 | The ledger `deps`, the `unitsOf` overlay, the seed, the serial chain, and the `loadLedger` migration. No behaviour change: a seed of the old fields gives the same waves as today | The existing campaign tests pass with no change of expected waves |
| W2 | The `deps` command, `deps plan`, `deps confirm`, and the shared-path compare. `orient` stops before the waves | New CLI tests |
| W3 | The deps scout (`_deps.md`) and the deps phase in `_phases.md` and `campaign.md` | `campaign-wave-docs.test.mjs` style test: every section that the procedure cites exists |
| W4 | The brainstorm side: the sequence check, `why-here`, no graph, `work/index.md`, the packet text, `_packet.md` Step 1.3 | `work-packets.test.mjs` |
| W5 | Prepare and reopen without the brainstorm (4.7), and `expected-shared` in the wave driver | CLI tests and `campaign-wave.test.mjs` |
| W6 | The doc site, the CHANGELOG, and one release | All gates |
| W7 | A live run: one brainstorm of three or more pieces, once on the serial path and once through a campaign | Not a gate |

## 7. Tests

- `tests/unit/lib/campaign.test.mjs`:
  - a seed of the old fields gives the waves of today;
  - with no seed, the serial chain gives one unit per wave;
  - a dropped edge puts two units in one wave;
  - a shared path gives a warning and no refusal;
  - the overlay wins over a packet field.
- `tests/unit/campaign-cli.test.mjs` and `campaign-wave-cli.test.mjs`:
  - `orient` returns `next: deps` and no waves;
  - `deps confirm` refuses a cycle;
  - setup refuses while `deps.state` is `proposed`, and `wave <n> start` refuses a unit with no `confirmed-at`;
  - the confirm question has no option that skips the confirmation;
  - a ledger with no `deps` gets it on first load: the started waves do not change, and the other units need the deps phase;
  - `deps` refuses a change to a unit of a started wave.
- `tests/unit/skills/work-packets.test.mjs`:
  - the sequence check fails on a gap, on a repeat, and on a piece after order 1 with no `why-here`;
  - a packet has no graph fields;
  - `work/index.md` has no `waves:`.
- The fixtures `tests/evals/fixtures/brainstorm-packets` and `campaign-packets`: one fixture keeps the old fields, for the migration test. One fixture has the new form.
- A docs test: `brainstorm/_work.md` names none of the four fields as a thing to agree, and `_phases.md` sends no graph change through `/wf brainstorm`.

## 8. Risks

| Risk | Answer |
|---|---|
| The person knows a dependency that the code does not show, and the campaign asks for it after the person has left the brainstorm | The `why-here` note carries the reason. The serial chain is the default, so a missed dependency costs parallelism, not correctness |
| The scout drops an edge on weak evidence, and two dependent units share a wave | The person confirms each dropped edge with its evidence. The cross-unit reconcile and the derived needs entries still catch a shared file at run time |
| `paths` are wrong before the plans exist | The warning never refuses. The reconcile after the plans is the real check |
| A brainstorm rewrites its packets before the migration seed is read | Migration step 3: the scout proposes again. The person confirms again |
| The campaign prepare for wave n+1 asks "start anyway?" for each unit | 4.2 step 1 skips the question for a unit of a campaign |

## 9. Questions

All four are answered by the PO, 2026-10-17.

| # | Question | Answer |
|---|---|---|
| Q1 | Is the deps scout one subagent, or does the campaign session read the code itself? | One read-only subagent. It keeps the code reads out of the session context, and its return is a fixed shape (4.4 step 2) |
| Q2 | Can the person skip the deps phase? | No. The scout always runs, and the person always confirms or changes its proposal. A person who wants the serial chain says so in the change (4.3, 4.4 step 6) |
| Q3 | Is `why-here` optional? | No. Each piece after order 1 has one, and the check fails without it (4.1 step 3) |
| Q4 | Does the release keep a read path for old packets, or cut over hard? | Keep the read path (D8, 4.8). Running campaigns on SoccerManager and Secbot have packets of the old form |
