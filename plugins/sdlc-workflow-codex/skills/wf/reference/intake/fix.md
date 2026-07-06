---
description: Compressed STANDARD lifecycle for small intentional changes. Drives every SDLC stage (intake → shape → slice → plan → gate → implement → verify → review → …) single-pass, emitting standard numbered artifacts on a full type:index overview. The mode authors the planning half (01-fix → 04-plan) then gates; the standard $wf implement/verify/review chain authors execution. Use when the change is small enough that full planning ceremony is overkill but you still want a recorded, resumable lifecycle and the standard quality gates.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `$wf intake fix`, a **compressed standard lifecycle** for small intentional changes.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-fix-<descriptor>.md` (`type: slice`, `slice-type: fix`, `compressed: true`, `origin: intake/fix`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `fix → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-fix`(intake) → `02-shape` → `03-slice` → `04-plan` → **[gate]** → `$wf implement` (→`05`) → `$wf verify` (→`06`) → `$wf review` (→`07`) → `$wf handoff` → `$wf ship` → `$wf retro`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a description or an existing slug to resume. |
| Produces (this command) | `01-fix.md` (`type: intake`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`, and a conformant `00-index.md` (`type: index`). |
| Compression | Each planning stage is single-pass/lightweight — **no stage is skipped**. One slice, written as a real `03-slice.md`. Design is **never auto-included**; user opts in via `--design`. |
| Gate | Stop-and-prompt before `05-implement` (see `_intake-context.md` → the gate). May run end-to-end if the change is judged low-risk. |
| Next | `$wf implement <slug>` — the standard execution chain takes over from stage 5. |
| Escalate | If during planning the work no longer fits the fix envelope, **warn and continue** — record the breach and offer the gate's "Escalate" option (restart as `$wf intake <description>`). Do not refuse. |

# CRITICAL — scope discipline
You are a **compressed-planning orchestrator**, not an incident responder and not a feature shaper.
- This command skips *ceremony*, not *stages* and not *thinking*. Every stage artifact must be real and schema-conformant.
- Ask at most **2 questions** in chat for planning. No separate `po-answers.md` — answers go inline into `01-fix.md`.
- Do NOT auto-include design. If the change visibly touches UI and `--design` was not passed, note in `02-shape.md` a one-line recommendation to author a design brief (`02b-design.md`) at shape and a visual contract at plan — or run a focused `$wf design <slug> <transform>` — as a follow-up. Do not block.
- Follow the steps below exactly in order. The compression happens *within* a step, not by removing steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: fix` (new) OR `workflow-type: quick` (legacy — slugs created before v9.18.0) → **resume mode**. Read that index and the lead (`01-fix.md` new, or legacy `01-quick.md` / `01-fix.md` `type: fix-plan` pre-migration — check both). Pick up from the first unwritten planning artifact. If planning is complete, the user likely meant `$wf implement` — tell them and stop.
   - Otherwise → **new `$wf intake fix` workflow**. Derive a slug: `fix-<short-description>` (kebab-case, max 5 words, e.g., `fix-checkout-button-spacing`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is neither `fix` nor `quick` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `$wf recap <slug>`." Stop.
3. **Branch check:**
   - Default `branch-strategy: dedicated`, branch `fix/<slug>`. Create off the current base if absent: `git checkout -b fix/<slug>`.
   - If the user passed `branch-strategy: none` or is mid-task on a branch they want to keep → record `branch-strategy: none`; do not switch branches.
4. **Read project context (lightweight):** `.impeccable.md` if present (design context), `README.md` (top ~100 lines). Do NOT read the full codebase here — the Step 1 sub-agent does targeted exploration.
5. **Single slice.** This is a single-slice lifecycle: the workflow slug doubles as the one slice's `slice-slug` (use `<slug>` for `slice-slug`, `selected-slice`, and `best-first-slice`). Downstream stages write **un-suffixed** files (`04-plan.md`, `05-implement.md`, `06-verify.md`).

# Step 1 — Author the planning artifacts (single pass, parallel research)

Use parallel Explore sub-agents to gather what is needed before writing — do not write from memory.

### Parallel research (use sub-agents)
Launch in parallel before writing. Skip if the change is a one-line fix in a file the user has explicitly named.

**Model for every dispatched agent:** `haiku`. REQUIRED on every `Task` call — both agents do bounded targeted reads with structured-output extraction.

#### Explore sub-agent 1 — Codebase grounding
Prompt with ALL of the following:
- Identify the files most likely to be touched based on the user's description.
- For each candidate file note: current shape (~5 lines), nearby patterns the change should match, callers that may need updating.
- Run `git log --oneline -10` on the candidates — flag any touched in the last 7 days (the area is in flux).
- Search for existing utilities/helpers solving the same problem; flag reuse opportunities.

Return structured text: `files_in_scope`, `nearby_patterns` (1-3), `reuse_candidates` (`path:symbol — what it does`), `recent_churn`.

#### Explore sub-agent 2 — Web freshness (skip if pure internal change)
Skip if the change is purely internal (no new external dependency, no API integration, no platform/browser API, no security surface). Otherwise: search the relevant library/API docs for latest-stable syntax + known gotchas/deprecations in the last 12 months; return 2-3 source URLs, a 1-line takeaway each, and a **go/no-go** on whether the approach is current.

### Then write all four planning artifacts, each schema-conformant. Use real timestamps — run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash.

**`01-fix.md` — `type: intake` (the compressed brief, replaces standalone intake):**
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: fix          # mirror of the canonical discriminator on 00-index.md
status: complete            # or awaiting-input if a blocking question remains
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "$wf shape <slug>"
---
```
Body (tight): open with `## The Fix` — the story section (1–2 short paragraphs in the voice of `../_narrative-voice.md`: relevance first, tradeoffs plain, no "This fix implements…" opening) — then `## Restated Request` (what the user wants + why), `## Acceptance Criteria` (≤3, each objectively verifiable; embed any inline question answers as italic notes), `## Assumptions`, `## Open Questions` (if any → set `status: awaiting-input`).

