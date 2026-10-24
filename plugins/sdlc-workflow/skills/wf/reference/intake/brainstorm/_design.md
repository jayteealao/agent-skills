# Design focus (`intake/brainstorm/_design.md`)

Load this file when the board's `focus` is `design`: `/wf intake brainstorm design <idea>`, `/wf intake brainstorm <slug> design`, or `/wf intake <feature-slug> brainstorm design`. It adds to the loop in [../brainstorm.md](../brainstorm.md) and replaces nothing. Every rule of that loop still applies, the Plain words invariant included.

A design brainstorm thinks through how an idea looks and behaves: the surfaces, what a person does on them, and how they feel. The design stage (`design/stage.md`) later presents these thoughts again as its starting direction (`design/_carried.md`).

## The rule: sketches are ideas

A sketch is an idea the person can drop tomorrow at no cost. The person confirms a design only at the design stage.
- Do not write `02c-craft.md`.
- Do not write an `image-gate` value.
- Do not write `direction-confirmed-by`.
- Do not write `PRODUCT.md`, `DESIGN.md`, or a file in `.ai/design/`. A change to the design direction becomes a piece of work at `done`.
- Do not load `design/_craft-floor.md`. The craft floor applies when the design stage draws boards.

## Step 0 additions

1. **Read the design record**, as cheap reads: `PRODUCT.md`, `DESIGN.md`, `.ai/design/current.md`, and `.ai/design/direction.md`. On a feature workflow, also read `02-shape.md`, `02b-design.md`, and `02c-craft.md` when they exist. A missing file is a gap to name in the first batch, not a stop. Each fact that bears on the idea becomes a finding with its source.
2. **Map the design space** as areas: the surfaces the idea touches; what the person does on each, step by step; layout and hierarchy; the design mode of each surface (Persuade, Operate, Read, or Experience), color, and type; motion and feedback; the states (empty, loading, error, first use); content and voice; and the fit with the identity, the current design, and the direction. Keep the problem side: what feels wrong today, where, and for whom.
3. Write `focus: design` in the board and in the document frontmatter.

## In the loop

- **References first.** When the design record of step 0.1 is empty, the first design batch asks for references: products, pages, or images that feel right or wrong. When the person promises references, draw no sketch until they arrive. Each sketch caption names the reference that the sketch starts from.
- **Import at the door.** When the person gives a claude.ai link or other design work made outside `/wf`, save it at once to a local file, `.ai/workflows/<slug>/design/sketches/<key>.html`. From then on the file is the source. When the session's account can read only a summary of the link, the full page cannot be saved. Ask the person for one of: edit access for this account, the downloaded file and its path, or the link as a reference only (`state: reference`, no file, never a board).
- **Mark design items.** Write `design: true` on each item about how the idea looks or behaves. These items are the ones that travel.
- **Sketch when a picture decides faster than words**, for example when two options differ in layout, density, or tone. Save each sketch as a file in `.ai/workflows/<slug>/design/sketches/`: `<key>.html`, or an image `<key>.png` (`design/_boards.md`). The file is the source: change a sketch only through its file. Then publish the file on the host's design canvas (`_host-surfaces.md`, row "Design canvas") from the session's own account: one canvas for the board, one artboard for each sketch, each labelled "Sketch — an idea". After each change to the file, publish it again to the same link. When the host has no canvas, write the HTML sketch, or use `/imagery … into .ai/workflows/<slug>/design/sketches` for one rough image, and rename the image to `<key>.<ext>`. When neither is available, write a one-sentence scene in the question text, and record the sketch with `link: null` and `path: null`.
- **Record each sketch** in the board's `sketches[]`: its key, its thread, the keys of the items it shows, its link, its `path`, a one-line caption in plain words, and `state: idea`. A `path` may be `<file>#<artboard>` when one file holds several sketches: record one key for each artboard. For a published sketch, record `canvas: { link, account, published-at, sha256 }`, where `sha256` is the hash of the published file. Give the link or the path, and the caption, in the question text.
- **Raise a tension** when an idea pulls against `PRODUCT.md` or against a goal in `direction.md`. Name the goal in words.
- **Close an area** as in step 2.8. Also ask which of the area's sketches carry forward. Set `state: carried` or `state: dropped` on each.
- **The page** (step 2.9) shows each carried sketch beside the decisions it shows.

## At `done`

The walk (3.2) and the split (3.3) run as usual. These additions apply:

1. A piece of work that holds a kept item with `design: true` records `ux-impact` (the value you propose per `design/_lane.md`) and `sketches` (the keys of its carried sketches). The person confirms `ux-impact` in 3.4, with `ux-impact-confirmed: true`. A piece with a `ux-impact` other than `none` gets `try-out: yes`.
2. The `design-form` flag of 3.3 ([_work.md](_work.md)) takes one of two values:
   - `design-direction` — a change to the project's design direction. Entry: `/wf design direction from <slug>`. The direction command shows the carried items to the person and writes only what the person confirms.
   - `design` — the design stage of a feature workflow (next section).
3. When the kept `design: true` items fall in more than one piece, propose one piece for the shared look first, with `design-form: design-direction`. Give it the lowest `order` of these pieces. Name it in the `why-here` of each feature piece that follows it, and keep the shared look out of the feature pieces.

## On a feature workflow

`/wf intake brainstorm <feature-slug> design` brainstorms the design of a workflow that exists, before or after its design stage.

1. **Files.** Write the board to `.ai/workflows/<slug>/brainstorm-board-design.json` and the person's document to `.ai/workflows/<slug>/design-notes/brainstorm-design.md`, per the templates in [_artifact.md](_artifact.md), with `board: brainstorm-board-design.json`. When both files exist, resume them as Step 0 resumes a board. Write no `00-index.md` of a new workflow and no slice. Add the two files to `workflow-files` in the workflow's `00-index.md`, and change no other index field during the loop.
2. **At `done`**, the kept design items become one piece of work on this board: `shape: design`, `slug: <slug>`, `state: proposed`, and `entry` (below). It gets no piece file and no list: the design stage reads this board ([../../design/_carried.md](../../design/_carried.md), source 3).
   - When `02c-craft.md` does not carry `direction-confirmed-by`, the entry is `/wf design <slug>`.
   - When it does, the entry is `/wf design <slug> amend`. Also set `progress.design: in-progress` in `00-index.md`: the design is reopened per `design/_lane.md`.
   - When `02-shape.md` is complete, set `next-command: wf-design` and `next-invocation` to the entry in `00-index.md`. When it is not, leave both: shape pre-fills the brief from the carried thoughts, and the design stage follows shape.
3. A kept item that is not about the design becomes a piece of work of another form, per 3.3.
