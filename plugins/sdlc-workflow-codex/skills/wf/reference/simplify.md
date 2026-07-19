---
description: Review-and-route triage utility. Dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency) across one of four scopes — branch (default), commit, plan, or codebase — classifies findings, and routes each to the appropriate downstream skill ($wf intake fix, $wf intake refactor, $wf intake, $wf docs, etc.). NEVER writes code directly. Adapted from the Codex bundled `simplify` skill but realigned to sdlc-workflow's orchestrator discipline.
argument-hint: "[branch [<base>] | commit <sha-or-range> | plan <slug> <slice> | codebase [<path>]]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf simplify`, a **review-and-route triage utility**. Three parallel sub-agents (Reuse, Quality, Efficiency) review one of four scopes; you classify each finding and route it to the appropriate downstream skill. Not a lifecycle stage, not a workflow, not a fixer — a triage report that fans out.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `simplify` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-simplify-<descriptor>.md` (`type: slice`, `slice-type: simplify`, `compressed: true`, `origin: simplify`); no new workflow, no new branch, no standalone `.ai/simplify/<run-id>.md`, no new top-level `00-index.md`; additive index updates only; chat return `simplify → compressed slice <slice-slug> on <slug>` plus routing summary and top assignments scoped with `<slug>` (e.g., `$wf intake refactor <slug> <target>`, `$wf intake <slug> <correction>`).

