# Campaign order: waits, merge notes, and the slice order

This file is the order procedure of the wave driver (`workflows/campaign-wave.js`). It says when one slice waits for another, how the driver records a pair of slices that only changes the same file, and how a walk orders the slices of one unit. [_drive.md](_drive.md) holds the other agents of the drive. `<cmd>` stands for the same command as in [_drive.md](_drive.md).

The rule of this file comes from the person (rule R1, 2026-10-21): a serial chain of slices is a negative, and a shared file alone does not make one slice wait for another.

## Pair kinds

A cross-unit pair is two slices of two different units that change the same file. Each pair has exactly one kind.

| Kind | When | What the driver does |
|---|---|---|
| `need` | One slice uses a result of the other: code, data, a schema, a file format, a version, or a behaviour that the other slice makes or changes | The slice that builds on the other waits for it |
| `merge` | The two slices change the same file in places that do not depend on each other | No wait. The pair becomes a merge note of the wave |
| `contract` | The shared change would change a `provides` or `expects` line of either unit | The later unit parks with kind `contract` |

The test for `need` is one question: would this slice's implement fail, or build the wrong thing, if the other slice's change were absent?

- When the answer is yes, the pair is `need`.
- When the answer is no, the pair is `merge`.
- When you are unsure, the pair is `merge`. The plan check and the verify find a missed need, and a serial chain costs more.

These pairs from SoccerManager wave 4 are `merge`: a new CLI subcommand, a CHANGELOG line, a docs row, a dependency line, a band row, a separate function in one source file, and a version number that the merge renumbers.

A `need` has two more fields:

- `needs`: the side that builds on the other. The direction comes from the evidence, never from packet order.
- `evidence`: one quote of 25 words or fewer, with its `path:line`, from a plan or a `.yaml` edge of the side that builds on the other.

A `need` with no evidence, or with no direction, is a `merge` pair. The driver logs why.

The person's standing rules of the ledger (`rule add`) reach the driver in the launch args. The plan prompts, the plan reconcile, and the cross-unit reconcile quote them.

## Cross-unit reconcile

When the plans of a unit finish, and before its first implement, one agent compares its plans with the plans of the units that planned before it. The prompt names the units with new plans: return only the pairs in which one slice belongs to them. This agent is read-only: write nothing except the heartbeat.

1. Read every `04-plan-<slice>.yaml` that the prompt names, in full: its `files` and its `edges`. The prompt names the slices that each unit owns. Do not read the plan of a slice of another unit.
2. Read the `provides` and `expects` lines of every context file.
3. Find each pair of slices of two different units that change the same file. Check first the `expected-shared` pairs that the prompt names: the deps phase expected those two units to share a path (`_phases.md`, "Shared paths").
4. Leave out a pair that a `needs` entry of the graph already orders. Section 7 of the later unit's context file lists those entries.
5. Give each pair its kind by "Pair kinds". For a `need`, give `needs` (`a` or `b`) and `evidence`.
6. Return `pairs`: one `{ a, aSlice, b, bSlice, files, kind, needs, evidence }` for each pair. When no two units share a file, return `pairs: []`.

A plan agent that runs during the walk reports a shared file in `crossUnit`, with the same kinds. Its `needs` is `this` (this slice builds on the other) or `other`. The driver treats the report as a pair.

## Derived needs

A derived needs entry is a `needs` entry that the driver writes into the ledger, for a `need` pair that no packet declares. A `merge` pair goes through the same command, with `--kind merge`.

1. Run each command of the prompt, in order:
   - a need: `<cmd> needs <key> add --kind need --from <key> --through <slice> --why "<files>" --evidence "<quote>" --by driver --source <source>`;
   - a merge note: `<cmd> needs <key> add --kind merge --from <key> --through <slice> --why "<files>" --by driver --source <source>`.
   An entry with a `before` slice also has `--before <slice>`. The source is `cross-unit`, or `plan:<slice>` for the `crossUnit` report of a plan.
2. Return each printed object in `results`, with the `key`, `from`, `through`, and `before` of its entry.
3. Change nothing else. The command appends the `derived-need` or `merge-note` event itself.

| Result | Meaning | What the driver does |
|---|---|---|
| `exists: true` | A packet or the ledger has the same entry | Nothing |
| `merge: true` | A merge note of the wave | No wait. The boundary merge and the wave review read the note |
| `dropped: true` | The person or a resolver dropped this wait earlier | No wait. Only `--by person` brings the wait back |
| `cycle` | The entry closes a cycle at slice level | The unit parks with kind `needs-cycle` before the slice `before` |
| `late: true` | The slice `before` already passed its implement | No wait. The pair goes to the focus list (`waves[n].focus`), which the wave review reads |
| `ok: true` with `wait` | A new entry | The driver opens the wait. It is `ready` at once when the needed slice passed verify or cleared earlier |

`needs <key> remove` leaves a drop record in the unit's `dropped-needs`. A relaunch then cannot add the same wait again. The person can drop a wait while the run is live: run `<cmd> needs <key> remove --from <key> --through <slice> --before <slice> --by person`. The waiter returns the change in `needsChanged`, and the driver settles the wait as dropped. `needs <key> add --by person` arms a new wait the same way.

The driver never writes a packet, because the brainstorm owns the packets. The session writes each derived entry into its packet at the next wave boundary.

## Merge notes

A merge note records a `merge` pair: two slices that change the same file and wait for nothing. The notes of a wave live in `waves[n].merge-notes` of the ledger, one for each pair of slices. `wave <n> launch` passes them to the driver.

