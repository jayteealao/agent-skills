# Records (single source)

The records of a workflow are YAML files in `.ai/workflows/<slug>/`, and scripts write them. An agent never writes a record file. It writes a draft, and `wf.mjs record put` checks the draft and writes the record.

In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

## Record names

A record has the name of its old Markdown file. Every command and every stage reference uses that name. The table gives the file that holds each record.

| Record names | File | Section |
|---|---|---|
| `00-index.md` (the index; `index` in commands) | `state.yaml` (stage, slice, branch, status, open questions, person tasks, next, progress) and `meta.yaml` (the rest) | — |
| `01-intake.md`, `01-<mode>.md`, `02-shape.md`, `02-optimize-spec.md` | `intake.yaml` | the name after the number: `intake`, `shape`, ... |
| `02b-design.md`, `02c-craft.md`, `07-design-critique.md`, `07-design-audit.md` | `design.yaml` | `design`, `craft`, `design-critique`, `design-audit` |
| `03-slice.md` (the roster), `04-plan.md`, `05-implement.md`, `06-verify.md` | `slices.yaml` | `slice`, `plan`, `implement`, `verify` |
| `03-slice-<s>.md`, `04-plan-<s>.md`, `05-implement-<s>.md`, `06-verify-<s>.md` | `slice-<s>.yaml` | `slice`, `plan`, `implement`, `verify` |
| `07-review.md`, `07-review-<s>.md`, `07-review-<s>-<command>.md` | `review.yaml`, `review-<s>.yaml` | `review`, or the review command |
| `04b-…`, `04c-…`, `05b-…` to `05z-…`, `08b-…`, `00-sync.md` | `augment.yaml` | the name after the number |
| `08-handoff.md`, `09-ship-runs.md`, `09-ship-run-<id>.md`, `09-rollback-<id>.md` | `ship.yaml` | the name after the number |
| `10-retro.md`, `90-recap.md`, `99-close.md` | `retro.yaml` | `retro`, `recap`, `close` |

A section keeps the frontmatter and the body of its record, and its record name. Any other file of the workflow folder (`decisions.yaml`, `findings.yaml`, `steps.jsonl`, the evidence folders, `work/`, `risk-register.md`, ...) keeps its own place and its own writer.

## Read a record

1. Read the brief of the stage first, when the stage has one (`<wf> brief <root> <slug> <stage> [<slice>]`). It holds the slice, its acceptance criteria and the plan sections that the stage acts on.
2. For any other record, run `<wf> record get <root> <slug> <name>`. It prints the record as Markdown with its frontmatter. A missing record exits 1 and prints nothing on stdout.
3. Run `<wf> record list <root> <slug>` for the names of every record of the workflow.

You may also read a record file with the file-read tool. Each section has `name`, `frontmatter` and `body`.

## Write a record

1. Get the frontmatter template of the record type: `<wf> stamp <type> --slug <slug> [--slice <slice>]`.
2. Write the whole record, frontmatter and body, to the draft `.ai/workflows/<slug>/.draft/<name>` with the file-write tool. The write-time checks run on the draft.
3. Run `<wf> record put <root> <slug>`. Each draft must print `put <name> → <file>#<section>`, and the command deletes the draft.
4. When the command prints `refused <name>: <errors>`, nothing was written for that draft. Correct the draft and run step 3 again.

To change a record, get it, change the text, write the draft and put it. A draft replaces the whole section.

## Change a field

Run `<wf> record set <root> <slug> <name> key=value ...`. A value reads as YAML: `[a, b]` is a list, `{k: v}` is a map, and `null` deletes the field. A key with dots names one field in a map: `progress.plan=complete`. `updated-at` moves by itself. Use it for the index fields that each stage changes, for example `<wf> record set <root> <slug> index current-stage=verify progress.verify=in-progress`.

A change to a list (for example, one more entry of `runtime-evidence-deferrals`) sets the whole list. When the list is long or its entries hold text, change the record as a draft instead.

The command reads the file, merges the change and writes the file in one step. So two writers lose no field, and a re-read before the change is not needed.

## Prohibitions

- Do not Write or Edit `state.yaml`, `meta.yaml` or any other record file. The pre-write check refuses it.
- Do not Write a record name beside the records, such as `.ai/workflows/<slug>/04-plan-api.md`. The check refuses it and names the draft path.
- Do not make an `.ai/` folder below the project root. The check refuses it.

## Workflows of the old layout

For one release, a workflow of the old layout keeps working. `record get` reads its Markdown files. The first `record put` or `record set` of a record writes its section and moves its old file to `.old/`, and `redirects.yaml` maps the old path to the new place. `<wf> record migrate <root> <slug>` does the same for every record of the workflow at once. `<wf> record where <root> <slug> <old path>` prints the new place of one old path.
