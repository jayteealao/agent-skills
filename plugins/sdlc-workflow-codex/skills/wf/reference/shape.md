---
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf shape`, **stage 2 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` + (when `stack.ui ≠ ∅` and the work has visual surface) `02b-design.md` — the **design brief** |
| Next | `$wf slice <slug>` (default) |
| Skip-to | `$wf plan <slug>` if the shaped spec is a single coherent unit that doesn't benefit from slicing |

> **Design brief ownership (moved here).** When the work has UI surface, `02b-design.md` is authored *here*, as part of shape — not by a separate design command. `plan` later resolves the visual-direction gates and authors `02c-craft.md`; `implement` builds against it. See Step 5b below.

> **Auto second opinion.** Once the mini-spec is drafted (before writing `02-shape.md`), **auto-invoke** `$consult codex <critique these acceptance criteria, edge cases, and scope>` (pinning `codex`/`claude` keeps it free) whenever a spec error would be expensive to unwind downstream: a new capability or externally-observable surface, more than one slice, or any `intent-risk` (RIM) carried in from intake. Fire it rather than offering it in next-steps; skip only a single-slice, internal, low-risk tweak. The user may invoke it explicitly with any provider.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT design, architect, implement, or code the solution.
- Your job is to produce a **mini-spec with acceptance criteria** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself solving the problem, STOP and return to the next unfinished step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If none, infer from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` must exist. If missing → STOP: "Run `$wf intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve open intake questions first.
   - If `current-stage` is already past shape → WARN: "Stage 2 (shape) is complete. Running again will overwrite `02-shape.md`. Proceed?" Ask the user in chat.
4. Read `01-intake.md` and `po-answers.md`.
5. Carry forward `selected-slice-or-focus` and `open-questions` from the index.

# Parallel research
Always launch Explore sub-agent 1 and Explore sub-agent 2; add more for cross-domain work.

**Sub-agent 2 (web search) skip criteria — skip ONLY if ALL true:**
- Zero new external dependencies; no new API surface, no version changes
- Not security-sensitive (auth, tokens, crypto, CORS, CSP, input sanitization)
- No browser/platform APIs (Web APIs, mobile OS APIs, CSS features)
- No external API integrations (REST, GraphQL, OAuth, webhooks, third-party SDKs)

**When in doubt: always launch sub-agent 2.** Web search is fast and frequently surfaces breaking changes, CVEs, and better patterns before implementation begins.

### Explore sub-agent 1 — Codebase Architecture & Integration Surface

Prompt the agent with ALL of the following; it must report findings for each section:

**Directory & module structure:**
- Map the top-level directory structure and identify the organizational pattern (monorepo, feature folders, layer-based, domain-driven)
- Identify entry points (main/index/app/server files) and trace how the request reaches the area this work will touch
- List key modules/packages/namespaces and their public API surfaces (exports, exposed functions, classes, types)

**Existing patterns & conventions:**
- Naming conventions (files, functions, variables, CSS classes, DB columns) — look at 3-5 representative files in the affected area
- Error handling patterns (try/catch style, Result types, error middleware, custom error classes)
- Dependency injection or service location patterns (constructors, providers, containers, global singletons)
- Configuration patterns (env vars, config files, feature flags, secrets management)
- Logging/observability patterns (structured logging, log levels, tracing, metrics)

**Integration surfaces:**
- What code **calls into** the affected area? (callers, consumers — grep imports/requires of affected modules)
- What does the affected area **call out to**? (external services, databases, message queues, caches)
- What events, hooks, callbacks, or pub/sub channels does the affected area participate in?
- What middleware, interceptors, or decorators wrap the affected code path?

**Data flow:**
- Trace the primary data flow: input source → validation → transformation → persistence → response
- Data models/schemas/types involved (DB schemas, API request/response types, domain models)
- Serialization boundaries (JSON parse/stringify, protobuf, ORM hydration)

