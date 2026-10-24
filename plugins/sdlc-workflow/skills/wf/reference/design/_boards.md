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
| `sketches/<key>.png` or `.html` | Brainstorm sketches carried to this workflow. A sketch path can be `<file>#<artboard>` when one file holds several sketches. |
| `captures/<slice>/<key>.png` | Verify captures, with the same key as the board. |
| `r<N>/` | Revision N, frozen when the person confirmed it: `boards.json`, `boards/`, `index.html`. Never changed. |

A **board key** is `<surface>--<state>`, plus `--<viewport>` when a surface has more than one viewport: `squad-list--default`, `squad-list--sorted--phone`. Use lower case, digits, and single dashes. `<surface>` is a name from `surfaces:` in `02c-craft.md`.

Two names have a fixed meaning:
- **`<surface>--worst`** is the worst-case board: the surface drawn with the worst-case content of [harden.md](harden.md). [stage.md](stage.md) Step 4 says which surfaces get one.
- **`sketches/direction-<name>.html`** is a direction sketch of [stage.md](stage.md) Step 3b. It is not a board, the manifest does not list it, and `freeze` does not copy it. `render` turns it into a PNG, and the working contact sheet shows it under "Directions".

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
| `canvas-stale <slug> [--account <name>]` | List each sketch and board whose recorded `canvas.sha256` differs from its file, or whose `canvas.account` differs from the given account. |

