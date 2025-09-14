#!/bin/bash
# scripts/build-for-gcp-vm.sh
set -euo pipefail

die() { echo "❌ $*" >&2; exit 1; }

# Portable sed -i helpers
_sed_in_place()   { if sed --version >/dev/null 2>&1; then sed -i "$@";    else sed -i '' "$@";    fi; }
_sed_in_place_E() { if sed --version >/dev/null 2>&1; then sed -E -i "$@"; else sed -E -i '' "$@"; fi; }

echo "== install =="
npm ci

echo "== patch @bsv/sdk to remove localhost:3301 =="
if grep -R "localhost:3301" node_modules/@bsv/sdk >/dev/null 2>&1; then
  echo "→ Found hard-coded localhost:3301 in @bsv/sdk, patching…"
  if sed --version >/dev/null 2>&1; then
    # GNU sed
    find node_modules/@bsv/sdk -type f -exec sed -i 's|localhost:3301|localhost:3321|g' {} +
  else
# BSD/macOS sed (force C locale to avoid illegal byte sequence)
find node_modules/@bsv/sdk -type f \
  -exec sh -c 'LC_ALL=C sed -i "" "s|localhost:3301|localhost:3321|g" "$@"' _ {} +
  fi
else
  echo "✓ No hard-coded localhost:3301 found in @bsv/sdk"
fi

echo "== patch public/demoIdsAuth1.js =="
if [ -f public/demoIdsAuth1.js ]; then
  if sed --version >/dev/null 2>&1; then
    sed -i 's|localhost:3301|localhost:3321|g' public/demoIdsAuth1.js
  else
    LC_ALL=C sed -i '' 's|localhost:3301|localhost:3321|g' public/demoIdsAuth1.js
  fi
fi

echo "== clean output =="
rm -rf dist .release

echo "== build =="
NODE_ENV=production npx tsc -p tsconfig.server.json
NODE_ENV=production npm run build:inject
NODE_ENV=production npm run build:site

echo "== patch public/demoIdsAuth1.js =="
if [ -f public/demoIdsAuth1.js ]; then
  if sed --version >/dev/null 2>&1; then
    sed -i 's|localhost:3301|localhost:3321|g' public/demoIdsAuth1.js
  else
    LC_ALL=C sed -i '' 's|localhost:3301|localhost:3321|g' public/demoIdsAuth1.js
  fi
fi

echo "== brutal sweep across dist/public for 3001 =="
if sed --version >/dev/null 2>&1; then
  find dist/public -type f -exec sed -i 's|http://localhost:3001||g; s|http://127.0.0.1:3001||g; s|https://localhost:3001||g; s|https://127.0.0.1:3001||g' {} +
  find dist/public -type f -exec sed -i 's|localhost:3001||g; s|127.0.0.1:3001||g; s|%3A3001||g' {} +
else
  find dist/public -type f -exec sh -c 'LC_ALL=C sed -i "" "s|http://localhost:3001||g; s|http://127.0.0.1:3001||g; s|https://localhost:3001||g; s|https://127.0.0.1:3001||g" "$@"' _ {} +
  find dist/public -type f -exec sh -c 'LC_ALL=C sed -i "" "s|localhost:3001||g; s|127.0.0.1:3001||g; s|%3A3001||g" "$@"' _ {} +
fi

echo "== verify dist/public contents =="
rm -f dist/public/main.js dist/public/main.js.map dist/public/main.js.LICENSE.txt || true
find dist/public -name '.DS_Store' -delete || true
[ -f dist/public/index.html ] || { cp -a public/index.html dist/public/index.html 2>/dev/null || true; }
[ -f dist/public/index.html ] || die "index.html missing in dist/public"
[ -f dist/public/pay.js ]     || die "pay.js missing in dist/public"
[ -f dist/server.js ]         || die "server.js missing in dist/"
[ -f dist/routes/invoice.js ]     || die "invoice.js missing in dist/routes"
[ -f dist/routes/buttonCode.js ]  || die "buttonCode.js missing in dist/routes"

echo "== strip source maps for prod =="
find dist/public -type f -name "*.map" -delete || true

