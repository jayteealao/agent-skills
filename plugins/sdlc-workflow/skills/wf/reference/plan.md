---
description: Create or review-and-fix implementation plans. First invocation creates plans. Re-invocation auto-reviews against current codebase and artifacts, fixes issues found. Supports single slice, all slices (parallel), or explicit feedback.
argument-hint: <slug> [slice-slug|all] [review/fix instructions]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `wf-plan`, **stage 4 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` + `03-slice-<slice-slug>.md` (if slices exist) |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief — visual surface scope and recommended references MUST be reflected in plan steps; **if it exists and `02c-craft.md` does not, plan AUTHORS the visual contract** — see *Design-contract authoring* below), `02c-craft.md` (visual contract — plan MUST include explicit steps to honor every mock fidelity inventory item and the implementation contract) |
| Produces | `04-plan.md` (master) + `04-plan-<slice-slug>.md` per planned slice + (when a design brief exists without a contract) `02c-craft.md` — the **visual contract** |
| Next | `/wf implement <slug> <slice-slug>` (default) |
| Skip-to | `/wf implement <slug> <slice-slug>` directly if plan is trivial |

> **Auto second opinion.** After the plan is written, **auto-invoke** `/consult codex
> <question about this plan>` (pin `codex`/`claude` to stay free) whenever the plan
> carries real risk or ambiguity — fan out a read-only critique panel and embed it
> next to the plan artifact. Skip it for a trivial plan. The user may also invoke it
> explicitly with any provider.

> **Plan against the real API, not the remembered one.** When plan steps will call
> into a dependency, framework, or SDK, invoke the `study-sources` skill to read its
> **actual installed source** first, so each step cites real signatures, real
> extension points, and version-correct behavior instead of a guessed API. Especially
> worth it when the Explore sub-agents surface a library the plan leans on heavily, or
> when `stack:` pins a version that may differ from what you recall. Reads land in
> gitignored `.scratch/`; the plan stays the only written artifact.

> **A limitation claim carries its evidence.** Any plan step that asserts a dependency
> capability DOES NOT EXIST — not exposed, removed, broke, "the API can't do X" — must
> cite evidence in the same artifact: a `study-sources` read of the **installed** source
> (name the `node_modules/` or vendored path actually opened), a failing minimal repro,
> or an upstream issue link. An uncited absence-claim is a guess, and a guess sends the
> plan around a wall that may not exist.
> 1. **Comments are hypotheses.** An existing in-repo comment claiming a limitation is
>    NEVER sufficient authority to plan a workaround around it — re-verify the premise
>    first (one `study-sources` read; the skill exists for exactly this).
> 2. **Recalled API shapes never justify `as any` / `@ts-ignore` alone.** If the plan
>    anticipates a suppression, the plan step must cite the type actually read from the
>    installed package, or the mismatch repro — not a remembered signature.
> A warn-only hook (`limitationClaimLint`) flags an uncited limitation comment at write
> time; the citation markers it looks for are `source:` / `node_modules/` / `repro:` /
> `issue:` / a URL within ±3 lines.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT write code, edit files, or implement the plan you produce.
- Your job is to **produce execution-ready plans** by inspecting the repo and prior artifacts — not to execute them.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice-slug** or the keyword `all`. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it and all `03-slice-<slice-slug>.md` files it links to. If it does not exist, this is a single-scope workflow. Proceed with single-plan mode.
   - If any prerequisite shows `Status: Awaiting input` → STOP.
   - **Stack gate (do NOT silently re-detect):** Inspect the `stack:` block in `00-index.md`.
     - If the block is **missing entirely** → STOP. Tell the user: "Step 0.5 stack fingerprint is missing from `00-index.md`. Re-run `/wf intake <slug>` to capture it; planning's verification tooling decisions depend on it." Do NOT attempt to re-detect the stack inside plan — sub-agent 3 below MUST read from `stack:`, not from a fresh repo scan.
     - If `stack.user-confirmed: false` → WARN: "`stack:` was auto-detected but not PO-confirmed. The plan's interactive verification may pick tooling the PO does not want. Re-run intake's Batch B confirmation, or proceed and accept the risk?" Use AskUserQuestion if available. If the user proceeds, mark `stack-source: unconfirmed-auto-detect` in the plan's frontmatter so downstream stages know.
     - If `stack.user-confirmed: true` → proceed. Sub-agent 3 and the plan's interactive verification template both consume this confirmed block as their source of truth.
   - If `current-stage` in the index is already past plan → WARN before overwriting.
4. **Read** `02-shape.md`, `03-slice.md` (if exists), the relevant `03-slice-<slice-slug>.md` file(s), and `po-answers.md`.
4b. **Read design context — mandatory when present** (file existence is optional; consumption is required for any UI/visual-design work). `plan` is the design consumer that *cites it*: the union-loader turns each recommended reference into a concrete plan-step pointer, and the plan carries the register and anti-goals forward. **Baseline design canon (even with no design artifact):** when `stack.ui ≠ ∅`, also load `skills/wf/reference/design/_design-context.md` for the register, shared design laws, absolute bans, and the motion/interface-detail summary — the design floor for any UI work, applied even when neither `02b`/`02c` exists. `_design-context.md` carries the floor and a craft *summary*: when the feature touches motion, interface detail, or typography, also load the specific home (`animate.md` / `polish.md` / `typeset.md`) for the actual rules. Use only those sections; its preflight/image/mutation sections govern `/wf design`, not plan. Gate: if `stack.ui` is empty and no design artifacts exist, skip this step.
   - `02b-design.md` — register, recommended references, anti-goals.
   - `02c-craft.md` — **visual contract. If the file exists you MUST read it.** The `## Mock fidelity inventory` items must be reflected as concrete plan steps. The `## Implementation contract` lists token choices, component decisions, and motion specs the plan must follow. The plan should NOT contradict the visual contract; if it must, surface the conflict for resolution before implementation.
   - **Design references — union of both files.** Build the reference set from BOTH `recommended-references:` in `02b-design.md`'s frontmatter AND `references-loaded:` in `02c-craft.md`'s frontmatter. Normalize each by stripping a trailing `.md` before de-duplicating. Plan steps for UI work MUST cite each as a pointer (e.g., "follow `skills/wf/reference/design/typeset.md` for type scale"); each resolves to `skills/wf/reference/design/<name>.md`. References the contract step introduced live only in `02c` — reading `02b` alone silently drops them, so always union the two.