Two commands take other arguments:
- `node "<skill-dir>/scripts/design-boards.mjs" ansi <input.txt> --scheme <campbell|solarized-light> --out <file.html>` renders terminal output with its ANSI colours to HTML. `campbell` is a dark scheme; `solarized-light` is a light scheme.
- `node "<skill-dir>/scripts/design-boards.mjs" track "<projectRoot>" [--write]` reports the `.gitignore` lines of [Tracking](#tracking).

The tool renders with an installed Chromium browser in headless mode. Set `SDLC_BROWSER` to choose one. When no browser works, a board stays HTML only, and the manifest records `"png": null` with the reason. Tell the person, and show them the HTML file instead.

## Make the boards (design stage Step 4)

The method follows the situation, not the host. Choose the first method that applies:

1. **Capture.** The product exists and the stack can run it: capture every touched surface in its current state into `source/captures/`. Draw the changes on top of the captures, or beside them.
2. **Import.** The person brings outside design work (a canvas, a claude.ai/design project, a folder, a zip, image files): run [import.md](import.md).
3. **HTML boards.** For new surfaces, write one self-contained HTML file per surface and state into `boards/`. Use the tokens and components of `DESIGN.md`, real copy, and realistic data. Inline the CSS, or link a file in `source/`.

**A terminal surface.** Capture the real output, or write it as text with its ANSI codes. Render it with `ansi` and a named scheme into `boards/<key>.html`, then run `render`. Use the same render for an HTML board of a terminal surface. Draw one board for each scheme that `_platforms.md` → Terminal names, and state the scheme in the caption.

Then:
1. Run `init` with the viewports of the brief's `viewports:` (`02b-design.md`). Ask the person only when the brief has none. Do not assume one size.
2. Run `render`. Read every PNG yourself before you show it.
3. On a host with a design canvas (`_host-surfaces.md`, row "Design canvas"), publish the boards to the canvas from the session's own account, one artboard per board, so the person can comment there. Record the `canvas` object per [The file is the source](#the-file-is-the-source). The files in `boards/` stay the contract.

`/imagery` makes mood and brand images only. A generated image is never a board. Save a mood image in `source/` with `/imagery … into .ai/workflows/<slug>/design/source`.

## Show the boards (design stage Step 5)

1. Run `sheet`.
2. When the host can send a file to the person, send `design/index.html` and the board PNGs. On a phone, send the PNGs: a local path does not open there.
3. Always give the path of `design/index.html` in the question text as well. Give a local path first and a canvas link second.
4. When a canvas mirror exists, run `canvas-stale` and republish each listed file. Then read the canvas comments before you ask, per [The file is the source](#the-file-is-the-source).

On **adjust**, change only the boards the person named, run `render` for those keys, and ask again.

## Freeze (design stage Step 6)

1. Run `freeze` with `--by` (the source that confirmed the direction) and the canvas link when a mirror exists.
2. Write `02c-craft.md` with `boards:` and `north-star-mock:` from the freeze result, and `design-revision: <N>`.
3. When the result has a warning, tell the person.

On **amend**, change only the named boards in the working set, render them, show them, and freeze again. The new revision is `r<N+1>/`, and the new `02c-craft.md` names it.

## The file is the source

A sketch or board file in git is the design. A canvas is a published view of that file. Every stage, sub-agent, machine, and account reads the file, so no stage needs a canvas to read the design.

**Publish.** Publish every canvas from the session's own account. Record `canvas: { link, account, published-at, sha256 }`, where `sha256` is the hash of the published file. A sketch records it on its sketch entry (board `sketches[]`, work packet file `sketches:`); a board records it in `boards.json`. On a host with no design canvas, give the file path only, and record no `canvas`.

**Republish a stale view.** Before a link goes into a question, run `canvas-stale <slug> --account <session account>`. For each listed file:
1. When `canvas.account` is not the session's account, publish the file again under the session's account. Record the new link, and keep the old link in `canvas.previous[]`. Before you stop using the old link, read its comments once when the session's account can read them.
2. When `canvas.sha256` differs from the file's hash, publish the file again to the same link. The person never reviews an old view.

**A change made on the canvas.** Change a sketch or a board only through its file.
1. Before each design question, read the canvas comments with the host's comment tool. Turn each comment into a change to the file, or answer it. Then republish the file to the same link.
2. The host refuses a republish to a link whose live version is newer, and the refusal gives the live version. Then ask the person one question: take the canvas change into the file, or replace it with the file. Write the choice to the file, then republish.
3. For a frozen board, a taken canvas change goes through [import.md](import.md) and becomes a new board revision. Never edit a file inside `r<N>/`.

**Design work with no file.** Save it to a local file at once: [import.md](import.md) → Import at the door.

## The settled rule

[_lane.md](_lane.md) → "The human rule" owns when the design is settled, including the check that every named board exists on disk. The pre-write hook runs the same check on a plan write. Run `check` to list the missing boards.

## Use the boards in a later stage

- **Sub-agents** get board paths (`design/r<N>/boards/<key>.png`), never a canvas link. A sub-agent cannot open a canvas link.
- **Plan** cites the board keys in the steps that build each surface.
- **Implement** reads the board PNGs of the surfaces in its slice. For each `<surface>--worst` board, it makes the worst-case content loadable in development with the stack's own means (a fixture, a story, a preview, a seed), never in production code paths.
- **Verify** captures each built surface to the path that `capture-name` gives. `## Design Comparison` pairs each board with its capture and lists the differences. With no boards, it records `design-comparison: no-boards` and reports no visual pass. For a `--worst` board, it loads the worst-case content and captures that state; when the content cannot load, it records `worst-case: not-captured:<reason>` for that key.
- **Retro** links the newest board of each surface in `.ai/design/current.md`.

## Tracking

A repo that ignores `.ai/` loses the boards with the machine. `freeze` writes each confirmed revision to its own folder so that the repo can track `r<N>/` and `.ai/design/` alone. The sketches are design files too: the repo tracks every file in `.ai/workflows/*/design/sketches/`, carried or dropped. The working `design/boards/` folder stays ignored. `node "<skill-dir>/scripts/design-boards.mjs" track "<projectRoot>"` reports the `.gitignore` lines that do this, and `--write` adds them. A repo with an older block gets the sketch lines too. Ask the person before you run `--write`.
