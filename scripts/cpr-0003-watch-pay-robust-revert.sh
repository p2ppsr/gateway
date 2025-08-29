#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ -f scripts/watch-pay.sh.orig.bak ]]; then
  mv -f scripts/watch-pay.sh.orig.bak scripts/watch-pay.sh
  chmod +x scripts/watch-pay.sh
  echo "✅ CPR-0003 reverted (original watcher restored)"
else
  echo "ℹ️ No backup found; leaving current watcher in place."
fi
