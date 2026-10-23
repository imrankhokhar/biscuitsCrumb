#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/db" "$DATA_DIR/uploads" "$DATA_DIR/private/receipts"

# Prisma schema always requires DATABASE_URL in env (even when queries go to D1).
export DATABASE_URL="${DATABASE_URL:-file:/data/db/app.db}"

USE_D1=0
if [ "${FORCE_SQLITE:-1}" = "0" ] && [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_D1_DATABASE_ID:-}${CLOUDFLARE_DATABASE_ID:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  USE_D1=1
fi

if [ "$USE_D1" = "1" ]; then
  echo "Database mode: Cloudflare D1 (HTTP)"
  echo "Skipping prisma db push — apply schema with: npm run d1:migrate:remote"
  # Harmless local placeholder so Prisma CLI/env checks never need /data/db/unused-placeholder.db
  export DATABASE_URL="file:./prisma/dev.db"
  echo "Syncing seed data to D1..."
  npx tsx prisma/seed.ts || echo "Seed warning (may already be seeded) — continuing"
else
  echo "Database mode: SQLite at $DATABASE_URL"
  echo "Applying database schema..."
  npx prisma db push --skip-generate
  echo "Syncing seed data..."
  npx tsx prisma/seed.ts
fi

echo "Starting app..."
exec "$@"
