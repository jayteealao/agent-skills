# Change-mode shared tail — stack, index, tripwires, gate, rules

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
  `01-update-deps.md`). The filename carries the mode; the schema checks it as `type: intake`. The lead
  must satisfy the **intake** required set: `status` ∈ `{complete, awaiting-input}`, `stage-number: 1`,
  `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`.
- **The authoritative `workflow-type` discriminator lives on `00-index.md`** (mirror it onto the lead
  for readability, but the index is canonical — the standard stage commands and `/wf status recap` read it there).
- **`00-index.md` is a fully-conformant `type: index`** — the heavy 22-field `indexFrontmatter`
  (`status: active` not `ready`; `progress` a stage→status **object** `{intake: …, slice: …, …}` with
  enum values `not-started|in-progress|complete|skipped`, NOT a list). Start it from
  `wf.mjs stamp index`, per the Index template section below. Add `workflow-type: <mode>`. A missing field or wrong `status`
  → schema-invalid → a render-time warn-banner on every overview.
- **Downstream planning stages use STANDARD types** authored **un-suffixed, single-slice**:
  `02-shape.md` (`type: shape`), `03-slice.md` (`type: slice-index` — even with one slice: a one-entry
  `slices[]` + `total-slices: 1` + `best-first-slice: <the-slice>`, so the overview's slice/implement
  stations derive counts via the slice roster), `04-plan.md` (`type: plan`, carries `slice-slug`).
- **`current-stage` uses the standard enum** (`intake`/`slice`/`plan`/`implement`/`verify`/…)
  — never bespoke names like `diagnose`/`baseline`/`scan`. Put descriptive labels in free-form body
  prose, not in `current-stage`.

**Authorship split — the mode authors planning; the standard commands author execution.**
The mode skill writes **only** `01-<mode>`(intake) → `02-shape` → `03-slice` → `04-plan`, then
**gates** (below). On *proceed* it routes into the standard execution chain, each its own command:
`/wf implement <slug>` (→`05`) → `/wf verify <slug>` (→`06`) → `/wf review <slug>` (→`07`) →
`/wf ship` (→`08`, `09`) → `/wf retro` (→`10`). Those commands recognize the
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
| `<shape-tags>` | `[]` | `[incident]` | `[refactor, baseline]` | `[deps]` |
| `<complexity>` | `xs\|s\|m` | `xs\|s` | `s\|m\|l` | `s\|m\|l` |
| `<next-command>` | `wf-implement` | `wf-implement` | `wf-implement` | `wf-review` |
| `<next-invocation>` | `/wf implement <slug>` | `/wf implement <slug>` | `/wf implement <slug>` | `/wf review <slug>` |
| `<routes>` | see below | see below | see below | see below |
| stack confirm | one-question confirm | unconfirmed (caveat path) | one-question confirm | unconfirmed (caveat path) |

Every planning artifact (`01-<mode>` to `04-plan`) carries the same `next-command` and `next-invocation`: the run's terminus, not the next file. `<routes>` is `[{invocation: "<next-invocation>", reason: "<one phrase>", default: true}, {invocation: "/wf intake \"<description>\" from <slug>", reason: "escalate"}]`.

## Planning templates (`01-<mode>` to `04-plan`)

Every change-mode starts the frontmatter of its four planning records from these templates. `<mode>` is the column name, and the other slots come from the value table. The mode reference names the body of each record and any key that it adds.

`01-<mode>.md` (`type: intake`):
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: <mode>       # mirror of the canonical discriminator on 00-index.md
status: complete            # or awaiting-input if a blocking question remains
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: <tags>
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```

`02-shape.md` (`type: shape`):
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: false
docs-types: []
tags: <shape-tags>
refs:
  index: 00-index.md
  intake: 01-<mode>.md
  next: 03-slice.md
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```

`03-slice.md` (`type: slice-index`, one slice, because the lifecycle never skips slicing):
```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: 1
best-first-slice: <slug>
slices:
  - slug: <slug>
    status: defined
    complexity: <complexity>
tags: <tags>
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```

`04-plan.md` (`type: plan`):
```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <int>
metric-step-count: <int>
has-blockers: false
revision-count: 0
tags: <tags>
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```

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

Every change-mode writes the full `type: index`, the same index as a standard feature workflow.

