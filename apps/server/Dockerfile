# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

# Workspace manifests first, so `npm ci` is cached until a dependency changes.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace=telebirr-server --include-workspace-root

COPY apps/server apps/server

# The Prisma client is generated into src/generated/prisma, which is gitignored,
# so it has to be produced here before tsc can typecheck against it.
WORKDIR /repo/apps/server
RUN npx prisma generate
RUN npm run build

# Drop dev dependencies from the tree we are about to copy into the runtime.
WORKDIR /repo
RUN npm prune --omit=dev --workspace=telebirr-server --include-workspace-root

# ---- runtime --------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=4000

# npm workspaces hoists dependencies to the root node_modules, so there is no
# per-app node_modules to copy.
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json package.json
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
# Schema, migrations and prisma.config.ts ship too: the entrypoint applies
# migrations against the live database before the API accepts traffic.
COPY --from=build /repo/apps/server/prisma apps/server/prisma
COPY --from=build /repo/apps/server/prisma.config.ts apps/server/prisma.config.ts

COPY apps/server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /repo/apps/server
USER node
EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]
