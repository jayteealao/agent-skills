# Visual contract (`design/contract.md`)

The template of the visual contract `02c-craft.md` (type `design-contract`): the spec that `implement` builds against. It is not a command. The design stage loads this file at [stage.md](stage.md) Step 6, after the person approved the screens. In this file, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

Writing the contract changes no product code. No driven stage writes or changes it.

## Write the visual contract

1. Write the draft `<wf-dir>/.draft/02c-craft.md` with the frontmatter and the sections below.
2. Run `<wf> record put "<root>" <slug>` ([_records.md](../_records.md)).
3. Run `<wf> design approve "<root>" <slug>` per [stage.md](stage.md) Step 6. The command adds the approval fields and sets the next step in the index.

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
surface-modes:                 # one design mode per surface, from the content inventory of the brief
  <surface>: <persuade|operate|read|experience>
north-star-screen: <screen key>
surfaces: [every surface drawn]
move: <move name>              # omit when no move was named
carried-from: [<board path>#<work packet key>]   # omit when nothing was carried
directions: [<name>: <axis>]   # omit when design stage Step 3b did not run
references-loaded: [the recommended-references of the brief, and each reference that you loaded at Step 4]
modes: [stage]                 # every mode of the run: stage, and amend, import, carried, directions or foundation when it ran
---
```

Write no other frontmatter field. The script owns the fields below. A draft that holds one of them does not make the design settled: the settled rule reads the approval that the script recorded ([_lane.md](_lane.md) → The human rule).

| Field | Written by `<wf> design approve` |
|---|---|
| `screens` | every approved screen key of the workflow |
| `approval-commit` | the commit of the product repo that holds the approved screens |
| `design-version` | the approved version in the records, for example `v2` |
| `components` | every component that the approved screens use |
| `components-to-build` | those components that the code does not have yet |
| `direction-confirmed-by` | `answer-event` |
| `confirmed-at`, `answered-at` | the time of the record, and the time of the answer |
| `image-gate` | `pass`, or `skipped:<reason>` when no picture was taken |
| `check-failures` | the count of check failures that the person approved with |

The viewports are not in the contract: they live in `.ai/design/screens.json`. The next step is not in the contract: it is `next-invocation` of `00-index.md`.

Body sections, in order, under these exact `##` headings (later stages cite them):

- `## Visual direction confirmed` — one paragraph on the approved direction: the chosen direction (if any) and each deviation from the brief.
- `## Carried design thoughts` — only when [_carried.md](_carried.md) ran: each carried item with what the person decided (kept, changed or dropped) and why.
- `## Directions considered` — only when design stage Step 3b ran: one row per direction, `| Name | Axis | Kept or rejected | The reason of the person |`, so a later amend does not reopen a rejected direction by accident. Include the canon row. Below the table, list the candidates that were not drawn, with one line each.
- `## Thesis` — the default arrangement that this design refuses, in one sentence.
- `## Own world` — what makes the design recognizable with all content removed.
- `## North-star screen` — the north-star screen key, the scene sentence (always), and 5–10 annotated callouts, each with a short description and an implementation note. Add the first-viewport memory test: name the one thing that a person remembers after five seconds. When the honest answer is a mood, the direction is not committed yet.
- `## Screens` — one row per approved screen: `| Key | Area | Flow | States |`, from `<wf> design list <root> --workflow <slug> --json` (`key`, `area`, `flow`, `states`). The slice of each screen is not here: `slice` tags the screens later.
- `## Component map` — one row per component that the screens use, from `<wf> design components <root> --workflow <slug>`: `| Key | Code | Status | Screens |`. The code column names the file and the name in the code. A component with the status `to build` names where the build makes it. The build uses each row, and it adds no second component for the same part.
- `## Mock fidelity inventory` — the visible ingredients that must survive into the build, one numbered line each: `<ingredient> — <screen key and where on it> — <why it must survive>`.
- `## Implementation contract` — the decisions that `/wf implement` follows: **token choices** (existing tokens, new tokens); **component decisions** (each variant that a `## Component map` row needs); **layout structure** (grid, breakpoints); **type scale**; **color application**; **motion** (the gate result of each animation — frequency tier and named purpose — its curve token and duration or spring, and the rejected candidates that stay still; `animate.md` carries the rules and `_platforms.md` the platform forms); **finish and detail** (concentric radius, optical alignment, shadows versus borders, target size; `polish.md`); **state coverage** per interactive element.
- `## Anti-patterns to avoid` — from the anti-goals of the brief and the refusals of `_craft-floor.md`, specific to this feature. Stage Step 4 loaded the floor before this step.
- `## Implementation references` — the reference docs that `/wf implement` consults (`typeset.md`, `animate.md`, `harden.md`, and so on).

Keep `references-loaded:` and `## Implementation references` the same. Names omit `.md` and resolve to `skills/wf/reference/design/<name>.md`. An old reference name reads as its replacement: `quieter` and `distill` as `simplify`, `overdrive` as `bolder`, `delight` as `animate`. `/wf implement` reads the frontmatter field, not the prose: a reference that only the section names is not loaded.

**How the later stages carry the contract.** `slice` maps its screens to slices. `plan` turns every `## Mock fidelity inventory` item into a plan step, and every token, component and motion decision of `## Implementation contract` into a step pointer. `implement` applies them ([_lane.md](_lane.md) → One duty per stage). A later stage that cannot build the contract as drawn routes to `/wf design <slug> amend`. It never edits the contract.
