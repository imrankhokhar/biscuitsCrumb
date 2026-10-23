#!/usr/bin/env bash
# =============================================================================
# COPY-PASTE ON YOUR LINUX SERVER (Ubuntu/Debian)
# Project: biscuitsCrumb  |  DB: Cloudflare D1 "biscuitscrumb"
# =============================================================================
set -euo pipefail

# --- 0) One-time packages ---
sudo apt-get update -y
sudo apt-get install -y git curl rsync nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# --- 1) Clone ---
cd ~
git clone https://github.com/imrankhokhar/biscuitsCrumb.git
cd biscuitsCrumb

# --- 2) Env file (YOU must edit 2 values) ---
cp .env.cloudflare.example .env.cloudflare
echo ""
echo ">>> Edit .env.cloudflare now:"
echo "    CLOUDFLARE_API_TOKEN=...   (new token from Cloudflare dashboard)"
echo "    JWT_SECRET=...             (long random string)"
echo "    PUBLIC_APP_URL=http://YOUR_SERVER_IP"
echo ""
nano .env.cloudflare

# --- 3) Deploy API to Cloudflare (D1) + build UI on this server ---
chmod +x scripts/server-deploy-d1.sh
./scripts/server-deploy-d1.sh

echo ""
echo ">>> Copy the Worker URL from above (https://biscuits-crumb....workers.dev)"
echo ">>> Then continue with nginx steps in deploy/COPY_PASTE_NGINX.sh"
