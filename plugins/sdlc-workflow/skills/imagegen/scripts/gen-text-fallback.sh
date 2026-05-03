#!/usr/bin/env bash
# gen-text-fallback.sh — output a structured text description when no image generation is available
# Usage: gen-text-fallback.sh "<prompt>" "<scene_sentence>" [skip_reason]

PROMPT="${1:-}"
SCENE="${2:-$1}"
REASON="${3:-no image generation method available in this environment}"

cat <<EOF
IMAGEGEN_RESULT:
  method: text-only
  file: none
  skip_reason: ${REASON}
  prompt: ${PROMPT}
  scene_sentence: ${SCENE}
  to_generate_later: |
    # With Gemini API:
    GEMINI_API_KEY=<your-key> python3 .claude/skills/imagegen/scripts/gen-nano-banana-pro.py "${PROMPT}"
    # With codex exec (ChatGPT subscription):
    bash .claude/skills/imagegen/scripts/gen-gpt-image-2.sh "${PROMPT}" output.jpg
EOF