echo "== normalize localhost dev hosts to VM-friendly values =="
FOUND=0
while IFS= read -r -d '' f; do
  changed=0

  # ---- Wallet port 3301 -> 3321 (always run) ----
  _sed_in_place_E 's#://(localhost|127\.0\.0\.1):3301#://\1:3321#gI' "$f"
  _sed_in_place_E 's#//(localhost|127\.0\.0\.1):3301#//\1:3321#gI'   "$f"
  _sed_in_place 's|http://localhost:3301|http://localhost:3321|g' "$f"
  _sed_in_place 's|http://127.0.0.1:3301|http://127.0.0.1:3321|g' "$f"
  _sed_in_place_E 's#https://localhost:3301#https://localhost:3321#gI' "$f"
  _sed_in_place_E 's#https://127\.0\.0\.1:3301#https://127.0.0.1:3321#gI' "$f"
  _sed_in_place_E 's#ws://(localhost|127\.0\.0\.1):3301#ws://\1:3321#gI'   "$f"
  _sed_in_place_E 's#wss://(localhost|127\.0\.0\.1):3301#wss://\1:3321#gI' "$f"
  # URL-encoded
  _sed_in_place_E 's#http%3A%2F%2Flocalhost%3A3301#http%3A%2F%2Flocalhost%3A3321#gI' "$f"
  _sed_in_place_E 's#https%3A%2F%2Flocalhost%3A3301#https%3A%2F%2Flocalhost%3A3321#gI' "$f"
  _sed_in_place_E 's#%3A3301#%3A3321#gI' "$f"
  # Escaped slashes (e.g. JSON/minified)
  _sed_in_place_E 's#:\\/\\/(localhost|127\.0\.0\.1):3301#:\/\/\1:3321#gI' "$f"
  _sed_in_place_E 's#http:\\/\\/localhost:3301#http:\\/\\/localhost:3321#gI' "$f"
  _sed_in_place_E 's#https:\\/\\/localhost:3301#https:\\/\\/localhost:3321#gI' "$f"
  # Bare fallback
  if sed --version >/dev/null 2>&1; then
    sed -i 's|localhost:3301|localhost:3321|g' "$f"
    sed -i 's|127.0.0.1:3301|127.0.0.1:3321|g' "$f"
  else
    sed -i '' 's|localhost:3301|localhost:3321|g' "$f"
    sed -i '' 's|127.0.0.1:3301|127.0.0.1:3321|g' "$f"
  fi
  changed=1

  # ---- Dev API on 3001 -> remove explicit host ----
  _sed_in_place_E 's#(["\x27`])https?://(localhost|127\.0\.0\.1):3001\1#\1\1#gI' "$f"
  _sed_in_place_E 's#(["\x27`])wss?://(localhost|127\.0\.0\.1):3001\1#\1\1#gI' "$f"
  _sed_in_place_E 's#(["\x27`])//(localhost|127\.0\.0\.1):3001\1#\1\1#gI'       "$f"
  _sed_in_place_E 's#(["\x27`])(localhost|127\.0\.0\.1):3001\1#\1\1#gI'         "$f"
  _sed_in_place_E 's#https\?://(localhost|127\.0\.0\.1):3001##gI' "$f"
  _sed_in_place_E 's#wss\?://(localhost|127\.0\.0\.1):3001##gI'   "$f"
  _sed_in_place_E 's#//(localhost|127\.0\.0\.1):3001##gI'         "$f"
  _sed_in_place_E 's#([^0-9A-Za-z])(localhost|127\.0\.0\.1):3001([^0-9A-Za-z])#\1\3#gI' "$f"
  _sed_in_place_E 's#http:\\/\\/(localhost|127\.0\.0\.1):3001##gI' "$f"
  _sed_in_place_E 's#wss?:\\/\\/(localhost|127\.0\.0\.1):3001##gI' "$f"
  _sed_in_place_E 's#\\/\\/(localhost|127\.0\.0\.1):3001##gI'      "$f"
  _sed_in_place_E 's#https?%3A%2F%2F(localhost|127\.0\.0\.1)%3A3001##gI' "$f"
  _sed_in_place_E 's#(localhost|127\.0\.0\.1)%3A3001##gI'               "$f"
  changed=1

  if [ $changed -eq 1 ]; then
    [ $FOUND -eq 0 ] && echo "→ rewriting:" && FOUND=1
    echo "   $f"
  fi
