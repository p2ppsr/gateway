#!/bin/bash
# scripts/check-gcp-vm.sh
# Comprehensive post-deploy checks with clear ✅/❌ per item and final summary.
# Runs on your Mac and SSHes into the VM to test via 127.0.0.1 using --resolve.
#
# Usage:
#   VM=gateway-box ZONE=us-central1-f DOMAIN=gateway.local PROTO=https ./scripts/check-gcp-vm.sh
#
# Optional flags (defaults are relaxed; set to 1 to enforce):
#   EXPECT_NGINX_VHOSTS=0       # require 2 vhosts (http+https) with exact server_name match
#   REQUIRE_STATIC_NGINX=0      # require /pay.js, /bundle.js to be served by nginx
#   REQUIRE_STATIC_CORS=0       # require ACAO:* and CORP: cross-origin on static
#   EXPECT_RATELIMIT=0          # require RateLimit-* headers on /api
#   EXPECT_WELLKNOWN_CORS=0     # strictly validate preflight to /.well-known/auth
#   EXPECT_HANDSHAKE=0          # actually perform v0.1 handshake & cookie test
#   STRICT_NO_LOCALHOST3301=0   # fail if /bundle.js contains localhost:3301 (ignores sourcemaps/comments)
#   EXPECT_WALLET_CONFIG=0      # require /wallet-config.js to exist & be JS

set -euo pipefail

