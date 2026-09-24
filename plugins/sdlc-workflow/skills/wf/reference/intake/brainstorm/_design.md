# Design focus (`intake/brainstorm/_design.md`)

Load this file when the board's `focus` is `design`: `/wf brainstorm design <idea>`, `/wf brainstorm <slug> design`, or `/wf intake brainstorm design <idea>`. It adds to the loop in [../brainstorm.md](../brainstorm.md) and replaces nothing. Every rule of that loop still applies, the Plain words invariant included.

A design brainstorm thinks through how an idea looks and behaves: the surfaces, what a person does on them, and how they feel. The design stage (`design/stage.md`) later presents these thoughts again as its starting direction (`design/_carried.md`).

## The rule: sketches are ideas

A sketch is an idea the person can drop tomorrow at no cost. The person confirms a design only at the design stage.
- Do not write `02c-craft.md`.
- Do not write an `image-gate` value.
- Do not write `direction-confirmed-by`.
- Do not write `PRODUCT.md`, `DESIGN.md`, or a file in `.ai/design/`. A change to the design direction becomes a piece of work at `done`.

## Step 0 additions

1. **Read the design record**, as cheap reads: `PRODUCT.md`, `DESIGN.md`, `.ai/design/current.md`, and `.ai/design/direction.md`. On a feature workflow, also read `02-shape.md`, `02b-design.md`, and `02c-craft.md` when they exist. A missing file is a gap to name in the first batch, not a stop. Each fact that bears on the idea becomes a finding with its source.
2. **Map the design space** as areas: the surfaces the idea touches; what the person does on each, step by step; layout and hierarchy; register, color, and type; motion and feedback; the states (empty, loading, error, first use); content and voice; and the fit with the identity, the current design, and the direction. Keep the problem side: what feels wrong today, where, and for whom.
3. Write `focus: design` in the board and in the document frontmatter.

## In the loop

- **Mark design items.** Write `design: true` on each item about how the idea looks or behaves. These items are the ones that travel.
- **Sketch when a picture decides faster than words**, for example when two options differ in layout, density, or tone. Draw on the host's design canvas ([../../_host-invocation.md](../../_host-invocation.md), row "Design canvas"): one canvas for the board, one artboard for each sketch, each labelled "Sketch — an idea". When the host has no canvas, use `/imagery` for one rough image, and save it under the workflow folder in `sketches/`. When neither is available, write a one-sentence scene in the question text, and record the sketch with `link: null`.
- **Record each sketch** in the board's `sketches[]`: its key, its thread, the keys of the items it shows, its link, a one-line caption in plain words, and `state: idea`. Give the link and the caption in the question text.
- **Raise a tension** when an idea pulls against `PRODUCT.md` or against a goal in `direction.md`. Name the goal in words.
- **Close an area** as in step 2.8. Also ask which of the area's sketches carry forward. Set `state: carried` or `state: dropped` on each.
- **The page** (step 2.9) shows each carried sketch beside the decisions it shows.

## At `done`

The walk (3.2) and the split (3.3) run as usual. These additions apply:

1. A piece of work that holds a kept item with `design: true` records `ux-impact` (the value you propose per `design/_lane.md`) and `sketches` (the keys of its carried sketches). The person confirms `ux-impact` at intake.
2. Two more forms join 3.3:
   - `design-direction` — a change to the project's design direction. Entry: `/wf design direction from <slug>`. The direction command shows the carried items to the person and writes only what the person confirms.
   - `design` — the design stage of a feature workflow (next section).

## On a feature workflow

`/wf brainstorm <feature-slug> design` brainstorms the design of a workflow that exists, before or after its design stage.

1. **Files.** Write the board to `.ai/workflows/<slug>/brainstorm-board-design.json` and the person's document to `.ai/workflows/<slug>/design-notes/brainstorm-design.md`, per the templates in [_artifact.md](_artifact.md), with `board: brainstorm-board-design.json`. When both files exist, resume them as Step 0 resumes a board. Write no `00-index.md` of a new workflow and no slice. Add the two files to `workflow-files` in the workflow's `00-index.md`, and change no other index field during the loop.
2. **At `done`**, the kept design items become one piece of work: `shape: design`, `state: routed`, `routed-to: <slug>`.
   - When `02c-craft.md` does not carry `direction-confirmed-by`, the entry is `/wf design <slug>`.
   - When it does, the entry is `/wf design <slug> amend`. Also set `progress.design: in-progress` in `00-index.md`: the design is reopened per `design/_lane.md`.
   - When `02-shape.md` is complete, set `next-command: wf-design` and `next-invocation` to the entry in `00-index.md`. When it is not, leave both: shape pre-fills the brief from the carried thoughts, and the design stage follows shape.
3. A kept item that is not about the design becomes a piece of work of another form, per 3.3.