- The boundary merge lists them as expected conflicts ([_boundary.md](_boundary.md), "Merge").
- A merge-in conflict between two units gets their notes.
- The wave review reads them next to the focus list, and runs in full when the wave has a merge note.

For each conflict in a file of a merge note, apply these rules:

1. Regenerate a generated file once, after both sides merged. Do not merge its text.
2. Renumber a version or a ledger file to the next free number.
3. Convert a row or a record to the newer format of the other side.

A conflict that needs a product decision parks as before.

## Wait agent

A wait belongs to one unit. It names a slice of another unit (`from` and `through`), and the slice of its own unit that needs that code (`before`). Before the implement of `before`, the walk waits until the slice `through` passes verify. The consumer needs the verified code, not the review. Then the wait agent merges the verified commit, not the branch tip.

1. Run `<cmd> unit <key> waiting --on "<from>: <through>"`. `merge-in` refuses while the unit is `running`.
2. Run `<cmd> merge-in <key> <from> --at <sha>`. It merges the verified commit with rerere on. For a review fix, the prompt gives `--refresh`.
3. Only when step 2 printed `"ok": true`, run `<cmd> unit <key> running`.
4. Return `ok`, `conflict`, `error`, and `closed` from the object of step 2. Change nothing else.

When `conflict` lists files, `merge-in` aborted the merge, and the merge agent runs ([_drive.md](_drive.md), "Merge-in conflict"). When `merge-in` fails for another reason, for example uncommitted changes, the unit parks with kind `merge-conflict`.

The verify mark is bookkeeping only. After the verify of a slice passes, and while a wait on its unit is open, one agent runs `<cmd> slice-done <key> <slice> --verified`. The command records `HEAD` as the verified commit, makes each wait that the slice covers `ready` (`ready-on: verify`), and commits nothing. When the review of the slice then changes it, the `slice-done` of the slice returns `refresh`: each consumer that merged the verified commit. The consumer's wait agent runs again with `--refresh` before its next implement, and the wait stays `met`.

NOTE: The stop check of an implement agent has condition (d): an **Open** or **Ready** wait line for its slice, in section 7 of the context file. Condition (d) applies to implement only, because a plan reads the needed unit's plan, not its code. When condition (d) stops an implement, the driver treats the stop as its own scheduling fault, and waits for the wait. At the third such stop, the unit parks with kind `stage`.

## Slice order

The walk of a unit follows `depends-on` of its roster in topological order, with roster order as the tie-break (`walkOrder`). A cycle, or a name outside the roster, keeps roster order for the slices that are left. The yolo driver walks in the same order.

A plan or a plan reconcile that decides an order inside one unit returns it as `orderEdges: [{ slice, after, why }]`. Text in a plan never orders a walk.

1. The plan fan-out bookkeeping, the plan reconcile bookkeeping, and a walk-time plan run one command for each entry: `node "<pluginRoot>/skills/wf/scripts/campaign.mjs" slice-order "<checkout>" <slug> add --slice <slice> --after <after> --why "<why>"`.
2. The command adds `after` to the `depends-on` of `slice`, in the roster of `03-slice.md` and in `03-slice-<slice>.md`. It refuses a cycle, appends a line to `index-history.jsonl`, and writes the new walk order into `implementation-order` of `04-plan.md`.
3. Then a resume orient runs, or the driver adds the edge to the roster of the run, so the rest of the walk follows it.

`slice-order` only adds an edge, as `extend` only adds slices. The slice stage keeps its ownership of the roster: the person can remove an edge with `/wf slice`.

**Slice ownership.** Each roster entry of a campaign unit can name its unit (`unit: <key>`). A walk runs only the slices of its own unit and of each unit that it absorbed. A slice with no `unit` belongs to the unit that is not an extension, and, for an extension unit, a slice with `source: extension` belongs to it.

## Sort waits

`status` returns `sort-waits`, and `wave <n> launch` refuses with `next: sort-waits`, for a running wave that holds waits of ledger version 1 (`legacy-order`), or an extension unit to place (`extensions-pending`). The launch result lists the `legacy` waits and the `extensions`. The session sorts them with the person before the wave runs again.

1. Run one read-only agent over the legacy waits. It reads the plans of both slices of each wait, and returns each wait as `need` with evidence, or as `merge`, by "Pair kinds". It also returns:
   - each item of a "Cross-Unit Needs" section of a unit's `03-slice.md` that no wait and no graph need covers;
   - each order statement in a plan that `depends-on` does not hold.
2. Ask the person one question with the result: the waits it keeps, first, then the waits it drops, counted by file group, then the needs and the order edges it adds. Write the full list to a file, and name the file in the question.
3. When the person confirms or changes the list, apply it:
   - `<cmd> needs <key> remove --from <key> --through <slice> --before <slice> --by person` for each dropped wait (a drop record);
   - `<cmd> needs <key> add --kind merge …` for each dropped pair (a merge note);
   - `<cmd> needs <key> add --kind need … --evidence "<quote>" --by person` for each added need;
   - `slice-order "<the unit's worktree>" <slug> add …` for each order edge.
4. For each extension unit, ask the person: absorb it into this wave, or defer it.
   - absorb: `<cmd> unit <ext key> absorb --into <target key>`. The target walks the extension's slices in this wave.
   - defer: `<cmd> unit <ext key> defer`. The extension's slices in the target's roster get `unit: <ext key>`, and the target's walk skips them.
5. Run `<cmd> wave <n> sorted`. Each legacy wait that is left becomes a need, and the launch prints the args again.
