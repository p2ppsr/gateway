#!/usr/bin/env bash
set -euo pipefail

# ===== Port selection =====
# Use first arg as host port (e.g., 3307), else env SQL_DATABASE_PORT, else 3306.
ARG_PORT="${1:-}"
if [[ "$ARG_PORT" == --port=* ]]; then ARG_PORT="${ARG_PORT#--port=}"; fi
if [[ "$ARG_PORT" == "-p" && "${2:-}" =~ ^[0-9]+$ ]]; then ARG_PORT="$2"; fi
DB_PORT="${ARG_PORT:-${SQL_DATABASE_PORT:-3306}}"

# ===== Config (override via env if you like) =====
DB_NAME="${SQL_DATABASE_DB_NAME:-gateway}"
DB_USER="${SQL_DATABASE_USER:-gateway}"
DB_PASS="${SQL_DATABASE_PASSWORD:-gateway123}"
DB_HOST="${SQL_DATABASE_HOST:-127.0.0.1}"
ADMINER_PORT="${ADMINER_PORT:-8080}"
PROJECT_NAME="${PROJECT_NAME:-gatewaydb}"
COMPOSE_FILE="$(mktemp -t gateway-dc-XXXXXX.yml)"

# Validate port
if ! [[ "$DB_PORT" =~ ^[0-9]+$ ]] || [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo "!! Invalid port: $DB_PORT" >&2
  exit 1
fi

echo "==> Using host port ${DB_PORT} -> container 3306 for MySQL"
echo "==> Project: ${PROJECT_NAME}  DB: ${DB_NAME}  User: ${DB_USER}"

# Optional: quick port-in-use check (best-effort)
if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP -sTCP:LISTEN -P | grep -q ":${DB_PORT} "; then
    echo "!! Port ${DB_PORT} appears in use. Re-run as: ./setup-gateway-docker.sh 3307" >&2
    exit 1
  fi
fi

# ===== Compose file content (kept internal; auto-removed) =====
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

cleanup() { rm -f "$COMPOSE_FILE" || true; }
trap cleanup EXIT

echo "==> Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
  echo "!! Docker is required. Install Docker Desktop (macOS/Windows) or Docker Engine (Linux)." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "!! 'docker compose' not found. Update Docker to a recent version." >&2
  exit 1
fi

echo "==> Starting MySQL container on ${DB_HOST}:${DB_PORT}..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d mysql

echo "==> Waiting for MySQL to be healthy..."
for i in {1..60}; do
  status=$(docker inspect -f '{{.State.Health.Status}}' "${PROJECT_NAME}-mysql" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "   MySQL is healthy."
    break
  fi
  if [ $i -eq 60 ]; then
    echo "!! MySQL failed to become healthy in time." >&2
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
  if grep -qE "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${kv[$key]}|" .env
  else
    echo "${key}=${kv[$key]}" >> .env
  fi
done

echo "==> Installing Node dependencies (project root must contain package.json)..."
if ! npm pkg get name >/dev/null 2>&1; then
  echo "!! package.json not found. Run this script in your Node project root." >&2
  exit 1
fi

npm install
npm ls mysql2    >/dev/null 2>&1 || npm i mysql2
npm ls knex      >/dev/null 2>&1 || npm i -D knex
npm ls ts-node   >/dev/null 2>&1 || npm i -D ts-node
npm ls typescript>/dev/null 2>&1 || npm i -D typescript
npm ls @types/node >/dev/null 2>&1 || npm i -D @types/node

# Pick knexfile + args
KNEXFILE="knexfile.ts"
KNEXARGS="--knexfile $KNEXFILE -r ts-node/register"
if [ ! -f "$KNEXFILE" ]; then
  if [ -f "knexfile.js" ]; then
    KNEXFILE="knexfile.js"
    KNEXARGS="--knexfile $KNEXFILE"
  else
    echo "!! Neither knexfile.ts nor knexfile.js found." >&2
    exit 1
  fi
fi

echo "==> Running migrations..."
npx knex $KNEXARGS migrate:latest

echo "==> Running seeds (if any)..."
if ! npx knex $KNEXARGS seed:run; then
  echo "(no seeds to run)"
fi

echo "==> (Optional) Starting Adminer at http://localhost:${ADMINER_PORT} ..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d adminer || true

echo "✅ Done. MySQL is on ${DB_HOST}:${DB_PORT}. DB '${DB_NAME}' is migrated and ready."
echo "   Start your app with: npm run start   (or npm run dev)"
echo "   To test a different port next time:   ./setup-gateway-docker.sh 3307"
