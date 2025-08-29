#!/usr/bin/env bash
set -euo pipefail
F="src/pages/Create/index.tsx"
[[ -f "$F" ]] || { echo "❌ missing $F"; exit 1; }

# Insert 3 lines after the idsInitializedpayment set in the catch block (only if not present)
if ! grep -q "CPR enable-copy: ensure state even on fallback init" "$F"; then
  awk '
    BEGIN{done=0}
    {
      print
      if (!done && $0 ~ /idsInitializedpayment_.*merchantId.*true.*\)/) {
        print "          // CPR enable-copy: ensure state even on fallback init"
        print "          setButtonID(validButtonID)"
        print "          setPaymentID(validPaymentID)"
        print "          setIds({ buttonId: validButtonID, paymentId: validPaymentID })"
        done=1
      }
    }
  ' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
fi

# Replace the single setIds(...) with the final 3-line guarantee (idempotent)
perl -0777 -pe '
  s{
    (\n\s*)setIds\(\{\s*buttonId:\s*validButtonID,\s*paymentId:\s*validPaymentID\s*\}\)
  }{$1// CPR enable-copy: final guarantee UI reflects chosen IDs$1setButtonID(validButtonID)$1setPaymentID(validPaymentID)$1setIds({ buttonId: validButtonID, paymentId: validPaymentID })}sx
' "$F" > "$F.tmp" && mv "$F.tmp" "$F"

echo "✅ CPR-0001 applied"
