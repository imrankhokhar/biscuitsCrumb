#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/db" "$DATA_DIR/uploads" "$DATA_DIR/private/receipts"

export DATABASE_URL="${DATABASE_URL:-file:/data/db/app.db}"

echo "Applying database schema..."
npx prisma db push --skip-generate

echo "Syncing seed data (roles, permissions, admin)..."
npx tsx prisma/seed.ts

echo "Starting app..."
exec "$@"
