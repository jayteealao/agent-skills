# Work packets and write-now pieces (brainstorm `done`)

`done` ends in work. Each agreed piece of work is one of two things:
- a **work packet**: the file `work/<slug>.md` for a piece that opens or extends a workflow slug. A successor workflow starts from it.
- a **write-now piece**: a piece that changes only documents. The brainstorm writes it in this session, after the person confirms the scope. It gets no packet and no successor workflow.

The board's `work` list stays the single truth. A script writes the packets from the board, so a kept decision reaches its packet word for word. Do not write a packet by hand, and do not edit a packet to change its content: change the board, then write again.

## What 3.3 agrees for each piece

Agree these with the person, in plain words, and give your view with its reason. Record them on the piece's `work` entry ([_artifact.md](_artifact.md)).

| Field | What to agree |
|---|---|
| `slug` | The workflow slug the piece opens, in kebab form. For an extension, the new scope's descriptor. |
| `shape` | The form (table below). |
| `target-slug` | For `extension`, `fix` and `hotfix`: the existing workflow slug. |
| `depends-on` | The pieces that must be done first, by key. |
| `needs` | A slice of another build piece that this piece needs before one of its own slices, when the two can still run in one campaign wave: `from` (the piece key), `through` (a slice of `from`, or `finished`), `before` (a slice of this piece, or empty), `why`. Use it only for a partial need. A piece that needs all of another piece before it starts uses `depends-on`. |
| `provides` | What this piece makes true, one line each, for example "the engine exposes one module contract". |
| `expects` | What this piece needs from an earlier piece's `provides` line: `from` (the piece key), `key` (the `provides` key), `text`. |
| `items` | The kept items the piece carries. |
| `shared` | A kept decision that two pieces carry. List it on each piece that carries it. |
| `research`, `references` | The research notes (`R<NN>`) and references (`F<NN>`, or a repo path) the piece draws on. |
| `design-form` | `design` or `design-direction` when a design focus adds the design stage to the piece ([_design.md](_design.md)); otherwise `none`. |
| `sketches` | With a design focus: the carried sketches, by key. The packet carries each key with its path under this board's `design/sketches/`. |

Propose the contract lines yourself. The person confirms them, changes them, or removes them.

### Forms

| Form | When |
|---|---|
| `intake` | A feature to build. |
| `investigate` | A problem to investigate first. |
| `discover` | A yes-or-no question to check. |
| `fix` | A correction to what a workflow built. Set `target-slug`. |
| `hotfix` | An urgent correction to a version that people already use. Set `target-slug` and `urgency: urgent`. |
| `task` | A deliverable that is not code and that a write-now piece cannot hold (below). |
| `extension` | New scope on a workflow that exists. Set `target-slug`. |
| `write-now` | A change to documents only. The brainstorm writes it in this session. |

`design` and `design-direction` are not forms. They are the `design-form` flag on the piece they serve.

### Size

Count the carried decisions of each piece: its kept decisions, not all its items.
- More than 25: propose a split, with its reason. The person may keep the piece whole.
- More than 40: the piece must be split before 3.4 confirms. Walk the split with the person, the same way as the rest of 3.3.

## Write-now pieces

A piece whose whole deliverable is a change to documents in the repository takes the form `write-now`. Examples: a section of a design document, a work brief, a research guide. A write-now piece writes no code, no test, no configuration, and no plan.

A piece stays a `task` when any of these is true:
- It changes a file that is not a document, such as code, a test, configuration, or CI.
- It acts outside the repository: an external service, a published page, an issue, or a sign-off. The `task` lifecycle keeps its gates for these.
- It rewrites a packet that is `prepared` or `routed` (see Reopening).
- The person chooses `task`.

Propose `task` instead of `write-now` when either of these is true, and give the reason:
- This session's context is more than 70 % used.
- The piece changes more than 6 documents.

The person decides.

### Run a write-now piece

Run each write-now piece after the board write in 3.4, before the packets are written. Run the pieces in `order`. A piece that another write-now piece depends on runs first.
1. Copy each document that the piece changes to `history/`, with the session number in the name: `history/<name>.s<session>.<ext>`.
2. Write the changes. Each changed section names the item keys that it carries, in an HTML comment: `<!-- brainstorm: <slug>#<item-key>, ... -->`.
3. Read back each changed section. Every carried decision key of the piece must appear in the changed text. A missing key is a failed check.
4. When a check fails, fix the text and read it back again. When the check fails a second time, stop and ask the person. Do not change the piece's form to `task` without the person.
5. Record the piece on the board: `state: written`, `written-files` (each path with its section), and `written-at`.

