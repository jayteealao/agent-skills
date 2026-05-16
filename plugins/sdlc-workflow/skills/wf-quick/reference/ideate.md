---
description: Proactive codebase ideation. Scans the codebase with parallel sub-agents across six lenses (quality, performance, security, DX, feature gaps, architecture), generates 30+ improvement candidates, applies adversarial filtering to cull weak or speculative ideas (with explanations), ranks survivors by impact/effort, and writes .ai/ideation/ artifacts ready to feed into wf-intake. Inverts the normal pattern — surfaces what you might not have thought to ask about.
argument-hint: "[focus-area] [count]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-ideate`, a **pre-pipeline ideation utility** for the SDLC lifecycle.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-ideate-<descriptor>.md` (collision suffix `-2`, `-3` if needed; descriptor defaults to lens, then UTC date — e.g., `ideate-perf-2026-05-13`). Frontmatter: `type: slice`, `slice-slug: ideate-<descriptor>`, `slice-type: ideate`, `compressed: true`, `origin: wf-quick/ideate`, `stage-number: 3`, `status: defined`, `complexity: xs` (ideate produces ranked ideas, not implementation work).
- **Same content, different home.** Body carries the same sections the standalone ideate would have written to `01-ideate.md` (lens summary, ranked opportunities with rationale, top-N recommendations and follow-up commands), under a `# Compressed Slice: ideate` heading with a one-line provenance preamble.
- **No new workflow, no new branch, no `01-ideate.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: ideate-<descriptor>, slice-type: ideate, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: ideate, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick ideate → compressed slice ideate-<descriptor> on <slug>` — plus the top-ranked idea and its recommended next command (e.g., `/wf-quick refactor <slug> <area>`, `/wf intake <description>`). Use the positional-slug form (slug as the first argument after the sub-command) — there is no `--slug` flag in v9.10.0+.

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline position
```
[wf-ideate] → wf-intake → 1·intake → 2·shape → ... → 10·retro
```

This command does NOT start or advance any workflow. It discovers improvement opportunities in the codebase and produces ranked, evidence-grounded idea candidates that are ready to feed directly into `/wf intake`. Run it when you want to find what's worth working on next, rather than starting from a blank brief.

| | Detail |
|---|---|
| Requires | A git project (reads codebase, git log, existing workflow artifacts) |
| Produces | `.ai/ideation/<focus>-<timestamp>.md` — ranked idea list with adversarial filter records |
| Next | `/wf intake <idea-title>` — kick off a workflow for any chosen idea |

# CRITICAL — execution discipline
You are an **opportunity discoverer and adversarial filter**, not a problem solver.
- Do NOT start implementing, planning, or designing anything.
- Do NOT create workflow artifacts (no `00-index.md`, no stage files).
- Do NOT make code changes.
- Your job is: **scan → generate candidates → challenge them → rank survivors → present → write artifact**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself starting to implement an idea, STOP. This command discovers work; it does not do it.

---

# Step 0 — Orient

1. **Resolve focus area** from `$ARGUMENTS` (first argument, optional). If provided (e.g., `security`, `performance`, `dx`, `architecture`, `testing`), narrow exploration lenses to that domain. If omitted, run all six lenses.
2. **Resolve count** from `$ARGUMENTS` (second argument, optional). If provided (e.g., `5`, `20`), this is the maximum number of ranked survivors to return. Default: **10**.
3. **Discover existing workflows** — glob `.ai/workflows/*/00-index.md`. Note which are active or recently completed. Ideas that duplicate in-flight or just-shipped work should be flagged as such during adversarial filtering.
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

---

## Lens 1 — Code Quality & Technical Debt

Prompt the agent with ALL of the following. It must report findings for each section, with file paths and line-range evidence:

**Complexity hotspots:**
- Find files with the highest cyclomatic complexity (long functions, deeply nested conditionals, many branches)
- Identify functions/methods over 50 lines. Report path, approximate line range, and what makes them complex.
- Find files that have been modified most frequently in recent git history (`git log --oneline --follow -- <file>` for candidates). High churn + high complexity = highest-risk area.

**Test coverage gaps:**
- Find source files with no corresponding test file. List them.
- Find test files that are suspiciously short compared to the file they cover (ratio of test lines to source lines < 0.2).
- Look for TODO/FIXME/HACK comments in test files — these often mark untested behaviors.

**Code rot indicators:**
- Find TODO/FIXME/HACK/DEPRECATED comments in source files. List file, line, content.
- Find dead code: exported functions/classes with no imports elsewhere. Use Grep to check import counts.
- Find duplicated logic: two or more functions with near-identical names and similar lengths in different modules.

