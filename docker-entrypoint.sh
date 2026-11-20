#!/bin/sh
set -e

echo "[entrypoint] Applying database migrations..."
node dist/db/migrate.js

echo "[entrypoint] Loading questionnaire versions (insert-only)..."
node dist/db/seed.js || echo "[entrypoint] ERRO na carga do questionário; o servidor sobe com o que já existe."

echo "[entrypoint] Starting server..."
exec node dist/index.js
