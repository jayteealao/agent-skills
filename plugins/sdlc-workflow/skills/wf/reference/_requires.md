# Requires tables and the read check (single source)

Every stage reference that writes a stage artifact has one `## Requires` section, directly after its header detail table. The table names every input the writer must read and every procedure file the writer must load. This file defines the table and the check that compares the table with your reads. A stage reference cites this file and does not restate it.

## The table

| Input | Kind | When | Sections |
|---|---|---|---|
| `02-shape.md` | artifact | always | Acceptance Criteria; Out of Scope |
| `implement/_artifact.md` | procedure | always | |
| `05-implement-<slice>.md` | writes | | |

- **Input.** One path in backticks. For `artifact` and `writes`, the path is relative to `.ai/workflows/<slug>/`. For `procedure`, the path is relative to `skills/wf/reference/`. The only placeholders are `<slice>` (the slice of the artifact you write) and `<mode>` (the intake mode). A glob `*` is permitted. A project-level file starts with `/.ai/`. A free-text input that is not a file has no backticks, and the check ignores it.
- **Kind.** `artifact`, `procedure`, or `writes`. A `writes` row names the stage artifact that the check runs on. Its When and Sections cells are empty.
- **When.** `always`, `if-present`, `on-resume`, or `mode:<name>`. The check compares only `always` and `if-present` rows. The other values are a checklist for you only.
- **Sections.** Empty means the whole file. Otherwise the cell is a `; `-separated list of exact `##` heading texts, without the `## `.

## Before you write

The table is a checklist. Before you write the stage artifact, read every row whose When value applies to this run. An `if-present` input is optional to exist and mandatory to read when it exists.

1. Read each whole-file input from its first line to its last line.
2. For an input with named sections, read each named section in full.
3. Read each input yourself. A read by a research sub-agent does not count for you, because the check records reads per agent.
4. Use the host's file-read tool. A search hit or a shell read does not count.

A partial read does not count. The line ranges you read must cover the whole file, or each named section.

## Prompt-fed inputs

A dispatcher that passes the full text of an input in a child prompt adds one line to the prompt, next to the output artifact path:

```
Prompt-fed inputs: 02-shape.md, 04-plan-<slice>.md
```

Those inputs then count as read for the writer of that output path. [_subagents.md](_subagents.md) states when a dispatcher adds the line.

## The check where the mod runs

The mod is Claude Code-only. It records each read of a workflow file or a `skills/wf/reference/` file, with its line ranges, for each agent. When the named stage writer writes a file that matches a `writes` row, the mod compares those reads with the table. The check does not run for sibling `.yaml` files, fragments, `history/`, `00-index.md`, `03-slice.md` write-backs, `index-history.jsonl`, or the evidence folders.

The mod setting `readCheck` selects the mode:

| Mode | Result |
|---|---|
| `warn` (default) | The write lands. The tool result carries the missing and partial reads as context. |
| `block` (later) | The mod denies the write unless its frontmatter carries `read-waiver: "<reason>"`. |
| `off` | No check. |

When a tool result names missing reads, read each named input. Then write the stage artifact again in the same stage run.

Each check appends one row to `.ai/workflows/<slug>/.read-ledger.jsonl`: `{"at","agentId","stage","artifact","missing":[...],"partial":[...],"waiver"}`. The mod owns this file. No agent writes it, and no check row goes to `.driver-journal.jsonl`. The read record resets on a compaction between stages. It survives a compaction in the middle of a stage.

## A host without the mod

A host without the mod has no read hook, so no check runs. Read every row as above. Then write `reads-checked: false` in the frontmatter of the stage artifact.