If slug-mode was not selected, ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·resolve-scope` → `2·dispatch (3 sub-agents in parallel)` → `3·aggregate + triage` → `4·classify + route (assign each finding a downstream skill)` → `5·write run artifact + print routing suggestions`

| | Detail |
|---|---|
| Requires | Nothing for `branch` / `commit` / `codebase`. For `plan` scope: `.ai/workflows/<slug>/04-plan-<slice>.md` (or `04-plan.md` for compressed workflows) must exist. |
| Produces | `.ai/workflows/<slug>/01-simplify.md` (`type: simplify-run` — findings + routing assignments) + lightweight `00-index.md` in a `type: workflow-index` slug workflow. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render.) |
| Next | One or more downstream skills the user runs based on the routing assignments (routing matrix in Step 4). |
| Does NOT | Write code, edit files outside its own artifact, commit, push, or open PRs. |
| Idempotent | Re-running the same scope+target on an already-cleaned input is safe — agents report "no findings" and the artifact records that. |

> **Optional second opinion.** After the routing matrix assigns each finding, offer `$consult <are any of these findings systematically misrouted — e.g. a route-fix that masks an architectural problem?>` (or `$consult <provider> …`) — a read-only multi-model panel that lightly QCs the router's output (routing is otherwise deterministic from the matrix). Self-run when clearly valuable (pin `codex`/`claude`); otherwise just offer it.

# CRITICAL — execution discipline (orchestrator-not-fixer)
You are a **router**, not a problem-solver.
- Do NOT write code. Not one line. Not even a trivial typo fix.
- Do NOT commit, stage, push, or open PRs.
- Do NOT mutate any artifact file other than the ones you're authoring (`.ai/workflows/<slug>/01-simplify.md` + its `00-index.md`).
- Do NOT edit the workflow plan (plan scope) — write proposed deltas to your run artifact only.
- Do NOT read files outside the scope's diff/path set (branch = branch diff, commit = commit diff, plan = the named plan file only, codebase = the named path subtree only).
- Your only output is the run artifact and a compact chat summary of recommended downstream skills.
- If you catch yourself about to make a code edit, STOP. Route the finding; do not execute it yourself.
- Follow the numbered steps below exactly in order.

---

# Step 0 — Resolve scope

Parse `$ARGUMENTS`. The first token names the scope; default `branch`.

| Token | Mode | Trailing args |
|---|---|---|
| (none) or `branch` | branch | optional `<base-branch>` (defaults to the workflow's base-branch or `git symbolic-ref refs/remotes/origin/HEAD`) |
| `commit` | commit | required `<sha>` OR `<sha-range>` (e.g., `HEAD~3..HEAD`) |
| `plan` | plan | required `<slug>` then required `<slice>` (or omit slice for compressed-flow plans at `04-plan.md`) |
| `codebase` | codebase | optional `<path>` (defaults to repo root) |

Validation:
- `branch` — confirm on a branch (`git symbolic-ref --short HEAD`), not detached HEAD.
- `commit` — confirm sha resolves (`git rev-parse --verify <sha>`).
- `plan` — confirm the plan file exists. If missing, STOP: *"No plan found at `<path>`. Run `$wf plan <slug> <slice>` first or check the slug/slice arguments."*
- `codebase` — confirm path exists.

Record: `run-id` (UTC compact ISO-8601 `<yyyymmdd>T<hhmm>Z`, real time per [_timestamp.md](_timestamp.md)), `scope` (`branch | commit | plan | codebase`), and `target` (resolved target string for the artifact frontmatter).

---

# Step 1 — Assemble input

Per scope:

### branch
```bash
BASE="${1:-$(git merge-base HEAD origin/$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|origin/||'))}"
git diff "$BASE...HEAD"
```
Capture as `INPUT_DIFF`. Three-dot (`A...B`) = only what's new on HEAD relative to base.

### commit
```bash
git show <sha>        # single sha
git diff <range>      # range
```
Capture as `INPUT_DIFF`.

### plan
Read the plan file in full. Agents review the plan's prose + structure, not a git diff. Capture as `INPUT_PLAN_TEXT`.

### codebase
Walk the path subtree. Exclude `.git/`, `node_modules/`, `dist/`, `build/`, `.venv/`, and other generator output. Cap at ~500 files; if larger, ask the user to narrow. Agents read by-need rather than from a single blob.

---

# Step 1b — Harvest `sdlc-debt:` markers (the debt sweep)

Independent of the three agents, scan the scope for `sdlc-debt:` markers and fold them into the findings as **pre-classified** debt. These shortcuts were flagged with a ceiling + upgrade path (written by `$wf implement`), needing *routing* not *discovery* — agents find new issues; this step collects the ones already declared.

- **branch / commit:** grep `INPUT_DIFF` for `sdlc-debt:` — only markers added in the diff.
- **codebase:** grep the path subtree (`grep -rnE 'sdlc-debt:' <path>`, excluding `.git/`, `node_modules/`, `dist/`, `build/`) — the **repo-wide sweep** of the full debt backlog.
- **plan:** skip — plans carry no code markers.

For each marker, emit one finding in the **same `findings:` schema the agents use** (Step 2 output contract):
- `id: debt-<n>`
- `severity:` from the ceiling's blast radius — `high` (correctness/security ceiling), `med` (default), `low` (cosmetic or marker that names no ceiling/upgrade-path → also note it is malformed).
- `location: <file:line>`
- `issue:` the ceiling named in the marker.
- `suggestion:` the upgrade path named in the marker.
- `rationale:` "Author-flagged `sdlc-debt:` marker harvested for routing."

Debt findings join the aggregate in **Step 3** and route through the **Step 4** matrix exactly like agent findings — typically `route-fix` (one-file ceiling), `route-refactor` (cross-file), or `route-intake` (architectural). In the sibling-YAML projection they carry **`category: quality`**; the run body notes which `quality` findings originated from a marker, and the chat summary reports the harvested count (e.g., `debt-markers-swept: <N>`). If the scope has no markers, record "No `sdlc-debt:` markers in scope" and continue.

---

# Step 2 — Dispatch three sub-agents in parallel

**MANDATORY**: issue a single message containing all three agent tool calls. Sequential dispatch is forbidden — the three rubrics run as parallel read-only `explorer` children per [_subagents.md](_subagents.md).

Each agent receives the scope token + target, the Step 1 input (`INPUT_DIFF`, `INPUT_PLAN_TEXT`, or codebase file list), and the rubric below.

Output contract: each agent returns a structured findings list:

```yaml
findings:
  - id: <agent>-<n>          # e.g., reuse-1, quality-3
    severity: high | med | low | nit
    location: <file:line | plan-section | path>
    issue: <one-sentence problem statement>
    suggestion: <one-sentence fix>
    rationale: <one-or-two sentences why this matters>
