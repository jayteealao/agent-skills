# SDLC-Workflow — Competitive Intelligence & Ideas (from GitHub ecosystem analysis)

Ideas extracted from 11 GitHub projects in the Claude Code plugin ecosystem, April 2026.

---

## Priority: Multi-Platform Converter Script

> Seen in: compound-engineering-plugin, claude-skills, sdlc-quality

**Type:** Script
**What it does:** A single shell script (`scripts/convert.sh`) that converts all commands and skills from the canonical SKILL.md / command.md format into 7+ different AI tool formats: Cursor `.mdc` rules, Aider `CONVENTIONS.md`, Kilo Code rules, Windsurf skills, GitHub Copilot `.github/skills/`, OpenAI Codex `AGENTS.md`, Gemini CLI. Supports `--tool all` to generate every format at once.
**Why it's high priority:** Write once, deploy everywhere. The top plugins all ship this. Our SDLC process is not locked to Claude Code if we have a converter.
**Adaptation:** Build `scripts/convert.sh` that reads our `commands/*.md` and `skills/*/SKILL.md` files and emits platform-native formats. Start with Cursor rules + Codex AGENTS.md (highest demand), then add others.

---

## compound-engineering-plugin (14k stars)

Source: https://github.com/EveryInc/compound-engineering-plugin

### 1. Multi-Persona Code Review with Tiered Selection
- **Type:** skill + agents
- **What it does:** `/ce:review` dynamically selects from 17+ reviewer personas (correctness, testing, maintainability, security, performance, adversarial) based on what the diff touches. Always-on reviewers run on every review; conditional reviewers activate only when relevant patterns are detected. Each runs as a parallel sub-agent returning structured JSON with confidence scores, merged and deduplicated.
- **Why it's good:** Right-sizes review effort to the actual risk surface of each change.
- **Adaptation:** Define 4-5 always-on reviewers and 5-8 conditional ones for `wf-review`. Spawn parallel sub-agents with structured JSON output, confidence gating (suppress below 0.60), and autofix classification (`safe_auto`, `gated_auto`, `manual`, `advisory`).

### 2. Knowledge Compounding System
- **Type:** skill + pattern
- **What it does:** After solving a problem, `/ce:compound` dispatches parallel sub-agents (Context Analyzer, Solution Extractor, Related Docs Finder, Session Historian) to capture the solution in `docs/solutions/` with YAML frontmatter. `/ce:compound-refresh` periodically reviews learnings against the current codebase, marking stale ones and consolidating duplicates.
- **Why it's good:** Turns ephemeral debugging knowledge into searchable institutional memory that compounds over time.
- **Adaptation:** Add `wf-compound` post-ship stage. Define a YAML frontmatter schema for `docs/solutions/`. Wire learnings into planning and review stages so past mistakes inform future work.

### 3. Document Review with Domain-Specific Persona Agents
- **Type:** skill + agents
- **What it does:** Reviews requirements and plan documents (not code) using parallel persona agents: coherence-reviewer, feasibility-reviewer, product-lens-reviewer, scope-guardian-reviewer, design-lens-reviewer, security-lens-reviewer, adversarial-document-reviewer. Findings classified as `auto` (one clear fix) or `present` (needs judgment).
- **Why it's good:** Catches architectural and product mistakes before implementation — cheapest point to fix them.
- **Adaptation:** Add `wf-plan-review` command dispatching 3-5 document reviewers against plan artifacts between plan and implement stages.

### 4. Adversarial Reviewer Agent
- **Type:** agent
- **What it does:** Actively constructs failure scenarios using four techniques: assumption violation, composition failures, cascade construction, and abuse cases. Calibrates depth based on diff size.
- **Why it's good:** Standard review catches known bad patterns; adversarial review discovers unknown failure modes.
- **Adaptation:** Create an adversarial-reviewer agent conditional on diff size (50+ lines) or touching auth/payments/data mutations.

### 5. Resolve PR Feedback with Parallel Agents
- **Type:** skill + scripts
- **What it does:** Fetches all unresolved PR review threads via GraphQL, triages (new vs. handled vs. pending-decision), performs cluster analysis to detect systemic issues, dispatches parallel sub-agents per thread to fix, reply, and resolve. Comment text treated as untrusted input.
- **Why it's good:** Turns hours of PR back-and-forth into minutes.
- **Adaptation:** Build `wf-resolve-feedback` using `gh api` GraphQL. Include cluster analysis and untrusted-input security rule.

### 6. Proactive Ideation from Codebase Analysis
- **Type:** skill
- **What it does:** `/ce:ideate` scans the codebase with parallel sub-agents, generates 30+ improvement ideas, runs adversarial filtering to cull weak ones (explaining rejections), ranks survivors, writes to `docs/ideation/`. Supports volume-override ("top 3" or "100 ideas").
- **Why it's good:** Inverts the typical pattern — surfaces what the human might not have thought to ask about.
- **Adaptation:** Build `wf-ideate` that scans codebase, generates improvement candidates, applies adversarial filtering, writes ranked survivors.

### 7. Session History Mining
- **Type:** skill + agent + scripts
- **What it does:** Bundled scripts (`discover-sessions.sh`, `extract-skeleton.py`, `extract-errors.py`) index and extract structured data from session JSONL files. Wired into brainstorming, planning, and compounding.
- **Why it's good:** Session history is a massive untapped knowledge source.
- **Adaptation:** Create a session-historian agent with scripts that scan `~/.claude/` session files. Integrate as optional sub-agent in planning and review stages.

### 8. Setup/Bootstrap with Health Check Script
- **Type:** skill + script
- **What it does:** `/ce-setup` runs a `check-health` bash script diagnosing the entire environment in one pass: CLI dependencies, plugin version, repo config, `.gitignore` coverage. Offers guided installation for missing tools.
- **Why it's good:** Single command that validates environment and fixes issues eliminates onboarding friction.
- **Adaptation:** Build `wf-setup` with a health check script verifying dependencies, project structure, YAML schema validity.

