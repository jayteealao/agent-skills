# Requires tables (single source)

Every stage reference that writes a stage artifact has one `## Requires` section. The table names every input the writer must read and every procedure file the writer must load. This file defines the table for the reader. `_requires-authoring.md` holds the authoring rules; a stage run does not load it.

## The table

| Input | Kind | When | Sections |
|---|---|---|---|
| `02-shape.md` | artifact | always | Acceptance Criteria; Out of Scope |
| `implement/_artifact.md` | procedure | always | |
| `05-implement-<slice>.md` | writes | | |

- **Input.** One path in backticks. For `artifact` and `writes`, the path is a record name per [_records.md](_records.md), or a file relative to `<wf-dir>/`. For `procedure`, the path is relative to `skills/wf/reference/`. `<slice>` is the slice of the artifact you write, and `<mode>` is the intake mode. A glob `*` matches every file it names. A project-level file starts with `/.ai/`. A free-text input that is not a file has no backticks.
- **Kind.** `artifact`, `procedure`, or `writes`. A `writes` row names the stage artifact that the table is for. Its When and Sections cells are empty.
- **When.** `always`, `if-present`, `on-resume`, or `mode:<name>`. Read the `always` and `if-present` rows, and each `mode:<name>` row whose mode applies (see Modes). An `on-resume` row applies when you resume a stage run.
- **Sections.** Empty means the whole file. Otherwise the cell is a `; `-separated list of exact `##` heading texts, without the `## `.

## Modes

A `mode:<name>` row applies when its mode applies to this run. A mode applies when one of these is true:

- The frontmatter of the stage artifact lists the mode in `modes:`, for example `modes: [deferral, triage]`. List every mode you ran under.
- The disk fact of the mode in the table below is true. A disk fact wins over a missing `modes:` entry.

| Mode | Disk fact |
|---|---|
| `deferral` | `00-index.md` has a `runtime-evidence-deferrals` entry with `cleared-by: null`. |
| `user-observable` | The slice file or the stage artifact marks an AC `observable: true` or `kind: user-observable`. |
| `design` | `02b-design.md` or `02c-craft.md` exists. |
| `augment` | `00-index.md` has an `augmentations` entry, or `02c-craft.md` exists. |
| `packet` | `00-index.md` has an `origin-packet` value. |
| `slug-wide` | The review scope of the workflow is slug-wide: `00-index.md` has `review-scope: slug-wide`, or it has no `review-scope` and the workflow is not reviewed per slice. |
| `change` | `00-index.md` has `workflow-type` `fix`, `hotfix`, or `refactor`. |

Any other mode, for example `triage` or a command argument such as `audit`, applies only when `modes:` lists it. A `procedure` mode row that applies is mandatory. An `artifact` mode row that applies is mandatory to read when the file exists.

## Before you write

The table is a checklist. Before you write the stage artifact, read every row whose When value applies to this run. An `if-present` input is optional to exist and mandatory to read when it exists. Honor what it says in the stage artifact; a silent omission is a contract violation. This file is the one owner of that rule.

Run the check in one call:

```
node "<skill-dir>/scripts/wf.mjs" requires "<root>" <slug> <stage> [--slice <slice>] [--mode <mode>]... [--on-resume]
```

`<stage>` is the stage key of the reference, for example `plan`, `verify` or `intake:fix`. Pass `--mode` for each mode that only the command line names, for example `triage` or `audit`. Pass `--on-resume` when you resume a stage run. The command applies the disk facts and the `modes:` list itself. It prints one JSON object:

- `artifacts`: each input that applies and exists, with its `content`. A row with named sections gives only those sections.
- `procedures`: each procedure row with its `path`. Read each one whose `read` is `true` with the host's file-read tool.
- `missing`: each input that is not on disk. An entry with `stop: true` is a missing required input. Stop the stage, and tell the person which input is missing.
- `guard`: when the content is over the size limit, the largest artifacts come with an `outline` and a `read` command, and no `content`. Run that command for each part that this stage needs.

The command exits 1 when an input stops the stage. Then:

1. Read the content of each artifact in the JSON in full. That is the read of the input.
2. For an outlined artifact, read each part you need with its `read` command, and read each named section of its row in full.
3. Read each input yourself. A read by a research sub-agent does not count for you, because its reads do not reach your context.
4. When the stage brief gives the content of an input, the brief is the read. Read any file that the command does not print with the host's file-read tool. A search hit does not count. A shell read counts only on a host that has no file-read tool: there, one shell command that prints the whole file (`Get-Content -Raw <path>`, or `cat <path>`) is the file read.

A partial read does not count. The line ranges you read must cover the whole file, or each named section.

## Prompt-fed inputs

A dispatcher that passes the full text of an input in a child prompt adds one line to the prompt, next to the output artifact path:

```
Prompt-fed inputs: 02-shape.md, 04-plan-<slice>.md
```

Those inputs then count as read for the writer of that output path. [_subagents.md](_subagents.md) states when a dispatcher adds the line.
