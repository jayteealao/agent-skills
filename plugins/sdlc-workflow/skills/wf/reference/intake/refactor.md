---
description: Behavior-preserving refactoring STANDARD lifecycle. Drives every SDLC stage single-pass (01-refactor → 02-shape baseline → 03-slice → 04-plan → gate → implement → verify → review[refactor-safety]) on a full type:index overview. Captures a behavior baseline as the shape before touching code, plans incremental green steps, and confirms identical behavior after. The mode authors the planning half; the standard /wf implement/verify/review chain authors execution.
argument-hint: <description-or-slug>
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake refactor`, a **behavior-preserving refactoring standard lifecycle**.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-refactor-<descriptor>.md` (`type: slice`, `slice-type: refactor`, `compressed: true`, `origin: intake/refactor`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `refactor → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-refactor`(intake) → `02-shape` (baseline) → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review refactor-safety` (→`07`) → `/wf handoff` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | Existing code to refactor (and ideally existing tests to baseline against). Pass a description or an existing slug to resume. |
| Produces (this command) | `01-refactor.md` (`type: intake` — brief), `02-shape.md` (**the baseline**: API surface + coverage map + gaps + frozen APIs + scope), `03-slice.md` (`type: slice-index`, one slice), `04-plan.md` (incremental green steps), conformant `00-index.md` (`type: index`). |
| Compression | Each stage single-pass — **no stage is skipped**. The refactor is one slice; its units are the plan's atomic green steps. A refactor large enough to need real multi-slicing should take the gate's *Escalate* to a full `/wf intake`. |
| Gate | Stop-and-prompt before `05-implement` (Proceed / Adjust / Escalate). |
| Next | `/wf implement <slug>` — standard execution; `07-review` defaults to **`refactor-safety`**. |

# CRITICAL — behavior preservation is the only acceptance criterion
You are a **refactoring orchestrator**. The singular goal is identical external behavior before and after.
- **NEVER add new functionality** during a refactor. Finish the refactor, then start a separate `/wf intake` for new behavior.
- **NEVER change public API surface** (exported signatures, REST routes, event names, component props, config keys) unless API simplification is the explicit stated goal.
- **NEVER skip a failing test** with `skip`/`xtest`/`@Ignore`/comments. A test failing after your changes = a regression — fix the refactor, not the test.
- **NEVER rewrite in one large commit.** Each plan step must leave the codebase working and green.
- **NEVER assume tests are sufficient.** The baseline (Step 2) records what tests actually cover; gaps are risk.
- The lifecycle skips no *stage* — each is single-pass. Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/<slug>/00-index.md` with `workflow-type: refactor` → **resume mode**. Read the index and pick up from the first unwritten planning artifact. (Legacy slugs may carry `rf-*.md` — re-author as the standard set if continuing.)
   - Otherwise → **new refactor**. Derive a slug: `refactor-<short-description>` (kebab-case, max 5 words, e.g., `refactor-auth-service-layer`).
2. **Collision check:** apply the collision check in `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_change-mode-tail.md` (legacy alias for refactor: `rf-*` artifacts).
3. **Provenance check:** apply `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-provenance.md`. The common source is a `/wf simplify` finding routed here — its entry (id, files, rationale, severity) travels in the invocation text and seeds `## Target` / `## Why` directly. An explicit `from <source-slug>` token (an investigate option, an escalated change-mode) consumes its Consume-table row. No match → continue.
4. **Stack fingerprint:** apply the stack policy in `_change-mode-tail.md` — detect cheaply; the one-line confirm rides the Step 1 question round and sets `stack.user-confirmed: true`.
5. **Branch check:** Refactors SHOULD use a dedicated branch — `AskUserQuestion { options: ["Create dedicated branch", "Use current branch"] }`. If dedicated: `git checkout -b refactor/<slug>` from the current branch; record the choice so the index's `branch-strategy`/`branch` reflect it (empty `branch` when the user kept the current branch).
6. **Single slice.** The refactor is one slice — the workflow slug doubles as the one slice's `slice-slug` (use `<slug>` for `slice-slug`, `selected-slice`, `best-first-slice`). The refactor units are the plan's steps. Downstream stages write **un-suffixed** files.

# Step 1 — Brief → `01-refactor.md` (`type: intake`)
Ask 3–6 targeted questions (not the 5-round PO interview):
1. **What is being refactored?** — files/modules/classes/components, specifically.
2. **Why?** — the structural problem (one class doing three things; copy-paste across N files; nested conditionals; wrong abstraction; perf bottleneck).
3. **What must not change?** — behaviors/APIs/interfaces/outputs explicitly frozen.
4. **Is there test coverage?** — covered areas + test files; if none, add tests first?
5. **Target structure?** — what the code should look like after (extract service; strategy pattern; early returns).
6. **Stack confirm** — the one-line confirm from Step 0's fingerprint (per the `_change-mode-tail.md` stack policy).

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
next-invocation: "/wf shape <slug>"
---
```
Body: open with `## The Refactor` — the story section (MUST follow `../_story-arc.md`; 1–2 short paragraphs — the problem inherited, the decisions with reasons, the top open risk; no "This refactor implements…" opening) — then `## Target` (what), `## Why` (the structural problem), `## Frozen` (must-not-change APIs/behaviors), `## Target Structure`.

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
next-invocation: "/wf slice <slug>"
---
```
Body (this is the baseline — preserve it richly): `## Public API Surface` (every exported name with signature, exactly as it currently exists — the verify acceptance contract), `## Test Coverage Map` (behavior → test file), `## Coverage Gaps` (uncovered behaviors = refactor risk), `## Baseline Command` (the exact test command sub-agent 2 ran — verify re-runs this literal command and diffs its counts), `## Baseline Test Result` (pass/fail/skip counts before any change), `## Callers` (count + key sites), `## In Scope` / `## Out of Scope` (the frozen surface), `## Coverage Decision` (written after the question below — which option the user chose and why).

**If coverage gaps are significant:** `AskUserQuestion` — "Coverage gaps found in: <list>. Refactoring without tests covering these areas is risky. Add tests first?" Options: `Add tests first (recommended)` / `Proceed with gaps noted as risk` / `Abort`. Record the answer in `## Coverage Decision` — the choice is a durable gate decision, not chat. **Add tests first** has a concrete mechanism: the plan's Step 1 becomes "author characterization tests for `<the gaps>`" (a real plan step that runs before any restructuring, committed on its own so the baseline grows before the refactor starts). **Proceed with gaps** records each gap as a `## Tripwire breaches` entry per `_change-mode-tail.md`. **Abort** closes the slug per the tail's Abort rule (`close-reason: cancelled`).

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
next-invocation: "/wf plan <slug>"
---
```
Body (one line): "Single-slice refactor — the units are the plan's atomic green steps."

# Step 4 — Plan → `04-plan.md`
Plan the refactor as a sequence of **atomic, independently-green steps** — each leaves the codebase passing (tests green, build passing), is a single logical change, and changes only internal structure (never external behavior). First launch one sub-agent to research the target pattern (web search: established patterns + common pitfalls + safe incremental approaches, e.g. strangler-fig, parallel-change/expand-contract, replace-conditional-with-polymorphism). **Model for that agent:** `haiku` — REQUIRED on the `Task` call; it is bounded search-and-extract work.

The refactor tripwires are: a step that cannot be made independently green · an API surface delta without API simplification as the explicit stated goal · a coverage gap accepted at Step 2. Record breaches per the tripwire-breach mechanism in [_change-mode-tail.md](_change-mode-tail.md).
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
next-invocation: "/wf implement <slug>"
---
```
Body `## Steps` — each step: **What changes** (specific files), **What does NOT change** (preserved surface), **Verify green** (test command after this step), **Why before the next** (dependency or "independent"). Then `## Pattern` (the named refactoring pattern) and `## API Surface Delta` (must be `none` unless API simplification is the explicit goal).

## Step — Write free narrative fragments
Author free narrative fragments for any artifact per the narrative-fragment tier of `_intake-context.md` (a before/after structure diagram or a call-graph tells a refactor story well).

# Step 5 — Write `00-index.md` (conformant `type: index`)
Write the shared change-mode index template from [_change-mode-tail.md](_change-mode-tail.md) with the `refactor` column values (`branch` empty when the user kept the current branch; `stack.user-confirmed: true` after the Step 1 confirm). Then register the slug in `.ai/workflows/INDEX.md` per the tail.

# Step 6 — Gate before implement (MANDATORY)
Apply the gate per `_intake-context.md` and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md) — decision recorded in `01-refactor.md` on every branch. On **Escalate** (the refactor needs real multi-slicing), the tail closes this slug and prints `/wf intake "<description>" from <slug>` — the successor inherits the API-surface and coverage baseline via `_intake-provenance.md` (escalated change-mode row) instead of discarding two sub-agents of work.

