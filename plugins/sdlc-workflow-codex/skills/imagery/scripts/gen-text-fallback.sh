#!/usr/bin/env bash
# gen-text-fallback.sh — output a structured text description when no image
# generation backend is available. The terminal fallback for the imagery skill.
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
    # With Gemini (nano-banana, per-token):
    GEMINI_API_KEY=<your-key> node .claude/skills/imagery/scripts/gen-gemini.mjs "${PROMPT}" .ai/design-probes/probe 2K
    # With gpt-image-2 (per-token):
    OPENAI_API_KEY=<your-key> node .claude/skills/imagery/scripts/gen-openai.mjs "${PROMPT}" .ai/design-probes/probe 2K
    # With codex exec (ChatGPT subscription):
    bash .claude/skills/imagery/scripts/gen-openai-codex.sh "${PROMPT}" .ai/design-probes/probe.jpg
EOF
