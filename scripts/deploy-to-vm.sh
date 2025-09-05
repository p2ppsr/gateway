#!/usr/bin/env bash
# filename: scripts/deploy-to-vm.sh
# Build on Mac, copy dist/ and build/ to VM, restart service.

set -euo pipefail

VM="gateway-box"
ZONE="us-central1-f"
VM_PATH="/srv/gateway"

echo "=== 🏗  Building locally ==="
npm i --include=dev
npm run build:site
npm run build:inject
npx tsc -p tsconfig.server.json

# sanity: ensure outputs exist
test -d build && test -f dist/server.js

echo "=== 🚚 Copying artifacts to VM ==="
gcloud compute scp --recurse build "${VM}:${VM_PATH}/build" --zone="${ZONE}"
gcloud compute scp --recurse dist  "${VM}:${VM_PATH}/dist"  --zone="${ZONE}"

echo "=== 🔁 Restarting service on VM ==="
gcloud compute ssh "${VM}" --zone="${ZONE}" --command \
  "sudo systemctl restart gateway.service && sudo systemctl status gateway.service --no-pager --full | sed -n '1,20p'"

echo "=== ✅ Smoke test via VM ==="
gcloud compute ssh "${VM}" --zone="${ZONE}" --command \
  "curl -skI https://gateway.local/           | sed -n '1,10p'; \
   echo; \
   curl -skI https://gateway.local/api/status | sed -n '1,10p'"

echo "🎉 Done."
