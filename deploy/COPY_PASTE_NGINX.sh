#!/usr/bin/env bash
# Run AFTER server-deploy-d1.sh. Replace WORKER_URL below first.
set -euo pipefail

# ========== PASTE YOUR WORKER URL HERE ==========
WORKER_URL="https://biscuits-crumb.REPLACE.workers.dev"
SERVER_NAME="_"   # or your domain
# ===============================================

sudo mkdir -p /var/www/biscuits-crumb
sudo tee /etc/nginx/sites-available/biscuits-crumb >/dev/null <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    root /var/www/biscuits-crumb;
    index index.html;

    location /api/ {
        proxy_pass ${WORKER_URL};
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
    }

    location /uploads/ {
        proxy_pass ${WORKER_URL};
        proxy_http_version 1.1;
        proxy_set_header Host \$proxy_host;
        proxy_ssl_server_name on;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/biscuits-crumb /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "Open http://YOUR_SERVER_IP"
echo "Login: admin@excelorithm.com / admin123"
