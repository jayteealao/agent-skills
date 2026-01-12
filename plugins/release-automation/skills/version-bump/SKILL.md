---
name: version-bump
description: Calculate semantic version bumps for any project type using version file adapters
user-invocable: false
---

# Version Bump

## Purpose

Reads the current version from any project type (Node.js, Python, Rust, Go, Java, generic, Claude Code plugins), analyzes git commits since the last release tag, and calculates the appropriate semantic version bump (major/minor/patch) based on conventional commit patterns. Supports multiple version files kept in sync.

## Input Context

Requires:
- **Project Configuration**: Output from `detect-project-type` skill
- **Version Type** (optional): "major", "minor", "patch", or "auto" (default)

## Workflow

### 1. Load Project Configuration

Use configuration from `detect-project-type`:
- Project type
- Version file paths and adapters
- Tag pattern
- Conventional commits enabled/disabled

### 2. Read Current Version

Use the appropriate version adapter for each version file.

See [Version Adapters Reference](../../docs/version-adapters.md) for adapter implementations.

**For JSON files (package.json, plugin.json):**
```bash
current_version=$(jq -r '.version' package.json)
```

**For TOML files (Cargo.toml, pyproject.toml):**
```bash
# Cargo.toml
current_version=$(grep '^version = ' Cargo.toml | sed 's/version = "\(.*\)"/\1/')

# pyproject.toml [project] section
current_version=$(grep -A 10 '^\[project\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/')

# pyproject.toml [tool.poetry] section
current_version=$(grep -A 10 '^\[tool.poetry\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/')
```

**For Python __version__.py files:**
```bash
current_version=$(grep '^__version__ = ' src/mypackage/__version__.py | sed 's/__version__ = "\(.*\)"/\1/')
```

**For text files (VERSION, version.txt):**
```bash
current_version=$(cat VERSION | tr -d '[:space:]')
```

**For Gradle files:**
```bash
# gradle.properties
current_version=$(grep '^version=' gradle.properties | cut -d'=' -f2)

# build.gradle
current_version=$(grep "^version = " build.gradle | sed "s/version = '\(.*\)'/\1/")
```

**For Maven pom.xml:**
```bash
current_version=$(grep '<version>' pom.xml | head -1 | sed 's/.*<version>\(.*\)<\/version>.*/\1/')
```

**For Go projects (git tags only):**
```bash
current_version=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "0.0.0")
```

**For multiple version files:**
- Read from primary file (first in list)
- Verify all files have same version (if not, warn user)

```bash
primary_version=$(jq -r '.version' package.json)
secondary_version=$(grep '^__version__ = ' src/mypackage/__version__.py | sed 's/__version__ = "\(.*\)"/\1/')

if [ "$primary_version" != "$secondary_version" ]; then
  echo "⚠️  Version mismatch: package.json ($primary_version) != __version__.py ($secondary_version)"
  echo "Using primary version: $primary_version"
fi

current_version="$primary_version"
```

### 3. Find Last Release Tag

Use tag pattern from configuration:

```bash
# Get tag pattern from config (e.g., "v{version}", "{package}-v{version}")
tag_pattern="v{version}"  # from config

# Convert pattern to grep pattern
# v{version} → v*
# {package}-v{version} → {package}-v*

# For standard v{version} pattern
git tag -l "v*" --sort=-version:refname | head -n 1

# For plugin pattern: my-plugin-v{version}
git tag -l "my-plugin-v*" --sort=-version:refname | head -n 1

# For monorepo pattern: {package}-v{version}
package_name="my-lib"
git tag -l "${package_name}-v*" --sort=-version:refname | head -n 1
```

If no tag exists:
- This is likely the first release
- Use current version from file as baseline
- Return bump type as "none" (initial release)

### 4. Analyze Commits Since Last Release

Get commits between last tag and HEAD:

```bash
if [ -n "$last_tag" ]; then
  # Commits since last tag
  git log ${last_tag}..HEAD --oneline --no-merges
else
  # All commits (first release)
  git log --oneline --no-merges
fi
```

### 5. Parse Conventional Commits

If `conventional_commits` is enabled (default: true), parse commit messages:

**Major Bump Indicators:**
- Commit body contains `BREAKING CHANGE:` or `BREAKING-CHANGE:`
- Commit type followed by `!` (e.g., `feat!:`, `fix!:`, `refactor!:`)

