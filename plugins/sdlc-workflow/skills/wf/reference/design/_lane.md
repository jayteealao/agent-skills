# Design lane (`design/_lane.md`)

The single source for when design runs in a workflow and what each stage does for it. Every stage that touches design loads this file. The shared design rules (design modes, laws) stay in [_design-context.md](_design-context.md). The refusals and the checks of the built result stay in [_craft-floor.md](_craft-floor.md).

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
3. Write `ux-impact:` and `ux-impact-confirmed: false` with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index ux-impact=<value> ux-impact-confirmed=false` ([_records.md](../_records.md)). After the person confirms or corrects the value, set `ux-impact-confirmed=true` the same way.
4. When `ux-impact` is absent (a workflow from an earlier release), use the old triggers: load design rules when `stack.ui ≠ ∅`, and treat design as needed when `02b-design.md` exists.

**Design is needed** when `ux-impact` is `visual`, `flow`, or `new-surface`.

**A slice records its own `ux-impact`.** `slice` and `extend` write the field into each `03-slice-<slice>.md`. A slice that changes nothing a person sees, such as an engine or data slice, records `none`. The plan for a slice with `none` does not wait for the design stage. A slice without the field keeps the slug rule.

## The human rule

A person confirms the design before any stage that a driver can run. The `design` stage sits between `intake` and `slice`, and only a person runs it. `/wf yolo` does not run it.

**Design is settled** when one of these holds:
- `02c-craft.md` exists, carries a resolved `image-gate` (`pass` or `skipped:<reason>`), and carries `direction-confirmed-by:`. When it names its boards (`boards: design/r<N>/boards.json`) and `ux-impact` is `visual` or `new-surface`, every board that manifest lists also exists on disk ([_boards.md](_boards.md)). A contract without `boards:` (written before boards existed) keeps the first two conditions only.
- `00-index.md` records `progress.design: skipped` and a `design-skip-reason:`.

The design is **reopened**, and not settled, while `00-index.md` records `progress.design: in-progress`. An extension that adds surfaces sets it, and so does rule 2 below. Step 6 of the design stage sets `progress.design: complete` again.

Rules for every stage after `design`:
1. When design is needed and not settled, STOP. Set `status: awaiting-input` and route to `/wf design <slug>`. Under an autonomous run, this is a stop condition.
2. When the confirmed design cannot be built as drawn, STOP. Set `status: awaiting-input` and `progress.design: in-progress`, and route to `/wf design <slug> amend`. Do not redraw the design inside the stage.
3. Consume the confirmed design. Do not change its direction.

The pre-write hook refuses a `04-plan*.md` write while design is needed and not settled, including while a confirmed board file is missing. Under `checks: warn` in `.ai/sdlc-config.json` the write stands with a warning.

## The design record

The project keeps one design record across all workflows. [record.md](record.md) defines it.

| Part | File | Holds |
|---|---|---|
| Identity | `PRODUCT.md` (project root) | Users, purpose, positioning, brand commitments, evidence on hand, principles |
| System | `DESIGN.md` (project root) | Colors and token roles, typography, layout, elevation, shapes, components |
| Current design | `.ai/design/current.md` | The surfaces that exist, their drift from the system, the design debt |
| Direction | `.ai/design/direction.md` | Design goals, the future direction, open design decisions |

Every stage that has a design duty reads the parts its duty names. Only `retro`, the `/wf design` upkeep commands, and the design stage write the record. The design stage creates a missing `.ai/design/` file from its template, and adds an open question to `## Open decisions` only when the person agrees to keep it.

## One duty per stage

Each duty applies only when design is needed, except the two `intake` duties.

| Stage | Design duty |
|---|---|
| `intake` | Set `ux-impact` from the request and the files in scope. Ask the person to confirm it with the stack confirmation. Every mode that can route to `slice` or `plan` sets it: `rca` from the suggested fix, `update-deps` as `none`, and `extend` for the new slices. |
| `intake` (shape phase) | When design is needed, write the brief `02b-design.md` per [shape.md](shape.md), including `## UX intent`, against the Identity, Current design, and Direction parts. When `ux-impact: none`, set `progress.design=skipped` and a one-line `design-skip-reason=` on the index with `record set`. |
| `design` | Run [stage.md](stage.md) with the person: present the thoughts a design brainstorm carried ([_carried.md](_carried.md)), choose the design mode of each surface ([_design-context.md](_design-context.md) → Design modes), offer three directions when the direction of a new surface is open, draw one board per changed surface and state plus the worst-case boards ([_boards.md](_boards.md)), get the person's confirmation, freeze the boards, write `02c-craft.md`. |
| `slice` | Map every slice to the surfaces in `02c-craft.md` and their board keys. A surface with its own acceptance criteria gets its own slice, or one sentence in `## Slice Strategy` justifies the grouping. Write `ux-impact` into each slice record: `none` for a slice that maps to no surface. |
| `plan` | Check the human rule. Turn every `02c-craft.md` `## Mock fidelity inventory` item into a plan step that cites its board key. Cite the moves in `references-loaded:` as step pointers. Write `## Design Components`: the system components the slice uses, and the component delta (new or changed components). |
| `implement` | Load [_craft-floor.md](_craft-floor.md) before the first UI file edit of the slice. Build from the tokens and components in `DESIGN.md`. Read the board PNGs of the slice's surfaces. Make the content of each `--worst` board loadable in development ([_boards.md](_boards.md)). Run the contract-check pass against the boards. Record the result in `## Visual Contract Honored`. |
| `verify` | Measure the design floor against [_craft-floor.md](_craft-floor.md) → Verify. When the stack can capture the running surface, capture each built surface to `design/captures/<slice>/<key>.png`, including each `--worst` state, and pair it with its board in `## Design Comparison`. The difference list is evidence, not a pass rule. With no boards, record `design-comparison: no-boards` and report no visual pass. |
| `review` | `design-audit` and `design-critique` judge drift from `DESIGN.md`, from `.ai/design/direction.md`, and between each board and its capture, and check the build against the Refuse lists of [_craft-floor.md](_craft-floor.md). They do not redraw a confirmed board; a finding against one routes to `/wf design <slug> amend`. |
| `retro` | Update `.ai/design/current.md` per [record.md](record.md) and its Floor guard, with a link to the newest board of each surface. Write each proposed change to `direction.md` as a question for the person. Do not change `direction.md` without the person's answer. |

## Moves

The 15 moves (`adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`) are playbooks, not stages. Before the design is confirmed, the design stage focuses on a move when the person names one. After it is confirmed, `/wf design <slug> <move>` runs the move's checks as a pass that draws nothing ([stage.md](stage.md) → Move pass). `plan` cites a move as a step pointer. `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). The moves name generic terms; [_platforms.md](_platforms.md) gives their form on the web, iOS, Android (Compose) and desktop.
