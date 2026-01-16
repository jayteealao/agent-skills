# Changelog

All notable changes to the agent-skills marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
