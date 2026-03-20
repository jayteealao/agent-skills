# Changelog

All notable changes to the session-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-03-20

### Removed
- **All 7 review agents** (`agents/review/`): architecture-strategist, code-simplicity-reviewer, framework-conventions-reviewer, pattern-recognition-specialist, performance-oracle, security-sentinel, senior-code-reviewer — agents directory deleted entirely
- **13 non-review commands**: compat-check, debt-register, debug, decision-record, generate-tests, handoff, prod-readiness, refactor-followups, repro-harness, scope-triage, test-matrix, triage, write-docs
- **2 skills**: file-todos, framework-conventions-guide
- **Top-level agent**: senior-review-specialist

### Notes
The plugin is now focused exclusively on code review and deep analysis. The review skill dispatches commands as parallel agents without needing dedicated agent definitions — commands run directly inside spawned subagents.

---

## [3.0.0] - 2026-03-17

### Changed — Breaking
- **All 30 review commands**: Removed `user-invocable: false` — all `/review:*` commands are now directly invocable from the slash-command palette
- **All 30 review commands**: Added `disable-model-invocation: true` — the main model cannot silently chain these; they run only inside explicit agent spawns or via direct user invocation
- **All review commands**: Stripped all "Create Todos" workflow steps and "Todos Created" console summary sections — review commands no longer write file-todos

### Added
- **7 aggregate review commands** (inline, no subagents):
  - `review:quick` — 5 lenses: Correctness Essentials, Style Consistency, Developer Experience, UX Copy Quality, Overengineering Check
  - `review:pre-merge` — 5 lenses: Correctness, Test Quality, Security, Refactor Safety, Maintainability; verdict: MERGE / MERGE WITH COMMENTS / DON'T MERGE
  - `review:security` — 5 lenses: Vulnerabilities, Privacy & PII, Infra Security, Data Integrity, Supply Chain; 5 automatic BLOCKERs
  - `review:architecture` — 4 lenses: Architecture & Design, Performance, Scalability, API Contracts; builds mental architecture model before scanning
  - `review:infra` — 6 lenses: Infra Config, CI/CD Pipeline, Release Management, DB Migrations, Logging Quality, Observability; verdicts: Ready / Needs Attention / Not Production Ready
  - `review:ux` — 4 lenses: Accessibility (WCAG 2.1 AA), Frontend Accessibility (SPA), Frontend Performance, UX Copy; BLOCKERs include keyboard traps, missing alt, unlabelled fields, AA contrast failures
  - `review:all` — 6 domains × 5 sub-categories covering all 30 review dimensions inline

- **Smart `review` skill** — analyses the change set or given scope, selects relevant commands based on file types and content signals, spawns one parallel agent per selected command, then aggregates and deduplicates results into a unified report:
  - Always-run: `review:correctness` + `review:security`
  - Signal-based: SQL → data-integrity + migrations; async → backend-concurrency; React/Vue/Angular → frontend-performance + frontend-accessibility + ux-copy; Terraform/k8s → infra + infra-security; CI config → ci; migrations → migrations; test files → testing; observability → observability + logging; etc.
  - Min 2 / max 12 commands per invocation

### Removed
- **7 review skill files** (`review-all`, `review-architecture`, `review-infra`, `review-pre-merge`, `review-quick`, `review-security`, `review-ux`) — functionality replaced by the 7 new inline aggregate commands above

### Statistics
- **Total Commands**: 51 (44 previous + 7 new aggregate commands)
- **User-invocable review commands**: 37 (30 individual + 7 aggregate)
- **Skills**: 7 (review skill added; 7 aggregate review skills removed; net −6)
- **File-todo output**: Removed from all commands

## [2.1.0] - 2026-02-11

