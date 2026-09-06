---
description: The single review surface — workflow stage AND ad-hoc, resolved by the first token (like `/wf simplify`). `/wf review <slug>` runs the lifecycle review STAGE (stage 7 of 10) — reads workflow artifacts + diff, dispatches one sub-agent per selected dimension, and maintains an ACCUMULATING LEDGER (re-runs dedupe + merge in place, mark cleared findings resolved, never overwrite). `/wf review <dimension>` runs one rubric inline and `/wf review sweep <aggregate>` fans out one reviewer per dimension — the AD-HOC path (no slug). Re-run the stage with "triage" to revisit deferred findings.
argument-hint: "<slug> [slice | triage] | <dimension> | sweep <aggregate>"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

> **Ground findings in the real source (both modes).** Before asserting that code misuses a
> dependency, framework, or SDK — wrong signature, unhandled edge case, a call that "can't
> work," a security claim about a library's behavior — invoke the `study-sources` skill to
> read its **actual installed source** (`node_modules`, `~/.m2`, the Go/Rust/NuGet caches,
> Android SDK `sources/`, …) and confirm the defect against the version the project resolved.
> A finding grounded in the real implementation beats one grounded in a recalled API — the
> latter is exactly where plausible-but-wrong review comments come from. This holds in **both**
> stage mode and ad-hoc dimension/sweep mode; inject the same instruction into every reviewer
> sub-agent you dispatch. Read-only — reads land in gitignored `.scratch/`, never in the review
> artifact or the diff.

You are running `/wf review`, **stage 7 of 10** in the SDLC lifecycle.

# Step 00 — Resolve scope: workflow stage vs ad-hoc (mandatory, before everything)

`/wf review` is the single review surface — it spans the **workflow stage** (a slug) and **ad-hoc**
review (a dimension or a sweep, no slug), the way `/wf simplify` unifies its scopes. This absorbed the
former standalone `review` skill. Resolve the first token BEFORE any stage logic:

1. **Exact slug match** — `.ai/workflows/<token>/00-index.md` exists → **stage mode**. **Read
   `review/_stage.md` in full now and follow it exactly** —
   it carries the whole stage body (preamble table, TRIAGE MODE, Step 0 orient, the accumulating-ledger
   dispatch, fix loop, artifact templates). The optional second token is `<slice>` or `triage`, exactly as before.
2. **`sweep` or a known rubric/alias/aggregate key** (no slug matched) → **ad-hoc mode**. Jump to the
   `# Ad-hoc review (no slug)` section below. Rubric keys, alias keys, and aggregate keys are listed there.
   Ad-hoc never loads the stage body.
3. **A dimension name that also happens to be a real slug** → the slug wins (stage mode); reach the
   aggregate/dimension explicitly with `/wf review sweep <name>` or by running ad-hoc in a repo with no
   such slug. (This is the documented first-token ambiguity resolution.)
4. **Neither a slug nor a known dimension/sweep** → the existing unknown handling: if it looks like a
   typo'd slug, say so; otherwise render the ad-hoc menu and ask which review the user wants.

Because `review` owns its own first-token resolution, it is **excluded from the dispatcher's Step 0.5
fuzzy-suggest** (like `simplify`/`design`).

# Ad-hoc review (no slug)

Reached from Step 00 branch 2. Two modes over one of five scopes (`pr` / `worktree` / `diff` / `file` / `repo`); parse the scope + target from the remaining tokens (a PR URL/number, a commit range, a file path, or bare = repo/worktree). Ad-hoc runs write **no** `07-review*` artifact — findings return inline (the numbered stage artifacts belong to slug mode).

**Rubric keys** — each resolves to `review/<key>.md`. A rubric sections its checks by alias (`### <alias>` under `# What to look for`), and `focus` selects a section:

| Rubric | Invocation | Sections (aliases) |
|---|---|---|
| `correctness` | `/wf review correctness` | correctness, testing, data-integrity, backend-concurrency, reliability |
| `security` | `/wf review security` | security, infra-security, supply-chain, privacy |
| `performance` | `/wf review performance` | performance, frontend-performance, scalability, cost |
| `architecture` | `/wf review architecture` | architecture, maintainability, overengineering, code-simplification, style-consistency, refactor-safety |
| `api-contracts` | `/wf review api-contracts` | api-contracts, migrations |
| `accessibility` | `/wf review accessibility` | accessibility, frontend-accessibility |
| `interface-craft` | `/wf review interface-craft` | interface-craft, motion |
| `docs` | `/wf review docs` | docs, ux-copy, ste-compliance |
| `observability` | `/wf review observability` | observability, logging |
| `infra` | `/wf review infra` | infra, ci, release, dx |
| `intent-fidelity` | `/wf review intent-fidelity` | intent-fidelity |

