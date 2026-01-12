---
name: git-release-workflow
description: Execute git commit, tag, and push operations for releases
user-invocable: false
---

# Git Release Workflow

## Purpose

Executes the git operations for a release: staging modified files, creating a commit with proper formatting and attribution, creating an annotated git tag, and preparing for push. This skill handles the final git workflow step of the release process.

## Input Context

Requires:
- **Scope**: One of "marketplace", "plugin:<name>", or "variants"
- **Version**: New version string (e.g., "1.2.0")
- **Commit Message**: Pre-formatted commit message (from changelog-update skill)
- **Files to Stage**: List of modified files to include in commit

## Workflow

### 1. Stage Modified Files

Stage all files that were modified during the release process:

```bash
git add {file1} {file2} {file3} ...
```

**Files typically include:**
- Version configuration files (plugin.json, marketplace.json, variants.json)
- Changelog files (CHANGELOG.md)
- Documentation files (README.md)

Verify staging succeeded:
```bash
git status --short
```

### 2. Create Commit

Create commit with the provided message, ensuring proper formatting and attribution:

```bash
git commit -m "$(cat <<'EOF'
{commit-message}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

**Commit message format:**
```
Release {scope} v{version}

{changelog-body}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Important:** Use heredoc (`<<'EOF'`) to preserve formatting and handle multi-line messages correctly.

Capture commit hash:
```bash
git rev-parse HEAD
```

### 3. Create Annotated Git Tag

Create an annotated tag (not lightweight) following the scope-based naming pattern:

**Tag naming:**
- Marketplace: `marketplace-v{version}`
- Plugin: `{plugin-name}-v{version}`
- Variants: `variants-v{version}`

```bash
git tag -a "{scope}-v{version}" -m "Release {scope} v{version}"
```

**Annotation message** should be concise:
```
Release {scope} v{version}
```

Verify tag created:
```bash
git tag -l "{scope}-v{version}"
```

### 4. Prepare Push Information

Do NOT automatically push. Instead, prepare information for the command to display:

```bash
# Get remote URL
git remote get-url origin

# Get current branch
git branch --show-current

# Show what will be pushed
git log origin/{branch}..HEAD --oneline
```

Return push command for user to execute:
```bash
git push origin {branch} --follow-tags
```

Or if using `--force-with-lease` after rebase:
```bash
git push origin {branch} --follow-tags --force-with-lease
```

### 5. Generate Summary

Collect information for post-release summary:
- Commit hash (short: first 7 characters)
- Tag name
- Files committed (count)
- Current branch
- Remote URL (if configured)

## Output Format

Return:

```
{
  "commit_hash": "a1b2c3d",
  "commit_hash_full": "a1b2c3d4e5f6g7h8i9j0",
  "tag_name": "daily-carry-v1.2.0",
  "files_committed": [
    "plugins/daily-carry/.claude-plugin/plugin.json",
    "plugins/daily-carry/CHANGELOG.md",
    ".claude-plugin/marketplace.json"
  ],
  "files_count": 3,
  "branch": "master",
  "remote_url": "https://github.com/jayteealao/agent-skills.git",
  "push_command": "git push origin master --follow-tags",
  "success": true
}
```

## Examples

### Example 1: Plugin Release

**Input:**
- Scope: `plugin:daily-carry`
- Version: `1.2.0`
- Commit message:
  ```
  Release plugin:daily-carry v1.2.0

  Added:
  - New deployment command

  Fixed:
  - Git push error handling

  Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
  ```
- Files: `["plugins/daily-carry/.claude-plugin/plugin.json", "plugins/daily-carry/CHANGELOG.md", ".claude-plugin/marketplace.json"]`

**Operations:**
```bash
# Stage files
git add plugins/daily-carry/.claude-plugin/plugin.json
git add plugins/daily-carry/CHANGELOG.md
git add .claude-plugin/marketplace.json

# Create commit
git commit -m "$(cat <<'EOF'
Release plugin:daily-carry v1.2.0

Added:
- New deployment command

Fixed:
- Git push error handling

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"

# Create tag
git tag -a "daily-carry-v1.2.0" -m "Release plugin:daily-carry v1.2.0"
```

