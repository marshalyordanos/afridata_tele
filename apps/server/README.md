# telebirr-server

Node + TypeScript API server backed by Prisma 7 (SQLite for local dev).

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:migrate    # create/apply migrations
npm run db:seed           # optional demo data
```

## Run

```bash
npm run dev     # tsx watch, http://localhost:4000
npm run build   # compile to dist/
npm start       # run compiled build
```

## Endpoints

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/health`                     | Liveness probe                       |
| GET    | `/api/users`                  | List users                           |
| GET    | `/api/users/:id`              | One user with their transactions     |
| POST   | `/api/users`                  | Create user (`phone`, `name`)        |
| GET    | `/api/transactions`           | List transactions                    |
| POST   | `/api/transactions/transfer`  | Atomic transfer between two users    |

Transfer body: `{ "senderId": "...", "receiverId": "...", "amount": 100, "note": "optional" }`

## Notes

- Prisma 7 keeps the connection URL in `prisma.config.ts`, not the schema, and
  reaches the database through a driver adapter (`@prisma/adapter-better-sqlite3`).
- The client is generated into `src/generated/prisma` — import `PrismaClient`
  from there, not from `@prisma/client`.
- To move to Postgres: set `provider = "postgresql"` in `prisma/schema.prisma`,
  install `@prisma/adapter-pg`, swap the adapter in `src/prisma.ts`, and point
  `DATABASE_URL` at your instance.
