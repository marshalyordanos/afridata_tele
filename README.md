# Telebirr Hack — Monorepo

One repository holding the API server, the web app, and the Expo mobile app.

## Structure

```
.
├── apps/
│   ├── server/   telebirr-server — Express 5 + Prisma + SQLite (port 4000)
│   ├── web/      telebirr-web    — React 19 + Vite (port 5173)
│   └── mobile/   autopilot       — Expo / React Native (Android)
├── package.json          workspace root
└── package-lock.json     shared lockfile for server + web
```

`server` and `web` are npm workspaces sharing one hoisted `node_modules`. `mobile` is deliberately **not** a workspace: Expo pins React 18 while the web app is on React 19, and Metro needs its dependencies resolved locally. It keeps its own `node_modules` and lockfile.

## Setup

```bash
npm install                        # installs server + web
cp .env.example apps/server/.env   # then trim to the server vars
cp .env.example apps/web/.env      # then trim to the web vars
npm run prisma:generate
npm run prisma:migrate
npm run db:seed

npm run mobile:install             # installs the Expo app separately
```

## Everyday commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts server and web together |
| `npm run dev:server` | Server only |
| `npm run dev:web` | Web only |
| `npm run build` | Builds both, server first |
| `npm start` | Runs the built server |
| `npm run preview` | Serves the built web app |
| `npm run lint` | Lints the web app |
| `npm run typecheck` | Type-checks server and web |
| `npm run clean` | Removes node_modules and build output |
| `npm run mobile` | Starts the Expo dev client |
| `npm run mobile:android` | Builds and runs on Android |

Prisma tasks are proxied from the root: `prisma:generate`, `prisma:migrate`, `prisma:studio`, `db:seed`.

## Working inside one app

```bash
npm run <script> --workspace=telebirr-server
npm install <pkg> --workspace=telebirr-web
npm install <pkg> --prefix apps/mobile      # mobile is not a workspace
```

Do not add per-app lockfiles for server or web.