done < <(find dist/public -type f -regex '.*\.\(js\|map\|html\|htm\|json\|txt\)$' -print0)

echo "== debug: check after rewrite =="
grep -R --color -n "localhost:3301" dist/public || echo "✅ no bare localhost:3301"

echo "== scan for forbidden dev hosts =="
OFFENDERS=0

scan_and_flag () {
  local label="$1"; shift
  local pat="$1"; shift
  local exclude="${1:-}"

  if [ -n "$exclude" ]; then
    if grep -R -nIH -o -E "$pat" dist/public | grep -vE "$exclude" >/tmp/devscan_tokens.$$ 2>/dev/null; then
      echo "---- $label offending tokens ----"
      sed -n '1,80p' /tmp/devscan_tokens.$$
      OFFENDERS=1
    fi
  else
    if grep -R -nIH -o -E "$pat" dist/public >/tmp/devscan_tokens.$$ 2>/dev/null; then
      echo "---- $label offending tokens ----"
      sed -n '1,80p' /tmp/devscan_tokens.$$
      OFFENDERS=1
    fi
  fi

  if [ -n "$exclude" ]; then
    if grep -R -nIH -E "$pat" dist/public | grep -vE "$exclude" >/tmp/devscan_lines.$$ 2>/dev/null; then
      echo "---- $label offending lines ----"
      awk 'BEGIN{FS=":"} {file=$1;line=$2; $1="";$2=""; s=$0; gsub(/^[[:space:]:]+/,"",s); print file":"line"\n  " (length(s)>400?substr(s,1,400)" …":s) "\n"}' /tmp/devscan_lines.$$ | sed -n '1,40p'
      OFFENDERS=1
    fi
  else
    if grep -R -nIH -E "$pat" dist/public >/tmp/devscan_lines.$$ 2>/dev/null; then
      echo "---- $label offending lines ----"
      awk 'BEGIN{FS=":"} {file=$1;line=$2; $1="";$2=""; s=$0; gsub(/^[[:space:]:]+/,"",s); print file":"line"\n  " (length(s)>400?substr(s,1,400)" …":s) "\n"}' /tmp/devscan_lines.$$ | sed -n '1,40p'
      OFFENDERS=1
    fi
  fi

  rm -f /tmp/devscan_tokens.$$ /tmp/devscan_lines.$$ 2>/dev/null || true
}

scan_and_flag "DEV-API(3001)" '(https?|wss?):\/\/(localhost|127\.0\.0\.1):3001|(^|[^0-9A-Za-z])(localhost|127\.0\.0\.1):3001([^0-9A-Za-z]|$)|http:\\/\\/localhost:3001|http:\\/\\/127\.0\.0\.1:3001|localhost%3A3001|127\.0\.0\.1%3A3001|https?%3A%2F%2F(localhost|127\.0\.0\.1)%3A3001'

scan_and_flag "WALLET-PORT(3301)" '((localhost|127\.0\.0\.1):3301|%3A3301)' ':3321'

if [ "${ALLOW_DEV_HOSTS:-0}" = "1" ]; then
  echo "⚠️  ALLOW_DEV_HOSTS=1 set — bypassing dev host check."
elif [ $OFFENDERS -ne 0 ]; then
  echo "----------------------------------------"
  die "Refusing to package with dev hosts present."
fi

echo "== write runtime wallet-config.js (force same-origin /api) =="
cat > dist/public/wallet-config.js <<'JS'
(function () {
  window.GATEWAY_SITE_CONFIG = {
    apiBase: "",              // same-origin
    routingPrefix: "/api",
    wellKnownPath: "/.well-known/auth"
  };
})();
JS

TS="$(date +%s)"

