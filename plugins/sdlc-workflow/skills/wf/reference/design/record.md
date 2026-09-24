# Design record (`design/record.md`)

The project-level design memory. Every workflow that needs design reads it, and it outlives every workflow. [_lane.md](_lane.md) says which stage reads which part.

## The four parts

| Part | File | Written by |
|---|---|---|
| Identity | `PRODUCT.md` (project root) | `/wf design setup`, `/wf design teach` |
| System | `DESIGN.md` (project root) | `/wf design setup`, `/wf design teach`, `/wf design sync` |
| Current design | `.ai/design/current.md` | `/wf design setup`, `/wf design extract`, `retro` |
| Direction | `.ai/design/direction.md` | `/wf design setup`, `/wf design direction`, `retro` (only after the person answers) |

Search for `PRODUCT.md` and `DESIGN.md` at the project root first, then `.agents/context/`, then `docs/`. The two `.ai/design/` files have one fixed location.

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
- `## Surfaces` — one row per screen, page, view, or reusable component: `| Surface | Path | Last changed by (slug) | Drift from the system |`.
- `## System in code` — the tokens and component patterns the code uses, from `/wf design extract`.
- `## Design debt` — one entry per known gap between a surface and the system or the direction: what, where, the slug that created it, and the slug that paid it (empty while open).

## `.ai/design/direction.md`

```yaml
---
schema: sdlc/v1
type: design-direction
updated-at: "<iso-8601>"
confirmed-by: <person | teach | setup>
---
```

Body sections, in order:
- `## Goals` — the design goals the product works toward now, each with the reason.
- `## Future direction` — where the design goes next: the surfaces, patterns, or identity changes the team expects, and the signal that starts each one.
- `## Open decisions` — design questions no workflow answered yet, each with the slug that raised it.
- `## Decided` — answered decisions: the decision, the date, the slug, and the person's words.

Use `[TODO]` for a section with no content yet. Mark a section the person skips with `<!-- intentionally omitted -->`. Never invent a goal.

## Upkeep commands

### `/wf design setup`
Follow [setup.md](setup.md) for `PRODUCT.md` and `DESIGN.md`. Then write both `.ai/design/` files from the templates above: the goals and the future direction come from the same discovery round. When a file exists, update it and keep its content.

### `/wf design teach`
Follow [teach.md](teach.md). Update any of the four parts the answers touch.

### `/wf design extract`
Follow [extract.md](extract.md). Write the result into `## System in code` of `current.md`.

### `/wf design direction [instructions]`
Work with the person on `direction.md`:
1. Read all four parts and the `## Design debt` section.
2. Present the goals, the future direction, and the open decisions in plain words.
3. Ask what changed, in one batched round per [_gate-question.md](../_gate-question.md).
4. Write only what the person confirms. Move each answered open decision to `## Decided`.

### `/wf design sync`
Keep `DESIGN.md` and the canvas design system in step, per `_host-invocation.md`, row "Design system sync". When the host has no sync surface, report that and stop. Record the design-system link in `current.md` frontmatter. Change one component at a time, and show the person the plan before any write.

## Retro write-back

`retro` updates the record at the end of every workflow that needed design:
1. In `current.md`, add or update one `## Surfaces` row per surface the workflow changed. Record the drift that review found.
2. Add each design debt the workflow created. Fill the paying slug on each debt it fixed.
3. For each finding that questions a goal or suggests a new direction, write one question for the person in the retro. Change `direction.md` only after the person answers.
