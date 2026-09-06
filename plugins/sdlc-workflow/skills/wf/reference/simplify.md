---
description: Review-and-route triage utility. Dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency) across one of four scopes — branch (default), commit, plan, or codebase — classifies findings, and routes each to the appropriate downstream command (/wf intake fix, /wf intake refactor, /wf intake, /wf plan directed-fix, /wf docs, etc.). Never writes code directly. Adapted from the upstream bundled `simplify` skill but realigned to sdlc-workflow's orchestrator discipline.
argument-hint: "[branch [<base>] | commit <sha-or-range> | plan <slug> <slice> | codebase [<path>]]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf simplify`, a **review-and-route triage utility**. Three parallel sub-agents (Reuse, Quality, Efficiency) review one of four scopes; you classify each finding and route it to the appropriate downstream command. Not a lifecycle stage, not a workflow, not a fixer — a triage report that fans out.

# Slug-mode (read before proceeding)

If the `/wf` dispatcher selected **slug-mode** (first argument matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `_compressed-slice.md` for the exact slice frontmatter and index bookkeeping. Substantively:

- **One artifact, in the existing workflow** — *not* the standalone `.ai/simplify/<run-id>.md` location. Write `.ai/workflows/<slug>/03-slice-simplify-<descriptor>.md` (collision suffix `-2`, `-3` if needed; descriptor defaults to scope — e.g., `simplify-branch-2026-05-13` or `simplify-codebase-auth`). Frontmatter: `type: slice`, `slice-slug: simplify-<descriptor>`, `slice-type: simplify`, `compressed: true`, `origin: simplify`, `stage-number: 3`, `status: defined`, `complexity: xs`. Do not also write `.ai/simplify/<run-id>.md` — the compressed slice is the single output.
- **Same content, different home.** Body carries the same sections the standalone simplify would write (three-agent findings, per-finding classification, routing summary, routing assignments, proposed deltas), under a `# Compressed Slice: simplify` heading with a one-line provenance preamble. The `simplify-run` frontmatter fields (`findings-total`, `findings-reuse`, etc.) do not carry over — they belong to the standalone type. Report the same numbers in the body instead.
- **No new workflow, no new branch, no `01-simplify.md`, no `.ai/simplify/<run-id>.md`, no new top-level `00-index.md`.** The slug already owns the workflow context.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: simplify-<descriptor>, slice-type: simplify, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: simplify, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf simplify → compressed slice simplify-<descriptor> on <slug>` — plus the routing summary (counts per downstream command) and the top routing assignments, each scoped with `<slug>` as the first positional argument (e.g., `/wf intake refactor <slug> <target>`, `/wf plan <slug> <slice>`). Positional-slug form only — no `--slug` flag.

If slug-mode was not selected, ignore this section and proceed standalone.

# Pipeline
`1·resolve-scope` → `2·dispatch (3 sub-agents in parallel)` → `3·aggregate + triage` → `4·classify + route (assign each finding a downstream command)` → `5·write run artifact + print routing suggestions`

| | Detail |
|---|---|
| Requires | Nothing for `branch` / `commit` / `codebase`. For `plan` scope: `.ai/workflows/<slug>/04-plan-<slice>.md` (or `04-plan.md` for compressed workflows) must exist. |
| Produces | `.ai/workflows/<slug>/01-simplify.md` (`type: simplify-run` — findings + routing assignments) + lightweight `00-index.md` in a `type: workflow-index` slug workflow. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render.) |
| Next | One or more downstream commands the user runs based on the routing assignments (routing matrix in Step 4). |
| Does NOT | Write code, edit files outside its own artifact, commit, push, or open PRs. |
| Idempotent | Re-running the same scope+target on an already-cleaned input is safe — agents report "no findings" and the artifact records that. |

> **Auto second opinion (objective triggers).** After the routing matrix assigns each finding, **auto-invoke** `/consult codex <are any of these findings systematically misrouted — e.g. a route-fix that masks an architectural problem?>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) any architectural-smell finding was routed as a quick route-fix — the masking risk the panel exists to catch; (b) the matrix produced a judgment-call or tie routing; (c) findings touch security-adjacent code. Routing is otherwise deterministic from the matrix — skip when none of the triggers hold; the user may invoke it explicitly with any provider.

# Role
You are a **router**, not a problem-solver: resolve the scope before dispatch, complete triage before routing, and write the run artifact last.
- Do not write code — not one line, not even a trivial typo fix — and do not commit, stage, push, or open PRs.
- Do not mutate any artifact file other than the ones you're authoring (`.ai/workflows/<slug>/01-simplify.md` + its `00-index.md`); do not edit the workflow plan (plan scope) — write proposed deltas to your run artifact only.
- Do not read files outside the scope's diff/path set (branch = branch diff, commit = commit diff, plan = the named plan file only, codebase = the named path subtree only).
- If you catch yourself about to make a code edit, STOP. Route the finding; do not execute it yourself.

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
- `plan` — confirm the plan file exists. If missing, STOP: *"No plan found at `<path>`. Run `/wf plan <slug> <slice>` first or check the slug/slice arguments."*
- `codebase` — confirm path exists.

