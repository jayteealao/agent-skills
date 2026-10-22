# Requires tables: authoring and the mod check

This file is for an author of a stage reference and for a reader of the mod code. A stage run does not load it. A stage run reads [_requires.md](_requires.md): the table, the modes, and the checklist.

## Where the table goes

1. Give every stage reference that writes a stage artifact one `## Requires` section.
2. Put the section directly after the header detail table.
3. Open the section with this line: "Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check."
4. Do not restate `_requires.md` in the stage reference. Cite it.
5. Write one `writes` row for each stage artifact that the check runs on.
6. Use only the placeholders `<slice>` and `<mode>` in a path. A glob `*` is permitted.
7. Prefer a Sections cell on an `always` row over a new `mode:` row when a stage needs only part of a file.

`node scripts/build-requires.mjs` compiles the tables into the mod. Run it after you change a table.

## The check where the mod runs

The mod is Claude Code-only. It records each read of a workflow file or a `skills/wf/reference/` file, with its line ranges, for each agent. When the named stage writer writes a file that matches a `writes` row, the mod compares those reads with the table. The check does not run for sibling `.yaml` files, fragments, `history/`, `00-index.md`, `03-slice.md` write-backs, `index-history.jsonl`, or the evidence folders.

In the check, a `procedure` mode row counts as `always`. An `artifact` mode row counts as `if-present`.

The mod setting `readCheck` selects how the check acts:

| Setting | Result |
|---|---|
| `warn` (default) | The write lands. The tool result carries the missing and partial reads as context. |
| `block` | The mod denies the write unless its frontmatter carries `read-waiver: "<reason>"`. |
| `off` | No check. |

Each check appends one row to `.ai/workflows/<slug>/.read-ledger.jsonl`: `{"at","agentId","stage","artifact","missing":[...],"partial":[...],"waiver"}`. The mod owns this file. No agent writes it, and no check row goes to `.driver-journal.jsonl`. The read record resets on a compaction between stages. It survives a compaction in the middle of a stage.
