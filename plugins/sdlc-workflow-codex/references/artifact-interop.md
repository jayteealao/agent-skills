# Artifact Interop — Cross-Host State Model

The `.ai/` directory tree is the **shared source of truth** for all SDLC workflow state. Neither Codex nor the Claude plugin maintains a parallel JSON store — every read, resume, and recommendation is derived by reading these artifacts directly from disk.

## Artifact tree

```
.ai/
  workflows/
    INDEX.md                          # global registry (tab-separated: slug, status, workflow-type, branch, updated-at)
    <slug>/
      00-index.md                     # workflow index (frontmatter: title, current-stage, status, branch, ...)
      01-intake.md                    # Stage 1
      02-shape.md                     # Stage 2
      02b-design.md                   # Stage 2b (optional, UI work — $wf shape → brief)
      02c-craft.md                    # Stage 2c (optional, UI work — $wf plan → contract)
      03-slice.md                     # Stage 3 slice index
      03-slice-<slice-slug>.md        # per-slice definition
      04-plan-<slice>.md              # Stage 4 per-slice plan
      04b-instrument.md               # observability augmentation
      04c-experiment.md               # experiment augmentation
      05-implement-<slice>.md         # Stage 5
      05c-benchmark.md                # benchmark augmentation
      06-verify-<slice>.md            # Stage 6
      07-review.md                    # Stage 7 (slug-wide) or per-slice master
      07-review-<slice>-<dim>.md      # per-dimension review findings
      07-design-audit.md              # design audit augmentation
      08-handoff.md                   # Stage 8
      08b-docs-index.md               # docs run index (optional)
      09-ship-run-<run-id>.md         # Stage 9 (per release)
      09-ship-runs.md                 # Stage 9 index
      10-retro.md                     # Stage 10
      99-close.md                     # close record (if closed)
      design-notes/                   # design augmentation notes
      .locks/
        workflow.json                 # workflow lease (ignored by render + git)
  simplify/                           # standalone simplify runs
  profiles/                           # standalone profile runs
  docs/                               # standalone docs-orchestrator runs
  dep-updates/                        # dependency update artifacts
  ideation/                           # standalone ideate runs
  ship-plan.md                        # project-level ship plan (one per repo)
  _view/                              # rendered HTML views (hub output, never edit directly)

PRODUCT.md                            # project root — brand + product context ($wf design setup)
DESIGN.md                             # project root — design tokens + component context (optional)
```

## Schema invariant

Every workflow artifact carries `schema: sdlc/v1` in its YAML frontmatter. Codex reads this field to confirm an artifact belongs to this system before acting on it.

## Cross-thread continuity

Continuity across Codex sessions comes from reading artifacts directly:

- `$wf status [slug]` reads `00-index.md` and stage artifacts to report current state, and derives the next stage from `current-stage` as its quick-action.
- `$wf recap [slug]` reads the workflow tree, retells where the work stands, and recommends the next action.

The `next-command`, `next-invocation`, and `recommended-next-*` fields written into `00-index.md` by stage executors map directly to Codex skill invocations using `$<skill>` syntax (e.g. `next-invocation: $wf implement <slug> <slice>`).

Producer provenance (which host wrote an artifact) is diagnostic-only. Codex reads and extends artifacts regardless of whether the Claude plugin or Codex wrote them — the artifact format is the contract, not the producer.

## Workflow lease

Mutating commands (any stage that writes to `.ai/workflows/<slug>/`) acquire the workflow lease at `.ai/workflows/<slug>/.locks/workflow.json` before writing and release it after. Read-only commands (`$wf status`, `$wf recap how`, etc.) take no lease.

The `.locks/` directory is ignored by the render pipeline and must not be committed to git. It coordinates concurrent access within a single machine — for cross-machine coordination, rely on branch-per-workflow convention and git merge discipline.

## What Codex does NOT do

- Never maintain a separate in-memory or database copy of workflow state. Always read from `.ai/`.
- Never write to `.ai/_view/` directly. Views are render pipeline output only.
- Never assume producer identity from artifact content. Read the frontmatter, not the author.