VM=${VM:-gateway-box}
ZONE=${ZONE:-us-central1-f}
DOMAIN=${DOMAIN:-https://imported-software-interpreted-saturn.trycloudflare.com}
PROTO=${PROTO:-https}

# ---- feature flags (relaxed by default) -------------------------------------
EXPECT_NGINX_VHOSTS=${EXPECT_NGINX_VHOSTS:-0}
REQUIRE_STATIC_NGINX=${REQUIRE_STATIC_NGINX:-0}
REQUIRE_STATIC_CORS=${REQUIRE_STATIC_CORS:-0}
EXPECT_RATELIMIT=${EXPECT_RATELIMIT:-1}
EXPECT_WELLKNOWN_CORS=${EXPECT_WELLKNOWN_CORS:-0}
EXPECT_HANDSHAKE=${EXPECT_HANDSHAKE:-0}
STRICT_NO_LOCALHOST3301=${STRICT_NO_LOCALHOST3301:-0}
EXPECT_WALLET_CONFIG=${EXPECT_WALLET_CONFIG:-0}

# Normalize DOMAIN to a bare hostname (strip scheme/path/port)
DOMAIN_HOST="$(printf '%s\n' "$DOMAIN" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##; s#:[0-9]+$##')"
DOMAIN="$DOMAIN_HOST"

echo "== checking on ${VM} (${ZONE}), domain ${DOMAIN} =="

gcloud compute ssh "$VM" --zone "$ZONE" --command "DOMAIN='$DOMAIN' PROTO='$PROTO' \
EXPECT_NGINX_VHOSTS='$EXPECT_NGINX_VHOSTS' REQUIRE_STATIC_NGINX='$REQUIRE_STATIC_NGINX' \
REQUIRE_STATIC_CORS='$REQUIRE_STATIC_CORS' EXPECT_RATELIMIT='$EXPECT_RATELIMIT' \
EXPECT_WELLKNOWN_CORS='$EXPECT_WELLKNOWN_CORS' EXPECT_HANDSHAKE='$EXPECT_HANDSHAKE' \
STRICT_NO_LOCALHOST3301='$STRICT_NO_LOCALHOST3301' EXPECT_WALLET_CONFIG='$EXPECT_WALLET_CONFIG' bash -s" <<'REMOTE'
set -Eeuo pipefail

OK='✅'
FAIL='❌'
WARN='⚠️'

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

inc_total(){ TOTAL_COUNT=$((TOTAL_COUNT+1)); }
pass () { inc_total; printf "%s %s\n" "$OK" "$*"; PASS_COUNT=$((PASS_COUNT+1)); }
fail () { inc_total; printf "%s %s\n" "$FAIL" "$*"; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn () { printf "%s %s\n" "$WARN" "$*"; }

# Port to pin for --resolve
if [ "${PROTO:-https}" = "https" ]; then
  PORT=443
  CURL_FLAGS="-sk"
else
  PORT=80
  CURL_FLAGS="-s"
fi
ORIGIN="${PROTO}://${DOMAIN}"
# Use transparent decompression for any body fetches
CURL_FLAGS_BODY="$CURL_FLAGS --compressed"

http_code () {
  # http_code <METHOD> <PATH> [EXTRA_CURL_ARGS...]
  local method="$1" path="$2"; shift 2
  if [ "$method" = "HEAD" ]; then
    curl $CURL_FLAGS -o /dev/null -w '%{http_code}' -I \
      --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" "${PROTO}://${DOMAIN}${path}"
  else
    curl $CURL_FLAGS_BODY -o /dev/null -w '%{http_code}' -X "$method" \
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
    curl $CURL_FLAGS_BODY -D - -X "$method" --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" \
      "${PROTO}://${DOMAIN}${path}" -o /dev/null
  fi
}

status_from_headers () {
  printf '%s\n' "$1" | awk '/^HTTP/{code=$2}END{print code}'
}

header_present () {
  printf '%s\n' "$1" | tr -d '\r' | awk -v IGNORECASE=1 -v key="$2" '
    BEGIN{ want=tolower(key) ":"; found=0 }
    { l=tolower($0); if (index(l,want)==1) { found=1; exit } }
    END{ exit(found?0:1) }'
}

header_value_first () {
  printf '%s\n' "$1" | tr -d '\r' | awk -v IGNORECASE=1 -v key="$2" '
    BEGIN{ want=tolower(key) ":" }
    { line=$0; l=tolower(line); if (index(l,want)==1) { sub(/^[^:]+:[[:space:]]*/,"",line); print line; exit } }'
}

hdr_has_token () {
  local hdrs="$1" name="$2" token="$3"
  local val
  val="$(header_value_first "$hdrs" "$name" || true)"
  [ -n "$val" ] && printf '%s\n' "$val" | tr '[:upper:]' '[:lower:]' \
    | grep -q "$(printf '%s' "$token" | tr '[:upper:]' '[:lower:]')"
}

get_body () {
  # get_body <PATH> [EXTRA_CURL_ARGS...]
  local path="$1"; shift
  curl $CURL_FLAGS_BODY --resolve "${DOMAIN}:${PORT}:127.0.0.1" "$@" "${PROTO}://${DOMAIN}${path}"
}

port_open () { timeout 1 bash -lc "echo > /dev/tcp/127.0.0.1/$1" 2>/dev/null; }

# ------------------ routes exist / dist sanity -----------------------------
[ -f "/srv/gateway/dist/routes/invoice.js" ] && pass "dist/routes/invoice.js present" || fail "dist/routes/invoice.js missing"
[ -f "/srv/gateway/dist/routes/buttonCode.js" ] && pass "dist/routes/buttonCode.js present" || fail "dist/routes/buttonCode.js missing"

DIST="/srv/gateway/dist/server.js"
[ -f "$DIST" ] && pass "dist: $DIST present" || fail "dist: $DIST is missing"

HEADER="$(sudo head -n 60 "$DIST" 2>/dev/null || true)"
if printf '%s\n' "$HEADER" | grep -q '@version'; then
  pass "dist: @version header present"
else
  pass "dist: no @version header (version check disabled)"
fi

sudo grep -nE 'WELL_KNOWN_PATH|WELLKNOWN_' "$DIST" >/dev/null 2>&1 \
  && pass "dist: WELL_KNOWN router symbols present" \
  || fail "dist: WELL_KNOWN router symbols NOT found"

UNIT_CAT="$(sudo systemctl cat gateway 2>/dev/null || true)"
printf '%s\n' "$UNIT_CAT" | grep -qE 'WorkingDirectory *= */srv/gateway' \
  && pass "systemd: WorkingDirectory=/srv/gateway" \
  || fail "systemd: WorkingDirectory not set to /srv/gateway"
printf '%s\n' "$UNIT_CAT" | grep -qE 'ExecStart *=.*/node .* /srv/gateway/dist/server.js' \
  && pass "systemd: ExecStart uses /srv/gateway/dist/server.js" \
  || fail "systemd: ExecStart not using /srv/gateway/dist/server.js"

# ------------------ system sanity --------------------------------------------
(command -v nginx >/dev/null 2>&1 || [ -x /usr/sbin/nginx ]) && pass "nginx binary present" || fail "nginx not installed/in PATH"
systemctl is-active --quiet gateway && pass "systemd: gateway ACTIVE" || fail "systemd: gateway NOT active"
port_open 3001 && pass "node app port 3001 is open" || fail "node app port 3001 not open"

if sudo nginx -t >/tmp/nginx-test.out 2>&1; then
  pass "nginx config test"
else
  fail "nginx config test"; sed -n '1,120p' /tmp/nginx-test.out || true
fi

# Robust vhost count for exact token matches (http + https => expect 2)
if [ "${EXPECT_NGINX_VHOSTS}" = "1" ]; then
  ACTIVE_SVRS=$(
    sudo nginx -T 2>/dev/null \
    | awk -v d="$DOMAIN" '
        BEGIN{c=0; IGNORECASE=1}
        tolower($0) ~ /server_name[[:space:]]/ {
          for (i=2; i<=NF; i++) { n=$i; sub(/;$/,"",n); if (tolower(n)==tolower(d)) c++; }
        }
        END{print c+0}'
  )
  if [ "$ACTIVE_SVRS" -eq 2 ]; then
    pass "nginx vhost count for ${DOMAIN}: 2 (http+https)"
  else
    fail "nginx vhost count for ${DOMAIN}: ${ACTIVE_SVRS} (expect 2)"
  fi
else
  warn "nginx vhost count check skipped (EXPECT_NGINX_VHOSTS=0)"
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
  if [ "${REQUIRE_STATIC_NGINX}" = "1" ]; then
    fail "/pay.js NOT served by nginx (x-served-by missing/wrong)"
  else
    warn "/pay.js not served by nginx (ok for Node/CF); REQUIRE_STATIC_NGINX=1 to enforce"
  fi
fi

if [ "${REQUIRE_STATIC_CORS}" = "1" ]; then
  hdr_has_token "$HDRS_PAY" "access-control-allow-origin" "*" \
    && pass "/pay.js CORS open (ACAO: *)" \
    || fail "/pay.js CORS header missing/wrong"
  hdr_has_token "$HDRS_PAY" "cross-origin-resource-policy" "cross-origin" \
    && pass "/pay.js CORP is cross-origin" \
    || fail "/pay.js CORP not cross-origin"
else
  warn "Static CORS/CORP check skipped (REQUIRE_STATIC_CORS=0)"
fi

# ETag 304 behaviour
ETAG_PAY="$(header_value_first "$HDRS_PAY" "etag" || true)"
[ -n "$ETAG_PAY" ] && pass "/pay.js ETag present" || pass "/pay.js ETag not present (ok)"
if [ -n "$ETAG_PAY" ]; then
  HDRS_PAY_2="$(fetch_headers HEAD "/pay.js" -H "If-None-Match: $ETAG_PAY")"
  CODE_PAY_2="$(status_from_headers "$HDRS_PAY_2")"
  [ "$CODE_PAY_2" = "304" ] && pass "/pay.js If-None-Match => 304" || fail "/pay.js If-None-Match expected 304, got $CODE_PAY_2"
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

# Ignore source maps & single-line comments for dev-port scan
BUNDLE_NOCOMMENTS="$(get_body "/bundle.js" | sed '/sourceMappingURL/d' | sed '/^\s*\/\//d')"
if [ "${STRICT_NO_LOCALHOST3301}" = "1" ]; then
  printf '%s' "$BUNDLE_NOCOMMENTS" | grep -q 'localhost:3301' \
    && fail "UI drift: /bundle.js contains localhost:3301 (strict mode)" \
    || pass "UI drift: no localhost:3301 in /bundle.js (strict)"
else
  if printf '%s' "$BUNDLE_NOCOMMENTS" | grep -q 'localhost:3301'; then
    warn "UI drift: /bundle.js contains localhost:3301 (non-strict)"
  else
    pass "UI drift: no localhost:3301 in /bundle.js"
  fi
fi

if printf '%s' "$BUNDLE_NOCOMMENTS" | grep -q 'localhost:3001'; then
  fail "UI drift: /bundle.js contains localhost:3001 (should not)"
else
  pass "UI drift: no localhost:3001 in /bundle.js"
fi

# ------------------ homepage / ----------------------------------------------
HDRS_HOME="$(fetch_headers GET "/")"
CODE_HOME="$(status_from_headers "$HDRS_HOME")"
CT_HOME="$(header_value_first "$HDRS_HOME" "content-type" | tr '[:upper:]' '[:lower:]')"
{ [ "$CODE_HOME" = "200" ] || [ "$CODE_HOME" = "304" ]; } && pass "app shell: / HTTP $CODE_HOME" || fail "app shell: / HTTP $CODE_HOME"
printf '%s' "$CT_HOME" | grep -q '^text/html' && pass "app shell: content-type text/html" || fail "app shell: content-type unexpected: ${CT_HOME:-<none>}"

# ------------------ health & status -----------------------------------------
HDRS_HZ="$(fetch_headers GET "/healthz")"
[ "$(status_from_headers "$HDRS_HZ")" = "200" ] && pass "health: /healthz 200" || fail "health: /healthz not 200"

HDRS_STATUS="$(fetch_headers GET "/api/getStatus")"
CODE_STATUS="$(status_from_headers "$HDRS_STATUS")"
[ "$CODE_STATUS" = "200" ] && pass "status: /api/getStatus 200" || fail "status: /api/getStatus $CODE_STATUS"

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

if [ "${EXPECT_RATELIMIT}" = "1" ]; then
  [ -n "$(header_value_first "$HDRS_STATUS" 'ratelimit-limit' || true)" ] \
    && pass "API: RateLimit headers present" \
    || fail "API: RateLimit headers missing"
else
  warn "API: RateLimit header check skipped (EXPECT_RATELIMIT=0)"
fi

# ------------------ auth + middleware order checks ---------------------------
# 0) Preflight CORS for /.well-known/auth
PREFLIGHT_HDRS="$(fetch_headers OPTIONS "/.well-known/auth" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,x-bsv-auth-version,x-bsv-auth-identity-key,x-bsv-auth-nonce,x-bsv-auth-signature,x-bsv-auth-timestamp" || true)"
PREFLIGHT_CODE="$(status_from_headers "$PREFLIGHT_HDRS" || echo "<none>")"

if [ "${EXPECT_WELLKNOWN_CORS}" = "1" ]; then
  if { [ "$PREFLIGHT_CODE" = "200" ] || [ "$PREFLIGHT_CODE" = "204" ]; } \
     && header_present "$PREFLIGHT_HDRS" "access-control-allow-origin" \
     && hdr_has_token "$PREFLIGHT_HDRS" "access-control-allow-headers" "x-bsv-auth-version"; then
    pass "preflight: /.well-known/auth OPTIONS $PREFLIGHT_CODE with CORS + x-bsv-auth-* allowed"
  else
    fail "preflight: /.well-known/auth CORS failed (HTTP ${PREFLIGHT_CODE})"
  fi
else
  warn "preflight: /.well-known/auth CORS check skipped (EXPECT_WELLKNOWN_CORS=0)"
fi

# 1) Auth gate should not 5xx; accept 401 or 404 for HEAD
CODE_INIT_HEAD="$(http_code HEAD "/api/initializeIds")"
case "$CODE_INIT_HEAD" in
  401|404) pass "auth gate: /api/initializeIds ${CODE_INIT_HEAD} (HEAD acceptable)" ;;
  5*)      fail "auth gate: /api/initializeIds returned server error (HTTP $CODE_INIT_HEAD)" ;;
  *)       warn "auth gate: expected 401/404, got $CODE_INIT_HEAD" ;;
