---
description: Orchestrate complete release workflow with version bumping, changelog generation, documentation updates, and git operations
argument-hint: "[scope] [version-type] [--message \"Custom message\"]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - AskUserQuestion
  - Skill
---

# Release Automation Command

Comprehensive release workflow automation that handles version bumping, changelog generation, documentation synchronization, validation, and git operations across three release scopes: marketplace, per-plugin, and variants.

## Usage

```bash
# Auto-detect scope and version from git changes
/release

# Explicit scope
/release marketplace
/release plugin:daily-carry
/release variants

# Specify version bump type
/release marketplace patch
/release plugin:daily-carry minor

# Custom commit message
/release marketplace patch --message "Fix schema validation"
```

## Arguments

- **scope** (optional): "marketplace" | "plugin:<name>" | "variants" | "auto" (default)
  - Auto-detection analyzes git changes to determine scope
- **version-type** (optional): "major" | "minor" | "patch" | "auto" (default)
  - Auto-detection uses conventional commits to determine bump type
- **--message** (optional): Custom commit message (overrides changelog generation)

## Release Workflow

The command executes through 7 orchestrated phases:

---

## Phase 1: Detection & Validation

**Objective:** Determine release scope, validate git state, and handle uncommitted changes.

### Steps

1. **Parse Command Arguments**

   Extract scope, version-type, and custom message from command line:
   ```
   args: [scope] [version-type] [--message "text"]
   ```

2. **Detect Release Scope** (if not explicitly provided)

   Invoke `detect-release-scope` skill to analyze git changes:
   ```
   Skill: detect-release-scope
   ```

   The skill returns:
   - Primary scope (marketplace/plugin/variants)
   - Confidence level
   - Evidence (file change counts per scope)
   - Warnings (branch, conflicts, etc.)

3. **Handle Ambiguous Detection**

   If confidence is "ambiguous", prompt user to choose:
   ```
   AskUserQuestion:
   - Question: "Multiple scopes detected. Which release do you want to create?"
   - Options:
     - Marketplace release
     - Plugin: {detected-plugins}
     - Variants release
   ```

4. **Validate Git State**

   Check for clean git state:
   ```bash
   git status --porcelain
   ```

   If uncommitted changes exist:
   ```
   AskUserQuestion:
   - Question: "Uncommitted changes detected. How would you like to proceed?"
   - Options:
     - Include in release (recommended)
     - Show diff first
     - Cancel release
   ```

5. **Verify Branch**

   Check current branch:
   ```bash
   git branch --show-current
   ```

   If not on master/main, prompt:
   ```
   AskUserQuestion:
   - Question: "You're on branch '{branch}'. Releases are typically done from master. Continue anyway?"
   - Options:
     - Continue on current branch
     - Switch to master
     - Cancel
   ```

### Phase 1 Output

- Confirmed release scope
- Clean or handled git state
- Current branch validated

---

## Phase 2: Version Determination

**Objective:** Calculate the appropriate semantic version bump and get user confirmation.

### Steps

1. **Invoke Version Bump Skill**

   ```
   Skill: version-bump
   Input:
     - scope: {confirmed-scope}
     - version-type: {from-args or "auto"}
   ```

   Returns:
   - current_version
   - new_version
   - bump_type (major/minor/patch)
   - reasoning (commit analysis)
   - last_tag

2. **Display Version Bump**

   Show user the calculated version bump:
   ```
   Current version: {current_version}
   New version: {new_version}
   Bump type: {bump_type}

   Reasoning:
   - {reasoning[0]}
   - {reasoning[1]}
   ...
   ```

3. **Confirm or Customize Version**

   ```
   AskUserQuestion:
   - Question: "Proceed with version {new_version}?"
   - Options:
     - Yes, use {new_version} (Recommended)
     - No, enter custom version
     - Cancel release
   ```

   If custom version selected, validate format (X.Y.Z) and ensure > current_version.

### Phase 2 Output

- Confirmed new version number
- Version bump rationale

---

## Phase 3: Changelog Preparation

**Objective:** Generate or update changelog entry from commits.

### Steps

1. **Invoke Changelog Update Skill**

   ```
   Skill: changelog-update
   Input:
     - scope: {confirmed-scope}
     - version: {confirmed-version}
     - custom-message: {from --message arg if provided}
   ```

   Returns:
   - changelog_path
   - new_entry (formatted markdown)
   - commit_message (for git commit)
   - categories (added/changed/fixed counts)

2. **Display Generated Changelog**

   Show the changelog entry to user:
   ```
   Generated changelog entry for {changelog_path}:

   {new_entry}

   Categories: {added} added, {changed} changed, {fixed} fixed
   ```

3. **Allow Editing**

   ```
   AskUserQuestion:
   - Question: "Review the changelog entry. Would you like to:"
   - Options:
     - Use as-is (Recommended)
     - Edit entry manually
     - Regenerate with different commits
   ```

   If "Edit manually", use Write tool to save draft and prompt user to edit:
   ```
   Draft saved to: /tmp/release-changelog-draft.md
   Please edit and confirm when ready.
   ```

