# Intake artifact templates (Steps 2 and 9 of `intake/default.md`)

## `00-index.md`

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<human-readable title>"
status: active
current-stage: intake
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: ""
branch-strategy: <dedicated|shared|none>
branch: "<feat/slug or empty>"
base-branch: "<main|master|develop>"
review-scope: per-slice               # PROVISIONAL default — confirmed at slice (or plan on the skip-to-plan path), NOT asked at intake. Drives /wf review file layout and /wf handoff gating.
review-scope-confirmed: false         # slice/plan flips to true after the PO answers with the roster known
appetite: <small|medium|large>        # Batch A answer. Machine-read downstream: shape's pre-mortem horizon, slice's count expectations, plan's consult trigger.
pr-url: ""
pr-number: 0
open-questions: []
tags: []
stack:                                  # Step 0.5 fingerprint. Observation only — user confirms in Batch B.
  detected-at: "<iso-8601>"
  platforms: []                         # e.g., [android], [web], [ios, web]
  languages: []                         # e.g., [kotlin], [typescript]
  ui: []                                # e.g., [compose], [react, tailwind]
  build: []                             # e.g., [gradle], [vite]
  package-managers: []                  # e.g., [gradle], [pnpm]
  testing: []                           # e.g., [junit, maestro], [vitest, playwright]
  observability: []                     # e.g., [lazylogcat], [sentry]
  integrations: []                      # e.g., [hilt, room], [stripe, prisma]
  available-skills: []                  # [{name, hint}] — session-visible skills
  available-mcp: []                     # [{name, hint}] — session-visible MCP servers
  user-confirmed: false                 # flipped to true after Batch B
next-command: wf-shape
next-invocation: "/wf shape <slug>"
workflow-files:
  - 00-index.md
  - 01-intake.md
  - po-answers.md
progress:
  intake: in-progress
  shape: not-started
  slice: not-started
  plan: not-started
  implement: not-started
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```

No markdown body is needed in the index; the frontmatter IS the content.

## `01-intake.md`

```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape <slug>"
---
```

# Intake

## The Intake
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## Restated Request
<!-- If the request implies a sequence of user actions (a core loop — "user does A, gets B, then C"), state that loop as NUMBERED STEPS. The numbered loop is a deliberate artifact: shape derives the Charter Scenario (the executable end-to-end spine) from it. An unnumbered loop does not exempt shape (it derives one from prose), but numbering it here is the honest, cheap form. -->

## Intended Outcome

## Primary User / Actor

## Affected Areas (preliminary)
<!-- Step 0.7's bounded research findings — file paths, one-line existing behavior each, and any request-ambiguity the code already resolves. Omit the section only when Step 0.7's skip criteria held. Consumed twice downstream: Batch B questions reference it, and shape's research sub-agent 1 opens with it ("verify and deepen, do not re-derive"). -->
- ...

## Known Constraints
- ...

## Assumptions
- ...

## Product Owner Questions Asked
- ...

## Product Owner Answers
- ...

## Unknowns / Open Questions
- ...

## Dependencies / External Factors
- ...

## Risks if Misunderstood
<!-- Each risk here is ALSO a tracked ledger entry (INTENT-FIDELITY W1). Give each a stable id RIM-1..n and a severity; the prose stays, the ids are additive. The ledger is what forces shape to adjudicate each one in writing instead of letting it evaporate. Never silently absent in default mode (Step 6a): zero entries requires the explicit declaration `intent-risks: none-declared` in 00-index.md frontmatter plus a one-line reason here. Record the Step 6a misreading pass in this section too: each dismissed candidate as "considered: <misreading> — dismissed because <reason>". -->
- **RIM-1** (severity: high|medium|low) — <one-line risk statement>
- ...

<!-- LEDGER AUTHORING: write these into 00-index.md frontmatter as `intent-risks` — one entry per RIM with `id`, `risk` (the one-line statement), `severity`, `status: open`, and empty `adjudicated-by` / `decision` / `po-ratified: null`. When the section legitimately has zero entries, write `intent-risks: none-declared` instead (an absent key is ILLEGAL in default mode — shape's Step 9a backfills it). Shape must adjudicate every `open` entry before it can complete (see shape.md Step 9a); handoff/ship HARD-BLOCK on any that stay `open`. This reuses the exact machinery `runtime-evidence-deferrals` already proves out. Compressed intake modes (fix/hotfix/refactor/update-deps/adopt): author entries ONLY if the risk section produces any — the ledger is optional there, and `none-declared` is not required. Terminal-analysis modes (investigate/discover/ideate): no ledger (no build follows). -->

## Charter
<!-- The 3–7 positive commitments this build must honor — deliberately FEW. A charter that restates the whole intake is boilerplate; keep only the load-bearing promises. Each commitment must be FALSIFIABLE BY CODE (a reader can point at a behavior that proves or breaks it), not a mood or an aspiration. Distilled from the Restated Request, Intended Outcome, and Known Constraints. Never silently absent in default mode: zero commitments requires `charter: none-declared` in 00-index.md frontmatter plus a one-line reason here. Ratified with the PO in Step 6b before writing. Compressed intake modes (fix/hotfix/refactor/update-deps/adopt): SKIP — no charter, no declaration needed. -->
- **C1** — <one positive commitment, falsifiable by code> — source: `01-intake.md#<section>`
- ...

<!-- LEDGER AUTHORING: write these into 00-index.md frontmatter as `charter` — one entry per commitment with `id` (C1..), `commitment` (the one-line statement), `source` (the `01-intake.md#section` it distills), `status: honored`, and `po-ratified: true` once Step 6b's confirmation lands (false with an explicit PO-declined note otherwise). When zero commitments, write `charter: none-declared` instead. Additive cross-wiring downstream (ids only, no new machinery): shape's RIM adjudications (Step 9a) MAY name the charter ids they protect; the `## Intake Fidelity` table rows MAY reference charter ids; the intent-fidelity review dimension checks its question 1 per charter id. Compressed intake modes: skip (no charter). -->

## Success Criteria
- ...

## Out of Scope for Now
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf shape <slug>` — [reason]
- **Option B:** `/wf <other> <slug>` — [reason, if applicable]
- **Option C:** Blocked — [what's missing]

If required answers are still missing, set frontmatter `status: awaiting-input` and set `next-invocation` to rerun `/wf intake <same-slug>` after answers arrive.
