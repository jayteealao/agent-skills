---
name: changelog-audit
description: Pre-release verification of changelog entries for all external contributor PRs. Use when preparing a release or user asks to "audit changelog" or "verify changelog entries".
---

# Pre-Release Changelog Audit Skill

Before releasing, audit all PRs since the last release to ensure proper changelog attribution.

## Workflow

### 1. Get the Last Release Tag

```bash
git describe --tags --abbrev=0
```

Example output: `v0.34.0`

### 2. List All Merged PRs Since That Tag

Exclude maintainer PRs (filter by author):

```bash
git log v0.34.0..HEAD --merges --pretty=format:"%h %s %an" | grep -v "<MAINTAINER_NAME>"
```

### 3. For Each External PR

Check if it has a changelog entry:

1. Read the PR diff to understand changes
2. Check `packages/*/CHANGELOG.md` for `[Unreleased]` section
3. Look for entry with PR number and author attribution

Required format:
```markdown
- Feature description ([#123](url) by [@username](url))
```

### 4. Report Missing Entries

Output format:

| PR | Author | Description | Package | Changelog Status |
|----|--------|-------------|---------|------------------|
| #123 | @contributor | Add feature X | coding-agent | ✅ Present |
| #456 | @contributor2 | Fix bug Y | tui | ❌ MISSING |

### 5. Only Proceed After All Entries Added

Do not release until all external contributions are properly credited in the changelog.

## Example

User: "We're releasing v0.35.0, audit the changelog"

1. Last release: `v0.34.0`
2. Find PRs since v0.34.0
3. External PRs: #789, #801, #823
4. Check changelog:
   - #789: ✅ Found in coding-agent CHANGELOG
   - #801: ❌ Missing from tui CHANGELOG
   - #823: ✅ Found in tui CHANGELOG
5. Report: "PR #801 is missing a changelog entry"
6. Add entry:
   ```markdown
   - Fixed keyboard input handling in Linux ([#801](url) by [@contributor](url))
   ```
7. Verify all entries present
8. Confirm: "All external contributions are now credited in changelog. Ready to release."
