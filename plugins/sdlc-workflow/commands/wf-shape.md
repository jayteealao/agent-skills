---
name: wf-shape
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
disable-model-invocation: true
---

You are running `wf-shape`, **stage 2 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` |
| Next | `/wf-slice <slug>` (default) |
| Skip-to | `/wf-plan <slug>` if the shaped spec is a single coherent unit that does not benefit from slicing |

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
   - `01-intake.md` must exist. If missing → STOP. Tell the user: "Run `/wf-intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open intake questions first.
   - If `current-stage` in the index is already past shape → WARN: "Stage 2 (shape) has already been completed. Running it again will overwrite `02-shape.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat.
4. **Read** `01-intake.md` and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Parallel research (use sub-agents when supported)
When the shaped spec touches multiple domains, launch parallel sub-agents. Do not spin up sub-agents for trivial or single-domain work.

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

Merge all sub-agent findings into the stage file under `## Affected Areas`, `## Dependencies / Sequencing Notes`, and `## Freshness Research`.

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
- Use parallel Explore/subagents for multi-domain research when supported. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**Mandatory discovery phase — 20 impartial questions about the feature.**

Ask ALL 20 questions across 5 rounds using AskUserQuestion (4 questions per round). These questions are about the specific feature being built — what it does, how it behaves, what it looks like, what can go wrong. Do NOT skip questions based on assumptions.

Before starting: review `01-intake.md` and `po-answers.md`. For questions already answered in intake, pre-fill your understanding and ask the user to confirm or revise.

**Adapting questions to the feature:** The questions below use `[feature]` as a placeholder. Replace it with the actual feature name/description from intake. Tailor option descriptions to be specific to the feature where possible — generic options are a fallback.

**Round 1 — What does it do?**
```
AskUserQuestion:
  - question: "What is the core action a user performs with [feature]?"
    header: "Core action"
    options:
      - label: "Create / generate"
        description: "User produces something new — a record, file, output, or artifact."
      - label: "View / find / read"
        description: "User looks up, searches for, or consumes existing information."
      - label: "Edit / update / configure"
        description: "User modifies something that already exists."
      - label: "Trigger / execute / run"
        description: "User kicks off a process, action, or workflow."
    multiSelect: false

  - question: "What inputs does [feature] need from the user?"
    header: "Inputs"
    options:
      - label: "Structured form fields"
        description: "Named fields with specific types — text, numbers, dates, dropdowns."
      - label: "Freeform content"
        description: "Open-ended text, code, or rich content the user authors."
      - label: "File or data upload"
        description: "User provides a file, image, dataset, or external data."
      - label: "Selection from existing items"
        description: "User picks from things that already exist in the system."
    multiSelect: true

  - question: "What output or result does [feature] produce?"
    header: "Output"
    options:
      - label: "Persisted data / record"
        description: "Something saved to a database, file, or store that persists."
      - label: "Visual display / report"
        description: "Information rendered on screen — a view, chart, dashboard, or summary."
      - label: "Downloadable artifact"
        description: "A file, export, or document the user takes away."
      - label: "Side effect / state change"
        description: "Something changes elsewhere — a notification sent, a process started, a config applied."
    multiSelect: true

  - question: "When does a user reach for [feature] — what triggers them to use it?"
    header: "Trigger"
    options:
      - label: "Explicit user intent"
        description: "User deliberately navigates to it when they need it."
      - label: "In response to an event"
        description: "Something happened (error, notification, deadline) and the user reacts."
      - label: "Part of a larger workflow"
        description: "This is one step in a multi-step process the user is already doing."
      - label: "Scheduled / periodic"
        description: "User does this on a regular cadence — daily, weekly, per-release."
    multiSelect: false
```

