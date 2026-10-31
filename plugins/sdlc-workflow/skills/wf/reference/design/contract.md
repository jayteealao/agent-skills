# Visual contract (visual-contract authoring procedure)

Author the **visual contract** `02c-craft.md`: the concrete spec `implement` builds against — a resolved visual direction + north-star screen + mock fidelity inventory + implementation contract.

This is **not a standalone command** — it is the contract-authoring procedure that the **design stage** runs ([stage.md](stage.md)) with the person, between `intake` and `slice`. It covers every screen the feature changes, not one slice. It produces `02c-craft.md` (type `design-contract`).

**The design stage owns the design gate.** No driven stage resolves it. The brief (`02b-design.md`) is authored upstream at `shape` as plain discovery, with no `image-gate` field. The gate resolves when the person approves the screens: `<wf> design approve` reads the answer event of the approval question and writes `screens`, `approval-commit`, `direction-confirmed-by: answer-event`, `confirmed-at` and `image-gate` into `02c-craft.md` ([stage.md](stage.md) Step 6). In this file, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

**Scope**: writing the contract does not itself mutate product code. `implement` applies the contract during the build.

## Build Gate

The visual contract requires an approved design. Do not write `02c-craft.md` until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers). When it is not, the design stage runs `/wf design setup` with the person first; it does not stop the workflow.
2. **Direction source.** `02b-design.md` exists (authored at `shape`, or by the design stage when it was missing). When the person named a move, the move's reference focuses the direction; it does not replace the brief.
3. The person answered `Approve` to the approval question of [stage.md](stage.md) Step 5, after the checks ran.

A user-confirmed PRODUCT.md or a prior `teach` answer informs the direction, but it never replaces the approval: the person always sees the screens.

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Pre-fill every question that the user prompt, PRODUCT.md, DESIGN.md, or the codebase already answers, and record each pre-filled answer with its source. Ask only the unanswered questions, in ONE batched round.

## Step 1: Load the direction source

Read `02b-design.md` with `<wf> record get "<root>" <slug> 02b-design.md`, and the design record (`.ai/design/current.md`, `.ai/design/direction.md`), and extract:
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
- `harden.md` — always, for the `worst` state of each screen
- `adapt.md` — if the surface targets a phone, a native platform, or desktop
- `optimize.md` — if performance is critical

## Step 2: Load codebase context

Read codebase inspection results from the design stage's preflight inspectors. Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable: run a quick scan to identify `package.json` dependencies, relevant CSS files, existing component examples.

## Step 3: Land the visual direction

Every changed surface is a screen on the design surface ([_surface.md](_surface.md)), with the five states.

- Persuade and Experience: push visual identity, composition, and mood aggressively
- Operate and Read: push hierarchy, topology, and density while staying grounded in realistic product structure

**The screens.** Draw each screen per [stage.md](stage.md) Step 4: from a capture of the running product, from an imported design, or as HTML from the tokens of `tokens.css` and the components in `DESIGN.md`. Name the north-star screen (the screen that sets the direction) by its key in `north-star-screen:`.

The person sees the screens on the canvas, in each viewport and state. The approval question is asked by [stage.md](stage.md) Step 5 (approve / adjust / stop).

For `ux-impact: flow` with no screen that changes how it looks, the flow of states is the form. The approval still holds the screens of the flow.

## Step 4: Mock fidelity inventory

List the visible ingredients from the approved screens that must survive into implementation. Name the screen key of each ingredient:
- Composition and spatial relationships
- Typography choices (sizes, weights, families used)
- Color strategy execution (which elements carry which colors)
- Distinctive visual moves (the things that made the screen look non-generic)

For the `worst` state of each screen, list how the screen holds the worst content: what wraps, what truncates and where, what falls back, and what the empty or error state shows.

These are the implementation contract. Code that loses them has regressed.

---

## Step 5: Write the visual contract