### Added
- **File-Todo Integration**: All 7 review skills (`review:all`, `review:quick`, `review:pre-merge`, `review:security`, `review:architecture`, `review:infra`, `review:ux`) now auto-create pending file-todos in `.claude/todos/` after merging findings
- **Severity-to-Priority Mapping**: BLOCKER/HIGH → p1, MED → p2, LOW → p3, NIT → skipped
- **Triage Pipeline**: Review findings flow directly into `/triage` for approval, creating a review → triage → resolve workflow

### Removed
- **Workflow Commands** (5): `workflows:plan`, `workflows:work`, `workflows:deepen-plan`, `workflows:plan-review`, `workflows:compound` — use external compound-engineering plugin instead
- **Compound-Docs Skill**: `compound-docs` skill with schema, templates, and references — consumed only by `workflows:compound`
- **Research Agents** (9): `best-practices-researcher`, `framework-docs-researcher`, `repo-research-analyst`, `git-history-analyzer`, `codebase-mapper`, `web-research`, `design-options`, `risk-analyzer`, `edge-case-generator`
- **Workflow Agent** (1): `spec-flow-analyzer`
- **Workflow References**: Cleaned `/workflows:*` references from `triage`, `debug`, and `file-todos` commands/skills

### Changed
- **Plugin Description**: Updated to reflect review-focused identity with file-todos integration
- **Plugin Keywords**: Removed workflow/planning/research/compounding keywords, added file-todos and review-agents

### Statistics
- **Total Commands**: 44 (49 - 5 workflow commands)
- **Total Agents**: 8 (17 - 9 research - 1 workflow + 1 senior-review-specialist)
- **Total Skills**: 13 (7 review + file-todos + error-analysis + 4 general-purpose; compound-docs removed)
- **Review Skills**: 7 (all with file-todo output)
- **Review Commands**: 30 (unchanged)

### Migration Guide from v2.0.0
```bash
# Old workflow (removed)
/workflows:plan "feature name"
/workflows:work .claude/plans/feature-name.md
/workflows:compound

# New workflow
# Use external compound-engineering plugin for planning/execution
# Session-workflow focuses on reviews:
/review:quick           # → auto-creates todos in .claude/todos/
/triage                 # → approve/skip findings
# Then work on approved todos directly
```

## [2.0.0] - 2026-02-08

### Added
- **Parallel Review Execution**: All 7 review skills (`review:all`, `review:quick`, `review:pre-merge`, `review:security`, `review:architecture`, `review:infra`, `review:ux`) now spawn each review command as an independent parallel Task agent instead of routing through a single serial agent
- **Senior Review Specialist Agent**: New `senior-review-specialist` agent for use in plan-review and other workflows
- **3 New Commands**: `debug`, `generate-tests`, `triage`
- **Compound Workflow**: New `workflows:compound` command for multi-step compound workflows
- **2 New Skills**:
  - `compound-docs` — Solution documentation for cross-session learning with YAML schema and templates
  - `file-todos` — File-based todo tracking with templates

### Changed
- **Review Commands Unlocked**: Removed `disable-model-invocation: true` from all 30 review commands, enabling them to be executed as autonomous Task agents while remaining non-user-invocable
- **Review Skills Rewritten**: Replaced `agent: senior-review-specialist` delegation with fan-out/fan-in parallel execution pattern — each skill spawns N Task agents (one per review command) and merges deduplicated, severity-sorted results
- **Plugin Manifest Simplified**: Removed inline commands/agents/skills/statistics sections from `.claude-plugin/plugin.json` in favor of auto-discovery
- **Version**: Bumped to 2.0.0 (breaking: review skills no longer use agent delegation)

### Removed
- **Legacy Files**: Removed `Idea.md`, `vision.md`, and old root `plugin.json` manifest (superseded by `.claude-plugin/plugin.json`)

### Statistics
- **Total Commands**: 49 (45 + 4 new)
- **Total Agents**: 17 (+ senior-review-specialist)
- **Total Skills**: 7 (5 existing + compound-docs + file-todos)
- **Review Skills**: 7 (all parallelized)
- **Review Commands**: 30 (all model-executable)