### 9. File-Based Todo System with Lifecycle Tracking
- **Type:** skill + pattern
- **What it does:** File-based tracking in `.context/compound-engineering/todos/`. Each todo is a markdown file with YAML frontmatter and structured sections. Named `002-ready-p1-fix-n-plus-1.md` for status-visible directory listings. Review skill auto-creates todos for unresolved findings.
- **Why it's good:** File-based todos survive context resets, live in the repo, and are directly readable by AI agents.
- **Adaptation:** Implement `.context/sdlc-workflow/todos/` with auto-creation from review findings and consumption by implement stage.

### 10. Mode Flags Pattern (autofix/headless/report-only)
- **Type:** pattern
- **What it does:** Skills accept `mode:autofix`, `mode:headless`, `mode:report-only` for programmatic invocation by other skills, enabling composability without interactive prompts.
- **Why it's good:** Makes skills composable — other commands can invoke them non-interactively.
- **Adaptation:** Add `--mode` flag support to our review and verify commands. `wf-review --mode report-only` for CI integration.

---

## claude-sdlc

Source: https://github.com/danielscholl/claude-sdlc

### 1. GitHub Webhook Watcher with Autonomous Execution
- **Type:** CLI tool
- **What it does:** Python CLI (`sdlc watcher --port 8001`) starts a FastAPI server receiving GitHub webhook events. Comment `sdlc /feature add dark mode` on an issue → auto-classifies, creates branch, generates spec, implements, commits, opens PR. Auto-provisions devtunnel on startup, cleans up on exit.
- **Why it's good:** Turns GitHub issues into completed PRs with a single comment.
- **Adaptation:** Add `wf-watcher` that listens for GitHub issue comments and triggers our stage pipeline. Use `gh webhook forward` or ngrok.

### 2. Plan-Only Flag (--plan-only)
- **Type:** pattern
- **What it does:** Stops autonomous workflow after spec/plan stage. Creates branch, generates plan, commits, halts. Also detected from natural language ("plan only", "don't implement").
- **Why it's good:** Gives humans a review checkpoint in autonomous pipelines.
- **Adaptation:** Add `--plan-only` to `wf-plan` and any future autonomous mode.

### 3. AI-Debate Team Composition (Cadre Init)
- **Type:** skill
- **What it does:** Analyzes codebase, spawns proposer + critic agents in structured debate (3 rounds max) to design optimal team of specialized agents with owned paths and routing rules.
- **Why it's good:** Adversarial debate produces better agent team designs than single-pass generation.
- **Adaptation:** Build `wf-team-init` using proposer/critic debate pattern for configuring reviewer roles and specialist agents.

### 4. Parallel PR Comment Resolution
- **Type:** command
- **What it does:** Fetches unresolved PR comments, categorizes (bug/refactor/style/docs/security/performance/question), analyzes dependencies, groups into waves with Mermaid diagram, spawns parallel resolver agents per wave.
- **Why it's good:** Turns tedious PR back-and-forth into a single parallelized command.
- **Adaptation:** Build `wf-pr-resolve` using `gh api`. Trigger from webhook on `changes_requested`.

### 5. Codebase Prime Command
- **Type:** command
- **What it does:** Builds lightweight codebase understanding in under 20k tokens. Strictly avoids reading source code — only lists files, reads README + one config. Anti-patterns explicitly listed (no reading source, no subagents, no multi-page summaries).
- **Why it's good:** Efficient "warm-up" without burning tokens on deep analysis.
- **Adaptation:** Add `wf-prime` as mandatory first step feeding context into `wf-intake`. Key: explicit constraints on what NOT to read.

### 6. TDD Command with Test Watcher Integration
- **Type:** command
- **What it does:** Auto-detects test framework, optionally starts background test watcher writing to `/tmp/test-watch.log`, iterates Red-Green-Refactor cycles with mandatory test output before proceeding.
- **Why it's good:** Enforces TDD discipline through structured command rather than hoping the agent does it.
- **Adaptation:** Add `wf-tdd` mode to implementation stage. Auto-detect test framework, enforce failing test before implementation.

### 7. Excalidraw Diagram Generation with Render-View-Fix Loop
- **Type:** skill
- **What it does:** Generates `.excalidraw` JSON following "diagrams should argue, not display" philosophy. Section-by-section generation + Playwright rendering + visual audit + fix loop (2-4 iterations).
- **Why it's good:** Architecture diagrams alongside specs make planning more communicative. Iterative rendering ensures quality.
- **Adaptation:** Add `wf-diagram` that generates architecture diagrams during planning/shaping phases.

### 8. Specialized Review Agents (Architecture + Performance)
- **Type:** agent
- **What it does:** Two Sonnet-tier agents: architecture-strategist (SOLID, dependencies, design patterns → YAML score 1-10) and performance-oracle (complexity, queries, memory, caching → YAML score 1-10).
- **Why it's good:** Structured YAML output is machine-parseable and can gate PR merges.
- **Adaptation:** Define similar agents for `wf-review` with structured YAML output and composite scoring.

### 9. Four-Layer Skill Testing Framework
- **Type:** pattern
- **What it does:** L1 Structure (~0.1s): plugin spec compliance. L2 Triggers (~30s): description accuracy against prompts. L3 Sessions (2-3min): multi-turn scenario tests. L4 Value (5+min): with-vs-without comparison.
- **Why it's good:** Testing AI skills is an unsolved problem; this four-layer approach gives confidence at every level.
- **Adaptation:** Build test harness: L1 validates YAML frontmatter, L2 tests command routing, L3 runs end-to-end workflow scenarios, L4 compares output quality.

### 10. Locate Command (Artifact Glue Step)
- **Type:** command
- **What it does:** Finds the most recently generated spec file by checking git status for new untracked files. Acts as reliable glue between plan and implement stages.
- **Why it's good:** Solves artifact-path discovery in autonomous pipelines without hardcoded paths.
- **Adaptation:** Add `wf-locate` utility that reliably finds the most recently generated artifact for a workflow.

