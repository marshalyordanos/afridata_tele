# Deploying

Droplet: `178.128.144.198` — API `:4000`, web `:3000`, admin `:3001`.

## One command

```bash
./deploy.sh
```

Builds the images, starts Postgres + API + web + admin, applies database
migrations, and waits until the API answers `/health`. Re-run it any time to
deploy new code; it rebuilds what changed and restarts in place. Data survives.

## First deploy on the droplet

```bash
ssh root@178.128.144.198

# Docker, once per machine
curl -fsSL https://get.docker.com | sh

git clone <your-repo-url> telebirr && cd telebirr
./deploy.sh
```

The first run writes a `.env` with a generated `AUTH_SECRET` and a random
Postgres password, defaulting `PUBLIC_API_URL` to `http://178.128.144.198:4000`.

Open the firewall for the three public ports:

```bash
ufw allow 3000/tcp && ufw allow 3001/tcp && ufw allow 4000/tcp
```

## Other commands

| Command | What it does |
| --- | --- |
| `./deploy.sh` | Build + deploy (default) |
| `./deploy.sh logs` | Follow logs from every service |
| `./deploy.sh ps` | Container status |
| `./deploy.sh restart` | Restart without rebuilding |
| `./deploy.sh stop` | Stop containers, keep the database |
| `./deploy.sh seed` | Load demo users, agents and the super admin |
| `./deploy.sh destroy` | Stop **and delete the database** (asks first) |

## Configuration — `.env`

| Variable | Purpose |
| --- | --- |
| `PUBLIC_API_URL` | API address the **browser** calls. Compiled into the web/admin bundles. |
| `AUTH_SECRET` | Signs admin session tokens. Changing it signs everyone out. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials. |
| `SEED_ON_START` | `true` runs the seed on every API start. Default `false`. |

`PUBLIC_API_URL` is baked in at **build** time, not read at runtime — Vite
inlines it. After changing it, re-run `./deploy.sh` (a plain `restart` will not
pick it up).

## Notes

- **Postgres is not exposed to the internet.** Only the containers reach it. For
  psql or Prisma Studio, tunnel: `ssh -L 5432:localhost:5432 root@178.128.144.198`.
- **Migrations run automatically** on each API start via `prisma migrate deploy`,
  which only applies committed migrations and never resets data.
- **The database lives in the `db-data` volume**, so `stop` and redeploys keep it.
  Only `./deploy.sh destroy` deletes it.
- **The mobile app is not containerised.** Point it at the droplet by setting
  `EXPO_PUBLIC_API_URL=http://178.128.144.198:4000` in `apps/mobile/.env`.
- These ports are plain HTTP. Put a TLS reverse proxy in front before handling
  real traffic.
