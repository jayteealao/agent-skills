---
description: Review-and-route triage utility. Dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency) across one of four scopes — branch (default), commit, plan, or codebase — classifies findings, and routes each to the appropriate downstream command (/wf-quick fix, /wf-quick refactor, /wf intake, /wf-meta amend, /wf-docs, etc.). NEVER writes code directly. Adapted from the Claude Code bundled `simplify` skill but realigned to sdlc-workflow's orchestrator discipline.
argument-hint: "[branch [<base>] | commit <sha-or-range> | plan <slug> <slice> | codebase [<path>]]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/simplify/...`, `.claude/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-quick simplify`, a **review-and-route triage utility**. Three parallel sub-agents (Reuse, Quality, Efficiency) review one of four scopes and you classify each finding, then route it to the appropriate downstream command. Not a lifecycle stage; not a workflow; not a fixer. A triage report that fans out.

# Pipeline
`1·resolve-scope` → `2·dispatch (3 sub-agents in parallel)` → `3·aggregate + triage` → `4·classify + route (assign each finding a downstream command)` → `5·write run artifact + print routing suggestions`

| | Detail |
|---|---|
| Requires | Nothing for `branch` / `commit` / `codebase`. For `plan` scope: `.ai/workflows/<slug>/04-plan-<slice>.md` (or `04-plan.md` for compressed workflows) must exist. |
| Produces | `.ai/simplify/<run-id>.md` — findings + per-finding routing assignments. |
| Next | One or more downstream commands the user runs based on the routing assignments (see the routing matrix in Step 4). |
| Does NOT | Write code, edit files outside its own artifact, commit, push, or open PRs. |
| Idempotent | Re-running with the same scope+target on an already-cleaned input is safe — agents will report "no findings" and the run artifact records that. |

# CRITICAL — execution discipline (orchestrator-not-fixer)
You are a **router**, not a problem-solver. This rule is the load-bearing constraint of the plugin and simplify obeys it like every other stage.
- Do NOT write code. Not one line. Not even a trivial typo fix.
- Do NOT commit, stage, push, or open PRs.
- Do NOT mutate any artifact file other than the one you're authoring (`.ai/simplify/<run-id>.md`).
- Do NOT edit the workflow plan (plan scope) — write proposed deltas to your run artifact only.
- Do NOT touch files outside the scope's diff/path set when *reading* (branch scope = branch diff, commit scope = commit diff, plan scope = the named plan file only, codebase scope = the named path subtree only).
- Your only output is the run artifact and a compact chat summary listing the recommended downstream commands the user can invoke.
- If you catch yourself about to make a code edit, STOP. The finding routes to a downstream command; you do not execute that command yourself.
- Follow the numbered steps below exactly in order.

---

# Step 0 — Resolve scope

Parse `$ARGUMENTS`. The first token (if present) names the scope. Otherwise default to `branch`.

