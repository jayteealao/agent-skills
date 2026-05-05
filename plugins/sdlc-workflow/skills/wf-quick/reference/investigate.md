---
description: Investment discovery workflow. Surveys a codebase domain for improvement opportunities using parallel sub-agents, ranks candidates by estimated ROI, and recommends a next command for the highest-value investment. Does NOT commit to building anything and does NOT write application code. Synthesizes a minimal 02-shape.md for the top candidate so /wf-quick intake or /wf-quick quick can continue without re-investigation.
argument-hint: <domain-or-description>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-investigate`, an **investment discovery workflow** that surveys a domain for improvement opportunities, ranks them, and recommends a next command — without committing to build anything.

# Pipeline
`1·surface` → `2·investigate` → `3·rank` → `/wf-quick intake` | `/wf-quick quick` | `/wf-quick discover`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a domain description or an existing slug to resume. |
| Produces | `01-investigate.md` (ranked candidates), `02-shape.md` (forwarding contract for top candidate), `00-index.md` |
| Skips | No fix, no plan, no implementation. The investigation *is* the output. |
| Next | `/wf-quick intake <description>` (medium/large investment), `/wf-quick quick <description>` (small investment), `/wf-quick discover <problem>` (when problem itself is unvalidated) |
| Escalate | If all candidates are low-confidence AND no runtime data exists → recommend `/wf profile <area>` or `/wf benchmark <slug>` to gather quantitative data first |

# CRITICAL — investigation discipline
You are a **diagnostician and investment analyst**, not a planner or implementer.
- The **only** acceptable output is the investigation artifact, the synthesized shape for the top candidate, and the index. Do NOT edit application code. Do NOT write a plan. Do NOT propose specific implementation steps.
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, codebase analysis, and static code inspection.
- The "Suggested approach" in each candidate section is **direction, not a plan** — 1 to 3 lines naming the area and technique. Do not enumerate implementation steps.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: investigate` → **resume mode**. Read that index. If `01-investigate.md` is complete, tell the user and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new investigation**. Derive a slug: `investigate-<short-domain>` (kebab-case, max 5 words, e.g., `investigate-checkout-performance`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `investigate` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-meta resume <slug>` to continue the existing workflow." Stop.
3. **Branch posture (do NOT switch branches):**
   - Investigation is read-only — do not create or switch branches.
   - Record the current branch in the index as `branch` and `base-branch`.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape.
   - Skim `.ai/workflows/*/00-index.md` filenames to spot related active workflows.

# Step 1 — Domain scoping
Ask at most **3 questions** — stop as soon as you have enough to investigate:

1. **What domain?** — Which area of the codebase, system layer, or concern? (e.g., "checkout flow", "API response times", "test suite", "dependency graph"). Required if not clear from `$ARGUMENTS`.
2. **What type of opportunity?** — `performance` | `reliability` | `tech-debt` | `feature-gap` | `scaling` | `dx` (developer experience). Determines which sub-agent lenses to use.
3. **Any constraints?** — Timeline (weeks/months), team size, technology boundaries, or areas explicitly off-limits.

If `$ARGUMENTS` contains enough detail to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Parallel investigation
Launch all three sub-agents simultaneously. Do not proceed to synthesis until all complete.

### Explore sub-agent 1 — Hotpath & bottleneck survey

Prompt with ALL of the following:
- Identify the files and functions in the target domain. Read the 5 most recently modified files in that area (`git log --oneline --since="90 days ago" -- <domain-path>`) to understand recent activity.
- Look for these patterns and flag with evidence at `file:line`:
  - Nested loops iterating the same collection
  - Synchronous I/O (file, network, DB) inside request handlers or loops
  - N+1 query patterns (DB call inside a loop, ORM relation access in a loop)
  - Sort or regex applied repeatedly to the same data
  - Unbounded list/map growth without capacity hints
  - Missing caching on expensive operations called repeatedly
  - Deep synchronous call chains (>8 frames) in latency-sensitive paths
- Run `git log --oneline -30` on the domain path and flag files with high churn (changed >5 times in 90 days) — churn is a proxy for instability.
- Check for any profiling/benchmark files already in the repo (`*.bench.ts`, `*_bench_test.go`, `conftest.py --benchmark`, `criterion`) — if they exist, read them and note what was already measured.

Return as structured text:
- `hotspot_files`: list of `path` with one-line reason
- `suspected_bottlenecks`: list of `{file:line, pattern, severity: high|medium|low}`
- `churn_signals`: list of files changed >5x in 90 days
- `existing_benchmarks`: list of benchmark files found (or "none")

### Explore sub-agent 2 — Opportunity surface

Prompt with ALL of the following:
- Search for `TODO`, `FIXME`, `HACK`, `XXX`, `OPTIMIZE`, `PERF`, `SLOW`, `TEMP`, `DEPRECATED` comments in the domain path. For each, note the file:line and the comment text.
- Identify deprecated API usage: scan for calls to functions/modules marked `@deprecated`, `// deprecated`, or where the caller is the only remaining user of a function.
- Check test coverage signals: identify large files (>200 lines) with no corresponding test file — these are high-risk areas for any change.
- Look for error-handling gaps: catch-all `catch (e) {}`, bare `except: pass`, swallowed panics, missing error return checks.
- Scan for outdated dependency usage: check `package.json` / `go.mod` / `requirements.txt` for packages with known major version gaps or deprecations.

Return as structured text:
- `tech_debt_items`: list of `{type, file:line, description, severity: high|medium|low}`
- `coverage_gaps`: list of files with no test coverage
- `error_handling_gaps`: list of `file:line` with description
- `dependency_signals`: list of packages with gaps (or "none found")

### Explore sub-agent 3 — ROI estimation

Prompt with ALL of the following:
- For each item in sub-agent 1's `suspected_bottlenecks` and sub-agent 2's `tech_debt_items`, estimate:
  - **Effort**: `small` (≤3 files, ≤5 steps, no new dependency, no schema change), `medium` (4–10 files, or new dependency, or config change), `large` (>10 files, or architecture change, or migration, or cross-team coordination)
  - **Impact**: `low` (internal tooling, rare path, cosmetic), `medium` (affects a common path, improves dev velocity, reduces error rate), `high` (affects user-facing latency or reliability on a critical path, unblocks growth)
  - **ROI score**: `high` (high impact, small/medium effort), `medium` (medium impact, small effort OR high impact, large effort), `low` (low impact any effort)
- Identify the top 5 candidates by ROI score.
- For the top candidate, recommend a routing: `/wf-quick quick` if effort=small, `/wf-quick intake` if effort=medium+, `/wf-quick discover` if the problem is still unvalidated (no clear user or business signal).

Return as structured text:
- `ranked_candidates`: list of `{id, area, type, effort, impact, roi_score, routing_recommendation, one_line_rationale}`
- `top_candidate`: the highest-ROI item with full detail

# Step 3 — Synthesize and write `01-investigate.md`

Merge findings from the sub-agents. **Do not invent candidates the agents did not surface.** If agents disagree on a candidate's severity, record both assessments and note the uncertainty.

**`01-investigate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: investigate
slug: <slug>
workflow-type: investigate
domain: <area investigated>
investigation-type: <performance|reliability|tech-debt|feature-gap|scaling|dx>
top-candidate: <id of top-ranked candidate>
candidate-count: <N>
recommended-next: </wf-quick intake|/wf-quick quick|/wf-quick discover>
confidence: <high|medium|low>
status: ready-for-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Domain & investigation scope

What was surveyed, what was deliberately excluded, and any constraints from Step 1. ≤3 sentences.

## 2. Candidates

A ranked table of all identified opportunities:

| Rank | Area | Type | Effort | Impact | ROI | File:line | Routing |
|------|------|------|--------|--------|-----|-----------|---------|
| 1 | <area> | <type> | <effort> | <impact> | <high/med/low> | <path:line> | `/wf-quick intake` or `/wf-quick quick` |

List up to 10 candidates. Below rank 5, summarize without deep-dives.

## 3. Top 3 deep-dives

One subsection per candidate for ranks 1–3:

### Candidate N: <name>

- **Area:** `file:line` — one-line description
- **Mechanism:** What is happening and why it matters. ≤3 sentences. Must cite specific code location.
- **Evidence:** 2–4 bullets, each citing `file:line`.
- **Suggested approach:** 1–3 lines naming the technique and area. NOT implementation steps.
- **Effort:** small | medium | large (with one-line justification)
- **Impact:** low | medium | high (with one-line justification)
- **Routing:** `/wf-quick quick <description>` or `/wf-quick intake <description>`

## 4. Routing recommendation

Pick **one** primary recommendation based on the top candidate. State it clearly with one sentence of justification. Then list alternatives for other top candidates.

Routing logic:

| Conditions | Recommendation |
|---|---|
| Top candidate: `effort: small`, `impact: medium+`, mechanism is clear | `/wf-quick quick <description>` |
| Top candidate: `effort: medium+` OR architecture change OR schema change | `/wf-quick intake <description>` |
| All candidates `confidence: low` OR no user/business signal found | `/wf-quick discover <problem>` — validate the problem before investing |
| `investigation-type: performance` AND no runtime data exists | Add note: run `/wf profile <area>` to sharpen estimates before proceeding |

## 5. Confidence & data gaps

- **Confidence:** high | medium | low — one sentence justifying.
- **What we could not see:** absence of runtime data, missing profiling, no user metrics, unknown traffic distribution.
- **What would sharpen this:** specific tools or data sources that would improve the ranking.

## 6. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the investigation. Tripwires:

- **No-signal domain:** No bottlenecks, tech debt, or opportunities found — domain may be in good shape, or the scope was too narrow.
- **All candidates low-confidence:** Static analysis only, no runtime data, all claims are speculative.
- **Bug found:** Investigation surfaced a defect, not an opportunity — route to `/wf-quick rca` instead of an investment workflow.
- **Scope explosion:** Sub-agents returned >20 candidates — surface that prioritization help is needed; do not list all 20.
- **Concurrent work conflict:** An open PR or active workflow already addresses the top candidate.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`. Then add a single closing line:

> One or more wf-investigate tripwires fired. The investigation is still valid, but review the warnings before routing to a downstream command.

# Step 4 — Synthesize `02-shape.md`

Write a minimal `02-shape.md` for the **top candidate only**, so `/wf-quick intake <slug>` or `/wf-quick quick <slug>` can consume the workflow directory without modification. This file is a *forwarding contract*, not a full shape.

**`02-shape.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
workflow-type: investigate
status: ready
derived-from: 01-investigate.md
top-candidate: <candidate id>
created-at: <timestamp>
---
```

**Body:**
```markdown
# Shape (synthesized from investigation)

This shape was generated by `/wf-quick investigate` from the top-ranked candidate in `01-investigate.md`. Read that file for full context, rankings, and rationale.

## Problem

<one paragraph: what the top candidate is, why it matters, what the mechanism is>

## Scope (in)

<1-3 bullets from the candidate's "Suggested approach" section — the area, technique, and files likely in scope>

## Scope (out)

- Lower-ranked candidates from this investigation (address separately if desired).
- Candidates ranked 4–N — these require their own scoping decision before starting.
- Application changes outside the area identified in this candidate.

## Acceptance criteria

- <one criterion per bullet — each must be objectively verifiable. Derive from the candidate's mechanism and impact claim.>

## Open questions

<list anything the investigation could not resolve — or "none">
```

# Step 5 — Write `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: investigate
current-stage: routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: <recommended-next>
next-invocation: <recommended-next-with-description>
recommended-routes:
  primary: <command with description>
  alternates: [<command>, <command>]
augmentations: []
open-questions: []
progress:
  - investigate: complete
  - shape-synthesized: complete
created-at: <timestamp>
---
```

Body: one-line description + pointer to `01-investigate.md` and the routing recommendation.

# Step 6 — Hand off to user

Emit a compact chat summary, no more than 12 lines:

```
wf-investigate complete: <slug>
Domain: <area> (<investigation-type>)
Candidates found: <N>
Top candidate: <area> — effort:<X> impact:<Y> roi:<Z>
Confidence: <level>
Tripwires: <none | comma-separated list>
Recommended next: <command with description> — <one-sentence justification>
Alternates: <comma-separated list>
Investigation artifact: .ai/workflows/<slug>/01-investigate.md
```

If all candidates are `low-confidence`, prefix with:

> ⚠ All candidates are low-confidence (static analysis only, no runtime data). Consider `/wf profile <area>` or running existing benchmarks before routing to an investment workflow.

# Routing notes

- **`/wf-quick intake <description>` is the cleanest downstream path** for medium/large investments — it starts a fresh workflow consuming the synthesized `02-shape.md` as initial context.
- **`/wf-quick quick <description>`** is right for small, well-understood investments where the mechanism is clear and scope is ≤3 files.
- **`/wf-quick discover <problem>`** is the right call when the investigation surfaced opportunity areas but the underlying problem has no external validation — don't build a solution to a problem you haven't confirmed is real.
- **`/wf profile <area>`** sharpens confidence on performance candidates before committing to them. Run it between `wf-investigate` and `wf-intake` when static analysis isn't conclusive.

# What this command is NOT

- **Not a planner** — `wf-investigate` produces an investment ranking and a routing recommendation. It does not write implementation plans, tasks, or code.
- **Not a debugger** — if a bug was found during investigation, route to `/wf-quick rca`. Investigation is for identifying *opportunities*, not *defects*.
- **Not a discovery validator** — if the underlying problem has no user or market signal, run `/wf-quick discover` first. `wf-investigate` assumes the domain is worth looking at; `wf-discover` answers whether the domain is worth it.
- **Not a profiler** — static analysis is its primary lens. For quantitative runtime data, use the `wf-profile` skill or `/wf benchmark`.
