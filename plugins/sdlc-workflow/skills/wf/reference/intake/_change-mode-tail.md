# Change-mode shared tail — collision, stack, index, tripwires, gate, rules

The single source for the blocks the four change-modes (`fix`, `hotfix`, `refactor`,
`update-deps`) share. Each mode reference cites the
section it needs and fills the per-mode slots from the value table below. `adopt` keeps its
own index template (its reverse-entry values differ structurally) but follows the
compressed-lifecycle contract, the stack policy, the tripwire mechanism, and the closure rule here.

## Compressed-lifecycle change-modes

The change-modes are **compressed *standard* lifecycles**, not bespoke pipelines. Each drives the
full SDLC stage sequence — **no stage is skipped**, every stage is single-pass/lightweight but
*present* — and emits **standard numbered artifacts with standard types**, surfaced on a full
`type: index` overview. The four modes share the contract below; each mode reference fills in the
per-mode body (what `01-<mode>`/`02-shape`/etc. carry).

**The model:**
- **Lead = `01-<mode>.md` with `type: intake`** (`01-fix.md`, `01-hotfix.md`, `01-refactor.md`,
  `01-update-deps.md`). The filename carries the mode; the renderer dispatches on `type: intake`
  (→ `intake.mjs`) and the view-path lands at `intake/` (filename-mapped in `_paths.mjs`). The lead
  must satisfy the **intake** required set: `status` ∈ `{complete, awaiting-input}`, `stage-number: 1`,
  `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`.
- **The authoritative `workflow-type` discriminator lives on `00-index.md`** (mirror it onto the lead
  for readability, but the index is canonical — the standard stage commands and `/wf status recap` read it there).
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

**Authorship split — the mode authors planning; the standard commands author execution.**
The mode skill writes **only** `01-<mode>`(intake) → `02-shape` → `03-slice` → `04-plan`, then
**gates** (below). On *proceed* it routes into the standard execution chain, each its own command:
`/wf implement <slug>` (→`05`) → `/wf verify <slug>` (→`06`) → `/wf review <slug>` (→`07`) →
`/wf handoff` (→`08`) → `/wf ship` (→`09`) → `/wf retro` (→`10`). Those commands recognize the
change-mode `workflow-type`s and read the un-suffixed single-slice files. This reuses the standard
pipeline (rather than re-implementing it per mode) and is what makes the workflow resumable.
**Exception — `update-deps`** self-authors `05-implement`/`06-verify` (its tier-ordered execution is
specialized), then routes to `/wf review`; it never invokes `/wf implement` or `/wf verify`.

**The gate — stop-and-prompt before `05-implement`.** After `04-plan` is written and before any
execution, the mode pauses for the human per the gate-question ladder ([_gate-question.md](../_gate-question.md)):

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

## Per-mode value table

| Slot | `fix` | `hotfix` | `refactor` | `update-deps` |
|---|---|---|---|---|
| `<title>` | human-readable title | `Hotfix: <symptom>` | `Refactor: <target>` | `Dependency update <YYYY-MM-DD>` |
| `<branch>` | `fix/<slug>` | `hotfix/<slug>` | `refactor/<slug>` | `deps/<slug>` |
| `<base>` | current base | production branch | current base | current base |
| `<tags>` | `[]` | `[incident]` | `[refactor]` | `[deps]` |
| `<complexity>` | `xs\|s\|m` | `xs\|s` | `s\|m\|l` | `s\|m\|l` |
| `<next-command>` | `wf-implement` | `wf-implement` | `wf-implement` | `wf-review` |
| `<next-invocation>` | `/wf implement <slug>` | `/wf implement <slug>` | `/wf implement <slug>` | `/wf review <slug>` |
| `<routes>` | see below | see below | see below | see below |
| stack confirm | one-question confirm | unconfirmed (caveat path) | one-question confirm | unconfirmed (caveat path) |

Every planning artifact (`01-<mode>` to `04-plan`) carries the same `next-command` and `next-invocation`: the run's terminus, not the next file. `<routes>` is `[{invocation: "<next-invocation>", reason: "<one phrase>", default: true}, {invocation: "/wf intake \"<description>\" from <slug>", reason: "escalate"}]`.

## Collision check (Step 0)

If `.ai/workflows/<slug>/00-index.md` already exists and its `workflow-type` is not this
mode (or its documented legacy alias) → WARN: "Workflow `<slug>` already exists with type
`<existing-type>`. Choose a different description, or run `/wf status recap <slug>` to continue
the existing workflow." Stop. (An exact slug match in the *first positional* is the
dispatcher's intentional attach and never reaches this check — see `_intake-context.md`.)

## Stack policy (Step 0 — every change-mode and adopt)

Detect the stack fingerprint cheaply, per `intake/default.md` Step 0.5 (manifest reads
only — no codebase scan), and write it as the index's `stack:` block. The block is
observational; omit keys rather than guess. Then split by the value table's stack-confirm
row:

