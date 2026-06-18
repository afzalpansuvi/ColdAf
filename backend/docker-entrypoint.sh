#!/bin/sh
# Boot-resilient entrypoint: pre-steps log to stdout but never block the server
# from starting. /api/health is the source of truth for what is broken.

echo "[entrypoint] $(date -u +%FT%TZ) Running database migrations..."
node src/db/migrate.js 2>&1
MIGRATE_EXIT=$?
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  echo "[entrypoint] WARNING: migrations exited with code $MIGRATE_EXIT. Continuing to start app so /api/health is reachable."
fi

echo "[entrypoint] $(date -u +%FT%TZ) Seeding admin user..."
node seeds/admin.js 2>&1
SEED_EXIT=$?
if [ "$SEED_EXIT" -ne 0 ]; then
  echo "[entrypoint] Seed exited with code $SEED_EXIT (admin may already exist or seed failed). Continuing."
fi

echo "[entrypoint] $(date -u +%FT%TZ) Starting application..."
exec node src/index.js
