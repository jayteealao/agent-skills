# Design import (`design/import.md`)

`/wf design <slug> import <link|path>...` turns design work made outside `/wf` into screens on the design surface: a design canvas, a claude.ai/design project, a local folder, a zip, or image files. An import never approves by itself. It ends at the design stage, Step 5, where the person approves the screens. In this file, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

| | Detail |
|---|---|
| Requires | See [design.md → ## Requires](../design.md#requires). |
| Produces | `.ai/design/references/import-<n>/` with its references, screens in `.ai/design/screens/`, then the stage's outputs ([stage.md](stage.md)) |
| Next | The design stage, Step 5 |

## Import at the door

The tracked file is the only source of a design. A canvas or a link is a view of a file. Design work that has no local file becomes a file at once:

- in a brainstorm or an explore run, as an explore sketch (`design/explore.md`);
- at the design stage, as screens, through the steps below.

From then on, every stage reads the file.

When the session's account can read only a summary of a link (the account can view it but cannot edit it), the full page cannot be saved. Ask the person for one of:
- edit access to the link for this account;
- the downloaded file, and its path;
- the link as a reference only: `state: reference`, no file, never a screen.

## Step 0 — Orient

1. Run [stage.md](stage.md) Step 0. The same stop rules apply: closed workflow, driver, missing shape.
2. Read `02c-craft.md` with `wf.mjs record get` when it exists. An import into an approved design is an amend: the screens change in place, the approval runs again, and Amend steps 3 and 4 of [stage.md](stage.md) apply.
3. Load [_surface.md](_surface.md) in full. When `.ai/design/screens.json` is missing, run `<wf> design init <root>`.
4. Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists. Import skips stage Step 4, so this is the load point of the floor.

## Step 1 — Copy the source

1. **A local folder, a zip, or image files.** Copy each path into `.ai/design/references/import-<n>/`, and unpack a zip there.
2. **A design canvas link.** Read the canvas with the host's tool (`_host-surfaces.md`, row "Design canvas"). Save each artboard into `.ai/design/references/import-<n>/`: the HTML when the tool gives it, and a PNG otherwise. Record the link and the canvas version in `SOURCE.md` of the import folder.
3. **A claude.ai/design project.** Use the host's design sync tool when the session has one. Otherwise ask the person to export the project as a zip, then use item 1.
4. When the host cannot read the link, say so, and ask the person for an export. Do not guess the content of a link.

Write `SOURCE.md` in the import folder for every import: what it is, where it came from, and the date. Add each imported file as a reference with `<wf> design refs add <root> <key> --file <path> --kind <image|page|canvas> [--link <url>]`, and run `<wf> design refs check <root>`.

## Step 2 — Map the imported pages to screens

1. List every page or picture in the import, with its file and a short description.
2. Map each one to a screen key and a state from the brief's content inventory. An existing screen of the surface keeps its key.
3. Ask the person to confirm the map in one batched question per [_gate-question.md](../_gate-question.md). Name each imported page that maps to no surface, and each surface that has no imported page.
4. A surface with no imported page gets a screen by the normal steps of [stage.md](stage.md) Step 4.

## Step 3 — Make the screens

1. For each mapped screen, run `<wf> design screen add <root> <key> --title "<title>" --area <area> --flow <flow> --order <n> --workflow <slug>`, with the area, flow and order of [_surface.md](_surface.md) → Arranging the screens. Then set the order of the areas with `<wf> design areas`.
2. An HTML page: copy its content into the state sections of the screen page, and keep its links to other screens working. A picture: put it in the state section as an image of the reference file, and say so in the caption; draw it as HTML before the approval when the person wants to click through it.
3. Make sure each screen has the five states.
4. Run `<wf> design check <root> --workflow <slug>`. Do not change an imported page beyond the five states. Name each check failure and each finding of the craft floor to the person at Step 5, with its screen key.

## Step 4 — Approve

Continue at [stage.md](stage.md) Step 5. Then run Step 6, which writes `02c-craft.md` and records the approval. Name `.ai/design/references/import-<n>/` in the `## Visual direction confirmed` paragraph as the source of the screens.
