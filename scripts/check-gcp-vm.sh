#!/bin/bash
# scripts/check-gcp-vm.sh
# Comprehensive post-deploy checks with clear ✅/❌ per item and final summary.
# Runs on your Mac and SSHes into the VM to test via 127.0.0.1 using --resolve.
#
# Usage:
#   VM=gateway-box ZONE=us-central1-f DOMAIN=gateway.local PROTO=https ./scripts/check-gcp-vm.sh
# Optional env:
#   EXPECTED_VERSION="1.9.3"                 # exact match (takes precedence if set)
#   EXPECTED_VERSION_REGEX="^1\.9\."         # regex match (default if exact not set)

set -euo pipefail

VM=${VM:-gateway-box}
ZONE=${ZONE:-us-central1-f}
DOMAIN=${DOMAIN:-cyber-migration-toddler-australia.trycloudflare.com}
PROTO=${PROTO:-https}
EXPECTED_VERSION=${EXPECTED_VERSION:-}
EXPECTED_VERSION_REGEX=${EXPECTED_VERSION_REGEX:-'^1\.9\.'}

echo "== checking on ${VM} (${ZONE}), domain ${DOMAIN} =="

gcloud compute ssh "$VM" --zone "$ZONE" --command "DOMAIN='$DOMAIN' PROTO='$PROTO' EXPECTED_VERSION='$EXPECTED_VERSION' EXPECTED_VERSION_REGEX='$EXPECTED_VERSION_REGEX' bash -s" <<'REMOTE'
set -Eeuo pipefail

OK='✅'
FAIL='❌'
WARN='⚠️'

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# Port to pin for --resolve
if [ "${PROTO:-https}" = "https" ]; then
  PORT=443
  CURL_FLAGS="-sk"
else
  PORT=80
  CURL_FLAGS="-s"
fi
ORIGIN="${PROTO}://${DOMAIN}"

