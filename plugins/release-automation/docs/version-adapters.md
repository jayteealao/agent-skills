# Version File Adapters Reference

This document describes how to read and write version numbers from different file formats. Skills should reference these patterns when working with version files.

## Adapter Pattern Overview

Each project type stores version information differently. The skills must detect the file format and use the appropriate reading/writing strategy.

## JSON Adapter

**Use for:** `package.json`, `plugin.json`, `composer.json`, `.claude-plugin/marketplace.json`

### Reading Version

```bash
# Extract version field from JSON
jq -r '.version' package.json

# For nested fields (e.g., Maven package.json)
jq -r '.project.version' package.json
```

### Writing Version

```bash
# Update version field in JSON
jq '.version = "1.3.0"' package.json > tmp.json && mv tmp.json package.json

# With proper formatting (2-space indent)
jq --indent 2 '.version = "1.3.0"' package.json > tmp.json && mv tmp.json package.json
```

### Validation

```bash
# Check if file is valid JSON
jq empty package.json 2>/dev/null && echo "valid" || echo "invalid"

# Check if version field exists
jq -e '.version' package.json >/dev/null 2>&1 && echo "has version" || echo "no version"
```

## TOML Adapter

**Use for:** `pyproject.toml`, `Cargo.toml`, `Pipfile`

### Reading Version

```bash
# Using grep and sed (no TOML parser needed for simple cases)
grep '^version = ' Cargo.toml | sed 's/version = "\(.*\)"/\1/'

# For pyproject.toml with [project] section
grep -A 10 '^\[project\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/'

# For pyproject.toml with [tool.poetry] section
grep -A 10 '^\[tool.poetry\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/'
```

### Writing Version

```bash
# Replace version line in TOML file
sed -i 's/^version = ".*"/version = "1.3.0"/' Cargo.toml

# For section-specific updates (Cargo.toml - update only in [package] section)
sed -i '/^\[package\]/,/^\[/ s/^version = ".*"/version = "1.3.0"/' Cargo.toml
```

### Validation

```bash
# Basic validation: check if version line exists
grep -q '^version = ' Cargo.toml && echo "valid" || echo "invalid"
```

## Python File Adapter

**Use for:** `__version__.py`, `_version.py`, `version.py`

### Reading Version

```bash
# Extract __version__ variable
grep '^__version__ = ' src/mypackage/__version__.py | sed 's/__version__ = "\(.*\)"/\1/'

# Alternative: single quotes
grep "^__version__ = '" src/mypackage/__version__.py | sed "s/__version__ = '\(.*\)'/\1/"
```

### Writing Version

```bash
# Update __version__ variable (double quotes)
sed -i 's/^__version__ = ".*"/__version__ = "1.3.0"/' src/mypackage/__version__.py

# Update __version__ variable (single quotes)
sed -i "s/^__version__ = '.*'/__version__ = '1.3.0'/" src/mypackage/__version__.py
```

### Validation

```bash
# Check if __version__ is defined
grep -q '^__version__ = ' src/mypackage/__version__.py && echo "valid" || echo "invalid"

# Validate Python syntax
python -c "import sys; sys.path.insert(0, 'src'); from mypackage import __version__" 2>/dev/null && echo "valid" || echo "invalid"
```

## Text File Adapter

**Use for:** `VERSION`, `version.txt`, `.version`

### Reading Version

```bash
# Read entire file (version string only)
cat VERSION

# Trim whitespace
cat VERSION | tr -d '[:space:]'
```

### Writing Version

```bash
# Write version to file
echo "1.3.0" > VERSION
```

### Validation

```bash
# Check if file exists and is not empty
[ -s VERSION ] && echo "valid" || echo "invalid"

# Validate semver format
cat VERSION | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' && echo "valid semver" || echo "invalid"
```

## Gradle Adapter

**Use for:** `build.gradle`, `gradle.properties`

### Reading Version (gradle.properties)

```bash
# Extract version property
grep '^version=' gradle.properties | cut -d'=' -f2
```

### Reading Version (build.gradle)

```bash
# Extract version from Groovy syntax
grep "^version = " build.gradle | sed "s/version = '\(.*\)'/\1/"

# Alternative: double quotes
grep '^version = "' build.gradle | sed 's/version = "\(.*\)"/\1/'
```

### Writing Version (gradle.properties)

```bash
# Update version property
sed -i 's/^version=.*/version=1.3.0/' gradle.properties
```

### Writing Version (build.gradle)

```bash
# Update version line (single quotes)
sed -i "s/^version = '.*'/version = '1.3.0'/" build.gradle

# Update version line (double quotes)
sed -i 's/^version = ".*"/version = "1.3.0"/' build.gradle
```

## Maven/POM Adapter

**Use for:** `pom.xml`

### Reading Version

```bash
# Extract version from XML (using grep and sed)
grep '<version>' pom.xml | head -1 | sed 's/.*<version>\(.*\)<\/version>.*/\1/'

# More robust: using xmllint (if available)
xmllint --xpath '/project/version/text()' pom.xml 2>/dev/null
```

