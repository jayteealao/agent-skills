# Design import (`design/import.md`)

`/wf design <slug> import <link|path>...` turns design work made outside `/wf` into boards: a design canvas, a claude.ai/design project, a local folder, a zip, or image files. An import never confirms by itself. It ends at the design stage, Step 5, where the person confirms the boards.

| | Detail |
|---|---|
| Requires | See [design.md → ## Requires](../design.md#requires). |
| Produces | `design/source/import-<n>/`, boards in `design/boards/`, then the stage's outputs ([stage.md](stage.md)) |
| Next | The design stage, Step 5 |

## Step 0 — Orient

1. Run [stage.md](stage.md) Step 0. The same stop rules apply: closed workflow, driver, missing shape.
2. Read `02c-craft.md` when it exists. An import into a confirmed design is an amend: the freeze writes `r<N+1>/`, and Amend steps 3 and 4 of [stage.md](stage.md) apply.
3. Load [_boards.md](_boards.md) in full.

## Step 1 — Copy the source

1. **A local folder, a zip, or image files.** Run `node "<skill-dir>/scripts/design-boards.mjs" import "<projectRoot>" <slug> <path>...`. The tool copies each path into `design/source/import-<n>/` and unpacks a zip there.
2. **A design canvas link.** Read the canvas with the host's tool (`_host-invocation.md`, row "Design canvas"). Save each artboard into `design/source/import-<n>/`: the HTML when the tool gives it, and a PNG otherwise. Record the link and the canvas version in `design/source/import-<n>/SOURCE.md`.
3. **A claude.ai/design project.** Use the host's design sync tool when the session has one. Otherwise ask the person to export the project as a zip, then use item 1.
4. When the host cannot read the link, say so, and ask the person for an export. Do not guess the content of a link.

Write `SOURCE.md` in the import folder for every import: what it is, where it came from, and the date.

## Step 2 — Map screens to boards

1. List every screen in the import, with its file and a short description.
2. Map each screen to a surface and a state from the brief's content inventory. Use the board key rule of [_boards.md](_boards.md).
3. Ask the person to confirm the map in one batched question per [_gate-question.md](../_gate-question.md). Name each screen that maps to no surface, and each surface that has no screen.
4. A surface with no screen gets a board by the normal methods of [_boards.md](_boards.md) → Make the boards.

## Step 3 — Make the boards

1. Run `init` with `--method import` and the viewports of the import.
2. For each mapped screen:
   - An HTML screen: copy it to `design/boards/<key>.html`. Keep its links to files in `source/` working.
   - An image screen: copy it to `design/boards/<key>.png`.
3. Run `render`. Read every PNG yourself.
4. Set each board's `caption` in `design/boards.json` to the screen's description.

## Step 4 — Confirm

Continue at [stage.md](stage.md) Step 5. Then run Step 6, which freezes the boards and writes `02c-craft.md` with `boards:`. Add `design/source/import-<n>/` to the `## Visual direction confirmed` paragraph as the source of the boards.
