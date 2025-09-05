#!/bin/bash
# scripts/deploy-server.sh
# Deploy dist/server.js (and optional .map) to VM and restart service

set -euo pipefail

ZONE="us-central1-f"
VM="gateway-box"
TARGET="/srv/gateway/dist"

echo "=== 🚀 Deploying dist/server.js to $VM:$TARGET ==="

if [[ -f dist/server.js ]]; then
  gcloud compute scp dist/server.js "$VM:$TARGET/server.js" --zone="$ZONE"
  echo "✅ server.js deployed"
else
  echo "❌ dist/server.js not found. Run: npx tsc -p tsconfig.server.json"
  exit 1
fi

if [[ -f dist/server.js.map ]]; then
  gcloud compute scp dist/server.js.map "$VM:$TARGET/server.js.map" --zone="$ZONE"
  echo "✅ server.js.map deployed"
else
  echo "ℹ️ No server.js.map found — skipping"
fi

echo "=== 🔄 Restarting gateway.service on $VM ==="
gcloud compute ssh "$VM" --zone="$ZONE" \
  --command "sudo systemctl restart gateway.service && sudo systemctl status gateway.service --no-pager --full | head -n 20"

echo "=== ✅ Deploy complete ==="
