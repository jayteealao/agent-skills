# Design stage (`design/stage.md`)

The human-only stage between `shape` and `slice`. It turns the brief into a design the person confirms, so every later stage builds against a decision a person made. [_lane.md](_lane.md) holds the rule that puts this stage before every driven stage.

| | Detail |
|---|---|
| Requires | See [design.md → ## Requires](../design.md#requires). |
| Produces | `02c-craft.md` (type `design-contract`); the boards in `design/` and the frozen revision `design/r<N>/` ([_boards.md](_boards.md)); `00-index.md` updates |
| Next | Type `/wf slice <slug>` (`/wf plan <slug>` for an `rca` workflow, which has no slice stage; `/wf plan <slug> <first-new-slice>` after an extension) — or `/wf auto <slug>` / `/wf yolo <slug>`, which may start now. For a campaign piece, the campaign command of [Chat return](#chat-return). |

## Step 0 — Orient

1. Read `00-index.md`. When `status: closed`, STOP: *"Workflow `<slug>` is closed. Use `/wf status recap <slug>` to reopen."*
2. When a driver (`auto` or `yolo`) invoked this stage, STOP. Route the person to `/wf design <slug>`. A driver never resolves a design direction.
3. When `02-shape.md` is missing or not complete, STOP and route to `/wf shape <slug>`.
4. When `ux-impact: none`, ask one gate question per [_gate-question.md](../_gate-question.md): change `ux-impact` to `visual`, `flow`, or `new-surface` and continue, or keep `none` and write the skip record. On `none`, write `progress.design: skipped` and `design-skip-reason:`, then STOP with the next step `/wf slice <slug>`.
5. When `progress.design: in-progress`, the design is reopened per [_lane.md](_lane.md): run Amend. Otherwise, when `02c-craft.md` already carries `direction-confirmed-by:` and the invocation is not `amend` and names no move, report the confirmed design and STOP. Next: `/wf slice <slug>`. When it carries `direction-confirmed-by:` and the invocation names a move → run the **Move pass** below. Do not run Step 1.

## Step 1 — Load the design record

1. Load [_design-context.md](_design-context.md) and [_preflight.md](_preflight.md) in full. Do not load [_craft-floor.md](_craft-floor.md) yet: Step 4 loads it, after the direction is settled.
2. Read `PRODUCT.md`. When it is missing, empty, or carries `[TODO]` markers, run `/wf design setup` now with the person, then continue.
3. Read `DESIGN.md`, `.ai/design/current.md`, and `.ai/design/direction.md`. When a `.ai/design/` file is missing, create it from the [record.md](record.md) template with `[TODO]` sections and tell the person. Do not stop.
4. When the person named a move, read `design/<move>.md`. The move focuses the contract; it does not widen the scope of `02-shape.md`.

## Step 1b — Present the carried design thoughts

When a design brainstorm left thoughts for this workflow, follow [_carried.md](_carried.md) → At the design stage: show the read-only summary, find the contradictions, and ask only the ask set and the open questions. The kept set is the starting direction for Step 4. When nothing is carried, continue.

## Step 2 — Make sure the brief exists

When `02b-design.md` is missing, author it now per [shape.md](shape.md). The person is present, so ask the discovery round there. Record `current-stage: design` while you work.

## Step 3 — Inspect the code

Run the four codebase inspection sub-agents from [_preflight.md](_preflight.md) → Preflight gates. Reuse the `stack:` block where it answers the question. Add one duty to the surface ranger: list every existing surface the brief touches and its entry in `.ai/design/current.md`.

When the product already exists and the stack can run it, capture every touched surface in its current state into `design/source/captures/` now. The boards start from these captures.

## Step 3b — Directions (when the direction is open)

Run this step only when `ux-impact: new-surface` and no direction is confirmed yet (no carried direction the person kept at Step 1b, no `teach` answer that settles it). Otherwise, continue at Step 4.

1. Ask one gate question per [_gate-question.md](../_gate-question.md): *"The direction is open. Draw three directions of the main surface first, or draw the boards now?"* On "boards now", continue at Step 4.
2. Load the design-mode file of the main surface, as the brief's content inventory records it: [mode-persuade.md](mode-persuade.md) for Persuade and Experience, [mode-operate.md](mode-operate.md), or [mode-read.md](mode-read.md). Read its `## Directions`.
3. **Ground the search.** Name the product's mechanism in one sentence, the audience's real scene, and the product's cultural home.
4. **Name the rut.** Name the page this category always ships, and its predictable opposite. Keep both out of the candidates.
5. **List seven candidates** from the audience's culture: visual systems, artifacts, places, or rituals that the audience knows well. Give each one line on why it fits and one line on how it looks. Span at least three material families. On an Operate or Read surface, never take a candidate from the tools that the audience operates: it comes back as a costume of that tool.
6. **Choose three** of the seven as directions (up to five when the person asks). Give each a name that describes it (Quiet, Editorial, Dense — never "Option A") and one named axis: layout, density, personality, motion, or interaction model. No two directions share a position on an axis. Two directions that differ only in accent color or copy are one direction: replace one. Record the four candidates that you did not draw, with one line each.
7. Draw each direction of the main surface as a sketch, `design/sketches/direction-<name>.html`, full size, in realistic surrounding context, with real copy and the tokens of `DESIGN.md`. Every direction is complete and uses the tokens of DESIGN.md.
8. **Add the canon.** Draw one more sketch, `design/sketches/direction-canon.html`: the category standard, played straight. It is the person's standing exit. Never recommend it, and never weigh it against the other directions.
9. Run `render` (no keys) and `sheet` per [_boards.md](_boards.md). The contact sheet shows the directions in their own section. Show it per [_boards.md](_boards.md) → Show the boards.
10. Present a table: name, axis, when it is the right choice, its cost. Put the canon in the last row. Do not pre-pick a favorite. Ask one gate question: pick a direction, or run another round around one of them. When the person picks the canon, ask once for two or three products that it sits beside. Their craft level is the bar.
11. After two rounds with no pick, do not draw a third round blind. Ask the person what quality is missing, then draw the next round from the answer.
12. Record each direction, its axis, and the person's reason to keep or reject it, and the candidates that you did not draw. Step 6 writes them to `02c-craft.md`. The picked direction is the starting direction for Step 4.

## Step 4 — Draw every changed surface

Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists. Load it now, before the first board, and draw every board against it. Also load the design-mode file of each surface in the brief's content inventory, and read its `## Boards`.

Draw the whole feature, not one slice. Every surface in the brief's content inventory gets a board, in every state the brief names.

**Worst-case boards.** Also draw `<surface>--worst`, with the worst-case content of [harden.md](harden.md) → Worst-case content:
- for each surface the person asks for, at any `ux-impact`;
- for each terminal surface of a flow (command-line output or a terminal interface), at the height budget of `_platforms.md` → Terminal;
- otherwise, for each **new** surface that shows data from people or from the system.

A changed surface that already exists gets no worst-case board unless the person asks for one.

1. Make the boards per [_boards.md](_boards.md) → Make the boards: capture, import, or HTML boards from `DESIGN.md`. Take the viewports from the brief's `viewports:`. Ask the person only when the brief has none.
2. On a host with a design canvas (`_host-surfaces.md`, row "Design canvas"), publish the boards to the canvas from the session's account, for comments, per [_boards.md](_boards.md) → The file is the source. Record the canvas link.
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

Before the freeze, run `canvas-stale` per [_boards.md](_boards.md) → The file is the source, and republish each listed file from the session's account. The board files are the source; the canvas is their published view. Freeze the confirmed boards per [_boards.md](_boards.md) → Freeze. Then write `02c-craft.md` per [contract.md](contract.md) Step 5, with these extra frontmatter fields:

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

Then write the token roles that `02c-craft.md` settles into `DESIGN.md` under `## Colors`: each role, its token, and its value. Change only the roles that this design settles. Apply the record guard of [_craft-floor.md](_craft-floor.md) → Record guard. Show the change to the person: the lines that you added or changed.

Then update `00-index.md`: `current-stage: design`, `progress.design: complete`, and `next-invocation` per the Next row above. Record each new open design question under `## Open decisions` in `.ai/design/direction.md` only when the person agrees to keep it.

## Amend

`/wf design <slug> amend [instructions]` reopens a confirmed design, because a later stage found that it cannot be built as drawn, or because the person changed their mind.

1. Read the stop reason from `00-index.md` and the stage artifact that raised it. For an extension, the reason is the new slices in `03-slice.md` and the surfaces they add. For a design brainstorm, the reason is the carried thoughts: run Step 1b first.
2. Change or add only the boards of the surfaces the reason names. Run Steps 4–6 for those surfaces. Step 4 loads the floor. Step 6 freezes `r<N+1>/` and adds new surfaces to `surfaces:`.
3. Snapshot the prior contract per [_additive-write.md](../_additive-write.md), then write the new one.
4. Name every plan that cites a changed surface. Route to `/wf plan <slug> <slice>` for each.

When the person wants to reconsider the direction itself, run Step 3b again around the direction they name, then Steps 4–6.

## Move pass

`/wf design <slug> <move>` on a confirmed design runs the move's own checks. It draws nothing and freezes nothing.

1. Read `02c-craft.md`, the frozen boards it names, and `design/<move>.md`. Load [_craft-floor.md](_craft-floor.md) as a checklist: check the boards and the built UI against its Refuse and Verify lists. When built code exists for the surfaces, read it too; when the stack can run it, look at the running surfaces.
2. Run the move's checks against the boards and the built UI:
   - `animate` — the gates and the opportunity sweep ([animate.md](animate.md)): every existing animation through the gates, the opportunities, and the rejected candidates.
   - `harden` — the checks of [harden.md](harden.md), including the worst-case pass.
   - any other move — the checks its file names.
3. Write `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). Each finding names its surface, its board key or `file:line`, and the fix.
4. When a finding changes a confirmed board, ask one gate question per [_gate-question.md](../_gate-question.md): amend the design now, or keep the note for later. On "amend", run Amend for the surfaces the note names. On "later", the note stays, and nothing else changes.
5. Return per [_chat-return.md](../_chat-return.md): the findings, the rejected candidates when the move is `animate`, and the note path. Next: the current `next-invocation` of `00-index.md`, written as "Type `/wf <key> <args>`.", unless the person chose Amend.

## Chat return

Return per [_chat-return.md](../_chat-return.md): what the person confirmed, how many boards were frozen and in which revision, the path of `design/r<N>/index.html`, the canvas link when a mirror exists, the `DESIGN.md` change, and the top design risk.

Write the next step as "Type `/wf <key> <args>`." The person runs the key; never write that you run it.
- Next: "Type `/wf slice <slug>`.", or "Type `/wf auto <slug>`." when the person wants the build driven.
- When `00-index.md` has `origin-piece`, the workflow is a campaign piece, and the campaign walk slices it. The next step is "Type `/wf campaign <source-slug>`." The `<source-slug>` is the folder in the `origin-piece` path (`.ai/workflows/<source-slug>/work/<piece-slug>.md`).
