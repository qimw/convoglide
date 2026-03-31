#!/bin/zsh
set -euo pipefail

PROFILE_DIR="${CONVOGLIDE_PROFILE_DIR:-/tmp/chatgpt-perf-test-profile}"
PORT="${CONVOGLIDE_REMOTE_DEBUG_PORT:-9223}"
URL="${1:-about:blank}"
DISABLE_EXTENSIONS="${CONVOGLIDE_DISABLE_EXTENSIONS:-0}"
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

chrome_args=(
  --user-data-dir="$PROFILE_DIR"
  --remote-debugging-port="$PORT"
  --no-first-run
  --no-default-browser-check
  --new-window
  "$URL"
)

if [[ "$DISABLE_EXTENSIONS" == "1" ]]; then
  chrome_args+=(--disable-extensions)
fi

pkill -f "$PROFILE_DIR" >/dev/null 2>&1 || true
sleep 1

mkdir -p "$PROFILE_DIR"
nohup "$CHROME_BIN" "${chrome_args[@]}" >/tmp/convoglide-chrome.log 2>&1 &

for _ in {1..30}; do
  if curl -sf "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "Chrome remote debugging did not become ready on port ${PORT}" >&2
exit 1
