#!/usr/bin/env bash
# validate-workflow-write.sh — PreToolUse hook for sdlc-workflow
# Validates writes to .ai/workflows/ files before they happen.
#
# Checks:
# 1. Slug stability — slug in frontmatter matches directory name
# 2. Required fields — YAML frontmatter has all mandatory fields
# 3. Stage file naming — follows NN-stagename.md convention
# 4. Schema version — uses sdlc/v1
#
# Exit 0 with JSON → allow (with optional systemMessage)
# Exit 2 with JSON on stderr → block the write
#
# Requires: yq (preferred), or grep-based fallback

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || true
CONTENT=$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null) || true

# -------------------------------------------------------------------
# Fast bail-outs
# -------------------------------------------------------------------

# No file path — nothing to validate
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only validate writes to .ai/workflows/ files
case "$FILE_PATH" in
  */.ai/workflows/*.md) ;; # continue validation
  */.ai/workflows/*/*.md) ;; # continue validation
  *) exit 0 ;; # not a workflow file, allow
esac

# No content to validate (e.g., Edit tool which sends old_string/new_string)
# Edit operations are harder to validate pre-write; let them through
if [ -z "$CONTENT" ]; then
  exit 0
fi

# -------------------------------------------------------------------
# Extract file metadata
# -------------------------------------------------------------------

# Get the directory name (slug) from the path
# Pattern: .ai/workflows/<slug>/<filename>.md
WORKFLOW_DIR=$(echo "$FILE_PATH" | sed -n 's|.*/.ai/workflows/\([^/]*\)/.*|\1|p')
FILENAME=$(basename "$FILE_PATH")

# If we can't parse the path structure, allow but warn
if [ -z "$WORKFLOW_DIR" ]; then
  echo '{"systemMessage": "Could not parse workflow directory from path. Skipping validation."}'
  exit 0
fi

# -------------------------------------------------------------------
# Validation functions
# -------------------------------------------------------------------

ERRORS=()

# Check 1: Stage file naming convention
# Valid patterns: 00-index.md, 01-intake.md, 02-shape.md, etc.
# Also valid: 00-sync.md, 90-resume.md, 02b-design.md
# Also valid: per-slice files like 04-plan-slice-name.md
validate_filename() {
  case "$FILENAME" in
    [0-9][0-9]-*.md) ;; # standard: 01-intake.md
    [0-9][0-9][a-z]-*.md) ;; # substage: 02b-design.md
    risk-register.md) ;; # special utility files
    estimate.md) ;;
    announce.md) ;;
    *) ERRORS+=("Filename '$FILENAME' does not follow the NN-stagename.md convention (e.g., 01-intake.md, 04-plan.md). Use two-digit prefix + hyphen + name.") ;;
  esac
}

# Check 2: Required YAML frontmatter fields
validate_frontmatter() {
  # Check if content has YAML frontmatter
  if ! echo "$CONTENT" | head -1 | grep -q '^---$'; then
    ERRORS+=("Missing YAML frontmatter. All workflow files must start with --- delimited YAML frontmatter containing at minimum: schema, type, slug.")
    return
  fi

  # Extract frontmatter (between first and second ---)
  FRONTMATTER=$(echo "$CONTENT" | sed -n '/^---$/,/^---$/p' | sed '1d;$d')

  if [ -z "$FRONTMATTER" ]; then
    ERRORS+=("Empty YAML frontmatter. Required fields: schema, type, slug.")
    return
  fi

  # Check required fields using yq if available, otherwise grep
  if command -v yq &>/dev/null; then
    SCHEMA=$(echo "$FRONTMATTER" | yq '.schema // ""' 2>/dev/null) || SCHEMA=""
    TYPE=$(echo "$FRONTMATTER" | yq '.type // ""' 2>/dev/null) || TYPE=""
    SLUG=$(echo "$FRONTMATTER" | yq '.slug // ""' 2>/dev/null) || SLUG=""
  else
    # grep fallback
    SCHEMA=$(echo "$FRONTMATTER" | grep -oP '^schema:\s*\K.*' | tr -d ' "'"'" 2>/dev/null) || SCHEMA=""
    TYPE=$(echo "$FRONTMATTER" | grep -oP '^type:\s*\K.*' | tr -d ' "'"'" 2>/dev/null) || TYPE=""
    SLUG=$(echo "$FRONTMATTER" | grep -oP '^slug:\s*\K.*' | tr -d ' "'"'" 2>/dev/null) || SLUG=""
  fi

  # Check schema version
  if [ -z "$SCHEMA" ]; then
    ERRORS+=("Missing 'schema' field in frontmatter. Must be 'sdlc/v1'.")
  elif [ "$SCHEMA" != "sdlc/v1" ]; then
    ERRORS+=("Invalid schema '$SCHEMA'. Must be 'sdlc/v1'.")
  fi

  # Check type
  if [ -z "$TYPE" ]; then
    ERRORS+=("Missing 'type' field in frontmatter. Expected values: index, intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, design, design-brief, critique, audit, sync-report, resume, skip, amendment.")
  fi

  # Check slug
  if [ -z "$SLUG" ]; then
    ERRORS+=("Missing 'slug' field in frontmatter.")
  fi

  # Check 3: Slug stability — frontmatter slug must match directory name
  if [ -n "$SLUG" ] && [ "$SLUG" != "$WORKFLOW_DIR" ]; then
    ERRORS+=("Slug mismatch: frontmatter slug '$SLUG' does not match workflow directory '$WORKFLOW_DIR'. The slug must remain stable across all files in a workflow.")
  fi
}

# -------------------------------------------------------------------
# Run validations
# -------------------------------------------------------------------

validate_filename
validate_frontmatter

# -------------------------------------------------------------------
# Report results
# -------------------------------------------------------------------

if [ ${#ERRORS[@]} -eq 0 ]; then
  # All checks passed
  exit 0
else
  # Build error message
  ERROR_MSG="wf-validate: blocked write to $FILENAME in workflow '$WORKFLOW_DIR'. Errors:\n"
  for i in "${!ERRORS[@]}"; do
    ERROR_MSG+="  $((i+1)). ${ERRORS[$i]}\n"
  done
  ERROR_MSG+="\nFix these issues and retry the write."

  # Output to stderr for exit code 2 (blocking error fed back to Claude)
  echo -e "$ERROR_MSG" >&2
  exit 2
fi
