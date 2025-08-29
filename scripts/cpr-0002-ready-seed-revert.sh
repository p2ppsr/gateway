#!/usr/bin/env bash
set -euo pipefail
F="seeds/seed.js"
[[ -f "$F" ]] || { echo "❌ missing $F"; exit 1; }
perl -0777 -pe 's/(setup_complete:\s*)true/\1false/g' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
echo "✅ CPR-0002 reverted"
