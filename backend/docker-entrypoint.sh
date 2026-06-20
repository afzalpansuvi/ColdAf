#!/bin/sh
set -e

echo "Running database migrations..."
node src/db/migrate.js

echo "Seeding admin user..."
node seeds/admin.js || echo "Seed skipped (admin may already exist)"

echo "Starting application..."
exec node src/index.js
