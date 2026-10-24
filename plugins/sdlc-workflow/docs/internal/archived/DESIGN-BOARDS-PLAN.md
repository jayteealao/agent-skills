# DESIGN-BOARDS-PLAN — one home for design drawings

Status **BUILT v9.182.0 (W0–W8); the human live run is open** · Date **2026-10-07** (last update 2026-10-08, section 13) · Plugin **v9.182.0** · Owner **jayte**
Depends on: the design lane (archived/DESIGN-LANE-PLAN.md, v9.167.0) and the brainstorm design focus (archived/BRAINSTORM-DESIGN-PLAN.md, v9.168.0). Neither changes its rules here. This plan gives their drawings a home.

## 1. Why

The design lane decides when design runs and who confirms it. It does not decide where the drawings live. An audit on 2026-10-07 read every surviving design session in 8 repos (SoccerManager, Waypoint, Aperture, Playster, Isometric, vercel-test, bot-backend, Crumb). It found these gaps, all verified against HEAD `3b5503bd`:

- **The canvas is the only record of the drawings.** `canvas:` in `02c-craft.md` is a private claude.ai link. Some sessions have no Artifact tool, Codex has none, and sub-agents cannot open the link. An amend edits the canvas in place, so an old `history/02c-craft-N.md` links to the new drawings.
- **Generated images have no workflow home.** `imagery` writes `.ai/design-probes/<unix-ts>.png` (`skills/imagery/SKILL.md:22`). The file name has no slug, and the caller cannot set the path. The brainstorm focus says to save sketches in `sketches/` (`intake/brainstorm/_design.md:24`), which `imagery` cannot do.
- **Agents made their own homes.** Crumb used `design-round5/` and `steer.md`. SoccerManager used `design-boards/` with `build.mjs`, and board PNGs in `implement-evidence/`. Waypoint used `design-capture/`. bot-backend used a repo-root `design/clinsim/`. The person used `~/Downloads`.
- **A text-only contract passes.** `designSettled` accepts any non-empty `direction-confirmed-by` (`lib/design-lane.mjs:59`). In vercel-test, Isometric, Waypoint waypoint-app and bot-backend fastify, the person never saw a picture. vercel-test verify reported "Mock fidelity PASS — 10/10" against a mock that did not exist, while its own screenshot showed the hero broken.
- **The pages show no drawing.** `_paths.mjs:66-67` renders the brief to `design/` and the contract to `design-brief/` (swapped). No page shows an image or the canvas link.
- **Most of it is lost from git.** 6 of the 8 repos ignore `.ai/`. Boards, `02c-craft.md` and the design record `.ai/design/*.md` exist only on one machine. `.ai/design/*.md` also has no schema type.

The audit also found what works:
- real pixels with a one-word pick (Playster probes: "record A", "b");
- comments on the canvas, and amend rounds (SoccerManager engine-modules);
- screenshots of the running app placed beside the design (Waypoint `d56a7eca`, the only approved Waypoint run);
- outside designs imported as files (Crumb and bot-backend from claude.ai/design; Playster from a handoff zip);
- HTML boards built from the real tokens and rendered to PNG (SoccerManager realism, Playster probes).

Audit memory: `sdlc_design_artifacts_audit_2026_10_07.md`.

## 2. PO decisions (2026-10-07)

| # | Decision |
|---|---|
| D1 | **The repo holds the design contract. The canvas is where the person reviews it.** The plugin never depends on claude.ai to work (it restates DESIGN-LANE decision 6). |
| D2 | **One home per workflow**: `.ai/workflows/<slug>/design/`. |
| D3 | **The method follows the situation, not the host.** For an existing product, capture the running app first. When an outside design exists, import it. For new surfaces, build HTML boards from `DESIGN.md` tokens and render them to PNG. Mirror the boards to the canvas when the host has one. |
| D4 | **`imagery` is for mood and brand exploration only.** A generated image is never a board. |
| D5 | **Confirmed means the person saw pictures.** For `visual` and `new-surface`, the design is settled only when the confirmed boards exist on disk. |
| D6 | **The person sees the boards where they already look.** A contact sheet `design/index.html` sits in the folder, and chat gives its path (or sends the file where the host can). Fixing the hub pages is a small side task. |
| D7 | **Kept sketches travel by default** with the piece of work. |
| D8 | **`/wf design <slug> import <link\|path>`** turns outside design work into boards. |
| D9 | **Tracking (2026-10-08: the recommendation, by "implement the plan in full").** When a repo ignores `.ai/`, keep `.ai/design/` and each confirmed revision `design/r<N>/` tracked; working boards, sources and captures stay local. `design-boards.mjs track` writes the `.gitignore` lines with the person's approval. Section 7, W6. |
| D10 | **Campaign commit point (2026-10-08: the recommendation).** With local records, the worktree's `.ai/.gitignore` (`*`) hides design files from git, so no wave PR carries them. The campaign leaves the frozen revisions uncommitted in the main checkout and lists them in `report.md` at the campaign end for the person to commit (`campaign/_waves.md` → End). Section 10. |

