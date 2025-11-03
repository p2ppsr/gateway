#!/bin/bash
# scripts/restart-gcp-vm.sh
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.prod}"
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

PROJECT=${PROJECT:-computing-with-integrity}
VM=${VM:-gateway-box}
ZONE=${ZONE:-us-central1-f}
DOMAIN_RAW=${DOMAIN:-${HOSTING_DOMAIN:-gateway.local}}
# Normalize DOMAIN to bare hostname for --resolve usage at the remote
DOMAIN_HOST="$(printf '%s\n' "$DOMAIN_RAW" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#:[0-9]+$##')"
APP_PORT=${APP_PORT:-3001}
ARTIFACT=${ARTIFACT:-}   # optional: absolute path on VM to a .tgz

echo "== using env =="
echo "  ENV_FILE=$ENV_FILE"
echo "  PROJECT=$PROJECT VM=$VM ZONE=$ZONE DOMAIN=$DOMAIN_HOST APP_PORT=$APP_PORT"

gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT" \
  --command "DOMAIN='$DOMAIN_HOST' APP_PORT='$APP_PORT' ARTIFACT='$ARTIFACT' bash -s" <<'REMOTE'
set -Eeuo pipefail
trap 'echo "❌ deploy failed on line $LINENO"' ERR

# Disk space guard on VM
avail_kb=$(df --output=avail / | tail -1)
if [ "$avail_kb" -lt 1048576 ]; then
  echo "❌ Less than 1 GB free on root filesystem — aborting deploy"
  df -h /
  exit 1
fi

DOMAIN="${DOMAIN:-gateway.local}"
APP_DIR="/srv/gateway"
REL_DIR="$APP_DIR/releases"
NEW_DIR="$APP_DIR/dist.new"
CUR_DIR="$APP_DIR/dist"
PREV_DIR="$APP_DIR/dist.prev"
CUR_NODE="$APP_DIR/node_modules"
LOCK_SHA_FILE="$APP_DIR/.pkglock.sha256"
APP_PORT="${APP_PORT:-3001}"
ARTIFACT="${ARTIFACT:-}"

echo '== locating artifact =='
# purge stale tmp artifacts (to prevent older bundles being picked)
sudo rm -f /tmp/gateway-*.tgz >/dev/null 2>&1 || true

choose_artifact() {
  # Prefer explicit override
  if [ -n "$ARTIFACT" ]; then
    [ -f "$ARTIFACT" ] || { echo "❌ ARTIFACT not found: $ARTIFACT"; return 1; }
    echo "$ARTIFACT"; return 0
  fi
  # Newest-first from releases dir only
  local latest
  latest="$(ls -1t "$REL_DIR"/gateway-*.tgz 2>/dev/null | head -1 || true)"
  if [ -z "$latest" ]; then
    echo "❌ No release artifact found in $REL_DIR"
    exit 1
  fi
  echo "$latest"
}

SRC_TGZ="$(choose_artifact)" || { echo '❌ No valid gateway-*.tgz found'; exit 1; }
B="$(basename "$SRC_TGZ")"
echo "== using artifact: $SRC_TGZ =="
file "$SRC_TGZ" | grep -qi 'gzip compressed' || { echo '❌ not a gzipped tar'; exit 1; }

echo '== stage release =='
sudo mkdir -p "$REL_DIR"
[ "$SRC_TGZ" -ef "$REL_DIR/$B" ] || sudo cp "$SRC_TGZ" "$REL_DIR/$B"
cd "$REL_DIR"

echo '== verify & extract into temp staging =='
sudo tar -tzf "$B" >/dev/null 2>&1
sudo rm -rf extract
sudo mkdir -p extract
sudo tar --warning=no-unknown-keyword -xzf "$B" -C extract 2>/dev/null || sudo tar -xzf "$B" -C extract

for f in dist package.json package-lock.json PKGLOCK.SHA256; do
  [ -e "extract/$f" ] || { echo "❌ missing expected payload: $f"; exit 1; }
done

echo '== build new dist tree atomically =='
sudo rm -rf "$NEW_DIR"
sudo mkdir -p "$NEW_DIR"
sudo cp -a extract/dist/. "$NEW_DIR"/

echo '== swap current → previous, promote new (dist) =='
if [ -d "$CUR_DIR" ]; then
  sudo rm -rf "$PREV_DIR"
  sudo mv "$CUR_DIR" "$PREV_DIR"
fi
sudo mv "$NEW_DIR" "$CUR_DIR"
sudo chown -R bob:bob "$CUR_DIR"

echo '== update manifests (package.json + lock) =='
sudo mkdir -p "$APP_DIR"
sudo cp -a extract/package.json extract/package-lock.json "$APP_DIR"/
NEW_SHA="$(tr -d '\n' < extract/PKGLOCK.SHA256 || true)"
CUR_SHA="$(tr -d '\n' < "$LOCK_SHA_FILE" 2>/dev/null || true)"

NEED_INSTALL=0
if [ ! -d "$CUR_NODE" ]; then
  echo "⚠ node_modules/ missing → will install runtime deps"; NEED_INSTALL=1
elif [ "$NEW_SHA" != "$CUR_SHA" ]; then
  echo "ℹ lockfile changed ($CUR_SHA → $NEW_SHA) → will install runtime deps"; NEED_INSTALL=1
else
  echo "✔ lockfile unchanged ($NEW_SHA) and node_modules present → skip install"
fi

if [ "$NEED_INSTALL" -eq 1 ]; then
  echo '== npm ci --omit=dev (runtime deps) =='
  sudo -H -u bob bash -lc "cd '$APP_DIR' && npm ci --omit=dev"
  echo "$NEW_SHA" | sudo tee "$LOCK_SHA_FILE" >/dev/null
fi

echo '== restart app =='
sudo systemctl restart gateway
sudo systemctl status gateway --no-pager -l || true

echo "== wait for port 127.0.0.1:$APP_PORT =="
ok=0
for i in {1..120}; do
  if timeout 1 bash -lc "echo > /dev/tcp/127.0.0.1/$APP_PORT" 2>/dev/null; then
    echo "✔ port $APP_PORT is open"; ok=1; break
  fi
  sleep 0.5
done
if [ "$ok" -ne 1 ]; then
  echo "❌ app never opened port $APP_PORT; recent logs:"
  journalctl -u gateway -n 200 --no-pager || true
  exit 1
fi

echo '== reload nginx =='
sudo nginx -t && sudo systemctl reload nginx

echo '== smoke checks =='
curl -skI --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/pay.js" | egrep -i 'HTTP/2|content-type' || true
curl -sk  --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/getStatus" || true
curl -skI --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/initializeIds" | head -1 || true

echo '== prune old release archives (keep 5) =='
sudo bash -lc "ls -1t '$REL_DIR'/gateway-*.tgz 2>/dev/null | tail -n +6 | xargs -r rm -f"

echo '== done. rollback tip =='
echo "To rollback: sudo rm -rf '$CUR_DIR' && sudo mv '$PREV_DIR' '$CUR_DIR' && sudo systemctl restart gateway && sudo systemctl reload nginx"
REMOTE
