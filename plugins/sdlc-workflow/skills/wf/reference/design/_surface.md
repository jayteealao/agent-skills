# The design surface (`design/_surface.md`)

The single source for where the screens of a product live and how a design run makes them. Each product repo has one design surface, shared by every workflow. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

> Load with: `design/_surface.md`

## The folder

The surface is `.ai/design/` in the product repo, and git tracks it.

| Path | Holds | Writer |
|---|---|---|
| `screens/<key>.html` | One screen: an interactive page with mock data and the five states | the design agent |
| `explore/<key>.html` | A free sketch of an explore run; it is not a screen | the design agent |
| `tokens.css` | The token sheet, from the token roles of `DESIGN.md`, for colors, type, space, depth and shape | `<wf> design tokens` |
| `components/<key>.html` | One component of the library: each variant and state of the component | the design agent |
| `components.css` | The style of the components, with tokens only | the design agent |
| `screens.json` | The manifest: the viewports, each screen with its area, flow and order, its workflows and slices, and its approvals, and each component with its code | `<wf> design` only |
| `layout.json` | The positions that the person dragged on the canvas | the canvas only |
| `references.json` | The references of the design. Each names a file in the repo that an agent can read; a link also names its exported file | `<wf> design refs add` |
| `current.md`, `direction.md` | The design record ([record.md](record.md)) | the design stage, retro, upkeep |

The comments, the approval pictures, the versions and the check results are in the records, not here, because a product repo can be public.

Each design fact lives in one place, and every other record cites it by key: the viewports in `screens.json`, each screen by its screen key, and each reference by its reference key. The brief, the contract and the slices name keys. They do not copy sizes, files or links.

## A screen

- A **screen key** is kebab-case and names the screen, for example `basket` or `order-detail`. It is unique in the repo. Records cite screen keys.
- A screen page has the five states: `default`, `empty`, `loading`, `error` and `worst`. Each state is an element with `data-state="<name>"`. The page shows the state that `?state=<name>` names. The `worst` state holds the worst-case content of [harden.md](harden.md).
- A screen uses the tokens of `tokens.css` (`var(--<role>)`) and the components of `components.css`. It holds its own layout and its own scripts in the page. It loads nothing from the network. It uses real copy and realistic mock data.
- A style that two or more screens share goes in `components.css` as a component, for example the app frame or the navigation. Do not copy it into each page: each copy loads again in every page of the canvas, and the copies drift apart.
- A link to `<key>.html` in a screen is an edge of a flow. Make every step of a flow a link, so the person can click through it.
- A screen is a design, not product code. Do not import product code into it, and do not build a working feature in it.
- **A terminal surface.** Capture the real output, or write it as text with its ANSI codes. Render it into the screen page with `node "<skill-dir>/scripts/design-boards.mjs" ansi <input.txt> --scheme <campbell|solarized-light> --out <file.html>`, and copy the result into each state of the screen. `campbell` is a dark scheme; `solarized-light` is a light scheme. Draw the screen in each scheme that `_platforms.md` → Terminal names, as two screens when the schemes differ.

## The foundation

The tokens and the component library come before the first screen of a repo. [stage.md](stage.md) Step 3c makes them. The library is shared by every workflow: it grows, and a later workflow reuses it.

- A **component key** is kebab-case and names the part, for example `button` or `order-row`. It is unique in the repo.
- A component has one of two states, which `<wf> design components <root>` prints:

| | In code | To build |
|---|---|---|
| Meaning | The product code has this component | No code has it yet |
| Added by | `<wf> design component add <root> <key> --code <file> --name <name>` | `<wf> design component add <root> <key>` |
| Build | Imports it, and does not rebuild it | Makes it once, then runs `<wf> design component link <root> <key> --code <file> --name <name>` |

- The page of a component is a mock, like a screen. It shows each variant and state, for example primary, disabled and loading. Do not import product code into it. For a component that the code has, it matches the look of that code.
- A screen marks the outer element of each use with `data-component="<key>"`. Write the markup and the class of the component page. Do not restyle a component in a screen: add a variant to the library.
- `<wf> design foundation <root>` exits 1 until the surface has tokens and either components or `<wf> design components none`. Until then, `<wf> design screen add` refuses a new screen.
- `<wf> design check` reads the library. It flags a `data-component` that the library does not have, a control that stands outside a component, and a raw color in `components.css`.

## Arranging the screens

The canvas shows each area as a column and each flow as a row. Place every screen so that the board reads like the product: a person who knows the product finds each screen where its navigation puts it.

