# Records (single source)

The records of a workflow are YAML files in its one folder, the wf-dir, and scripts write them. The wf-dir is `<root>/.ai/workflows/<slug>/`, or `<records home>/<project>/<slug>/` in a project that is linked to a records repo. The dispatch and the brief print it as `wf-dir: <absolute path>`, and the references write it as `<wf-dir>/`. An agent never writes a record file. It writes a draft, and `wf.mjs record put` checks the draft and writes the record.

In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root. Run `<wf> help <command>` for the forms and the flags of a command. Do not read the source of `wf.mjs` to learn them.

The path of `<skill-dir>` carries the plugin version, and an update removes it. A command that you save for a later session (a resume command, a command in a note or a record) names the stable entry point `node "$HOME/.sdlc/bin/wf.mjs"` when that file exists. Each session start points it at the installed plugin.

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
3. To read one part, add `--section <heading>` (the text under one `##` heading), `--field <path>` (one value, with a path of `record set`, for example `slices[api].status`) or `--outline` (the fields and the `##` headings, with their sizes). Do not pipe `record get` to `sed`, `head` or `grep`.
4. A record over 20 KB prints its outline. Add `--full` to print all of it.
5. Run `<wf> record list <root> <slug>` for the names of every record of the workflow.

A `<name>` of `get`, `set`, `edit` and `draft` can leave out `.md`, the number or the slice: `implement-api`, `05-implement` and `implement` name `05-implement-api.md` when no other record fits. When a name fits more than one record, the command lists them and exits 1.

You may also read a record file with the file-read tool. Each section has `name`, `frontmatter` and `body`.

## Write a record

1. Get the frontmatter template of the record type: `<wf> stamp <type> --slug <slug> [--slice <slice>]`.
2. Write the whole record, frontmatter and body, to the draft `<wf-dir>/.draft/<name>` with the file-write tool. The write-time checks run on the draft.
3. Run `<wf> record put <root> <slug>`. Each draft must print `put <name> → <file>#<section>`. The command moves the draft to `.draft/.put/<name>`, and `record stage-done` deletes it.
4. When the command prints `refused <name>: <errors>`, nothing was written for that draft. Correct the draft and run step 3 again.

## Change a body

1. To change one section, write its new text to a file and run `<wf> record edit <root> <slug> <name> --section <heading> --from <file>`. The heading stays.
2. To change one line or one phrase, run `<wf> record edit <root> <slug> <name> --replace "<old>" --with "<new>"`. The command refuses when `<old>` matches nothing or more than once, and says which.
3. `record edit` runs the checks of `record put` and needs no draft.
4. To change much of the body, run `<wf> record draft <root> <slug> <name>`, edit the draft that it names, and run `<wf> record put <root> <slug>`. A draft replaces the whole section. To edit the same record again in the same stage, edit `.draft/.put/<name>` and run `<wf> record put <root> <slug> <name>`.

## Change a field

Run `<wf> record set <root> <slug> <name> key=value ...`. A value reads as YAML: `[a, b]` is a list, `{k: v}` is a map, and `null` deletes the field. A key with dots names one field in a map: `progress.plan=complete`. `updated-at` moves by itself. Use it for the index fields that each stage changes, for example `<wf> record set <root> <slug> index current-stage=verify progress.verify=in-progress`.

A path form changes one item of a list:

| Form | Change |
|---|---|
| `list[<slug>].field=v` | a field of the item whose `slug` (or `id`, or `name`) is `<slug>`, for example `slices[api].status=in-progress` |
| `list[0].field=v` | a field of the item at a position, from 0 |
| `list+=v` | append an item, for example `runtime-evidence-deferrals+={slice: api, ac: AC-2, reason: "..."}` |
| `list-=v` | remove the equal item, or the item whose `slug` is `v` |

A value outside the enum of the schema is refused, and the refusal names the allowed values.

## Change several records

To change several records or several list items, or to read several records with a filter, write a script and run it with `<wf> run`, per [_api.md](_api.md). One script makes one commit, and a script that fails changes nothing.

The command reads the file, merges the change and writes the file in one step. So two writers lose no field, and a re-read before the change is not needed.

## Prohibitions

- Do not Write or Edit `state.yaml`, `meta.yaml` or any other record file. The pre-write check refuses it.
- Do not Write a record name beside the records, such as `<wf-dir>/04-plan-api.md`. The check refuses it and names the draft path. The check also refuses a Write of `decisions.yaml`, `findings.yaml` and `steps.jsonl`: `decide add`, `findings add` and `step` write them.
- Do not make an `.ai/` folder below the project root. The check refuses it.
- Do not edit `INDEX.md`: `wf.mjs` writes the row of a workflow each time its index changes.

## A linked project

A project that is linked to a records repo keeps each wf-dir in a clone, and the steps above do not change. The check refuses a write by a path in `.ai/workflows/` of a linked project, and names the wf-dir path. The rules of the clone, the lease, messages and the GitHub layer are in [_records-repo.md](_records-repo.md).

## Workflows of the old layout

For one release, a workflow of the old layout keeps working. `record get` reads its Markdown files. The first `record put` or `record set` of a record writes its section and moves its old file to `.old/`, and `redirects.yaml` maps the old path to the new place. `<wf> record migrate <root> <slug>` does the same for every record of the workflow at once. `<wf> record where <root> <slug> <old path>` prints the new place of one old path.
