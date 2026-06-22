---
description: Behavior-preserving refactoring STANDARD lifecycle. Drives every SDLC stage single-pass (01-refactor → 02-shape baseline → 03-slice → 04-plan → gate → implement → verify → review[refactor-safety]) on a full type:index overview. Captures a behavior baseline as the shape before touching code, plans incremental green steps, and confirms identical behavior after. The mode authors the planning half; the standard $wf implement/verify/review chain authors execution.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `$wf intake refactor`, a **behavior-preserving refactoring standard lifecycle**.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-refactor-<descriptor>.md` (`type: slice`, `slice-type: refactor`, `compressed: true`, `origin: intake/refactor`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `refactor → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-refactor`(intake) → `02-shape` (baseline) → `03-slice` → `04-plan` → **[gate]** → `$wf implement` (→`05`) → `$wf verify` (→`06`) → `$wf review refactor-safety` (→`07`) → `$wf handoff` → `$wf ship`

| | Detail |
|---|---|
| Requires | Existing code to refactor (and ideally existing tests to baseline against). Pass a description or an existing slug to resume. |
| Produces (this command) | `01-refactor.md` (`type: intake` — brief), `02-shape.md` (**the baseline**: API surface + coverage map + gaps + frozen APIs + scope), `03-slice.md` (`type: slice-index`, one slice), `04-plan.md` (incremental green steps), conformant `00-index.md` (`type: index`). |
| Compression | Each stage single-pass — **no stage is skipped**. The refactor is one slice; its units are the plan's atomic green steps. A refactor large enough to need real multi-slicing should take the gate's *Escalate* to a full `$wf intake`. |
| Gate | Stop-and-prompt before `05-implement` (Proceed / Adjust / Escalate). |
| Next | `$wf implement <slug>` — standard execution; `07-review` defaults to **`refactor-safety`**. |

# CRITICAL — behavior preservation is the only acceptance criterion
You are a **refactoring orchestrator**. The singular goal is identical external behavior before and after.
- **NEVER add new functionality** during a refactor. Finish the refactor, then start a separate `$wf intake` for new behavior.
- **NEVER change public API surface** (exported signatures, REST routes, event names, component props, config keys) unless API simplification is the explicit stated goal.
- **NEVER skip a failing test** with `skip`/`xtest`/`@Ignore`/comments. A test failing after your changes = a regression — fix the refactor, not the test.
- **NEVER rewrite in one large commit.** Each plan step must leave the codebase working and green.
- **NEVER assume tests are sufficient.** The baseline (Step 2) records what tests actually cover; gaps are risk.
- The lifecycle skips no *stage* — each is single-pass. Follow the steps exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/<slug>/00-index.md` with `workflow-type: refactor` → **resume mode**. Read the index and pick up from the first unwritten planning artifact. (Legacy slugs may carry `rf-*.md` — re-author as the standard set if continuing.)
   - Otherwise → **new refactor**. Derive a slug: `refactor-<short-description>` (kebab-case, max 5 words, e.g., `refactor-auth-service-layer`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `refactor` → WARN and ask for a different description.
3. **Branch check:** Refactors SHOULD use a dedicated branch — `AskUserQuestion { options: ["Create dedicated branch", "Use current branch"] }`. If dedicated: `git checkout -b refactor/<slug>` from the current branch.
4. **Single slice.** The refactor is one slice — the workflow slug doubles as the one slice's `slice-slug` (use `<slug>` for `slice-slug`, `selected-slice`, `best-first-slice`). The refactor units are the plan's steps. Downstream stages write **un-suffixed** files.

# Step 1 — Brief → `01-refactor.md` (`type: intake`)
Ask 3–5 targeted questions (not the 5-round PO interview):
1. **What is being refactored?** — files/modules/classes/components, specifically.
2. **Why?** — the structural problem (one class doing three things; copy-paste across N files; nested conditionals; wrong abstraction; perf bottleneck).
3. **What must not change?** — behaviors/APIs/interfaces/outputs explicitly frozen.
4. **Is there test coverage?** — covered areas + test files; if none, add tests first?
5. **Target structure?** — what the code should look like after (extract service; strategy pattern; early returns).

Write `01-refactor.md`:
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: refactor
status: complete            # or awaiting-input
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: [refactor]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "$wf shape <slug>"
---
```
Body: open with `## The Refactor` — the story section (1–2 short paragraphs in the voice of `../_narrative-voice.md`: relevance first, tradeoffs plain, no "This refactor implements…" opening) — then `## Target` (what), `## Why` (the structural problem), `## Frozen` (must-not-change APIs/behaviors), `## Target Structure`.

# Step 2 — Baseline → `02-shape.md` (the most important step)
The baseline captures ground truth before any code change — it IS the shape. Launch parallel sub-agents.

**Model for every dispatched agent:** `haiku`. REQUIRED on every `Task` call — both do bounded inventorying with structured output.

### Explore sub-agent 1 — Code State Snapshot
Prompt with ALL of: read every target file (line count, exported names, implicit contracts — events emitted, global state, files written); read every caller (grep imports across the repo); document the current **public API surface** (exported signatures with param/return types, class methods, REST routes, component props); note code intentionally NOT changing.

### Explore sub-agent 2 — Test Coverage Snapshot
Prompt with ALL of: find all test files covering the target (grep target imports in test dirs); per test file, what behavior + key assertions + inputs/outputs; identify **coverage gaps** (exported functions/paths with NO coverage); run the existing tests for the area and capture pass/fail/skip counts + flakiness.

Wait for both. Write `02-shape.md` carrying the baseline:
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
tags: [refactor, baseline]
refs:
  index: 00-index.md
  intake: 01-refactor.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "$wf slice <slug>"
---
```
Body (this is the baseline — preserve it richly): `## Public API Surface` (every exported name with signature, exactly as it currently exists — the verify acceptance contract), `## Test Coverage Map` (behavior → test file), `## Coverage Gaps` (uncovered behaviors = refactor risk), `## Baseline Test Result` (pass/fail/skip counts before any change), `## Callers` (count + key sites), `## In Scope` / `## Out of Scope` (the frozen surface).

**If coverage gaps are significant:** `AskUserQuestion` — "Coverage gaps found in: <list>. Refactoring without tests covering these areas is risky. Add tests first?" Options: `Add tests first (recommended)` / `Proceed with gaps noted as risk` / `Abort`.

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
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
    complexity: <s|m|l>
tags: [refactor]
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "$wf plan <slug>"
---
```
Body (one line): "Single-slice refactor — the units are the plan's atomic green steps."

# Step 4 — Plan → `04-plan.md`
Plan the refactor as a sequence of **atomic, independently-green steps** — each leaves the codebase passing (tests green, build passing), is a single logical change, and changes only internal structure (never external behavior). First launch one sub-agent to research the target pattern (web search: established patterns + common pitfalls + safe incremental approaches, e.g. strangler-fig, parallel-change/expand-contract, replace-conditional-with-polymorphism).
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
tags: [refactor]
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "$wf implement <slug>"
---
```
Body `## Steps` — each step: **What changes** (specific files), **What does NOT change** (preserved surface), **Verify green** (test command after this step), **Why before the next** (dependency or "independent"). Then `## Pattern` (the named refactoring pattern) and `## API Surface Delta` (must be `none` unless API simplification is the explicit goal).

## Step — Write free narrative fragments
Author free narrative fragments for any artifact per the narrative-fragment tier of `_intake-context.md` (a before/after structure diagram or a call-graph tells a refactor story well).

# Step 5 — Write `00-index.md` (conformant `type: index`)
Write the full 22-field `type: index` overview using the template from [intake/default.md](default.md):
```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "Refactor: <target>"
workflow-type: refactor
status: active
current-stage: plan
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: <dedicated|none>
branch: "refactor/<slug>"
base-branch: "<main|master>"
review-scope: slug-wide
pr-url: ""
pr-number: 0
open-questions: []
tags: [refactor]
next-command: wf-implement
next-invocation: "$wf implement <slug>"
workflow-files:
  - 00-index.md
  - 01-refactor.md
  - 02-shape.md
  - 03-slice.md
  - 04-plan.md
slices:
  - slug: <slug>
    status: defined
    complexity: <s|m|l>
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
Then **register the slug in `.ai/workflows/INDEX.md`** per `intake/default.md` Step 10.

# Step 6 — Gate before implement (MANDATORY)
Apply the **compressed-lifecycle gate** from `_intake-context.md` (Proceed / Adjust / Escalate). On **Escalate** (the refactor needs real multi-slicing), recommend `$wf intake <description>` and stop. Record the decision in `01-refactor.md`.

# Step 7 — Hand off to the standard chain
On proceed, route to `$wf implement <slug>` (one atomic green step per plan step — never combine; commit per step `refactor(<slug>): step N — <desc>`; if a step's verify fails, STOP and fix the *refactor*, not the test) → `$wf verify <slug>` (full baseline comparison: re-run the Step-2 suite, compare pass counts, check every `## Public API Surface` name still exists with the same signature, verify all callers still work) → **`$wf review <slug> refactor-safety`** (checks unintended behavior changes, subtle semantic differences, coverage completeness) → `$wf ship`.

Lead with a short **narrative** paragraph (target, why, baseline counts, the pattern, gate decision), then:
```
wf intake refactor complete: <slug>
Branch: refactor/<slug>
Baseline: <pass>/<fail>/<skip> tests · Coverage gaps: <count>
Plan: <N> atomic green steps · Pattern: <name> · API delta: <none | planned changes>
Gate: <proceeded | adjusted | escalated>
Next: $wf implement <slug>  →  $wf verify  →  $wf review <slug> refactor-safety
```

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Never leave canonical results only in chat.
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`. **Timestamps must be real** — run `date -u +"%Y-%m-%dT%H:%M:%SZ"`.
- The baseline in `02-shape.md` is the ground truth. Any deviation at verify is a failure unless it was an explicitly planned API change. Never modify test assertions to make a refactor pass — that destroys the baseline.
- Review is not skipped — it defaults to the **refactor-safety** rubric. Write each artifact atomically (temp → rename).
