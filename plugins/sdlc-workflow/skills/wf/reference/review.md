---
description: The single review surface — workflow stage AND ad-hoc, resolved by the first token (like `/wf simplify`). `/wf review <slug>` runs the lifecycle review STAGE (stage 7 of 10) — reads workflow artifacts + diff, dispatches one sub-agent per selected dimension, and maintains an ACCUMULATING LEDGER (re-runs dedupe + merge in place, mark cleared findings resolved, never overwrite). `/wf review <dimension>` runs one rubric inline and `/wf review sweep <aggregate>` fans out one reviewer per dimension — the AD-HOC path (no slug), absorbing the former standalone review skill. Re-run the stage with "triage" to revisit deferred findings.
argument-hint: "<slug> [slice | triage] | <dimension> | sweep <aggregate>"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `wf-review`, **stage 7 of 10** in the SDLC lifecycle.

# Step 00 — Resolve scope: workflow stage vs ad-hoc (MANDATORY, before everything)

`/wf review` is the single review surface — it spans the **workflow stage** (a slug) and **ad-hoc**
review (a dimension or a sweep, no slug), the way `/wf simplify` unifies its scopes. This absorbed the
former standalone `sdlc-workflow:review` skill. Resolve the first token BEFORE any stage logic:

1. **Exact slug match** — `.ai/workflows/<token>/00-index.md` exists → **stage mode**. **Read
   `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/_stage.md` in full now and follow it verbatim** —
   it carries the whole stage body (preamble table, TRIAGE MODE, Step 0 orient, the accumulating-ledger
   dispatch, fix loop, artifact templates). The optional second token is `<slice>` or `triage`, exactly as before.
2. **`sweep` or a known dimension/aggregate key** (no slug matched) → **ad-hoc mode**. Jump to the
   `# Ad-hoc review (no slug)` section below. Dimension keys and aggregate keys are listed there.
   Ad-hoc never loads the stage body.
3. **A dimension name that also happens to be a real slug** → the slug wins (stage mode); reach the
   aggregate/dimension explicitly with `/wf review sweep <name>` or by running ad-hoc in a repo with no
   such slug. (This is the documented first-token ambiguity resolution.)
4. **Neither a slug nor a known dimension/sweep** → the existing unknown handling: if it looks like a
   typo'd slug, say so; otherwise render the ad-hoc menu and ask which review the user wants.

Because `review` owns its own first-token resolution, it is **excluded from the dispatcher's Step 0.5
fuzzy-suggest** (like `simplify`/`design`).

# Ad-hoc review (no slug)

Reached from Step 00 branch 2 — the former standalone `sdlc-workflow:review` skill. Two modes over one of five scopes (`pr` / `worktree` / `diff` / `file` / `repo`); parse the scope + target from the remaining tokens (a PR URL/number, a commit range, a file path, or bare = repo/worktree). Ad-hoc runs write **no** `07-review*` artifact — findings return inline (the numbered stage artifacts belong to slug mode).

**Dimension keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/<key>.md`:

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`, `code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`, `frontend-accessibility`, `frontend-performance`, `infra`, `infra-security`, `interface-craft`, `logging`, `maintainability`, `migrations`, `motion`, `observability`, `overengineering`, `performance`, `privacy`, `refactor-safety`, `release`, `reliability`, `scalability`, `security`, `style-consistency`, `supply-chain`, `testing`, `ux-copy`.

**Aggregate keys** (reached via `/wf review sweep <aggregate>`) — each dispatches one reviewer sub-agent per dimension in its composition:

| Aggregate | Dimensions |
|---|---|
| `all` | every dimension (~33 sub-agents — broadest, most expensive) |
| `architecture` | architecture, performance, scalability, api-contracts |
| `infra` | infra, ci, release, migrations, logging, observability |
| `pre-merge` | correctness, testing, security, refactor-safety, maintainability |
| `quick` | correctness, style-consistency, dx, ux-copy, overengineering |
| `security` | security, privacy, infra-security, data-integrity, supply-chain |
| `ux` | accessibility, frontend-accessibility, frontend-performance, interface-craft, motion, ux-copy |

`architecture`, `infra`, and `security` exist as BOTH a dimension and an aggregate — a bare `/wf review <name>` is the dimension; `/wf review sweep <name>` is the aggregate.

## Single-dimension execution
1. Read the rubric in full from `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/<key>.md` and follow it verbatim (its `args:` frontmatter describes how it consumes scope/target/paths).
2. Run the rubric inline over the resolved scope. Return findings in the standard schema (severity + confidence + file:line + evidence + suggested fix).

## Sweep execution (parallel sub-agent dispatch)
1. Resolve the composition from the aggregate table above.
2. Prepare ONE `Task` per dimension D: `subagent_type: general-purpose`; `model: haiku` for every dimension EXCEPT `architecture`/`refactor-safety`/`security` which use `sonnet` (pass it explicitly — reviewers must not inherit the parent model); `description: "review-{D}"`; `prompt` = the rubric body from `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/{D}.md` + the concrete scope/target/paths + the standard findings-schema + output instruction (return inline; no artifact in ad-hoc mode).
3. **Dispatch in parallel** — one assistant message with all N Task calls (sequential dispatch is forbidden).
4. Wait for all to return, then **synthesize**: collect findings; dedupe by `(file:line + root cause)` (keep the most specific severity, merge rationales, tag with both dimensions); normalize severity to BLOCKER/HIGH/MED/LOW/NIT (map any other scale first); triage BLOCKER+HIGH interactively via AskUserQuestion (accept / defer / reject); derive the verdict (Ship = no blocker/high · Ship with caveats = high only · Don't ship = any blocker).

## Output + final summary
Render the review report (verdict · reviewed scope/target · files ± · findings by severity · critical block · triage decisions), then emit the standard compact chat summary: verb-first first line (`review <mode> complete: <key> on <scope>/<target>`), a short narrative paragraph, `Artifacts: none` (ad-hoc returns inline), `Verdict:`, `Findings: BLOCKER n | HIGH n | MED n | LOW n | NIT n`, and `Next:` (a concrete command tied to the verdict, or `Done`).
