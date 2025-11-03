#!/bin/bash
# scripts/update-gcp-vm.sh
# Full deploy pipeline from your Mac.

ENV_FILE="${ENV_FILE:-.env.prod}"
set -euo pipefail

# Load env if present
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

: "${SERVER_IDENTITY_KEY:?❌ SERVER_IDENTITY_KEY is not set. Please export it or put it in $ENV_FILE}"

# Allow overrides like: VM=my-box ZONE=us-central1-f ./scripts/update-gcp-vm.sh
export PROJECT=${PROJECT:-computing-with-integrity}
export VM=${VM:-gateway-box}
export ZONE=${ZONE:-us-central1-f}
# Prefer env DOMAIN or HOSTING_DOMAIN, fallback to gateway.local
export DOMAIN=${DOMAIN:-${HOSTING_DOMAIN:-gateway.local}}
export PROTO=${PROTO:-https}

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== using env =="
echo "  ENV_FILE=$ENV_FILE"
echo "  PROJECT=$PROJECT VM=$VM ZONE=$ZONE PROTO=$PROTO DOMAIN=$DOMAIN"

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
echo "✅ Done. (PROJECT=$PROJECT VM=$VM ZONE=$ZONE DOMAIN=$DOMAIN)"