**Minor Bump Indicators:**
- Commit type `feat:` or `feat(scope):`

**Patch Bump Indicators:**
- Commit type `fix:` or `fix(scope):`
- Other conventional types: `chore:`, `docs:`, `style:`, `refactor:`, `test:`, `perf:`

```bash
breaking_count=0
feat_count=0
fix_count=0

while IFS= read -r commit; do
  # Extract commit message
  message=$(echo "$commit" | cut -d' ' -f2-)

  # Check for breaking changes
  if echo "$message" | grep -qE "(BREAKING[- ]CHANGE:|^[a-z]+!:)"; then
    ((breaking_count++))
  fi

  # Check for features
  if echo "$message" | grep -qE "^feat(\(.+\))?:"; then
    ((feat_count++))
  fi

  # Check for fixes
  if echo "$message" | grep -qE "^fix(\(.+\))?:"; then
    ((fix_count++))
  fi
done < <(git log ${last_tag}..HEAD --oneline --no-merges)
```

If `conventional_commits` is disabled:
- All commits → patch bump (unless explicit version type provided)

### 6. Determine Bump Type

Apply precedence rules:

```bash
if [ -n "$explicit_version_type" ] && [ "$explicit_version_type" != "auto" ]; then
  # User explicitly specified version type
  bump_type="$explicit_version_type"
elif [ $breaking_count -gt 0 ]; then
  bump_type="major"
elif [ $feat_count -gt 0 ]; then
  bump_type="minor"
elif [ $fix_count -gt 0 ]; then
  bump_type="patch"
else
  # No conventional commits, default to patch
  bump_type="patch"
fi
```

**Special case: Initial release (no last tag):**
- If current version is 0.x.x, treat as pre-1.0 (no bump needed)
- If current version is 1.0.0+, use as-is
- Otherwise, default to 1.0.0

### 7. Calculate New Version

Parse current version and increment:

```bash
# Parse semantic version X.Y.Z
IFS='.' read -r major minor patch <<< "$current_version"

# Remove any pre-release or build metadata (-alpha, +build, etc.)
patch=$(echo "$patch" | sed 's/[^0-9].*//')

# Calculate new version based on bump type
case "$bump_type" in
  "major")
    new_major=$((major + 1))
    new_version="${new_major}.0.0"
    ;;
  "minor")
    new_minor=$((minor + 1))
    new_version="${major}.${new_minor}.0"
    ;;
  "patch")
    new_patch=$((patch + 1))
    new_version="${major}.${minor}.${new_patch}"
    ;;
  "none")
    new_version="$current_version"
    ;;
esac
```

### 8. Generate Reasoning

Create human-readable explanation:

```bash
reasoning=()

if [ $breaking_count -gt 0 ]; then
  reasoning+=("$breaking_count breaking change(s) detected → major bump")
fi

if [ $feat_count -gt 0 ]; then
  reasoning+=("$feat_count feature(s) added → minor bump")
fi

if [ $fix_count -gt 0 ]; then
  reasoning+=("$fix_count fix(es) applied → patch bump")
fi

if [ ${#reasoning[@]} -eq 0 ]; then
  reasoning+=("No conventional commits found → patch bump (default)")
fi
```

## Output Format

Return:

```json
{
  "current_version": "1.2.3",
  "new_version": "1.3.0",
  "bump_type": "minor",
  "reasoning": [
    "2 feature(s) added → minor bump",
    "1 fix(es) applied → patch bump",
    "Minor bump takes precedence"
  ],
  "last_tag": "v1.2.3",
  "commits_analyzed": 5,
  "version_files": [
    {
      "path": "package.json",
      "current": "1.2.3",
      "new": "1.3.0",
      "adapter": "json"
    }
  ],
  "commit_examples": [
    "feat: add new deployment command",
    "fix: correct version detection",
    "docs: update README"
  ]
}
```

## Examples

### Example 1: Node.js Project - Minor Bump

**Input:**
- Project type: `nodejs`
- Version file: `package.json` (current: `1.1.0`)
- Last tag: `v1.1.0`

**Commits since v1.1.0:**
```
feat: add new API endpoint
fix: handle edge case in parser
docs: update installation guide
```

