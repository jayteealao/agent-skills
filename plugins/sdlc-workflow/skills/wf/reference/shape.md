---
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-shape`, **stage 2 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` |
| Next | `/wf slice <slug>` (default) |
| Skip-to | `/wf plan <slug>` if the shaped spec is a single coherent unit that does not benefit from slicing |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start designing, architecting, implementing, or coding the solution.
- Do NOT jump ahead to slicing, planning, or implementation.
- Your job is to produce a **mini-spec with acceptance criteria** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` must exist. If missing → STOP. Tell the user: "Run `/wf intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open intake questions first.
   - If `current-stage` in the index is already past shape → WARN: "Stage 2 (shape) has already been completed. Running it again will overwrite `02-shape.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat.
4. **Read** `01-intake.md` and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Parallel research
Always launch Explore sub-agent 1 and Explore sub-agent 2. Launch additional sub-agents for cross-domain work.

**Sub-agent 2 (web search) skip criteria — skip ONLY if ALL of the following are true:**
- The feature introduces zero new external dependencies
- The feature makes no changes to existing dependency usage (no new API surface, no version changes)
- The affected area is not security-sensitive (auth, tokens, crypto, CORS, CSP, input sanitization)
- No browser/platform APIs involved (Web APIs, mobile OS APIs, CSS features)
- No external API integrations (no REST, GraphQL, OAuth, webhooks, third-party SDKs)

**When in doubt: always launch sub-agent 2.** Web search is fast and frequently surfaces breaking changes, CVEs, and better patterns that change the spec before implementation begins.

### Explore sub-agent 1 — Codebase Architecture & Integration Surface

Prompt the agent with ALL of the following. It must report findings for each section:

**Directory & module structure:**
- Map the top-level directory structure and identify the organizational pattern (monorepo, feature folders, layer-based, domain-driven)
- Identify the entry points (main/index/app/server files) and trace how the request reaches the area this work will touch
- List the key modules/packages/namespaces involved and their public API surfaces (exports, exposed functions, classes, types)

**Existing patterns & conventions:**
- Identify naming conventions (files, functions, variables, CSS classes, DB columns) — look at 3-5 representative files in the affected area
- Identify error handling patterns (try/catch style, Result types, error middleware, custom error classes)
- Identify dependency injection or service location patterns (constructors, providers, containers, global singletons)
- Identify configuration patterns (env vars, config files, feature flags, secrets management)
- Identify logging/observability patterns (structured logging, log levels, tracing, metrics)

**Integration surfaces:**
- What code **calls into** the affected area? (callers, consumers, dependents — use grep for imports/requires of affected modules)
- What does the affected area **call out to**? (downstream dependencies, external services, databases, message queues, caches)
- What events, hooks, callbacks, or pub/sub channels does the affected area participate in?
- What middleware, interceptors, or decorators wrap the affected code path?

**Data flow:**
- Trace the primary data flow: input source → validation → transformation → persistence → response
- Identify data models/schemas/types involved (DB schemas, API request/response types, domain models)
- Identify serialization boundaries (JSON parse/stringify, protobuf, ORM hydration)

**Test structure:**
- What test framework is in use? (Jest, Vitest, pytest, Go testing, etc.)
- Where do tests live relative to source? (co-located `__tests__/`, centralized `tests/`, `*_test.go` beside source)
- What test helpers, factories, fixtures, and mocks exist? (list file paths)
- What is the testing convention? (unit per module? integration per feature? E2E per user flow?)
- What areas have thin or missing test coverage relevant to this work?

**Interactive & visual verification tooling:**
- Is `dev-browser` installed? (`command -v dev-browser`) — preferred tool for web app verification. Provides sandboxed Playwright API with persistent pages, screenshots, and AI-friendly DOM snapshots. If not installed and the project is a web app, note: "recommend installing dev-browser (`npm install -g dev-browser && dev-browser install`)"
- What E2E/UI test frameworks exist? (Playwright, Cypress, Maestro, Detox, Appium, Selenium, etc.) — check config files and test directories
- What device/emulator tooling is available? (adb for Android, iOS Simulator, connected devices)
- Are Chrome MCP tools available in the session? (`mcp__claude-in-chrome__*` — navigate, read_page, computer, screenshots)
- Are there screenshot comparison or visual regression tools configured? (Percy, Chromatic, Playwright visual comparisons, `adb shell screencap`)
- What manual/smoke test scripts or checklists exist in the repo? (check `docs/`, `scripts/`, `testing/`, `QA/`)
- Is there a dev server, preview environment, or local emulator setup for interactive testing?

