# Release Configuration Reference

## Overview

The release-automation plugin supports optional configuration via `.release-config.json` or `.releaserc.json` files. If no configuration file is present, the plugin auto-detects project settings.

## Configuration File Location

Place one of these files in your project root:
- `.release-config.json` (recommended)
- `.releaserc.json` (alternative)
- `.releaserc` (JSON format without extension)

## Full Configuration Schema

```json
{
  "$schema": "https://github.com/jayteealao/agent-skills/blob/master/plugins/release-automation/schema/config.schema.json",
  "projectType": "nodejs",
  "versionFiles": [
    "package.json"
  ],
  "changelogFile": "CHANGELOG.md",
  "changelogFormat": "keep-a-changelog",
  "documentationFiles": [
    "README.md",
    "docs/**/*.md"
  ],
  "tagPattern": "v{version}",
  "tagMessage": "Release v{version}",
  "commitMessageTemplate": "chore: release v{version}\n\n{changelog}",
  "conventionalCommits": true,
  "preReleaseHook": "./scripts/pre-release.sh",
  "postReleaseHook": "./scripts/post-release.sh",
  "monorepo": {
    "enabled": false,
    "packages": [],
    "tagPattern": "{package}-v{version}"
  },
  "customValidations": [],
  "skipValidations": []
}
```

## Configuration Fields

### projectType

**Type:** `string`
**Optional:** Yes (auto-detected if not specified)
**Values:** `nodejs`, `python`, `rust`, `go`, `java`, `generic`, `claude-plugin`

Explicitly specify the project type to override auto-detection.

**Example:**
```json
{
  "projectType": "nodejs"
}
```

### versionFiles

**Type:** `array of strings`
**Optional:** Yes (auto-detected if not specified)

List of files containing version numbers to update. All files will be kept in sync.

**Example:**
```json
{
  "versionFiles": [
    "package.json",
    "src/version.ts"
  ]
}
```

**Common patterns:**
- Node.js: `["package.json"]`
- Python: `["pyproject.toml", "src/mypackage/__version__.py"]`
- Rust: `["Cargo.toml"]`
- Go: `[]` (versions via git tags only)
- Generic: `["VERSION"]`

### changelogFile

**Type:** `string`
**Default:** `CHANGELOG.md`

Path to the changelog file.

**Example:**
```json
{
  "changelogFile": "HISTORY.md"
}
```

### changelogFormat

**Type:** `string`
**Default:** `keep-a-changelog`
**Values:** `keep-a-changelog`, `standard`, `custom`

Changelog format to use when generating entries.

**keep-a-changelog format:**
```markdown
## Version 1.2.0 - 2026-01-12

### Added
- New feature

### Changed
- Updated behavior

### Fixed
- Bug fix
```

### documentationFiles

**Type:** `array of strings`
**Default:** `["README.md"]`

List of files (supports globs) to search for version references to update.

**Example:**
```json
{
  "documentationFiles": [
    "README.md",
    "docs/**/*.md",
    "website/docs/**/*.mdx"
  ]
}
```

### tagPattern

**Type:** `string`
**Default:** `v{version}`
**Placeholders:** `{version}`, `{package}` (monorepo only)

Git tag naming pattern.

**Examples:**
```json
{
  "tagPattern": "v{version}"          // → v1.2.0
}
```

```json
{
  "tagPattern": "release-{version}"   // → release-1.2.0
}
```

```json
{
  "tagPattern": "{package}-v{version}" // → my-lib-v1.2.0 (monorepo)
}
```

### tagMessage

**Type:** `string`
**Default:** `Release {version}`
**Placeholders:** `{version}`, `{package}`

Message for annotated git tag.

**Example:**
```json
{
  "tagMessage": "🎉 Release v{version}"
}
```

### commitMessageTemplate

**Type:** `string`
**Default:** `Release {version}\n\n{changelog}`
**Placeholders:** `{version}`, `{changelog}`, `{package}`

Template for release commit message.

**Example:**
```json
{
  "commitMessageTemplate": "chore(release): {version}\n\n{changelog}\n\nSigned-off-by: Bot <bot@example.com>"
}
```

### conventionalCommits

**Type:** `boolean`
**Default:** `true`

Enable conventional commit parsing for automatic version bump detection.

When `true`:
- `feat:` → minor bump
- `fix:` → patch bump
- `BREAKING CHANGE:` → major bump

When `false`:
- All commits → patch bump (unless explicitly specified)

### preReleaseHook

**Type:** `string`
**Optional:** Yes

Shell command to run before creating release commit. If command exits with non-zero code, release is aborted.

**Example:**
```json
{
  "preReleaseHook": "npm run build && npm test"
}
```

**Common use cases:**
- Run tests
- Build project
- Generate documentation
- Validate package can be published

### postReleaseHook

**Type:** `string`
**Optional:** Yes

Shell command to run after successful push. Does not affect release if it fails.