---

## ai-dlc

Source: https://github.com/TheBushidoCollective/ai-dlc

### 1. Context Monitor Hook
- **Type:** hook (PostToolUse)
- **What it does:** Fires after every tool call, calculates remaining context window capacity as percentage. At 35% remaining: "wrap up" warning. At 25%: "commit immediately and save state" critical alert. Debounced via temp file.
- **Why it's good:** Context exhaustion is the silent killer of long sessions — proactive warnings prevent lost work.
- **Adaptation:** Add PostToolUse hook. At warning threshold, auto-generate `wf-context` brief. At critical, trigger state snapshot to frontmatter for `wf-resume`.

### 2. DAG-Based Slice Dependency Scheduler
- **Type:** pattern
- **What it does:** Slices carry `depends_on` arrays in YAML frontmatter. `find_ready_units` identifies slices whose dependencies are all completed, emitting them as parallelizable work. `get_dag_summary` returns counts by state.
- **Why it's good:** Explicit dependency tracking enables parallel slice execution and prevents work on slices with incomplete prerequisites.
- **Adaptation:** Add `depends_on` to slice frontmatter. Build `wf-dag` command for visualization and enhance `wf-next` to consult the DAG.

### 3. Session-Start Context Injection
- **Type:** hook (SessionStart)
- **What it does:** Detects greenfield/idle/active scenarios. For active workflows, injects in single pass: intent, current stage, completion criteria, blockers, scratchpad, DAG status, role instructions. Distinguishes startup vs. `/clear` vs. compaction.
- **Why it's good:** Eliminates "where was I?" problem proactively on every session start, not just when user runs resume.
- **Adaptation:** Enhance our SessionStart hook to inject compressed context brief from `00-index.md`.

### 4. Quality Gate Stop Hook
- **Type:** hook (Stop)
- **What it does:** Fires when agent tries to finish. Loads quality gate commands from YAML frontmatter, runs each with 30s timeout, emits `{"decision": "block"}` if any fail. Skipped for non-builder roles and completed units.
- **Why it's good:** Backpressure that blocks progression is more reliable than checklists the agent can skip.
- **Adaptation:** Add `quality_gates` frontmatter field to stage files. Hook blocks stop during implement/verify until gates pass.

### 5. Hat-Based Role System with Layered Resolution
- **Type:** pattern
- **What it does:** Each phase runs under a named "hat" (planner, builder, reviewer, red-team) with its own system prompt, success criteria, and error handling. Project-level overrides augment built-in defaults.
- **Why it's good:** Named roles with explicit instructions produce dramatically more focused agent behavior.
- **Adaptation:** Formalize roles in `plugins/sdlc-workflow/roles/`. Allow project augmentation in `.ai/roles/`.

### 6. Role-Scoped Knowledge Loading
- **Type:** pattern
- **What it does:** Knowledge artifacts stored under `.ai-dlc/knowledge/` with types (architecture, conventions, domain, design, product). Roles map to relevant types — builders get architecture + conventions; reviewers get conventions + architecture.
- **Why it's good:** Loading all project knowledge into every context is wasteful; role-scoped loading keeps focus.
- **Adaptation:** Create `.ai/knowledge/` convention. Map stages to knowledge types.

### 7. Subagent Context Scoping Hook
- **Type:** hook (PreToolUse)
- **What it does:** Intercepts Agent/Task/Skill tool calls, injects markdown context block from filesystem state (active intent, current unit, DAG position) into subagent prompt. Idempotency guard prevents double-injection.
- **Why it's good:** Subagents without workflow context make uninformed decisions.
- **Adaptation:** Create PreToolUse hook matching `Agent|Task|Skill` injecting compressed workflow state.

### 8. Enforce-Iteration / Auto-Continue Loop
- **Type:** hook (Stop)
- **What it does:** Checks DAG for remaining work when agent tries to stop. If ready/in-progress units exist, instructs agent to continue. If all done, auto-reconciles. If only blocked remain, signals human intervention needed.
- **Why it's good:** Prevents premature "done" declarations when DAG shows remaining work.
- **Adaptation:** Stop hook checks `00-index.md` for remaining stages/slices. Auto-continue through pipeline.

### 9. Named Workflow Variants
- **Type:** pattern (configuration)
- **What it does:** `workflows.yml` defines named templates with ordered hat sequences: `default` (planner→builder→reviewer), `adversarial` (adds red-team, blue-team), `tdd` (test-writer→implementer→refactorer→reviewer), `hypothesis` (observer→hypothesizer→experimenter→analyst).
- **Why it's good:** Different work types genuinely need different process shapes.
- **Adaptation:** Create `workflows.yml` with variants: `default` (all stages), `bugfix` (skip shape/slice), `spike` (shape + implement only), `docs-only` (shape + implement + ship), `security` (adds threat-modeling).

### 10. Provider Integration Abstraction Layer
- **Type:** pattern (architecture)
- **What it does:** External integrations abstracted behind categories — ticketing (Jira, Linear), comms (Slack, Teams), design (Figma), spec (Notion). Events like "unit started" trigger provider actions without workflow knowing which tool is configured.
- **Why it's good:** Plugin works with any team's toolchain via configuration, not code changes.
- **Adaptation:** Define provider categories: `ticketing`, `comms`, `vcs`. Stage commands emit abstract events; provider layer routes them.

---

## claude-code-workflows

Source: https://github.com/shinpr/claude-code-workflows

### 1. Complexity-Based Routing (Requirement Analyzer)
- **Type:** agent
- **What it does:** Counts affected files via Grep/Glob, classifies task as Small (1-2 files), Medium (3-5), Large (6+). Each scale triggers different pipeline path — small skips to implement, large gets full pipeline.
- **Why it's good:** Prevents over-engineering small fixes while ensuring large features get proper planning.
- **Adaptation:** Add `wf-triage` command or fold into `wf-intake`. Emit `scale: small|medium|large` in frontmatter. Small tasks skip to `wf-implement`.

