# Changelog

All notable changes to the sdlc-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-03-20

### Added
- **Adaptive routing on every command** — each stage now evaluates what should come next instead of blindly pointing to the sequential successor. Every command presents multiple options (default, skip-to, revisit, blocked) with clear reasoning so the user can choose the best path forward.
- **Parallel sub-agent planning (`wf-plan <slug> all`)** — plans all slices concurrently using one sub-agent per slice. Each sub-agent writes its plan directly to `04-plan-<slice>.md`. The main agent then reads all plans, runs a cohesion check for conflicts/gaps/integration points, and writes a master `04-plan.md`.
- **Parallel sub-agent research** on research-heavy stages:
  - `wf-shape`: parallel Explore agents for codebase + web freshness
  - `wf-plan`: parallel Explore agents for code inspection + freshness per slice
  - `wf-implement`: parallel Explore agents to re-check codebase state before editing
  - `wf-verify`: parallel sub-agents for lint/typecheck, tests, accessibility, and freshness
  - `wf-review`: parallel sub-agents for correctness, quality, security, and freshness
  - `wf-ship`: parallel sub-agents for deployment target, dependency advisories, and CI/CD config
  - `wf-retro`: parallel sub-agents for implementation analysis, review analysis, and repo config scanning
- **Skip-to routes** documented in each command's pipeline table (e.g., intake can skip to plan for trivial tasks, implement can skip verify for docs-only changes, verify can skip review for solo projects)
- **Next-slice awareness** on review, handoff, ship, and retro — these stages now check `03-slice.md` for remaining slices and offer "continue to next slice" as an option
- **`wf-next` enhanced** to present ALL options from the current stage's recommendations, check for skip opportunities, and list remaining slices

### Changed
- **BREAKING: Chat return contract** now returns `options:` (multiple) instead of `next:` (single) for all commands except `wf-next`
- Stage file `## Recommended Next Stage` section now contains multiple labeled options (Option A/B/C/D) instead of a single recommendation
- `wf-plan` description updated to reflect dual-mode capability (single slice or all slices)
- `wf-ship` prerequisites relaxed: `08-handoff.md` is now recommended but not strictly required (minimum is `05-implement.md`)

## [2.0.0] - 2026-03-20

### Changed
- **BREAKING: Full rewrite of all 11 commands with intelligent pipeline awareness**
  - Every command now knows its stage number (e.g., "stage 4 of 10") and position in the pipeline
  - Full pipeline map (`1·intake → 2·shape → ... → 10·retro`) shown at the top of every command
  - Requires/Produces/Next table so the model knows exactly what files it depends on and what comes after
- **Step 0 — Orient** added as a mandatory gating step in all commands:
  - Reads `00-index.md` FIRST, before any other work
  - Checks prerequisite files exist — STOPs with actionable error if missing (e.g., "Run `/wf-plan` first")
  - Detects out-of-order execution — WARNs before overwriting a completed stage
  - Checks for `Awaiting input` status on prior stages — STOPs and tells user to resolve pending questions
  - Carries forward `selected-slice-or-focus` and `open-questions` from the index
  - Intake specifically detects resume vs. fresh start vs. overwrite scenarios
- **Compressed shared boilerplate** from ~61 duplicated lines per command to ~10 lines without losing any rules
- `wf-next` simplified to focus on routing — reads index fields and returns the exact invocation

### Removed
- Redundant slug-and-argument-contract section (logic moved into Step 0 orient)
- Verbose freshness/multi-agent/scope rule sections (compressed into compact workflow rules block)

## [1.1.0] - 2026-03-20

### Added
- **Execution discipline guardrails** on all 11 commands — explicit instructions preventing the model from jumping ahead to solve the problem instead of running the workflow stage
- **Detailed how-to README** in Diátaxis style — 13 goal-oriented sections covering every usage pattern
- **IDEAS.md** — 15-item roadmap of high-value improvements

### Fixed
- `/wf-intake` (and all other commands) no longer starts working on the user's task before completing the workflow steps — each command now has a stage-specific "CRITICAL — execution discipline" section that fires before all other instructions

## [1.0.0] - 2026-03-17

### Added
- Initial release of the SDLC workflow plugin — 11 commands covering the full software delivery lifecycle
- **`wf-intake`** — stage 1: converts a rough request into a clear intake brief, creates the workflow folder, captures first product-owner answers, establishes the canonical slug; writes `01-intake.md`
- **`wf-shape`** — stage 2: defines scope boundaries, success criteria, and constraints; writes `02-shape.md`
- **`wf-slice`** — stage 3: breaks the shaped work into user stories with acceptance criteria; writes `03-slice.md`
- **`wf-plan`** — stage 4: creates a task-level implementation plan from the slices; writes `04-plan.md`
- **`wf-implement`** — stage 5: executes the plan, tracks progress against tasks; writes `05-implement.md`
- **`wf-verify`** — stage 6: runs tests and QA checks, records results; writes `06-verify.md`
- **`wf-review`** — stage 7: code review gate, records review findings and sign-off; writes `07-review.md`
- **`wf-handoff`** — stage 8: produces handoff notes and documentation for others; writes `08-handoff.md`
- **`wf-ship`** — stage 9: manages the release (mandatory-question stage before proceeding); writes `09-ship.md`
- **`wf-retro`** — stage 10: retrospective capture; writes `10-retro.md`
- **`wf-next`** — routing helper: reads `00-index.md` to determine current stage and suggests the next command; writes `90-next.md`

### Technical Details
- All commands use `disable-model-invocation: true` — must be invoked explicitly by user or via an Agent spawn
- Workflow artifacts stored under `.ai/workflows/<slug>/` with `00-index.md` as the control file
- `00-index.md` tracks 11 required fields: slug, title, status, current-stage, created, updated, owner, description, tags, blockers, notes
- Product-owner interaction uses the `AskUserQuestion` tool for mandatory confirmation steps (intake, ship)
- Freshness rules: web search before answering questions about external libraries, APIs, or tooling
- Chat return contract: compact summary per command (slug, wrote, next, ≤3 blocker bullets)
