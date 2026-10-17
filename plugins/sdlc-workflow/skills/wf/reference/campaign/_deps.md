# The deps scout

This file belongs to [../campaign.md](../campaign.md), Phase 0b in [_phases.md](_phases.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

The campaign owns the dependency graph of its units: `depends-on`, `needs`, `provides`, and `expects`. The graph lives in the ledger, under `deps`. The brainstorm gives only the sequence (`order` 1 to n) and a `why-here` note on each piece after the first. The deps scout reads the packets and the code, and proposes the graph. The person confirms it.

## The rules of the graph

- With no evidence, the graph is the serial chain: each unit depends on the piece before it in the sequence. Each entry that `orient` seeds this way has `by: serial`.
- A packet of the old form carries the four fields. `orient` reads them as the seed of its entry, with `by: seed`.
- A serial edge goes only with evidence that the two units are independent. "No evidence of a dependency" is not evidence of independence.
- Two units of one wave that cite one path get a warning, never a refusal (section "Shared paths" of [_phases.md](_phases.md)).
- The width (`campaign.width`) does not limit a wave. A wave holds every unit whose dependencies are met. The width limits only the heavy slots at run time.

## Launch the scout

Launch one read-only subagent. It always runs, also when the seed comes from the old packet fields. The subagent writes nothing: it only reads and returns.

Give the subagent these items in its prompt:
- the path of every packet (`work/<slug>.md`) and of `work/index.md`;
- the output of `<cmd> deps show`: the seed of each unit, with the source of each line;
- the repo root;
- this file, section "What the scout does".

## What the scout does

1. Read each packet in full: its carried decisions, its `why-here` note, its `references`, and its research notes.
2. Read each `references` entry that is a repo path.
3. Search the code for the names, the files, and the symbols that each packet will create, change, or use.
4. For each unit, decide each edge to an earlier unit:
   - Keep the edge when a decision, a `why-here` note, or the code shows that this unit uses what the earlier unit builds.
   - Drop the edge only when the code shows that the two units touch different files and share no name, no type, no table, and no contract.
   - Add an edge to a unit that is not the piece just before it, when the evidence shows a dependency on it.
5. For each unit, write the contract lines:
   - `provides`: what the unit makes true for later units, one line each, with the decision or the symbol that the line comes from;
   - `expects`: what the unit needs from a `provides` line of a unit that it depends on, directly or through other units.
6. Propose a `needs` entry only for a partial need: a slice of an earlier unit that this unit needs before one of its own slices, when the two can run in one wave. A unit that needs all of an earlier unit keeps its `depends-on` edge.
7. List the `paths` that each unit likely changes. The paths are an estimate before the plans exist.

## Return shape

Return one JSON object:

```json
{
  "units": [
    {
      "key": "theme",
      "depends-on": [
        { "from": "limit", "keep": false, "evidence": "theme changes only src/ui/theme.css; limit never reads it" }
      ],
      "provides": [],
      "expects": [],
      "needs": [],
      "paths": ["src/ui/theme.css"]
    },
    {
      "key": "limit",
      "depends-on": [{ "from": "rows", "keep": true, "evidence": "decision limit-reads-rows; src/billing/limits.ts calls costRows()" }],
      "provides": [{ "line": "project-limit", "text": "Each project has a spending limit that warns.", "source": "decision limit-warns-only" }],
      "expects": [{ "from": "rows", "line": "row-per-run", "text": "One cost row per run.", "source": "src/billing/rows.ts, costRows()" }],
      "needs": [],
      "paths": ["src/billing/limits.ts", "src/billing/rows.ts"]
    }
  ]
}
```

- Each `depends-on` item is an edge of the seed with `keep`, or a new edge with `keep: true`. Each item has `evidence`.
- Each `needs` item is `{ "from", "through", "before", "why" }`.

## Record the proposal

Record each line of the return with the `deps` commands, `--by scout`:

1. Each edge with `keep: false`: `<cmd> deps <key> depends-on remove <from> --why "<evidence>" --by scout`.
2. Each new edge: `<cmd> deps <key> depends-on add <from> --why "<evidence>" --by scout`.
3. Each `provides` line: `<cmd> deps <key> provides set --line <line> --text "<text>" --by scout`.
4. Each `expects` line: `<cmd> deps <key> expects set --from <from> --line <line> --text "<text>" --by scout`.
5. Each `needs` item: `<cmd> deps <key> needs add --from <from> --through <slice> --before <slice> --why "<why>" --by scout`.
6. The paths: `<cmd> deps <key> paths --set <path,path>`.

Then continue Phase 0b at `deps plan` ([_phases.md](_phases.md)).

## The deps commands

| Command | Does |
|---|---|
| `deps <key> depends-on add\|remove <from> --why w [--by who]` | Add or remove an edge. A removed edge and its reason stay: `deps plan` shows them |
| `deps <key> needs add\|remove --from k [--through s --before s] --why w [--by who]` | Add or remove a partial need, with the rules of a `needs` entry |
| `deps <key> provides set\|remove --line k [--text t] [--by who]` | Add, change or remove a contract line that the unit provides |
| `deps <key> expects set\|remove --from k --line k [--text t] [--by who]` | Add, change or remove a contract line that the unit expects |
| `deps <key> paths --set <p1,p2>` | Set the paths that the unit likely changes |

`--by` is `seed`, `serial`, `scout`, `person`, `prepare` or `driver`. An edit refuses a unit of a started wave. An edit of a confirmed unit returns `replan: true`: run `replan`.
