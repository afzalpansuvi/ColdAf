#!/bin/sh
# Boot-resilient entrypoint.
# Migrations and the admin seed log their exit codes but never block the app
# from starting, so a single bad migration degrades one feature instead of
# crash-looping the whole container. /api/health is the source of truth:
# it reports DB + Redis status, so a broken migration shows up as a feature
# 500 rather than an unreachable backend.

echo "[entrypoint] $(date -u +%FT%TZ) Running database migrations..."
node src/db/migrate.js
MIGRATE_EXIT=$?
if [ "$MIGRATE_EXIT" -ne 0 ]; then
  echo "[entrypoint] WARNING: migrations exited $MIGRATE_EXIT — starting app anyway so /api/health is reachable."
fi

echo "[entrypoint] $(date -u +%FT%TZ) Seeding admin user..."
node seeds/admin.js || echo "[entrypoint] Seed skipped (admin may already exist or seed failed)."

echo "[entrypoint] $(date -u +%FT%TZ) Starting application..."
exec node src/index.js
