# Work packets and write-now work packets (brainstorm `done`)

`done` ends in one list. Each agreed work packet is one of two things:
- a **work packet**: the file `work/<packet-slug>.md` (`type: packet`) for a work packet that opens or extends a workflow slug. The list is `work/index.md` (`type: list`). The campaign walk builds the work packets in list order, one at a time, on the list branch `packets/<slug>` (`/wf campaign <slug>`).
- a **write-now work packet**: a work packet that changes only documents. The brainstorm writes it in this session, after the person confirms the list. It gets no work packet file and no workflow.

The board's `work` list stays the single truth. A script writes the work packet files from the board, so a kept decision reaches its work packet word for word. Do not write a work packet file by hand, and do not edit a work packet file to change its content: change the board, then write again.

## What 3.3 agrees for each work packet

Agree these with the person, in plain words, and give your view with its reason. Record them on the work packet's `work` entry ([_artifact.md](_artifact.md)).

| Field | What to agree |
|---|---|
| `slug` | The workflow slug the work packet opens, in kebab form. For an extension, the new scope's descriptor. When the slug is a reserved slug name ([../_intake-context.md](../_intake-context.md)), or `.ai/workflows/<slug>/` exists for other work, ask the person for a new slug. |
| `shape` | The form (table below). |
| `target-slug` | For `extension`, `fix` and `hotfix`: the existing workflow slug. |
| `order` | The place of the work packet in the list. Every work packet has one, write-now work packets included. The orders are 1 to n, each used once. The list is the safe serial order: work packet N may use anything that work packets 1 to N−1 built. |
| `why-here` | On each work packet after order 1: why the work packet comes after the work packets before it, in the person's words, for example "billing waits until the limits ship". When the position has no reason other than value, the note says so, for example "less urgent than the work packets before it". |
| `items` | The kept items the work packet carries. Each kept decision is in exactly one work packet. |
| `research`, `references` | The research notes (`R<NN>`) and references (`F<NN>`, or a repo path) the work packet draws on. |
| `design-form` | `design` or `design-direction` when a design focus adds the design stage to the work packet ([_design.md](_design.md)); otherwise `none`. |
| `sketches` | With a design focus: the carried sketches, by key. The work packet file carries each key with its path: `.ai/design/explore/<key>.html`, or a path under this board's `design/sketches/` on an older board. |

Propose the order and each `why-here` note yourself, with the reason. Put first the smallest work packet that shows the thinking is right. The person confirms them or changes them. Do not ask for `depends-on`, `needs`, `provides` or `expects`: the walk builds the work packets in list order, one at a time.

### The write-up of a build work packet

The brainstorm writes each build work packet (form `intake`, `fix`, `hotfix`, `extension`) in full at `done`. No intake and no shape run for a work packet: `campaign.mjs open` writes its `01-intake.md` and `02-shape.md` from these fields, word for word. Write them yourself from the board, and show them in the confirmation of 3.4.

| Field | What to write |
|---|---|
| `goal` | One or two plain sentences: the outcome of the work packet. |
| `in-scope`, `out-of-scope` | One line per item. The items left for later and the cut items of the work packet's threads belong in `out-of-scope`. |
| `acceptance-criteria` | One checkable criterion per entry. The work packet file numbers them `AC-1`, `AC-2`, and so on. |
| `constraints` | The constraints that are not carried decisions. `open` copies each carried decision into the Known Constraints by itself, so do not repeat one here. |
| `risks` | Each way the work packet can be misread or fail, one line each. `open` seeds the intent-risks of the work packet from them. |
| `ux-impact`, `ux-impact-confirmed` | Propose `none`, `visual`, `flow` or `new-surface` per `design/_lane.md`. The person confirms it. Then write `ux-impact-confirmed: true`. |
| `try-out` | `yes` when `ux-impact` is not `none`, or when the work packet adds a user-facing command. Otherwise `no`. The person confirms it. A work packet with `try-out: yes` gets a try-out pause in the walk. |
| `estimated-slices` | Your estimate of the capability slices of the work packet (Size, below). |

**The stack.** Detect the stack once for the list: run the probes in `intake/default/_stack-fingerprint.md`. Ask the person to confirm or correct it. Write it to the board's top-level `stack` with `user-confirmed: true`. The `write` command copies it into `work/index.md`, and `open` copies it into each work packet.

### Forms

| Form | When |
|---|---|
| `intake` | A feature to build. |
| `investigate` | A problem to investigate first. |
| `discover` | A yes-or-no question to check. |
| `rca` | A defect whose cause is not known. |
| `fix` | A correction to what a workflow built. Set `target-slug`. |
| `hotfix` | An urgent correction to a version that people already use. Set `target-slug` and `urgency: urgent`. |
| `task` | A deliverable that is not code and that a write-now work packet cannot hold (below). |
| `extension` | New scope on a workflow that exists. Set `target-slug`. |
| `write-now` | A change to documents only. The brainstorm writes it in this session. |

`intake`, `fix`, `hotfix` and `extension` are the build forms: the walk builds them. The walk routes an `investigate`, `discover`, `rca` or `task` work packet to the command of its form. `design` and `design-direction` are not forms. They are the `design-form` flag on the work packet they serve.

