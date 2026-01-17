# Changelog

All notable changes to the agent-skills marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## Version 1.6.0 - 2026-01-17

### Added
- **session-workflow**: Multi-round interview stages for spec-crystallize and research-plan commands
  - Pre-research interview: Clarifying questions asked before codebase research begins
  - Post-research interview: Validation questions asked after research to confirm approach
  - Support for 1-3 rounds of questions per interview stage
  - Interview results stored in `.claude/<SESSION_SLUG>/interview/` directory

### Enhanced
- **session-workflow/spec-crystallize**: Added Step 2.5 (Pre-Research Interview) and Step 3.5 (Post-Research Interview)
  - Round 1: Core requirements clarification (problem scope, success definition, constraints, user context)
  - Round 2: Non-obvious details (edge cases, integration assumptions, trade-offs, data handling)
  - Round 3: Final validation (optional, only if critical ambiguities remain)
  - Interview insights incorporated into spec generation

- **session-workflow/research-plan**: Added Step 3.5 (Pre-Research Interview) and Step 4.5 (Post-Research Interview)
  - Round 1: Planning context clarification (work type validation, success criteria, constraints, risk tolerance)
  - Round 2: Non-obvious planning details (implementation approach, testing strategy, rollout expectations)
  - Round 3: Final planning validation (optional, only if needed)
  - Interview insights used for approach selection, risk analysis, and step-by-step planning

### Technical Details
- Interview stages use AskUserQuestion tool for interactive multi-round questioning
- Questions are contextual based on INPUTS, session context, and research findings
- Each interview stage supports conditional rounds (Round 2-3 only if needed)
- Interview results stored in markdown format with Q&A structure
- Pre-research interviews focus on clarifying requirements and constraints
- Post-research interviews focus on validating findings and resolving conflicts
- Interview answers incorporated into spec/plan generation workflow
- Summary output includes interview round counts and document location

### Use Cases
- **Ambiguous requirements**: Multi-round interviews extract non-obvious details before planning
- **Complex features**: Post-research interviews help choose between multiple valid approaches
- **Risk validation**: Interview stages allow user to confirm risk tolerance and trade-offs
- **Pattern alignment**: Post-research interviews validate whether to follow existing patterns or diverge
- **Scope clarification**: Iterative questioning helps define precise boundaries

## Version 1.5.0 - 2026-01-17

### Enhanced
- **session-workflow**: Significantly expanded 4 review commands with comprehensive examples and guidance
  - `review:scalability` - Enhanced from 8.6KB to 40KB (5x expansion) with detailed bottleneck analysis
  - `review:accessibility` - Enhanced from 5KB to 36KB (7x expansion) with WCAG 2.1 comprehensive patterns
  - `review:dx` - Enhanced from 5.5KB to 36KB (7x expansion) with developer experience best practices
  - `review:ux-copy` - Enhanced from 4.8KB to 35KB (7x expansion) with tone and clarity guidelines

### Added
- **session-workflow/review:scalability**: 9 comprehensive checklist categories with scale impact estimates
  - Algorithmic complexity analysis with O(n) vs O(n²) examples
  - Database query optimization with N+1 detection
  - Caching strategy patterns and cache stampede prevention
  - Horizontal scaling impediments identification
  - Resource leak and connection pooling analysis
  - Multi-tenancy scalability patterns
  - Background job processing best practices

- **session-workflow/review:accessibility**: 10 comprehensive WCAG 2.1 checklist categories
  - Keyboard navigation patterns and focus management
  - Screen reader compatibility with ARIA patterns
  - Alt text and image accessibility guidelines
  - Form accessibility with validation patterns
  - Color contrast and visual accessibility standards
  - Semantic HTML and landmark usage
  - Dynamic content announcement patterns

- **session-workflow/review:dx**: 10 developer experience checklist categories
  - Documentation quality assessment (README, CONTRIBUTING, API docs)
  - Error message clarity with actionable guidance
  - Local development setup automation (Docker, native)
  - Build and test performance optimization
  - CI/CD pipeline efficiency patterns
  - Helpful scripts and tooling recommendations
  - Dependency management and security auditing

- **session-workflow/review:ux-copy**: 10 UX copy quality checklist categories
  - Error message transformation (blame → helpful)
  - Terminology consistency analysis and style guides
  - Clarity and understandability patterns
  - Actionability and user recovery guidance
  - Tone and voice consistency principles
  - Button label and CTA best practices
  - Empty state and zero data patterns

### Technical Details
- Added 700+ code examples across enhanced commands showing problems and fixes
- Each enhanced command now includes 25-40KB of comprehensive guidance
- Consistent structure: ROLE → NON-NEGOTIABLES → CHECKLIST → WORKFLOW → OUTPUT FORMAT
- Evidence-first review methodology with severity ratings (BLOCKER/HIGH/MED/LOW/NIT)
- File:line references for all findings with user/developer impact analysis

