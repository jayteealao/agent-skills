# Requires tables and the read check (single source)

Every stage reference that writes a stage artifact has one `## Requires` section. The table names every input the writer must read and every procedure file the writer must load. This file defines the table for the reader. `_requires-authoring.md` holds the authoring rules and the mod internals; a stage run does not load it.

## The table

| Input | Kind | When | Sections |
|---|---|---|---|
| `02-shape.md` | artifact | always | Acceptance Criteria; Out of Scope |
| `implement/_artifact.md` | procedure | always | |
| `05-implement-<slice>.md` | writes | | |

- **Input.** One path in backticks. For `artifact` and `writes`, the path is relative to `.ai/workflows/<slug>/`. For `procedure`, the path is relative to `skills/wf/reference/`. `<slice>` is the slice of the artifact you write, and `<mode>` is the intake mode. A glob `*` matches every file it names. A project-level file starts with `/.ai/`. A free-text input that is not a file has no backticks, and the check ignores it.
- **Kind.** `artifact`, `procedure`, or `writes`. A `writes` row names the stage artifact that the check runs on. Its When and Sections cells are empty.
- **When.** `always`, `if-present`, `on-resume`, or `mode:<name>`. The check compares `always` and `if-present` rows, and each `mode:<name>` row whose mode applies (see Modes). An `on-resume` row is a checklist for you only.
- **Sections.** Empty means the whole file. Otherwise the cell is a `; `-separated list of exact `##` heading texts, without the `## `.

## Modes

A `mode:<name>` row applies when its mode applies to this run. A mode applies when one of these is true:

- The frontmatter of the stage artifact lists the mode in `modes:`, for example `modes: [deferral, triage]`. List every mode you ran under.
- The mod finds the mode on disk. A disk fact wins over a missing `modes:` entry.

| Mode | Disk fact |
|---|---|
| `deferral` | `00-index.md` has a `runtime-evidence-deferrals` entry with `cleared-by: null`. |
| `user-observable` | The slice file or the stage artifact marks an AC `observable: true` or `kind: user-observable`. |
| `design` | `02b-design.md` or `02c-craft.md` exists. |
| `augment` | `00-index.md` has an `augmentations` entry, or `02c-craft.md` exists. |
| `packet` | `00-index.md` has an `origin-packet` value. |
| `slug-wide` | `00-index.md` has `review-scope: slug-wide`. |
| `change` | `00-index.md` has `workflow-type` `fix`, `hotfix`, or `refactor`. |

Any other mode, for example `triage` or a command argument such as `audit`, applies only when `modes:` lists it. A `procedure` mode row that applies is mandatory. An `artifact` mode row that applies is mandatory to read when the file exists.

## Before you write

The table is a checklist. Before you write the stage artifact, read every row whose When value applies to this run. An `if-present` input is optional to exist and mandatory to read when it exists. Honor what it says in the stage artifact; a silent omission is a contract violation. This file is the one owner of that rule.

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

## When the mod reports missing reads

Where the mod runs (Claude Code-only), it compares your reads with the table when you write the stage artifact. The mod setting `readCheck` is `warn` by default.

1. When a tool result names missing or partial reads, read each named input.
2. Write the stage artifact again in the same stage run.
3. When the mod denies the write (`block`), read the named inputs and write again. Add `read-waiver: "<reason>"` to the frontmatter only when an input cannot be read.

The mod records each check in `.read-ledger.jsonl`. Do not write that file.

## A host without the mod

A host without the mod has no read hook, so no check runs. Read every row as above. Then write `reads-checked: false` in the frontmatter of the stage artifact.
