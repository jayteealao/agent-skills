# The design surface (`design/_surface.md`)

The single source for where the screens of a product live and how a design run makes them. Each product repo has one design surface, shared by every workflow. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

> Load with: `design/_surface.md`

## The folder

The surface is `.ai/design/` in the product repo, and git tracks it.

| Path | Holds | Writer |
|---|---|---|
| `screens/<key>.html` | One screen: an interactive page with mock data and the five states | the design agent |
| `explore/<key>.html` | A free sketch of an explore run; it is not a screen | the design agent |
| `tokens.css` | The token sheet, from the token roles of `DESIGN.md` | `<wf> design tokens` |
| `screens.json` | The manifest: each screen with its area, flow and order, its workflows and slices, and its approvals | `<wf> design` only |
| `layout.json` | The positions that the person dragged on the canvas | the canvas only |
| `references.json` | The references of the design, each with its path or link | the design agent |
| `current.md`, `direction.md` | The design record ([record.md](record.md)) | the design stage, retro, upkeep |

The comments, the approval pictures and the check results are in the records, not here, because a product repo can be public.

## A screen

- A **screen key** is kebab-case and names the screen, for example `basket` or `order-detail`. It is unique in the repo. Records cite screen keys.
- A screen page has the five states: `default`, `empty`, `loading`, `error` and `worst`. Each state is an element with `data-state="<name>"`. The page shows the state that `?state=<name>` names. The `worst` state holds the worst-case content of [harden.md](harden.md).
- A screen uses the tokens of `tokens.css` (`var(--<role>)`) and holds every other style and script in the page. It loads nothing from the network. It uses real copy and realistic mock data.
- A link to `<key>.html` in a screen is an edge of a flow. Make every step of a flow a link, so the person can click through it.
- A screen is a design, not product code. Do not import product code into it, and do not build a working feature in it.

## The tool

1. Run `<wf> design init <root>` before the first screen of the repo. It makes the folder and the manifest, writes `tokens.css`, keeps `.ai/design/` tracked in git (`.ai/*` and `!.ai/design/` in `.gitignore` when the repo ignores `.ai/`), and adds the repo to the design server.
2. Run `<wf> design screen add <root> <key> --title "<title>" --area <area> --flow <flow> --order <n> --workflow <slug> [--slice <slice>]` for each new screen. The command writes the page from a template with the five states. Then write the page.
3. Run `<wf> design screen add <root> <key> --workflow <slug>` for each existing screen that a workflow changes. Change the page in place: git keeps its history.
4. Run `<wf> design tokens <root>` after each change to the token roles of `DESIGN.md`.
5. Run `<wf> design list <root> [--workflow <slug>]` to see the screens, their states and their links. The command exits 1 and prints each problem when the manifest names a missing page.

Prohibitions:
- Do not write `screens.json` or `layout.json`. The pre-write check refuses it.
- Do not write a comment, an approval picture or a check result. The design server and `<wf> design` write them.