**`02-shape.md` — `type: shape`:**
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
tags: []
refs:
  index: 00-index.md
  intake: 01-fix.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "$wf slice <slug>"
---
```
Body (tight): `## In Scope` (1-3 bullets), `## Out of Scope` (1-3), `## Known Unknowns` (0-2). If the change touches UI surface and `--design` was not passed, add one line: "**UI touched — design skipped:** consider a design brief at shape + contract at plan, or a focused `$wf design <slug> <transform>`, as follow-up." If `--design` was passed, add 3-5 design-note bullets here instead.

**`03-slice.md` — `type: slice-index` (one slice — the lifecycle never skips slicing):**
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
    complexity: <xs|s|m>
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "$wf plan <slug>"
---
```
Body (one line): "Single-slice lifecycle — the whole fix is one slice."

**`04-plan.md` — `type: plan`:**
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
metric-step-count: <int, ≤ 5>
has-blockers: false
revision-count: 0
tags: []
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "$wf implement <slug>"
---
```
Body: `## Steps` — a numbered list of **at most 5** implementation steps; each names the file(s) it touches, states the change in 1-2 lines, and lists its verification (lint? test? manual check? screenshot?). Then `## Verification` — **Tests to run** (specific commands) and **Manual checks** (specific URLs/flows/visual checks).

### Tripwires (warn-and-continue — never refuse)
While planning, if any of these fire, record it in `04-plan.md` under `## Tripwire breaches` (one line each) — but still write a valid plan:
- >3 files touched · >5 implementation steps · new external dependency · architectural change (new module, schema migration, public API surface, cross-cutting behavior change) · >2 unanswerable questions.
If any fired, add the closing line: "One or more fix tripwires fired. The plan is valid but has grown beyond the fix envelope — the gate's *Escalate* option restarts this as a full `$wf intake` workflow."

## Step — Write free narrative fragments
Author free narrative fragments for any of these artifacts as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.

# Step 2 — Write `00-index.md` (conformant `type: index`)

Write the **full 22-field `type: index`** overview using the template + required-field set from [intake/default.md](default.md) (the `## Write 00-index.md` block). It is the same heavy index a standard feature workflow uses — **`status: active`**, `progress` a stage→status **object**. Set the change-mode specifics:

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<human-readable title>"
workflow-type: fix          # the AUTHORITATIVE discriminator the standard commands + resume read
status: active
current-stage: plan         # planning is done; the gate precedes implement
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: <dedicated|none>
branch: "<fix/slug or empty>"
base-branch: "<main|master>"
review-scope: slug-wide     # single slice → one 07-review.md
pr-url: ""
pr-number: 0
open-questions: []
tags: []
next-command: wf-implement
next-invocation: "$wf implement <slug>"
workflow-files:
  - 00-index.md
  - 01-fix.md
  - 02-shape.md
  - 03-slice.md
  - 04-plan.md
slices:
  - slug: <slug>
    status: defined
    complexity: <xs|s|m>
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
(Carry a `stack:` block forward if Step 0.5-style detection is cheap; it is optional here and may be omitted for a small fix.) Then **register the slug in `.ai/workflows/INDEX.md`** per `intake/default.md` Step 10 (create-if-absent / append-and-resort / never mutate other rows).

# Step 3 — Gate before implement (MANDATORY unless auto-proceeding)

Apply the **compressed-lifecycle gate** from `_intake-context.md`: `AskUserQuestion` (Proceed / Adjust / Escalate). You MAY auto-proceed without pausing if the change is clearly low-risk (≤3 files, no tripwires, no open questions) — record the decision in `01-fix.md`'s body either way. On **Adjust**, revise the relevant planning artifact and re-gate. On **Escalate**, recommend `$wf intake <description>` and stop.

# Step 4 — Hand off

Lead with a short **narrative** paragraph (prose, no bullets) telling the story — what the fix is, the files in scope, the step count, any tripwire, and the gate decision — then the structured anchors:

```
wf intake fix complete: <slug>
Branch: <branch-name or "current branch">
Files in scope: <comma-separated, max 3 — say "+N more" if longer>
Plan: <N> steps · Slices: 1 · Tripwires: <none | names>
Gate: <proceeded | adjusted | escalated | auto-proceeded (low-risk)>
Next: $wf implement <slug>
```

If escalated, replace `Next:` with `Restart bigger: $wf intake <description>`.

# Compact and crash-safe behavior
- Write each artifact atomically (temp path → rename) so a crash mid-write never leaves a half-written workflow.
- Resume mode (Step 0) picks up from the first unwritten planning artifact: if interrupted after `02-shape.md` but before `03-slice.md`, it writes slice + plan + index and gates.

# What this command is NOT
- **Not a hotfix** — `$wf intake hotfix` exists for production incidents (production-branch base, diagnosis sub-agents, security-default review). Use it if there is an active incident.
- **Not a refactor workflow** — `$wf intake refactor` exists for behavior-preserving refactoring with a test baseline. Use it for "make the code better without changing what it does."
- **Not a way to skip review** — the standard `$wf implement` → `$wf verify` → `$wf review` chain still runs. The compression is in *planning ceremony*, never in *stages* or *quality gates*.