## 3. The folder

```
.ai/workflows/<slug>/design/
  boards.json                     # the manifest (section 4)
  index.html                      # contact sheet: every board, its caption, its state (generated)
  boards/<surface>--<state>[--<viewport>].html
  boards/<surface>--<state>[--<viewport>].png
  source/                         # what made the boards: build script, canvas export, imported bundle
  sketches/<key>.(png|html)       # brainstorm sketches carried to this workflow
  captures/<slice>/<surface>--<state>[--<viewport>].png   # verify captures, same names as the boards
  r<N>/                           # frozen copy of revision N at confirmation: boards.json + boards/ + index.html
```

Rules:
1. A board key is `<surface>--<state>`, plus `--<viewport>` when a surface has more than one viewport. `<surface>` is a name from `02c-craft.md` `surfaces:`.
2. A board is an HTML file, a PNG, or both. The PNG is what the person sees and what verify compares against.
3. `r<N>/` is written once and never changed. An amend writes `r<N+1>/`.
4. `design-notes/` keeps its current job (move notes and the brainstorm document). `design/` holds only drawings and their sources.
5. The pre-write filename rules exempt `design/**` in the same way as `design-notes/` (`hooks/pre-write-validate.mjs:107-110`). The Waypoint run hit this refusal on `design-canvas-brief.md`.

## 4. The manifest `design/boards.json`

```json
{
  "schema": "sdlc/design-boards/v1",
  "slug": "<slug>",
  "revision": 3,
  "method": "html | capture | import | canvas-export",
  "viewports": { "desktop": "1280x800", "phone": "390x844" },
  "boards": [
    { "key": "squad-list--default", "surface": "squad-list", "state": "default", "viewport": "desktop",
      "html": "boards/squad-list--default.html", "png": "boards/squad-list--default.png",
      "source": "source/build.mjs", "sketch": "s3", "caption": "Squad list, first open" }
  ],
  "confirmed": [
    { "revision": 3, "at": "<iso-8601>", "by": "in-session", "canvas": "<link or null>", "canvas-version": 21 }
  ]
}
```

- `viewports` are explicit, and the person confirms them at the design stage. The SoccerManager retro found that a fixed 1280×800 rule stood for about 20 slices before the person changed it.
- `02c-craft.md` gains two fields, `boards: design/r<N>/boards.json` and `design-revision: <N>`. `north-star-mock:` becomes the path of one board PNG. `canvas:` stays as the link to the review copy.
- `.ai/design/current.md` and `direction.md` get schema types `design-current` and `design-direction`.

## 5. The board tool `scripts/design-boards.mjs`

One script with no new dependencies. Verbs:

| Verb | Job |
|---|---|
| `render <slug> [key…]` | Render each board HTML to PNG at its viewport. |
| `sheet <slug>` | Write `design/index.html`: every board with its caption, grouped by surface, the canvas link, and the confirmed revision. |
| `freeze <slug>` | Copy the working boards, the manifest and the sheet to `r<N>/`. Record the entry in `confirmed[]`. Refuse when `r<N>/` exists. |
| `check <slug>` | Return the board files that `02c-craft.md` `boards:` lists but are missing. The hook and verify use it. |
| `capture-name <slug> <slice> <key>` | Print the capture path for a board, so verify names its captures the same way. |

