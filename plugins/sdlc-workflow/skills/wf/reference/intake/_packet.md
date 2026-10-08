# Intake from a work packet

A brainstorm's `done` writes one work packet per piece of work ([brainstorm/_work.md](brainstorm/_work.md)). This file starts the piece's workflow from its packet:

```
/wf intake .ai/workflows/<brainstorm-slug>/work/<work-slug>.md
```

The packet carries the person's decisions word for word. A decision is the person's answer, and re-wording the answer is how intent drifts. So the decisions in a packet are confirmed with the person, not re-verified and not re-worded. The findings and the assumptions in a packet are facts, and intake re-verifies them as usual.

## Step 1 — Resolve the packet

1. Read the packet in full, and read `work/index.md` beside it.
2. When the packet's `state` is `prepared` or `routed`, do not continue. Tell the person: *"This packet already started `<routed-to>`. Continue that workflow, or ask the brainstorm for a new packet."*
3. Check each `depends-on` key in `work/index.md`:
   - a packet dependency is done when the `00-index.md` of its `routed-to` workflow has `status: complete` or `status: closed`;
   - a write-now dependency is done when its piece on the board has `state: written`.

   When a dependency is not done, name it in plain words and ask the person whether to start anyway, per [_gate-question.md](../_gate-question.md). The person decides.
4. The new workflow's slug is the packet's `work-slug`. Do not derive another slug. When `.ai/workflows/<work-slug>/` exists, ask the person for a new slug, per the collision rule in [_intake-context.md](_intake-context.md).
5. Run the packet's `form` with that slug. The token `from <origin-brainstorm>` is implied: apply [_intake-provenance.md](_intake-provenance.md) with the packet's piece of work as the routed piece.

| `form` | Run |
|---|---|
| `intake` | [default.md](default.md) |
| `investigate`, `discover`, `fix`, `hotfix` | `intake/<form>.md`, standalone. For `fix` and `hotfix`, the brief names `target-slug` as the workflow whose work is corrected, and reads its artifacts as context. |
| `task` | [../task.md](../task.md) |
| `extension` | [extend.md](extend.md) on `target-slug`, with the packet as the scope. |

## Step 2 — Confirm the carried decisions

Do this before the mode's own questions.
1. Show the packet's `carried-decisions` in groups of up to 8, word for word, each with its date and session. Ask one question per group, per [_gate-question.md](../_gate-question.md): keep them all, or change some (free text says which and how).
2. A kept decision is a question the person already answered. Do not ask it again.
3. A changed decision is the person's new answer. Record it in `po-answers.md` with the item key and the old text. Add the key to the packet's `decision-changed` list. Do not edit the brainstorm's board: the brainstorm owns it, and its next resume asks the person to record the change.

## Step 3 — Seed the workflow

- The Restated Request starts from the packet's title and its carried decisions, as confirmed in Step 2.
- Each carried decision goes into the Known Constraints word for word, with its source `<board path>#<item-key>`.
- A charter entry that comes from a carried decision sets `source: <board path>#<item-key>`. A RIM that comes from a carried decision cites the same key.
- Record `origin-packet: <packet path>` and `origin-items` (every item key in the packet) in `00-index.md`.
- The open ideas and the open questions of the packet go into this mode's question rounds. Intake still asks its own questions for the gaps that the packet leaves open.
- The findings and the assumptions are re-verified per [_intake-provenance.md](_intake-provenance.md). A contradicted finding becomes a known unknown.
- The items under "Left for later and cut" join the out-of-scope list, so the workflow does not re-widen.
- Copy each file of the packet's `sketches:` into `.ai/workflows/<work-slug>/design/sketches/`. Keep its key as the file name (`design/_boards.md`). A sketch with `path: null` has no file to copy.

## Step 4 — Link back

When the mode completes, set the packet's `state: prepared` and `routed-to: <work-slug>`. Change no other field of the packet: the write hook refuses any other change to a started packet. Set the same two fields on the piece in `brainstorm-board.json`. Shape sets both to `routed` (`shape.md`, Step 9b).

The older form `/wf intake <description> from <brainstorm-slug>` keeps working, through [_intake-provenance.md](_intake-provenance.md).
