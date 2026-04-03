#!/usr/bin/env bash
# auto-stage.sh — PostToolUse hook for sdlc-workflow
# After every Write/Edit, stages the file if there's an active workflow
# in the implement stage with branch-strategy dedicated or shared.
#
# Requires: yq, jq, git
#
# This hook is naturally inactive when no workflow is in implement stage.
# Opt out by creating .ai/.no-auto-stage in the project root.
#
# Exit 0 always — never block file writes.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
WORKFLOWS_DIR="$PROJECT_DIR/.ai/workflows"

# Fast bail-outs (ordered by cost: cheapest checks first)

# Opt-out flag
if [ -f "$PROJECT_DIR/.ai/.no-auto-stage" ]; then
  exit 0
fi

# No workflows dir
if [ ! -d "$WORKFLOWS_DIR" ]; then
  exit 0
fi

# Need yq, jq, and git
if ! command -v yq &>/dev/null || ! command -v jq &>/dev/null || ! command -v git &>/dev/null; then
  exit 0
fi

# Read the file path from stdin (PostToolUse sends tool_input as JSON)
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || true

# No file path — nothing to stage
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Don't stage workflow artifact files themselves — those are managed by the commit step
case "$FILE_PATH" in
  */.ai/workflows/*) exit 0 ;;
esac

# Find an active workflow in implement stage with branch-strategy dedicated or shared
FOUND=false
while IFS= read -r -d '' index_file; do
  status=$(yq '.status // ""' "$index_file" 2>/dev/null) || continue
  stage=$(yq '."current-stage" // ""' "$index_file" 2>/dev/null) || continue
  strategy=$(yq '."branch-strategy" // ""' "$index_file" 2>/dev/null) || continue

  # Must be active + implement stage + dedicated or shared
  case "$status" in
    complete|completed|abandoned|cancelled) continue ;;
  esac
  [ "$stage" != "implement" ] && continue
  [ "$strategy" != "dedicated" ] && [ "$strategy" != "shared" ] && continue

  FOUND=true
  break
done < <(find "$WORKFLOWS_DIR" -maxdepth 2 -name "00-index.md" -print0 2>/dev/null)

if [ "$FOUND" != "true" ]; then
  exit 0
fi

# Stage the file (best effort — don't fail if git add fails)
git -C "$PROJECT_DIR" add "$FILE_PATH" 2>/dev/null || true

exit 0