Browser discovery order: `SDLC_BROWSER`, the project's Playwright Chromium, `PLAYWRIGHT_BROWSERS_PATH`, Chrome, Edge, Chromium. Render with `--headless=new --hide-scrollbars --window-size=<w>,<h> --screenshot=<png> <file-url>`. A probe on 2026-10-07 rendered a 1280×800 PNG this way with Chrome on this machine. When no browser is found, a board stays HTML only, and the manifest records `"png": null` and `"render": "none — <reason>"`.

Pure logic (manifest parsing, key and path rules, the `check` result) goes in `lib/design-boards.mjs`, so the hook can import it.

## 6. How each step uses the folder

| Step | Change |
|---|---|
| Brainstorm, design focus | Save sketches to `.ai/workflows/<board-slug>/design/sketches/<key>.*`. A canvas sketch also keeps its link. `imagery` gets the output folder (W3). |
| Route a piece of work (`_carried.md`) | Copy each carried sketch into the target slug's `design/sketches/` and keep its key. A sketch made outside `/wf` enters through `import`. |
| Design stage, Step 3 | When the product already exists and the stack can capture it, capture every touched surface into `design/source/captures/` first. |
| Design stage, Step 4 | Build boards by the method of D3. On a host with a canvas, mirror the boards to it for comments. |
| Design stage, Step 5 | Run `sheet`, then give the person the contact-sheet path. Ask the gate question. On adjust, change the boards, render again, and ask again. |
| Design stage, Step 6 | Run `freeze`, then write `02c-craft.md` with `boards:`, `design-revision:` and `north-star-mock:` pointing into `r<N>/`. |
| Amend | Change only the named boards in the working set, then freeze `r<N+1>/`. The 02c snapshot and the board revision then match. |
| Plan | Cite board keys (`r<N>/boards/<key>.png`) in the steps that build each surface. |
| Implement | Read the board PNGs for the surfaces of the slice. Sub-agents get paths, not canvas links. |
| Verify | Capture to `design/captures/<slice>/<key>.png`. `## Design Comparison` lists board and capture pairs and the differences. With no boards, record `design-comparison: no-boards`. Never report a visual PASS. |
| Retro | `current.md` `## Surfaces` links the newest board of each surface. |

## 7. Waves

### W0 — Probe and measure (no plugin change)
1. Run the render command on SoccerManager `realism-player-record-data-model-contract/design-boards/*.html` (copies only) and on one Waypoint capture set. Record PNG sizes and render time.
2. Check render under Codex on this machine.
3. Check that the host tools can export a canvas: read one SoccerManager canvas into local HTML (the Crumb run did this as `R5*.dc.html`). Check the DesignSync path that the bot-backend run used.
4. Test the D9 `.gitignore` negation patterns with `git check-ignore -v` against both styles in use: SoccerManager `.ai/*` with an allowlist, and Playster/Isometric `.ai/**/*`.

5. Run `campaign.mjs worktree <key> add` on a scratch repo with local records and a `design/` folder. Check what it copies, and whether git can see a design file in the worktree.

Done when: a findings note is in section 14, with sizes, times, the gitignore patterns that work, and the worktree result.

### W1 — Contract and rules
- `lib/design-boards.mjs` (manifest, keys, paths, `check`).
- `frontmatter.schema.json`: `boards`, `design-revision` on `design-contract`; types `design-current`, `design-direction`; a manifest schema `schemas/design-boards.schema.json`.
- `lib/design-lane.mjs` `designSettled`: when `02c-craft.md` carries `boards:` and `ux-impact` is `visual` or `new-surface`, every listed board must exist. A `flow` design may still record `image-gate: skipped:<reason>`. A `02c-craft.md` without `boards:` (written before this release) keeps today's rule.
- `hooks/pre-write-validate.mjs`: pass the workflow folder to the gate. Exempt `design/**` from the filename rules.
- `workflows/yolo.js:903`: the drive prompt states the settled rule in its own text. Add the board rule.
- Tests: extend `tests/unit/skills/design-lane.test.mjs`; add `tests/unit/lib/design-boards.test.mjs`.

### W2 — The board tool
- `scripts/design-boards.mjs` with the verbs in section 5. Rebuild `dist/` in the same commit.
- Tests: manifest round trip, `freeze` refuses to overwrite, `check` result, browser discovery with a fake `SDLC_BROWSER`, and HTML-only behavior when no browser exists.

