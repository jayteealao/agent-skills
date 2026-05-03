# Changelog

All notable changes to the sdlc-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [8.30.0] - 2026-05-03

### Changed

- **Per-slice review artifacts.** `wf-review` now writes `07-review-<slice-slug>.md` (master verdict) and `07-review-<slice-slug>-<command>.md` (per-command sub-reviews) instead of a single workflow-wide `07-review.md` and `07-review-<command>.md`. Running review on a second slice no longer overwrites the first slice's review — every reviewed slice keeps its own master verdict and per-command findings on disk.
- **`wf-handoff` aggregates per-slice reviews.** Handoff now requires `07-review-<slice-slug>.md` for *every* slice in scope and STOPs with the offending slice slug(s) listed if any slice's `verdict` is `dont-ship` or has unresolved blockers in frontmatter (`metric-findings-blocker > 0` without a `## Fix Status` resolution). The `refs.review` pointer in `08-handoff.md` frontmatter is replaced by `refs.reviews: [<list>]`.
- **Consumers updated.** `wf-implement` reviews mode reads the slice-scoped review file (and accepts an explicit slice argument); `wf-amend from-review` reads the per-slice file (or aggregates siblings for cross-slice spec errors); `wf-extend from-review` globs every per-slice review since missing-capability findings often span slices; `wf-retro` and `wf-how findings` glob across all per-slice review files; `wf-ship` reads every per-slice review for changelog completeness; `wf-skip review` now writes a slice-scoped stub and requires a resolvable slice slug; `wf-status` matrix and frontmatter `refs.review` updated. README and frontmatter schema reference table updated.

### Why

Each slice review previously **overwrote** `07-review.md` and every `07-review-<command>.md`, because filenames were not slice-scoped (every other stage from `03-slice` through `06-verify` already had `<slice-slug>` in the filename). Multi-slice features that ran review per slice without committing in between lost prior verdicts and triage state, and `wf-handoff` could only see "the most recent review" rather than aggregating across the slices it was about to bundle into one PR. Slice-scoping the filename makes 07 consistent with surrounding stages and lets handoff enforce a per-slice ship gate.

## [8.18.0] - 2026-05-03

### Added

- **`wf-rca` command — read-only root-cause analysis workflow.** Investigates a reported issue using three parallel diagnosis sub-agents (code path investigation, recent change correlation, blast radius), writes a structured RCA artifact at `.ai/workflows/rca-<slug>/01-rca.md` with eleven sections including symptom, scope, investigation summary, root cause (with `file:line` evidence), contributing factors, blast radius, suggested fix shape (1-3 lines of *direction*, not a plan), verification criteria, and confidence ratings for both the root cause and the fix shape. Does NOT write a fix and does NOT switch branches — investigation is strictly read-only. Synthesizes a minimal `02-shape.md` from the RCA so `/wf-plan <slug>` can consume the workflow directory without modification, treating `01-rca.md` as the deeper investigation context. Routing recommendation logic: `impact: critical` + production + medium-or-better confidence + small fix shape -> `/wf-hotfix`; small fix shape (≤3 files, ≤5 steps, no new dependency, no architecture change) -> `/wf-quick`; anything else -> `/wf-plan`; `confidence: low` + `blast-radius: high` -> `human-triage` (escalation, no auto-route). Tripwires (warn-and-continue): low confidence, high blast radius, multiple plausible root causes, concurrent open PR touching the implicated path, same buggy pattern repeating elsewhere. Tripwires record what fired in the artifact; they never block writing the RCA. Recommendation surfaces alternates with priority order; the user makes the final routing call. Distinct from `wf-hotfix` (which diagnoses *and* fixes), the `error-analysis` skill (general RCA toolkit, no workflow integration), and `wf-how` (explanation/Q&A, not investigation).

## [8.17.0] - 2026-04-28

### Added

- **`wf-quick` command — compressed planning workflow for small intentional changes.** Collapses the first five lifecycle stages (intake, shape, design, slice, plan) into a single `01-quick.md` artifact written in one pass, then routes to `/wf-implement` so the standard execute-verify-review-handoff-ship lifecycle takes over from stage 5 onward. Asks at most 2 questions in chat (no `AskUserQuestion`, no separate `po-answers.md` — answers inline into the artifact). Parallel Explore sub-agents gather codebase grounding (files in scope, nearby patterns, reuse candidates, recent churn) and optional web freshness (skipped if the change is purely internal). Design is **never auto-included**; if `--design` is passed it adds 3-5 design notes, otherwise the section records a recommendation to run `/wf-design` as a follow-up when UI surface is touched. Slicing is skipped by definition (single-slice). Tripwires (warn-and-continue, never block): >3 files touched, >5 implementation steps, new external dependency, architectural change, >2 unanswered open questions. When a tripwire fires the plan is still written but a `Tripwire breaches` section records what tripped and recommends `/wf-intake` for the next change. Default branch is `quick/<slug>`; `branch-strategy: none` is honored when the user is mid-task on an existing branch. Artifacts land in `.ai/workflows/quick-<slug>/` with `workflow-type: quick` in the index. Distinct from `wf-hotfix` (incident response, production-branch base, hard scope lock) and `wf-refactor` (behavior-preserving refactoring with test baseline).

## [8.16.0] - 2026-04-28

### Changed

- **Parallel sub-agent dispatch is now the unconditional expectation across all workflow stages.** Removed `(use sub-agents when supported)` headings from `wf-implement`, `wf-retro`, `wf-shape`, `wf-ship`, and `wf-verify`; removed `when supported` qualifiers from the parallel-research footer guidance in `wf-intake`, `wf-shape`, and `wf-slice`; and removed the `(or scan directly if sub-agents are not available)` parenthetical from `wf-design-setup`. The `wf-design-critique` "If sub-agents are not available... complete each assessment sequentially" fallback was deleted entirely; the preceding sentence now requires parallel dispatch as the only path. Both Claude Code and Codex support concurrent sub-agent dispatch — the hedging language was masking that and giving the model permission to serialize parallelizable work.

- **Codex adapter compatibility rule rewritten from defensive fallback to positive directive.** The boilerplate emitted by `scripts/generate-codex-plugin.mjs` for every generated skill no longer says "if delegation is unavailable... perform the review steps locally or sequentially and state that adaptation." The replacement reads: "When the canonical source asks for parallel sub-agents, dispatch them in parallel. Codex supports concurrent sub-agent dispatch; do not serialize work that the source intends to fan out." Regenerating propagated the change to all 67 `.codex-generated/skills/*/SKILL.md` adapters.

### Fixed

- **Generator no longer strips the word `parallel` from skill descriptions.** `sanitizeCodexDescription` previously rewrote `parallel sonnet sub-agent` -> `review worker`, collapsing both the model-name translation and the parallelism qualifier in one substitution. The rewrite now produces `parallel review worker`, preserving the parallel-dispatch intent in Codex frontmatter descriptions while still translating the Claude-only model name.

