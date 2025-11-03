#!/bin/bash
# scripts/build-for-gcp-vm.sh
# Build and package Gateway for deployment to GCP VM

ENV_FILE="${ENV_FILE:-.env}"
set -euo pipefail

# Load env if present
set -a
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
set +a

: "${SERVER_IDENTITY_KEY:?❌ SERVER_IDENTITY_KEY is not set. Please export it or put it in $ENV_FILE}"
: "${HOSTING_DOMAIN:?❌ HOSTING_DOMAIN is not set. Please export it or put it in $ENV_FILE}"

# Allow overrides like: VM=my-box ZONE=us-central1-f ./scripts/build-for-gcp-vm.sh
export VM=${VM:-gateway-box}
export ZONE=${ZONE:-us-central1-f}
RAW_DOMAIN="${DOMAIN:-$HOSTING_DOMAIN}"
export DOMAIN="$(echo "$RAW_DOMAIN" | sed -E 's#^https?://##')"
export PROTO=${PROTO:-https}

ROOT="$(pwd)"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "== install =="
npm ci

echo "== patch @bsv/sdk to remove localhost:3301 =="
if grep -q "localhost:3301" node_modules/@bsv/sdk/dist/* 2>/dev/null; then
  echo "→ Found hard-coded localhost:3301 in @bsv/sdk, patching…"
  sed -i.bak 's#http://localhost:3301##g' node_modules/@bsv/sdk/dist/* || true
  rm -f node_modules/@bsv/sdk/dist/*.bak
fi

echo "== patch public/demoIdsAuth1.js =="
if [ -f public/demoIdsAuth1.js ]; then
  sed -i.bak "s#http://localhost:3001#${PROTO}://${DOMAIN}#g" public/demoIdsAuth1.js
  rm -f public/demoIdsAuth1.js.bak
fi

echo "== clean output =="
rm -rf dist

echo "== build =="
npm run build

echo "== add cachebuster to index.html =="
STAMP="$(date +%s)"
sed -i.bak "s#bundle.js#bundle.js?v=${STAMP}#g" dist/public/index.html
rm -f dist/public/index.html.bak

echo "== skip rewriting wallet URLs (use user’s local Metanet client) =="
echo "   leaving localhost:3321 and localhost:3301 untouched"

echo "== patch API getVersion calls in bundle.js =="
for f in dist/public/bundle.js; do
  if [ -f "$f" ]; then
    # Replace both plain and escaped variants of /getVersion with /api/getVersion
    # Using Perl for robust, macOS/BSD-safe in-place editing.
    perl -0777 -i.bak -pe '
      s{\/getVersion}{/api/getVersion}g;
      s{\\\/getVersion}{\\/api\\/getVersion}g;
    ' "$f"
    rm -f "$f.bak"
  fi
done

# sanity check: fail only if *non-api* /getVersion remains
if grep -n "/getVersion" dist/public/bundle.js | grep -v "/api/getVersion" >/dev/null 2>&1; then
  echo "❌ unpatched /getVersion calls remain in bundle.js"
  grep -n "/getVersion" dist/public/bundle.js | grep -v "/api/getVersion" | head -20
  exit 1
else
  echo "✅ Patched all /getVersion calls to /api/getVersion"
fi

# sanity check: verify bundle.js built
if [ -f dist/public/bundle.js ]; then
  echo "✅ bundle.js built, localhost wallet URLs left intact (expected)"
else
  echo "❌ bundle.js missing"
  exit 1
fi

echo "== package =="
STAMP="$(date +%Y%m%d_%H%M%S)"
HASH="$(git rev-parse --short HEAD || echo 'nohash')"
TGZ="gateway-${STAMP}-${HASH}.tgz"

if [ -f package-lock.json ]; then
  sha256sum package-lock.json | awk '{print $1}' > PKGLOCK.SHA256
  echo "✅ wrote PKGLOCK.SHA256"
fi

tar -czf "$TGZ" \
  -C "$ROOT" \
  dist \
  package.json \
  package-lock.json \
  PKGLOCK.SHA256

echo "Built release: $TGZ"
ls -lh "$TGZ"