Record: `run-id` (UTC compact ISO-8601 `<yyyymmdd>T<hhmm>Z`, real time per [_timestamp.md](_timestamp.md)), `scope` (`branch | commit | plan | codebase`), and `target` (resolved target string for the artifact frontmatter).

---

# Step 1 — Assemble input

Per scope:

- **branch** — capture `git diff "$BASE...HEAD"` as `INPUT_DIFF`, where `BASE` is the given base or `git merge-base HEAD origin/<default-branch>`. Three-dot (`A...B`) = only what is new on HEAD relative to base.
- **commit** — capture `git show <sha>` (single sha) or `git diff <range>` (range) as `INPUT_DIFF`.
- **plan** — read the plan file in full. Agents review the plan's prose + structure, not a git diff. Capture as `INPUT_PLAN_TEXT`.
- **codebase** — walk the path subtree. Exclude `.git/`, `node_modules/`, `dist/`, `build/`, `.venv/`, and other generator output. Cap at ~500 files; if larger, ask the user to narrow. Agents read by-need rather than from a single blob.

---

# Step 1b — Harvest `sdlc-debt:` markers (the debt sweep)

Independent of the three agents, scan the scope for `sdlc-debt:` markers and fold them into the findings as **pre-classified** debt. These shortcuts were flagged with a ceiling + upgrade path (written by `/wf implement`), needing *routing* not *discovery* — agents find new issues; this step collects the ones already declared.

- **branch / commit:** grep `INPUT_DIFF` for `sdlc-debt:` — only markers added in the diff.
- **codebase:** grep the path subtree (`grep -rnE 'sdlc-debt:' <path>`, excluding `.git/`, `node_modules/`, `dist/`, `build/`) — the **repo-wide sweep** of the full debt backlog.
- **plan:** skip — plans carry no code markers.

For each marker, emit one finding in the **same `findings:` schema the agents use** (output contract in [simplify/_research.md](simplify/_research.md)):
- `id: debt-<n>`
- `severity:` from the ceiling's blast radius — `high` (correctness/security ceiling), `med` (default), `low` (cosmetic or marker that names no ceiling/upgrade-path → also note it is malformed).
- `location: <file:line>`
- `issue:` the ceiling named in the marker.
- `suggestion:` the upgrade path named in the marker.
- `rationale:` "Author-flagged `sdlc-debt:` marker harvested for routing."

Debt findings join the aggregate in **Step 3** and route through the **Step 4** matrix exactly like agent findings — typically `route-fix` (one-file ceiling), `route-refactor` (cross-file), or `route-intake` (architectural). In the sibling-YAML projection they carry **`category: quality`**; the run body notes which `quality` findings originated from a marker, and the chat summary reports the harvested count (e.g., `debt-markers-swept: <N>`). If the scope has no markers, record "No `sdlc-debt:` markers in scope" and continue.

---

# Step 2 — Dispatch three sub-agents in parallel

dispatch all three sub-agents in ONE parallel wave per [_subagents.md](_subagents.md). Sequential dispatch is forbidden — the three rubrics run as parallel read-only children.

Load [simplify/_research.md](simplify/_research.md). It holds the effort tier (**low**, REQUIRED on every dispatch), the inputs each agent receives, the `findings:` output contract, and the three charters: Agent 1 Code Reuse Review, Agent 2 Code Quality Review, Agent 3 Efficiency Review, each with its plan-scope adaptation. Give each agent exactly one charter.

---

# Step 3 — Aggregate + triage

Wait for all three agents. Build a combined findings list, grouped by severity then by agent.

Present the table to the user as gate questions per [_gate-question.md](_gate-question.md) (multi-select):

```
| ID | Severity | Agent | Location | Issue | Action |
| reuse-1 | high | Reuse | src/auth.ts:42 | New helper duplicates utils/hash.ts | accept | skip |
| quality-3 | med | Quality | src/ui/Box.tsx:18 | Wrapper Box with no layout effect | accept | skip |
```

**Default by severity** (user can override): `high / med / low` — accept; `nit` — skip.

Offer `accept / skip / defer` per finding. `accept` means include in routing assignments, not "fix it now". `defer` records the finding without assigning a downstream command.

False-positive handling: mark `skip` and add a one-line reason in the artifact. **Do not argue — skip and move on.**

---

# Step 4 — Classify + route

For each `accept` finding, assign a `route` based on what shape of follow-up work it deserves.

## Routing matrix

