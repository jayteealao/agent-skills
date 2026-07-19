#!/usr/bin/env bash
# gen-gpt-image-2.sh — generate an image using gpt-image-2 via codex exec
# Usage: gen-gpt-image-2.sh "<prompt>" [output.jpg]
#
# Exit codes:
#   0 = success, image written to output path
#   1 = codex CLI not found
#   2 = image_generation feature not enabled / codex run failed
#   3 = no image data found in rollout
#   4 = failed to write output file
#
# CRITICAL: --enable image_generation is required.
# CRITICAL: --ephemeral must NOT be used (prevents session file creation = no image extraction).

set -euo pipefail

PROMPT="${1:-}"
OUTPUT="${2:-output.jpg}"

if [ -z "$PROMPT" ]; then
  echo "Usage: gen-gpt-image-2.sh \"<prompt>\" [output.jpg]" >&2
  exit 1
fi

# Check codex CLI
if ! command -v codex &>/dev/null; then
  echo "codex CLI not found in PATH" >&2
  exit 1
fi

# Snapshot sessions directory before run
SESSIONS_DIR="${HOME}/.codex/sessions"
mkdir -p "$SESSIONS_DIR"
BEFORE_SESSIONS=$(ls "$SESSIONS_DIR" 2>/dev/null | sort || true)

# Run codex with image generation enabled
# --sandbox read-only: prevents filesystem writes during the run
# --enable image_generation: required flag for the image_gen tool to be available
if ! codex exec \
  --enable image_generation \
  --sandbox read-only \
  -- "Generate an image for this description: ${PROMPT}. After generating, output the base64-encoded image data as a JSON object with key 'image_base64'." 2>/dev/null; then
  echo "codex exec failed" >&2
  exit 2
fi

# Find new session created by this run
AFTER_SESSIONS=$(ls "$SESSIONS_DIR" 2>/dev/null | sort || true)
NEW_SESSION=$(comm -13 <(echo "$BEFORE_SESSIONS") <(echo "$AFTER_SESSIONS") | head -1 || true)

if [ -z "$NEW_SESSION" ]; then
  echo "No new codex session found — image generation may have failed or image_generation not enabled" >&2
  exit 2
fi

ROLLOUT="${SESSIONS_DIR}/${NEW_SESSION}/rollout.jsonl"
if [ ! -f "$ROLLOUT" ]; then
  echo "Rollout file not found at ${ROLLOUT}" >&2
  exit 3
fi

# Extract image bytes from rollout
python3 - "$ROLLOUT" "$OUTPUT" <<'EOF'
import json, base64, sys
from pathlib import Path

rollout_path = sys.argv[1]
output_path = sys.argv[2]

lines = Path(rollout_path).read_text().strip().split('\n')

def find_base64_image(obj, depth=0):
    """Recursively search for base64-encoded image data."""
    if depth > 12:
        return None
    if isinstance(obj, str) and len(obj) > 200:
        # Try decoding as base64
        try:
            decoded = base64.b64decode(obj)
            # Check for JPEG (FF D8 FF) or PNG (89 50 4E 47) magic bytes
            if decoded[:3] == b'\xff\xd8\xff' or decoded[:4] == b'\x89PNG':
                return obj
        except Exception:
            pass
    if isinstance(obj, dict):
        # Prioritize keys that suggest image content
        for key in ['image_base64', 'data', 'image', 'content', 'b64_json']:
            if key in obj:
                result = find_base64_image(obj[key], depth + 1)
                if result:
                    return result
        for v in obj.values():
            result = find_base64_image(v, depth + 1)
            if result:
                return result
    if isinstance(obj, list):
        for v in obj:
            result = find_base64_image(v, depth + 1)
            if result:
                return result
    return None

# Search backwards — the image is usually in a late event
found_b64 = None
for line in reversed(lines):
    line = line.strip()
    if not line:
        continue
    try:
        event = json.loads(line)
        found_b64 = find_base64_image(event)
        if found_b64:
            break
    except json.JSONDecodeError:
        continue

if not found_b64:
    print("No image data found in rollout", file=sys.stderr)
    sys.exit(3)

image_bytes = base64.b64decode(found_b64)
out = Path(output_path)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_bytes(image_bytes)
print(f"Image saved to {out}")
EOF

exit_code=$?
if [ $exit_code -ne 0 ]; then
  exit $exit_code
fi

echo "gpt-image-2 generation complete: ${OUTPUT}"