4. **Write Changelog**

   Update the changelog file with the finalized entry using Edit tool.

### Phase 3 Output

- Updated changelog file
- Finalized commit message
- Changelog entry approved

---

## Phase 4: Documentation Updates

**Objective:** Synchronize version numbers across all relevant files.

### Steps

1. **Invoke Documentation Sync Skill**

   ```
   Skill: documentation-sync
   Input:
     - scope: {confirmed-scope}
     - old_version: {current_version}
     - new_version: {confirmed-version}
   ```

   Returns:
   - files_updated (list)
   - changes (detailed diff per file)
   - warnings (missing references, etc.)
   - git_diff (full diff output)

2. **Display Changes**

   Show all file updates:
   ```
   Documentation updates:

   Files modified:
   - {file1}
   - {file2}
   - {file3}

   Git diff:
   {git_diff}
   ```

3. **Confirm Updates**

   ```
   AskUserQuestion:
   - Question: "Review the documentation changes. Proceed?"
   - Options:
     - Yes, looks good (Recommended)
     - Show full diff for each file
     - Make manual adjustments
     - Cancel release
   ```

### Phase 4 Output

- All version references updated
- Documentation synchronized
- Changes reviewed and approved

---

## Phase 5: Pre-Release Validation

**Objective:** Run comprehensive validation checks before committing.

### Steps

1. **Invoke Pre-Release Validation Skill**

   ```
   Skill: pre-release-validation
   Input:
     - scope: {confirmed-scope}
     - new_version: {confirmed-version}
     - changelog_path: {changelog_path}
     - modified_files: {list from Phase 4}
   ```

   Returns:
   - valid (true/false)
   - errors (blocking issues)
   - warnings (non-blocking issues)
   - checks_passed / checks_total

2. **Display Validation Results**

   If errors exist:
   ```
   ❌ Validation failed ({checks_passed}/{checks_total} checks passed)

   Blocking Errors:
   - {error.message}
     Suggestion: {error.suggestion}

   Warnings:
   - {warning.message}
   ```

   If only warnings:
   ```
   ⚠️  Validation passed with warnings ({checks_passed}/{checks_total} checks passed)

   Warnings:
   - {warning.message}
     Suggestion: {warning.suggestion}
   ```

   If all checks pass:
   ```
   ✅ All validation checks passed ({checks_total}/{checks_total})
   ```

3. **Handle Validation Failures**

   If `valid: false` (blocking errors):
   ```
   AskUserQuestion:
   - Question: "Validation failed. How would you like to proceed?"
   - Options:
     - Attempt auto-fix (if available)
     - Make manual fixes and retry
     - Cancel release
   ```

4. **Handle Warnings**

   If only warnings:
   ```
   AskUserQuestion:
   - Question: "Validation passed with warnings. Continue anyway?"
   - Options:
     - Yes, proceed with release (Recommended)
     - Fix warnings first
     - Cancel
   ```

### Phase 5 Output

- All validation checks passed
- No blocking errors
- Ready for git operations

---

## Phase 6: Git Workflow Execution

**Objective:** Execute git commit, tag, and push operations.

### Steps

1. **Invoke Git Release Workflow Skill**

   ```
   Skill: git-release-workflow
   Input:
     - scope: {confirmed-scope}
     - version: {confirmed-version}
     - commit_message: {from Phase 3}
     - files_to_stage: {modified files from Phases 3 & 4}
   ```

   Returns:
   - commit_hash
   - tag_name
   - files_committed
   - branch
   - remote_url
   - push_command
   - success

2. **Display Commit Results**

   ```
   ✅ Release commit created successfully

   Commit: {commit_hash}
   Tag: {tag_name}
   Branch: {branch}
   Files: {files_count} files committed

   Changes:
   - {file1}
   - {file2}
   - {file3}
   ```

3. **Prompt for Push**

   ```
   AskUserQuestion:
   - Question: "Ready to push release to remote?"
   - Options:
     - Yes, push now (Recommended)
     - No, I'll push manually later
     - Show what will be pushed
   ```

4. **Execute Push** (if confirmed)

   ```bash
   git push origin {branch} --follow-tags
   ```

   Capture output and verify success.

5. **Handle Push Failures**

   If push fails:
   ```
   Push failed: {error-message}

   The release commit and tag are created locally.
   You can push manually with:
     {push_command}

   Or troubleshoot the remote connection.
   ```

### Phase 6 Output

- Commit created with proper attribution
- Annotated tag created: {scope}-v{version}
- Pushed to remote (or pending manual push)

---

## Phase 7: Post-Release Verification

**Objective:** Verify release success and provide summary.

### Steps

1. **Verify Tag on Remote** (if pushed)

   ```bash
   git ls-remote --tags origin {tag_name}
   ```

2. **Verify Version in Files**

   Read scope-specific version file and confirm it contains new version:
   ```
   Read: {version-file}
   Verify: version == {confirmed-version}
   ```

