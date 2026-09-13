# Telebirr Hack — Monorepo

One repository holding the API server, the customer web app, the admin console, and the Expo mobile app.

## Structure

```
.
├── apps/
│   ├── server/   telebirr-server — Express 5 + Prisma + PostgreSQL (port 4000)
│   ├── web/      telebirr-web    — React 19 + Vite (port 5173)
│   ├── admin/    telebirr-admin  — React 19 + Vite admin console (port 5174)
│   └── mobile/   autopilot       — Expo / React Native (Android)
├── package.json          workspace root
└── package-lock.json     shared lockfile for server + web + admin
```

`server`, `web` and `admin` are npm workspaces sharing one hoisted `node_modules`. `mobile` is deliberately **not** a workspace: Expo pins React 18 while the web app is on React 19, and Metro needs its dependencies resolved locally. It keeps its own `node_modules` and lockfile.

## Setup

The server talks to PostgreSQL through Prisma's `@prisma/adapter-pg` driver
adapter. Start a local database first:

```bash
docker run -d --name afridata-postgres --restart unless-stopped \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=marshal1111 \
  -e POSTGRES_DB=afridata -p 5432:5432 \
  -v afridata_pgdata:/var/lib/postgresql/data postgres:17
```

Then install and migrate:

```bash
npm install                        # installs server + web + admin
cp .env.example apps/server/.env   # then trim to the server vars
cp .env.example apps/web/.env      # then trim to the web vars
cp .env.example apps/admin/.env    # then trim to the admin vars
npm run prisma:generate
npm run prisma:migrate
npm run db:seed

npm run mobile:install             # installs the Expo app separately
```

## Everyday commands

Run from the repo root.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts server, web and admin together |
| `npm run dev:server` | Server only |
| `npm run dev:web` | Web only (port 5173) |
| `npm run dev:admin` | Admin console only (port 5174) |
| `npm run build` | Builds all three, server first |
| `npm start` | Runs the built server |
| `npm run preview` | Serves the built web app |
| `npm run lint` | Lints the web app |
| `npm run typecheck` | Type-checks server, web and admin |
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

Do not add per-app lockfiles for server, web or admin.

## Admin console

`apps/admin` runs on **port 5174**, beside the customer app on 5173. It manages
the agent network against `/api/agents`:

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/api/agents` | Paginated list — `page`, `pageSize`, `search`, `status`, `sortBy`, `sortDir` |
| `GET` | `/api/admins` | Paginated console users (super admin only) |
| `GET` | `/api/agents/stats` | Totals per status plus the network float |
| `GET` | `/api/agents/:id` | One agent |
| `POST` | `/api/agents` | Register an agent |
| `PATCH` | `/api/agents/:id` | Update an agent |
| `DELETE` | `/api/agents/:id` | Remove an agent |

### Signing in

The console is behind a login. `npm run db:seed` creates the bootstrap super
admin:

| Phone | Password | Role |
| --- | --- | --- |
| `0000000000` | `12345678` | Super admin |

**Change that password before this is reachable by anyone else.** Re-seeding
never resets it — the seed only sets a password when it creates the account.

Sessions are HS256 tokens signed with `AUTH_SECRET`, valid for 12 hours and held
in `localStorage`. Passwords are stored as salted scrypt hashes; nothing hashes
or verifies through a third-party package, it is all `node:crypto`. Without
`AUTH_SECRET` the server generates a throwaway key at boot, so every restart
signs everyone out — and it refuses to start in production without one.

| Route | Who can reach it |
| --- | --- |
| `POST /api/auth/login` | Anyone |
| `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/password` | Any signed-in admin |
| All of `/api/agents` | Any signed-in admin |
| All of `/api/admins` | Super admin only |

Only a super admin sees the **Console users** page or can create, edit and
delete console accounts. An ordinary admin who navigates to `#/admins` is put
back on the dashboard, and the API answers `403` regardless of what the client
does. A super admin cannot delete their own account or drop their own role, so
the console cannot be locked out from inside.

Each agent row carries one status action: **Approve** for a pending agent,
**Reactivate** for a suspended one, and **Suspend** for an active one. Each asks
for confirmation first, the same way deleting does, and only the status is sent
— balances, commission and PINs are left alone.

### Agent phone numbers and PINs

Agent phone numbers are stored in one canonical shape, `+251986680094`. The
server accepts the forms people actually type — `0986680094`, `251986680094`,
`+251 98 668 0094` — and normalises them before saving, so the unique constraint
on `phone` cannot be sidestepped by formatting. Anything that is not an
Ethiopian mobile number (`+251` followed by nine digits starting 7 or 9) is
rejected with a field-level error.

Each agent also carries their six-digit Telebirr PIN, editable from the same
form and shown masked in the table behind a per-row **Show** toggle. The seed
sets `+251986680094` to `123789`, and re-seeding restores it. Note that PINs are
stored and returned in plain text so the console can display them — that is what
makes the "show the PIN" feature possible, and it means database or API access
is equivalent to knowing every agent's PIN. If that is not acceptable for a real
deployment, store a hash and drop the reveal.
