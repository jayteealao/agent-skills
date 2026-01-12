---
name: documentation-sync
description: Synchronize version numbers across documentation and configuration files
user-invocable: false
---

# Documentation Sync

## Purpose

Updates version references across all relevant documentation and configuration files for a given release scope. Ensures consistency between JSON metadata files, README documentation, and marketplace listings.

## Input Context

Requires:
- **Scope**: One of "marketplace", "plugin:<name>", or "variants"
- **Old Version**: Previous version string (e.g., "1.1.0")
- **New Version**: New version string (e.g., "1.2.0")

## Workflow

### 1. Build File List

Based on scope, determine which files need version updates:

**Marketplace Scope:**
- `.claude-plugin/marketplace.json` → `version` field
- Root `README.md` → version badge/references

**Plugin Scope (e.g., plugin:daily-carry):**
- `plugins/{name}/.claude-plugin/plugin.json` → `version` field
- `plugins/{name}/README.md` → version references
- `.claude-plugin/marketplace.json` → update plugin entry version
- Root `README.md` → plugin version references (if present)

**Variants Scope:**
- `variants/variants.json` → `metadata.version` field
- `variants/variants.json` → update individual variant versions
- Root `README.md` → variants version references

### 2. Update JSON Files

For each JSON file:
1. Read and parse JSON
2. Update version field(s):
   - Marketplace: `version` at root level
   - Plugin: `version` at root level
   - Variants: `metadata.version` and optionally `variants[].version`
3. Format JSON with 2-space indentation
4. Write back to file

**Example for plugin.json:**
```json
{
  "name": "daily-carry",
  "version": "1.2.0",  ← updated
  "description": "..."
}
```

### 3. Update Markdown Files

For each markdown file:
1. Read file contents
2. Replace version strings using context-aware patterns:
   - Version badges: `![Version](https://img.shields.io/badge/version-1.1.0-blue)` → `1.2.0`
   - Installation commands: `v1.1.0` → `v1.2.0`
   - Plugin listings: `daily-carry (v1.1.0)` → `daily-carry (v1.2.0)`
   - Git tags: `daily-carry-v1.1.0` → `daily-carry-v1.2.0`
3. Be conservative: only replace in version-specific contexts (not arbitrary strings)
4. Write back to file

**Search patterns:**
- `version-{old-version}` → `version-{new-version}`
- `v{old-version}` → `v{new-version}` (when followed by space, `)`, or end of line)
- `{plugin-name} (v{old-version})` → `{plugin-name} (v{new-version})`

### 4. Special Case: Marketplace.json Plugin Entries

When updating a plugin, also update its entry in marketplace.json:

```json
{
  "plugins": [
    {
      "name": "daily-carry",
      "version": "1.2.0",  ← updated
      "description": "...",
      "source": "./plugins/daily-carry"
    }
  ]
}
```

### 5. Verify Updates

After all updates:
1. Re-read each modified file
2. Verify new version appears and old version is removed
3. Check JSON is valid (can be parsed)
4. Generate git diff to show changes

## Output Format

Return:

```
{
  "files_updated": [
    "plugins/daily-carry/.claude-plugin/plugin.json",
    "plugins/daily-carry/README.md",
    ".claude-plugin/marketplace.json",
    "README.md"
  ],
  "changes": {
    "plugins/daily-carry/.claude-plugin/plugin.json": {
      "field": "version",
      "old_value": "1.1.0",
      "new_value": "1.2.0"
    },
    ".claude-plugin/marketplace.json": {
      "field": "plugins[0].version",
      "old_value": "1.1.0",
      "new_value": "1.2.0"
    }
  },
  "warnings": [
    "Could not find version reference in README.md"
  ],
  "git_diff": "diff --git a/plugins/daily-carry/.claude-plugin/plugin.json..."
}
```

## Examples

### Example 1: Plugin Release

**Input:**
- Scope: `plugin:daily-carry`
- Old version: `1.1.0`
- New version: `1.2.0`

**Files Updated:**
1. `plugins/daily-carry/.claude-plugin/plugin.json`
   - Changed `"version": "1.1.0"` → `"version": "1.2.0"`

2. `plugins/daily-carry/README.md`
   - Changed `daily-carry (v1.1.0)` → `daily-carry (v1.2.0)`

3. `.claude-plugin/marketplace.json`
   - Changed plugin entry `"version": "1.1.0"` → `"version": "1.2.0"`

4. Root `README.md` (if plugin listed)
   - Changed `daily-carry v1.1.0` → `daily-carry v1.2.0`

**Output:**
```
{
  "files_updated": [
    "plugins/daily-carry/.claude-plugin/plugin.json",
    "plugins/daily-carry/README.md",
    ".claude-plugin/marketplace.json",
    "README.md"
  ],
  "changes": {
    "plugins/daily-carry/.claude-plugin/plugin.json": {
      "field": "version",
      "old_value": "1.1.0",
      "new_value": "1.2.0"
    }
  },
  "warnings": [],
  "git_diff": "..."
}
```

### Example 2: Marketplace Release

**Input:**
- Scope: `marketplace`
- Old version: `1.0.0`
- New version: `1.1.0`

**Files Updated:**
1. `.claude-plugin/marketplace.json`
   - Changed `"version": "1.0.0"` → `"version": "1.1.0"`

2. Root `README.md`
   - Changed version badge or references

### Example 3: Variants Release

**Input:**
- Scope: `variants`
- Old version: `1.1.0`
- New version: `2.0.0`

**Files Updated:**
1. `variants/variants.json`
   - Changed `"metadata": { "version": "1.1.0" }` → `"version": "2.0.0"`
   - Optionally update individual variant versions

2. Root `README.md`
   - Changed `Variants v1.1.0` → `Variants v2.0.0`

## Error Handling

- **File not found**: Return warning (non-blocking) if expected file doesn't exist
- **JSON parse error**: Return error (blocking) if JSON file is malformed
- **Write permission error**: Return error (blocking) if file cannot be written
- **No changes made**: Return warning if no version strings were found to update
- **Partial updates**: If some files update successfully and others fail, return partial success with errors

## Integration Notes

This skill is invoked by the `/release` command in Phase 4. The command will:
1. Display git diff of all changes
2. Allow user to review before proceeding
3. Stage all modified files for commit in Phase 6

## Conservative Update Strategy

To avoid unintended replacements:
- Only update version strings in known contexts (JSON fields, version badges, plugin listings)
- Do NOT replace arbitrary occurrences of version numbers in prose
- Verify each file can be parsed/read after update
- Generate detailed diff for user review
