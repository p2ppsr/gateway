#!/usr/bin/env bash
set -euo pipefail

# --- resolve repo root (assumes this file is in repo_root/scripts/) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "$REPO_ROOT"

# ===== Port selection =====
ARG_PORT="${1:-}"
if [[ "$ARG_PORT" == --port=* ]]; then ARG_PORT="${ARG_PORT#--port=}"; fi
if [[ "$ARG_PORT" == "-p" && "${2:-}" =~ ^[0-9]+$ ]]; then ARG_PORT="$2"; fi
DB_PORT="${ARG_PORT:-${SQL_DATABASE_PORT:-3306}}"

# ===== Config (override via env) =====
DB_NAME="${SQL_DATABASE_DB_NAME:-gateway}"
DB_USER="${SQL_DATABASE_USER:-gateway}"
DB_PASS="${SQL_DATABASE_PASSWORD:-gateway123}"
DB_HOST="${SQL_DATABASE_HOST:-127.0.0.1}"
ADMINER_PORT="${ADMINER_PORT:-8080}"

# project name also encodes port to avoid name/volume clashes
PROJECT_NAME_DEFAULT="gatewaydb-${DB_PORT}"
PROJECT_NAME="${PROJECT_NAME:-$PROJECT_NAME_DEFAULT}"

# Validate port
if ! [[ "$DB_PORT" =~ ^[0-9]+$ ]] || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "!! Invalid port: $DB_PORT" >&2; exit 1
fi

echo "==> Using host port ${DB_PORT} -> container 3306"
echo "==> Project: ${PROJECT_NAME}  DB: ${DB_NAME}  User: ${DB_USER}"

# Quick port check (best-effort)
if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP -sTCP:LISTEN -P | grep -q ":${DB_PORT} "; then
    echo "!! Port ${DB_PORT} is busy. Try: scripts/setup-gateway-docker.sh 3307" >&2
    exit 1
  fi
fi

# ===== Compose (internal; auto-removed) =====
COMPOSE_FILE="$(mktemp -t gateway-dc-XXXXXX.yml)"
cat > "$COMPOSE_FILE" <<YML
services:
  mysql:
    image: mysql:8.0
    container_name: ${PROJECT_NAME}-mysql
    command: --default-authentication-plugin=mysql_native_password --mysqlx=0
    environment:
      MYSQL_ROOT_PASSWORD: rootpass
      MYSQL_DATABASE: ${DB_NAME}
      MYSQL_USER: ${DB_USER}
      MYSQL_PASSWORD: ${DB_PASS}
    ports:
      - "${DB_PORT}:3306"
    volumes:
      - ${PROJECT_NAME}_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-prootpass"]
      interval: 5s
      timeout: 3s
      retries: 30
      start_period: 10s

  adminer:
    image: adminer
    container_name: ${PROJECT_NAME}-adminer
    ports:
      - "${ADMINER_PORT}:8080"
    depends_on:
      - mysql

volumes:
  ${PROJECT_NAME}_data:
YML

cleanup(){ rm -f "$COMPOSE_FILE" || true; }
trap cleanup EXIT

echo "==> Checking Docker..."
command -v docker >/dev/null 2>&1 || { echo "!! Install Docker first."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "!! 'docker compose' is required."; exit 1; }

# Pre-clean any stale containers with this project name (idempotent)
docker rm -f "${PROJECT_NAME}-mysql" "${PROJECT_NAME}-adminer" >/dev/null 2>&1 || true

echo "==> Starting MySQL on ${DB_HOST}:${DB_PORT}..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d mysql

echo "==> Waiting for MySQL health..."
for i in {1..60}; do
  status=$(docker inspect -f '{{.State.Health.Status}}' "${PROJECT_NAME}-mysql" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then echo "   MySQL is healthy."; break; fi
  if [ $i -eq 60 ]; then
    echo "!! MySQL failed to become healthy."
    docker logs "${PROJECT_NAME}-mysql" | tail -n 200 || true
    exit 1
  fi
  sleep 2
done

echo "==> Ensuring DB/user/grants inside container..."
docker exec -i "${PROJECT_NAME}-mysql" mysql -uroot -prootpass <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED WITH mysql_native_password BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "==> Updating .env for Docker MySQL..."
touch .env
declare -A kv=(
  [SQL_DATABASE_HOST]="${DB_HOST}"
  [SQL_DATABASE_PORT]="${DB_PORT}"
  [SQL_DATABASE_USER]="${DB_USER}"
  [SQL_DATABASE_PASSWORD]="${DB_PASS}"
  [SQL_DATABASE_DB_NAME]="${DB_NAME}"
)
for key in "${!kv[@]}"; do
  if grep -qE "^${key}=" .env; then sed -i.bak "s|^${key}=.*|${key}=${kv[$key]}|" .env
  else echo "${key}=${kv[$key]}" >> .env; fi
done

echo "==> Installing Node deps (project root must have package.json)..."
npm pkg get name >/dev/null 2>&1 || { echo "!! package.json not found."; exit 1; }
npm install
npm ls mysql2       >/dev/null 2>&1 || npm i mysql2
npm ls knex         >/dev/null 2>&1 || npm i -D knex
npm ls ts-node      >/dev/null 2>&1 || npm i -D ts-node
npm ls typescript   >/dev/null 2>&1 || npm i -D typescript
npm ls @types/node  >/dev/null 2>&1 || npm i -D @types/node

# ===== Run migrations/seeds =====
KNEX_BIN="./node_modules/.bin/knex"; [ -x "$KNEX_BIN" ] || KNEX_BIN="$(npm bin)/knex"
[ -x "$KNEX_BIN" ] || { echo "!! knex binary not found after install."; exit 1; }

export TS_NODE_TRANSPILE_ONLY=1

if [ -f "knexfile.ts" ]; then
  echo "==> Running migrations (TS)..."
  node -r ts-node/register "$KNEX_BIN" --knexfile knexfile.ts migrate:latest
  echo "==> Running seeds (TS, if any)..."
  node -r ts-node/register "$KNEX_BIN" --knexfile knexfile.ts seed:run || echo "(no seeds to run)"
elif [ -f "knexfile.js" ]; then
  echo "==> Running migrations (JS)..."
  "$KNEX_BIN" --knexfile knexfile.js migrate:latest
  echo "==> Running seeds (JS, if any)..."
  "$KNEX_BIN" --knexfile knexfile.js seed:run || echo "(no seeds to run)"
else
  echo "!! Neither knexfile.ts nor knexfile.js found." >&2; exit 1
fi

echo "==> (Optional) Starting Adminer at http://localhost:${ADMINER_PORT} ..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d adminer || true

echo "✅ Done. MySQL is on ${DB_HOST}:${DB_PORT}. DB '${DB_NAME}' is migrated and ready."
echo "   Start your app:  npm run start   (or npm run dev)"
echo "   Different port next time:  scripts/setup-gateway-docker.sh 3307"
