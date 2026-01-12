# Changelog

All notable changes to the agent-skills marketplace will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