```

## Agent 1 — Code Reuse Review

For each change in scope:

1. **Search for existing utilities and helpers** that could replace newly written code — `lib/`, `utils/`, `helpers/`, shared modules, files adjacent to the changed ones.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function to use instead.
3. **Flag any inline logic that could use an existing utility** — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, custom retry loops, hand-written debounce/throttle.

### Plan-scope adaptation
For `plan` scope: flag plan steps that propose new code where a reuse-scan should have surfaced an existing helper. Quote the plan section verbatim in `location` and the existing helper path in `suggestion`.

## Agent 2 — Code Quality Review

Review for hacky patterns:

1. **Redundant state**: duplicates existing state, cached values that could be derived, observers/effects that could be direct calls.
2. **Parameter sprawl**: new parameters added instead of generalizing or restructuring existing ones.
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction.
4. **Leaky abstractions**: internal details exposed that should be encapsulated, or existing abstraction boundaries broken.
5. **Stringly-typed code**: raw strings used where constants, enums (string unions), or branded types already exist.
6. **Unnecessary JSX/template nesting**: wrapper Boxes/Views/divs/elements with no layout value — check if inner component props already provide the needed behavior.
7. **Unnecessary comments**: comments explaining WHAT (well-named identifiers do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds).

### Plan-scope adaptation
For `plan` scope: re-purpose:
1. Steps that re-derive what an earlier step already established.
2. Over-detailed parameter lists where the plan should pick one shape.
3. Repeated checklist items that should be one abstraction.
4. Leaky steps that expose internals the plan should hide behind a single abstraction.
5. Magic strings/literals where the plan should reference a constant or convention.
6. (n/a for plan)
7. Plan prose that narrates the change rather than describing intent.

## Agent 3 — Efficiency Review

Review for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns.
2. **Missed concurrency**: independent operations run sequentially when they could be parallel.
3. **Hot-path bloat**: new blocking work in startup or per-request/per-render hot paths.
4. **Recurring no-op updates**: unconditional state/store updates in polling loops, intervals, or event handlers — add a change-detection guard. Also: verify that wrapper functions taking an updater/reducer callback honor same-reference returns — otherwise callers' early-return no-ops are silently defeated.
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern) — operate directly and handle the error.
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks.
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one.

### Plan-scope adaptation
For `plan` scope: re-purpose:
1. Steps that re-do work an earlier step already accomplished.
2. Steps marked sequential when they could be parallel (and the workflow supports it).
3. Steps that add blocking work to hot paths the plan claims to optimise.
4. Steps that update state every iteration without change-detection.
5. Steps that pre-check before acting where the underlying API already handles the error.
6. Steps that load/process more than needed (e.g., "read the entire file" when only one section is used).
7. (covered by #6)

---

# Step 3 — Aggregate + triage

Wait for all three agents. Build a combined findings list, grouped by severity then by agent.

Present the table to the user as a numbered list:

```
| ID | Severity | Agent | Location | Issue | Action |
| reuse-1 | high | Reuse | src/auth.ts:42 | New helper duplicates utils/hash.ts | accept | skip |
| quality-3 | med | Quality | src/ui/Box.tsx:18 | Wrapper Box with no layout effect | accept | skip |
| ... |
```

**Default by severity** (user can override): `high / med / low` — accept; `nit` — skip.

Offer `accept / skip / defer` per finding. `accept` means include in routing assignments, not "fix it now". `defer` records the finding without assigning a downstream skill.

False-positive handling: mark `skip` and add a one-line reason in the artifact. **Do not argue — skip and move on.**

---

# Step 4 — Classify + route

For each `accept` finding, assign a `route` based on what shape of follow-up work it deserves.

## Routing matrix

| Route | Downstream skill | Use when |
|---|---|---|
| `route-fix` | `$wf intake fix "<short description>"` | Trivial mechanical cleanup, ≤1 file, no behaviour change. Typos, dead code, unnecessary comments, missing reuse of a tiny helper. |
| `route-refactor` | `$wf intake refactor "<area>"` | Behaviour-preserving restructure across multiple files. Copy-paste consolidation, abstraction extraction, leaky boundary fixup. |
| `route-intake` | `$wf intake "<feature description>"` | Substantive change with possible behaviour impact, or an architectural problem. New abstraction, API simplification, performance work that crosses tripwires. |
| `route-amend-plan` | `$wf intake <slug> <slice>` | Plan-scope only. Finding flags an issue in the plan prose; add the correction as a new slice. |
| `route-amend-shape` | `$wf intake <slug> <correction>` | Finding implicates the workflow's shaped spec (acceptance criteria, scope). Rare from simplify; arises when a plan-scope finding cascades up. |
| `route-verify` | `$wf verify <slug> <slice>` | Missing or inadequate test coverage for the change. Verify re-runs acceptance criteria and may surface deeper gaps. |
| `route-add-test` | `$wf intake fix "add test for <X>"` | Specific missing test you can add as a one-file fix. |
| `route-docs` | `$wf docs <primitive>` or noted for handoff | Doc gap. Handoff's Diátaxis docs-plan handling usually picks this up; explicit route is for standalone doc gaps. |
| `route-handoff-config` | Edit `00-index.md` `public-surface:` / `docs-mirror:` / `review-bots:` keys | Finding flags drift in surfaces handoff's T3.6/T3.7/T5.1 cares about. The fix is project-level config, not code. |
| `route-noop` | — | Informational; recorded but no action. Some findings are useful to know but not worth acting on. |

## Classification rules

Pick the **smallest scope that fully addresses** each accepted finding. Bias toward `route-fix` over `route-refactor` over `route-intake` — never escalate beyond what the finding deserves.

Tie-breakers:
- Mechanical AND ≤1 file → `route-fix`.
- Spans multiple files AND behaviour-preserving → `route-refactor`.
- Could break behaviour or change a public API → `route-intake` (full shape + plan + review).
- Plan-scope → `route-amend-plan` only (plans versioned via amend, never direct edit).
- "This code needs a test" → `route-add-test` (straightforward) or `route-verify` (deeper gap).

## What to record per accepted finding

```yaml
routing-assignments:
  - finding-id: reuse-1
    route: route-fix
    suggested-invocation: '$wf intake fix "use utils/hash.ts.sha256 in src/auth.ts:42 instead of inline SHA-256"'
    rationale: |
      One-file, mechanical replacement. No behaviour change.
  - finding-id: quality-3
    route: route-fix
    suggested-invocation: '$wf intake fix "remove unnecessary wrapper Box in src/ui/Box.tsx:18"'
    rationale: |
      Pure removal; no children's layout depends on the wrapper.
  - finding-id: efficiency-2
    route: route-refactor
    suggested-invocation: '$wf intake refactor "src/queries — consolidate N+1 user lookups"'
    rationale: |
      Touches three files and changes the query pattern. Behaviour preserved by the join shape; warrants the refactor's test-baseline discipline.
  - finding-id: quality-7
    route: route-intake
    suggested-invocation: '$wf intake "redesign the auth middleware permission check"'
    rationale: |
      The pattern flagged is a public-API issue. Needs shape + plan + review.