### 2. Fresh-Context-Per-Phase via Subagent Isolation
- **Type:** pattern
- **What it does:** Each phase runs in fresh agent context. Orchestrator passes only structured JSON artifacts and file paths between phases — never raw conversation.
- **Why it's good:** Prevents context-window degradation on large tasks.
- **Adaptation:** Formalize that each `wf-*` command reads only from on-disk artifacts, never prior conversation. Add `--fresh` flag.

### 3. Recipe Pattern (Composable Workflow Entry Points)
- **Type:** skill
- **What it does:** Higher-level "combo" commands (`/recipe-implement`, `/recipe-diagnose`, `/recipe-task`) define which agents run in what order with human checkpoints. Each recipe delegates to named subagents.
- **Why it's good:** Gives users both granular and end-to-end entry points.
- **Adaptation:** Add `/wf-feature` (intake→design→plan→implement→verify), `/wf-bugfix` (triage→implement→verify), `/wf-spike` (shape→implement).

### 4. Quality Gate with Stub Detection
- **Type:** agent
- **What it does:** Before commit, scans `git diff HEAD` for TODO/FIXME/HACK, hardcoded placeholder returns, empty method bodies, `panic("TODO")`. Returns `stub_detected` immediately if found, before running quality checks.
- **Why it's good:** Catches incomplete implementations before wasting cycles on quality checks against placeholder code.
- **Adaptation:** Add stub-detection pre-pass to `wf-verify`. Could also be a PreToolUse hook on commit.

### 5. Investigator-Verifier-Solver Diagnosis Chain
- **Type:** pattern
- **What it does:** Three-agent adversarial chain: investigator maps failure points → verifier applies Devil's Advocate method → only verified findings reach solver. Loops up to 2 times if verification insufficient.
- **Why it's good:** Prevents jumping to plausible-sounding root causes without verification.
- **Adaptation:** Add `wf-diagnose` command implementing three-phase pattern alongside `wf-intake` for bug-type work.

### 6. Design-Sync Cross-Document Consistency Checker
- **Type:** agent
- **What it does:** Scans all design docs, detects conflicts with confidence-tiered matching (exact string, endpoint role, acceptance-criteria slot). Classifies severity (critical/high/medium).
- **Why it's good:** When multiple design artifacts exist, inconsistencies are inevitable and silently dangerous.
- **Adaptation:** Add cross-reference checking to `wf-design-audit` that compares all per-slice design files.

### 7. Metronome Anti-Shortcut Enforcement
- **Type:** pattern (plugin add-on)
- **What it does:** Monitors agent behavior during execution, detects shortcut-taking (skipping steps, collapsing phases, superficial outputs). Hard stops via AskUserQuestion at defined checkpoints.
- **Why it's good:** AI agents under context pressure consistently take shortcuts — explicit enforcement is the only countermeasure.
- **Adaptation:** Add checkpoint pattern to `wf-implement` and `wf-verify`. Each slice must produce a commit before moving to next.

### 8. Codebase-Analyzer Pre-Design Intelligence
- **Type:** agent
- **What it does:** Before technical designer runs, scans existing codebase producing structured output: focus areas, data models, transformation pipelines, QA patterns. Output feeds specific sections of design document.
- **Why it's good:** Design decisions without understanding existing patterns inevitably conflict with them.
- **Adaptation:** Add pre-pass to `wf-design` that extracts existing patterns. Extend `wf-design-extract` to code-level analysis.

### 9. Acceptance Criteria Traceability Chain
- **Type:** pattern
- **What it does:** Requirements flow through traceable chain: PRD → acceptance criteria → design → test skeletons → implementation. Traceability table maps each design item to covering tasks. Unjustified gaps are errors.
- **Why it's good:** Makes link between "what we said we'd build" and "what we verify" explicit and machine-checkable.
- **Adaptation:** Add `acceptance-criteria` field to design artifacts, `covers-criteria` to task artifacts. `wf-verify` checks all criteria have passing tests.

### 10. Reverse-Engineering Workflow (Docs from Code)
- **Type:** skill
- **What it does:** Two-phase workflow generating PRDs and design docs by analyzing existing code. Scope-discoverer → PRD-creator → code-verifier (consistency score ≥ 70%). Verify-review-revise loop (max 2 cycles before escalation).
- **Why it's good:** Most real projects start with existing code, not greenfield.
- **Adaptation:** Add `wf-reverse` command generating standard design artifacts from existing code analysis.

---

## claude-forge (648 stars)

Source: https://github.com/sangrokjung/claude-forge

### 1. Verification Sub-Agent with Fresh Context
- **Type:** pattern
- **What it does:** `/handoff-verify` spawns sub-agent via Task tool in fresh context window. Parent context preserved while sub-agent gets uncontaminated view. Eliminates confirmation bias.
- **Why it's good:** Fresh-context verifier catches errors the implementing agent is blind to.
- **Adaptation:** Add `--fresh` flag to `wf-verify` spawning Sonnet-tier sub-agent with only handoff doc + git diff.

### 2. Effort-Level Scaling for Verification Depth
- **Type:** pattern
- **What it does:** `--effort low|medium|high|max` controls verification depth. Low: changed files only. Max: full dependency graph + extended thinking + security reviewer.
- **Why it's good:** Lets developers trade token cost for confidence.
- **Adaptation:** Add `--effort` to `wf-verify` and `wf-review`. Document token cost per level.

### 3. Security-Sensitive File Auto-Trigger Hook
- **Type:** hook (PostToolUse)
- **What it does:** After every Edit/Write, pattern-matches file path against security-sensitive patterns (auth, token, jwt, middleware, .env, migration, crypto). Emits non-blocking suggestion to run security review. Deduplicates per session.
- **Why it's good:** Catches forgotten security reviews automatically without blocking.
- **Adaptation:** Create `hooks/security-file-watcher.sh` triggering `/review-security` reminder.