### Explore sub-agent 2 — External Dependencies & Freshness

Prompt the agent with ALL of the following:

**Dependency versions & compatibility:**
- Check the project's package manifest (package.json, requirements.txt, go.mod, Cargo.toml, etc.) for the versions of dependencies this work touches
- Web search for the **latest stable version** of each relevant dependency — note if the project is behind and whether upgrading is needed or risky
- Check for **deprecation notices** or **breaking changes** between the project's version and the latest

**Library documentation & patterns:**
- Web search for the official documentation of each dependency/API this work interacts with
- Verify that the patterns currently used in the codebase match the library's **recommended approach** for the project's version
- Check for **migration guides** if the work involves upgrading or if the current version is approaching EOL

**Security advisories:**
- Web search for recent CVEs or security advisories affecting the dependencies this work touches
- Check GitHub issues/security advisories for the relevant repositories
- Note any advisories that affect the approach or require specific mitigations

**Ecosystem context:**
- Check GitHub issues and PRs on the relevant dependency repos for known bugs that could affect this work
- Check if there are community-recommended alternatives or complementary libraries that the shaped spec should consider
- Search for relevant blog posts, release announcements, or RFC documents that affect architectural decisions

**Implementation best practices:**
- Web search for established patterns and community consensus on how to implement this type of feature correctly — look at official guides, framework docs, and opinionated style guides
- Search for known anti-patterns and common mistakes for this kind of feature — especially on official docs, web.dev, engineering blogs, and dev community posts (dev.to, css-tricks, Stack Overflow)
- Note any RFCs, W3C specs, platform guidelines, or accessibility standards that prescribe behavior for this feature type
- Identify whether the approach the shaped spec is heading toward is considered idiomatic, legacy, or controversial in the current ecosystem

**Known gotchas & performance pitfalls:**
- Web search for common performance traps specific to this feature type (e.g., unnecessary re-renders, N+1 queries, layout thrash, bundle size impact, memory leaks, cold-start latency)
- Search for community "lessons learned", "what I wish I knew", or postmortems involving this kind of feature — these surface the non-obvious failure modes
- Note any known limitations, quirks, or required workarounds the spec should explicitly account for before acceptance criteria are written

Merge all sub-agent findings into the stage file under `## Affected Areas`, `## Dependencies / Sequencing Notes`, and `## Freshness Research`. Best practices and gotcha findings should directly inform acceptance criteria and edge cases in the spec — surface them to the synthesizer.

# Purpose
Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (risk tolerance, appetite, structured decisions). Use freeform chat for open-ended questions (behavior, acceptance criteria, non-goals). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**Mandatory discovery phase — 20 impartial questions about the feature.**

Before writing the mini-spec, interview the user with 20 questions about the feature being built. The goal is to surface decisions, assumptions, and unknowns that the intake brief left ambiguous.

**Rules:**
- Ask exactly 20 questions across 5 rounds of 4 using AskUserQuestion.
- Every question must be about *this specific feature* — reference it by name, use concrete details from the intake brief. No generic process questions.
- Questions must be impartial — do not lead toward a particular answer. Options should represent genuinely different directions, not a "right answer" with decoys.
- Options should be specific to the feature where possible. Fall back to general options only when the feature context doesn't suggest concrete alternatives.
- If a question was already clearly answered in intake, pre-fill your understanding and ask the user to confirm or revise instead of asking from scratch.
- Wait for each round's answers before generating the next round — later questions should build on earlier answers.

**What to ask about (5 rounds):**

Round 1 — **What does the feature do?** Nail down the core interaction: what action the user takes, what they provide as input, what they get back, and what triggers them to use it in the first place.

Round 2 — **How does the feature behave?** Explore the dynamics: what happens after the main action, whether it's reversible, timing model (sync/async/real-time), and how it connects to other parts of the product.

Round 3 — **What does the feature look like?** Clarify the surface area: where it lives in the product (page, modal, inline, CLI), how much data it handles, what distinct states the user sees (empty, loading, error, success), and whether it follows or breaks existing patterns.

Round 4 — **What can go wrong?** Probe failure modes: worst-case impact of bugs, how invalid input is handled, what happens when dependencies fail, and who has access/permissions.

Round 5 — **Where are the boundaries?** Define the edges: what's explicitly out of scope for v1, how to transition from old to new behavior, what existing code/data is touched, and what open questions remain.

