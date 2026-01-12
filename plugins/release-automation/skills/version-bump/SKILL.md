---
name: version-bump
description: Calculate semantic version bumps based on git commits
user-invocable: false
---

# Version Bump

## Purpose

Reads the current version from scope-specific configuration files, analyzes git commits since the last release tag, and calculates the appropriate semantic version bump (major/minor/patch) based on conventional commit patterns.

## Input Context

Requires:
- **Scope**: One of "marketplace", "plugin:<name>", or "variants"
- **Version Type** (optional): "major", "minor", "patch", or "auto" (default)

## Workflow

### 1. Read Current Version

Based on the scope, read the current version from the appropriate file:

**Marketplace:**
```bash
# Read from .claude-plugin/marketplace.json → version field
```

**Plugin:**
```bash
# Read from plugins/{name}/.claude-plugin/plugin.json → version field
```

**Variants:**
```bash
# Read from variants/variants.json → metadata.version field
```

Parse the JSON and extract the version string (format: X.Y.Z).

### 2. Find Last Release Tag

Determine the tag pattern based on scope:
- Marketplace: `marketplace-v*`
- Plugin: `{plugin-name}-v*`
- Variants: `variants-v*`

Find the most recent tag:
```bash
git tag -l "{scope}-v*" --sort=-version:refname | head -n 1
```

If no tag exists, treat current version as baseline (likely v1.0.0 for new releases).

### 3. Analyze Commits Since Last Release

Get all commits since the last tag (or from repo start if no tag):

```bash
# If tag exists:
git log {last-tag}..HEAD --oneline --no-merges

# If no tag exists:
git log --oneline --no-merges
```

### 4. Parse Conventional Commits

For each commit message, check for conventional commit patterns:

**Major Bump Indicators:**
- `BREAKING CHANGE:` in commit body
- `!` after commit type (e.g., `feat!:`, `fix!:`)

**Minor Bump Indicators:**
- `feat:` prefix
- `feat(scope):` prefix

**Patch Bump Indicators:**
- `fix:` prefix
- `fix(scope):` prefix
- Other types: `chore:`, `docs:`, `style:`, `refactor:`, `test:`

### 5. Determine Bump Type

Apply precedence rules:
1. If ANY commit indicates major bump → **MAJOR**
2. Else if ANY commit indicates minor bump → **MINOR**
3. Else if ANY commit indicates patch bump → **PATCH**
4. Else (no conventional commits) → **PATCH** (default)

If `version-type` input is provided and not "auto", use that instead.

### 6. Calculate New Version

Parse current version (X.Y.Z) and increment:

- **Major bump**: (X+1).0.0
- **Minor bump**: X.(Y+1).0
- **Patch bump**: X.Y.(Z+1)

## Output Format

Return structured data:

```
{
  "current_version": "1.2.3",
  "new_version": "1.3.0",
  "bump_type": "minor",
  "reasoning": [
    "feat: add new deployment skill",
    "fix: correct version detection logic"
  ],
  "last_tag": "daily-carry-v1.2.3",
  "commits_analyzed": 5
}
```

## Examples

### Example 1: Minor Bump with Conventional Commits

**Input:**
- Scope: `plugin:daily-carry`
- Current version: `1.1.0`
- Last tag: `daily-carry-v1.1.0`

**Commits Since Tag:**
```
feat: add deploy-otterstack command
fix: correct git push handling
docs: update README examples
```

**Output:**
```
{
  "current_version": "1.1.0",
  "new_version": "1.2.0",
  "bump_type": "minor",
  "reasoning": [
    "feat: add deploy-otterstack command (minor bump)",
    "fix: correct git push handling (patch bump)",
    "Minor bump takes precedence"
  ],
  "last_tag": "daily-carry-v1.1.0",
  "commits_analyzed": 3
}
```

### Example 2: Major Bump with Breaking Change

**Input:**
- Scope: `marketplace`
- Current version: `1.0.0`

**Commits:**
```
feat!: change marketplace schema structure
BREAKING CHANGE: marketplace.json now requires plugins array
```

**Output:**
```
{
  "current_version": "1.0.0",
  "new_version": "2.0.0",
  "bump_type": "major",
  "reasoning": [
    "feat! indicates breaking change (major bump)",
    "BREAKING CHANGE in commit body"
  ],
  "last_tag": "marketplace-v1.0.0",
  "commits_analyzed": 1
}
```

### Example 3: First Release (No Tag)

**Input:**
- Scope: `plugin:new-plugin`
- Current version in plugin.json: `1.0.0`

**Output:**
```
{
  "current_version": "1.0.0",
  "new_version": "1.0.0",
  "bump_type": "none",
  "reasoning": [
    "No previous tag found - using current version for initial release"
  ],
  "last_tag": null,
  "commits_analyzed": 0
}
```

### Example 4: Explicit Version Type Override

**Input:**
- Scope: `variants`
- Version type: `major`
- Current version: `1.1.0`

**Output:**
```
{
  "current_version": "1.1.0",
  "new_version": "2.0.0",
  "bump_type": "major",
  "reasoning": [
    "Explicit major bump requested by user"
  ],
  "last_tag": "variants-v1.1.0",
  "commits_analyzed": 8
}
```

## Error Handling

- **Invalid version format**: Return error if current version is not X.Y.Z format
- **File not found**: Return error if scope-specific version file doesn't exist
- **Invalid JSON**: Return error if version file cannot be parsed
- **Git errors**: Return error if git commands fail (not a repo, etc.)

## Integration Notes

This skill is invoked by the `/release` command in Phase 2. The command will:
1. Display the calculated bump and reasoning
2. Prompt user to confirm or provide custom version
3. Use the confirmed version for remaining phases