**Test structure:**
- Test framework in use (Jest, Vitest, pytest, Go testing, etc.)
- Where tests live relative to source (`__tests__/`, centralized `tests/`, `*_test.go`, etc.)
- Test helpers, factories, fixtures, and mocks — list file paths
- Testing convention (unit per module? integration per feature? E2E per user flow?)
- Areas with thin or missing coverage relevant to this work

**Interactive & visual verification tooling:**

Drive this block from the `stack:` fingerprint in `00-index.md` and [runtime-adapters.md](runtime-adapters.md). The job is to **describe what's available and let the PO pick**, not to default to one tool.

1. **Re-read `stack:`** from `00-index.md`. If missing or `user-confirmed: false`, note it as an open question and propose re-running intake; do NOT silently re-detect.
2. **Match `stack.platforms` to runtime adapters.** Surface each matched adapter and detected drivers — installed ones first, additions-to-install last. Examples (adapter registry is the source of truth):
   - `platforms: [web]` → in-repo Playwright/Cypress > Chrome MCP if session-available > `dev-browser` if installed
   - `platforms: [android]` → in-repo Maestro flows > adb input > Espresso/UI Automator. Cross-reference `stack.available-skills` (e.g., `android-cli`, `lazylogcat`, `perfetto-trace-analysis`, `adaptive`) as opt-in helpers.
   - `platforms: [ios]` → XCUITest/Detox > Maestro (1.30+) > simctl fallbacks
   - `platforms: [service]` → existing integration test suites > curl/httpie ad-hoc
3. **Cross-reference the session catalog.** From `stack.available-skills` and `stack.available-mcp`, list anything mapping to this task (e.g., Compose UI → `adaptive`, `migrate-xml-views-to-jetpack-compose`, `styles`; Postgres → `postgresql-mcp`; docs → `diataxis`). Present as **candidates** with a one-line "why this fits," not selections.
4. **What's already wired in.** Note dev servers, emulator AVDs, simulator configs, screenshot/regression tools (Percy, Chromatic, `adb shell screencap`), and manual smoke scripts under `docs/`, `scripts/`, `testing/`, `QA/`.
5. **Surface a tooling question for the PO.** Record a concrete question: *"For verification, the available drivers are A, B, C. Companion skills: X, Y. Any preference, or any off-limits?"* Capture the answer in `po-answers.md`. Acceptance criteria must reference *whatever the PO chose*, not a baked-in default.

Anti-pattern: writing "use dev-browser" or "use Maestro" because the workflow defaults there. Map the design space; the PO picks the point.

### Explore sub-agent 2 — External Dependencies & Freshness

Prompt the agent with ALL of the following:

**Dependency versions & compatibility:**
- Check the package manifest (package.json, requirements.txt, go.mod, Cargo.toml, etc.) for versions of dependencies this work touches
- Web search for the **latest stable version** of each — note if the project is behind and whether upgrading is needed or risky
- Check for **deprecation notices** or **breaking changes** between the project's version and the latest

**Library documentation & patterns:**
- Web search official documentation for each dependency/API this work interacts with
- Verify patterns in the codebase match the library's **recommended approach** for the project's version
- Check for **migration guides** if the work involves upgrading or the current version is approaching EOL

**Security advisories:**
- Web search for recent CVEs or security advisories affecting the dependencies this work touches
- Check GitHub security advisories for relevant repositories
- Note any advisories that affect the approach or require specific mitigations

**Ecosystem context:**
- Check GitHub issues and PRs on relevant dependency repos for known bugs that could affect this work
- Check for community-recommended alternatives or complementary libraries the shaped spec should consider
- Search for relevant blog posts, release announcements, or RFC documents that affect architectural decisions

**Implementation best practices:**
- Web search for established patterns and community consensus on implementing this feature type — official guides, framework docs, opinionated style guides
- Search for known anti-patterns and common mistakes — official docs, web.dev, engineering blogs, dev community posts (dev.to, css-tricks, Stack Overflow)
- Note any RFCs, W3C specs, platform guidelines, or accessibility standards that prescribe behavior for this feature type
- Identify whether the approach is considered idiomatic, legacy, or controversial in the current ecosystem