## Version 1.4.0 - 2026-01-16

### Added
- **session-workflow v1.1.0**: Added 5 autonomous research agents for intelligent planning
- **session-workflow**: Codebase Mapper agent - Deep codebase analysis for similar features and patterns
- **session-workflow**: Web Research agent - Industry best practices and security patterns from web sources
- **session-workflow**: Design Options Generator - Synthesizes codebase + industry patterns into design alternatives
- **session-workflow**: Risk Analyzer - Systematic risk identification with likelihood × impact scoring
- **session-workflow**: Edge Case Generator - Comprehensive edge cases across 10 categories with OWASP patterns

### Changed
- **spec-crystallize**: Enhanced research phase to spawn Codebase Mapper + Web Research agents automatically
- **spec-crystallize**: Enhanced edge case generation to spawn Edge Case Generator agent automatically
- **spec-crystallize**: Updated output template with embedded research summaries and links to full reports
- **research-plan**: Enhanced research phase to spawn Codebase Mapper + Web Research agents in parallel
- **research-plan**: Enhanced design options phase to spawn Design Options Generator agent
- **research-plan**: Enhanced risk analysis phase to spawn Risk Analyzer agent
- **research-plan**: Updated output template with embedded research summaries from all agents

### Technical Details
- Research agents spawn automatically during command workflows
- Full research reports saved to `.claude/<SESSION_SLUG>/research/` directory
- Main spec/plan documents include embedded summaries with links to full reports
- Agent composition: Design Options, Risk Analyzer, Edge Case Generator call Codebase Mapper + Web Research
- Graceful degradation: Commands continue if agents fail or time out
- Parallel execution: Codebase Mapper + Web Research run in parallel for efficiency

## Version 1.3.0 - 2026-01-16

### Added
- **session-workflow v1.0.0**: Complete software engineering workflow plugin with 43 commands and 1 skill
- **session-workflow**: 30 code review commands (security, performance, accessibility, infrastructure, observability)
- **session-workflow**: 10 operational commands (incident response, risk assessment, deployment planning)
- **session-workflow**: 3 workflow commands (handoff documentation, session closure, postmortem actions)
- **session-workflow**: Wide-event observability skill based on loggingsucks.com philosophy
- **session-workflow**: Comprehensive documentation (8 files, ~81,300 lines total)
- **session-workflow**: Support for Node.js, Express, Fastify, Koa, TypeScript, React, Vue, Angular
- **session-workflow**: Tail sampling implementation (90% cost reduction with 0% signal loss)
- **session-workflow**: Incident response workflow (bug reproduction → RCA → action planning)
- **session-workflow**: Staged rollout planning (canary, blue-green, rolling deployments)
- **session-workflow**: Session management with artifact tracking and handoff docs

### Documentation
- Added `plugins/session-workflow/README.md` - Complete plugin overview
- Added `plugins/session-workflow/OVERVIEW.md` - Visual summary with diagrams
- Added `plugins/session-workflow/docs/commands.md` - All 43 commands documented
- Added `plugins/session-workflow/docs/workflows.md` - 6 end-to-end workflow guides
- Added `plugins/session-workflow/docs/observability.md` - Wide-event observability deep dive
- Added `plugins/session-workflow/docs/quick-reference.md` - Fast lookup guide
- Added `.claude/` session tracking infrastructure

## Version 1.2.0 - 2026-01-12

### Breaking Changes
- **release-automation plugin**: Updated to v2.0.0 with breaking command syntax changes and generic project support

### Added
- **release-automation v2.0.0**: Multi-language support (Node.js, Python, Rust, Go, Java, generic projects, monorepos)
- **release-automation v2.0.0**: Version adapter system for any file format
- **release-automation v2.0.0**: Configuration file support (.release-config.json)
- **release-automation v2.0.0**: Pre/post release hooks for tests, builds, and publishing
- **release-automation v2.0.0**: Project-specific validations for each project type

### Removed
- **agent-behavior-patterns plugin**: Moved functionality to CLAUDE.md variants

### Changed
- **release-automation**: Complete redesign from Claude Code plugin-specific to generic release automation
- **release-automation**: detect-release-scope skill renamed to detect-project-type

## Version 1.1.0 - 2026-01-12

### Added
- **daily-carry v1.1.0**: /deploy-otterstack orchestration command for Portainer stack deployments
- **agent-behavior-patterns**: Integration of 40+ agent behavior patterns into CLAUDE.md variants
- Security guidelines added to all CLAUDE.md variants

### Changed
- All plugins updated to version 1.1.0

## Version 1.0.0 - 2026-01-12

### Added
- Initial marketplace release with curated collection of Claude Code skills
- Two core plugins: daily-carry and agent-behavior-patterns
- Comprehensive CLAUDE.md variants for multiple development contexts
- Release automation plugin for streamlined version management
