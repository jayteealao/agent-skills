# Simplify — artifact templates

Load this file from `simplify.md` Step 4 and Step 5. It holds the routing-assignment record, the proposed-deltas block, the two standalone artifact templates, the additive-write contract, and the sibling YAML shape.

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

For `plan` scope: every accepted finding gets `route: route-amend-plan` AND records a `proposed-delta` block (the textual change the user applies via amend).

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

## `00-index.md` — `type: workflow-index` (Step 5)

Lightweight; not the heavy 22-field `type: index`:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: simplify
current-stage: simplify
status: complete
selected-slice: ""
branch-strategy: none
open-questions: []
next-command: wf-intake
next-invocation: "/wf <routed-command> <slug>"
progress:
  - simplify: complete
created-at: "<ISO 8601>"
---
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

# plan scope only — link back to the workflow
refs:
  workflow: <slug>                       # only present for plan scope
  plan-file: 04-plan-<slice>.md          # only present for plan scope
---

# Simplify — <scope> <target> @ <run-id>

## The Triage
<!-- STORY SECTION — first, and self-sufficient. MUST follow `_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

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

## Recommended next commands
<copy-pasteable invocations sorted by priority: route-intake → route-refactor → route-amend-* → route-verify / route-add-test → route-fix → route-handoff-config → route-docs>
```

## Additive-write contract — no rewrites; one slug workflow per run

A standalone `simplify-run` **roots its own `type: workflow-index` slug workflow** — each invocation creates a fresh `.ai/workflows/<slug>/` (`slug` = `simplify-<scope>-<YYYYMMDD>`) holding `01-simplify.md` + `00-index.md`. No in-place rewrite scenario exists:

1. **Never overwrite an existing slug.** On collision, append `-2`/`-3`. Keep `run-id` in the lead frontmatter.
2. **Do not carry `revision-count`** in the simplify-run frontmatter. The lead is immutable; subsequent runs author *new* slug workflows.
3. **Set `regenerable: false`** explicitly — the renderer treats simplify-run artifacts as historical evidence.
4. **Cross-run linking is by `refs:`**, not by appending to prior files. Set `refs.prior-run` to the earlier lead when this run was triggered by one. The renderer surfaces lineage as a backlink, not a `## Revision <n>` chain.

The renderer emits each in-slug simplify-run at `.ai/_view/<slug>/simplify/INDEX.html`. **Legacy** off-pipeline runs at `.ai/simplify/<run-id>.md` still render at `.ai/_view/simplify/<run-id>/INDEX.html` — old URLs stay stable.

## Sibling YAML `simplify-run`

The renderer projects `01-simplify.yaml` (`artifact: simplify-run`) as a finding-table page — categorical chips (reuse/quality/efficiency), optional code-deltas summary, no verdict block. Without it the page falls back to a plain frontmatter card. (Legacy off-pipeline runs wrote the sibling at `.ai/simplify/<run-id>.yaml`.)

Shape:

```yaml
# .ai/simplify/20260520T1430Z.yaml
artifact: simplify-run
run_id:   "20260520T1430Z"
scope:    branch          # branch | commit | plan | codebase
target:   "feat/checkout-v2..master"
rev:      1
run_at:   "2026-05-20T14:30:00Z"
summary:  "Eight findings: 5 reuse, 2 quality, 1 efficiency. Five routed to /wf intake refactor."
counts:
  reuse: 5
  quality: 2
  efficiency: 1
  accepted: 7
  skipped: 0
  deferred: 1
findings:
  - id:       SR-1
    category: reuse           # reuse | quality | efficiency
    action:   accept          # accept | skip | defer (matches the routing decision)
    file:     "src/cart/total.ts"
    line:     42
    msg:      "Duplicate validator implementation — see src/lib/validate.ts."
    fix:      "Replace inline impl with the shared validator."
  - id:       SR-2
    category: quality
    action:   defer
    msg:      "Naming inconsistency between cart and checkout modules."
deltas:
  - file:    "src/cart/total.ts"
    add:     0
    rem:     24
    summary: "Removed inline validator; imports from src/lib/validate.ts."
```

Authoring rules:
- One YAML per `01-simplify.md`. Per-finding `id` / `category` / `action` mirrors the MD body.
- `deltas[]` is optional. Include when the run identified concrete file-level changes downstream commands will make.
- `counts` is authoritative — renderer reads it directly, not recomputed from `findings[]`. Keep them in sync.