**Output:**
```json
{
  "current_version": "1.1.0",
  "new_version": "1.2.0",
  "bump_type": "minor",
  "reasoning": [
    "1 feature(s) added → minor bump",
    "1 fix(es) applied → patch bump",
    "Minor bump takes precedence"
  ],
  "last_tag": "v1.1.0",
  "commits_analyzed": 3,
  "version_files": [
    {
      "path": "package.json",
      "current": "1.1.0",
      "new": "1.2.0",
      "adapter": "json"
    }
  ]
}
```

### Example 2: Python Project - Major Bump with Multiple Version Files

**Input:**
- Project type: `python`
- Version files:
  - `pyproject.toml` (current: `2.1.0`)
  - `src/mypackage/__version__.py` (current: `2.1.0`)
- Last tag: `v2.1.0`

**Commits:**
```
feat!: redesign API interface
BREAKING CHANGE: removed legacy methods
```

**Output:**
```json
{
  "current_version": "2.1.0",
  "new_version": "3.0.0",
  "bump_type": "major",
  "reasoning": [
    "1 breaking change(s) detected → major bump"
  ],
  "last_tag": "v2.1.0",
  "commits_analyzed": 1,
  "version_files": [
    {
      "path": "pyproject.toml",
      "current": "2.1.0",
      "new": "3.0.0",
      "adapter": "toml"
    },
    {
      "path": "src/mypackage/__version__.py",
      "current": "2.1.0",
      "new": "3.0.0",
      "adapter": "python-file"
    }
  ]
}
```

### Example 3: Rust Project - Patch Bump

**Input:**
- Project type: `rust`
- Version file: `Cargo.toml` (current: `0.3.1`)
- Last tag: `v0.3.1`

**Commits:**
```
fix: correct memory leak in parser
test: add unit tests for edge cases
```

**Output:**
```json
{
  "current_version": "0.3.1",
  "new_version": "0.3.2",
  "bump_type": "patch",
  "reasoning": [
    "1 fix(es) applied → patch bump"
  ],
  "last_tag": "v0.3.1",
  "commits_analyzed": 2
}
```

### Example 4: Go Project - First Release

**Input:**
- Project type: `go`
- Version via tags: (no tags exist)
- Version from go.mod: N/A

**Output:**
```json
{
  "current_version": "0.0.0",
  "new_version": "1.0.0",
  "bump_type": "initial",
  "reasoning": [
    "No previous tags found → first release",
    "Defaulting to v1.0.0"
  ],
  "last_tag": null,
  "commits_analyzed": 15
}
```

### Example 5: Explicit Version Type Override

**Input:**
- Project type: `nodejs`
- Current version: `1.5.0`
- Version type: `major` (explicit)

**Output:**
```json
{
  "current_version": "1.5.0",
  "new_version": "2.0.0",
  "bump_type": "major",
  "reasoning": [
    "Explicit major bump requested by user"
  ],
  "last_tag": "v1.5.0",
  "commits_analyzed": 8
}
```

### Example 6: Version Mismatch Warning

**Input:**
- Version files:
  - `package.json`: `1.2.0`
  - `src/version.ts`: `1.1.9`

**Output:**
```json
{
  "current_version": "1.2.0",
  "new_version": "1.3.0",
  "bump_type": "minor",
  "warnings": [
    "Version mismatch detected:",
    "  package.json: 1.2.0",
    "  src/version.ts: 1.1.9",
    "Using primary version: 1.2.0",
    "Both files will be updated to: 1.3.0"
  ]
}
```

## Error Handling

**Invalid version format:**
```json
{
  "error": "Invalid version format in package.json: 'v1.2.3'",
  "suggestion": "Version must be X.Y.Z format (e.g., 1.2.3)"
}
```

**No version file found:**
```json
{
  "error": "Could not read version from package.json",
  "suggestion": "Ensure file exists and contains 'version' field"
}
```

**Git errors:**
```json
{
  "error": "Git log failed: not a git repository",
  "suggestion": "Run 'git init' to initialize repository"
}
```

## Integration Notes

This skill is invoked by the `/release` command in Phase 2. The command will:
1. Display calculated version bump with reasoning
2. Prompt user to confirm or provide custom version
3. Use confirmed version for remaining phases
4. Update all version files in Phase 4 (documentation-sync skill)

## Reference Documentation

- [Version Adapters Reference](../../docs/version-adapters.md) - Adapter implementations
- [Configuration Reference](../../docs/configuration.md) - Conventional commits settings