**Alias keys** — every former dimension name stays valid. An alias resolves to its rubric with `focus: <alias>`: the reviewer reads that section plus `# Severity calibration`, so `/wf review logging` stays as narrow as before. The 24 aliases: `/wf review testing`, `/wf review data-integrity`, `/wf review backend-concurrency`, `/wf review reliability`, `/wf review infra-security`, `/wf review supply-chain`, `/wf review privacy`, `/wf review frontend-performance`, `/wf review scalability`, `/wf review cost`, `/wf review maintainability`, `/wf review overengineering`, `/wf review code-simplification`, `/wf review style-consistency`, `/wf review refactor-safety`, `/wf review migrations`, `/wf review frontend-accessibility`, `/wf review motion`, `/wf review ux-copy`, `/wf review ste-compliance`, `/wf review logging`, `/wf review ci`, `/wf review release`, `/wf review dx`.

**Aggregate keys** (reached via `/wf review sweep <aggregate>`) — each dispatches one reviewer sub-agent per rubric in its composition:

| Aggregate | Rubrics |
|---|---|
| `all` | every rubric (11 sub-agents — broadest, most expensive) |
| `architecture` | architecture, performance, api-contracts |
| `infra` | infra, observability, api-contracts |
| `pre-merge` | correctness, security, architecture |
| `quick` | correctness, architecture, docs |
| `security` | the `security` rubric, all four sections (one sub-agent) |
| `ux` | accessibility, interface-craft, docs, performance (focus frontend-performance) |

`architecture`, `infra`, and `security` exist as BOTH a rubric and an aggregate — a bare `/wf review <name>` is the rubric; `/wf review sweep <name>` is the aggregate.

## Single-rubric execution
1. Resolve the key. A rubric key reads `review/<key>.md` in full; an alias reads its rubric's `### <alias>` section plus `# Severity calibration` (`focus: <alias>`). Follow the rubric exactly; the scope, target, and paths come from the ad-hoc tokens.
2. Run the rubric inline over the resolved scope. Return findings in the standard schema (severity + confidence + file:line + evidence + suggested fix).

## Sweep execution (parallel sub-agent dispatch)
1. Resolve the composition from the aggregate table above.
2. Prepare ONE dispatch per dimension D: read-only children per [_subagents.md](_subagents.md) at **low** effort for every rubric EXCEPT `architecture`/`security`, which run at **medium** (set the tier explicitly — reviewers must not inherit the parent configuration); `description: "review-{D}"`; `prompt` = the rubric body from `review/{D}.md` (with `focus:` when the aggregate names one) + the concrete scope/target/paths + the standard findings-schema + output instruction (return inline; no artifact in ad-hoc mode).
3. **Dispatch in parallel** — all N dispatches in one wave, waves of ≤6 per [_subagents.md](_subagents.md) (sequential dispatch is forbidden).
4. Wait for all to return, then **synthesize**: collect findings; dedupe by `(file:line + root cause)` (keep the most specific severity, merge rationales, tag with both dimensions); normalize severity to BLOCKER/HIGH/MED/LOW/NIT (map any other scale first); triage BLOCKER+HIGH interactively as a gate question per [_gate-question.md](_gate-question.md) — present each finding with its text + impact + suggested fix; the user chooses accept (will fix), defer (acknowledge but ship), or reject (false positive); derive the verdict (Ship = no blocker/high · Ship with caveats = high only · Don't ship = any blocker).

## Output + final summary
Render the review report (verdict · reviewed scope/target · files ± · findings by severity · critical block · triage decisions), then emit the standard compact chat summary: verb-first first line (`review <mode> complete: <key> on <scope>/<target>`), a short narrative paragraph, `Artifacts: none` (ad-hoc returns inline), `Verdict:`, `Findings: BLOCKER n | HIGH n | MED n | LOW n | NIT n`, and `Next:` (a concrete command tied to the verdict, or `Done`).