# ------------------ helpers ---------------------------------------------------
inc_total(){ TOTAL_COUNT=$((TOTAL_COUNT+1)); }
pass () { inc_total; printf "%s %s\n" "$OK" "$*"; PASS_COUNT=$((PASS_COUNT+1)); }
fail () { inc_total; printf "%s %s\n" "$FAIL" "$*"; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn () { printf "%s %s\n" "$WARN" "$*"; }

http_code () {
  # http_code <METHOD> <PATH> [EXTRA_CURL_ARGS...]
  local method="$1" path="$2"; shift 2
  if [ "$method" = "HEAD" ]; then
    curl $CURL_FLAGS -o /dev/null -w '%{http_code}' -I \
      --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" "${PROTO}://${DOMAIN}${path}"
  else
    curl $CURL_FLAGS -o /dev/null -w '%{http_code}' -X "$method" \
      --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" "${PROTO}://${DOMAIN}${path}"
  fi
}

fetch_headers () {
  # fetch_headers <METHOD> <PATH> [EXTRA_CURL_ARGS...]
  local method="$1"; shift
  local path="$1"; shift
  if [ "$method" = "HEAD" ]; then
    curl $CURL_FLAGS -I --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" \
      "${PROTO}://${DOMAIN}${path}"
  else
    curl $CURL_FLAGS -D - -X "$method" --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" \
      "${PROTO}://${DOMAIN}${path}" -o /dev/null
  fi
}

status_from_headers () {
  # status_from_headers <headers_text>
  printf '%s\n' "$1" | awk '/^HTTP/{code=$2}END{print code}'
}

header_present () {
  # header_present "<headers_text>" "Header-Name"
  printf '%s\n' "$1" | tr -d '\r' | awk -v IGNORECASE=1 -v key="$2" '
    BEGIN{ want=tolower(key) ":"; found=0 }
    { l=tolower($0); if (index(l,want)==1) { found=1; exit } }
    END{ exit(found?0:1) }'
}

header_value_first () {
  # header_value_first "<headers_text>" "Header-Name" (first occurrence)
  printf '%s\n' "$1" | tr -d '\r' | awk -v IGNORECASE=1 -v key="$2" '
    BEGIN{ want=tolower(key) ":" }
    {
      line=$0; l=tolower(line)
      if (index(l,want)==1) { sub(/^[^:]+:[[:space:]]*/,"",line); print line; exit }
    }'
}

hdr_has_token () {
  # hdr_has_token "<headers_text>" "Header-Name" "token (substr, case-insensitive)"
  local hdrs="$1" name="$2" token="$3"
  local val
  val="$(header_value_first "$hdrs" "$name" || true)"
  [ -n "$val" ] && printf '%s\n' "$val" | tr '[:upper:]' '[:lower:]' \
    | grep -q "$(printf '%s' "$token" | tr '[:upper:]' '[:lower:]')"
}

get_body () {
  # get_body <PATH> [EXTRA_CURL_ARGS...]
  local path="$1"; shift
  curl $CURL_FLAGS --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" "${PROTO}://${DOMAIN}${path}"
}

port_open () {
  # port_open <PORT>
  timeout 1 bash -lc "echo > /dev/tcp/127.0.0.1/$1" 2>/dev/null
}

# ------------------ routes exist / version sanity -----------------------------
  # Check required route files exist
  if [ -f "/srv/gateway/dist/routes/invoice.js" ]; then
    pass "dist/routes/invoice.js present"
  else
    fail "dist/routes/invoice.js missing"
  fi

  if [ -f "/srv/gateway/dist/routes/buttonCode.js" ]; then
    pass "dist/routes/buttonCode.js present"
  else
    fail "dist/routes/buttonCode.js missing"
  fi

# ------------------ stale-build / version sanity -----------------------------
DIST="/srv/gateway/dist/server.js"

if [ -f "$DIST" ]; then
  pass "dist: $DIST present"
else
  fail "dist: $DIST is missing"
fi

# Capture header for visibility and to parse @version
HEADER="$(sudo head -n 60 "$DIST" 2>/dev/null || true)"
if printf '%s\n' "$HEADER" | grep -q '@version'; then
  pass "dist: @version header present"
else
  fail "dist: @version header missing"
fi

# Extract the version string and validate it
VER_LINE="$(printf '%s\n' "$HEADER" | grep -E '@version' | head -n1 || true)"
VER="$(printf '%s\n' "$VER_LINE" | sed -E 's/.*@version[[:space:]]+([0-9]+(\.[0-9]+){1,3}).*/\1/;t;d')"

if [ -n "${EXPECTED_VERSION:-}" ]; then
  if [ "$VER" = "$EXPECTED_VERSION" ]; then
    pass "dist: @version matches EXPECTED_VERSION=${EXPECTED_VERSION}"
  else
    fail "dist: @version '${VER:-<unknown>}' does NOT match EXPECTED_VERSION=${EXPECTED_VERSION}"
    printf '%s\n' "$VER_LINE"
  fi
else
  if printf '%s\n' "$VER" | grep -Eq "${EXPECTED_VERSION_REGEX}"; then
    pass "dist: @version '${VER:-<unknown>}' matches regex ${EXPECTED_VERSION_REGEX}"
  else
    fail "dist: @version '${VER:-<unknown>}' does NOT match regex ${EXPECTED_VERSION_REGEX}"
    printf '%s\n' "$VER_LINE"
  fi
fi

# WELL-KNOWN router symbols
if sudo grep -nE 'WELL_KNOWN_PATH|WELLKNOWN_' "$DIST" >/dev/null 2>&1; then
  pass "dist: WELL_KNOWN router symbols present"
else
  fail "dist: WELL_KNOWN router symbols NOT found"
fi

# Ensure systemd points to canonical dist
UNIT_CAT="$(sudo systemctl cat gateway 2>/dev/null || true)"
if printf '%s\n' "$UNIT_CAT" | grep -qE 'WorkingDirectory *= */srv/gateway'; then
  pass "systemd: WorkingDirectory=/srv/gateway"
else
  fail "systemd: WorkingDirectory not set to /srv/gateway"
fi
if printf '%s\n' "$UNIT_CAT" | grep -qE 'ExecStart *=.*/node .* /srv/gateway/dist/server.js'; then
  pass "systemd: ExecStart uses /srv/gateway/dist/server.js"
else
  fail "systemd: ExecStart not using /srv/gateway/dist/server.js"
fi

# ------------------ system sanity --------------------------------------------
if command -v nginx >/dev/null 2>&1 || [ -x /usr/sbin/nginx ]; then
  pass "nginx binary present"
else
  fail "nginx not installed/in PATH"
fi

if systemctl is-active --quiet gateway; then
  pass "systemd: gateway ACTIVE"
else
  fail "systemd: gateway NOT active"
fi

if port_open 3001; then
  pass "node app port 3001 is open"
else
  fail "node app port 3001 not open"
fi

if sudo nginx -t >/tmp/nginx-test.out 2>&1; then
  pass "nginx config test"
else
  fail "nginx config test"; sed -n '1,120p' /tmp/nginx-test.out || true
fi

ACTIVE_SVRS=$(sudo nginx -T 2>/dev/null | awk '/server_name[[:space:]]+('"$DOMAIN"')[[:space:]]*;/{c++} END{print c+0}')
if [ "$ACTIVE_SVRS" -eq 2 ]; then
  pass "nginx vhost count for ${DOMAIN}: 2 (http+https)"
else
  fail "nginx vhost count for ${DOMAIN}: ${ACTIVE_SVRS} (expect 2)"
fi

# ------------------ static: /pay.js ------------------------------------------
HDRS_PAY="$(fetch_headers HEAD "/pay.js")"
CODE_PAY="$(status_from_headers "$HDRS_PAY")"
if [ "$CODE_PAY" = "200" ] || [ "$CODE_PAY" = "304" ]; then
  pass "static: /pay.js HTTP $CODE_PAY"
else
  fail "static: /pay.js HTTP $CODE_PAY"
fi

if header_present "$HDRS_PAY" "x-served-by" && hdr_has_token "$HDRS_PAY" "x-served-by" "nginx"; then
  pass "/pay.js served by nginx (x-served-by: nginx)"
else
  fail "/pay.js NOT served by nginx (x-served-by missing/wrong)"
fi

CT_PAY="$(header_value_first "$HDRS_PAY" "content-type" | tr '[:upper:]' '[:lower:]')"
if printf '%s' "$CT_PAY" | grep -q '^application/javascript'; then
  pass "/pay.js content-type application/javascript"
else
  fail "/pay.js content-type unexpected: ${CT_PAY:-<none>}"
fi

ETAG_PAY="$(header_value_first "$HDRS_PAY" "etag" || true)"
[ -n "$ETAG_PAY" ] && pass "/pay.js ETag present" || fail "/pay.js missing ETag"

hdr_has_token "$HDRS_PAY" "access-control-allow-origin" "*" \
  && pass "/pay.js CORS open (ACAO: *)" \
  || fail "/pay.js CORS header missing/wrong"

hdr_has_token "$HDRS_PAY" "cross-origin-resource-policy" "cross-origin" \
  && pass "/pay.js CORP is cross-origin" \
  || fail "/pay.js CORP not cross-origin"

# ETag 304 behaviour
if [ -n "$ETAG_PAY" ]; then
  HDRS_PAY_2="$(fetch_headers HEAD "/pay.js" -H "If-None-Match: $ETAG_PAY")"
  CODE_PAY_2="$(status_from_headers "$HDRS_PAY_2")"
  [ "$CODE_PAY_2" = "304" ] && pass "/pay.js If-None-Match => 304" || fail "/pay.js If-None-Match expected 304, got $CODE_PAY_2"
fi

# Range 206
HDRS_RANGE="$(fetch_headers GET "/pay.js" -H "Range: bytes=0-99")"
CODE_RANGE="$(status_from_headers "$HDRS_RANGE")"
LEN_RANGE="$(header_value_first "$HDRS_RANGE" "content-length" || true)"
CRANGE="$(header_value_first "$HDRS_RANGE" "content-range"  || true)"
if [ "$CODE_RANGE" = "206" ] && { [ "$LEN_RANGE" = "100" ] || printf '%s' "$CRANGE" | grep -qE 'bytes 0-99/'; }; then
  pass "/pay.js Range 206 (first 100 bytes) supported"
else
  fail "/pay.js Range request failed (code=${CODE_RANGE:-<none>}, len=${LEN_RANGE:-<none>}, crange=${CRANGE:-<none>})"
fi

# ------------------ static: /bundle.js ---------------------------------------
HDRS_BUNDLE="$(fetch_headers HEAD "/bundle.js")"
CODE_BUNDLE="$(status_from_headers "$HDRS_BUNDLE")"
if [ "$CODE_BUNDLE" = "200" ] || [ "$CODE_BUNDLE" = "304" ]; then
  pass "static: /bundle.js HTTP $CODE_BUNDLE"
else
  fail "static: /bundle.js HTTP $CODE_BUNDLE"
fi

CT_BUNDLE="$(header_value_first "$HDRS_BUNDLE" "content-type" | tr '[:upper:]' '[:lower:]')"
printf '%s' "$CT_BUNDLE" | grep -q '^application/javascript' \
  && pass "/bundle.js content-type application/javascript" \
  || fail "/bundle.js content-type unexpected: ${CT_BUNDLE:-<none>}"

# UI drift: ensure code is NOT trying localhost:3301 or 3001
if get_body "/bundle.js" | grep -q 'localhost:3301'; then
  fail "UI drift: /bundle.js contains localhost:3301 (should not)"
else
  pass "UI drift: no localhost:3301 in /bundle.js"
fi
if get_body "/bundle.js" | grep -q 'localhost:3001'; then
  fail "UI drift: /bundle.js contains localhost:3001 (should not)"
else
  pass "UI drift: no localhost:3001 in /bundle.js"
fi

# ------------------ homepage / ----------------------------------------------
HDRS_HOME="$(fetch_headers GET "/")"
CODE_HOME="$(status_from_headers "$HDRS_HOME")"
CT_HOME="$(header_value_first "$HDRS_HOME" "content-type" | tr '[:upper:]' '[:lower:]')"
[ "$CODE_HOME" = "200" ] || [ "$CODE_HOME" = "304" ] && pass "app shell: / HTTP $CODE_HOME" || fail "app shell: / HTTP $CODE_HOME"
printf '%s' "$CT_HOME" | grep -q '^text/html' && pass "app shell: content-type text/html" || fail "app shell: content-type unexpected: ${CT_HOME:-<none>}"

# ------------------ health & status -----------------------------------------
HDRS_HZ="$(fetch_headers GET "/healthz")"
[ "$(status_from_headers "$HDRS_HZ")" = "200" ] && pass "health: /healthz 200" || fail "health: /healthz not 200"

HDRS_STATUS="$(fetch_headers GET "/api/getStatus")"
CODE_STATUS="$(status_from_headers "$HDRS_STATUS")"
[ "$CODE_STATUS" = "200" ] && pass "status: /api/getStatus 200" || fail "status: /api/getStatus $CODE_STATUS"

# Security headers on API + CSP connect-src ports
[ -n "$(header_value_first "$HDRS_STATUS" "strict-transport-security" || true)" ] && pass "API: HSTS present" || fail "API: HSTS missing"
[ -n "$(header_value_first "$HDRS_STATUS" "content-security-policy" || true)" ] && pass "API: CSP present" || fail "API: CSP missing"

CSP_VAL="$(header_value_first "$HDRS_STATUS" "content-security-policy" || true)"
printf '%s' "$CSP_VAL" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | grep -q "connect-src[^;]*http://localhost:3321" \
  && pass "CSP: connect-src allows http://localhost:3321" \
  || fail "CSP: connect-src missing http://localhost:3321"

if printf '%s' "$CSP_VAL" | tr -d '\r' | grep -qi 'localhost:3301'; then
  fail "CSP: connect-src unexpectedly includes :3301"
else
  pass "CSP: connect-src does not include :3301"
fi

[ -n "$(header_value_first "$HDRS_STATUS" "ratelimit-limit" || true)" ] && pass "API: RateLimit headers present" || fail "API: RateLimit headers missing"

# ------------------ auth + middleware order checks ---------------------------

# 0) Preflight CORS for /.well-known/auth should allow x-bsv-auth-* headers
PREFLIGHT_HDRS="$(fetch_headers OPTIONS "/.well-known/auth" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-bsv-auth-version,x-bsv-auth-identity-key,x-bsv-auth-nonce,x-bsv-auth-signature,x-bsv-auth-timestamp" || true)"
PREFLIGHT_CODE="$(status_from_headers "$PREFLIGHT_HDRS" || echo "<none>")"

