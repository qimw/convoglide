#!/bin/zsh
set -euo pipefail

PROFILE_DIR="${CONVOGLIDE_PROFILE_DIR:-/tmp/chatgpt-perf-test-profile}"
PORT="${CONVOGLIDE_REMOTE_DEBUG_PORT:-9223}"
URL="${1:-about:blank}"

pkill -f "$PROFILE_DIR" >/dev/null 2>&1 || true
sleep 1

open -na 'Google Chrome' --args \
  --user-data-dir="$PROFILE_DIR" \
  --remote-debugging-port="$PORT" \
  --no-first-run \
  --no-default-browser-check \
  --new-window "$URL"
