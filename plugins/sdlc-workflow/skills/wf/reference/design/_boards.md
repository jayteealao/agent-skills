# Design boards (`design/_boards.md`)

The single source for where the drawings of a workflow live and how they are made, shown, frozen, and checked. The design stage ([stage.md](stage.md)) runs this procedure. Every other stage cites this file by path and reads only the part it names.

> Load with: `design/_boards.md`

## The folder

Every workflow keeps its drawings in one folder, `.ai/workflows/<slug>/design/`:

| Path | Holds |
|---|---|
| `boards.json` | The manifest of the working boards (schema `sdlc/design-boards/v1`). |
| `index.html` | The contact sheet: every board with its caption, by surface. The tool writes it. |
| `boards/<key>.html`, `boards/<key>.png` | One board per surface and state. The PNG is what the person sees and what verify compares against. |
| `source/` | What made the boards: a build script, captures of the running app, a canvas export, an imported bundle (`source/import-<n>/`). |
| `sketches/<key>.png` or `.html` | Brainstorm sketches carried to this workflow. |
| `captures/<slice>/<key>.png` | Verify captures, with the same key as the board. |
| `r<N>/` | Revision N, frozen when the person confirmed it: `boards.json`, `boards/`, `index.html`. Never changed. |

A **board key** is `<surface>--<state>`, plus `--<viewport>` when a surface has more than one viewport: `squad-list--default`, `squad-list--sorted--phone`. Use lower case, digits, and single dashes. `<surface>` is a name from `surfaces:` in `02c-craft.md`.

`design-notes/` keeps its own job (move notes). `design/` holds only drawings and their sources. The write hooks do not check file names in `design/`.

## The tool

Run every step through the board tool. Each command prints one JSON object.

```
node "<skill-dir>/scripts/design-boards.mjs" <command> "<projectRoot>" <slug> [args]
```

| Command | Job |
|---|---|
| `init <slug> [--method html\|capture\|import\|canvas-export] [--viewport <name>=<w>x<h>]` | Create the folder and the manifest. The first viewport is the main one. |
| `render <slug> [key…]` | Add each `boards/<key>.html` or `.png` to the manifest, render each HTML board to a PNG at its viewport, and write the contact sheet. Without keys, it also renders each `sketches/<key>.html` to a PNG. |
| `sheet <slug>` | Write the contact sheet again. |
| `freeze <slug> [--by in-session\|product-md\|teach] [--canvas <link>] [--canvas-version <v>]` | Copy the boards to `r<N+1>/` and record the confirmation. It refuses when that folder exists. |
| `check <slug>` | List the board files that `02c-craft.md` `boards:` names but that are missing. |
| `capture-name <slug> <slice> <key>` | Give the capture path of a board for verify. |
| `import <slug> <path>…` | Copy outside design work into `source/import-<n>/`. |

The tool renders with an installed Chromium browser in headless mode. Set `SDLC_BROWSER` to choose one. When no browser works, a board stays HTML only, and the manifest records `"png": null` with the reason. Tell the person, and show them the HTML file instead.

## Make the boards (design stage Step 4)

The method follows the situation, not the host. Choose the first method that applies:

1. **Capture.** The product exists and the stack can run it: capture every touched surface in its current state into `source/captures/`. Draw the changes on top of the captures, or beside them.
2. **Import.** The person brings outside design work (a canvas, a claude.ai/design project, a folder, a zip, image files): run [import.md](import.md).
3. **HTML boards.** For new surfaces, write one self-contained HTML file per surface and state into `boards/`. Use the tokens and components of `DESIGN.md`, real copy, and realistic data. Inline the CSS, or link a file in `source/`.

Then:
1. Run `init` with the viewports the person confirms. Ask for them; do not assume one size.
2. Run `render`. Read every PNG yourself before you show it.
3. On a host with a design canvas (`_host-invocation.md`, row "Design canvas"), mirror the boards to the canvas, one artboard per board, so the person can comment there. The files in `boards/` stay the contract.

`/imagery` makes mood and brand images only. A generated image is never a board. Save a mood image in `source/` with `/imagery … into .ai/workflows/<slug>/design/source`.

## Show the boards (design stage Step 5)

1. Run `sheet`.
2. When the host can send a file to the person, send `design/index.html` and the board PNGs. On a phone, send the PNGs: a local path does not open there.
3. Always give the path of `design/index.html` in the question text as well.
4. When a canvas mirror exists, read its comments before you ask.

On **adjust**, change only the boards the person named, run `render` for those keys, and ask again.

## Freeze (design stage Step 6)

1. Run `freeze` with `--by` (the source that confirmed the direction) and the canvas link when a mirror exists.
2. Write `02c-craft.md` with `boards:` and `north-star-mock:` from the freeze result, and `design-revision: <N>`.
3. When the result has a warning, tell the person.

On **amend**, change only the named boards in the working set, render them, show them, and freeze again. The new revision is `r<N+1>/`, and the new `02c-craft.md` names it.

## The settled rule

For `ux-impact: visual` or `new-surface`, the design is settled only when every board that `boards:` names exists on disk ([_lane.md](_lane.md)). The pre-write hook runs the same check on a plan write. Run `check` to see what is missing. A `flow` design may record `image-gate: skipped:<reason>`. A `02c-craft.md` without `boards:` (written before boards existed) keeps the old rule.

## Use the boards in a later stage

- **Sub-agents** get board paths (`design/r<N>/boards/<key>.png`), never a canvas link. A sub-agent cannot open a canvas link.
- **Plan** cites the board keys in the steps that build each surface.
- **Implement** reads the board PNGs of the surfaces in its slice.
- **Verify** captures each built surface to the path that `capture-name` gives. `## Design Comparison` pairs each board with its capture and lists the differences. With no boards, it records `design-comparison: no-boards` and reports no visual pass.
- **Retro** links the newest board of each surface in `.ai/design/current.md`.

## Tracking

A repo that ignores `.ai/` loses the boards with the machine. `freeze` writes each confirmed revision to its own folder so that the repo can track `r<N>/` and `.ai/design/` alone. `node "<skill-dir>/scripts/design-boards.mjs" track "<projectRoot>"` reports the `.gitignore` lines that do this, and `--write` adds them. Ask the person before you run `--write`.