**How to construct each question:**
- `question`: A specific question about the feature. Reference the feature by name. E.g., "What should the export modal show when the user has no reports yet?" not "What happens in the empty state?"
- `header`: Short label (max 12 chars) for the chip display.
- `options`: 2–4 options. Each option should describe a concrete direction specific to the feature. The user can always pick "Other" for freeform input.
- `multiSelect`: true when multiple options can coexist, false when they're mutually exclusive.

After completing all 5 rounds, append every answer to `po-answers.md` with timestamp and `stage: shape`. Then proceed to the remaining steps.
3. **Run all 5 discovery rounds.** Do not skip rounds. Do not compress multiple rounds into one. Wait for each round's answers before proceeding to the next — use earlier answers to sharpen later questions.
4. Run freshness research via Explore sub-agent 2 (see skip criteria above) for external dependencies, patterns, APIs, standards, and known issues that could change the spec.
5. Synthesize discovery answers into a small behavior-focused mini-spec.
6. **Documentation plan (Diátaxis):** Using the shaped spec, classify what documentation this feature needs. Apply the Diátaxis model:
   - Does this introduce new API surface or config? → needs **reference** docs
   - Does this add user-facing behavior? → needs a **how-to guide**
   - Is this a major new capability for new users? → needs a **tutorial**
   - Does this involve architectural decisions or trade-offs? → needs an **explanation** page
   - Does this significantly change the project's capabilities? → needs a **README update**
   - Write the classification into `## Documentation Plan` in the shape file. For each identified doc, note: type, target audience, what it must cover, what it must NOT cover (boundary discipline).
   - If no user-facing docs are needed (pure internal refactor, test-only change), write "None required" with reasoning.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
9. Write `.ai/workflows/<slug>/02-shape.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `/wf slice`. Evaluate the shaped spec and present the user with ALL viable options:

**Option A (default): Slice** → `/wf slice <slug>`
Use when: The spec covers multiple distinct areas, has more than one acceptance criterion cluster, or would benefit from incremental delivery.

**Option B: Skip to Plan** → `/wf plan <slug>`
Use when: The shaped spec is a single coherent unit — one clear scope, one acceptance path, no meaningful way to split it further. Criteria: single concern, ≤5 files likely touched, one delivery unit.

**Option C: Revisit Intake** → `/wf intake <slug>`
Use when: Shaping revealed that the intake brief is wrong, missing key constraints, or fundamentally misunderstands the problem.

**Option D: Blocked — re-run shape** → `/wf shape <slug>`
Use when: Required PO answers are still missing.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `02-shape.md` with this structure:

```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: <true|false>
docs-types: [<reference|how-to|tutorial|explanation|readme>]
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice <slug>"
---
```

# Shape

## Problem Statement

## Primary Actor / User

## Desired Behavior

## Acceptance Criteria
- Given ... When ... Then ...
- For each criterion, classify verification method:
  - `automated` — unit/integration test can prove it
  - `interactive` — requires running the app and verifying visually or through device interaction (browser, emulator, device)
  - `manual` — requires human judgement or external system check
- Interactive criteria MUST specify: what tool/method to use (Playwright, Maestro, adb, browser automation, etc.), what to look for, and how to capture evidence (screenshot, recording, console output)

## Non-Functional Requirements
- ...

## Edge Cases / Failure Modes
- ...

## Affected Areas
- ...

## Dependencies / Sequencing Notes
- ...

## Questions Asked This Stage
- ...

## Answers Captured This Stage
- ...

## Out of Scope
- ...

## Definition of Done
- ...

## Verification Strategy
Classify how each acceptance criterion and edge case will be verified:

**Automated checks** (CI/test suite can run these):
- ...

**Interactive verification** (requires running the app and observing behavior):
- Platform: web / Android / iOS / desktop / CLI
- Tool: Playwright / Maestro / adb / browser automation / dev-server + manual / other
- What to verify: describe the user flow and expected visual/behavioral outcome
- Evidence capture: screenshot / screen recording / console output / network trace

**Human-in-the-loop checks** (requires human judgement):
- ...

If purely backend/library with no UI: "Automated only — no interactive verification needed. [reason]"

## Documentation Plan
Classify using Diátaxis. For each doc needed, specify:
- **Type**: tutorial / how-to / reference / explanation / readme-update
- **Audience**: beginner / competent user / maintainer
- **Must cover**: ...
- **Must NOT cover** (boundary): ...
- **Target location**: where in the repo this doc should live

If no docs needed: "None required — [reason]"

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf slice <slug>` — [reason]
- **Option B:** `/wf plan <slug>` — [reason, if single-scope]
- **Option C:** `/wf intake <slug>` — revisit intake [reason, if applicable]