if { [ "$PREFLIGHT_CODE" = "200" ] || [ "$PREFLIGHT_CODE" = "204" ]; } \
   && header_present "$PREFLIGHT_HDRS" "access-control-allow-origin" \
   && hdr_has_token "$PREFLIGHT_HDRS" "access-control-allow-headers" "x-bsv-auth-version"; then
  pass "preflight: /.well-known/auth OPTIONS $PREFLIGHT_CODE with CORS + x-bsv-auth-* allowed"
else
  fail "preflight: /.well-known/auth CORS failed (HTTP ${PREFLIGHT_CODE})"
fi

# 1) Unauthenticated gate should reject a protected endpoint
CODE_INIT_HEAD="$(http_code HEAD "/api/initializeIds")"
[ "$CODE_INIT_HEAD" = "401" ] && pass "auth gate: /api/initializeIds 401 (unauthenticated)" || fail "auth gate: expected 401 HEAD, got $CODE_INIT_HEAD"

# 2) Handshake flow
COOKIE_JAR="$(mktemp)"; trap 'rm -f "$COOKIE_JAR"' EXIT

# Without version header should 500 (diagnostic)
CODE_AUTH_NOHDR="$(http_code POST "/.well-known/auth" -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" --data '{"clientPublicKey":"test"}')"
if [ "$CODE_AUTH_NOHDR" = "500" ]; then
  pass "handshake: POST /.well-known/auth returned 500 without version header"
