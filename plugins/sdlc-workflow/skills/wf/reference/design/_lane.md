# Design lane (`design/_lane.md`)

The single source for when design runs in a workflow and what each stage does for it. Every stage that touches design loads this file. The shared design rules (register, laws, bans) stay in [_design-context.md](_design-context.md).

> Load with: `design/_lane.md`

## UX impact

`ux-impact` in `00-index.md` records how far a change reaches into what a person sees and does. Intake sets it, and the person confirms it.

| Value | The change |
|---|---|
| `none` | Changes nothing a person sees or does: no UI file, no user-facing text, no change to a flow. |
| `visual` | Changes how an existing surface looks. |
| `flow` | Changes what a person does or reads in sequence: steps, states, user-facing text, error handling. No new surface. |
| `new-surface` | Adds a screen, page, view, dialog, or reusable component. |

Rules:
1. Classify from the request and the files in scope. When two values apply, record the higher one: `new-surface` > `flow` > `visual` > `none`.
2. A repo with no user interface records `none`, unless the change alters user-facing text or a command-line flow.
3. Write `ux-impact:` and `ux-impact-confirmed: false`. After the person confirms or corrects the value, set `ux-impact-confirmed: true`.
4. When `ux-impact` is absent (a workflow from an earlier release), use the old triggers: load design rules when `stack.ui ≠ ∅`, and treat design as needed when `02b-design.md` exists.

**Design is needed** when `ux-impact` is `visual`, `flow`, or `new-surface`.

## The human rule

A person confirms the design before any stage that a driver can run. The `design` stage sits between `shape` and `slice`, and only a person runs it. Neither `/wf auto` nor `/wf yolo` runs it.

**Design is settled** when one of these holds:
- `02c-craft.md` exists, carries a resolved `image-gate` (`pass` or `skipped:<reason>`), and carries `direction-confirmed-by:`.
- `00-index.md` records `progress.design: skipped` and a `design-skip-reason:`.

The design is **reopened**, and not settled, while `00-index.md` records `progress.design: in-progress`. An extension that adds surfaces sets it, and so does rule 2 below. Step 6 of the design stage sets `progress.design: complete` again.

Rules for every stage after `design`:
1. When design is needed and not settled, STOP. Set `status: awaiting-input` and route to `/wf design <slug>`. Under an autonomous run, this is a stop condition.
2. When the confirmed design cannot be built as drawn, STOP. Set `status: awaiting-input` and `progress.design: in-progress`, and route to `/wf design <slug> amend`. Do not redraw the design inside the stage.
3. Consume the confirmed design. Do not change its direction.

The pre-write hook refuses a `04-plan*.md` write while design is needed and not settled. Opt out with `hooks.designDirectionGate: false`.

## The design record

The project keeps one design record across all workflows. [record.md](record.md) defines it.

| Part | File | Holds |
|---|---|---|
| Identity | `PRODUCT.md` (project root) | Users, register, voice, anti-references, principles |
| System | `DESIGN.md` (project root) | Tokens, components, patterns, elevation |
| Current design | `.ai/design/current.md` | The surfaces that exist, their drift from the system, the design debt |
| Direction | `.ai/design/direction.md` | Design goals, the future direction, open design decisions |

Every stage that has a design duty reads the parts its duty names. Only `retro` and the `/wf design` upkeep commands write the record.

## One duty per stage

Each duty applies only when design is needed, except the `intake` and `shape` duties.

| Stage | Design duty |
|---|---|
| `intake` | Set `ux-impact` from the request and the files in scope. Ask the person to confirm it with the stack confirmation. Every mode that can route to `slice` or `plan` sets it: `rca` from the suggested fix, `update-deps` as `none`, and `extend` for the new slices. |
| `shape` | When design is needed, write the brief `02b-design.md` per [shape.md](shape.md), including `## UX intent`, against the Identity, Current design, and Direction parts. When `ux-impact: none`, write `progress.design: skipped` and a one-line `design-skip-reason:`. |
| `design` | Run [stage.md](stage.md) with the person: present the thoughts a design brainstorm carried ([_carried.md](_carried.md)), draw every changed surface, get the person's confirmation, write `02c-craft.md`. |
| `slice` | Map every slice to the surfaces in `02c-craft.md`. A surface with its own acceptance criteria gets its own slice, or one sentence in `## Slice Strategy` justifies the grouping. |
| `plan` | Check the human rule. Turn every mock fidelity inventory item into a plan step. Cite the moves in `references-loaded:` as step pointers. Write `## Design Components`: the system components the slice uses, and the component delta (new or changed components). |
| `implement` | Build from the tokens and components in `DESIGN.md`. Run the contract-check pass. Record the result in `## Visual Contract Honored`. |
| `verify` | Measure the design floor. When the stack can capture the running surface, capture each built surface and place it next to its drawing in `## Design Comparison`. The difference list is evidence, not a pass rule. |
| `review` | `design-audit` and `design-critique` judge drift from `DESIGN.md` and from `.ai/design/direction.md`. |
| `retro` | Update `.ai/design/current.md` per [record.md](record.md). Write each proposed change to `direction.md` as a question for the person. Do not change `direction.md` without the person's answer. |

## Moves

The 15 moves (`adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`) are playbooks, not stages. The design stage focuses on a move when the person names one. `plan` cites a move as a step pointer. `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md).
