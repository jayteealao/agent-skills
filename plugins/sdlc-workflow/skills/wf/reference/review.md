---
description: The single review surface — workflow stage AND ad-hoc, resolved by the first token (like `/wf intake simplify`). `/wf review <slug>` runs the lifecycle review STAGE (stage 7 of 10) — reads workflow artifacts + diff, dispatches one sub-agent per selected dimension, and maintains an ACCUMULATING LEDGER (re-runs dedupe + merge in place, mark cleared findings resolved, never overwrite). `/wf review <dimension>` runs one rubric inline and `/wf review sweep <aggregate>` fans out one reviewer per dimension — the AD-HOC path (no slug). Re-run the stage with "triage" to revisit deferred findings.
argument-hint: "<slug> [slice | triage] | <dimension> | sweep <aggregate>"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Only when the workflow has a `steer.md`: read it, and apply [_steering.md](_steering.md). Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

> **Ground findings in the real source (both modes).** Before asserting that code misuses a
> dependency, framework, or SDK — wrong signature, unhandled edge case, a call that "can't
> work," a security claim about a library's behavior — invoke the `study-sources` skill to
> read its **actual installed source** (`node_modules`, `~/.m2`, the Go/Rust/NuGet caches,
> Android SDK `sources/`, …) and confirm the defect against the version the project resolved.
> A finding grounded in the real implementation beats one grounded in a recalled API — the
> latter is exactly where plausible-but-wrong review comments come from. This holds in **both**
> stage mode and ad-hoc dimension/sweep mode; inject the same instruction into every reviewer
> sub-agent you dispatch. Read-only — reads land in gitignored `.scratch/`, never in the review
> artifact or the diff.

You are running `/wf review`, **stage 7 of 10** in the SDLC lifecycle.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

Mode `triage`: the second argument is `triage`. Mode `select`: you select the rubrics and dispatch the reviewers yourself (`review/_stage.md` Steps 2 and 3). A driver run that passes findings from its own scan does not apply `select`. Declare each mode that applies in `modes:` of the stage artifact, for example `modes: [select]`. Mode `ad-hoc`: the first token is a dimension or `sweep`.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `po-answers.md` | artifact | if-present | |
| `03-slice.md` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | always | |
| `04-plan-<slice>.md` | artifact | always | |
| `05-implement-<slice>.md` | artifact | always | |
| `06-verify-<slice>.md` | artifact | if-present | |
| `01-intake.md` | artifact | mode:slug-wide | Success Criteria |
| `04-plan-*.md` | artifact | mode:slug-wide | |
| `05-implement-*.md` | artifact | mode:slug-wide | |
| `06-verify-*.md` | artifact | mode:slug-wide | |
| `01-<mode>.md` | artifact | mode:change | |
| `04-plan.md` | artifact | mode:change | |
| `05-implement.md` | artifact | mode:change | |
| `06-verify.md` | artifact | mode:change | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `04b-instrument.md` | artifact | if-present | |
| `04c-experiment.md` | artifact | if-present | |
| `05c-benchmark.md` | artifact | if-present | |
| `07-design-audit.md` | artifact | if-present | |
| `07-design-critique.md` | artifact | if-present | |
| `07-review-<slice>.md` | artifact | on-resume | |
| `07-review-<slice>.yaml` | artifact | on-resume | |
| `review/_stage.md` | procedure | always | |
| `review/_triage.md` | procedure | mode:triage | |
| `review/_select.md` | procedure | mode:select | |
| `review/_dispatch.md` | procedure | mode:select | |
| `review/_fix-prompt.md` | procedure | always | |
| `review/_ad-hoc.md` | procedure | mode:ad-hoc | |
| `review/_artifact.md` | procedure | always | |
| `_findings-ledger.md` | procedure | always | |
| `07-review-<slice>.md` | writes | | |
| `07-review.md` | writes | | |

Stage mode only: ad-hoc review writes no stage artifact, so no check runs for it. In slug-wide mode, rows with `<slice>` do not apply, and a re-run reads `07-review.md` and its `.yaml`.

# Step 00 — Resolve scope: workflow stage vs ad-hoc (mandatory, before everything)

`/wf review` is the single review surface — it spans the **workflow stage** (a slug) and **ad-hoc**
review (a dimension or a sweep, no slug), the way `/wf intake simplify` unifies its scopes. Resolve the first token BEFORE any stage logic:

1. **Exact slug match** — `.ai/workflows/<token>/00-index.md` exists → **stage mode**. Read
   `review/_stage.md` in full and follow it exactly. The optional second token is `<slice>` or `triage`.
2. **`sweep` or a known rubric/alias/aggregate key** (no slug matched) → **ad-hoc mode**. Read
   [review/_ad-hoc.md](review/_ad-hoc.md) in full and follow it. It lists the rubric, alias, and aggregate keys.
   Ad-hoc never loads the stage body.
3. **A dimension name that also happens to be a real slug** → the slug wins (stage mode); reach the
   aggregate/dimension explicitly with `/wf review sweep <name>` or by running ad-hoc in a repo with no
   such slug. (This is the documented first-token ambiguity resolution.)
4. **Neither a slug nor a known dimension/sweep** → the existing unknown handling: if it looks like a
   typo'd slug, say so; otherwise render the ad-hoc menu and ask which review the user wants.

Because `review` owns its own first-token resolution, it is **excluded from the dispatcher's Step 0.5
fuzzy-suggest** (like `simplify`/`design`).