## [8.15.0] - 2026-04-16

### Fixed

- **`disable-model-invocation: true` missing from 10 command files.** `wf-resume`, `wf-status`, `setup-wide-logging`, and all 7 aggregate review bundle commands (`review-all`, `review-quick`, `review-pre-merge`, `review-security`, `review-architecture`, `review-infra`, `review-ux`) were missing the frontmatter flag. Without it, invoking these commands created isolated model invocations with no access to the current conversation context — meaning `wf-resume` could not see the session it was supposed to resume. All command files now consistently include `disable-model-invocation: true`.

## [8.14.0] - 2026-04-16

### Added

- **`wf-hotfix` command — compressed incident-response workflow.** Six-stage pipeline (brief → diagnose → plan → implement → verify → ship) with a hard scope lock: the plan is capped at 5 steps, changes beyond the identified root cause require explicit approval, and escalation to a full `/wf-intake` workflow is enforced when the fix touches more than 3 files or requires architectural changes. Replaces the 5-round PO interview with at most 3 questions. Always branches from the production/default branch (`hotfix/<slug>`). Parallel Explore sub-agents for root-cause diagnosis and blast-radius mapping. Artifacts land in `.ai/workflows/hotfix-<slug>/` with `workflow-type: hotfix` in the index.

- **`wf-update-deps` command — dependency audit and update workflow.** Scans all package manifests (npm, pip, go.mod, Cargo.toml, pom.xml, pubspec.yaml), runs the package manager's built-in audit commands, then launches parallel web research sub-agents (batched 3–5 packages each) to check latest versions, changelogs, breaking changes, migration guides, and CVEs per dependency. Updates are grouped into four tiers and implemented in order: P0 security (one at a time, commit per package), P1 major-with-migration (one at a time with migration steps), P2 safe-batch (minor/patch in a single commit), Hold (documented with revisit condition). Never mixes tiers in a single commit. Blocked packages are documented without touching application code. Supports `--security-only` and `--audit-only` flags. Artifacts land in `.ai/dep-updates/<run-id>/`.

- **`wf-docs` command — documentation audit and Diátaxis generation.** Four-pass workflow: discover (inventory all markdown, README, API docs, docstrings), audit (parallel sub-agents check each doc for accuracy vs. codebase, Diátaxis quadrant fit, and freshness), plan (gaps grouped by priority: broken P0 → missing P1 → wrong-quadrant P2 → stale P3), generate (invokes the appropriate Diátaxis skill for each planned action). For `slug` mode, reads the workflow's `02-shape.md → ## Documentation Plan` and fulfills it before adding new docs. Supports `--audit-only` flag to stop after planning. Audit artifacts land in `.ai/docs/<run-id>/`; generated docs are written in-place to project paths.

- **`wf-refactor` command — behavior-preserving refactoring with test baseline.** Five-stage pipeline (brief → baseline → plan → implement → verify) built around a non-negotiable constraint: external behavior must be identical before and after. The baseline stage captures the complete ground truth before any code changes — exported API surface, all callers in the codebase, test pass/fail counts, and coverage gaps — in `rf-baseline.md`. The plan stage researches the target refactoring pattern via web search. Implementation executes one step at a time with a per-step green check; if a test that was passing before now fails, the refactoring is fixed, not the test. Verify does a full before/after comparison against the baseline. Routes to `/wf-review <slug> refactor-safety` after passing. Artifacts land in `.ai/workflows/refactor-<slug>/` with `workflow-type: refactor`.

## [8.13.0] - 2026-04-16

### Changed

- **`wf-shape` sub-agent 2, `wf-plan` web research sub-agent — expanded to cover best practices, gotchas, and performance pitfalls.** Both sub-agents previously only checked dependency versions, official docs, and CVEs. Two new research sections added to each: (1) **Implementation best practices** — searches for established patterns, community consensus on how to implement the feature type correctly, anti-patterns on official docs and engineering blogs, relevant RFCs and platform guidelines, and whether the implied approach is idiomatic or considered an anti-pattern in the current ecosystem. (2) **Known gotchas and performance pitfalls** — searches for common performance traps specific to the feature type (re-renders, N+1, layout thrash, bundle size, memory leaks), community "lessons learned" and postmortems, and known library quirks. Merge instructions updated to require that best practices and gotcha findings directly influence acceptance criteria (at shape) and implementation steps (at plan), not just land in `## Freshness Research` as passive records.

## [8.12.0] - 2026-04-16

### Changed

- **`wf-shape` — web search sub-agent now fires by default (opt-out, not opt-in).** The previous gate ("When the shaped spec touches multiple domains") meant Explore sub-agent 2 almost never launched — most features are single-domain. Replaced with explicit opt-out criteria: skip only if ALL five conditions are true (zero new external dependencies, no changes to existing dependency API surface, not security-sensitive, no browser/platform APIs, no external API integrations). When in doubt: always launch. Step 4 instruction updated to reference the new skip criteria rather than the old "if multi-domain" condition.

- **`wf-plan` — web research sub-agent now fires by default (opt-out, not opt-in).** The previous top-level "Do not spin up sub-agents for trivial or single-file work" gate was being applied too broadly, causing the web research agent to be skipped unless the user explicitly requested it in arguments. Top-level gate changed to "skip criteria are per-agent and intentionally narrow — do not apply a blanket trivial exemption." Web research sub-agent section now opens with "Launch this sub-agent for every slice" and lists narrow opt-out conditions: pure refactoring with no dependency changes, config/env-only changes, or text/copy/i18n changes only. Explicit "Do NOT skip because the slice feels small" rule added.

## [8.11.0] - 2026-04-16

### Changed

- **`wf-plan` Explore sub-agent 1 — reuse scan added.** Before planning new implementations, Explore sub-agent 1 now searches the wider codebase for existing utilities and capabilities that partially or fully cover what the slice needs to build. For each slice goal and scope, it greps for keywords, type names, and domain terms across the full codebase; searches for similar logic (data transformations, validation, API wrappers, error handling, business rules); and looks for base classes, mixins, or higher-order functions that could be composed rather than reimplemented. Each candidate is reported with file:line, description, match quality, and a recommendation: reuse as-is / reuse with modification / extract into shared utility / implement fresh. Explicit "No reuse candidates found" required if nothing is found. Per-slice plan template updated with a `## Reuse Opportunities` section between `## Current State` and `## Likely Files / Areas to Touch`.

## [8.10.0] - 2026-04-16

### Added

- **`wf-how` command — five-mode question-answering and research system.** Standalone command that answers questions about the codebase, workflow artifacts, and external research topics without advancing workflow state. Routes automatically across five modes based on question signals: Mode A (Quick) — single Explore sub-agent for narrow single-function/file questions; Mode B (Codebase Explain) — 1 agent for simple questions, 2–4 parallel Explore agents + synthesis for complex architectural questions; Mode C (Deep Research) — 6–8 parallel web research agents targeting 200+ sources with a synthesis pass; Mode D (Workflow Explain) — reads target artifact(s) and explains commitments, rationale, and implications; Mode E (Findings Explain) — structured explanation of review and verification findings with root-cause clusters and recommended fix order. Step 0 parses args for explicit flags (`--research`, `--quick`), slug+artifact shortcuts (`<slug> plan`), and natural language signals. Every mode offers a Diátaxis output option (Explanation, Reference, or How-to). Artifacts written to `.ai/workflows/<slug>/90-how-*.md` when a workflow is active, `.ai/research/<topic>-<ts>.md` otherwise.

