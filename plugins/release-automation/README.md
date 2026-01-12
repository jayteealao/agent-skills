# Release Automation Plugin

Comprehensive release workflow automation for the agent-skills marketplace. Handles version bumping, changelog generation, documentation updates, and git operations across multiple release scopes.

## Overview

The release-automation plugin provides a single `/release` command that orchestrates the entire release process through 7 phases:

1. **Detection & Validation** - Analyze git changes to determine release scope
2. **Version Determination** - Calculate semantic version bumps from commits
3. **Changelog Preparation** - Generate changelog entries following keep-a-changelog format
4. **Documentation Updates** - Synchronize version references across all files
5. **Pre-Release Validation** - Comprehensive release readiness checks
6. **Git Workflow Execution** - Commit, tag, and push operations
7. **Post-Release Verification** - Verify release success and generate summary

## Installation

This plugin is included in the agent-skills marketplace. No additional installation required.

## Usage

### Basic Usage

```bash
/release
```

Auto-detects release scope from git changes and suggests appropriate version bump.

### Explicit Scope

```bash
/release marketplace
/release plugin:daily-carry
/release variants
```

### Specify Version Type

```bash
/release marketplace patch
/release plugin:daily-carry minor
```

### Custom Commit Message

```bash
/release marketplace patch --message "Fix marketplace schema validation"
```

## Release Scopes

The plugin handles three independent versioning contexts:

### Marketplace Release

- **Scope**: `marketplace`
- **Version file**: `.claude-plugin/marketplace.json` → `version`
- **Changelog**: `CHANGELOG.md` (root)
- **Git tag**: `marketplace-v{version}`
- **Updates**: marketplace.json, root README.md

### Plugin Release

- **Scope**: `plugin:<name>`
- **Version file**: `plugins/{name}/.claude-plugin/plugin.json` → `version`
- **Changelog**: `plugins/{name}/CHANGELOG.md`
- **Git tag**: `{name}-v{version}`
- **Updates**: plugin.json, plugin README.md, marketplace.json, root README.md

### Variants Release

- **Scope**: `variants`
- **Version file**: `variants/variants.json` → `metadata.version`
- **Changelog**: `variants/CHANGELOG.md`
- **Git tag**: `variants-v{version}`
- **Updates**: variants.json, root README.md

## Skills Included

This plugin includes 6 supporting skills (all marked `user-invocable: false` as they're designed for command orchestration):

1. **detect-release-scope** - Analyze git changes to determine release scope (marketplace/plugin/variants)
2. **version-bump** - Calculate semantic version bumps based on conventional commits
3. **changelog-update** - Generate changelog entries from commits
4. **documentation-sync** - Synchronize version numbers across documentation
5. **pre-release-validation** - Validate release readiness with comprehensive checks
6. **git-release-workflow** - Execute git commit, tag, and push operations

## Examples

### Example 1: Plugin Release with Auto-Detection

```bash
# User edits plugins/daily-carry/skills/new-skill/SKILL.md
/release

# Phase 1: Detects scope = "plugin:daily-carry"
# Phase 2: Analyzes commits, suggests minor bump (v1.1.0 → v1.2.0)
# Phase 3: Generates changelog from 5 commits
# Phase 4: Updates 4 files (plugin.json, README, marketplace.json, root README)
# Phase 5: All validations pass
# Phase 6: Commits, tags "daily-carry-v1.2.0", pushes
# Phase 7: Displays success summary
```

### Example 2: Marketplace Release with Explicit Scope

```bash
/release marketplace patch --message "Fix marketplace schema validation"

# Phase 1: Scope = "marketplace", validates git
# Phase 2: v1.0.0 → v1.0.1 (patch bump)
# Phase 3: Uses custom message for changelog
# Phase 4: Updates marketplace.json and README.md
# Phase 5: Validates
# Phase 6: Commits + tags "marketplace-v1.0.1"
# Phase 7: Success
```

### Example 3: First Release of New Plugin

```bash
/release plugin:new-plugin

# Phase 1: Scope detected
# Phase 2: No tag exists → defaults to v1.0.0
# Phase 3: Creates new CHANGELOG.md with initial entry
# Phase 4: Updates plugin.json, creates README, updates marketplace.json
# Phase 5: Validates (all checks pass)
# Phase 6: Commits + tags "new-plugin-v1.0.0"
# Phase 7: Displays GitHub release URL suggestion
```

## Version Bumping

The plugin uses conventional commits to determine version bump types:

- **Major (X.0.0)**: Commits with `BREAKING CHANGE:` in body or `!` after type
- **Minor (x.Y.0)**: Commits with `feat:` prefix
- **Patch (x.y.Z)**: Commits with `fix:` prefix or other types

Example commits:
```
feat: add new skill for deployment automation    → minor bump
fix: correct version detection in changelog      → patch bump
feat!: change command argument structure         → major bump
```

## Error Handling

The plugin handles common error scenarios:

- **Uncommitted Changes**: Prompts to include, show diff, or cancel
- **Version Conflicts**: Detects existing tags and offers alternative versions
- **Failed Validation**: Displays detailed errors with auto-fix suggestions
- **Git Operation Failures**: Provides rollback and retry options

## Requirements

- Git repository with configured remote
- Conventional commit format (recommended but not required)
- Appropriate permissions for git push operations

## License

MIT