```

## Plan scope — the proposed-deltas block stays

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

## What you do NOT do

- Do not run `$wf intake fix` yourself — print the invocation; the user runs it.
- Do not stage or commit anything.
- Do not edit code files even to fix a trivial typo a finding flagged.
- Do not collapse multiple findings into one route because they share a file — each is classified independently.

---

# Step 5 — Write the run artifact + print routing suggestions

Standalone simplify is a **terminal analysis mode** rooting a `type: workflow-index` slug workflow. Derive `simplify-<scope>-<YYYYMMDD>` (append `-2`/`-3` on collision), write **two** files under `.ai/workflows/<slug>/`, and register the slug in `.ai/workflows/INDEX.md` per [intake/default.md](default.md) Step 10. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render.)

First write **`00-index.md` — `type: workflow-index`** (lightweight; not the heavy 22-field `type: index`):
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
next-invocation: "$wf <routed-command> <slug>"
progress:
  - simplify: complete
created-at: "<ISO 8601>"
---
```

Then write **`01-simplify.md` — `type: simplify-run`** (`slug` for the in-slug path; `run-id` stays for continuity):

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

# Routing summary — findings per downstream skill
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
<!-- STORY SECTION — first and self-sufficient. Covers what was produced, load-bearing decisions and counts, top risk. Structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This triage implements…" openings. 1–4 short paragraphs. -->

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

### route-fix (`$wf intake fix`)
- `reuse-1` — <suggested-invocation> — <rationale>
- ...

### route-refactor (`$wf intake refactor`)
...

### route-intake (`$wf intake`)
...

### route-amend-plan (`$wf intake <slug> <slice>`)
...

### Other routes
...

## Proposed deltas (plan scope only)
<full per-delta block>

## Skipped
<list of (finding-id, reason)>

## Deferred
<list of (finding-id, reason)>