### W3 — The producers
- `design/stage.md` Steps 3–6 and Amend, per section 6. Put the board details in a new `design/_boards.md`.
- `design/_output.md` (artifacts line) and `design/_design-context.md:110-120` (what `image-gate: pass` means).
- `design/shape.md:96-118`: wording, "boards" instead of "north-star mock".
- `design/contract.md`: the north-star and fallback text (lines 73–92) point at boards. Generated comps are removed from the contract path.
- `_host-invocation.md` row "Design canvas": the canvas is a mirror of the boards. The Codex column builds HTML boards.
- `skills/imagery/SKILL.md`: a trailing `into <folder>` token, in the same positional style as `skip <reason>`. The brainstorm uses it for `design/sketches/`. State that its images are mood images, not boards.
- `skills/uiproto/SKILL.md`: write the prototype into `design/source/` when a slug is in scope.
- `intake/brainstorm/_design.md` and `design/_carried.md`: sketch paths and the copy on route.
- `design/record.md` and `design/_lane.md`: state that the design stage also creates missing record files and writes `## Open decisions` (today `_lane.md:56` says only retro and upkeep write the record).

### W4 — Import
- `design/_commands.md`: a row for `import`. A new file `design/import.md`:
  1. Accept a canvas link, a claude.ai/design project, a local folder, a zip, or image files.
  2. Copy the source into `design/source/import-<n>/`.
  3. Map each screen to a surface and state with the person.
  4. Render or copy each one into `boards/`.
  5. Continue at design Step 5. An import never confirms by itself.
- `design.md` usage block, the `design` row hint in `SKILL.md`, and `hooks/mod/catalog.ts:31` `argumentHint`.
- This is a design sub-command, not a new `/wf` key, so the key counts do not change.

### W5 — The consumers
- `plan.md`, `implement` and `verify/_sub-agents.md:95-97`: the rows of section 6. The visual spot-check (`_sub-agents.md:97`) compares against board PNGs and never against a canvas link.
- `verify/_artifact.md:119`: the `## Design Comparison` contract and the `design-comparison: no-boards` value.
- `slice.md:67-68`: map each slice to board surfaces by surface name.
- `review/_select.md:20-21`, `review/_context.md:18`, `design/audit.md:125,147`, `design/critique.md`: compare board and capture pairs; `audited-against` lists `boards.json`.
- `handoff.md:33,79`: optional board and capture pairs in the PR body (tracked records).
- `retro.md` and `design/record.md`: the `current.md` link rule.
- `status.md:134`: the confirmed revision and the board count. `recap.md`: the contact-sheet path.
- `intake/extend.md:159,195`: wording only.
- Requires tables of `plan.md` and `implement.md`: add `design/r<N>/boards.json` and the board PNGs, so that the mod's read check sees them.

### W5b — Campaign and packets
- `intake/brainstorm/_work.md` and `_artifact.md`: `sketches:` on the work packet. `intake/_packet.md`: copy the sketches into the slug.
- `campaign/_phases.md` prepare step 4: build and freeze the boards. `scripts/campaign.mjs` and `lib/campaign.mjs`: `unit <key> prepared` runs the board check.
- `campaign/_boundary.md:28`: the design paths in the merge table.
- `campaign/_waves.md` "Local records" and `lib/campaign-records.mjs`: `design/` of workflows that are not driven stays in main. The amend route uses `refresh`.
- `lib/campaign-records.mjs` already copies binary files by hash (`hashFile`, `copyVerified`). Add one test with a PNG.
- Tests in `tests/unit/lib/campaign.test.mjs`, `campaign-records.test.mjs` and `campaign-cli.test.mjs`. CAUTION: another session has uncommitted edits in all three test files and in `lib/campaign*.mjs` (git status of 2026-10-07). Start W5b only after those edits are committed.

### W6 — Tracking (after D9 is answered)
- `ship-plan/init.md:137`: the "Ignored" option also keeps `.ai/design/` and `.ai/workflows/*/design/r*/` tracked, with the patterns W0 proved.
- `/wf status`: a one-time advisory for repos that ignore `.ai/` without these exceptions. It is never a gate.
- `scripts/design-boards.mjs track`: write the exception block on request, with the person's approval.

