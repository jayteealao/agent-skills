# Visual contract (visual-contract authoring procedure)

Author the **visual contract** `02c-craft.md`: the concrete spec `implement` builds against — a resolved visual direction + north-star mock + mock fidelity inventory + implementation contract.

This is **not a standalone command** — it is the contract-authoring procedure that the **design stage** runs ([stage.md](stage.md)) with the person, between `shape` and `slice`. It covers every surface the feature changes, not one slice. It produces `02c-craft.md` (type `design-contract`).

**The design stage owns both design gates.** No driven stage resolves them. The brief (`02b-design.md`) is authored upstream at `shape` as plain discovery with the image gate left **unresolved** (no `image-gate` field written). This procedure resolves the two gates the brief deferred:

1. **Image gate** — draw the boards per [_boards.md](_boards.md), or record a reasoned skip. Write the resolved `image-gate` (`pass` or `skipped:<reason>`) to `02c`. There is no `pending` value.
2. **Brief-confirm gate** — resolve `shape=pass` from a recorded user-backed direction source before writing the contract: an in-session user response, a user-confirmed PRODUCT.md, or a prior `teach` answer. When no recorded source exists, present the resolved visual direction and get the user's approval.

**Scope**: writing the contract does not itself mutate product code. `implement` applies the contract during the build.

## Build Gate

The visual contract requires a **confirmed visual direction** and a resolved image gate. Cannot write `02c-craft.md` until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers). When it is not, the design stage runs `/wf design setup` with the person first; it does not stop the workflow.
2. **Direction source.** `02b-design.md` exists (authored at `shape`, or by the design stage when it was missing) and its direction is **confirmed** by one of the `shape=pass` sources below. When the person named a move, the move's reference focuses the direction; it does not replace the brief.
3. Visual-direction decision recorded: the person saw the boards and chose a direction, OR skipped with a stated reason.
4. North-star mock decision recorded (Step 3 below).

**`shape=pass`** requires a direction the user confirmed. Three sources satisfy the gate: a user response in this session, a user-confirmed PRODUCT.md, or a prior `teach` answer from the user. Record which source satisfied the gate. A self-authored direction with no user-confirmed source does not pass the gate.

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Pre-fill every question that the user prompt, PRODUCT.md, DESIGN.md, or the codebase already answers, and record each pre-filled answer with its source. Ask only the unanswered questions, in ONE batched round.

Invalid image-skip reasons: "the implementation will be semantic HTML/CSS/SVG", "a raster mock won't be used directly", "the product is fictional." Boards and mocks are direction artifacts, not implementation assets.

## Step 1: Load the direction source

Read `02b-design.md` and the design record (`.ai/design/current.md`, `.ai/design/direction.md`), and extract:
- Feature summary and user context
- Color strategy and scene sentence
- The design mode of each surface (Persuade, Operate, Read, or Experience), from the brief's content inventory
- Visual direction and anti-goals
- Recommended references (`recommended-references:` frontmatter array)
- The UX intent (flows, states, user-facing text)
- The design goals and future direction the surfaces must serve

Load the recommended references from the brief, plus the move the person named. At minimum:
- `typeset.md` for type hierarchy
- The design-mode file of each surface: `mode-persuade.md` (Persuade and Experience), `mode-operate.md`, or `mode-read.md`

Add based on brief needs:
- `animate.md` — if transitions or motion
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is critical, or when a worst-case board is drawn
- `adapt.md` — if the surface targets a phone, a native platform, or desktop
- `optimize.md` — if performance is critical

## Step 2: Load codebase context

Read codebase inspection results from the design stage's preflight inspectors. Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable: run a quick scan to identify `package.json` dependencies, relevant CSS files, existing component examples.

## Step 3: Land the visual direction (resolve the image gate + confirm)

Draw the direction when:
- Work is net-new or visually open-ended
- Brief scope is mid-fi, high-fi, or production-ready
- The person can see a picture: a board, a capture, or an imported design

When conditions are met, this step is mandatory for every design mode.

- Persuade and Experience: push visual identity, composition, and mood aggressively
- Operate and Read: push hierarchy, topology, and density while staying grounded in realistic product structure

**The boards.** Draw one board per surface and state per `design/_boards.md` → Make the boards: capture the running product, import the outside design, or write HTML boards from the tokens and components in `DESIGN.md`. Render them to PNG with the board tool. Name the north-star board (the surface that sets the direction) in `north-star-mock:`.

**The canvas mirror.** When the host offers a design canvas (`_host-surfaces.md`, row "Design canvas"), mirror the boards to it, one artboard per board, so that the person can comment. Record the link as `canvas:`. The board files stay the contract.

**Mood images.** `/imagery` makes mood and brand images to explore a direction before the boards. Save them in `design/source/`. A generated image is never a board and never the north star. When the person wants an interactive prototype of the approved direction, offer `/uiproto` (gated by `externalDispatch.enabled`). Offer it; never run it automatically.

Present the drawings. The approval question is asked by `stage.md` Step 5 (approve / adjust / stop).

When no board can be shown (no browser renders the HTML and the person cannot open it), state in one line why. For `flow`, proceed with a text direction and `image-gate: skipped:<reason>`. For `visual` and `new-surface`, stop: the design is not settled without boards ([_lane.md](_lane.md) → "The human rule").

