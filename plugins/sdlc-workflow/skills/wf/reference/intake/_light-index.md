# Light workflow index (shared template)

The single source for the light `00-index.md` (`type: workflow-index`) that the analysis modes write: `brainstorm`, `ideate`, `investigate`, `rca`, `discover`, and `simplify`. A mode reference cites this file and does not restate the template. The mode reference keeps only its extra keys and its own step text.

## The template

Write this frontmatter. Fill each `<slot>` from the row of your mode in the value table.

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "<title>"
workflow-type: <mode>
current-stage: <current-stage>
status: <status>
branch-strategy: none
next-command: <next-command>
next-invocation: "<next-invocation>"
open-questions: []
progress:
  <mode>: <progress>
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
---
```

## Value table

| Mode | `<title>` | `<current-stage>` | `<status>` | `<next-command>` | `<next-invocation>` | `<progress>` | Extra keys (in the mode reference) |
|---|---|---|---|---|---|---|---|
| `brainstorm` | `Brainstorm: <topic> <YYYY-MM-DD>` | `brainstorm` | `ready` | `intake` | `/wf intake brainstorm <slug>` | `in-progress` | none |
| `ideate` | `Ideate: <focus-area or codebase-wide> <YYYY-MM-DD>` | `routing` | `ready` | `user-picks` | `user-picks — record via /wf intake ideate <slug> <idea-id>; see 01-ideate.md` | `complete` | none |
| `investigate` | `Investigate: <one-line problem>` | `routing` | `ready` | `user-picks` | `user-picks — record via /wf intake investigate <slug> <option>; see 01-investigate.md ## Routing` | `complete` | branch, option counts and labels, `augmentations` |
| `rca` | `RCA: <one-line symptom>` | `fix-routing` | `ready` | the route of `## Recommended next command`, for example `wf-plan`; `user-picks` until a route is recorded | the invocation of that route | `complete` | branch, `recommended-routes`, `stack`, `ux-impact`, two more `progress` entries |
| `discover` | `Discover: <one-line hypothesis>` | `routing` | `closed` | `none` | `none — verdict recorded; see recommended-routes` | `complete` | closure, branch, `recommended-routes`, verdict, `augmentations` |
| `simplify` | `Simplify: <scope> <YYYY-MM-DD>` | `simplify` | `complete` | the command of the default route in `01-simplify.md` `recommended-routes` | the invocation of that route | `complete` | none |

## Rules for every light index

- Do not write the heavy 22-field `type: index`. An analysis mode is not a build lifecycle.
- Write `progress` as an object of `<stage>: <status>` entries. The renderer drops a YAML list.
- Do not write `selected-slice`. A light index has no slice roster.
- Write no YAML comments in the index.
- Get each timestamp per [_timestamp.md](../_timestamp.md).
- Add the extra keys of your mode from the mode reference. Then register the slug per [_intake-context.md](_intake-context.md) → Register the workflow in INDEX.md.