| Route | Downstream command | Use when |
|---|---|---|
| `route-fix` | `/wf intake fix "<short description>"` | Trivial mechanical cleanup, ≤1 file, no behaviour change. Typos, dead code, unnecessary comments, missing reuse of a tiny helper. |
| `route-refactor` | `/wf intake refactor "<area>"` | Behaviour-preserving restructure across multiple files. Copy-paste consolidation, abstraction extraction, leaky boundary fixup. |
| `route-intake` | `/wf intake "<feature description>"` | Substantive change with possible behaviour impact or architectural problem. New abstraction, API simplification, performance work crossing tripwires. |
| `route-amend-plan` | `/wf plan <slug> <slice> <correction>` | Plan-scope only. Finding flags an issue in the plan prose; apply the proposed delta as a directed plan fix (no in-place amend). |
| `route-amend-shape` | `/wf intake <slug> <scope>` | Finding implicates the shaped spec (acceptance criteria, scope). Rare from simplify; corrections land as a new slice (no in-place amend). |
| `route-verify` | `/wf verify <slug> <slice>` | Missing or inadequate test coverage. Verify re-runs acceptance criteria and may surface deeper gaps. |
| `route-add-test` | `/wf intake fix "add test for <X>"` | Specific missing test addable as a one-file fix. |
| `route-docs` | `/wf docs <primitive>` or noted for handoff | Doc gap. Handoff's Diátaxis handling usually picks this up; explicit route for standalone doc gaps. |
| `route-handoff-config` | Edit `00-index.md` `public-surface:` / `docs-mirror:` / `review-bots:` keys | Finding flags drift in surfaces handoff's T3.6/T3.7/T5.1 cares about — fix is project-level config, not code. |
| `route-noop` | — | Informational; recorded but no action. |

## Classification rules

Pick the **smallest scope that fully addresses** each accepted finding. Bias toward `route-fix` over `route-refactor` over `route-intake` — never escalate beyond what the finding deserves.

Tie-breakers:
- Mechanical AND ≤1 file → `route-fix`.
- Spans multiple files AND behaviour-preserving → `route-refactor`.
- Could break behaviour or change a public API → `route-intake` (full shape + plan + review).
- Plan-scope → `route-amend-plan` only (plans versioned via amend, never direct edit).
- "This code needs a test" → `route-add-test` (straightforward) or `route-verify` (deeper gap).

## What to record per accepted finding

Record one `routing-assignments` entry per accepted finding: `finding-id`, `route`, `suggested-invocation`, `rationale`. For `plan` scope, every accepted finding gets `route: route-amend-plan` AND a `proposed-delta` block (plan-section, current, proposed, rationale) that the user applies via amend. Both block shapes are in [simplify/_artifact.md](simplify/_artifact.md).

## What you do NOT do

- Do not run `/wf intake fix` yourself — print the invocation; the user runs it.
- Do not stage or commit anything.
- Do not edit code files even to fix a trivial typo a finding flagged.
- Do not collapse multiple findings into one route because they share a file — each is classified independently.

---

# Step 5 — Write the run artifact + print routing suggestions

Standalone simplify is a **terminal analysis mode** rooting a `type: workflow-index` slug workflow. Derive `simplify-<scope>-<YYYYMMDD>` (append `-2`/`-3` on collision), write **two** files under `.ai/workflows/<slug>/`, and register the slug in `.ai/workflows/INDEX.md` per [intake/default.md](intake/default.md) Step 10. (Legacy off-pipeline `.ai/simplify/<run-id>.md` runs still render.)

1. Write `00-index.md` (`type: workflow-index`, lightweight) from the template in [simplify/_artifact.md](simplify/_artifact.md).
2. Write `01-simplify.md` (`type: simplify-run`) from the template in the same file: frontmatter counts, `routing-summary`, `routing-assignments`, `proposed-deltas`, then the body sections from **The Triage** to **Recommended next commands**.
3. Follow the additive-write contract in the same file: never overwrite an existing slug, no `revision-count`, `regenerable: false`, cross-run links by `refs:`.
4. Write the sibling `01-simplify.yaml` with `artifact: simplify-run` (shape and authoring rules in the same file). The renderer projects it as a finding-table page; without it the page falls back to a plain frontmatter card.
5. Write the sibling `.html.fragment` for that YAML. Load `_fragment-authoring.md` and follow its wrapper, snippet, and verifier rules. The fragment must be deterministic from the YAML (same YAML → byte-identical HTML) and pass `scripts/verify-fragment.mjs` (Check 7).

**Standalone-mode only.** In slug-mode the findings live in a compressed slice (`type: slice`), which renders via the slice template and does not consume a `simplify-run` sibling YAML.

After writing, print the **Recommended next commands** list to chat.

---

# Resume semantics

Re-running with the same arguments offers to resume the most recent matching run if its `status` is `awaiting-input`. Resume picks up from the first un-triaged finding. There is no "fixes-pending" state — simplify never applies fixes. The `recommended-next` list is the persistent queue; the user works through it across sessions. Simplify's work is done as soon as Step 5 writes. If a `route-amend-plan` delta has not yet been applied, the artifact reflects the *moment of triage*, not the current plan state. Re-run on the plan scope to refresh deltas — the new run gets a new `run-id`.

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

# Provenance

`/wf simplify` adapts the upstream bundled `simplify` skill and diverges in one way: it routes findings and never writes code. The comparison table and the rubric-sync rule are in [simplify/_research.md](simplify/_research.md).

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell. Follow [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) **Step F2** (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