### 4. Output Secret Filter Hook with Encoding Bypass Detection
- **Type:** hook (PostToolUse)
- **What it does:** Scans every tool result for 25+ secret patterns. Also decodes base64 and URL-encoded content. Masks matches before Claude sees them. Logs to `~/.claude/security.log`.
- **Why it's good:** Prevents credential leakage through LLM context, including encoded bypass attempts.
- **Adaptation:** Ship optional `hooks/secret-filter.sh` with extensible pattern list.

### 5. Evidence-Based Completion Gate
- **Type:** rule
- **What it does:** Agent cannot claim "tests pass" or "bug fixed" without running the proving command fresh and showing output. Bans "probably works." For bug fixes, requires Red-Green-Red-Green cycle.
- **Why it's good:** Eliminates the most common LLM failure mode: confabulating success.
- **Adaptation:** Add `rules/evidence-based-completion.md` to plugin. Integrate into `wf-verify` and `wf-ship`.

### 6. Surgical Changes Principle (Anti-Scope-Creep Rule)
- **Type:** rule
- **What it does:** "Only change what was requested. No drive-by refactoring, style drift, or adjacent improvements." Blocks LLM excuses like "while I'm here, let me clean up."
- **Why it's good:** LLMs strongly tend toward unsolicited "improvements" that introduce risk.
- **Adaptation:** Add as upfront rule in `wf-implement` prompt preamble. Reference from `/review-overengineering`.

### 7. Mode-Specific Pipeline Routing (/auto)
- **Type:** command
- **What it does:** Accepts `--mode feature|bugfix|refactor` and routes through completely different pipelines. Feature: plan-tdd-review-verify-commit. Bugfix: explore-tdd-verify-quickcommit. Produces summary table of DONE/PASS/WARN/FAIL per step.
- **Why it's good:** Different change types need different workflows.
- **Adaptation:** Create `wf-auto` routing through our stages based on change type.

### 8. Continuous Learning with Instinct Model
- **Type:** skill
- **What it does:** Observes every tool call, accumulating events. Background Haiku observer detects patterns and distills into "instincts" with confidence scores (0.3-0.9). Instincts at 0.7 auto-apply; unobserved ones decay. Clusters can evolve into new commands/skills.
- **Why it's good:** Every session becomes training data for the next, creating a compounding feedback loop.
- **Adaptation:** Add lightweight observation hook logging workflow decisions. Over time, inform `wf-plan` recommendations and `wf-review` scope selection.

### 9. Strategic Context Compaction Timing
- **Type:** skill
- **What it does:** PostToolUse hook counts Edit/Write invocations. At threshold (default 50), suggests `/compact` at workflow boundary. Strategic compaction at phase boundaries preserves decisions while shedding exploratory noise.
- **Why it's good:** Auto-compaction fires mid-task and loses context; strategic compaction at phase boundaries is safer.
- **Adaptation:** Add compaction suggestions at workflow phase transitions. `wf-plan` complete → suggest compact before `wf-implement`.

### 10. Symlink-Based Plugin Installation
- **Type:** CLI tool
- **What it does:** `install.sh` symlinks directories from cloned repo into `~/.claude/`. `git pull` instantly updates all components. Backs up existing config. `settings.local.json` allows user overrides that merge on top.
- **Why it's good:** Zero-friction updates via git pull with clean upstream/user separation.
- **Adaptation:** Create `install.sh` with `--project` vs `--global` flag. Windows fallback to file copies.

---

## claude-skills (11k stars)

Source: https://github.com/alirezarezvani/claude-skills

### 1. Focused-Fix Protocol
- **Type:** command
- **What it does:** 5-phase repair: SCOPE (map boundary) → TRACE (dependencies) → DIAGNOSE (risk labels, root causes) → FIX (dependency order) → VERIFY (all tests). Iron law: no fixes before completing diagnosis.
- **Why it's good:** Prevents jumping to fixes before understanding the problem.
- **Adaptation:** Create `/wf-fix` wrapping similar protocol, producing YAML-frontmatter artifacts per phase.

### 2. Self-Improving Agent (Memory Promotion Lifecycle)
- **Type:** skill
- **What it does:** Curates auto-memory into durable knowledge. Commands to review memory for promotion candidates, graduate patterns to enforced rules (CLAUDE.md / `.claude/rules/`), extract recurring solutions into skills.
- **Why it's good:** Closes the feedback loop — ephemeral learnings become permanent, enforceable rules.
- **Adaptation:** Add `wf-promote` that reviews decisions/lessons-learned from completed slices and promotes patterns.

### 3. Orchestration Protocol (Multi-Persona Phase Handoffs)
- **Type:** pattern
- **What it does:** Four patterns: Solo Sprint (switch personas per phase), Domain Deep-Dive (one persona + stacked skills), Multi-Agent Handoff (personas review each other), Skill Chain (sequential, no persona). Structured handoff template: decisions/artifacts/open-questions.
- **Why it's good:** Repeatable framework for complex cross-domain work.
- **Adaptation:** Standardize stage transitions to include "Decisions / Artifacts / Open Questions" block.

### 4. PR Review Expert (Blast Radius Analysis)
- **Type:** skill
- **What it does:** Blast radius analysis (trace downstream consumers), security scanning (SQLi, XSS, auth bypass), test coverage delta, breaking change detection, performance impact assessment.
- **Why it's good:** Systematic, repeatable review with concrete risk categories.
- **Adaptation:** Add blast-radius analysis to `wf-review`. Check downstream consumers of changed files.

### 5. Persona Template System
- **Type:** pattern
- **What it does:** Structured template: Identity & Memory, Core Mission, Critical Rules, Capabilities, Workflow Process, Communication Style, Success Metrics, Learning & Memory. Frontmatter with emoji, vibe, tools.
- **Why it's good:** Makes agent behavior reproducible and composable.
- **Adaptation:** Create SDLC-specific personas (architect, implementer, reviewer) loaded by workflow stages.