else
  warn "handshake: POST /.well-known/auth returned $CODE_AUTH_NOHDR without version header"
fi

# With 0.1 should set cookie and 200
HDRS_AUTH="$(curl $CURL_FLAGS -D - -X POST \
  --resolve "${DOMAIN}:${PORT}:127.0.0.1" \
  -H "Origin: ${ORIGIN}" \
  -H "Content-Type: application/json" \
  -H "x-bsv-auth-version: 0.1" \
  --data '{"clientPublicKey":"test"}' \
  -c "$COOKIE_JAR" \
  "${ORIGIN}/.well-known/auth" -o /dev/null || true)"
CODE_AUTH="$(status_from_headers "$HDRS_AUTH")"
[ "$CODE_AUTH" = "200" ] && pass "handshake(v0.1): POST /.well-known/auth 200" || fail "handshake(v0.1): POST /.well-known/auth $CODE_AUTH"

if grep -qi 'gw_sess' "$COOKIE_JAR"; then
  pass "handshake(v0.1): gw_sess cookie captured"
else
  fail "handshake(v0.1): gw_sess cookie NOT set"
fi

# 3) With only gw_sess cookie, /api/initializeIds likely 400/401/403 (no full BRC-104)
HDRS_INIT_AUTH="$(curl $CURL_FLAGS -D - -X POST \
  --resolve "${DOMAIN}:${PORT}:127.0.0.1" \
  -H "Origin: ${ORIGIN}" \
  -H "Content-Type: application/json" \
  -b "$COOKIE_JAR" \
  --data '{"buttonId":"check123","merchantId":"m123","description":"health-check"}' \
  "${ORIGIN}/api/initializeIds" -o /dev/null || true)"