### W7 — Pages
- `renderers/_paths.mjs:66-67`: the brief renders to `design-brief/` and the contract to `design/`. Update the rail link in `index.mjs:26-29` and the label in `design-brief.mjs:1`.
- The contract page shows the frozen board PNGs. The renderer copies `r<N>/boards/*.png` into `_view/<slug>/design/boards/`, which the CSP allows (`img-src 'self'`). The page also shows `canvas`, `surfaces`, `direction-confirmed-by` and `carried-from`.
- At design Step 5, send `design/index.html` with the host's file tool when one exists. Otherwise, give the path. The realism run failed here with "this session has no project thread", so the path is always given as well.

### W8 — Release
- Prose budget (`verify-prose-budget.mjs`) and the load meter (`measure-load.mjs`). Keep `intake/brainstorm/_design.md` small, and keep every intake mode file smaller than `default.md`.
- Doc site pages for `/wf design` and the brainstorm focus. The changelog. A version bump with `npm version minor`.
- A live run: a new `/wf design` on a real UI slug, and one `import` of an existing canvas. Record the results in section 14.

### Build status (2026-10-08)

Every wave is built. Each one differs from the text above in these points:

| Wave | Built as planned, except |
|---|---|
| W0 | The Codex render is not proven: `codex exec` timed out after 240 s with no render (section 14). The canvas export was not probed; `design/import.md` tells the agent to read the canvas with the host tool, or to ask the person for an export. |
| W1 | The settled rule takes the missing-board list from the caller (`designSettled(index, contract, missingBoards)`); the hook reads the disk. `.ai/design/current.md` and `direction.md` are validated as project-context files when they carry frontmatter. The type-count pin in `surface-policy.json` moved 69 → 71. |
| W2 | Extra verbs `init`, `import` and `track`. `SDLC_BROWSER` is the only candidate when set; `SDLC_BROWSER=none` keeps boards as HTML. A Playwright headless shell comes before a full Playwright Chromium (W0 finding). Every render has a 30 s timeout (`SDLC_BROWSER_TIMEOUT_MS`) and kills the browser tree. `render` without keys also renders `sketches/*.html`. The tool lives at `skills/wf/scripts/design-boards.mjs` (bundled to `dist/design-boards.mjs`). |
| W3 | `/imagery … into <folder>` needed no script change; the generators already take the output path. |
| W4 | As planned. |
| W5 | The Requires rows name `design/boards.json` only. A Requires glob works only in the last path segment, and a PNG read has no line ranges, so the prose names the PNGs instead. Four files with exact word budgets (`plan.md`, `implement.md`, `verify.md`, `handoff.md`) paid for each added word with a cut of rationale text. |
| W5b | `unit <key> prepared` is stricter than the plan: for `visual` and `new-surface` it also refuses a contract without `boards:`. The merge-table rows apply on a conflict only, like the existing `.ai/design/*` row. The other session's campaign edits were committed first as their own commit (`d50891fa`), on the PO's answer. |
| W6 | The `/wf status` advisory runs `track` read-only. `ship-plan init` "Ignored" runs `track --write`; the option text names the paths, so the choice is the approval. |
| W7 | The design folder `design/` of a workflow gets no page (`NO_PAGE_DIRS`). The contract page shows the gallery above the record on a four-part page. |
| W8 | The live run covered the tool chain only (section 14). A human `/wf design` run is open. |

## 8. Existing workflows

Nothing migrates by itself. A `02c-craft.md` without `boards:` stays settled under the old rule. To move a workflow, run `/wf design <slug> import <canvas or folder>`, then confirm. The first candidates:
- SoccerManager `realism-player-record-data-model-contract`: `design-boards/` becomes `design/r1/`.
- SoccerManager `engine-modules`: import canvas version 21.
- Waypoint `teach-session-do`: `design-capture/` becomes `design/source/captures/`.

## 9. Risks and traps