Record the resolved `image-gate` in `02c-craft.md`'s frontmatter: `pass` after the person confirmed the boards, or `skipped:<reason>` for a flow with no visual change. (`02c` is authoritative; the `02b` brief left the gate unset — you may mirror the resolved value onto `02b` too, but it is not required.)

**Confirm gate.** `shape=pass` is satisfied by the approve answer at [stage.md](stage.md) Step 5, or by a recorded user-backed direction source (a user-confirmed PRODUCT.md, or a prior `teach` answer) — record which source satisfied the gate. Do not write the contract while no user-backed source exists, and never leave the mock neither confirmed nor explicitly skipped with a reason.

## Step 4: Mock fidelity inventory

List the visible ingredients from the approved boards or scene sentence that must survive into implementation. Name the board key of each ingredient:
- Composition and spatial relationships
- Typography choices (sizes, weights, families used)
- Color strategy execution (which elements carry which colors)
- Distinctive visual moves (the things that made the mock look non-generic)

For each worst-case board (`<surface>--worst`), list how the surface holds the worst content: what wraps, what truncates and where, what falls back, and what the empty or error state shows.

These are the implementation contract. Code that loses them has regressed.

---

## Step 5: Write the visual contract

Write the visual contract artifact at `.ai/workflows/<slug>/02c-craft.md`. This is the spec the implement step applies — writing it does not itself mutate product code.

```yaml
---
schema: sdlc/v1
type: design-contract
slug: <slug>
title: <component> visual contract
status: ready
created-at: <timestamp>
updated-at: <timestamp>
component: <component or surface name>
based-on: 02b-design.md
tokens: [list of token names or token groups used]
states: [default, hover, focus, active, disabled, loading, empty, error]
sizes: [mobile, tablet, desktop]
themes: [light, dark]
refs:
  design: 02b-design.md
surface-modes:                 # one design mode per surface, from the brief's content inventory
  <surface>: <persuade|operate|read|experience>
image-gate: <pass|skipped:<reason>>
north-star-mock: <design/r<N>/boards/<key>.png, or "none" for a text-only flow>
boards: design/r<N>/boards.json
design-revision: <N>
canvas: <canvas mirror link, or "none">
direction-confirmed-by: <in-session|product-md|teach>
confirmed-at: <timestamp>
surfaces: [every surface drawn]
directions: [<name>: <axis>]   # only when design stage Step 3b ran
references-loaded: [union of the brief's recommended-references + any references loaded while authoring the contract — authoritative; wf-plan and wf-implement re-read this]
next-command: wf-slice
next-invocation: "/wf slice <slug>"
recommended-routes: [{invocation: "/wf slice <slug>", reason: "the person confirmed the design", default: true}]
---
```

Body sections, in order, under these exact `##` headings (later stages cite them):

- `## Visual direction confirmed` — one paragraph on the approved direction: the chosen direction (if any) and each deviation from the brief.
- `## Directions considered` — only when design stage Step 3b ran: one row per direction, `| Name | Axis | Kept or rejected | The person's reason |`, so a later amend does not reopen a rejected direction by accident. Include the canon row. Below the table, list the candidates that were not drawn, with one line each.
- `## Thesis` — the default arrangement that this design refuses, in one sentence.
- `## Own world` — what makes the design recognizable with all content removed.
- `## North-star mock` — the north-star board path (or "none — text-only direction"), the scene sentence (always), and 5–10 annotated callouts, each with a short description and an implementation note. Add the first-viewport memory test: name the one thing a person remembers after five seconds. When the honest answer is a mood, the direction is not committed yet.
- `## Boards` — one row per frozen board: `| Key | Surface | State | Viewport | PNG |`, from `design/r<N>/boards.json`.
- `## Mock fidelity inventory` — the non-negotiable visible ingredients, one numbered line each: `<ingredient> — <board key and where on it> — <why non-negotiable>`.
- `## Implementation contract` — the decisions `/wf implement` follows: **token choices** (existing tokens, new tokens); **component decisions** (extend X or create Y); **layout structure** (grid, breakpoints); **type scale**; **color application**; **motion** (each animation's gate result — frequency tier and named purpose — its curve token and duration or spring, and the rejected candidates that stay still; `animate.md` carries the rules and `_platforms.md` the platform forms); **finish & detail** (concentric radius, optical alignment, shadows versus borders, hit-area minimums; `polish.md`); **state coverage** per interactive element.
- `## Anti-patterns to avoid` — from the brief's anti-goals plus the refusals in `_craft-floor.md`, specific to this feature. Stage Step 4 loaded the floor before this step.
- `## Implementation references` — the reference docs `/wf implement` consults (`typeset.md`, `animate.md`, `harden.md`, and so on).

Record the reference list authoritatively in the `references-loaded:` frontmatter array as the **union** of the brief's `recommended-references:` (from `02b-design.md`) and each reference you loaded while authoring the contract. Names omit `.md` and resolve to `skills/wf/reference/design/<name>.md`. `/wf implement` re-reads this field, not the prose: a reference only in `## Implementation references` is not loaded, so keep the two in sync.

**How the later stages carry the contract.** The contract is a design-stage artifact. `slice` maps its surfaces to slices; `plan` turns every `## Mock fidelity inventory` item into a concrete plan step and every `## Implementation contract` token/component/motion decision into a plan-step pointer; `implement` applies them ([_lane.md](_lane.md) → One duty per stage). Update `00-index.md` per [stage.md](stage.md) Step 6. A later stage that cannot build the contract as drawn routes to `/wf design <slug> amend`; it never edits the contract itself.