## Recommended next skills
<copy-pasteable invocations sorted by priority: route-intake → route-refactor → route-amend-* → route-verify / route-add-test → route-fix → route-handoff-config → route-docs>
```

After writing, print the **Recommended next skills** list to chat.

---

# Resume semantics

Re-running with the same arguments offers to resume the most recent matching run if its `status` is `awaiting-input`. Resume picks up from the first un-triaged finding.

There is no "fixes-pending" state — simplify never applies fixes. The `recommended-next` list is the persistent queue; the user works through it across sessions. Simplify's work is done as soon as Step 5 writes.

If a `route-amend-plan` delta has not yet been applied, the artifact reflects the *moment of triage*, not the current plan state. Re-run on the plan scope to refresh deltas — the new run gets a new `run-id`.

---

# Chat return contract

Return per [_chat-return.md](_chat-return.md) — narrative lead (what was produced, key decisions and counts, top risk), then this receipt:
- `scope: <scope>`
- `target: <target>`
- `run-id: <run-id>`
- `wrote: .ai/workflows/<slug>/01-simplify.md + 00-index.md`
- `findings: <N total>; accepted: <N>; skipped: <N>; deferred: <N>`
- `routes:` — one-line counts per route (`route-fix: N · route-refactor: N · route-intake: N · ...`)
- `recommended-next:` — copy-pasteable invocations ordered by priority (intake first, fix last).

The user picks which to run.

---

# Provenance + deliberate divergence from upstream

This sub-command **adapts** the Codex bundled `simplify` skill but **diverges deliberately** in one critical way:

| | Upstream Codex `simplify` | sdlc-workflow `$wf simplify` |
|---|---|---|
| Agent rubrics | Reuse, Quality, Efficiency | Same — kept verbatim |
| Dispatch shape | Three parallel sub-agents | Same |
| Action after findings | **Applies fixes directly** | **Routes findings to downstream skills; never writes code** |
| Output | Ephemeral chat summary | `.ai/workflows/<slug>/01-simplify.md` artifact (`type: simplify-run`) in a `type: workflow-index` slug workflow |

The divergence is intentional: every skill in this plugin operates as an **orchestrator, not a problem-solver**. Plan plans; implement implements; review reviews; simplify routes. The user invokes the appropriate downstream skill for code action — each runs its own discipline, keeping the artifact trail clean and preventing simplify from becoming a back-door code-write path that bypasses review, verify, or planning.

If the upstream rubric evolves in Codex, update the rubric blocks above to match and bump the CHANGELOG.

---

## Additive-write contract — no rewrites; one slug workflow per run

Since v9.86.0 a standalone `simplify-run` **roots its own `type: workflow-index` slug workflow** — each invocation creates a fresh `.ai/workflows/<slug>/` (`slug` = `simplify-<scope>-<YYYYMMDD>`) holding `01-simplify.md` + `00-index.md`. No in-place rewrite scenario exists:

1. **Never overwrite an existing slug.** On collision, append `-2`/`-3`. Keep `run-id` in the lead frontmatter.
2. **Do not carry `revision-count`** in the simplify-run frontmatter. The lead is immutable; subsequent runs author *new* slug workflows.
3. **Set `regenerable: false`** explicitly — the renderer treats simplify-run artifacts as historical evidence.
4. **Cross-run linking is by `refs:`**, not by appending to prior files. Set `refs.prior-run` to the earlier lead when this run was triggered by one. The renderer surfaces lineage as a backlink, not a `## Revision <n>` chain.

The renderer emits each in-slug simplify-run at `.ai/_view/<slug>/simplify/INDEX.html`. **Legacy** off-pipeline runs at `.ai/simplify/<run-id>.md` still render at `.ai/_view/simplify/<run-id>/INDEX.html` — old URLs stay stable.

---

## Step — Sibling YAML `simplify-run` (v9.22.0+, Phase 3)

When standalone-mode writes `.ai/workflows/<slug>/01-simplify.md`, also write
`.ai/workflows/<slug>/01-simplify.yaml` with `artifact: simplify-run`. The renderer
projects this YAML as a finding-table page — categorical chips (reuse/quality/efficiency),
optional code-deltas summary, no verdict block. Without it the page falls back to a plain
frontmatter card. (Legacy off-pipeline runs wrote the sibling at `.ai/simplify/<run-id>.yaml`.)

**Required whenever you write the `simplify-run` sibling YAML:** also write the
sibling `.html.fragment`. Load `../../wf/reference/_fragment-authoring.md` and follow
its wrapper, snippet, and verifier rules. The fragment must be deterministic from the
YAML (same YAML → byte-identical HTML) and pass `scripts/verify-fragment.mjs` (Check 7).

**Standalone-mode only.** In slug-mode the findings live in a compressed slice (`type: slice`), which renders via the slice template and does NOT consume a `simplify-run` sibling YAML.

Shape:

```yaml
# .ai/simplify/20260520T1430Z.yaml
artifact: simplify-run
run_id:   "20260520T1430Z"
scope:    branch          # branch | commit | plan | codebase
target:   "feat/checkout-v2..master"
rev:      1
run_at:   "2026-05-20T14:30:00Z"
summary:  "Eight findings: 5 reuse, 2 quality, 1 efficiency. Five routed to $wf intake refactor."
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
- One YAML per `.ai/simplify/<run-id>.md`. Per-finding `id` / `category` / `action` mirrors the MD body.
- `deltas[]` is optional. Include when the run identified concrete file-level changes downstream skills will make.
- `counts` is authoritative — renderer reads it directly, not recomputed from `findings[]`. Keep them in sync.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
