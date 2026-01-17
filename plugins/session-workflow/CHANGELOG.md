# Changelog

All notable changes to the session-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
