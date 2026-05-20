#!/usr/bin/env bash
# scripts/serve-sunflower.sh — POSIX tailscale wrapper for the sunflower view.
#
# Usage:
#   ./scripts/serve-sunflower.sh [--root <path>] [--port <int>] [--path <slug>]
#
# Defaults:
#   --root .ai/_view
#   --port 443    (HTTPS via tailscale)
#   --path /sdlc

set -euo pipefail

ROOT=".ai/_view"
PORT=443
URL_PATH="/sdlc"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --path) URL_PATH="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' ; exit 0 ;;
    *)
      echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

if ! command -v tailscale >/dev/null 2>&1; then
  echo "tailscale CLI not found on PATH." >&2
  echo "Install from https://tailscale.com/download and re-run." >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "View root not found: $ROOT" >&2
  echo "Render it first: node scripts/render-sunflower.mjs" >&2
  exit 1
fi

RESOLVED="$(cd "$ROOT" && pwd)"
echo "Serving $RESOLVED at https://<host>.<tailnet>${URL_PATH}/ on port $PORT"
echo "(Ctrl+C to stop)"

exec tailscale serve --bg=false --https="$PORT" --set-path="$URL_PATH" "$RESOLVED"