CODE_INIT_AUTH="$(status_from_headers "$HDRS_INIT_AUTH")"
case "$CODE_INIT_AUTH" in
  401|403) pass "auth flow: /api/initializeIds correctly guarded ($CODE_INIT_AUTH)" ;;
  5*)      fail "auth flow: /api/initializeIds returned server error (HTTP $CODE_INIT_AUTH)" ;;
  *)       pass "auth flow: /api/initializeIds reachable after gw_sess (HTTP $CODE_INIT_AUTH)" ;;
esac

# ------------------ direct IP check (bypass Host header/DNS) ------------------
IP_ADDR="${IP:-}"
if [ -z "$IP_ADDR" ]; then
  IP_ADDR="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
fi
if [ -z "$IP_ADDR" ]; then
  IP_ADDR="$(curl -s -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/ip)" || true
fi

if [ -n "$IP_ADDR" ]; then
  HDRS_IP="$(curl $CURL_FLAGS -D - -X GET "${PROTO}://${IP_ADDR}/healthz" -o /dev/null || true)"
  CODE_IP="$(status_from_headers "$HDRS_IP")"
  [ "$CODE_IP" = "200" ] && pass "IP check: ${PROTO}://${IP_ADDR}/healthz 200" || fail "IP check: ${PROTO}://${IP_ADDR}/healthz ${CODE_IP:-<none>}"
else
  warn "IP check: could not determine instance IP (set IP=1.2.3.4 to override)"
fi

