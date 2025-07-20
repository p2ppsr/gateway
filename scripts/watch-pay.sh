#!/bin/bash
#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Script: watch-pay.sh
# Purpose: Watches `src/components/PayButton/index.tsx` for changes and 
#          regenerates `pay.js` using `webpack.inject.ts` config.
#
# Usage:
#   ./watch-pay.sh
#
# Output:
#   Logs are saved to logs/watch-pay.log
#
# Dependencies:
#   - Node.js
#   - Webpack
#   - `webpack.inject.ts` configuration file
#
# Notes:
#   This script enables real-time rebuild of the embedded tipping button
#   whenever the PayButton source is updated. Designed for dev workflows.
# ─────────────────────────────────────────────────────────────

SCRIPT_NAME="watch-pay.sh"
LINE_COUNT=$(wc -l < "$0")
echo "📦 $SCRIPT_NAME — Watch src/components/PayButton/index.tsx for changes"
echo "📏 Total lines:       $LINE_COUNT"
echo "────────────────────────────────────────────"

mkdir -p logs
LOG_FILE="logs/watch-pay.log"

echo "📂 Logging output to $LOG_FILE"
echo "👀 Using: webpack.inject.ts"

npx webpack --watch --config webpack.inject.ts | tee "$LOG_FILE"
