# Deploy on YOUR server + Cloudflare D1

D1 cannot run inside Docker. This setup:

- **Your server** → serves the React UI (nginx) and runs the deploy script  
- **Cloudflare** → Worker API + **D1** database + R2 uploads  

Users open `http://YOUR_SERVER`. nginx proxies `/api` and `/uploads` to the Worker.

## One-time server setup

```bash
# Node 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx git rsync

sudo mkdir -p /var/www/biscuits-crumb
git clone https://github.com/imrankhokhar/biscuitsCrumb.git
cd biscuitsCrumb

cp .env.cloudflare.example .env.cloudflare
nano .env.cloudflare   # set CLOUDFLARE_API_TOKEN + JWT_SECRET

chmod +x scripts/server-deploy-d1.sh
```

API token permissions: **D1 Edit**, **Workers Scripts Edit**, **R2 Edit**, **Account Settings Read**.

## Deploy / update

```bash
cd biscuitsCrumb
git pull
./scripts/server-deploy-d1.sh
```

Copy the **Worker URL** from the script output.

## nginx (once)

```bash
sudo cp deploy/nginx-biscuits-crumb.conf.example /etc/nginx/sites-available/biscuits-crumb
sudo nano /etc/nginx/sites-available/biscuits-crumb
# set REPLACE_WORKER_URL and REPLACE_SERVER_NAME
sudo ln -sf /etc/nginx/sites-available/biscuits-crumb /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

After first successful seed, set `RUN_D1_SEED=0` in `.env.cloudflare` so later deploys don’t re-seed.

## Do not use

- `docker compose` / `.env` with `DATABASE_URL=file:...` — that is local SQLite, not D1.
