# Intake shared context

The single source of truth for the rules every `/wf intake` mode shares — the output boundary,
the narrative-fragment tier, and the workflow-registry / slug semantics. The dispatcher
(`reference/intake.md`), `intake/default.md`, and every mode reference under `intake/` defer to
this file rather than restating it. (Mirrors how the design commands defer to
`design/_design-context.md`.)

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# Narrative fragments — any artifact
Beyond the typed `.html.fragment` the rich stages project from a sibling `.yaml`, *any* artifact a
mode writes may also ship free **narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings
of unrestricted raw HTML — as many as the story needs, no contract and no sibling `.yaml` required —
rendered raw-inline below the page. Author one whenever a bespoke diagram, flow, comparison, or
widget tells the story better than prose. Full guidance:
`${CLAUDE_PLUGIN_ROOT}/reference/narrative-fragments.md`.

# Workflow registry & slug semantics

`.ai/workflows/INDEX.md` is the global workflow registry (format documented in
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/status.md` (the `/wf status` registry-reconcile spec)). Columns:
`slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, sorted alphabetically by slug,
closed rows retained.

**Slugs are stable.** Once intake establishes a slug it never changes, and a closed slug is never
reused by a new workflow.

**Collision detection** (a *new* workflow whose derived slug already exists) is owned by
`intake/default.md` Step 0 — it prompts catch-up (recap) / add-scope (extend) / pick-different / cancel and never silently
proceeds. **This is distinct from slug-mode:** when the dispatcher detects that the *first
positional token* is an exact existing-slug match, that is an *intentional* attach handled by
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — no collision prompt fires.

**Additive bootstrap.** A mode that creates a new workflow must ensure `.ai/workflows/INDEX.md`
contains a row for its slug after `00-index.md` is finalized (create the file with the header line
if absent; append-and-resort if the slug is missing; never mutate other rows). The full procedure
and header text live in `intake/default.md` Step 10 — modes that create a workflow follow it.

# Compressed-lifecycle change-modes (fix / hotfix / refactor / update-deps)

The change-modes are **compressed *standard* lifecycles**, not bespoke pipelines. Each drives the
full SDLC stage sequence — **no stage is skipped**, every stage is single-pass/lightweight but
*present* — and emits **standard numbered artifacts with standard types**, surfaced on a full
`type: index` overview. The four modes share the contract below; each mode reference fills in the
per-mode body (what `01-<mode>`/`02-shape`/etc. carry).

**The model (D1–D3, D7):**
- **Lead = `01-<mode>.md` with `type: intake`** (`01-fix.md`, `01-hotfix.md`, `01-refactor.md`,
  `01-update-deps.md`). The filename carries the mode; the renderer dispatches on `type: intake`
  (→ `intake.mjs`) and the view-path lands at `intake/` (filename-mapped in `_paths.mjs`). The lead
  must satisfy the **intake** required set: `status` ∈ `{complete, awaiting-input}`, `stage-number: 1`,
  `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`.
- **The authoritative `workflow-type` discriminator lives on `00-index.md`** (mirror it onto the lead
  for readability, but the index is canonical — the standard stage commands and `/wf recap` read it there).
- **`00-index.md` is a fully-conformant `type: index`** — the heavy 22-field `indexFrontmatter`
  (`status: active` not `ready`; `progress` a stage→status **object** `{intake: …, shape: …, …}` with
  enum values `not-started|in-progress|complete|skipped`, NOT a list). Use the template + 22-field set
  from [intake/default.md](default.md). Add `workflow-type: <mode>`. A missing field or wrong `status`
  → schema-invalid → a render-time warn-banner on every overview.
- **Downstream planning stages use STANDARD types** authored **un-suffixed, single-slice**:
  `02-shape.md` (`type: shape`), `03-slice.md` (`type: slice-index` — even with one slice: a one-entry
  `slices[]` + `total-slices: 1` + `best-first-slice: <the-slice>`, so the overview's slice/implement
  stations derive counts via the slice roster), `04-plan.md` (`type: plan`, carries `slice-slug`).
- **`current-stage` uses the standard enum** (`intake`/`shape`/`slice`/`plan`/`implement`/`verify`/…)
  — never bespoke names like `diagnose`/`baseline`/`scan`. Put descriptive labels in free-form body
  prose, not in `current-stage`.

**Authorship split (D7) — the mode authors planning; the standard commands author execution.**
The mode skill writes **only** `01-<mode>`(intake) → `02-shape` → `03-slice` → `04-plan`, then
**gates** (below). On *proceed* it routes into the standard execution chain, each its own command:
`/wf implement <slug>` (→`05`) → `/wf verify <slug>` (→`06`) → `/wf review <slug>` (→`07`) →
`/wf handoff` (→`08`) → `/wf ship` (→`09`) → `/wf retro` (→`10`). Those commands recognize the
change-mode `workflow-type`s and read the un-suffixed single-slice files. This reuses the standard
pipeline (rather than re-implementing it per mode) and is what makes the workflow resumable.
**Exception — `update-deps`** self-authors `05-implement`/`06-verify` (its tier-ordered execution is
specialized), then routes to `/wf review`; it never invokes `/wf implement` or `/wf verify`.

**The gate (D4) — stop-and-prompt before `05-implement`.** After `04-plan` is written and before any
execution, the mode pauses for the human via `AskUserQuestion`:

```
question: "Plan for `<slug>` is ready (<N> steps, <M> files). Proceed to implementation?"
options:
  - label: "Proceed"
    description: "Run /wf implement <slug> and continue the standard lifecycle."
  - label: "Adjust"
    description: "Revise the plan/scope before implementing — say what to change."
  - label: "Escalate"
    description: "The change outgrew this mode — restart as a full /wf intake workflow."
```

A mode **MAY run end-to-end without pausing** at this prompt when it judges the change low-risk — its
discretion, per the user. The gate skips only the human *pause*, **never an SDLC *stage***. Record the
decision (proceeded / adjusted / escalated / auto-proceeded-low-risk) in the `01-<mode>.md` body.