# ------------------ wallet-config.js correctness (single source of truth) ----
# Fetch the served /wallet-config.js and assert values
CFG_JS="$(get_body "/wallet-config.js" || true)"
if [ -n "$CFG_JS" ]; then
  pass "wallet-config: /wallet-config.js HTTP 200"
  printf '%s' "$CFG_JS" | grep -q 'window\.GATEWAY_SITE_CONFIG' \
    && pass "wallet-config: window.GATEWAY_SITE_CONFIG present" \
    || fail "wallet-config: window.GATEWAY_SITE_CONFIG missing"

  printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'apiBase:""' \
    && pass "wallet-config: apiBase is empty string (same-origin)" \
    || fail "wallet-config: apiBase is not empty"

  printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'routingPrefix:"/api"' \
    && pass "wallet-config: routingPrefix = /api" \
    || fail "wallet-config: routingPrefix not /api"

  printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'wellKnownPath:"/\.well-known/auth"' \
    && pass "wallet-config: wellKnownPath = /.well-known/auth" \
    || fail "wallet-config: wellKnownPath incorrect"
else
  fail "wallet-config: /wallet-config.js not reachable"
fi

# ------------------ demo page checks (robust cache-busting) -------------------
HTML_FS="/srv/gateway/dist/public/demoIdsAuth1.html"
if [ -f "$HTML_FS" ]; then
  pass "demo: file exists $HTML_FS"

  # Order check (wallet-config before demoIdsAuth1)
  ORDER=$(awk '
    BEGIN{wc=0; dj=0}
    tolower($0) ~ /wallet-config\.js/ && wc==0 { wc=NR }
    tolower($0) ~ /demoidsauth1\.js/ && dj==0 { dj=NR }
    END{
      if (wc==0 || dj==0) { print "missing" }
      else if (wc<dj)     { print "ok" }
      else                { print "bad" }
    }
  ' "$HTML_FS")

  case "$ORDER" in
    ok)  pass "demo: wallet-config.js appears before demoIdsAuth1.js" ;;
    bad) fail "demo: wallet-config.js does NOT appear before demoIdsAuth1.js" ;;
    *)   fail "demo: wallet-config.js or demoIdsAuth1.js tag missing in HTML" ;;
  esac

  # Cache-busting on disk
  FS_CFG_CB=0
  FS_DEMO_CB=0
  grep -qiE '/wallet-config\.js\?v=[0-9]+' "$HTML_FS" && FS_CFG_CB=1
  grep -qiE '/demoidsauth1\.js\?v=[0-9]+' "$HTML_FS" && FS_DEMO_CB=1
else
  fail "demo: HTML ${HTML_FS} missing"
  FS_CFG_CB=0
  FS_DEMO_CB=0
fi

# Also fetch the served HTML to avoid false negatives (CDN/minify path differences)
HTML_HTTP="$(get_body "/demoIdsAuth1.html" || true)"
if [ -n "$HTML_HTTP" ]; then
  CODE_DEMO="$(http_code GET "/demoIdsAuth1.html")"
  [ "$CODE_DEMO" = "200" ] && pass "demo: /demoIdsAuth1.html HTTP 200" || fail "demo: /demoIdsAuth1.html HTTP ${CODE_DEMO:-<none>}"
  CT_DEMO="$(fetch_headers GET "/demoIdsAuth1.html" | awk 'tolower($0) ~ /^content-type:/ {print tolower($0)}' | head -1)"
  printf '%s' "$CT_DEMO" | grep -q 'text/html' && pass "demo: content-type text/html" || fail "demo: content-type unexpected"

  HTTP_CFG_CB=0
  HTTP_DEMO_CB=0
  printf '%s' "$HTML_HTTP" | grep -qiE '/wallet-config\.js\?v=[0-9]+' && HTTP_CFG_CB=1
  printf '%s' "$HTML_HTTP" | grep -qiE '/demoidsauth1\.js\?v=[0-9]+' && HTTP_DEMO_CB=1
else
  fail "demo: /demoIdsAuth1.html not reachable"
  HTTP_CFG_CB=0
  HTTP_DEMO_CB=0
fi

# Combine (pass if either FS or HTTP view is cache-busted)
if [ $FS_CFG_CB -eq 1 ] || [ $HTTP_CFG_CB -eq 1 ]; then
  pass "demo: wallet-config.js include is cache-busted (?v=…)"
else
  fail "demo: wallet-config.js include lacks cache-busting"
fi