- **Load caps.** `design/stage.md` and the brainstorm focus are loaded on hot paths. Move the board details into one new file, `design/_boards.md`, and cite it with a backticked path from non-design keys (DESIGN-LANE trap: a markdown link pushed intake over the 60-file cap).
- **Repo size.** Board PNGs are about 120–230 KB each (SoccerManager realism: 7 boards, 1.4 MB). Only `r<N>/` is tracked under D9. `freeze` warns when a revision is larger than 5 MB.
- **Canvas drift.** The person can comment on the canvas after `freeze`. Step 5 reads the canvas comments before it freezes. A later canvas change does not change the contract until an amend.
- **Sub-agent file names.** Never name an agent-written file `report.md`. Claude Code refuses that write from a sub-agent (v9.173.1 finding).
- **Concurrent sessions.** Stage files by explicit path. Several sessions edit this tree at the same time.

## 10. Campaign and the other surfaces

### Campaign (`/wf campaign`)

The campaign keeps the human rule as it is. The rolling prepare runs the design lane with the person (`campaign/_phases.md:61`). yolo never runs design (`yolo.md:44,101`). The plan adds a fixed home for the drawings that the prepare makes and that the drives read.

| Campaign part | With design boards |
|---|---|
| **Brainstorm packets** | Today a work packet carries `design-form` and `ux-impact`, but not its sketches (`intake/brainstorm/_work.md:24`; `_artifact.md:84` puts `sketches` on the board piece only). This is why the SoccerManager reference sketch never reached its slug. Add `sketches:` to `work/<slug>.md`: each carried sketch key with its path under the board slug's `design/sketches/`. |
| **Prepare, intake from a packet** | `intake/_packet.md` copies each packet sketch into the new slug's `design/sketches/`. `design/_carried.md` reads the packet as its first source. |
| **Prepare, design lane** | Runs in the main checkout with the person, before `unit <key> prepared`. Boards are built, the person confirms, and `freeze` writes `r1/`. `unit <key> prepared` refuses a unit whose `ux-impact` is not `none` when `design-boards check` returns missing boards. |
| **Drives (yolo in a worktree)** | A drive reads `r<N>/boards/*.png` and writes only `design/captures/<slice>/`. A drive that finds the design cannot be built stops with `progress.design: in-progress`, as today. |
| **Merge boundary** | `campaign/_boundary.md:28` aborts a slug merge on a change to `.ai/design/*`. Add `design/boards.json`, `design/boards/`, `design/r*/`, `design/source/` and `design/sketches/` of every workflow. A change to `design/captures/` is allowed. |
| **Local records, `worktree add`** | It copies the main `.ai/` tree. Today the `*-evidence/` folders of workflows that the worktree does not drive stay in main (`campaign/_waves.md:68`). Apply the same rule to `design/`, so that a worktree does not copy the boards of every workflow. `copyVerified` already copies binary files by hash. |
| **Local records, `sync`** | Verify captures come back to main by hash. A drive never writes boards, so a board conflict needs two writers. That would be a fault, and `sync` keeps both versions as it does today. |
| **An amend during a campaign** | The unit stops and shows as "needs you" with a push notification (the mechanism of `campaign/_phases.md:81`). The person runs `/wf design <slug> amend` in the main checkout, which freezes `r<N+1>/`. Then `<cmd> worktree <key> refresh` copies the new revision in, and the unit resumes. |
| **Tracked records** | `r<N>/` rides the slug branch into the wave PR, and GitHub shows the PNGs in the diff. |
| **Local records with D9 yes** | The worktree's `.ai/.gitignore` (`*`) hides every design file, so the wave PR carries none. D10 decides when these files are committed. |
| **Retro after the campaign** | The person runs each retro (`campaign/_waves.md:153`) in the main checkout. Retro links the newest board of each surface in `.ai/design/current.md`. No drive writes `.ai/design/`. |
| **Brainstorm reopen** | A changed design piece goes through the drift check. When its slug is prepared, the change reopens the design, and the unit needs an amend before its wave starts. |

### The other surfaces

