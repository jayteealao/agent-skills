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
    ERRORS+=("Missing 'type' field in frontmatter. Expected values: index, intake, shape, slice, plan, implement, verify, review, handoff, ship, ship-run, ship-runs-index, retro, design, design-brief, critique, audit, sync-report, resume, skip, amendment, simplify-run.")
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
# Soft check (warn-only): global INDEX.md registry drift
# Added in v9.10.0 alongside the no-flag positional slug detection on
# /wf-quick. Only fires for 00-index.md writes — those are the writes
# that mutate the per-workflow status/branch/type/updated-at fields
# mirrored into .ai/workflows/INDEX.md. Non-blocking by design (the
# user opted into warn-only enforcement for this drift class); the
# canonical reconciler is /wf-meta sync.
# -------------------------------------------------------------------

WARNINGS=()

if [ "$FILENAME" = "00-index.md" ]; then
  # Derive the .ai/workflows/INDEX.md path from the file_path
  # FILE_PATH is .../<repo>/.ai/workflows/<slug>/00-index.md, so the
  # registry is the sibling of <slug>/.
  WORKFLOWS_ROOT=$(echo "$FILE_PATH" | sed -n 's|\(.*/.ai/workflows\)/[^/]*/.*|\1|p')
  if [ -n "$WORKFLOWS_ROOT" ]; then
    REGISTRY="$WORKFLOWS_ROOT/INDEX.md"
    if [ ! -f "$REGISTRY" ]; then
      WARNINGS+=("Global workflow registry .ai/workflows/INDEX.md is missing. Run /wf-meta sync once to bootstrap it — this enables /wf-quick positional slug detection (the no-flag way to attach a compressed slice to '$WORKFLOW_DIR').")
    elif ! grep -Pq "^${WORKFLOW_DIR}\t" "$REGISTRY" 2>/dev/null; then
      WARNINGS+=("Slug '$WORKFLOW_DIR' has no row in .ai/workflows/INDEX.md. Run /wf-meta sync to register it — until then, '/wf-quick <sub> $WORKFLOW_DIR ...' falls through to standalone mode instead of attaching as a compressed slice.")
    fi
    # Note: we do NOT diff frontmatter status/branch against the
    # registry row here. Stage transitions land mid-flight all the
    # time; warning on every transition would be noise. /wf-meta sync
    # is the reconciler.
  fi
fi

# -------------------------------------------------------------------
# Report results
# -------------------------------------------------------------------

if [ ${#ERRORS[@]} -eq 0 ]; then
  if [ ${#WARNINGS[@]} -gt 0 ]; then
    # Emit non-blocking advisory via systemMessage (exit 0, allows write)
    WARN_MSG="wf-validate: write to $FILENAME allowed. Advisory:"
    for i in "${!WARNINGS[@]}"; do
      WARN_MSG+=" ${WARNINGS[$i]}"
    done
    # JSON-escape: wrap in jq if available, else best-effort sed
    if command -v jq &>/dev/null; then
      printf '%s' "$WARN_MSG" | jq -Rs '{systemMessage: .}'
    else
      ESCAPED=$(printf '%s' "$WARN_MSG" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g; s/\r//g' | tr '\n' ' ')
      printf '{"systemMessage": "%s"}\n' "$ESCAPED"
    fi
  fi
  # All checks passed (errors clean; warnings, if any, were surfaced)
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
