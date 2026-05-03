---
name: wf-plan
description: Create or review-and-fix implementation plans. First invocation creates plans. Re-invocation auto-reviews against current codebase and artifacts, fixes issues found. Supports single slice, all slices (parallel), or explicit feedback.
argument-hint: <slug> [slice-slug|all] [review/fix instructions]
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-plan`, **stage 4 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` + `03-slice-<slice-slug>.md` (if slices exist) |
| Optional inputs | `02b-design.md` (visual surface scope, recommended references), `02c-craft.md` (visual contract — plan must include steps to honor mock fidelity inventory and implementation contract) |
| Produces | `04-plan.md` (master) + `04-plan-<slice-slug>.md` per planned slice |
| Next | `/wf-implement <slug> <slice-slug>` (default) |
| Skip-to | `/wf-implement <slug> <slice-slug>` directly if plan is trivial |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start writing code, editing files, or implementing the plan you produce.
- Your job is to **produce execution-ready plans** by inspecting the repo and prior artifacts — not to execute them.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice-slug** or the keyword `all`. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it and all `03-slice-<slice-slug>.md` files it links to. If it does not exist, this is a single-scope workflow. Proceed with single-plan mode.
   - If any prerequisite shows `Status: Awaiting input` → STOP.
   - If `current-stage` in the index is already past plan → WARN before overwriting.
4. **Read** `02-shape.md`, `03-slice.md` (if exists), the relevant `03-slice-<slice-slug>.md` file(s), and `po-answers.md`.
4b. **Read design context if present** (optional):
   - `02b-design.md` — register, recommended references, anti-goals. Plan steps for UI work should reference the recommended design reference docs (e.g., "follow `skills/design/reference/typeset.md` for type scale").
   - `02c-craft.md` — visual contract. The `## Mock fidelity inventory` items must be reflected as concrete plan steps. The `## Implementation contract` lists token choices, component decisions, and motion specs the plan must follow. The plan should NOT contradict the visual contract; if it must, surface the conflict for resolution before implementation.
5. **Determine planning mode** (order matters — check top to bottom):

   **a) `all` with existing plans → review-all mode:**
   If second argument is `all` AND `04-plan.md` already exists with linked per-slice plans → **review-all mode**. Review every existing plan (using parallel sub-agents), fix issues found, update all plan files. See "Review-and-Fix Mode" below.

   **b) `all` without existing plans → parallel plan mode:**
   If second argument is `all` AND no plans exist yet → **parallel plan mode** (plan every slice using sub-agents).

   **c) Slice-slug with supplemental text → directed fix mode:**
   If second argument is a slice-slug AND there is supplemental text (third+ arguments) AND `04-plan-<slice-slug>.md` exists → **directed fix mode**. Apply the explicit feedback to the existing plan. See "Review-and-Fix Mode" below.

   **d) Slice-slug with existing plan, no supplemental text → auto-review mode:**
   If second argument is a slice-slug AND `04-plan-<slice-slug>.md` already exists AND no supplemental text → **auto-review mode**. Self-review the plan against current codebase state and artifacts, find issues, fix them. See "Review-and-Fix Mode" below.

   **e) Slice-slug without existing plan → single plan mode:**
   If second argument is a slice-slug AND `04-plan-<slice-slug>.md` does NOT exist → **single plan mode**. Create the plan from scratch.

   **f) No second argument → infer:**
   Use `selected-slice-or-focus` from the index. If still missing and slices exist, choose the best first slice from `03-slice.md` or ask the user. Then apply rules (d) or (e) based on whether the plan exists.

   **g) No slices exist → single plan mode** for the entire shaped spec. If `04-plan.md` exists, treat as auto-review (d).

6. **Check for existing sibling plans:** Read any existing `04-plan-<other-slice>.md` files so the current plan can be aware of what's already planned for other slices.
7. **Carry forward** `open-questions` from the index.

# Purpose
Create repo-aware, slice-specific implementation plans after inspecting current code and current external guidance. Write per-slice plan files with cross-links to their slice definition, sibling plans, and future implementation files.

