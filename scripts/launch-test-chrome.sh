#!/bin/zsh
set -euo pipefail

PROFILE_DIR="${CONVOGLIDE_PROFILE_DIR:-/tmp/chatgpt-perf-test-profile}"
PORT="${CONVOGLIDE_REMOTE_DEBUG_PORT:-9223}"
URL="${1:-about:blank}"
DISABLE_EXTENSIONS="${CONVOGLIDE_DISABLE_EXTENSIONS:-0}"

chrome_args=(
  --user-data-dir="$PROFILE_DIR"
  --remote-debugging-port="$PORT"
  --no-first-run
  --no-default-browser-check
)

if [[ "$DISABLE_EXTENSIONS" == "1" ]]; then
  chrome_args+=(--disable-extensions)
fi

pkill -f "$PROFILE_DIR" >/dev/null 2>&1 || true
sleep 1

open -na 'Google Chrome' --args \
  "${chrome_args[@]}" \
  --new-window "$URL"
