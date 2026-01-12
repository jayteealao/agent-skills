---
name: pre-release-validation
description: Validate release readiness with comprehensive checks
user-invocable: false
---

# Pre-Release Validation

## Purpose

Performs comprehensive validation checks before finalizing a release. Catches common issues like version conflicts, missing files, invalid JSON, and incomplete changelog entries. Returns both blocking errors (must be fixed) and non-blocking warnings (can proceed with caution).

## Input Context

Requires:
- **Scope**: One of "marketplace", "plugin:<name>", or "variants"
- **New Version**: Version to be released (e.g., "1.2.0")
- **Changelog Path**: Path to changelog file
- **Modified Files**: List of files that will be committed

## Workflow

### 1. Version Tag Conflict Check

Check if a git tag already exists for this version:

```bash
git tag -l "{scope}-v{version}"
```

**Error if tag exists:**
- Level: BLOCKING
- Message: "Version {version} already released (tag {scope}-v{version} exists)"
- Suggestion: "Choose a different version or use git tag -d to delete existing tag"

### 2. Version Format Validation

Validate the version string follows semantic versioning:

**Pattern:** `X.Y.Z` where X, Y, Z are non-negative integers

**Error if invalid:**
- Level: BLOCKING
- Message: "Invalid version format: {version} (expected X.Y.Z)"

### 3. Version Progression Check

Compare new version to current version:

```
new_version > current_version
```

Parse as semver and verify new version is strictly greater.

**Error if not greater:**
- Level: BLOCKING
- Message: "New version {new} must be greater than current version {current}"

### 4. Required Files Existence

Based on scope, verify all required files exist:

**Marketplace:**
- `.claude-plugin/marketplace.json`
- `CHANGELOG.md` (root)

**Plugin:**
- `plugins/{name}/.claude-plugin/plugin.json`
- `plugins/{name}/CHANGELOG.md`
- `plugins/{name}/README.md`

**Variants:**
- `variants/variants.json`
- `variants/CHANGELOG.md`

**Error if missing:**
- Level: BLOCKING
- Message: "Required file not found: {file-path}"
- Suggestion: "Create the file before releasing"

### 5. JSON Validity Check

For each JSON file in the scope:
1. Read file contents
2. Attempt to parse as JSON
3. Verify required fields exist

**Marketplace.json required fields:**
- `name`, `version`, `description`, `plugins` (array)

**Plugin.json required fields:**
- `name`, `version`, `description`

**Variants.json required fields:**
- `name`, `metadata` (with `version`), `variants` (array)

**Error if invalid:**
- Level: BLOCKING
- Message: "Invalid JSON in {file}: {parse-error}"
- Or: "Missing required field '{field}' in {file}"

### 6. Changelog Entry Verification

Read changelog file and verify:
1. File is not empty
2. Contains an entry for the new version
3. Entry has content (not just header)

**Pattern to search:**
```
## Version {version} - {date}
```

**Error if missing:**
- Level: BLOCKING
- Message: "Changelog entry for version {version} not found in {changelog-path}"
- Suggestion: "Run changelog-update skill to generate entry"

**Warning if empty:**
- Level: WARNING
- Message: "Changelog entry for {version} appears to be empty"

### 7. Git Remote Configuration

Check if git remote is configured:

```bash
git remote -v
```

**Warning if no remote:**
- Level: WARNING
- Message: "No git remote configured - push operations will fail"
- Suggestion: "Configure remote with: git remote add origin <url>"

### 8. Skill/Command Reference Validation (Plugin Only)

For plugin releases, verify:
1. All skills referenced in README exist in `plugins/{name}/skills/`
2. All commands referenced in README exist in `plugins/{name}/commands/`

Parse README for skill/command mentions and cross-reference with filesystem.

**Warning if mismatch:**
- Level: WARNING
- Message: "README mentions skill '{skill-name}' but file not found"

### 9. Uncommitted Changes Check

Check if there are uncommitted changes beyond the release files:

```bash
git status --porcelain
```