4c. **Author the visual contract — mandatory when a design brief exists without one.** If `02b-design.md` exists AND `02c-craft.md` does **not** yet exist, `plan` is the design **producer**: it resolves the two gates `shape` deferred (image gate + visual-direction confirm gate) and writes `02c-craft.md` following [design/contract.md](design/contract.md) — land the visual direction via the `imagery` skill, build the mock fidelity inventory, write `02c-craft.md` (type `design-contract`) **and** its sibling `.yaml` + `.html.fragment`. **Timing:** this is *not* done here in Step 0 — it runs inside the planning sequence below, **after** the parallel Explore sub-agents have gathered codebase context (which `design/contract.md` Step 2 consumes) and **before** you produce the plan steps, so the contract's mock-fidelity inventory and implementation-contract decisions become concrete plan steps (Step 4b consumption). If `02c-craft.md` already exists, do not re-author it — just consume it per Step 4b. If `stack.ui` is empty or no `02b-design.md` exists, skip this step.
4d. **Apply the augmentation plan — author the augmentation artifacts shape decided.** Read
   `augmentations-needed` from `02-shape.md` frontmatter (absent/`[]` → skip this step entirely). This is
   where the former standalone `/wf instrument | experiment | benchmark` commands live now: augmentation
   is *shape-decided and plan-authored*, not user-invoked. For each entry, load its sub-procedure and run
   it as an internal step, then record it in `00-index.md` so `implement`/`verify` consume it:
   - `instrument` → load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/augment/instrument.md`; author `04b-instrument.md` (dark-path detection + signal design). Fold the signals into the plan steps.
   - `experiment` → load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/augment/experiment.md`; author `04c-experiment.md` (hypothesis, A/B/flag/canary, metrics, rollback). Fold the flag/cohort wiring into the plan steps.
   - `benchmark` → load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/augment/benchmark.md` (baseline mode); capture the pre-implementation baseline into `05c-benchmark.md`. Add an explicit "compare after implement" step so `verify` re-runs it against the tripwires (>10% CPU / >25% memory).
   - `profile` → usually ad-hoc; if shape flagged a specific hotspot, note it as a plan step (it can be run later via `/wf probe` or `augment/profile.md`), not a required pre-implementation artifact.
   - **Record into `00-index.md`:** add each authored augmentation to the `augmentations:` list (consumed by `implement` Step 0.7 and `verify` Step 0.6). Without this, the shape decision authors artifacts no stage reads.
   - **Timing:** like the design contract (4c), run this inside the planning sequence (after the Explore sub-agents gather context) so augmentation requirements become concrete plan steps.

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
Create repo-aware, slice-specific implementation plans after inspecting current code and external guidance. Write per-slice plan files with cross-links to their slice definition, sibling plans, and future implementation files.

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

**Build-avoidance ladder (climb before proposing any new code):**
For each capability the slice needs, climb these rungs and record the highest that holds. Scope existence is settled upstream in shape's Round 5; do not re-litigate here. This is the implementation-strategy ladder:
1. **Stdlib / language built-in** — does the language or standard library already do this? (e.g., `structuredClone`, `Intl`, `URL`, `crypto.randomUUID`, `Array.prototype` methods over a utility lib.)
2. **Native platform feature** — does the runtime, browser, framework, or OS already provide it? (e.g., `<input type="date">` over a date-picker library, CSS `scroll-snap` over a carousel dependency, a DB unique constraint over a hand-rolled existence check.) The web-research sub-agent checks official docs for these.
3. **Already-installed dependency or in-repo utility** — the reuse scan below.
4. **Minimum new code** — only when rungs 1–3 do not cover the capability; record *why* the lower rungs did not hold.

Pick the highest rung that meets the acceptance criteria; never trade an edge-case-correct built-in for a flimsier hand-rolled one. Record the outcome per capability in the plan's `## Simplicity Ladder` section.

**Rung 3 — reuse opportunities:**
- Read the slice definition's `## Goal` and `## Scope (In)`. For each new function, class, utility, or capability the slice needs, search the wider codebase for existing code that partially or fully covers the need:
  - Grep for keywords, type names, and domain terms across the full codebase (not just the affected directory)
  - Search for similar logic: data transformations, validation routines, formatting utilities, API call wrappers, error handling patterns, and business rule checks that overlap with what the slice builds
  - Look for base classes, mixins, abstract types, or higher-order functions that could be extended or composed
  - Check existing services, helpers, and utility modules for methods that expose the needed capability under a different name or at a different abstraction level
- For each candidate found, report:
  - File path and function/class/method name
  - What it does and how closely it matches the slice's need
  - Whether modification would be backward-compatible with existing callers
  - Recommendation: **reuse as-is** / **reuse with modification** / **extract into shared utility then use** / **implement fresh** (with reason)
