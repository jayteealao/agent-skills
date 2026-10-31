# Visual contract (`design/contract.md`)

The template of the visual contract `02c-craft.md` (type `design-contract`): the spec that `implement` builds against. It is not a command. The design stage loads this file at [stage.md](stage.md) Step 6, after the person approves the screens. In this file, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

Writing the contract changes no product code. `implement` applies the contract during the build. No driven stage writes or changes it.

## Write the visual contract

Write the visual contract as the draft `<wf-dir>/.draft/02c-craft.md`, then run `<wf> record put "<root>" <slug>` ([_records.md](../_records.md)). Then run `<wf> design approve "<root>" <slug>` per [stage.md](stage.md) Step 6: the command adds the approval fields.

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