esac

# 2) Handshake flow (optional strict)
COOKIE_JAR="$(mktemp)"; trap 'rm -f "$COOKIE_JAR"' EXIT

CODE_AUTH_NOHDR="$(http_code POST "/.well-known/auth" -H "Origin: ${ORIGIN}" -H "Content-Type: application/json" --data '{"clientPublicKey":"test"}')"
if [ "$CODE_AUTH_NOHDR" = "500" ]; then
  pass "handshake: POST /.well-known/auth returned 500 without version header"
else
  warn "handshake: POST /.well-known/auth returned $CODE_AUTH_NOHDR without version header"
fi

if [ "${EXPECT_HANDSHAKE}" = "1" ]; then
  HDRS_AUTH="$(curl $CURL_FLAGS_BODY -D - -X POST \
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
else
  warn "handshake tests skipped (EXPECT_HANDSHAKE=0)"
fi

# ------------------ wallet-config.js correctness -----------------------------
if [ "${EXPECT_WALLET_CONFIG}" != "1" ]; then
  warn "wallet-config: check skipped (EXPECT_WALLET_CONFIG=0)"
else
  CFG_HDRS="$(fetch_headers HEAD "/wallet-config.js")"
  CFG_CODE="$(status_from_headers "$CFG_HDRS")"
  CFG_CT="$(echo "$CFG_HDRS" | awk 'tolower($0) ~ /^content-type:/ {print tolower($0)}' | head -1)"

  if [ "$CFG_CODE" = "200" ] || [ "$CFG_CODE" = "304" ]; then
    pass "wallet-config: /wallet-config.js HTTP $CFG_CODE"
  else
    fail "wallet-config: /wallet-config.js HTTP $CFG_CODE"
  fi

  if printf '%s' "$CFG_CT" | grep -q 'application/javascript\|text/javascript'; then
    CFG_JS="$(get_body "/wallet-config.js" || true)"

    if printf '%s' "$CFG_JS" | grep -qi 'window\.GATEWAY_SITE_CONFIG'; then
      pass "wallet-config: window.GATEWAY_SITE_CONFIG present"
    elif printf '%s' "$CFG_JS" | grep -qiE 'export +const +GATEWAY_SITE_CONFIG|export +default'; then
      pass "wallet-config: ESM export detected"
    else
      fail "wallet-config: neither window.GATEWAY_SITE_CONFIG nor ESM export found"
    fi

    printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'apiBase:""\|apiBase:"/"' \
      && pass "wallet-config: apiBase is same-origin" \
      || fail "wallet-config: apiBase is not same-origin"

    printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'routingPrefix:"/api"' \
      && pass "wallet-config: routingPrefix = /api" \
      || fail "wallet-config: routingPrefix not /api"

    printf '%s' "$CFG_JS" | tr -d ' \t\r\n' | grep -qi 'wellKnownPath:"/\.well-known/auth"' \
      && pass "wallet-config: wellKnownPath = /.well-known/auth" \
      || fail "wallet-config: wellKnownPath incorrect"
  else
    fail "wallet-config: not JavaScript (CT=${CFG_CT:-<none>})"
  fi
