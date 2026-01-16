# Changelog

All notable changes to the session-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