# Parallel research (use sub-agents for ALL planning)
Planning is research-intensive. Launch parallel sub-agents to gather information before writing the plan. Each sub-agent has its own skip criteria below — do not apply a blanket "trivial" exemption to skip all sub-agents. Skip criteria are per-agent and intentionally narrow.

**For single-plan mode — launch ALL of these in parallel:**

### Explore sub-agent 1 — Affected Code Deep Dive

Prompt the agent with ALL of the following. It must report findings for each section:

**Files & modules the slice will touch:**
- For each file listed in the slice definition's `## Likely Files / Areas to Touch`, read it and report: current size, key exports/classes/functions, recent git activity (`git log -5 --oneline <file>`)
- Identify which functions/methods will need modification vs. which are new
- Check for generated or auto-derived files that would be affected (types generated from schemas, ORM models from migrations, route tables from decorators)

**Call graph & dependency chain:**
- For each module the slice touches, trace **inbound callers** — use grep for imports/requires of that module across the codebase
- Trace **outbound dependencies** — what does the module import, call, or instantiate?
- Identify **shared state** — global variables, singletons, caches, database connections, event buses that the slice code participates in
- Map the request/data flow through the affected code: entry point → middleware/interceptors → handler → service → repository/store → response

**Existing patterns & conventions in the affected area:**
- Read 3–5 representative files in the same directory/module. Report: naming conventions (files, functions, variables, CSS classes), error handling pattern (try/catch, Result types, error middleware), dependency injection style, logging approach
- Check for linting rules, prettier config, or editorconfig that constrain code style
- Look for README or CONTRIBUTING docs in the affected directory

**Reuse opportunities:**
- Read the slice definition's `## Goal` and `## Scope (In)` sections. For each new function, class, utility, or capability the slice needs to implement, search the wider codebase for existing code that partially or fully covers the same need:
  - Grep for keywords, type names, and domain terms from the slice definition across the full codebase (not just the affected directory)
  - Search for similar logic: data transformations, validation routines, formatting utilities, API call wrappers, error handling patterns, and business rule checks that appear to overlap with what the slice needs to build
  - Look for base classes, mixins, abstract types, or higher-order functions that could be extended or composed rather than reimplemented from scratch
  - Check existing services, helpers, and utility modules for methods that expose the needed capability under a different name or at a slightly different abstraction level
- For each candidate reuse opportunity found, report:
  - File path and function/class/method name
  - What it does and how closely it matches what the slice needs
  - Whether it would require modification for this slice — and if so, whether that modification would be backward-compatible with existing callers
  - Recommendation: **reuse as-is** / **reuse with modification** / **extract into shared utility then use** / **implement fresh** (with reason)
- If nothing relevant exists: state that explicitly — "No reuse candidates found for [capability]." Do not skip this section.

**Integration surfaces:**
- What events, hooks, callbacks, or pub/sub channels does the affected area participate in?
- What middleware, interceptors, decorators, or higher-order wrappers exist on the affected code path?
- What configuration (env vars, config files, feature flags) controls the affected behavior?
- Are there database migrations, schema files, or seed data that would need updating?

### Explore sub-agent 2 — Second Domain (only if the slice crosses domain boundaries)

Launch ONLY if the slice touches a second distinct domain (e.g., frontend + backend, CLI + library, API + worker, infra + application). Prompt with:

**Domain-specific structure:**
- Map the second domain's directory structure, entry points, and organizational pattern
- Identify the public API surface between the two domains (shared types, API contracts, message schemas, event definitions)
- Read 3–5 representative files in the second domain for conventions

**Cross-domain contract:**
- How do the two domains communicate? (HTTP API, gRPC, message queue, shared DB, file system, IPC)
- Where is the contract defined? (OpenAPI spec, protobuf files, TypeScript shared types, JSON schema)
- What happens if the contract changes? (breaking change propagation, versioning strategy, backward compatibility requirements)

### Explore sub-agent 3 — Test & Verification Infrastructure

Prompt the agent with ALL of the following:

**Test framework & configuration:**
- Identify the test framework(s) in use (Jest, Vitest, pytest, Go testing, etc.) and their configuration files
- Find test configuration: timeouts, parallelism settings, coverage thresholds, custom matchers/assertions

