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

A person approves the design before any stage that a driver can run. The `design` stage sits between `intake` and `slice`, and only a person runs it. `/wf yolo` does not run it.

**Design is settled** when one of these holds:
- `wf.mjs design approve` recorded the approval of the person: the records and the manifest of the design surface hold the approval that `02c-craft.md` names, and every approved screen page exists on the surface ([_surface.md](_surface.md)). The fields of the contract alone settle nothing: a contract that an agent filled in by hand is not an approval. `wf.mjs design migrate` records the approval of an older workflow (`direction-confirmed-by: migrated`, with `migrated-from`). A contract from before the design surface names frozen boards in `boards:` instead, and every board file must exist; `wf.mjs design migrate` turns those boards into screens.
- `00-index.md` records `progress.design: skipped` and a `design-skip-reason:`.

The design is **reopened**, and not settled, while `00-index.md` records `progress.design: in-progress`. An extension that adds surfaces sets it, and so does rule 2 below. `wf.mjs design approve` sets `progress.design: complete` again, and clears `status: awaiting-input`.

`wf.mjs design next "<root>" <slug>` prints whether the design is settled, and the one next action when it is not. A stage reads that line. It does not work the rule out from the fields.

Rules for every stage after `design`:
1. When design is needed and not settled, stop. Set `status: awaiting-input` and route to `/wf design <slug>`. Under an autonomous run, this is a stop condition.
2. When the approved design cannot be built as drawn, stop. Write the reason in the blockers of your stage record. Set `status: awaiting-input` and `progress.design: in-progress`, and route to `/wf design <slug> amend`: the amend reads the reason from that record. Do not redraw the design inside the stage.
3. Consume the approved design. Do not change its direction.

The pre-write hook refuses a `04-plan*.md` write while design is needed and not settled, including while an approved screen page is missing. Under `checks: warn` in `.ai/sdlc-config.json` the write stands with a warning.

**Where the gate stops.** Outside a list, the gate follows the slice: the plan of a slice with `ux-impact: none` never waits for the design. Inside a list, the campaign walk stops once, at the start of a work packet, until the design of that packet is settled. It does not stop again for each slice.

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
| `intake` (shape phase) | When design is needed, write the brief `02b-design.md` per [brief.md](brief.md), including `## UX intent`, against the Identity, Current design, and Direction parts. When `ux-impact: none`, set `progress.design=skipped` and a one-line `design-skip-reason=` on the index with `record set`. |
| `design` | Run [stage.md](stage.md) with the person, one step of `wf.mjs design next` at a time: present the thoughts that a design brainstorm carried ([_carried.md](_carried.md)), choose the design mode of each surface ([_design-context.md](_design-context.md) → Design modes), offer three directions when the direction of a new surface is open ([directions.md](directions.md)), draw each changed screen with its five states on the design surface ([_surface.md](_surface.md)), run the checks, ask the approval question, write `02c-craft.md`, and record the approval with `wf.mjs design approve`. |
| `slice` | Map every slice to the screen keys in `02c-craft.md` `screens:`, and tag each screen with its slice ([_surface.md](_surface.md) → Use the screens in a later stage). A surface with its own acceptance criteria gets its own slice, or one sentence in `## Slice Strategy` justifies the grouping. Write `ux-impact` into each slice record: `none` for a slice that maps to no surface. |
| `plan` | Check the human rule. Turn every `02c-craft.md` `## Mock fidelity inventory` item into a plan step that cites its screen key. Cite the moves in `references-loaded:` as step pointers. Write `## Design Components`: the rows of `## Component map` that the slice uses, and the component delta (new or changed components). Each component of `components-to-build:` gets its own plan step, before the first screen that uses it. |
| `implement` | Load [_craft-floor.md](_craft-floor.md) before the first UI file edit of the slice. Build from the tokens in `DESIGN.md` and the components of `02c-craft.md` `## Component map`: import a component that is in the code, and make a component that is to build once, then run `wf.mjs design component link`. Read the screen pages of the slice, and their approval pictures, from the paths that `wf.mjs design approved` prints. Make the content of the `worst` state of each screen loadable in development ([_surface.md](_surface.md)). Run the contract-check pass against the screens. Record the result in `## Visual Contract Honored`. |
| `verify` | Measure the design floor against [_craft-floor.md](_craft-floor.md) → Verify. Run `wf.mjs design components verify` and record `component-check`. When the stack can capture the running surface, capture each built screen to the path of `wf.mjs design capture-path`, including the `worst` state, and pair it with its approval picture (`wf.mjs design approved` prints the path) in `## Design Comparison`. The difference list is evidence, not a pass rule. With no approved screens, record `design-comparison: no-screens` and report no visual pass. |
| `review` | `design-audit` and `design-critique` judge drift from `DESIGN.md`, from `.ai/design/direction.md`, and between each approved screen and its capture, and check the build against the Refuse lists of [_craft-floor.md](_craft-floor.md). They do not redraw an approved screen; a finding against one routes to `/wf design <slug> amend`. |
| `retro` | Update `.ai/design/current.md` per [record.md](record.md) and its Floor guard, with the screen key of each surface. Write each proposed change to `direction.md` as a question for the person. Do not change `direction.md` without the person's answer. |

## Moves

The moves (`adapt`, `animate`, `bolder`, `clarify`, `colorize`, `harden`, `layout`, `onboard`, `polish`, `simplify`, `typeset`) are playbooks, not stages. Before the design is approved, the design stage focuses on a move when the person names one. After it is approved, `/wf design <slug> <move>` runs the checks of the move as a pass that draws nothing ([move-pass.md](move-pass.md)). `plan` cites a move as a step pointer. `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). The moves name generic terms; [_platforms.md](_platforms.md) names the file that gives their form on the platform of the project.

An older word reads as the move that replaced it: `quieter` and `distill` as `simplify`, `overdrive` as `bolder`, `delight` as `animate`. `optimize` is no longer a move: the stage loads `design/optimize.md` as a reference and focuses on no move, and on an approved design it routes to `/wf design <slug> audit`.

**Routing.** The check, the audit and the critique name the move that fixes a finding from this table.

| Finding | Move |
|---|---|
| Contrast; a color that is not a token; a hard-coded color; a theme that does not switch; color as the only signal | `colorize` |
| Focus indicator; target size and touch target; worst-case content; a missing page state or control state; a display bug; keyboard, semantics and names; locale and right-to-left | `harden` |
| Viewport fit; overlapping text; reading order, grouping, density, structure | `layout` |
| A viewport that only scales; a transplanted idiom; a hover-only path; platform feel | `adapt` |
| Motion with no purpose, or with a wrong curve, duration or reduced-motion form; a flat moment | `animate` |
| An unclear label, error, empty or success message; inconsistent terms | `clarify` |
| Type hierarchy, scale, measure, line height; a face chosen by category | `typeset` |
| A timid part; no dominant choice | `bolder` |
| Too many elements, steps or accents; noise | `simplify` |
| First run and empty states | `onboard` |
| A value that fits no token; radius, depth, alignment; like components that differ | `polish` |
| Performance: frame drops, media, payload | no move: `implement`, with `design/optimize.md` and `design/_motion-build.md` |
| A missing component, a script error, a version difference | no move: the next action that the check prints |
| The direction itself is interchangeable | no move: `/wf design <slug> amend`, and the directions step |
