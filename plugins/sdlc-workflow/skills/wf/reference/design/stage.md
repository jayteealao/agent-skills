# Design stage (`design/stage.md`)

The human-only stage between `shape` and `slice`. It turns the brief into a design the person confirms, so every later stage builds against a decision a person made. [_lane.md](_lane.md) holds the rule that puts this stage before every driven stage.

| | Detail |
|---|---|
| Requires | `02-shape.md` with `status: complete`; `02b-design.md` (this stage writes it when it is missing) |
| Reads | The design record ([record.md](record.md)), `02b-design.md`, `po-answers.md`, the move reference when the person names a move, the carried design thoughts ([_carried.md](_carried.md)) |
| Produces | `02c-craft.md` (type `design-contract`) with its sibling `.yaml` and `.html.fragment`; `00-index.md` updates |
| Next | `/wf slice <slug>` (`/wf plan <slug>` for an `rca` workflow, which has no slice stage; `/wf plan <slug> <first-new-slice>` after an extension) — or `/wf auto <slug>` / `/wf yolo <slug>`, which may start now |

## Step 0 — Orient

1. Read `00-index.md`. When `status: closed`, STOP: *"Workflow `<slug>` is closed. Use `/wf recap <slug>` to reopen."*
2. When a driver (`auto` or `yolo`) invoked this stage, STOP. Route the person to `/wf design <slug>`. A driver never resolves a design direction.
3. When `02-shape.md` is missing or not complete, STOP and route to `/wf shape <slug>`.
4. When `ux-impact: none`, ask one gate question per [_gate-question.md](../_gate-question.md): change `ux-impact` to `visual`, `flow`, or `new-surface` and continue, or keep `none` and write the skip record. On `none`, write `progress.design: skipped` and `design-skip-reason:`, then STOP with the next step `/wf slice <slug>`.
5. When `progress.design: in-progress`, the design is reopened per [_lane.md](_lane.md): run Amend. Otherwise, when `02c-craft.md` already carries `direction-confirmed-by:` and the invocation is not `amend` and names no move, report the confirmed design and STOP. Next: `/wf slice <slug>`.

## Step 1 — Load the design record

1. Load [_design-context.md](_design-context.md) in full, and the register reference ([brand.md](brand.md) or [product.md](product.md)).
2. Read `PRODUCT.md`. When it is missing, empty, or carries `[TODO]` markers, run `/wf design setup` now with the person, then continue.
3. Read `DESIGN.md`, `.ai/design/current.md`, and `.ai/design/direction.md`. When a `.ai/design/` file is missing, create it from the [record.md](record.md) template with `[TODO]` sections and tell the person. Do not stop.
4. When the person named a move, read `design/<move>.md`. The move focuses the contract; it does not widen the scope of `02-shape.md`.

## Step 1b — Present the carried design thoughts

When a design brainstorm left thoughts for this workflow, follow [_carried.md](_carried.md) → At the design stage: present them, walk them with the person, and ask their open questions. The kept set is the starting direction for Step 4. When nothing is carried, continue.

## Step 2 — Make sure the brief exists

When `02b-design.md` is missing, author it now per [shape.md](shape.md). The person is present, so ask the discovery round there. Record `current-stage: design` while you work.

## Step 3 — Inspect the code

Run the four codebase inspection sub-agents from [_design-context.md](_design-context.md) → Preflight gates. Reuse the `stack:` block where it answers the question. Add one duty to the surface ranger: list every existing surface the brief touches and its entry in `.ai/design/current.md`.

## Step 4 — Draw every changed surface

Draw the whole feature, not one slice. Every surface in the brief's content inventory gets a drawing, in every state the brief names.

1. Use the design canvas per `_host-invocation.md`, row "Design canvas". Put one artboard per surface and state. Record the canvas link.
2. When the host has no design canvas, use `/imagery` for the north-star comps. When the person wants an interactive prototype and external dispatch is enabled, offer `/uiproto`.
3. For `ux-impact: flow`, draw the flow as a sequence of states. A text flow with a recorded `image-gate: skipped:<reason>` is valid when no surface changes how it looks.
4. Follow [contract.md](contract.md) Steps 1–4 for the direction, the second opinion, and the mock fidelity inventory.

## Step 5 — The person confirms

Present the drawings, the direction, and the inventory. Ask one gate question per [_gate-question.md](../_gate-question.md): *"Does this match the design you want? (approve / adjust / stop)"*

- **Approve** — record `direction-confirmed-by: in-session` and continue.
- **Adjust** — change the drawings and ask again. Record each adjustment in `po-answers.md` with `stage: design`.
- **Stop** — leave `02c-craft.md` unwritten, set `status: awaiting-input`, and end the stage.

A user-confirmed `PRODUCT.md` or an earlier `teach` answer satisfies the gate only when the drawings add nothing new to it. Record which source satisfied the gate.

## Step 6 — Write the contract

Write `02c-craft.md` per [contract.md](contract.md) Steps 5–6, with these extra frontmatter fields:

```yaml
canvas: "<canvas link, or none>"
direction-confirmed-by: <in-session | product-md | teach>
confirmed-at: "<iso-8601>"
surfaces: [<every surface drawn>]
move: <move name, or omit>
carried-from: [<board path>#<piece-of-work key>]   # omit when nothing was carried
```

Then update `00-index.md`: `current-stage: design`, `progress.design: complete`, and `next-invocation` per the Next row above. Record each new open design question under `## Open decisions` in `.ai/design/direction.md` only when the person agrees to keep it.

## Amend

`/wf design <slug> amend [instructions]` reopens a confirmed design, because a later stage found that it cannot be built as drawn, or because the person changed their mind.

1. Read the stop reason from `00-index.md` and the stage artifact that raised it. For an extension, the reason is the new slices in `03-slice.md` and the surfaces they add. For a design brainstorm, the reason is the carried thoughts: run Step 1b first.
2. Change or add only the surfaces the reason names. Run Steps 4–6 for those surfaces. Step 6 adds new surfaces to `surfaces:`.
3. Snapshot the prior contract per [_additive-write.md](../_additive-write.md), then write the new one.
4. Name every plan that cites a changed surface. Route to `/wf plan <slug> <slice>` for each.

## Chat return

Return per [_chat-return.md](../_chat-return.md): what the person confirmed, how many surfaces and states were drawn, the canvas link, and the top design risk. Next: `/wf slice <slug>`, or `/wf auto <slug>` when the person wants the build driven.
