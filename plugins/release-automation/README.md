# Release Automation Plugin

Comprehensive release workflow automation for any project type. Handles version bumping, changelog generation, documentation updates, and git operations with support for Node.js, Python, Rust, Go, Java, generic projects, monorepos, and Claude Code plugins.

## Overview

The release-automation plugin provides a single `/release` command that orchestrates the entire release process through 7 phases:

1. **Project Detection & Configuration** - Auto-detect project type and load configuration
2. **Version Determination** - Calculate semantic version bumps from commits
3. **Changelog Preparation** - Generate changelog entries following keep-a-changelog format
4. **Documentation Updates** - Synchronize version references across all files
5. **Pre-Release Validation** - Comprehensive release readiness checks
6. **Git Workflow Execution** - Commit, tag, and push operations with hooks
7. **Post-Release Verification** - Verify release success and generate summary

## Project Type Support

Release-automation automatically detects and supports:

- **Node.js** - `package.json`, `package-lock.json`
- **Python** - `pyproject.toml`, `setup.py`, `__version__.py`
- **Rust** - `Cargo.toml`, `Cargo.lock`
- **Go** - `go.mod` (version via tags only)
- **Java** - `pom.xml`, `build.gradle`, `gradle.properties`
- **Generic** - `VERSION`, `version.txt`, custom files
- **Claude Code Plugins** - `.claude-plugin/plugin.json`
- **Monorepos** - Independent versioning per package

## Installation

This plugin is included in the agent-skills marketplace. No additional installation required.

## Usage

### Basic Usage

```bash
/release
```

Auto-detects project type from filesystem and suggests appropriate version bump.

### Specify Version Type

```bash
/release patch      # Force patch bump (x.y.Z)
/release minor      # Force minor bump (x.Y.0)
/release major      # Force major bump (X.0.0)
```

### Custom Commit Message

```bash
/release patch --message "Fix critical security vulnerability"
```

### Monorepo Package Release

```bash
/release --package my-lib
```

### Custom Configuration File

```bash
/release --config .release-config.custom.json
```

## Configuration

Create an optional `.release-config.json` file in your project root for customization:

```json
{
  "projectType": "nodejs",
  "versionFiles": [
    {
      "path": "package.json",
      "adapter": "json"
    }
  ],
  "changelogFile": "CHANGELOG.md",
  "changelogFormat": "keep-a-changelog",
  "tagPattern": "v{version}",
  "tagMessage": "Release v{version}",
  "preReleaseHook": "./scripts/test.sh",
  "postReleaseHook": "./scripts/publish.sh",
  "documentationFiles": ["README.md", "docs/**/*.md"],
  "customValidations": [],
  "skipValidations": []
}
```

See [Configuration Reference](../docs/configuration.md) for full schema and examples for each project type.

## Examples

### Example 1: Node.js Package Release

```bash
# In a Node.js project with package.json
/release

# Phase 1: Detects project_type = "nodejs"
# Phase 2: Calculates v1.5.0 → v1.6.0 (minor bump from feat: commits)
# Phase 3: Generates changelog from commits
# Phase 4: Updates package.json, package-lock.json, README.md
# Phase 5: All validations pass
# Phase 6: Runs pre-release hook (npm test), commits, tags "v1.6.0", pushes
# Phase 7: Runs post-release hook (npm publish), displays success
```

### Example 2: Python Package with Explicit Patch

```bash
# In a Python project with pyproject.toml
/release patch

# Phase 1: Detects project_type = "python"
# Phase 2: Forces v2.3.1 → v2.3.2 (patch bump)
# Phase 3: Generates changelog
# Phase 4: Updates pyproject.toml, src/mypackage/__version__.py, README.md
# Phase 5: Validates (checks for dist/ cleanup)
# Phase 6: Runs pytest, commits, tags "v2.3.2", pushes
# Phase 7: Runs twine upload, displays success
```

### Example 3: Rust Crate with Custom Message

```bash
# In a Rust project with Cargo.toml
/release patch --message "Fix memory leak in parser"

# Phase 1: Detects project_type = "rust"
# Phase 2: v0.5.2 → v0.5.3 (patch bump)
# Phase 3: Uses custom message for changelog
# Phase 4: Updates Cargo.toml, runs cargo update, updates README.md
# Phase 5: Validates (cargo check passes)
# Phase 6: Runs cargo test, commits, tags "v0.5.3", pushes
# Phase 7: Runs cargo publish, displays crates.io URL
```

### Example 4: Go Module Release

```bash
# In a Go project with go.mod
/release minor

# Phase 1: Detects project_type = "go"
# Phase 2: v1.2.0 → v1.3.0 (minor bump)
# Phase 3: Generates changelog
# Phase 4: Updates README.md only (Go uses tags for versions)
# Phase 5: Validates (go mod verify passes)
# Phase 6: Runs go test ./..., commits, tags "v1.3.0", pushes
# Phase 7: Displays pkg.go.dev URL
```

### Example 5: Monorepo Package

```bash
# In a monorepo with packages/my-lib
/release --package my-lib

# Phase 1: Loads monorepo config for my-lib
# Phase 2: v2.1.0 → v2.2.0 (from commits in packages/my-lib/)
# Phase 3: Updates packages/my-lib/CHANGELOG.md
# Phase 4: Updates packages/my-lib/package.json
# Phase 5: Validates my-lib specific files
# Phase 6: Commits, tags "my-lib-v2.2.0", pushes
# Phase 7: Success summary
```

### Example 6: Generic Project with VERSION File