1. Run `node "<skill-dir>/scripts/wf.mjs" stamp index --slug <slug>`. It prints every field that the schema requires.
2. Write the output to the draft `<wf-dir>/.draft/00-index.md`. Remove the `# one of:` comments.
3. Fill `title`, `branch-strategy` (`dedicated` or `none`), `branch` (empty when `branch-strategy: none`) and `base-branch`. Then set or add these keys, with the slots from the value table:

```yaml
workflow-type: <mode>
current-stage: plan
stage-number: 4
selected-slice: <slug>
review-scope: slug-wide
review-scope-confirmed: true
appetite: small
tags: <tags>
stack: <the Step 0 stack block; user-confirmed per the stack policy>
ux-impact: <none|visual|flow|new-surface>
ux-impact-confirmed: <true|false>
origin-investigate: <source-slug>
next-command: <next-command>
next-invocation: "<next-invocation>"
workflow-files: [00-index.md, 01-<mode>.md, 02-shape.md, 03-slice.md, 04-plan.md]
slices:
  - slug: <slug>
    status: defined
    complexity: <complexity>
progress: {intake: complete, design: <complete|skipped>, slice: complete, plan: complete, implement: not-started, verify: not-started, review: not-started, ship: not-started, retro: not-started}
```

4. Run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

Write no YAML comments in the index. `workflow-type` is the authoritative discriminator that the standard commands and resume read. Write an `origin-<type>` key only when provenance attached. `review-scope: slug-wide` gives one `07-review.md` for the single slice; plan confirms it.

## Tripwire-breach recording (the family mechanism)

Every change-mode carries mode-specific tripwires (its reference lists them). The
mechanism is uniform and **warn-and-continue — never refuse**:

1. While planning, when a tripwire fires, record it in `04-plan.md` under
   `## Tripwire breaches`, one line each: `[tripwire-name]: <what specifically tripped>`.
2. Mirror each breach as an `intent-risks` entry in the index
   (`id: RIM-<n>`, `risk:` the breach line, `severity: medium`, `status: open`): add it to the draft of
   `00-index.md`, or, when the index exists, get it, add the entry, write the draft and put it. So the
   RIM gate of ship adjudicates it instead of a hardcoded-empty list hiding it.
3. Close with: "One or more <mode> tripwires fired. The plan is valid but has grown beyond
   the <mode> envelope — the gate's *Escalate* option restarts this as a full `/wf intake`
   workflow."

A tripwire is never a hard cap: a plan that breaches is still written, recorded, and
gated.

## The gate, Adjust, and Escalate closure

Apply the gate in "Compressed-lifecycle change-modes" above (Proceed / Adjust /
Escalate). Family rules, all branches:

- **Record the decision unconditionally** — proceeded / adjusted / escalated /
  auto-proceeded-low-risk — in the `01-<mode>.md` body (get the record, add the decision, write the
  draft and put it), on every branch including auto-proceed.
- **Adjust** → revise the contested planning record (get it, change it, write the draft and put it), bump its `updated-at`, and
  **re-gate**. A second Adjust falls back to targeted questions on the still-contested
  part only.
- **Escalate** → the change outgrew the mode. Close this slug so it never parks in
  `/wf status` Active pointing at abandoned work: run `record set "<root>" <slug> index status=closed
  close-reason=superseded superseded-by=pending closed-at=<iso-8601> next-command=none
  "next-invocation=none — escalated"`; write the draft of a brief `99-close.md` per `close.md` and put it; update
  the registry row. Then print the successor invocation —
  `/wf intake "<description>" from <slug>` — and stop. The successor consumes the planning
  evidence per `_intake-provenance-consume.md` (escalated change-mode row) and its link-back
  replaces `superseded-by: pending` with the real slug.
- An **Abort/Cancel** offered by a mode-specific question closes the same way with
  `close-reason: cancelled` and no successor invocation.

## Workflow rules (shared tail)

- Store artifacts under `<wf-dir>/`. Never leave canonical results only in chat.
- Every artifact must have YAML frontmatter with `schema: sdlc/v1`. Timestamps must be
  real — get the current UTC time per [_timestamp.md](../_timestamp.md).
- Write each record as a draft and put it, per [_records.md](../_records.md). The put writes the record in one step, so a crash never leaves a
  half-written workflow.
- Review is not skipped — the mode reference names its default rubric.
- Resume picks up from the first unwritten planning artifact.
