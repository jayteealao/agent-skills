# Ad-hoc review (no slug)

Load this file from `review.md` Step 00 branch 2 only. A stage run (a slug) never loads it. Two modes over one of five scopes (`pr` / `worktree` / `diff` / `file` / `repo`); parse the scope + target from the remaining tokens (a PR URL/number, a commit range, a file path, or bare = repo/worktree). Ad-hoc runs write **no** `07-review*` artifact — findings return inline (the numbered stage artifacts belong to slug mode).

**Rubric keys** — each resolves to `review/<key>.md`. A rubric sections its checks by alias (`### <alias>` under `# What to look for`), and `focus` selects a section:

| Rubric | Invocation | Sections (aliases) |
|---|---|---|
| `correctness` | `/wf review correctness` | correctness, testing, metric-gaming, data-integrity, backend-concurrency, reliability |
| `security` | `/wf review security` | security, infra-security, supply-chain, privacy |
| `performance` | `/wf review performance` | performance, frontend-performance, scalability, cost |
| `architecture` | `/wf review architecture` | architecture, maintainability, overengineering, code-simplification, style-consistency, refactor-safety |
| `api-contracts` | `/wf review api-contracts` | api-contracts, migrations |
| `accessibility` | `/wf review accessibility` | accessibility, frontend-accessibility |
| `interface-craft` | `/wf review interface-craft` | interface-craft, motion |
| `docs` | `/wf review docs` | docs, ux-copy |
| `observability` | `/wf review observability` | observability, logging |
| `infra` | `/wf review infra` | infra, ci, release, dx |
| `intent-fidelity` | `/wf review intent-fidelity` | intent-fidelity |

**Alias keys** — each alias below is a valid dimension name. An alias resolves to its rubric with `focus: <alias>`: the reviewer reads that section plus `# Severity calibration`, so `/wf review logging` reviews only that section. The 24 aliases: `/wf review testing`, `/wf review metric-gaming`, `/wf review data-integrity`, `/wf review backend-concurrency`, `/wf review reliability`, `/wf review infra-security`, `/wf review supply-chain`, `/wf review privacy`, `/wf review frontend-performance`, `/wf review scalability`, `/wf review cost`, `/wf review maintainability`, `/wf review overengineering`, `/wf review code-simplification`, `/wf review style-consistency`, `/wf review refactor-safety`, `/wf review migrations`, `/wf review frontend-accessibility`, `/wf review motion`, `/wf review ux-copy`, `/wf review logging`, `/wf review ci`, `/wf review release`, `/wf review dx`.

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
2. Prepare ONE dispatch per dimension D: read-only children per [_subagents.md](../_subagents.md) at **low** effort for every rubric EXCEPT `architecture`/`security`, which run at **medium** (set the tier explicitly — reviewers must not inherit the parent configuration); `description: "review-{D}"`; `prompt` = the rubric body from `review/{D}.md` (with `focus:` when the aggregate names one) + the concrete scope/target/paths + the standard findings-schema + output instruction (return inline; no artifact in ad-hoc mode).
3. **Dispatch in parallel** — all N dispatches in one wave, waves of ≤6 per [_subagents.md](../_subagents.md) (sequential dispatch is forbidden).
4. Wait for all to return, then **synthesize**: collect findings; dedupe by `(file:line + root cause)` (keep the most specific severity, merge rationales, tag with both dimensions); normalize severity to BLOCKER/HIGH/MED/LOW/NIT (map any other scale first); triage BLOCKER+HIGH interactively as a gate question per [_gate-question.md](../_gate-question.md) — present each finding with its text + impact + suggested fix; the user chooses accept (will fix), defer (acknowledge but ship), or reject (false positive); derive the verdict (Ship = no blocker/high · Ship with caveats = high only · Don't ship = any blocker).

## Output + final summary
Render the review report (verdict · reviewed scope/target · files ± · findings by severity · critical block · triage decisions), then emit the standard compact chat summary: verb-first first line (`review <mode> complete: <key> on <scope>/<target>`), a short narrative paragraph, `Artifacts: none` (ad-hoc returns inline), `Verdict:`, `Findings: BLOCKER n | HIGH n | MED n | LOW n | NIT n`, and `Next:` (a concrete command tied to the verdict, or `Done`).