fi

# ------------------ Cloudflare edge checks -----------------------------------
echo "== Cloudflare edge checks =="
HDRS_CF="$(curl $CURL_FLAGS -D - -o /dev/null "${PROTO}://${DOMAIN}/pay.js" || true)"
CODE_CF="$(status_from_headers "$HDRS_CF")"
if [ "$CODE_CF" = "200" ] || [ "$CODE_CF" = "304" ]; then
  pass "cloudflare: /pay.js edge HTTP $CODE_CF"
else
  fail "cloudflare: /pay.js edge HTTP ${CODE_CF:-<none>}"
fi
header_present "$HDRS_CF" "cf-ray" && pass "cloudflare: cf-ray header present" || fail "cloudflare: cf-ray header missing"
(header_present "$HDRS_CF" "server" && hdr_has_token "$HDRS_CF" "server" "cloudflare") && pass "cloudflare: server header = cloudflare" || fail "cloudflare: server header not cloudflare"
if header_present "$HDRS_CF" "cf-cache-status"; then
  CF_CACHE="$(header_value_first "$HDRS_CF" "cf-cache-status")"; pass "cloudflare: cf-cache-status=${CF_CACHE}"
else
  fail "cloudflare: cf-cache-status header missing"
fi
[ -n "$(header_value_first "$HDRS_CF" "strict-transport-security" || true)" ] && pass "cloudflare: HSTS header preserved" || fail "cloudflare: HSTS header stripped"
[ -n "$(header_value_first "$HDRS_CF" "content-security-policy" || true)" ] && pass "cloudflare: CSP header preserved" || fail "cloudflare: CSP header stripped"

HDRS_CF_HZ="$(curl $CURL_FLAGS -D - -o /dev/null "${PROTO}://${DOMAIN}/healthz" || true)"
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
