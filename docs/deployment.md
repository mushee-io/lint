# Deployment

Market Lint requires three durable production processes: the web/API service, PostgreSQL, and the worker. The current worker queue is PostgreSQL-backed, so Redis is not required for the P0 pilot topology.

## Pilot topology

Use `docker-compose.pilot.yml` on a TLS-terminated host or translate the same topology to a managed platform:

- `db` — PostgreSQL 16 with persistent storage and backups
- `migrate` — one-shot `prisma migrate deploy` release step
- `app` — Next.js API/UI process with `/health` and `/ready`
- `worker` — continuous ingestion, freshness, Watch, consensus, and webhook jobs

Production secrets must be supplied externally. Do not use the development values from `docker-compose.yml`. Required values are `DATABASE_URL`, `POSTGRES_PASSWORD`, `WEBHOOK_ENCRYPTION_KEY`, `WORKER_SECRET`, and `BOOTSTRAP_SECRET`. `MARKET_LINT_PILOT_ORG_ID` may be set for the authenticated Pilot Control Center workspace.

## Release gate

1. Create the PostgreSQL database and backup policy.
2. Set production secrets in the host secret manager.
3. Run the migration service and require successful completion.
4. Start `app` and `worker`.
5. Verify `/health` and `/ready`.
6. Verify both configured public live sources report current successful ingestion.
7. Run the resilience smoke against an isolated staging database, never production.
8. Run the worker soak and retain the output as operational evidence.
9. Confirm webhook destinations use HTTPS and a real receiver verifies signatures and idempotency.
10. Only then move a pilot from `LIVE_TEST` to `PILOT_ACTIVE`.

## Reliability

Back up PostgreSQL regularly and perform restore tests into an isolated environment. Alert on stale/unknown source freshness, consecutive ingestion failures, worker jobs in `RETRY` or `DEAD_LETTER`, webhook dead letters, elevated API errors, and readiness failure. Keep source outages visible; never substitute demo state into the production pilot.