**Existing test coverage for the affected area:**
- Find all test files that cover the modules the slice will touch (grep for imports of affected modules in test files)
- Classify each test file: unit, integration, E2E, snapshot, contract
- Run the existing tests for the affected area if possible (`npm test -- --grep <pattern>`, `pytest -k <pattern>`, etc.) — report pass/fail/skip counts
- Identify **gaps**: which functions/branches in the affected area have NO test coverage?

**Test helpers & infrastructure:**
- List test factories, fixtures, builders, and mock utilities (file paths and what they provide)
- Identify test database setup/teardown patterns (in-memory DB, docker containers, test transactions, seed data)
- Check for test environment configuration (`.env.test`, test config files, CI-specific test settings)
- Look for shared test utilities that the new tests should reuse rather than reinvent

**Test patterns in use:**
- What assertion style is used? (expect/assert, BDD given/when/then, table-driven tests)
- How are mocks/stubs created? (jest.mock, sinon, dependency injection, test doubles)
- How are async operations tested? (async/await, done callbacks, fake timers, test servers)

**Interactive & visual verification tooling:**
- Is `dev-browser` installed? (`command -v dev-browser`) — preferred tool for web app interactive verification (sandboxed Playwright API, persistent pages, screenshots, `page.snapshotForAI()`). If not installed and the project is a web app, note this as a gap and recommend: `npm install -g dev-browser && dev-browser install`
- Identify E2E/UI test frameworks: Playwright (check `playwright.config.*`), Cypress (`cypress.config.*`), Maestro (`maestro/`, `.maestro/`, `*.yaml` flows), Detox, Appium
- Identify device/emulator tooling: Is `adb` available for Android? Is there an emulator configured? Are there connected device profiles?
- Are Chrome MCP tools available? (`mcp__claude-in-chrome__*` — fallback for web verification if dev-browser is not installed)
- Check for screenshot/visual regression infrastructure: Percy, Chromatic, Playwright `toHaveScreenshot()`, Maestro `assertVisible`/`takeScreenshot`, `adb shell screencap`
- Check for dev server / preview environment scripts: `npm run dev`, `npm run preview`, Android `./gradlew installDebug`, iOS build schemes
- Look for existing smoke test scripts, QA checklists, or manual test plans in the repo
- **Report which acceptance criteria from `02-shape.md` → `## Verification Strategy` need interactive verification and what tools are available to do it**

### Web research sub-agent — Dependencies & External Knowledge

**Launch this sub-agent for every slice.** Skip ONLY if ALL of the following are true for this slice:
- Pure refactoring (rename, extract, move) — zero dependency changes, zero new API surface
- OR config/env file changes only (no library usage changes)
- OR text/copy/i18n changes only

Do NOT skip because the slice "feels small" or "seems simple." Small slices frequently touch versioned dependencies or security-sensitive areas that need freshness checks. When in doubt: launch it.

Prompt the agent with ALL of the following:

**Dependency freshness:**
- Check the project's package manifest for versions of dependencies the slice touches
- Web search for the **latest stable version** of each — note if the project is behind and whether upgrading matters for this slice
- Check for **deprecation notices** or **breaking changes** between the project's version and current

**API & library patterns:**
- Web search for official documentation of each dependency/API the slice interacts with
- Verify that patterns in the codebase match the library's **recommended approach** for the project's version
- Check for **migration guides** if the slice involves upgrading or if the current version is approaching EOL

**Security & known issues:**
- Web search for recent CVEs or security advisories affecting dependencies the slice touches
- Check GitHub issues on relevant dependency repos for known bugs that could affect this slice
- Note any advisories that require specific mitigations in the plan

**Implementation best practices:**
- Web search for established patterns and community consensus on how to implement this slice's specific capability — look at official docs, framework guides, and opinionated style guides
- Search for known anti-patterns and common mistakes for this kind of implementation — especially on official docs, Stack Overflow, engineering blogs, and community posts
- Note any RFCs, platform specs, or framework conventions that prescribe the correct approach (e.g., framework-specific patterns, API design rules, mobile OS guidelines)
- Identify whether the approach currently implied by the plan is idiomatic, legacy, or considered an anti-pattern in the current ecosystem