| Surface | With design boards |
|---|---|
| `/wf auto`, `/wf yolo` | No change to the human rule. The yolo readiness check uses `designSettled`, so it gets the board check from W1. Drive prompts give board paths, never canvas links. |
| Sub-agents (Workflow-spawned) | They read the PNG files with the read tool. This is the case that pushed agents to make local copies (Crumb, SoccerManager). |
| Codex | No canvas. Boards are HTML rendered to PNG with headless Chrome or Edge. `image_gen` makes mood images only. Codex skips the read check (artifact split decision D3), so it gets no board-read warning. |
| Claude Desktop and the mod | At design Step 5, send `design/index.html` and the board PNGs with the host's file tool, so they show inline. Add the board PNGs to the Requires tables of plan and implement, so that the mod's read check warns when an implement agent does not open the boards. The live views need no change. |
| Phone (Remote Control) | A local path does not help on a phone. Send the board PNGs as files with the gate question, and send the contact sheet as well. |
| Hub and explainers | W7. The renderer copies the frozen PNGs into `_view/`. The explainer of `02c-craft.md` uses the copied board, never an agent-written image. |
| Review | `design-audit` and `design-critique` compare captures with boards. Review does not reopen boards that the person confirmed (section 12). |
| Handoff | With tracked records, the PR body links each board and capture pair. This is optional and goes in W5. |
| `extend` | An extension that adds surfaces reopens the design. The amend adds boards and freezes `r<N+1>/`. |
| `/wf status`, `recap` | `status` reports the confirmed revision and its board count, and gives the W6 advisory. `recap` links the contact sheet. |
| pi | No pi extension exists yet. Out of scope. |

## 11. Command changes

| Command | Change | Files | Wave |
|---|---|---|---|
| `/wf design <slug>` and `amend` | Build boards, contact sheet, confirm, `freeze`. Amend writes `r<N+1>/`. | `design/stage.md`, `contract.md`, `_lane.md`, `_output.md`, `_design-context.md:110-120` (what `image-gate: pass` means), new `design/_boards.md` | W3 |
| `/wf design <slug> import` | New sub-command. | new `design/import.md`, `design/_commands.md`, `design.md` usage, `SKILL.md` row hint, `hooks/mod/catalog.ts:31` argumentHint | W4 |
| `/wf design audit`, `critique` | Compare captures with boards. `audited-against` lists `boards.json`. | `design/audit.md:125,147`, `critique.md` | W5 |
| `/wf design setup`, `teach`, `extract`, `direction`, `sync`; the 15 moves | No change. The record gets schema types only. | — | W1 |
| `/wf brainstorm … design` | Sketches go to `design/sketches/`. The work packet carries `sketches:`. | `intake/brainstorm/_design.md:24`, `_artifact.md:84`, `_work.md` | W3, W5b |
| `/wf intake` (packet, extend) | Packet mode copies sketches into the slug. Extend: wording only, because the amend adds the boards. | `intake/_packet.md`, `intake/extend.md:159,195` | W5b |
| `/wf shape` | Wording: the design stage draws boards, not a north-star mock. | `design/shape.md:96-118` | W3 |
| `/wf slice` | Map each slice to board surfaces by surface name. | `slice.md:67-68` | W5 |
| `/wf plan` | Cite board keys in steps. Requires row for `boards.json`. | `plan.md:33,69-71` | W5 |
| `/wf implement` | Read the board PNGs of the slice. The contract-check agent compares against them. `## Visual Contract Honored` cites board keys. | `implement.md:36,101-102,132`, `implement/_artifact.md:78` | W5 |
| `/wf verify` | Captures to `design/captures/<slice>/<key>.png`. Comparison by file pairs. `design-comparison: no-boards`, never a visual PASS. | `verify/_sub-agents.md:95-97`, `verify/_artifact.md:119`, `verify.md` | W5 |
| `/wf review` | Design dimensions read board and capture pairs. | `review/_select.md:20-21`, `review/_context.md:18` | W5 |
| `/wf handoff` | Optional: board and capture pairs in the PR body (tracked records). | `handoff.md:33,79` | W5 |
| `/wf retro` | `current.md` links the newest board of each surface. | `retro.md`, `design/record.md` | W5 |
| `/wf status`, `recap` | Status: revision and board count, the W6 advisory. Recap: the contact-sheet path. | `status.md:134`, `recap.md` | W5, W6 |
| `/wf campaign` | Prepare builds and freezes boards. `unit prepared` checks them. Merge table. Local records. | section 10, W5b | W5b |
| `/wf yolo` | The settled rule in the drive prompt. | `workflows/yolo.js:903` | W1 |
| `/wf auto` | No prose change. The settled rule comes from `lib/design-lane.mjs`. | — | W1 |
| `/wf ship-plan init` | The "Ignored" option keeps the design exceptions (D9). | `ship-plan/init.md:137` | W6 |
| `/imagery` | `into <folder>`. Mood images only. | `skills/imagery/SKILL.md` | W3 |
| `/uiproto` | Writes into `design/source/` when a slug is in scope. | `skills/uiproto/SKILL.md` | W3 |
| Not changed | `ship`, `probe`, `simplify`, `task`, `close`, `docs`, `observability`, `consult`, `diataxis`, `study-sources`; intake modes `fix`, `hotfix`, `rca`, `refactor`, `update-deps`, `investigate`, `audit`, `adopt` | — | — |