**Output:**
```
{
  "commit_hash": "f7e8d9c",
  "commit_hash_full": "f7e8d9c6b5a4e3d2c1b0a9f8e7d6c5b4",
  "tag_name": "daily-carry-v1.2.0",
  "files_committed": [
    "plugins/daily-carry/.claude-plugin/plugin.json",
    "plugins/daily-carry/CHANGELOG.md",
    ".claude-plugin/marketplace.json"
  ],
  "files_count": 3,
  "branch": "master",
  "remote_url": "https://github.com/jayteealao/agent-skills.git",
  "push_command": "git push origin master --follow-tags",
  "success": true
}
```

### Example 2: Marketplace Release

**Input:**
- Scope: `marketplace`
- Version: `1.1.0`
- Files: `[".claude-plugin/marketplace.json", "CHANGELOG.md", "README.md"]`

**Tag created:** `marketplace-v1.1.0`

**Output:**
```
{
  "commit_hash": "b4c5d6e",
  "tag_name": "marketplace-v1.1.0",
  "files_count": 3,
  "branch": "master",
  "push_command": "git push origin master --follow-tags",
  "success": true
}
```

### Example 3: Variants Release

**Input:**
- Scope: `variants`
- Version: `2.0.0`
- Files: `["variants/variants.json", "variants/CHANGELOG.md"]`

**Tag created:** `variants-v2.0.0`

## Error Handling

### Git Add Failure

**Error:** File doesn't exist or permission denied

**Response:**
```
{
  "success": false,
  "error": "Failed to stage files",
  "details": "git add failed: {error-message}",
  "suggestion": "Verify files exist and are writable"
}
```

### Git Commit Failure

**Error:** Nothing to commit, commit hook failed, etc.

**Response:**
```
{
  "success": false,
  "error": "Failed to create commit",
  "details": "{git-error-message}",
  "suggestion": "Check git status and pre-commit hooks"
}
```

**Rollback:** If commit fails, unstage files:
```bash
git reset HEAD
```

### Git Tag Failure

**Error:** Tag already exists, invalid tag name, etc.

**Response:**
```
{
  "success": false,
  "error": "Failed to create tag",
  "details": "{git-error-message}",
  "commit_hash": "f7e8d9c",
  "suggestion": "Tag may already exist. Use 'git tag -d {tag}' to delete or choose different version"
}
```

**Rollback:** Offer to undo commit:
```bash
git reset --soft HEAD~1
```

### No Remote Configured

**Warning:** (non-blocking)

**Response:**
```
{
  "success": true,
  "commit_hash": "f7e8d9c",
  "tag_name": "daily-carry-v1.2.0",
  "remote_url": null,
  "push_command": null,
  "warning": "No git remote configured - cannot push"
}
```

## Integration Notes

This skill is invoked by the `/release` command in Phase 6. The command will:
1. Execute git operations via this skill
2. Display commit hash and tag name
3. Prompt user to push with provided command
4. If user confirms, execute push:
   ```bash
   git push origin {branch} --follow-tags
   ```
5. Proceed to Phase 7 for verification

## Git Best Practices

- **Always use annotated tags** (`-a` flag) for releases (contains metadata)
- **Use heredoc for multi-line commit messages** to preserve formatting
- **Include Co-Authored-By** for attribution when Claude assists
- **Use `--follow-tags`** when pushing to include annotated tags
- **Never force push** unless explicitly requested and using `--force-with-lease`
- **Verify operations** after each git command (check status, verify tag exists)

## Linear History Maintenance

To maintain linear git history:
- Commit directly to master/main (no merge commits)
- If on feature branch, rebase onto master first
- Use fast-forward merges only
- Avoid `git merge --no-ff`