| Token | Mode | Trailing args |
|---|---|---|
| (none) or `branch` | branch | optional `<base-branch>` (defaults to the workflow's base-branch or `git symbolic-ref refs/remotes/origin/HEAD`) |
| `commit` | commit | required `<sha>` OR `<sha-range>` (e.g., `HEAD~3..HEAD`) |
| `plan` | plan | required `<slug>` then required `<slice>` (or omit slice for compressed-flow plans at `04-plan.md`) |
| `codebase` | codebase | optional `<path>` (defaults to repo root) |

Validation:
- `branch` — confirm we're on a branch (`git symbolic-ref --short HEAD`), not detached HEAD.
- `commit` — confirm the sha resolves (`git rev-parse --verify <sha>`).
- `plan` — confirm the plan file exists at the resolved path. If missing, STOP with: *"No plan found at `<path>`. Run `/wf plan <slug> <slice>` first or check the slug/slice arguments."*
- `codebase` — confirm path exists.

Record:
- `run-id`: `date -u +"%Y%m%dT%H%MZ"` (UTC compact ISO-8601 — same shape as ship runs).
- `scope`: one of `branch | commit | plan | codebase`.
- `target`: the resolved target string (for the artifact's frontmatter).

---

# Step 1 — Assemble the input the agents will read

Per scope:

### branch
```bash
BASE="${1:-$(git merge-base HEAD origin/$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|origin/||'))}"
git diff "$BASE...HEAD"
```
Capture the diff as `INPUT_DIFF`. Note: use three-dot (`A...B`) so we get only what's new on HEAD relative to base.

### commit
```bash
# Single sha:
git show <sha>
# OR range:
git diff <range>
```
Capture as `INPUT_DIFF`.

### plan
Read the plan file in full. The "diff" the agents review is the plan's prose + structure, not a git diff. Capture as `INPUT_PLAN_TEXT`.

### codebase
Walk the path subtree. Build a file list excluding `.git/`, `node_modules/`, `dist/`, `build/`, `.venv/`, and other generator output. Cap at ~500 files for the agents' sake; if larger, ask the user to narrow.

Capture the file list + sampled content. For codebase scope the agents read by-need rather than from a single blob.

---

# Step 2 — Dispatch three sub-agents in parallel

**MANDATORY**: issue a single message containing all three `Agent` (Task) tool calls. Sequential dispatch defeats the purpose and is forbidden.

Each agent receives:
- The scope token + target.
- The input from Step 1 (`INPUT_DIFF`, `INPUT_PLAN_TEXT`, or codebase file list).
- The rubric below (verbatim, plus the scope-specific adaptations).

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

1. **Search for existing utilities and helpers** that could replace newly written code. Look for similar patterns elsewhere in the codebase — common locations: utility directories, shared modules, files adjacent to the changed ones, `lib/`, `utils/`, `helpers/`.
2. **Flag any new function that duplicates existing functionality.** Suggest the existing function to use instead.
3. **Flag any inline logic that could use an existing utility** — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, custom retry loops, hand-written debounce/throttle.

### Plan-scope adaptation
For `plan` scope: instead of "new function vs existing function", flag plan steps that propose new code where the plan's reuse-scan should have surfaced an existing helper. Quote the plan section verbatim in `location` and the existing helper path in `suggestion`.

## Agent 2 — Code Quality Review

Review for hacky patterns:

1. **Redundant state**: state that duplicates existing state, cached values that could be derived, observers/effects that could be direct calls.
2. **Parameter sprawl**: adding new parameters to a function instead of generalizing or restructuring existing ones.
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction.
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking existing abstraction boundaries.
5. **Stringly-typed code**: using raw strings where constants, enums (string unions), or branded types already exist in the codebase.
6. **Unnecessary JSX/template nesting**: wrapper Boxes/Views/divs/elements that add no layout value — check if inner component props already provide the needed behavior.
7. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller — delete; keep only non-obvious WHY (hidden constraints, subtle invariants, workarounds).

### Plan-scope adaptation
For `plan` scope: re-purpose the rubric for plan prose:
1. Steps that re-derive what an earlier step already established.
2. Over-detailed parameter lists where the plan should pick one shape.
3. Repeated checklist items that should be one abstraction.
4. Leaky steps that mention internals the plan should hide behind a single abstraction.
5. Magic strings/literals where the plan should reference a constant or convention.
6. (n/a for plan)
7. Plan prose that narrates the change rather than describing intent.

## Agent 3 — Efficiency Review

Review for efficiency:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns.
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel.
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths.
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event handlers that fire unconditionally — add a change-detection guard so downstream consumers aren't notified when nothing changed. Also: if a wrapper function takes an updater/reducer callback, verify it honors same-reference returns — otherwise callers' early-return no-ops are silently defeated.
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern) — operate directly and handle the error.
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks.
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one.

### Plan-scope adaptation
For `plan` scope: re-purpose:
1. Plan steps that re-do work an earlier step already accomplished.
2. Plan steps marked sequential when they could be parallel (and the workflow supports it).
3. Plan steps that add blocking work to hot paths the plan claims to optimise.
4. Plan steps that update state every iteration without change-detection.
5. Plan steps that pre-check before acting where the underlying API already handles the error.
6. Plan steps that load/process more than they need (e.g., "read the entire file" when the step only uses one section).
7. (covered by #6)

---

# Step 3 — Aggregate + triage

Wait for all three agents. Build a combined findings list grouped by severity, then by agent.

Present the table to the user using AskUserQuestion (multi-select):

```
| ID | Severity | Agent | Location | Issue | Action |
| reuse-1 | high | Reuse | src/auth.ts:42 | New helper duplicates utils/hash.ts | accept | skip |
| quality-3 | med | Quality | src/ui/Box.tsx:18 | Wrapper Box with no layout effect | accept | skip |
| ... |
```

**Default behaviour by severity** (the user can override):
- `high` — accept
- `med` — accept
- `low` — accept
- `nit` — skip

AskUserQuestion offers `accept / skip / defer` per finding. `accept` means "include this finding in the routing assignments"; it does NOT mean "fix it now". `defer` records the finding but does not assign a downstream command.

False-positive handling: if a finding is wrong, mark it `skip` and add a one-line reason in the artifact. **Do not argue with the finding — skip it and move on.**

---

# Step 4 — Classify + route

For each `accept` finding, assign a `route` based on what shape of follow-up work it deserves. This is the load-bearing step — simplify's value is in the routing, not the finding.

## Routing matrix

| Route | Downstream command | Use when |
|---|---|---|
| `route-fix` | `/wf-quick fix "<short description>"` | Trivial mechanical cleanup, ≤1 file, no behaviour change. Typos, dead code, unnecessary comments, missing reuse of a tiny helper. |
| `route-refactor` | `/wf-quick refactor "<area>"` | Behaviour-preserving restructure across multiple files. Copy-paste consolidation, abstraction extraction, leaky boundary fixup. |
| `route-intake` | `/wf intake "<feature description>"` | Substantive change with possible behaviour impact, or an architectural problem. New abstraction, API simplification, performance work that crosses tripwires. |
| `route-amend-plan` | `/wf-meta amend <slug> <slice>` | Plan-scope only. Finding flags an issue in the plan prose; apply the proposed delta via amend. |
| `route-amend-shape` | `/wf-meta amend <slug>` | Finding implicates the workflow's shaped spec (acceptance criteria, scope). Rare from simplify; arises when a plan-scope finding cascades up. |
| `route-verify` | `/wf verify <slug> <slice>` | Missing or inadequate test coverage for the change. Verify re-runs acceptance criteria and may surface deeper gaps. |
| `route-add-test` | `/wf-quick fix "add test for <X>"` | Specific missing test you can add as a one-file fix. |
| `route-docs` | `/wf-docs <primitive>` or noted for handoff | Doc gap. Handoff's Diátaxis docs-plan handling usually picks this up; explicit route is for standalone doc gaps. |
| `route-handoff-config` | Edit `00-index.md` `public-surface:` / `docs-mirror:` / `review-bots:` keys | Finding flags drift in surfaces handoff's T3.6/T3.7/T5.1 cares about. The fix is project-level config, not code. |
| `route-noop` | — | Informational; recorded but no action. Some findings are useful to know but not worth acting on. |

## Classification rules

For each accepted finding, pick the **smallest scope that fully addresses it**. Bias toward `route-fix` over `route-refactor` over `route-intake` — never escalate a finding to a bigger process than it deserves.

Tie-breakers:
- If a finding is mechanical AND ≤1 file → `route-fix`.
- If a finding spans multiple files AND is behaviour-preserving → `route-refactor`.
- If a finding could break behaviour or change a public API → `route-intake` (gets a full shape + plan + review).
- If a finding is plan-scope → `route-amend-plan` is the only correct route (plans are versioned via amend, never via direct edit).
- If a finding is "this code needs a test" — and the test is straightforward → `route-add-test`. If the gap is deeper → `route-verify`.

## What to record per accepted finding

```yaml
routing-assignments:
  - finding-id: reuse-1
    route: route-fix
    suggested-invocation: '/wf-quick fix "use utils/hash.ts.sha256 in src/auth.ts:42 instead of inline SHA-256"'
    rationale: |
      One-file, mechanical replacement. No behaviour change.
  - finding-id: quality-3
    route: route-fix
    suggested-invocation: '/wf-quick fix "remove unnecessary wrapper Box in src/ui/Box.tsx:18"'
    rationale: |
      Pure removal; no children's layout depends on the wrapper.
  - finding-id: efficiency-2
    route: route-refactor
    suggested-invocation: '/wf-quick refactor "src/queries — consolidate N+1 user lookups"'
    rationale: |
      Touches three files and changes the query pattern. Behaviour preserved by the join shape; warrants the refactor's test-baseline discipline.
  - finding-id: quality-7
    route: route-intake
    suggested-invocation: '/wf intake "redesign the auth middleware permission check"'
    rationale: |
      The pattern flagged is a public-API issue. Needs shape + plan + review.
```

## Plan scope — the proposed-deltas block stays

For `plan` scope specifically: every accepted finding gets `route: route-amend-plan` AND also records a `proposed-delta` block (the actual textual change the user should apply via amend). This is the existing plan-scope contract — kept intact.

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

- Do not run `/wf-quick fix` yourself. You print the suggested invocation; the user runs it.
- Do not stage or commit anything.
- Do not edit code files even to "fix" a trivial typo a finding flagged.
- Do not collapse multiple findings into one route just because they share a file. Each finding is independently classified.

---

# Step 5 — Write the run artifact + print routing suggestions

Write `.ai/simplify/<run-id>.md`:

```yaml
---
schema: sdlc/v1
type: simplify-run
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

# Routing summary — how many findings went to each downstream command
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

# Per-finding routing assignments (the main deliverable)
routing-assignments: []   # populated per Step 4

# For plan scope — proposed deltas accompany route-amend-plan entries
proposed-deltas: []

# When scope = plan, link back to the workflow
refs:
  workflow: <slug>                       # only present for plan scope
  plan-file: 04-plan-<slice>.md          # only present for plan scope
---

# Simplify — <scope> <target> @ <run-id>

## Input
<one paragraph: what was reviewed, how it was assembled>

## Findings — Reuse
| ID | Severity | Location | Issue | Suggestion | Triage |
...

## Findings — Quality
...

## Findings — Efficiency
...

## Routing assignments
<full per-finding routing-assignment block, grouped by route>

### route-fix (`/wf-quick fix`)
- `reuse-1` — &lt;suggested-invocation&gt; — &lt;rationale&gt;
- ...

### route-refactor (`/wf-quick refactor`)
...

### route-intake (`/wf intake`)
...

### route-amend-plan (`/wf-meta amend ...`)
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
<a copy-pasteable list of the suggested invocations, sorted by route priority:
 route-intake first (biggest process), then route-refactor, then route-amend-*,
 then route-verify / route-add-test, then route-fix, then route-handoff-config,
 then route-docs>
```

After writing, print the **Recommended next commands** list to chat — that's the user's queue.

---

# Resume semantics

Re-running `/wf-quick simplify <scope> <target>` with the same arguments offers to resume the most recent matching run if its `status` is `awaiting-input` (the user stepped away during triage). Resume picks up the AskUserQuestion accept/skip/defer cycle from the first un-triaged finding.

There is no "fixes-pending" state because simplify never applies fixes. The run artifact's `recommended-next` list is the persistent queue — the user works through it across as many sessions as they need by re-reading the artifact. Simplify's own work is done as soon as Step 5 writes.

If a `route-amend-plan` delta has not yet been applied, the simplify artifact reflects the *moment of triage*, not the *current state of the plan*. Re-run simplify on the plan scope to refresh the deltas after the plan changes — the new run gets a new `run-id`.

---

# Chat return contract

After writing the run artifact, return ONLY:
- `scope: <scope>`
- `target: <target>`
- `run-id: <run-id>`
- `wrote: .ai/simplify/<run-id>.md`
- `findings: <N total>; accepted: <N>; skipped: <N>; deferred: <N>`
- `routes:` — one-line counts per route (`route-fix: N · route-refactor: N · route-intake: N · ...`)
- `recommended-next:` — the queue of suggested invocations, ordered by route priority (intake first, fix last). Each is copy-pasteable.

The user picks which to run. You do not run them yourself.

---

# Provenance + deliberate divergence from upstream

This sub-command **adapts** the Claude Code bundled `simplify` skill (see `.scratch/claude-code/src/skills/bundled/simplify.ts`) but **diverges deliberately** in one critical way:

| | Upstream Claude Code `simplify` | sdlc-workflow `/wf-quick simplify` |
|---|---|---|
| Agent rubrics | Reuse, Quality, Efficiency | Same — kept verbatim |
| Dispatch shape | Three parallel sub-agents | Same |
| Action after findings | **Applies fixes directly** | **Routes findings to downstream commands; never writes code** |
| Output | Ephemeral chat summary | `.ai/simplify/<run-id>.md` artifact |

The divergence on action is intentional: every command in this plugin operates as an **orchestrator, not a problem-solver**. Plan plans; implement implements; review reviews. Simplify routes. If a finding deserves code action, the user invokes the appropriate downstream command (`/wf-quick fix`, `/wf-quick refactor`, `/wf intake`, etc.) — each of which runs its own discipline. That separation keeps the artifact trail clean and prevents simplify from becoming a back-door "I'll just write code" path that bypasses review, verify, or planning.

The agent rubrics are stable across the two implementations — if the upstream rubric evolves in Claude Code, update the rubric blocks above to match and bump the plugin's CHANGELOG.
