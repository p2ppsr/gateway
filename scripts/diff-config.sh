#!/usr/bin/env bash
# scripts/diff-config.sh
# Compare a live file (optionally remote via gcloud) with a snapshot/local file.
# Produces a sanitized diff + summary, and can optionally copy the chosen source
# (live or snapshot) into a local destination (e.g., your repo .env) with y/n prompt.
#
# Usage (REMOTE diff + optional sync):
#   VM=gateway-box ZONE=us-central1-f LIVE_PATH=/srv/gateway/.env \
#     scripts/diff-config.sh --snapshot ./vm.snap.env \
#       [--sync-to ./.env] [--sync-from snapshot|live] [--yes]
#
# Usage (LOCAL vs LOCAL):
#   scripts/diff-config.sh --live ./vm.live.env --snapshot ./vm.snap.env \
#       [--sync-to ./.env] [--sync-from snapshot|live] [--yes]
#
# Flags:
#   --live <path>         Use a local file as the live source (skips gcloud).
#   --snapshot <path>     Local snapshot file to compare against. (required)
#   --show-values         Show real values in diff (DANGEROUS; default hashes).
#   --sync-to <path>      After diff, offer to copy chosen source into this path.
#   --sync-from <side>    'snapshot' (default) or 'live' — which file to copy.
#   --yes                 Noninteractive copy (auto-confirm).
#   -h|--help             Help.
#
# Env for remote fetch (when --live omitted):
#   VM, ZONE, LIVE_PATH (default: /srv/gateway/.env)

set -euo pipefail

LIVE_LOCAL=""
SNAPSHOT_LOCAL=""
LIVE_PATH="${LIVE_PATH:-/srv/gateway/.env}"
MASK_VALUES=1
SYNC_TO=""
SYNC_FROM="snapshot"   # or 'live'
AUTO_YES=0

print_usage() {
  sed -n '1,60p' "$0" | sed -n '2,60p'
}

while (( $# )); do
  case "$1" in
    --live) LIVE_LOCAL="${2:-}"; shift 2;;
    --snapshot) SNAPSHOT_LOCAL="${2:-}"; shift 2;;
    --show-values) MASK_VALUES=0; shift;;
    --sync-to) SYNC_TO="${2:-}"; shift 2;;
    --sync-from)
      SYNC_FROM="${2:-}"; shift 2
      if [[ "$SYNC_FROM" != "snapshot" && "$SYNC_FROM" != "live" ]]; then
        echo "❌ --sync-from must be 'snapshot' or 'live' (got: $SYNC_FROM)" >&2; exit 1
      fi
      ;;
    --yes) AUTO_YES=1; shift;;
    -h|--help) print_usage; exit 0;;
    *) echo "❌ Unknown arg: $1" >&2; print_usage; exit 1;;
  esac
done

if [[ -z "$SNAPSHOT_LOCAL" ]]; then
  echo "❌ --snapshot <path> is required." >&2; exit 1
fi
if [[ ! -f "$SNAPSHOT_LOCAL" ]]; then
  echo "❌ Snapshot file not found: $SNAPSHOT_LOCAL" >&2; exit 1
fi

WORKDIR="$(mktemp -d -t diffcfg.XXXXXX)"
cleanup(){ rm -rf "$WORKDIR"; }
trap cleanup EXIT

LIVE_RAW="$WORKDIR/live.raw"
SNAP_RAW="$WORKDIR/snap.raw"
LIVE_NORM="$WORKDIR/live.norm"
SNAP_NORM="$WORKDIR/snap.norm"
LIVE_SAN="$WORKDIR/live.san"
SNAP_SAN="$WORKDIR/snap.san"
LIVE_KEYS="$WORKDIR/live.keys"
SNAP_KEYS="$WORKDIR/snap.keys"

# ---------- acquire live ----------
if [[ -n "$LIVE_LOCAL" ]]; then
  cp -f "$LIVE_LOCAL" "$LIVE_RAW"
else
  if [[ -z "${VM:-}" || -z "${ZONE:-}" ]]; then
    echo "❌ Neither --live provided nor VM/ZONE set for remote fetch." >&2; exit 1
  fi
  echo "== fetching live from ${VM}:${LIVE_PATH} =="
  gcloud compute scp "${VM}:${LIVE_PATH}" "$LIVE_RAW" --zone "$ZONE" >/dev/null
fi
cp -f "$SNAPSHOT_LOCAL" "$SNAP_RAW"

# ---------- normalization ----------
normalize_env() {
  # $1 src, $2 dest
  awk '
    BEGIN{ FS="=" }
    function ltrim(s){ sub(/^[ \t\r\n]+/, "", s); return s }
    function rtrim(s){ sub(/[ \t\r\n]+$/, "", s); return s }
    function trim(s){ return rtrim(ltrim(s)) }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      line=$0; gsub(/\r/,"",line)
      sub(/^[[:space:]]*export[[:space:]]+/,"",line)
      if (match(line,/^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=/)) {
        key=$1
        if (index(line,"=")==0) next
        split(line, kv, "=")
        key=kv[1]; sub(/^[[:space:]]*/,"",key); sub(/[[:space:]]*$/,"",key)
        val=substr(line, index(line,"=")+1); val=trim(val)
        if ((substr(val,1,1)=="\"" && substr(val,length(val),1)=="\"") ||
            (substr(val,1,1)=="\047" && substr(val,length(val),1)=="\047")) {
          val=substr(val,2,length(val)-2)
        }
        print key"="val
      }
    }
  ' "$1" | sort -u > "$2"
}

