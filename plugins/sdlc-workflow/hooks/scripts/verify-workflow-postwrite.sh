#!/usr/bin/env bash
# verify-workflow-postwrite.sh — PostToolUse hook for sdlc-workflow.
#
# Runs verify_frontmatter.py against files written under .ai/workflows/,
# .ai/simplify/, or .ai/profiles/. This is the *deep* schema check
# (full enum + per-type required-field validation against
# tests/frontmatter.schema.json), complementing the shallow PreToolUse
# validator (validate-workflow-write.sh) which only checks schema/type/slug.
#
# Triggered after Write, Edit, and MultiEdit — by then the file is on
# disk, so we don't have to reconstruct the post-Edit content ourselves.
#
# Exit semantics:
#   0          — file passed, or path is outside .ai/ (no-op)
#   2 + stderr — file failed validation; Claude sees the errors and
#                will typically re-Edit the file to fix them
#
# Fail-open on missing python / verifier / schema — emits a systemMessage
# so the user knows deep validation is silently skipped, but never blocks.

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null) || true

# -------------------------------------------------------------------
# Fast bail-outs
# -------------------------------------------------------------------

# No path → nothing to validate
[ -z "$FILE_PATH" ] && exit 0

# Only validate workflow artifacts. Match the same three roots the
# verifier auto-discovers.
case "$FILE_PATH" in
  */.ai/workflows/*.md) ;;
  */.ai/workflows/*/*.md) ;;
  */.ai/simplify/*.md) ;;
  */.ai/profiles/*/*.md) ;;
  *) exit 0 ;;
esac

# File must exist on disk — PostToolUse fires after the write, but if
# the path was relative or the previous step failed we may not find it.
[ -f "$FILE_PATH" ] || exit 0

# -------------------------------------------------------------------
# Locate dependencies
# -------------------------------------------------------------------

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    PYTHON="$cmd"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  printf '{"systemMessage": "wf-postwrite-verify: python not found on PATH; skipping deep schema validation. Install Python 3 to enable."}\n'
  exit 0
fi

VERIFIER="${CLAUDE_PLUGIN_ROOT}/tests/verify_frontmatter.py"
SCHEMA="${CLAUDE_PLUGIN_ROOT}/tests/frontmatter.schema.json"

if [ ! -f "$VERIFIER" ] || [ ! -f "$SCHEMA" ]; then
  printf '{"systemMessage": "wf-postwrite-verify: verifier or schema missing under CLAUDE_PLUGIN_ROOT; skipping."}\n'
  exit 0
fi

# -------------------------------------------------------------------
# Run the verifier
# -------------------------------------------------------------------

# --quiet makes the verifier silent on success and prints only the
# FAIL block + per-issue diagnostics on failure.
set +e
OUTPUT=$("$PYTHON" "$VERIFIER" --schema "$SCHEMA" --quiet "$FILE_PATH" 2>&1)
RC=$?
set -e

if [ "$RC" -eq 0 ]; then
  # Silent success — don't add to context window for clean writes.
  exit 0
fi

# Validation failed — surface to Claude via stderr + exit 2 so the
# error is fed back into the model's next turn.
{
  echo "wf-postwrite-verify: frontmatter validation FAILED for $FILE_PATH"
  echo
  echo "$OUTPUT"
  echo
  echo "The file was written but does not conform to the sdlc/v1 schema"
  echo "(see plugins/sdlc-workflow/tests/frontmatter.schema.json)."
  echo "Re-Edit the frontmatter to fix the issues above, then continue."
} >&2

exit 2
