#!/usr/bin/env bash
# workflow-discovery.sh — SessionStart hook for sdlc-workflow
# Scans .ai/workflows/*/00-index.md for active workflows and outputs
# a systemMessage with a compact summary for Claude's context.
#
# Requires: yq (https://github.com/mikefarah/yq/)
#
# Exit 0 with no output if no active workflows found (silent).
# Exit 0 with JSON { "systemMessage": "..." } if active workflows found.

set -euo pipefail

# Resolve project directory — prefer CLAUDE_PROJECT_DIR, fall back to cwd
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
WORKFLOWS_DIR="$PROJECT_DIR/.ai/workflows"

# Exit silently if no workflows directory
if [ ! -d "$WORKFLOWS_DIR" ]; then
  exit 0
fi

# Exit silently if yq is not available
if ! command -v yq &>/dev/null; then
  exit 0
fi

# Find all index files
INDEX_FILES=()
while IFS= read -r -d '' f; do
  INDEX_FILES+=("$f")
done < <(find "$WORKFLOWS_DIR" -maxdepth 2 -name "00-index.md" -print0 2>/dev/null)

# Exit silently if no index files
if [ ${#INDEX_FILES[@]} -eq 0 ]; then
  exit 0
fi

# Parse a YAML frontmatter field from a file using yq.
# Usage: get_field "file" "field-name"
# Returns the value or empty string. Handles quoted values, nulls, and missing fields.
get_field() {
  local file="$1"
  local field="$2"
  local val
  # yq reads the first YAML document (frontmatter between --- markers)
  val=$(yq ".\"${field}\" // \"\"" "$file" 2>/dev/null) || val=""
  # Strip "null" that yq returns for missing fields
  [ "$val" = "null" ] && val=""
  echo "$val"
}

# Get current git branch (best effort)
CURRENT_BRANCH=""
if command -v git &>/dev/null; then
  CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "")
fi

# Collect active workflow summaries
SUMMARIES=()

for index_file in "${INDEX_FILES[@]}"; do
  status=$(get_field "$index_file" "status")

  # Skip completed or abandoned workflows
  case "$status" in
    complete|completed|abandoned|cancelled) continue ;;
  esac

  # Skip if no status at all (malformed file)
  if [ -z "$status" ]; then
    continue
  fi

  slug=$(get_field "$index_file" "slug")
  title=$(get_field "$index_file" "title")
  current_stage=$(get_field "$index_file" "current-stage")
  stage_status=$(get_field "$index_file" "stage-status")
  selected_slice=$(get_field "$index_file" "selected-slice-or-focus")
  branch_strategy=$(get_field "$index_file" "branch-strategy")
  branch=$(get_field "$index_file" "branch")
  base_branch=$(get_field "$index_file" "base-branch")
  pr_url=$(get_field "$index_file" "pr-url")
  next_cmd=$(get_field "$index_file" "recommended-next-command")
  next_invocation=$(get_field "$index_file" "recommended-next-invocation")
  open_questions=$(get_field "$index_file" "open-questions")

  # Build summary line
  summary="Active workflow: ${slug}"
  [ -n "$title" ] && summary="$summary - $title"
  [ -n "$current_stage" ] && summary="$summary\n  Stage: ${current_stage}"
  [ -n "$stage_status" ] && summary="$summary (${stage_status})"
  [ -n "$selected_slice" ] && summary="$summary\n  Slice: ${selected_slice}"

  # Branch info
  if [ -n "$branch_strategy" ] && [ "$branch_strategy" != "none" ]; then
    branch_line="  Branch: ${branch:-unknown}"
    if [ -n "$CURRENT_BRANCH" ] && [ -n "$branch" ]; then
      if [ "$CURRENT_BRANCH" = "$branch" ]; then
        branch_line="$branch_line (on correct branch)"
      else
        branch_line="$branch_line (current: ${CURRENT_BRANCH} - WRONG BRANCH)"
      fi
    fi
    [ -n "$base_branch" ] && branch_line="$branch_line, base: ${base_branch}"
    summary="$summary\n$branch_line"
  fi

  # PR info
  if [ -n "$pr_url" ]; then
    summary="$summary\n  PR: ${pr_url}"
  fi

  # Next command
  if [ -n "$next_invocation" ]; then
    summary="$summary\n  Next: ${next_invocation}"
  elif [ -n "$next_cmd" ]; then
    summary="$summary\n  Next: /${next_cmd} ${slug}"
  fi

  # Open questions
  if [ -n "$open_questions" ] && [ "$open_questions" != "[]" ] && [ "$open_questions" != "none" ]; then
    summary="$summary\n  Open questions: ${open_questions}"
  fi

  SUMMARIES+=("$summary")
done

# Exit silently if no active workflows
if [ ${#SUMMARIES[@]} -eq 0 ]; then
  exit 0
fi

# Build the full message
if [ ${#SUMMARIES[@]} -eq 1 ]; then
  MESSAGE="${SUMMARIES[0]}"
else
  MESSAGE="Active workflows (${#SUMMARIES[@]}):"
  for s in "${SUMMARIES[@]}"; do
    MESSAGE="$MESSAGE\n\n$s"
  done
fi

# Escape for JSON: expand \n to real newlines, then re-escape for JSON string
MESSAGE=$(printf '%b' "$MESSAGE" | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g')

# Output JSON
echo "{\"systemMessage\": \"${MESSAGE}\"}"