normalize_env "$LIVE_RAW" "$LIVE_NORM"
normalize_env "$SNAP_RAW" "$SNAP_NORM"

# ---------- sanitized views ----------
hash_values() {
  # $1 src norm, $2 dest san
  while IFS= read -r line; do
    key="${line%%=*}"; val="${line#*=}"
    dig="$(printf '%s' "$val" | shasum -a 256 2>/dev/null | awk '{print $1}' | cut -c1-12)"
    echo "${key}=<sha:${dig}>"
  done < "$1" > "$2"
}

if [[ "$MASK_VALUES" -eq 1 ]]; then
  hash_values "$LIVE_NORM" "$LIVE_SAN"
  hash_values "$SNAP_NORM" "$SNAP_SAN"
else
  cp -f "$LIVE_NORM" "$LIVE_SAN"
  cp -f "$SNAP_NORM" "$SNAP_SAN"
fi

# ---------- diff ----------
echo "== sanitized unified diff (snapshot → live) =="
if command -v colordiff >/dev/null 2>&1; then
  colordiff -u "$SNAP_SAN" "$LIVE_SAN" || true
else
  diff -u "$SNAP_SAN" "$LIVE_SAN" || true
fi
echo

# ---------- summary ----------
cut -d= -f1 "$LIVE_NORM"  | sort -u > "$LIVE_KEYS"
cut -d= -f1 "$SNAP_NORM"  | sort -u > "$SNAP_KEYS"

echo "== summary =="
echo "-- keys only in SNAPSHOT --"
comm -23 "$SNAP_KEYS" "$LIVE_KEYS" || true
echo
echo "-- keys only in LIVE --"
comm -13 "$SNAP_KEYS" "$LIVE_KEYS" || true
echo
echo "-- keys with different values --"
comm -12 "$SNAP_KEYS" "$LIVE_KEYS" | while IFS= read -r k; do
  vS="$(grep -m1 -E "^${k}=" "$SNAP_NORM" | sed -E "s/^${k}=//")"
  vL="$(grep -m1 -E "^${k}=" "$LIVE_NORM" | sed -E "s/^${k}=//")"
  if [[ "$vS" != "$vL" ]]; then
    if [[ "$MASK_VALUES" -eq 1 ]]; then
      hS="$(printf '%s' "$vS" | shasum -a 256 | awk '{print $1}' | cut -c1-12)"
      hL="$(printf '%s' "$vL" | shasum -a 256 | awk '{print $1}' | cut -c1-12)"
      printf "%s  snapshot=<sha:%s>  live=<sha:%s>\n" "$k" "$hS" "$hL"
    else
      printf "%s  snapshot=%q  live=%q\n" "$k" "$vS" "$vL"
    fi
  fi
done
echo

echo "== files =="
echo "live(raw): $LIVE_RAW"
echo "snap(raw): $SNAP_RAW"
echo

DIFFERS=1
if diff -q "$SNAP_NORM" "$LIVE_NORM" >/dev/null 2>&1; then
  echo "✅ configs match (normalized)."
  DIFFERS=0
else
  echo "⚠️ configs differ (normalized)."
fi

# ---------- optional sync step ----------
if [[ -n "$SYNC_TO" ]]; then
  case "$SYNC_FROM" in
    snapshot) SRC="$SNAP_RAW"; SRC_LABEL="SNAPSHOT";;
    live)     SRC="$LIVE_RAW"; SRC_LABEL="LIVE";;
  esac
  echo "== sync option =="
  echo "Will copy $SRC_LABEL → $SYNC_TO (raw, exact content)."
  if [[ "$AUTO_YES" -ne 1 ]]; then
    read -r -p "Proceed? [y/N] " ans
    case "${ans,,}" in
      y|yes) true;;
      *) echo "⏭️  copy skipped."; exit "$DIFFERS";;
    esac
  fi
  # Backup if exists
  if [[ -e "$SYNC_TO" ]]; then
    ts="$(date -u +%Y%m%d_%H%M%S)"
    cp -p "$SYNC_TO" "${SYNC_TO}.bak.${ts}"
    echo "📦 backup written: ${SYNC_TO}.bak.${ts}"
  fi
  # Ensure parent dir and copy
  mkdir -p "$(dirname "$SYNC_TO")"
  cp -f "$SRC" "$SYNC_TO"
  # Suggest restrictive perms for env files
  chmod 600 "$SYNC_TO" 2>/dev/null || true
  echo "✅ synced $SRC_LABEL → $SYNC_TO"
fi

exit "$DIFFERS"
