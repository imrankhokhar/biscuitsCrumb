#!/usr/bin/env bash
# Run ON YOUR SERVER (Linux). Deploys API+D1+R2 to Cloudflare and builds UI onto this machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.cloudflare ]]; then
  echo "Missing .env.cloudflare — copy .env.cloudflare.example and fill in CLOUDFLARE_API_TOKEN + JWT_SECRET"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env.cloudflare
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is empty in .env.cloudflare"
  exit 1
fi
if [[ -z "${JWT_SECRET:-}" || "$JWT_SECRET" == "change-me-to-a-long-random-secret" ]]; then
  echo "Set a real JWT_SECRET in .env.cloudflare"
  exit 1
fi

export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-c572f097e1a07b2c249efa2921ec98b6}"

echo "==> Installing dependencies"
npm ci
npm --prefix server ci

echo "==> Applying D1 migrations (remote)"
npm run d1:migrate:remote

if [[ "${RUN_D1_SEED:-0}" == "1" ]]; then
  echo "==> Seeding D1 (fresh roles/admin)"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}" npm run d1:seed:remote
else
  echo "==> Skipping D1 seed (RUN_D1_SEED!=1)"
fi

echo "==> Ensuring R2 bucket exists"
npx wrangler r2 bucket create biscuits-crumb-uploads 2>/dev/null || true

echo "==> Setting Worker secrets"
printf '%s' "$JWT_SECRET" | npx wrangler secret put JWT_SECRET
if [[ -n "${RECEIPT_ENCRYPTION_KEY:-}" ]]; then
  printf '%s' "$RECEIPT_ENCRYPTION_KEY" | npx wrangler secret put RECEIPT_ENCRYPTION_KEY
fi

echo "==> Deploying Worker (API + D1 + R2) to Cloudflare"
npm run cf:deploy

echo "==> Building frontend for this server"
npm run build

WEB_ROOT="${WEB_ROOT:-/var/www/biscuits-crumb}"
echo "==> Publishing UI to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete dist/ "$WEB_ROOT/"

echo ""
echo "Done."
echo "  API  → Cloudflare Worker (see URL printed above by wrangler)"
echo "  UI   → $WEB_ROOT  (point nginx at this folder)"
echo "  DB   → Cloudflare D1 biscuitscrumb (no local SQLite)"
echo ""
echo "Next: install nginx config from deploy/nginx-biscuits-crumb.conf.example"
echo "      set proxy_pass to your Worker URL, then: sudo nginx -t && sudo systemctl reload nginx"
echo "Admin (if seeded): admin@excelorithm.com / admin123"
