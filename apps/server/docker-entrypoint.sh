#!/bin/sh
# Bring the database schema up to date before serving traffic. `migrate deploy`
# only applies committed migrations — it never prompts and never resets data,
# so it is safe to run on every container start.
set -e

echo "==> Applying database migrations"
npx prisma migrate deploy

# Run the COMPILED seed: `prisma db seed` would shell out to tsx, which is a
# devDependency and is pruned from this image.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "==> Seeding database"
  node dist/prisma/seed.js || echo "!! Seed failed (continuing)"
fi

echo "==> Starting API on port ${PORT:-4000}"
exec "$@"