- If nothing exists: state explicitly — "No reuse candidates found for [capability]." Do not skip this section.

**Learnings scan (solutions corpus — runs alongside the reuse scan):**
- Read `.ai/solutions/INDEX.md` if it exists. Match the slice's `## Goal` / `## Scope (In)` keywords against the index hooks; load matching files (typically 0–3) and use their `tags:` for a second-pass match.
- For each match report: its path, the learning in one line, and **what this plan does differently because of it** — a learning that changes nothing is a non-match.
- If the index does not exist or nothing matches, report "No applicable learnings found." Results land in the plan's `## Applied Learnings` section.

**Repeat-deferral tripwire (scan the slug's runtime-evidence-deferrals):**
- Read `00-index.md` → `runtime-evidence-deferrals`. If an existing entry's defer-reason fuzzy-matches an environment dependency this slice's `## Verification Strategy` will also name (same credential wall, device class, missing service), the slug is about to pay the same wall twice.
- The plan MUST then either **scope the harness that retires the wall** (the force-scope rule's prerequisite-slice/harness option) or record an explicit PO decision not to (`harness-declined: <reason>` under the AC's row). Silence is non-compliant — repeated walls are amortized into infrastructure or declined on the record, never re-paid by default.

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
- Read 3–5 representative files for conventions

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

Read the `stack:` block from `00-index.md` (written by intake Step 0.5 and confirmed by the PO in Batch B). That block is the source of truth — do NOT re-derive recommendations from a fresh repo scan, and do NOT propose installing new tools without going back through shape. This sub-agent **describes how `stack:`-listed tooling will be wired into this slice's verification**, not re-picks it.

1. **Quote the confirmed stack.** Restate `stack.platforms`, `stack.testing`, `stack.observability`, and any relevant `stack.available-skills` / `stack.available-mcp` entries verbatim from `00-index.md`. If `stack-source: unconfirmed-auto-detect`, note: "Stack was not PO-confirmed; verification tooling assumptions are advisory."
2. **Map the confirmed adapter to in-repo wiring.** For each platform in `stack.platforms`, locate the matched runtime adapter in [runtime-adapters.md](runtime-adapters.md) and confirm the slice's verification will use its drivers. Examples (drive from `stack:`, not this list):
   - `platforms: [web]` + `stack.testing: [playwright]` → use the in-repo Playwright suite for E2E; for ad-hoc interactive runs, use whatever driver the PO selected in shape.
   - `platforms: [android]` + `stack.testing: [maestro]` → use existing `.maestro.yaml` flows; companion skills from `stack.available-skills` (e.g., `lazylogcat`) for log evidence if listed.
   - `platforms: [ios]` + `stack.testing: [xcuitest]` → use existing XCUITest schemes; fall back to simctl only if criteria require flows the suite doesn't cover.
3. **Surface what's missing — and resolve it in `## Verification Strategy`.** If an acceptance criterion needs a verification capability that `stack:` does not cover (e.g., visual regression with no Percy/Chromatic), do NOT auto-recommend installing it, and do NOT leave it to verify to improvise. Record the resolution per-AC as one of: (a) **add it to the stack** → route back through shape; or (b) **authorize a verify-time bootstrap** → a PO-approved install step verify will execute. Tool-absence is settled *here*, so verify never hits an unplanned wall.
4. **Confirm the dev/preview entry point.** Record the exact command (`npm run dev`, `./gradlew installDebug`, `xcodebuild`, etc.) the plan's verification steps will invoke. Read it from `package.json` / `build.gradle*` / `Cargo.toml` / etc.
5. **Report which acceptance criteria need interactive verification and how the confirmed stack covers each one.** If a criterion needs tooling outside `stack:`, list it as a blocker rather than silently filling the gap.

Anti-pattern to avoid: rerunning the shape's "what driver should we use?" question. If the PO answered it in shape, the plan executes against that answer. If missing, route back to shape — do not silently pick.

### Web research sub-agent — Dependencies & External Knowledge

**Launch this sub-agent for every slice.** Skip ONLY if ALL of the following are true:
- Pure refactoring (rename, extract, move) — zero dependency changes, zero new API surface
- OR config/env file changes only (no library usage changes)
- OR text/copy/i18n changes only

Do NOT skip because the slice "feels small." Small slices frequently touch versioned dependencies or security-sensitive areas. When in doubt: launch it.

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
- **Build-avoidance check (ladder rungs 1–2):** before endorsing any new dependency or hand-rolled implementation, search the language standard library and platform/framework docs for a built-in — a native input type, a stdlib function, a framework primitive, a platform API. Report the built-in when one exists; only fall through when it genuinely does not meet the acceptance criteria.
- Web search for established patterns and community consensus on implementing this slice's specific capability — official docs, framework guides, opinionated style guides
- Search for known anti-patterns and common mistakes — official docs, Stack Overflow, engineering blogs, community posts
- Note any RFCs, platform specs, or framework conventions that prescribe the correct approach
- Identify whether the approach implied by the plan is idiomatic, legacy, or an anti-pattern in the current ecosystem

**Known gotchas & performance pitfalls:**
- Web search for common performance issues (re-renders, N+1 queries, layout thrash, bundle size, memory leaks, cold-start latency, lock contention)
- Search for community reports of surprising behavior, subtle bugs, or edge cases in the libraries and APIs this slice uses
- Look for "lessons learned" or postmortem posts — these surface non-obvious failure modes acceptance criteria often miss
- Note any known limitations or required workarounds the plan steps should account for

Merge ALL sub-agent findings into the plan under `## Current State`, `## Likely Files / Areas to Touch`, and `## Freshness Research`. Best practices and gotcha findings should directly shape the implementation steps.

**For parallel plan mode (`all`):**
Launch one sub-agent PER SLICE. Each sub-agent:
1. Receives: the slug, its slice-slug, the `03-slice-<slice-slug>.md` content, `02-shape.md` content, and the output path `.ai/workflows/<slug>/04-plan-<slice-slug>.md`.
2. Also receives: the list of all other slice-slugs so it can note dependencies.
3. Runs **all four exploration playbooks above** scoped to its slice.
4. **Writes its plan directly to `.ai/workflows/<slug>/04-plan-<slice-slug>.md`** using the per-slice template below.
5. **Writes the rich siblings `04-plan-<slice-slug>.yaml` and `04-plan-<slice-slug>.html.fragment`** next to that `.md`, following **Step F** below. This is the **sub-agent's** job — the orchestrator never re-opens each slice to backfill them. The `post-write-verify` hook **BLOCKS** the `.md` write when the sibling `.yaml` is missing, so write the `.yaml` first (or in the same turn). If a slice's plan has no file-change topology to project, set `fragment: none` in the plan frontmatter. **Each per-slice sub-agent prompt MUST include Step F verbatim (or a link to it) — a sub-agent told only to "write the plan .md" will silently skip the siblings and the page renders as plain prose.**

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
5. If cohesion issues are severe, flag them and recommend revisiting `/wf slice` before implementing.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter; the markdown body is human-readable narrative only.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash for `created-at` / `updated-at`. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Construct every question per [_question-craft.md](_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read and honor it — silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Plan` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (list all plan files written)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Determine planning mode from Step 0.
2. **Discovery phase (new plans only — skip for review-and-fix modes):**
   Before writing a plan, interview the user about implementation decisions the shape and slice left open. Ask 8–12 questions across 2–3 rounds using AskUserQuestion (up to 4 per round).

   **Rules:**
   - Every question must be about *how to build this specific feature/slice* — reference files, modules, patterns, and tradeoffs discovered by sub-agents.
   - Do not re-ask anything decided in shape or slice artifacts. Pre-fill known decisions and confirm only if sub-agent findings contradict them.
   - Questions must be impartial — present genuinely different implementation approaches, not a "right answer" with decoys.
   - Later rounds build on earlier answers and sub-agent findings.
   - **Legibility ([_question-craft.md](_question-craft.md)) is mandatory here more than anywhere.** Plan questions are the most technical in the lifecycle — assume the PO has never opened the codebase: frame each decision in outcome terms first, gloss every technical term, describe options by consequence (effort, risk, what gets harder later), state reversibility, mark a recommendation with its reason, and say which option is safe if unsure. A question the PO can only answer by guessing produces a plan built on a guess.
   - **A decision that touches a `carried` intent-risk is intent-bearing — never auto-resolve it.** If a planning decision resolves an intent-risk (RIM) that `00-index.md`'s `intent-risks` still marks `status: carried` (one shape could not settle and deferred to a named later stage), it is by definition intent-bearing: ask the PO here (human-gated run), never settle it by an autonomous policy. On an autonomous run it is a **stop condition**, not an assumption to fill. The carried-RIM case is one instance of the general boundary in [_decision-classes.md](_decision-classes.md) — apply that taxonomy to classify every autonomous-vs-ask fork. A recorded autonomous decision carries a mandatory `class: implementation-detail` stamp; an autonomous record may NEVER carry `class: intent-bearing` (writing one is the tell that the policy overstepped).

   **What to ask about:**
   - **Implementation approach** — When sub-agents found multiple viable patterns, ask which to follow. When there's a choice between extending existing code vs. writing new, surface that tradeoff. When a library offers multiple APIs, ask which fits.
   - **Sequencing and dependencies** — When steps could go in different orders, ask what the user wants first. When there are circular slice dependencies, ask how to break the cycle. When a migration could happen early or late, surface the tradeoff.
   - **Test strategy** — When sub-agents found coverage gaps, ask what level of testing the user wants. When there's a unit/integration/E2E choice, ask which matters most. When existing test patterns don't cover the new case, ask about the approach.
   - **Risk and unknowns** — When sub-agents found deprecations, version mismatches, or security advisories, ask how to handle them. When a shape assumption may not hold based on codebase reality, surface it. When a step has unclear feasibility, ask whether to spike first.

   Append every answer to `po-answers.md` with timestamp and `stage: plan`.

3. **Single plan mode (new):** Inspect the repository using parallel Explore sub-agents. Run freshness research. Run the discovery phase. **Then, if a design brief exists without a contract (Step 4c), author the visual contract now** — codebase context is in hand, and the plan steps must reflect it. Produce a minimal execution-ready plan. Write `04-plan-<slice-slug>.md`. Update master `04-plan.md`.
4. **Parallel plan mode (new, all):** Launch one sub-agent per slice. Wait for all to complete. Read their output files. Run the cohesion check. Run the discovery phase (once, covering cross-cutting decisions). Write/update master `04-plan.md`. Update cross-links.
5. **Review-and-fix mode (any sub-mode):** See "Review-and-Fix Mode" section below.
6. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
7. Update `00-index.md` and add all plan files to `workflow-files`.
8. Write plan file(s).

# Review-and-Fix Mode
Triggered when an existing plan is re-invoked. Three sub-modes:

## Sub-mode: Directed Fix (explicit feedback)
**Trigger:** `/wf plan <slug> <slice-slug> <feedback text>`
**Example:**
- `/wf plan my-slug auth-flow use OAuth2 PKCE instead of basic auth`
- `/wf plan my-slug data-model migration must run before API endpoint`

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Parse the feedback** from the supplemental text.
3. **Re-inspect the codebase** if the feedback changes which files or patterns are relevant (use Explore sub-agents).
4. **Apply the feedback surgically** — edit only the sections that need changing. Preserve what is still correct. Do NOT start from scratch unless the feedback is a complete rejection. The body stays current truth — do not append a `## Revision N` section.
5. **Snapshot + ledger entry** per [_additive-write.md](_additive-write.md): byte-copy the pre-edit file to `history/04-plan-<slice-slug>-<rev>.md`, then append one `revisions:` entry — `trigger: review-feedback`, `because:` the exact feedback text (trimmed to a phrase), `changed:` what moved. Bump `revision-count`.
6. **Re-check cohesion** with sibling plans if the changes affect cross-slice dependencies.
7. **Update the master `04-plan.md`** summary if strategy or key risks changed.
8. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Auto-Review (self-review, single slice)
**Trigger:** `/wf plan <slug> <slice-slug>` (no supplemental text, plan already exists)
**Example:**
- `/wf plan my-slug auth-flow` ← plan exists, no feedback = auto-review

Steps:
1. **Read the existing `04-plan-<slice-slug>.md`** in full.
2. **Re-inspect the codebase** using Explore sub-agents. Compare current state to what the plan assumed — look for:
   - Files that moved, were renamed, or were deleted since the plan was written
   - New code that appeared (e.g., a sibling slice was implemented) that affects this plan
   - Dependency version changes, new deprecations, or API drift
3. **Read the slice definition** (`03-slice-<slice-slug>.md`) and shaped spec (`02-shape.md`). Check for:
   - Plan steps that don't align with acceptance criteria
   - Missing steps that the acceptance criteria require
   - Ordering issues (dependencies that should come earlier)
   - Overengineering (steps that go beyond the spec; new code where the build-avoidance ladder shows a stdlib, native-platform, or reuse option was available)
   - Missing test/verification coverage for acceptance criteria
4. **Read sibling plans** (`04-plan-<other>.md`). Check for:
   - New conflicts (e.g., sibling plan now touches the same files)
   - Integration gaps not visible before
   - Duplicated work between plans
5. **Produce a review summary** listing issues found (if any) with severity.
6. **Fix the issues** — edit the plan sections that need changing (body stays current truth).
7. **Snapshot + ledger entry** per [_additive-write.md](_additive-write.md): `trigger: manual` (self-review), `because: "auto-review — {count} issues found"`, `changed:` what moved. Bump `revision-count`.
8. If NO issues were found, this is a **no-op re-run**: leave the file byte-for-byte unchanged, write no snapshot and no ledger entry, and report "Auto-review: no issues found. Plan is current." in the chat return.
9. **Update the master `04-plan.md`** if anything changed.
10. Write the updated `04-plan-<slice-slug>.md`.

## Sub-mode: Review-All (self-review, all slices)
**Trigger:** `/wf plan <slug> all` (plans already exist for all slices)
**Example:**
- `/wf plan my-slug all` ← plans exist = review-all

Steps:
1. **Read `04-plan.md`** (master index) and every `04-plan-<slice-slug>.md`.
2. **Launch one review sub-agent PER SLICE** in parallel. Each sub-agent:
   a. Reads its `04-plan-<slice-slug>.md`, the corresponding `03-slice-<slice-slug>.md`, and `02-shape.md`.
   b. Re-inspects the codebase for its slice's scope.
   c. Checks the plan against acceptance criteria, current codebase state, and feasibility.
   d. Returns a list of issues found (or "no issues").
3. **Wait for all sub-agents.** Collect their findings.
4. **Cross-plan cohesion check:** With all findings in hand, check for:
   - Conflicting assumptions between slice plans
   - Integration gaps
   - Ordering problems
   - Duplicated work
5. **Fix all issues found** — update each affected `04-plan-<slice-slug>.md` (body stays current truth).
6. **Snapshot + ledger entry** in each *modified* plan file per [_additive-write.md](_additive-write.md) (`trigger: manual`, `because: "review-all pass"`). Unchanged plans are no-ops — no snapshot, no ledger entry.
7. **Update the master `04-plan.md`** — summaries, cross-cutting concerns, conflicts.
8. Write all updated files.
9. **Report:** In the chat return, list which plans were updated and which were clean.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the plan(s) and present ALL viable options:

**Option A (default): Implement** → `/wf implement <slug> <slice-slug>`
Use when: The plan is complete and ready for execution.
**Compact recommended** — planning research (alternatives, web searches, codebase exploration) is noise for implementation. Tell the user: "Consider `/compact` before `/wf implement` — workflow state lives in the artifact files and the SessionStart hook re-reads it after compaction."

**Option B: Implement all (sequential)** → start with `/wf implement <slug> <first-slice-slug>`
Use when: All slices are planned and the user wants to work through them in order.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Slice** → `/wf slice <slug>`
Use when: Planning revealed slice boundaries are wrong.

**Option D: Revisit Shape** → `/wf shape <slug>`
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
next-invocation: "/wf implement <slug> <first-slice-slug>"
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
- **Option A (default):** `/wf implement <slug> <first-slice-slug>` — [reason]
- **Option B:** `/wf slice <slug>` — revisit slices [reason, if cohesion issues]

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
revisions: []   # reason-centric ledger per _additive-write.md; one entry per re-run that changed the plan
tags: []
stack-source: <confirmed|unconfirmed-auto-detect>   # read from 00-index.md stack.user-confirmed at plan time; downstream stages may refuse to proceed on `unconfirmed-auto-detect`
refs:
  index: 00-index.md
  plan-index: 04-plan.md
  slice-def: 03-slice-<slice-slug>.md
  siblings: [04-plan-<other>.md, ...]
  implement: 05-implement-<slice-slug>.md
next-command: wf-implement
next-invocation: "/wf implement <slug> <slice-slug>"
---
```

# Plan: <slice-name>

## The Plan
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This plan implements…" openings. 1–4 short paragraphs. -->

## Current State

## Simplicity Ladder
<!-- From Explore sub-agent 1's build-avoidance ladder. One row per capability the slice needs, recording the highest rung that held:
- <capability> → rung 1 stdlib | rung 2 native-platform | rung 3 reuse | rung 4 new-code — <which API / path / recommendation>
Rung 3 (reuse) candidates carry the detail: `path/to/file.ts` → `functionName()` — match quality, recommendation (reuse as-is / modify / extract / implement fresh).
Rung 4 (new code): state why rungs 1–3 did not cover it.
If the slice writes no new capability code (pure config/wiring/refactor): "No new capabilities — ladder N/A." -->

## Applied Learnings
<!-- From Explore sub-agent 1's learnings scan over .ai/solutions/INDEX.md. One entry per matched
learning: its path, the Learning in one line, and what this plan does differently because of it.
A matched learning that changes nothing about the plan is a non-match — do not pad.
If the corpus is absent or nothing matched: "No applicable learnings found." (explicit — never
silently omit this section). Repeat-deferral tripwire outcomes also land here: name the repeated
wall and either the harness now scoped into the Step-by-Step Plan or the recorded
`harness-declined: <reason>`. -->

## Likely Files / Areas to Touch
- path/or/module: why

## Proposed Change Strategy
<!-- Constraint precedence (W8.3): when an NFR is the stated rationale for a mechanism choice (e.g. a <3s
latency budget → a single-call FSM over a multi-turn loop), QUOTE the NFR's charter ranking from
`02-shape.md` `## Non-Functional Requirements` (`yields-to: C<n>` / `outranks: C<n> (PO-ratified)`). Citing
an UNRANKED NFR to justify a mechanism that narrows a charter commitment is the tell of an intent-bearing
decision smuggled in as a perf detail — classify it per [_decision-classes.md](_decision-classes.md) and
route it to the PO, never auto-resolve it (a stop condition on an autonomous run). -->

## Step-by-Step Plan
1. ...

## Verification Strategy
<!-- The "perfect verification plan": one row per user-observable AC, engineered to fit the real constraints so `verify` executes a plan instead of improvising past a wall. Source the AC list + `verify:` stubs from `03-slice-<slice-slug>.md`. If the slice has no user-observable AC: "No user-observable AC — automated only." -->

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| `<id / text>` | `<tool>` (`<rung>`) | `<device/browser/creds/OS>` — `<yes / needs install / needs creds>` | `<fixture / data-testid / emulator config / test hook>` | `<next rung>` → … → pre-registered deferral |

Per row:
- **Tool + rung** — the constraint-resolution-ladder rung (see [runtime-adapters.md](runtime-adapters.md) → *Constraint-resolution ladder*) you intend to land on, with the concrete tool. A user-observable AC may NOT be satisfied by static reasoning or a mock/unit test alone — name a runtime (or device-free runtime-proxy) method.
- **Environment need & satisfiability** — the device/browser/creds/OS the AC requires and whether the target environment (`00-index.md` `stack:` + shape Observation Model) provides it. Tool-absence is resolved **here**, not at verify (see *Tooling resolution* below).
- **What must be built** — the seams this AC needs to be observable (a seeded fixture, a deterministic clock, a `data-testid`, an emulator config, an exported test hook). **Add each as a Step-by-Step Plan task** — building for verifiability is implementation work, not a verify-time surprise.
- **Fallback chain** — the next rung(s) to try if the primary tool is unavailable, ending in an explicit pre-registered deferral for any residual no rung can reach.

**Force-scope rule (MANDATORY — a named wall must be an engineered wall).** Any environment
dependency on a user-observable AC's critical path — credentials, a device, an external service,
an inbound callback, a deploy target, infrastructure that does not exist yet — MUST resolve, before
this plan completes, to exactly one `constraint-resolution:` line in a per-AC list directly below
the Verification Strategy table (keyed by AC id):

1. `constraint-resolution: prerequisite-slice: <slug>` — a prerequisite slice or harness scoped
   into the slug (TURN provisioning, an emulator debug build variant, a seeded-fixture harness).
   The harness is implementation work: add its tasks to the Step-by-Step Plan, or route back to
   `slice` to add the prerequisite slice.
2. `constraint-resolution: proxy+deferral: <named clearing event>` — a lower-rung proxy AC that
   verify CAN evidence now, plus a deferral authored *in advance* with a named clearing event
   ("cleared by the `-rc.N` prerelease CI run"). The clearing event becomes the deferral's
   `cleared-by` target.
3. `constraint-resolution: po-accepted: <reason>` — explicit PO risk-acceptance, recorded here
   and appended to `po-answers.md`.

"Known limitation — document at handoff" is ILLEGAL wording when an AC depends on the limitation.
**Hard gate:** if any user-observable AC's named dependency has none of the three, the plan is NOT
complete — raise it via `AskUserQuestion` (options: scope the harness / author the proxy+deferral /
PO-accept the risk) before writing the artifact. Verify's Step 0 refuses to inherit an unresolved
wall (`blocked-runtime-evidence-missing` routing, deferral hatch unavailable), so skipping this
gate only moves the stop later and makes it more expensive.

**Outcome-metric ACs need a pre-deploy proxy.** An AC stated as a live outcome metric
("rich-preview rate ≥ 75% over the live corpus") additionally requires a pre-deploy proxy AC — a
fixture-corpus assertion verify can hold now — with the live metric as the deferral's clearing event.

**Mandated-mitigation ACs are code-only-forbidden.** Any mitigation a shape MANDATES — a
fallback, an escape hatch, a kill switch — must be traceable to an AC that **exercises the wired
path**: fault injection, a forced fallback, a flag flip. "The fallback code exists" is not an AC;
a mitigation that is never exercised is indistinguishable from a mitigation that silently doesn't
fire. Author the mitigation AC to drive the path, and add its verification seam (the injection
hook, the forced-error fixture, the flag toggle) as a Step-by-Step Plan task.

**Tooling resolution (honors the stack-routing guardrail).** When a slice `verify:` stub names a tool not in `stack:`, the PO owns the call — made here so verify never improvises past a missing tool:
- **Add it to the stack** → route back through shape (`/wf shape <slug>`), update the fingerprint, return; or
- **Authorize a verify-time bootstrap** → record as a PO-approved install (e.g., "install `@playwright/test` at verify — approved") and add it as a verification-seam task. Verify then *executes* this authorized bootstrap rather than skipping the AC.

If the PO declines both, the AC is re-scoped or pre-registered as a deferral — never left to a static-reasoning `pass`. If the plan cannot produce a verification path for a user-observable AC, route back to slice/shape — cheaply, before any code is written.

## Test / Verification Plan

### Automated checks
- lint/typecheck: ...
- unit tests: ...
- integration tests: ...

### Interactive verification (human-in-the-loop)
This subsection is the step-level execution detail for each `## Verification Strategy` row — for each user-observable AC, spell out the exact drive. Use the confirmed `stack:` from `00-index.md` as the source of truth for tooling. Do NOT silently introduce drivers, screenshot tools, or skills not in `stack:`; when a criterion needs something missing, it must already be resolved in `## Verification Strategy` (route-to-shape or PO-authorized bootstrap) — point to that resolution rather than filling the gap on the fly.

- **What to verify**: describe the user-visible behavior
- **Platform & tool**: read from `stack.platforms` + the PO's shape selection. Name the exact tool the PO chose (e.g., "Android — Maestro flow `flows/auth.maestro.yaml` + `lazylogcat`" or "Web — in-repo Playwright suite, ad-hoc run via dev-browser").
- **Companion skills** (if any): list entries from `stack.available-skills` this criterion leans on. Skip if none.
- **Steps**: exact commands to run the app, navigate to the feature, and observe behavior. Bootstrap commands MUST match the runtime adapter for `stack.platforms`.
- **Evidence capture**: use the evidence layout from the matched runtime adapter ([runtime-adapters.md](runtime-adapters.md)).
- **Pass criteria**: what the output must show for this to be verified.

If no interactive verification needed: "Automated only — [reason]"

If a criterion needs tooling outside `stack:`: do NOT pick a default. Add an entry under `## Blockers` naming the missing capability and route back to shape.

## Risks / Watchouts
- ...

## Dependencies on Other Slices
- ...

## Assumptions
- ...

## Blockers
- ...

## Freshness Research

<!-- No `## Revision History` body section. Plan revisions are recorded in the
     `revisions:` frontmatter ledger (see _additive-write.md) and rendered as a
     timeline; the body is rewritten to current truth on each review-and-fix run. -->

## Recommended Next Stage
- **Option A (default):** `/wf implement <slug> <slice-slug>` — [reason]

---

## Step F — Write the rich `.yaml` + fragment (MANDATORY — do not skip)

The sunflower view renders the plan page from a sibling `.yaml` + `.html.fragment`
written next to each per-slice `04-plan-<slice-slug>.md`. **Without the `.yaml` the
page silently degrades to plain prose** — the file-change topology figure, the
files-touched table, and risk callouts never appear (`plan.mjs` gates the rich body
on the sibling YAML). The `post-write-verify` hook **BLOCKS the `.md` write (exit 2)
when the sibling `.yaml` is missing**, so author the `.yaml` first (or in the same
turn), while the plan is still in context.

For the per-slice `04-plan-<slice-slug>.md` you just wrote (files are **flat** in the
slug dir — `04-plan-<slice-slug>.{yaml,html.fragment}`, not a `slices/<slice>/`
subtree):

1. Write the sibling **`04-plan-<slice-slug>.yaml`** — the structured data.
   Schema: `siblingYamlSchemas.plan` in `tests/frontmatter.schema.json`
   (required top-level: `artifact: plan`, `slice`, `modules`, `files`):
   - **`modules:`** — topology groupings. Each entry is either a plain **string**
     (legacy path-prefix — files bucket by prefix) **or** a rich object
     **`{ id, label, role }`** that files reference by id via `files[].module`.
     Both forms may coexist.
   - **`files:`** — one entry per touched file. `path` (required) plus:
     - **`status:`** `new | modified | deleted | external` — the **change-type**,
       what the topology colors by. **Put the change-type here, not in `role`.**
       (Legacy plans stored it in `role`; the renderer still falls back when
       `status` is absent, but author new plans with `status`.)
     - **`role:`** a free-string **category** (`config`, `infra`, `ui`,
       `domain`, …) — descriptive only; no longer the change-type.
     - **`module:`** id of the `modules[]` entry this file belongs to.
     - `loc` (integer, string, or `~`/null), `delta: { add, rem }`,
       `imports: [...]`, and `planned_change:` — an object `{ intent, diff }`
       **or** a string block scalar.
   - **`edges:`** — topology links: `from` + `to` (required), optional `kind:`
     (`import | replaces | calls | extends | crosses-service`), `type`, `label`.
   - **`risks:`** — `title` (required) plus optional `id`, `severity`/`level`
     (`high | med | medium | low | blocker`), `body`/`detail`, `mitigation`.
   - **`history:`** — prior-revision log; a string or an array.
   - `lanes:` — only for multi-service plans (see Phase 2 below).

   This file is validated **at write time**: `post-write-verify` **blocks (exit 2)**
   a `plan` sibling `.yaml` that violates the schema — gated by
   `hooks.validateSiblingYaml` (default on; `plan` is in the reconciled allowlist).
   A malformed `modules` entry (object without `id`) or unknown field is rejected at
   write, not silently dropped at render.
2. Write the sibling **`04-plan-<slice-slug>.html.fragment`** — the body-only
   interactive layer described next.

The fragment is one `<section class="fragment-plan" data-artifact="plan"
data-slice="<slice-slug>" data-rev="<n>">` that reproduces the gallery's
plan fragment 1:1 — file-change topology SVG, `<table class="files-touched">`
with collapsible planned-change cards per row, three `.callout-*` risk callouts,
and a `<details class="pl-revs">` prior-revisions block from `history/`.

Authoring rules (do not skip — verifier Check 7 enforces these):

- Inline `<style>` with every selector scoped under `.fragment-plan` / `.pl-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-plan')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'plan', artifact: 'plan',
    counts: { files: <n>, modules: <n>, risks: <n> } } }))`.
- Inline SVG only; no remote anything.
- All chart data deterministic from `04-plan.yaml` — same YAML must produce byte-identical output.

The full contract (allowed shared classes, forbidden tags, YAML→fragment
mapping per fragment shape) lives in
[`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md).
The authoritative gallery is bundled at
[`reference/fragments-gallery.html`](../../../reference/fragments-gallery.html).

### Use `@include` for shared chrome (v9.20.1+)

The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): the
`plan.mjs` renderer already emits the page heading, metric-row, and Figure 3
(file-change topology). Do **not** repeat them — start at the interactive
files-touched table (collapsible diff rows), risk callouts, and prior-revisions
block, using the shared snippets:

```html
<section class="fragment-plan" data-artifact="plan" data-slice="<slice>" data-rev="3">
  <!-- No heading, no metric-row, no topology SVG here — the page owns them.
       The fragment is the interactive detail layer appended below the chrome. -->

  <table class="files-touched">
    <!-- @include files-touched-row { "role": "modified", "path": "…", "delta": { "add": 118, "rem": 96 } } -->
    <!-- … one row per file, each expandable to its diff … -->
  </table>

  <!-- @include callout { "kind": "risk", "title": "Region detection silently wrong", "body": "…" } -->
  <!-- @include callout { "kind": "warn", "title": "Tax surcharge moves server-side", "body": "…" } -->

  <!-- @include fragment-ready { "name": "plan", "artifact": "plan",
       "detailJson": "{\"counts\":{\"files\":14,\"modules\":5,\"risks\":3}}" } -->
</section>
```

Available snippets: `metric-row`, `callout`, `verdict`, `severity-chip`,
`fragment-ready`, `files-touched-row`, `diff-block`. The expander
(`plugins/sdlc-workflow/components/_components.mjs`) runs after fragment
validation and before shell wrap; missing snippets, invalid JSON payloads, or
recursion past `maxDepth=4` throw at render time. Hand-inlined markup matching a
published snippet triggers a warn from verifier Check 9 — suppress legitimate
variants with `<!-- @include-skip <reason> -->` adjacent.

### Sibling YAML — `lanes[]` and `crosses-service` edges (v9.21.0+, Phase 2)

When the plan spans **two or more services** (a separate process boundary, deploy
unit, or repo), record the swim-lane projection in `04-plan.yaml` under a top-level
`lanes:` key. The renderer swaps the per-module file-topology figure for a data-flow
swim-lane figure, laying each lane out horizontally.

When to emit `lanes:`:
- **≥2 services touched** (e.g., `web` + `api`, or `api` + `worker` + `db-migrations`).
- **Any edge** in `edges:` has `kind: crosses-service` — the renderer treats this as
  an implicit signal even without an explicit `lanes:` block.
- Skip for single-service plans — file-topology is the better visualization there.

Shape:

```yaml
# excerpt from 04-plan.yaml — riding alongside the existing artifact: plan block
lanes:
  - service: web
    label:   "Next.js frontend"
    files:
      - apps/web/checkout/page.tsx
      - apps/web/checkout/total.ts
  - service: api
    label:   "Cart service"
    files:
      - services/cart/handlers/checkout.ts
      - services/cart/db/orders.ts
  - service: worker
    label:   "Webhook consumer"
    files:
      - workers/webhooks/stripe.ts

edges:
  - from: apps/web/checkout/total.ts
    to:   services/cart/handlers/checkout.ts
    kind: crosses-service
  - from: services/cart/handlers/checkout.ts
    to:   workers/webhooks/stripe.ts
    kind: crosses-service
```

Authoring rules:
- Every file in any `lane.files[]` must also appear in the `files:` array. The
  lanes block is a projection, not a separate file list.
- `crosses-service` edges should name the actual source/target file, not the lane id.
- `label` is optional but recommended for lanes whose `service` slug isn't
  self-explanatory (e.g. `service: rev-svc-2` → `label: "Revenue Service (compat shim)"`).

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
