# Database development

Market Lint uses PostgreSQL and Prisma 7.10.0. Supply `DATABASE_URL`; the application does not fall back to mock persistence.

## Docker

Start Docker Desktop, then run `docker compose up -d db`. The default local URL is `postgresql://marketlint:marketlint@localhost:5432/marketlint`.

## External PostgreSQL

Set `DATABASE_URL` to a reachable PostgreSQL URL. Do not commit it.

## Commands

`npm run db:generate` generates the client. `npx prisma migrate dev --name <name>` creates and applies a development migration. `npm run db:setup` applies committed migrations without deleting data. `npm run db:status` reports migration state.

For development-only resets, use Prisma's documented reset workflow against a disposable database. Never run destructive reset commands against pilot or production data.

## Troubleshooting

If migrations cannot connect, verify Docker Desktop is running or that the external `DATABASE_URL` is reachable. The migration CLI requires Prisma and `@prisma/client` at compatible versions.
