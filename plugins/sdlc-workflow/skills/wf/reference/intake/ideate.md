---
description: Proactive codebase ideation. Scans the codebase with parallel sub-agents across six lenses (quality, performance, security, DX, feature gaps, architecture), generates 30+ improvement candidates, applies adversarial filtering to cull weak or speculative ideas (with explanations), ranks survivors by impact/effort, and roots a type:workflow-index slug workflow with an 01-ideate lead ready to feed into wf-intake. Inverts the normal pattern — surfaces what you might not have thought to ask about.
argument-hint: "[focus-area] [count]"
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake ideate`, a **pre-pipeline ideation utility** for the SDLC lifecycle.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-ideate-<descriptor>.md` (`type: slice`, `slice-type: ideate`, `compressed: true`, `origin: intake/ideate`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `ideate → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline position
```
[wf-ideate] → wf-intake → 1·intake → 2·shape → ... → 10·retro
```

This command does NOT start or advance any workflow. It discovers improvement opportunities in the codebase and produces ranked, evidence-grounded idea candidates that are ready to feed directly into `/wf intake`. Run it when you want to find what's worth working on next, rather than starting from a blank brief.

| | Detail |
|---|---|
| Requires | A git project (reads codebase, git log, existing workflow artifacts) |
| Produces | A `type: workflow-index` slug workflow: `.ai/workflows/<slug>/01-ideate.md` (`type: ideation` — ranked ideas + adversarial filter log) + a lightweight `00-index.md` (`type: workflow-index`). (Legacy off-pipeline `.ai/ideation/<focus>-<timestamp>.md` runs still render via the retained ideation discovery.) |
| Next | `/wf intake <idea-title>` — kick off a workflow for any chosen idea |

> **Auto second opinion (objective triggers).** At the terminus, once the ideas are ranked
> (before Step 6 writes the artifact), **auto-invoke** `/consult codex <widen this idea set and
> flag blind spots — what did this analysis miss?>` (pinning `codex`/`claude` keeps it free) when
> ANY of: (a) the ranked list will feed a build decision the user signalled they intend to act on
> now; (b) any surviving idea is `impact: critical` or category `security`; (c) the adversarial
> filter culled more than half the raw candidates (a high cull rate means the lens set may be
> systematically narrow — divergent breadth is exactly the cure). Fold distinct additions in
> through the same adversarial filter before ranking. Skip only when none of the triggers hold;
> the user may invoke it explicitly with any provider.

# CRITICAL — execution discipline
You are an **opportunity discoverer and adversarial filter**, not a problem solver.
- Do NOT start implementing, planning, or designing anything.
- This is a **terminal analysis mode**, not a build lifecycle: it roots a lightweight `type: workflow-index` slug workflow whose **only** artifact is the `01-ideate.md` lead. Do NOT author build stage files (`02-shape.md`, `03-slice.md`, `04-plan.md`, `05-implement.md`, …) — ideation is not a build lifecycle.
- Do NOT make code changes.
- Your job is: **scan → generate candidates → challenge them → rank survivors → present → write artifact**.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- If you catch yourself starting to implement an idea, STOP. This command discovers work; it does not do it.

---

# Step 0 — Orient

1. **Resolve focus area** from `$ARGUMENTS` (first argument, optional). If provided (e.g., `security`, `performance`, `dx`, `architecture`, `testing`), narrow exploration lenses to that domain. If omitted, run all six lenses.
2. **Resolve count** from `$ARGUMENTS` (second argument, optional). If provided (e.g., `5`, `20`), this is the maximum number of ranked survivors to return. Default: **10**.
2b. **Derive the workflow slug:** `ideate-<focus-slug>-<YYYYMMDD>` (focus-slug = the focus area, or `all`; date via `date +"%Y%m%d"`). This roots the terminal analysis workflow. If that slug already exists, append `-2`/`-3`.
2c. **Pick / resume split:** if the first token matches an existing `workflow-type: ideate` slug: a following token that matches an idea id (`IDEA-NNN`) or an idea title → **pick mode**, jump to `# Pick — decision closure` below (trailing prose is the decision note; if the index is already closed, WARN and stop). No idea token and `01-ideate.md` complete → tell the user how to record a pick — `/wf intake ideate <slug> <idea-id> [reason]` — and stop. Incomplete → resume from the missing step.
3. **Discover existing workflows** — glob `.ai/workflows/*/00-index.md`. Note which are active or recently completed. Ideas that duplicate in-flight or just-shipped work should be flagged as such during adversarial filtering.
3b. **Seed from recorded history** — the repo already wrote down what needs doing; the lenses must not re-derive it blind. Cheap reads, skip whatever is absent: retro action items (`.ai/workflows/*/10-retro.md`, the action-item section), `.ai/solutions/` entries, deferred review findings (review ledger entries marked deferred), and `sdlc-debt:` markers (`grep -rn 'sdlc-debt:' --include='*.{js,ts,py,go,rs,java,kt,md}'` or the repo's equivalent). Pass the harvest to every lens prompt as prior context, tagged `recorded-history` — a candidate that matches a recorded item cites it as evidence and skips Challenge 1.
4. **Announce plan to chat:**
   ```
   Scanning codebase for improvement opportunities.
   Focus: <focus-area or "all lenses">
   Target count: <N> ranked survivors
   Lenses: <list of active lenses>
   ```

---

# Step 1 — Parallel Codebase Exploration

Launch exploration sub-agents in parallel. Each sub-agent gets a specific lens and must return **structured findings** — not generic advice, but specific evidence from this codebase. Launch only the lenses relevant to the focus area (or all six if no focus).

**Model for every dispatched lens agent:** `haiku`. REQUIRED on every `Task` call. Each lens reads code + emits structured findings against a rubric (complexity, performance, security, DX, gaps, architecture). The adversarial filtering step that comes later does the judgment work; the per-lens fan-out is bounded extraction. Haiku is the right tier.

Prompt each lens agent with its goal below plus this shared evidence rule: every finding cites
`file:line` (or a file range) from this codebase, states the problem, states why it matters, and
carries an effort estimate (xs/s/m/l/xl). Generic advice with no citation is not a finding.

## Lens 1 — Code Quality & Technical Debt

Goal: find the code most likely to break or resist change. Hunt:
- complexity hotspots — long functions, deep nesting, files with both high churn and high complexity
- test-coverage gaps — source files with no test, or a test far thinner than the code it covers
- code rot — TODO/FIXME/HACK/DEPRECATED markers, dead code, duplicated logic across modules
- outdated patterns — dependencies far behind stable, deprecated API usage

## Lens 2 — Performance & Scalability

Goal: find work that fails at scale. State why each finding matters at 10× current load. Hunt:
- query patterns — N+1 lookups in loops, unpaginated collection endpoints, missing indexes
- caching gaps — repeated deterministic computation, uncached external calls, per-request refetching
- algorithmic hotspots — sorting/filtering/nested iteration over unconstrained collections
- blocking work — synchronous operations inside async-first runtimes, limits that break at scale

## Lens 3 — Security & Privacy

Goal: find exposure. Grade each finding critical / high / medium. Hunt:
- input handling — user input reaching SQL, shell, paths, or HTML unsanitized; unvalidated uploads and deserialization
- auth — unauthenticated routes, authentication-only checks where authorization is required, hardcoded credentials in tracked files
- data handling — PII or secrets in logs, insecure client-side storage, unredacted sensitive fields in responses
- dependencies — pinned versions with known high-severity CVEs

## Lens 4 — Developer Experience

Goal: find friction. Name who each friction affects. Hunt:
- setup friction — getting-started steps that fail silently, undocumented environment variables
- error quality — generic messages, swallowed errors, API errors with no code or reference ID
- API ergonomics — parameter sprawl, inconsistent naming for one operation, unguarded breaking changes
- documentation drift — undocumented exports, README features the code does not match

## Lens 5 — Feature Completeness & User-Facing Gaps

Goal: find what users hit that the happy path hides. Name the user impact of each gap. Hunt:
- state coverage — missing loading/error/empty states, forms with no validation feedback, silent failures
- accessibility — unlabeled interactive elements, missing alt text, inputs with no label, color-only signals
- edge cases — acceptance criteria in `.ai/workflows/*/02-shape.md` with no covering test, features that break on empty or large collections
- stubs — "TODO: implement" placeholders, documented configuration with no implementation

## Lens 6 — Architecture & Design Patterns

Goal: find structural risk. Architectural fixes usually carry effort l/xl — say so. Hunt:
- structural issues — oversized modules, circular dependencies, business logic in the presentation layer
- missing abstractions — one pattern repeated 3+ times, external services wired in with no adapter layer
- over-engineering — single-implementation indirection, configuration heavier than what it configures
- coupling hotspots — files imported everywhere, large modules that export too much

---

# Step 2 — Generate Raw Idea Candidates

After all sub-agents complete, synthesise their findings into **raw idea candidates**. Target 30+ candidates before filtering. Each candidate must:

- Be grounded in at least one specific finding from the sub-agents (file path, evidence)
- Be a concrete, actionable piece of work (not "improve test coverage" but "add integration tests for the auth flow in `src/auth/login.ts`")
- Have a proposed entry point (which `wf-*` command starts this work)

Assign each candidate:
```
ID: IDEA-NNN
Category: quality | performance | security | dx | feature | architecture
Title: <verb phrase — e.g., "Add retry logic to the Stripe payment client">
Evidence: <file:line or file range from sub-agent findings>
Description: <2–3 sentences — what's wrong, what fixing it looks like, why now>
Effort: xs | s | m | l | xl
Impact: low | medium | high | critical
Entry: /wf intake <slug-suggestion> | /wf intake <existing-slug> <scope> (extension)
```

---

# Step 3 — Adversarial Filtering

**This step is mandatory.** Every raw candidate must pass the adversarial filter before being eligible for the ranked list.

For each candidate, run it through the following challenges. If it fails any challenge, cull it — record the ID, title, and reason, but do not include it in the survivor list.

**Challenge 1 — Is it real?**
Is this problem actually present in the codebase, or is it inferred from a generic pattern? If the sub-agent finding was speculative ("this might be a problem if…") rather than specific ("this file:line shows…"), do not silently cull a candidate whose *impact would be high if true* — route it to the cheapest check instead: record it under the filter log as `needs-verification` with the named check (`/wf intake discover "<the falsifiable claim>"` for a static truth, `/wf probe <slug> "<the runtime question>"` once a workflow exists for a runtime one). Low-impact speculation is culled outright.

**Challenge 2 — Is it already in progress?**
Check the active workflows discovered in Step 0. If this idea is already being worked on or was just shipped, cull it and note the workflow slug.

**Challenge 3 — Is the effort justified?**
Would fixing this produce a meaningful improvement proportional to the effort? An xl effort to fix a low-impact formatting inconsistency is not worth surfacing. Cull if impact/effort ratio is unjustifiable.

**Challenge 4 — Is it specific enough to act on?**
Can someone run `wf-intake` on this right now with enough clarity to shape it? Vague ideas like "improve the architecture" or "write more tests" fail this — they need to be decomposed into something actionable. Cull if not specific enough to intake as-is.

**Challenge 5 — Is this the right level?**
Some findings reveal symptoms rather than root causes. If two candidates are both symptoms of the same underlying problem, cull the symptom and keep the root cause (or merge them into one candidate that addresses the root).

**Output the filter log:** For each culled candidate: `IDEA-NNN: [title] — culled: [reason]`. This log is written to the artifact but not shown prominently in chat.

---

# Step 4 — Rank Survivors

Score each surviving candidate:

```
score = (impact_value × feasibility) / effort_value

impact_value:  critical=4, high=3, medium=2, low=1
effort_value:  xs=1, s=2, m=3, l=4, xl=5
feasibility:   1.0 (no blockers), 0.7 (needs design decision first), 0.5 (depends on external team/system)
```

Sort by score descending. Cap the list at the user's requested count (default 10). Group ties by category — prefer security and critical-impact items.

---

# Step 5 — Present Ranked Ideas

Print the ranked list to chat in this format:

```
## Ideation Results

Focus: <focus-area or "all lenses">
Raw candidates: <N>  |  Culled by filter: <N>  |  Survivors: <N>  |  Showing: <N>

### #1 — <Title> [<Category>] [Impact: <level>] [Effort: <level>]
**Evidence:** `<file:line>`
<Description>
**Entry:** `/wf intake <slug-suggestion>`

### #2 — ...
```

Then ask which ideas to pursue. `AskUserQuestion` supports at most 4 options — so:

- **≤3 ranked ideas:** `AskUserQuestion`, `multiSelect: true`, one option per idea (label `#N — <Title>`, description = the entry command) plus "None — save list and decide later".
- **4+ ranked ideas:** ask in chat instead — "Reply with the numbers of the ideas to act on (e.g. `1 3`), or `none` to save the list and decide later." A 10-option question widget is unbuildable; the numbered chat reply is the same decision.

**Persist the selection** — the answer is a decision, not chat exhaust: record the selected idea ids in `01-ideate.md` frontmatter as `selected: [IDEA-NNN, …]` (empty list for "none") and append a one-line `## Selection` note to the body (who picks later when "none"). For each selected idea, offer the exact entry command to run (new-workflow ideas as `/wf intake <slug-suggestion> from <slug>`; extension-shaped ideas — those that grow an existing workflow — as `/wf intake <existing-slug> <scope>`, never forced into a new-workflow form):
```
Ready to start:
  /wf intake <slug-suggestion-1> from <slug>   # Idea #N — <Title>
  /wf intake <existing-slug> <scope>           # Idea #M — <Title> (extension)
```
A single selected idea is the pick: apply `# Pick — decision closure` for it. Multiple selections keep the workflow open (`## Selection` records them; the first routed successor's provenance link-back applies the implicit pick per `_intake-provenance.md`).

---

# Step 6 — Write Artifact

The terminal analysis modes root in a `type: workflow-index` slug workflow (the lead is the only artifact). Write **two** files under `.ai/workflows/<slug>/` (the slug derived in Step 0 sub-step 2b), then register the slug in `.ai/workflows/INDEX.md` per [intake/default.md](default.md) Step 10.

Generate a timestamp: `date -u +"%Y%m%dT%H%M%SZ"` via Bash.

**`00-index.md` — `type: workflow-index`** (lightweight; analysis modes do not get the heavy 22-field `type: index`). The workflow stays **open until the pick** — `status: ready`, `next-command: user-picks`, never `complete`-and-parked:
```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
title: "Ideate: <focus-area or codebase-wide> <YYYY-MM-DD>"
workflow-type: ideate
current-stage: routing
status: ready
branch-strategy: none
open-questions: []
next-command: user-picks
next-invocation: "user-picks — record via /wf intake ideate <slug> <idea-id>; see 01-ideate.md"
progress:
  ideate: complete
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
---
```

**`01-ideate.md` — `type: ideation`** (the lead carries a `slug` for the in-slug path; `focus` stays the schema key). The roster keeps the per-idea `file:line` evidence the lenses were required to gather — dropping it strips the successor's seed:
```yaml
---
schema: sdlc/v1
type: ideation
slug: <slug>
focus: <focus-area or "all">
created-at: "<ISO 8601>"
raw-candidates: <N>
culled-count: <N>
survivor-count: <N>
shown-count: <N>
selected: []          # idea ids the user selected in Step 5; stamped again at pick time
ideas:
  - id: IDEA-001
    title: "<title>"
    category: <quality|performance|security|dx|feature|architecture>
    impact: <critical|high|medium|low>
    effort: <xs|s|m|l|xl>
    score: <float>
    evidence: ["<file:line>", "..."]   # the lens findings this idea is grounded in
    entry: "<the entry invocation — new-workflow or extension form>"
  - ...
culled:
  - id: IDEA-NNN
    title: "<title>"
    reason: "<adversarial filter reason, or needs-verification: <the named cheap check>>"
  - ...
---
```

# Ideation: <focus-area or "Codebase-Wide">

## The Ideation
<!-- STORY SECTION — first, and self-sufficient. MUST follow `../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

*Generated: <date> | Lenses: <list> | Raw: <N> → Filtered: <N> → Showing: <N>*

## Ranked Ideas

### #1 — <Title>
**Category:** <category> | **Impact:** <level> | **Effort:** <level> | **Score:** <N>

**Evidence:** `<file:line>`

<Description>

**To act on this:** `/wf intake <slug-suggestion>`

---

### #2 — ...

---

## Adversarial Filter Log

<For each culled idea:>
- **IDEA-NNN** — *<title>*: <reason>

---

## How to use these results

Each idea above maps directly to a `wf-intake` command. Copy the entry command for any idea you want to pursue. The slug suggestion is a starting point — you can adjust it.

If you want to re-run ideation with a different focus or count:
```
/wf intake ideate security          # security lens only
/wf intake ideate performance 5     # performance lens, top 5
/wf intake ideate dx 20             # DX lens, top 20
```

---

## Step — Write free narrative fragments

Author free narrative fragments for this artifact as described in the narrative-fragment tier of `_intake-context.md` — `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, as many as the story needs, ordered with an `NN-` prefix, rendered raw-inline below the page.

# Pick — decision closure

Runs only from Step 0 pick mode (`/wf intake ideate <slug> <idea-id-or-title> [one-line reason]`),
or from Step 5 when exactly one idea is selected. The pick is the workflow's terminus: it records
the decision and closes the workflow. It never starts the successor — it prints the invocation
and stops.

1. **Stamp the artifact.** In `01-ideate.md` frontmatter set `selected: [<idea-id>]`, add
   `chosen-idea: <id> — <title>`, `chosen-at:` set to the real UTC timestamp (run
   `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash), and `decision-note: <the trailing prose>` if the
   user supplied any (omit the key otherwise).
2. **Append a `## Decision` section** to the artifact body: which idea was picked; why (the
   user's reason verbatim, else "user picked without a stated reason"); the sibling ideas it
   beat and the one-line reason each lost (the culled-sibling rationale a successor's
   out-of-scope list is seeded from).
3. **Close the workflow.** Update `00-index.md`: `status: closed`, `close-reason: idea-picked`,
   `superseded-by: pending`, `closed-at: <timestamp>`, `next-command: none`,
   `next-invocation: "none — decision recorded"`. Update the slug's row in
   `.ai/workflows/INDEX.md` to `closed`. The successor's link-back (`_intake-provenance.md`)
   corrects `superseded-by: pending`.
4. **Print the next invocation** with provenance — the idea's `entry:` value, with
   `from <slug>` appended when it is a new-workflow form — and stop. Do not run it.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead in the artifact's `## The Ideation` story voice, then this receipt:
- `wrote: .ai/workflows/<slug>/01-ideate.md + 00-index.md`
- `ideas: <N> survivors from <M> raw candidates`
- The ranked list (Step 5 format)
- `options:` — one `/wf intake` invocation per idea selected by the user, or "Run `/wf intake ideate` again with a focus area for deeper coverage"
