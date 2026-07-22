#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
node dist/db/migrate.js

echo "[entrypoint] Seeding database (only if empty)..."
SEED_ONLY_IF_EMPTY=1 node dist/db/seed.js || true

echo "[entrypoint] Starting server..."
exec node dist/index.js