### Writing Version

```bash
# Replace first occurrence of <version>
sed -i '0,/<version>.*<\/version>/s//<version>1.3.0<\/version>/' pom.xml
```

### Validation

```bash
# Check if XML is well-formed
xmllint --noout pom.xml 2>/dev/null && echo "valid" || echo "invalid"
```

## Go Module Adapter

**Use for:** `go.mod`

**Note:** Go projects typically don't store version numbers in `go.mod`. Versions are managed entirely through git tags.

### Reading Version

```bash
# Read from latest git tag
git describe --tags --abbrev=0 2>/dev/null || echo "no tags"

# Get version from tag (strip 'v' prefix if present)
git describe --tags --abbrev=0 | sed 's/^v//'
```

### Writing Version

For Go projects, version is set via git tag only (no file update needed).

### Validation

```bash
# Check if go.mod exists and is valid
go mod verify 2>/dev/null && echo "valid" || echo "invalid"
```

## Setup.py Adapter (Legacy Python)

**Use for:** `setup.py`

### Reading Version

```bash
# Extract version argument from setup() call
grep 'version=' setup.py | sed 's/.*version=["'\'']\(.*\)["'\''].*/\1/'
```

### Writing Version

```bash
# Update version argument (single quotes)
sed -i "s/version='.*'/version='1.3.0'/" setup.py

# Update version argument (double quotes)
sed -i 's/version=".*"/version="1.3.0"/' setup.py
```

## Adapter Selection Logic

Skills should use this logic to determine which adapter to use:

1. **Check for configuration file** (`.release-config.json`)
   - If `versionFiles` specified, use those files
   - Each file determines its adapter based on extension/format

2. **Auto-detect project type:**

   ```
   if [ -f "package.json" ]; then
     adapter="json"
     file="package.json"
     field="version"
   elif [ -f "Cargo.toml" ]; then
     adapter="toml"
     file="Cargo.toml"
     section="package"
   elif [ -f "pyproject.toml" ]; then
     adapter="toml"
     file="pyproject.toml"
     section="project" or "tool.poetry"
   elif [ -f "setup.py" ]; then
     adapter="setuppy"
     file="setup.py"
   elif [ -f "go.mod" ]; then
     adapter="go"
     # Version via git tags only
   elif [ -f "build.gradle" ]; then
     adapter="gradle"
     file="build.gradle"
   elif [ -f "gradle.properties" ]; then
     adapter="gradle"
     file="gradle.properties"
   elif [ -f "pom.xml" ]; then
     adapter="maven"
     file="pom.xml"
   elif [ -f "VERSION" ]; then
     adapter="text"
     file="VERSION"
   elif [ -f ".claude-plugin/plugin.json" ]; then
     adapter="json"
     file=".claude-plugin/plugin.json"
     field="version"
   else
     # Unknown project type
     adapter="unknown"
   fi
   ```

3. **Multiple version files:**
   - Projects may have multiple version files (e.g., `pyproject.toml` + `src/__version__.py`)
   - Update all files to keep them in sync
   - Primary file is the first one detected

## Error Handling

For each adapter operation:

- **Read errors:** Return error if file doesn't exist or version not found
- **Write errors:** Validate before writing, backup file if possible
- **Validation errors:** Return specific error (invalid JSON, missing field, etc.)

## Example: Multi-File Version Update

For a Python project with both `pyproject.toml` and `__version__.py`:

```bash
# Read current version from primary file
current_version=$(grep -A 10 '^\[project\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/')

# Update pyproject.toml
sed -i '/^\[project\]/,/^\[/ s/^version = ".*"/version = "1.3.0"/' pyproject.toml

# Update __version__.py
sed -i 's/^__version__ = ".*"/__version__ = "1.3.0"/' src/mypackage/__version__.py

# Verify both files updated
new_version_toml=$(grep -A 10 '^\[project\]' pyproject.toml | grep '^version = ' | sed 's/version = "\(.*\)"/\1/')
new_version_py=$(grep '^__version__ = ' src/mypackage/__version__.py | sed 's/__version__ = "\(.*\)"/\1/')

if [ "$new_version_toml" = "$new_version_py" ]; then
  echo "✓ Both files updated to $new_version_toml"
else
  echo "✗ Version mismatch: $new_version_toml != $new_version_py"
fi
```

## Windows Compatibility

For Windows/Git Bash environments:

- Use `sed` without `-i` flag, redirect to temp file:
  ```bash
  sed 's/version = ".*"/version = "1.3.0"/' Cargo.toml > tmp && mv tmp Cargo.toml
  ```
- Use forward slashes in paths
- Use `cat` instead of `xmllint` for XML if not available

## Skills Reference

Skills that use these adapters:
- **detect-project-type** - Detects which adapter to use
- **version-bump** - Reads current version, writes new version
- **documentation-sync** - Updates version references in docs
- **pre-release-validation** - Validates version file format
