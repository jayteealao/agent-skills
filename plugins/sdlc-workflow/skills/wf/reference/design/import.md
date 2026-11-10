# Design import (`design/import.md`)

`/wf design <slug> import <link|path>...` turns design work made outside `/wf` into screens on the design surface: a design canvas, a claude.ai/design project, a local folder, a zip, or image files. An import never approves by itself. It ends at the design stage, Step 5, where the person approves the screens. In this file, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`, and the step numbers with "stage" are the steps of [stage.md](stage.md).

| | Detail |
|---|---|
| Requires | See [design.md → ## Requires](../design.md#requires), with `--mode stage --mode import`. |
| Produces | `.ai/design/references/import-<n>/` with its references, screens in `.ai/design/screens/`, then the outputs of the stage |
| Next | The design stage, Step 5 |

## Import at the door

The tracked file is the only source of a design. A canvas or a link is a view of a file. Design work that has no local file becomes a file at once:

- in a brainstorm or an explore run, as an explore sketch (`design/explore.md`);
- at the design stage, as screens, through the steps below.

From then on, every stage reads the file.

When the account of the session can read only a summary of a link (the account can view it but cannot edit it), the full page cannot be saved. Ask the person for one of:
- edit access to the link for this account;
- the downloaded file, and its path;
- the link as a note only: name it in `SOURCE.md` of the import folder. Add no reference, and make no screen from it.

## Step 0 — Orient

1. Run `<wf> design next <root> <slug>`. When it says that the workflow is closed or that the shape is not complete, stop as stage Step 0 says. The driver rule of the stage holds: a driver never runs an import.
2. When the action says that the design is approved or reopened, the import is an amend: the screens change in place, the approval runs again, and Step 4 below ends with items 5 and 6 of [amend.md](amend.md).
3. Run stage Step 1, items 1–4: the design context, the design record, the screens of the repo, and the reference check.
4. Load [_craft-floor.md](_craft-floor.md) now, because an import skips stage Step 4. Its load table says how an import uses it.
5. Run stage Step 3c, the foundation. `<wf> design foundation <root>` must exit 0 before Step 3: `design screen add` refuses a new screen until then.

## Step 1 — Copy the source

1. **A local folder, a zip, or image files.** Copy each path into `.ai/design/references/import-<n>/`, and unpack a zip there.
2. **A design canvas link.** Read the canvas with the tool of the host (`_host-surfaces.md`, row "Design canvas"). Save each artboard into `.ai/design/references/import-<n>/`: the HTML when the tool gives it, and a PNG otherwise. Record the link and the canvas version in `SOURCE.md` of the import folder.
3. **A claude.ai/design project.** Use the design sync tool of the host when the session has one. Otherwise ask the person to export the project as a zip, then use item 1.
4. When the host cannot read the link, say so, and ask the person for an export. Do not guess the content of a link.

Write `SOURCE.md` in the import folder for every import: what it is, where it came from, and the date. Add each imported file as a reference with `<wf> design refs add <root> <key> --file <path> --kind <image|page|canvas> [--link <url>]`, and run `<wf> design refs check <root>`.

## Step 2 — Map the imported pages to screens

1. List every page or picture in the import, with its file and a short description.
2. Map each one to a screen key and a state from the content inventory of the brief. An existing screen of the surface keeps its key.
3. Send the map in chat as a table: imported page, screen key, state. Name each imported page that maps to no surface, and each surface that has no imported page. Then ask one gate question per [_gate-question.md](../_gate-question.md): the map is right, or name a correction.
4. A surface with no imported page gets a screen by the normal steps of stage Step 4.

## Step 3 — Make the screens

1. For each mapped screen, run `<wf> design screen add <root> <key> --title "<title>" --area <area> --flow <flow> --order <n> --workflow <slug>`, with the area, flow and order of [_surface.md](_surface.md) → Arranging the screens. Then set the order of the areas with `<wf> design areas <root> <area> ...`.
2. An HTML page: copy its content into the state sections of the screen page, and keep its links to other screens working. A picture: put it in the state section as an image of the reference file, and say so in the caption. Draw it as HTML before the approval when the person wants to click through it.
3. Make sure that each screen has the five states.
4. Do not change an imported page beyond the five states. Run `<wf> design round <root> <slug>`.

## Step 4 — Approve

1. Continue at stage Step 5. It runs the check one time. Its stop message names each check cause and each finding of the craft floor, with its screen key.
2. On a first approval, run stage Step 6. On an amend (Step 0, item 2), run items 5 and 6 of [amend.md](amend.md) instead: they write the contract and record the approval one time.
3. Name `.ai/design/references/import-<n>/` in the `## Visual direction confirmed` paragraph as the source of the screens, and write `import` in `modes:` of the contract.
