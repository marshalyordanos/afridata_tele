# syntax=docker/dockerfile:1

# ---- build ----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/admin/package.json apps/admin/
RUN npm ci --workspace=telebirr-admin --include-workspace-root

COPY apps/admin apps/admin

# Vite inlines env vars at build time, so the API URL is a build arg rather
# than something the running container can change.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /repo/apps/admin
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/admin/dist /usr/share/nginx/html
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