### 6. Security Scan Gate
- **Type:** command
- **What it does:** Pre-push gate running gitleaks for secrets and safety for dependency auditing. Blocks push if findings exist.
- **Why it's good:** Shifts security scanning left to before code leaves developer's machine.
- **Adaptation:** Add optional `/wf-security` phase producing security-report artifact.

### 7. Review Gate Command (Multi-Tool Quality Check)
- **Type:** command
- **What it does:** Pre-push gate: YAML lint on CI workflows, Python syntax, markdown links, dependency audit — all in one `/review` invocation.
- **Why it's good:** Bundles multiple quality checks ensuring nothing forgotten.
- **Adaptation:** Create `/wf-gate` running project-appropriate checks. Configurable via frontmatter.

### 8. Release Manager
- **Type:** skill
- **What it does:** Parses git logs with conventional commits for auto-changelog, determines semantic version bumps, assesses release readiness, manages hotfix/rollback procedures.
- **Why it's good:** Eliminates manual release busywork.
- **Adaptation:** Add `/wf-release` automating our own plugin releases from completed slices.

### 9. Multi-Tool Converter Script (convert.sh)
- **Type:** script
- **What it does:** Converts 156+ skills to 7+ AI tool formats: Cursor `.mdc`, Aider `CONVENTIONS.md`, Kilo Code, Windsurf, etc. Supports `--tool all`.
- **Why it's good:** Write once, deploy everywhere — makes skills portable across entire AI ecosystem.
- **Adaptation:** See Priority section at top of document.

### 10. Skill-as-SKILL.md Structured Pattern
- **Type:** pattern
- **What it does:** Every skill is self-contained SKILL.md with standardized sections: Overview, Core Capabilities, When to Use, Workflow, Scripts. Skills reference and chain together.
- **Why it's good:** Clean, discoverable, composable unit of domain expertise.
- **Adaptation:** Standardize stage instructions with uniform When to Use, Workflow, Verification Checklist, Anti-Pattern Guards.

---

## claude-mem (50k stars)

Source: https://github.com/thedotmack/claude-mem

### 1. Progressive Disclosure Context Injection
- **Type:** pattern
- **What it does:** Injects compact index of observations (~50-100 tokens each) at session start. Agent sees titles, timestamps, types, token costs, then selectively fetches full details. ~10x token savings versus naive RAG.
- **Why it's good:** Agent controls its own context budget instead of being overwhelmed.
- **Adaptation:** SessionStart hook injects compact index of all slices (name, status, stage, last-modified). Agent fetches only relevant slices.

### 2. Observation Type Taxonomy
- **Type:** pattern
- **What it does:** Structured taxonomy: bugfix, feature, refactor, change, discovery, decision. Orthogonal concept tags: how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, trade-off.
- **Why it's good:** Consistent vocabulary for categorizing work enables filtering, search, and reporting.
- **Adaptation:** Define SDLC taxonomy: plan-created, design-decision, implementation-change, review-finding, test-result, deployment-event.

### 3. Make-Plan / Do Orchestrator Pattern
- **Type:** skill
- **What it does:** `make-plan` with mandatory Documentation Discovery (Phase 0). `do` deploys subagents per phase with strict verification: Implementation → Verification → Anti-pattern → Quality → Commit. No advancement without verified completion.
- **Why it's good:** Separates planning from execution with strong guarantees.
- **Adaptation:** Adopt Phase 0 Documentation Discovery and subagent reporting contract (sources, findings, confidence).

### 4. Token Economics & Cost Tracking
- **Type:** pattern
- **What it does:** Tracks `discovery_tokens` (original production cost) vs `read_tokens` (recall cost). Calculates compression ratios, savings, ROI.
- **Why it's good:** Makes memory cost/benefit concrete and measurable.
- **Adaptation:** Track token costs per SDLC stage in frontmatter. Measure workflow efficiency.

### 5. Smart-Explore (AST-Based Code Navigation)
- **Type:** skill (MCP tools)
- **What it does:** `smart_search` (tree-sitter AST discovery), `smart_outline` (file skeleton), `smart_unfold` (single symbol source). 4-8x token savings over full file reads.
- **Why it's good:** Token-efficient code exploration — map before loading.
- **Adaptation:** Recommend outline-first, unfold-selective pattern in implementation stage instructions.

### 6. Knowledge Agent (Corpus Building)
- **Type:** skill
- **What it does:** Builds filtered knowledge bases from history. Define corpus with filters (project, types, concepts, files, date range, semantic query). Multiple named corpora simultaneously.
- **Why it's good:** Turns raw history into queryable domain expertise.
- **Adaptation:** Build `/wf-knowledge` compiling completed slices into queryable corpus.

### 7. Timeline Report (Project History Narrative)
- **Type:** skill
- **What it does:** Comprehensive narrative from full development history: genesis, architectural evolution, breakthroughs, work patterns, technical debt, debugging sagas. SQL queries for quantitative analysis.
- **Why it's good:** Reveals patterns invisible in day-to-day work.
- **Adaptation:** Create `/wf-report` generating narrative summary of SDLC cycle.

### 8. Worker Service Architecture (Background HTTP Daemon)
- **Type:** CLI tool
- **What it does:** Persistent Bun HTTP service on port 37777. Manages SQLite DB, processes observations async, provides search endpoints, serves web viewer. Hooks communicate via HTTP.
- **Why it's good:** Decouples heavy processing from hook execution, keeping hooks fast.
- **Adaptation:** Background service maintaining workflow state, validating transitions, serving dashboard.

### 9. Privacy Tags and Content Filtering
- **Type:** pattern
- **What it does:** `<private>` tags exclude content from storage. PrivacyCheckValidator strips tagged content. Project-based scoping.
- **Why it's good:** Users need confidence that secrets won't leak into stored observations.
- **Adaptation:** Add `sensitive: true` frontmatter flag preventing content from summaries and cross-session injection.