**Example:**
```json
{
  "postReleaseHook": "npm publish && ./scripts/notify-slack.sh"
}
```

**Common use cases:**
- Publish to package registry
- Deploy to CDN
- Send notifications
- Update external systems

### monorepo

**Type:** `object`
**Optional:** Yes

Configuration for monorepo projects.

**Fields:**
- `enabled` (boolean): Enable monorepo mode
- `packages` (array): Glob patterns for package directories
- `tagPattern` (string): Override tag pattern for packages

**Example:**
```json
{
  "monorepo": {
    "enabled": true,
    "packages": [
      "packages/*",
      "apps/*"
    ],
    "tagPattern": "{package}-v{version}"
  }
}
```

### customValidations

**Type:** `array of strings`
**Optional:** Yes

Shell commands to run as custom validation checks. Each command must exit with 0 for success.

**Example:**
```json
{
  "customValidations": [
    "./scripts/validate-docs.sh",
    "test -f dist/bundle.js"
  ]
}
```

### skipValidations

**Type:** `array of strings`
**Optional:** Yes

List of built-in validations to skip.

**Available validations to skip:**
- `version-tag-conflict` - Skip checking for existing tag
- `version-format` - Skip version format validation
- `version-progression` - Skip checking version is greater than current
- `required-files` - Skip checking required files exist
- `json-validity` - Skip JSON file validation
- `changelog-entry` - Skip changelog entry validation
- `git-remote` - Skip git remote configuration check

**Example:**
```json
{
  "skipValidations": ["git-remote"]
}
```

## Configuration Examples

### Node.js Library

```json
{
  "projectType": "nodejs",
  "versionFiles": ["package.json"],
  "tagPattern": "v{version}",
  "preReleaseHook": "npm run build && npm test",
  "postReleaseHook": "npm publish"
}
```

### Python Package

```json
{
  "projectType": "python",
  "versionFiles": [
    "pyproject.toml",
    "src/mypackage/__version__.py"
  ],
  "tagPattern": "v{version}",
  "preReleaseHook": "python -m build && twine check dist/*",
  "postReleaseHook": "twine upload dist/*"
}
```

### Rust Crate

```json
{
  "projectType": "rust",
  "versionFiles": ["Cargo.toml"],
  "tagPattern": "v{version}",
  "preReleaseHook": "cargo build --release && cargo test",
  "postReleaseHook": "cargo publish"
}
```

### Monorepo (npm workspaces)

```json
{
  "projectType": "nodejs",
  "monorepo": {
    "enabled": true,
    "packages": ["packages/*"],
    "tagPattern": "{package}-v{version}"
  },
  "changelogFile": "{package}/CHANGELOG.md",
  "preReleaseHook": "npm run build:all && npm test",
  "conventionalCommits": true
}
```

### Generic Project

```json
{
  "projectType": "generic",
  "versionFiles": ["VERSION"],
  "tagPattern": "release-{version}",
  "documentationFiles": [
    "README.md",
    "docs/**/*.md"
  ],
  "customValidations": [
    "./scripts/validate.sh"
  ]
}
```

### Claude Code Plugin

```json
{
  "projectType": "claude-plugin",
  "versionFiles": [
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json"
  ],
  "tagPattern": "{package}-v{version}",
  "changelogFile": "CHANGELOG.md"
}
```

## Configuration Priority

1. **Explicit config file** (`.release-config.json`)
2. **Auto-detection** from project markers
3. **Built-in defaults**

## Configuration Validation

The release tool validates configuration on first use:

```bash
/release

# If config is invalid:
✗ Configuration error in .release-config.json:
  - versionFiles[0]: "invalid.json" does not exist
  - tagPattern: Missing {version} placeholder
```

## Environment Variables

Configuration can reference environment variables:

```json
{
  "postReleaseHook": "npm publish --registry=$NPM_REGISTRY"
}
```

## Loading Configuration

Skills use this logic to load configuration:

```bash
# 1. Check for explicit config file
if [ -f ".release-config.json" ]; then
  config_file=".release-config.json"
elif [ -f ".releaserc.json" ]; then
  config_file=".releaserc.json"
elif [ -f ".releaserc" ]; then
  config_file=".releaserc"
else
  config_file=""
fi

# 2. If config exists, parse and validate
if [ -n "$config_file" ]; then
  # Load configuration
  project_type=$(jq -r '.projectType // "auto"' $config_file)
  version_files=$(jq -r '.versionFiles[]' $config_file)
  # ... etc
else
  # 3. Auto-detect project type
  # (see detect-project-type skill)
fi
```

## Schema Validation

A JSON schema is available for IDE autocompletion:

```json
{
  "$schema": "https://github.com/jayteealao/agent-skills/blob/master/plugins/release-automation/schema/config.schema.json"
}
```

Add this line to your `.release-config.json` for autocomplete in VS Code and other editors.
