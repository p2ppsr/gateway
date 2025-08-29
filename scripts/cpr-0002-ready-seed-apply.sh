#!/usr/bin/env bash
set -euo pipefail
F="seeds/seed.js"
[[ -f "$F" ]] || { echo "❌ missing $F"; exit 1; }
perl -0777 -pe 's/(setup_complete:\s*)false/\1true/g' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
echo "✅ CPR-0002 applied"
