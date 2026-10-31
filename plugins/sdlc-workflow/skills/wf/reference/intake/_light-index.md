# Light workflow index (shared template)

The single source for the light `00-index.md` (`type: workflow-index`) that the analysis modes write (`brainstorm`, `ideate`, `investigate`, `rca`, `discover`, and `simplify`), and for the decision closure of `investigate`, `rca` and `ideate` (section "Closure"). A mode reference cites this file and does not restate the template. The mode reference keeps only its extra keys and its own step text.

## The template

Write this frontmatter to the draft `<wf-dir>/.draft/00-index.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](../_records.md). Fill each `<slot>` from the row of your mode in the value table.

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
| `ideate` | `Ideate: <focus-area or codebase-wide> <YYYY-MM-DD>` | `routing` | `ready` | `user-picks` | `/wf intake ideate <slug>` | `complete` | none |
| `investigate` | `Investigate: <one-line problem>` | `routing` | `ready` | `user-picks` | `user-picks — record via /wf intake investigate <slug> <option>; see 01-investigate.md ## Routing` | `complete` | branch, option counts and labels, `augmentations` |
| `rca` | `RCA: <one-line symptom>` | `fix-routing` | `ready` | the route of `## Recommended next command`, for example `wf-plan`; `user-picks` until a route is recorded | the invocation of that route | `complete` | branch, `recommended-routes`, `stack`, `ux-impact`, two more `progress` entries |
| `discover` | `Discover: <one-line hypothesis>` | `routing` | `closed` | `none` | `none — verdict recorded; see recommended-routes` | `complete` | closure, branch, `recommended-routes`, verdict, `augmentations` |
| `simplify` | `Simplify: <scope> <YYYY-MM-DD>` | `simplify` | `complete` | the command of the default route in `01-simplify.md` `recommended-routes` | the invocation of that route | `complete` | none |

## Rules for every light index

- Do not write the heavy 22-field `type: index`. An analysis mode is not a build lifecycle.
- Write `progress` as an object of `<stage>: <status>` entries, not a YAML list.
- Do not write `selected-slice`. A light index has no slice roster.
- Write no YAML comments in the index.
- Get each timestamp per [_timestamp.md](../_timestamp.md).
- Add the extra keys of your mode from the mode reference.

## Closure

`investigate`, `rca` and `ideate` end with a decision closure: the person picks an option, a route or ideas. The closure records the decision and never starts the successor: it prints the next invocation and stops. A mode reference cites this section and keeps only its own rows and steps.

**Trigger.** In Step 0 of the mode, a token after an existing slug names a choice (an option, a route, or idea ids). Any trailing prose is the decision note. When the index already has `status: closed`, WARN *"Workflow `<slug>` is closed (<choice key>: `<value>`)."* and stop, unless the mode reference says otherwise.

1. **Stamp the artifact.** Run one `record set "<root>" <slug> 01-<mode>.md` call that sets the choice key of the table below, `chosen-at=<timestamp>` (the real UTC time, per [_timestamp.md](../_timestamp.md)), and `"decision-note=<the trailing prose>"` when the person gave one (omit the key otherwise).
2. **Append `## Decision`** to the body of the artifact (get `01-<mode>.md`, add the section, write the draft and put it): what the person chose, and why (the exact reason of the person, else "user picked without a stated reason"), then the extra line of the table.
3. **Close the workflow.** Run `record set "<root>" <slug> index status=closed close-reason=<reason> closed-at=<timestamp> next-command=none "next-invocation=<next-invocation>"`. When the successor is a new workflow, add `superseded-by=pending`: the link-back of the successor ([_intake-provenance-consume.md](_intake-provenance-consume.md)) corrects it, and that change of one field on a closed index is additive.
4. **Print the next invocation** and stop. Do not run it.

| Mode | Choice key | Extra line of `## Decision` | `close-reason` | `superseded-by=pending` | `next-invocation` |
|---|---|---|---|---|---|
| `investigate` | `chosen-option: <id> — <label>` | the tripwires that were live at pick time (from `## Tripwire warnings`, or "none") | `option-picked` | yes | `none — decision recorded` |
| `rca` | `chosen-route: <route>` | the tripwires that were live at route time (from `## Tripwire warnings`, or "none") | `route-recorded` (`fix` and `hotfix` only) | yes | `none — route recorded` |
| `ideate` | `selected: [<idea-id>, …]` | the sibling ideas that the picked ideas beat, with the one-line reason that each lost | `list-written` | no | `/wf campaign <slug>` |
