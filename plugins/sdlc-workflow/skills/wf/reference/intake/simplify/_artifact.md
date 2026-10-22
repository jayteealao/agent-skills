# Simplify — artifact templates

Load this file from `simplify.md` Step 4 and Step 5. It holds the routing-assignment record, the proposed-deltas block, the standalone `01-simplify.md` template, and the additive-write contract. The `00-index.md` template is in [_light-index.md](../_light-index.md), the `simplify` row.

## What to record per accepted finding (Step 4)

```yaml
routing-assignments:
  - finding-id: reuse-1
    route: route-fix
    suggested-invocation: '/wf intake fix "use utils/hash.ts.sha256 in src/auth.ts:42 instead of inline SHA-256"'
    rationale: |
      One-file, mechanical replacement. No behaviour change.
  - finding-id: quality-3
    route: route-fix
    suggested-invocation: '/wf intake fix "remove unnecessary wrapper Box in src/ui/Box.tsx:18"'
    rationale: |
      Pure removal; no children's layout depends on the wrapper.
  - finding-id: efficiency-2
    route: route-refactor
    suggested-invocation: '/wf intake refactor "src/queries — consolidate N+1 user lookups"'
    rationale: |
      Touches three files and changes the query pattern. Behaviour preserved by the join shape; warrants the refactor's test-baseline discipline.
  - finding-id: quality-7
    route: route-intake
    suggested-invocation: '/wf intake "redesign the auth middleware permission check"'
    rationale: |
      The pattern flagged is a public-API issue. Needs shape + plan + review.
```

### Plan scope — the proposed-deltas block

For `plan` scope: every accepted finding gets `route: route-amend-plan` AND records a `proposed-delta` block (the textual change the user applies as a directed plan fix).

```yaml
proposed-deltas:
  - finding-id: reuse-1
    plan-section: "## Implementation steps · Step 3"
    current: |
      Write a new function `hashUserId(id: string)` that does SHA-256 of the user ID.
    proposed: |
      Use the existing `utils/hash.ts.sha256(value)` — it already handles user IDs.
    rationale: |
      reuse-scan should have surfaced this; including the new function is duplication.
```

## `01-simplify.md` — `type: simplify-run` (Step 5)

`slug` for the in-slug path; `run-id` stays for continuity:

```yaml
---
schema: sdlc/v1
type: simplify-run
slug: <slug>
run-id: "<YYYYMMDDTHHMMZ>"
scope: branch | commit | plan | codebase
target: "<resolved target>"
status: complete | awaiting-input
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"

# Aggregate counts
findings-total: <N>
findings-reuse: <N>
findings-quality: <N>
findings-efficiency: <N>

# Triage outcome
findings-accepted: <N>
findings-skipped: <N>
findings-deferred: <N>

# Routing summary — findings per downstream command
routing-summary:
  route-fix: <N>
  route-refactor: <N>
  route-intake: <N>
  route-amend-plan: <N>
  route-amend-shape: <N>
  route-verify: <N>
  route-add-test: <N>
  route-docs: <N>
  route-handoff-config: <N>
  route-noop: <N>

# Per-finding routing assignments
routing-assignments: []   # populated per Step 4

# plan scope only — proposed deltas accompany route-amend-plan entries
proposed-deltas: []

# Next commands: one entry per suggested-invocation, sorted by priority:
# route-intake → route-refactor → route-amend-* → route-verify / route-add-test → route-fix → route-handoff-config → route-docs
next-command: <key of the default route>
next-invocation: "<default suggested-invocation>"
recommended-routes:
  - invocation: "<suggested-invocation>"
    reason: "<finding-id>: <one phrase>"
    default: true

# plan scope only — link back to the workflow
refs:
  workflow: <slug>                       # only present for plan scope
  plan-file: 04-plan-<slice>.md          # only present for plan scope
---

# Simplify — <scope> <target> @ <run-id>

## Input
<what was reviewed and how it was assembled>

## Findings — Reuse
| ID | Severity | Location | Issue | Suggestion | Triage |
...

## Findings — Quality
...

## Findings — Efficiency
...

## Routing assignments
<full per-finding routing-assignment block, grouped by route>

### route-fix (`/wf intake fix`)
- `reuse-1` — <suggested-invocation> — <rationale>
- ...

### route-refactor (`/wf intake refactor`)
...

### route-intake (`/wf intake`)
...

### route-amend-plan (`/wf plan ...` directed fix)
...

### Other routes
...

## Proposed deltas (plan scope only)
<full per-delta block>

## Skipped
<list of (finding-id, reason)>

## Deferred
<list of (finding-id, reason)>
```

## Additive-write contract — no rewrites; one slug workflow per run

A standalone `simplify-run` **roots its own `type: workflow-index` slug workflow** — each invocation creates a fresh `.ai/workflows/<slug>/` (`slug` = `simplify-<scope>-<YYYYMMDD>`) holding `01-simplify.md` + `00-index.md`. No in-place rewrite scenario exists:

1. **Never overwrite an existing slug.** On collision, append `-2`/`-3`. Keep `run-id` in the lead frontmatter.
2. **Do not carry `revision-count`** in the simplify-run frontmatter. The lead is immutable; subsequent runs author *new* slug workflows.
3. **Set `regenerable: false`** explicitly — the renderer treats simplify-run artifacts as historical evidence.
4. **Cross-run linking is by `refs:`**, not by appending to prior files. Set `refs.prior-run` to the earlier lead when this run was triggered by one. The renderer surfaces lineage as a backlink, not a `## Revision <n>` chain.

The renderer emits each in-slug simplify-run at `.ai/_view/<slug>/simplify/INDEX.html`. **Legacy** off-pipeline runs at `.ai/simplify/<run-id>.md` still render at `.ai/_view/simplify/<run-id>/INDEX.html` — old URLs stay stable.