**Outdated patterns:**
- Check `package.json`, `requirements.txt`, `go.mod`, or equivalent for dependencies significantly behind their latest stable version.
- Look for usage of deprecated APIs (common patterns: `componentWillMount`, `ReactDOM.render`, `.then()` without `.catch()`, callback-style async in a codebase that's moved to async/await, etc.)

**Output format:**
Return a list of specific, evidence-grounded findings. For each finding include: file path, approximate line, what the problem is, why it matters, estimated effort (xs/s/m/l/xl).

---

## Lens 2 — Performance & Scalability

Prompt the agent with ALL of the following:

**Database and query patterns:**
- Find ORM calls inside loops (N+1 query risk). Look for `findOne`/`findById`/`where` inside `for`, `forEach`, `map`, `reduce`.
- Find queries without pagination on endpoints that return collections. Look for `findAll()`, `.all()`, list endpoints without `limit`/`offset`/`cursor`.
- Find missing indexes: database migration files that create foreign keys without corresponding index creation.

**Caching opportunities:**
- Find expensive computations that run on every request with the same inputs (deterministic functions called in hot paths without memoization).
- Find external API calls (HTTP clients, cloud SDK calls) not wrapped in any caching layer.
- Find session/user data fetched repeatedly across a request lifecycle without request-scoped caching.

**Algorithmic issues:**
- Find sorting, filtering, or aggregation operations on large unconstrained collections.
- Find nested loops (`for` inside `for`, nested `.map()` chains) on potentially large data sets.

**Scale bottlenecks:**
- Find synchronous operations blocking the event loop in async-first runtimes (Node.js `fs.readFileSync`, Python `time.sleep` in async context, etc.).
- Find hardcoded limits or thresholds that would break at 10× current scale.

**Output format:** Specific findings with file paths, evidence, why it matters at scale, effort estimate.

---

## Lens 3 — Security & Privacy

Prompt the agent with ALL of the following:

**Input handling:**
- Find user-controlled inputs used in SQL strings, shell commands, file paths, or HTML output without sanitization.
- Find endpoints that accept file uploads without type validation.
- Find deserialization of untrusted data (JSON.parse, pickle.loads, yaml.load without Loader) without schema validation.

**Authentication & authorization:**
- Find endpoints or routes with no authentication middleware. Compare guarded vs. unguarded routes.
- Find authorization checks that only verify authentication (is the user logged in?) but not authorization (is this user allowed to access this resource?).
- Find hardcoded credentials, API keys, tokens, or passwords in source files or config files tracked by git.

**Data handling:**
- Find logging statements that include user data, emails, passwords, tokens, or PII fields.
- Find user data stored in localStorage, sessionStorage, URL parameters, or cookies without security flags.
- Find fields named `password`, `token`, `secret`, `key`, `ssn`, `credit_card`, `dob` that might be returned in API responses without redaction.

**Dependency vulnerabilities:**
- Check `package-lock.json`, `yarn.lock`, or `requirements.txt` for any known high-severity CVEs (web search for each dependency version if needed).

**Output format:** Specific findings with file paths, severity (critical/high/medium), evidence, effort estimate.

---

## Lens 4 — Developer Experience

Prompt the agent with ALL of the following:

**Setup friction:**
- Read README.md and CONTRIBUTING.md. How many steps does "getting started" take? Are any steps likely to fail silently?
- Find environment variables referenced in source code. Are they all documented? Do they have sensible defaults?
- Is there a local development setup script? Does it handle common failure modes?

**Error message quality:**
- Find `throw new Error(...)` or `raise Exception(...)` with generic messages ("something went wrong", "internal error", "unexpected").
- Find places where error objects are caught and swallowed without logging or re-throwing.
- Find API error responses without an error code or reference ID (making debugging harder for callers).

**API ergonomics (internal or external):**
- Find functions/methods with more than 4 positional parameters (should be an options object).
- Find inconsistent naming: some functions `getUser`/`fetchUser`/`loadUser` doing the same thing.
- Find breaking changes in public APIs that have no version guard or deprecation warning.

**Documentation gaps:**
- Find exported functions/classes/methods with no JSDoc/docstring/type annotation.
- Find features mentioned in README that don't have corresponding implementation, or implementation that isn't in the README.

**Output format:** Specific findings with file paths, what the friction is, who it affects, effort estimate.

---

## Lens 5 — Feature Completeness & User-Facing Gaps

Prompt the agent with ALL of the following:

**Error state coverage:**
- Find UI components or API handlers that handle the happy path but have no error state (loading/error/empty state missing).
- Find form submissions with no validation feedback to the user.
- Find operations that can fail silently from the user's perspective.

**Accessibility gaps (if frontend exists):**
- Find interactive elements (`button`, `a`, custom click handlers) without accessible names (`aria-label`, visible text, `title`).
- Find images without `alt` attributes.
- Find form inputs without associated `label` elements.
- Find color-only communication (red/green status indicators without icon or text).

**Edge cases in existing features:**
- Read any existing shape or intake artifacts (`.ai/workflows/*/02-shape.md`) and look for acceptance criteria that have no corresponding test.
- Find features that work for the single-item case but likely break on empty collections or large collections.

**Workflow completeness:**
- Look for "TODO: implement" comments adjacent to stub functions that still return hardcoded or placeholder values.
- Find configuration options documented in README that don't have implementation.

**Output format:** Specific findings with file paths, what the gap is, user impact, effort estimate.

---

## Lens 6 — Architecture & Design Patterns

Prompt the agent with ALL of the following:

**Structural issues:**
- Map the top-level directory structure. Are there modules that have grown too large and should be split?
- Find circular dependencies (module A imports B, B imports A or a transitive path back to A).
- Find business logic in presentation layer (React components doing database queries, controllers doing complex business rules).

**Missing abstractions:**
- Find the same pattern repeated 3+ times across different files (copy-paste code blocks that should be a shared utility).
- Find external service integrations (Stripe, SendGrid, AWS) directly in business logic without an adapter/interface layer.

**Over-engineering:**
- Find abstractions with only one implementation that add indirection without flexibility.
- Find configuration systems more complex than the features they configure.
- Find premature generalization: generic utility functions called from only one place.

**Coupling hotspots:**
- Find files imported by 10+ other files. These are high-coupling points — changes there ripple everywhere.
- Find large modules (500+ lines) that export 20+ things — likely doing too much.

**Output format:** Specific findings with file paths, what the structural issue is, why it matters, effort estimate (note: architectural changes tend to be l/xl).

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
Entry: /wf intake <slug-suggestion> | /wf-meta extend <existing-slug>
```

---

# Step 3 — Adversarial Filtering

**This step is mandatory.** Every raw candidate must pass the adversarial filter before being eligible for the ranked list.

For each candidate, run it through the following challenges. If it fails any challenge, cull it — record the ID, title, and reason, but do not include it in the survivor list.

**Challenge 1 — Is it real?**
Is this problem actually present in the codebase, or is it inferred from a generic pattern? If the sub-agent finding was speculative ("this might be a problem if…") rather than specific ("this file:line shows…"), cull it.

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

Then use AskUserQuestion to ask which ideas to pursue:

```
Question:
  header: "Which ideas would you like to act on?"
  question: "Select ideas to start workflows for, or choose None to save the list and decide later."
  options:
    - One option per idea in the ranked list: label = "#N — <Title>", description = "<Entry command>"
    - label: "None — save list and decide later", description: "Artifact written to .ai/ideation/"
  multiSelect: true
```

For each selected idea, offer the exact intake command to run:
```
Ready to start:
  /wf intake <slug-suggestion-1>   # Idea #N — <Title>
  /wf intake <slug-suggestion-2>   # Idea #N — <Title>
```

---

# Step 6 — Write Artifact

Generate a timestamp: `date -u +"%Y%m%dT%H%M%SZ"` via Bash.
Generate a focus-slug from the focus area (or "all" if none).

Write `.ai/ideation/<focus-slug>-<timestamp>.md`:

```yaml
---
schema: sdlc/v1
type: ideation
focus: <focus-area or "all">
created-at: "<ISO 8601>"
raw-candidates: <N>
culled-count: <N>
survivor-count: <N>
shown-count: <N>
ideas:
  - id: IDEA-001
    title: "<title>"
    category: <quality|performance|security|dx|feature|architecture>
    impact: <critical|high|medium|low>
    effort: <xs|s|m|l|xl>
    score: <float>
    entry: "<wf-intake slug-suggestion>"
  - ...
culled:
  - id: IDEA-NNN
    title: "<title>"
    reason: "<adversarial filter reason>"
  - ...
---
```

# Ideation: <focus-area or "Codebase-Wide">

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
/wf-quick ideate security          # security lens only
/wf-quick ideate performance 5     # performance lens, top 5
/wf-quick ideate dx 20             # DX lens, top 20
```

---

# Chat return contract
Return ONLY:
- `wrote: .ai/ideation/<filename>`
- `ideas: <N> survivors from <M> raw candidates`
- The ranked list (Step 5 format)
- `options:` — one `/wf intake` invocation per idea selected by the user, or "Run `/wf-quick ideate` again with a focus area for deeper coverage"