# Step 7 — Hand off to the standard chain
On proceed, route to `/wf implement <slug>` (one atomic green step per plan step — never combine; commit per step `refactor(<slug>): step N — <desc>`; if a step's verify fails, STOP and fix the *refactor*, not the test; if two fix attempts on the same step fail, do not keep guessing — `/wf probe <slug> "<the behavior question the failure raises>"`, or `/consult` a second model on the diff, or surface to the user) → `/wf verify <slug>` (full baseline comparison: re-run the literal `## Baseline Command`, diff its pass/fail/skip counts against `## Baseline Test Result`, check every `## Public API Surface` name still exists with the same signature, verify all callers still work — any unplanned delta fails verify) → **`/wf review <slug> refactor-safety`** (checks unintended behavior changes, subtle semantic differences, coverage completeness) → `/wf handoff` → `/wf ship` → `/wf retro`.

Lead with a short **narrative** paragraph (target, why, baseline counts, the pattern, gate decision), then:
```
wf intake refactor complete: <slug>
Branch: refactor/<slug>
Baseline: <pass>/<fail>/<skip> tests · Coverage gaps: <count>
Plan: <N> atomic green steps · Pattern: <name> · API delta: <none | planned changes>
Gate: <proceeded | adjusted | escalated>
Next: /wf implement <slug>  →  /wf verify  →  /wf review <slug> refactor-safety  →  /wf handoff  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). Refactor-specific: the baseline in `02-shape.md` is the ground truth — any deviation at verify is a failure unless it was an explicitly planned API change, and never modify test assertions to make a refactor pass (that destroys the baseline). Review defaults to the **refactor-safety** rubric.