**Known gotchas & performance pitfalls:**
- Web search for common performance traps for this feature type (unnecessary re-renders, N+1 queries, layout thrash, bundle size, memory leaks, cold-start latency)
- Search for community "lessons learned", "what I wish I knew", or postmortems — these surface non-obvious failure modes
- Note known limitations, quirks, or required workarounds the spec should account for before acceptance criteria are written

Merge all sub-agent findings into the stage file under `## Affected Areas`, `## Dependencies / Sequencing Notes`, and `## Freshness Research`. Best practices and gotcha findings must inform acceptance criteria and edge cases — surface them to the synthesizer.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter; markdown body is human-readable narrative only.
- **Timestamps must be real:** For `created-at`/`updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Ask the user directly in chat** for multiple-choice PO questions (risk tolerance, appetite, structured decisions), presenting options as a numbered list. Use freeform chat for open-ended questions (behavior, acceptance criteria, non-goals). Construct every question per [_question-craft.md](_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel subagents for multi-domain research per [_subagents.md](_subagents.md); do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Shape` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**Mandatory discovery phase — adaptive interview, 20-question baseline.**

Before writing the mini-spec, interview the user to surface decisions, assumptions, and unknowns left ambiguous by the intake brief: 20 baseline questions, extended while unresolved decision points remain (see the extension rule below).

**Rules:**
- Ask 20 baseline questions across 5 rounds of 4 in chat, presenting options as a short numbered list. 20 is a floor, not a ceiling — after Round 5, apply the extension rule below.
- Every question must be about *this specific feature* — reference it by name, use concrete details from the intake brief. No generic process questions.
- Questions must be impartial — options should represent genuinely different directions, not a "right answer" with decoys.
- Options should be feature-specific where possible; fall back to general options only when context doesn't suggest concrete alternatives.
- If a question was already answered in intake, pre-fill your understanding and ask the user to confirm or revise.
- Wait for each round's answers before generating the next — later questions should build on earlier answers.

**What to ask about (5 rounds):**

Round 1 — **What does the feature do?** Core interaction: what action the user takes, what they provide as input, what they get back, and what triggers them to use it.

Round 2 — **How does the feature behave?** Dynamics: what happens after the main action, whether it's reversible, timing model (sync/async/real-time), how it connects to other parts of the product.

Round 3 — **What does the feature look like?** Surface area: where it lives (page, modal, inline, CLI), how much data it handles, what distinct states the user sees (empty, loading, error, success), whether it follows or breaks existing patterns.

Round 4 — **What can go wrong?** Failure modes: worst-case impact of bugs, how invalid input is handled, what happens when dependencies fail, who has access/permissions.

Round 5 — **Where are the boundaries?** Define edges, leading with scope restraint: which parts of the brief does v1 *actually* need versus speculative gold-plating, premature generality, or "while we're here" scope that can be deferred — present these as trim options the PO chooses, never a unilateral cut (the question is "do you actually need X, or does Y cover it?", not a refusal to build). Then: what's explicitly out of scope, how to transition from old to new behavior, what existing code/data is touched. This round is rung 1 of the lifecycle ("does this need to exist?") — a criterion trimmed here is a slice never created, a plan never written, code never implemented, so it is the highest-leverage place to apply restraint. Restraint is bounded: never trim what the user explicitly asked for, and never trade away a non-functional requirement (security, accessibility, data integrity) for a smaller scope.

**How to construct each question:**
- Follow the legibility contract in [_question-craft.md](_question-craft.md) — outcome-first framing, glossed jargon, consequence-stating options, reversibility, a marked recommendation, an "if unsure" default. The PO must be able to answer without reading the code.
- Concrete options specific to the feature. Each option describes a direction; allow "Other" or freeform input.
- Indicate whether multiple options can coexist or are mutually exclusive.

**Extension rule — extend while ambiguity blocks, never pad:**
After Round 5, inventory what is still unresolved. A decision point qualifies for an extension round only if leaving it open would block slicing, make an acceptance criterion unverifiable, or force plan/implement to guess a direction the PO should choose. If any qualify, run up to 2 additional rounds (up to 4 questions each) targeting ONLY those decision points — say in each extension round's lead-in which unresolved point each question closes. Stop the moment nothing qualifying remains; never fill a round for symmetry. Anything still unresolved after 2 extension rounds goes to `## Unknowns / Open Questions` (and `status: awaiting-input` if it blocks the spec), not more rounds.

