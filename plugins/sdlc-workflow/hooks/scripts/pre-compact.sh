#!/usr/bin/env bash
# pre-compact.sh — PreCompact hook for sdlc-workflow
# Fires before context compaction. Outputs plain text instructions that tell
# the compaction model what workflow state to preserve in the summary.
#
# The next stage's Step 0 Orient rebuilds full context from artifacts, but
# the summary must carry enough to orient the model immediately after compaction.
#
# Requires: yq, jq
# Exit 0 always — never block compaction.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
WORKFLOWS_DIR="$PROJECT_DIR/.ai/workflows"

# No workflows dir — nothing to preserve
if [ ! -d "$WORKFLOWS_DIR" ]; then
  exit 0
fi

# Need yq and jq
if ! command -v yq &>/dev/null || ! command -v jq &>/dev/null; then
  exit 0
fi

# Collect active workflow summaries
SUMMARIES=""
FOUND=false

while IFS= read -r -d '' index_file; do
  workflow_dir=$(dirname "$index_file")

  status=$(yq '.status // ""' "$index_file" 2>/dev/null) || continue

  # Skip completed/abandoned workflows
  case "$status" in
    complete|completed|abandoned|cancelled) continue ;;
  esac

  slug=$(yq '.slug // ""' "$index_file" 2>/dev/null) || continue
  title=$(yq '.title // ""' "$index_file" 2>/dev/null) || continue
  stage=$(yq '."current-stage" // ""' "$index_file" 2>/dev/null) || continue
  stage_num=$(yq '."stage-number" // ""' "$index_file" 2>/dev/null) || continue
  slice=$(yq '."selected-slice" // ""' "$index_file" 2>/dev/null) || continue
  branch_strategy=$(yq '."branch-strategy" // ""' "$index_file" 2>/dev/null) || continue
  branch=$(yq '.branch // ""' "$index_file" 2>/dev/null) || continue
  next_cmd=$(yq '."next-command" // ""' "$index_file" 2>/dev/null) || continue
  next_inv=$(yq '."next-invocation" // ""' "$index_file" 2>/dev/null) || continue

  # Open questions
  open_q=$(yq '."open-questions" // [] | join("; ")' "$index_file" 2>/dev/null) || true

  # Progress map
  progress=$(yq '.progress // {} | to_entries | map(.key + ": " + .value) | join(", ")' "$index_file" 2>/dev/null) || true

  # Build summary for this workflow
  SUMMARY="WORKFLOW: ${slug}"
  SUMMARY="${SUMMARY}\n  Title: ${title}"
  SUMMARY="${SUMMARY}\n  Status: ${status}"
  SUMMARY="${SUMMARY}\n  Current stage: ${stage} (stage ${stage_num} of 10)"
  [ -n "$slice" ] && SUMMARY="${SUMMARY}\n  Selected slice: ${slice}"
  [ -n "$branch_strategy" ] && SUMMARY="${SUMMARY}\n  Branch strategy: ${branch_strategy}"
  [ -n "$branch" ] && SUMMARY="${SUMMARY}\n  Branch: ${branch}"
  [ -n "$progress" ] && SUMMARY="${SUMMARY}\n  Progress: ${progress}"
  [ -n "$open_q" ] && SUMMARY="${SUMMARY}\n  Open questions: ${open_q}"
  [ -n "$next_cmd" ] && SUMMARY="${SUMMARY}\n  Next command: ${next_inv:-$next_cmd}"

  if [ "$FOUND" = true ]; then
    SUMMARIES="${SUMMARIES}\n\n"
  fi
  SUMMARIES="${SUMMARIES}${SUMMARY}"
  FOUND=true

done < <(find "$WORKFLOWS_DIR" -maxdepth 2 -name "00-index.md" -print0 2>/dev/null)

if [ "$FOUND" != "true" ]; then
  exit 0
fi

# Output instructions for the compaction model
cat <<COMPACTION_INSTRUCTIONS
CRITICAL — Active SDLC workflow state. Preserve ALL of the following in the compaction summary.

$(echo -e "$SUMMARIES")

PRESERVE IN SUMMARY:
1. The active workflow slug, current stage, and selected slice
2. Branch name and strategy (the user needs to know which branch they're on)
3. Open questions (these are blocking — losing them means re-asking the PO)
4. Progress map (which stages are complete vs in-progress)
5. The recommended next command and its full invocation
6. Any decisions made during this conversation (triage results, PO answers, architectural choices)
7. Any errors or blockers encountered and their resolution status

The next stage's Step 0 Orient will rebuild full context by reading workflow artifact files,
but the summary must carry enough state for the model to orient immediately after compaction
without re-reading all artifacts.
COMPACTION_INSTRUCTIONS

exit 0