**Known gotchas & performance pitfalls:**
- Web search for common performance issues specific to this implementation type (re-renders, N+1 queries, layout thrash, bundle size, memory leaks, cold-start latency, lock contention)
- Search for community reports of surprising behavior, subtle bugs, or edge cases in the libraries and APIs this slice uses
- Look for "lessons learned" or postmortem posts involving this kind of feature — these surface the non-obvious failure modes that acceptance criteria often miss
- Note any known limitations or required workarounds the plan steps should account for

Merge ALL sub-agent findings into the plan under `## Current State`, `## Likely Files / Areas to Touch`, and `## Freshness Research`. Best practices and gotcha findings should directly shape the implementation steps — surface them so the plan avoids known failure modes before any code is written.

**For parallel plan mode (`all`):**
Launch one sub-agent PER SLICE. Each sub-agent:
1. Receives: the slug, its slice-slug, the `03-slice-<slice-slug>.md` content, `02-shape.md` content, and the output path `.ai/workflows/<slug>/04-plan-<slice-slug>.md`.
2. Also receives: the list of all other slice-slugs so it can note dependencies.
3. Runs **all four exploration playbooks above** (affected code, second domain if applicable, test infrastructure, web research) scoped to its slice.
4. **Writes its plan directly to `.ai/workflows/<slug>/04-plan-<slice-slug>.md`** using the per-slice template below.

After ALL slice sub-agents complete:
1. **Read every `04-plan-<slice-slug>.md` file** they wrote.
2. **Cohesion check** — specifically look for:
   - Files that appear in multiple slice plans (shared modification conflict risk)
   - Database migrations or schema changes that conflict or must be ordered
   - Shared test fixtures or mocks that one slice creates and another assumes
   - API contract changes in one slice that break assumptions in another
   - Configuration or environment variable changes that interact
3. **Write/update the master `04-plan.md`** with summaries, cross-cutting concerns, and recommended implementation order.
4. **Update cross-links** in each per-slice plan to reference sibling plans.
5. If cohesion issues are severe, flag them and recommend revisiting `/wf-slice` before implementing.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <paths>` (list all plan files written)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Determine planning mode from Step 0.
2. **Discovery phase (new plans only — skip for review-and-fix modes):**
   Before writing a plan, interview the user about implementation decisions that the shape and slice left open. Ask 8–12 questions across 2–3 rounds using AskUserQuestion (up to 4 per round).

   **Rules:**
   - Every question must be about *how to build this specific feature/slice* — reference files, modules, patterns, and tradeoffs discovered by the sub-agents.
   - Do not re-ask anything already decided in shape or slice artifacts. Pre-fill known decisions and confirm only if the sub-agent findings contradict them.
   - Questions must be impartial — present genuinely different implementation approaches, not a "right answer" with decoys.
   - Later rounds should build on earlier answers and sub-agent findings.

   **What to ask about:**
   - **Implementation approach** — When the sub-agents found multiple viable patterns in the codebase, ask which to follow. When there's a choice between extending existing code vs. writing new code, surface that tradeoff. When a library offers multiple APIs for the same thing, ask which fits.
   - **Sequencing and dependencies** — When steps could go in different orders, ask what the user wants first. When there are circular dependencies between slices, ask how to break the cycle. When a migration or schema change could happen early or late, surface the tradeoff.
   - **Test strategy** — When the sub-agents found gaps in test coverage, ask what level of testing the user wants. When there's a choice between unit tests, integration tests, or E2E tests for a behavior, ask which matters most. When existing test patterns don't cover the new case well, ask about the approach.
   - **Risk and unknowns** — When the sub-agents found deprecations, version mismatches, or security advisories, ask how to handle them. When an assumption in the shape might not hold based on codebase reality, surface it. When a step has unclear feasibility, ask whether to spike first or commit to the approach.

   Append every answer to `po-answers.md` with timestamp and `stage: plan`.

3. **Single plan mode (new):** Inspect the repository using parallel Explore sub-agents. Run freshness research. Run the discovery phase. Produce a minimal execution-ready plan. Write `04-plan-<slice-slug>.md`. Update master `04-plan.md`.
4. **Parallel plan mode (new, all):** Launch one sub-agent per slice. Wait for all to complete. Read their output files. Run the cohesion check. Run the discovery phase (once, covering cross-cutting decisions). Write/update master `04-plan.md`. Update cross-links.
5. **Review-and-fix mode (any sub-mode):** See "Review-and-Fix Mode" section below.
6. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` accordingly and add all plan files to `workflow-files`.
8. Write plan file(s).