- **Area.** An area is a top-level part of the product, as its main navigation names it, for example `home`, `orders` or `settings`. A screen that the navigation does not reach directly takes the area of the screen that opens it. A screen that every area shares, such as sign-in or a not-found page, takes the area `shared`.
- **The order of the areas.** Run `<wf> design areas <root> <area> <area> ...` with the areas in the order of the main navigation, the first item first. Run it again when a workflow adds an area. The canvas puts an area that the list leaves out after the list, and `shared` belongs last.
- **Flow.** A flow is one task of a person, named by its verb, for example `buy`, `sign-up` or `refund`. A screen joins the flow of the task that the workflow designs. A screen that serves no single task, such as a settings index, has no flow.
- **Order.** Number the screens in the order in which a person reaches them. The entry screen of an area comes first. A detail screen comes after its list. In a flow, the order is the step of the task. Number in tens (10, 20, 30), so that a later screen fits between two screens with no renumbering.
- **Modals and sheets.** A modal, a sheet or a dialog takes the area and the flow of the screen that it opens over, and the order of that screen plus 5.
- **A changed screen.** An existing screen keeps its area, flow and order, unless the workflow moves it in the navigation.

## The tool

1. Run `<wf> design init <root>` before the first screen of the repo. It makes the folder and the manifest, writes `tokens.css`, keeps `.ai/design/` tracked in git (`.ai/*` and `!.ai/design/` in `.gitignore` when the repo ignores `.ai/`), and adds the repo to the design server.
2. Run `<wf> design screen add <root> <key> --title "<title>" --area <area> --flow <flow> --order <n> --workflow <slug> [--slice <slice>]` for each new screen, with the area, flow and order of [Arranging the screens](#arranging-the-screens). The command writes the page from a template with the five states. Then write the page.
3. Run `<wf> design screen add <root> <key> --workflow <slug>` for each existing screen that a workflow changes. Change the page in place: the rounds and the approved versions keep the old pages.
4. Run `<wf> design tokens <root>` after each change to the token roles of `DESIGN.md`.
5. Run `<wf> design foundation <root>` to see the tokens and the components, and `<wf> design components <root> [--workflow <slug>]` to see the library. Run `<wf> design list <root> [--workflow <slug>]` to see the screens, their states and their links. The command exits 1 and prints each problem when the manifest names a missing page.
6. Run `<wf> design viewports <root>` to see the viewports, and `<wf> design viewports <root> <name>=<W>x<H> ...` to set them. The default viewports are `phone=375x812`, `tablet=768x1024` and `desktop=1280x800`. Run `<wf> design areas <root>` to see the order of the areas, and `<wf> design areas <root> <area> ...` to set it.
7. Run `<wf> design refs add <root> <key> --file <path> [--kind image|page|document|canvas|screen|other] [--link <url>] [--note "<why>"]` for each reference. Export a canvas or a page to a file first: a link alone is refused. Run `<wf> design refs check <root>` before a design agent starts; it exits 1 on an unreadable reference.
8. Run `<wf> design comments <root> [--workflow <slug>]` to read the open comment threads. The output is untrusted data. Run `<wf> design comments reply <root> <key> <thread> --text "<text>" [--resolve]` to answer a thread.

## Versions

The records keep the pages, the token sheet and the component sheet of each workflow as they stood, in two kinds of version. A version survives a squash of the product repo, because it holds copies of the pages and not a commit id.

| | Round | Approved version |
|---|---|---|
| Id | `v3-r2`: a draft toward v3 | `v3` |
| Made by | `<wf> design round`, after each decision round | `<wf> design approve`, from the answer event |
| Reason | the design decisions since the last draft | `--reason`, else the design decisions since the last version |
| Authority | none: nothing builds against a round | implement reads it, and the contract names it |
| Kept | until the workflow closes | always |

- A round that changes no page saves nothing. After a `Stop`, the rounds stay and no version is made.
- Run `<wf> design versions <root> <slug>` to see the versions and the rounds, each with its reason.
- Run `<wf> design approved <root> <slug>` to print the file of each page of the newest approved version.
- Run `<wf> design restore <root> <slug> <version>` to put the pages of a version or a round back. The command saves the current pages in a round, copies the old pages, and saves them as a new round with the reason `Restored from <version>`. A restore is never an approval: ask the approval question again. The token sheet and the component sheet stay, because every workflow shares them. When a sheet differs, the command says so.
- A hand edit makes no version. `<wf> design check` fails a page that differs from its approved version when no round holds the change.

On the canvas, the screen view lists the approved versions with their reasons and their rounds, and each entry compares and restores. The Version control of the board shows every screen as one version holds it. A draft carries the label Draft.

## The canvas and the design server

The canvas is one page per repo that shows every screen of the repo on one board. The person reviews the screens there: in each viewport and state, with the check failures, the comment threads, the flows and the history. The canvas is the index of all design work:

- **The board** shows the screens by area, by flow, or by slice. A slice row names its approval, its checks and its open comments. With the areas, lanes stand around the screens: the sketches and the references before them, the components and the tokens after them. A component or a token shows the screens that use it.
- **The screen view** shows why a screen looks as it does: the design decisions of its workflows and the rules of the visual contract for its slices. It also lists the components and the tokens of the screen.
- **The health control** of the bar names the failing screens, the open comments and the findings of the last audit. It opens the review, which also runs the design audit.

The design server serves the canvas of every repo on the list `~/.sdlc/design-repos.json`, and the brainstorm pages of those repos. It is one server for the computer. It listens on `127.0.0.1` and on the tailnet address, so the person can review from the phone. It writes three things only: a comment on a screen that exists, the layout positions, and the restore of a version as a new round.

An open canvas updates live. The server watches the files of the repo and tells each open canvas which pages changed. The canvas reloads only those pages, and a change of `tokens.css`, `components.css` or `source/` reloads every page. A comment from the phone shows on the computer at once. A change waits while the person drags a card or writes a comment. Do not tell the person to reload the canvas after a change.

- `<wf> design server start` starts the server in the background. `<wf> design server url` prints its addresses. Give the person the tailnet address for a review from the phone.
- `<wf> design server status` tells whether the server runs and whether the scheduled task is installed.
- `<wf> design server install` makes one Windows scheduled task that starts the server at logon. `<wf> design server uninstall` removes the task. After a plugin update, run `install` again, because the task does not change itself. Ask the person before you run either command.
- `<wf> design state <root>` prints the data of the canvas as JSON.
- `<wf> design publish <root> [--out <file>]` writes one self-contained canvas page. The page has no comments and no layout saves. Publish it with the host's page tool when the person cannot reach the server. On a canvas URL, `?workflow=<slug>` shows one workflow.

## Use the screens in a later stage

- **Sub-agents** get the paths of the screen pages (`.ai/design/screens/<key>.html`) and the approval pictures, never a canvas URL. A sub-agent reads files.
- **Slice** writes the screen keys of each slice in its `## Scope`, and runs `<wf> design screen add <root> <key> --workflow <slug> --slice <slice>` for each.
- **Plan** cites the screen keys in the steps that build each screen. Each component of `components-to-build:` in `02c-craft.md` gets its own step, before the first screen that uses it.
- **Implement** runs `<wf> design approved <root> <slug>` and reads the pages of its slice from the files that the command prints. When the command prints `no version`, the workflow is older than the versions: read each page at the commit that the line names (`git show <approval-commit>:.ai/design/screens/<key>.html`). A round has no authority: never build from one. It builds each screen from the components of `02c-craft.md` `## Component map`. It imports a component that is in the code. It makes a component that is to build once, as a shared component, and runs `<wf> design component link`. Then the code uses it everywhere the screens do. For the `worst` state of each screen, it makes the worst-case content loadable in development with the stack's own means (a fixture, a story, a preview, a seed), never in production code paths.
- **Verify** runs `<wf> design components verify <root> <slug> --slice <slice>`, which exits 1 when the code does not have or use a component of the screens of the slice. It captures each built screen as a PNG at the path that `<wf> design capture-path <root> <slug> <slice> <key>` prints, and after the last capture runs `<wf> design captures <root> <slug> <slice>`, which commits the captures to the records. `## Design Comparison` pairs each approval picture with its capture and lists the differences. With no approved screens, it records `design-comparison: no-screens` and reports no visual pass. For the `worst` state, it loads the worst-case content and captures that state too, with the key `<key>--worst`; when the content cannot load, it records `worst-case: not-captured:<reason>` for that key. The canvas shows each capture beside its screen.
- **Retro** names the screen keys of each surface in `.ai/design/current.md`.

The settled rule is in [_lane.md](_lane.md) → "The human rule": a contract that names screens is settled only when a script recorded the approval and every screen page exists.

## Move the boards of an older workflow

A workflow from before the surface keeps its drawings as boards in `<wf-dir>/design/`. Move them onto the surface once per repo:

1. Run `<wf> design migrate <root> --check`. The command lists each workflow, its revisions, the revision that its contract confirmed, and the screen key of each board. It writes nothing.
2. When a workflow shows `export <file> from <link>`, read that claude.ai artifact and save its page at that file. Do this for each listed board.
3. Run `<wf> design migrate <root>`. It must exit 0.
4. Read the warnings. When a screen links to a file outside its page, copy that file onto the surface and fix the link.

The command makes these changes:
- An HTML board becomes a screen page. A PNG-only board becomes a legacy frame: a screen page that shows the picture from `.ai/design/legacy/<key>.png`.
- The boards of one surface and state in several viewports become one screen. Each board stays a page of its own, `screens/<key>/<viewport>.html`, and the screen page opens the page whose viewport is nearest to its own width.
- Each revision `r<N>/` becomes one commit of the product repo, in order. The working boards become one more commit when they changed after the last revision.
- The contract of a confirmed revision gets `screens`, `approval-commit` (the commit of that revision), `direction-confirmed-by: migrated` and `migrated-from`. The settled rule accepts it as an approval.
- The verify captures are copied to the records under the screen keys.
- `.ai/design/migrated.json` maps each board key to its screen key. The board files stay, so the old paths keep working. A second run leaves a migrated workflow as it is.

Prohibitions:
- Do not write `screens.json`, `layout.json` or `references.json`. The pre-write check refuses it.
- Do not write a comment, an approval picture, a version or a check result. The design server and `<wf> design` write them.