The `write` command (below) adds the entry to `work/changes.md` that lists the changed documents. A packet may list a write-now piece in `depends-on`. The dependency is met when the piece's `state` is `written`.

## Check and write the work set (3.4)

Run the commands from the project root. `<skill-dir>` resolves per [_host-invocation.md](../../_host-invocation.md).

1. After the board write, check the work set:
   ```
   node "<skill-dir>/scripts/work-packets.mjs" check .ai/workflows/<slug>
   ```
   The check fails on each of these:
   - an `expects` line with no matching `provides` line on a piece that this piece depends on;
   - a kept decision that lands in no piece, or in two pieces without `shared`;
   - a cycle in `depends-on`, or a `depends-on` key that is not a piece;
   - a `needs` entry on the piece itself, on a key that is not a piece, or on a piece that gets no packet;
   - a piece with more than 40 carried decisions;
   - a packet piece with no `slug`, or an `extension`, `fix` or `hotfix` piece with no `target-slug`;
   - a citation of `.scratch/` or another gitignored path (see the sources rules in [_artifact.md](_artifact.md)).

   Bring each failure to the person in plain words, with your proposal. Record the person's answer on the board, then check again. The check must pass before you continue.
2. Run each write-now piece (above).
3. Write the work set:
   ```
   node "<skill-dir>/scripts/work-packets.mjs" write .ai/workflows/<slug>
   ```
   The command writes each packet to `work/<slug>.md`, then `research/index.md`, then `work/index.md` last, and appends one entry to `work/changes.md`. A reader that sees the new `work-revision` in `work/index.md` finds every packet already written.
4. Read `work/index.md`. Set each piece's `entry` on the board to its start command from that file.

A packet says at its top that the board wins on a difference.

## Next

- One packet: print its start command as `Next`.
- Two or more packets: print the start commands of the first wave in `work/index.md` as `Next`, and the path of `work/index.md`.
- No packet (only write-now pieces): print the resume command, or `/wf close <slug>` when no thread is live.

Never print a write-now piece as a `/wf task` command.

## Reopening a work set

A person can resume a brainstorm at any time, also while the packets run.
- **The brainstorm owns the board and the packets.** A successor writes only the link-back fields: the piece's `state` and `routed-to` on the board, and the same fields on the packet.
- **Each change has a revision.** Each `write` that changes the work set adds 1 to `work-revision` and appends one entry to `work/changes.md`.
- **A started packet is never rewritten.** A packet whose `state` is `prepared` or `routed` keeps its text. The `write` command keeps it, and puts the regenerated text in `history/` beside it. A new decision about its slug becomes a new piece:
  - `extension` when it adds scope to the slug;
  - `fix` when it corrects what the slug built;
  - `hotfix` when it is urgent and corrects a version that people already use.

  The new piece sets `target-slug` to the slug and `amends` to the key of the started piece.
- **A cut of a started piece is a question.** When the person cuts a kept decision whose piece is `prepared` or `routed`, record the decision's `scope: pending-cut`, not `cut`. Removing built work is a revert, and a revert is the person's decision. Tell the person that the work stays until the person decides.
- **Changed decisions come back.** On a resume, read each packet in `work/`. A packet with `decision-changed` lists decisions that the person changed at intake. Show each one in plain words, with the old text and the new answer from the successor's `po-answers.md`, and ask the person to record it on the board.

## Quick capture: `add`

`/wf brainstorm <brainstorm-slug> add <text>` records one new piece of work without a full session, for example a bug that the person found while trying a built piece.
1. Record the text on the board as an item on the thread it belongs to: a `decision` when the person states what to do, an `idea` otherwise.
2. Ask one batch per [_gate-question.md](../../_gate-question.md): the form (`fix`, `hotfix`, `extension`, or `intake`), the target slug, and the urgency.
3. Add the piece to the board's `work` list, run the check, then run the `write` command.
4. Return the new packet's start command as `Next`.

A reopened brainstorm and the `add` capture run in a brainstorm session. The brainstorm session writes the board and the packets. No other session writes them.

## An older board

A board from before work packets gets the folders on its next `done`. The coherence pass ([_cohere.md](_cohere.md)) lists each citation of `.scratch/` or another gitignored path, and asks the person whether to copy each file into `references/` or to record a pointer row.
