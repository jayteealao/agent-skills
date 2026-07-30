# Change-mode shared tail — collision, stack, index, tripwires, gate, rules

The single source for the blocks the four change-modes (`fix`, `hotfix`, `refactor`,
`update-deps`) previously carried as four drifting copies. Each mode reference cites the
section it needs and fills the per-mode slots from the value table below. `adopt` keeps its
own index template (its reverse-entry values differ structurally) but follows the stack
policy, the tripwire mechanism, and the closure rule here.

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
| stack confirm | one-question confirm | unconfirmed (caveat path) | one-question confirm | unconfirmed (caveat path) |

## Collision check (Step 0)

If `.ai/workflows/<slug>/00-index.md` already exists and its `workflow-type` is not this
mode (or its documented legacy alias) → WARN: "Workflow `<slug>` already exists with type
`<existing-type>`. Choose a different description, or run `/wf recap <slug>` to continue
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
workflow-type: <mode>       # the AUTHORITATIVE discriminator the standard commands + resume read
status: active
current-stage: plan         # planning is done; the gate precedes implement
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: <dedicated|none>
branch: "<branch, or empty when branch-strategy: none>"
base-branch: "<base>"
review-scope: slug-wide     # single slice → one 07-review.md
review-scope-confirmed: false   # plan asks the PO once the roster is known; absent ≠ asked
appetite: small             # change-modes are small-appetite by construction; say so explicitly
pr-url: ""
pr-number: 0
open-questions: []
tags: <tags>
stack:                      # Step 0 fingerprint per the stack policy above
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
origin-investigate: <source-slug>   # only when provenance attached (any origin-<type> key); omit otherwise
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

Then **register the slug in `.ai/workflows/INDEX.md`** per `intake/default.md` Step 10
(create-if-absent / append-and-resort / never mutate other rows).

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
gated. (This replaces any per-mode hard constraint that made Escalate reachable only
through an artifact the schema forbids.)

## The gate, Adjust, and Escalate closure

Apply the compressed-lifecycle gate from `_intake-context.md` (Proceed / Adjust /
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
  evidence per `_intake-provenance.md` (escalated change-mode row) and its link-back
  replaces `superseded-by: pending` with the real slug.
- An **Abort/Cancel** offered by a mode-specific question closes the same way with
  `close-reason: cancelled` and no successor invocation.

## Workflow rules (shared tail)

- Store artifacts under `.ai/workflows/<slug>/`. Never leave canonical results only in chat.
- Every artifact MUST have YAML frontmatter with `schema: sdlc/v1`. Timestamps must be
  real — run `date -u +"%Y-%m-%dT%H:%M:%SZ"`.
- Write each artifact atomically (temp path → rename) so a crash never leaves a
  half-written workflow.
- Review is not skipped — the mode reference names its default rubric.
- Resume picks up from the first unwritten planning artifact.
