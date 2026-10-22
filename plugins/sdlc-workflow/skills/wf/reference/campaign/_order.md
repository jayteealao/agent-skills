# Campaign order: pair kinds, waits, merge notes, and the slice order

This file belongs to [../campaign.md](../campaign.md). It says when one slice waits for another, and how a pair of slices that only changes the same file is recorded. The cross-unit reconcile agent of the wave driver (`workflows/campaign-wave.js`) reads "Pair kinds" and "Cross-unit reconcile". The campaign session reads the rest. The driver's bookkeeping agents follow their prompts. `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

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
3. Find each pair of slices of two different units that change the same file. Check first the `expected-shared` pairs that the prompt names: the deps phase expected those two units to share a path ([_phases.md](_phases.md), "Shared paths").
4. Leave out a pair that a `needs` entry of the graph already orders. Section 7 of the later unit's context file lists those entries.
5. Give each pair its kind by "Pair kinds". For a `need`, give `needs` (`a` or `b`) and `evidence`.
6. Return `pairs`: one `{ a, aSlice, b, bSlice, files, kind, needs, evidence }` for each pair. When no two units share a file, return `pairs: []`.

A plan agent that runs during the walk reports a shared file in `crossUnit`, with the same kinds. Its `needs` is `this` (this slice builds on the other) or `other`. The driver treats the report as a pair.

## Derived needs

A derived needs entry is a `needs` entry that the driver writes into the ledger, for a `need` pair that no packet declares. A `merge` pair becomes a merge note instead (see "Merge notes"). The driver writes no packet, because the brainstorm owns the packets.

- A wait is ready when the needed slice passed verify. The consumer merges the verified commit, not the branch tip. When the review of the needed slice then changes it, the consumer merges the fix before its next implement.
- A need on a slice that already passed its implement makes no wait. The pair goes to the focus list (`waves[n].focus`), which the wave review reads.
- A need that closes a cycle parks the unit with kind `needs-cycle`.
- `needs <key> remove` leaves a drop record in the unit's `dropped-needs`. A relaunch then cannot add the same wait again. Only `needs <key> add --by person` brings it back.
- The person can drop a wait while the run is live: run `<cmd> needs <key> remove --from <key> --through <slice> --before <slice> --by person`. `<cmd> needs <key> add --by person` arms a new wait the same way. The waiter returns the change, and the driver settles the wait.

## Merge notes

A merge note records a `merge` pair: two slices that change the same file and wait for nothing. The notes of a wave live in `waves[n].merge-notes` of the ledger, one for each pair of slices. `wave <n> launch` passes them to the driver. The boundary merge and a merge-in conflict between the two units list them as expected conflicts, and apply the rules of [_boundary.md](_boundary.md), "Merge". The wave review reads them next to the focus list, and runs in full when the wave has a merge note.

## Slice order

The walk of a unit follows `depends-on` of its roster in topological order, with roster order as the tie-break. A plan that decides an order inside one unit returns it as `orderEdges`. Text in a plan never orders a walk.

`node "<pluginRoot>/skills/wf/scripts/campaign.mjs" slice-order "<checkout>" <slug> add --slice <slice> --after <after> --why "<why>"` adds `after` to the `depends-on` of `slice`, in the roster of `03-slice.md` and in `03-slice-<slice>.md`. It refuses a cycle, and writes the new walk order into `implementation-order` of `04-plan.md`. It only adds an edge. The slice stage keeps its ownership of the roster: the person can remove an edge with `/wf slice`.

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