```bash
# In a project with VERSION file
/release

# Phase 1: Detects project_type = "generic", version_file = "VERSION"
# Phase 2: 3.1.4 → 3.2.0 (from commits)
# Phase 3: Creates/updates CHANGELOG.md
# Phase 4: Updates VERSION file and README.md
# Phase 5: Validates
# Phase 6: Commits, tags "v3.2.0", pushes
# Phase 7: Success
```

### Example 7: Claude Code Plugin (Backward Compatible)

```bash
# In plugins/my-plugin/ with .claude-plugin/plugin.json
/release

# Phase 1: Detects project_type = "claude-plugin"
# Phase 2: v1.1.0 → v1.2.0
# Phase 3: Updates plugins/my-plugin/CHANGELOG.md
# Phase 4: Updates plugin.json, README, marketplace.json
# Phase 5: Validates skill/command references
# Phase 6: Commits, tags "my-plugin-v1.2.0", pushes
# Phase 7: Success
```

## Version Bumping

The plugin uses conventional commits to determine version bump types:

- **Major (X.0.0)**: Commits with `BREAKING CHANGE:` in body or `!` after type
- **Minor (x.Y.0)**: Commits with `feat:` prefix
- **Patch (x.y.Z)**: Commits with `fix:` prefix or other types

Example commits:
```
feat: add authentication support              → minor bump
fix: correct memory leak in parser            → patch bump
feat!: change API response format             → major bump
```

## Pre/Post Release Hooks

Execute custom scripts before commit and after push:

**Pre-release hooks** (run before git commit):
- Run tests: `npm test`, `cargo test`, `pytest`
- Build project: `npm run build`, `cargo build --release`
- Run linters: `npm run lint`, `cargo clippy`
- Validate package: `npm pack --dry-run`, `twine check dist/*`

**Post-release hooks** (run after git push):
- Publish package: `npm publish`, `cargo publish`, `twine upload dist/*`
- Deploy to hosting: `netlify deploy --prod`, `vercel --prod`
- Send notifications: `./scripts/notify-slack.sh`
- Create GitHub release: `gh release create $TAG_NAME`

Configure in `.release-config.json`:
```json
{
  "preReleaseHook": "./scripts/pre-release.sh",
  "postReleaseHook": "./scripts/post-release.sh"
}
```

## Skills Included

This plugin includes 6 supporting skills (all marked `user-invocable: false` as they're designed for command orchestration):

1. **detect-project-type** - Auto-detect project type and load configuration (replaces detect-release-scope)
2. **version-bump** - Calculate semantic version bumps with adapter support
3. **changelog-update** - Generate changelog entries from commits with configurable formats
4. **documentation-sync** - Synchronize version numbers across any file type
5. **pre-release-validation** - Validate release readiness with project-specific checks
6. **git-release-workflow** - Execute git operations with configurable tag patterns and hooks

## Version File Adapters

Release-automation uses adapters to read/write versions from any file format:

- **JSON** (`package.json`, `plugin.json`, `composer.json`)
- **TOML** (`Cargo.toml`, `pyproject.toml`)
- **Python Files** (`__version__.py`, `__init__.py`)
- **Text Files** (`VERSION`, `version.txt`)
- **Gradle** (`gradle.properties`, `build.gradle`)
- **Maven** (`pom.xml`)
- **Go** (version via git tags only)
- **XML** (generic XML version tags)

See [Version Adapters Reference](../docs/version-adapters.md) for implementation details.

## Error Handling

The plugin handles common error scenarios:

- **Uncommitted Changes**: Prompts to include, show diff, or cancel
- **Version Conflicts**: Detects existing tags and offers alternative versions
- **Failed Validation**: Displays detailed errors with auto-fix suggestions
- **Git Operation Failures**: Provides rollback and retry options
- **Hook Failures**: Pre-release hooks abort release; post-release hooks warn but continue

## Breaking Changes from v1.x

**v2.0.0 introduces breaking changes:**

1. **Command arguments changed**:
   - **Removed**: `scope` argument (e.g., `/release marketplace`)
   - **Added**: `--package` argument for monorepos
   - **Added**: `--config` argument for custom config file

2. **Project type auto-detection replaces scope detection**:
   - v1.x: `/release plugin:daily-carry`
   - v2.0: `/release` (auto-detects from filesystem)

3. **Configuration file format**:
   - v1.x: No configuration file support
   - v2.0: `.release-config.json` with full schema

4. **Skill names changed**:
   - `detect-release-scope` → `detect-project-type`
   - All skills enhanced with generic project support

### Migration Guide for v1.x Users

**Claude Code plugin releases still work** - the plugin detects `.claude-plugin/` directories and operates in backward-compatible mode.

**Old command** (v1.x):
```bash
/release plugin:daily-carry
```

**New command** (v2.0):
```bash
# In plugins/daily-carry/ directory
/release

# Or from repo root with --package
/release --package daily-carry
```

**Recommended actions:**
1. Review your release workflow - most projects work with zero configuration
2. Add `.release-config.json` if you need custom hooks or validation
3. Test the new auto-detection with a dry-run release
4. Update CI/CD scripts if they reference old command syntax

## Requirements

- Git repository with configured remote
- Conventional commit format (recommended but not required)
- Appropriate permissions for git push operations
- For hooks: Executable scripts (Linux/macOS: `chmod +x`, Windows: `.bat` or `.ps1`)

## Documentation

- [Configuration Reference](../docs/configuration.md) - Full `.release-config.json` schema
- [Version Adapters Reference](../docs/version-adapters.md) - Adapter implementation details

## License

MIT
