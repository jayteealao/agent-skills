# The records repo

This card is for a project that is linked to a records repo. Step 0 of `SKILL.md` sends you here when the dispatch prints a records line that needs action. A project with no link does not need this card. [_records.md](_records.md) holds the rules of every record.

In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

## The clone

A project that is linked (`<wf> records link <root> <project>`) keeps its records in the clone of the records repo, `~/.sdlc/records/<project>/`. The drafts stay in `.ai/workflows/<slug>/.draft/`, so the steps of [_records.md](_records.md) do not change. Every other file of the workflow (evidence, notes, `INDEX.md`) is in the clone too: the dispatch prints the folder as `records-dir:`, the brief names it, and `<wf> path <root> <slug> <file>` prints the real place of one file. The pre-write check refuses a write of such a file by its local path and names the real place. A file that a command writes by the local path (a test runner, a shell redirect) moves into the clone at the next records commit. `wf.mjs` commits the records at each step and stage boundary, pushes them when the network is there, and pulls the work of other computers at each `/wf` call.

- One computer writes a workflow at a time: the dispatch claims its lease. To continue on another computer, run `<wf> lease release <root> <slug>` on this one first.
- Read the records of another project, but do not change them. To ask that project for something, post a message to it.

## Records lines

Act on each line of the dispatch result as this table says.

| Line | Action |
|---|---|
| `records-conflict: <workflow>: <why>` | Two computers changed the same record. Do not run the key. Tell the person, and give `<wf> records status <root>`. When there are several conflicts and each has a recommended resolution, ask per "A list of items" of [_gate-question.md](_gate-question.md): "Apply each recommendation (Recommended)" or "Go through them one by one". STOP. |
| `records-warning: <workflow>: <what>` | The clone has files that no commit holds, commits that are not pushed or pulled, a local copy that it kept aside, or a failed background step. Tell the person in one line, with `<wf> records status <root>`, then run the key. |
| `lease-lost: <slug> by <machine> until <time>` | This computer held the lease, and another computer took it. Do not run the key, and stop a stage that runs. Tell the person that the other computer writes the workflow now. STOP. |
| `lease-held: <slug> by <machine> until <time>` | Another computer writes this workflow now. Do not run the key. Tell the person that the work continues here after `<wf> lease release` runs on that computer, or after the time. STOP. |
| `lease-expired: <slug> by <machine> since <time>` | Ask the person once, per [_gate-question.md](_gate-question.md): "The lease of <machine> on `<slug>` expired at <time>. Take the workflow over on this computer?" On yes, run `<wf> lease claim <root> <slug> --take`, then the key. On no, STOP. |
| `lease-offline: <slug>` | Ask the person once: "The records repo cannot be reached, so no other computer knows that `<slug>` runs here. Continue?" On yes, run the key. On no, STOP. |

A command or the pre-write check prints the same `lease-lost:` line when it sees the lease of another computer. Act on it as the table says.

## Messages

A message informs; it is never a decision. Each message is one file in the `inbox/` folder of a workflow, and only `wf.mjs` writes it.

1. To post, run `<wf> msg post <root> <slug> --kind <handoff|review-request|question-for-project|note> --text "<text>"`. Add `--to <project>` to post to a workflow of another project.
2. To see the messages, run `<wf> msg list <root> <slug>`. A `*` marks a message that this computer has not read.
3. To read one, run `<wf> msg read <root> <slug> <id>`. The read is recorded for this computer only.

## The GitHub layer

When the records repo is set up, each workflow has one issue in it, with a status block at the end of its body. `wf.mjs` keeps the issues: each command that changes the state of a workflow queues one edit, and each answer that `decide add` records queues one comment. The queue goes out in order at the next `/wf` call.

- Do not read the issues or the board for the state of a workflow. The records are the truth.
- Do not write to the issues with `gh`. `wf.mjs` is the only writer. A message goes to the issue as a comment, and a comment of the person comes back as a message.
- To see what is queued and which issue belongs to each workflow, run `<wf> gh status <root>`.
