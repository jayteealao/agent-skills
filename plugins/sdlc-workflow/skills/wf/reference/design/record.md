# Design record (`design/record.md`)

The project-level design memory. Every workflow that needs design reads it, and it outlives every workflow. [_lane.md](_lane.md) says which stage reads which part.

## The four parts

| Part | File | Written by |
|---|---|---|
| Identity | `PRODUCT.md` (project root) | `/wf design record` |
| System | `DESIGN.md` (project root) | `/wf design record`, `/wf design sync`; the design stage writes the token roles at its foundation step and in its rounds |
| Current design | `.ai/design/current.md` | `/wf design record`, `/wf design extract`, `retro`; the design stage creates it when it is missing |
| Direction | `.ai/design/direction.md` | `/wf design record`, `/wf design direction`, `retro` (only after the person answers); the design stage creates it when it is missing and adds the open decisions that the person keeps |

Search for `PRODUCT.md` and `DESIGN.md` at the project root first, then `.agents/context/`, then `docs/`. The two `.ai/design/` files have one fixed location. In a repo that ignores `.ai/`, `wf.mjs design init` keeps `.ai/design/` tracked ([_surface.md](_surface.md)).

**Token roles.** The design stage writes the token roles into the `### Token roles` tables of `DESIGN.md` at its foundation step (Step 3c), and writes a role again in the round whose answer changes it (Step 4b), before the approval. [setup.md](setup.md) gives the template. The stage asks no question before such a write: it names each role that it wrote, with its value, in the Changed line of its next stop message, and the person changes any of them in a round. Keep every other row and section of `DESIGN.md`. Every other writer of the record shows the person the change in chat and waits for the answer before the write.

## `.ai/design/current.md`

```yaml
---
schema: sdlc/v1
type: design-current
updated-at: "<iso-8601>"
design-system: "<link to the canvas design system, or none>"
---
```

Body sections, in order:
- `## Surfaces` — one row per screen, page, view, or reusable component: `| Surface | Path | Last changed by (slug) | Screen | Drift from the system |`. The screen is the key of the surface on the design surface: `.ai/design/screens/<key>.html`.
- `## System in code` — the tokens and component patterns the code uses, from `/wf design extract`.
- `## Design debt` — one entry per known gap between a surface and the system or the direction: what, where, the slug that created it, and the slug that paid it (empty while open).

## `.ai/design/direction.md`

```yaml
---
schema: sdlc/v1
type: design-direction
updated-at: "<iso-8601>"
confirmed-by: <person | record>   # an older file may say setup or teach
---
```

Body sections, in order:
- `## Goals` — the design goals the product works toward now, each with the reason.
- `## Future direction` — where the design goes next: the surfaces, patterns, or identity changes the team expects, and the signal that starts each one.
- `## Open decisions` — design questions no workflow answered yet, each with the slug that raised it.
- `## Decided` — answered decisions: the decision, the date, the slug, and the person's words.

Use `[TODO]` for a section with no content yet. Mark a section the person skips with `<!-- intentionally omitted -->`. Never invent a goal.

## Upkeep commands

### `/wf design record [instructions]`
Follow [setup.md](setup.md). It asks only what is missing in the four parts, writes them, and confirms them in chat. The words `setup` and `teach` run the same command.

### `/wf design [slug] extract`
Follow [extract.md](extract.md). Write the result into `## System in code` of `current.md`.

### `/wf design direction [instructions]`
Work with the person on `direction.md`:
1. Read all four parts and the `## Design debt` section.
2. Present the goals, the future direction, and the open decisions in chat, in plain words. The person does not open the file.
3. Ask what changed, in one batched round per [_gate-question.md](../_gate-question.md).
4. Write only what the person confirms. Move each answered open decision to `## Decided`.
5. Return in chat: each line that changed, and `Done`.

When the instructions are `from <board-slug>`, a design brainstorm carried a change of direction. Read the board's work packet with `design-form: design-direction` (`shape: design-direction` on an older board), and present its kept items with `design: true` as proposed changes in step 2, each with its reason. After the person answers, close the work packet: run `node "<skill-dir>/scripts/campaign.mjs" close "<root>" <board-slug> <packet-key> done`.

### `/wf design sync`
Keep `DESIGN.md` and the canvas design system in step, per `_host-surfaces.md`, row "Design system sync". When the host has no sync surface, report that and stop. Record the design-system link in `current.md` frontmatter. Change one component at a time. Show the person the plan in chat, and wait for the answer before any write.

## Floor guard

Every write to the design record follows the Record guard. It covers `record` (with the words `setup` and `teach`), `sync`, `direction`, `extract`, the token roles, and the retro write-back.
1. Before you write `DESIGN.md` or `.ai/design/current.md`, load [_craft-floor.md](_craft-floor.md) → Record guard.
2. Write a refused element as a design debt in `## Design debt`. Never write it as a system rule.

## Retro write-back

`retro` updates the record at the end of every workflow that needed design:
1. In `current.md`, add or update one `## Surfaces` row per surface the workflow changed. Name the screen key of the surface. Record the drift that review found.
2. Add each design debt the workflow created. Fill the paying slug on each debt it fixed.
3. For each finding that questions a goal or suggests a new direction, write one question for the person in the retro. Change `direction.md` only after the person answers.