## [8.9.0] - 2026-04-13

### Added

- **`wf-ideate` command — proactive codebase ideation.** Pre-pipeline utility that scans the codebase with six parallel sub-agents across distinct lenses (code quality & technical debt, performance & scalability, security & privacy, developer experience, feature completeness, architecture & design patterns), then generates 30+ raw improvement candidates. Each candidate is challenged by a mandatory 5-test adversarial filter (real evidence, not already in progress, effort justified, specific enough to intake, right level vs. symptom). Surviving candidates are scored as `(impact_value × feasibility) / effort_value` and ranked. Results are presented via `AskUserQuestion` with multiSelect, and the full ranked+culled list is written to `.ai/ideation/<focus>-<timestamp>.md`. Optional arguments: `[focus-area]` to narrow to a single lens, `[count]` to cap the output list. Inverts the normal flow — surfaces what you might not have thought to ask about, then feeds directly into `/wf-intake`.

## [8.8.0] - 2026-04-14

### Changed

- **`wf-handoff` — aggregate-by-default, no slice argument required.** Redesigned from per-slice to PR-level. Without a slice argument, handoff now reads `03-slice.md` and aggregates all `status: complete` slices on the branch into a single PR description — which is how PRs actually work. Explicit `[slice-slug]` argument retained for the uncommon one-PR-per-slice pattern. `08-handoff.md` frontmatter updated: `slice-slug` (single) replaced by `slice-slugs` (array) and `handoff-mode: aggregate|single-slice`. The `refs.implements` field now lists all per-slice implement artifacts. Routing updated: handoff Option C changed from "next slice" (wrong level) to "implement remaining slices first, then re-run handoff". `next-invocation` no longer includes a slice.

- **`wf-ship` — slug-level only, slice argument removed.** Ship operates on the PR and branch — never on a slice. The `[target-or-slice]` second argument is replaced with `[environment]` (optional override for deployment target, e.g. `staging`, `eu-west`). `slice-slug` removed from `09-ship.md` frontmatter; `environment` field added. Option E ("next slice") removed from adaptive routing — if more slices remain, that decision belongs at the review/handoff level, not ship. Prerequisite check tightened: `08-handoff.md` with `status: complete` is now required (was "recommended"). Task metadata updated to remove slice reference.

- **`wf-review` — routing updated to match handoff/ship changes.** Option A now routes to `/wf-handoff <slug>` (no slice), with explicit guidance that handoff should run after all intended slices are complete. Option C routes to `/wf-ship <slug>`. Header table `Next` field updated with correct invocations for all four paths.

## [8.7.0] - 2026-04-13

### Added

- **`wf-amend` command** — Spec correction utility. Corrects the *definition* of existing slices — goal, acceptance criteria, scope boundaries, or fundamental approach — without overwriting completed work. Three source modes: `from-review` (extracts spec errors from `07-review.md` findings), `from-retro` (extracts corrections from `10-retro.md`), or manual. Creates versioned amendment artifacts (`02-shape-amend-<N>.md`, `03-slice-<slug>-amend-<N>.md`) alongside originals. Tracks what changed vs. the original and what implementation work is still valid. Routes to `wf-plan` directed-fix mode for the corrected plan. Distinct from `wf-extend` (new scope) and `wf-implement` (bug fixes).

- **`wf-extend` command** — Scope expansion utility. Adds net-new slices to any workflow — in-progress or completed — without modifying existing slice files or any `status: complete` entries. Three source modes: `from-review` (extracts missing-capability findings from `07-review.md`), `from-retro` (extracts follow-up work from `10-retro.md`), or general (user describes new scope). Runs a focused 4–8 question discovery interview, confirms proposed slices, then appends new `03-slice-<new-slug>.md` files and updates the master `03-slice.md` non-destructively (extension round tracking, dependency ordering, insertion position). Routes to `wf-plan` for new slices.

### Changed

- **`wf-review` — adaptive routing extended with amend and extend options.** Two new routing options added to the post-review decision tree: Option E (`/wf-extend <slug> from-review`) for when findings reveal missing capability rather than broken code; Option F (`/wf-amend <slug> from-review`) for when findings reveal the spec itself was wrong. Both options also added to the `## Recommended Next Stage` template in `07-review.md`. Header table updated to surface all four next-command possibilities.

## [8.6.0] - 2026-04-13

### Changed

- **`wf-announce` — Diátaxis integration, channel formatting, doc linking.** Three additions: (1) New Step 2 checks `08-handoff.md → ## Documentation Changes` for existing docs and `02-shape.md` frontmatter for planned-but-missing docs, then invokes the appropriate Diátaxis skill (`how-to-guide-writer`, `reference-writer`, `tutorial-writer`, `explanation-writer`, `readme-writer`) before drafting — so announcements always have docs to link to. (2) Audience question now paired with a channel question (Slack/chat, Email, GitHub Release, wiki/Notion) that shapes tone and length. (3) Each announcement draft now includes a Docs section linking to generated/existing docs, plus channel-specific formatting rules (Slack = 5–8 lines + emoji ok, Email = prose + headers, GitHub Release = markdown + code blocks, wiki = full structured format).

## [8.5.0] - 2026-04-13

### Changed

- **`wf-review` — broader, smarter review command selection.** Two fixes: (1) `reliability` was present as a command file but had no signal mapping and would never be selected — now always included for backend source changes alongside `testing` and `maintainability`. (2) Selection logic shifted from "detect patterns in the raw diff" to "reason from what the feature does using shape and slice artifacts" — features described as async, data-mutating, or API-surface-changing now trigger the right commands even when the diff text doesn't contain the specific keywords. Max raised from 12 to 15. Added explicit "when in doubt, include" rule to invert the default from exclusion to inclusion.

## [8.4.0] - 2026-04-13

### Changed

- **`wf-shape` — descriptive 20-question discovery framework.** Questions are not hardcoded — the agent generates them dynamically based on the specific feature from intake. The framework defines *what to ask about* in each round (what it does, how it behaves, what it looks like, what can go wrong, where the boundaries are) and *how to construct good questions* (feature-specific, impartial options, building on earlier answers). Later rounds adapt based on answers from earlier rounds.

- **`wf-slice` — descriptive discovery phase (4–8 questions).** Replaced one-liner "ask a small set of questions" with descriptive guidance covering delivery order preferences, slice granularity, rollout coupling, and scope cuts. Questions generated dynamically from the shaped spec.

