# Reconstructed artifact templates (Step 3 of `intake/adopt.md`)

`intake/adopt.md` holds the `00-index.md` template (Step 4). This file holds the five reconstructed artifacts, each schema-conformant, each `provenance: adopted`.


Use real timestamps — get the current UTC time per [_timestamp.md](../../_timestamp.md). Write each artifact atomically (temp path → rename). **Every frontmatter block below includes `provenance: adopted`.**

**`01-adopt.md` — `type: intake` (the adoption record, replaces standalone intake):**
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
provenance: adopted
workflow-type: adopt          # mirror of the discriminator on 00-index.md
status: complete              # or awaiting-input if a blocking question remains
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
Body (tight): open with `## The Adoption` — the story section (must follow `../../_story-arc.md`; 1–2 short paragraphs — the already-built change inherited and why it enters the pipeline now, the decisions taken, the top open risk; no "This adoption implements…" opening) — then `## Adopted Surface` (the changed-file roster with per-file +/- counts, the commit SHAs ahead of `<base>`, and the branch — the Step A0 evidence, exact), `## Restated Intent` (the inferred goal + any user correction from the gate), `## Acceptance Criteria` (each objectively verifiable; environment-dependent ACs carry their W2d resolution as an italic note), `## Assumptions`, `## Open Questions` (if any → set `status: awaiting-input`).

**`02-shape.md` — `type: shape`:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
provenance: adopted
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: false
docs-types: []
tags: []
refs:
  index: 00-index.md
  intake: 01-adopt.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice <slug>"
---
```
Body (tight): `## In Scope` (the changed surface, 1–3 bullets), `## Out of Scope` (explicit, 1–3), `## Known Unknowns` (0–2 — including any `implied_gaps` sub-agent 1 flagged: things the diff arguably should have changed but did not).

**`03-slice.md` — `type: slice-index` (one slice unless separable concerns were confirmed):**
```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
provenance: adopted
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: 1
best-first-slice: <slug>
slices:
  - slug: <slug>
    status: complete
    complexity: <xs|s|m>
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "/wf plan <slug>"
---
```
Body (one line): "Single-slice adoption — the whole adopted change is one slice." (Or, if separable concerns were confirmed at the gate: one `slices[]` entry per concern, each mapped to its file group, and `total-slices` / `best-first-slice` set accordingly. Slice status is `complete`, not `defined` — the code already exists; the schema enum has no `implemented` value, and the adoption fact is carried by `provenance: adopted` plus the index's `progress` map, never by inventing an enum value the write-hook rejects.)

**`04-plan.md` — `type: plan` (retrospective observation + FORWARD verification):**
```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slug>
provenance: adopted
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <int — actual changed-file count>
metric-step-count: <int — reconstructed step count>
has-blockers: false
revision-count: 0
tags: []
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "/wf implement <slug>"
---
```
Body:
- `## What Was Done` — the reconstructed steps, retrospective: each names the file(s) it touched and the change in 1–2 lines. This is observation, not instruction.
- `## Simplicity Ladder (observed)` — for each capability the change introduced, the rung it *actually* took (stdlib / native / reuse / new-code) as an observation, flagging any place a lower rung was clearly available but not taken (a note for review, not a blocker).
- `## Verification Strategy` — **the forward deliverable.** Per AC: the concrete check verify will run (test command / manual flow / observable), and a `constraint-resolution:` line for any AC with an environment dependency (`prerequisite-slice: <slug>` | `proxy+deferral: <clearing event>` | `po-accepted: <reason>`) per W2d. Every `proxy+deferral` resolution ALSO lands as a real entry in the index's `runtime-evidence-deferrals` (`slice`, `reason`, `deferred-at`, `cleared-by: null`, the named clearing event) — a deferral recorded only in plan prose is invisible to the ship gate that enforces it. This section is what makes an adopted workflow verifiable rather than a rubber stamp.

**`05-implement.md` — `type: implement` (synthesized from the diff):**
```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slug>
provenance: adopted
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <int — from git diff --stat>
metric-lines-added: <int>
metric-lines-removed: <int>
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: "<HEAD sha, or empty if the adopted change is still uncommitted>"
tags: []
refs:
  index: 00-index.md
  plan: 04-plan.md
  next: 06-verify.md
next-command: wf-verify
next-invocation: "/wf verify <slug>"
---
```
Body:
- `## What Landed` — the change as it exists in the tree, synthesized from the diff (files, key functions/behaviors added or altered).
- `## Deviations from Plan` — "n/a — adopted (the plan is a reconstruction of this code, not a spec it was built against)."
- `## Verification Seams Built` — the concrete seams verify can drive: test commands that exercise the adopted paths, fixtures or repro scripts present in the diff, observable endpoints/log signatures. When the adopted change built no seam for an AC, say so explicitly — that absence is the top risk the hand-off narrative names.
- `## Anything Deferred` / `## Known Risks / Caveats` — harvest `sdlc-debt:` markers from the diff (`git diff <base>..HEAD | grep -nE 'sdlc-debt:'`) and any TODO/FIXME the change introduced; record them so verify/retro see them.
- If the adopted change is **uncommitted**, note it: `commit-sha` is empty and verify will observe a dirty tree — that is expected for adoption.