# Review-and-Fix Mode
Triggered when an existing plan is re-invoked. Three sub-modes:

## Sub-mode: Directed Fix (explicit feedback)
**Trigger:** `/wf-plan <slug> <slice-slug> <feedback text>`
**Example:**
- `/wf-plan my-slug auth-flow use OAuth2 PKCE instead of basic auth`
- `/wf-plan my-slug data-model migration must run before API endpoint`

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Parse the feedback** from the supplemental text.
3. **Re-inspect the codebase** if the feedback changes which files or patterns are relevant (use Explore sub-agents).
4. **Apply the feedback surgically** — edit only the sections that need changing. Preserve everything that is still correct. Do NOT start from scratch unless the feedback is a complete rejection.
5. **Append to `## Revision History`** (create the section if it doesn't exist):
   - Revision timestamp
   - Mode: Directed Fix
   - Feedback: the exact text the user provided
   - What was changed and why
6. **Re-check cohesion** with sibling plans if the changes affect cross-slice dependencies.
7. **Update the master `04-plan.md`** summary for this slice if the strategy or key risks changed.
8. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Auto-Review (self-review, single slice)
**Trigger:** `/wf-plan <slug> <slice-slug>` (no supplemental text, plan already exists)
**Example:**
- `/wf-plan my-slug auth-flow` ← plan exists, no feedback = auto-review

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Re-inspect the codebase** using Explore sub-agents. Compare current codebase state to what the plan assumed — look for:
   - Files that moved, were renamed, or were deleted since the plan was written
   - New code that appeared (e.g., a sibling slice was implemented) that affects this plan
   - Dependency version changes, new deprecations, or API drift
3. **Read the slice definition** (`03-slice-<slice-slug>.md`) and shaped spec (`02-shape.md`). Check for:
   - Plan steps that don't align with acceptance criteria
   - Missing steps that the acceptance criteria require
   - Ordering issues (dependencies that should come earlier)
   - Overengineering (steps that go beyond what the spec requires)
   - Missing test/verification coverage for acceptance criteria
4. **Read sibling plans** (`04-plan-<other>.md`). Check for:
   - New conflicts (e.g., sibling plan now touches the same files)
   - Integration gaps that weren't visible before
   - Duplicated work between plans
5. **Produce a review summary** listing issues found (if any) with severity.
6. **Fix the issues** found — edit the plan sections that need changing.
7. **Append to `## Revision History`**:
   - Revision timestamp
   - Mode: Auto-Review
   - Issues found: {count} — {list of what was wrong}
   - What was changed
8. If NO issues were found, append: "Auto-review: no issues found. Plan is current." and leave the plan unchanged.
9. **Update the master `04-plan.md`** if anything changed.
10. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Review-All (self-review, all slices)
**Trigger:** `/wf-plan <slug> all` (plans already exist for all slices)
**Example:**
- `/wf-plan my-slug all` ← plans exist = review-all

Steps:
1. **Read `04-plan.md`** (master index) and every `04-plan-<slice-slug>.md`.
2. **Launch one review sub-agent PER SLICE** in parallel. Each sub-agent:
   a. Reads its `04-plan-<slice-slug>.md`, the corresponding `03-slice-<slice-slug>.md`, and `02-shape.md`.
   b. Re-inspects the codebase for its slice's scope.
   c. Checks the plan against acceptance criteria, current codebase state, and feasibility.
   d. Returns a list of issues found (or "no issues").
3. **Wait for all sub-agents to complete.** Collect their findings.
4. **Cross-plan cohesion check:** With all findings in hand, check for cross-slice issues:
   - Conflicting assumptions between slice plans
   - Integration gaps
   - Ordering problems
   - Duplicated work
5. **Fix all issues found** — update each affected `04-plan-<slice-slug>.md`.
6. **Append to `## Revision History`** in each modified plan file.
7. **Update the master `04-plan.md`** — update summaries, cross-cutting concerns, conflicts.
8. Write all updated files.
9. **Report:** In the chat return, list which plans were updated and which were clean.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the plan(s) and present ALL viable options:

**Option A (default): Implement** → `/wf-implement <slug> <slice-slug>`
Use when: The plan is complete and ready for execution.
**Compact recommended before proceeding** — planning research (alternatives, web searches, codebase exploration) is noise for implementation. Tell the user: "Consider running `/compact` before `/wf-implement` — the PreCompact hook will preserve workflow state."

**Option B: Implement all (sequential)** → start with `/wf-implement <slug> <first-slice-slug>`
Use when: All slices are planned and the user wants to work through them in order.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Slice** → `/wf-slice <slug>`
Use when: Planning revealed that slice boundaries are wrong.

**Option D: Revisit Shape** → `/wf-shape <slug>`
Use when: Planning revealed the spec is incomplete or contradictory.

---

Write `04-plan.md` (master index):

```yaml
---
schema: sdlc/v1
type: plan-index
slug: <slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
planning-mode: <single|all>
slices-planned: <N>
slices-total: <N>
implementation-order: [<slice-slug>, <slice-slug>, ...]
conflicts-found: <N>
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
next-command: wf-implement
next-invocation: "/wf-implement <slug> <first-slice-slug>"
---
```

# Plan Index

## Slice Plan Summaries
### `<slice-slug>`
- Files to touch: ...
- Strategy: ...
- Key risk: ...

## Cross-Cutting Concerns
- ...

## Integration Points Between Slices
- ...

## Recommended Implementation Order
1. `<slice-slug>` — [reason]

## Conflicts Found
- ...

## Freshness Research

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <first-slice-slug>` — [reason]
- **Option B:** `/wf-slice <slug>` — revisit slices [reason, if cohesion issues]

---

Write `04-plan-<slice-slug>.md` (per-slice plan):

```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <N>
metric-step-count: <N>
has-blockers: false
revision-count: 0
tags: []
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-<slice-slug>.md
  siblings: [04-plan-<other>.md, ...]
  implement: 05-implement-<slice-slug>.md
next-command: wf-implement
next-invocation: "/wf-implement <slug> <slice-slug>"
---
```

# Plan: <slice-name>

## Current State

## Reuse Opportunities
<!-- From Explore sub-agent 1 reuse scan. Format per candidate:
- `path/to/file.ts` → `functionName()` — what it does, match quality, recommendation (reuse as-is / modify / extract / implement fresh)
If none found: "No reuse candidates identified." -->

## Likely Files / Areas to Touch
- path/or/module: why

## Proposed Change Strategy

## Step-by-Step Plan
1. ...

## Test / Verification Plan

### Automated checks
- lint/typecheck: ...
- unit tests: ...
- integration tests: ...

### Interactive verification (human-in-the-loop)
For each acceptance criterion tagged `interactive` in the shape's verification strategy:
- **What to verify**: describe the user-visible behavior
- **Platform & tool**: Android (adb + Maestro) / Web (Playwright / browser automation) / iOS / Desktop / CLI
- **Steps**: exact commands or tool invocations to run the app, navigate to the feature, and observe the behavior
- **Evidence capture**: how to capture proof it works — screenshot (`adb shell screencap`, Playwright `page.screenshot()`, Maestro `takeScreenshot`), screen recording, console output, network trace
- **Pass criteria**: what the screenshot/output must show for this to be considered verified

If no interactive verification needed: "Automated only — [reason]"

## Risks / Watchouts
- ...

## Dependencies on Other Slices
- ...

## Assumptions
- ...

## Blockers
- ...

## Freshness Research

## Revision History
*(appended by review-and-fix mode)*

## Recommended Next Stage
- **Option A (default):** `/wf-implement <slug> <slice-slug>` — [reason]