- **`wf-plan` — descriptive discovery phase (8–12 questions).** Added user interview before writing new plans (skipped in review-and-fix modes). Covers implementation approach tradeoffs, sequencing decisions, test strategy, and risk/unknowns — all grounded in sub-agent codebase findings.

## [8.3.0] - 2026-04-13

### Changed

- **`wf-shape` — 20-question feature discovery phase.** Replaced the vague "mandatory-question stage" with a descriptive framework for a 20-question interview using AskUserQuestion across 5 rounds of 4. Questions are not hardcoded — the agent generates them dynamically based on the specific feature from intake. The framework defines *what to ask about* in each round (what it does, how it behaves, what it looks like, what can go wrong, where the boundaries are) and *how to construct good questions* (feature-specific, impartial options, building on earlier answers). Later rounds adapt based on answers from earlier rounds.

## [8.2.0] - 2026-04-12

### Added

- **`wf-announce` command** — Post-ship communication utility. Generates stakeholder-facing announcements tailored by audience (engineering, product, users) from workflow artifacts. Pulls from `08-handoff.md` and `09-ship.md` to draft plain-language, jargon-free copy with distinct voice and structure per audience: technical details and rollback plans for eng, business value and metrics impact for product, benefit-oriented what's-new for users. Writes `announce.md` to the workflow directory. Includes writing rules (active voice, no filler, specific over vague, scannable formatting) and audience selection via AskUserQuestion.

## [8.1.0] - 2026-04-12

### Added

- **`wf-sync` command** — Reality reconciliation for workflows. Cross-references all code files, test files, branches, PRs, and dependencies mentioned in workflow artifacts against the actual codebase state. Produces a `00-sync.md` sync report with health rating (in-sync / minor-drift / significant-drift / stale), per-category status tables, drift details, and recommended actions. Especially valuable mid-flight (stages 4–7) when long-running workflows can go stale from teammate merges, library releases, or config changes.

- **`wf-validate` hook** (PreToolUse: Write) — Structural integrity gate for workflow files. Validates every write to `.ai/workflows/` before it happens:
  - Slug stability: frontmatter `slug` must match the workflow directory name
  - Required fields: `schema` (must be `sdlc/v1`), `type`, and `slug` must be present
  - Stage file naming: must follow `NN-stagename.md` convention (with support for substages like `02b-design.md` and utility files like `risk-register.md`)
  - Blocks non-conforming writes with structured error messages fed back to Claude for self-correction

### Changed

- Hook count: 3 → 4 (added PreToolUse alongside existing SessionStart, PostToolUse, PreCompact)
- Lifecycle command count: 18 → 20 (added wf-sync; wf-validate is a hook, not a command, but the total reflects the new sync command plus the count correction for previously uncounted wf-skip and wf-amend stubs)

## [8.0.0] - 2026-04-12

### Added — Design quality system (5 commands + 14 skills + 13 reference files)

