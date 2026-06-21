---
description: Review-and-route triage utility. Dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency) across one of four scopes — branch (default), commit, plan, or codebase — classifies findings, and routes each to the appropriate downstream command (/wf intake fix, /wf intake refactor, /wf intake, /wf-meta amend, /wf-docs, etc.). NEVER writes code directly. Adapted from the Claude Code bundled `simplify` skill but realigned to sdlc-workflow's orchestrator discipline.
argument-hint: "[branch [<base>] | commit <sha-or-range> | plan <slug> <slice> | codebase [<path>]]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/simplify/...`, `.claude/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `/wf simplify`, a **review-and-route triage utility**. Three parallel sub-agents (Reuse, Quality, Efficiency) review one of four scopes and you classify each finding, then route it to the appropriate downstream command. Not a lifecycle stage; not a workflow; not a fixer. A triage report that fans out.

# Slug-mode (read before proceeding)

If the `/wf` dispatcher selected **slug-mode** (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` for the exact slice frontmatter and index bookkeeping. Substantively:

- **One artifact, in the existing workflow** — *not* the standalone `.ai/simplify/<run-id>.md` location. Write `.ai/workflows/<slug>/03-slice-simplify-<descriptor>.md` (collision suffix `-2`, `-3` if needed; descriptor defaults to scope — e.g., `simplify-branch-2026-05-13` or `simplify-codebase-auth`). Frontmatter: `type: slice`, `slice-slug: simplify-<descriptor>`, `slice-type: simplify`, `compressed: true`, `origin: simplify`, `stage-number: 3`, `status: defined`, `complexity: xs` (simplify produces routing recommendations, not implementation work). In slug-mode, do NOT also write `.ai/simplify/<run-id>.md` — the compressed slice is the single output.
- **Same content, different home.** Body carries the same sections the standalone simplify would have written to `.ai/simplify/<run-id>.md` (three-agent findings, per-finding classification, routing summary, routing assignments, proposed deltas), under a `# Compressed Slice: simplify` heading with a one-line provenance preamble. The `simplify-run` frontmatter fields (`findings-total`, `findings-reuse`, etc.) do NOT carry over — they belong to the standalone `simplify-run` artifact type. The compressed slice is a `slice` artifact; report the same numbers in the body instead.
- **No new workflow, no new branch, no `01-simplify.md`, no `.ai/simplify/<run-id>.md`, no new top-level `00-index.md`.** The slug already owns the workflow context; simplify's findings live as a slice on it.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: simplify-<descriptor>, slice-type: simplify, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: simplify, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf simplify → compressed slice simplify-<descriptor> on <slug>` — plus the routing summary (counts per downstream command) and the top routing assignments, each scoped with `<slug>` as the first positional argument (e.g., `/wf intake refactor <slug> <target>`, `/wf-meta amend <slug>`). Use the positional-slug form — there is no `--slug` flag in v9.10.0+.

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·resolve-scope` → `2·dispatch (3 sub-agents in parallel)` → `3·aggregate + triage` → `4·classify + route (assign each finding a downstream command)` → `5·write run artifact + print routing suggestions`

| | Detail |
|---|---|
| Requires | Nothing for `branch` / `commit` / `codebase`. For `plan` scope: `.ai/workflows/<slug>/04-plan-<slice>.md` (or `04-plan.md` for compressed workflows) must exist. |
| Produces | A `type: workflow-index` slug workflow: `.ai/workflows/<slug>/01-simplify.md` (`type: simplify-run` — findings + per-finding routing assignments) + a lightweight `00-index.md`. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render via the retained simplify discovery.) |
| Next | One or more downstream commands the user runs based on the routing assignments (see the routing matrix in Step 4). |
| Does NOT | Write code, edit files outside its own artifact, commit, push, or open PRs. |
| Idempotent | Re-running with the same scope+target on an already-cleaned input is safe — agents will report "no findings" and the run artifact records that. |

# CRITICAL — execution discipline (orchestrator-not-fixer)
You are a **router**, not a problem-solver. This rule is the load-bearing constraint of the plugin and simplify obeys it like every other stage.
- Do NOT write code. Not one line. Not even a trivial typo fix.
- Do NOT commit, stage, push, or open PRs.
- Do NOT mutate any artifact file other than the ones you're authoring (`.ai/workflows/<slug>/01-simplify.md` + its `00-index.md`).
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

**Model for every dispatched agent:** `haiku`. REQUIRED on every `Task` call — fan-out reviewers must not silently inherit the parent's model. Each agent applies one rubric to a known scope and emits the structured `findings:` schema below; this is exactly the rubric-bound profile Haiku 4.5 handles cleanly.

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
| `route-fix` | `/wf intake fix "<short description>"` | Trivial mechanical cleanup, ≤1 file, no behaviour change. Typos, dead code, unnecessary comments, missing reuse of a tiny helper. |
| `route-refactor` | `/wf intake refactor "<area>"` | Behaviour-preserving restructure across multiple files. Copy-paste consolidation, abstraction extraction, leaky boundary fixup. |
| `route-intake` | `/wf intake "<feature description>"` | Substantive change with possible behaviour impact, or an architectural problem. New abstraction, API simplification, performance work that crosses tripwires. |
| `route-amend-plan` | `/wf-meta amend <slug> <slice>` | Plan-scope only. Finding flags an issue in the plan prose; apply the proposed delta via amend. |
| `route-amend-shape` | `/wf-meta amend <slug>` | Finding implicates the workflow's shaped spec (acceptance criteria, scope). Rare from simplify; arises when a plan-scope finding cascades up. |
| `route-verify` | `/wf verify <slug> <slice>` | Missing or inadequate test coverage for the change. Verify re-runs acceptance criteria and may surface deeper gaps. |
| `route-add-test` | `/wf intake fix "add test for <X>"` | Specific missing test you can add as a one-file fix. |
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

- Do not run `/wf intake fix` yourself. You print the suggested invocation; the user runs it.
- Do not stage or commit anything.
- Do not edit code files even to "fix" a trivial typo a finding flagged.
- Do not collapse multiple findings into one route just because they share a file. Each finding is independently classified.

---

# Step 5 — Write the run artifact + print routing suggestions

Standalone simplify is a **terminal analysis mode** — it roots a `type: workflow-index` slug workflow whose only artifact is the `01-simplify.md` lead. Derive a slug `simplify-<scope>-<YYYYMMDD>` (append `-2`/`-3` on collision), then write **two** files under `.ai/workflows/<slug>/` and register the slug in `.ai/workflows/INDEX.md` per [intake/default.md](default.md) Step 10. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render via the retained simplify discovery.)

First write **`00-index.md` — `type: workflow-index`** (lightweight; analysis modes do not get the heavy 22-field `type: index`):
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

Then write **`01-simplify.md` — `type: simplify-run`** (the lead carries a `slug` for the in-slug path; `run-id` stays for continuity):

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

### route-fix (`/wf intake fix`)
- `reuse-1` — &lt;suggested-invocation&gt; — &lt;rationale&gt;
- ...

### route-refactor (`/wf intake refactor`)
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

Re-running `/wf simplify <scope> <target>` with the same arguments offers to resume the most recent matching run if its `status` is `awaiting-input` (the user stepped away during triage). Resume picks up the AskUserQuestion accept/skip/defer cycle from the first un-triaged finding.

There is no "fixes-pending" state because simplify never applies fixes. The run artifact's `recommended-next` list is the persistent queue — the user works through it across as many sessions as they need by re-reading the artifact. Simplify's own work is done as soon as Step 5 writes.

If a `route-amend-plan` delta has not yet been applied, the simplify artifact reflects the *moment of triage*, not the *current state of the plan*. Re-run simplify on the plan scope to refresh the deltas after the plan changes — the new run gets a new `run-id`.

---

# Chat return contract

After writing the run artifact, return — lead with the substance first, then the receipt:
- **narrative:** a short prose paragraph (not bullets) telling the story of what this stage produced — what it *is* and how, the key decisions and counts, and the top risk or caveat. The router leads the chat summary with this paragraph; the fields below are the receipt beneath it.
- `scope: <scope>`
- `target: <target>`
- `run-id: <run-id>`
- `wrote: .ai/workflows/<slug>/01-simplify.md + 00-index.md`
- `findings: <N total>; accepted: <N>; skipped: <N>; deferred: <N>`
- `routes:` — one-line counts per route (`route-fix: N · route-refactor: N · route-intake: N · ...`)
- `recommended-next:` — the queue of suggested invocations, ordered by route priority (intake first, fix last). Each is copy-pasteable.

The user picks which to run. You do not run them yourself.

---

# Provenance + deliberate divergence from upstream

This sub-command **adapts** the Claude Code bundled `simplify` skill (see `.scratch/claude-code/src/skills/bundled/simplify.ts`) but **diverges deliberately** in one critical way:

| | Upstream Claude Code `simplify` | sdlc-workflow `/wf simplify` |
|---|---|---|
| Agent rubrics | Reuse, Quality, Efficiency | Same — kept verbatim |
| Dispatch shape | Three parallel sub-agents | Same |
| Action after findings | **Applies fixes directly** | **Routes findings to downstream commands; never writes code** |
| Output | Ephemeral chat summary | `.ai/workflows/<slug>/01-simplify.md` artifact (`type: simplify-run`) in a `type: workflow-index` slug workflow |

The divergence on action is intentional: every command in this plugin operates as an **orchestrator, not a problem-solver**. Plan plans; implement implements; review reviews. Simplify routes. If a finding deserves code action, the user invokes the appropriate downstream command (`/wf intake fix`, `/wf intake refactor`, `/wf intake`, etc.) — each of which runs its own discipline. That separation keeps the artifact trail clean and prevents simplify from becoming a back-door "I'll just write code" path that bypasses review, verify, or planning.

The agent rubrics are stable across the two implementations — if the upstream rubric evolves in Claude Code, update the rubric blocks above to match and bump the plugin's CHANGELOG.

---

## Additive-write contract — no rewrites; one slug workflow per run

Since the compressed-lifecycle migration (v9.86.0) a standalone `simplify-run`
**roots its own `type: workflow-index` slug workflow** — each invocation creates
a fresh `.ai/workflows/<slug>/` (`slug` = `simplify-<scope>-<YYYYMMDD>`) holding
`01-simplify.md` + `00-index.md`. There is no in-place rewrite scenario:

1. **Never overwrite an existing slug.** If the derived slug collides, append
   `-2`/`-3` and retry. Keep `run-id` in the lead frontmatter for continuity.
2. **Do not carry `revision-count`** in the simplify-run frontmatter. The lead
   is immutable at write time; subsequent runs author *new* slug workflows.
3. **Set `regenerable: false`** explicitly. The renderer treats simplify-run
   artifacts as historical evidence, not view-over-state.
4. **Cross-run linking is by `refs:`**, not by appending to prior files. If
   this run was triggered by a finding in an earlier run, the new run's
   `refs.prior-run` points to the earlier lead. The renderer surfaces this
   lineage as a backlink, not as a `## Revision <n>` chain.

The renderer emits each in-slug simplify-run at `.ai/_view/<slug>/simplify/INDEX.html`
(via the `01-simplify` path row). **Legacy** off-pipeline runs at
`.ai/simplify/<run-id>.md` still render at `.ai/_view/simplify/<run-id>/INDEX.html`
via the retained simplify discovery — old URLs stay stable.

---

## Step — Sibling YAML `simplify-run` (v9.22.0+, Phase 3)

When standalone-mode writes `.ai/workflows/<slug>/01-simplify.md`, write a sibling
`.ai/workflows/<slug>/01-simplify.yaml` next to it with `artifact: simplify-run`.
The view-layer renderer projects this YAML as a finding-table page — categorical
chips (reuse/quality/efficiency) instead of severity, optional code-deltas summary,
no verdict block. Without this YAML the page falls back to a plain frontmatter card.
(Legacy off-pipeline runs wrote the sibling at `.ai/simplify/<run-id>.yaml`.)

**Required whenever you write the `simplify-run` sibling YAML:** also write the
sibling `.html.fragment` next to it. First load
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` and follow
its wrapper, snippet, and verifier rules. The fragment must stay deterministic
from the sibling YAML (same YAML → byte-identical HTML) and pass
`scripts/verify-fragment.mjs` (Check 7) clean.

This step is **standalone-mode only.** In slug-mode the simplify findings
are written into a compressed slice (`type: slice`), which renders via
the slice template and does NOT consume a `simplify-run` sibling YAML.

Shape:

```yaml
# .ai/simplify/20260520T1430Z.yaml
artifact: simplify-run
run_id:   "20260520T1430Z"
scope:    branch          # branch | commit | plan | codebase
target:   "feat/checkout-v2..master"
rev:      1
model:    "claude-opus-4-7"
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
- One YAML per `.ai/simplify/<run-id>.md`. The MD's `id` / `category` /
  `action` per-finding stays the same as the YAML's — the body is a
  human-readable mirror, the YAML is the structured projection.
- `deltas[]` is optional. Include it when the run identified concrete
  file-level changes the downstream commands will likely make. Skip when
  the findings are advisory rather than transformational.
- `counts` is the authoritative tally — the renderer reads it directly
  rather than recomputing from `findings[]`. Keep them in sync.

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after flow, a state machine, an annotated mock, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../reference/narrative-fragments.md).
