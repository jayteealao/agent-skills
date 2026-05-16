---
description: Problem validation workflow. Researches a proposed problem statement using external signals (competitors, user feedback, market data) to produce a validated yes/no build recommendation before any engineering investment is made. Does NOT write application code. Routes to /wf intake with a validated problem brief if the recommendation is to build, or surfaces a "do not build" rationale if it is not.
argument-hint: <problem-statement-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-discover`, a **problem validation workflow** that answers "should we build this?" before any engineering investment is made.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-discover-<descriptor>.md` (collision suffix `-2`, `-3` if needed). Frontmatter: `type: slice`, `slice-slug: discover-<descriptor>`, `slice-type: discover`, `compressed: true`, `origin: wf-quick/discover`, `stage-number: 3`, `status: defined`, `complexity: xs` (discover produces a build/do-not-build recommendation, not implementation work).
- **Same content, different home.** Body carries the same sections the standalone discover would have written to `01-discover.md` (external signal scan, competitor/market evidence, user-need synthesis, build/do-not-build verdict), under a `# Compressed Slice: discover` heading with a one-line provenance preamble.
- **No new workflow, no new branch, no `01-discover.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: discover-<descriptor>, slice-type: discover, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: discover, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick discover → compressed slice discover-<descriptor> on <slug>` — plus the discover verdict and its recommended next step (e.g., `/wf intake <description>` if build, or "do not build — close this thread" if not).

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·problem-intake` → `2·external-research` → `3·validate` → `/wf intake` | `do-not-build`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a problem statement or an existing slug to resume. |
| Produces | `01-discover.md` (validated problem brief + recommendation), `00-index.md` |
| Skips | No codebase analysis, no planning, no implementation. Evidence is external. |
| Next | `/wf intake <validated-problem>` (if `build-recommendation: build`), or document the decision and stop (if `do-not-build`) |
| Escalate | If external evidence is contradictory and confidence is low → surface `needs-further-research` and list exactly what data would resolve the uncertainty |

# CRITICAL — research discipline
You are a **product researcher and market analyst**, not a builder.
- The **only** acceptable output is the discovery artifact and index. Do NOT edit application code. Do NOT write a plan. Do NOT commit to a solution.
- Evidence is **external**: web search results, competitor analysis, public user feedback forums, app store reviews, market signals. Internal codebase evidence is secondary and only relevant for feasibility signals.
- The recommendation must be **convergent**: `build`, `do-not-build`, or `needs-further-research` — not a ranked list of variants.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: discover` → **resume mode**. Read that index. If `01-discover.md` is complete, tell the user and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new discovery**. Derive a slug: `discover-<short-problem>` (kebab-case, max 5 words, e.g., `discover-offline-mode`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `discover` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-meta resume <slug>` to continue it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only and external research only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for product positioning and existing feature set.
   - This informs the competitor analysis: we need to know what already exists before assessing what to build.

# Step 1 — Problem clarification
Ask at most **3 questions** — stop as soon as you have enough to research:

1. **What is the problem?** — State as a user problem, not a feature request. Good: "users can't access their data when offline." Bad: "we need an offline mode." Required if not clear from `$ARGUMENTS`.
2. **Who experiences it?** — Target user segment: all users, a specific cohort, a specific use case, a specific environment.
3. **What signals already exist?** — Any existing data: support tickets, NPS verbatims, user interviews, sales blockers, churn attribution, competitor mentions. Even "none" is useful — it means we need to find external signals.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Parallel external research
Launch all three sub-agents simultaneously. These sub-agents use **web search** as their primary tool. Do not proceed to synthesis until all complete.

### Explore sub-agent 1 — Competitor landscape

Prompt with ALL of the following:
- Search for: how do the top 3–5 direct competitors address this problem? What features or approaches do they use?
- Search for: have any competitors recently shipped something in this area? (look for product announcements, changelogs, press)
- Assess each competitor solution: is it a shallow feature or a deep investment? What do users say about it?
- Identify: any competitor that is *not* solving this problem — is there a pattern to who avoids it and why?

Return as structured text:
- `competitors`: list of `{name, approach, quality: shallow|solid|deep, user_reception}`
- `market_pattern`: is this problem solved by most, some, or few players?
- `gap_signal`: are there competitors notably NOT solving this — and if so, is that a signal it's hard, unimportant, or a differentiator opportunity?
- `recency`: any major launches in this space in the last 12 months?

### Explore sub-agent 2 — User signal mining

Prompt with ALL of the following:
- Search for: public user feedback about this problem — Reddit, Hacker News, App Store reviews, G2/Capterra reviews, Product Hunt comments, Twitter/X threads, GitHub issues in comparable open-source projects.
- Look for: explicit complaints, feature requests, workarounds users have invented, "I switched to X because Y."
- Assess sentiment and frequency: is this a frequently-voiced pain, an occasional complaint, or a niche edge case?
- Identify: whether users are asking for this specific solution or whether they're describing a broader pain that could be addressed multiple ways.

Return as structured text:
- `user_signals`: list of `{source, quote_or_summary, sentiment: positive|negative|neutral, frequency_signal: rare|occasional|frequent}`
- `pain_level`: low | medium | high (with one-sentence justification)
- `solution_framing`: are users asking for the specific solution in `$ARGUMENTS`, or describing a broader pain?
- `workarounds_found`: any DIY workarounds users have invented (signals real pain and reveals partial solutions)

### Explore sub-agent 3 — Opportunity sizing & feasibility

Prompt with ALL of the following:
- Search for: any market research, analyst reports, or industry data about the size of this problem space.
- Search for: comparable product feature launches and what business impact they reported (growth, retention, revenue lift).
- Assess strategic fit: is solving this consistent with the product's current positioning and target user? Or does it require a significant pivot?
- Light feasibility check (internal): scan the codebase README and architecture notes for any signals about how hard this would be to build — not a full technical assessment, just a "does this look tractable or very hard?"

Return as structured text:
- `affected_population`: estimated percentage or cohort of current/potential users affected
- `revenue_signal`: any data on business impact (or "no data found")
- `strategic_fit`: high | medium | low — one sentence justifying
- `feasibility_signal`: easy | moderate | hard | unknown — from README/architecture scan
- `comparable_launches`: list of `{product, feature, reported_impact}` (or "none found")

# Step 3 — Synthesize and write `01-discover.md`

Merge findings from the sub-agents. **Do not invent evidence the agents did not surface.** Conflicting signals are data — record them. The final recommendation must be justified by the evidence, not asserted.

**`01-discover.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: discover
slug: <slug>
workflow-type: discover
problem-statement: <one-line user-framed problem>
build-recommendation: build | do-not-build | needs-further-research
confidence: high | medium | low
recommended-next: /wf intake | none | <specific research action>
status: ready-for-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Problem statement

The problem, framed as a user pain, not a feature description. ≤3 sentences. Cite any existing signals the user provided in Step 1.

## 2. External evidence

A summary of what the research found — both FOR and AGAINST building. Balanced, not advocacy.

- **For building:** strongest signals that this is a real, common, high-value problem.
- **Against building:** signals that it's niche, already solved well enough, strategically misaligned, or too costly.
- **Conflicting signals:** where sub-agent findings disagreed — record both and note the uncertainty.

## 3. Competitor landscape

| Competitor | Approach | Quality | User Reception | Gap |
|---|---|---|---|---|
| <name> | <description> | shallow/solid/deep | <positive/mixed/negative> | <what's missing> |

Market pattern summary: is this problem solved by most, some, or few? What does that imply?

## 4. User signal

- **Pain level:** low | medium | high — one paragraph of evidence.
- **How users describe it:** direct quotes or paraphrases from the research.
- **Workarounds in use:** any DIY solutions users have invented (signals real pain and reveals partial solution shapes).
- **Framing gap:** are users asking for this solution specifically, or describing a broader pain that might be solved differently?

## 5. Opportunity sizing

- **Affected users:** estimate of who this impacts (percentage, cohort, use case).
- **Revenue/retention signal:** any comparable data from market or similar launches.
- **Strategic fit:** high | medium | low — one sentence.
- **Feasibility signal:** easy | moderate | hard | unknown — from README/architecture scan.

## 6. Build recommendation

State the recommendation plainly: **build**, **do-not-build**, or **needs-further-research**.

Then one paragraph of rationale — justify it with the evidence above, not abstract principles. Do NOT hedge in all three directions; pick one.

**Routing based on recommendation:**

| Recommendation | Next step |
|---|---|
| `build` + `confidence: high` | `/wf intake <validated-problem-brief>` — include the problem statement as the intake argument |
| `build` + `confidence: medium` | `/wf intake <validated-problem-brief>` — flag open questions in the intake |
| `do-not-build` | Record the decision. Recommend documenting the rationale. No next command. |
| `needs-further-research` | List exactly what data is still needed and where to get it. Defer `/wf intake` until that data exists. |

## 7. Confidence & data gaps

- **Confidence:** high | medium | low — one sentence justifying.
- **What we could not verify:** specific signals that were absent or ambiguous.
- **What would resolve uncertainty:** specific research actions (user interviews, a 1-week survey, an NPS question, a competitor deep-dive).

## 8. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the recommendation.

- **No external signal found:** Sub-agents returned no user or competitor data — this is a strong signal the problem may be niche or mislabeled.
- **Contradictory evidence:** Sub-agents disagree significantly — confidence must be `low`.
- **Solution-framing mismatch:** Users are describing a broader pain; building this specific feature may not address the root problem.
- **Strategic fit: low:** The opportunity is real but inconsistent with current positioning — flag for product leadership decision, not engineering.
- **Feasibility: hard:** Light codebase scan suggests high implementation cost — note that `/wf-quick investigate` or `/wf intake` should do a full technical feasibility pass before committing.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more wf-discover tripwires fired. The recommendation is still valid, but review the warnings before routing to /wf intake.

# Step 4 — Write `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: discover
current-stage: routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: <recommended-next or none>
next-invocation: <recommended-next with problem-brief or "none — record decision">
build-recommendation: <build|do-not-build|needs-further-research>
open-questions: []
augmentations: []
progress:
  - discover: complete
created-at: <timestamp>
---
```

Body: one-line description + pointer to `01-discover.md` and the recommendation.

# Step 5 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
wf-discover complete: <slug>
Problem: <one-line user-framed problem>
Recommendation: build | do-not-build | needs-further-research
Confidence: <level>
Pain level: <low|medium|high>
Competitor pattern: <most/some/few solve this>
Tripwires: <none | comma-separated list>
Next: <command with argument> | <"record decision and close"> | <"gather X data first">
Artifact: .ai/workflows/<slug>/01-discover.md
```

If `do-not-build`, prefix with:

> ✗ Recommendation: do not build. Evidence does not support this investment at this time. See artifact for rationale.

If `needs-further-research`, prefix with:

> ⚠ Inconclusive — confidence is too low to commit. See artifact for what data would resolve the uncertainty.

# What this command is NOT

- **Not a feature designer** — `wf-discover` validates whether to build, not what to build or how. Feature design lives in `/wf shape`.
- **Not a technical feasibility study** — the feasibility signal is intentional shallow. For full technical assessment, run `/wf-quick investigate` or `/wf intake` after this.
- **Not a market research agency** — it uses web search as a proxy for market data. Findings are directional, not statistically rigorous.
- **Not a substitute for user interviews** — it surfaces public signals. For primary research, the user needs to run interviews separately and feed findings back into a new `/wf-quick discover` or directly into `/wf intake`.
