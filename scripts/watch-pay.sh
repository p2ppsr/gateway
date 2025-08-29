#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$ROOT"
LOG_DIR="logs"; mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/watch-pay.log"
ENTRY="src/components/PayButton"
echo "📦 watch-pay — watching $ENTRY and src/utils" | tee "$LOG_FILE"
echo "📂 log: $LOG_FILE" | tee -a "$LOG_FILE"
build_once() {
  echo "�� building pay.js at $(date '+%H:%M:%S')" | tee -a "$LOG_FILE"
  npx webpack --config webpack.inject.ts --mode=development 2>&1 | tee -a "$LOG_FILE"
  echo "✅ build finished" | tee -a "$LOG_FILE"
}
build_once
if command -v fswatch >/dev/null 2>&1; then
  echo "👀 using fswatch" | tee -a "$LOG_FILE"
  fswatch -o "$ENTRY" src/utils 2>/dev/null | while read -r _; do sleep 0.3; build_once; done
elif command -v inotifywait >/dev/null 2>&1; then
  echo "👀 using inotifywait" | tee -a "$LOG_FILE"
  inotifywait -m -r -q -e close_write,create,move,delete "$ENTRY" src/utils --format '%w%f' \
  | while read -r file; do [[ "$file" == public/* ]] && continue; sleep 0.2; build_once; done
else
  echo "👀 using portable polling" | tee -a "$LOG_FILE"
  last=""; while true; do
    cur="$(find "$ENTRY" src/utils -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 | sort -z | xargs -0 sha1sum 2>/dev/null | sha1sum | awk '{print $1}')"
    if [[ -n "$cur" && "$cur" != "$last" ]]; then last="$cur"; build_once; fi
    sleep 1
  done
fi
