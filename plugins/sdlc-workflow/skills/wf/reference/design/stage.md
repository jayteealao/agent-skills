# Design stage (`design/stage.md`)

The human-only stage between `shape` and `slice`. It turns the brief into a design the person confirms, so every later stage builds against a decision a person made. [_lane.md](_lane.md) holds the rule that puts this stage before every driven stage.

| | Detail |
|---|---|
| Requires | See [design.md → ## Requires](../design.md#requires). |
| Produces | `02c-craft.md` (type `design-contract`); the boards in `design/` and the frozen revision `design/r<N>/` ([_boards.md](_boards.md)); `00-index.md` updates |
| Next | `/wf slice <slug>` (`/wf plan <slug>` for an `rca` workflow, which has no slice stage; `/wf plan <slug> <first-new-slice>` after an extension) — or `/wf auto <slug>` / `/wf yolo <slug>`, which may start now |

## Step 0 — Orient

1. Read `00-index.md`. When `status: closed`, STOP: *"Workflow `<slug>` is closed. Use `/wf status recap <slug>` to reopen."*
2. When a driver (`auto` or `yolo`) invoked this stage, STOP. Route the person to `/wf design <slug>`. A driver never resolves a design direction.
3. When `02-shape.md` is missing or not complete, STOP and route to `/wf shape <slug>`.
4. When `ux-impact: none`, ask one gate question per [_gate-question.md](../_gate-question.md): change `ux-impact` to `visual`, `flow`, or `new-surface` and continue, or keep `none` and write the skip record. On `none`, write `progress.design: skipped` and `design-skip-reason:`, then STOP with the next step `/wf slice <slug>`.
5. When `progress.design: in-progress`, the design is reopened per [_lane.md](_lane.md): run Amend. Otherwise, when `02c-craft.md` already carries `direction-confirmed-by:` and the invocation is not `amend` and names no move, report the confirmed design and STOP. Next: `/wf slice <slug>`. When it carries `direction-confirmed-by:` and the invocation names a move → run the **Move pass** below. Do not run Step 1.

## Step 1 — Load the design record

1. Load [_design-context.md](_design-context.md) and [_preflight.md](_preflight.md) in full, and the register reference ([brand.md](brand.md) or [product.md](product.md)).
2. Read `PRODUCT.md`. When it is missing, empty, or carries `[TODO]` markers, run `/wf design setup` now with the person, then continue.
3. Read `DESIGN.md`, `.ai/design/current.md`, and `.ai/design/direction.md`. When a `.ai/design/` file is missing, create it from the [record.md](record.md) template with `[TODO]` sections and tell the person. Do not stop.
4. When the person named a move, read `design/<move>.md`. The move focuses the contract; it does not widen the scope of `02-shape.md`.

## Step 1b — Present the carried design thoughts

When a design brainstorm left thoughts for this workflow, follow [_carried.md](_carried.md) → At the design stage: present them, walk them with the person, and ask their open questions. The kept set is the starting direction for Step 4. When nothing is carried, continue.

## Step 2 — Make sure the brief exists

When `02b-design.md` is missing, author it now per [shape.md](shape.md). The person is present, so ask the discovery round there. Record `current-stage: design` while you work.

## Step 3 — Inspect the code

Run the four codebase inspection sub-agents from [_preflight.md](_preflight.md) → Preflight gates. Reuse the `stack:` block where it answers the question. Add one duty to the surface ranger: list every existing surface the brief touches and its entry in `.ai/design/current.md`.

When the product already exists and the stack can run it, capture every touched surface in its current state into `design/source/captures/` now. The boards start from these captures.

## Step 3b — Directions (when the direction is open)

Run this step only when `ux-impact: new-surface` and no direction is confirmed yet (no carried direction the person kept at Step 1b, no `teach` answer that settles it). Otherwise, continue at Step 4.

1. Ask one gate question per [_gate-question.md](../_gate-question.md): *"The direction is open. Draw three directions of the main surface first, or draw the boards now?"* On "boards now", continue at Step 4.
2. Choose three directions (up to five when the person asks). Give each a name that describes it (Quiet, Editorial, Dense — never "Option A") and one named axis: layout, density, personality, motion, or interaction model. No two directions share a position on an axis. Two directions that differ only in accent color or copy are one direction: replace one.
3. Draw each direction of the main surface as a sketch, `design/sketches/direction-<name>.html`, full size, in realistic surrounding context, with real copy and the tokens of `DESIGN.md`. Every direction meets the craft bar on its own.
4. Run `render` (no keys) and `sheet` per [_boards.md](_boards.md). The contact sheet shows the directions in their own section. Show it per [_boards.md](_boards.md) → Show the boards.
5. Present a table: name, axis, when it is the right choice, its cost. Do not pre-pick a favorite. Ask one gate question: pick a direction, or run another round around one of them.
6. Record each direction, its axis, and the person's reason to keep or reject it. Step 6 writes them to `02c-craft.md`. The picked direction is the starting direction for Step 4.

## Step 4 — Draw every changed surface

Draw the whole feature, not one slice. Every surface in the brief's content inventory gets a board, in every state the brief names.

**Worst-case boards.** Also draw `<surface>--worst`, with the worst-case content of [harden.md](harden.md) → Worst-case content:
- for each surface the person asks for, at any `ux-impact`;
- otherwise, for each **new** surface that shows data from people or from the system.

A changed surface that already exists gets no worst-case board unless the person asks for one.

1. Make the boards per [_boards.md](_boards.md) → Make the boards: capture, import, or HTML boards from `DESIGN.md`. Ask the person which viewports to draw.
2. On a host with a design canvas (`_host-surfaces.md`, row "Design canvas"), mirror the boards to the canvas for comments. Record the canvas link.
3. When the person wants an interactive prototype and external dispatch is enabled, offer `/uiproto`. A prototype is never a board.
4. For `ux-impact: flow`, draw the flow as a sequence of states. A text flow with a recorded `image-gate: skipped:<reason>` is valid when no surface changes how it looks.
5. Follow [contract.md](contract.md) Steps 1–4 for the direction and the mock fidelity inventory.

## Step 5 — The person confirms

Show the boards per [_boards.md](_boards.md) → Show the boards: the contact sheet `design/index.html`, its path, and the board files where the host can send them. Present the direction and the inventory. Ask one gate question per [_gate-question.md](../_gate-question.md): *"Does this match the design you want? (approve / adjust / stop)"*

- **Approve** — record `direction-confirmed-by: in-session` and continue.
- **Adjust** — change the named boards, render them again, and ask again. Record each adjustment in `po-answers.md` with `stage: design`.
- **Stop** — leave `02c-craft.md` unwritten, set `status: awaiting-input`, and end the stage.

A user-confirmed `PRODUCT.md` or an earlier `teach` answer satisfies the gate only when the boards add nothing new to it. Record which source satisfied the gate. For `visual` and `new-surface`, the person always sees the boards: no other source replaces the pictures.

## Step 6 — Write the contract

Freeze the confirmed boards per [_boards.md](_boards.md) → Freeze. Then write `02c-craft.md` per [contract.md](contract.md) Step 5, with these extra frontmatter fields:

```yaml
boards: design/r<N>/boards.json        # from the freeze result
design-revision: <N>
north-star-mock: design/r<N>/boards/<key>.png
canvas: "<canvas link of the mirror, or none>"
direction-confirmed-by: <in-session | product-md | teach>
confirmed-at: "<iso-8601>"
surfaces: [<every surface drawn>]
move: <move name, or omit>
carried-from: [<board path>#<piece-of-work key>]   # omit when nothing was carried
directions: [<name>: <axis>]                      # omit when Step 3b did not run
```

Then update `00-index.md`: `current-stage: design`, `progress.design: complete`, and `next-invocation` per the Next row above. Record each new open design question under `## Open decisions` in `.ai/design/direction.md` only when the person agrees to keep it.

## Amend

`/wf design <slug> amend [instructions]` reopens a confirmed design, because a later stage found that it cannot be built as drawn, or because the person changed their mind.

1. Read the stop reason from `00-index.md` and the stage artifact that raised it. For an extension, the reason is the new slices in `03-slice.md` and the surfaces they add. For a design brainstorm, the reason is the carried thoughts: run Step 1b first.
2. Change or add only the boards of the surfaces the reason names. Run Steps 4–6 for those surfaces. Step 6 freezes `r<N+1>/` and adds new surfaces to `surfaces:`.
3. Snapshot the prior contract per [_additive-write.md](../_additive-write.md), then write the new one.
4. Name every plan that cites a changed surface. Route to `/wf plan <slug> <slice>` for each.

When the person wants to reconsider the direction itself, run Step 3b again around the direction they name, then Steps 4–6.

## Move pass

`/wf design <slug> <move>` on a confirmed design runs the move's own checks. It draws nothing and freezes nothing.

1. Read `02c-craft.md`, the frozen boards it names, and `design/<move>.md`. When built code exists for the surfaces, read it too; when the stack can run it, look at the running surfaces.
2. Run the move's checks against the boards and the built UI:
   - `animate` — the gates and the opportunity sweep ([animate.md](animate.md)): every existing animation through the gates, the opportunities, and the rejected candidates.
   - `harden` — the checks of [harden.md](harden.md), including the worst-case pass.
   - any other move — the checks its file names.
3. Write `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). Each finding names its surface, its board key or `file:line`, and the fix.
4. When a finding changes a confirmed board, ask one gate question per [_gate-question.md](../_gate-question.md): amend the design now, or keep the note for later. On "amend", run Amend for the surfaces the note names. On "later", the note stays, and nothing else changes.
5. Return per [_chat-return.md](../_chat-return.md): the findings, the rejected candidates when the move is `animate`, and the note path. Next: the current `next-invocation` of `00-index.md`, unless the person chose Amend.

## Chat return

Return per [_chat-return.md](../_chat-return.md): what the person confirmed, how many boards were frozen and in which revision, the path of `design/r<N>/index.html`, the canvas link when a mirror exists, and the top design risk. Next: `/wf slice <slug>`, or `/wf auto <slug>` when the person wants the build driven.