**Round 2 — How does it behave?**
```
AskUserQuestion:
  - question: "What happens immediately after the user completes the main action in [feature]?"
    header: "After action"
    options:
      - label: "Confirmation and stay"
        description: "Show success feedback, user stays on the same screen."
      - label: "Navigate to result"
        description: "Take the user to the thing they just created or changed."
      - label: "Return to list / parent"
        description: "Go back to where the user came from."
      - label: "Next step in flow"
        description: "Automatically advance to the next action in a sequence."
    multiSelect: false

  - question: "Can the user undo or reverse what [feature] does?"
    header: "Undo"
    options:
      - label: "Yes — immediate undo"
        description: "User can reverse the action right away with no consequences."
      - label: "Yes — but with caveats"
        description: "Reversible, but some effects (notifications, logs) can't be undone."
      - label: "No — destructive / permanent"
        description: "Once done, it cannot be undone. Needs a confirmation step."
      - label: "Not applicable"
        description: "The action is read-only or idempotent — undo doesn't apply."
    multiSelect: false

  - question: "Does [feature] need to work offline, in real-time, or asynchronously?"
    header: "Timing"
    options:
      - label: "Synchronous — instant response"
        description: "Action completes immediately and result is shown inline."
      - label: "Asynchronous — background processing"
        description: "Action is submitted and result arrives later (polling, notification, email)."
      - label: "Real-time / live"
        description: "Data updates continuously while the user watches (WebSocket, SSE, polling)."
      - label: "Offline-capable"
        description: "Must work without network connectivity and sync later."
    multiSelect: false

  - question: "Does [feature] interact with or depend on other features in the product?"
    header: "Dependencies"
    options:
      - label: "Standalone"
        description: "Works independently — no other features need to exist or change."
      - label: "Reads from other features"
        description: "Consumes data or state produced by other parts of the system."
      - label: "Writes to other features"
        description: "Produces data or side effects that other parts of the system consume."
      - label: "Tightly coupled"
        description: "Cannot function without specific other features and vice versa."
    multiSelect: false
```

**Round 3 — What does it look like?**
```
AskUserQuestion:
  - question: "Where does [feature] live in the product — how does the user get to it?"
    header: "Entry point"
    options:
      - label: "New page / screen"
        description: "A dedicated page or screen the user navigates to."
      - label: "Modal / dialog / overlay"
        description: "Appears over the current screen without full navigation."
      - label: "Inline / embedded"
        description: "Lives within an existing page as a section, widget, or component."
      - label: "CLI / API / headless"
        description: "No visual UI — accessed via command line, API call, or automation."
    multiSelect: false

  - question: "How much data does [feature] show or handle at once?"
    header: "Data volume"
    options:
      - label: "Single item"
        description: "One record, one document, one thing at a time."
      - label: "Short list (< 50 items)"
        description: "A manageable list that fits on one screen."
      - label: "Large dataset (100+ items)"
        description: "Needs pagination, search, filtering, or virtualization."
      - label: "Varies widely"
        description: "Could be 1 item or 10,000 depending on the user and context."
    multiSelect: false

  - question: "Are there distinct states [feature] can be in that look different to the user?"
    header: "States"
    options:
      - label: "Empty / first-use"
        description: "Nothing exists yet — needs onboarding or a call-to-action."
      - label: "Loading / processing"
        description: "Data is being fetched or an action is in progress."
      - label: "Error / failure"
        description: "Something went wrong and the user needs to know what and why."
      - label: "Success / completed"
        description: "The action worked and the user sees the result."
    multiSelect: true

  - question: "Does [feature] need to match or extend an existing visual pattern in the product?"
    header: "Visual fit"
    options:
      - label: "Yes — follow existing pattern"
        description: "There's an existing screen or component this should look and feel like."
      - label: "Yes — but adapted"
        description: "Similar to something existing but with meaningful differences."
      - label: "No — new pattern needed"
        description: "Nothing like this exists in the product yet."
      - label: "Not visual"
        description: "Backend, API, or CLI — no visual design needed."
    multiSelect: false
```

**Round 4 — What can go wrong?**
```
AskUserQuestion:
  - question: "What is the worst thing that happens if [feature] has a bug?"
    header: "Worst case"
    options:
      - label: "Data loss or corruption"
        description: "User data is destroyed, overwritten, or silently made incorrect."
      - label: "Wrong action taken"
        description: "The system does something the user didn't intend and it has real consequences."
      - label: "Feature doesn't work"
        description: "User can't complete their task but no lasting damage is done."
      - label: "Cosmetic / confusing"
        description: "Looks wrong or is confusing but the underlying behavior is correct."
    multiSelect: false

  - question: "What happens when [feature] receives invalid or unexpected input?"
    header: "Bad input"
    options:
      - label: "Validate and block"
        description: "Reject the input immediately with a clear message about what's wrong."
      - label: "Accept and sanitize"
        description: "Clean up or normalize the input and proceed."
      - label: "Warn but allow"
        description: "Show a warning but let the user proceed if they choose to."
      - label: "Depends on the field"
        description: "Different inputs need different validation strategies."
    multiSelect: false

  - question: "What happens if an external dependency [feature] relies on is unavailable?"
    header: "Dep failure"
    options:
      - label: "Show error, block action"
        description: "Tell the user the dependency is down and prevent the action."
      - label: "Degrade gracefully"
        description: "Continue with reduced functionality — hide or disable the affected part."
      - label: "Queue and retry"
        description: "Accept the action and retry the dependency call in the background."
      - label: "No external dependencies"
        description: "This feature is self-contained — no external calls."
    multiSelect: false

  - question: "Who should be able to use [feature] — are there permission or access concerns?"
    header: "Access"
    options:
      - label: "Everyone"
        description: "All authenticated users can use this feature equally."
      - label: "Role-based"
        description: "Only users with specific roles or permissions can access it."
      - label: "Owner-scoped"
        description: "Users can only act on their own data — not other users' data."
      - label: "Admin-only"
        description: "Restricted to administrators or operators."
    multiSelect: false
```

