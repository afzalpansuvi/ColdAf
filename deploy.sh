#!/bin/bash
set -e

# ===========================================
# ColdAF Email Tool - Deployment Script
# Run this on your Hostinger VPS via SSH
# ===========================================

APP_DIR="/opt/coldaf"
DOMAIN="coldaf.afzalpansuvi.com"

echo "=========================================="
echo "  ColdAF Email Tool - Deployment"
echo "=========================================="

# ── Step 1: Create app directory ──────────────────────────────────
echo ""
echo "[1/8] Setting up directories..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# ── Step 2: Find the Traefik network ──────────────────────────────
echo ""
echo "[2/8] Finding Traefik network..."
TRAEFIK_NET=$(docker network ls --format '{{.Name}}' | grep -i traefik | head -1)

if [ -z "$TRAEFIK_NET" ]; then
    echo "ERROR: No Traefik network found. Make sure Traefik is running."
    echo "Available networks:"
    docker network ls --format '  {{.Name}}'
    exit 1
fi

echo "  Found Traefik network: $TRAEFIK_NET"

# Update docker-compose to use the correct network name
sed -i "s/traefik:$/  ${TRAEFIK_NET}:/" docker-compose.prod.yml 2>/dev/null || true

# ── Step 3: Generate secrets if .env doesn't exist ────────────────
echo ""
echo "[3/8] Checking environment configuration..."

if [ ! -f .env ]; then
    echo "  Creating .env from .env.production template..."
    cp .env.production .env

    # Generate random secrets
    DB_PASS=$(openssl rand -hex 16)
    JWT_SEC=$(openssl rand -hex 32)
    JWT_REF=$(openssl rand -hex 32)
    ENC_KEY=$(openssl rand -hex 32)
    ADMIN_PASS=$(openssl rand -base64 16)

    # Replace placeholders
    sed -i "s/CHANGE_ME_STRONG_DB_PASSWORD_HERE/$DB_PASS/g" .env
    sed -i "s/JWT_SECRET=CHANGE_ME_RANDOM_64_CHAR_HEX/JWT_SECRET=$JWT_SEC/" .env
    sed -i "s/JWT_REFRESH_SECRET=CHANGE_ME_ANOTHER_RANDOM_64_CHAR_HEX/JWT_REFRESH_SECRET=$JWT_REF/" .env
    sed -i "s/ENCRYPTION_KEY=CHANGE_ME_RANDOM_64_CHAR_HEX/ENCRYPTION_KEY=$ENC_KEY/" .env
    sed -i "s/ADMIN_PASSWORD=CHANGE_ME_ADMIN_PASSWORD/ADMIN_PASSWORD=$ADMIN_PASS/" .env

    echo "  .env created with auto-generated secrets."
    echo ""
    echo "  *** IMPORTANT: Your admin credentials ***"
    echo "  Email:    admin@coldaf.com"
    echo "  Password: $ADMIN_PASS"
    echo "  SAVE THIS PASSWORD - you won't see it again!"
    echo ""
else
    echo "  .env already exists, skipping."
fi

# ── Step 4: Fix Traefik network reference in compose ──────────────
echo ""
echo "[4/8] Configuring Traefik network..."

# Ensure the external network name matches
cat > docker-compose.override.yml << OVERRIDE
version: '3.8'
networks:
  traefik:
    external: true
    name: ${TRAEFIK_NET}
OVERRIDE

echo "  Network override created for: $TRAEFIK_NET"

# ── Step 5: Build containers ──────────────────────────────────────
echo ""
echo "[5/8] Building Docker containers (this may take a few minutes)..."
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml build

# ── Step 6: Start services ────────────────────────────────────────
echo ""
echo "[6/8] Starting services..."
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml up -d

# ── Step 7: Wait for database and run migrations ──────────────────
echo ""
echo "[7/8] Waiting for database to be ready..."
sleep 10

echo "  Running database migrations..."
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml exec -T backend node src/db/migrate.js

echo "  Seeding admin user..."
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml exec -T backend node seeds/admin.js

# ── Step 8: Verify ────────────────────────────────────────────────
echo ""
echo "[8/8] Verifying deployment..."
sleep 5

# Check all services are running
echo ""
echo "Service Status:"
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml ps

# Check backend health
echo ""
HEALTH=$(docker compose -f docker-compose.prod.yml -f docker-compose.override.yml exec -T backend wget -qO- http://localhost:4000/api/health 2>/dev/null || echo "FAILED")
echo "Backend Health: $HEALTH"

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo "=========================================="
echo ""
echo "  URL:   https://$DOMAIN"
echo "  Login: admin@coldaf.com"
echo ""
echo "  Useful commands:"
echo "  cd $APP_DIR"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.override.yml logs -f        # View logs"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.override.yml restart backend # Restart backend"
echo "  docker compose -f docker-compose.prod.yml -f docker-compose.override.yml down            # Stop all"
echo ""
