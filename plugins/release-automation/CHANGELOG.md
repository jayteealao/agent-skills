# Changelog

All notable changes to the release-automation plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## Version 2.0.0 - 2026-01-12

### Breaking Changes
- **Command arguments changed**: Removed `scope` argument (e.g., `/release marketplace`), added `--package` for monorepos and `--config` for custom configuration files
- **Project type auto-detection**: Replaces scope detection - command now auto-detects project type from filesystem instead of requiring explicit scope
- **Skill renamed**: `detect-release-scope` → `detect-project-type` with completely rewritten logic
- **Configuration format**: Introduction of `.release-config.json` schema (optional, backward compatible)
- **v1.x command syntax deprecated**: Old command `/release plugin:name` replaced with `/release` (auto-detection) or `/release --package name` (explicit)

### Added
- **Multi-language support**: Node.js, Python, Rust, Go, Java, generic projects, monorepos, and Claude Code plugins (backward compatible)
- **Version adapter system**: Read/write versions from any file format (JSON, TOML, Python files, text files, Gradle, Maven, XML)
- **Configuration file support**: Optional `.release-config.json` for customizing version files, tag patterns, hooks, validations, and more
- **Pre-release hooks**: Execute custom scripts before git commit (tests, builds, linters, validation)
- **Post-release hooks**: Execute custom scripts after git push (publish, deploy, notifications)
- **Configurable tag patterns**: Template system with placeholders (`{version}`, `{package}`) for git tags
- **Project-specific validations**: Node.js (dependencies), Python (dist/ cleanup), Rust (cargo check), Go (mod verify), Java (build files)
- **Multi-file version sync**: Support for multiple version files with mismatch detection
- **Monorepo support**: Independent versioning per package with package-specific changelogs and tags
- **Custom validation scripts**: Execute user-defined validation scripts before release
- **Skip validation configuration**: Selectively skip specific validation checks
- **Documentation reference**: Version Adapters Reference and Configuration Reference documentation

### Changed
- **detect-project-type skill**: Complete rewrite to detect 8 project types from filesystem markers and load configuration
- **version-bump skill**: Enhanced with adapter-based version reading from any file format
- **changelog-update skill**: Enhanced with configurable changelog file paths and formats
- **documentation-sync skill**: Complete rewrite to synchronize versions across any file type with context-aware replacement
- **pre-release-validation skill**: Enhanced with project-specific checks for each supported project type
- **git-release-workflow skill**: Enhanced with pre/post hooks and configurable tag patterns with placeholder replacement
- **/release command**: Updated for generic project support with new Phase 1 (Project Detection & Configuration)
- **Plugin description**: Updated to reflect generic release automation for any project type

### Fixed
- Version file adapter implementation for Windows compatibility (path handling)
- Context-aware version replacement in documentation to avoid false positives
- Multi-file version synchronization with proper validation

## Version 1.0.0 - 2026-01-12

### Added
- `/release` command with 7-phase orchestration workflow
- `detect-release-scope` skill for intelligent scope detection from git changes
- `version-bump` skill with semantic versioning and conventional commit parsing
- `changelog-update` skill for automatic changelog generation
- `documentation-sync` skill for version reference updates across all files
- `pre-release-validation` skill with comprehensive release readiness checks
- `git-release-workflow` skill for commit, tag, and push operations
- Support for three release scopes: marketplace, per-plugin, variants
- Automated version bumping with major/minor/patch detection
- Git tag creation following pattern: {scope}-v{version}
- Changelog generation following keep-a-changelog format
- Error handling for uncommitted changes, version conflicts, and git failures
- Interactive prompts for user confirmation at critical decision points
