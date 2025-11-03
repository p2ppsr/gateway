#!/bin/bash
# scripts/copy-built-tgz-gcp-vm.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.prod}"
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

PROJECT=${PROJECT:-computing-with-integrity}
VM=${VM:-gateway-box}
ZONE=${ZONE:-us-central1-f}

echo "== using env =="
echo "  ENV_FILE=$ENV_FILE"
echo "  PROJECT=$PROJECT VM=$VM ZONE=$ZONE"

ARTIFACT="$(ls -t gateway-*.tgz 2>/dev/null | head -1 || true)"
if [ -z "${ARTIFACT}" ]; then
  echo "❌ no gateway-*.tgz found in cwd"
  exit 1
fi

echo "== artifact =="
ls -lh "$ARTIFACT"

echo "== sanity check artifact contents =="
# BSD/GNU compatible: '^(\./)?...' instead of '^(|\./)...'
tar -tzf "$ARTIFACT" | grep -Eq '^(\./)?dist/'            || { echo "❌ artifact missing top-level dist/"; exit 1; }
tar -tzf "$ARTIFACT" | grep -Eq '^(\./)?PKGLOCK\.SHA256$' || { echo "❌ artifact missing PKGLOCK.SHA256"; exit 1; }

echo "== ensure remote releases dir =="
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" --command 'sudo mkdir -p /srv/gateway/releases && sudo chown -R bob:bob /srv/gateway'

echo "== copy to /srv/gateway/releases/ =="
gcloud compute scp "$ARTIFACT" "$VM":/srv/gateway/releases/ --zone "$ZONE" --project "$PROJECT"

echo "== prune old release archives on VM (keep 5) =="
gcloud compute ssh "$VM" --zone "$ZONE" --project "$PROJECT" --command \
  "bash -lc 'ls -1t /srv/gateway/releases/gateway-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f'"

echo "✅ Uploaded and pruned on VM."