echo "== ensure wallet-config before demoIdsAuth1 + force cache-busting in ALL HTML =="
while IFS= read -r -d '' HTML; do
  lower="$(tr '[:upper:]' '[:lower:]' < "$HTML")"
  has_wallet=$(printf '%s' "$lower" | grep -q 'wallet-config\.js' && echo 1 || echo 0)
  has_demo=$(printf '%s' "$lower" | grep -q 'demoidsauth1\.js' && echo 1 || echo 0)

# cache-busted injection
# Generate timestamp
TS="$(date +%s)"

# Create temporary file
cp "$HTML" "$HTML.__tmp" || { echo "Error: Failed to create temp file"; exit 1; }

# Process file to update or add cache-busting
awk -v ts="$TS" '
  BEGIN { scripts_added = 0 }
  # Match script tags for wallet-config.js or demoIdsAuth1.js (with or without ?v=)
  /<script[^>]*src="\/(wallet-config|demoIdsAuth1)\.js(\?v=[0-9]+)?"/ {
    if (scripts_added == 0) {
      print "<script src=\"/wallet-config.js?v=" ts "\" defer></script>"
      print "<script src=\"/demoIdsAuth1.js?v=" ts "\" defer></script>"
      scripts_added = 1
    }
    next
  }
  { print }
' "$HTML.__tmp" > "$HTML.__out" || { echo "Error: Failed to process file"; rm -f "$HTML.__tmp"; exit 1; }

# Replace original file and clean up
mv "$HTML.__out" "$HTML" || { echo "Error: Failed to replace file"; rm -f "$HTML.__tmp" "$HTML.__out"; exit 1; }
rm -f "$HTML.__tmp"

echo "Cache-busting applied to $HTML with timestamp ?v=$TS"


  # Show the rewritten script lines for verification
  echo ">>> after rewrite (${HTML#dist/public/}):"
  grep -niE 'wallet-config\.js|demoidsauth1\.js' "$HTML" || true

  wc_line=$(awk 'BEGIN{IGNORECASE=1} tolower($0) ~ /wallet-config\.js/ { print NR; exit }' "$HTML" || true)
  dj_line=$(awk 'BEGIN{IGNORECASE=1} tolower($0) ~ /demoidsauth1\.js/ { print NR; exit }' "$HTML" || true)
  if [ -n "${wc_line:-}" ] && [ -n "${dj_line:-}" ] && [ "$wc_line" -gt "$dj_line" ]; then
    awk -v wc="$wc_line" -v dj="$dj_line" '
      NR==wc { wc_content=$0; next }
      { lines[++n]=$0 }
      END{
        for (i=1;i<=n;i++){
          if (i==dj) print wc_content;
          print lines[i];
        }
      }' "$HTML" > "$HTML.__tmp" && mv "$HTML.__tmp" "$HTML"
  fi

  echo "--- ${HTML#dist/public/} (script lines) ---"
  grep -niE 'wallet-config\.js|demoidsauth1\.js' "$HTML" || true
done < <(find dist/public -type f -name "*.html" -print0)

echo "== pay.js details =="
ls -lh dist/public | egrep -i 'index\.html|pay\.js' || true
( shasum -a 256 dist/public/pay.js     2>/dev/null || true )

echo "== stage release payload (dist + manifests + lock hash) =="
rm -rf .release
mkdir -p .release
cp -a dist .release/dist
cp -a package.json package-lock.json .release/
( cd .release && shasum -a 256 package-lock.json | awk '{print $1}' > PKGLOCK.SHA256 )

[ -d .release/dist ]              || die ".release/dist not found"
[ -f .release/package.json ]      || die ".release/package.json not found"
[ -f .release/package-lock.json ] || die ".release/package-lock.json not found"
[ -f .release/PKGLOCK.SHA256 ]    || die ".release/PKGLOCK.SHA256 not found"

echo "== package =="
STAMP="$(date -u +%Y%m%d_%H%M%S)"
GITREV="$(git rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
OUT="gateway-${STAMP}-${GITREV}.tgz"
tar -czf "${OUT}" -C .release dist package.json package-lock.json PKGLOCK.SHA256
ls -lh "${OUT}"
echo "Built release: ${OUT}"