After all rounds (5 baseline + any extension rounds), append every answer to `po-answers.md` with timestamp and `stage: shape`. Then proceed to the remaining steps.
3. **Run all 5 baseline discovery rounds, then apply the extension rule.** Do not skip or compress the baseline rounds. Wait for each round's answers before proceeding — use earlier answers to sharpen later questions.
4. Run freshness research via Explore sub-agent 2 (see skip criteria above) for external dependencies, patterns, APIs, standards, and known issues.
5. Synthesize discovery answers into a behavior-focused mini-spec.
5b. **Author the design brief (when `stack.ui ≠ ∅` and the work has visual surface).** If `00-index.md` shows a UI/frontend layer **and** this work introduces meaningful visual surface (new screens, components, states, or a redesign), author `02b-design.md` now per [design/shape.md](design/shape.md) — fold visual-direction questions into the answers already gathered; ask only what the discovery interview didn't cover. Write it as **plain discovery**: register, color strategy, scene sentence, anti-goals, state inventory, recommended references. Do **NOT** generate image probes and do **NOT** run a visual-direction confirm gate here — those are `plan`'s (it resolves the image gate and authors `02c-craft.md`). Do not write a resolved `image-gate` to `02b-design.md` — leaving it unset marks the gate unresolved for `plan` (the field only accepts `pass`/`skipped:*`). If `stack.ui` is empty or no visual surface, skip this step. See `design/_design-context.md` for register determination and shared design laws.
5c. **Author the Charter Scenario (when the intake's Restated Request names a numbered core loop).** If the request describes a core loop as numbered steps, author the `## Charter Scenario` section: the loop as ONE scripted end-to-end scenario, each step carrying an **observable checkpoint** a human or tool could confirm — e.g. "goal entered → probe question shown that references the stated goal → answer captured → …". This is the executable spine `slice` carries as a standing AC (progressive coverage) and `verify` runs as interactive verification. If the Restated Request names no core loop, or in compressed intake modes, skip this step and omit the section.
6b. **Augmentation plan (perf / observability / rollout).** Fold augmentation questions into discovery rounds (Rounds 2–4 naturally surface observability gaps, performance sensitivity, and rollout risk). After the discovery interview, synthesize into `## Augmentation Plan` and set `augmentations-needed:` frontmatter. For each type, ask (or infer from answers):
   - **`instrument`**: Dark code paths with no observable signal? Will anyone know in production whether this worked?
   - **`experiment`**: Business uncertainty whether this change is better? Would a controlled rollout (feature flag, A/B, canary) reduce risk?
   - **`benchmark`**: Performance target in the AC, or regression risk in a latency-sensitive area?
   - **`profile`**: Profiling explicitly requested, or did discovery reveal a hotspot needing locating before work begins?
   Write one sub-bullet per decided type: what it covers, why chosen. If none, write "None — [reason]". Set `augmentations-needed:` to the list (or `[]` if none).
6. **Documentation plan (Diátaxis):** Classify what documentation this feature needs:
   - New API surface or config → **reference**; user-facing behavior → **how-to guide**; major new capability for new users → **tutorial**; architectural decisions/trade-offs → **explanation**; significantly changes project capabilities → **README update**
   - Write the classification into `## Documentation Plan`. For each doc: type, target audience, what it must cover, what it must NOT cover.
   - If no user-facing docs are needed (pure internal refactor, test-only change), write "None required" with reasoning.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
8·pre. **Adversarial pre-mortem (the RIM generator — run BEFORE 8a).** Before adjudicating the ledger, run one short adversarial pass: *"It is N weeks later and the shipped product betrayed its intake; write the two most likely post-mortems."* Scale N to the appetite (a week for a small slice, a quarter for a large build). Each post-mortem must name a **specific** way the build could drift from what the PO asked — a narrowed capability, an inverted control authority (deterministic code owning what the intake assigned the model/agent), a deferred wall that never cleared — not a generic "it was buggy". **Convert each distinct risk into a RIM entry** on `00-index.md` `intent-risks` (`status: open`, `severity` by blast radius); a pre-mortem that surfaces an already-ledgered risk just confirms it. The pre-mortem is the RIM **generator**; Step 8a is its adjudicator and the ledger its tracker — so 8a now adjudicates both intake-authored and pre-mortem-authored RIMs. When `externalDispatch.enabled`, you MAY dispatch the same question to the `$consult` panel for a multi-model pre-mortem and fold its distinct risks in; skip silently when dispatch is off.
8a. **Adjudicate the intent-risk (RIM) ledger (MANDATORY GATE — mirrors the force-scope rule).** Read `00-index.md` `intent-risks` (authored by intake from "Risks if Misunderstood"). For EVERY entry with `status: open`, set exactly one of:
   - `status: adjudicated` — with `decision:` (the named choice AND its tradeoff, not a restatement) and `adjudicated-by: 02-shape.md#<section>`. If the risk touches a **PO directive** (anything in intake's Known Constraints or a recorded PO answer), `po-ratified` must be `true` — a PO question was asked THIS stage; cite the `po-answers.md` entry. `false` is legal only with an explicit PO-declined note; `not-required` only when the decision alters no PO directive.
   - `status: carried` — the risk genuinely cannot be resolved at shape; it MUST then appear in `## Unknowns / Open Questions` with the receiving stage named.
   A shape that leaves ANY RIM `open` may NOT write `status: complete`. Adjudication prose that merely restates the risk without a decision ("we will keep this in mind") is ILLEGAL — the tell is the same as the force-scope rule's. Write the updated `intent-risks` entries back into `00-index.md`. (Compressed intake modes may carry no RIMs — then this step is a no-op.)
8b. **Author the `## Intake Fidelity` table (MANDATORY section).** One row per intake **Known Constraint / directive** and each numbered item of the Restated Request: `directive | disposition (honored / narrowed / dropped) | how | authority`. A `narrowed` or `dropped` row REQUIRES `authority` = a quoted PO answer whose **scope covers the requirement** (per [_question-craft.md](_question-craft.md)'s scope-of-authority rule) or a this-stage PO ratification. "Consequence of another answer" is NOT authority — an over-read narrowing (a vendor answer silently becoming a requirement cut) is exactly what this table exposes; owe the PO one more question rather than write an unauthorised narrowing.
9. Write `.ai/workflows/<slug>/02-shape.md` (and, if Step 5b applied, `.ai/workflows/<slug>/02b-design.md` — its structure, sibling `.yaml`, and fragment contract are defined in [design/shape.md](design/shape.md)).

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `$wf slice`. Present the user with ALL viable options:

**Option A (default): Slice** → `$wf slice <slug>`
Use when: Spec covers multiple distinct areas, has more than one AC cluster, or would benefit from incremental delivery.

**Option B: Skip to Plan** → `$wf plan <slug>`
Use when: Single coherent unit — one clear scope, one acceptance path, ≤5 files likely touched, no meaningful way to split.

**Option C: Revisit Intake** → `$wf intake <slug>`
Use when: Shaping revealed the intake brief is wrong, missing key constraints, or misunderstands the problem.

**Option D: Blocked — re-run shape** → `$wf shape <slug>`
Use when: Required PO answers are still missing.

**Option E: (design is already in the pipeline)** — no separate design command.
When `stack.ui ≠ ∅` and the work has visual surface, shape has **already authored** `02b-design.md` (Step 5b). `plan` authors `02c-craft.md` and resolves the direction gates; `implement` builds against them — design is woven through the normal `slice → plan → implement → verify` flow, so Option A or B carries it forward. There is no `$wf design <slug> craft` hand-off. (Standalone design transforms — `colorize`, `typeset`, `animate`, … — remain available ad-hoc via `$wf design <slug> <transform>`; they are not part of the default flow.) If `stack.ui` is empty, ignore this note.

Write ALL viable options into `## Recommended Next Stage` so the user can choose.

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
augmentations-needed: [<instrument|experiment|benchmark|profile>]
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "$wf slice <slug>"
---
```

# Shape

## The Shape
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions, and the top risk; structured sections below are drill-down. Voice per `_narrative-voice.md` — no "This shape implements…" openings. 1–4 short paragraphs. The story MUST name the highest-severity intent-risk (RIM) carried from intake and how shape disposed of it (the choice made, or what it was carried to) — this keeps the load-bearing adjudication legible to a PO who reads only the prose. -->

## Problem Statement

## Primary Actor / User

## Desired Behavior

## Charter Scenario
<!-- Authored only when the intake's Restated Request names a numbered core loop (Step 5c); otherwise omit
the section entirely. The core loop as ONE scripted end-to-end scenario — every step carries an OBSERVABLE
checkpoint a human or tool could confirm, not just an intent. `slice` carries this scenario as a standing AC
(progressive coverage — the visible-milestone slice through step N, the final slice through all steps);
`verify` runs it as interactive verification subject to first-light. Compressed intake modes: skip. -->
1. <step> → <observable checkpoint>
2. ...

## Acceptance Criteria
- Given ... When ... Then ...
- For each criterion, classify verification method:
  - `automated` — unit/integration test can prove it
  - `interactive` — requires running the app and verifying visually or through device interaction (browser, emulator, device)
  - `manual` — requires human judgement or external system check
- Interactive criteria MUST specify: what tool/method to use (Playwright, Maestro, adb, browser automation, etc.), what to look for, and how to capture evidence (screenshot, recording, console output)
- **Named-mechanism rule (a test may not name a machine the design does not own).** Any architectural mechanism named in an AC, its verification method, or a test-plan line — a state machine, scheduler, queue, cache, pipeline, orchestrator, a controlling regex — MUST exist as a **named decision in this artifact's body**: one sentence stating the mechanism, what it replaces, and why. A mechanism that enters only through a test method (an AC verified by "interview state-machine unit tests" with no body decision naming the FSM) is a control-authority decision smuggled past adjudication — name it in the body (and, if it touches a RIM or PO directive, adjudicate it per Step 8a) or drop it from the AC.

## Non-Functional Requirements
<!-- Constraint precedence (W8.3): any NFR that COULD conflict with a charter commitment (`00-index.md`
`charter:`) MUST carry an explicit ranking against it — `yields-to: C<n>` (the commitment wins) or
`outranks: C<n> (PO-ratified)` (the NFR wins, and a PO answer THIS stage authorizes it; cite the
`po-answers.md` entry). An UNRANKED NFR-vs-charter conflict is an open question routed to the PO, never an
author's silent call. `plan` QUOTES this ranking when it cites the NFR as a mechanism rationale — an
unranked NFR cited against a commitment is the tell of an intent-bearing decision. -->
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
<!-- Capabilities deferred by the Round 5 scope-restraint pass: speculative generality, gold-plating, "while we're here" additions the core ask does not require. Record each with a one-line rationale — a logged decision the PO agreed to, not a silent drop. -->
- ...

## Intake Fidelity
<!-- REQUIRED (Step 8b). One row per intake Known Constraint / directive AND each numbered Restated-Request item. A `narrowed`/`dropped` row's `authority` must be a quoted PO answer whose SCOPE covers the requirement (not the consequence of a differently-scoped answer) or a this-stage PO ratification. This table is where an over-read narrowing — a vendor answer silently becoming a requirement cut — becomes visibly illegal. It is a named input to the intent-fidelity review dimension downstream. -->
| Intake directive | Disposition | How | Authority |
|---|---|---|---|
| ... | honored / narrowed / dropped | ... | quoted PO answer (scope-covering) / this-stage ratification / — |

## Definition of Done
- ...

## Verification Strategy

**Target verification environment (record this first — it is the fact most often missed).** State the concrete environment verification will run in: host OS, whether an Android device/emulator or iOS simulator is available, which browser/driver is present or installable (Playwright / Cypress / dev-browser / Chrome MCP), and whether live or staging credentials exist. Surfacing this **here**, before any AC is finalized, lets `slice` author each AC with a verification path that fits — instead of `verify` discovering the wall and rationalizing past it. Source it from Explore sub-agent 1's interactive-tooling findings and the PO's tooling answer.

**Observation Model (per headline outcome).** For each acceptance criterion, state *how* a human or tool would observe success *and in what environment* — e.g., "carousel is single-column at 375px → observed by driving a 375px-viewport browser and reading the rendered layout," not merely "carousel is single-column." If you cannot name how an outcome would be observed in the target environment, re-scope it to something observable, or flag the constraint now so `slice` and `plan` inherit it.

**Force-scope rule (constraints get engineered, not documented).** When the Observation Model or target-environment statement names an environment dependency on a headline outcome's critical path — credentials, a device, an external service, an inbound callback, infrastructure that does not yet exist (a TURN relay, a staging deploy) — shape MUST route it into scope, not prose. Exactly one of: flag it as a **candidate prerequisite slice or harness** for `slice` to scope; state the **proxy observation** the plan will hold pre-deploy plus the **named event that clears the residual** ("cleared by the first `-rc.N` prerelease CI run"); or record **explicit PO risk-acceptance** in `po-answers.md`. Writing "known limitation — document at handoff" while an AC depends on that limitation is ILLEGAL — the phrase is the tell that a constraint is being deferred to documentation instead of scope. `plan` enforces this per-AC (its `constraint-resolution:` gate); naming the wall honestly here keeps that gate cheap.

**Outcome-metric criteria need a pre-deploy proxy.** A live outcome metric criterion ("rich-preview rate ≥ 75% over the live corpus") must be paired with a pre-deploy proxy observation (e.g., a fixture-corpus assertion over the top-N recorded failure pages) so verification holds *something* before ship; the live metric becomes the clearing event for the residual deferral.

Then classify how each AC and edge case will be verified:

**Automated checks** (CI/test suite):
- ...

**Interactive verification** (requires running the app and observing behavior):
- Platform: web / Android / iOS / desktop / CLI
- Tool: Playwright / Maestro / adb / browser automation / dev-server + manual / other
- What to verify: user flow and expected visual/behavioral outcome
- Evidence capture: screenshot / screen recording / console output / network trace

**Human-in-the-loop checks** (requires human judgement):
- ...

If purely backend/library with no UI: "Automated only — no interactive verification needed. [reason]."

## Augmentation Plan
<!-- Decided at shape, applied by plan. One sub-bullet per type: what it covers and why. If none: "None — [reason]". -->
- **instrument** (if decided): <what dark paths / signals are needed>
- **experiment** (if decided): <what business uncertainty warrants a controlled rollout>
- **benchmark** (if decided): <what performance target / regression risk>
- **profile** (if decided): <what hotspot needs locating>

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
- **Option A (default):** `$wf slice <slug>` — [reason]
- **Option B:** `$wf plan <slug>` — [reason, if single-scope]
- **Option C:** `$wf intake <slug>` — revisit intake [reason, if applicable]

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

## Additive-write contract (v9.20.1+)

`02-shape.md` is a revisable artifact. When `$wf shape` is re-invoked on a slug that already has one, follow [_additive-write.md](_additive-write.md) — snapshot, **rewrite the body to current truth** (do not stack `## Revision N` sections), and add one ledger entry:

- Snapshot: `.ai/workflows/<slug>/history/02-shape-<rev>.md` (sibling `02-shape.yaml` per the shared YAML rule).
- **Ledger entry**: `trigger: scope-change` (or `answers-returned` when the reshape resolves open questions), `because:` naming what prompted the reshape, `changed:` naming what moved in the spec.

`regenerable: true` applies only if `$wf shape` is wrapping an auto-derived shape (e.g., post-amendment regeneration) — it does not normally carry the flag, and when it does there is no ledger entry. History view paths are stable (`<slug>/shape/history/<rev>/INDEX.html`).
