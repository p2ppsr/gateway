#!/bin/bash
# scripts/update-gcp-vm.sh
# Full deploy pipeline from your Mac.

ENV_FILE=".env"
set -euo pipefail

# Load production env if present
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

: "${SERVER_IDENTITY_KEY:?❌ SERVER_IDENTITY_KEY is not set. Please export it or put it in .env.production}"

# Allow overrides like: VM=my-box ZONE=us-central1-f ./scripts/update-gcp-vm.sh
export VM=${VM:-gateway-box}
export ZONE=${ZONE:-us-central1-f}
export DOMAIN=${DOMAIN:-gateway.local}
export PROTO=${PROTO:-https}

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== 1/4: build =="
"$DIR/build-for-gcp-vm.sh"

echo
echo "== 2/4: copy artifact to VM =="
"$DIR/copy-built-tgz-gcp-vm.sh"

echo
echo "== 3/4: restart service & reload nginx on VM =="
"$DIR/restart-gcp-vm.sh"

echo
echo "== 4/4: post-deploy checks =="
"$DIR/check-gcp-vm.sh"

echo
echo "✅ Done. (VM=$VM, ZONE=$ZONE, DOMAIN=$DOMAIN)"