## 12. Out of scope (found by the audit, for later)

- A reopened design blocks every plan, including plans for slices that are already built (SoccerManager, 2026-10-04). A precise rule needs a `surfaces:` field on each slice.
- A design stage that runs after the build (Waypoint `teach-session-do`, 38 rework items) gives no warning that it is now an audit.
- `design-critique` in review attacked boards that the person had already approved (engine-modules retro).

## 13. Plan history

Add one row each time a discussion or a wave changes this plan.

| Date | Change |
|---|---|
| 2026-10-07 | Plan written from the design-artifact audit. D1–D8 agreed by the PO. D9 open. |
| 2026-10-07 | Section 10 added: campaign and the other surfaces. W5b added. D10 open. Found that work packets do not carry sketches. |
| 2026-10-07 | Section 11 added: the change for each command. Wave lists aligned with section 11. |
| 2026-10-08 | PO: "Implement the DESIGN-BOARDS-PLAN.md in full". D9 and D10 take the recommendations. PO answers: commit the other session's campaign edits first, then release with a push. W0–W8 built; build status table added under section 7. |

## 14. Build log

### W0 findings (2026-10-08)

1. **Render time and size.** A 1280×800 HTML board renders in about 300–350 ms with a Playwright headless shell (`chromium_headless_shell-1243`), 0.6–0.8 s with Chrome, and 0.6–1.4 s with Edge. A data-table board is about 40 KB; a phone board (390×844) about 33 KB. The PNG is exactly the window size. The SoccerManager realism boards are captures of richer pages: 7 boards, 1.4 MB.
2. **Trap.** The full Playwright Chromium (`chromium-1243/chrome-win64/chrome.exe`) hung on `--screenshot` with both `--headless` and `--headless=new`, and left 9 processes behind. The tool therefore prefers the headless shell, applies a timeout, and kills the process tree.
3. **Codex.** `codex exec --sandbox workspace-write` with the render command timed out after 240 s. No PNG was written and no process was left. The cause is not known. The Codex column of `_host-invocation.md` still names the tool; the first Codex design run must confirm it.
4. **Canvas export.** Not probed. No Artifact tool was available in the build session.
5. **`.gitignore` patterns.** The design repos ignore `.ai/` three ways: `.ai/*` (SoccerManager, Secbot), `.ai/**/*` (Playster, Isometric, Crumb), and a bare `.ai/` (Waypoint, Aperture, bot-backend). vercel-test tracks `.ai/`. `git check-ignore` proved two blocks: the `.ai/*` block keeps `.ai/design/*` and every `design/r*/` file tracked, and leaves `workflows/INDEX.md`, the stage files, the working boards, sources and captures ignored. The `.ai/**/*` block does the same. A bare `.ai/` must first become `.ai/*`, because git never looks inside an ignored folder. `track --write` does this.
6. **Campaign worktree.** `worktree <key> add` copies the main `.ai/` tree by hash (`copyVerified`), so a PNG arrives byte for byte, and the worktree's `.ai/.gitignore` (`*`) hides it from git. Test: `campaign-cli.test.mjs`, "a worktree gets the design boards of its own slug only".

### Live run (W8, 2026-10-08)

The tool chain ran on real boards. The 7 SoccerManager realism boards (copies) went through `import`, a map to 7 board keys, `render` (0.2 s, the PNGs registered as they were), `freeze` (`r1/`, 1.4 MB, no size warning), `check` (no missing board), and the render of the contract page. The page showed all 7 boards from `_view/realism/design/boards/`.

Not run: a human `/wf design` on a real UI slug, and an `import` of a live canvas. Both need the person. Record them here when they run.
