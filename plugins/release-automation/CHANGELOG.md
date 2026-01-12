# Changelog

All notable changes to the release-automation plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