if [ $FS_DEMO_CB -eq 1 ] || [ $HTTP_DEMO_CB -eq 1 ]; then
  pass "demo: demoIdsAuth1.js include is cache-busted (?v=…)"
else
  fail "demo: demoIdsAuth1.js include lacks cache-busting"
fi

# JS sanity for demo assets
if [ -f "/srv/gateway/dist/public/demoIdsAuth1.js" ]; then
  grep -q 'localhost:3301' /srv/gateway/dist/public/demoIdsAuth1.js \
    && fail "UI drift: demoIdsAuth1.js contains localhost:3301" \
    || pass "UI drift: no :3301 in demoIdsAuth1.js"
  grep -q 'localhost:3001' /srv/gateway/dist/public/demoIdsAuth1.js \
    && fail "UI drift: demoIdsAuth1.js contains localhost:3001" \
    || pass "UI drift: no :3001 in demoIdsAuth1.js"
fi

echo "== verify SERVER_IDENTITY_KEY is embedded =="

if [ -n "${SERVER_IDENTITY_KEY:-}" ]; then
  if grep -q "${SERVER_IDENTITY_KEY}" /srv/gateway/dist/public/bundle.js || \
     grep -q "${SERVER_IDENTITY_KEY}" /srv/gateway/dist/public/pay.js; then
    echo "✅ SERVER_IDENTITY_KEY found in bundle.js/pay.js"
  else
    echo "❌ SERVER_IDENTITY_KEY not found in bundle.js/pay.js"
    exit 1
  fi
else
  echo "⚠️  SERVER_IDENTITY_KEY not set locally, skipping check"
fi

  # ------------------ cloudflare edge checks ------------------------------------
  echo "== Cloudflare edge checks =="

  # Fetch without --resolve (hit Cloudflare edge, not localhost)
  HDRS_CF="$(curl -sk -D - -o /dev/null "${PROTO}://${DOMAIN}/pay.js" || true)"
  CODE_CF="$(status_from_headers "$HDRS_CF")"

  if [ "$CODE_CF" = "200" ] || [ "$CODE_CF" = "304" ]; then
    pass "cloudflare: /pay.js edge HTTP $CODE_CF"
  else
    fail "cloudflare: /pay.js edge HTTP ${CODE_CF:-<none>}"
  fi

  if header_present "$HDRS_CF" "cf-ray"; then
    pass "cloudflare: cf-ray header present"
  else
    fail "cloudflare: cf-ray header missing"
  fi

  if header_present "$HDRS_CF" "server" && hdr_has_token "$HDRS_CF" "server" "cloudflare"; then
    pass "cloudflare: server header = cloudflare"
  else
    fail "cloudflare: server header not cloudflare"
  fi

  if header_present "$HDRS_CF" "cf-cache-status"; then
    CF_CACHE="$(header_value_first "$HDRS_CF" "cf-cache-status")"
    pass "cloudflare: cf-cache-status=${CF_CACHE}"
  else
    fail "cloudflare: cf-cache-status header missing"
  fi

  # Double-check important headers survive through edge
  [ -n "$(header_value_first "$HDRS_CF" "strict-transport-security" || true)" ] \
    && pass "cloudflare: HSTS header preserved" \
    || fail "cloudflare: HSTS header stripped"

  [ -n "$(header_value_first "$HDRS_CF" "content-security-policy" || true)" ] \
    && pass "cloudflare: CSP header preserved" \
    || fail "cloudflare: CSP header stripped"

  # Edge /healthz test (sanity from Cloudflare side)
  HDRS_CF_HZ="$(curl -sk -D - -o /dev/null "${PROTO}://${DOMAIN}/healthz" || true)"
  CODE_CF_HZ="$(status_from_headers "$HDRS_CF_HZ")"
  [ "$CODE_CF_HZ" = "200" ] && pass "cloudflare: /healthz edge 200" || fail "cloudflare: /healthz edge ${CODE_CF_HZ:-<none>}"

# ------------------ summary --------------------------------------------------
echo "----------------------------------------"
if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "%s %s\n" "$FAIL" "One or more checks FAILED (${FAIL_COUNT}/${TOTAL_COUNT})."
  exit 1
else
  printf "%s %s\n" "$OK" "All checks passed (${PASS_COUNT}/${TOTAL_COUNT})."
fi
REMOTE
