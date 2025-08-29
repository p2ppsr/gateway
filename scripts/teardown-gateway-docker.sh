#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/teardown-gateway-docker.sh [PORT]
#   scripts/teardown-gateway-docker.sh 3307
# Env:
#   PROJECT_NAME (default: gatewaydb-<PORT>)

ARG_PORT="${1:-${SQL_DATABASE_PORT:-3306}}"
PROJECT_NAME="${PROJECT_NAME:-gatewaydb-${ARG_PORT}}"

MYSQL_CTN="${PROJECT_NAME}-mysql"
ADMINER_CTN="${PROJECT_NAME}-adminer"
NETWORK="${PROJECT_NAME}_default"

echo "==> Teardown for project: ${PROJECT_NAME} (port ${ARG_PORT})"

# Stop & remove containers if they exist
for CTN in "$ADMINER_CTN" "$MYSQL_CTN"; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$CTN"; then
    echo "   - Removing container $CTN"
    docker rm -f "$CTN" >/dev/null || true
  fi
done

# Remove volumes created by this project
VOLS=$(docker volume ls --format '{{.Name}}' | grep -E "^${PROJECT_NAME}_" || true)
if [[ -n "${VOLS}" ]]; then
  echo "$VOLS" | while read -r v; do
    echo "   - Removing volume $v"
    docker volume rm -f "$v" >/dev/null || true
  done
else
  echo "   - No matching volumes"
fi

# Remove network if present
if docker network ls --format '{{.Name}}' | grep -qx "$NETWORK"; then
  echo "   - Removing network $NETWORK"
  docker network rm "$NETWORK" >/dev/null || true
fi

echo "✅ Teardown complete for ${PROJECT_NAME}"
