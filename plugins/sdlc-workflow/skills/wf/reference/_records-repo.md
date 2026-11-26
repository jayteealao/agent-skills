# The records repo

This card is for a project that is linked to a records repo. Step 0 of `SKILL.md` sends you here when the dispatch prints a records line that needs action. A project with no link does not need this card. [_records.md](_records.md) holds the rules of every record.

In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

## The clone

A project that is linked (`<wf> records link <root> <project>`) keeps its records in the clone of the records repo, `~/.sdlc/records/<project>/`. Each workflow has one folder there, its wf-dir, which the dispatch and the brief print as `wf-dir:`. Every file of the workflow (records, evidence, notes, drafts) is in the wf-dir, so the steps of [_records.md](_records.md) do not change. Git ignores `.draft/`. The pre-write check refuses a write by a path in `.ai/workflows/` and names the wf-dir path. Give a test runner or a shell redirect the wf-dir path too. `wf.mjs` commits the records at each step and stage boundary, and pushes them in the background. The dispatch commits nothing and fetches nothing. A pull runs only when this computer claims or takes over a workflow, at `<wf> records sync <root>`, and at `<wf> msg list`.

- When two or more computers use the records repo, one computer writes a workflow at a time: the dispatch claims its lease. To continue on another computer, run `<wf> lease release <root> <slug>` on this one first. With one computer, there is no lease. `<wf> records close <root> <slug>` does the same at the end of a session: it commits the workflow, pushes it and releases its lease.
- Read the records of another project, but do not change them. To ask that project for something, post a message to it.

### With the compose sync

When `~/.sdlc/config.json` of this computer sets `sync: compose` under `records`, `wf.mjs` commits nothing at a step. Each change is saved in the wf-dir, and the committer, one process per computer, sends the changes about one minute later. An answer, a message or a close goes at once. A command says `saved`, not `committed`. When the work must reach the remote now (a hand-over, or the end of a session), run `<wf> records flush <root> <slug>`: it waits for the push. Exit 1 means that the push did not land, and the line names the reason. A sync that failed, a workflow that another computer owns, or a change that waits over 5 minutes shows in the records line of the dispatch.

## Records lines

The dispatch prints one records line, or none when the records are in order. In the commands of the line, `wf.mjs` is `<wf>`.

| Line | Action |
|---|---|
| `records: ask "<question>" yes=<command> no=<command>` | Ask the question once, per [_gate-question.md](_gate-question.md), with Yes first. Run the command of the answer. When the command exits 0, run the key. When it exits 1, tell the person its output in one line. Stop. |
| `records: stop <reason>` | Do not run the key, and stop a stage that runs. Tell the person the reason in one line. Stop. |

The script writes each question and its commands:
- A push of the records, a records commit, or a send of the GitHub layer failed, or GitHub edits wait for more than one day. Yes retries in the background, and the next `/wf` call shows the result. No asks again only about a newer failure.
- Another computer owns the workflow (a take-over: yes runs `<wf> records take`), or two or more computers use the records and the workflow has no owner (a claim: yes runs `<wf> records claim`). No runs `<wf> records decline`, and this computer does not write the workflow now.
- A stop line names another computer that writes the workflow now, a second computer, a failed pull, a live branch of an older version, or a conflict. For the details, run `<wf> records status <root> --problems`.

A command or the pre-write check prints an `owner-lost:` line when another computer owns the workflow now. Act on it as on a stop line.

A `records-warning: … not committed` line means that the change is saved on this computer and that no commit holds it. Do not make the change again. Put the line in the report of the stage, and run `<wf> records retry <root> <slug>` one time. When it fails, tell the person the reason.

## The owner of a workflow

The file `owner` of a wf-dir names the one computer that writes the workflow, and an epoch: `<machine> <epoch>`. It travels in the commits with the work, so a computer that is not the owner cannot send the workflow: its sync keeps its copy on a branch `conflict/<machine>-<id>` of the records repo, and nothing is lost.

| Command | Effect |
|---|---|
| `<wf> records claim <root> <slug>` | Make this computer the owner of a free or new workflow. The claim works when its push lands. Offline, only a workflow that never reached the remote starts. |
| `<wf> records take <root> <slug>` | Take a workflow over from another computer. Run it only after the person said yes to the take-over question: the later work of the other computer is parked. |
| `<wf> records release <root> <slug> [--to <machine>]` | Send the workflow, then give it up, or hand it to that computer. When a push fails, this computer stays the owner. |
| `<wf> records parked <root>` | List the parked copies. `parked show <root> <branch>` lists their files, and `parked take <root> <branch> <path>` copies one file in (only the owner). `parked drop <root> <branch>` deletes a copy: ask the person first. |

A close sends the workflow and keeps the owner. A close whose push failed exits 1: run `<wf> records flush <root> <slug>` when the remote can be reached.

## Link lines

`<wf> records link` prints a `records-conflict: <file>` line for each local file whose clone copy stays. The local copy is in `.ai/workflows/.conflicts/`. Tell the person to compare the two copies, then delete the kept copy. When there are several conflicts and each has a recommended resolution, ask per "A list of items" of [_gate-question.md](_gate-question.md): "Apply each recommendation (Recommended)" or "Go through them one by one".

## Messages

A message informs; it is never a decision. Each message is one file in the `inbox/` folder of a workflow, and only `wf.mjs` writes it.

1. To post, run `<wf> msg post <root> <slug> --kind <handoff|review-request|question-for-project|note> --text "<text>"`. Add `--to <project>` to post to a workflow of another project.
2. To see the messages, run `<wf> msg list <root> <slug>`. A `*` marks a message that this computer has not read.
3. To read one, run `<wf> msg read <root> <slug> <id>`. The read is recorded for this computer only.

## The GitHub layer

When the records repo is set up, each workflow has one issue in it, with a status block at the end of its body. `wf.mjs` keeps the issues: each command that changes the state of a workflow queues one edit, and each answer that `decide add` records queues one comment. The queue goes out in order, in the background: the dispatch starts the send, and the send runs until the queue is empty. The comments of the person come back in the same background send, and at `<wf> msg list`.

- Do not read the issues or the board for the state of a workflow. The records are the truth.
- Do not write to the issues with `gh`. `wf.mjs` is the only writer. A message goes to the issue as a comment, and a comment of the person comes back as a message.
- To see what is queued, what is parked and which issue belongs to each workflow, run `<wf> gh status <root>`. `<wf> records status <root>` gives the parked count.
- An entry that fails three sends is parked, so the entries after it go out. A failure of the `gh` sign-in or a rate limit parks nothing: it stops the send and puts the parked entries back in the queue, and the next send after the person signs in, or after the limit resets, sends them.