## [1.9.0] - 2026-01-21

### Added
- **Workflows Namespace**: New `workflows:*` command namespace with 4 comprehensive planning commands
  - `workflows:plan` - Transform feature descriptions into well-structured plans with parallel research agents
  - `workflows:work` - Execute work plans with todo tracking in .claude/todos/work/
  - `workflows:plan-review` - Review plans with 3 parallel reviewer agents (architecture, performance, security)
  - `workflows:deepen-plan` - Enhance plans with parallel research, skill discovery, and learnings

- **12 New Agents** organized into subdirectories:
  - **research/** (4 new): best-practices-researcher, framework-docs-researcher, git-history-analyzer, repo-research-analyst
  - **workflow/** (1 new): spec-flow-analyzer
  - **review/** (7 new): code-simplicity-reviewer, senior-code-reviewer, framework-conventions-reviewer, architecture-strategist, performance-oracle, security-sentinel, pattern-recognition-specialist

- **4 New Skills** with comprehensive reference documentation:
  - `framework-conventions-guide` - Framework-native conventions for opinionated frameworks (Django, Laravel, Next.js, Rails, etc.)
  - `test-patterns` - Unit testing, integration testing, test data factories, coverage strategies
  - `refactoring-patterns` - Extract, rename, move, and simplification patterns with safety checks
  - `error-analysis` - Error categorization, root cause analysis, log patterns, fix patterns

### Changed
- **Agent Organization**: Agents now organized into subdirectories (research/, workflow/, review/) for better discoverability
- **Moved 5 existing agents** to research/: codebase-mapper, web-research, design-options, risk-analyzer, edge-case-generator

### Removed
- **5 Legacy Commands**: Replaced by workflows namespace
  - `start-session` → replaced by `workflows:plan`
  - `close-session` → no longer needed
  - `spec-crystallize` → merged into `workflows:plan`
  - `research-plan` → merged into `workflows:plan`
  - `work` → replaced by `workflows:work`

### Statistics
- **Total Commands**: 45 (46 - 5 deleted + 4 added)
- **Total Agents**: 17 (5 existing + 12 new)
- **Total Skills**: 5 (1 existing + 4 new)
- **Workflow Commands**: 4

### Migration Guide from v1.8.x
```bash
# Old workflow
/start-session "feature name"
/spec-crystallize
/research-plan
/work

# New workflow
/workflows:plan "feature name"    # Creates plan in .claude/plans/
/workflows:work .claude/plans/feature-name.md
```

## [1.4.0] - 2026-01-17

### Completed
- **All 30 Review Commands Now Fully Implemented**: Completed comprehensive implementation of 17 review commands that were previously incomplete stubs in v1.3.0
- **Architecture Review** (`review:architecture`): 805 lines - System boundaries, dependency analysis, layering violations, coupling assessment
- **CI/CD Review** (`review:ci`): 774 lines - Pipeline security, test coverage validation, deployment safety, rollback mechanisms
- **Infrastructure Review** (`review:infra`): 800 lines - Resource safety (compute, network, storage), configuration validation, cost optimization
- **Release Engineering Review** (`review:release`): 692 lines - Versioning strategy, rollout planning, rollback procedures, monitoring
- **Performance Review** (`review:performance`): 698 lines - Algorithm complexity, bottleneck detection, profiling guidance, resource usage
- **API Contracts Review** (`review:api-contracts`): 839 lines - Breaking changes detection, versioning, backwards compatibility
- **Cost Review** (`review:cost`): 978 lines - Resource scanning, pricing implications, optimization opportunities
- **Data Integrity Review** (`review:data-integrity`): 1,237 lines - ACID properties, race conditions, consistency guarantees
- **Frontend Performance Review** (`review:frontend-performance`): 922 lines - Bundle size, Core Web Vitals (LCP, FID, CLS), rendering optimization
- **Database Migrations Review** (`review:migrations`): 774 lines - Migration safety, backwards compatibility, zero-downtime deployments
- **Reliability Review** (`review:reliability`): 821 lines - Failure modes, error handling, resilience patterns, circuit breakers
- **Scalability Review** (`review:scalability`): 334 lines - Load testing, bottleneck identification, horizontal scaling, resource limits
- **Accessibility Review** (`review:accessibility`): 219 lines - WCAG 2.1 AA compliance, keyboard navigation, ARIA usage
- **Developer Experience Review** (`review:dx`): 275 lines - Setup friction, error message clarity, build performance
- **UX Copy Review** (`review:ux-copy`): 221 lines - Actionable error messages, tone consistency, recovery guidance

### Enhanced
- **Comprehensive Review Coverage**: All review commands now include:
  - ROLE section (reviewer persona and focus)
  - NON-NEGOTIABLES (5-8 blocker-level issues with severity criteria)
  - PRIMARY QUESTIONS (4-6 guiding questions for context gathering)
  - DO THIS FIRST (preparation steps before code review)
  - Comprehensive checklists (5-10 categories with detailed examples)
  - WORKFLOW (8-10 step process with bash commands)
  - OUTPUT FORMAT (complete markdown template for review reports)
  - SUMMARY OUTPUT (console output format with actionable findings)
  - Code examples showing unsafe patterns and fixes

### Statistics
- **Total Commands**: 46 (unchanged)
- **Code Review Commands**: 30 (all now comprehensive, previously 13 complete + 17 incomplete)
- **Average Review Command Size**: 800 lines (range: 219-1,989 lines)
- **Total Lines**: ~45,000 (increased from 35,000 due to complete implementations)
- **Review Coverage**: 100% (all domains fully implemented)

### Impact
- All 30 review commands can now be used for professional-grade code reviews
- Each command provides comprehensive guidance with examples and workflows
- Consistent structure across all review commands for predictable usage
- Evidence-first approach with file:line references for all findings

## [1.3.0] - 2026-01-17

### Removed (Hobby Project Focus)
- **Enterprise Dual Modes**: Removed MODE parameter from `/prod-readiness` - now hobby-only (3 categories, 150-200 lines)
- **Verbose Work Tracking**: Removed TRACKING_LEVEL parameter from `/work` - now simple checkpoints only (50-100 lines)
- **Deep Research Modes**: Removed RESEARCH_DEPTH parameter from `/spec-crystallize` and `/research-plan` - now quick mode only (codebase-mapper, 5-7 minutes)
- **Enterprise Commands**: Removed 5 enterprise-focused commands:
  - `/ship-plan` - Canary deployment stages (1%→10%→50%→100%)
  - `/rca` - 5-whys root cause analysis
  - `/postmortem-actions` - Action prioritization matrices
  - `/risk-assess` - 9-point risk scoring
  - `/telemetry-audit` - PII/cardinality/cost audit
- **Enterprise Review Context**: Removed CONTEXT parameter from all 30 review commands
  - No more SLO references or multi-tenant considerations
  - No more compliance requirements (SOC2, GDPR, HIPAA)
  - Kept P0/P1/P2 severity scoring (user requested)

### Changed
- **Simplified Review Commands**: All 30 review commands streamlined to 50-100 lines (from 300-1000 lines)
- **Hobby-First Defaults**: All commands default to hobby project settings
- **Reduced Output Verbosity**: 57% reduction in average command output length
- **Faster Research**: Default research depth reduced from 15-20 minutes to 5-7 minutes
- **Simplified prod-readiness**: Reduced from 2,076 lines to 555 lines (-73%)
- **Simplified work**: Reduced from 760 lines to 559 lines (-26%)
- **Simplified research-plan**: Reduced from 1,067 lines to 686 lines (-36%)

### Statistics
- **Total Commands**: 46 (reduced from 51, -10%)
- **Code Review Commands**: 30 (unchanged, but simplified)
- **Incident Response**: 1 command (reduced from 3, kept `repro-harness`)
- **Deployment**: 3 commands (reduced from 6)
- **Average Output**: ~100 lines (reduced from ~400 lines, -75%)
- **Research Time**: 5-7 minutes (reduced from 15-20 minutes, -65%)
- **Total Lines**: 35,000 (reduced from 81,300, -57%)

### Migration Guide from v1.2.0

**Dual-mode parameters removed** (now use hobby mode automatically):
- `/prod-readiness MODE:production` → now uses 3-category hobby checklist
- `/work TRACKING_LEVEL:detailed` → now uses simple checkpoints
- `/spec-crystallize RESEARCH_DEPTH:deep` → now uses quick mode (codebase-mapper only)
- `/research-plan RESEARCH_DEPTH:deep` → now uses quick mode (codebase-mapper only)

**Deleted commands** (alternatives):
- `/ship-plan` → use external deployment tools or manual planning
- `/rca` → use `/repro-harness` for reproduction, manual RCA for analysis
- `/postmortem-actions` → create action items manually
- `/risk-assess` → use `/prod-readiness` for basic safety checks
- `/telemetry-audit` → use `/review:observability` and `/review:logging`

**Review commands** (CONTEXT parameter removed):
- All review commands still work, CONTEXT parameter is simply ignored
- Review output simplified to hobby-level (50-100 lines)
- P0/P1/P2 severity scoring preserved

## [1.2.0] - 2026-01-16

### Added
- **Hobby Project Mode**: New TRACKING_LEVEL parameter in `/work` command (hobby/detailed, default: hobby)
- **Flexible Production Readiness**: New MODE parameter in `/prod-readiness` command (hobby/production, default: hobby)
- **Research Depth Control**: New RESEARCH_DEPTH parameter in `/research-plan` and `/spec-crystallize` commands (none/quick/deep, default: quick)

### Changed
- **Simplified Work Logs**: Hobby mode reduces work log format from 14 sections to 4 fields (50-100 lines vs 300-500 lines)
- **Streamlined Specs**: Removed sections 8 (Open Questions) and 10 (Research Summary) from spec output, reducing from 10 to 6 core sections
- **Simplified File Structure**: Session creation now uses 5 items (README.md, plan.md, work.md, reviews.md, research/) instead of 13+ subdirectories
- **Focused Research**: Added output constraints to codebase-mapper agent (2-3 examples max, 3000-5000 words) and web-research agent (2-3 topics max, 2000-4000 words)
- **Consolidated Outputs**: Commands now append to plan.md, work.md, and reviews.md instead of creating multiple subdirectory files

### Improved
- **Hobby Production Readiness**: Hobby mode checks only 3 core categories (Observability, Safety, Security) with 150-200 line output vs 2,076 lines (93% reduction)
- **Quick Research Mode**: Default research depth reduced from 15-20 minutes to 5-7 minutes while maintaining quality
- **Better Defaults**: All simplification features default to hobby-friendly modes while preserving full enterprise capabilities via parameters

### Performance
- Research time reduced by ~60-70% in default quick mode
- File management overhead reduced by ~77% with simplified structure
- Planning output reduced by ~40-80% depending on command

## [1.1.0] - 2026-01-15

### Added
- Initial release with 51 commands, 5 autonomous research agents
- 30 specialized code review commands
- Comprehensive workflow commands (spec, plan, work, ship)
- Incident response commands (repro, RCA, postmortem)
- Deployment commands (risk assessment, compatibility, rollout planning)

### Features
- Autonomous research agents: codebase-mapper, web-research, design-options, risk-analyzer, edge-case-generator
- Session-based workflow management
- Evidence-based implementation planning
- Production readiness reviews

## [1.0.0] - 2026-01-14

### Added
- Initial plugin structure
- Core workflow commands
- Basic review commands
