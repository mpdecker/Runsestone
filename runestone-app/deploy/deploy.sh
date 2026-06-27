#!/usr/bin/env bash
# deploy.sh — One-command deploy for Runestone hosted demo
# Usage: ./deploy.sh [vps-host]

set -euo pipefail

VPS_HOST="${1:-}"
if [ -z "$VPS_HOST" ]; then
    echo "Usage: ./deploy.sh <vps-host>"
    echo "Example: ./deploy.sh user@app.runestone.dev"
    exit 1
fi

echo "=== Building Runestone for deployment ==="

echo "1. Building frontend..."
pnpm install --frozen-lockfile
pnpm build

echo "2. Building Docker image..."
docker build -t runestone-app .

echo "3. Saving and transferring image..."
docker save runestone-app | gzip > runestone-app.tar.gz
scp runestone-app.tar.gz "$VPS_HOST":/tmp/
scp docker-compose.yml "$VPS_HOST":/tmp/
scp deploy/nginx.conf "$VPS_HOST":/tmp/runestone-nginx.conf

echo "4. Deploying on VPS..."
ssh "$VPS_HOST" << 'ENDSSH'
    set -euo pipefail

    docker load < /tmp/runestone-app.tar.gz
    rm /tmp/runestone-app.tar.gz

    cd /tmp
    cp .env.example .env 2>/dev/null || true
    docker compose up -d

    sudo cp /tmp/runestone-nginx.conf /etc/nginx/sites-available/runestone
    sudo ln -sf /etc/nginx/sites-available/runestone /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl reload nginx

    echo "Deployed! Check https://app.runestone.dev/api/health"
ENDSSH

rm runestone-app.tar.gz
echo "=== Done ==="