Based on [impeccable-style-universal](https://impeccable.style) v2.1.1 by Anthropic (Apache 2.0), adapted for the SDLC workflow pipeline.

#### 5 Design Commands (namespaced under `wf-design:`)
- **`wf-design`** — top-level design brief command. Discovery interview + UX strategy → `02b-design.md` artifact. Slots between shape (stage 2) and slice (stage 3) in the pipeline. Includes codebase exploration sub-agent for existing design system, component library, and tech stack discovery.
- **`wf-design:setup`** — one-time design context setup. Gathers brand personality, audience, aesthetic direction, accessibility requirements. Writes `.impeccable.md` to project root. All design commands and skills require this context.
- **`wf-design:critique`** — scored UX review using Nielsen's 10 heuristics (0-40 scale), cognitive load assessment, persona-based testing, and automated anti-pattern detection via `npx impeccable`. Produces `06b-critique.md` with prioritized `/design-*` skill recommendations.
- **`wf-design:audit`** — scored technical quality audit across 5 dimensions (accessibility, performance, theming, responsive, anti-patterns) on a 0-20 scale with P0-P3 severity ratings. Produces `06c-audit.md`.
- **`wf-design:extract`** — design system extraction: identifies reusable components, design tokens, and patterns, then extracts, enriches, and migrates to a shared design system.

#### 14 Design Skills (composable refinement tools)
- **`design-bolder`** — amplify bland designs with more visual impact
- **`design-quieter`** — tone down aggressive designs to refined sophistication
- **`design-colorize`** — add strategic color to monochromatic interfaces
- **`design-typeset`** — fix typography hierarchy, font choices, readability
- **`design-layout`** — improve spacing, visual rhythm, and composition
- **`design-animate`** — add purposeful animations and micro-interactions
- **`design-delight`** — add moments of joy, personality, and polish
- **`design-clarify`** — improve UX copy, error messages, labels, instructions
- **`design-distill`** — strip designs to their essence, remove complexity
- **`design-harden`** — production-ready: error handling, i18n, edge cases, onboarding
- **`design-optimize`** — diagnose and fix UI performance issues
- **`design-adapt`** — make designs responsive across devices and contexts
- **`design-overdrive`** — push interfaces past conventional limits (shaders, spring physics, 60fps)
- **`design-polish`** — final quality pass: alignment, spacing, consistency, micro-details

#### 13 Design Reference Files (bundled in `reference/design/`)
- `design-guidelines.md` — core design principles, anti-patterns, AI slop detection, Context Gathering Protocol
- `typography.md`, `color-and-contrast.md`, `spatial-design.md`, `motion-design.md`, `interaction-design.md`, `responsive-design.md`, `ux-writing.md` — deep reference material for each design dimension
- `craft.md`, `extract.md` — workflow reference for build and extraction flows
- `cognitive-load.md`, `heuristics-scoring.md`, `personas.md` — evaluation frameworks for critique

#### Architecture
- **Commands** produce SDLC artifacts with YAML frontmatter (workflow stages)
- **Skills** modify code directly without workflow ceremony (composable refinement)
- **critique and audit** generate ordered action plans dispatching design skills by name
- **Pipeline integration**: `wf-intake → wf-shape → wf-design → wf-slice → wf-plan → wf-implement → [design-* skills] → wf-design:audit → wf-design:critique → [design-* fixes] → design-polish → wf-verify → ...`

### Changed
- Plugin description updated to reflect 18 lifecycle commands and 25 skills
- Added design, ux, accessibility, typography, responsive keywords

## [7.12.0] - 2026-04-12

### Added — `wf-resume` context recovery command
- **`wf-resume`** — new command that reads the full workflow trail (all stage files + `po-answers.md`) and distills it into a dense ~500-word context brief for resuming after a break, onboarding a sub-agent, or recovering context in a new session.
  - Reads every existing stage file's frontmatter and body, extracting: key decisions, acceptance criteria status, deviations, test results, open findings, blockers
  - Synthesizes `po-answers.md` into only the decisions that constrain future work (discards superseded decisions)
  - Checks branch state and warns if user is on wrong branch
  - Builds slice progress matrix if sliced
  - Strict token budget: ~200 words for early workflows, up to 600 for complex multi-slice workflows with review findings
  - Writes `90-resume.md` as a persistent artifact sub-agents can reference
  - Chat output IS the brief — no preamble, no footer, maximum signal density
  - Unlike `wf-next` (reads only index, returns next command) and `wf-status` (reads indexes across workflows, renders dashboard), `wf-resume` reads ALL artifacts in one workflow and distills the full decision history
- Plugin description updated to reflect 13 lifecycle commands.

## [7.11.0] - 2026-04-11

### Added — `wf-status` dashboard command
- **`wf-status`** — new read-only command that renders a grouped dashboard across all workflows. No side effects, no artifacts written.
  - **Dashboard mode** (`/wf-status`): Globs all `.ai/workflows/*/00-index.md`, parses frontmatter, groups workflows into Active / Blocked / Completed tables with slug, title, stage, status, slice, last updated, next command. Includes staleness detection (>7 days), branch summary for dedicated-branch workflows, and quick-actions section.
  - **Detail mode** (`/wf-status <slug>`): Single-workflow deep view with stage progress table (✓/→/✗/· per stage), slice progress matrix (plan through ship per slice), key metrics (files changed, review findings, acceptance criteria, interactive checks), open questions, branch info with mismatch warnings, and next-step options.
- Plugin description updated to reflect 12 lifecycle commands (10 stages + wf-next + wf-status).

## [7.10.0] - 2026-04-11

### Added — dev-browser as preferred web verification tool
- **`wf-verify`** — web verification now uses a prioritized tool chain: (1) `dev-browser` (preferred — sandboxed Playwright, persistent pages, `page.snapshotForAI()`, screenshots to `~/.dev-browser/tmp/`), (2) Chrome MCP tools (`mcp__claude-in-chrome__*`) as fallback, (3) Playwright directly if configured. Includes installation prompt if dev-browser is not available and the project is a web app.
- **`wf-verify`** — web verification section includes complete dev-browser usage patterns: heredoc scripts, persistent named pages, `--headless` vs `--connect` modes, AI-friendly DOM snapshots.
- **`wf-shape`** — exploration sub-agent now checks for `dev-browser` availability and recommends installation for web projects.
- **`wf-plan`** — test infrastructure sub-agent now checks for `dev-browser` and Chrome MCP tools, reports gaps for web projects.
- All three commands replace vague "agent-browser/dev-browser" references with concrete tool detection and usage patterns.

## [7.9.0] - 2026-04-11

### Added — Interactive & visual verification (human-in-the-loop testing)
- **`wf-shape`** — new `## Verification Strategy` section in the shape template classifying each acceptance criterion as `automated`, `interactive`, or `manual`. Interactive criteria must specify platform, tool, and evidence capture method.
- **`wf-shape`** — exploration sub-agent 1 now discovers interactive verification tooling: E2E frameworks (Playwright, Maestro, Detox, Cypress), device tooling (adb, emulators), browser automation (chrome MCP tools, agent-browser/dev-browser), screenshot/visual regression infrastructure, dev server scripts, and QA checklists.
- **`wf-shape`** — acceptance criteria template now requires verification method classification per criterion.
- **`wf-plan`** — test infrastructure sub-agent now discovers interactive verification tooling and maps it to acceptance criteria from the shape's verification strategy.
- **`wf-plan`** — `## Test / Verification Plan` template split into automated checks and interactive verification sections with per-criterion platform, tool, steps, evidence capture, and pass criteria.
- **`wf-verify`** — replaced narrow "UI & Accessibility" sub-agent with comprehensive "Interactive & Visual Verification" sub-agent covering:
  - **Web**: Playwright / browser automation — start dev server, navigate, interact, screenshot, read screenshot, check console/network
  - **Android**: adb / Maestro — build, install, launch, run flows, screencap, read screenshot, check logcat
  - **iOS**: xcrun simctl / XCUITest / Detox — build, screenshot, run existing test suites
  - **CLI**: run commands, capture stdout/stderr, verify output format
  - **Desktop**: automation tools, screenshot capture
  - **Evidence protocol**: screenshot per criterion, stored in `.ai/workflows/<slug>/verify-evidence/`, referenced in report
- **`wf-verify`** — template gains `## Interactive Verification Results` section with per-criterion evidence chain (tool, steps, screenshot path, observation, result).
- **`wf-verify`** — frontmatter gains `metric-interactive-checks-run`, `metric-interactive-checks-passed`, `evidence-dir` fields.

## [7.8.0] - 2026-04-11

### Changed — Extensive sub-agent exploration playbooks across the pipeline
- **`wf-shape`** — replaced vague 3-line sub-agent instructions with detailed exploration playbook:
  - Explore sub-agent 1: 5 sections (directory/module structure, existing patterns/conventions, integration surfaces, data flow, test structure) each with 3–5 specific investigation items
  - Explore sub-agent 2: 4 sections (dependency versions/compatibility, library documentation/patterns, security advisories, ecosystem context) each with 3–4 specific items
- **`wf-plan`** — replaced vague single-plan instructions with 4 detailed sub-agent playbooks:
  - Explore sub-agent 1 (Affected Code Deep Dive): files/modules, call graph/dependency chain, existing patterns, integration surfaces
  - Explore sub-agent 2 (Second Domain): domain-specific structure, cross-domain contract — launched only when slice crosses domain boundaries
  - Explore sub-agent 3 (Test Infrastructure): framework/config, existing coverage, test helpers, test patterns
  - Web research sub-agent: dependency freshness, API/library patterns, security/known issues
  - Enhanced parallel plan mode with specific cohesion check items (shared files, migrations, test fixtures, API contracts, config)
- **`wf-implement`** — replaced vague 3-line pre-implementation check with 2 detailed sub-agent playbooks:
  - Explore sub-agent 1 (Pre-Implementation Codebase Verification): plan drift detection, current state verification, convention verification
  - Explore sub-agent 2 (Dependency & API Freshness): dependency state, cross-service state — launched only when external dependencies involved
- **`wf-verify`** — replaced vague 4-line sub-agent list with 4 detailed functional sub-agent playbooks:
  - Functional sub-agent 1 (Static Analysis & Build): lint/format, type checking, build verification with specific commands per ecosystem
  - Functional sub-agent 2 (Test Execution): unit tests, integration tests, coverage — with targeted then full-suite strategy
  - Functional sub-agent 3 (UI & Accessibility): visual verification, accessibility checks — launched only for frontend changes
  - Web research sub-agent 4 (Freshness Impact): dependency drift, known issues — launched only when external deps could affect tests
- **`wf-ship`** — replaced vague 3-line sub-agent list with 3 detailed sub-agent playbooks:
  - Web research sub-agent 1 (Deployment Target & Platform Status): platform health, version requirements, breaking changes
  - Web research sub-agent 2 (Dependency Security & Advisories): CVEs since implementation, known issues affecting release
  - Explore sub-agent 3 (CI/CD & Release Infrastructure): CI config, release scripts, rollback capability
- **`wf-retro`** — replaced vague 3-line sub-agent list with 3 detailed analysis sub-agent playbooks:
  - Analysis sub-agent 1 (Implementation & Verification Friction): plan drift, verification effectiveness, time/iteration analysis
  - Analysis sub-agent 2 (Review & Handoff Quality): findings analysis, handoff completeness, communication gaps
  - Explore sub-agent 3 (Repo Infrastructure Improvement): CLAUDE.md/AGENTS.md gaps, hook/automation opportunities, test/CI gaps

## [7.7.0] - 2026-04-03

### Added — PreCompact hook and stage-boundary compaction guidance
- **`hooks/scripts/pre-compact.sh`** — PreCompact hook that fires before every context compaction. Reads active workflow state from `00-index.md` (slug, stage, slice, branch, progress, open questions, next command) and outputs plain-text instructions telling the compaction model what to preserve in the summary.
- **Stage-boundary compact recommendations** in adaptive routing for tier 1 transitions:
  - `wf-plan` → implement: compact recommended (planning research is noise for coding)
  - `wf-implement` → verify: compact recommended (debugging/file exploration is noise for testing)
  - `wf-implement(reviews)` → re-verify/re-review: compact recommended (fix context is noise)
  - `wf-review` → implement(reviews): compact recommended (dispatch chatter is noise for fixing)
  - `wf-review` → next slice: compact recommended (previous slice lifecycle is noise)
  - `wf-verify` → review: compact if lengthy (test output is noise for review dispatch)
- **`hooks/hooks.json`** updated with PreCompact event registration (10s timeout, matches all triggers)

### Changed
- 5 commands gain "Compact recommended" annotations on routing options: `wf-plan`, `wf-implement`, `wf-verify`, `wf-review`

## [7.6.0] - 2026-04-03

### Added — Code Simplification review command (ported from built-in `/simplify`)
- **`review/code-simplification`** — new review command covering three simplification lenses:
  - **Lens 1: Code Reuse** — flags new code that duplicates existing utilities, helpers, or patterns in the codebase
  - **Lens 2: Code Quality** — flags redundant state, parameter sprawl, copy-paste duplication, leaky abstractions, stringly-typed code, dead code, unnecessary comments
  - **Lens 3: Efficiency** — flags unnecessary work, missed concurrency, hot-path bloat, no-op updates, TOCTOU anti-patterns, memory leaks, overly broad operations
- **Report-only** — unlike the built-in `/simplify` which auto-fixes, this command diagnoses and reports. Fixes route through `/wf-implement`.
- **Always dispatched by `wf-review`** — added to the core set alongside `correctness` and `security` (minimum 3 commands, up from 2)
- **Always dispatched by `wf-review`** — added to the core set alongside `correctness` and `security` (minimum 3 commands, up from 2)
- **AskUserQuestion triage gate on ALL review findings** — wf-review gains Step 4b after aggregation: ALL deduplicated findings (from every review command) are presented via AskUserQuestion. BLOCKER/HIGH presented individually (Fix/Defer/Dismiss), MED as multi-select batch, LOW/NIT listed in report only. Triage decisions recorded in master `07-review.md` and drive recommendations.
- **Manual re-triage** — `/wf-review <slug> triage` re-reads `07-review.md`, presents only `deferred` and `untriaged` findings via AskUserQuestion, updates decisions in-place. Use to revisit deferred decisions at any point.

### Changed
- `wf-review` gains `triage` mode as second argument (`/wf-review <slug> triage`)
- `wf-review` gains Step 4b (triage gate) between aggregation and verdict writing — applies to ALL findings
- `wf-review` master `07-review.md` template gains `## Triage Decisions` section and deferred/dismissed categories in recommendations
- `wf-review` Step 2 selection: core set now includes `code-simplification` (always dispatched)
- `wf-review` minimum commands: 2 → 3
- `wf-review` config/docs-only exception drops `code-simplification`; test-only exception keeps it
- Review command count: 30 → 31

## [7.5.0] - 2026-04-03

### Added — PostToolUse hook for auto-staging during implement (D6)
- **`hooks/scripts/auto-stage.sh`** — PostToolUse hook that auto-stages files after every Write/Edit during implement stage
- Activates only when an active workflow has `current-stage: implement` AND `branch-strategy: dedicated` or `shared`
- Fast bail-outs: opt-out flag (`.ai/.no-auto-stage`), no workflows dir, missing tools (yq/jq/git), no file path, workflow artifact files excluded
- Best-effort staging — never blocks file writes (exit 0 always)
- **`hooks/hooks.json`** updated with PostToolUse matcher for `Write|Edit` (5s timeout)

## [7.4.0] - 2026-04-03

### Changed — Standardize PO questions via AskUserQuestion (D5)
- **`wf-intake`**: Branch strategy and appetite questions now use AskUserQuestion with structured options (dedicated/shared/none, small/medium/large). Freeform chat retained for requirements, constraints, and acceptance criteria.
- **`wf-shape`**: Risk tolerance question uses AskUserQuestion (conservative/balanced/move-fast) when risk is unclear. Freeform chat retained for behavior, acceptance criteria, and non-goals.
- **`wf-ship`**: Rollout strategy (immediate/staged/canary/feature-flag), merge strategy (rebase/squash/merge-commit), and go/no-go decision all use AskUserQuestion. Freeform chat retained for environment details and rollback tolerance.
- **All 11 commands**: Workflow rule updated from "Prefer AskUserQuestion" to explicit guidance — use AskUserQuestion for multiple-choice, freeform chat for open-ended. Each command's rule text is tailored to its specific question types.

## [7.3.0] - 2026-04-03

### Added — SessionStart hook for workflow discovery (D3)
- **`hooks/hooks.json`** — plugin hook registration for SessionStart event
- **`hooks/scripts/workflow-discovery.sh`** — bash script that scans `.ai/workflows/*/00-index.md` for active workflows at session start
- Outputs compact summary injected into Claude's context via `systemMessage`:
  - Slug, title, current stage, status, selected slice
  - Branch name with correct/wrong branch detection (compares git HEAD to workflow's `branch` field)
  - PR URL if exists
  - Recommended next command
  - Open questions if any
- Handles multiple active workflows, completed/abandoned filtering, missing directories, malformed frontmatter
- Silent (no output) when no active workflows exist
- Pure bash implementation — no `yq` or external YAML parser required
- 10-second timeout to keep session start fast

## [7.2.0] - 2026-04-03

### Added — Task-based progress tracking (D1)
- **6 commands now use TaskCreate/TaskUpdate** for structured progress tracking visible in the CLI spinner:
  - `wf-implement` (normal): creates tasks from plan step-by-step items with dependency chains where steps are sequential
  - `wf-implement` (reviews): creates tasks from review findings (BLOCKER/HIGH/MED), each with findingId and severity in metadata
  - `wf-verify`: creates tasks for each check (lint, typecheck, tests) and acceptance criterion, with integration tests blocked by unit tests
  - `wf-review`: creates tasks for each dispatched review command (independent/parallel), aggregation blocked by all dispatches
  - `wf-handoff`: creates a strict sequential chain (read artifacts → summary → docs → push → PR → write artifact), inapplicable tasks deleted
  - `wf-ship`: creates the full merge sequence chain (rollout questions → freshness → readiness → go/no-go → rebase → CI → merge → cleanup → write artifact), failures halt the chain via blockedBy
- **Dependency tracking** with `addBlockedBy`: sequential steps are chained so downstream tasks stay blocked if a step fails. Independent steps (review findings, review commands) have no dependencies and can be worked in any order.
- **Metadata convention**: all tasks carry `{ slug, stage, slice }` plus stage-specific fields (`findingId`, `severity`, `command`), enabling future cross-workflow querying
- **Failed items recorded, not hidden**: when a step fails, its description is updated with the failure reason before marking completed. Inapplicable items use `TaskUpdate(status: "deleted")`

### Changed
- `wf-implement` step sequence renumbered (12 → 13 steps in normal mode, 6 → 7 steps in reviews mode)
- `wf-verify` step sequence renumbered (9 → 10 steps)
- `wf-handoff` step sequence renumbered (7 → 10 steps)
- `wf-ship` step sequence renumbered (9 → 10 steps)
- `wf-review` gains `# Task Tracking` section between chat return contract and Step 1

## [7.1.0] - 2026-04-02

### Added — Diátaxis documentation framework integration
- **7 Diátaxis skills absorbed** from the diataxis plugin:
  - `diataxis-doc-planner` — classifies docs into Diátaxis quadrants, proposes docs map and writing order
  - `tutorial-writer` — learning-oriented step-by-step lessons for beginners
  - `how-to-guide-writer` — goal-oriented guides for competent users
  - `reference-writer` — neutral, scannable technical reference (API, CLI, config)
  - `explanation-writer` — understanding-oriented content (why, trade-offs, architecture)
  - `readme-writer` — README as landing page, not a quadrant
  - `docs-reviewer` — audit docs against Diátaxis principles with prioritised fixes
- **`wf-shape` now produces a Documentation Plan** — classifies what docs the feature needs using the Diátaxis model. Each entry specifies type, audience, what to cover, and boundary constraints. Frontmatter gains `docs-needed` and `docs-types` fields.
- **`wf-handoff` now generates documentation** — reads the shape's docs plan and writes/updates docs using the appropriate Diátaxis writer skill for each type. Respects boundary discipline (won't mix types in one file). Frontmatter gains `has-docs-changes` and `docs-generated` fields. Template gains `## Documentation Changes` section.
- **`review/docs` enhanced with Diátaxis structural review** — now classifies every doc page by actual type (not title), flags boundary violations (tutorial drifting into explanation, reference giving opinions, etc.), checks system completeness across all four quadrants, and gives specific rewrite recommendations ("split into separate page" not "improve clarity").

### Changed
- `wf-shape` template gains `## Documentation Plan` section and `docs-needed`/`docs-types` frontmatter
- `wf-handoff` template gains `## Documentation Changes` section and `has-docs-changes`/`docs-generated` frontmatter
- `review/docs` gains `## 0. Diátaxis Structural Review` checklist section before the existing checklist

## [7.0.0] - 2026-04-02

### Added — Git lifecycle integration
- **Branch-aware workflow**: Intake now asks whether the work should happen on a dedicated feature branch. Three strategies: `dedicated` (full git lifecycle), `shared` (commits to current branch), `none` (no git management).
- **`00-index.md` gains branch fields**: `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number` — tracked from intake through ship.
- **`wf-implement` creates branches and commits atomically**:
  - On first slice implementation, creates the feature branch (`feat/<slug>` by default) from `base-branch` if `branch-strategy: dedicated`.
  - After each slice implementation, stages and commits all changes with `feat(<slug>): implement <slice-slug>`.
  - Review fixes commit as `fix(<slug>): review fixes for <slice-slug>`.
  - Nothing is pushed until handoff.
- **`wf-handoff` pushes and creates PRs**: If `branch-strategy: dedicated`, pushes the branch and creates a PR via `gh pr create` using the handoff summary as the PR body. Records `pr-url` and `pr-number` in frontmatter and index.
- **`wf-ship` rebases and merges**: If go-nogo is approved, rebases the feature branch onto the base branch and merges the PR. Supports three merge strategies: rebase-and-merge (default), squash-and-merge, merge commit. Checks CI status before merging. Handles rebase conflicts by recommending return to implement.
- **Branch checks on verify and review**: Both stages confirm they're on the correct branch before running tests or generating diffs.
- **`wf-next` reports branch mismatches**: Warns if you're on the wrong branch for the active workflow.
- **Per-slice implement frontmatter gains `commit-sha`** for tracking which commit contains each slice's changes.
- **Ship frontmatter gains** `merge-strategy`, `merge-sha`, `branch`, `base-branch`, `pr-url`, `pr-number`.
- **Handoff frontmatter gains** `pr-url`, `pr-number`, `branch`, `base-branch`.

### Changed
- **`wf-ship` execution discipline relaxed**: No longer says "Do NOT merge" — now says "Do NOT fix code" while allowing rebase and merge as the final shipping action.
- **`wf-handoff` execution discipline updated**: Now includes pushing and PR creation as part of its responsibilities.
- Intake PO questions now include branch strategy as a standard question.

### Design Decisions
- **Merge requires explicit confirmation**: Ship always asks before merging — these are visible, irreversible actions.
- **`--force-with-lease`** used for post-rebase push (not `--force`) to prevent overwriting others' work.
- **Branch strategy is recorded once at intake** and read by all downstream stages — no repeated questioning.
- **`shared` and `none` strategies** ensure the workflow works without git management for teams that handle branching externally.

## [6.0.0] - 2026-03-20

### Changed — BREAKING
- **All artifact templates now emit YAML frontmatter** instead of `## Metadata` bullet lists. Every workflow file generated by the commands will have a `---` delimited YAML block as the first thing in the file containing all machine-readable state.
- **`00-index.md` is now pure frontmatter** — no markdown body. Contains: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, timestamps, `selected-slice`, `open-questions`, `tags`, `next-command`, `next-invocation`, `workflow-files`, `progress` map, and (if slices exist) `slices` summary array.
- **Every artifact frontmatter includes:** `schema: sdlc/v1`, `type`, `slug`, `status`, `stage-number`, `created-at`, `updated-at`, `tags`, `refs` (cross-links to related files), `next-command`, `next-invocation`.
- **Per-slice files** (`03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`) include `slice-slug` and slice-specific fields in frontmatter.
- **Review files** (`07-review.md`, `07-review-*.md`) include `verdict`, `commands-run`, and `metric-findings-*` counts in frontmatter.
- **Ship file** includes `go-nogo` and `rollout-strategy` in frontmatter.
- **Retro file** includes `workflow-outcome` and improvement metrics in frontmatter.
- **All Step 0 orient sections** updated to parse YAML frontmatter instead of bullet-list metadata.
- **All workflow rules** now require YAML frontmatter on every artifact file.

### Design Decisions
- **~8-12 fields per file** — lightweight enough that the agent barely notices, rich enough for any consumer.
- **`schema: sdlc/v1`** in every file for version detection and future migration.
- **`refs` object** for cross-linking — relative paths, role-based keys.
- **`metric-*` prefix** for numeric measurements (findings counts, lines changed, etc.).
- **`progress` map** on `00-index.md` — maps every stage name to its status for instant dashboard rendering.
- **`slices` array** on `00-index.md` — denormalized slice summary for consumers that need a full view from one file.
- **Status enums:** `not-started`, `in-progress`, `awaiting-input`, `complete`, `skipped`, `blocked`.
- Parseable by `yq --front-matter=extract`, Obsidian Dataview, MarkdownDB, or any YAML parser.

## [5.0.0] - 2026-03-20

### Added
- **4 analysis skills** absorbed from session-workflow:
  - `error-analysis` — systematic error/stacktrace/log analysis with root cause identification (includes 4 reference docs: error-categorization, fix-patterns, log-patterns, root-cause-analysis)
  - `refactoring-patterns` — safe, systematic refactoring patterns: extract, rename, move, simplify (includes 4 reference docs)
  - `test-patterns` — test generation and organization patterns: unit, integration, factories, coverage (includes 4 reference docs)
  - `wide-event-observability` — wide-event logging and tail sampling design for context-rich observability
- **`setup-wide-logging` command** absorbed from session-workflow — sets up wide-event logging with tail sampling for Express/Koa/Fastify/Next.js with Pino/Winston/Bunyan

### Removed
- **session-workflow plugin deleted entirely** — all content now lives in sdlc-workflow

### Integration notes
- `error-analysis` skill is available during `wf-implement` and `wf-verify` for debugging failures
- `refactoring-patterns` skill is available during `wf-implement` when the plan calls for refactoring
- `test-patterns` skill is available during `wf-implement` and `wf-verify` for test generation
- `wide-event-observability` skill and `setup-wide-logging` command support the observability review commands (`review/logging`, `review/observability`)

## [4.3.0] - 2026-03-20

### Changed
- **`wf-plan` is now idempotent and self-reviewing.** Re-invoking it on an existing plan no longer overwrites — it auto-reviews. Three sub-modes:
  - **Auto-review (single):** `/wf-plan <slug> <slice>` — re-inspects codebase, compares plan against acceptance criteria, checks sibling plan cohesion, fixes issues found. Reports "no issues" if plan is current.
  - **Review-all:** `/wf-plan <slug> all` — launches parallel sub-agents to review every existing slice plan, cross-checks cohesion, fixes all issues.
  - **Directed fix:** `/wf-plan <slug> <slice> <feedback>` — applies explicit user feedback surgically to existing plan.
- All three sub-modes append to `## Revision History` in each modified plan file, tracking what was changed, why, and the mode that triggered it.

## [4.2.0] - 2026-03-20

### Added
- **`wf-plan` review-and-fix mode** — re-invoke `/wf-plan <slug> <slice> <feedback>` with supplemental text to revise an existing plan without starting from scratch. The command reads the existing plan, applies the feedback, preserves unchanged sections, and appends a `## Revision History` entry documenting what changed and why.
- **`wf-implement reviews` mode** — invoke `/wf-implement <slug> reviews` to fix review findings one by one:
  - Reads `07-review.md` and all per-command review files
  - Extracts BLOCKER and HIGH findings sorted by severity
  - Presents the findings list before starting
  - Spawns one sonnet sub-agent per finding **sequentially** (not parallel — each fix must be verified before the next starts)
  - After each sub-agent completes, verifies the fix is correct and marks it Fixed / Partially Fixed / Could Not Fix
  - Updates `05-implement-<slice>.md` with a `## Review Fixes Applied` section
  - Updates `07-review.md` with a `## Fix Status` tracking table
  - Recommends re-verify after all fixes are applied

## [4.1.0] - 2026-03-20

### Added
- **Per-slice files for slice, plan, and implement stages** with cross-linking:
  - `wf-slice` now writes `03-slice.md` (master index) + `03-slice-<slice-slug>.md` per slice
  - `wf-plan` now writes `04-plan.md` (master index) + `04-plan-<slice-slug>.md` per slice
  - `wf-implement` now writes `05-implement.md` (master index) + `05-implement-<slice-slug>.md` per slice
  - `wf-verify` now writes `06-verify.md` (master index) + `06-verify-<slice-slug>.md` per slice
- **Cross-links in every per-slice file:**
  - Links to master index, sibling slices, upstream (slice def → plan → implement), and downstream (plan → implement → verify → review)
  - Master files contain tables linking all per-slice files with their status
- **Sibling awareness:** `wf-plan` reads existing sibling plans, `wf-implement` reads existing sibling implementations to avoid conflicts on shared files
- **Shared file tracking:** `05-implement-<slice-slug>.md` includes a "Shared Files" section noting files also touched by sibling slice implementations

### Changed
- `wf-verify`, `wf-review`, `wf-handoff` now read per-slice files (`03-slice-<slug>.md`, `04-plan-<slug>.md`, `05-implement-<slug>.md`, `06-verify-<slug>.md`) instead of monolithic stage files
- All downstream commands resolve `slice-slug` before checking prerequisites

## [4.0.0] - 2026-03-20

### Added
- **30 individual review commands** moved from session-workflow plugin:
  accessibility, api-contracts, architecture, backend-concurrency, ci, correctness, cost, data-integrity, docs, dx, frontend-accessibility, frontend-performance, infra-security, infra, logging, maintainability, migrations, observability, overengineering, performance, privacy, refactor-safety, release, reliability, scalability, security, style-consistency, supply-chain, testing, ux-copy
- **7 aggregate review commands** moved from session-workflow:
  review-all, review-architecture, review-infra, review-pre-merge, review-quick, review-security, review-ux
- **Intelligent review dispatch in `wf-review`** — reads workflow artifacts (shape, plan, implementation, verify), gathers change statistics from git diff, selects relevant review commands based on file types and content signals, spawns one parallel sonnet sub-agent per selected command
- **Per-command review files** — each sub-agent writes its findings to `.ai/workflows/<slug>/07-review-<command>.md` instead of returning to chat
- **Aggregation and deduplication** — after all sub-agents complete, wf-review reads all per-command files, merges duplicate findings (same file:line or same root cause), keeps highest severity and most specific evidence, produces unified verdict

### Changed
- **BREAKING: `wf-review` completely rewritten** — no longer does inline review. Now acts as dispatch orchestrator: select → spawn → aggregate → verdict
- `wf-review` produces multiple files: `07-review.md` (master verdict) + `07-review-<command>.md` per selected command

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