### Size

The number of carried decisions does not size a work packet. Apply these rules:
1. Each work packet is one deliverable in one area of the product. Engine and platform work packets are deliverables too, but they have nothing for the person to try.
2. A work packet holds one family of outcomes, so the setup cost of the family is paid once. Two areas that the person tries together can be one work packet.
3. Engine and platform work get work packets of their own.
4. A work packet has a target of 10 capability slices, in a band of 6 to 14. A capability slice is a group of mechanisms that verify checks together. When you expect an area to need more than 14, split the area at a point where the first part is complete.
5. The number of work packets has no cap.
6. Every kept decision of the board goes into exactly one work packet.

Record your estimate as `estimated-slices`. The slice stage counts the real slices.

## Write-now work packets

A work packet whose whole deliverable is a change to documents in the repository takes the form `write-now`. Examples: a section of a design document, a work brief, a research guide. A write-now work packet writes no code, no test, no configuration, and no plan.

A work packet stays a `task` when any of these is true:
- It changes a file that is not a document, such as code, a test, configuration, or CI.
- It acts outside the repository: an external service, a published page, an issue, or a sign-off. The `task` lifecycle keeps its gates for these.
- It rewrites a started work packet (see Reopening).
- The person chooses `task`.

Propose `task` instead of `write-now` when either of these is true, and give the reason:
- This session's context is more than 70 % used.
- The work packet changes more than 6 documents.

The person decides.

### Run a write-now work packet

Run each write-now work packet after the board write in 3.4, before the work packet files are written. Run the work packets in list order.
1. Copy each document that the work packet changes to `history/`, with the session number in the name: `history/<name>.s<session>.<ext>`.
2. Write the changes. Each changed section names the item keys that it carries, in an HTML comment: `<!-- brainstorm: <slug>#<item-key>, ... -->`.
3. Read back each changed section. Every carried decision key of the work packet must appear in the changed text. A missing key is a failed check.
4. When a check fails, fix the text and read it back again. When the check fails a second time, stop and ask the person. Do not change the work packet's form to `task` without the person.
5. Record the work packet on the board: `state: written`, `written-files` (each path with its section), and `written-at`.

The `write` command (below) adds the entry to `work/changes.md` that lists the changed documents. A write-now work packet earlier in the list is done when its `state` is `written`.

## Check and write the list (3.4)

Run the commands from the project root. `<skill-dir>` resolves per [_host-invocation.md](../../_host-invocation.md).

1. After the board write, check the list:
   ```
   node "<skill-dir>/scripts/campaign.mjs" check .ai/workflows/<slug>
   ```
   The check fails on each of these:
   - a work packet with no `order`, or a list with a gap or a repeat: the orders are 1 to n, each used once;
   - a work packet after order 1 with no `why-here` note;
   - a kept decision that lands in no work packet, or in two work packets;
   - a work packet with no `slug`, two work packets with one slug, or an `extension`, `fix` or `hotfix` work packet with no `target-slug`;
   - a build work packet with no `goal`, no `acceptance-criteria`, or a `ux-impact` that the person did not confirm;
   - a build work packet with `try-out: no` and a `ux-impact` other than `none`;
   - a list with build work packets and no `stack` with `user-confirmed: true`;
   - a sketch that is still an idea, or a carried sketch that is in no work packet;
   - a citation of `.scratch/` or another gitignored path (see the sources rules in [_artifact.md](_artifact.md)).

   The check warns on a build work packet with no `estimated-slices`, and on an estimate above 14 or below 6. On a warning, propose a split or a merge to the person, with its reason. The person may keep the work packet.

   Bring each failure to the person in plain words, with your proposal. Record the person's answer on the board, then check again. The check must pass before you continue.
2. Run each write-now work packet (above).
3. Write the list:
   ```
   node "<skill-dir>/scripts/campaign.mjs" write .ai/workflows/<slug>
   ```
   The command writes each work packet file to `work/<packet-slug>.md`, then `research/index.md`, then `work/index.md` last, and appends one entry to `work/changes.md`. A reader that sees the new `list-revision` in `work/index.md` finds every work packet file already written. The command moves the files of the old work packets to `work/archive/packets/`.
4. Set each work packet's `entry` on the board: `/wf campaign <slug>` for a build work packet, and the command of its form for any other work packet, for example `/wf intake investigate <packet-slug>`.
5. Run the archive command ([_artifact.md](_artifact.md), Archive).

A work packet file says at its top that the board wins on a difference.

## Next

- One build work packet or more: print `/wf campaign <slug>` as `Next`, and the path of `work/index.md`. The walk builds the work packets in list order, and it routes each other work packet to its command.
- Only work packets of other forms: print the command of the work packet with the lowest order as `Next`.
- No work packet (only write-now work packets): print the resume command, or `/wf intake <slug> close` when no thread is live.

Never print a write-now work packet as a `/wf intake task` command.

## Reopening a list