### 10. Lifecycle Hooks Architecture (7 Hook Points)
- **Type:** hook
- **What it does:** Full event-driven architecture: Setup, SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd. Each delegates to worker service.
- **Why it's good:** Complete event coverage for augmenting sessions.
- **Adaptation:** We already have 4 hooks. Extend with UserPromptSubmit (auto-route to commands) and Stop (completion validation).

---

## claude-workflow-v2 (1.3k stars)

Source: https://github.com/CloudAI-X/claude-workflow-v2

### 1. Adversarial Multi-Subagent Verification
- **Type:** command
- **What it does:** 5 parallel verification subagents (type-check, tests, lint, security, build), then 3 adversarial critics: false-positive filter, missing-issues finder, context validator checking if "issues" are intentional patterns.
- **Why it's good:** Adversarial layer drastically reduces noise compared to naive checks.
- **Adaptation:** Add second-pass adversarial review phase to `wf-verify`.

### 2. 10-Agent Parallel Repo Bootstrap
- **Type:** command
- **What it does:** 10 parallel subagents (file structure, dependencies, architecture, data layer, API surface, testing, deployment, security, docs, domain model) → synthesized `CODEBASE.md`.
- **Why it's good:** Comprehensive codebase understanding in minutes.
- **Adaptation:** Add `wf-bootstrap` generating project understanding doc feeding into `wf-intake`.

### 3. Output-Style Mode Commands
- **Type:** pattern
- **What it does:** Changes operating style without changing task: architect (design-first), mentor (explains why), rapid (minimal ceremony), review (strict gates).
- **Why it's good:** Same workflow, different rigor levels.
- **Adaptation:** Add `--mode architect|rapid|mentor` to `wf-*` commands or session-level `wf-mode` toggle.

### 4. 4-Phase Safety-First Refactoring
- **Type:** command
- **What it does:** Strict loop: scope/blast-radius → ensure test coverage → incremental refactor with revert-on-failure → before/after report. Rule: never mix refactoring with feature work.
- **Why it's good:** Prevents "refactor broke everything" with atomic, tested, revertible steps.
- **Adaptation:** Add `wf-refactor` command or refactoring mode for `wf-implement`.

### 5. Auto-Suggest Agent via Prompt Analysis Hook
- **Type:** hook (UserPromptSubmit)
- **What it does:** Analyzes keywords and intent on every prompt, suggests which specialized agent/command to use.
- **Why it's good:** Reduces need to memorize which command to invoke.
- **Adaptation:** UserPromptSubmit hook detecting SDLC intents and suggesting appropriate `wf-*` command.

### 6. Persistent PLAN.md with Phase Tracking
- **Type:** command
- **What it does:** Plan file with lifecycle phases (planning/implementing/verifying/done), checkbox tasks with dependencies, architecture decisions table, append-only progress log.
- **Why it's good:** Survives session boundaries — unlike in-memory plans.
- **Adaptation:** Adopt append-only progress log and explicit phase states in slice frontmatter.

### 7. Session Learning Persistence
- **Type:** command
- **What it does:** End-of-session extraction of discoveries, patterns, decisions → persisted to docs directory for future sessions.
- **Why it's good:** Creates durable project memory across sessions.
- **Adaptation:** Enhance `wf-retro` to auto-extract learnings into `learnings/` directory read by `wf-resume`.

### 8. Pre-Commit Secret Detection Hook
- **Type:** hook (PreToolUse)
- **What it does:** Intercepts every Edit/Write, scans for API keys, passwords, tokens, connection strings. Blocks if secret detected.
- **Why it's good:** Catches secrets before they reach git history.
- **Adaptation:** Add PreToolUse hook pattern-matching common secret formats during `wf-implement`.

---

## claude-code-showcase (5.8k stars)

Source: https://github.com/ChrisWiles/claude-code-showcase

### 1. Skill Auto-Evaluation System
- **Type:** hook + pattern
- **What it does:** On UserPromptSubmit, Node.js evaluator scores prompt against JSON rules file. Rules define directory matches (weight 5), path patterns (4), intent regex (4), keyword patterns (3). Skills above threshold are suggested.
- **Why it's good:** Right context loaded automatically based on what user is doing.
- **Adaptation:** Create `skill-rules.json` mapping intents to our commands/skills with scoring weights.

### 2. Ticket-to-PR Workflow
- **Type:** command
- **What it does:** Takes JIRA ticket ID → fetches via MCP → reads acceptance criteria → explores codebase → creates branch → implements with TDD → updates ticket → creates PR. Bug-discovery protocol for unrelated bugs found during work.
- **Why it's good:** Closes loop from ticket to PR with full traceability.
- **Adaptation:** `wf-intake` accepting ticket ID via MCP. Bug-discovery side-protocol for `wf-implement`.

### 3. Scheduled GitHub Actions for Continuous Quality
- **Type:** GitHub Actions (4 workflows)
- **What it does:** PR review on open, monthly docs-sync, weekly random-directory quality review with auto-fix, biweekly dependency audit.
- **Why it's good:** Quality enforcement without human reminders.
- **Adaptation:** Ship `.github/workflows/` templates. Random-directory review is novel and worth copying.

### 4. Branch Protection Hook
- **Type:** hook (PreToolUse)
- **What it does:** One-liner: checks `git branch --show-current`, blocks all modifications on `main`. Exit code 2.
- **Why it's good:** Prevents accidental direct commits at agent level.
- **Adaptation:** Include as default hook. `wf-implement` must be on feature branch.

### 5. PostToolUse Auto-Format Hook
- **Type:** hook (PostToolUse)
- **What it does:** After Edit/Write, auto-runs formatter (prettier, black, gofmt) by file extension. Also type-checks .ts/.tsx and runs tests on test file changes.
- **Why it's good:** Every file Claude touches is properly formatted without remembering.
- **Adaptation:** Add format-on-save hooks to maintain quality continuously.