3. **Generate Release Summary**

   ```
   ═══════════════════════════════════════════════════════════
   🎉 Release {scope} v{version} completed successfully!
   ═══════════════════════════════════════════════════════════

   Release Details:
   - Scope: {scope}
   - Version: {current_version} → {confirmed-version}
   - Bump: {bump_type}
   - Commit: {commit_hash}
   - Tag: {tag_name}
   - Branch: {branch}

   Files Updated:
   - {changelog_path}
   - {version_file}
   - {other_files...}

   Next Steps:
   {if-github}
   - Create GitHub release: https://github.com/{owner}/{repo}/releases/new?tag={tag_name}
   {endif}
   - Verify release on remote
   - Announce release to users
   ```

4. **Offer GitHub Release Creation** (if applicable)

   If remote URL is GitHub:
   ```
   AskUserQuestion:
   - Question: "Create GitHub release page?"
   - Options:
     - Yes, open GitHub release URL
     - No, I'll create it manually
   ```

   If yes, display URL and offer to generate release notes:
   ```
   GitHub Release URL:
   https://github.com/{owner}/{repo}/releases/new?tag={tag_name}

   Suggested release notes:
   {changelog_entry}
   ```

### Phase 7 Output

- Release verified on remote
- Summary displayed
- GitHub release URL provided (if applicable)

---

## Error Handling

### General Error Recovery

For each phase, if an error occurs:
1. Display detailed error message
2. Show what was completed successfully
3. Offer recovery options:
   - Retry current phase
   - Rollback changes (if applicable)
   - Continue to next phase (if non-blocking)
   - Cancel release

### Rollback Procedures

**After Phase 6 (Commit Created):**
- If push fails, commit and tag remain local (safe)
- If user wants to undo: `git reset --soft HEAD~1 && git tag -d {tag_name}`

**After Phase 4 (Files Modified):**
- If validation fails, files can be reverted with git checkout
- Prompt user before reverting

**After Phase 3 (Changelog Updated):**
- Changelog changes can be manually reverted via Edit tool

### Common Error Scenarios

1. **Version Already Released**
   - Detected in Phase 5 (validation)
   - Offer to choose different version
   - Return to Phase 2

2. **Git Push Authentication Failure**
   - Detected in Phase 6
   - Commit and tag created successfully (local)
   - Provide manual push command
   - User can push later after fixing auth

3. **Uncommitted Changes Conflict**
   - Detected in Phase 1
   - Prompt to include, stash, or show diff
   - User decides how to proceed

4. **Invalid JSON in Version Files**
   - Detected in Phase 5 (validation)
   - Show exact parse error
   - Prompt to fix and retry

## Examples

### Example 1: Plugin Release (Auto-Detected)

```bash
/release

# Phase 1: Detects "plugin:daily-carry" from git changes
# Phase 2: Calculates v1.1.0 → v1.2.0 (minor bump from feat: commits)
# Phase 3: Generates changelog from 5 commits
# Phase 4: Updates plugin.json, README, marketplace.json
# Phase 5: All validations pass
# Phase 6: Commits, creates tag "daily-carry-v1.2.0", pushes
# Phase 7: Verifies and displays success summary
```

### Example 2: Marketplace Patch Release

```bash
/release marketplace patch --message "Fix schema validation"

# Phase 1: Scope = "marketplace" (explicit)
# Phase 2: v1.0.0 → v1.0.1 (patch bump, explicit)
# Phase 3: Uses custom message for changelog
# Phase 4: Updates marketplace.json and README
# Phase 5: Validates
# Phase 6: Commits + tags "marketplace-v1.0.1"
# Phase 7: Success
```

### Example 3: First Plugin Release

```bash
/release plugin:new-plugin

# Phase 1: Scope = "plugin:new-plugin" (explicit)
# Phase 2: No tag exists → defaults to v1.0.0
# Phase 3: Creates new CHANGELOG.md with initial entry
# Phase 4: Updates plugin.json, creates README entries
# Phase 5: Validates (all checks pass)
# Phase 6: Commits + tags "new-plugin-v1.0.0"
# Phase 7: Offers GitHub release creation
```

## Integration with Skills

This command orchestrates 6 skills (all marked `user-invocable: false`):

1. **detect-release-scope** - Phase 1
2. **version-bump** - Phase 2
3. **changelog-update** - Phase 3
4. **documentation-sync** - Phase 4
5. **pre-release-validation** - Phase 5
6. **git-release-workflow** - Phase 6

Phase 7 is handled directly by the command (verification and summary).

## Requirements

- Git repository with configured remote
- Conventional commit format (recommended for auto-detection)
- Appropriate git push permissions
- Valid JSON in all configuration files

## Notes

- All git operations follow safe practices (no force push unless explicit)
- Linear git history maintained (direct commits, no merge commits)
- Co-Authored-By attribution included in all commits
- Annotated tags used for rich metadata
- User confirmation required at critical decision points