**Round 5 — What are the boundaries?**
```
AskUserQuestion:
  - question: "What is explicitly out of scope for the first version of [feature]?"
    header: "Out of scope"
    options:
      - label: "Advanced configuration"
        description: "Power-user options, customization, or settings — keep it simple first."
      - label: "Bulk / batch operations"
        description: "Handling multiple items at once — start with one-at-a-time."
      - label: "Integrations"
        description: "Connecting to external services or systems — build standalone first."
      - label: "Nothing — full scope"
        description: "Everything described is in scope for v1."
    multiSelect: true

  - question: "How should [feature] handle the transition from current behavior to new behavior?"
    header: "Migration"
    options:
      - label: "Clean cutover"
        description: "Old behavior goes away, new behavior takes its place."
      - label: "Parallel run"
        description: "Both old and new exist temporarily so users can migrate gradually."
      - label: "Backward compatible"
        description: "New behavior is additive — old behavior continues to work unchanged."
      - label: "No migration needed"
        description: "This is net-new — there is no old behavior to transition from."
    multiSelect: false

  - question: "What existing code or data will [feature] need to read, modify, or replace?"
    header: "Touch points"
    options:
      - label: "New tables / schemas / models"
        description: "Needs new data storage that doesn't exist yet."
      - label: "Existing data models"
        description: "Reads from or writes to data structures that already exist."
      - label: "Shared UI components"
        description: "Uses or extends existing frontend components."
      - label: "Needs codebase exploration"
        description: "Not sure yet — the sub-agents should investigate."
    multiSelect: true

  - question: "Is there anything about [feature] you're unsure about or want to explore further before building?"
    header: "Open Qs"
    options:
      - label: "Uncertain about the UX"
        description: "Not sure what the right interaction pattern is — may need prototyping."
      - label: "Uncertain about feasibility"
        description: "Not sure if the approach will work technically — may need a spike."
      - label: "Uncertain about scope"
        description: "Not sure where to draw the line — worried about scope creep."
      - label: "No — ready to proceed"
        description: "The feature is well-understood and ready to be shaped into a spec."
    multiSelect: true
```

After completing all 5 rounds, append every answer to `po-answers.md` with timestamp and `stage: shape`. Then proceed to the remaining steps.
3. **Run all 5 discovery rounds above.** Do not skip rounds. Do not compress multiple rounds into one. Wait for each round's answers before proceeding to the next. If a question was already answered in intake, present your understanding and ask the user to confirm or revise.
4. Run freshness research (using parallel sub-agents if multi-domain) for external dependencies, patterns, APIs, standards, and known issues that could change the spec.
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
After completing this stage, do NOT blindly recommend `/wf-slice`. Evaluate the shaped spec and present the user with ALL viable options:

**Option A (default): Slice** → `/wf-slice <slug>`
Use when: The spec covers multiple distinct areas, has more than one acceptance criterion cluster, or would benefit from incremental delivery.

**Option B: Skip to Plan** → `/wf-plan <slug>`
Use when: The shaped spec is a single coherent unit — one clear scope, one acceptance path, no meaningful way to split it further. Criteria: single concern, ≤5 files likely touched, one delivery unit.

**Option C: Revisit Intake** → `/wf-intake <slug>`
Use when: Shaping revealed that the intake brief is wrong, missing key constraints, or fundamentally misunderstands the problem.

**Option D: Blocked — re-run shape** → `/wf-shape <slug>`
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
next-invocation: "/wf-slice <slug>"
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
- **Option A (default):** `/wf-slice <slug>` — [reason]
- **Option B:** `/wf-plan <slug>` — [reason, if single-scope]
- **Option C:** `/wf-intake <slug>` — revisit intake [reason, if applicable]
