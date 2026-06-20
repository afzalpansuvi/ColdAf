#!/bin/sh
# Diagnostic-mode entrypoint:
#  - pre-steps log to /tmp/backend-startup.log
#  - main app runs; if it exits, a fallback HTTP server takes over port 4000
#    and serves the captured log at any path (including /api/health)
# This guarantees /api/health is reachable and tells us what crashed,
# instead of the container looping silently.

LOGFILE=/tmp/backend-startup.log
: > "$LOGFILE"

log() {
  echo "$@" | tee -a "$LOGFILE"
}

log "[entrypoint] $(date -u +%FT%TZ) startup"
log "[entrypoint] env probe:"
log "  NODE_ENV=${NODE_ENV}"
log "  PORT=${PORT}"
log "  DB_HOST=${DB_HOST}"
log "  DB_NAME=${DB_NAME}"
log "  DB_USER=${DB_USER}"
log "  REDIS_URL_prefix=$(echo "${REDIS_URL}" | cut -c1-32)"
log "  FRONTEND_URL=${FRONTEND_URL}"
log "  has_DB_PASSWORD=$([ -n "$DB_PASSWORD" ] && echo yes || echo no)"
log "  has_JWT_SECRET=$([ -n "$JWT_SECRET" ] && echo yes || echo no)"
log "  has_JWT_REFRESH_SECRET=$([ -n "$JWT_REFRESH_SECRET" ] && echo yes || echo no)"
log "  has_ENCRYPTION_KEY=$([ -n "$ENCRYPTION_KEY" ] && echo yes || echo no)"
log "  ENCRYPTION_KEY_len=${#ENCRYPTION_KEY}"
log ""

log "[entrypoint] $(date -u +%FT%TZ) running migrations..."
node src/db/migrate.js >> "$LOGFILE" 2>&1
MIGRATE_EXIT=$?
log "[entrypoint] migrate exit=${MIGRATE_EXIT}"
log ""

log "[entrypoint] $(date -u +%FT%TZ) seeding admin..."
node seeds/admin.js >> "$LOGFILE" 2>&1
SEED_EXIT=$?
log "[entrypoint] seed exit=${SEED_EXIT}"
log ""

log "[entrypoint] $(date -u +%FT%TZ) starting main app..."
# Run main app in foreground; tee stdout+stderr into the log
node src/index.js 2>&1 | tee -a "$LOGFILE"
MAIN_EXIT=$?
log "[entrypoint] main app exited code=${MAIN_EXIT}"

log "[entrypoint] starting fallback server on port ${PORT:-4000} so /api/health serves the captured log"
exec node scripts/fallback-server.js
