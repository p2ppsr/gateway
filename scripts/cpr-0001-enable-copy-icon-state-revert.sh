#!/usr/bin/env bash
set -euo pipefail
F="src/pages/Create/index.tsx"
[[ -f "$F" ]] || { echo "❌ missing $F"; exit 1; }

# Remove the fallback block we inserted
perl -0777 -pe '
  s/\n\s*\/\/ CPR enable-copy: ensure state even on fallback init\n\s*setButtonID\(validButtonID\)\n\s*setPaymentID\(validPaymentID\)\n\s*setIds\(\{\s*buttonId:\s*validButtonID,\s*paymentId:\s*validPaymentID\s*\}\)//s
' "$F" > "$F.tmp" && mv "$F.tmp" "$F"

# Replace the 3-line final guarantee back to the single setIds(...)
perl -0777 -pe '
  s{
    \n\s*// CPR enable-copy: final guarantee UI reflects chosen IDs
    \n\s*setButtonID\(validButtonID\)
    \n\s*setPaymentID\(validPaymentID\)
    \n\s*setIds\(\{\s*buttonId:\s*validButtonID,\s*paymentId:\s*validPaymentID\s*\}\)
  }{\n      setIds({ buttonId: validButtonID, paymentId: validPaymentID })}sx
' "$F" > "$F.tmp" && mv "$F.tmp" "$F"

echo "✅ CPR-0001 reverted"