Write the visual contract as the draft `<wf-dir>/.draft/02c-craft.md`, then run `<wf> record put "<root>" <slug>` ([_records.md](../_records.md)). This is the spec the implement step applies — writing it does not itself mutate product code. Then run `<wf> design approve "<root>" <slug>` per [stage.md](stage.md) Step 6: the command adds the approval fields.

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
states: [default, empty, loading, error, worst]
themes: [light, dark]
refs:
  design: 02b-design.md
surface-modes:                 # one design mode per surface, from the brief's content inventory
  <surface>: <persuade|operate|read|experience>
north-star-screen: <screen key>
surfaces: [every surface drawn]
directions: [<name>: <axis>]   # only when design stage Step 3b ran
references-loaded: [union of the brief's recommended-references + any references loaded while authoring the contract — authoritative; wf-plan and wf-implement re-read this]
next-command: wf-slice
next-invocation: "/wf slice <slug>"
recommended-routes: [{invocation: "/wf slice <slug>", reason: "the person approved the design", default: true}]
# Written by `wf.mjs design approve`, never by the agent:
screens: [every approved screen key]
approval-commit: <the commit of the product repo that holds the approved screens>
direction-confirmed-by: answer-event
confirmed-at: <timestamp>
image-gate: <pass|skipped:<reason>>
---
```

The viewports are not in the contract: they live in `.ai/design/screens.json`.

Body sections, in order, under these exact `##` headings (later stages cite them):

- `## Visual direction confirmed` — one paragraph on the approved direction: the chosen direction (if any) and each deviation from the brief.
- `## Directions considered` — only when design stage Step 3b ran: one row per direction, `| Name | Axis | Kept or rejected | The person's reason |`, so a later amend does not reopen a rejected direction by accident. Include the canon row. Below the table, list the candidates that were not drawn, with one line each.
- `## Thesis` — the default arrangement that this design refuses, in one sentence.
- `## Own world` — what makes the design recognizable with all content removed.
- `## North-star screen` — the north-star screen key, the scene sentence (always), and 5–10 annotated callouts, each with a short description and an implementation note. Add the first-viewport memory test: name the one thing a person remembers after five seconds. When the honest answer is a mood, the direction is not committed yet.
- `## Screens` — one row per approved screen: `| Key | Surface | States | Slices |`, from `<wf> design list <root> --workflow <slug>`.
- `## Mock fidelity inventory` — the non-negotiable visible ingredients, one numbered line each: `<ingredient> — <screen key and where on it> — <why non-negotiable>`.
- `## Implementation contract` — the decisions `/wf implement` follows: **token choices** (existing tokens, new tokens); **component decisions** (extend X or create Y); **layout structure** (grid, breakpoints); **type scale**; **color application**; **motion** (each animation's gate result — frequency tier and named purpose — its curve token and duration or spring, and the rejected candidates that stay still; `animate.md` carries the rules and `_platforms.md` the platform forms); **finish & detail** (concentric radius, optical alignment, shadows versus borders, target size; `polish.md`); **state coverage** per interactive element.
- `## Anti-patterns to avoid` — from the brief's anti-goals plus the refusals in `_craft-floor.md`, specific to this feature. Stage Step 4 loaded the floor before this step.
- `## Implementation references` — the reference docs `/wf implement` consults (`typeset.md`, `animate.md`, `harden.md`, and so on).

Record the reference list authoritatively in the `references-loaded:` frontmatter array as the **union** of the brief's `recommended-references:` (from `02b-design.md`) and each reference you loaded while authoring the contract. Names omit `.md` and resolve to `skills/wf/reference/design/<name>.md`. `/wf implement` re-reads this field, not the prose: a reference only in `## Implementation references` is not loaded, so keep the two in sync.

**How the later stages carry the contract.** The contract is a design-stage artifact. `slice` maps its screens to slices; `plan` turns every `## Mock fidelity inventory` item into a concrete plan step and every `## Implementation contract` token/component/motion decision into a plan-step pointer; `implement` applies them ([_lane.md](_lane.md) → One duty per stage). Update `00-index.md` per [stage.md](stage.md) Step 6. A later stage that cannot build the contract as drawn routes to `/wf design <slug> amend`; it never edits the contract itself.