Filter out expected changes (version files, changelogs, READMEs).

**Warning if unexpected changes:**
- Level: WARNING
- Message: "Uncommitted changes found in files: {list}"
- Suggestion: "Commit or stash unrelated changes before release"

### 10. Branch Validation

Check current branch:

```bash
git branch --show-current
```

**Warning if not on master/main:**
- Level: WARNING
- Message: "Not on master/main branch (currently on {branch})"
- Suggestion: "Releases should typically be done from master branch"

## Output Format

Return validation results:

```
{
  "valid": true | false,
  "errors": [
    {
      "level": "BLOCKING",
      "message": "Version 1.2.0 already released",
      "suggestion": "Choose version 1.2.1 or 1.3.0 instead"
    }
  ],
  "warnings": [
    {
      "level": "WARNING",
      "message": "Not on master branch",
      "suggestion": "Consider switching to master before release"
    }
  ],
  "checks_passed": 8,
  "checks_total": 10
}
```

## Examples

### Example 1: All Checks Pass

**Input:**
- Scope: `plugin:daily-carry`
- New version: `1.2.0`
- Current version: `1.1.0`

**Output:**
```
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "checks_passed": 10,
  "checks_total": 10
}
```

### Example 2: Version Conflict

**Input:**
- Scope: `marketplace`
- New version: `1.0.0`

**Git tags:**
```
marketplace-v1.0.0 (already exists)
```

**Output:**
```
{
  "valid": false,
  "errors": [
    {
      "level": "BLOCKING",
      "message": "Version 1.0.0 already released (tag marketplace-v1.0.0 exists)",
      "suggestion": "Choose version 1.0.1 or 1.1.0 instead",
      "check": "version_tag_conflict"
    }
  ],
  "warnings": [],
  "checks_passed": 9,
  "checks_total": 10
}
```

### Example 3: Missing Changelog Entry

**Input:**
- Scope: `plugin:new-plugin`
- New version: `1.0.0`

**Changelog content:**
```markdown
# Changelog

(empty - no version entries)
```

**Output:**
```
{
  "valid": false,
  "errors": [
    {
      "level": "BLOCKING",
      "message": "Changelog entry for version 1.0.0 not found in plugins/new-plugin/CHANGELOG.md",
      "suggestion": "Add changelog entry before releasing",
      "check": "changelog_entry"
    }
  ],
  "warnings": [],
  "checks_passed": 9,
  "checks_total": 10
}
```

### Example 4: Multiple Warnings

**Input:**
- Scope: `variants`
- New version: `2.0.0`
- Current branch: `feature-branch`
- No git remote

**Output:**
```
{
  "valid": true,
  "errors": [],
  "warnings": [
    {
      "level": "WARNING",
      "message": "Not on master branch (currently on feature-branch)",
      "suggestion": "Switch to master with: git checkout master",
      "check": "branch_validation"
    },
    {
      "level": "WARNING",
      "message": "No git remote configured - push will fail",
      "suggestion": "Add remote with: git remote add origin <url>",
      "check": "git_remote"
    }
  ],
  "checks_passed": 8,
  "checks_total": 10
}
```

## Error Handling

- **Git command failures**: Treat as blocking errors
- **File system errors**: Treat as blocking errors
- **Parse errors**: Treat as blocking errors (for JSON) or warnings (for markdown)

## Auto-Fix Suggestions

For certain errors, provide auto-fix options:

**Version conflict:**
- Suggest next patch: `1.2.1`
- Suggest next minor: `1.3.0`
- Suggest deleting tag (if confirmed intentional re-release)

**Missing files:**
- Offer to create stub file (e.g., empty CHANGELOG.md with header)

**Invalid JSON:**
- Show exact parse error location
- Offer to format/fix common issues (trailing commas, etc.)

## Integration Notes

This skill is invoked by the `/release` command in Phase 5. The command will:
1. Display all errors and warnings
2. Block release if `valid: false`
3. Prompt user to proceed if only warnings present
4. Offer auto-fix for fixable errors
5. Allow retry after manual fixes