A person can resume a brainstorm at any time, also while the walk runs.
- **The brainstorm owns the board and the work packet files.** The walk writes only the `state` of a work packet file, through `campaign.mjs`.
- **Each change has a revision.** Each `write` that changes the list adds 1 to `list-revision` and appends one entry to `work/changes.md`.
- **A started work packet is never rewritten.** A work packet whose `state` is `open`, `built`, `done` or `dropped` keeps its text. The `write` command keeps it, and puts the regenerated text in `history/` beside it. A new decision about its slug becomes a new work packet:
  - `extension` when it adds scope to the slug;
  - `fix` when it corrects what the slug built;
  - `hotfix` when it is urgent and corrects a version that people already use.

  The new work packet sets `target-slug` to the slug and `amends` to the key of the started work packet.
- **A cut of a started work packet is a question.** When the person cuts a kept decision whose work packet is started, record the decision's `scope: pending-cut`, not `cut`. Removing built work is a revert, and a revert is the person's decision. Tell the person that the work stays until the person decides.

## Quick capture: `add`

`/wf intake brainstorm <brainstorm-slug> add <text>` records one new work packet without a full session, for example a problem that the person found while trying a built work packet.
1. Record the text on the board as an item on the thread it belongs to: a `decision` when the person states what to do, an `idea` otherwise.
2. Ask one batch per [_gate-question.md](../../_gate-question.md): the form (`fix`, `hotfix`, `extension`, or `intake`), the target slug, and the urgency. Propose the write-up of the work packet, its `ux-impact` and its `try-out`, and ask the person to confirm them.
3. Put the work packet in the list:
   - A `fix` or `hotfix` work packet goes before the first work packet that the walk has not sliced: a work packet with `state: written` or `state: open` whose workflow has no `03-slice.md`.
   - Any other work packet goes last.

   Give it its `order`, add 1 to the order of each work packet after it, and write a `why-here` note that the person confirms.
4. Run the check, then run the `write` command.
5. Return `/wf campaign <brainstorm-slug>` as `Next`.

A reopened brainstorm and the `add` capture run in a brainstorm session. The brainstorm session writes the board and the work packet files. No other session writes them, except the regroup of a migration (below) and the `state` field. The walk sets `state` through `campaign.mjs`. The mode of a routed work packet sets `state: open` ([../_intake-provenance-consume.md](../_intake-provenance-consume.md), Link back).

## Regroup (the migration of an old campaign)

The first `/wf campaign <slug>` on a board with an old campaign ledger migrates it (`campaign/_migrate.md`). After `migrate apply`, the board holds a `done` work packet for each shipped unit and an `open` work packet for each in-flight unit. The walk then runs this regroup in its own session, with the person:
1. Give each kept decision that two or more work packets hold one home. Run `node "<skill-dir>/scripts/campaign.mjs" migrate "<root>" <slug> regroup --dry-run`. The rule is the earliest live owner: a `done` or `open` work packet keeps the decision; otherwise the first not-started unit of the old ledger, in list order, gets it; a work packet that was no unit of the ledger keeps none. Tell the person the rule and the counts of `groups`. On a yes, run the command again without `--dry-run`. Then ask the person for a home for each decision of `unsettled`. Do not move a shared decision with a script of your own.
2. Take the units that are not started, in their old order. Propose work packets from them under the Size rules. Every kept decision goes into exactly one work packet. Do not confirm the decisions again. When you merge work packets, count their decisions after step 1, not before.
3. A unit with intake and shape already written (`01-intake.md` and `02-shape.md`) can stay one work packet. Keep its slug as the work packet slug. `open` then keeps its folder, and the walk does not slice it again when it has `03-slice.md`.
4. A unit with a settled design (`02c-craft.md` with boards) keeps it. When the unit becomes one work packet, keep its slug as the work packet slug, and its design files stay. When the unit goes into a larger work packet, move its `02c-craft.md` and its `design/` folder into `.ai/workflows/<packet-slug>/` before the walk opens the work packet: write the output of `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <unit-slug> 02c-craft.md` to the draft `.ai/workflows/<packet-slug>/.draft/02c-craft.md`, run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <packet-slug>` (per [_records.md](../../_records.md)), and move the `design/` folder. The design stage of the work packet then starts from them.
5. Write the write-up of each new build work packet, and confirm the stack, as at `done`.
6. Confirm the whole list with the person as in 3.4: the `done` work packets, the in-flight work packets first, then the new work packets. The person can merge, split, reorder or drop work packets. Follow the regroup rules of `campaign/_migrate.md` step 7: settle each wait, confirm in batches, split or keep, give the size.
7. Run the check and the `write` command.

## An older board

A board from before work packets gets the folders on its next `done`. The coherence pass ([_cohere.md](_cohere.md)) lists each citation of `.scratch/` or another gitignored path, and asks the person whether to copy each file into `references/` or to record a pointer row.

A board from before the list fails the next check when its orders are not 1 to n, when a work packet after order 1 has no `why-here` note, when a kept decision is in two work packets (the old `shared` field), or when a build work packet has no write-up. Propose the order, the notes, one home for each shared decision, and the write-up, and ask the person to confirm them. Its `depends-on`, `needs`, `provides`, `expects`, `size` and `shared` fields stay on the board, but the `write` command does not put them into a work packet file.