---

## sdlc-studio

Source: https://github.com/DarrenBenson/sdlc-studio

### 1. Create vs Generate Dual-Mode
- **Type:** pattern
- **What it does:** Every artifact supports "create" (greenfield, question-driven) and "generate" (brownfield, reverse-engineers from code). Generate produces "migration blueprint" validated against tests.
- **Why it's good:** Makes SDLC workflow useful for legacy codebases, not just greenfield.
- **Adaptation:** Add `--generate` / `--from-code` flags to `wf-intake` and `wf-shape`.

### 2. Index Registry Files with Sequential IDs
- **Type:** pattern
- **What it does:** Each artifact directory has `_index.md` with sequential IDs (EP0001, US0001). Single lookup point for all artifacts of a type.
- **Why it's good:** Navigable catalog without relying on directory listings.
- **Adaptation:** Add `slices/_index.md` listing all slices with status and linked artifacts.

### 3. Agentic Concurrent Wave Execution
- **Type:** pattern
- **What it does:** Analyzes stories for dependency graphs and "hub file overlap" (shared files). Groups independent stories into concurrent waves. Shared-file stories serialize.
- **Why it's good:** Maximizes throughput while preventing merge conflicts via file-overlap detection.
- **Adaptation:** `wf-implement --parallel` for multi-slice work with file-overlap analysis.

### 4. Progressive Reference Loading
- **Type:** pattern
- **What it does:** Lookup table in SKILL.md: create-mode loads help files first, generate-mode loads philosophy first, artifact creation loads templates. Secondary files load only if needed.
- **Why it's good:** Keeps context window efficient — a full SDLC skill set can exceed token limits if loaded eagerly.
- **Adaptation:** Formalize progressive loading table in SKILL.md frontmatter: primary vs secondary references per operation.

### 5. Persona Consultation and Workshop
- **Type:** commands
- **What it does:** `consult [persona] [artifact]` gets structured feedback from a user persona. `chat --workshop [topic]` runs multi-persona discussion.
- **Why it's good:** Validates designs against real user perspectives.
- **Adaptation:** Add `wf-consult` loading personas from our existing `reference/design/personas.md`.

### 6. Test Strategy Document as First-Class Artifact
- **Type:** artifact + command
- **What it does:** Defines testing approach: test types, coverage thresholds, environment requirements, philosophy. Test specs implement this strategy per story.
- **Why it's good:** Separates "how we test" (once) from "what we test" (per story).
- **Adaptation:** Add `wf-test-strategy` creating project-level testing approach document consulted by `wf-plan`.

---

## sdlc-quality

Source: https://github.com/zircote/sdlc-quality

### 1. RFC 2119 Severity Classification
- **Type:** pattern
- **What it does:** Every rule tagged MUST (blocks release), SHOULD (important, not blocking), MAY (optional best practice). Consistent across all domains.
- **Why it's good:** Eliminates ambiguity about negotiable vs non-negotiable standards.
- **Adaptation:** Tag review checklist items MUST/SHOULD/MAY. `wf-verify` enforces zero MUST violations.

### 2. Compliance Scoring System (0-100)
- **Type:** command + agent
- **What it does:** Audits across 10 domains, scores each out of 10, produces overall 0-100 compliance score with prioritized remediation.
- **Why it's good:** Numeric score makes quality trackable over time.
- **Adaptation:** Add `wf-health` scoring artifact completeness, test coverage, review status, docs freshness.

### 3. GitHub Action for CI Enforcement
- **Type:** GitHub Action
- **What it does:** Runs compliance checks in CI. Domain filtering, fail-on-error config, multiple output formats (markdown, JSON, SARIF), PR comment creation.
- **Why it's good:** Enforces standards in CI without requiring AI agent presence.
- **Adaptation:** Package review checklists as GitHub Action validating YAML frontmatter and required fields on PRs.

### 4. Technology-Agnostic Rule Templates
- **Type:** pattern
- **What it does:** Rules defined agnostically ("automated formatting MUST be configured") then implementation examples for Rust, TypeScript, Python, Java, Go.
- **Why it's good:** Universal rules, actionable for specific stacks.
- **Adaptation:** State principles first, then stack-specific guidance in review commands.

### 5. Issue-Label-Triggered Audit
- **Type:** GitHub Actions pattern
- **What it does:** Adding `sdlc-audit` label to a GitHub issue triggers automatic compliance audit.
- **Why it's good:** Non-technical stakeholders can trigger audits without CLI access.
- **Adaptation:** Support `sdlc-review` label triggering review workflow via GitHub Actions.

---

## Cross-Cutting Themes

Patterns that appeared in 3+ projects — highest signal ideas:

| Theme | Projects | Our gap |
|-------|----------|---------|
| **Multi-platform converter script** | compound-eng, claude-skills, sdlc-quality | No converter — Claude Code only |
| **Fresh-context verification** | claude-forge, claude-workflows, compound-eng | `wf-verify` runs in same context |
| **Stop hook for completion validation** | ai-dlc, claude-forge, claude-workflows | No Stop hook |
| **Context window monitoring** | ai-dlc, claude-forge, claude-mem | No context monitoring |
| **Adversarial/devil's-advocate review** | compound-eng, claude-workflows, claude-forge | Reviews are single-pass |
| **Session learning persistence** | compound-eng, claude-mem, claude-workflow-v2 | `wf-retro` doesn't persist learnings |
| **DAG-based parallel execution** | ai-dlc, sdlc-studio, claude-workflows | Slices are sequential |
| **Mode/effort flags on commands** | claude-forge, claude-workflow-v2, compound-eng | No mode flags |
| **Stub/incomplete code detection** | claude-workflows, claude-forge | No stub detection |
| **Ticket/issue integration** | claude-showcase, claude-sdlc, ai-dlc | No ticketing integration |
