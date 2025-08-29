#!/usr/bin/env bash
set -euo pipefail
F="seeds/seed.js"
[[ -f "$F" ]] || { echo "❌ missing $F"; exit 1; }

# Remove accepts lines from payment_buttons objects
perl -0777 -pe "s/\s*accepts:\s*'[^']*'\s*,?\n//g" "$F" > "$F.tmp" && mv "$F.tmp" "$F"

# Force all currency fields to SATS (buttons + payments)
perl -0777 -pe "s/\bcurrency:\s*'[^']*'/currency: 'SATS'/g" "$F" > "$F.tmp" && mv "$F.tmp" "$F"

echo '✅ CPR-0004 applied: seed.js is SATS-only (removed accepts, set currency to SATS).'