- **`fix` / `refactor`** — spend one of the mode's permitted questions on the one-line
  confirm ("I detected `<platforms>` using `<ui>` + `<build>`, tests via `<testing>` —
  anything wrong or off-limits?") and set `stack.user-confirmed: true` after the answer.
- **`hotfix` / `update-deps` / `adopt`** — write the block with
  `stack.user-confirmed: false` and do not spend a question on it; the verify stage's
  existing unconfirmed-stack caveat path carries it. The verify STOP fires only when
  `stack:` is absent, which this policy eliminates.

## UX impact and the design stage (Step 0 — every change-mode)

Set `ux-impact` per `design/_lane.md` (read it now). `fix` and `refactor` confirm it in the same question as the stack. `hotfix` records it unconfirmed. `update-deps` writes `none`. A trailing `design` token sets it to at least `visual`.

When design is needed, the person is present, so run the design stage (`design/stage.md`) in compressed form after `02-shape.md` and before `03-slice.md`: a short brief, one drawing per changed surface, one confirmation, then `02c-craft.md`. `04-plan.md` is written only after the design is settled; the pre-write hook refuses it before. When `ux-impact: none`, write `progress.design: skipped` and `design-skip-reason:`.

## Index template (`00-index.md`, `type: index`)

Every change-mode writes the **full `type: index`** overview — the same heavy index a
standard feature workflow uses, per the required set in `intake/default.md`. One template,
slots from the value table:

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<title>"
workflow-type: <mode>
status: active
current-stage: plan
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: <dedicated|none>
branch: "<branch, or empty when branch-strategy: none>"
base-branch: "<base>"
review-scope: slug-wide
review-scope-confirmed: false
appetite: small
pr-url: ""
pr-number: 0
open-questions: []
tags: <tags>
stack:
  detected-at: "<iso-8601>"
  platforms: []
  languages: []
  ui: []
  build: []
  package-managers: []
  testing: []
  observability: []
  integrations: []
  available-skills: []
  available-mcp: []
  user-confirmed: <true|false per the stack policy>
ux-impact: <none|visual|flow|new-surface>
ux-impact-confirmed: <true|false>
origin-investigate: <source-slug>
next-command: <next-command>
next-invocation: "<next-invocation>"
workflow-files:
  - 00-index.md
  - 01-<mode>.md
  - 02-shape.md
  - 03-slice.md
  - 04-plan.md
slices:
  - slug: <slug>
    status: defined
    complexity: <complexity>
progress:
  intake: complete
  shape: complete
  design: <complete|skipped>
  slice: complete
  plan: complete
  implement: not-started
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```

Write no YAML comments in the index. `workflow-type` is the authoritative discriminator that the standard commands and resume read. Write an `origin-<type>` key only when provenance attached. `review-scope: slug-wide` gives one `07-review.md` for the single slice; plan confirms it.

Then **register the slug in `.ai/workflows/INDEX.md`** per `_intake-context.md` → Register the workflow in INDEX.md.

## Tripwire-breach recording (the family mechanism)

Every change-mode carries mode-specific tripwires (its reference lists them). The
mechanism is uniform and **warn-and-continue — never refuse**:

1. While planning, when a tripwire fires, record it in `04-plan.md` under
   `## Tripwire breaches`, one line each: `[tripwire-name]: <what specifically tripped>`.
2. Mirror each breach as an `intent-risks` entry on `00-index.md`
   (`id: RIM-<n>`, `risk:` the breach line, `severity: medium`, `status: open`) so the
   handoff/ship RIM gate adjudicates it instead of a hardcoded-empty list hiding it.
3. Close with: "One or more <mode> tripwires fired. The plan is valid but has grown beyond
   the <mode> envelope — the gate's *Escalate* option restarts this as a full `/wf intake`
   workflow."

A tripwire is never a hard cap: a plan that breaches is still written, recorded, and
gated.

## The gate, Adjust, and Escalate closure

Apply the gate in "Compressed-lifecycle change-modes" above (Proceed / Adjust /
Escalate). Family rules, all branches:

- **Record the decision unconditionally** — proceeded / adjusted / escalated /
  auto-proceeded-low-risk — in the `01-<mode>.md` body, on every branch including
  auto-proceed.
- **Adjust** → revise the contested planning artifact, bump its `updated-at`, and
  **re-gate**. A second Adjust falls back to targeted questions on the still-contested
  part only.
- **Escalate** → the change outgrew the mode. Close this slug so it never parks in
  `/wf status` Active pointing at abandoned work: set `00-index.md` `status: closed`,
  `close-reason: superseded`, `superseded-by: pending`, `closed-at`, `next-command: none`,
  `next-invocation: "none — escalated"`; write a brief `99-close.md` per `close.md`; update
  the registry row. Then print the successor invocation —
  `/wf intake "<description>" from <slug>` — and stop. The successor consumes the planning
  evidence per `_intake-provenance-consume.md` (escalated change-mode row) and its link-back
  replaces `superseded-by: pending` with the real slug.
- An **Abort/Cancel** offered by a mode-specific question closes the same way with
  `close-reason: cancelled` and no successor invocation.

## Workflow rules (shared tail)

- Store artifacts under `.ai/workflows/<slug>/`. Never leave canonical results only in chat.
- Every artifact must have YAML frontmatter with `schema: sdlc/v1`. Timestamps must be
  real — get the current UTC time per [_timestamp.md](../_timestamp.md).
- Write each artifact atomically (temp path → rename) so a crash never leaves a
  half-written workflow.
- Review is not skipped — the mode reference names its default rubric.
- Resume picks up from the first unwritten planning artifact.
